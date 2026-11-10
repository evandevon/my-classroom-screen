import { h, setKids } from '../util.js';
import { play } from '../sound.js';
import { panel, field, select, textarea } from './_common.js';

// Story dice: roll picture dice and tell a story that uses every picture. Tap a die to keep it.

export const SETS = {
  characters: { label: 'Characters', icons: ['👧', '👦', '🧙', '🐉', '🤖', '👽', '🦸', '🐶', '🦊', '🧜', '👑', '🐻', '🦄', '🧚', '🐢', '👵'] },
  places: { label: 'Places', icons: ['🏰', '🌋', '🏝️', '🚀', '🌲', '🏙️', '🏜️', '🌊', '🏔️', '🏚️', '🎪', '🌌', '🏫', '🚂', '🛸', '🏕️'] },
  objects: { label: 'Objects', icons: ['🗝️', '📦', '🗺️', '💎', '🎁', '🔦', '⌛', '🪄', '📱', '🧭', '🎈', '⚽', '📜', '🔮', '🪙', '🎒'] },
  actions: { label: 'Actions', icons: ['🏃', '💤', '🔍', '🎉', '🧗', '🍳', '🎨', '✈️', '🎣', '🛠️', '🏊', '🎤', '🚲', '🧩', '📖', '🤝'] },
  nature: { label: 'Weather & nature', icons: ['☀️', '🌧️', '⛈️', '❄️', '🌈', '🌙', '🌪️', '🍂', '🔥', '🌸', '🦋', '⭐', '🌊', '🌵', '🍄', '🐝'] },
  feelings: { label: 'Feelings', icons: ['😀', '😢', '😡', '😨', '😲', '😴', '🥳', '😕', '🤔', '😍', '😬', '😎', '🤩', '😳', '🥺', '😤'] },
};
const MIXED_ORDER = ['characters', 'places', 'objects', 'actions', 'nature', 'feelings', 'characters', 'objects', 'actions'];

const PROMPTS = [
  'Tell a story that uses every picture.',
  'Start with “Once upon a time…”',
  'Who is the hero? What is the problem? How is it solved?',
  'Use the pictures in order from left to right.',
  'Tell the story in exactly three sentences.',
  'Make the last picture the surprise ending!',
  'Tell it as a news report.',
];

export default {
  type: 'storydice',
  title: 'Story dice',
  icon: '📚',
  group: 'extras',
  size: [620, 340],
  hasSettings: true,
  defaultState: () => ({ count: 6, theme: 'mixed', custom: '', faces: [], locked: [], prompt: 0 }),

  mount(ctx) {
    const s = ctx.state;
    const tray = h('div', { class: 'sdice-tray' });
    const prompt = h('button', { class: 'sdice-prompt', title: 'Tap for a different challenge' });
    prompt.addEventListener('click', () => { s.prompt = (s.prompt + 1) % PROMPTS.length; ctx.save(); render(); });
    const countEl = h('span', { class: 'dice-count' });
    ctx.view.append(h('div', { class: 'sdice' }, tray, prompt,
      h('div', { class: 'dice-foot' },
        h('button', { class: 'btn small', 'aria-label': 'Fewer dice', onclick: () => setCount(s.count - 1) }, '−'),
        countEl,
        h('button', { class: 'btn small', 'aria-label': 'More dice', onclick: () => setCount(s.count + 1) }, '+'),
        h('button', { class: 'btn primary big', onclick: roll }, '🎲 Roll'),
        h('button', { class: 'btn small', onclick: () => { s.locked = []; ctx.save(); render(); } }, 'Unlock all'),
      ),
    ));

    let rolling = false;
    function poolFor(i) {
      if (s.theme === 'custom') {
        const list = [...String(s.custom).matchAll(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu)].map((m) => m[0]);
        return list.length ? list : SETS.objects.icons;
      }
      if (s.theme === 'mixed') return SETS[MIXED_ORDER[i % MIXED_ORDER.length]].icons;
      return SETS[s.theme]?.icons || SETS.objects.icons;
    }
    const pick = (i) => { const p = poolFor(i); return p[Math.floor(Math.random() * p.length)]; };

    function setCount(n) {
      s.count = Math.max(1, Math.min(9, n));
      s.faces = s.faces.slice(0, s.count);
      s.locked = s.locked.filter((x) => x < s.count);
      ctx.save();
      render();
    }

    function roll() {
      if (rolling) return;
      rolling = true;
      let n = 0;
      const step = () => {
        n++;
        for (let i = 0; i < s.count; i++) if (!s.locked.includes(i)) s.faces[i] = pick(i);
        play('tick');
        render(n < 10);
        if (n < 10) setTimeout(step, 45 + n * 10);
        else { rolling = false; play('pop'); ctx.save(); }
      };
      step();
    }

    function render(spinning = false) {
      tray.style.setProperty('--n', s.count);
      setKids(tray, ...Array.from({ length: s.count }, (_, i) => {
        const locked = s.locked.includes(i);
        return h('button', {
          class: `sdie${spinning && !locked ? ' rolling' : ''}${locked ? ' locked' : ''}`,
          title: locked ? 'Kept — tap to roll it again next time' : 'Tap to keep this picture',
          'aria-label': `${s.faces[i] || 'blank'}${locked ? ', kept' : ''}`,
          onclick: () => { s.locked = locked ? s.locked.filter((x) => x !== i) : [...s.locked, i]; ctx.save(); render(); },
        }, h('span', { class: 'sdie-face' }, s.faces[i] || '❔'), locked ? h('span', { class: 'sdie-lock' }, '🔒') : null);
      }));
      countEl.textContent = `${s.count} dice`;
      prompt.textContent = s.faces.length ? `✍️ ${PROMPTS[s.prompt % PROMPTS.length]}` : 'Roll the dice, then tell a story using the pictures!';
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Story dice',
          field('Pictures', select([['mixed', 'Mixed (a character, a place, an object…)'], ...Object.entries(SETS).map(([k, v]) => [k, v.label]), ['custom', 'My own emojis']], s.theme, (v) => { s.theme = v; ctx.save(); ctx.openSettings(); })),
          s.theme === 'custom' ? field('Your emojis (type or paste any — they can be on one line)', textarea(s.custom, (v) => { s.custom = v; ctx.save(); }, { rows: 3, placeholder: '🐸 🍕 🚗 🎸 🏖️ 🐙' })) : null,
          h('p', { class: 'hint' }, 'Tap a die to keep it when you roll again. Tap the challenge under the dice to change it.'),
        );
      },
      closeSettings: () => render(),
    };
  },
};
