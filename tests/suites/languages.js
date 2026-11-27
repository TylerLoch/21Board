// Languages: the words tables, and the SDK's words engine.
'use strict';
module.exports = T => {
  const { path, ok, TESTS_DIR } = T;
  return [
  ['Languages: the Node check of every words table (tests/words.js)', async () => {
    const r = require('child_process').spawnSync(process.execPath, [path.join(TESTS_DIR, 'words.js')], { encoding: 'utf8', timeout: 60e3 });
    const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
    for (const line of String(r.stdout || '').split('\n').filter(l => /^FAIL /.test(l)).slice(0, 20)) console.log('   ' + line.trim());
    ok(r.status === 0 && m && +m[2] === 0 && +m[1] > 0, `tests/words.js: ${m ? `${m[1]} passed, ${m[2]} failed` : 'no result'}${!m ? ': ' + String(r.stderr || '').split('\n').slice(0, 4).join(' ') : ''}`);
  }]
  ];
};
