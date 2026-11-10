import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, textInput, field, checkbox } from './_common.js';
import { logEvent, recBadge, RECORD_HINT } from '../datalog.js';

const LIGHTS = ['red', 'amber', 'green'];

export default {
  type: 'traffic',
  title: 'Traffic light',
  icon: '🚦',
  group: 'manage',
  size: [200, 420],
  hasSettings: true,
  defaultState: () => ({ record: false, since: null, on: 'green', labels: { red: 'Stop & listen', amber: 'Finish up', green: 'Work time' } }),

  mount(ctx) {
    const s = ctx.state;
    const lamps = {};
    const box = h('div', { class: 'traffic-box' });
    const label = h('div', { class: 'traffic-label' });
    for (const c of LIGHTS) {
      lamps[c] = h('button', {
        class: `lamp ${c}`,
        'aria-label': `${c} light`,
        onclick: () => {
          const prev = s.on;
          // Record how long the previous light was on (e.g. 6 min on red).
          if (s.record && prev && s.since) {
            const sec = (Date.now() - s.since) / 1000;
            if (sec >= 2) logEvent({ widget: 'traffic', widgetId: ctx.rec.id, kind: 'light', label: `${prev[0].toUpperCase()}${prev.slice(1)} — ${s.labels[prev] || ''}`, value: sec, unit: 'seconds' });
          }
          s.on = s.on === c ? null : c;
          s.since = Date.now();
          play('pop');
          render();
          ctx.save();
        },
      });
      box.append(lamps[c]);
    }
    const badge = recBadge();
    ctx.view.append(h('div', { class: 'traffic' }, box, label), badge);
    if (!s.since) s.since = Date.now();

    function render() {
      for (const c of LIGHTS) {
        lamps[c].classList.toggle('on', s.on === c);
        lamps[c].setAttribute('aria-pressed', String(s.on === c));
      }
      label.textContent = s.on ? s.labels[s.on] || '' : '';
      label.dataset.on = s.on || '';
      badge.hidden = !s.record;
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Traffic light labels',
          checkbox('📊 Record how long each light is on', s.record, (v) => { s.record = v; s.since = Date.now(); render(); ctx.save(); }),
          h('p', { class: 'hint' }, RECORD_HINT),
          ...LIGHTS.map((c) => field(`${c[0].toUpperCase()}${c.slice(1)}`, textInput(s.labels[c], (v) => { s.labels[c] = v; render(); ctx.save(); }))),
        );
      },
    };
  },
};
