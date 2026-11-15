import { h } from './util.js';

// Widget colour themes. A theme only swaps colour variables on the widget (and a few
// widget-specific surfaces in CSS), so every widget picks it up.
export const THEMES = [
  { id: 'light', label: 'Light', swatch: '#ffffff' },
  { id: 'dark', label: 'Dark', swatch: '#1f2430' },
  { id: 'glass', label: 'Transparent · white', swatch: 'transparent', ink: '#fff' },
  { id: 'glass-dark', label: 'Transparent · dark', swatch: 'transparent', ink: '#1d1d1f' },
  { id: 'glass-box', base: 'glass', boxed: true, label: 'Transparent · white edge', swatch: 'transparent', ink: '#fff' },
  { id: 'glass-dark-box', base: 'glass-dark', boxed: true, label: 'Transparent · dark edge', swatch: 'transparent', ink: '#1d1d1f' },
  { id: 'blue', label: 'Blue', swatch: '#dbeafe' },
  { id: 'yellow', label: 'Yellow', swatch: '#fff4c7' },
  // No longer offered, but widgets already using them keep their look.
  { id: 'green', label: 'Green', swatch: '#dcf5e7', retired: true },
  { id: 'pink', label: 'Pink', swatch: '#fde2ec', retired: true },
  { id: 'purple', label: 'Purple', swatch: '#ece3fb', retired: true },
];

export function applyTheme(el, rec) {
  for (const t of THEMES) el.classList.remove(`theme-${t.id}`);
  el.classList.remove('theme-boxed');
  const t = THEMES.find((x) => x.id === rec.theme) || THEMES[0];
  // Edge variants are the transparent themes plus a box line around the widget.
  el.classList.add(`theme-${t.base || t.id}`);
  el.classList.toggle('theme-boxed', !!t.boxed);
  el.classList.toggle('tshadow', !!rec.shadow);
  // Text size: scales the words, numbers and emoji inside the widget.
  if (rec.fs && rec.fs !== 1) el.style.setProperty('--wfs', String(rec.fs)); else el.style.removeProperty('--wfs');
}

/** "Text size" slider (50%–250%) with a reset. onChange(fs). */
export function textSizeSlider(value = 1, onChange) {
  const out = h('b', { class: 'fs-val' });
  const r = h('input', { type: 'range', min: 0.5, max: 2.5, step: 0.05, value: String(value || 1), 'aria-label': 'Text size' });
  const show = () => { out.textContent = `${Math.round(Number(r.value) * 100)}%`; };
  r.addEventListener('input', () => { show(); onChange(Number(r.value)); });
  show();
  return h('div', { class: 'fs-row' },
    h('span', { class: 'fs-a small', 'aria-hidden': 'true' }, 'A'),
    r,
    h('span', { class: 'fs-a big', 'aria-hidden': 'true' }, 'A'),
    out,
    h('button', { class: 'btn small', onclick: () => { r.value = '1'; show(); onChange(1); } }, 'Reset'),
  );
}

/**
 * Theme tiles (the outlined transparent ones are tiles of their own) and the drop-shadow switch.
 * onChange({ theme?, shadow? }). A retired theme a widget already uses is shown too, so it can stay.
 */
export function themePicker({ theme = 'light', shadow = false }, onChange) {
  let cur = (THEMES.find((t) => t.id === theme) || THEMES[0]).id;
  const offered = THEMES.filter((t) => !t.retired || t.id === cur);
  const tiles = offered.map((t) => h('button', {
    class: `theme-tile${t.id === cur ? ' on' : ''}`,
    'aria-pressed': String(t.id === cur),
    title: t.label,
    onclick: () => {
      cur = t.id;
      tiles.forEach((x, i) => { const on = offered[i].id === cur; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      onChange({ theme: cur });
    },
  },
    h('span', { class: `theme-swatch ts-${t.base || t.id}${t.boxed ? ' ts-boxed' : ''}`, style: { '--sw': t.swatch } }, h('b', { style: { color: t.ink || (t.id === 'dark' ? '#fff' : '#1d1d1f') } }, 'Aa')),
    h('small', {}, t.retired ? `${t.label} (older)` : t.label),
  ));
  const sh = h('input', { type: 'checkbox', checked: shadow, onchange: () => onChange({ shadow: sh.checked }) });
  return h('div', { class: 'theme-picker' },
    h('div', { class: 'theme-tiles' }, ...tiles),
    h('label', { class: 'check' }, sh, h('span', {}, 'Drop shadow on words and pictures (helps them stand out on busy backgrounds)')),
  );
}
