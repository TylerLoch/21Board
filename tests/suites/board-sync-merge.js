// Board Sync: merging two devices' changes, its Node test, and what merges say.
'use strict';
module.exports = T => {
  const {
    fs, path, OUT, ok, freeBoard, openSettings, lockBoard, unlockBoard, renamePage, fillNote, DRIVE_PICK, CLOCK,
    setClock, readFolder, putText, deliver, seedFolder, syncWaits, nameDevice, linkFolder, syncNow, shownBoard,
    sameBoards, notesText, typeNote, addNote, noteOf, winList, copiesOf, ikOf, syncDev, exchange, ownJSON, hear,
    heard, eventually, marked, boardUp, TESTS_DIR, BASE
  } = T;
  return [
  // (end of classroom features)

  // ---- Board Sync merge (section 13d), on one device: its hooks in the board. The two-device scenarios use the Drive fakes.
  ['Board Sync merge: the Node test of the merge (tests/merge.js)', async () => {
    const r = require('child_process').spawnSync(process.execPath, [path.join(TESTS_DIR, 'merge.js')], { encoding: 'utf8', timeout: 25 * 60e3, env: Object.assign({}, process.env, { MERGE_THREADS: process.env.MERGE_THREADS || '2' }) });
    const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
    for (const line of String(r.stdout || '').split('\n').filter(l => /✗ FAIL/.test(l))) console.log('   ' + line.trim());
    ok(r.status === 0 && m && +m[2] === 0, `tests/merge.js: ${m ? `${m[1]} passed, ${m[2]} failed` : r.error && r.error.code === 'ETIMEDOUT' ? 'timed out' : 'no result'}${r.status !== 0 && !m ? ': ' + (r.signal ? `(${r.signal}) ` : '') + String(r.stderr || '').slice(0, 400) : ''}`);
  }],

  ['Board Sync merge: wid, pos, the copy label, Delete this copy', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const settle = (ms = 600) => page.waitForTimeout(ms);
    const inst = ik => page.evaluate(ik => { const i = window.__board21.state.insts.get(ik); return i && JSON.parse(JSON.stringify(i)); }, ik);
    // wid: new windows, reopening, Export → Import Replace, Add, going back, Put back
    await page.evaluate(() => window.__board21.openWidget('notes')); await settle();
    let n1 = await inst('notes:1');
    ok(n1 && n1.wid === `notes@${n1.createdAt}`, `a new window gets wid <widget>@<createdAt> (${n1 && n1.wid})`);
    await page.evaluate(() => window.__board21.openWidget('notes')); await settle();
    const n2 = await inst('notes:2');
    ok(n2 && n2.wid && n2.wid !== n1.wid, 'a second window gets a wid of its own');
    await page.evaluate(() => window.__board21.closeWin('notes:1', { quiet: true })); await settle();
    await page.evaluate(() => window.__board21.openWidget('notes')); await settle();
    ok((await inst('notes:1')).wid === n1.wid, 'reopening a closed window keeps its wid');
    const exp = await page.evaluate(() => window.__board21.buildExport('full'));
    ok(exp.instances.every(i => i.wid) && exp.instances.find(i => i.instance === 1).wid === n1.wid, 'a full export carries each window’s wid');
    await page.evaluate(e => window.__board21.applyImport(e, 'replace'), exp); await settle(900);
    ok((await inst('notes:1')).wid === n1.wid && (await inst('notes:2')).wid === n2.wid, 'Import › Replace keeps the file’s wids');
    await page.evaluate(e => window.__board21.applyImport(e, 'add'), exp); await settle(900);
    const all = await page.evaluate(() => Array.from(window.__board21.state.insts.values()).map(i => [i.wid, i.createdAt]));
    ok(all.length === 4 && new Set(all.map(a => a[0])).size === 4 && new Set(all.map(a => a[1])).size === 4, `Import › Add gives new wids and createdAts of their own (${all.map(a => a[0]).join(', ')})`);
    const vid = await page.evaluate(() => window.__board21.history.capture('manual', { label: 'with wids' })); await settle(300);
    await page.evaluate(() => window.__board21.deleteInstance('notes:1', { history: false })); await settle();
    await page.evaluate(id => window.__board21.history.putBack(id, 'notes:1', { exact: true, quiet: true }), vid); await settle(900);
    ok((await inst('notes:1') || {}).wid === n1.wid, 'Put back brings the window back with its wid');
    await page.evaluate(id => window.__board21.history.restore(id), vid); await settle(1500);
    ok((await inst('notes:1') || {}).wid === n1.wid && (await inst('notes:2') || {}).wid === n2.wid, 'going back keeps the windows’ wids');
    // pos: New page, Duplicate, Move, Add these pages; settings.boards from pos
    const pages = () => page.evaluate(() => { const P = window.__board21.pages; return P.ids().map(b => [b, P.posOf(b)]); });
    await page.evaluate(() => window.__board21.pages.add()); await settle(900);
    await page.evaluate(() => window.__board21.pages.duplicate()); await settle(1200);
    let ps = await pages();
    ok(ps.length === 3 && ps.every(([, p]) => typeof p === 'number') && ps.every(([, p], i) => i === 0 || p > ps[i - 1][1]), `New page and Duplicate give each page a pos, in order (${JSON.stringify(ps)})`);
    await page.evaluate(() => window.__board21.pages.move(-1)); await settle(600);
    const ps2 = await pages();
    ok(ps2.map(x => x[0]).join() !== ps.map(x => x[0]).join() && ps2.every(([, p], i) => i === 0 || p > ps2[i - 1][1]), `Move left changes the page’s pos, and the order follows it (${JSON.stringify(ps2)})`);
    const stored = await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { o.result.close(); res(q.result); }; }; }));
    const posStored = stored.filter(r => /^board:/.test(r.key)).map(r => [+r.key.split(':')[1], r.value.pos]);
    ok(posStored.length === 3 && posStored.every(([b, p]) => ps2.find(x => x[0] === b)[1] === p), 'each page’s pos is in its board record');
    const order = await page.evaluate(recs => {
      const M = window.__board21.merge, settings = recs.find(r => r.key === 'settings').value;
      const local = M.read(recs, { settings: Object.assign({}, settings, { boards: settings.boards.slice().reverse() }), now: Date.now() });
      const st = M.stamp(M.ledger({ v: 1 }, []), local, { dev: 'aaaaaaaaaaaa', now: Date.now(), ctr: 0, maxSeen: 0 });
      return M.patchSettings(Object.assign({}, settings, { boards: settings.boards.slice().reverse() }), st.settings).boards;
    }, stored);
    ok(order.join() === ps2.map(x => x[0]).join(), `a settings.boards out of step is rebuilt from pos, never the reverse (${order.join()})`);
    const two = await page.evaluate(() => window.__board21.buildExport('full'));
    await page.evaluate(async e => { const b = window.__board21; await b.pages.addFrom([JSON.parse(JSON.stringify(e))].map(x => x), { end: true }); }, two).catch(() => {});
    await settle(1200);
    const ps3 = await pages();
    ok(ps3.length === 4 && ps3[3][1] > ps3[2][1], `Add these pages: the page added at the end gets a pos after the others (${JSON.stringify(ps3)})`);
    // the copy label: its own span, short, the whole sentence in its title and the name's label; kept after a reload
    await page.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0])); await settle(1200);
    const b = await page.evaluate(() => window.__board21.state.boardId);
    const at = Date.now() - 60e3;
    await page.evaluate(([b, at]) => {
      const B = window.__board21, i = B.state.insts.get('notes:2'), key = `inst:${b}:notes:2`;
      const v = Object.assign({}, i, { copyOf: { wid: B.state.insts.get('notes:1').wid, from: 'aaaaaaaaaaaa', name: 'the laptop', at } });
      return B.store.tx('readwrite', s => { s.put({ key, type: 'inst', rev: Date.now() + 5, updatedAt: Date.now(), by: 'x', m: 1, value: v }); }).then(() => B.store.getMany([key])).then(r => B.applyMerged([key], r));
    }, [b, at]); await settle(800);
    const label = () => page.evaluate(() => { const w = document.querySelector('.win[data-ikey="notes:2"] .win-label'); const c = w.querySelector('.copy-label'); return { text: c.textContent, hidden: c.hidden, title: c.title, aria: w.getAttribute('aria-label'), sub: w.querySelector('.sub').textContent }; });
    let L = await label();
    const time = await page.evaluate(at => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), at);
    ok(!L.hidden && L.text === `Copy · ${time}` && L.sub === '', `the copy label is in its own span, short ("${L.text}"), and .sub is the widget’s own`);
    ok(L.title === `The laptop’s version from ${time}. This window was changed on two devices at once.`, `its title says whose version it is (“${L.title}”)`);
    ok(L.aria === `Notes 2, the laptop’s version from ${time}, window menu`, `and so does the window name’s label (“${L.aria}”)`);
    await page.reload(); await boardUp(page); await settle(800);
    L = await label();
    ok(!L.hidden && L.text === `Copy · ${time}`, 'the label is still there after a reload');
    // moving the copy clears its label
    const box = await page.locator('.win[data-ikey="notes:2"] .win-title').boundingBox();
    await page.mouse.move(box.x + box.width - 30, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + box.width - 90, box.y + 80, { steps: 6 }); await page.mouse.up(); await settle(800);
    L = await label();
    ok(L.hidden && !(await inst('notes:2')).copyOf && L.aria === 'Notes 2 window menu', 'moving the copy clears its label: it is an ordinary window');
    // changing its content clears it too
    await page.evaluate(([b, at]) => { const B = window.__board21, key = `inst:${b}:notes:2`, v = Object.assign({}, B.state.insts.get('notes:2'), { copyOf: { wid: 'notes@1', from: 'aaaaaaaaaaaa', name: 'the laptop', at } });
      return B.store.tx('readwrite', s => { s.put({ key, type: 'inst', rev: Date.now() + 5, updatedAt: Date.now(), by: 'x', m: 1, value: v }); }).then(() => B.store.getMany([key])).then(r => B.applyMerged([key], r)); }, [b, at]); await settle(800);
    await fillNote(page.frameLocator('.win[data-ikey="notes:2"] iframe'), 'changed here'); await settle(900);
    ok(!(await inst('notes:2')).copyOf, 'changing the copy’s content clears its label');
    // Delete this copy, with Undo
    await page.evaluate(([b, at]) => { const B = window.__board21, key = `inst:${b}:notes:2`, v = Object.assign({}, B.state.insts.get('notes:2'), { copyOf: { wid: 'notes@1', from: 'aaaaaaaaaaaa', name: 'the laptop', at } });
      return B.store.tx('readwrite', s => { s.put({ key, type: 'inst', rev: Date.now() + 5, updatedAt: Date.now(), by: 'x', m: 1, value: v }); }).then(() => B.store.getMany([key])).then(r => B.applyMerged([key], r)); }, [b, at]); await settle(800);
    await page.click('.win[data-ikey="notes:2"] .win-label'); await settle(300);
    ok(await page.locator('#menu [data-act="delete-copy"]').count() === 1, 'a copy’s window menu has Delete this copy');
    await page.click('#menu [data-act="delete-copy"]'); await page.waitForSelector('#modal.open'); await page.click('#modal .btn.danger'); await settle(900);
    ok(!(await inst('notes:2')), 'Delete this copy asks, then deletes it');
    await page.click('#toasts button:has-text("Undo")'); await settle(1200);
    ok(!!(await inst('notes:2')), 'and its Undo brings it back');
    // the Widget Picker doesn't reopen a closed copy
    await page.evaluate(() => window.__board21.closeWin('notes:2', { quiet: true })); await page.evaluate(() => window.__board21.closeWin('notes:1', { quiet: true })); await settle(600);
    await page.evaluate(([b, at]) => { const B = window.__board21, key = `inst:${b}:notes:1`, v = Object.assign({}, B.state.insts.get('notes:1'), { copyOf: { wid: 'notes@1', from: 'aaaaaaaaaaaa', name: 'the laptop', at } });
      return B.store.tx('readwrite', s => { s.put({ key, type: 'inst', rev: Date.now() + 5, updatedAt: Date.now(), by: 'x', m: 1, value: v }); }).then(() => B.store.getMany([key])).then(r => B.applyMerged([key], r)); }, [b, at]); await settle(600);
    const opened = await page.evaluate(() => window.__board21.openWidget('notes'));
    ok(opened === 'notes:2' && !(await inst('notes:1')).open, `tapping Notes doesn’t reopen a closed copy (opened ${opened})`);
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }],

  ['Board Sync merge: base and u, the race guard, settings patches, two tabs', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p1 = await ctx.newPage();
    const errors = []; p1.on('pageerror', e => errors.push(e.message));
    await p1.goto(BASE); await boardUp(p1); await freeBoard(p1);
    const settle = (ms = 600, p = p1) => p.waitForTimeout(ms);
    const rec = (key, p = p1) => p.evaluate(key => window.__board21.store.getMany([key]).then(r => r[0] || null), key);
    await p1.evaluate(() => window.__board21.openWidget('notes')); await settle();
    const b = await p1.evaluate(() => window.__board21.state.boardId), key = `data:${b}:notes:1`;
    await p1.evaluate(key => window.__board21.writer.put(key, 'data', { text: 'one' }), key); await settle(400);
    const r1 = await rec(key);
    await p1.evaluate(key => window.__board21.writer.put(key, 'data', { text: 'undone' }, { undo: true }), key); await settle(400);
    const r2 = await rec(key);
    ok(r1.base === 0 && r2.base === r1.rev && r2.u === 1 && !r1.u, `Writer stores each change’s base (the revision it was made on) and u for an Undo (${r1.base}, ${r2.base}/${r1.rev}, u ${r2.u})`);
    // the race guard: a save within 1.5 s of a merge's write is based on the revision before it
    await p1.evaluate(key => { const B = window.__board21; return B.store.tx('readwrite', s => { s.put({ key, type: 'data', rev: Date.now() + 10, updatedAt: Date.now(), by: 'x', m: 1, value: { text: 'merged' } }); }).then(() => B.store.getMany([key])).then(r => B.applyMerged([key], r)); }, key); await settle(300);
    const merged = await rec(key);
    await p1.evaluate(key => window.__board21.writer.put(key, 'data', { text: 'stale save' }), key); await settle(300);
    const r3 = await rec(key);
    ok(r3.base === r2.rev && r3.base < merged.rev, `a widget save within 1.5 s of a merge’s write is based on the revision before the merge (${r3.base} < ${merged.rev})`);
    await p1.evaluate(key => { const B = window.__board21; return B.store.tx('readwrite', s => { s.put({ key, type: 'data', rev: Date.now() + 20, updatedAt: Date.now(), by: 'x', m: 1, value: { text: 'merged 2' } }); }).then(() => B.store.getMany([key])).then(r => B.applyMerged([key], r)); }, key); await settle(300);
    const merged2 = await rec(key);
    await p1.evaluate(key => { window.__board21.raced.clear([key]); return window.__board21.writer.put(key, 'data', { text: 'undo' }, { undo: true }); }, key); await settle(300);
    const r4 = await rec(key);
    ok(r4.base === merged2.rev, 'Raced.clear lifts it (the Undo of a merge is based on what the merge wrote)');
    // two tabs: a merged write doesn't drop the other tab's waiting change, and isn't shown over it
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(BASE); await boardUp(p2); await settle(800, p2);
    await p2.evaluate(key => { const W = window.__board21.writer; W.pending.set(key, W.based(key, { type: 'data', value: { text: 'tab 2 typing' } })); window.__held = true; }, key);
    await p1.evaluate(key => { const B = window.__board21; return B.store.tx('readwrite', s => { s.put({ key, type: 'data', rev: Date.now() + 30, updatedAt: Date.now(), by: 'x', m: 1, value: { text: 'merged 3' } }); }).then(() => B.store.getMany([key])).then(r => { B.applyMerged([key], r); B.state && 0; }); }, key);
    await p1.evaluate(key => { const B = window.__board21; B.store.getMany([key]).then(() => {}); }, key);
    await p1.evaluate(key => window.__board21.store.tx('readonly', () => {}).then(() => { const ch = new BroadcastChannel('21board-sync'); ch.postMessage({ tab: 'x', keys: [key], t: Date.now() }); ch.close(); }), key); await settle(800, p2);
    const s2 = await p2.evaluate(key => { const B = window.__board21, k = key.split(':'); return { shown: B.state.data.get(`${k[2]}:${k[3]}`), waiting: B.writer.pending.has(key) }; }, key);
    ok(s2.waiting && (!s2.shown || s2.shown.text !== 'merged 3'), `the other tab keeps its waiting change and doesn’t show the merged write over it (${JSON.stringify(s2)})`);
    const m3 = await rec(key);
    await p2.evaluate(() => window.__board21.writer.run()); await settle(500, p2);
    const r5 = await rec(key);
    ok(r5.value.text === 'tab 2 typing' && r5.base < m3.rev, 'its change is then written with the base it had, so the next look finds both (a clash, not an overwrite)');
    // a settings patch from a tab with an old copy doesn't change boards or deletedBoards
    await p2.evaluate(() => { window.__old = JSON.parse(JSON.stringify(window.__board21.state.settings)); });
    await p1.evaluate(() => window.__board21.pages.add()); await settle(1200);
    await p2.evaluate(() => { const B = window.__board21; B.state.settings = window.__old; B.writer.patch('settings', 'settings', { set: { theme: 'dark' } }); }); await settle(800, p2);
    const st = (await rec('settings')).value;
    ok(st.theme === 'dark' && st.boards.length === 2, `a settings change from a tab with an old copy of the settings leaves boards as they are (${JSON.stringify(st.boards)})`);
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }],

  ['Board Sync merge: Board history before merges, deleted pages, going back to another page’s version', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const settle = (ms = 600) => page.waitForTimeout(ms);
    await page.evaluate(() => window.__board21.openWidget('timer')); await settle();
    await page.evaluate(() => window.__board21.pages.add()); await settle(1200);
    await page.evaluate(() => window.__board21.openWidget('notes')); await settle();
    const [b1, b2] = await page.evaluate(() => window.__board21.pages.ids());
    const metasOf = b => page.evaluate(b => new Promise(res => { const o = indexedDB.open('21Board-history'); o.onsuccess = () => { const q = o.result.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => { o.result.close(); res(q.result.filter(m => m.b === b)); }; }; }), b);
    // capture({ b }): a page that isn't shown
    const id = await page.evaluate(b => window.__board21.history.capture('before', { b, reason: 'merge', label: 'Before changes from the laptop' }), b1);
    const m1 = (await metasOf(b1)).find(m => m.id === id);
    ok(!!m1 && m1.wins['timer:1'] && m1.uid === await page.evaluate(b => window.__board21.pages.info.get(b).uid, b1),
      'Board history can save a version of a page that isn’t shown (from its stored records, with its own uid; the same as its newest version: that one)');
    // beforeMerge: risky → always; otherwise at most one an hour of a page nothing was changed on here
    const uid1 = await page.evaluate(b => window.__board21.pages.info.get(b).uid, b1);
    await page.evaluate(() => window.__board21.openWidget('dice')); await settle();
    const r = await page.evaluate(([b1, b2, uid1]) => { const B = window.__board21, u2 = B.state.board.uid;
      return B.history.beforeMerge({ [uid1]: { b: b1, risky: false }, [u2]: { b: b2, risky: true } }, 'Before changes from the laptop', { [uid1]: { at: Date.now() - 60e3, local: false }, [u2]: { at: Date.now() - 60e3, local: false } }); }, [b1, b2, uid1]);
    ok(r[uid1] === 'none' && Object.values(r).includes('saved'), `before a merge: a version of a page changed here or risky, none of one nothing changed on in the last hour (${JSON.stringify(r)})`);
    const r2 = await page.evaluate(([b1, uid1]) => window.__board21.history.beforeMerge({ [uid1]: { b: b1, risky: false } }, 'Before changes from the laptop', { [uid1]: { at: Date.now() - 2 * 3600e3, local: false } }), [b1, uid1]);
    ok(r2[uid1] === 'saved', 'an hour later, one more');
    await page.evaluate(() => { const H = window.__board21.history; H.__tx = H.tx; H.tx = function (stores, mode, fn) { if (mode === 'readwrite' && stores.includes('body')) return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')); return H.__tx.call(this, stores, mode, fn); }; H.__thin = H.thin; H.thin = async () => false; });
    await page.evaluate(() => window.__board21.openWidget('traffic-light')); await settle();
    const r3 = await page.evaluate(() => { const B = window.__board21; return B.history.beforeMerge({ [B.state.board.uid]: { b: B.state.boardId, risky: true } }, 'Before changes from the laptop', {}); });
    ok(Object.values(r3)[0] === 'failed', `when storage is full, beforeMerge reports failed (${JSON.stringify(r3)})`);
    await page.evaluate(() => { const H = window.__board21.history; H.tx = H.__tx; H.thin = H.__thin; H.paused = ''; });
    // deleted pages: kept 30 days, Bring back under the old uid
    await page.evaluate(b1 => window.__board21.pages.go(b1), b1); await settle(1200);
    const name1 = await page.evaluate(() => window.__board21.state.board.name);
    await page.evaluate(() => { window.__board21.pages.remove(); }); await page.click('#modal .btn.danger'); await settle(1200);
    await page.evaluate(b1 => window.__board21.pages.purge([b1]), b1); await settle(800);
    const kept = await metasOf(b1);
    ok(kept.length >= 1 && kept.every(m => m.deletedAt), `a deleted page’s versions stay, marked deleted (${kept.length})`);
    await page.evaluate(() => window.__board21.historySheet.open('left')); await settle(1200);
    const row = await page.locator('#history .hist-day:has-text("Deleted pages") + .hint + .inst-list .inst').first().textContent().catch(() => '');
    ok(row.includes(`“${name1}” · deleted`) && row.includes('Bring back'), `Board history › Deleted pages lists it (“${row.trim()}”)`);
    await page.click('#history [data-act="bring"]'); await settle(2000);
    const back = await page.evaluate(() => ({ uid: window.__board21.state.board.uid, wins: Array.from(window.__board21.state.insts.keys()) }));
    ok(back.uid === uid1 && back.wins.includes('timer:1'), `Bring back adds it again under its uid, with its windows (${JSON.stringify(back)})`);
    ok(await page.locator('#toasts .toast', { hasText: `“${name1}” is back.` }).count() === 1, 'and says so');
    await page.evaluate(b1 => new Promise(res => { const o = indexedDB.open('21Board-history'); o.onsuccess = () => { const t = o.result.transaction('meta', 'readwrite'), s = t.objectStore('meta'); const q = s.getAll(); q.onsuccess = () => { for (const m of q.result) if (m.b === b1) { m.deletedAt = Date.now() - 31 * 864e5; s.put(m); } }; t.oncomplete = () => { o.result.close(); res(); }; }; }), b1);
    await page.evaluate(() => window.__board21.history.prune()); await settle(800);
    ok((await metasOf(b1)).length === 0, 'after 30 days, a deleted page’s versions go');
    // going back to a version of another page keeps this page's uid
    await page.evaluate(() => window.__board21.historySheet.close());
    const other = await page.evaluate(async () => { const B = window.__board21, e = await B.buildExport('full'); e.board.uid = 'someotherpage-1234'; e.board.name = 'Other'; return e; });
    const uidNow = await page.evaluate(() => window.__board21.state.board.uid);
    await page.evaluate(e => window.__board21.history.restore({ exp: e }), other); await settle(1500);
    ok(await page.evaluate(() => window.__board21.state.board.uid) === uidNow, 'going back to a version of another page keeps this page’s uid');
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }],

  ['Board Sync merge: what a merge says (toasts updated in place, Undo of the page shown, a quiet page)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const settle = (ms = 600) => page.waitForTimeout(ms);
    await page.evaluate(() => window.__board21.openWidget('notes')); await settle();
    await fillNote(page.frameLocator('.win[data-ikey="notes:1"] iframe'), 'mine'); await settle(900);
    await page.evaluate(() => window.__board21.pages.add()); await settle(1200);
    await page.evaluate(() => window.__board21.openWidget('notes')); await settle();
    await fillNote(page.frameLocator('.win[data-ikey="notes:1"] iframe'), 'other page'); await settle(900);
    const [b1, b2] = await page.evaluate(() => window.__board21.pages.ids());
    await page.evaluate(b1 => window.__board21.pages.go(b1), b1); await settle(1200);
    await page.evaluate(() => { const L = window.__board21.link; L.names = () => ({ bbbbbbbbbbbb: 'the smartboard' }); });
    // a fake round: it writes the content of a window on each page (as Link's transaction does), then hands MergeUI its summary
    const round = (text, u) => page.evaluate(([b1, b2, text, u]) => {
      const B = window.__board21, keys = [`data:${b1}:notes:1`, `data:${b2}:notes:1`];
      return B.store.getMany(keys).then(prev => B.store.tx('readwrite', s => { keys.forEach((k, i) => s.put({ key: k, type: 'data', rev: Math.max(prev[i].rev + 1, Date.now()), updatedAt: Date.now(), by: 'x', m: 1, value: { text: text + ' ' + i } })); })
        .then(() => B.store.getMany(keys)).then(now => {
          B.applyMerged(keys, now);
          const uid = B.state.board.uid, uid2 = B.pages.info.get(b2).uid;
          B.mergeUI.shown({ from: ['bbbbbbbbbbbb'], pages: { [uid]: { b: b1, name: 'P1', changed: true, from: ['bbbbbbbbbbbb'], clashes: [], undone: u, mineUndone: u },
            [uid2]: { b: b2, name: 'P2', changed: true, quiet: true, from: ['bbbbbbbbbbbb'], clashes: [] } } },
            { at: Date.now(), from: ['bbbbbbbbbbbb'], ops: keys.map((k, i) => ({ key: k, rev: now[i].rev, prev: prev[i] })), swaps: [] });
        }));
    }, [b1, b2, text, u]);
    await round('from the smartboard', false); await settle(500);
    const toasts = () => page.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast')).map(t => t.querySelector('span').textContent));
    ok((await toasts()).includes('Updated from the smartboard.'), `the page shown changed: “Updated from the smartboard.” with Undo (${(await toasts()).join(' | ')})`);
    const node = await page.evaluate(() => { window.__t = document.querySelector('#toasts .toast'); return !!window.__t; });
    await round('again', false); await settle(500);
    ok(node && await page.evaluate(() => document.querySelectorAll('#toasts .toast').length === 1 && document.querySelector('#toasts .toast') === window.__t), 'a second round updates the toast in place (one node, not announced again)');
    await page.click('#toasts button:has-text("Undo")'); await settle(1200);
    const data = await page.evaluate(([b1, b2]) => window.__board21.store.getMany([`data:${b1}:notes:1`, `data:${b2}:notes:1`]), [b1, b2]);
    ok(data[0].value.text === 'mine' && data[0].u === 1, `Undo puts back the page shown, as an Undo (u) that syncs (${JSON.stringify(data[0].value)})`);
    ok(data[1].value.text === 'again 1', `and leaves other pages alone (${JSON.stringify(data[1].value)})`);
    ok((await toasts()).includes('Undone. Your other devices get this too.'), 'and says so');
    await round('undo', true); await settle(500);
    ok((await toasts()).some(t => t === 'The smartboard undid the changes from this device.') && await page.locator('#toasts button:has-text("Redo")').count() === 1, 'another device’s Undo: “The smartboard undid the changes from this device.” with Redo');
    // windows locked: no Undo
    await page.evaluate(() => window.__board21.mergeUI.drop());
    await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; window.__board21.state.settings.locked = true; });
    await round('locked', false); await settle(500);
    ok(await page.locator('#toasts button:has-text("Undo")').count() === 0, 'while windows are locked, the toast has no Undo');
    await page.evaluate(() => { window.__board21.state.settings.locked = false; });
    // One merge toast at a time: a page deleted on another device is said, and the next round's message replaces it.
    // (plainAt: a minute since the last new "Updated from …", which would otherwise change the page quietly)
    await page.evaluate(() => { window.__board21.mergeUI.drop(); window.__board21.mergeUI.plainAt = 0; document.querySelector('#toasts').innerHTML = ''; });
    await page.evaluate(() => window.__board21.mergeUI.shown({ from: ['bbbbbbbbbbbb'], pages: { gone: { b: 999, name: 'Science', changed: false, deleted: true, here: false, from: ['bbbbbbbbbbbb'], clashes: [] } } }, { ops: [], swaps: [] }));
    await settle(300);
    ok((await toasts()).includes('“Science” was deleted on the smartboard.'), `another page deleted: said, with Undo (${(await toasts()).join(' | ')})`);
    await round('next', false); await settle(500);
    ok((await toasts()).join(' | ') === 'Updated from the smartboard.', `the next round’s message takes its place: one merge toast at a time (${(await toasts()).join(' | ')})`);
    await page.evaluate(() => { window.__board21.mergeUI.drop(); document.querySelector('#toasts').innerHTML = ''; });
    // a page that changed quietly says so once when it is shown
    await page.evaluate(b2 => { const L = window.__board21.link, quiet = window.__board21.pages.info.get(b2).uid, said = new Set(); L.quietNote = uid => (uid !== quiet || said.has(uid) ? null : (said.add(uid), { from: ['bbbbbbbbbbbb'], at: Date.now() - 120e3 })); }, b2);
    await page.evaluate(b2 => window.__board21.pages.go(b2), b2); await settle(1200);
    const q = (await toasts()).find(t => /^Changed on the smartboard /.test(t));
    ok(!!q && await page.locator('#toasts button:has-text("Board history")').count() === 1, `a page changed while it wasn’t shown: “${q}” with Board history`);
    await page.evaluate(b1 => window.__board21.pages.go(b1), b1); await settle(1000);
    await page.evaluate(b2 => window.__board21.pages.go(b2), b2); await settle(1000);
    ok((await toasts()).filter(t => /^Changed on /.test(t)).length <= 1, 'once only');
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }],

  // ---- The review of the merge build: rounds, set-up and Change… (CORR-1…7, UX-1, UX-2, UX-5, UX-6, UX-13)
  ['Board Sync review: a take’s second round, Change… writes to the folder it leaves, the same folder name twice (CORR-2, CORR-5, UX-5, UX-6)', async (browser) => {
    const errors = [];
    const folderFiles = (p, n) => p.evaluate(async n => { let d = await navigator.storage.getDirectory(); for (const x of n.split('/')) d = await d.getDirectoryHandle(x); const o = {}; for await (const [k, h] of d.entries()) if (h.kind === 'file') o[k] = await (await h.getFile()).text(); return o; }, n);
    const lastStep = async (p, ms = 20000) => { await p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: ms }); return (await p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' '); };
    const done = async p => { await p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await p.keyboard.press('Escape'); await eventually(() => p.evaluate(() => { const l = window.__board21.link; return !l.sync.mode && !l.running && !l.timers.full; }), 15000); };

    // A fresh smartboard set up with the real LINK_QUIET_MS: a note opened and typed in a second after Done is kept
    // (the second round of a take stamps: it is this device's board now).
    {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      await renamePage(A.p, 'Morning'); await addNote(A.p, 'Hello');
      await linkFolder(A.p); await deliver(A.p, B.p);
      await syncWaits(B.p, { quiet: 3000 });
      await openSettings(B.p); await B.p.click('#settings [data-act="link-setup"]'); await B.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
      await lastStep(B.p);
      ok(await eventually(() => B.p.evaluate(() => window.__board21.state.board.name === 'Morning')) && await B.p.evaluate(() => !window.__board21.link.sync.mode),
        'a fresh smartboard takes the board; once its first round is done, the mode is applied (not kept for the next round)');
      await done(B.p);
      await addNote(B.p, 'Typed a second after Done');
      await B.p.waitForTimeout(5000);
      await eventually(() => B.p.evaluate(() => { const l = window.__board21.link; return !l.running && !l.timers.full; }), 10000);
      ok(/Typed a second after Done/.test(await notesText(B.p)), 'a note opened and typed in a second after Done is kept');
      await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
      ok(/Typed a second after Done/.test(await notesText(A.p)), 'and reaches the laptop');
      await A.c.close(); await B.c.close();
    }

    // Change… to Room 14 (a take), then right away a window deleted, one edited, one opened: all as done, here and on
    // the Room 14 laptop (which never sees an emptied window), and the laptop's own page isn't added to Room 14.
    {
      const A = await syncDev(browser, 'the laptop', errors), C = await syncDev(browser, 'the Room 14 laptop', errors);
      await renamePage(A.p, 'Main'); await addNote(A.p, 'A1');
      await linkFolder(A.p);
      await renamePage(C.p, 'Room 14'); await addNote(C.p, 'Keep me'); await addNote(C.p, 'Delete me');
      await C.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; }); await linkFolder(C.p);
      const r14 = await C.p.evaluate(() => window.__board21.state.board.uid);
      await seedFolder(A.p, 'Room 14', await folderFiles(C.p, 'Room 14'));
      await A.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; });
      await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
      await lastStep(A.p);
      ok(await eventually(() => A.p.evaluate(u => window.__board21.state.board.uid === u, r14)), 'Change… to Room 14: the laptop shows the Room 14 page');
      ok(await A.p.evaluate(() => !window.__board21.link.sync.mode), 'and its first round has applied the mode');
      const ikOfText = t => A.p.evaluate(t => { for (const [k] of window.__board21.state.insts) { const d = window.__board21.state.data.get(k); if (d && d.text === t) return k; } return null; }, t);
      const del = await ikOfText('Delete me'), keep = await ikOfText('Keep me'), wid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, del);
      await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), del);
      await A.p.evaluate(ik => { const B = window.__board21; return B.writer.put(`data:${B.state.boardId}:${ik}`, 'data', { text: 'Keep me, edited' }); }, keep);
      await A.p.evaluate(async () => { const B = window.__board21, before = new Set(B.state.insts.keys()); B.openWidget('notes'); await new Promise(r => setTimeout(r, 900)); const k = Array.from(B.state.insts.keys()).find(k => !before.has(k)); await B.writer.put(`data:${B.state.boardId}:${k}`, 'data', { text: 'New right after Change' }); });
      await A.p.waitForTimeout(300);
      await done(A.p);
      await syncNow(A.p); await A.p.waitForTimeout(800); await syncNow(A.p);
      const notes = await notesText(A.p);
      ok(/New right after Change/.test(notes) && /Keep me, edited/.test(notes) && !(await winList(A.p)).some(x => x.wid === wid), `the window deleted, the one edited and the one opened right after Change… are as left (${JSON.stringify(notes)})`);
      ok(!Object.values(await shownBoard(A.p)).some(p => p.name === 'Main'), 'the laptop’s own page is gone here (it stays in its first folder and in Board history)');
      await seedFolder(C.p, 'Room 14', await folderFiles(A.p, 'Room 14')); await syncNow(C.p);
      const cw = (await winList(C.p)).filter(x => x.wid === wid);
      ok(!cw.length, `the Room 14 laptop deletes that window too, and never empties it (${JSON.stringify(cw.map(x => x.data))})`);
      ok(/New right after Change/.test(await notesText(C.p)) && !Object.values(await shownBoard(C.p)).some(p => p.name === 'Main'), 'it gets the new note, and not the laptop’s own page');
      await A.c.close(); await C.c.close();
    }

    // Change… with the real write gap: the work typed just before goes to the folder left, which hears that the laptop
    // left (the smartboard there stops listing it), and is there when the laptop switches back.
    {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors), C = await syncDev(browser, 'the Room 14 laptop', errors);
      await renamePage(A.p, 'Main'); const n1 = await addNote(A.p, 'Lesson plan v1');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      await renamePage(C.p, 'Room 14'); await addNote(C.p, 'Room 14 plans');
      await C.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; }); await linkFolder(C.p);
      await seedFolder(A.p, 'Room 14', await folderFiles(C.p, 'Room 14'));
      await syncWaits(A.p, { quiet: 3000, max: 15000, gap: 20000 });
      await syncNow(A.p);
      await typeNote(A.p, n1, 'Lesson plan v2: typed just before Change…');
      await A.p.waitForTimeout(3500);   // (the round after the change ran; its write waits for LINK_GAP_MS)
      await A.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; });
      await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
      await lastStep(A.p); await done(A.p);
      const f21 = await folderFiles(A.p, '21Board'), mine = Object.entries(f21).filter(([n, t]) => /\.21board$/.test(n) && JSON.parse(t).sync.name === 'the laptop').map(([, t]) => JSON.parse(t));
      ok(mine.some(f => /typed just before/.test(JSON.stringify(f))), 'the work typed just before Change… is in the laptop’s file in the folder it left');
      ok(mine.length && mine.every(f => f.sync.left && f.sync.left.at && !f.sync.left.erased), 'and that file says the laptop left (as Unlink does)');
      await deliver(A.p, B.p, { files: Object.keys(f21).filter(n => /\.21board$/.test(n)) }); await syncNow(B.p);
      ok(/typed just before/.test(await notesText(B.p)), 'the smartboard, which stays on that folder, gets that work');
      const st = await B.p.evaluate(() => window.__board21.link.status());
      ok(!/Shared with the laptop/.test(st), `and stops listing the laptop as sharing it (${st})`);
      ok(/The laptop stopped syncing through this folder at \d/.test(st) && !/No other devices yet/.test(st), `and says the laptop stopped syncing through this folder, and when (${st})`);
      await syncWaits(A.p);
      await A.p.evaluate(() => { window.__drive = { pick: '21Board' }; });
      await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
      // (switched back within the Undo time of its page there, removed here: the switch waits until that is over, so the
      // page comes back with the work in this device's own file there)
      await lastStep(A.p, 40000); await done(A.p);
      ok(await eventually(async () => /typed just before/.test(await notesText(A.p)), 20000), `back on the first folder, the laptop shows the work typed before switching (${JSON.stringify(await notesText(A.p))})`);
      await A.c.close(); await B.c.close(); await C.c.close();
    }

    // Two folders both called "21Board" (as set-up suggests): the last step of a Change… and the Board history label
    // say which is which.
    {
      const A = await syncDev(browser, 'the laptop', errors), C = await syncDev(browser, 'the Room 14 laptop', errors);
      await renamePage(A.p, 'Main'); await addNote(A.p, 'A1'); await linkFolder(A.p);
      await renamePage(C.p, 'Room 14'); await addNote(C.p, 'C1');
      await C.p.evaluate(() => { window.__drive = { pick: 'Room 14/21Board' }; }); await linkFolder(C.p);
      await seedFolder(A.p, 'Room 14/21Board', await folderFiles(C.p, 'Room 14/21Board'));
      // (the label the round gives Board history: a version identical to one already kept isn't saved again, so it is
      // read here, as the round passes it)
      await A.p.evaluate(() => { const H = window.__board21.history, bm = H.beforeMerge.bind(H); window.__labels = []; H.beforeMerge = function (pages, label, hist) { window.__labels.push(label); return bm(pages, label, hist); }; });
      await A.p.evaluate(() => { window.__drive = { pick: 'Room 14/21Board' }; });
      await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
      const said = await lastStep(A.p);
      ok(/This device’s other pages are still in the “21Board” folder this device used before\. They’re also in Board history › Deleted pages for 30 days\./.test(said), `the last step: “…the “21Board” folder this device used before…” (${said})`);
      await done(A.p);
      // (the page shown then goes here at the round after another page is shown)
      await eventually(async () => !Object.values(await shownBoard(A.p)).some(p => p.name === 'Main') && (await A.p.evaluate(() => window.__labels)).length > 0, 10000);
      const labels = await A.p.evaluate(() => window.__labels);
      ok(labels.includes('Before switching to the board from the Room 14 laptop') && !labels.includes('Before switching to “21Board”'), `the Board history label names the board’s device (${JSON.stringify(labels)})`);
      await A.c.close(); await C.c.close();
    }
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  }],

  ['Board Sync review: nothing changing, nothing done; versions before a merge out of time; joining with an old copy; a clock set back; a newer file; a file still arriving (CORR-1, CORR-3, CORR-4, CORR-6, CORR-7, UX-1, UX-2, UX-13)', async (browser) => {
    const errors = [];
    // Two devices visible and idle for 16 s: no round, no IndexedDB write, nothing changed on the page, no file
    // written; Settings open for 11 s while this device's name is typed: not drawn again.
    {
      const COUNT = () => {
        window.__puts = [];
        const P = IDBObjectStore.prototype.put, D = IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.put = function (rec) { try { if (this.name === 'records') window.__puts.push(rec && rec.key); } catch (e) { /* counting only */ } return P.apply(this, arguments); };
        IDBObjectStore.prototype.delete = function (k) { try { if (this.name === 'records') window.__puts.push('DEL ' + k); } catch (e) { /* counting only */ } return D.apply(this, arguments); };
      };
      const mk = async label => {
        const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(DRIVE_PICK); await c.addInitScript(CLOCK); await c.addInitScript(COUNT);
        const p = await c.newPage(); p.on('pageerror', e => errors.push(label + ': ' + e.message)); await p.goto(BASE); await boardUp(p); await nameDevice(p, label); await syncWaits(p); return { c, p };
      };
      const A = await mk('the laptop'), B = await mk('the smartboard');
      await addNote(A.p, 'One'); await addNote(A.p, 'Two');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      await A.p.waitForTimeout(4000);
      for (const d of [A, B]) await d.p.evaluate(() => {
        const l = window.__board21.link, at = l.attempt.bind(l);
        window.__att = 0; l.attempt = function () { window.__att++; return at.apply(this, arguments); };
        // (not the clock in the corner, which shows the minute)
        window.__puts = []; window.__mut = [];
        new MutationObserver(ms => { for (const m of ms) { const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (el && el.closest('.corner-clock')) continue; window.__mut.push(m.type + ' ' + (el ? el.id || el.className || el.nodeName : '?') + (m.attributeName ? ' @' + m.attributeName : '')); } })
          .observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      const seq0 = [(await ownJSON(A.p)).sync.seq, (await ownJSON(B.p)).sync.seq];
      await A.p.waitForTimeout(16000);
      for (const [n, d] of [['laptop', A], ['smartboard', B]]) {
        const r = await d.p.evaluate(() => ({ att: window.__att, puts: window.__puts.slice(0, 8), mut: window.__mut }));
        ok(r.att === 0 && r.puts.length === 0, `the ${n}, 16 s with nothing changing anywhere: no round, no IndexedDB write (${r.att} rounds, ${JSON.stringify(r.puts)})`);
        ok(r.mut.length === 0, `and nothing on the page changes (${JSON.stringify(r.mut.slice(0, 6))})`);
      }
      ok((await ownJSON(A.p)).sync.seq === seq0[0] && (await ownJSON(B.p)).sync.seq === seq0[1], 'and no file is written');
      await openSettings(B.p);
      const f = B.p.locator('#set-link-label');
      await f.click(); await f.fill('the smart');
      await B.p.evaluate(() => { window.__field = document.getElementById('set-link-label'); window.__rend = []; new MutationObserver(ms => { for (const m of ms) if (m.type === 'childList') window.__rend.push((m.target.id || m.target.className || m.target.nodeName) + ' ' + Array.from(m.addedNodes, x => x.textContent).join('|').slice(0, 80)); }).observe(document.querySelector('#settings'), { subtree: true, childList: true }); });
      await B.p.waitForTimeout(11000);
      const st = await B.p.evaluate(() => ({ rend: window.__rend, same: window.__field === document.getElementById('set-link-label'), focus: document.activeElement && document.activeElement.id, val: (document.getElementById('set-link-label') || {}).value }));
      ok(st.same && st.focus === 'set-link-label' && st.val === 'the smart' && !st.rend.length, `Settings open while this device’s name is typed: not drawn again, and the field keeps its text (${JSON.stringify(st)})`);
      // A change elsewhere still arrives at the next look, and Settings' status is put in place.
      await f.press('Escape').catch(() => {}); await B.p.keyboard.press('Escape');
      await typeNote(A.p, await A.p.evaluate(() => Array.from(window.__board21.state.insts.keys())[0]), 'One, changed'); await syncNow(A.p); await deliver(A.p, B.p);
      ok(await eventually(async () => /One, changed/.test(await notesText(B.p)), 12000), 'a change on the laptop still arrives at the next look, with no round asked for');
      await A.c.close(); await B.c.close();
    }

    // Board history runs out of time (a photo read that never settles, a slow capture): the smartboard's name is kept
    // (held) or in a Board history version before the laptop's name replaces it.
    {
      const pic = (p, color) => p.evaluate(c => { const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 400, 300); return cv.toDataURL('image/png'); }, color);
      const setPhoto = async (p, color) => { const png = await pic(p, color); await p.setInputFiles('#photo-input', { name: color + '.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }); await p.waitForTimeout(1500); };
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      await addNote(A.p, 'One');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      await renamePage(B.p, 'Smartboard name'); await syncNow(B.p);
      await A.p.waitForTimeout(300);
      await renamePage(A.p, 'Laptop name'); await setPhoto(A.p, '#16a34a'); await syncNow(A.p);
      await deliver(A.p, B.p);
      const photo = await A.p.evaluate(() => (window.__board21.link.sync.refs && Object.values(window.__board21.link.sync.refs)[0] || {}).file);
      await B.p.evaluate(f => { window.__drive = { hang: [f] }; }, photo);
      await B.p.evaluate(() => { const H = window.__board21.history, c = H.capture.bind(H); H.capture = async function () { await new Promise(r => setTimeout(r, 1500)); return c.apply(this, arguments); }; });
      await syncNow(B.p); await B.p.waitForTimeout(2500);
      const r = await B.p.evaluate(async () => { const H = window.__board21.history; await H.reload(); return { name: window.__board21.state.board.name, metas: H.metas.map(m => m.name) }; });
      ok(r.name !== 'Laptop name' || r.metas.includes('Smartboard name'), `Board history out of time: the smartboard’s name is kept, or in a version before the laptop’s replaces it (${JSON.stringify(r)})`);
      await A.c.close(); await B.c.close();
    }

    // A Chromebook that imported two pages earlier joins after the laptop deleted one of them and a window on the
    // other: they stay deleted everywhere, and the last step doesn't count the deleted page as added.
    {
      const A = await syncDev(browser, 'the laptop', errors), G = await syncDev(browser, 'a Chromebook', errors);
      await renamePage(A.p, 'Morning'); await addNote(A.p, 'Morning');
      await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Week 1' })); await A.p.waitForTimeout(800);
      await addNote(A.p, 'Keep'); const del = await addNote(A.p, 'Old spelling list');
      fs.writeFileSync(OUT + 'review-week1.21board', JSON.stringify(await A.p.evaluate(() => window.__board21.buildExport('full'))));
      await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Week 0' })); await A.p.waitForTimeout(800);
      await addNote(A.p, 'Week 0 note');
      fs.writeFileSync(OUT + 'review-week0.21board', JSON.stringify(await A.p.evaluate(() => window.__board21.buildExport('full'))));
      await linkFolder(A.p);
      await A.p.evaluate(async () => { const P = window.__board21.pages; await P.go(P.ids()[1]); }); await A.p.waitForTimeout(800);
      await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), del); await syncNow(A.p);
      await A.p.evaluate(async () => { const P = window.__board21.pages, b = P.ids()[2]; P.drop([b]); await P.purge([b]); }); await A.p.waitForTimeout(600);
      await syncNow(A.p); await A.p.waitForTimeout(800); await syncNow(A.p);
      for (const f of ['review-week1.21board', 'review-week0.21board']) {
        await G.p.setInputFiles('#import-input', OUT + f); await G.p.waitForTimeout(400);
        await G.p.locator('#modal.open .btn', { hasText: 'Open as a new page' }).click(); await G.p.waitForTimeout(1500);
      }
      await deliver(A.p, G.p);
      await openSettings(G.p); await G.p.click('#settings [data-act="link-setup"]'); await G.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
      await G.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
      const said = (await G.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
      await G.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await G.p.waitForTimeout(800);
      await syncNow(G.p); await deliver(G.p, A.p); await syncNow(A.p);
      const names = async p => Object.values(await shownBoard(p)).map(x => x.name).sort().join();
      ok(!/Old spelling list/.test(await notesText(A.p)) && !/Old spelling list/.test(await notesText(G.p)), 'joining with an old copy: the window deleted on the laptop stays deleted, on both');
      ok(!/Week 0/.test(await names(A.p)) && !/Week 0/.test(await names(G.p)), `and so does the page (${await names(A.p)} / ${await names(G.p)})`);
      ok(!/2 pages were added/.test(said), `the last step doesn’t count the deleted page as added (${said})`);
      await A.c.close(); await G.c.close();
    }

    // A device clock set back an hour: windows saved shortly before aren't "being typed in" for that hour.
    {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      const ikA = await addNote(A.p, 'v1');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      const wid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ikA), ikB = await ikOf(B.p, wid);
      await typeNote(B.p, ikB, 'typed on the smartboard'); await B.p.waitForTimeout(1200);
      await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
      await setClock(B.p, -3600e3);
      await typeNote(A.p, ikA, 'changed on the laptop afterwards'); await syncNow(A.p); await deliver(A.p, B.p);
      await syncNow(B.p); await B.p.waitForTimeout(1500); await syncNow(B.p);
      ok(await noteOf(B.p, ikB) === 'changed on the laptop afterwards', 'a clock set back an hour: the laptop’s change shows on the smartboard (its windows aren’t held as “being typed in” for the hour)');
      await A.c.close(); await B.c.close();
    }

    // A folder whose only device file is from a newer 21Board: set-up waits (no board written there to combine), and
    // the status says to update. A file still arriving is named as its device names itself.
    {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      await renamePage(B.p, 'My lesson'); await addNote(B.p, 'Mine');
      const fut = '21Board (laptop) [fut1].21board';
      await putText(B.p, fut, JSON.stringify({ format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Future', uid: 'aaaaaaaa-0000-4000-8000-000000000000' }, instances: [], sync: { v: 3, dev: 'futurexxxxxx', name: 'the laptop', seq: 1, at: Date.now(), sum: '' } }));
      await linkFolder(B.p);
      await B.p.waitForTimeout(1500); await syncNow(B.p);
      const files = await readFolder(B.p), st = await B.p.evaluate(() => ({ mode: window.__board21.link.sync.mode, status: window.__board21.link.status() }));
      ok(st.mode === 'wait' && !Object.keys(files).some(n => /smartboard/.test(n)), `a folder with only a newer 21Board’s file: nothing is decided or written (${JSON.stringify(st)}; ${Object.keys(files).join(', ')})`);
      ok(/the laptop uses a newer 21Board/i.test(st.status), 'and the status says to update');
      await putText(B.p, fut, null);
      // A third device's file arrives cut short: the status never names it by its file's name ("art room Chromebook"):
      // as it names itself once a file of it was read, "another device" before.
      await renamePage(A.p, 'Morning'); await addNote(A.p, 'Morning note'); await linkFolder(A.p);
      const C = await syncDev(browser, 'the art room Chromebook', errors);
      await deliver(A.p, C.p); await linkFolder(C.p);
      const look = async () => { await A.p.evaluate(() => window.__board21.link.check(true, true)); await A.p.waitForTimeout(3500); await A.p.evaluate(() => window.__board21.link.check(true, true)); await A.p.waitForTimeout(800); return A.p.evaluate(() => window.__board21.link.status()); };
      await deliver(C.p, A.p, { cut: 0.5 });
      const s1 = await look();
      ok(/Waiting for Google Drive to bring another device’s latest changes\./.test(s1), `its first file still arriving: “another device” (${s1})`);
      await deliver(C.p, A.p); await syncNow(A.p);
      await typeNote(C.p, await C.p.evaluate(() => Array.from(window.__board21.state.insts.keys())[0]), 'Morning note, from the art room'); await syncNow(C.p);
      await deliver(C.p, A.p, { cut: 0.5 });
      const s2 = await look();
      ok(/Waiting for Google Drive to bring the art room Chromebook’s latest changes\./.test(s2), `a later file still arriving: its device as it names itself (${s2})`);
      await A.c.close(); await B.c.close(); await C.c.close();
    }

    // Settings open on a 1366 × 768 smartboard while a change made here goes out and one from the laptop comes in:
    // "Syncing…" shows beside the folder's name and hides again, the grey line under it never says it, and the rows
    // below stay put (Board Sync is the first section). Settings isn't drawn again for either, nor for a merge that
    // changes nothing it shows.
    {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      await B.p.setViewportSize({ width: 1366, height: 768 });
      const n = await addNote(A.p, 'Homework: page 12');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      await openSettings(B.p);
      // (once nothing has been on its way for 2 s, and the smartboard's own first page, deleted as it joined, has gone
      // for good: that is a change here too)
      const idle = () => B.p.evaluate(() => !window.__board21.link.syncing() && !window.__board21.pages.purges.size);
      await eventually(async () => /^Up to date\./.test(await B.p.locator('#set-link-status').innerText()) && await idle() && !await B.p.waitForTimeout(2000) && await idle(), 40000);
      await B.p.evaluate(() => {
        const body = document.querySelector('#settings .sheet-body');
        window.__ys = []; window.__said = []; window.__lines = []; window.__drawn = 0; window.__what = [];
        // (what was drawn again: where it differs from what was there)
        let was = body.innerHTML;
        new MutationObserver(ms => {
          if (ms.some(m => m.target === body)) { window.__drawn++; const now = body.innerHTML; let i = 0; while (i < now.length && now[i] === was[i]) i++; window.__what.push(now.slice(Math.max(0, i - 60), i + 60)); }
          was = body.innerHTML;
        }).observe(body, { childList: true, subtree: true, characterData: true, attributes: true });
        const look = () => {
          window.__ys.push(Math.round(document.querySelector('#settings [data-act="hist-open"]').getBoundingClientRect().top));
          const s = document.getElementById('set-link-syncing'), t = document.getElementById('set-link-status').textContent;
          const k = s && getComputedStyle(s).visibility === 'visible' ? 'Syncing…' : 'not syncing';
          if (window.__said[window.__said.length - 1] !== k) window.__said.push(k);
          if (!window.__lines.includes(t)) window.__lines.push(t);
        };
        look(); window.__poll = setInterval(look, 40);
      });
      // (a write waits out LINK_GAP_MS after the last one, here 12 s: "Syncing…" meanwhile)
      await syncWaits(B.p, { gap: 12000 });
      const ik = await B.p.evaluate(() => Array.from(window.__board21.state.insts.keys())[0]);
      await B.p.evaluate(ik => { const r = window.__board21.state.insts.get(ik).rect; window.__board21.setRect(ik, Object.assign({}, r, { x: r.x + 60 })); }, ik);
      ok(await eventually(() => B.p.evaluate(() => window.__said[window.__said.length - 1] === 'Syncing…'), 3000), 'a window moved here: “Syncing…” shows beside the folder’s name at once');
      const live = await B.p.evaluate(() => { for (let e = document.getElementById('set-link-syncing'); e; e = e.parentElement) if (e.getAttribute('aria-live') || /^(status|alert|log)$/.test(e.getAttribute('role') || '') || e.tagName === 'OUTPUT') return e.id || e.tagName; return ''; });
      const title = (await B.p.locator('#settings .row:has(#set-link-status) .lbl').innerText()).replace(/\s+/g, ' ').trim();
      ok(!live && /^Synced through “21Board” Syncing…$/.test(title), `in the title, not in a live region (read as “${title}”)`);
      // (the title is one line whatever the folder's name: a long one ends in "…", whole in its tooltip, and "Syncing…"
      // never goes onto a line of its own, which would leave a blank one when it hides)
      const long = await B.p.evaluate(() => {
        const t = document.querySelector('#settings .row.link-folder > .lbl'), n = t.querySelector('.link-name'), s = document.getElementById('set-link-syncing');
        const was = n.textContent, name = 'MrsRodriguezRoom204Grade3SharedWhiteboard2026', short = Math.round(t.getBoundingClientRect().height);
        n.textContent = `“${name}”`;
        const on = Math.round(t.getBoundingClientRect().height), sOn = s.getBoundingClientRect(), tr = t.getBoundingClientRect();
        s.classList.remove('on'); const off = Math.round(t.getBoundingClientRect().height); s.classList.add('on');
        const out = { short, on, off, cut: n.scrollWidth > n.clientWidth, inside: sOn.right <= tr.right + 0.5 && Math.abs(sOn.top - n.getBoundingClientRect().top) < 8, tip: n.title };
        n.textContent = was;
        return out;
      });
      ok(long.on === long.short && long.off === long.short && long.cut && long.inside && long.tip === '21Board', `a long folder name: the title stays one line, the name ending in “…”, “Syncing…” beside it (${JSON.stringify(long)})`);
      await eventually(() => B.p.evaluate(() => window.__said.join() === 'not syncing,Syncing…,not syncing'), 25000);
      await B.p.waitForTimeout(500);
      let out = await B.p.evaluate(() => ({ ys: Array.from(new Set(window.__ys)), said: window.__said.slice(), lines: window.__lines.slice(), drawn: window.__drawn, what: window.__what.slice() }));
      ok(out.said.join() === 'not syncing,Syncing…,not syncing' && out.ys.length === 1, `then it hides once the change is in the folder, and Classroom’s first row stays put (${out.said.join(' → ')}; y ${out.ys.join(' → ')})`);
      ok(out.lines.length && out.lines.every(t => /^Up to date\. This device’s latest changes went to your folder at \d/.test(t)), `the grey line never says “Syncing…”: it says how things stand (${out.lines.join(' | ')})`);
      ok(out.drawn === 0, `and Settings isn’t drawn again (${out.drawn} drawings${out.what.length ? ': ' + out.what.join(' | ') : ''})`);
      // Close all tapped while syncing (as JOIN-3): the same, but for the drawing Close all does itself.
      await B.p.evaluate(() => { window.__ys = []; window.__said = []; window.__lines = []; });
      await B.p.click('#settings [data-act="close-all"]');
      await eventually(() => B.p.evaluate(() => window.__said.includes('Syncing…') && window.__said[window.__said.length - 1] === 'not syncing'), 25000);
      out = await B.p.evaluate(() => ({ ys: Array.from(new Set(window.__ys)), said: window.__said.slice(), lines: window.__lines.slice() }));
      ok(out.said.includes('Syncing…') && out.ys.length === 1 && !out.lines.some(t => /Syncing/.test(t)), `Close all tapped: “Syncing…” beside the folder’s name, then not, and Classroom’s first row stays put (${out.said.join(' → ')}; y ${out.ys.join(' → ')})`);
      await syncWaits(B.p);
      await B.p.focus('#settings [data-act="hist-open"]');
      await B.p.evaluate(() => { window.__ys = []; window.__drawn = 0; });
      await typeNote(A.p, n, 'Homework: page 20'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
      ok(await eventually(async () => /page 20/.test(await notesText(B.p))), 'a change from the laptop arrives');
      await B.p.waitForTimeout(1500);
      const r = await B.p.evaluate(() => { clearInterval(window.__poll); return { ys: Array.from(new Set(window.__ys)), drawn: window.__drawn, focus: document.activeElement.dataset.act }; });
      ok(r.ys.length === 1, `and the rows stay put as it is merged (y ${r.ys.join(' → ')})`);
      ok(r.drawn === 0 && r.focus === 'hist-open', `a merge that changes nothing Settings shows doesn’t draw Settings again: the keyboard stays on what it was on (${r.drawn} drawings; on ${r.focus})`);
      // Board history › Save this version, with Settings open beside it: its copy goes to the folder at once (and
      // counts as a backup), which changes nothing Settings shows.
      await B.p.evaluate(() => { window.__drawn = 0; window.__what = []; });
      const saved = await B.p.evaluate(async () => {
        const H = window.__board21.history;
        await H.save('Before lunch');
        for (let i = 0; i < 60 && !H.metas.some(m => m.kind === 'manual' && m.folder); i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 500));
        return { copied: H.metas.some(m => m.kind === 'manual' && m.folder), drawn: window.__drawn, what: window.__what, focus: document.activeElement.dataset.act };
      });
      ok(saved.copied && saved.drawn === 0 && saved.focus === 'hist-open', `Board history › Save this version with Settings open: its copy in the folder doesn’t draw Settings again (${saved.drawn} drawings${saved.what.length ? ': ' + saved.what.join(' | ') : ''}; on ${saved.focus})`);
      await A.c.close(); await B.c.close();
    }
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  }],
  ['Board Sync review: what merges say, and their Undo (UX-3, UX-4, UX-7…UX-12)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors, { race: 200 }), B = await syncDev(browser, 'the smartboard', errors, { race: 200 });
    await renamePage(A.p, 'Morning');
    const n = await addNote(A.p, 'Homework: page 12');
    for (const [name, text] of [['Math', 'Warm-up'], ['Art', 'Paints'], ['Music', 'Songs'], ['Gym', 'Shoes'], ['Drama', 'Lines']]) {
      await A.p.evaluate(name => window.__board21.pages.create({ end: true, name }), name); await A.p.waitForTimeout(700); await addNote(A.p, text);
    }
    const go = (p, name) => p.evaluate(async name => { const P = window.__board21.pages, b = P.ids().find(b => P.name(b) === name); if (b !== window.__board21.state.boardId) { await P.go(b); await new Promise(r => setTimeout(r, 800)); } return P.info.get(b).uid; }, name);
    await go(A.p, 'Morning');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    await go(B.p, 'Morning');
    const wid = (await winList(A.p)).find(x => x.data && x.data.text === 'Homework: page 12').wid, nB = await ikOf(B.p, wid);
    const fresh = async p => { await p.evaluate(() => { window.__board21.mergeUI.drop(); document.getElementById('toasts').innerHTML = ''; }); await hear(p); };
    const toastOf = (p, text) => p.locator('#toasts .toast:not(.out)', { hasText: text });
    const dropPages = (p, names) => p.evaluate(async names => { const P = window.__board21.pages, bs = names.map(n => P.ids().find(b => P.name(b) === n)); P.drop(bs); await P.purge(bs); }, names);
    const pageNames = p => p.evaluate(() => window.__board21.pages.ids().map(b => window.__board21.pages.name(b)));

    // UX-3: a clash where the smartboard's text is the later one stays in its window. The laptop makes the copy; when
    // it arrives, the smartboard says both versions are kept, with no Undo that would do nothing.
    await typeNote(A.p, n, 'Homework: page 20 (laptop)'); await syncNow(A.p);
    await typeNote(B.p, nB, 'Homework: page 21 (smartboard)'); await syncNow(B.p);
    await deliver(A.p, B.p); await syncNow(B.p);
    await deliver(B.p, A.p); await syncNow(A.p);
    ok((await copiesOf(A.p)).length === 1 && await toastOf(A.p, 'at once. Both versions are kept').locator('button', { hasText: 'Undo' }).count() === 1, 'the laptop, whose text lost, keeps it as a copy, and offers Undo (a swap)');
    // (the label the round gives Board history, as the round passes it: see the same-name test above)
    await B.p.evaluate(() => { const H = window.__board21.history, bm = H.beforeMerge.bind(H); window.__labels = []; H.beforeMerge = function (pages, label, hist) { window.__labels.push(label); return bm(pages, label, hist); }; });
    await fresh(B.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok((await heard(B.p)).includes('Notes was changed here and on the laptop at once. Both versions are kept.'), `the smartboard says both versions are kept (${(await heard(B.p)).join(' | ')})`);
    const labels3 = await B.p.evaluate(() => window.__labels);
    ok(labels3.includes('Before changes from the laptop') && !labels3.some(l => / from $/.test(l)), `the version before it, made when only the copy arrived, is “Before changes from the laptop” (${JSON.stringify(labels3)})`);
    ok(await toastOf(B.p, 'at once. Both versions are kept').locator('button').count() === 0, 'with no Undo: there is nothing it wrote here to undo');
    await exchange(A, B);
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);

    // UX-8: another page (not shown) deleted on the laptop: its Undo on the smartboard brings it back, and stays on the
    // page shown.
    await fresh(B.p); await dropPages(A.p, ['Art']); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await eventually(async () => await toastOf(B.p, '“Art” was deleted on the laptop.').count() === 1), 'another page deleted on the laptop: said, with Undo');
    await fresh(A.p);
    await toastOf(B.p, '“Art” was deleted on the laptop.').locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => (await pageNames(B.p)).includes('Art')) && await B.p.evaluate(() => window.__board21.state.board.name) === 'Morning', 'its Undo brings it back, and the smartboard stays on the page shown');
    await B.p.waitForTimeout(600); await exchange(A, B);
    // (FIN-3) the laptop is told it was brought back there, not that it was changed there before the deletion arrived
    ok((await heard(A.p)).includes('“Art” was brought back on the smartboard.') && !(await heard(A.p)).some(t => /before the deletion reached it/.test(t)), `the laptop says “Art” was brought back on the smartboard (${(await heard(A.p)).join(' | ')})`);

    // UX-7: three pages deleted on the laptop at once: one message, one Undo for all three.
    await fresh(B.p); await dropPages(A.p, ['Music', 'Gym', 'Drama']); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    const h7 = await heard(B.p);
    ok(h7.includes('3 pages were deleted on the laptop.') && !h7.some(t => /“(Music|Gym|Drama)” was deleted/.test(t)), `three pages deleted at once: one message (${h7.join(' | ')})`);
    ok(await B.p.locator('#toasts .toast:not(.out)').count() === 1, 'and one toast');
    await toastOf(B.p, '3 pages were deleted on the laptop.').locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => (await pageNames(B.p)).filter(x => ['Music', 'Gym', 'Drama'].includes(x)).length === 3), 'its Undo brings all three back');
    ok(await B.p.evaluate(() => window.__board21.state.board.name) === 'Morning', 'and the smartboard stays on the page shown');
    await B.p.waitForTimeout(600); await exchange(A, B);

    // UX-10: windows locked while an Undo is offered: the Undo goes; an Undo tapped while locked says why nothing happened.
    await fresh(B.p); await typeNote(A.p, n, 'Homework: page 32'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await toastOf(B.p, 'Updated from the laptop.').locator('button', { hasText: 'Undo' }).count() === 1, 'an update with Undo');
    await lockBoard(B.p, 'widgets');
    ok(await B.p.evaluate(() => !!window.__board21.state.settings.locked) && await toastOf(B.p, 'Updated from the laptop.').locator('button').count() === 0, 'locked: the Undo goes');
    await hear(B.p); await B.p.evaluate(() => window.__board21.mergeUI.undo([{ key: 'x', rev: 1, prev: null }], [], ['laptopxxxxxx']));
    ok((await heard(B.p)).includes('The board is locked.'), 'an Undo tapped while locked says the board is locked');
    await unlockBoard(B.p);

    // UX-4: a plain "Updated from …" gets a new message at most once a LINK_TOAST_MS, even after the one shown went.
    await B.p.evaluate(() => { window.__board21.link.waits.toast = 30000; window.__board21.mergeUI.plainAt = 0; });
    await fresh(B.p);
    await B.p.evaluate(() => { window.__nodes = 0; new MutationObserver(ms => { for (const m of ms) for (const nd of m.addedNodes) if (nd.classList && nd.classList.contains('toast')) window.__nodes++; }).observe(document.getElementById('toasts'), { childList: true }); });
    await typeNote(A.p, n, 'Homework: page 40'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    await B.p.evaluate(() => window.__board21.mergeUI.drop());   // (as if its 20 s were over)
    await typeNote(A.p, n, 'Homework: page 41'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await B.p.evaluate(() => window.__nodes) === 1 && await noteOf(B.p, await ikOf(B.p, wid)) === 'Homework: page 41', `two updates within the minute: one message, the second applied quietly (${await B.p.evaluate(() => window.__nodes)} messages)`);
    await B.p.evaluate(() => { window.__board21.link.waits.toast = 1000; });

    // UX-11: the times said are when a change was made, not when it was merged: a laptop whose clock is 10 hours
    // behind changes Math (not shown on the smartboard) and deletes Art.
    await setClock(A.p, -10 * 3600e3);
    const mk = await A.p.evaluate(async () => { const P = window.__board21.pages; await P.go(P.ids().find(b => P.name(b) === 'Math')); await new Promise(r => setTimeout(r, 900)); return Array.from(window.__board21.state.insts.keys()).find(k => k.startsWith('notes:')); });
    // (the minute on the laptop's clock before and after the change: it may be made just as one minute turns)
    const clockA = () => A.p.evaluate(() => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const whenA0 = await clockA();
    await typeNote(A.p, mk, 'Warm-up: 9 × 6'); await syncNow(A.p);
    const whenA1 = await clockA(), whenA = whenA0 === whenA1 ? whenA0 : `${whenA0} or ${whenA1}`;
    await dropPages(A.p, ['Art']); await syncNow(A.p);
    await fresh(B.p); await deliver(A.p, B.p); await syncNow(B.p);
    await go(B.p, 'Math');
    const quiet = (await heard(B.p)).find(t => /^Changed on the laptop/.test(t)) || '';
    ok(quiet.includes(whenA0) || quiet.includes(whenA1), `the note on a page changed while not shown says when it was changed there (${quiet}; the laptop’s clock said ${whenA})`);
    await go(B.p, 'Morning');
    await B.p.waitForTimeout(23500);   // (Art's Undo time over: it goes to Board history › Deleted pages)
    const rows = await B.p.evaluate(async () => { window.__board21.historySheet.open('left'); await new Promise(r => setTimeout(r, 1500)); const h = document.getElementById('history'); const out = Array.from(h.querySelectorAll('.inst-list .inst')).map(e => e.innerText.replace(/\s+/g, ' ')).filter(t => /deleted/.test(t)); window.__board21.historySheet.close(); return out; });
    ok(rows.some(r => r.includes('“Art”') && r.includes(whenA)), `Board history › Deleted pages: “Art”, deleted when the laptop deleted it (${JSON.stringify(rows)})`);
    await setClock(A.p, 0);

    // UX-12: a locked smartboard's page shown deleted on the laptop: the message points to Board history › Deleted
    // pages, and the page is there at once (its Undo still running); Bring back brings it back.
    await exchange(A, B);
    await go(B.p, 'Math'); await go(A.p, 'Morning');
    await lockBoard(B.p, 'widgets');
    await fresh(B.p); await dropPages(A.p, ['Math']); await syncNow(A.p); await deliver(A.p, B.p);
    ok(await eventually(async () => { await syncNow(B.p); return (await heard(B.p)).includes('“Math” was deleted on the laptop. Find it in Board history › Deleted pages.'); }, 15000), 'locked: “… Find it in Board history › Deleted pages.”');
    await unlockBoard(B.p);   // (Board history doesn't open while locked)
    const now12 = await B.p.evaluate(async () => { window.__board21.historySheet.open('left'); await new Promise(r => setTimeout(r, 1500)); const h = document.getElementById('history'); const out = Array.from(h.querySelectorAll('.inst-list .inst')).map(e => e.innerText.replace(/\s+/g, ' ')).filter(t => /“Math” · deleted/.test(t)); return out; });
    ok(now12.length === 1, `and Board history › Deleted pages lists it at once (${JSON.stringify(now12)})`);
    await B.p.locator('#history .inst', { hasText: '“Math” · deleted' }).locator('button', { hasText: 'Bring back' }).click();
    ok(await eventually(async () => (await pageNames(B.p)).includes('Math')), 'and Bring back brings it back');

    // FIN-1: Board history opened while a deleted page's Undo runs, and Bring back tapped after it is over (the page's
    // records gone, its version kept): the page comes back. An open list's row turns into the kept version's as the Undo
    // ends; one tapped just as it ends brings the page back from that version. (FIN-7: the Deleted pages hint is a hint.)
    const drop1 = name => B.p.evaluate(name => { const P = window.__board21.pages, b = P.ids().find(x => P.name(x) === name); P.drop([b]); return b; }, name);
    const actOf = name => B.p.evaluate(name => { const r = Array.from(document.querySelectorAll('#history .inst')).find(e => e.textContent.includes(`“${name}” · deleted`)), b = r && r.querySelector('button'); return b ? b.dataset.act : null; }, name);
    await fresh(B.p);
    const gym = await drop1('Gym');
    await B.p.evaluate(() => window.__board21.historySheet.open('left'));
    await eventually(async () => await actOf('Gym') !== null, 8000);
    const act0 = await actOf('Gym');
    await B.p.evaluate(b => window.__board21.pages.purge([b]), gym);   // (as the Undo's timer does, 23 s after)
    ok(act0 === 'bring-now' && await eventually(async () => await actOf('Gym') === 'bring', 5000), `Deleted pages: its Undo while that runs, then its kept version once it is over (${act0} → ${await actOf('Gym')})`);
    const look = await B.p.evaluate(() => { const h = getComputedStyle(document.querySelector('#history .sheet-body > .hint')), i = getComputedStyle(document.querySelector('#history .hist-intro')); return { size: h.fontSize, muted: h.color === i.color }; });
    ok(look.size === '13px' && look.muted, `its hint is set as a hint: 13 px, muted (${JSON.stringify(look)})`);
    await B.p.locator('#history .inst', { hasText: '“Gym” · deleted' }).locator('button', { hasText: 'Bring back' }).click();
    ok(await eventually(async () => (await pageNames(B.p)).includes('Gym') && await B.p.evaluate(() => window.__board21.state.board.name === 'Gym')) && !(await heard(B.p)).includes('That can’t be undone anymore.'),
      `and its Bring back brings the page back, and goes to it (${(await heard(B.p)).join(' | ')})`);
    const drama = await drop1('Drama');
    await B.p.evaluate(() => window.__board21.historySheet.open('left'));
    await eventually(async () => await actOf('Drama') !== null, 8000);
    const act1 = await B.p.evaluate(b => {   // (tapped just as its Undo ends: the row is still the Undo)
      window.__board21.pages.purge([b]);
      const r = Array.from(document.querySelectorAll('#history .inst')).find(e => e.textContent.includes('“Drama” · deleted')).querySelector('button'), act = r.dataset.act;
      r.click(); return act;
    }, drama);
    ok(act1 === 'bring-now' && await eventually(async () => (await pageNames(B.p)).includes('Drama'), 8000) && !(await heard(B.p)).includes('That can’t be undone anymore.'),
      `Bring back tapped just as the Undo ends brings the page back too (${act1}; ${(await heard(B.p)).join(' | ')})`);

    // UX-9: another device on a newer 21Board: Settings says to update; its Update button only once the update is here.
    await putText(B.p, '21Board (laptop) [fut1].21board', JSON.stringify({ format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Future', uid: 'aaaaaaaa-0000-4000-8000-000000000000' }, instances: [], sync: { v: 3, dev: 'futurexxxxxx', name: 'the Chromebook', seq: 1, at: Date.now(), sum: '' } }));
    await syncNow(B.p);
    await openSettings(B.p);
    const warn = B.p.locator('#settings .save-warn');
    ok(await eventually(async () => /Update 21Board on this device/.test(await warn.innerText().catch(() => ''))) && await warn.locator('button').count() === 0, 'a newer 21Board elsewhere: Settings says to update, with no Update button before the update is here');
    await B.p.evaluate(() => { window.__board21.state.sw.updateReady = true; window.__board21.link.redraw(); });
    ok(await eventually(async () => await warn.locator('button', { hasText: 'Update' }).count() === 1), 'and an Update button once it is');
    await B.p.evaluate(() => { window.__board21.state.sw.updateReady = false; });
    await B.p.keyboard.press('Escape');

    // UX-12: the Deleted pages hint on a device that never set up Board Sync doesn't mention other devices.
    const C = await syncDev(browser, 'a computer', errors);
    await renamePage(C.p, 'Morning');
    await C.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Spelling' })); await C.p.waitForTimeout(700); await addNote(C.p, 'because');
    await dropPages(C.p, ['Spelling']);
    const hint = await C.p.evaluate(async () => { window.__board21.historySheet.open('left'); await new Promise(r => setTimeout(r, 1500)); const h = document.getElementById('history'), d = Array.from(h.querySelectorAll('.hist-day')).find(x => /Deleted pages/.test(x.textContent)); const t = d && d.nextElementSibling.textContent; window.__board21.historySheet.close(); return t; });
    ok(hint === 'Pages deleted in the last 30 days.', `not linked: “Pages deleted in the last 30 days.” (${hint})`);
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await A.c.close(); await B.c.close(); await C.c.close();
  }],

  ['Board Sync merge: a save of what the other folder showed, just after Change… back (a take)', async (browser) => {
    const errors = [];
    const lastStep = p => p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 45000 });
    const done = async p => { await p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await p.keyboard.press('Escape'); await eventually(() => p.evaluate(() => { const l = window.__board21.link; return !l.sync.mode && !l.running && !l.timers.full; }), 20000); };
    const change = async (p, pick) => { await p.evaluate(pick => { window.__drive = { pick }; }, pick); await openSettings(p); await p.click('#settings [data-act="link-choose"]'); await lastStep(p); await done(p); };
    for (const what of ['name', 'text']) {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      await renamePage(A.p, 'Main'); const nA = await addNote(A.p, 'Shared note');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      const uid = await A.p.evaluate(() => window.__board21.state.board.uid), wid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, nA);
      // the smartboard: Change… to a new, empty folder (its board, the same page and window, goes there), and work there
      await change(B.p, 'Room 14');
      ok(await B.p.evaluate(u => window.__board21.state.board.uid === u, uid), '(the smartboard shows the same page in Room 14)');
      const b = await B.p.evaluate(() => window.__board21.state.boardId), ikB = await ikOf(B.p, wid);
      if (what === 'name') await renamePage(B.p, 'Room 14 name'); else await typeNote(B.p, ikB, 'Room 14 text');
      await syncNow(B.p);
      // the laptop, in the first folder
      if (what === 'name') await renamePage(A.p, 'Room 12 name'); else await typeNote(A.p, nA, 'Room 12 text');
      await syncNow(A.p); await deliver(A.p, B.p);
      // the smartboard: Change… back to the first folder (a take). Just after the take writes the record, within
      // LINK_RACE_MS, something here saves it as it showed it in Room 14 (a second tab that hadn't seen the switch, or a
      // widget saving what it showed): the race guard bases that save on the revision before the take.
      const key = what === 'name' ? `board:${b}` : `data:${b}:${ikB}`;
      await B.p.evaluate(key => {
        const W = window.__board21;
        window.__stale = W.store.getMany([key]).then(([old]) => new Promise(res => {
          const iv = setInterval(async () => {
            const [r] = await W.store.getMany([key]);
            if (r && r.m && JSON.stringify(r.value) !== JSON.stringify(old.value)) { clearInterval(iv); await W.writer.put(key, old.type, old.value); res({ old: old.value, merged: r.value }); }
          }, 20);
        }));
      }, key);
      await change(B.p, '21Board');
      const st = await B.p.evaluate(() => window.__stale);
      const saved = (await B.p.evaluate(key => window.__board21.store.getMany([key]), key))[0];
      ok(!!st, `(the stale save landed after the take's write: ${JSON.stringify(st && st.merged)} written over by ${JSON.stringify(st && st.old)}, base ${saved && saved.base})`);
      await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p); await exchange(A, B);
      const pageA = (await shownBoard(A.p))[uid], pageB = (await shownBoard(B.p))[uid];
      const texts = Object.values(pageA.wins).map(w => (w.data && w.data.text) || '');
      if (what === 'name') ok(pageA.name === 'Room 12 name' && pageB.name === 'Room 12 name', `the laptop's rename in the first folder stays, on both (laptop "${pageA.name}", smartboard "${pageB.name}")`);
      else ok(texts.length === 1 && texts[0] === 'Room 12 text' && !(await copiesOf(A.p)).length, `the laptop's text stays in its window, with no copy (${JSON.stringify((await winList(A.p)).filter(x => x.uid === uid).map(x => [x.data && x.data.text, x.copyOf ? 'copy from ' + x.copyOf.name : 'window']))})`);
      ok(await sameBoards(A.p, B.p), 'the same board on both');
      await A.c.close(); await B.c.close();
    }
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  }],
  ];
};
