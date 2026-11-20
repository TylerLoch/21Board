#!/usr/bin/env node
/*
 * Runs the whole of tests/run.js as two processes at once, each with half of the suites, and adds up the results.
 *
 *   node tools/test-halves.js              every suite
 *   node tools/test-halves.js "Lock:"      only the suites whose title has this text, as node tests/run.js "Lock:"
 *
 * The two take about 40 minutes. More at once can run a 16 GB machine with no swap out of memory, so it won't start
 * while another tests/run.js is running.
 * Each half's log is tests/output/half-1.log and half-2.log. Failures print as they happen. Exit 1 on any failure.
 */
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'output');
const args = process.argv.slice(2);

// Node processes running tests/run.js. Not a shell whose command line only mentions it, as pgrep -f would count.
function testRuns() {
  try {
    return fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).filter(d => {
      try {
        const a = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0');
        return /(^|\/)node$/.test(a[0]) && /(^|\/)tests\/run\.js$/.test(a[1] || '');
      } catch (e) { return false; }
    }).length;
  } catch (e) {   // (no /proc: macOS)
    return +(spawnSync('pgrep', ['-fc', 'node tests/run.js'], { encoding: 'utf8' }).stdout || 0);
  }
}
if (testRuns()) { console.error('test-halves: another test run is going. Wait for it to finish.'); process.exit(2); }

fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const half = k => new Promise(resolve => {
  const log = fs.createWriteStream(path.join(OUT, `half-${k}.log`));
  // 'tests/run.js' relative to ROOT, so other runners' pgrep "node tests/run.js" counts it.
  const p = spawn(process.execPath, ['tests/run.js', ...args], { cwd: ROOT, env: { ...process.env, PART: `${k}/2` } });
  let rest = '', suite = '', summary = null;
  const line = s => {
    if (/^\S/.test(s) && !/^\d+ passed, \d+ failed$/.test(s)) suite = s;
    const m = /^(\d+) passed, (\d+) failed$/.exec(s);
    if (m) summary = { passed: +m[1], failed: +m[2] };
    if (s.includes('✗ FAIL')) console.log(`[half ${k}] ${suite}\n[half ${k}] ${s.trim()}`);
  };
  const take = chunk => { log.write(chunk); const parts = (rest + chunk).split('\n'); rest = parts.pop(); parts.forEach(line); };
  p.stdout.setEncoding('utf8').on('data', take);
  p.stderr.setEncoding('utf8').on('data', take);
  p.on('close', code => { if (rest) line(rest); log.end(); resolve({ k, code, summary }); });
});

(async () => {
  console.log('Running tests/run.js in two halves. Logs: tests/output/half-1.log, half-2.log');
  const results = await Promise.all([half(1), half(2)]);
  let passed = 0, failed = 0, broken = false;
  for (const r of results) {
    if (!r.summary) { broken = true; console.log(`Half ${r.k}: stopped before the end (exit ${r.code}). See tests/output/half-${r.k}.log.`); continue; }
    passed += r.summary.passed; failed += r.summary.failed;
    console.log(`Half ${r.k}: ${r.summary.passed} passed, ${r.summary.failed} failed`);
  }
  console.log(`\n${passed} passed, ${failed} failed in ${Math.round((Date.now() - t0) / 60e3)} min`);
  const none = !broken && !passed && !failed;   // (a filter no suite title has: nothing was tested)
  if (none) console.log(args[0] ? `No suite has “${args[0]}” in its title.` : 'No suites ran.');
  process.exit(failed || broken || none ? 1 : 0);
})();
