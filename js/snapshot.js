// A small picture of one widget, for ⭐ My widgets. Drawn by the page itself (no "share this tab?"
// prompt): the widget is copied with its styles into an SVG, then onto a canvas as a JPG.
// Live video, web pages and cameras can't be drawn this way, so those parts become a plain panel
// with an icon. If anything goes wrong the caller just shows the widget's icon instead.

const SKIP = new Set(['transition', 'animation', 'cursor', 'pointer-events', 'will-change', 'user-select', '-webkit-user-select']);

function copyStyles(from, to) {
  const cs = getComputedStyle(from);
  let css = '';
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    if (SKIP.has(p) || p.startsWith('transition') || p.startsWith('animation')) continue;
    css += `${p}:${cs.getPropertyValue(p)};`;
  }
  to.setAttribute('style', css);
}

/** Copy el with every element's computed style inlined; canvases become pictures. */
function cloneStyled(el) {
  const copy = el.cloneNode(false);
  if (el.nodeType !== 1) return copy;
  const tag = el.tagName;
  if (tag === 'CANVAS') {
    const img = document.createElement('img');
    try { img.src = el.toDataURL('image/png'); } catch { /* tainted: leave it blank */ }
    copyStyles(el, img);
    return img;
  }
  if (tag === 'VIDEO' || tag === 'IFRAME' || tag === 'AUDIO' || tag === 'OBJECT' || tag === 'EMBED') {
    const box = document.createElement('div');
    copyStyles(el, box);
    box.style.background = '#e9edf5';
    box.style.display = 'grid';
    box.style.placeItems = 'center';
    box.style.fontSize = '40px';
    box.textContent = tag === 'AUDIO' ? '' : '▶';
    return box;
  }
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') return document.createComment('');
  copyStyles(el, copy);
  if (tag === 'INPUT') {
    if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) copy.setAttribute('checked', ''); }
    else copy.setAttribute('value', el.value);
  }
  if (tag === 'TEXTAREA') copy.textContent = el.value;
  if (tag === 'SELECT') {
    // a select's chosen option: rebuilt below with its children
  }
  for (const child of el.childNodes) copy.append(cloneStyled(child));
  if (tag === 'SELECT') [...copy.options].forEach((o, i) => { if (i === el.selectedIndex) o.setAttribute('selected', ''); });
  return copy;
}

/** Pictures inside the widget (blob: or same-site) are turned into data so the SVG can show them. */
async function inlineImages(root) {
  const imgs = [...root.querySelectorAll('img')].filter((img) => img.src && !img.src.startsWith('data:'));
  await Promise.all(imgs.map(async (img) => {
    try {
      const u = new URL(img.src, location.href);
      if (u.protocol !== 'blob:' && u.origin !== location.origin) { img.removeAttribute('src'); return; }
      const blob = await (await fetch(img.src)).blob();
      img.src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    } catch { img.removeAttribute('src'); }
  }));
  // background-image: url(blob:…) (e.g. picture widgets drawn as backgrounds) — drop ones we can't inline
  for (const e of root.querySelectorAll('[style*="url("]')) {
    const bg = e.style.backgroundImage;
    const m = bg && bg.match(/url\("?(blob:[^")]+)"?\)/);
    if (!m) continue;
    try {
      const blob = await (await fetch(m[1])).blob();
      const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      e.style.backgroundImage = `url("${data}")`;
    } catch { e.style.backgroundImage = 'none'; }
  }
}

/** A JPG data URL of the widget, at most `max` pixels wide or high. */
export async function snapshotWidget(el, max = 360) {
  const r = el.getBoundingClientRect();
  // The picture is the widget's contents: its title bar and resize corner are left out.
  const headH = el.querySelector(':scope > .w-head')?.getBoundingClientRect().height || 0;
  const w = Math.max(1, Math.round(r.width));
  const hh = Math.max(1, Math.round(r.height - headH));
  const copy = cloneStyled(el);
  copy.querySelectorAll(':scope > .w-head, :scope > .w-resize').forEach((e) => e.remove());
  Object.assign(copy.style, { position: 'static', left: '0', top: '0', margin: '0', transform: 'none', width: `${w}px`, height: `${hh}px`, boxShadow: 'none' });
  copy.classList.remove('active', 'settings-open');
  await inlineImages(copy);
  const holder = document.createElement('div');
  holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  holder.append(copy);
  const xml = new XMLSerializer().serializeToString(holder);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const scale = Math.min(1, max / Math.max(w, hh)) * Math.min(2, devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hh * scale);
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
