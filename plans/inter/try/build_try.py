# A trial of the spec's tools/build-inter.py steps (spec §3.1), outside the repo.
import io, os, sys, json, hashlib
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
from fontTools.ttLib.tables._f_v_a_r import Axis

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_R, SRC_I, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
SHA = {'roman': '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031', 'italic': 'acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6'}
CH = json.load(open(os.path.join(HERE, 'inter-chars.json')))
def cps(groups):
    out = set()
    for rngs in groups.values():
        for r in rngs:
            a, _, b = r.partition('-'); out.update(range(int(a, 16), int(b or a, 16) + 1))
    return sorted(out)
ROMAN = cps(CH['roman']); ITALIC = sorted(ord(c) for c in CH['italic'])
REMAP = [(100, 100), (300, 300), (400, 490), (700, 700), (900, 900)]
ONLY = os.environ.get('ONLY', '')   # 'noremap' to skip step 5, for a size comparison

def load(p):
    return TTFont(p, lazy=False, recalcTimestamp=False)
def reload(font):
    b = io.BytesIO(); font.save(b); b.seek(0); return TTFont(b, lazy=False, recalcTimestamp=False)

def pl(points, x):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x0 <= x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 != x0 else y0
    raise ValueError(x)
def inv(points, y):
    return pl([(b, a) for a, b in points], y)

def remap_weight(font):
    fvar = font['fvar']; ax = next(a for a in fvar.axes if a.axisTag == 'wght')
    lo, d0, hi = ax.minValue, ax.defaultValue, ax.maxValue
    seg0 = sorted(font['avar'].segments['wght'].items())
    def n_old(u): return (u - d0) / (d0 - lo) if u < d0 else (u - d0) / (hi - d0)
    d1 = inv(REMAP, d0)
    def n_new(u): return (u - d1) / (d1 - lo) if u < d1 else (u - d1) / (hi - d1)
    # breakpoints in new user space
    us = {lo, hi, d1} | {a for a, _ in REMAP}
    for x, _ in seg0:
        u_old = d0 + x * (d0 - lo) if x < 0 else d0 + x * (hi - d0)
        us.add(inv(REMAP, u_old))
    pts = {}
    for u in sorted(us):
        pts[round(n_new(u), 6)] = pl(seg0, n_old(pl(REMAP, u)))
    font['avar'].segments['wght'] = dict(sorted(pts.items()))
    ax.defaultValue = d1
    return d1, font['avar'].segments['wght']

def advances(font, loc, chars='noHЖπ'):
    f = instancer.instantiateVariableFont(reload(font), loc)
    cm = f.getBestCmap(); return [f['hmtx'][cm[ord(c)]][0] for c in chars]

def build(kind, src, unicodes):
    data = open(src, 'rb').read()
    h = hashlib.sha256(data).hexdigest(); assert h == SHA[kind], (kind, h)
    srcfont = load(src)
    font = reload(instancer.instantiateVariableFont(srcfont, {'opsz': 14}, updateFontNames=False))
    print(kind, 'axes after opsz pin', [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font['fvar'].axes], 'avar', 'avar' in font)
    gsub = font['GSUB'].table
    if kind == 'roman':
        arrow = set()
        for fr in gsub.FeatureList.FeatureRecord:
            if fr.FeatureTag != 'calt': continue
            for li in fr.Feature.LookupListIndex:
                lk = gsub.LookupList.Lookup[li]
                sts = [st.ExtSubTable if lk.LookupType == 7 else st for st in lk.SubTable]
                for st in sts:
                    if hasattr(st, 'ligatures') and any('rrow' in l.LigGlyph or l.LigGlyph.startswith('uni27F') for v in st.ligatures.values() for l in v):
                        arrow.add(li)
        print(' calt arrow lookups', sorted(arrow))
        for fr in gsub.FeatureList.FeatureRecord:
            if fr.FeatureTag == 'calt':
                fr.Feature.LookupListIndex = [i for i in fr.Feature.LookupListIndex if i not in arrow]
                fr.Feature.LookupCount = len(fr.Feature.LookupListIndex)
    if ONLY != 'noremap':
        d1, seg = remap_weight(font)
        print(' new default', d1, 'avar wght', [(round(k, 4), round(v, 4)) for k, v in seg.items()])
        font = reload(font)
        src14 = reload(instancer.instantiateVariableFont(load(src), {'opsz': 14}, updateFontNames=False))
        for new, old in [(400, 490), (500, 560), (600, 630), (700, 700), (300, 300), (100, 100), (900, 900)]:
            a, b = advances(font, {'wght': new}, 'noHЖπ' if kind == 'roman' else 'abnox'), advances(src14, {'wght': old}, 'noHЖπ' if kind == 'roman' else 'abnox')
            print('  new', new, a, 'src', old, b, 'maxdiff', max(abs(x - y) for x, y in zip(a, b)))
    if kind == 'roman':
        ss04 = {}
        for fr in gsub.FeatureList.FeatureRecord:
            if fr.FeatureTag == 'ss04':
                for li in fr.Feature.LookupListIndex:
                    lk = gsub.LookupList.Lookup[li]
                    for st in lk.SubTable:
                        st = st.ExtSubTable if lk.LookupType == 7 else st
                        ss04.update(getattr(st, 'mapping', {}))
        gsub = font['GSUB'].table
        ss04 = {}
        for fr in gsub.FeatureList.FeatureRecord:
            if fr.FeatureTag == 'ss04':
                for li in fr.Feature.LookupListIndex:
                    lk = gsub.LookupList.Lookup[li]
                    for st in lk.SubTable:
                        st = st.ExtSubTable if lk.LookupType == 7 else st
                        ss04.update(getattr(st, 'mapping', {}))
        n = 0
        for t in font['cmap'].tables:
            for cp, g in list(t.cmap.items()):
                if g in ss04: t.cmap[cp] = ss04[g]; n += 1
        print(' ss04 glyphs', len(ss04), 'cmap entries changed', n)
        print(' ss04 map', sorted(ss04.items())[:60])
    f = reload(font)
    o = subset.Options()
    o.layout_features = o.layout_features + ['tnum', 'pnum']
    o.name_IDs = ['*']; o.name_languages = ['*']; o.notdef_outline = True
    o.drop_tables = o.drop_tables + ['DSIG']
    s = subset.Subsetter(o); s.populate(unicodes=unicodes); s.subset(f)
    name = f['name']
    v = name.getDebugName(5)
    for rec in name.names:
        if rec.nameID == 5: rec.string = v + '; 21Board subset'
    missing = sorted(set(unicodes) - set(f.getBestCmap()))
    print(' missing from cmap', [hex(c) for c in missing])
    out = os.path.join(OUT, ('Inter' if kind == 'roman' else 'InterItalic') + '-21Board.' + os.environ.get('FLAVOR', 'woff2'))
    f.flavor = None if os.environ.get('FLAVOR') == 'ttf' else 'woff2'
    f.save(out)
    print(' ->', out, os.path.getsize(out), 'bytes', round(os.path.getsize(out) / 1024, 1), 'KB', hashlib.sha256(open(out, 'rb').read()).hexdigest()[:16])
    print(' glyphs', len(f.getGlyphOrder()), 'tables', sorted(f.keys()))

build('roman', SRC_R, ROMAN)
build('italic', SRC_I, ITALIC)
