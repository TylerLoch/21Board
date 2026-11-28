#!/usr/bin/env python3
"""The frozen gate for Weather's layout.

Compares a candidate run of weather.js with a reference run, window by window, matched on the case id. A window
fails when any rule below holds. Windows the targets file names may fail rules 1, 2, 4, and 5, since they are meant
to change. They are reported in their own section, with every number.

  1. The temperature's digit height is under 0.92 x the reference's.
  2. A line shown in both runs (Now's lines, and each card's main text) draws under 0.90 x the reference's size.
  3. A card shown in the reference is missing, or a card is shown that wasn't in the reference.
  4. A card's empty share (the larger of empty down and empty across) is over 0.30 where the reference's was 0.30 or
     less, or rises by more than 0.08 where it was already over 0.30.
  5. Now's empty share across rises by more than 0.10 and ends over 0.30.
  6. The harness reports a problem, or any text is under 14 px.

With --new (base as --ref, head as --cand), a window fails only on a problem head has and base lacks in that window:
rule 6, matched on its text with the numbers outside quotes ignored, so an old problem that moved a pixel stays old.
A window base has and head lacks fails too. Rules 1 to 5 are reported, never failed.

Usage:
  python3 gate.py --ref <run> [<run>...] --cand <run> [<run>...] [--targets <targets.txt>] [--new]
                  [--out report.md] [--json gate.json] [--only REGEX] [--list-targets] [--brief N]

A run is a weather.js --out directory or its metrics.jsonl. Several runs on one side (the parts of one matrix) are
read as one.
Exit codes: 0 when no window fails (with --new: nothing new), 1 when one does, 2 on bad input.
Python 3 standard library only. See README.md beside this file.
"""
import argparse
import hashlib
import json
import os
import re
import sys

# ---- The rules' numbers. Frozen: the gate's whole point is that every round meets the same ones.
TEMP_RATIO = 0.92   # rule 1: digits under this x the reference's
TEXT_RATIO = 0.90   # rule 2: a line under this x the reference's font px
EMPTY_LINE = 0.30   # rule 4: a card's empty share may not cross this line...
EMPTY_RISE = 0.08   # rule 4: ...or rise by more than this once over it
NOW_RISE = 0.10     # rule 5: Now's empty share across may not rise by more than this...
NOW_LINE = 0.30     # rule 5: ...and end over this
MIN_TEXT = 14.0     # rule 6: screen px (CSS px x the board's Size)
EPS = 1e-9          # float slack only: the harness rounds px to 0.1 and shares to 0.001
TARGET_ALLOWED = (1, 2, 4, 5)

# Rule 2's lines: Now's lines, and each card's main text. (source in the metrics row, key, label)
# Left out on purpose: h3 (one heading size per window is its own rule), src and foot (the small print), and band
# (the warning and offline band, which a fix may shrink to Now's lines' size).
LINES = [
    ('keyPx', 'cond', 'sky'),
    ('keyPx', 'hl', 'high and low'),
    ('extraPx', 'place', 'place'),
    ('extraPx', 'more', "Now's other lines"),
    ('keyPx', 'wind', 'wind speed'),
    ('keyPx', 'days', 'days'),
    ('keyPx', 'hours', 'hours'),
    ('keyPx', 'wear', 'wear advice'),
    ('extraPx', 'note', 'wear note'),
    ('extraPx', 'say', 'Simple words'),
    ('keyPx', 'sun', 'sun times'),
    ('extraPx', 'moon', 'moon words'),
    ('keyPx', 'air', 'air number'),
    ('keyPx', 'alert', 'warning name'),
]
RULES = {
    1: 'temperature digits under 0.92 x the reference',
    2: 'a line under 0.90 x the reference',
    3: 'a card missing or added',
    4: 'a card over 0.30 empty, or 0.08 emptier once over',
    5: "Now's empty across up more than 0.10, ending over 0.30",
    6: 'a problem, or text under 14 px',
    0: 'not measured in the candidate run',
}
# Tyler's board fills 1366 x 768. His own windows are the canon's tyler-* cases and these sizes.
TYLER = re.compile(r'^(fill1366x768:|tyler-|1358x716|824x489|950x470|1066x480)')


# ---- Reading

def die(msg):
    print('gate: ' + msg, file=sys.stderr)
    sys.exit(2)


def load_run(p):
    """A run directory (or its metrics.jsonl): {id: row}, and the shots' scale its summary names."""
    f = os.path.join(p, 'metrics.jsonl') if os.path.isdir(p) else p
    if not os.path.isfile(f):
        die(f'no metrics.jsonl at {p}')
    rows = {}
    with open(f, encoding='utf-8') as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                j = json.loads(line)
            except ValueError as e:
                die(f'{f}:{n}: not JSON ({e})')
            if 'id' not in j:
                die(f'{f}:{n}: a row with no id')
            if j['id'] in rows:
                die(f'{f}:{n}: two rows for {j["id"]}')
            rows[j['id']] = j
    scale = None
    s = os.path.join(os.path.dirname(f), 'summary.md')
    if os.path.isfile(s):
        with open(s, encoding='utf-8') as fh:
            m = re.search(r'\bscale (\d+(?:\.\d+)?)\b', fh.read(4000))
            if m:
                scale = m.group(1)
    return rows, scale, f


def load_runs(ps):
    """Several runs read as one (the parts of a matrix): {id: row}, the scale, and a label for the report."""
    if len(ps) == 1:
        return load_run(ps[0])
    rows, scales, files = {}, set(), []
    for p in ps:
        r, s, f = load_run(p)
        for k in r:
            if k in rows:
                die(f'two rows for {k} ({f} and an earlier run)')
        rows.update(r)
        files.append(f)
        if s:
            scales.add(s)
    return rows, ','.join(sorted(scales)) or None, f'{files[0]} and {len(files) - 1} more'


class Target:
    def __init__(self, tag, pattern, drops, line):
        self.tag, self.pattern, self.drops, self.line = tag, pattern, drops, line
        try:
            self.rx = re.compile(pattern)
        except re.error as e:
            die(f'targets line {line}: bad regex {pattern!r} ({e})')

    def match(self, cid):
        return self.rx.fullmatch(cid) is not None


def load_targets(p):
    """One case-id pattern per line, matched against the whole id. '#' starts a comment. A '[tag]' line names the
    group the patterns under it belong to. After a pattern, 'drop=<card>[,<card>]' lets those cards go missing
    (rule 3) in its windows."""
    if not p:
        return []
    if not os.path.isfile(p):
        die(f'no targets file at {p}')
    out, tag = [], ''
    with open(p, encoding='utf-8') as fh:
        for n, raw in enumerate(fh, 1):
            line = raw.split('#', 1)[0].strip()
            if not line:
                continue
            m = re.fullmatch(r'\[(.+)\]', line)
            if m:
                tag = m.group(1).strip()
                continue
            parts = line.split(None, 1)
            drops = []
            if len(parts) > 1:
                opt = parts[1].strip()
                m = re.fullmatch(r'drop=(.+)', opt)
                if not m:
                    die(f'targets line {n}: after the pattern, only drop=<card>[,<card>] ({opt!r})')
                drops = [d.strip() for d in m.group(1).split(',') if d.strip()]
            out.append(Target(tag, parts[0], drops, n))
    return out


# ---- Measures

def digits(j):
    t = j.get('tempPx') or {}
    return t.get('digits') or None


def empty(c):
    return max(c.get('emptyV') or 0, c.get('emptyH') or 0)


def cards_of(j):
    """{name: card}. Two cards of one name (none in rounds 0 to 3) are told apart as 'name #2'."""
    out = {}
    for c in j.get('cards') or []:
        n, k = c['name'], 2
        while n in out:
            n = f"{c['name']} #{k}"
            k += 1
        out[n] = c
    return out


def zoom(j):
    return j.get('zoom') or 1


def f1(v):
    if v is None:
        return '-'
    v = round(v, 1)
    return str(int(v)) if v == int(v) else str(v)


def sh(v):
    return '-' if v is None else f'{v:.3f}'


def pct(r, c):
    if not r or c is None:
        return ''
    d = (c / r - 1) * 100
    return f'{d:+.0f}%' if abs(d) >= 0.5 else '0%'


# ---- The rules

def fail(rule, what, ref, cand, sev, text):
    return {'rule': rule, 'what': what, 'ref': ref, 'cand': cand, 'sev': round(sev, 4), 'text': text}


def compare(r, c):
    """Every rule a candidate window breaks against its reference window."""
    out = []
    # 1. The temperature.
    rt, ct = digits(r), digits(c)
    if rt:
        if not ct:
            out.append(fail(1, 'temperature', rt, None, 1.0, f'temperature {f1(rt)} -> none'))
        elif ct < TEMP_RATIO * rt - EPS:
            out.append(fail(1, 'temperature', rt, ct, 1 - ct / rt, f'temperature {f1(rt)} -> {f1(ct)} ({pct(rt, ct)})'))
    # 2. Each line shown in both.
    for src, key, label in LINES:
        rv, cv = (r.get(src) or {}).get(key), (c.get(src) or {}).get(key)
        if rv and cv and cv < TEXT_RATIO * rv - EPS:
            out.append(fail(2, label, rv, cv, 1 - cv / rv, f'{label} {f1(rv)} -> {f1(cv)} ({pct(rv, cv)})'))
    # 3. The cards, and Now.
    rc, cc = cards_of(r), cards_of(c)
    for n in rc:
        if n not in cc:
            out.append(fail(3, n, n, None, 1.0, f'{n} missing'))
    for n in cc:
        if n not in rc:
            out.append(fail(3, n, None, n, 0.0, f'{n} added'))
    if r.get('hero') and not c.get('hero'):
        out.append(fail(3, 'Now', 'Now', None, 1.0, 'Now missing'))
    if c.get('hero') and not r.get('hero'):
        out.append(fail(3, 'Now', None, 'Now', 0.0, 'Now added'))
    # 4. Each card's empty share.
    for n, x in rc.items():
        y = cc.get(n)
        if not y:
            continue
        re_, ce = empty(x), empty(y)
        if (re_ <= EMPTY_LINE + EPS and ce > EMPTY_LINE + EPS) or (re_ > EMPTY_LINE + EPS and ce > re_ + EMPTY_RISE + EPS):
            way = 'down' if (y.get('emptyV') or 0) >= (y.get('emptyH') or 0) else 'across'
            out.append(fail(4, n, re_, ce, ce - re_,
                            f'{n} empty {sh(re_)} -> {sh(ce)} {way} ({x["w"]}x{x["h"]} -> {y["w"]}x{y["h"]})'))
    # 5. Now's empty across.
    rh, ch = r.get('hero'), c.get('hero')
    if rh and ch:
        a, b = rh.get('emptyH') or 0, ch.get('emptyH') or 0
        if b - a > NOW_RISE + EPS and b > NOW_LINE + EPS:
            out.append(fail(5, 'Now', a, b, b - a, f"Now's empty across {sh(a)} -> {sh(b)}"))
    # 6. Problems, and text under 14 px.
    out.extend(problems(c))
    return out


def problems(c):
    """Rule 6 alone: the harness's problems in a window, and text under 14 px."""
    out = []
    for p in c.get('problems') or []:
        out.append(fail(6, 'problem', None, p, 1.0, f'problem: {p}'))
    mt = c.get('minTextPx')
    if mt is not None and mt * zoom(c) < MIN_TEXT - EPS:
        out.append(fail(6, 'text', None, mt * zoom(c), 1.0,
                        f'text at {f1(mt * zoom(c))} px: "{c.get("minTextOf", "")}"'))
    return out


def same_problem(text):
    """A rule 6 failure's text with its numbers masked outside quotes, for --new: an overlap by 3.2 px that becomes
    3.4 px, or an empty row that moves, is the problem base already had. The words in quotes stay as they are."""
    parts = re.split(r'(“[^”]*”|"[^"]*")', text)
    return ''.join(p if i % 2 else re.sub(r'\d+(?:\.\d+)?', '#', p) for i, p in enumerate(parts))


def mark_new(fails, base):
    """--new: marks each rule 6 failure new unless the base window (None when base lacks it) has the same problem,
    and a window head lacks (rule 0) new. Rules 1 to 5 are never new."""
    old = {same_problem(f['text']) for f in problems(base)} if base is not None else set()
    for f in fails:
        f['new'] = f['rule'] == 0 or (f['rule'] == 6 and same_problem(f['text']) not in old)
    return fails


def judge(fails, target):
    """Marks each failure allowed or not. A target may break rules 1, 2, 4, and 5, and lose the cards it drops."""
    for f in fails:
        if target is None:
            f['allowed'] = False
        elif f['rule'] in TARGET_ALLOWED:
            f['allowed'] = True
        else:
            f['allowed'] = f['rule'] == 3 and f['cand'] is None and f['ref'] in target.drops
    return fails


def named(f):
    return f'R{f["rule"]} {f["text"]}' if f['rule'] else f['text']


def worst_label(f):
    if f['rule'] == 0:
        return f['text']
    if f['rule'] in (1, 2):
        return f'R{f["rule"]} {f["what"]} -{f["sev"] * 100:.0f}%'
    if f['rule'] in (4, 5):
        return f'R{f["rule"]} {f["what"]} +{f["sev"]:.3f}'
    return f'R{f["rule"]} {f["text"]}'


# ---- The numbers, for the target section

def numbers(r, c):
    """Every number of a window, reference -> candidate, as table rows (measure, ref, cand, change)."""
    rows = []
    rows.append(('layout', (r or {}).get('cls', '-'), (c or {}).get('cls', '-'), ''))
    rt, ct = (r and digits(r)), (c and digits(c))
    rf = f1(((r or {}).get('tempPx') or {}).get('font'))
    cf = f1(((c or {}).get('tempPx') or {}).get('font'))
    rows.append(('temperature digits (font)', f'{f1(rt)} ({rf})', f'{f1(ct)} ({cf})', pct(rt, ct)))
    unit = lambda j: ((j or {}).get('tempPx') or {}).get('unit') or {}
    ru, cu = unit(r), unit(c)
    rows.append(('unit letter: ink over digits / baseline offset',
                 f'{ru.get("ratio", "-")} / {f1(ru.get("dy"))}', f'{cu.get("ratio", "-")} / {f1(cu.get("dy"))}', ''))
    for src in ('keyPx', 'extraPx'):
        keys = list(((r or {}).get(src) or {}).keys())
        keys += [k for k in ((c or {}).get(src) or {}) if k not in keys]
        for k in keys:
            rv, cv = ((r or {}).get(src) or {}).get(k), ((c or {}).get(src) or {}).get(k)
            rows.append((f'{src} {k}', f1(rv), f1(cv), pct(rv, cv)))
    rm = r and r.get('minTextPx') is not None and r['minTextPx'] * zoom(r)
    cm = c and c.get('minTextPx') is not None and c['minTextPx'] * zoom(c)
    rows.append(('smallest text, screen px', f1(rm or None), f1(cm or None), pct(rm, cm)))
    for k in ('coverage', 'ink'):
        rows.append((k, sh((r or {}).get(k)), sh((c or {}).get(k)), ''))
    rc, cc = cards_of(r or {}), cards_of(c or {})
    names = list(rc) + [n for n in cc if n not in rc]
    for n, x, y in [('Now', (r or {}).get('hero'), (c or {}).get('hero'))] + [(n, rc.get(n), cc.get(n)) for n in names]:
        size = lambda q: f'{q["w"]}x{q["h"]}' if q else '-'
        rows.append((f'{n}: size', size(x), size(y), ''))
        rows.append((f'{n}: empty down / across, ink',
                     f'{sh(x["emptyV"])} / {sh(x["emptyH"])}, {sh(x.get("fill"))}' if x else '-',
                     f'{sh(y["emptyV"])} / {sh(y["emptyH"])}, {sh(y.get("fill"))}' if y else '-', ''))
        rows.append((f'{n}: font px', f1(x and x.get('fs')), f1(y and y.get('fs')), pct(x and x.get('fs'), y and y.get('fs'))))
    rp = '; '.join((r or {}).get('problems') or []) or 'none'
    cp = '; '.join((c or {}).get('problems') or []) or 'none'
    rows.append(('problems', rp, cp, ''))
    return rows


# ---- The report

def esc(s):
    return str(s).replace('|', '\\|')


def main():
    ap = argparse.ArgumentParser(description="Weather's frozen layout gate: a candidate run against a reference run.")
    ap.add_argument('--ref', required=True, nargs='+',
                    help='the reference run: a weather.js --out directory, or its metrics.jsonl (several: one matrix in parts)')
    ap.add_argument('--cand', required=True, nargs='+', help='the candidate run, the same way')
    ap.add_argument('--targets', default='', help='the windows meant to change (one anchored regex per line)')
    ap.add_argument('--new', action='store_true',
                    help='fail only on a problem the candidate (head) has and the reference (base) lacks; report rules 1 to 5')
    ap.add_argument('--out', help='write the whole report here (markdown); stdout then gets a brief one')
    ap.add_argument('--json', help='write every result here as JSON')
    ap.add_argument('--only', help='compare only the case ids this regex finds (re.search)')
    ap.add_argument('--brief', type=int, default=40, help='failing windows listed on stdout with --out (default 40)')
    ap.add_argument('--list-targets', action='store_true', help="print each target pattern's windows in the reference and stop")
    a = ap.parse_args()

    R, rscale, rfile = load_runs(a.ref)
    C, cscale, cfile = load_runs(a.cand)
    targets = load_targets(a.targets)
    only = None
    if a.only:
        try:
            only = re.compile(a.only)
        except re.error as e:
            die(f'bad --only regex ({e})')

    ids = [k for k in R if not only or only.search(k)]
    extra = [k for k in C if k not in R and (not only or only.search(k))]

    def target_of(cid):
        for t in targets:
            if t.match(cid):
                return t
        return None

    if a.list_targets:
        bad = 0
        for t in targets:
            hits = [k for k in R if t.match(k)]
            bad += not hits
            print(f'[{t.tag}] {t.pattern}' + (f'  drop={",".join(t.drops)}' if t.drops else '') + f'  ({len(hits)})')
            for k in hits:
                print('   ', k)
            if not hits:
                print('    (matches no window in the reference)')
        sys.exit(1 if bad else 0)

    # Compare. (--new: a window fails only on what is new in it; the windows only head has are checked for problems.)
    res = []
    for k in ids:
        t = target_of(k)
        if k not in C:
            fs = [fail(0, 'window', k, None, 1.0, 'not in the head run' if a.new else 'not in the candidate run')]
        else:
            fs = compare(R[k], C[k])
        judge(fs, t)
        if a.new:
            mark_new(fs, R[k])
        blocking = [f for f in fs if f['new']] if a.new else [f for f in fs if not f['allowed']]
        res.append({'id': k, 'target': t, 'fails': fs, 'blocking': blocking,
                    'sev': max([f['sev'] for f in blocking], default=0),
                    'layout': (R[k].get('layout') or '', (C.get(k) or {}).get('layout') or '')})
    if a.new:
        for k in extra:
            fs = mark_new(judge(problems(C[k]), target_of(k)), None)
            res.append({'id': k, 'target': target_of(k), 'fails': fs, 'blocking': fs, 'only_cand': True,
                        'sev': max([f['sev'] for f in fs], default=0), 'layout': ('', C[k].get('layout') or '')})
    failing = sorted([x for x in res if x['blocking']], key=lambda x: (-x['sev'], x['id']))
    tres = [x for x in res if x['target']]

    by_rule = {n: 0 for n in RULES}
    by_rule_t = {n: 0 for n in RULES}
    for x in res:
        for n in {f['rule'] for f in x['blocking']}:
            by_rule[n] += 1
        for n in {f['rule'] for f in x['fails'] if f['allowed']}:
            by_rule_t[n] += 1
    by_size = {}
    for x in failing:
        s = x['id'].split(':', 1)[0]
        by_size[s] = by_size.get(s, 0) + 1
    tyler_n = sum(1 for k in ids if TYLER.search(k))
    tyler_f = [x for x in failing if TYLER.search(x['id'])]
    ok = not failing
    # --new: the windows that break rules 1 to 5 (reported only), each rule's windows, and the problems both runs have.
    sized = sorted([x for x in res if any(f['rule'] in (1, 2, 3, 4, 5) and not f['allowed'] for f in x['fails'])],
                   key=lambda x: (-max(f['sev'] for f in x['fails'] if f['rule'] in (1, 2, 3, 4, 5) and not f['allowed']), x['id']))
    broke = {n: sum(1 for x in res if any(f['rule'] == n and (n in (0, 6) or not f['allowed']) for f in x['fails'])) for n in RULES}
    olds = [x for x in res if any(f['rule'] == 6 and not f.get('new') for f in x['fails'])]
    new_n = sum(len(x['blocking']) for x in failing)

    # Write.
    L, B = [], []   # the whole report; the brief one for stdout

    def both(*lines):
        L.extend(lines)
        B.extend(lines)

    def sha(f):
        with open(f, 'rb') as fh:
            return hashlib.sha256(fh.read()).hexdigest()[:12]

    both('# Weather gate' + (': what is new' if a.new else ''), '')
    both(f'- Gate: `{os.path.abspath(__file__)}` sha256 {sha(__file__)}'
         + (f', targets sha256 {sha(a.targets)}' if a.targets else '') + '.')
    both(f'- {"Base" if a.new else "Reference"}: `{rfile}`, {len(R)} windows' + (f', scale {rscale}' if rscale else '') + '.',
         f'- {"Head" if a.new else "Candidate"}: `{cfile}`, {len(C)} windows' + (f', scale {cscale}' if cscale else '') + '.',
         f'- Targets: `{a.targets or "(none)"}`, {len(targets)} patterns, {len(tres)} windows.'
         + (f' Only ids matching `{a.only}`.' if a.only else ''), '')
    warn = []
    if rscale and cscale and rscale != cscale:
        warn.append(f'The runs were shot at different scales ({rscale} and {cscale}): empty shares move up to 1.2 points.')
    if extra:
        warn.append((f'{len(extra)} windows are only in the head run. Every problem in them is new.' if len(extra) > 1 else
                     'One window is only in the head run. Every problem in it is new.') if a.new else
                    f'{len(extra)} windows are only in the candidate run, and are not compared.')
    for t in targets:
        if not any(t.match(k) for k in ids):
            warn.append(f'Target pattern `{t.pattern}` matches no window compared.')
    for w in warn:
        both(f'Warning: {w}')
    if warn:
        both('')
    if a.new:
        both(f'**{"PASS" if ok else "FAIL"}.** {len(ids)} windows compared. {len(failing)} with a new problem.'
             + f' {len(sized)} break rules 1 to 5, reported only.', '')
        both('| rule | what | windows | new |', '|---|---|---|---|')
        for n in (1, 2, 3, 4, 5, 6, 0):
            if n == 0 and not broke[0]:
                continue
            both(f'| {n if n else "-"} | {RULES[n]} | {broke[n]} | {by_rule[n] if n in (0, 6) else "-"} |')
        both('', f'{new_n} new problems. {len(olds)} windows have problems base has too.', '')
        both(f"On Tyler's board and his own sizes: {len(tyler_f)} of {tyler_n} windows with a new problem.", '')
        if by_size:
            both('New problems by size: ' + ', '.join(f'{s} {n}' for s, n in sorted(by_size.items(), key=lambda q: (-q[1], q[0]))) + '.', '')
        both('## New problems', '')
        if not failing:
            both('None.')
        for i, x in enumerate(failing, 1):
            lay = x['layout'][1] or x['layout'][0]
            note = ' Not in the base run.' if x.get('only_cand') else ''
            line = f'{i}. **{x["id"]}** ({lay}).{note} ' + '; '.join(named(f) for f in x['blocking'])
            L.append(line)
            if i <= a.brief:
                B.append(line)
        if len(failing) > a.brief:
            B.append(f'... and {len(failing) - a.brief} more' + (f' in {a.out}' if a.out else '') + '.')
        both('')
    else:
        both(f'**{"PASS" if ok else "FAIL"}.** {len(ids)} windows compared. {len(failing)} failing.'
             + f' {len(tres)} targets, {sum(1 for x in tres if not x["blocking"])} within their allowances.', '')
        both('| rule | what fails | failing windows | targets that break it, allowed |', '|---|---|---|---|')
        for n in (1, 2, 3, 4, 5, 6, 0):
            if n == 0 and not by_rule[0]:
                continue
            both(f'| {n if n else "-"} | {RULES[n]} | {by_rule[n]} | {by_rule_t[n] if n in TARGET_ALLOWED or n == 3 else "-"} |')
        both('', f"On Tyler's board and his own sizes: {len(tyler_f)} of {tyler_n} windows failing.", '')
        if by_size:
            both('Failing windows by size: ' + ', '.join(f'{s} {n}' for s, n in sorted(by_size.items(), key=lambda q: (-q[1], q[0]))) + '.', '')

    # Targets.
    if targets or not a.new:
        both('## Targets', '')
    if not targets and not a.new:
        both('No targets.', '')
    tags = []
    for t in targets:
        if t.tag not in tags:
            tags.append(t.tag)
    for tag in tags:
        both(f'### {tag or "(no tag)"}', '')
        for t in [t for t in targets if t.tag == tag]:
            hits = [x for x in tres if x['target'] is t]
            both(f'Pattern `{t.pattern}`' + (f', may drop {", ".join(t.drops)}' if t.drops else '')
                 + f': {len(hits)} window{"" if len(hits) == 1 else "s"}.', '')
            for x in hits:
                k = x['id']
                allowed = [f for f in x['fails'] if f['allowed']]
                if x['blocking']:
                    verdict = ('NEW ' if a.new else 'FAILS ') + '; '.join(named(f) for f in x['blocking'])
                elif allowed:
                    verdict = 'changes as meant: ' + '; '.join(named(f) for f in allowed)
                else:
                    verdict = 'meets every rule'
                both(f'- **{k}**: {verdict}')
                L.append('')
                L.append('  | measure | reference | candidate | change |')
                L.append('  |---|---|---|---|')
                for m, rv, cv, ch in numbers(R.get(k), C.get(k)):
                    L.append(f'  | {esc(m)} | {esc(rv)} | {esc(cv)} | {ch} |')
                L.append('')
            B.append('')

    if a.new:
        # Rules 1 to 5, reported. Then the problems both runs have.
        both('## Rules 1 to 5, largest change first', '')
        if not sized:
            both('None.')
        else:
            B.append(f'{len(sized)} windows' + (f', in {a.out}.' if a.out else '.'))
        for i, x in enumerate(sized, 1):
            fs = sorted([f for f in x['fails'] if f['rule'] in (1, 2, 3, 4, 5) and not f['allowed']], key=lambda f: (f['rule'], -f['sev']))
            lay = x['layout'][0] if x['layout'][0] == x['layout'][1] else f'{x["layout"][0]} -> {x["layout"][1]}'
            L.append(f'{i}. **{x["id"]}** ({lay}{", target" if x["target"] else ""}). ' + '; '.join(named(f) for f in fs))
        both('')
        L.extend(['## Problems base has too', ''])
        if not olds:
            L.append('None.')
        for i, x in enumerate(olds, 1):
            L.append(f'{i}. **{x["id"]}**. ' + '; '.join(named(f) for f in x['fails'] if f['rule'] == 6 and not f['new']))
        L.append('')
    else:
        # Failing.
        both('## Failing windows, worst drop first', '')
        if not failing:
            both('None.', '')
        for i, x in enumerate(failing, 1):
            lay = x['layout'][0] if x['layout'][0] == x['layout'][1] or x['id'] not in C else f'{x["layout"][0]} -> {x["layout"][1]}'
            w = max(x['blocking'], key=lambda f: f['sev'])
            each = '; '.join(named(f) for f in sorted(x['blocking'], key=lambda f: (f['rule'], -f['sev'])))
            line = (f'{i}. **{x["id"]}** ({lay}{", target" if x["target"] else ""}). '
                    + (f'Worst: {worst_label(w)}. {each}' if len(x['blocking']) > 1 else each))
            L.append(line)
            if i <= a.brief:
                B.append(line)
        if len(failing) > a.brief:
            B.append(f'... and {len(failing) - a.brief} more' + (f' in {a.out}' if a.out else '') + '.')
        both('')

    if a.out:
        with open(a.out, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(L) + '\n')
        print('\n'.join(B))
        print(f'Report: {a.out}')
    else:
        print('\n'.join(L))
    if a.json:
        def jt(t):
            return None if t is None else {'tag': t.tag, 'pattern': t.pattern, 'drops': t.drops}
        out = {'pass': ok, 'ref': rfile, 'cand': cfile, 'targets': a.targets, 'compared': len(ids),
               'failing': len(failing), 'byRule': {str(k): v for k, v in by_rule.items()},
               'targetsByRule': {str(k): v for k, v in by_rule_t.items()}}
        if a.new:
            out.update({'mode': 'new', 'newProblems': new_n, 'oldWindows': len(olds), 'sizeWindows': len(sized),
                        'brokeByRule': {str(k): v for k, v in broke.items()},
                        'new': [{'id': x['id'], 'layout': x['layout'][1], 'onlyHead': bool(x.get('only_cand')),
                                 'problems': [f['text'] for f in x['blocking']]} for x in failing]})
        out['windows'] = [{'id': x['id'], 'target': jt(x['target']), 'sev': x['sev'], 'fails': x['fails']} for x in res if x['fails']]
        with open(a.json, 'w', encoding='utf-8') as fh:
            json.dump(out, fh, indent=1)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
