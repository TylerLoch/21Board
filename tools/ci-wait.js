#!/usr/bin/env node
/*
 * Waits for GitHub to test a pushed commit, then prints each part and every failure.
 *
 *   node tools/ci-wait.js                  the run for HEAD
 *   node tools/ci-wait.js <commit>         the run for that commit or branch
 *   node tools/ci-wait.js --save-timings   also saves each suite's seconds to tests/timings.json, to balance the parts
 *   node tools/ci-wait.js --layout         the layout checks instead, for HEAD or the commit named
 *   node tools/ci-wait.js --layout --out <dir>   also saves their results in <dir>, to run tools/layout/gate.py again
 *
 * .github/workflows/tests.yml runs tests/run.js in 15 parts at once on every push. This prints nothing while it waits,
 * so Claude can run it in the background for free. It needs the GitHub CLI, gh, signed in.
 * .github/workflows/layout.yml runs Weather's layout checks in 5 parts when a push changes Weather. --layout prints each
 * part's time, the verdicts, and every new problem.
 * Exits 0 if every test passed, 1 if a test failed or a part stopped, and 2 if there's no run to wait for.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TIMINGS = path.join(ROOT, 'tests', 'timings.json');
const MAX_FAILS = 40;   // past this, something broke everywhere: the log says the rest
const args = process.argv.slice(2);
const save = args.includes('--save-timings');
const layout = args.includes('--layout');
const outAt = args.indexOf('--out'), out = outAt < 0 ? null : args[outAt + 1];
const ref = args.find((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1)) || 'HEAD';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stop = msg => { console.error('ci-wait: ' + msg); process.exit(2); };
if (outAt >= 0 && (!layout || !out || out.startsWith('--'))) stop('--out <dir> goes with --layout.');

function git(...a) {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  if (r.status) stop(`git ${a.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

// gh api, tried four times. Returns null if it still fails and quiet is set. raw: the body as bytes, for a zip.
async function gh(api, { text = false, quiet = false, raw = false } = {}) {
  for (let i = 1; ; i++) {
    const r = spawnSync('gh', ['api', api], { encoding: raw ? 'buffer' : 'utf8', maxBuffer: 512 << 20 });
    if (r.error && r.error.code === 'ENOENT') stop('needs the GitHub CLI, gh, signed in.');
    if (r.status === 0) return raw || text ? r.stdout : JSON.parse(r.stdout);
    const err = String(r.stderr || '').trim();
    if (i === 4 || /HTTP 4(04|22)/.test(err)) {
      if (quiet) return null;
      stop(`gh api ${api}: ${err}`);
    }
    await sleep(5e3 * i);
  }
}

const mins = ms => `${Math.max(1, Math.round(ms / 60e3))} min`;
// A job's log, a line each, without GitHub's timestamps.
const logLines = log => log.split('\n').map(l => l.replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\r$/, ''));
const tookMs = job => job.started_at && job.completed_at ? new Date(job.completed_at) - new Date(job.started_at) : 0;
// What came just before a job's error, the last one in its log.
const tailOf = lines => {
  const end = lines.findLastIndex(s => s.startsWith('##[error]'));
  return (end < 0 ? lines : lines.slice(0, end + 1)).filter(s => s.trim()).slice(-12).map(s => '    ' + s.slice(0, 300));
};

// --layout: each part's time and what each side took, then the last job's report, from its "Head ..." line to its
// "Layout: PASS." or "Layout: FAIL." line.
async function layoutReport(repo, run) {
  const jobs = (await gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)).jobs
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const min = ms => `${(ms / 60e3).toFixed(1)} min`;
  let longest = 0, report = null;
  for (const job of jobs) {
    const lines = logLines(await gh(`repos/${repo}/actions/jobs/${job.id}/logs`, { text: true, quiet: true }) || '');
    const how = job.conclusion === 'success' ? '' : ` (${job.conclusion || job.status})`;
    if (/^Part \d/.test(job.name)) {
      longest = Math.max(longest, tookMs(job));
      const sides = lines.filter(s => /^(head|base): .+\.$/.test(s));
      console.log(`${job.name}: ${min(tookMs(job))}${how}.${sides.length ? ' ' + sides.join(' ') : ''}`);
      if (how) for (const s of tailOf(lines)) console.log(s);
      continue;
    }
    const end = lines.findLastIndex(s => /^Layout: (PASS|FAIL)\./.test(s));
    const start = end < 0 ? -1 : lines.slice(0, end).findLastIndex(s => /^Head [0-9a-f]{7}\b/.test(s));
    if (start >= 0) report = lines.slice(start, end + 1);
    console.log(`${job.name}: ${min(tookMs(job))}${how}.`);
    if (how && start < 0) for (const s of tailOf(lines)) console.log(s);
  }
  if (report) console.log('\n' + report.join('\n'));
  const done = jobs.filter(j => j.started_at && j.completed_at);
  const wall = done.length ? Math.max(...done.map(j => +new Date(j.completed_at))) - Math.min(...done.map(j => +new Date(j.started_at))) : 0;
  console.log(`\nThe longest part took ${min(longest)}, the whole run ${min(wall)}. ${run.html_url}`);
  if (run.conclusion === 'cancelled') console.log('The run was stopped. A newer push stops an older run.');
  if (out) await saveResults(repo, run, path.resolve(out));
  process.exit(run.conclusion === 'success' ? 0 : 1);
}

// --out: the last job's artifact, unzipped into dir.
async function saveResults(repo, run, dir) {
  const art = (await gh(`repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`)).artifacts.find(a => a.name === 'layout');
  if (!art || art.expired) return console.log('The run kept no results to save.');
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'layout.zip');
  fs.writeFileSync(zip, await gh(`repos/${repo}/actions/artifacts/${art.id}/zip`, { raw: true }));
  let r = spawnSync('unzip', ['-oq', zip, '-d', dir], { stdio: 'inherit' });
  if (r.error) r = spawnSync('python3', ['-m', 'zipfile', '-e', zip, dir], { stdio: 'inherit' });
  if (r.status !== 0) stop(`can’t unzip ${zip}.`);
  fs.unlinkSync(zip);
  console.log(`Saved in ${dir}. To run the gate again: python3 tools/layout/gate.py --new --ref ${dir}/base/own --cand ${dir}/head/own`);
}

(async () => {
  const repo = process.env.GITHUB_REPOSITORY ||
    (/([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(git('remote', 'get-url', 'origin')) || []).slice(1).join('/');
  if (!repo) stop('can’t tell the GitHub repository from the origin remote.');
  const sha = git('rev-parse', ref + '^{commit}'), short = sha.slice(0, 7);
  // The branch whose run to prefer: the one named, else this checkout's.
  const here = git('rev-parse', '--abbrev-ref', 'HEAD');
  const branch = ref === 'HEAD' || /^[0-9a-f]{7,40}$/.test(ref) ? (here === 'HEAD' ? '' : here) : ref.replace(/^origin\//, '');
  if (!await gh(`repos/${repo}/commits/${sha}`, { quiet: true })) stop(`GitHub doesn’t have ${short}. Push it first.`);

  // GitHub starts the run a few seconds after the push.
  let run;
  for (const t0 = Date.now(); ;) {
    // The same commit pushed to two branches has a run on each: this branch's first, then one that wasn't stopped.
    // The newest comes first, such as a layout run started by hand after the push's own.
    const all = (await gh(`repos/${repo}/actions/runs?head_sha=${sha}&per_page=30`)).workflow_runs;
    const of = f => all.filter(r => (r.path || '').startsWith('.github/workflows/' + f));
    const runs = of(layout ? 'layout.yml' : 'tests.yml');
    run = runs.find(r => r.head_branch === branch) || runs.find(r => r.conclusion !== 'cancelled') || runs[0];
    if (run) break;
    // Every push runs the tests. A push with a test run and no layout run changed nothing the layout checks watch.
    const tests = layout && of('tests.yml')[0];
    if (tests && Date.now() - new Date(tests.created_at) > 30e3) stop(`No layout run for ${short}. Its push changed nothing the layout checks watch.`);
    if (Date.now() - t0 > 3 * 60e3) stop(`GitHub hasn’t started a ${layout ? 'layout' : 'test'} run for ${short}.`);
    await sleep(tests ? 5e3 : 15e3);
  }
  console.log(`Waiting for the ${layout ? 'layout checks' : 'tests'} of ${short}: ${run.html_url}`);
  while (run.status !== 'completed') { await sleep(30e3); run = await gh(`repos/${repo}/actions/runs/${run.id}`); }
  if (layout) return layoutReport(repo, run);

  const jobs = (await gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)).jobs
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  let passed = 0, failed = 0, broken = 0, shown = 0, more = 0, longest = 0;
  const times = {}, fails = [];
  for (const job of jobs) {
    const k = (/\d+/.exec(job.name) || [job.name])[0];
    const took = tookMs(job);
    longest = Math.max(longest, took);
    const lines = logLines(await gh(`repos/${repo}/actions/jobs/${job.id}/logs`, { text: true, quiet: true }) || '');
    let suite = '', prev = '', said = '', summary = null;
    for (const s of lines) {
      const m = /^(\d+) passed, (\d+) failed$/.exec(s);
      if (m) summary = { passed: +m[1], failed: +m[2] };
      else if (s.startsWith('Suite times: ')) { try { Object.assign(times, JSON.parse(s.slice(13))); } catch (e) {} }
      else if (prev === '' && /^\S/.test(s)) suite = s;   // run.js prints each title after a blank line
      else if (s.includes('✗ FAIL') && shown >= MAX_FAILS) more++;
      else if (s.includes('✗ FAIL')) {
        if (said !== suite) fails.push(`[part ${k}] ${suite}`), said = suite;
        fails.push(`[part ${k}] ${s.trim()}`); shown++;
      }
      prev = s;
    }
    if (summary) {
      passed += summary.passed; failed += summary.failed;
      console.log(`Part ${k}: ${summary.passed} passed, ${summary.failed} failed in ${mins(took)}`);
      continue;
    }
    // Stopped before the end: show what came just before the step's error, the last one in the log.
    broken++;
    console.log(`Part ${k}: stopped before the end (${job.conclusion || job.status}). ${job.html_url}`);
    for (const s of tailOf(lines)) console.log(s);
  }
  if (fails.length) console.log('\n' + fails.join('\n'));
  if (more) console.log(`and ${more} more failures. See ${run.html_url}`);
  console.log(`\n${passed} passed, ${failed} failed. The longest part took ${mins(longest)}. ${run.html_url}`);
  if (run.conclusion === 'cancelled') console.log('The run was stopped. A newer push stops an older run.');

  if (save) {
    if (broken || !Object.keys(times).length) console.log('Timings not saved. Every part has to finish.');
    else {
      let old = {};
      try { old = JSON.parse(fs.readFileSync(TIMINGS, 'utf8')); } catch (e) {}
      const all = Object.entries({ ...old, ...times }).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      fs.writeFileSync(TIMINGS, JSON.stringify(Object.fromEntries(all), null, 2) + '\n');
      console.log(`Saved ${Object.keys(times).length} suites’ times to tests/timings.json. Commit it.`);
    }
  }
  process.exit(failed || broken || !passed ? 1 : 0);
})();
