const fs = require('fs'), path = require('path'), W = require('./woff2.js');
for (const f of process.argv.slice(2)) {
  const t0 = process.hrtime.bigint();
  const w = W(fs.readFileSync(f));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const I = w.cmap.get(0x49), l = w.cmap.get(0x6C);
  console.log(path.basename(f), ms.toFixed(1) + ' ms', w.cmap.size, 'code points', 'axes', JSON.stringify(w.axes), 'avar', JSON.stringify(w.avar.wght || null), 'I/l', I && l ? (w.advance(I) / w.advance(l)).toFixed(3) : '-', 'tables', w.tables.join(' '));
}
