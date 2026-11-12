#!/usr/bin/env python3
"""
Builds the fonts for Settings → Appearance → Letters (board.js section 12b, "Letters"):

  fonts/AtkinsonHyperlegible-Regular.woff2, -Bold.woff2   "Easier to read"
  fonts/EarlyReaders-Regular.woff2, -Bold.woff2           "Early readers"

Sources (SIL Open Font License 1.1), from the google/fonts repository:
  https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible   AtkinsonHyperlegible-Regular.ttf, -Bold.ttf, OFL.txt
    (Atkinson Hyperlegible 1.006 by the Braille Institute: no Reserved Font Name)
  https://github.com/google/fonts/tree/main/ofl/andika                 Andika-Regular.ttf, -Bold.ttf, OFL.txt
    (Andika 6.101 by SIL International, Reserved Font Names "Andika" and "SIL")
Copy each OFL.txt next to the fonts as fonts/AtkinsonHyperlegible-OFL.txt and fonts/EarlyReaders-OFL.txt.

What is done to them:
  - Cut down to the characters 21Board and its widgets need: Basic Latin, Latin-1, Latin Extended-A (names
    such as Łukasz, Dvořák, Şule), Ș ș Ț ț, and the punctuation and symbols the board uses (’ “ ” … · × ‹ › – —
    • − € ™). Anything else (Cyrillic, Vietnamese, symbols such as ▦) comes from the device's own font.
  - Kept: the fonts' hinting, kerning and accents, tabular digits (tnum: the Clock and Timer use them so the time
    doesn't jiggle), and all name records (copyright, licence). WOFF2.
  - Andika only, because a cut-down font is a Modified Version and the OFL doesn't let one keep a Reserved Font
    Name (OFL-FAQ 2.6): it is renamed "21Board Early Readers". Its line height is also brought down to what
    these characters need (Andika keeps room for stacked Vietnamese accents: 1.61 em; now 1.36 em, like the
    devices' own fonts), so menus and title bars keep their size.

Run (needs: pip install fonttools brotli):
  python3 tools/build-letter-fonts.py path/to/AtkinsonHyperlegible-Regular.ttf path/to/AtkinsonHyperlegible-Bold.ttf \\
                                      path/to/Andika-Regular.ttf path/to/Andika-Bold.ttf
Options: --out DIR (default: fonts/ in the repository)  --flavor woff2|ttf (ttf: to look at the result)
"""
import argparse, os
from fontTools.ttLib import TTFont
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('src', nargs='+', help='the original .ttf files (any order)')
ap.add_argument('--out', default=os.path.join(HERE, '..', 'fonts'))
ap.add_argument('--flavor', choices=['woff2', 'ttf'], default='woff2')
args = ap.parse_args()

UNICODES = (list(range(0x20, 0x7F))            # Basic Latin
            + list(range(0xA0, 0x100))         # Latin-1 (· × é ñ ü …)
            + list(range(0x100, 0x180))        # Latin Extended-A
            + [0x218, 0x219, 0x21A, 0x21B]     # Ș ș Ț ț (Romanian)
            + [0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x2032, 0x2033,
               0x2039, 0x203A, 0x20AC, 0x2122, 0x2190, 0x2192, 0x2212])   # – — ‘ ’ ‚ “ ” „ • … ′ ″ ‹ › € ™ ← → −

# family in the original → (file name stem, family name in the result or None to keep it,
#                            new ascent and descent in font units or None to keep them)
# Andika's: room for the accents left (ĺ ĥ Å up top, ļ ņ ķ Ģ below), the same in both weights so they line up.
FONTS = {
    'Atkinson Hyperlegible': ('AtkinsonHyperlegible', None, None),
    'Andika': ('EarlyReaders', '21Board Early Readers', (2176, 608)),
}


def rename(font, family, style):
    """A new primary name (OFL condition 3), everything else (copyright, licence, authors) kept."""
    name = font['name']
    ps = family.replace(' ', '') + '-' + style
    version = name.getDebugName(5) or ''
    for rec in list(name.names):
        if rec.nameID in (16, 17, 18, 21, 22):   # typographic / compatible names: the ones below are enough
            name.removeNames(nameID=rec.nameID)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(f'{family} {style}; {version}', 3, 3, 1, 0x409)
    name.setName(family if style == 'Regular' else f'{family} {style}', 4, 3, 1, 0x409)
    name.setName(f'{version}; 21Board subset', 5, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    name.setName('Andika 6.101 by SIL International, cut down to the Latin letters 21Board needs and renamed '
                 'as the SIL Open Font License requires (Andika is a Reserved Font Name). '
                 'Andika: https://software.sil.org/andika/', 10, 3, 1, 0x409)
    # (Mac-platform copies of the names would still say Andika: drop them, Windows-platform ones are enough.)
    for rec in list(name.names):
        if rec.platformID != 3:
            name.names.remove(rec)


def tighten(font, asc, desc):
    """A smaller line height, still with room for every glyph that is left."""
    glyf = font['glyf']
    top = bottom = 0
    for g in font.getGlyphOrder():
        gl = glyf[g]
        if gl.numberOfContours == 0:
            continue
        gl.recalcBounds(glyf)
        top, bottom = max(top, gl.yMax), min(bottom, gl.yMin)
    if top > asc or -bottom > desc:
        raise SystemExit(f'the glyphs reach {top} and {bottom}: more than the line height allows ({asc}, {-desc})')
    hhea, os2 = font['hhea'], font['OS/2']
    hhea.ascent, hhea.descent, hhea.lineGap = asc, -desc, 0
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = asc, -desc, 0
    os2.usWinAscent, os2.usWinDescent = asc, desc


os.makedirs(os.path.abspath(args.out), exist_ok=True)
total = 0
for src in args.src:
    font = TTFont(src, recalcTimestamp=False)   # (the same files every time it is run)
    family = font['name'].getDebugName(1)
    style = 'Bold' if font['OS/2'].usWeightClass >= 600 else 'Regular'
    if family not in FONTS:
        raise SystemExit(f'{src}: expected Atkinson Hyperlegible or Andika, not {family}')
    if font['OS/2'].fsSelection & 1:
        raise SystemExit(f'{src}: italic fonts are not used')
    stem, new_family, metrics = FONTS[family]

    opts = subset.Options()
    opts.layout_features = opts.layout_features + ['tnum', 'pnum']   # tabular digits for clocks and timers
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.drop_tables = opts.drop_tables + ['Silt']   # (Andika's Graphite tables: browsers don't use them)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    note = ''
    if new_family:
        rename(font, new_family, style)
        note = f', renamed "{new_family}"'
    if metrics:
        tighten(font, *metrics)
        note += f', line height {sum(metrics) / font["head"].unitsPerEm:.2f} em'

    out = os.path.join(args.out, f'{stem}-{style}.{args.flavor}')
    font.flavor = 'woff2' if args.flavor == 'woff2' else None
    font.save(out)
    size = os.path.getsize(out)
    total += size
    print(f'wrote {os.path.relpath(out)} ({size / 1024:.1f} KB, {len(font.getBestCmap())} characters{note})')
print(f'total {total / 1024:.1f} KB')
