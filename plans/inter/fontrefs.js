const fs = require('fs');
const re = /letters|Atkinson|Early readers|Early Readers|Easier to read|text style|Text style|document\.fonts|LETTER|Georgia|serif|font-family|fontFamily|\.font\b|Inter\b|Cyrillic|Andika|letter-opt|loadingdone/;
for (const f of process.argv.slice(2)) {
  const L = fs.readFileSync(f, 'utf8').split('\n'); let suite = '(top)', sl = 0; const out = {};
  L.forEach((l, i) => {
    const m = /^  \[['`](.{0,90})/.exec(l); if (m) { suite = m[1]; sl = i + 1; }
    if (re.test(l)) (out[sl + ' ' + suite] = out[sl + ' ' + suite] || []).push(i + 1);
  });
  console.log('== ' + f);
  for (const [k, v] of Object.entries(out)) console.log('  ' + k + ' :: ' + v.join(','));
}
