// A clock that keeps ticking when this tab is in the background.
//
// Browsers pause requestAnimationFrame in hidden tabs and slow setInterval down (to once a
// minute after a few minutes). Timers inside a Web Worker are not slowed the same way, so a
// small worker sends us a "tick" a few times a second. Falls back to setInterval if workers
// are unavailable.

const listeners = new Set();
let started = false;

function emit() {
  const now = Date.now();
  for (const fn of listeners) {
    try {
      fn(now);
    } catch (e) {
      console.error(e);
    }
  }
}

function start() {
  if (started) return;
  started = true;
  try {
    const code = 'setInterval(() => postMessage(0), 250);';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = emit;
    w.onerror = () => setInterval(emit, 250);
  } catch {
    setInterval(emit, 250);
  }
}

/** Call fn(nowMs) about four times a second, even in a background tab. Returns unsubscribe. */
export function onTick(fn) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
