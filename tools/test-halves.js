#!/usr/bin/env node
/*
 * Runs tests/run.js as two halves at once and adds up the results.
 *
 *   node tools/test-halves.js              every suite
 *   node tools/test-halves.js "Lock:"      only the suites whose title has this text, as node tests/run.js "Lock:"
 *
 * The two take about 40 minutes. More at once can run a 16 GB machine with no swap out of memory. So it won't start
 * while another tests/run.js is running.
 * Each half's log is tests/output/half-1.log and half-2.log. Failures print as they happen.
 * Exits 1 if a test fails or no suite runs. Exits 2 if another test run is going.
 */
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'output');
const args = process.argv.slice(2);

// Counts node processes running tests/run.js, with any node options and from any folder. pgrep -f would also count
// a shell that only mentions it.
function testRuns() {
  try {
    return fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).filter(d => {
      try {
        const a = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').filter(Boolean);
        const script = a.slice(1).find(x => !x.startsWith('-'));
        return /(^|\/)node[\w.-]*$/.test(a[0] || '') && !!script &&
          /(^|\/)tests\/run\.js$/.test(path.resolve(fs.readlinkSync(`/proc/${d}/cwd`), script));
      } catch (e) { return false; }
    }).length;
  } catch (e) {
    // macOS has no /proc. If pgrep can't answer either, don't start.
    const r = spawnSync('pgrep', ['-f', 'node .*tests/run\\.js'], { encoding: 'utf8' });
    if (r.error || r.status > 1) { console.error('test-halves: can’t tell whether another test run is going.'); process.exit(2); }
    return r.stdout.split('\n').filter(Boolean).length;
  }
}
if (testRuns()) { console.error('test-halves: another test run is going. Wait for it to finish.'); process.exit(2); }

fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const kids = new Set();
// Stopped some other way than Ctrl+C, the halves stop too. Playwright closes their browsers.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { for (const p of kids) p.kill(sig); process.exit(1); });

const half = k => new Promise(resolve => {
  const log = fs.createWriteStream(path.join(OUT, `half-${k}.log`));
  // A relative path, so pgrep -f "node tests/run.js" finds it.
  const p = spawn(process.execPath, ['tests/run.js', ...args], { cwd: ROOT, env: { ...process.env, PART: `${k}/2` } });
  kids.add(p);
  let suite = '', summary = null;
  // Each stream has its own buffer, so a line from one never joins a line from the other. Only stdout has titles.
  const reader = titles => {
    let rest = '', prev = '';
    const line = s => {
      const m = titles && /^(\d+) passed, (\d+) failed$/.exec(s);
      if (m) summary = { passed: +m[1], failed: +m[2] };
      else if (titles && prev === '' && /^\S/.test(s)) suite = s;   // run.js prints each title after a blank line
      prev = s;
      if (s.includes('✗ FAIL')) console.log(`[half ${k}] ${suite}\n[half ${k}] ${s.trim()}`);
    };
    return {
      take: c => { log.write(c); const parts = (rest + c).split('\n'); rest = parts.pop(); parts.forEach(line); },
      end: () => { if (rest) line(rest); }
    };
  };
  const out = reader(true), err = reader(false);
  p.stdout.setEncoding('utf8').on('data', out.take);
  p.stderr.setEncoding('utf8').on('data', err.take);
  p.on('close', code => { kids.delete(p); out.end(); err.end(); log.end(); resolve({ k, code, summary }); });
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
  // A filter that matches no suite tests nothing.
  const none = !broken && !passed && !failed;
  if (none) console.log(args[0] ? `No suite has “${args[0]}” in its title.` : 'No suites ran.');
  process.exit(failed || broken || none ? 1 : 0);
})();
