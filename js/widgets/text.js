import { h, debounce } from '../util.js';
import { panel, select, swatches, field, sanitizeHtml, PALETTE } from './_common.js';

const FONTS = {
  sans: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  rounded: '"Nunito", "Arial Rounded MT Bold", "Varela Round", system-ui, sans-serif',
  school: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};

export default {
  type: 'text',
  title: 'Text',
  icon: '📝',
  group: 'core',
  size: [420, 240],
  hasSettings: true,
  defaultState: () => ({ html: '', size: 10, color: '#1d1d1f', bg: '#fff8c4', align: 'left', font: 'rounded' }),

  mount(ctx) {
    const s = ctx.state;
    const editor = h('div', {
      class: 'text-editor',
      contenteditable: 'true',
      spellcheck: 'true',
      'data-placeholder': 'Tap to type…',
      'aria-label': 'Text',
    });
    editor.innerHTML = sanitizeHtml(s.html);
    const save = debounce(() => {
      s.html = sanitizeHtml(editor.innerHTML);
      ctx.save();
    }, 400);
    editor.addEventListener('input', save);
    editor.addEventListener('paste', (e) => {
      // Paste as plain text so formatting from other sites doesn't come along.
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });

    const fmtBtn = (label, cmd, title) =>
      h('button', {
        class: 'btn small',
        title,
        'aria-label': title,
        onpointerdown: (e) => e.preventDefault(), // keep focus in editor
        onclick: () => { document.execCommand(cmd); save(); },
      }, label);
    const sizeBtn = (label, delta, title) =>
      h('button', {
        class: 'btn small', title, 'aria-label': title,
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => { s.size = Math.min(40, Math.max(3, s.size + delta)); apply(); ctx.save(); },
      }, label);

    const toolbar = h('div', { class: 'text-toolbar' },
      fmtBtn(h('b', {}, 'B'), 'bold', 'Bold'),
      fmtBtn(h('i', {}, 'I'), 'italic', 'Italic'),
      fmtBtn(h('u', {}, 'U'), 'underline', 'Underline'),
      fmtBtn('•', 'insertUnorderedList', 'Bullet list'),
      fmtBtn('1.', 'insertOrderedList', 'Numbered list'),
      sizeBtn('A−', -1, 'Smaller text'),
      sizeBtn('A+', 1, 'Bigger text'),
    );

    ctx.view.append(h('div', { class: 'text-wrap' }, editor, toolbar));

    function apply() {
      editor.style.fontSize = `${s.size}cqmin`;
      editor.style.color = s.color;
      editor.style.textAlign = s.align;
      editor.style.fontFamily = FONTS[s.font] || FONTS.sans;
      ctx.view.style.background = s.bg;
    }
    apply();

    return {
      destroy: () => save.flush(),
      openSettings() {
        const upd = (fn) => (v) => { fn(v); apply(); ctx.save(); };
        panel(ctx, 'Text settings',
          field('Font', select([['rounded', 'Rounded'], ['sans', 'Clean'], ['school', 'Handwriting'], ['serif', 'Serif'], ['mono', 'Typewriter']], s.font, upd((v) => (s.font = v)))),
          field('Align', select([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], s.align, upd((v) => (s.align = v)))),
          field('Text colour', swatches(['#1d1d1f', '#ffffff', ...PALETTE], s.color, upd((v) => (s.color = v)))),
          field('Background', swatches(['#ffffff', '#fff8c4', '#d8f3dc', '#cde7ff', '#ffd6e0', '#1d1d1f', 'transparent'], s.bg, upd((v) => (s.bg = v)))),
        );
      },
    };
  },
};
