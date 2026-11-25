import { h } from '../util.js';
import { panel, field, textInput, select } from './_common.js';
import { GROUP_COLOURS } from '../groups.js';

// Buttons: one or more big buttons in a single widget. Each one either opens another of your
// screens (e.g. "▶ Group work" on the Morning screen) or opens a website in a new tab.
//
// The type is still called 'gotoscreen' so screens, share links, files and ⭐ My widgets made
// before buttons could do more than one thing keep working. Old one-button widgets are turned
// into a list holding that one button the first time they open.
//
// A screen button remembers the screen's name as well as its id, so it still finds it after the
// screens have been saved to a file and opened again (which gives them new ids).

const MAX_BUTTONS = 12;
const DEFAULT_COLOUR = '#3b6fd8';

const newButton = (colour = DEFAULT_COLOUR) =>
  ({ action: 'screen', target: '', targetName: '', url: '', label: '', icon: '', colour });

/** Moves an old one-button widget's settings into the list of buttons. */
function upgrade(s) {
  if (Array.isArray(s.buttons)) return;
  const b = newButton();
  b.target = s.target || '';
  b.targetName = s.targetName || '';
  b.label = s.label || '';
  b.icon = s.icon && s.icon !== '➡️' ? s.icon : '';
  s.buttons = [b];
  delete s.target; delete s.targetName; delete s.label; delete s.icon;
}

/** A typed link made safe to open: adds https:// if it's missing; only web links are allowed. */
export function cleanURL(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t.replace(/^\/+/, '')}`;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
}

function siteName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Black or white writing, whichever is easier to read on this colour. */
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#1d1d1f' : '#fff';
}

const isSet = (b) => (b.action === 'link' ? !!cleanURL(b.url) : !!(b.target || b.targetName));
const wordsFor = (b) => b.label || (b.action === 'link' ? siteName(cleanURL(b.url)) : b.targetName);
const iconFor = (b) => b.icon || (b.action === 'link' ? '🔗' : '➡️');

/** How many columns lay n buttons out biggest in a w × h box. */
function bestColumns(n, w, hgt) {
  let best = 1, bestScore = -1;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const bw = w / cols, bh = hgt / rows;
    // Buttons look best around 2.2 : 1; score by the biggest such button that fits.
    const score = Math.min(bw, bh * 2.2) - (rows * cols - n) * 2;
    if (score > bestScore) { bestScore = score; best = cols; }
  }
  return best;
}

export default {
  type: 'gotoscreen',
  title: 'Buttons',
  icon: '🔘',
  group: 'core',
  size: [300, 160],
  hasSettings: true,
  defaultState: () => ({ buttons: [newButton()] }),

  mount(ctx) {
    const s = ctx.state;
    upgrade(s);
    const grid = h('div', { class: 'goto' });
    ctx.view.append(grid);

    function press(b) {
      if (!isSet(b)) { ctx.openSettings(); return; }
      if (b.action === 'link') window.open(cleanURL(b.url), '_blank', 'noopener');
      else ctx.goToScreen(b.target, b.targetName);
    }

    function render() {
      const list = s.buttons.length ? s.buttons : [newButton()];
      const n = list.length;
      const cols = bestColumns(n, ctx.view.clientWidth || 300, ctx.view.clientHeight || 160);
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.setProperty('--rows', Math.ceil(n / cols));
      grid.classList.toggle('many', n > 1);
      grid.replaceChildren(...list.map((b) => {
        const set = isSet(b);
        const btn = h('button', {
          class: `goto-btn${set ? '' : ' unset'}`,
          style: set ? { background: b.colour || DEFAULT_COLOUR, color: inkFor(b.colour || DEFAULT_COLOUR) } : {},
          onclick: () => press(b),
        },
        h('span', { class: 'goto-icon', 'aria-hidden': 'true' }, set ? iconFor(b) : '⚙'),
        h('span', { class: 'goto-label' }, set ? wordsFor(b) : (b.action === 'link' ? 'Add a website' : 'Choose a screen')));
        btn.title = !set ? 'Set up this button'
          : b.action === 'link' ? `Open ${siteName(cleanURL(b.url))} in a new tab`
            : `Open the screen “${b.targetName}”`;
        return btn;
      }));
    }
    render();

    let screens = null;   // filled in when settings open
    function drawSettings() {
      const changed = () => { ctx.save(); render(); };
      const redraw = () => { changed(); ctx.openSettings(); };   // redraws the panel in place
      const move = (i, d) => {
        const j = i + d;
        if (j < 0 || j >= s.buttons.length) return;
        [s.buttons[i], s.buttons[j]] = [s.buttons[j], s.buttons[i]];
        redraw();
      };

      const cards = s.buttons.map((b, i) => {
        let target;
        if (b.action === 'link') {
          const note = h('p', { class: 'hint goto-site' });
          const showSite = () => {
            const u = cleanURL(b.url);
            note.textContent = !b.url.trim() ? 'Type or paste a web address.'
              : u ? `Opens ${siteName(u)} in a new tab.` : 'That doesn’t look like a web address.';
          };
          showSite();
          target = [
            field('Website', textInput(b.url, (v) => { b.url = v; showSite(); changed(); },
              { placeholder: 'e.g. abc.net.au/abckids', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false' })),
            note,
          ];
        } else {
          const others = (screens || []).filter((sc) => sc.id !== ctx.screenId());
          const found = others.some((sc) => sc.id === b.target);
          const first = screens === null ? (b.targetName || 'Loading…')
            : others.length ? (b.targetName && !found ? `${b.targetName} (finds it by name)` : 'Choose…')
              : 'Make another screen first (☰ → + New screen)';
          const sel = h('select', {
            onchange: () => {
              const opt = sel.selectedOptions[0];
              if (!opt?.value) return;
              b.target = opt.value;
              b.targetName = opt.dataset.name;
              changed();
            },
          },
          h('option', { value: '', selected: !found }, first),
          ...others.map((sc) => h('option', { value: sc.id, 'data-name': sc.name, selected: sc.id === b.target }, sc.name)));
          target = [field('Opens the screen', sel)];
        }

        const colours = h('div', { class: 'gcolours' }, ...GROUP_COLOURS.map(([c, label]) => h('button', {
          class: `gcolour${(b.colour || DEFAULT_COLOUR) === c ? ' on' : ''}`,
          style: { background: c }, title: label, 'aria-label': label,
          onclick: () => { b.colour = c; redraw(); },
        })));

        const tools = h('div', { class: 'goto-card-tools' },
          h('button', { class: 'btn small', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'btn small', title: 'Move down', 'aria-label': 'Move down', disabled: i === s.buttons.length - 1, onclick: () => move(i, 1) }, '↓'),
          s.buttons.length > 1 && h('button', {
            class: 'btn small', title: 'Remove this button', 'aria-label': 'Remove this button',
            onclick: () => { s.buttons.splice(i, 1); redraw(); },
          }, '✕'),
        );

        return h('div', { class: 'goto-card', style: { borderLeftColor: b.colour || DEFAULT_COLOUR } },
          h('div', { class: 'goto-card-head' }, h('b', {}, `Button ${i + 1}`), tools),
          field('When pressed', select([['screen', 'Go to a screen'], ['link', 'Open a website in a new tab']], b.action,
            (v) => { b.action = v; redraw(); })),
          ...target,
          field(b.action === 'link' ? 'Button words (leave empty to use the website’s name)' : 'Button words (leave empty to use the screen’s name)',
            textInput(b.label, (v) => { b.label = v; changed(); }, { placeholder: b.action === 'link' ? 'e.g. Brain break' : (b.targetName || 'e.g. Group work time') })),
          field('Emoji', textInput(b.icon, (v) => { b.icon = v.trim(); changed(); }, { placeholder: iconFor({ action: b.action }), maxlength: 8, style: { width: '6em' } })),
          field('Colour', colours),
        );
      });

      const add = s.buttons.length < MAX_BUTTONS && h('button', {
        class: 'btn',
        onclick: () => {
          const used = new Set(s.buttons.map((b) => b.colour));
          const colour = (GROUP_COLOURS.find(([c]) => !used.has(c)) || GROUP_COLOURS[0])[0];
          s.buttons.push(newButton(colour));
          redraw();
        },
      }, '+ Add a button');

      panel(ctx, 'Buttons', ...cards, add,
        h('p', { class: 'hint' }, 'Tip: put buttons on each screen to step through a lesson — Morning → Maths → Pack up.'),
        h('p', { class: 'hint' }, 'Websites open in a new tab, and this screen keeps going in its own tab — switch back to it when you’re done.'));
    }

    return {
      resize: render,
      openSettings() {
        // The panel is drawn straight away; the list of screens fills in a moment later.
        drawSettings();
        if (screens === null) ctx.listScreens().then((all) => { screens = all; ctx.openSettings(); });
      },
      closeSettings() { screens = null; render(); },   // fetch the list fresh next time
    };
  },
};
