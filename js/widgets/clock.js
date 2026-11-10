import { h } from '../util.js';
import { panel, select, checkbox, field } from './_common.js';

export default {
  type: 'clock',
  title: 'Clock',
  icon: '🕒',
  group: 'core',
  size: [320, 280],
  hasSettings: true,
  defaultState: () => ({ mode: 'both', hour12: true, seconds: false, date: true }),

  mount(ctx) {
    const s = ctx.state;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('clock-face');
    let marks = '<circle cx="50" cy="50" r="47" class="cf-bg"/>';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r1 = i % 5 ? 43 : 39;
      marks += `<line x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 45}" y2="${50 - Math.cos(a) * 45}" class="${i % 5 ? 'tick' : 'tick big'}"/>`;
    }
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      marks += `<text x="${50 + Math.sin(a) * 32}" y="${50 - Math.cos(a) * 32}" class="num">${n}</text>`;
    }
    marks += '<line x1="50" y1="50" x2="50" y2="26" class="hand hour"/><line x1="50" y1="50" x2="50" y2="14" class="hand min"/><line x1="50" y1="56" x2="50" y2="10" class="hand sec"/><circle cx="50" cy="50" r="2.5" class="pin"/>';
    svg.innerHTML = marks;
    const [hourH, minH, secH] = svg.querySelectorAll('.hand');

    const digital = h('div', { class: 'clock-digital' });
    const dateEl = h('div', { class: 'clock-date' });
    const wrap = h('div', { class: 'clock' }, svg, h('div', { class: 'clock-text' }, digital, dateEl));
    ctx.view.append(wrap);

    function render() {
      const d = new Date();
      const hr = d.getHours() % 12;
      const mi = d.getMinutes();
      const se = d.getSeconds();
      hourH.setAttribute('transform', `rotate(${hr * 30 + mi * 0.5} 50 50)`);
      minH.setAttribute('transform', `rotate(${mi * 6 + se * 0.1} 50 50)`);
      secH.setAttribute('transform', `rotate(${se * 6} 50 50)`);
      secH.style.display = s.seconds ? '' : 'none';
      digital.textContent = d.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: s.seconds ? '2-digit' : undefined,
        hour12: s.hour12,
      });
      dateEl.textContent = s.date ? d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      wrap.dataset.mode = s.mode;
    }
    render();
    const t = setInterval(render, 1000);
    return {
      destroy: () => clearInterval(t),
      openSettings() {
        const upd = (fn) => (v) => { fn(v); render(); ctx.save(); };
        panel(ctx, 'Clock settings',
          field('Show', select([['both', 'Analogue + digital'], ['analog', 'Analogue only'], ['digital', 'Digital only']], s.mode, upd((v) => (s.mode = v)))),
          checkbox('12-hour time (am/pm)', s.hour12, upd((v) => (s.hour12 = v))),
          checkbox('Show seconds', s.seconds, upd((v) => (s.seconds = v))),
          checkbox('Show date', s.date, upd((v) => (s.date = v))),
        );
      },
    };
  },
};
