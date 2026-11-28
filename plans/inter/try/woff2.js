// Trial of the spec's tests/woff2.js: a WOFF2's cmap (formats 4 and 12), fvar axes, avar maps, and hmtx advances,
// with Node alone (zlib.brotliDecompressSync).
'use strict';
const zlib = require('zlib');
const TAGS = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];
function read(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const n = buf.readUInt16BE(12), packed = buf.readUInt32BE(20);
  let p = 48;
  const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const c = buf[p++]; v = v * 128 + (c & 127); if (!(c & 128)) return v; } throw new Error('bad UIntBase128'); };
  const dir = [];
  for (let i = 0; i < n; i++) {
    const flags = buf[p++], idx = flags & 63, ver = flags >> 6;
    const tag = idx === 63 ? buf.toString('latin1', p, (p += 4)) : TAGS[idx];
    const orig = b128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? ver === 0 : ver !== 0;
    dir.push({ tag, transformed, len: transformed ? b128() : orig });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(p, p + packed));
  const t = {}; let at = 0;
  for (const d of dir) { t[d.tag] = Object.assign(data.subarray(at, at + d.len), { transformed: d.transformed }); at += d.len; }
  if (at !== data.length) throw new Error(`the tables take ${at} bytes of ${data.length}`);
  return t;
}
function cmap(c) {
  const map = new Map(), n = c.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const off = c.readUInt32BE(4 + i * 8 + 4), fmt = c.readUInt16BE(off);
    if (fmt === 4) {
      const segs = c.readUInt16BE(off + 6) / 2, ends = off + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = c.readUInt16BE(ends + s * 2), start = c.readUInt16BE(starts + s * 2), delta = c.readUInt16BE(deltas + s * 2), ro = c.readUInt16BE(ranges + s * 2);
        for (let ch = start; ch <= end && ch !== 0xFFFF; ch++) {
          let g = ro ? c.readUInt16BE(ranges + s * 2 + ro + (ch - start) * 2) : ch;
          if (ro && g === 0) continue;
          g = (g + delta) & 0xFFFF;
          if (g) map.set(ch, g);
        }
      }
    } else if (fmt === 12) {
      const groups = c.readUInt32BE(off + 12);
      for (let k = 0; k < groups; k++) { const s = c.readUInt32BE(off + 16 + k * 12), e = c.readUInt32BE(off + 20 + k * 12), g0 = c.readUInt32BE(off + 24 + k * 12); for (let ch = s; ch <= e; ch++) map.set(ch, g0 + ch - s); }
    }
  }
  return map;
}
const fixed = (b, o) => b.readInt32BE(o) / 65536;
function fvar(b) {
  if (!b) return [];
  const off = b.readUInt16BE(4), count = b.readUInt16BE(8), size = b.readUInt16BE(10), axes = [];
  for (let i = 0; i < count; i++) { const o = off + i * size; axes.push({ tag: b.toString('latin1', o, o + 4), min: fixed(b, o + 4), def: fixed(b, o + 8), max: fixed(b, o + 12) }); }
  return axes;
}
function avar(b, axes) {
  if (!b) return {};
  const n = b.readUInt16BE(6); let o = 8; const out = {};
  for (let i = 0; i < n; i++) { const k = b.readUInt16BE(o); o += 2; const m = []; for (let j = 0; j < k; j++) { m.push([b.readInt16BE(o) / 16384, b.readInt16BE(o + 2) / 16384]); o += 4; } out[axes[i].tag] = m; }
  return out;
}
function advances(t) {
  if (t.hmtx.transformed) throw new Error('hmtx is transformed');
  const nh = t.hhea.readUInt16BE(34), adv = [];
  for (let i = 0; i < nh; i++) adv.push(t.hmtx.readUInt16BE(i * 4));
  return g => adv[Math.min(g, nh - 1)];
}
module.exports = buf => { const t = read(buf), axes = fvar(t.fvar); return { tables: Object.keys(t), cmap: cmap(t.cmap), axes, avar: avar(t.avar, axes), advance: advances(t) }; };
