# Releasing 21Board

Every release follows these steps.

## 1. Spec

Write down exactly what to build: Tyler's decisions, every word on screen, the tests, and the docs and guides to update.
A change people will see gets mockups first. Tyler approves them before anything is built.

End the spec with the commit trailers this session uses. Every commit in the release carries them.

Keep the spec in a folder of its own outside the repo. The build puts its logs and screenshots there.

## 2. Build, review, fix

The main branch is `claude/focused-curie-9oovoy`, GitHub's default. Make a branch and a worktree from its tip:

```bash
git worktree add -b <key> <spec folder>/wt claude/focused-curie-9oovoy
```

Then run `tools/release-workflow.js` with Claude Code's Workflow tool. Its top lists the args. It runs four agents:

- **Build.** Writes the tests first and shows they fail on the old code. Then builds the change, updates the docs and the
  guides, stamps the release, and commits.
- **Review**, two at once:
  - **Behaviour** tries to get around the change, the way a curious student would.
  - **Look, words, and tests** compares the screens to the mockups and every string to CLAUDE.md's voice.
- **Fix.** Reproduces each finding and adds a failing test. Then fixes it, stamps again, and takes the final screenshots.

If the workflow stops without a result, resume it with the same args.

Read each agent's result. Check the commit yourself before going on.

## 3. Stamp

VERSION in `sw.js` names the release with the date and a counter, such as `2026.11.20-1`. Pass the next free one to
the workflow as `version`. The workflow stamps the release. Stamp again yourself after any later change, such as a
merge:

```bash
node tools/build-sdk.js && node tools/release.js
```

```bash
node tools/build-sdk.js --check && node tools/release.js --check
```

The stamp keeps a device from ever running half of one version and half of another. The Teacher Guide reads its
version from `sw.js`.

## 4. Test everything

From the worktree:

```bash
node tools/test-halves.js
```

It runs the whole of `tests/run.js` as two halves at once, in about 40 minutes. Never run more than two test
processes at once. The machine has 16 GB and no swap. Before a failure counts, rerun its suite alone with
`node tests/run.js "<suite title>"`.

## 5. Merge

From the main checkout:

```bash
git merge --no-ff --no-commit <key>
```

Resolve each conflict hunk by hunk. Never take a whole file from one side.

If the main branch moved since the branch was made, stamp again and test everything again. The stamp's lines in
`sw.js` and `index.html` conflict then. Never fix them by hand. Then commit with the spec's trailers.

## 6. Push

Push the main branch only. No pull requests. If the push fails, try again.

```bash
git push -u origin claude/focused-curie-9oovoy
```

## 7. Publish

Build, check, and publish each one again to its link in CLAUDE.md:

- the Teacher Guide, after any change to the interface, a widget, or how the board behaves;
- the Calculator manual, after any change to the Calculator.

Each one's README has the steps.

## 8. Report and tidy up

- Send Tyler the final screenshots and anything left open.
- If the release answers a row in the tracker, update that row.
- Remove the worktree, then its branch.
