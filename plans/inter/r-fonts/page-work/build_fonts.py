# Cut-down demo fonts for the proposals page, built the way each proposal would ship.
import io, os, json, base64
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
from fontTools.varLib.instancer import AxisLimits

R = '/tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-fonts'
DL = os.path.join(R, 'dl'); OUT = os.path.join(R, 'page-work', 'fonts'); os.makedirs(OUT, exist_ok=True)

BUILD = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x100, 0x180)) + [0x218, 0x219, 0x21A, 0x21B]
         + [0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x2032, 0x2033,
            0x2039, 0x203A, 0x20AC, 0x2122, 0x2190, 0x2192, 0x2212])
SYMBOLS = '§©°±²³·¹½¾×÷π–—‘’“”•…‹›⁄⁰⁴⁵⁶⁷⁸⁹⁻ⁿ⅔↑→↓−√∛≈≠≤≥Σ←'
LATIN = sorted(set(BUILD) | {ord(c) for c in SYMBOLS})
# Russian and Ukrainian windows: basic Cyrillic (Ѐ-џ, so і ї є too), Ґ ґ, and №.
CYR = list(range(0x400, 0x460)) + [0x490, 0x491, 0x2116]
UNICODES = sorted(set(LATIN) | set(CYR))
# Measured only, never embedded: Greek and Vietnamese on top of the Cyrillic build.
GREEK = [0x37E, 0x387] + [c for c in range(0x386, 0x3CF) if c not in (0x387, 0x38B, 0x38D, 0x3A2)]
VIET = [0x1A0, 0x1A1, 0x1AF, 0x1B0] + list(range(0x1EA0, 0x1EFA)) + [0x300, 0x301, 0x303, 0x309, 0x323]
MORE = sorted(set(UNICODES) | set(GREEK) | set(VIET))
MATH = [ord(c) for c in '←↑→↓√∛≈≠≤≥']

def reload(font):
    b = io.BytesIO(); font.save(b); b.seek(0); return TTFont(b, lazy=False)

def cut(font, out, unicodes=UNICODES, extra_features=()):
    f = reload(font)
    o = subset.Options()
    o.layout_features = o.layout_features + ['tnum', 'pnum'] + list(extra_features)
    o.name_IDs = ['*']; o.name_languages = ['*']; o.notdef_outline = True
    o.drop_tables = o.drop_tables + ['DSIG']
    s = subset.Subsetter(o); s.populate(unicodes=unicodes); s.subset(f)
    f.flavor = 'woff2'; f.save(os.path.join(OUT, out))
    return os.path.getsize(os.path.join(OUT, out))

sizes = {}
measured = {}

def cut_all(font, name):
    # The embedded cut has Cyrillic. The Latin-only and Greek-plus-Vietnamese cuts are built the same way, for sizes.
    latin = cut(font, name + '-latin.woff2', unicodes=LATIN)
    cyr = cut(font, name + '.woff2', unicodes=UNICODES)
    more = cut(font, name + '-more.woff2', unicodes=MORE)
    measured[name] = {'latin_bytes': latin, 'cyr_bytes': cyr, 'more_bytes': more,
                      'latin_kb': round(latin / 1024, 1), 'with_cyr_kb': round(cyr / 1024, 1),
                      'cyr_adds_kb': round((cyr - latin) / 1024, 1), 'greek_viet_add_kb': round((more - cyr) / 1024, 1)}
    return cyr

# Inter: opsz pinned at 14, weight axis kept, ss04 frozen (I with bars, l with a tail), calt arrows dropped.
src = TTFont(os.path.join(DL, 'inter', 'Inter[opsz,wght].ttf'), lazy=False)
inter = reload(instancer.instantiateVariableFont(src, {'opsz': 14}, updateFontNames=False))
gsub = inter['GSUB'].table
# find the arrow ligature lookups inside calt (type 4 that make *Arrow* glyphs)
arrow = set()
for fr in gsub.FeatureList.FeatureRecord:
    if fr.FeatureTag != 'calt': continue
    for li in fr.Feature.LookupListIndex:
        lk = gsub.LookupList.Lookup[li]
        sts = [st.ExtSubTable if lk.LookupType == 7 else st for st in lk.SubTable]
        for st in sts:
            if hasattr(st, 'ligatures') and any('rrow' in l.LigGlyph or l.LigGlyph.startswith('uni27F') for v in st.ligatures.values() for l in v):
                arrow.add(li)
print('Inter calt arrow lookups', sorted(arrow))
for fr in gsub.FeatureList.FeatureRecord:
    if fr.FeatureTag == 'calt':
        fr.Feature.LookupListIndex = [i for i in fr.Feature.LookupListIndex if i not in arrow]
        fr.Feature.LookupCount = len(fr.Feature.LookupListIndex)
ss04 = {}
for fr in gsub.FeatureList.FeatureRecord:
    if fr.FeatureTag == 'ss04':
        for li in fr.Feature.LookupListIndex:
            lk = gsub.LookupList.Lookup[li]
            for st in lk.SubTable:
                st = st.ExtSubTable if lk.LookupType == 7 else st
                ss04.update(getattr(st, 'mapping', {}))
n = 0
for t in inter['cmap'].tables:
    for cp, g in list(t.cmap.items()):
        if g in ss04: t.cmap[cp] = ss04[g]; n += 1
print('Inter ss04 frozen in cmap entries:', n)
sizes['inter'] = cut_all(inter, 'inter')

# IBM Plex Sans: width pinned at 100, weight axis kept, nothing frozen. "Plex" is a Reserved Font Name, so the
# cut-down copy is renamed "21Board Sans" (OFL condition 3; OFL-FAQ 5.3 counts the CSS name too), the way
# 21Board's tools/build-letter-fonts.py renames Andika. Copyright, trademark notice, and license records are kept.
def rename(font, family, style, note):
    name = font['name']
    ps = family.replace(' ', '') + '-' + style
    old_ps = (name.getDebugName(6) or '').split('-')[0]
    version = name.getDebugName(5) or ''
    for nid in (16, 17, 18, 21, 22):
        name.removeNames(nameID=nid)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(f'{family} {style}; {version}', 3, 3, 1, 0x409)
    name.setName(family if style == 'Regular' else f'{family} {style}', 4, 3, 1, 0x409)
    name.setName(f'{version}; 21Board subset', 5, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    name.setName(note, 10, 3, 1, 0x409)
    if name.getDebugName(25):
        name.setName(family.replace(' ', ''), 25, 3, 1, 0x409)
    for rec in list(name.names):
        if rec.platformID != 3:
            name.names.remove(rec)
        elif rec.nameID >= 256 and old_ps and old_ps in rec.toUnicode():
            rec.string = rec.toUnicode().replace(old_ps, family.replace(' ', ''))
    left = [(r.nameID, r.toUnicode()) for r in name.names if r.nameID not in (7, 10) and 'Plex' in r.toUnicode()]
    assert not left, left

src = TTFont(os.path.join(DL, 'ibm-plex-sans', 'IBMPlexSans[wdth,wght].ttf'), lazy=False)
plex = reload(instancer.instantiateVariableFont(src, {'wdth': 100}, updateFontNames=False))
rename(plex, '21Board Sans', 'Regular',
       'IBM Plex Sans 3.201 by IBM, cut down to the characters 21Board needs and renamed as the SIL Open Font License '
       'requires (Plex is a Reserved Font Name). IBM Plex: https://github.com/IBM/plex')
sizes['plex'] = cut_all(plex, 'plex')

# Noto Sans: width pinned at 100, weight axis kept; arrows and math from Noto Sans Math (same family, unicode-range).
src = TTFont(os.path.join(DL, 'noto-sans', 'NotoSans[wdth,wght].ttf'), lazy=False)
noto = reload(instancer.instantiateVariableFont(src, {'wdth': 100}, updateFontNames=False))
sizes['noto'] = cut_all(noto, 'noto')
nm = TTFont(os.path.join(DL, 'noto-sans-math', 'NotoSansMath-Regular.ttf'), lazy=False)
sizes['notomath'] = cut(nm, 'notomath.woff2', unicodes=MATH)

# Luciole: the lab's cut-down Regular and Bold (static, CC BY 4.0).
import shutil
for w in ('400', '700'):
    shutil.copy(os.path.join(R, 'lab', 'fonts', f'luciole-{w}.woff2'), os.path.join(OUT, f'luciole-{w}.woff2'))
    sizes['luciole-' + w] = os.path.getsize(os.path.join(OUT, f'luciole-{w}.woff2'))

b64 = {k: base64.b64encode(open(os.path.join(OUT, f), 'rb').read()).decode() for k, f in
       [('inter', 'inter.woff2'), ('plex', 'plex.woff2'), ('noto', 'noto.woff2'), ('notomath', 'notomath.woff2'),
        ('luciole400', 'luciole-400.woff2'), ('luciole700', 'luciole-700.woff2')]}
json.dump(b64, open(os.path.join(OUT, 'b64.json'), 'w'))
json.dump({'sizes': sizes, 'measured': measured}, open(os.path.join(OUT, 'sizes.json'), 'w'), indent=1)
print(json.dumps(sizes, indent=1))
print(json.dumps(measured, indent=1))
print('base64 total KB', sum(len(v) for v in b64.values()) / 1024)
