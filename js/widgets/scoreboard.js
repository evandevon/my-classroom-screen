import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, numberInput, textInput, field, swatches, PALETTE } from './_common.js';

export default {
  type: 'scoreboard',
  title: 'Scoreboard',
  icon: '🏆',
  group: 'extras',
  size: [520, 300],
  hasSettings: true,
  defaultState: () => ({
    step: 1,
    teams: [
      { name: 'Team 1', score: 0, color: PALETTE[4] },
      { name: 'Team 2', score: 0, color: PALETTE[0] },
    ],
  }),

  mount(ctx) {
    const s = ctx.state;
    const board = h('div', { class: 'scores' });
    ctx.view.append(board);

    function bump(t, d) {
      t.score += d;
      play(d > 0 ? 'ding' : 'pop');
      ctx.save();
      render(t);
    }

    function render(changed) {
      const top = Math.max(...s.teams.map((t) => t.score));
      board.style.setProperty('--n', s.teams.length);
      board.replaceChildren(
        ...s.teams.map((t) =>
          h('div', { class: `team${t.score === top && top > 0 ? ' leading' : ''}`, style: { '--c': t.color } },
            h('div', { class: 'team-name' }, t.name),
            h('button', { class: `team-score${t === changed ? ' pop' : ''}`, 'aria-label': `${t.name} score ${t.score}. Tap to add ${s.step}`, onclick: () => bump(t, s.step) }, String(t.score)),
            h('div', { class: 'team-btns' },
              h('button', { class: 'btn', 'aria-label': `Take ${s.step} from ${t.name}`, onclick: () => bump(t, -s.step) }, `−${s.step}`),
              h('button', { class: 'btn', 'aria-label': `Add ${s.step} to ${t.name}`, onclick: () => bump(t, s.step) }, `+${s.step}`),
            ),
          ),
        ),
      );
    }
    render();

    return {
      openSettings() {
        const teamsBox = h('div', { class: 'stack' });
        const drawTeams = () => {
          teamsBox.replaceChildren(
            ...s.teams.map((t, i) =>
              h('div', { class: 'team-edit' },
                textInput(t.name, (v) => { t.name = v; render(); ctx.save(); }, { 'aria-label': `Team ${i + 1} name` }),
                swatches(PALETTE, t.color, (c) => { t.color = c; render(); ctx.save(); }),
                s.teams.length > 1 ? h('button', { class: 'btn small', 'aria-label': 'Remove team', onclick: () => { s.teams.splice(i, 1); drawTeams(); render(); ctx.save(); } }, '✕') : null,
              ),
            ),
          );
        };
        drawTeams();
        panel(ctx, 'Scoreboard',
          teamsBox,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { if (s.teams.length < 8) { s.teams.push({ name: `Team ${s.teams.length + 1}`, score: 0, color: PALETTE[s.teams.length % PALETTE.length] }); drawTeams(); render(); ctx.save(); } } }, '+ Add team'),
            h('button', { class: 'btn', onclick: () => { s.teams.forEach((t) => (t.score = 0)); render(); ctx.save(); } }, 'Reset scores'),
          ),
          field('Points per tap', numberInput(s.step, (v) => { if (v > 0) { s.step = v; render(); ctx.save(); } }, { min: 1, max: 100 })),
        );
      },
    };
  },
};
