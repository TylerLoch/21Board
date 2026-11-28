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
    const T = 'nnnn oooo HHHH Жжж πππ';
    const c = document.createElement('canvas').getContext('2d');
    const cw = (fam, wt, px) => { c.font = `${wt} ${px}px ${fam}`; return c.measureText(T).width; };
    const sw = (fam, wt, px, css = '') => { const e = document.createElement('span'); e.style.cssText = `font: ${wt} ${px}px ${fam}; white-space: pre; ${css}`; e.textContent = T; document.body.append(e); const x = e.getBoundingClientRect().width; e.remove(); return x; };
    const rows = [];
    for (const [a, b] of [[400, 490], [500, 560], [600, 630], [700, 700], [300, 300]]) {
      rows.push({ css: a, src: b,
        canvas14px: +(cw('B', a, 14) / cw('S', b, 14)).toFixed(4),
        canvas100px: +(cw('B', a, 100) / cw('S', b, 100)).toFixed(4),
        span100px_opszNone: +(sw('B', a, 100) / sw('S', b, 100, 'font-optical-sizing: none')).toFixed(4),
        span100px_auto: +(sw('B', a, 100) / sw('S', b, 100)).toFixed(4) });
    }
    return rows;
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
