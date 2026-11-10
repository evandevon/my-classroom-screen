// Small shared helpers used across the app and widgets.

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Tiny DOM builder.
 * h('button', { class: 'btn', onclick: fn, 'aria-label': 'Go' }, 'Go')
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function debounce(fn, ms = 300) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return d;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const parseLines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** A labelled form row for widget settings panels. */
export function field(label, input) {
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

export function toast(message, { action, onAction, ms = 5000 } = {}) {
  const host = document.getElementById('toasts');
  const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  if (action) {
    t.append(
      h('button', {
        class: 'btn small',
        onclick: () => {
          onAction?.();
          t.remove();
        },
      }, action),
    );
  }
  host.append(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(dataURL) {
  const r = await fetch(dataURL);
  return r.blob();
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(input.files[0] || null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
