#!/usr/bin/env node
// Builds the Teacher Guide: page-src.html with its fonts inlined, the Widget Picker icon and the widget tiles filled in,
// into dist/page.html. dist/files.json maps each screenshot the page uses to its file, for publishing.
//   node docs/teacher-guide/build.js
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const DIST = path.join(HERE, 'dist');
const b64 = f => fs.readFileSync(path.join(ROOT, f)).toString('base64');

let t = fs.readFileSync(path.join(HERE, 'page-src.html'), 'utf8');
t = t.replace('__INTER__', () => b64('fonts/Inter-21Board.woff2'))
  .replace('__CHALK__', () => b64('widgets/notes/fonts/CrayonLibre-21Board.woff2'));

// [W] is the Widget Picker button, drawn as its 3 x 3 grid.
let cells = '';
for (const y of [3, 9.5, 16]) for (const x of [3, 9.5, 16]) cells += `<rect x="${x}" y="${y}" width="5" height="5" rx="1.2"/>`;
const waf = `<svg class="waf" viewBox="0 0 24 24" role="img" aria-label="the Widget Picker button">${cells}</svg>`;
t = t.split('[W]').join(waf);
// [L] is the padlock (Lock, and the padlocks in the top corners while the board is locked).
t = t.split('[L]').join('<svg class="padlock" viewBox="0 0 24 24" role="img" aria-label="the padlock"><rect x="5" y="10.5" width="14" height="10.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>');

// {{version}} is the release's name, VERSION in sw.js.
const version = (/const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')) || [])[1];
if (!version) throw new Error('No VERSION in sw.js');
t = t.split('{{version}}').join(version);

// {{tile:id}} is a link to a widget's section, {{icon:id}} its small icon. tiles.json has each widget's name, icon and color.
const tiles = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(HERE, 'tiles.json'), 'utf8')).map(w => [w.id, w]));
const tile = id => { if (!tiles[id]) throw new Error('No tile for ' + id); return tiles[id]; };
const icon = (id, sm) => `<span class="ticon${sm ? ' sm' : ''}" style="--c:${tile(id).color}" aria-hidden="true">${tile(id).icon}</span>`;
// (A hyphenated word stays on one line: "Zones / Check-In", as in the Widget Picker.)
const tileName = name => name.replace(/[^\s-]+(?:-[^\s-]+)+/g, w => `<span class="nobr">${w}</span>`);
t = t.replace(/\{\{tile:([\w-]+)\}\}/g, (m, id) => `<a class="tile" href="#w-${id}">${icon(id)}<span>${tileName(tile(id).name)}</span></a>`);
t = t.replace(/\{\{icon:([\w-]+)\}\}/g, (m, id) => icon(id, true));

const left = t.replace(/__proto__/g, '').match(/\{\{|__[A-Z]+__/);
if (left) throw new Error('Unfilled placeholder: ' + left[0]);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'page.html'), t);
const used = [...new Set([...t.matchAll(/src="(shots\/[^"]+)"/g)].map(m => m[1]))].sort();
const files = Object.fromEntries(used.map(u => [u, path.join(HERE, u)]));
for (const [u, f] of Object.entries(files)) if (!fs.existsSync(f)) throw new Error('Missing screenshot: ' + u);
fs.writeFileSync(path.join(DIST, 'files.json'), JSON.stringify(files, null, 1) + '\n');
console.log(`dist/page.html: ${t.length} bytes, ${used.length} screenshots`);
