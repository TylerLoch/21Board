/*
 * 21Board — a small WOFF2 reader for the tests (tests/words.js), Node alone: its tables, cmap, fvar axes, and avar.
 * Written from the WOFF2 spec (https://www.w3.org/TR/WOFF2/): the table directory, one Brotli stream, and the tables
 * in directory order. Only glyf and loca come transformed from tools/build-inter.py, and neither is read here.
 */
'use strict';
const zlib = require('zlib');

// The known-table tags, by their index in a directory entry's flags (WOFF2 §5.1).
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln',
  'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf',
  'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const count = buf.readUInt16BE(12), packed = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) { const c = buf[p++]; v = v * 128 + (c & 127); if (!(c & 128)) return v; }
    throw new Error('bad UIntBase128');
  };
  const dir = [];
  for (let i = 0; i < count; i++) {
    const flags = buf[p++], version = flags >> 6;
    const tag = (flags & 63) === 63 ? buf.toString('latin1', p, (p += 4)) : KNOWN[flags & 63];
    const origLength = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    dir.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(p, p + packed));
  const out = {};
  let at = 0;
  for (const d of dir) { out[d.tag] = data.subarray(at, at + d.length); at += d.length; }
  if (at !== data.length) throw new Error(`the tables take ${at} bytes of ${data.length}`);
  return out;
}

// Every code point the cmap maps to a glyph, from its format 4 and 12 subtables.
function cmap(c) {
  const points = new Set();
  for (let i = 0, n = c.readUInt16BE(2); i < n; i++) {
    const off = c.readUInt32BE(8 + i * 8), format = c.readUInt16BE(off);
    if (format === 4) {
      const segs = c.readUInt16BE(off + 6) / 2, ends = off + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = c.readUInt16BE(ends + s * 2), start = c.readUInt16BE(starts + s * 2), delta = c.readUInt16BE(deltas + s * 2), ro = c.readUInt16BE(ranges + s * 2);
        for (let ch = start; ch <= end && ch !== 0xFFFF; ch++) {
          const g = ro ? c.readUInt16BE(ranges + s * 2 + ro + (ch - start) * 2) : ch;
          if (ro && !g) continue;
          if ((g + delta) & 0xFFFF) points.add(ch);
        }
      }
    } else if (format === 12) {
      for (let k = 0, groups = c.readUInt32BE(off + 12); k < groups; k++) {
        const o = off + 16 + k * 12;
        for (let ch = c.readUInt32BE(o), end = c.readUInt32BE(o + 4); ch <= end; ch++) points.add(ch);
      }
    }
  }
  return points;
}

function fvar(b) {
  if (!b) return [];
  const off = b.readUInt16BE(4), count = b.readUInt16BE(8), size = b.readUInt16BE(10), fixed = o => b.readInt32BE(o) / 65536;
  return Array.from({ length: count }, (_, i) => {
    const o = off + i * size;
    return { tag: b.toString('latin1', o, o + 4), min: fixed(o + 4), def: fixed(o + 8), max: fixed(o + 12) };
  });
}

// Each axis's segment map: [from, to] pairs in normalized coordinates.
function avar(b, axes) {
  const out = {};
  if (!b) return out;
  let o = 8;
  for (let i = 0, n = b.readUInt16BE(6); i < n; i++) {
    const map = [], k = b.readUInt16BE(o);
    o += 2;
    for (let j = 0; j < k; j++, o += 4) map.push([b.readInt16BE(o) / 16384, b.readInt16BE(o + 2) / 16384]);
    out[axes[i] ? axes[i].tag : i] = map;
  }
  return out;
}

module.exports = buf => {
  const t = tables(buf), axes = fvar(t.fvar);
  return { tables: Object.keys(t), cmap: cmap(t.cmap), axes, avar: avar(t.avar, axes) };
};
