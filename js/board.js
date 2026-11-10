// The board: places widgets, handles drag / resize / z-order (mouse, pen and touch via Pointer Events).
// Widget positions are stored as fractions of the board size so layouts adapt to any screen.

import { WIDGETS } from './widgets/index.js';
import { h, uid, clamp, toast } from './util.js';

const MIN_W = 150;
const MIN_H = 110;

export class Board {
  constructor(el, { onChange }) {
    this.el = el;
    this.onChange = onChange;
    this.mounted = new Map(); // id -> { rec, el, inst, ro }
    this.screen = null;
    this.snap = false;
    this.lastRemoved = null;
    window.addEventListener('resize', () => this.layoutAll());
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
    for (const rec of screen.widgets) this.mount(rec);
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

  layout(m) {
    const r = this.rect;
    const { rec, el } = m;
    el.style.left = `${rec.x * r.width}px`;
    el.style.top = `${rec.y * r.height}px`;
    el.style.width = `${Math.max(MIN_W, rec.w * r.width)}px`;
    el.style.height = `${Math.max(MIN_H, rec.h * r.height)}px`;
    el.style.zIndex = rec.z || 1;
    el.classList.toggle('locked', !!rec.locked);
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
    const title = h('span', { class: 'w-title' }, h('span', { class: 'w-icon', 'aria-hidden': 'true' }, def.icon), def.title);

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
        btn('Duplicate', '⧉', () => this.duplicate(rec.id), 'hide-locked'),
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

  enableDrag(m, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || m.rec.locked || e.button > 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const r = this.rect;
      const start = { px: e.clientX, py: e.clientY, x: m.rec.x, y: m.rec.y };
      m.el.classList.add('dragging');
      const move = (ev) => {
        let nx = start.x + (ev.clientX - start.px) / r.width;
        let ny = start.y + (ev.clientY - start.py) / r.height;
        const ww = m.el.offsetWidth / r.width;
        nx = clamp(nx, -ww + 0.05, 0.95); // allow partly off-screen, never lost
        ny = clamp(ny, 0, 1 - 0.05);
        if (this.snap) {
          nx = Math.round((nx * r.width) / 20) * 20 / r.width;
          ny = Math.round((ny * r.height) / 20) * 20 / r.height;
        }
        m.rec.x = nx;
        m.rec.y = ny;
        this.layout(m);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        m.el.classList.remove('dragging');
        this.changed();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  enableResize(m, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (m.rec.locked) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const r = this.rect;
      const start = { px: e.clientX, py: e.clientY, w: m.el.offsetWidth, h: m.el.offsetHeight };
      m.el.classList.add('resizing');
      const move = (ev) => {
        let w = Math.max(MIN_W, start.w + ev.clientX - start.px);
        let hh = Math.max(MIN_H, start.h + ev.clientY - start.py);
        if (this.snap) {
          w = Math.round(w / 20) * 20;
          hh = Math.round(hh / 20) * 20;
        }
        m.rec.w = w / r.width;
        m.rec.h = hh / r.height;
        this.layout(m);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        m.el.classList.remove('resizing');
        this.changed();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }
}
