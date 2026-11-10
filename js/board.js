// The board: places widgets, handles drag / resize / z-order (mouse, pen and touch via Pointer Events).
// Widget positions are stored as fractions of the board size so layouts adapt to any screen.

import { WIDGETS } from './widgets/index.js';
import { h, uid, clamp, toast } from './util.js';

const MIN_W = 150;
const MIN_H = 110;
const HEAD_H = 44; // title bar height (keep in sync with CSS)
const TOP_SAFE = 64; // space for the menu / full-screen buttons
const GRAB_MIN = 120; // px of title bar that must stay on screen
const DRAG_SLOP = 6; // px the pointer must move before a drag starts

export class Board {
  constructor(el, { onChange }) {
    this.el = el;
    this.onChange = onChange;
    this.mounted = new Map(); // id -> { rec, el, inst, ro }
    this.screen = null;
    this.snap = false;
    this.lastRemoved = null;
    window.addEventListener('resize', () => this.layoutAll());
    // Phones (and short landscape screens): widgets stack in a scrolling column instead of
    // floating freely. The stored layout isn't changed, so the big screen still looks the same.
    this.mq = matchMedia('(max-width: 640px), (max-height: 520px)');
    this.compact = this.mq.matches;
    const applyCompact = () => {
      this.compact = this.mq.matches;
      this.el.classList.toggle('compact', this.compact);
      document.body.classList.toggle('compact', this.compact);
      this.layoutAll();
    };
    this.mq.addEventListener?.('change', applyCompact);
    applyCompact();
    // Tap on empty board clears the active widget (used in clean mode).
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) this.setActive(null);
    });
  }

  get rect() {
    return this.el.getBoundingClientRect();
  }

  load(screen) {
    for (const id of [...this.mounted.keys()]) this.unmount(id);
    this.screen = screen;
    // Keep z-index small and tidy (it only ever counts up while you tap widgets).
    [...screen.widgets].sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((w, i) => (w.z = i + 1));
    this.el.querySelectorAll('.ghost, .paused-cover').forEach((e) => e.remove());
    this.el.classList.toggle('paused', !!screen.paused);
    if (screen.paused) { this.drawPaused(); return; }
    for (const rec of screen.widgets) this.mount(rec);
  }

  /** Paused screen: nothing runs (no timers, sounds, cameras or microphones) — just outlines of the widgets. */
  drawPaused() {
    for (const rec of this.screen.widgets) {
      const def = WIDGETS[rec.type];
      this.el.append(h('div', { class: 'ghost', style: { left: `${rec.x * 100}%`, top: `${rec.y * 100}%`, width: `${rec.w * 100}%`, height: `${rec.h * 100}%`, zIndex: rec.z } },
        h('span', {}, `${def?.icon || '▫️'} ${rec.state?.label && typeof rec.state.label === 'string' ? rec.state.label : def?.title || rec.type}`)));
    }
    const p = this.screen.paused;
    const when = new Date(p.at);
    const sameDay = when.toDateString() === new Date().toDateString();
    const at = `${sameDay ? 'today' : when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })} at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    this.el.append(h('div', { class: 'paused-cover' },
      h('div', { class: 'paused-card', role: 'dialog', 'aria-label': 'Screen paused' },
        h('div', { class: 'paused-icon', 'aria-hidden': 'true' }, '⏸'),
        h('h2', {}, 'Screen paused'),
        h('p', {}, `Paused ${at}.`),
        p.held?.length ? h('ul', { class: 'paused-held' }, ...p.held.map((t) => h('li', {}, t))) : null,
        h('p', { class: 'hint' }, 'Timers and stopwatches are held where they were. Alarms, cameras, microphones and videos are off until you carry on.'),
        h('button', { class: 'btn primary big', onclick: () => this.onResume?.() }, '▶ Carry on'),
      )));
  }

  changed() {
    this.onChange?.();
  }

  topZ() {
    return Math.max(0, ...this.screen.widgets.map((w) => w.z || 0));
  }

  addWidget(type, { state, x, y, w, h: hh } = {}) {
    const def = WIDGETS[type];
    if (!def) return;
    if (this.screen.paused) { toast('This screen is paused — press “Carry on” first.'); return; }
    const r = this.rect;
    const pw = Math.min(def.size?.[0] ?? 340, r.width * 0.9);
    const ph = Math.min(def.size?.[1] ?? 260, r.height * 0.9);
    const spot = x === undefined ? this.freeSpot(pw / r.width, ph / r.height) : null;
    const rec = {
      id: uid('w'),
      type,
      x: x ?? spot.x,
      y: y ?? spot.y,
      w: w ?? pw / r.width,
      h: hh ?? ph / r.height,
      z: this.topZ() + 1,
      locked: false,
      state: state ? structuredClone(state) : def.defaultState(),
    };
    this.screen.widgets.push(rec);
    this.mount(rec);
    this.setActive(rec.id);
    this.changed();
    if (this.compact) {
      const el = this.mounted.get(rec.id)?.el;
      requestAnimationFrame(() => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
    return rec;
  }

  /** Find the emptiest place for a new widget (least overlap, then nearest the centre). */
  freeSpot(w, hh) {
    const top = 0.075;
    const bottom = document.body.classList.contains('dock-hidden') ? 0.97 : 0.87;
    const maxX = Math.max(0.01, 1 - w - 0.01);
    const maxY = Math.max(top, bottom - hh);
    const others = this.screen.widgets.map((o) => {
      const el = this.mounted.get(o.id)?.el;
      const r = this.rect;
      return { x: o.x, y: o.y, w: el ? el.offsetWidth / r.width : o.w, h: el ? el.offsetHeight / r.height : o.h };
    });
    let best = { x: (1 - w) / 2, y: top, score: Infinity };
    for (let y = top; y <= maxY + 1e-6; y += 0.025) {
      for (let x = 0.01; x <= maxX + 1e-6; x += 0.02) {
        let overlap = 0;
        for (const o of others) {
          const ox = Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x));
          const oy = Math.max(0, Math.min(y + hh, o.y + o.h) - Math.max(y, o.y));
          overlap += ox * oy;
        }
        const dist = Math.hypot(x + w / 2 - 0.5, (y + hh / 2 - 0.45) * 0.8);
        const score = overlap * 100 + dist;
        if (score < best.score) best = { x, y, score };
      }
    }
    return { x: clamp(best.x, 0, 1 - Math.min(w, 1)), y: clamp(best.y, 0, 1 - Math.min(hh, 1)) };
  }

  duplicate(id) {
    const m = this.mounted.get(id);
    if (!m) return;
    const { rec } = m;
    this.addWidget(rec.type, {
      state: rec.state,
      x: clamp(rec.x + 0.03, 0, 1 - rec.w),
      y: clamp(rec.y + 0.04, 0, 1 - rec.h),
      w: rec.w,
      h: rec.h,
    });
  }

  remove(id) {
    const m = this.mounted.get(id);
    if (!m) return;
    const idx = this.screen.widgets.indexOf(m.rec);
    this.unmount(id);
    this.screen.widgets.splice(idx, 1);
    this.lastRemoved = m.rec;
    this.changed();
    const title = WIDGETS[m.rec.type]?.title || 'Widget';
    toast(`${title} removed`, {
      action: 'Undo',
      onAction: () => {
        if (!this.lastRemoved) return;
        this.screen.widgets.push(this.lastRemoved);
        this.mount(this.lastRemoved);
        this.lastRemoved = null;
        this.changed();
      },
    });
  }

  clearAll() {
    for (const id of [...this.mounted.keys()]) this.unmount(id);
    this.screen.widgets = [];
    this.changed();
  }

  unmount(id) {
    const m = this.mounted.get(id);
    if (!m) return;
    try {
      m.inst?.destroy?.();
    } catch (e) {
      console.error(e);
    }
    m.ro?.disconnect();
    m.el.remove();
    this.mounted.delete(id);
  }

  setActive(id) {
    for (const [wid, m] of this.mounted) m.el.classList.toggle('active', wid === id);
  }

  bringToFront(rec) {
    if ((rec.z || 0) === this.topZ() && this.screen.widgets.filter((w) => w.z === rec.z).length === 1) return;
    rec.z = this.topZ() + 1;
    this.mounted.get(rec.id).el.style.zIndex = rec.z;
    this.changed();
  }

  /** Area where a title bar may sit: below the top buttons and above the widget dock. */
  safeArea() {
    const r = this.rect;
    const dock = document.querySelector('.dock');
    const dockHidden = document.body.classList.contains('dock-hidden');
    const dockH = dock && !dockHidden ? dock.getBoundingClientRect().height : 30;
    return { top: TOP_SAFE, bottom: r.height - dockH - HEAD_H - 16, width: r.width, height: r.height };
  }

  /** Phone layout: one column (two on a landscape phone), in reading order of the big layout. */
  layoutCompact(m) {
    const { rec, el } = m;
    const W = this.el.clientWidth || innerWidth;
    const cols = W >= 700 ? 2 : 1;
    this.el.style.setProperty('--cols', cols);
    const colW = (W - 20 - 12 * (cols - 1)) / cols;
    const def = WIDGETS[rec.type];
    // Keep roughly the shape it has on a 16:9 screen.
    let aspect = (rec.w * 16) / (rec.h * 9);
    if (!Number.isFinite(aspect) || aspect <= 0) aspect = def?.size ? def.size[0] / def.size[1] : 4 / 3;
    const maxH = Math.max(260, innerHeight - 140);
    const hh = Math.round(clamp(colW / aspect, 230, maxH));
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.height = `${hh}px`;
    el.style.zIndex = '';
    const order = [...this.screen.widgets].sort((a, b) => (Math.abs(a.y - b.y) > 0.08 ? a.y - b.y : a.x - b.x));
    for (const [id, mm] of this.mounted) mm.el.style.order = String(order.findIndex((w) => w.id === id));
    el.classList.toggle('narrow', colW < 300);
    el.classList.toggle('locked', !!rec.locked);
  }

  layout(m) {
    if (this.compact) { this.layoutCompact(m); return; }
    m.el.style.order = '';
    const a = this.safeArea();
    const { rec, el } = m;
    const w = Math.max(MIN_W, rec.w * a.width);
    const hh = Math.max(MIN_H, rec.h * a.height);
    // Whatever is stored, draw the widget so that its title bar can be reached.
    const left = clamp(rec.x * a.width, -(w - GRAB_MIN), a.width - GRAB_MIN);
    const top = clamp(rec.y * a.height, a.top, Math.max(a.top, a.bottom));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${w}px`;
    el.style.height = `${hh}px`;
    el.style.zIndex = rec.z || 1;
    el.classList.toggle('locked', !!rec.locked);
    el.classList.toggle('narrow', w < 300);
  }

  layoutAll() {
    for (const m of this.mounted.values()) this.layout(m);
  }

  mount(rec) {
    const def = WIDGETS[rec.type];
    if (!def) {
      console.warn('Unknown widget type', rec.type);
      return;
    }
    rec.state = { ...def.defaultState(), ...(rec.state || {}) };

    const view = h('div', { class: 'w-view' });
    const settings = h('div', { class: 'w-settings', hidden: true });
    const title = h('span', { class: 'w-title' }, h('span', { class: 'w-icon', 'aria-hidden': 'true' }, def.icon), h('span', { class: 'w-name' }, def.title));

    const btn = (label, icon, onclick, cls = '') =>
      h('button', { class: `w-btn ${cls}`, title: label, 'aria-label': label, onclick }, icon);

    const settingsBtn = def.hasSettings ? btn('Settings', '⚙', () => toggleSettings()) : null;
    const lockBtn = btn('Lock position', '🔓', () => {
      rec.locked = !rec.locked;
      lockBtn.textContent = rec.locked ? '🔒' : '🔓';
      lockBtn.title = rec.locked ? 'Unlock' : 'Lock position';
      this.layout(m);
      this.changed();
    }, 'lock');
    lockBtn.textContent = rec.locked ? '🔒' : '🔓';

    const head = h('div', { class: 'w-head' },
      title,
      h('div', { class: 'w-actions' },
        settingsBtn,
        btn('Duplicate', '⧉', () => this.duplicate(rec.id), 'dup hide-locked'),
        lockBtn,
        btn('Remove', '✕', () => this.remove(rec.id), 'close hide-locked'),
      ),
    );
    const resize = h('div', { class: 'w-resize', 'aria-hidden': 'true' });
    const el = h('section', { class: `widget type-${rec.type}`, 'aria-label': def.title },
      head,
      h('div', { class: 'w-body' }, view, settings),
      resize,
    );

    const m = { rec, el, inst: null, ro: null };
    this.mounted.set(rec.id, m);
    this.el.append(el);
    this.layout(m);

    const save = () => this.changed();
    const ctx = {
      view,
      settings,
      state: rec.state,
      save,
      el,
      rec,
      closeSettings: () => toggleSettings(false),
      openSettings: () => toggleSettings(true),
      addWidget: (type, state) => this.addWidget(type, { state }),
    };

    const toggleSettings = (force) => {
      const open = force ?? settings.hidden;
      settings.hidden = !open;
      view.hidden = open;
      el.classList.toggle('settings-open', open);
      if (open) m.inst?.openSettings?.();
      else m.inst?.closeSettings?.();
    };

    try {
      m.inst = def.mount(ctx) || {};
    } catch (e) {
      console.error(e);
      view.append(h('p', { class: 'error' }, 'This widget failed to load.'));
    }

    m.ro = new ResizeObserver(() => m.inst?.resize?.());
    m.ro.observe(view);

    el.addEventListener('pointerdown', () => {
      this.bringToFront(rec);
      this.setActive(rec.id);
    }, true);

    this.enableDrag(m, head);
    this.enableResize(m, resize);
  }

  /**
   * Track one pointer from pointerdown to pointerup with pointer capture.
   * Only one gesture per widget at a time; extra fingers are ignored.
   */
  track(m, e, handle, { onStart, onMove, onEnd, slop = 0 }) {
    if (m.gesture) return;
    const start = { x: e.clientX, y: e.clientY };
    let started = false;
    const id = e.pointerId;
    m.gesture = id;

    // Capture the pointer only once the gesture really starts, so a plain tap on a
    // title-bar button still produces a normal click on that button.
    const begin = () => {
      started = true;
      try { handle.setPointerCapture(id); } catch { /* pointer already gone */ }
      document.body.classList.add('moving');
      onStart?.();
    };
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!started) {
        if (Math.hypot(dx, dy) < slop) return;
        begin();
      }
      ev.preventDefault();
      onMove(dx, dy, ev);
    };
    const finish = (ev) => {
      if (ev.pointerId !== id) return;
      // Touch pointers are implicitly captured by the element first touched (e.g. the title
      // text). Moving the capture to the handle fires a bubbling lostpointercapture from that
      // child — that is not the end of the gesture.
      if (ev.type === 'lostpointercapture' && ev.target !== handle) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      handle.removeEventListener('lostpointercapture', finish);
      try { handle.releasePointerCapture(id); } catch { /* fine */ }
      m.gesture = null;
      document.body.classList.remove('moving');
      if (started) onEnd?.();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    handle.addEventListener('lostpointercapture', finish);
    if (slop === 0) begin();
  }

  enableDrag(m, handle) {
    // The whole title bar is a drag handle — including its buttons. A tap on a button still
    // works as a button; if the finger moves more than a few pixels it becomes a drag instead.
    let suppressClick = false;
    handle.addEventListener('click', (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }, true);

    handle.addEventListener('pointerdown', (e) => {
      if (this.compact || m.rec.locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const onButton = !!e.target.closest('button');
      if (!onButton) e.preventDefault(); // stop text selection / focus changes
      const a = this.safeArea();
      const startX = m.el.offsetLeft;
      const startY = m.el.offsetTop;
      this.track(m, e, handle, {
        slop: onButton || e.pointerType !== 'mouse' ? DRAG_SLOP : 0,
        onStart: () => {
          if (onButton) suppressClick = true;
          m.el.classList.add('dragging');
        },
        onMove: (dx, dy) => {
          let nx = startX + dx;
          let ny = startY + dy;
          if (this.snap) {
            nx = Math.round(nx / 20) * 20;
            ny = Math.round(ny / 20) * 20;
          }
          const w = m.el.offsetWidth;
          nx = clamp(nx, -(w - GRAB_MIN), a.width - GRAB_MIN);
          ny = clamp(ny, a.top, Math.max(a.top, a.bottom));
          m.rec.x = nx / a.width;
          m.rec.y = ny / a.height;
          m.el.style.left = `${nx}px`;
          m.el.style.top = `${ny}px`;
        },
        onEnd: () => {
          m.el.classList.remove('dragging');
          // A click event may or may not follow; clear the flag shortly after either way.
          setTimeout(() => (suppressClick = false), 50);
          this.changed();
        },
      });
    });
  }

  enableResize(m, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (this.compact || m.rec.locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      e.stopPropagation();
      const a = this.safeArea();
      const w0 = m.el.offsetWidth;
      const h0 = m.el.offsetHeight;
      this.track(m, e, handle, {
        onStart: () => m.el.classList.add('resizing'),
        onMove: (dx, dy) => {
          let w = Math.max(MIN_W, w0 + dx);
          let hh = Math.max(MIN_H, h0 + dy);
          if (this.snap) {
            w = Math.round(w / 20) * 20;
            hh = Math.round(hh / 20) * 20;
          }
          m.rec.w = w / a.width;
          m.rec.h = hh / a.height;
          m.el.style.width = `${w}px`;
          m.el.style.height = `${hh}px`;
          m.el.classList.toggle('narrow', w < 300);
        },
        onEnd: () => {
          m.el.classList.remove('resizing');
          this.changed();
        },
      });
    });
  }
}
