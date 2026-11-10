// Web Audio sound effects — no audio files needed, works offline.

let ctx;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.25 } = {}) {
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

export const SOUNDS = {
  none: { label: 'No sound', play() {} },
  chime: {
    label: 'Chime',
    play() {
      [659, 784, 1047].forEach((f, i) => tone(f, i * 0.18, 0.9, { type: 'triangle' }));
    },
  },
  bell: {
    label: 'School bell',
    play() {
      for (let i = 0; i < 8; i++) tone(i % 2 ? 1180 : 1250, i * 0.12, 0.14, { type: 'square', gain: 0.12 });
    },
  },
  fanfare: {
    label: 'Fanfare',
    play() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.15, i === 5 ? 0.8 : 0.16, { type: 'sawtooth', gain: 0.12 }),
      );
    },
  },
  gentle: {
    label: 'Gentle',
    play() {
      tone(523, 0, 1.4, { gain: 0.2 });
      tone(784, 0.4, 1.6, { gain: 0.15 });
    },
  },
  beep: { label: 'Beep', play: () => tone(880, 0, 0.15, { type: 'square', gain: 0.15 }) },
  tick: { label: 'Tick', play: () => tone(1500, 0, 0.04, { type: 'square', gain: 0.08 }) },
  pop: { label: 'Pop', play: () => tone(600, 0, 0.08, { type: 'sine', gain: 0.3 }) },
  ding: { label: 'Ding', play: () => tone(1320, 0, 0.6, { type: 'triangle', gain: 0.25 }) },
};

export function play(name) {
  try {
    SOUNDS[name]?.play();
  } catch (e) {
    /* audio not available */
  }
}

export function soundSelect(value, onChange) {
  const sel = document.createElement('select');
  for (const [k, v] of Object.entries(SOUNDS)) {
    if (k === 'tick' || k === 'pop') continue;
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
  return sel;
}
