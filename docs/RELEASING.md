# Releasing 21Board

Every release follows these steps. Each one catches something the others miss.

## 1. Spec

Write down exactly what to build: Tyler's decisions, every word on screen, the tests, and the docs and guides to update.
A change people will see gets mockups first, and Tyler approves them before anything is built.

Keep the spec in a folder of its own outside the repo. The build puts its logs and screenshots there.

## 2. Build, review, fix

The main branch is `claude/focused-curie-9oovoy`, GitHub's default. Make a branch and a worktree from its tip:

```bash
git worktree add -b <key> <folder>/wt HEAD
```

Then run `tools/release-workflow.js` with Claude Code's Workflow tool. Its top lists the args. It runs four agents:

- **Build.** Writes the tests first and shows they fail on the old code. Then builds the change, updates the docs and the
  guides, stamps the release and commits.
- **Review**, two at once:
  - **Behaviour** tries to get around the change, the way a curious student would.
  - **Look, words and tests** compares the screens to the mockups and every string to CLAUDE.md's voice.
- **Fix.** Reproduces each finding, adds a failing test, fixes it, stamps again and takes the final screenshots.

Read each agent's result. Check the commit yourself before going on.

## 3. Stamp

VERSION in `sw.js` names the release. After any change to a file the app ships:

```bash
node tools/build-sdk.js && node tools/release.js
```

```bash
node tools/build-sdk.js --check && node tools/release.js --check
```

The stamp keeps a device from ever running half of one version and half of another.

## 4. Test everything

From the worktree:

```bash
node tools/test-halves.js
```

It runs the whole of `tests/run.js` as two halves at once, in about 40 minutes. Never run more than two test
processes at once. The machine has 16 GB and no swap. A failure seen once gets a rerun on its own before it counts.

## 5. Merge

Merge into the main branch without a fast-forward, and look at every conflict hunk by hunk. Never take a whole file
from one side.

```bash
git merge --no-ff --no-commit <key>
```

## 6. Push

Push the main branch only. No pull requests.

## 7. Publish

Build, check and publish again to their usual links:

- the Teacher Guide, after any change to the interface, a widget or how the board behaves;
- the Calculator manual, after any change to the Calculator.

Each one's README has the steps.

## 8. Report and tidy up

- Send Tyler the final screenshots and anything left open.
- Remind him that production needs LICENSE and LICENSE-DOCS uploaded with every release.
- Remove the worktree and its branch.
