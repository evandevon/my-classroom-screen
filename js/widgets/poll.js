import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, field, textInput, textarea, select, checkbox, PALETTE } from './_common.js';

// Poll: a question and big tappable answers (emoji or words). Children walk up and tap;
// counts only — no names. Results can stay hidden until the teacher reveals them.

const PRESETS = {
  feelings: ['How are you feeling?', ['😀', '🙂', '😐', '🙁', '😢']],
  thumbs: ['Did that make sense?', ['👍', '🤏', '👎']],
  traffic: ['How are you going?', ['🟢 Got it', '🟡 Nearly', '🔴 Need help']],
  yesno: ['', ['Yes', 'No', 'Not sure']],
  truefalse: ['True or false?', ['True', 'False']],
  abcd: ['', ['A', 'B', 'C', 'D']],
  fist: ['Fist to five: how confident are you?', ['✊ 0', '☝️ 1', '✌️ 2', '🤟 3', '🖖 4', '🖐️ 5']],
};

export default {
  type: 'poll',
  title: 'Poll',
  icon: '🗳️',
  group: 'extras',
  size: [560, 400],
  hasSettings: true,
  defaultState: () => ({ question: 'How are you feeling?', options: ['😀', '🙂', '😐', '🙁', '😢'], counts: [0, 0, 0, 0, 0], reveal: true, sound: true }),

  mount(ctx) {
    const s = ctx.state;
    const fixCounts = () => { s.counts = s.options.map((_, i) => s.counts[i] || 0); };
    fixCounts();

    const heading = h('h2', { class: 'poll-q' });
    const grid = h('div', { class: 'poll-grid', role: 'group' });
    const total = h('span', { class: 'poll-total', 'aria-live': 'polite' });
    const eye = h('button', { class: 'btn small', onclick: () => { s.reveal = !s.reveal; ctx.save(); render(); } });
    const foot = h('div', { class: 'poll-foot' },
      total,
      eye,
      h('button', { class: 'btn small', title: 'Start again (↶ Undo brings the votes back)', onclick: () => { s.counts = s.options.map(() => 0); ctx.save(); render(); } }, '↺ Clear votes'),
    );
    ctx.view.append(h('div', { class: 'poll' }, heading, grid, foot));

    const lastTap = new Map();   // stops one jabbing finger from voting twice by accident
    function vote(i, btn) {
      const now = Date.now();
      if (now - (lastTap.get(i) || 0) < 350) return;
      lastTap.set(i, now);
      s.counts[i] = (s.counts[i] || 0) + 1;
      if (s.sound) play('pop');
      btn.classList.remove('voted'); void btn.offsetWidth; btn.classList.add('voted');
      ctx.save();
      render();
    }

    function render() {
      fixCounts();
      heading.textContent = s.question;
      heading.hidden = !s.question.trim();
      const sum = s.counts.reduce((a, b) => a + b, 0);
      const max = Math.max(1, ...s.counts);
      const btns = [...grid.children];
      if (btns.length !== s.options.length || btns.some((b, i) => b.dataset.label !== s.options[i])) {
        grid.replaceChildren(...s.options.map((label, i) => {
          const b = h('button', { class: 'poll-opt', style: { '--c': PALETTE[i % PALETTE.length] } },
            h('span', { class: 'poll-fill', 'aria-hidden': 'true' }),
            h('span', { class: `poll-label${/^\p{Extended_Pictographic}/u.test(label) && label.length <= 4 ? ' emoji' : ''}` }, label),
            h('span', { class: 'poll-count' }));
          b.dataset.label = label;
          b.addEventListener('click', () => vote(i, b));
          return b;
        }));
      }
      const n = s.options.length;
      grid.style.setProperty('--cols', String(n <= 5 ? n : n === 6 ? 3 : 4));   // balanced rows: 5 in a row, 6 as 3+3, 7–8 as 4+4
      [...grid.children].forEach((b, i) => {
        const c = s.counts[i] || 0;
        b.querySelector('.poll-count').textContent = s.reveal ? String(c) : '';
        b.querySelector('.poll-fill').style.height = s.reveal ? `${(c / max) * 100}%` : '0%';
        b.setAttribute('aria-label', `${s.options[i]}${s.reveal ? `: ${c} vote${c === 1 ? '' : 's'}` : ''}`);
      });
      total.textContent = `${sum} vote${sum === 1 ? '' : 's'}`;
      eye.textContent = s.reveal ? '🙈 Hide results' : '👁 Show results';
    }
    render();

    return {
      openSettings() {
        const presetSel = select([['', 'Choose a ready-made poll…'], ['feelings', '😀 Feelings'], ['thumbs', '👍 Thumbs'], ['traffic', '🟢 Traffic light'], ['yesno', 'Yes / No / Not sure'], ['truefalse', 'True / False'], ['abcd', 'A B C D'], ['fist', '✊ Fist to five']], '', (v) => {
          if (!PRESETS[v]) return;
          const [q, opts] = PRESETS[v];
          if (q) s.question = q;
          s.options = [...opts];
          s.counts = opts.map(() => 0);
          ctx.save(); render(); ctx.openSettings();
        });
        panel(ctx, 'Poll',
          field('Question or label (shown at the top)', textInput(s.question, (v) => { s.question = v; ctx.save(); render(); }, { placeholder: 'e.g. Which planet is biggest?' })),
          field('Answers — one per line. Emoji, words or both (2–8)', textarea(s.options.join('\n'), (v) => {
            const opts = v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8);
            if (opts.length < 1) return;
            s.counts = opts.map((o) => { const j = s.options.indexOf(o); return j >= 0 ? s.counts[j] || 0 : 0; });
            s.options = opts;
            ctx.save(); render();
          }, { rows: 6, placeholder: '😀\n😐\n🙁' })),
          field('Or start from', presetSel),
          checkbox('Show results while voting (untick to keep them hidden until you reveal them)', s.reveal, (v) => { s.reveal = v; ctx.save(); render(); }),
          checkbox('Sound on each vote', s.sound, (v) => { s.sound = v; ctx.save(); }),
          h('p', { class: 'hint' }, 'Only the number of taps is kept — no names. Each tap is one vote; ↶ Undo takes back a mistaken tap.'),
        );
      },
      closeSettings: () => render(),
    };
  },
};
