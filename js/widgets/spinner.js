import { h, parseLines, setKids } from '../util.js';
import { play, soundSelect } from '../sound.js';
import { logEvent, recBadge, RECORD_HINT } from '../datalog.js';
import { panel, checkbox, field, textarea, select } from './_common.js';

// Spinner: equal or unequal sections ("Red ×3"), with a running tally — great for chance and
// probability ("Why does red come up more?"), choices and brain breaks.

const NAMED = { red: '#e63946', blue: '#1982c4', green: '#2a9d8f', yellow: '#ffca3a', orange: '#f4a261', purple: '#7b2cbf', pink: '#ff6fb5', black: '#264653', white: '#f1f1f1', brown: '#8d5a2b', grey: '#9aa0a6', gray: '#9aa0a6' };
const PALETTE = ['#e63946', '#1982c4', '#ffca3a', '#2a9d8f', '#7b2cbf', '#f4a261', '#ff6fb5', '#8ac926', '#264653', '#fb8500'];

export const PRESETS = {
  colours: { label: 'Colours (equal)', text: 'Red\nBlue\nYellow\nGreen' },
  unequal: { label: 'Unequal colours (probability)', text: 'Red ×3\nBlue ×2\nYellow ×1' },
  numbers: { label: 'Numbers 1–8', text: '1\n2\n3\n4\n5\n6\n7\n8' },
  yesno: { label: 'Yes / No / Maybe', text: '👍 Yes\n👎 No\n🤔 Maybe' },
  brain: { label: 'Brain breaks', text: '🦘 Jump 10 times\n🙆 Big stretch\n💃 Dance party\n🏃 Run on the spot\n🧘 3 deep breaths\n🤸 Star jumps' },
  maths: { label: 'Maths operations', text: '➕ Add\n➖ Subtract\n✖️ Multiply\n➗ Divide' },
  teams: { label: 'Which team?', text: 'Team 1\nTeam 2\nTeam 3\nTeam 4' },
};

/** "Red ×3" → { name: 'Red', weight: 3 } */
export function parseSections(text) {
  return parseLines(text).slice(0, 24).map((line, i) => {
    const m = line.match(/^(.*?)\s*[×x*]\s*(\d{1,2})\s*$/i);
    const name = (m ? m[1] : line).trim() || `Part ${i + 1}`;
    const weight = m ? Math.max(1, Math.min(20, Number(m[2]))) : 1;
    const plain = name.replace(/\p{Extended_Pictographic}|️/gu, '').trim().toLowerCase();
    return { name, weight, color: NAMED[plain] || PALETTE[i % PALETTE.length] };
  });
}

export default {
  type: 'spinner',
  title: 'Spinner',
  icon: '🌀',
  group: 'extras',
  size: [460, 480],
  hasSettings: true,
  defaultState: () => ({ text: PRESETS.colours.text, tally: {}, last: '', showTally: true, sound: 'ding', record: false }),

  mount(ctx) {
    const s = ctx.state;
    const canvas = h('canvas', { class: 'spin-canvas', 'aria-hidden': 'true' });
    const g = canvas.getContext('2d');
    const result = h('div', { class: 'spin-result', 'aria-live': 'polite' });
    const tallyEl = h('div', { class: 'spin-tally' });
    const badge = recBadge();
    const stage = h('button', { class: 'spin-stage', title: 'Tap to spin', onclick: spin }, canvas, h('div', { class: 'wheel-pointer' }, '▼'));
    ctx.view.append(h('div', { class: 'spinner' }, stage, result, tallyEl,
      h('div', { class: 'spin-foot' },
        h('button', { class: 'btn primary big', onclick: spin }, 'Spin'),
        h('button', { class: 'btn small', onclick: () => { s.tally = {}; s.last = ''; ctx.save(); render(); } }, '↺ Clear tally'),
      ),
    ), badge);

    let angle = 0;
    let spinning = false;
    let raf;

    function spin() {
      if (spinning) return;
      const secs = parseSections(s.text);
      if (!secs.length) return;
      const total = secs.reduce((a, x) => a + x.weight, 0);
      // Pick by weight, then land somewhere inside that slice.
      let r = Math.random() * total;
      let idx = 0;
      while (r >= secs[idx].weight) { r -= secs[idx].weight; idx++; }
      const before = secs.slice(0, idx).reduce((a, x) => a + x.weight, 0);
      const sliceStart = (before / total) * Math.PI * 2;
      const slice = (secs[idx].weight / total) * Math.PI * 2;
      const within = sliceStart + slice * (0.15 + Math.random() * 0.7);
      const target = -Math.PI / 2 - within;
      const turns = 4 + Math.floor(Math.random() * 3);
      const start = angle;
      let end = target - turns * Math.PI * 2;
      while (end > start - turns * Math.PI * 2) end -= Math.PI * 2;
      const dur = 3600;
      const t0 = performance.now();
      spinning = true;
      result.textContent = '';
      let lastTick = -1;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        angle = start + (end - start) * (1 - Math.pow(1 - k, 4));
        const tick = Math.floor(angle / 0.35);
        if (tick !== lastTick) { lastTick = tick; play('tick'); }
        draw(secs);
        if (k < 1) raf = requestAnimationFrame(step);
        else finish(secs[idx]);
      };
      raf = requestAnimationFrame(step);
    }

    function finish(sec) {
      spinning = false;
      s.last = sec.name;
      s.tally[sec.name] = (s.tally[sec.name] || 0) + 1;
      play(s.sound);
      if (s.record) logEvent({ widget: 'spinner', widgetId: ctx.rec.id, kind: 'spin', label: sec.name, value: 1, unit: 'count' });
      ctx.save();
      render();
      result.classList.remove('pop');
      void result.offsetWidth;
      result.classList.add('pop');
    }

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    }

    function draw(secs) {
      const W = canvas.width;
      const H = canvas.height;
      g.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2 - 4;
      if (R < 10) return; // not laid out yet
      const total = secs.reduce((a, x) => a + x.weight, 0) || 1;
      let a0 = angle;
      for (const sec of secs) {
        const span = (sec.weight / total) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R, a0, a0 + span);
        g.closePath();
        g.fillStyle = sec.color;
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(2, R / 70);
        g.stroke();
        // label
        g.save();
        g.translate(cx, cy);
        g.rotate(a0 + span / 2);
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        const light = ['#ffca3a', '#f1f1f1', '#8ac926', '#f4a261'].includes(sec.color);
        g.fillStyle = light ? '#1d1d1f' : '#fff';
        const fs = Math.max(11, Math.min(R / 6.5, span * R * 0.45));
        g.font = `800 ${fs}px system-ui, "Segoe UI Emoji", sans-serif`;
        const label = sec.name.length > 18 ? `${sec.name.slice(0, 17)}…` : sec.name;
        g.fillText(label, R - fs * 0.45, 0);
        g.restore();
        a0 += span;
      }
      g.beginPath();
      g.arc(cx, cy, R * 0.1, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#0002';
      g.stroke();
    }

    function render() {
      const secs = parseSections(s.text);
      size();
      draw(secs);
      result.textContent = s.last || 'Tap to spin!';
      badge.hidden = !s.record;
      const total = Object.values(s.tally).reduce((a, b) => a + b, 0);
      tallyEl.hidden = !s.showTally || !total;
      if (!tallyEl.hidden) {
        const wsum = secs.reduce((a, x) => a + x.weight, 0) || 1;
        setKids(tallyEl,
          h('div', { class: 'spin-tally-head' }, `${total} spin${total === 1 ? '' : 's'}`, h('span', {}, 'expected')),
          ...secs.map((sec) => {
            const n = s.tally[sec.name] || 0;
            const pct = total ? (n / total) * 100 : 0;
            const exp = (sec.weight / wsum) * 100;
            return h('div', { class: 'spin-row' },
              h('span', { class: 'spin-name' }, sec.name),
              h('span', { class: 'spin-bar' }, h('i', { style: { width: `${pct}%`, background: sec.color } }), h('b', { style: { left: `${exp}%` }, title: `Expected about ${Math.round(exp)}%` })),
              h('span', { class: 'spin-n' }, `${n} · ${Math.round(pct)}%`),
              h('span', { class: 'spin-exp' }, `${Math.round(exp)}%`),
            );
          }),
        );
      }
    }
    render();

    return {
      destroy: () => cancelAnimationFrame(raf),
      resize: () => { if (!spinning) render(); },
      openSettings() {
        panel(ctx, 'Spinner',
          field('Start from', select([['', 'Choose a ready-made spinner…'], ...Object.entries(PRESETS).map(([k, p]) => [k, p.label])], '', (v) => {
            if (!v) return;
            s.text = PRESETS[v].text;
            s.tally = {};
            s.last = '';
            ctx.save();
            ctx.openSettings();
          })),
          field('Sections (one per line). Add ×2, ×3… to make a section bigger.', textarea(s.text, (v) => { s.text = v; s.tally = {}; ctx.save(); }, { rows: 8 })),
          h('p', { class: 'hint' }, 'Colour names like Red, Blue or Green colour their section to match.'),
          checkbox('Show the tally (results compared with what we’d expect)', s.showTally, (v) => { s.showTally = v; ctx.save(); }),
          field('Sound', soundSelect(s.sound, (v) => { s.sound = v; ctx.save(); })),
          checkbox('📊 Record each spin in the Data log', s.record, (v) => { s.record = v; ctx.save(); }),
          h('p', { class: 'hint' }, RECORD_HINT),
        );
      },
      closeSettings: render,
    };
  },
};
