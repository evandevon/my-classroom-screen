// Helpers shared by widget settings panels.
import { h } from '../util.js';
export { field } from '../util.js';

export function doneButton(ctx, label = 'Done') {
  return h('button', { class: 'btn primary done', onclick: () => ctx.closeSettings() }, label);
}

export function panel(ctx, title, ...rows) {
  ctx.settings.replaceChildren(
    h('div', { class: 'settings-panel' }, h('h3', {}, title), ...rows, h('div', { class: 'settings-foot' }, doneButton(ctx))),
  );
}

export function textInput(value, onInput, attrs = {}) {
  return h('input', { type: 'text', value: value ?? '', oninput: (e) => onInput(e.target.value), ...attrs });
}

export function numberInput(value, onInput, attrs = {}) {
  return h('input', {
    type: 'number',
    inputmode: 'numeric',
    value,
    oninput: (e) => {
      const n = Number(e.target.value);
      if (!Number.isNaN(n)) onInput(n);
    },
    ...attrs,
  });
}

export function textarea(value, onInput, attrs = {}) {
  const t = h('textarea', { oninput: (e) => onInput(e.target.value), ...attrs });
  t.value = value ?? '';
  return t;
}

export function select(options, value, onChange) {
  const s = h('select', { onchange: (e) => onChange(e.target.value) });
  for (const [v, label] of options) {
    const o = h('option', { value: v }, label);
    if (String(v) === String(value)) o.selected = true;
    s.append(o);
  }
  return s;
}

export function checkbox(label, checked, onChange) {
  const c = h('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
  c.checked = !!checked;
  return h('label', { class: 'check' }, c, h('span', {}, label));
}

export function colorInput(value, onInput) {
  return h('input', { type: 'color', value, oninput: (e) => onInput(e.target.value) });
}

export const PALETTE = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#7b2cbf', '#ff6fb5', '#264653', '#8ac926', '#1982c4'];

export function swatches(colors, value, onPick) {
  const wrap = h('div', { class: 'swatches' });
  for (const c of colors) {
    const b = h('button', {
      class: `swatch${c === value ? ' on' : ''}`,
      style: { background: c },
      title: c,
      'aria-label': `Colour ${c}`,
      onclick: () => {
        wrap.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
        b.classList.add('on');
        onPick(c);
      },
    });
    wrap.append(b);
  }
  return wrap;
}

export function fmtTime(totalSec, { forceHours = false } = {}) {
  const s = Math.max(0, Math.round(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh || forceHours ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

/** Only allow simple formatting tags; strips every attribute (protects against script in shared links). */
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'S', 'BIG', 'SMALL']);
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) child.remove();
          else {
            walk(child);
            child.replaceWith(...child.childNodes);
          }
          continue;
        }
        for (const a of [...child.attributes]) child.removeAttribute(a.name);
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  const root = doc.body.firstChild;
  walk(root);
  return root.innerHTML;
}
