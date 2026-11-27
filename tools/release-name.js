#!/usr/bin/env node
'use strict';
// Names a release run. The Workflow tool lists each run by its script's meta, and meta must be a plain literal, so
// every run of tools/release-workflow.js showed as "release-from-spec". This writes a copy of it whose meta names the
// release, such as "Release 2026.11.27-2 · Languages 1b", with the release's one-line summary under it.
//
//   node tools/release-name.js <spec folder>/release-args.json <spec folder>/release-workflow.js
//
// Then run that copy: Workflow({ scriptPath: '<spec folder>/release-workflow.js', args }). Only the name and
// description change. The args file needs version and title. name and summary are optional: without them, the name is
// the part of the title before its colon, and the summary is the part after it.
const fs = require('fs');
const path = require('path');

const [argsFile, out] = process.argv.slice(2);
if (!argsFile || !out) {
  console.error('Usage: node tools/release-name.js <release-args.json> <out.js>');
  process.exit(2);
}
const A = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
if (!A.version || !A.title) {
  console.error(argsFile + ' needs version and title.');
  process.exit(1);
}

// "Release 2026.11.27-2, Languages phase 1b: the Language row …" → "Languages phase 1b" and "the Language row …"
const colon = A.title.indexOf(':');
const head = (colon < 0 ? A.title : A.title.slice(0, colon)).replace(/^Release\s+\S+?,\s*/, '').trim();
const rest = colon < 0 ? '' : A.title.slice(colon + 1).trim();
const name = 'Release ' + A.version + ' · ' + (A.name || head);
let summary = A.summary || (rest ? rest[0].toUpperCase() + rest.slice(1) : head);
if (summary.length > 200) summary = summary.slice(0, summary.lastIndexOf(' ', 199)).replace(/[,;:]$/, '') + '…';

const src = fs.readFileSync(path.join(__dirname, 'release-workflow.js'), 'utf8');
let swaps = 0;
const copy = src
  .replace(/^(  name: ).*,$/m, (m, p) => (swaps++, p + JSON.stringify(name) + ','))
  .replace(/^(  description: ).*,$/m, (m, p) => (swaps++, p + JSON.stringify(summary) + ','));
if (swaps !== 2) {
  console.error('tools/release-workflow.js: its meta needs one "  name: …," line and one "  description: …," line.');
  process.exit(1);
}

// The Workflow tool runs the body as an async function. Parse it the same way, so a broken string shows up here
// with its line, not as a launch that fails.
const body = copy.replace(/^export const meta =/m, 'const meta =');
try {
  new (Object.getPrototypeOf(async function () {}).constructor)('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', body);
} catch (e) {
  console.error('tools/release-workflow.js won’t run: ' + e.message);
  process.exit(1);
}
fs.writeFileSync(out, copy);
console.log(name + '\n' + summary + '\n→ ' + out);
