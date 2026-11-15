// ☰ → 📸 Save a picture of the screen (JPG or PDF).
// A page can't draw live videos, web pages and other sites' pictures into an image itself,
// so this uses the browser's own tab capture: it asks once ("Share this tab?"), grabs one
// frame with the menu and widget bar hidden, and stops. Nothing leaves the computer.

import { h, downloadBlob, toast } from './util.js';

const supported = () => !!navigator.mediaDevices?.getDisplayMedia;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One frame of the current tab, with the app's own buttons hidden. */
async function captureTab() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 30 },
    audio: false,
    preferCurrentTab: true,          // Chrome/Edge: offers just this tab
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    monitorTypeSurfaces: 'exclude',
  });
  const track = stream.getVideoTracks()[0];
  document.body.classList.add('capturing');
  try {
    await nextFrame();
    await wait(450);                 // the browser's "sharing" bar can resize the page; let it settle
    const video = h('video', { muted: true, playsinline: true });
    video.srcObject = stream;
    await video.play();
    await nextFrame();
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    video.srcObject = null;
    return c;
  } finally {
    document.body.classList.remove('capturing');
    track.stop();
  }
}

/** A one-page PDF holding a JPEG, sized to the picture (no library needed). */
function jpegToPDF(jpeg, w, h) {
  const enc = new TextEncoder();
  const pw = 842;                                  // A4 width in points, landscape-ish page
  const ph = Math.round((pw * h) / w);
  const parts = [];
  const offsets = [];
  let len = 0;
  const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; add(`${n} 0 obj\n`); body(); add('\nendobj\n'); };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { add(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); add(jpeg); add('\nendstream'); });
  const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, () => add(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  const xref = len;
  add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
};
const safeName = (s) => (s || 'Screen').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);

export async function saveScreenshot(format, screenName) {
  if (!supported()) {
    toast('This browser can’t take the picture itself. Use the computer’s screenshot keys instead (Windows: Win + Shift + S; Mac: Cmd + Shift + 4; Chromebook: Ctrl + Shift + Show windows).', { ms: 9000 });
    return;
  }
  let canvas;
  try {
    canvas = await captureTab();
  } catch (e) {
    if (e?.name === 'NotAllowedError') toast('No picture taken — choose “Share” (this tab) when the browser asks.');
    else { console.error(e); toast('The picture couldn’t be taken in this browser.'); }
    return;
  }
  const jpg = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const base = `${safeName(screenName)} ${stamp()}`;
  if (format === 'pdf') downloadBlob(jpegToPDF(new Uint8Array(await jpg.arrayBuffer()), canvas.width, canvas.height), `${base}.pdf`);
  else downloadBlob(jpg, `${base}.jpg`);
  toast('📸 Saved to your Downloads.');
}

/** The small dialog from the menu: JPG or PDF. */
export function screenshotDialog(screenName) {
  const go = (fmt) => { dlg.close(); setTimeout(() => saveScreenshot(fmt, screenName), 250); };
  const dlg = h('dialog', { class: 'modal shot-modal' },
    h('div', { class: 'modal-head' }, h('h2', {}, '📸 Save a picture of the screen'), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' },
      h('div', { class: 'row shot-choices' },
        h('button', { class: 'btn primary', onclick: () => go('jpg') }, '🖼 Picture (JPG)'),
        h('button', { class: 'btn primary', onclick: () => go('pdf') }, '📄 PDF'),
      ),
      h('p', { class: 'hint' }, supported()
        ? 'The browser will ask to share this tab — choose Share. It takes one picture (without the menu and widget bar) and stops straight away. Nothing is sent anywhere.'
        : 'This browser can’t take the picture itself — the computer’s screenshot keys work instead.'),
    ),
  );
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 300));
  document.body.append(dlg);
  dlg.showModal();
}
