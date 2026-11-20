export const meta = {
  name: 'release-from-spec',
  description: 'One 21Board release from a spec: build (tests first), two reviews, fix, final screenshots, on its own branch',
  phases: [
    { title: 'Build', detail: 'tests first, the change, docs and guides, stamp, suites, commit' },
    { title: 'Review', detail: 'behaviour; look, words and tests' },
    { title: 'Fix', detail: 'confirmed findings, stamp, suites, final screenshots, commit' },
  ],
}
// Claude Code's Workflow tool runs this file, not Node: Workflow({ scriptPath: 'tools/release-workflow.js', args }).
// docs/RELEASING.md has the whole routine, and what to pass.
//
// args: {
//   title,            the release's name and one-line summary
//   spec,             the spec's path. Its folder gets the logs, shots/ and final-shots/
//   wt, branch, base, the worktree, its branch, and the commit it starts from
//   version,          VERSION in sw.js for this release
//   shots,            [{ file, what }]: the final screenshots for Tyler
//   lensBehaviour,    what the behaviour reviewer tries to break
//   lensLook,         what the look, words and tests reviewer compares
//   buildNote?, note? extra words for the builder, and for the fixer
// }
const A = args || {}
const missing = ['title', 'spec', 'wt', 'branch', 'base', 'version', 'shots', 'lensBehaviour', 'lensLook'].filter(k => !A[k])
if (missing.length) { log('missing args: ' + missing.join(', ')); return { missing } }
const CLAUDE_MD = `${A.wt}/CLAUDE.md`
const CPU = 'Memory is tight (16 GB, no swap; an earlier run crashed the machine) and another build may be testing: before starting any test process (tests/run.js or your own browser scripts), check `pgrep -fc "node tests/run.js"`; if 2 or more are running, wait and poll every 30 s. Run at most 1 test process of your own at a time, never more than one Chromium of your own, and close every browser you open. A failure seen while other tests ran: rerun it alone once before treating it as real, and report both runs.'
const VOICE = `Every label, message, hint and line of docs you add or change follows ${CLAUDE_MD} ("Voice"): Apple-like, less is more, every word earns its place. Reread each one before you commit.`
const GUIDES = `The Teacher Guide (docs/teacher-guide) is part of every release that changes the interface, a widget or how the board behaves: update its words and retake the screenshots that show the change (its README has the steps), then run its build.js and check.js. If the Calculator changes, do the same for docs/calculator-manual. Don't publish either; the session publishes them after the merge.`

const BUILD_SCHEMA = { type: 'object', properties: {
  summary: { type: 'string' }, commit: { type: 'string' }, decisions: { type: 'array', items: { type: 'string' } },
  strings: { type: 'array', items: { type: 'string' } }, tests_changed: { type: 'array', items: { type: 'string' } },
  tests: { type: 'array', items: { type: 'object', properties: { suite: { type: 'string' }, passed: { type: 'number' }, failed: { type: 'number' }, note: { type: 'string' } }, required: ['suite', 'passed', 'failed'] } },
  screenshots: { type: 'array', items: { type: 'string' } }, open_issues: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'commit', 'decisions', 'strings', 'tests_changed', 'tests', 'screenshots', 'open_issues'] }
const REVIEW_SCHEMA = { type: 'object', properties: {
  findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'claim', 'evidence', 'fix'] } },
  checked_ok: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } },
  required: ['findings', 'checked_ok', 'summary'] }

phase('Build')
const built = await agent(`You are building a release of 21Board, a static offline PWA "smartboard OS" for a K-8 school district: ${A.title}. Read the spec first and follow it exactly: ${A.spec}.

Work only in the worktree ${A.wt} (branch ${A.branch}, already created at ${A.base}). ${CPU} ${VOICE} ${GUIDES}${A.buildNote ? '\n\n' + A.buildNote : ''}

Order of work: read the spec and the code it names; write the spec's tests and run them on the unchanged code to show they fail (keep the log next to the spec); build; docs and guides; stamp the release (VERSION in sw.js is '${A.version}'; node tools/build-sdk.js, then node tools/release.js, then both again with --check); run the spec's suites; commit with the spec's trailers. Never push. Screenshots (deviceScaleFactor 2) of the result into the spec's folder under shots/.

Return the structured result: decisions (everything the spec left to you), every user-visible string added or changed exactly (old and new), tests_changed = each existing test you changed and why, every suite run with pass/fail counts (both runs if one was rerun), the screenshot paths, and what is left open.`,
  { label: 'build', phase: 'Build', schema: BUILD_SCHEMA })
if (!built || !built.commit) { log('build returned nothing usable'); return { built } }
log(`built ${built.commit}`)

phase('Review')
const REVIEWS = [
  { key: 'behaviour', lens: A.lensBehaviour },
  { key: 'look-words-tests', lens: A.lensLook },
]
const reviews = await parallel(REVIEWS.map(r => () => agent(`You are reviewing a release of 21Board (a static offline PWA for a K-8 school district): ${A.title}. The spec: ${A.spec} (read it). The change is commit ${built.commit} on branch ${A.branch} (parent ${A.base}) in ${A.wt}. Do NOT edit that worktree or branch: make your own detached worktree of that commit next to the spec (review-${r.key}/) and remove it when done. ${CPU}

The builder says: ${JSON.stringify(built.summary)}
Decisions: ${JSON.stringify(built.decisions)}
Strings: ${JSON.stringify(built.strings)}
Tests changed: ${JSON.stringify(built.tests_changed)}

${r.lens}
Also check every new or changed string against ${CLAUDE_MD} ("Voice"), and that the Teacher Guide says and shows what the board now does.
Report only problems you reproduced or can show from the code or docs, each with evidence (scripts and logs next to your worktree) and a concrete fix.`, { label: 'review-' + r.key, phase: 'Review', schema: REVIEW_SCHEMA })))
const findings = reviews.flatMap((r, i) => r ? (r.findings || []).map(f => ({ ...f, from: REVIEWS[i].key })) : [])
const lost = REVIEWS.filter((r, i) => !reviews[i]).map(r => r.key)
log(`${findings.length} findings${lost.length ? '; no result from ' + lost.join(', ') : ''}`)

phase('Fix')
const fixed = await agent(`You are finishing a release of 21Board (a static offline PWA for a K-8 school district): ${A.title}. The spec: ${A.spec}. The work is on branch ${A.branch} in ${A.wt}, at commit ${built.commit}. ${CPU} ${VOICE} ${GUIDES}${A.note ? '\n\n' + A.note : ''}

Tests the builder changed: ${JSON.stringify(built.tests_changed)}
Two reviewers' findings:
${JSON.stringify(findings, null, 1)}${lost.length ? '\nNo result came back from the ' + lost.join(' and ') + ' review. Say so in open_issues.' : ''}
What they found fine: ${JSON.stringify(reviews.filter(Boolean).map(r => r.checked_ok))}

For each finding: reproduce it first. If real, write or extend a test that fails, fix it, see it pass. If not real or not worth it, say why. Then re-stamp if any file changed (node tools/build-sdk.js and node tools/release.js, both again with --check; VERSION stays '${A.version}'), rerun the spec's suites plus every suite whose code or expectations you changed, and commit on ${A.branch} with the spec's trailers (a new commit; don't amend). Leave the worktree clean. Never push.

Then the final screenshots for Tyler into the spec's folder under final-shots/ (deviceScaleFactor 2, cropped to what matters): ${JSON.stringify(A.shots)}.

Return the structured result with commit = the final commit on ${A.branch}, tests_changed = every existing test changed by the whole branch and why, and strings = every user-visible string added or changed by the whole branch (old and new), exactly.`,
  { label: 'fix', phase: 'Fix', schema: BUILD_SCHEMA })
return { built, reviews, fixed }
