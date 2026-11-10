import { h } from '../util.js';
import { panel, select, field } from './_common.js';

export const VOICE = [
  { icon: '🤫', label: 'Silent' },
  { icon: '🐭', label: 'Whisper' },
  { icon: '🗣️', label: 'Partner voice' },
  { icon: '👥', label: 'Group voice' },
  { icon: '📣', label: 'Presenter voice' },
];
export const WORK = [
  { icon: '🧍', label: 'Work on your own' },
  { icon: '🧑‍🤝‍🧑', label: 'Work with a partner' },
  { icon: '👨‍👩‍👧‍👦', label: 'Work in your group' },
  { icon: '✋', label: 'Hands up to ask' },
  { icon: '3️⃣', label: 'Ask 3 before me' },
  { icon: '👀', label: 'Eyes on the teacher' },
  { icon: '🧹', label: 'Pack up time' },
];

export default {
  type: 'worksymbols',
  title: 'Work symbols',
  icon: '🤫',
  group: 'manage',
  size: [420, 260],
  hasSettings: true,
  defaultState: () => ({ show: 'both', voice: 1, work: 0 }),

  mount(ctx) {
    const s = ctx.state;
    const wrap = h('div', { class: 'ws' });
    ctx.view.append(wrap);

    const card = (list, key, heading) => {
      const item = list[s[key]] || list[0];
      const c = h('div', { class: 'ws-card' },
        h('div', { class: 'ws-head' }, heading),
        h('button', {
          class: 'ws-main',
          title: 'Tap for the next symbol',
          onclick: () => { s[key] = (s[key] + 1) % list.length; render(); ctx.save(); },
        }, h('span', { class: 'ws-icon' }, item.icon), h('span', { class: 'ws-label' }, item.label)),
        h('div', { class: 'ws-picker' },
          ...list.map((it, i) =>
            h('button', {
              class: `ws-pick${i === s[key] ? ' on' : ''}`,
              title: it.label,
              'aria-label': it.label,
              onclick: () => { s[key] = i; render(); ctx.save(); },
            }, it.icon),
          ),
        ),
      );
      if (key === 'voice') c.append(h('div', { class: 'ws-level' }, `Voice level ${s.voice}`));
      return c;
    };

    function render() {
      wrap.replaceChildren(
        ...[
          s.show !== 'work' ? card(VOICE, 'voice', 'Voice') : null,
          s.show !== 'voice' ? card(WORK, 'work', 'Working') : null,
        ].filter(Boolean),
      );
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Work symbols',
          field('Show', select([['both', 'Voice level + how to work'], ['voice', 'Voice level only'], ['work', 'How to work only']], s.show, (v) => { s.show = v; render(); ctx.save(); })),
        );
      },
    };
  },
};
