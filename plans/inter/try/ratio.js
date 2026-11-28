// Width of test strings: CI's system Inter (static 4.0, what tests measure today) against the built font, same CSS.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const built = fs.readFileSync('out1/Inter-21Board.woff2').toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<style>@font-face { font-family: B; src: url(data:font/woff2;base64,${built}) format("woff2"); font-weight: 100 900; }</style><body>x</body>`);
  const r = await page.evaluate(async () => {
    await document.fonts.load('16px B');
    const S = { versus: ['Christopher', 'Maximiliano'], wheel: ['Siddharthanarayanan Venkataramanaswamy', 'Maximiliana-Guadalupe Fernández', 'Christopher-James Montgomery', 'Bartholomew-Alexander', 'Wolfgang Amadeus', 'Alexandria'],
      groups: ['Maximiliana-Guadalupe', 'Bartholomew Alexander', 'Anne-Sophie', 'Xiomara Isabel', 'Wilhelmina', 'Krzysztof', 'Oluwaseun'],
      ui: ['Zones Check-In', 'Image', 'Import', 'In words', 'Isabella', 'Illinois', 'Widget Picker', 'Settings', 'Board history', 'Calendar', 'Wednesday, November 12', 'Weather', 'Total left', 'Let go to stop', 'Accent color', 'Default widget language'] };
    const w = (fam, css, s) => { const e = document.createElement('span'); e.style.cssText = `font: ${css} 100px ${fam}; white-space: pre`; e.textContent = s; document.body.append(e); const x = e.getBoundingClientRect().width; e.remove(); return x; };
    const out = {};
    for (const [k, list] of Object.entries(S)) {
      const css = k === 'versus' ? 'italic 900' : '400';
      out[k] = list.map(s => [s, +(w('B', css, s) / w('system-ui', css, s)).toFixed(3)]);
    }
    out.bold700 = ['Settings', 'Image', 'Board history'].map(s => [s, +(w('B', '700', s) / w('system-ui', '700', s)).toFixed(3)]);
    return out;
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
