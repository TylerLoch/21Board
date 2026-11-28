import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1], lazy=True)
hh = f['hhea']; os2 = f['OS/2']
print(sys.argv[1].split('/')[-1], 'upm', f['head'].unitsPerEm, 'hhea', hh.ascent, hh.descent, hh.lineGap, 'typo', os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap, 'win', os2.usWinAscent, os2.usWinDescent, 'fsSel', bin(os2.fsSelection), f['name'].getDebugName(5))
cm = f.getBestCmap(); hm = f['hmtx']
for ch in 'Il1nH->':
    g = cm[ord(ch)]; print(' ', ch, g, hm[g][0], end='')
print()
gsub = f['GSUB'].table
tags = sorted({fr.FeatureTag for fr in gsub.FeatureList.FeatureRecord})
print(' features', tags)
