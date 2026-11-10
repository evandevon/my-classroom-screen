import { h } from '../util.js';
import { panel, textInput, field, checkbox } from './_common.js';

/** Accept links typed without https:// (e.g. "youtube.com/watch?v=…" or "www.abc.net.au"). */
export function normaliseURL(raw) {
  let t = String(raw || '').trim();
  if (!t) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t.replace(/^\/+/, '')}`;
  try {
    const u = new URL(t);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

// Sites that refuse to be shown inside another page (they send X-Frame-Options / CSP).
// For these we skip the blank frame and offer a pop-up window straight away.
const NO_FRAME = [
  [/^(www\.)?google\.[a-z.]+$/, 'Google Search'],
  [/^mail\.google\.com$/, 'Gmail'],
  [/^classroom\.google\.com$/, 'Google Classroom'],
  [/^(www\.)?(facebook|instagram|linkedin|tiktok|reddit|x|twitter)\.com$/, 'This social media site'],
  [/^(www\.)?(kahoot\.it|kahoot\.com|blooket\.com|gimkit\.com)$/, 'This quiz site'],
  [/^(www\.)?(sentral\.com\.au|education\.nsw\.gov\.au)$/, 'This site'],
];
export function blockedSite(raw) {
  const u = normaliseURL(raw);
  if (!u) return null;
  const host = u.hostname;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host) && !toEmbedURL(raw)?.includes('/embed')) return 'YouTube pages other than a single video or playlist';
  if (host === 'drive.google.com' && !toEmbedURL(raw)?.match(/\/preview|embeddedfolderview/)) return 'This Google Drive page';
  for (const [re, name] of NO_FRAME) if (re.test(host)) return name;
  return null;
}

/** Turn a normal share/watch link into an embeddable URL. Returns null for unsafe links. */
export function toEmbedURL(raw, { privacy = false } = {}) {
  const u = normaliseURL(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  // The standard player is the one school web filters allow; the "no cookie" one is optional.
  const yt = privacy ? 'https://www.youtube-nocookie.com/embed/' : 'https://www.youtube.com/embed/';

  // YouTube
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/watch')) id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/);
      if (m) id = m[1];
    }
    const list = u.searchParams.get('list');
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    // t=90, t=90s, t=1m30s, t=1h2m3s
    let start = 0;
    if (t) {
      const parts = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      start = parts ? (Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0)) : parseInt(t, 10) || 0;
    }
    const params = new URLSearchParams({ rel: '0', playsinline: '1' });
    if (start) params.set('start', start);
    if (location.origin.startsWith('http')) params.set('origin', location.origin);
    if (id) {
      if (list) params.set('list', list);
      return `${yt}${id}?${params}`;
    }
    if (list) return `${yt}videoseries?list=${list}`;
  }

  // Google Drive files (video, audio, PDF, images) and folders
  if (host === 'drive.google.com') {
    const folder = u.pathname.match(/\/folders\/([\w-]+)/);
    if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#grid`;
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/) || [null, u.searchParams.get('id')];
    if (m[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
  }

  // Google Docs / Slides / Sheets / Forms
  if (host === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|presentation|spreadsheets|forms)\/d\/(e\/)?([\w-]+)/);
    if (m) {
      const [, kind, pub, id] = m;
      if (kind === 'presentation') return `https://docs.google.com/presentation/d/${pub || ''}${id}/embed?start=false&loop=false`;
      if (kind === 'forms') return `https://docs.google.com/forms/d/${pub || ''}${id}/viewform?embedded=true`;
      return `https://docs.google.com/${kind}/d/${pub || ''}${id}/preview`;
    }
  }

  // Vimeo
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }

  // Canva designs
  if (host === 'canva.com' && u.pathname.includes('/design/')) {
    const base = u.pathname.replace(/\/(view|edit|watch).*$/, '');
    return `https://www.canva.com${base}/view?embed`;
  }

  // Spotify
  if (host === 'open.spotify.com' && !u.pathname.startsWith('/embed')) {
    return `https://open.spotify.com/embed${u.pathname}`;
  }

  return u.href;
}

export default {
  type: 'embed',
  title: 'Video / Web',
  icon: '🎬',
  group: 'core',
  size: [560, 360],
  hasSettings: true,
  defaultState: () => ({ url: '', privacy: false }),

  mount(ctx) {
    const s = ctx.state;
    const frameHost = h('div', { class: 'embed-host' });
    const urlIn = h('input', { type: 'url', placeholder: 'Paste a YouTube, Google Drive, Slides or web link', 'aria-label': 'Link' });
    const err = h('p', { class: 'error', hidden: true }, 'That link could not be used.');
    const empty = h('div', { class: 'empty' },
      err,
      h('p', {}, 'Show a video or web page'),
      h('div', { class: 'row stretch' }, urlIn, h('button', { class: 'btn primary', onclick: () => setURL(urlIn.value) }, 'Show')),
      h('p', { class: 'hint' }, 'YouTube · Google Drive · Slides · Docs · Vimeo · Canva · Spotify · most websites'),
    );
    const blockedCard = h('div', { class: 'empty embed-blocked', hidden: true });
    const bar = h('div', { class: 'embed-bar' },
      h('span', { class: 'hint' }, 'Blank, or “refused to connect”? That site blocks being shown here →'),
      h('button', { class: 'btn small', onclick: () => popup() }, '↗ Pop-up window'),
      h('button', { class: 'btn small', onclick: () => newTab() }, '⧉ New tab'),
      h('button', { class: 'btn small', 'aria-label': 'Reload', title: 'Reload', onclick: () => { frameHost.replaceChildren(); render(); } }, '⟳'),
    );
    urlIn.addEventListener('keydown', (e) => e.key === 'Enter' && setURL(urlIn.value));
    ctx.view.append(h('div', { class: 'embed' }, empty, blockedCard, frameHost, bar));

    const pageURL = () => normaliseURL(s.url)?.href;
    function newTab() {
      const u = pageURL();
      if (u) window.open(u, '_blank', 'noopener');
    }
    /** Open the page in its own small window that can sit over the board. */
    function popup() {
      const u = pageURL();
      if (!u) return;
      const w = Math.round(Math.min(1200, screen.availWidth * 0.65));
      const hh = Math.round(Math.min(860, screen.availHeight * 0.7));
      const left = Math.round((screen.availWidth - w) / 2);
      const top = Math.round((screen.availHeight - hh) / 2);
      const win = window.open(u, 'mcs-popup', `popup=yes,width=${w},height=${hh},left=${left},top=${top}`);
      if (!win) window.open(u, '_blank', 'noopener'); // pop-ups blocked: fall back to a tab
    }

    function setURL(v) {
      s.url = v.trim();
      ctx.save();
      render();
    }
    function render() {
      const blocked = s.url ? blockedSite(s.url) : null;
      const src = s.url && !blocked ? toEmbedURL(s.url, { privacy: s.privacy }) : null;
      empty.hidden = !!(src || blocked);
      blockedCard.hidden = !blocked;
      frameHost.hidden = !src;
      bar.hidden = !src;
      err.hidden = !(s.url && !src && !blocked);
      if (blocked) {
        const isYT = /youtu/.test(s.url);
        blockedCard.replaceChildren(
          h('p', {}, `🚫 ${blocked} can’t be shown inside another page.`),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: popup }, '↗ Open in a pop-up window'),
            h('button', { class: 'btn', onclick: newTab }, '⧉ New tab'),
            h('button', { class: 'btn', onclick: () => { s.url = ''; urlIn.value = ''; ctx.save(); render(); } }, 'Try another link'),
          ),
          h('p', { class: 'hint' }, isYT
            ? 'Tip: open the video itself and copy its link (youtube.com/watch?v=… or youtu.be/…) — single videos and playlists play right here.'
            : 'The pop-up window sits on top of your board and can be moved and resized.'),
        );
      }
      if (!src) {
        frameHost.replaceChildren();
        return;
      }
      if (frameHost.firstChild?.src === src) return;
      frameHost.replaceChildren(
        h('iframe', {
          src,
          title: 'Embedded content',
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share',
          allowfullscreen: true,
          referrerpolicy: 'strict-origin-when-cross-origin',
        }),
      );
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Video / web settings',
          field('Link', textInput(s.url, (v) => { s.url = v.trim(); ctx.save(); }, { placeholder: 'https://…' })),
          checkbox('YouTube privacy mode (youtube-nocookie.com — some school filters block it)', !!s.privacy, (v) => { s.privacy = v; ctx.save(); }),
          h('p', { class: 'hint' }, 'Google Drive, Docs and Slides files must be shared as “Anyone with the link”. Some websites (Google Search, Gmail, Kahoot, social media…) refuse to be shown inside other pages — use the pop-up window for those.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: popup }, '↗ Open in pop-up window'),
            h('button', { class: 'btn', onclick: newTab }, '⧉ Open in new tab'),
          ),
        );
      },
      closeSettings: render,
    };
  },
};
