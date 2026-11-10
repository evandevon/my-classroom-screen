import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.js';

// Makes an MP4 by drawing each frame and encoding it directly (WebCodecs), instead of
// playing in real time and screen-recording. It runs faster than real time and keeps
// going even when this tab is in the background.

/** A breather for the page that background tabs don't slow down (unlike setTimeout). */
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.420028', 'avc1.42001f'];

export const canEncodeOffline = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

async function pickVideo(width, height, fps) {
  for (const codec of VIDEO_CODECS) {
    const cfg = { codec, width, height, bitrate: 3_000_000, framerate: fps, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* try next */ }
  }
  return null;
}
async function pickAudio(sampleRate, numberOfChannels) {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate, numberOfChannels, bitrate: 128_000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch { /* try next */ }
  }
  return null;
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas  drawn by paint(timeMs) before each frame
 * @param {(ms:number)=>void} o.paint
 * @param {number} o.durationMs
 * @param {AudioBuffer} [o.audio]  voice to add (played from 0)
 * @returns {Promise<Blob|null>} null if this browser can't do it (caller falls back)
 */
export async function encodeMP4({ canvas, paint, durationMs, fps = 30, audio = null, onProgress = () => {}, cancelled = () => false }) {
  if (!canEncodeOffline()) return null;
  const { width, height } = canvas;
  const vcfg = await pickVideo(width, height, fps);
  if (!vcfg) return null;
  let acfg = audio ? await pickAudio(audio.sampleRate, Math.min(2, audio.numberOfChannels)) : null;
  if (audio && !acfg && audio.sampleRate !== 48000) {
    audio = await resample(audio, 48000);
    acfg = await pickAudio(48000, Math.min(2, audio.numberOfChannels));
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(acfg ? { audio: { codec: acfg.mux, sampleRate: acfg.cfg.sampleRate, numberOfChannels: acfg.cfg.numberOfChannels } } : {}),
  });
  let failed = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  venc.configure(vcfg);

  const frames = Math.max(1, Math.ceil((durationMs / 1000) * fps) + Math.round(fps / 2)); // + half a second at the end
  for (let i = 0; i < frames; i++) {
    if (cancelled() || failed) break;
    const ms = Math.min(durationMs, (i * 1000) / fps);
    paint(ms);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (venc.encodeQueueSize > 8) await new Promise((r) => venc.addEventListener('dequeue', r, { once: true }));
    if (i % 15 === 0) { onProgress(ms / durationMs); await yieldNow(); }
  }
  await venc.flush();
  venc.close();

  if (acfg && !cancelled() && !failed) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failed = e; } });
    aenc.configure(acfg.cfg);
    const ch = acfg.cfg.numberOfChannels;
    const rate = acfg.cfg.sampleRate;
    const total = Math.min(audio.length, Math.ceil(((durationMs + 500) / 1000) * rate));
    const block = 4800;
    for (let start = 0; start < total; start += block) {
      const n = Math.min(block, total - start);
      const data = new Float32Array(n * ch); // planar
      for (let c = 0; c < ch; c++) data.set(audio.getChannelData(Math.min(c, audio.numberOfChannels - 1)).subarray(start, start + n), c * n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((start / rate) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }
  if (cancelled()) return 'cancelled';
  if (failed) { console.warn('video encode', failed); return null; }
  muxer.finalize();
  onProgress(1);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function resample(buf, rate) {
  const off = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

/** Decode a recorded sound (e.g. the whiteboard voice) for encodeMP4. */
export async function decodeAudio(blob) {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}
