const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 160)));
  await page.goto('file://' + __dirname + '/disk/index.html'); await page.waitForTimeout(800);
  const top = await page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].map(f => f.family + ' ' + f.status)));
  const fr = await page.frames()[1].evaluate(() => document.fonts.ready.then(() => [...document.fonts].map(f => f.family + ' ' + f.status)));
  console.log(JSON.stringify({ top, frame: fr, logs }));
  await browser.close();
})();
