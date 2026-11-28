// One Chromium: does the built font keep "->" and "<-" as typed, and does CSS 400 draw as the source's 490?
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const b64 = f => fs.readFileSync(f).toString('base64');
  const built = b64('out1/Inter-21Board.woff2');
  const src = b64('/tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-fonts/dl/inter/Inter[opsz,wght].ttf');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<style>
    @font-face { font-family: B; src: url(data:font/woff2;base64,${built}) format("woff2"); font-weight: 100 900; }
    @font-face { font-family: S; src: url(data:font/ttf;base64,${src}) format("truetype"); font-weight: 100 900; }
  </style><body>x</body>`);
  const r = await page.evaluate(async () => {
    await document.fonts.load('16px B'); await document.fonts.load('16px S');
    const c = document.createElement('canvas').getContext('2d');
    const w = (fam, wt, s, feat) => { c.font = `${wt} 100px ${fam}`; return +c.measureText(s).width.toFixed(2); };
    const span = (fam, s, feat) => { const e = document.createElement('span'); e.style.cssText = `font: 400 100px ${fam}; white-space: pre; ${feat ? 'font-feature-settings: "calt" 0;' : ''}`; e.textContent = s; document.body.append(e); const x = e.getBoundingClientRect().width; e.remove(); return +x.toFixed(2); };
    const out = {};
    for (const s of ['->', '<-', '=>', '<->', '<=', '-->', 'A<-B']) out[s] = { builtCalt: span('B', s), builtNoCalt: span('B', s, true), stockCalt: span('S', s), stockNoCalt: span('S', s, true) };
    out.weights = [[400, 490], [500, 560], [600, 630], [700, 700], [300, 300]].map(([a, b]) => [a, w('B', a, 'nnnn oooo HHHH Жжж πππ'), b, w('S', b, 'nnnn oooo HHHH Жжж πππ')]);
    out.Il = [w('B', 400, 'I') / w('B', 400, 'l'), w('S', 400, 'I') / w('S', 400, 'l')].map(x => +x.toFixed(3));
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
