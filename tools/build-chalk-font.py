#!/usr/bin/env python3
"""
Builds the chalk font for the Notes app's Chalkboard theme:
apps/notes/fonts/CrayonLibre-21Board.woff2

Source: Crayon Libre 1.05 by GGBotNet, CC0 1.0 (public domain):
  https://ggbot.itch.io/crayon-libre-font  (download the zip, use TrueType (.ttf)/CrayonLibre-Regular.ttf)

Changes for classroom use (CC0 allows any changes):
  - Colon ':' is two plain dots. The original's lower dot has a tail, so "3:15" read as "3;15".
  - Capital 'I' gets top and bottom bars, so I, l and 1 all look different ("Il1").
  - Pictograph emoji (and a few CJK characters) are left out, so the system's color emoji
    and fonts show instead of a few stray chalk drawings (e.g. U+1F6AC, a cigarette).
  - Hinting dropped and compressed to WOFF2 (about 110 KB instead of 700 KB).

Run (needs: pip install fonttools brotli):
  python3 tools/build-chalk-font.py path/to/CrayonLibre-Regular.ttf
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools import subset

SRC = sys.argv[1] if len(sys.argv) > 1 else 'CrayonLibre-Regular.ttf'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'notes', 'fonts', 'CrayonLibre-21Board.woff2')

font = TTFont(SRC)
assert font['name'].getDebugName(1) == 'Crayon Libre', 'expected Crayon Libre'
gs = font.getGlyphSet()
glyf, hmtx = font['glyf'], font['hmtx']
cmap = font.getBestCmap()


def build(parts, advance):
    """parts: (glyph name, (xx, xy, yx, yy, dx, dy)) drawn into one new outline."""
    pen = TTGlyphPen(gs)
    for name, t in parts:
        target = TransformPen(pen, t)
        if t[0] * t[3] - t[1] * t[2] < 0:   # mirrored: keep the outline direction right
            target = ReverseContourPen(target)
        gs[name].draw(target)
    g = pen.glyph()
    g.recalcBounds(glyf)
    return g, (advance, g.xMin)


def bbox(name):
    g = glyf[name]
    return g.xMin, g.yMin, g.xMax, g.yMax


# --- Colon: two dots made from the period (the upper one mirrored, so they aren't identical).
period = cmap[ord('.')]
px0, py0, px1, py1 = bbox(period)
top = 980                                   # where the original colon's upper dot ends
up = top - py1
colon, colon_m = build([
    (period, (1, 0, 0, 1, 0, 0)),
    (period, (-1, 0, 0, 1, px0 + px1, up)),
], hmtx[period][0])

# --- Capital I: the original stem plus two bars cut from the hyphen.
I, hyphen = cmap[ord('I')], cmap[ord('-')]
ix0, iy0, ix1, iy1 = bbox(I)
hx0, hy0, hx1, hy1 = bbox(hyphen)
stem_w = ix1 - ix0
bar_w = round(stem_w * 2.1)
bar_h = round((hy1 - hy0) * 0.9)
left = ix0
shift = left + (bar_w - stem_w) / 2 - ix0   # center the stem under the bars
sx, sy = bar_w / (hx1 - hx0), bar_h / (hy1 - hy0)
Ibar, I_m = build([
    (I, (1, 0, 0, 1, shift, 0)),
    (hyphen, (sx, 0, 0, sy, left - hx0 * sx, iy1 - bar_h - hy0 * sy)),              # top bar
    (hyphen, (-sx, 0, 0, sy, left + bar_w + hx0 * sx, iy0 - hy0 * sy)),           # bottom bar, mirrored
], left + bar_w + ix0)

colon_name, I_name = cmap[ord(':')], I
glyf[colon_name], hmtx[colon_name] = colon, colon_m
glyf[I_name], hmtx[I_name] = Ibar, I_m

# Say what this is.
name = font['name']
name.setName('Crayon Libre (21Board edit: two-dot colon, barred I, no pictographs). Original by GGBotNet, CC0 1.0.', 10, 3, 1, 0x409)
name.setName('Version 1.05; 21Board edit 1', 5, 3, 1, 0x409)

# --- Subset: everything except pictographs and stray CJK.
drop = {0x2615, 0x3012, 0x5143, 0x5186, 0x8336, 0x9F99}       # coffee, postal mark, CJK
keep = [c for c in cmap if c < 0x10000 and c not in drop]
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.hinting = False
opts.name_IDs = ['*']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=keep)
sub.subset(font)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
font.flavor = 'woff2'
font.save(OUT)
print('wrote', os.path.normpath(OUT), os.path.getsize(OUT), 'bytes,', len(keep), 'characters')
