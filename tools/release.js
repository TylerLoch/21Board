#!/usr/bin/env node
/*
 * Stamps a release: gives the files 21Board ships one fingerprint (the "build").
 *
 *   node tools/release.js           after changing any file the app ships, and before every deploy
 *   node tools/release.js --check   exit 1 if the stamp doesn't match the files (the tests run this)
 *
 * Why: a device must only ever run one complete version. The service worker saves an offline copy only if
 * every file it downloads has the fingerprint written here, and it takes a new copy only when sw.js itself
 * has changed. So files that changed without a new stamp never reach devices in pieces, and the tests fail
 * until the stamp is made again.
 *
 * What it writes (nothing else is touched):
 *   sw.js        BUILD   one fingerprint for sw.js and every file of the offline copy
 *                FILES   each file of the offline copy (the list sw.js builds: PRECACHE) with its own fingerprint
 *   board.js     BOARD_VERSION (VERSION in sw.js, the release's name, which is changed by hand) and BOARD_BUILD:
 *                Settings → About shows both, and exported files carry them
 *   index.html   data-build on <html>, so board.js can tell that the page it runs in is the same build
 * sdk/dev/board-shell.js is one of the files, so tools/build-sdk.js is run first.
 *
 * No dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const sha = data => crypto.createHash('sha256').update(data).digest('hex');

// Where the stamp goes: [file, what to find (the value is the middle group)].
const SLOTS = {
  version: ['board.js', /(\bconst BOARD_VERSION = ')([^']*)(';)/],
  board: ['board.js', /(\bconst BOARD_BUILD = ')([^']*)(';)/],
  page: ['index.html', /(<html\b[^>]*\sdata-build=")([^"]*)(")/],
  build: ['sw.js', /(\bconst BUILD = ')([^']*)(';)/],
  files: ['sw.js', /(\bconst FILES = )(\{[^}]*\})(;)/]
};

// The files of the offline copy, as sw.js itself lists them (it is run here with nothing to talk to).
function offlineFiles(read) {
  const box = { addEventListener() {} };
  box.self = box;
  box.importScripts = (...files) => files.forEach(f => vm.runInContext(read(f).toString('utf8'), box, { filename: f }));
  vm.createContext(box);
  let list;
  try { list = vm.runInContext(read('sw.js').toString('utf8') + '\n;PRECACHE;', box, { filename: 'sw.js' }); } catch (e) { if (e.code === 'ENOENT') throw e; throw new Error(`sw.js (or widgets/registry.js) doesn’t run: ${e.message}`); }
  if (!Array.isArray(list) || !list.length) throw new Error('sw.js: expected PRECACHE, the list of files for offline use');
  return Array.from(list, String);
}

/*
 * read(file) returns a file's bytes (a Buffer). Returns the stamp for those files:
 *   { version, build, out: { 'sw.js', 'board.js', 'index.html': the three files as they should be }, changed: [...] }
 * `changed` lists the files that are not the ones the stamp in sw.js was made for.
 */
function stamp(read) {
  const out = {};
  for (const [file] of Object.values(SLOTS)) out[file] = out[file] || read(file).toString('utf8');
  const set = (slot, value) => {
    const [file, re] = SLOTS[slot];
    if (!re.test(out[file])) throw new Error(`${file}: can’t find where the release stamp goes (${re.source})`);
    const was = re.exec(out[file])[2];
    out[file] = out[file].replace(re, (m, a, b, c) => a + value + c);
    return was;
  };
  const version = (/\bconst VERSION = '([^']+)';/.exec(out['sw.js']) || [])[1];
  if (!version) throw new Error('sw.js: can’t find VERSION');
  const list = offlineFiles(read);
  const bytes = url => { const f = url === './' ? 'index.html' : url; return f in out ? Buffer.from(out[f]) : read(f); };

  // The build: every file with the stamp taken out (it can't be part of its own fingerprint).
  set('version', version);
  set('board', ''); set('page', ''); set('build', '');
  const before = set('files', '{}');
  const build = sha(['sw.js'].concat(list).map(url => `${url} ${sha(bytes(url))}\n`).join('')).slice(0, 8);

  // Each file as it will be served, stamp included: what the service worker checks its downloads against.
  set('board', build); set('page', build); set('build', build);
  const files = {};
  for (const url of list) files[url] = sha(bytes(url)).slice(0, 16);
  set('files', '{\n' + list.map(url => `  '${url}': '${files[url]}'`).join(',\n') + '\n}');

  let old = {};
  try { old = vm.runInNewContext('(' + before + ')'); } catch (e) { /* no stamp yet */ }
  const changed = Array.from(new Set(list.concat(Object.keys(old)))).filter(url => old[url] !== (list.includes(url) ? sha(read(url === './' ? 'index.html' : url)).slice(0, 16) : undefined));
  return { version, build, out, changed };
}

module.exports = { stamp };

if (require.main === module) {
  const ROOT = path.join(__dirname, '..');
  const check = process.argv.includes('--check');
  const read = file => fs.readFileSync(path.join(ROOT, file));
  if (!check) require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-sdk.js')], { stdio: 'inherit' });
  let r;
  try { r = stamp(read); } catch (e) { console.error('The release can’t be stamped: ' + (e.code === 'ENOENT' ? `${path.relative(ROOT, e.path)} is listed for offline use but doesn’t exist` : e.message)); process.exit(1); }
  const stale = Object.keys(r.out).filter(f => r.out[f] !== read(f).toString('utf8'));
  if (check) {
    if (stale.length) {
      console.error('The release stamp doesn’t match the files' + (r.changed.length ? ' (changed since it was made: ' + r.changed.filter(u => u !== './').join(', ') + ')' : ' (sw.js changed since it was made)') + '.\nRun `node tools/release.js`.');
      process.exit(1);
    }
    console.log(`release stamp is up to date: ${r.version} (${r.build})`);
  } else {
    for (const f of stale) fs.writeFileSync(path.join(ROOT, f), r.out[f]);
    console.log(stale.length ? `stamped ${r.version} (${r.build}): wrote ${stale.join(', ')}` : `already stamped: ${r.version} (${r.build})`);
  }
}
