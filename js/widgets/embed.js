import { h } from '../util.js';
import { panel, textInput, field } from './_common.js';

/** Turn a normal share/watch link into an embeddable URL. Returns null for unsafe links. */
export function toEmbedURL(raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');

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
    const start = t ? parseInt(String(t).replace(/s$/, ''), 10) || 0 : 0;
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (start) params.set('start', start);
    if (id) {
      if (list) params.set('list', list);
      return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
    }
    if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`;
  }

  // Google Drive files (video, audio, PDF, images)
  if (host === 'drive.google.com') {
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
  defaultState: () => ({ url: '' }),

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
    urlIn.addEventListener('keydown', (e) => e.key === 'Enter' && setURL(urlIn.value));
    ctx.view.append(h('div', { class: 'embed' }, empty, frameHost));

    function setURL(v) {
      s.url = v.trim();
      ctx.save();
      render();
    }
    function render() {
      const src = s.url ? toEmbedURL(s.url) : null;
      empty.hidden = !!src;
      frameHost.hidden = !src;
      err.hidden = !(s.url && !src);
      if (!src) {
        frameHost.replaceChildren();
        return;
      }
      if (frameHost.firstChild?.src === src) return;
      frameHost.replaceChildren(
        h('iframe', {
          src,
          title: 'Embedded content',
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write',
          allowfullscreen: true,
          referrerpolicy: 'strict-origin-when-cross-origin',
          loading: 'lazy',
        }),
      );
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Video / web settings',
          field('Link', textInput(s.url, (v) => { s.url = v.trim(); ctx.save(); }, { placeholder: 'https://…' })),
          h('p', { class: 'hint' }, 'Google Drive files must be shared as “Anyone with the link”. Some websites refuse to be shown inside other sites — if it stays blank, that site blocks embedding.'),
          h('button', { class: 'btn', onclick: () => s.url && window.open(s.url, '_blank', 'noopener') }, 'Open link in new tab'),
        );
      },
      closeSettings: render,
    };
  },
};
