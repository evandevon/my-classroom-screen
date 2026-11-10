// Web Audio sound effects — no audio files needed, works offline.
//
// Browsers only allow sound after the user has touched the page. We create and "unlock"
// one shared AudioContext on the first tap/click/key press, so sounds triggered later by
// timers, alarms or the noise meter (which are not user gestures) play reliably.

let ctx = null;
let master = null;
let volume = 0.9;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = volume;
    // A gentle compressor lets sounds be loud without distorting.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    ctx.addEventListener?.('statechange', notify);
  }
  return ctx;
}

const listeners = new Set();
function notify() {
  for (const fn of listeners) fn(audioReady());
}
/** Subscribe to changes in whether sound is allowed. Returns an unsubscribe function. */
export function onAudioState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const audioReady = () => !!ctx && ctx.state === 'running';

/** Call from inside any user gesture. Safe to call many times. */
export function unlockAudio() {
  const a = ac();
  if (!a) return;
  if (a.state !== 'running') a.resume().then(notify, () => {});
  // Playing a silent buffer finishes the unlock on iOS/Safari.
  try {
    const b = a.createBuffer(1, 1, 22050);
    const s = a.createBufferSource();
    s.buffer = b;
    s.connect(a.destination);
    s.start(0);
  } catch { /* ignore */ }
  notify();
}

// Unlock on the first interaction anywhere, and again whenever the tab comes back.
for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
});

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}
export const getVolume = () => volume;

/** One note. opts: type, gain, to (glide to frequency), attack */
function tone(freq, start, dur, { type = 'sine', gain = 0.3, to, attack = 0.01 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + 0.03 + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A bell-like strike made of a few inharmonic partials. */
function strike(freq, start, dur = 1.6, gain = 0.25) {
  tone(freq, start, dur, { type: 'sine', gain });
  tone(freq * 2.76, start, dur * 0.5, { type: 'sine', gain: gain * 0.4 });
  tone(freq * 5.4, start, dur * 0.25, { type: 'sine', gain: gain * 0.2 });
}

const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.5, G6: 1567.98, G4: 392, A4: 440, C4: 261.63, E4: 329.63 };

// group: 'short' sounds are good for feedback; 'alarm' sounds are attention-getters.
export const SOUNDS = {
  none: { label: 'No sound', group: 'alarm', play() {} },
  chime: { label: 'Chime', group: 'alarm', play: () => [N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.18, 1, { type: 'triangle', gain: 0.35 })) },
  bell: {
    label: 'School bell',
    group: 'alarm',
    play() { for (let i = 0; i < 16; i++) tone(i % 2 ? 1180 : 1250, i * 0.07, 0.09, { type: 'square', gain: 0.16 }); },
  },
  alarmclock: {
    label: 'Alarm clock',
    group: 'alarm',
    play() { for (let g = 0; g < 3; g++) for (let i = 0; i < 4; i++) tone(2000, g * 0.6 + i * 0.1, 0.06, { type: 'square', gain: 0.14 }); },
  },
  beep: { label: 'Beep beep', group: 'alarm', play: () => { tone(880, 0, 0.18, { type: 'square', gain: 0.2 }); tone(880, 0.25, 0.18, { type: 'square', gain: 0.2 }); } },
  fanfare: {
    label: 'Fanfare',
    group: 'alarm',
    play: () => [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.15, i === 5 ? 0.8 : 0.16, { type: 'sawtooth', gain: 0.14 })),
  },
  marimba: {
    label: 'Marimba',
    group: 'alarm',
    play: () => [N.C5, N.E5, N.G5, N.A5, N.G5, N.E5, N.C6].forEach((f, i) => { tone(f, i * 0.14, 0.35, { gain: 0.4, attack: 0.005 }); tone(f * 4, i * 0.14, 0.08, { gain: 0.08, attack: 0.005 }); }),
  },
  xylophone: {
    label: 'Xylophone run',
    group: 'alarm',
    play: () => [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6, N.G6].forEach((f, i) => tone(f, i * 0.07, 0.4, { type: 'triangle', gain: 0.3, attack: 0.003 })),
  },
  harp: {
    label: 'Harp',
    group: 'alarm',
    play: () => [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => tone(f, i * 0.06, 1.4, { type: 'triangle', gain: 0.2, attack: 0.004 })),
  },
  gong: { label: 'Gong', group: 'alarm', play: () => { strike(110, 0, 3.5, 0.45); strike(165, 0.02, 2.5, 0.2); } },
  churchbell: { label: 'Tower bells', group: 'alarm', play: () => [N.G4, N.E4, N.C4 * 1.5, N.C4].forEach((f, i) => strike(f, i * 0.55, 1.8, 0.3)) },
  cuckoo: { label: 'Cuckoo', group: 'alarm', play: () => { for (let i = 0; i < 3; i++) { tone(N.E5 * 1.25, i * 0.7, 0.2, { gain: 0.35 }); tone(N.C5 * 1.25, i * 0.7 + 0.22, 0.3, { gain: 0.35 }); } } },
  siren: { label: 'Gentle siren', group: 'alarm', play: () => { tone(600, 0, 0.7, { type: 'triangle', to: 1000, gain: 0.25 }); tone(1000, 0.7, 0.7, { type: 'triangle', to: 600, gain: 0.25 }); tone(600, 1.4, 0.7, { type: 'triangle', to: 1000, gain: 0.25 }); } },
  whistle: { label: 'Whistle', group: 'alarm', play: () => { tone(2200, 0, 0.25, { gain: 0.25, to: 2600 }); tone(2200, 0.35, 0.6, { gain: 0.25, to: 2500 }); } },
  tidyup: {
    label: 'Tidy-up tune',
    group: 'alarm',
    play: () => [[N.G5, 0.2], [N.E5, 0.2], [N.G5, 0.2], [N.E5, 0.2], [N.F5, 0.2], [N.D5, 0.2], [N.C5, 0.5]].reduce((t, [f, d]) => { tone(f, t, d + 0.1, { type: 'triangle', gain: 0.35 }); return t + d; }, 0),
  },
  gentle: { label: 'Gentle', group: 'alarm', play: () => { tone(N.C5, 0, 1.4, { gain: 0.3 }); tone(N.G5, 0.4, 1.6, { gain: 0.22 }); } },
  ding: { label: 'Ding', group: 'alarm', play: () => strike(N.E6, 0, 1, 0.3) },
  // short feedback sounds (not listed in alarm menus)
  tick: { label: 'Tick', group: 'short', play: () => tone(1500, 0, 0.04, { type: 'square', gain: 0.07 }) },
  pop: { label: 'Pop', group: 'short', play: () => tone(500, 0, 0.09, { gain: 0.35, to: 900 }) },
};

/** Durations (seconds) so alarms can repeat without overlapping. */
export const SOUND_LENGTH = { bell: 1.2, alarmclock: 1.6, siren: 2.2, churchbell: 3.2, gong: 3, cuckoo: 2.2, tidyup: 1.8, harp: 2, marimba: 1.4, xylophone: 1.2, fanfare: 1.6, chime: 1.4, beep: 0.6, whistle: 1.1, gentle: 2, ding: 1 };

export function play(name) {
  try {
    if (!ctx) ac();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    SOUNDS[name]?.play();
  } catch (e) {
    console.warn('sound failed', e);
  }
}

/** Play a sound several times in a row. Returns a stop() function. */
export function playRepeated(name, times = 3) {
  let n = 0;
  let timer;
  const gap = ((SOUND_LENGTH[name] || 1.2) + 0.5) * 1000;
  const step = () => {
    play(name);
    if (++n < times) timer = setTimeout(step, gap);
  };
  step();
  return () => clearTimeout(timer);
}

/** A <select> of alarm sounds with a ▶ test button. */
export function soundSelect(value, onChange, { allowNone = true } = {}) {
  const sel = document.createElement('select');
  for (const [k, v] of Object.entries(SOUNDS)) {
    if (v.group !== 'alarm' || (!allowNone && k === 'none')) continue;
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v.label;
    if (k === value) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    onChange(sel.value);
    play(sel.value);
  });
  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'btn small';
  test.textContent = '▶';
  test.title = 'Test sound';
  test.setAttribute('aria-label', 'Test sound');
  test.addEventListener('click', (e) => {
    e.preventDefault();
    play(sel.value);
  });
  const wrap = document.createElement('div');
  wrap.className = 'sound-pick';
  wrap.append(sel, test);
  return wrap;
}

/** Small "tap to turn sound on" notice that disappears once audio is allowed. */
export function soundNotice() {
  const b = document.createElement('button');
  b.className = 'sound-notice';
  b.textContent = '🔇 Tap here to turn sound on';
  const upd = (ok) => (b.hidden = ok);
  b.addEventListener('click', () => unlockAudio());
  upd(audioReady());
  const off = onAudioState(upd);
  b.cleanup = off;
  return b;
}
