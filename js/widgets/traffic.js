import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, textInput, field } from './_common.js';

const LIGHTS = ['red', 'amber', 'green'];

export default {
  type: 'traffic',
  title: 'Traffic light',
  icon: '🚦',
  group: 'manage',
  size: [200, 420],
  hasSettings: true,
  defaultState: () => ({ on: 'green', labels: { red: 'Stop & listen', amber: 'Finish up', green: 'Work time' } }),

  mount(ctx) {
    const s = ctx.state;
    const lamps = {};
    const box = h('div', { class: 'traffic-box' });
    const label = h('div', { class: 'traffic-label' });
    for (const c of LIGHTS) {
      lamps[c] = h('button', {
        class: `lamp ${c}`,
        'aria-label': `${c} light`,
        onclick: () => { s.on = s.on === c ? null : c; play('pop'); render(); ctx.save(); },
      });
      box.append(lamps[c]);
    }
    ctx.view.append(h('div', { class: 'traffic' }, box, label));

    function render() {
      for (const c of LIGHTS) {
        lamps[c].classList.toggle('on', s.on === c);
        lamps[c].setAttribute('aria-pressed', String(s.on === c));
      }
      label.textContent = s.on ? s.labels[s.on] || '' : '';
      label.dataset.on = s.on || '';
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Traffic light labels',
          ...LIGHTS.map((c) => field(`${c[0].toUpperCase()}${c.slice(1)}`, textInput(s.labels[c], (v) => { s.labels[c] = v; render(); ctx.save(); }))),
        );
      },
    };
  },
};
