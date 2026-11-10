import { h } from '../util.js';
import { play } from '../sound.js';
import { logEvent, recBadge, RECORD_HINT } from '../datalog.js';
import { namesFor, sourceName } from '../classes.js';
import { panel, numberInput, textInput, field, swatches, checkbox, PALETTE } from './_common.js';

export default {
  type: 'scoreboard',
  title: 'Scoreboard',
  icon: '🏆',
  group: 'extras',
  size: [520, 300],
  hasSettings: true,
  /** For share links: rows named after students in a class list become "Player 1", "Player 2"… */
  scrubNames(state, known) {
    let changed = false;
    state.teams.forEach((t, i) => {
      if (known.has(String(t.name).toLowerCase())) { t.name = `Player ${i + 1}`; changed = true; }
    });
    return changed;
  },
  defaultState: () => ({
    record: false,
    step: 1,
    teams: [
      { name: 'Team 1', score: 0, color: PALETTE[4] },
      { name: 'Team 2', score: 0, color: PALETTE[0] },
    ],
  }),

  mount(ctx) {
    const s = ctx.state;
    const board = h('div', { class: 'scores' });
    const badge = recBadge();
    ctx.view.append(board, badge);

    function bump(t, d) {
      t.score += d;
      play(d > 0 ? 'ding' : 'pop');
      if (s.record) logEvent({ widget: 'scoreboard', widgetId: ctx.rec.id, kind: 'points', label: 'Points', who: t.name, value: d, unit: 'points' });
      ctx.save();
      render(t);
    }

    function render(changed) {
      const top = Math.max(...s.teams.map((t) => t.score));
      board.style.setProperty('--n', s.teams.length);
      badge.hidden = !s.record;
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
          namesFor('current')
            ? h('button', { class: 'btn', onclick: () => {
                const names = namesFor('current');
                if (!confirm(`Replace the teams with a row for each of the ${names.length} students in ${sourceName('current')}? (Scores start at 0.)`)) return;
                s.teams = names.map((n, i) => ({ name: n, score: 0, color: PALETTE[i % PALETTE.length] }));
                ctx.save(); render(); ctx.openSettings();
              } }, `👥 Make a row for each student in ${sourceName('current')}`)
            : h('p', { class: 'hint' }, 'Tip: choose a class (👥 at the top) to make a row for each student, or add rows yourself.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { if (s.teams.length < 30) { s.teams.push({ name: `Team ${s.teams.length + 1}`, score: 0, color: PALETTE[s.teams.length % PALETTE.length] }); drawTeams(); render(); ctx.save(); } } }, '+ Add team'),
            h('button', { class: 'btn', onclick: () => { s.teams.forEach((t) => (t.score = 0)); render(); ctx.save(); } }, 'Reset scores'),
          ),
          checkbox('📊 Record every point in the Data log', s.record, (v) => { s.record = v; render(); ctx.save(); }),
          h('p', { class: 'hint' }, RECORD_HINT),
          field('Points per tap', numberInput(s.step, (v) => { if (v > 0) { s.step = v; render(); ctx.save(); } }, { min: 1, max: 100 })),
        );
      },
    };
  },
};
