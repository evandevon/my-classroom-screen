import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, checkbox, field, textInput, numberInput, select, swatches, PALETTE } from './_common.js';

// Progress bar: a bar towards a goal (e.g. 20 marbles for a class reward), with − at one end and
// + at the other, and how many have been added and how many are left.

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

export default {
  type: 'goalbar',
  title: 'Progress bar',
  icon: '📈',
  group: 'manage',
  size: [620, 260],
  /** Saved to My widgets: keep the settings and content, start the activity fresh. */
  fresh(s) { s.done = 0; },
  hasSettings: true,
  defaultState: () => ({
    label: 'Class goal',
    goal: 20,
    done: 0,
    step: 1,
    color: '#2a9d8f',
    reward: '🎉 Reward time!',
    showNumbers: true,
    sound: true,
  }),

  mount(ctx) {
    const s = ctx.state;
    const wrap = h('div', { class: 'goalbar' });
    ctx.view.append(wrap);

    const title = h('div', { class: 'gb-title' });
    const fill = h('div', { class: 'gb-fill' });
    const inBar = h('span', { class: 'gb-inbar' });
    const bar = h('div', { class: 'gb-bar', role: 'progressbar', 'aria-valuemin': 0 }, fill, inBar);
    const minus = h('button', { class: 'gb-btn gb-minus', onclick: () => change(-1) });
    const plus = h('button', { class: 'gb-btn gb-plus', onclick: () => change(1) });
    const added = h('span', { class: 'gb-added' });
    const left = h('span', { class: 'gb-left' });
    const nums = h('div', { class: 'gb-nums' }, added, left);
    wrap.append(title, h('div', { class: 'gb-row' }, minus, bar, plus), nums);

    function change(dir) {
      const goal = clampInt(s.goal, 1, 9999);
      const before = s.done;
      s.done = clampInt(s.done + dir * clampInt(s.step, 1, goal), 0, goal);
      if (s.done === before) return;
      ctx.save();
      render();
      if (s.sound) play(s.done === goal && before < goal ? 'fanfare' : 'pop');
      if (s.done === goal && before < goal) {
        wrap.classList.remove('gb-cheer');
        void wrap.offsetWidth;
        wrap.classList.add('gb-cheer');
      }
      const b = dir > 0 ? plus : minus;
      b.classList.remove('bump');
      void b.offsetWidth;
      b.classList.add('bump');
    }

    function render() {
      const goal = clampInt(s.goal, 1, 9999);
      s.done = clampInt(s.done, 0, goal);
      const step = clampInt(s.step, 1, goal);
      const full = s.done >= goal;
      wrap.style.setProperty('--gb', s.color || '#2a9d8f');
      wrap.classList.toggle('gb-full', full);
      title.textContent = s.label || '';
      title.hidden = !s.label;
      fill.style.width = `${(100 * s.done) / goal}%`;
      bar.setAttribute('aria-valuemax', goal);
      bar.setAttribute('aria-valuenow', s.done);
      bar.setAttribute('aria-label', `${s.label || 'Progress'}: ${s.done} of ${goal}`);
      inBar.textContent = full ? (s.reward || '🎉 Done!') : `${s.done} / ${goal}`;
      minus.textContent = step > 1 ? `−${step}` : '−';
      plus.textContent = step > 1 ? `+${step}` : '+';
      minus.disabled = s.done <= 0;
      plus.disabled = full;
      minus.setAttribute('aria-label', `Take away ${step}`);
      plus.setAttribute('aria-label', `Add ${step}`);
      nums.hidden = !s.showNumbers;
      added.textContent = `${s.done} added`;
      left.textContent = full ? 'Goal reached!' : `${goal - s.done} to go`;
    }
    render();

    return {
      resize: render,
      openSettings() {
        panel(ctx, 'Progress bar',
          field('Name (shown above the bar)', textInput(s.label, (v) => { s.label = v; ctx.save(); render(); }, { placeholder: 'e.g. Marbles for a class party' })),
          field('Goal (how many to fill the bar)', numberInput(s.goal, (v) => { s.goal = clampInt(v, 1, 9999); ctx.save(); render(); }, { min: 1, max: 9999 })),
          field('Each tap of + or − adds or takes away', select([[1, '1'], [2, '2'], [5, '5'], [10, '10']].map(([v, l]) => [String(v), l]), String(s.step), (v) => { s.step = Number(v); ctx.save(); render(); })),
          field('How many so far', numberInput(s.done, (v) => { s.done = clampInt(v, 0, s.goal); ctx.save(); render(); }, { min: 0, max: 9999 })),
          field('When it’s full, the bar says', textInput(s.reward, (v) => { s.reward = v; ctx.save(); render(); }, { placeholder: '🎉 Reward time!' })),
          checkbox('Show how many are added and left', s.showNumbers, (v) => { s.showNumbers = v; ctx.save(); render(); }),
          checkbox('Sounds (a pop each tap, a fanfare when full)', s.sound, (v) => { s.sound = v; ctx.save(); }),
          field('Colour', swatches(PALETTE, s.color, (v) => { s.color = v; ctx.save(); render(); })),
          h('button', { class: 'btn', onclick: () => { if (confirm('Empty the bar and start again from 0?')) { s.done = 0; ctx.save(); render(); ctx.openSettings(); } } }, '↺ Start again from 0'),
        );
      },
      closeSettings: render,
    };
  },
};
