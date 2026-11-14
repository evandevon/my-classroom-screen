// Files that come with the site (backgrounds/, sounds/), listed by an index.json that a
// GitHub Action keeps up to date. `v` is a fingerprint of each file: it goes in the address,
// so a file replaced with the same name isn't served from the browser's old copy.
const lists = new Map();

export function libFileURL(folder, file, v) {
  const u = new URL(`${folder}/${file.split('/').map(encodeURIComponent).join('/')}`, document.baseURI);
  if (v) u.searchParams.set('v', v);
  return u.href;
}

export function loadLib(folder) {
  if (!lists.has(folder)) {
    lists.set(folder, fetch(new URL(`${folder}/index.json`, document.baseURI), { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => d.items || [])
      .catch(() => []));
  }
  return lists.get(folder);
}

/** A seamless, gap-free loop (HTML <audio> leaves a little gap at each repeat). Fades in and out. */
export class GaplessPlayer {
  constructor(onChange) {
    this.onChange = onChange;
    this.buffer = null; this.src = null; this.node = null;
    this.volume = 0.8; this.loop = true; this.paused = true; this.offset = 0; this.startedAt = 0;
  }
  ctx() {
    if (!this.ac) {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ac.createGain(); this.gain.gain.value = 0; this.gain.connect(this.ac.destination);
    }
    return this.ac;
  }
  async load(url) {
    if (url === this.src) return;
    this.stop(true);
    this.src = url; this.buffer = null; this.offset = 0;
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    if (url !== this.src) return;
    this.buffer = await this.ctx().decodeAudioData(data);
    this.onChange?.();
  }
  get duration() { return this.buffer?.duration || 0; }
  get currentTime() {
    if (!this.buffer) return 0;
    const t = this.paused ? this.offset : this.offset + (this.ac.currentTime - this.startedAt);
    return this.loop ? t % this.buffer.duration : Math.min(t, this.buffer.duration);
  }
  async play() {
    if (!this.buffer || !this.paused) return;
    const ac = this.ctx();
    await ac.resume().catch(() => {});
    const n = ac.createBufferSource();
    n.buffer = this.buffer; n.loop = this.loop; n.connect(this.gain);
    n.onended = () => { if (this.node === n && !this.loop) { this.node = null; this.paused = true; this.offset = 0; this.onChange?.(); } };
    const g = this.gain.gain, now = ac.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(0, now); g.linearRampToValueAtTime(this.volume, now + 1.5);   // gentle fade in
    n.start(0, this.offset % this.buffer.duration);
    this.node = n; this.startedAt = now; this.paused = false;
    this.onChange?.();
  }
  pause() {
    if (this.paused) return;
    this.offset = this.currentTime;
    this.stop(false);
    this.onChange?.();
  }
  stop(now) {
    const n = this.node; this.node = null; this.paused = true;
    if (!n) return;
    const g = this.gain.gain, t = this.ac.currentTime, fade = now ? 0.02 : 0.8;   // gentle fade out
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    try { n.stop(t + fade + 0.02); } catch {}
  }
  setVolume(v) {
    this.volume = v;
    if (this.ac && !this.paused) { const g = this.gain.gain, t = this.ac.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(v, t, 0.05); }
  }
  setLoop(on) { this.loop = on; if (this.node) this.node.loop = on; }
  destroy() { this.stop(true); this.ac?.close().catch(() => {}); this.ac = null; }
}
