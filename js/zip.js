// A small ZIP reader/writer (no libraries). Text is compressed with the browser's own
// deflate; photos, videos and sounds are already compressed, so they're stored as they are.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

async function streamThrough(bytes, transform) {
  const out = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const canDeflate = typeof CompressionStream !== 'undefined';

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * @param {{name: string, data: Blob|Uint8Array|string, compress?: boolean}[]} files
 * @returns {Promise<Blob>}
 */
export async function makeZip(files, type = 'application/zip') {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());
  for (const f of files) {
    const name = enc.encode(f.name);
    let raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(await f.data.arrayBuffer());
    const crc = crc32(raw);
    let body = raw;
    let method = 0;
    if (f.compress && canDeflate && raw.length > 256) {
      const z = await streamThrough(raw, new CompressionStream('deflate-raw'));
      if (z.length < raw.length) { body = z; method = 8; }
    }
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, body);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);
    offset += 30 + name.length + body.length;
    raw = null;
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type });
}

export const isZip = async (blob) => {
  const b = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
};

/** @returns {Promise<Map<string, {read: () => Promise<Uint8Array>, blob: (type?: string) => Promise<Blob>}>>} */
export async function readZip(blob) {
  const tailLen = Math.min(blob.size, 22 + 65535);
  const tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is damaged (not a complete zip).');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('This file is damaged.');
    const method = cd.getUint16(p + 10, true);
    const csize = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOff = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const dataAt = async () => {
      const lh = new DataView(await blob.slice(localOff, localOff + 30).arrayBuffer());
      return localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    };
    const raw = async () => blob.slice(await dataAt(), (await dataAt()) + csize);
    const read = async () => {
      const body = new Uint8Array(await (await raw()).arrayBuffer());
      if (method === 0) return body;
      if (method === 8) return streamThrough(body, new DecompressionStream('deflate-raw'));
      throw new Error('This file uses a zip format the app can’t read.');
    };
    out.set(name, {
      read,
      // Stored (uncompressed) files are sliced straight from the zip — no copy in memory.
      blob: async (type = '') => (method === 0 ? new Blob([await raw()], { type }) : new Blob([await read()], { type })),
    });
  }
  return out;
}
