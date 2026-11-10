#!/usr/bin/env python3
"""
Builds the chalk font for the Notes widget's Chalkboard theme:
widgets/notes/fonts/CrayonLibre-21Board.woff2

Source: Crayon Libre 1.05 by GGBotNet, CC0 1.0 (public domain):
  https://ggbot.itch.io/crayon-libre-font  (download the zip, use TrueType (.ttf)/CrayonLibre-Regular.ttf)

Changes for classroom use (CC0 allows any changes). New shapes are cut and pasted from the font's
own chalk strokes, so they keep its texture:
  - Colon ':' is two plain dots. The original's lower dot has a tail, so "3:15" read as "3;15".
  - Capital 'I' gets top and bottom bars.
  - Lowercase 'l' is a print letter instead of the looped cursive one: a straight stroke whose bottom
    trails off to the right like chalk as the hand lifts (--l, --trail), and so are
    ĺ ļ ľ ŀ ł (their accents re-seated on the new l); Ł is rebuilt as L with a bar.
  - Digit '1' gets a flag (--one), so I, l and 1 all look different ("Il1").
  - Capital 'Q' is the O with a plain straight tail instead of a curly one (--q).
  - Pictograph emoji (and a few CJK characters) are left out, so the system's color emoji
    and fonts show instead of a few stray chalk drawings (e.g. U+1F6AC, a cigarette).
  - Hinting dropped and compressed to WOFF2 (about 60 KB instead of 700 KB).

Run (needs: pip install fonttools brotli skia-pathops):
  python3 tools/build-chalk-font.py path/to/CrayonLibre-Regular.ttf
Options for trying alternatives: --l loop|stick|tail  --one plain|flag  --out FILE  --flavor woff2|ttf
"""
import argparse, math, os
import pathops
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.basePen import AbstractPen
from fontTools.misc.transform import Transform
from fontTools import subset
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('src', nargs='?', default='CrayonLibre-Regular.ttf')
ap.add_argument('--l', choices=['loop', 'stick', 'trail', 'tail'], default='trail',
                help='stick: plain print l; trail: the stick curving off to the right at the bottom, like chalk as the hand lifts (--trail)')
ap.add_argument('--trail', choices=['short', 'medium', 'long'], default='short')
ap.add_argument('--one', choices=['plain', 'flag'], default='flag')
ap.add_argument('--out', default=os.path.join(HERE, '..', 'widgets', 'notes', 'fonts', 'CrayonLibre-21Board.woff2'))
ap.add_argument('--flavor', choices=['woff2', 'ttf'], default='woff2')
ap.add_argument('--foot', type=float, default=200, help='how far the l foot reaches past the stem (font units)')
ap.add_argument('--flag', type=float, default=0.88, help='length of the 1 flag, relative to the hyphen')
ap.add_argument('--flag-angle', type=float, default=45)
ap.add_argument('--q', choices=['orig', 'slash', 'hyphen'], default='hyphen', help='capital Q tail')
ap.add_argument('--q-len', type=float, default=0.55, help='Q tail length, relative to the O height')
args = ap.parse_args()

font = TTFont(args.src)
assert font['name'].getDebugName(1) == 'Crayon Libre', 'expected Crayon Libre'
gs = font.getGlyphSet()
glyf, hmtx = font['glyf'], font['hmtx']
cmap = font.getBestCmap()
G = lambda ch: cmap[ord(ch)]
SB = 50   # the font's usual side bearing


def path(name, t=Transform()):
    p = pathops.Path()
    gs[name].draw(TransformPen(p.getPen(), t))
    return p


def rect(x0, y0, x1, y1):
    p = pathops.Path(); pen = p.getPen()
    pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    return p


def union(*ps):
    out = pathops.Path()
    for p in ps: out = pathops.op(out, p, pathops.PathOp.UNION)
    return out


def clip(p, *box): return pathops.op(p, rect(*box), pathops.PathOp.INTERSECTION)


def put(ch, p):
    """Store outline p as the glyph for ch, moved to the usual left side bearing."""
    x0, y0, x1, y1 = p.bounds
    p = union(p)                                     # one clean outline
    p.simplify(fix_winding=True, clockwise=True)     # TrueType direction
    pen = TTGlyphPen(gs)
    p.draw(TransformPen(Cu2QuPen(pen, 1.0, reverse_direction=False), Transform().translate(SB - x0, 0)))
    g = pen.glyph(); g.recalcBounds(glyf)
    glyf[G(ch)] = g
    hmtx[G(ch)] = (round(x1 - x0) + 2 * SB, g.xMin)


def mark(name):
    """The accent of an accented letter: its third contour of 10+ points (after the letter's body and counter)."""
    g = glyf[name]
    coords, ends, flags = g.getCoordinates(glyf)
    start, found = 0, []
    for e in ends:
        if e - start + 1 >= 10: found.append((start, e))
        start = e + 1
    s0, e0 = found[-1]
    m = Glyph(); m.numberOfContours = 1
    m.coordinates = GlyphCoordinates(coords[s0:e0 + 1]); m.flags = flags[s0:e0 + 1]; m.endPtsOfContours = [e0 - s0]
    m.program = None
    p = pathops.Path(); m.draw(p.getPen(), glyf)
    return p


def moved(p, dx, dy=0):
    q = pathops.Path(); p.draw(TransformPen(q.getPen(), Transform().translate(dx, dy)))
    return q


class WarpPen(AbstractPen):
    """Passes outlines through f(x, y): used to bend a stroke while keeping its chalk texture."""
    def __init__(self, pen, f): self.pen, self.f = pen, f
    def moveTo(self, p): self.pen.moveTo(self.f(*p))
    def lineTo(self, p): self.pen.lineTo(self.f(*p))
    def qCurveTo(self, *ps): self.pen.qCurveTo(*[None if p is None else self.f(*p) for p in ps])
    def curveTo(self, *ps): self.pen.curveTo(*[self.f(*p) for p in ps])
    def closePath(self): self.pen.closePath()
    def endPath(self): self.pen.endPath()
    def addComponent(self, *a): raise NotImplementedError


def box(name):
    g = glyf[name]
    return g.xMin, g.yMin, g.xMax, g.yMax


I0 = path(G('I'))   # the original capital I: a plain chalk stick (used below before 'I' is replaced)

# --- Colon: two dots made from the period (the upper one mirrored, so they aren't identical).
px0, py0, px1, py1 = box(G('.'))
put(':', union(path(G('.')), path(G('.'), Transform().translate(px0 + px1, 980 - py1).scale(-1, 1))))

# --- Lowercase l.
if args.l == 'stick':
    # A straight stick: the I's chalk stroke turned upside down, so l and I don't show the same marks.
    bx0, by0, bx1, by1 = I0.bounds
    put('l', path(G('I'), Transform().translate(bx0 + bx1, by0 + by1).scale(-1, -1)))
elif args.l == 'trail':
    # The plain stick whose bottom curves off to the right and thins a little, the way chalk trails
    # off the board as the hand lifts at the end of a down-stroke.
    y_top, reach, taper, power = {'short': (300, 130, .10, 2.4), 'medium': (400, 190, .14, 2.2), 'long': (480, 250, .18, 2.0)}[args.trail]
    bx0, by0, bx1, by1 = I0.bounds
    turn = Transform().translate(bx0 + bx1, by0 + by1).scale(-1, -1)          # the I's stroke upside down, as for 'stick'
    stick = path(G('I'), turn)
    cx0, _, cx1, _ = clip(stick, -500, y_top, 3000, y_top + 40).bounds
    cx = (cx0 + cx1) / 2
    def bend(x, y):
        if y >= y_top: return (x, y)
        t = (y_top - y) / (y_top - by0)            # 0 where the curve starts, 1 at the bottom
        return (cx + (x - cx) * (1 - taper * t) + reach * t ** power, y + 0.25 * reach * t ** (power + 1))
    p = pathops.Path(); gs[G('I')].draw(TransformPen(WarpPen(p.getPen(), bend), turn))
    put('l', p)
elif args.l == 'tail':
    # The straight stick with a small foot: the curved foot of the 't', trimmed to a rounded end
    # (cut along an ellipse, not a straight line) and joined to the stick's bottom right.
    t = path(G('t'))
    fx0, _, fx1, _ = clip(t, -500, 400, 3000, 430).bounds              # t's stem just below the crossbar
    def ellipse(cx, cy, rx, ry, n=48):
        p = pathops.Path(); pen = p.getPen()
        pts = [(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n)]
        pen.moveTo(pts[0]); [pen.lineTo(q) for q in pts[1:]]; pen.closePath()
        return p
    toe = clip(t, fx1 - 80, -500, 3000, 400)                            # the foot, right of the stem
    toe = pathops.op(toe, ellipse(fx1 - 80, 160, args.foot + 80, 330), pathops.PathOp.INTERSECTION)
    bx0, by0, bx1, by1 = I0.bounds
    stick = path(G('I'), Transform().translate(bx0 + bx1, by0 + by1).scale(-1, -1))
    sx0, _, sx1, _ = clip(stick, -500, 0, 3000, 200).bounds              # the stick near its bottom
    put('l', union(stick, moved(toe, sx1 - fx1 + 10, 0)))

# --- The l with accents (Slovak, Polish, Catalan names...): the new l plus the original accent marks,
#     placed where the font puts them on the capital L. The ł gets a bar cut from the hyphen; the Ł too
#     (the original draws Ł as a looped cursive letter).
if args.l != 'loop':
    lp = pathops.Path(); gs[G('l')].draw(lp.getPen())                 # the new l (already at x = SB)
    lx0, ly0, lx1, ly1 = lp.bounds
    def at(cp, name, x, y=None):
        m = mark(name); mx0, my0, _, _ = m.bounds
        put(chr(cp), union(lp, moved(m, x - mx0, 0 if y is None else y - my0)))
    at(0x13A, 'lacute', lx0 + 86)                  # ĺ (Ĺ has its acute 86 units in from the stem)
    at(0x13C, 'uni013C', lx0 + 150)                # ļ
    at(0x13E, 'lcaron', lx1 + 70)                  # ľ: just right of the stem top
    at(0x140, 'ldot', lx1 + 70)                    # ŀ: middle dot right of the stem
    hx0, hy0, hx1, hy1 = box(G('-'))
    def bar(cx, cy, length):
        return path(G('-'), Transform().translate(cx, cy).rotate(math.radians(35))
                    .scale(length / (hx1 - hx0), 0.8).translate(-(hx0 + hx1) / 2, -(hy0 + hy1) / 2))
    put(chr(0x142), union(lp, bar((lx0 + lx1) / 2, 0.5 * ly1, 520)))                     # ł
    L = path(G('L')); Lx0, Ly0, Lx1, Ly1 = clip(L, -500, 600, 3000, 800).bounds         # the L's stem
    put(chr(0x141), union(L, bar((Lx0 + Lx1) / 2, 0.47 * Ly1 + 0 * Ly0, 560)))           # Ł

# --- Digit 1: a flag on top, cut from the hyphen's stroke.
if args.one == 'flag':
    one = path(G('1'))
    hx0, hy0, hx1, hy1 = box(G('-'))
    ox0, oy0, ox1, oy1 = clip(one, -500, 1300, 3000, 1400).bounds        # top of the stem
    length, thick = args.flag * (hx1 - hx0), 0.85 * (hy1 - hy0)
    flag = path(G('-'), Transform()
                .translate((ox0 + ox1) / 2 + 70, 1390)                      # end well inside the top of the stem (no notch)
                .rotate(math.radians(args.flag_angle))                        # rising to the right
                .scale(length / (hx1 - hx0), thick / (hy1 - hy0))
                .translate(-hx1, -(hy0 + hy1) / 2))
    put('1', union(one, flag))

# --- Capital Q: the O with a plain straight tail (the original's tail is a curly squiggle).
if args.q != 'orig':
    ox0, oy0, ox1, oy1 = box(G('O'))
    cx, cy, rx, ry = (ox0 + ox1) / 2, (oy0 + oy1) / 2, (ox1 - ox0) / 2, (oy1 - oy0) / 2
    # Centre of the tail: just outside the bowl's lower right, so it starts inside and ends outside.
    tx, ty = cx + rx * math.cos(math.radians(-45)) + 40, cy + ry * math.sin(math.radians(-45)) - 40
    length = args.q_len * (oy1 - oy0)
    src = G('-') if args.q == 'hyphen' else G('\\')
    sx0, sy0, sx1, sy1 = box(src)
    if args.q == 'hyphen':      # horizontal stroke: scale to length, then turn it to point down-right
        tail = path(src, Transform().translate(tx, ty).rotate(math.radians(-42))
                    .scale(length / (sx1 - sx0), 0.95).translate(-(sx0 + sx1) / 2, -(sy0 + sy1) / 2))
    else:                       # the backslash: shorten it and lean it over to about 45 degrees
        k = length / math.hypot(sx1 - sx0, sy1 - sy0)
        tail = path(src, Transform().translate(tx, ty).rotate(math.radians(24))
                    .scale(k, k).translate(-(sx0 + sx1) / 2, -(sy0 + sy1) / 2))
    put('Q', union(path(G('O')), tail))

# --- Capital I: the original stick plus two bars cut from the hyphen.
ix0, iy0, ix1, iy1 = box(G('I'))
hx0, hy0, hx1, hy1 = box(G('-'))
bar_w, bar_h = round((ix1 - ix0) * 2.1), round((hy1 - hy0) * 0.9)
sx, sy = bar_w / (hx1 - hx0), bar_h / (hy1 - hy0)
put('I', union(
    path(G('I'), Transform().translate((bar_w - (ix1 - ix0)) / 2, 0)),
    path(G('-'), Transform().translate(ix0, iy1 - bar_h).scale(sx, sy).translate(-hx0, -hy0)),            # top bar
    path(G('-'), Transform().translate(ix0 + bar_w, iy0).scale(-sx, sy).translate(-hx0, -hy0)),           # bottom bar, mirrored
))

# Say what this is.
name = font['name']
name.setName('Crayon Libre (21Board edit: two-dot colon, barred I, manuscript l, flagged 1, no pictographs). '
             'Original by GGBotNet, CC0 1.0.', 10, 3, 1, 0x409)
name.setName('Version 1.05; 21Board edit 2', 5, 3, 1, 0x409)

# --- Subset: everything except pictographs and stray CJK.
drop = {0x2615, 0x3012, 0x5143, 0x5186, 0x8336, 0x9F99}       # coffee, postal mark, CJK
keep = [c for c in cmap if c < 0x10000 and c not in drop]
opts = subset.Options()
opts.layout_features = ['*']
opts.hinting = False
opts.name_IDs = ['*']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=keep)
sub.subset(font)
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
font.flavor = 'woff2' if args.flavor == 'woff2' else None
font.save(args.out)
print('wrote', os.path.normpath(args.out), os.path.getsize(args.out), 'bytes,', len(keep), 'characters', f'(l={args.l}, one={args.one})')
