const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = '/home/user/21Board', HERE = __dirname;
(async () => {
  const b = await chromium.launch();
  const variants = [
    ['today', 'Today on a Chromebook', '"Liberation Serif", serif', 'italic', 400],
    ['inter-italic', 'Inter italic', '"Inter Italic"', 'normal', 490],
    ['inter-plain', 'Inter, plain letters', '"Inter"', 'normal', 490],
  ];
  for (const [key, , fam, style, w] of variants) {
    const p = await b.newPage({ viewport: { width: 760, height: 560 }, deviceScaleFactor: 2 });
    await p.route('http://t/**', r => {
      const u = new URL(r.request().url()); let f = u.pathname;
      if (f.startsWith('/__f/')) return r.fulfill({ path: path.join(HERE, f.slice(5)), contentType: 'font/woff2' });
      const fp = path.join(ROOT, f);
      if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' });
      const ct = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      r.fulfill({ path: fp, contentType: ct });
    });
    await p.goto('http://t/widgets/calculator/index.html#b21-bare');
    await p.waitForSelector('.key', { state: 'attached' });
    await p.addStyleTag({ content: `
      @font-face { font-family: "Inter"; src: url(/__f/inter.woff2) format("woff2"); font-weight: 100 900; }
      @font-face { font-family: "Inter Italic"; src: url(/__f/inter-italic.woff2) format("woff2"); font-weight: 100 900; }
      :root { --b21-font: "Inter", sans-serif; } body { font-weight: 490; font-feature-settings: "ss04"; }
      .key i, .rules i { font-family: ${fam} !important; font-style: ${style} !important; font-weight: inherit; } body > select, body > :not(#app) select { display: none !important; }` });
    await p.evaluate(() => document.getElementById('app').classList.add('adv'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(HERE, key + '-full.png') });
    await p.close();
  }
  await b.close();
})();
