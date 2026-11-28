import sys
from fontTools.ttLib import TTFont
for p in sys.argv[1:]:
    f = TTFont(p, lazy=True)
    print(p.split('/')[-1], sorted(f.keys()))
    for a in f['fvar'].axes: print(' axis', a.axisTag, a.minValue, a.defaultValue, a.maxValue)
    if 'avar' in f:
        av = f['avar']
        print(' avar version', getattr(av, 'majorVersion', None), {k: sorted(v.items()) for k, v in av.segments.items()})
    hh = f['hhea']; os2 = f['OS/2']
    print(' upm', f['head'].unitsPerEm, 'hhea', hh.ascent, hh.descent, hh.lineGap, 'typo', os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap, 'win', os2.usWinAscent, os2.usWinDescent, 'fsSelection', bin(os2.fsSelection))
    print(' name5', f['name'].getDebugName(5), 'name1', f['name'].getDebugName(1))
