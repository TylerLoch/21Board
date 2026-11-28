# Weather's layout checks

These tools draw the Weather widget in thousands of windows and check what a change does to them. GitHub runs them
when a push changes Weather.

## The tools

- **weather.js** measures each window: its text sizes, how full each card is, and any problem, such as text cut off,
  text over text, or a part under a corner mark. One line per window in `metrics.jsonl`.
- **weather-steady.js** checks that Weather holds still. Widening a window a few pixels shouldn't flip its layout
  and back. A window reached from wider or narrower should draw the same. Thunderstorms, -13°, and 104° should come
  and go and leave it as it was. One line per check in `steady.jsonl`.
- **gate.py** compares two runs of weather.js window by window.
- **selftest/** holds a stylesheet that breaks the layout. The checks must fail with it.

## Matrices

| matrix | what |
|---|---|
| canon | 18 windows, with pictures |
| quick | 251 windows: 13 sizes and 15 mixes, and the views |
| full | 6,336 windows: 22 sizes with every mix of parts, and the bands, °C, text styles, and padlocks |
| own | 1,024 windows: Tyler's 4 sizes with every mix, from own.json |
| jit | 1,792 windows: 7 sizes between the usual ones, from jit.json |
| steady | 71 checks at Tyler's sizes, 480 to 540 tall and filling the board, from steady.json |
| steady-more | 37 more checks, about 27 minutes on one browser |
| steady-all | both |

## Here

Each run opens one browser. On a 16 GB machine, run at most two at once.

```bash
node tools/layout/weather.js --matrix own
node tools/layout/weather-steady.js
```

Results go to `tests/output/layout/<matrix>/`. To compare a change with main, measure both with this checkout's
tools, then compare:

```bash
node tools/layout/weather.js --matrix own --root <main checkout> --out base
node tools/layout/weather.js --matrix own --out head
python3 tools/layout/gate.py --new --ref base --cand head
```

`--css <file>` adds a stylesheet to head, to try an idea without editing the widget. `--list` prints the windows or
checks and stops.

## On GitHub

`.github/workflows/layout.yml` runs on a push that changes `widgets/weather/`, `tests/lib.js`,
`tests/fixtures/weather/`, `tools/layout/`, or the workflow. Five parts each measure a fifth of full, own, jit, and
steady, on head and base at once. Base is the merge base with main, or the commit before on main.

The last job compares them. It fails only on something new in head:

- Text under 14 px, cut off, overlapping, or under a corner mark, or a page error.
- A flip, a path that differs, or a swap that doesn't come back.

Changes in size are reported, never failed, since a layout change means them.

```bash
node tools/ci-wait.js --layout
node tools/ci-wait.js --layout --out <dir>
```

The first waits for the run and prints each part's time, the verdicts, and every new problem. The second also saves
the results in `<dir>`: both runs, the reports, and pictures of each window with something new, base and head.

To run it by hand, open Actions, then Layout, then Run workflow. Or:

```bash
gh api -X POST repos/TylerLoch/21Board/actions/workflows/layout.yml/dispatches -f ref=<branch> \
  -f 'inputs[css]=tools/layout/selftest/break.css'
```

The inputs are `base`, a commit to compare with; `matrices`, such as `steady-more`; and `css`, a stylesheet for head.
With `selftest/break.css`, the run must fail.

**For IT.**

- Node 22 and Playwright 1.63.0, as the tests install them. gate.py needs Python 3 and nothing else.
- Each tool's options are in the comment at its top. `--part i/n` runs one part. Every window and check is in exactly
  one part.
- Exit 0: everything ran, or nothing is new. Exit 1: a window or check failed, or something is new. Exit 2: a bad
  option or a crash.
- weather.js and weather-steady.js use the checkout's own `tests/lib.js` and `tests/fixtures/weather/`. Nothing
  reaches a real site.
- `gate.py --new` matches a problem by window and text, with the numbers outside quotes masked. A problem that moved
  a pixel stays old. Without `--new`, it holds head to rules 1 to 6 against base:

  | rule | fails when |
  |---|---|
  | 1 | the temperature's digits are under 0.92 × base's |
  | 2 | a line draws under 0.90 × base's size |
  | 3 | a card is missing or added |
  | 4 | a card goes over 0.30 empty, or 0.08 emptier once over |
  | 5 | Now's empty share across rises by over 0.10 and ends over 0.30 |
  | 6 | a problem, or text under 14 px |

- To move a steadiness check between steady and steady-more, change its `set` in steady.json.
- GitHub keeps the results for 7 days, as the artifact `layout`. A public repository's runs cost nothing.
