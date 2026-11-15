import { h } from '../util.js';
import { panel, field, textInput } from './_common.js';

// A big button that opens another of your screens, e.g. "▶ Group work" on the Morning screen.
// It remembers the screen's name as well as its id, so it still finds it after the screens
// have been saved to a file and opened again (which gives them new ids).

export default {
  type: 'gotoscreen',
  title: 'Go to screen',
  icon: '➡️',
  group: 'core',
  size: [300, 160],
  hasSettings: true,
  defaultState: () => ({ target: '', targetName: '', label: '', icon: '➡️' }),

  mount(ctx) {
    const s = ctx.state;
    const btn = h('button', { class: 'goto-btn' });
    ctx.view.append(h('div', { class: 'goto' }, btn));

    function render() {
      const set = !!(s.target || s.targetName);
      btn.replaceChildren(
        h('span', { class: 'goto-icon', 'aria-hidden': 'true' }, set ? (s.icon || '➡️') : '⚙'),
        h('span', { class: 'goto-label' }, set ? (s.label || s.targetName) : 'Choose a screen'),
      );
      btn.classList.toggle('unset', !set);
      btn.title = set ? `Open the screen “${s.targetName}”` : 'Choose which screen this button opens';
      btn.onclick = () => (set ? ctx.goToScreen(s.target, s.targetName) : ctx.openSettings());
    }
    render();

    return {
      resize: render,
      openSettings() {
        // The panel is drawn straight away; the list of screens fills in a moment later.
        const sel = h('select', {
          onchange: () => {
            const opt = sel.selectedOptions[0];
            if (!opt?.value) return;
            s.target = opt.value;
            s.targetName = opt.dataset.name;
            ctx.save(); render();
          },
        }, h('option', { value: '' }, s.targetName ? `${s.targetName}` : 'Loading…'));
        ctx.listScreens().then((all) => {
          const screens = all.filter((sc) => sc.id !== ctx.screenId());
          const found = screens.some((sc) => sc.id === s.target);
          sel.replaceChildren(
            h('option', { value: '', selected: !found }, screens.length
              ? (s.targetName && !found ? `${s.targetName} (finds it by name)` : 'Choose…')
              : 'Make another screen first (☰ → + New screen)'),
            ...screens.map((sc) => h('option', { value: sc.id, 'data-name': sc.name, selected: sc.id === s.target }, sc.name)),
          );
        });
        panel(ctx, 'Go to screen',
          field('Opens the screen', sel),
          field('Button words (leave empty to use the screen’s name)', textInput(s.label, (v) => { s.label = v; ctx.save(); render(); }, { placeholder: s.targetName || 'e.g. Group work time' })),
          field('Emoji', textInput(s.icon, (v) => { s.icon = v.trim(); ctx.save(); render(); }, { placeholder: '➡️', maxlength: 8, style: { width: '6em' } })),
          h('p', { class: 'hint' }, 'Tip: put a button on each screen to step through a lesson — Morning → Maths → Pack up.'),
        );
      },
      closeSettings: render,
    };
  },
};
