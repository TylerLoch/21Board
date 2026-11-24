#!/usr/bin/env node
/*
 * Waits for GitHub to test a pushed commit, then prints each part and every failure.
 *
 *   node tools/ci-wait.js                  the run for HEAD
 *   node tools/ci-wait.js <commit>         the run for that commit or branch
 *   node tools/ci-wait.js --save-timings   also saves each suite's seconds to tests/timings.json, to balance the parts
 *
 * .github/workflows/tests.yml runs tests/run.js in 10 parts at once on every push. This prints nothing while it waits,
 * so Claude can run it in the background for free. It needs the GitHub CLI, gh, signed in.
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
const ref = args.find(a => !a.startsWith('--')) || 'HEAD';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stop = msg => { console.error('ci-wait: ' + msg); process.exit(2); };

function git(...a) {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  if (r.status) stop(`git ${a.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

// gh api, tried four times. Returns null if it still fails and quiet is set.
async function gh(api, { text = false, quiet = false } = {}) {
  for (let i = 1; ; i++) {
    const r = spawnSync('gh', ['api', api], { encoding: 'utf8', maxBuffer: 512 << 20 });
    if (r.error && r.error.code === 'ENOENT') stop('needs the GitHub CLI, gh, signed in.');
    if (r.status === 0) return text ? r.stdout : JSON.parse(r.stdout);
    if (i === 4 || /HTTP 4(04|22)/.test(r.stderr || '')) {
      if (quiet) return null;
      stop(`gh api ${api}: ${(r.stderr || '').trim()}`);
    }
    await sleep(5e3 * i);
  }
}

const mins = ms => `${Math.max(1, Math.round(ms / 60e3))} min`;

(async () => {
  const repo = process.env.GITHUB_REPOSITORY ||
    (/([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(git('remote', 'get-url', 'origin')) || []).slice(1).join('/');
  if (!repo) stop('can’t tell the GitHub repository from the origin remote.');
  const sha = git('rev-parse', ref + '^{commit}'), short = sha.slice(0, 7);
  if (!await gh(`repos/${repo}/commits/${sha}`, { quiet: true })) stop(`GitHub doesn’t have ${short}. Push it first.`);

  // GitHub starts the run a few seconds after the push.
  let run;
  for (const t0 = Date.now(); ;) {
    run = (await gh(`repos/${repo}/actions/runs?head_sha=${sha}&per_page=30`)).workflow_runs
      .find(r => (r.path || '').startsWith('.github/workflows/tests.yml'));
    if (run) break;
    if (Date.now() - t0 > 3 * 60e3) stop(`GitHub hasn’t started a test run for ${short}.`);
    await sleep(15e3);
  }
  console.log(`Waiting for the tests of ${short}: ${run.html_url}`);
  while (run.status !== 'completed') { await sleep(30e3); run = await gh(`repos/${repo}/actions/runs/${run.id}`); }

  const jobs = (await gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)).jobs
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  let passed = 0, failed = 0, broken = 0, shown = 0, more = 0, longest = 0;
  const times = {}, fails = [];
  for (const job of jobs) {
    const k = (/\d+/.exec(job.name) || [job.name])[0];
    const took = job.started_at && job.completed_at ? new Date(job.completed_at) - new Date(job.started_at) : 0;
    longest = Math.max(longest, took);
    const log = await gh(`repos/${repo}/actions/jobs/${job.id}/logs`, { text: true, quiet: true }) || '';
    const lines = log.split('\n').map(l => l.replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\r$/, ''));
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
    const end = lines.findLastIndex(s => s.startsWith('##[error]'));
    const tail = (end < 0 ? lines : lines.slice(0, end + 1)).filter(s => s.trim()).slice(-12);
    for (const s of tail) console.log('    ' + s.slice(0, 300));
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
