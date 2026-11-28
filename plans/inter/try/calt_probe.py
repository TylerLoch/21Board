import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
gsub = f['GSUB'].table
calt = sorted({li for fr in gsub.FeatureList.FeatureRecord if fr.FeatureTag == 'calt' for li in fr.Feature.LookupListIndex})
print('calt lookups', calt)
def glyphs_in(st):
    out = set()
    for attr in ('Coverage', 'InputCoverage', 'LookAheadCoverage', 'BacktrackCoverage'):
        v = getattr(st, attr, None)
        if v is None: continue
        for c in (v if isinstance(v, list) else [v]): out |= set(c.glyphs)
    if hasattr(st, 'ligatures'): out |= set(st.ligatures)
    if hasattr(st, 'mapping'): out |= set(st.mapping)
    for attr in ('ClassDef', 'InputClassDef', 'BacktrackClassDef', 'LookAheadClassDef'):
        v = getattr(st, attr, None)
        if v is not None: out |= set(v.classDefs)
    return out
for li in calt:
    lk = gsub.LookupList.Lookup[li]
    hits = set()
    for st in lk.SubTable:
        st = st.ExtSubTable if lk.LookupType == 7 else st
        hits |= glyphs_in(st) & {'hyphen', 'greater', 'less', 'equal'}
    if hits: print(' lookup', li, 'type', lk.LookupType, 'touches', sorted(hits))
