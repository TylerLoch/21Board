import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
gsub = f['GSUB'].table
for li in map(int, sys.argv[2:]):
    lk = gsub.LookupList.Lookup[li]
    print('== lookup', li, 'type', lk.LookupType)
    for st in lk.SubTable:
        st = st.ExtSubTable if lk.LookupType == 7 else st
        print(' format', st.Format)
        if st.Format == 3:
            bt = [c.glyphs[:12] for c in st.BacktrackCoverage]; inp = [c.glyphs[:12] for c in st.InputCoverage]; la = [c.glyphs[:12] for c in st.LookAheadCoverage]
            subs = [(r.SequenceIndex, r.LookupListIndex) for r in getattr(st, 'SubstLookupRecord', [])]
            if any(g in sum(bt + inp + la, []) for g in ('hyphen', 'greater', 'less', 'equal')):
                print('  back', bt, 'in', inp, 'ahead', la, 'subs', subs)
                for _, sl in subs:
                    s2 = gsub.LookupList.Lookup[sl]
                    for x in s2.SubTable:
                        x = x.ExtSubTable if s2.LookupType == 7 else x
                        m = getattr(x, 'mapping', None)
                        if m: print('    lookup', sl, {k: v for k, v in m.items() if k in ('hyphen', 'greater', 'less', 'equal')})
        else:
            print('  (format', st.Format, ')')
