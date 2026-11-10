import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, field, textInput, select, checkbox, PALETTE } from './_common.js';

// Quiz buzzers: the first team to buzz wins — only their sound plays and the others lock.
// Teams can buzz by touch (several fingers at once is fine) or with a keyboard key, so
// home-made buttons that type a key (Makey Makey, Arduino, a USB keyboard) work too.

const TEAM_SOUNDS = ['buzzA', 'buzzB', 'buzzC', 'buzzD', 'buzzE', 'buzzF', 'buzzG', 'buzzH'];
const DEFAULT_KEYS = ['a', 'l', 'z', 'm', 'q', 'p', 'v', 'n'];
const defaultTeams = (n) => Array.from({ length: n }, (_, i) => ({ name: `Team ${i + 1}`, color: PALETTE[[0, 4, 3, 1, 5, 6, 8, 2][i]], key: DEFAULT_KEYS[i] }));

export default {
  type: 'buzzer',
  title: 'Quiz buzzer',
  icon: '🔔',
  group: 'core',
  size: [560, 400],
  hasSettings: true,
  defaultState: () => ({ teams: defaultTeams(4), sound: 'team', showOrder: true, keys: true, autoReset: 0 }),

  mount(ctx) {
    const s = ctx.state;
    const grid = h('div', { class: 'bz-grid' });
    const banner = h('div', { class: 'bz-banner', hidden: true });
    const resetBtn = h('button', { class: 'btn primary big bz-reset', onclick: () => reset() }, '↺ Ready');
    const status = h('div', { class: 'bz-status' }, 'Ready — first to buzz wins!');
    ctx.view.append(h('div', { class: 'bz' }, grid, banner, h('div', { class: 'bz-foot' }, status, resetBtn)));

    let order = []; // team indexes in the order they buzzed
    let t0 = 0;
    let autoTimer = 0;
    const laterTimes = {};

    function buzz(i) {
      if (!s.teams[i] || order.includes(i)) return;
      order.push(i);
      if (order.length === 1) {
        t0 = performance.now();
        play(s.sound === 'team' ? TEAM_SOUNDS[i % TEAM_SOUNDS.length] : s.sound);
        if (s.autoReset) { clearTimeout(autoTimer); autoTimer = setTimeout(reset, s.autoReset * 1000); }
      } else {
        laterTimes[i] = performance.now() - t0;
      }
      draw();
    }
    function reset() {
      order = [];
      for (const k of Object.keys(laterTimes)) delete laterTimes[k];
      clearTimeout(autoTimer);
      draw();
    }

    function draw() {
      const first = order[0];
      grid.dataset.n = String(s.teams.length);
      grid.replaceChildren(...s.teams.map((t, i) => {
        const place = order.indexOf(i);
        const b = h('button', {
          class: `bz-btn${place === 0 ? ' win' : ''}${first != null && place !== 0 ? ' out' : ''}`,
          style: { '--c': t.color },
          'aria-label': `${t.name} buzzer`,
          'data-native-tap': '', // react on touch-down, not on lift: fastest finger wins
        },
          h('span', { class: 'bz-name' }, t.name),
          s.keys && t.key ? h('span', { class: 'bz-key' }, `key ${t.key.toUpperCase()}`) : null,
          place > 0 && s.showOrder ? h('span', { class: 'bz-place' }, `${place + 1}${['st', 'nd', 'rd'][place] || 'th'} +${(laterTimes[i] / 1000).toFixed(2)}s`) : null,
        );
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); buzz(i); });
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buzz(i); } });
        return b;
      }));
      banner.hidden = first == null;
      if (first != null) {
        banner.style.setProperty('--c', s.teams[first].color);
        banner.textContent = `🔔 ${s.teams[first].name}!`;
      }
      status.textContent = first == null ? 'Ready — first to buzz wins!' : 'Tap ↺ Ready for the next question';
    }

    // Keyboard buzzers (ignored while typing in a box, or when this widget's settings are open).
    const onKey = (e) => {
      if (!s.keys || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (!ctx.view.isConnected || ctx.view.closest('.widget')?.classList.contains('settings-open')) return;
      const k = e.key.toLowerCase();
      if (k === 'enter' && order.length) { reset(); return; }
      const i = s.teams.findIndex((t) => t.key && t.key.toLowerCase() === k);
      if (i >= 0) { e.preventDefault(); buzz(i); }
    };
    window.addEventListener('keydown', onKey);
    draw();

    return {
      destroy() { window.removeEventListener('keydown', onKey); clearTimeout(autoTimer); },
      openSettings() {
        const rows = h('div', { class: 'stack' });
        const drawRows = () => rows.replaceChildren(...s.teams.map((t, i) => h('div', { class: 'row bz-row' },
          h('input', { type: 'color', value: t.color, 'aria-label': `${t.name} colour`, oninput: (e) => { t.color = e.target.value; ctx.save(); } }),
          h('div', { style: { flex: '1' } }, textInput(t.name, (v) => { t.name = v; ctx.save(); }, { 'aria-label': `Team ${i + 1} name` })),
          h('input', { type: 'text', class: 'bz-keyin', maxlength: 1, value: t.key || '', 'aria-label': `${t.name} key`, title: 'Keyboard key', oninput: (e) => { t.key = e.target.value.slice(-1).toLowerCase(); e.target.value = t.key; ctx.save(); } }),
        )));
        drawRows();
        panel(ctx, 'Quiz buzzer',
          field('Number of teams', select([2, 3, 4, 5, 6, 8].map((n) => [n, `${n} teams`]), s.teams.length, (v) => {
            const n = Number(v);
            const fresh = defaultTeams(n);
            s.teams = fresh.map((t, i) => s.teams[i] || t);
            ctx.save(); drawRows(); reset();
          })),
          h('p', { class: 'hint' }, 'Colour, name and keyboard key for each team:'),
          rows,
          field('Buzz sound', select([['team', 'A different sound for each team'], ['buzzA', 'Same buzz for everyone'], ['ding', 'Ding'], ['fanfare', 'Fanfare'], ['none', 'No sound']], s.sound, (v) => { s.sound = v; ctx.save(); })),
          checkbox('Show who buzzed 2nd, 3rd… and how far behind', s.showOrder, (v) => { s.showOrder = v; ctx.save(); draw(); }),
          checkbox('Keyboard keys buzz too (Enter = ready again)', s.keys, (v) => { s.keys = v; ctx.save(); draw(); }),
          field('Get ready again by itself', select([[0, 'No — tap ↺ Ready'], [5, 'After 5 seconds'], [10, 'After 10 seconds']], s.autoReset, (v) => { s.autoReset = Number(v); ctx.save(); })),
          h('p', { class: 'hint' }, 'Buzzers react the moment a finger touches, so the fastest finger wins even when several press at once. Any button that types a key (Makey Makey, Arduino, a spare keyboard) can be a buzzer.'),
        );
      },
      closeSettings: draw,
    };
  },
};
