#!/usr/bin/env python3
"""
Builds Inter for 21Board, the font of the board and every widget:

  fonts/Inter-21Board.woff2                          the roman: 21Board's text, in every widget (board.js, "The board's font")
  widgets/calculator/fonts/InterItalic-21Board.woff2 the italic: the Calculator's letters a, b, n, x, and the word "of"

Sources (SIL Open Font License 1.1, no Reserved Font Name), from the google/fonts repository:
  https://github.com/google/fonts/tree/main/ofl/inter
  ofl/inter/Inter[opsz,wght].ttf         876,576 bytes  SHA-256 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031
  ofl/inter/Inter-Italic[opsz,wght].ttf  906,596 bytes  SHA-256 acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6
  ofl/inter/OFL.txt                                     SHA-256 5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57
  Inter "Version 4.001;git-66647c0bb", by Rasmus Andersson and the Inter Project Authors.
Copy OFL.txt next to each output as fonts/Inter-OFL.txt and widgets/calculator/fonts/Inter-OFL.txt. This tool doesn't.

Tested with fontTools 4.68.0, brotli 1.2.1, and Python 3.13. Other versions may give other bytes.

What is done to the roman:
  1. The source's SHA-256 is checked. Any other file is refused.
  2. Opened with no new timestamps, so the same sources give the same bytes.
  3. opsz is pinned at 14 (text size). The weight axis, 100 to 900, is kept.
  4. The calt lookups that turn -> <- => and the like into arrows are dropped, so -> stays two characters.
  5. The regular is made heavier: CSS 400 draws Inter's 490, 500 draws 560, 600 draws 630, and 300 and below, 700 and
     above draw as before. A new avar does it, and fvar's default moves so the default outlines stay Inter's 400.
  6. ss04 is frozen: I gets bars and l gets a tail, wherever they appear.
  7. Cut down to tools/inter-chars.json "roman". Kept: kerning, accents, tnum and pnum digits, every name record,
     STAT, HVAR, and MVAR. Never cv11 (the one-story a) or any other stylistic set. DSIG goes.
  8. Name ID 5 gets "; 21Board subset". The family stays "Inter".
The italic gets steps 1, 2, 3, 5, 7, and 8, cut down to tools/inter-chars.json "italic".

Run (needs: pip install fonttools brotli):
  python3 tools/build-inter.py path/to/Inter[opsz,wght].ttf path/to/Inter-Italic[opsz,wght].ttf
Options: --out DIR (default: the repository)  --flavor woff2|ttf (ttf: to look at the result)
         --check (builds in a temporary folder and compares the bytes with the shipped files)
"""
import argparse, hashlib, io, json, os, sys, tempfile

# Sets and dicts must iterate the same way every run, or the subset's bytes can change.
if sys.flags.hash_randomization:
    env = {k: v for k, v in os.environ.items() if not k.startswith('PYTHON')}
    env['PYTHONHASHSEED'] = '0'
    os.execve(sys.executable, [sys.executable, '-s', '-P', os.path.abspath(__file__)] + sys.argv[1:], env)

import brotli, fontTools
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SHA = {'roman': '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031',
       'italic': 'acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6'}
OUTS = {'roman': os.path.join('fonts', 'Inter-21Board'),
        'italic': os.path.join('widgets', 'calculator', 'fonts', 'InterItalic-21Board')}
TESTED = {'fontTools': '4.68.0', 'brotli': '1.2.1'}
# CSS weight → the source's weight it draws. Piecewise linear between the points.
REMAP = [(100, 100), (300, 300), (400, 490), (700, 700), (900, 900)]

ap = argparse.ArgumentParser(description='Builds Inter for 21Board.')
ap.add_argument('roman', help='Inter[opsz,wght].ttf')
ap.add_argument('italic', help='Inter-Italic[opsz,wght].ttf')
ap.add_argument('--out', default=REPO)
ap.add_argument('--flavor', choices=['woff2', 'ttf'], default='woff2')
ap.add_argument('--check', action='store_true')
args = ap.parse_args()

versions = {'fontTools': fontTools.version, 'brotli': brotli.__version__}
print('fontTools', versions['fontTools'], ' brotli', versions['brotli'])
if versions != TESTED:
    print('Warning: tested with fontTools 4.68.0 and brotli 1.2.1. The bytes may differ.')

CHARS = json.load(open(os.path.join(HERE, 'inter-chars.json'), encoding='utf-8'))


def codepoints(groups):
    out = set()
    for ranges in groups.values():
        for r in ranges:
            a, _, b = r.partition('-')
            out.update(range(int(a, 16), int(b or a, 16) + 1))
    return sorted(out)


UNICODES = {'roman': codepoints(CHARS['roman']), 'italic': sorted(ord(c) for c in CHARS['italic'])}


def load(path):
    return TTFont(path, lazy=False, recalcTimestamp=False)


def reload(font):
    b = io.BytesIO()
    font.save(b)
    b.seek(0)
    return TTFont(b, lazy=False, recalcTimestamp=False)


def pin_opsz(font):
    return reload(instancer.instantiateVariableFont(font, {'opsz': 14}, updateFontNames=False))


def sub_tables(lookup):
    return [st.ExtSubTable if lookup.LookupType == 7 else st for st in lookup.SubTable]


def drop_arrows(font):
    """Step 4: drop the calt lookups that make an arrow glyph, directly or through the lookups they call."""
    lookups = font['GSUB'].table.LookupList.Lookup
    arrow = lambda g: 'rrow' in g or g.startswith('uni27F')

    def makes(i, seen=()):
        if i in seen:
            return False
        for st in sub_tables(lookups[i]):
            # (from, to) pairs. An arrow turned into another arrow (its .case form, beside capitals) doesn't count.
            pairs = []
            if hasattr(st, 'ligatures'):
                pairs = [(first, l.LigGlyph) for first, ls in st.ligatures.items() for l in ls]
            elif hasattr(st, 'mapping'):
                pairs = list(st.mapping.items())
            elif hasattr(st, 'alternates'):
                pairs = [(a, g) for a, v in st.alternates.items() for g in v]
            if any(arrow(b) and not arrow(a) for a, b in pairs):
                return True
            called = [r.LookupListIndex for name in ('SubstLookupRecord', 'SubstLookupRecords')
                      for r in getattr(st, name, None) or []]
            for rs in (getattr(st, 'ChainSubRuleSet', None) or []) + (getattr(st, 'ChainSubClassSet', None) or []):
                for rule in (getattr(rs, 'ChainSubRule', None) or getattr(rs, 'ChainSubClassRule', None) or []) if rs else []:
                    called += [r.LookupListIndex for r in rule.SubstLookupRecord]
            if any(makes(c, seen + (i,)) for c in called):
                return True
        return False

    dropped = set()
    for fr in font['GSUB'].table.FeatureList.FeatureRecord:
        if fr.FeatureTag == 'calt':
            dropped |= {i for i in fr.Feature.LookupListIndex if makes(i)}
    for fr in font['GSUB'].table.FeatureList.FeatureRecord:
        if fr.FeatureTag == 'calt':
            fr.Feature.LookupListIndex = [i for i in fr.Feature.LookupListIndex if i not in dropped]
            fr.Feature.LookupCount = len(fr.Feature.LookupListIndex)
    print('  calt arrow lookups dropped:', sorted(dropped))
    assert len(dropped) == 3, 'expected 3 arrow lookups in calt, found %d' % len(dropped)


def line(points, x):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    raise ValueError(x)


def heavier(font):
    """Step 5: compose REMAP with the font's avar, and move fvar's default to the weight that draws the old one."""
    ax = next(a for a in font['fvar'].axes if a.axisTag == 'wght')
    lo, d0, hi = ax.minValue, ax.defaultValue, ax.maxValue
    old = sorted(font['avar'].segments['wght'].items())
    d1 = line([(b, a) for a, b in REMAP], d0)
    n_old = lambda u: (u - d0) / (d0 - lo) if u < d0 else (u - d0) / (hi - d0)
    n_new = lambda u: (u - d1) / (d1 - lo) if u < d1 else (u - d1) / (hi - d1)
    breaks = {lo, hi, d1} | {a for a, _ in REMAP}
    for x, _ in old:
        breaks.add(line([(b, a) for a, b in REMAP], d0 + x * (d0 - lo) if x < 0 else d0 + x * (hi - d0)))
    font['avar'].segments['wght'] = {round(n_new(u), 6): line(old, n_old(line(REMAP, u))) for u in sorted(breaks)}
    ax.defaultValue = d1
    print('  wght default %g → %.2f; avar has %d points' % (d0, d1, len(breaks)))


def advances(font, weight, chars):
    f = instancer.instantiateVariableFont(reload(font), {'wght': weight})
    cmap = f.getBestCmap()
    return [f['hmtx'][cmap[ord(c)]][0] for c in chars]


def check_heavier(font, source):
    for new, was in [(400, 490), (500, 560), (600, 630), (700, 700), (300, 300)]:
        a, b = advances(font, new, 'noHЖπ'), advances(source, was, 'noHЖπ')
        assert all(abs(x - y) <= 1 for x, y in zip(a, b)), (new, a, was, b)
    print('  advances at 400, 500, 600, 700, and 300 match the source at 490, 560, 630, 700, and 300')


def freeze_ss04(font):
    """Step 6: point every cmap entry at its ss04 glyph."""
    gsub = font['GSUB'].table
    ss04 = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag == 'ss04':
            for i in fr.Feature.LookupListIndex:
                for st in sub_tables(gsub.LookupList.Lookup[i]):
                    ss04.update(getattr(st, 'mapping', {}))
    assert len(ss04) == 46, 'expected 46 ss04 glyphs, found %d' % len(ss04)
    for t in font['cmap'].tables:
        for cp, g in list(t.cmap.items()):
            if g in ss04:
                t.cmap[cp] = ss04[g]
    print('  ss04 frozen: %d glyphs' % len(ss04))


def cut(font, unicodes):
    """Step 7."""
    lacks = sorted(set(unicodes) - set(font.getBestCmap()))
    if lacks:
        sys.exit('The source has no ' + ', '.join('U+%04X' % c for c in lacks) + '. Fix tools/inter-chars.json.')
    o = subset.Options()
    o.layout_features = o.layout_features + ['tnum', 'pnum']
    o.name_IDs = ['*']
    o.name_languages = ['*']
    o.notdef_outline = True
    o.drop_tables = [t for t in o.drop_tables if t not in ('STAT', 'HVAR', 'MVAR')] + ['DSIG']
    s = subset.Subsetter(o)
    s.populate(unicodes=unicodes)
    s.subset(font)
    for t in ('STAT', 'fvar', 'avar', 'gvar', 'HVAR'):
        assert t in font, t + ' is missing'


def build(kind, src, out_dir):
    data = open(src, 'rb').read()
    sha = hashlib.sha256(data).hexdigest()
    if sha != SHA[kind]:
        sys.exit('%s is not Inter 4.001 (SHA-256 %s). Use the file named in this tool\'s header.' % (src, sha))
    print(kind + ':')
    source = pin_opsz(load(src))
    font = pin_opsz(load(src))
    if kind == 'roman':
        drop_arrows(font)
    heavier(font)
    font = reload(font)
    check_heavier(font, source)
    if kind == 'roman':
        freeze_ss04(font)
    font = reload(font)
    cut(font, UNICODES[kind])
    name = font['name']
    for rec in name.names:
        if rec.nameID == 5:
            rec.string = rec.toUnicode() + '; 21Board subset'
    out = os.path.join(out_dir, OUTS[kind] + '.' + args.flavor)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    font.flavor = 'woff2' if args.flavor == 'woff2' else None
    font.save(out)
    print('  %s: %.1f KB' % (os.path.relpath(out, out_dir), os.path.getsize(out) / 1024))
    return out


if args.check:
    if versions != TESTED:
        print('--check: these tool versions may not give the shipped bytes.')
    args.flavor = 'woff2'
    with tempfile.TemporaryDirectory() as tmp:
        bad = []
        for kind, src in (('roman', args.roman), ('italic', args.italic)):
            built = build(kind, src, tmp)
            shipped = os.path.join(REPO, OUTS[kind] + '.woff2')
            if not os.path.exists(shipped) or open(built, 'rb').read() != open(shipped, 'rb').read():
                bad.append(os.path.relpath(shipped, REPO))
        if bad:
            print('Differs from the build: ' + ', '.join(bad))
            sys.exit(1)
        print('The shipped fonts match the build.')
else:
    build('roman', args.roman, args.out)
    build('italic', args.italic, args.out)
