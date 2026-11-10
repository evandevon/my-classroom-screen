import { h } from '../util.js';
import qrcode from '../vendor/qrcode.js';
import { panel, textInput, field } from './_common.js';

export function qrSVG(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 2; // quiet zone
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + q * 2} ${n + q * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export default {
  type: 'qrcode',
  title: 'QR code',
  icon: '🔳',
  group: 'extras',
  size: [320, 380],
  hasSettings: true,
  defaultState: () => ({ text: '', caption: '' }),

  mount(ctx) {
    const s = ctx.state;
    const code = h('div', { class: 'qr-code' });
    const cap = h('div', { class: 'qr-caption' });
    const input = h('input', { type: 'text', placeholder: 'Paste a link or type text', 'aria-label': 'QR text' });
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Make a QR code students can scan'),
      h('div', { class: 'row stretch' }, input, h('button', { class: 'btn primary', onclick: () => set(input.value) }, 'Make')),
    );
    input.addEventListener('keydown', (e) => e.key === 'Enter' && set(input.value));
    ctx.view.append(h('div', { class: 'qr' }, empty, code, cap));

    function set(v) {
      s.text = v.trim();
      ctx.save();
      render();
    }
    function render() {
      empty.hidden = !!s.text;
      code.hidden = !s.text;
      cap.textContent = s.caption || (s.text.length < 60 ? s.text : '');
      cap.hidden = !s.text;
      if (!s.text) return;
      try {
        code.innerHTML = qrSVG(s.text);
      } catch {
        code.textContent = 'Too much text for a QR code.';
      }
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'QR code',
          field('Link or text', textInput(s.text, (v) => { s.text = v.trim(); render(); ctx.save(); })),
          field('Caption (optional)', textInput(s.caption, (v) => { s.caption = v; render(); ctx.save(); })),
        );
      },
    };
  },
};
