// Offline, updates, opening from disk, and storage that fails.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, fillNote, DEV_WIDGET, eventually, STORAGE_FAULTS, NP_STYLES,
    storedRecords, release, stamped, STAMPED, SITES, deploy, marked, parts, updateCheck, boardUp, TESTS_DIR, BASE
  } = T;
  return [
  ['Offline', async (browser) => {
    // The offline copy holds the files each widget lists in widgets/registry.js (`files`), with the board's own (sw.js
    // SHELL_FILES). Every script, stylesheet and picture a widget's page loads from 21Board's site must be among them:
    // a Name Picker style left out, say, would quietly be Big name offline.
    {
      const reg = { self: {} };
      require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'widgets', 'registry.js'), 'utf8'), reg);
      const shell = (/const SHELL_FILES = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')) || ['', ''])[1].match(/'[^']+'/g).map(x => x.slice(1, -1));
      const missing = [];
      let seen = 0;
      for (const w of reg.self.BOARD21_WIDGETS.filter(w => !w.external)) {
        const have = new Set(shell.concat(w.files && w.files.length ? w.files : [w.entry]));
        const html = fs.readFileSync(path.join(ROOT, w.entry), 'utf8');
        for (const m of html.matchAll(/<(?:script|img|link|source)\b[^>]*?\s(?:src|href)="([^"#?]+)/gi)) {
          if (/^([a-z]+:|\/\/)/i.test(m[1])) continue;   // (another site, data:, blob:)
          const f = path.posix.normalize(path.posix.join(path.posix.dirname(w.entry), m[1]));
          seen++;
          if (!have.has(f)) missing.push(`${w.id}: ${f}`);
        }
        // and every url(…) in its <style> blocks, such as a font (not data:, #… or %23…, another site, or a template's ${…})
        for (const st of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
          for (const m of st[1].matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
            if (/^([a-z]+:|\/\/|#|%23)/i.test(m[2]) || m[2].includes('${')) continue;
            const f = path.posix.normalize(path.posix.join(path.posix.dirname(w.entry), m[2].replace(/[?#].*$/, '')));
            seen++;
            if (!have.has(f)) missing.push(`${w.id}: ${f}`);
          }
        }
      }
      ok(seen > 5 && !missing.length, `every file a widget’s page loads from 21Board’s site is in the offline copy’s list (${missing.join(', ') || seen + ' files checked'})`);
    }
    ok(stamped(), STAMPED);
    if (!stamped()) return;   // (no offline copy is saved then)
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + ''); await freeBoard(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    const cached = await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
    console.log('cached files:', cached.length, cached.join(' '));
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(800);
    ok(await page.locator('.picker-btn.left').isVisible(), 'board loads offline');
    // (Not the district apps: they come from their own sites, keep their own offline copies and have no SDK to
    // connect with. Their suite, "District apps", covers them.)
    const ids = await page.evaluate(() => window.__board21.catalog().filter(a => !a.devOnly && !a.external).map(a => a.id));
    for (const id of ids) await page.evaluate(id => window.__board21.openWidget(id), id);
    await page.waitForTimeout(2500);
    const conn = await page.evaluate(() => Array.from(window.__board21.state.wins.values()).map(w => [w.ikey, w.connected]));
    ok(conn.length === ids.length && conn.every(c => c[1]), 'every widget loads and connects offline: ' + JSON.stringify(conn));
    const styles = await page.frameLocator('.win[data-ikey="name-picker:1"] iframe').locator('html').evaluate(() => Object.keys(NamePicker.styles).sort().join());
    ok(styles === NP_STYLES.map(s => s[0]).sort().join(), `the Name Picker has all ${NP_STYLES.length} of its styles offline (${styles})`);
    await page.screenshot({ path: OUT + '30-offline-all-widgets.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['When storage fails (start-up and saving)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });   // (so the page's files can be swapped below)
    await ctx.addInitScript(STORAGE_FAULTS);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => { if (!/Not saved yet/.test(e.message)) errors.push(e.message); });   // (Notes doesn't catch a failed save())
    const note = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    const until = async (fn, ms = 6000) => { for (const t = Date.now(); Date.now() - t < ms; await page.waitForTimeout(100)) if (await fn().catch(() => false)) return true; return false; };
    const noteIs = text => until(async () => await note.locator('#t').inputValue() === text);
    const faults = v => page.evaluate(v => { if (v) localStorage.setItem('test-faults', JSON.stringify(v)); else localStorage.removeItem('test-faults'); }, v);
    const started = (p = page) => p.waitForFunction(() => window.__board21 && window.__board21.store.loaded && !document.getElementById('startup'));
    const failed = () => page.waitForSelector('#startup .modal-card', { timeout: 20000 });
    const B = fn => page.evaluate(fn);
    const stored = async () => JSON.stringify(await storedRecords(page));
    const noteShown = () => page.locator('.save-note.left:visible').count();
    const settingsText = async () => { await openSettings(page, ['saved', 'advanced', 'about']); const t = await page.locator('#settings .sheet-body').innerText(); await page.keyboard.press('Escape'); return t; };
    const toastGone = text => page.waitForFunction(text => !Array.from(document.querySelectorAll('#toasts .toast')).some(t => t.textContent.includes(text)), text, { timeout: 15000 });
    // The database disappears behind the open board (as when the browser throws its damaged storage away).
    const loseDatabase = () => page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('21Board'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));

    await page.goto(BASE); await started(); await freeBoard(page);
    ok(await B(() => !document.getElementById('empty-hint').hidden && !document.getElementById('boot-note')), 'a new board says “Your board is ready” only once it has really been opened');
    await B(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('timer'); });
    await fillNote(note, 'A week of lesson notes');
    await until(async () => (await storedRecords(page))['data:1:notes:1'].text === 'A week of lesson notes');
    await until(() => B(async () => !!(await window.__board21.history.save('my saved version'))));
    const before = await stored(), uid = JSON.parse(before)['board:1'].uid;

    // ---- start-up: the stored board can't be read
    await faults({ read: 1 }); await page.reload(); await started();
    ok(await B(() => window.__board21.state.wins.size === 2) && await noteIs('A week of lesson notes'), 'one failed read at start-up is tried again: the board opens as usual');
    await faults({ read: 'all' }); await page.reload(); await failed();
    ok(/couldn’t open your board/.test(await page.locator('#startup h3').innerText()) && await page.locator('#startup [data-go="retry"]').count() === 1,
      'when the board can’t be read, 21Board says so, with Try again');
    ok(await B(() => document.getElementById('empty-hint').hidden && window.__board21.state.wins.size === 0), 'and never shows an empty board that says “Your board is ready”');
    await B(() => { window.__board21.openWidget('notes'); window.__board21.setBoardShape('16:9'); window.__board21.setBoardScale(0.8); });
    await page.waitForTimeout(400);
    ok(await stored() === before, 'nothing is saved over the stored board (not a default board record, not a new board id)');
    await faults(null); await page.click('#startup [data-go="retry"]'); await started();
    ok(await noteIs('A week of lesson notes') && JSON.parse(await stored())['board:1'].uid === uid, 'Try again opens the board as it was');

    // ---- carrying on without the stored board
    await faults({ read: 'all' }); await page.reload(); await failed();
    await page.click('#startup [data-go="on"]'); await started();
    ok(await B(() => window.__board21.store.failed === 'unopened' && window.__board21.state.wins.size === 0) && await noteShown() === 1, '“Use 21Board without saving” gives an empty board with a lasting “Not saved” note');
    await B(() => { window.__board21.openWidget('notes'); });
    await fillNote(note, 'typed without saving');
    await until(() => B(() => JSON.stringify([...window.__board21.state.data.values()]).includes('typed without saving')));
    ok(await stored() === before, 'what is done there never touches the stored board');
    ok(await B(async () => (await window.__board21.buildExport('full')).instances.some(i => i.data && i.data.text === 'typed without saving')), 'and can still be exported');
    let st = await settingsText();
    ok(/This board isn’t being saved/.test(st) && /not saved/.test(st) && !/stays saved|B saved|stored only on this device/.test(st), 'Settings says the board isn’t being saved (and nowhere that it is)');
    ok(await until(() => B(() => window.__board21.history.enabled() && window.__board21.history.metas.some(m => m.manual))) && !/history isn’t available/.test(st),
      'Board history still works there: the saved board’s earlier versions can be reached');
    await B(async () => { const h = window.__board21.history; await h.restore(h.metas.find(m => m.manual).id); });
    ok(await noteIs('A week of lesson notes') && await noteShown() === 1 && await stored() === before, 'going back to one shows it on this unsaved board (and can be exported); the stored board is still untouched');
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="erase"]');
    ok(await page.locator('#modal.open', { hasText: 'Empty this board?' }).filter({ hasText: 'Your saved board isn’t touched' }).count() === 1 && await page.locator('#modal.open .btn', { hasText: 'history' }).count() === 0,
      'there, Erase only offers to empty the board on screen, and says the saved board isn’t touched');
    await page.locator('#modal.open .btn', { hasText: 'Empty this board' }).click();
    await page.waitForSelector('.toast:has-text("Board emptied. Your saved board wasn’t touched.")');
    ok(await B(() => window.__board21.state.wins.size === 0) && await stored() === before, 'and that is all it does');
    await page.keyboard.press('Escape');
    await faults(null); await page.reload(); await started();
    ok(await noteIs('A week of lesson notes') && await noteShown() === 0, 'after a reload the stored board is back, untouched');

    // ---- opening storage
    await faults({ open: 1 }); await page.reload(); await started();
    ok(await B(() => !window.__board21.store.failed && window.__board21.state.wins.size === 2) && await noteShown() === 0, 'a hiccup opening storage is tried again (not treated as a private window for the whole session)');
    await faults({ open: 9 }); await page.reload(); await failed();
    ok(await B(() => !window.__board21.store.failed) && /backing store/.test(await page.locator('#startup').innerText()) && await stored() === before, 'storage that won’t open gets the same message (with the reason for IT), and nothing is written');
    await faults({ open: 'hang' }); await page.reload();
    ok(await until(() => B(() => /Opening your board/.test(document.getElementById('startup').textContent) && document.getElementById('empty-hint').hidden)), 'while storage doesn’t answer, the page says it is opening the board');
    await failed();
    ok(/didn’t answer/.test(await page.locator('#startup').innerText()), 'storage that never answers ends in the message too (after 10 seconds)');
    await faults({ open: 'blocked' }); await page.reload(); await started();
    ok(await B(() => window.__board21.store.failed === 'blocked' && !!window.__board21.store.mem) && await page.locator('.toast', { hasText: 'blocking storage' }).count() === 1, 'storage blocked by the browser: the board works for this session, and says nothing will be saved');
    ok(await noteShown() === 1 && await B(() => !document.querySelector('.save-note').closest('#toasts')), 'with a “Not saved” note that stays (it isn’t a toast)');
    await B(() => { window.__board21.openWidget('notes'); });
    await fillNote(note, 'in a private window');
    await until(() => B(() => JSON.stringify([...window.__board21.state.data.values()]).includes('in a private window')));
    st = await settingsText();
    ok(/This board isn’t being saved/.test(st) && /Notes[\s\S]*not saved/.test(st) && !/stays saved|B saved|stored only on this device/.test(st) && /Empty this board/.test(st) && !/Erase everything/.test(st),
      'Settings doesn’t call that content saved, and offers to empty the board (there is nothing stored to erase)');
    await page.click('.save-note.left');
    ok(await page.locator('#modal.open', { hasText: 'Use a normal window, not a private one.' }).count() === 1 && await page.locator('#modal.open .btn', { hasText: 'Export a backup' }).count() === 1, 'tapping the note says why, and offers a backup');
    await page.locator('#modal.open .btn', { hasText: 'Close' }).click();
    ok(await B(async () => (await window.__board21.buildExport('full')).instances.some(i => i.data && i.data.text === 'in a private window')) && await stored() === before, 'the backup has the session’s content; the stored board is untouched');
    await page.goto(BASE + '?kiosk=yes'); await started();
    st = await settingsText();
    ok(/This board isn’t being saved/.test(st) && /Kiosk mode/.test(st) && !/is kept on this device|stored only on this device/.test(st), 'in kiosk mode too, Settings doesn’t say the board is kept on this device');
    await page.goto(BASE);

    // ---- start-up throws: a page from another version than board.js (here: from before Board history)
    await faults(null);
    await page.route(BASE, r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<section id="history"[\s\S]*?<\/section>/, '') }));
    await page.reload(); await failed();
    ok(/couldn’t start/.test(await page.locator('#startup h3').innerText()) && await page.locator('#startup [data-go]').count() === 1, 'if start-up throws, 21Board says it couldn’t start, with Try again');
    await B(() => { window.__board21.openWidget('notes'); window.__board21.setBoardShape('16:9'); });
    await page.waitForTimeout(400);
    ok(await stored() === before, 'and saves nothing');
    await page.unroute(BASE); await page.click('#startup [data-go="retry"]'); await started();
    ok(await noteIs('A week of lesson notes'), 'with the right files again, Try again opens the board');
    // A damaged settings record (one like it used to stop start-up: "number 5 is not iterable"): the pages' settings
    // are damaged, and it has an older release's devWidgets.
    await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const t = o.result.transaction('records', 'readwrite'); t.objectStore('records').put({ key: 'settings', type: 'settings', rev: Date.now() + 1e6, updatedAt: Date.now(), by: 'test', value: { theme: 'dark', devWidgets: 5, boards: 5, deletedBoards: 5, deletedAt: 5, lastBoard: 'x' } }); t.oncomplete = () => { o.result.close(); res(); }; }; }));
    await page.reload(); await started();
    ok(await noteIs('A week of lesson notes') && await B(() => document.body.classList.contains('dark') && !('devWidgets' in window.__board21.state.settings)), 'a damaged settings record doesn’t stop the board from opening (and an old devWidgets is dropped)');

    // ---- a save fails: kept, shown, tried again
    await B(() => { const h = window.__board21.history, thin = h.thin.bind(h); window.__room = { thin: 0 }; h.thin = () => { window.__room.thin++; return thin(); }; });
    const said = () => page.locator('.toast', { hasText: 'Couldn’t save your latest changes. 21Board keeps trying.' }).count();
    await B(() => { window.__failPut = 'unnamed'; });
    await fillNote(note, 'typed while saving failed');
    await page.waitForSelector('.save-note.left:visible');
    await fillNote(note, 'typed while saving failed, and more');
    await until(() => B(() => window.__board21.state.data.get('notes:1').text === 'typed while saving failed, and more'));
    await page.waitForTimeout(300);
    ok(await said() === 1 && await noteShown() === 1, 'a failed save shows a lasting “Not saved” note, and one message (not one for every change)');
    ok(JSON.parse(await stored())['data:1:notes:1'].text === 'A week of lesson notes' && await B(() => window.__room.thin === 0), 'the stored note is the old one; an error that doesn’t mean “full” leaves board history alone');
    await B(() => window.__board21.closeWin('timer:1', { quiet: true }));
    ok(await until(async () => await page.locator('.win[data-ikey="timer:1"]').count() === 0), 'the board carries on meanwhile (a window still closes)');
    st = await settingsText();
    ok(/latest changes aren’t saved yet/.test(st) && /Notes[\s\S]*not saved/.test(st) && !/stays saved/.test(st), 'Settings says the changes aren’t saved yet');
    ok(await B(async () => (await window.__board21.buildExport('full')).instances.find(i => i.widgetId === 'notes').data.text === 'typed while saving failed, and more'), 'an export made now has the unsaved changes');
    ok(await B(async () => { try { await window.__board21.applyImport(await window.__board21.buildExport('full'), 'replace'); return ''; } catch (e) { return e.message; } }).then(m => /can’t save/.test(m)) && await B(() => window.__board21.state.wins.size === 1),
      'importing is refused while changes can’t be saved (they would land on the imported board later)');
    // The backup must not depend on storage: here it can't be read either.
    await faults({ read: 'all' });
    await page.click('.save-note.left');
    ok(await page.locator('#modal.open', { hasText: 'may be out of space' }).count() === 1, 'the note’s message mentions space even when the error doesn’t say “full” (a full disk isn’t always reported as one)');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#modal.open .btn', { hasText: 'Export a backup' }).click()]);
    const backup = OUT + 'storage-broken.21board'; await dl.saveAs(backup);
    ok(JSON.parse(fs.readFileSync(backup, 'utf8')).instances.find(i => i.widgetId === 'notes').data.text === 'typed while saving failed, and more' && await page.locator('.toast', { hasText: 'Couldn’t export' }).count() === 0,
      'with storage neither writable nor readable, “Export a backup” still gives a file with the unsaved work');
    await faults(null);
    await toastGone('Couldn’t save your latest changes.');
    ok(await noteShown() === 1 && await said() === 0, 'the “Not saved” note is still there after the message has gone');
    await B(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    let now = JSON.parse(await stored());
    ok(now['data:1:notes:1'].text === 'typed while saving failed, and more' && now['inst:1:timer:1'].open === false && await page.locator('.toast', { hasText: 'saved again' }).count() === 1,
      'once saving works again, everything that was waiting is saved, and the note goes away');
    // "Full", however the browser says it: board history is asked to make room (see the Board history suites), then keep trying.
    await B(() => { window.__failPut = 'quota'; });
    await fillNote(note, 'typed on a full device');
    await page.waitForSelector('.save-note.left:visible');
    ok(await B(() => window.__room.thin === 1), 'out of space (QuotaExceededError): board history is asked to make room (once: it has nothing old to give up here)');
    await page.click('.save-note.left');
    ok(await page.locator('#modal.open', { hasText: 'This device is out of space' }).count() === 1, 'and the note says the device is out of space');
    await B(() => { window.__failPut = null; });
    await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    await B(() => { window.__failPut = 'disk'; });
    await fillNote(note, 'typed on a full disk');
    await page.waitForSelector('.save-note.left:visible');
    ok(await B(() => window.__room.thin === 2), 'a full disk reported another way (“Failed to write blobs”) is treated the same');
    await B(() => { window.__failPut = null; });
    await page.waitForSelector('.save-note.left', { state: 'hidden', timeout: 8000 });   // (tried again by itself after 5 seconds)
    await page.reload(); await started();
    ok(await noteIs('typed on a full disk'), '21Board tries again by itself, and the text is there after a reload');

    // ---- one record that can't be written doesn't hold back the others
    await B(() => { window.__failPut = 'key:data:1:notes:1'; });
    await fillNote(note, 'a note too long for what is left on the device');
    await page.waitForSelector('.save-note.left:visible');
    await B(() => { window.__board21.setRect('notes:1', { x: 80, y: 90, w: 420, h: 320 }); window.__board21.openWidget('timer'); });
    ok(await until(async () => { const r = await storedRecords(page); return r['inst:1:notes:1'].rect.x === 80 && r['inst:1:timer:1'].open && r['data:1:notes:1'].text === 'typed on a full disk'; }),
      'while one record can’t be saved, later changes to others are still saved (a moved window, a reopened one)');
    st = await settingsText();
    ok(await noteShown() === 1 && /Notes\s*[^\n]*not saved/.test(st) && /Timer\s*Open/.test(st) && !/Timer\s*[^\n]*not saved/.test(st), 'the note stays, and Settings shows which window isn’t saved');
    ok(await note.locator('body').evaluate(async () => Board21.saveConfig(Object.assign({}, await Board21.loadConfig(), { checked: 1 })).then(() => true, () => false)) && (await storedRecords(page))['conf:1:notes:1'].checked === 1,
      'a widget whose save is stored is told so, even while another record is still waiting');
    await B(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    ok((await storedRecords(page))['data:1:notes:1'].text === 'a note too long for what is left on the device', 'and it is saved once it fits');
    // A stored record that can't be read any more, while its window is still open: the export has what the window holds.
    await faults({ readKey: 'data:1:notes:1' });
    ok(await B(async () => (await window.__board21.buildExport('full')).instances.find(i => i.widgetId === 'notes').data.text === 'a note too long for what is left on the device'), 'a record that can no longer be read is exported from what its window holds');
    await faults(null);

    // ---- the browser throws the stored board away under the open board (Chrome can, after the disk filled up)
    const whole = await stored();
    await loseDatabase();
    await fillNote(note, 'typed after the database was lost');
    ok(await until(async () => { const r = await B(() => !window.__board21.store.lost && !!window.__board21.store.db) && await storedRecords(page); return r && r['data:1:notes:1'].text === 'typed after the database was lost' && JSON.stringify(Object.keys(r)) === JSON.stringify(Object.keys(JSON.parse(whole))); }),
      'the stored board vanishes under the open board: with the next change, every record is written back (not just that change)');
    ok(await noteShown() === 0 && await B(() => window.__board21.state.wins.size === 2), 'the board stays as it was, with nothing left unsaved');
    await loseDatabase();
    await B(() => window.__board21.reloadAll());   // (as when the teacher comes back to the tab)
    ok(await until(async () => await B(() => !window.__board21.store.lost && !!window.__board21.store.db) && Object.keys(await storedRecords(page)).length === Object.keys(JSON.parse(whole)).length) && await B(() => window.__board21.state.wins.size === 2),
      'coming back to the tab then doesn’t empty the board to match: it is written back');
    await B(() => { window.__failPut = 'unnamed'; });
    await loseDatabase();
    await B(() => window.__board21.setRect('notes:1', { x: 100, y: 90, w: 420, h: 320 }));
    await page.waitForSelector('.save-note.left:visible');
    await page.click('.save-note.left');
    ok(await page.locator('#modal.open', { hasText: 'isn’t saved on this device right now' }).count() === 1 && await B(() => window.__board21.store.lost), 'if it can’t be written back yet, “Not saved” says the board isn’t saved, and it keeps trying');
    await B(() => window.__board21.rebuildAll());   // (as when another tab has added windows from a file)
    ok(await B(() => window.__board21.state.wins.size === 2 && window.__board21.state.board.uid) === uid, 'meanwhile the board isn’t read afresh from the empty storage either');
    await B(() => { window.__failPut = null; });
    await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    await page.reload(); await started();
    ok(await noteIs('typed after the database was lost') && await B(() => window.__board21.state.wins.size === 2 && window.__board21.state.insts.get('notes:1').rect.x === 100) && JSON.parse(await stored())['board:1'].uid === uid,
      'the next start opens the whole board (not an empty one that says “Your board is ready”)');
    // An import is the first thing to find the stored board gone (no version is saved first here): the board is
    // written back before it is replaced, so nothing of the old board is written into the imported one afterwards.
    const noTimer = await B(async () => { const e = await window.__board21.buildExport('full'); e.instances = e.instances.filter(i => i.widgetId !== 'timer'); return e; });
    await loseDatabase();
    await page.evaluate(async e => { const h = window.__board21.history; h.off = 'unavailable'; try { await window.__board21.applyImport(e, 'replace'); } finally { h.off = ''; } }, noTimer);
    ok(await until(async () => await B(() => !window.__board21.store.lost && window.__board21.state.wins.size === 1 && !window.__board21.state.insts.has('timer:1')) && !('inst:1:timer:1' in await storedRecords(page)) && JSON.parse(await stored())['board:1'].uid === uid, 3000),
      'an import that finds the stored board gone replaces it all the same (the old windows don’t come back into the imported board)');
    await B(() => window.__board21.openWidget('timer'));
    await until(async () => !!(await storedRecords(page))['inst:1:timer:1']);

    // ---- two tabs, one of them with changes it couldn't save
    const page2 = await ctx.newPage(); await page2.goto(BASE); await started(page2);
    const note2 = page2.frameLocator('.win[data-ikey="notes:1"] iframe');
    await B(() => { window.__failPut = 'unnamed'; });
    await fillNote(note, 'older, typed here and not saved');
    const moveTimer = () => B(() => { const r = window.__board21.state.insts.get('timer:1').rect; window.__board21.setRect('timer:1', Object.assign({}, r, { x: r.x + 30 })); return r.x + 30; });
    let timerX = await moveTimer();   // (another record, which the other tab doesn't touch)
    await page.waitForSelector('.save-note.left:visible');
    await fillNote(note2, 'newer, typed in the other tab');
    ok(await noteIs('newer, typed in the other tab'), 'the other tab saves a newer change to the same note: this tab shows it');
    await B(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    now = JSON.parse(await stored());
    ok(now['data:1:notes:1'].text === 'newer, typed in the other tab' && now['inst:1:timer:1'].rect.x === timerX && await note2.locator('#t').inputValue() === 'newer, typed in the other tab',
      'and when saving works again its older change isn’t written over the newer one (its other changes are saved)');
    // The same when this tab only catches up later (as when it comes back from the background).
    await B(() => { window.__failPut = 'unnamed'; window.__failRead = true; });
    await fillNote(note, 'older again, not saved');
    await page.waitForSelector('.save-note.left:visible');
    await fillNote(note2, 'newer again, from the other tab');
    await until(async () => (await storedRecords(page))['data:1:notes:1'].text === 'newer again, from the other tab');
    await B(() => { window.__failRead = false; return window.__board21.reloadAll(); });
    await B(() => { window.__failPut = null; });
    timerX = await moveTimer();
    await until(async () => (await storedRecords(page))['inst:1:timer:1'].rect.x === timerX);
    ok(await noteIs('newer again, from the other tab') && await noteShown() === 0 && (await storedRecords(page))['data:1:notes:1'].text === 'newer again, from the other tab', 'the same when this tab catches up on the other tab’s change later');
    // The stored board vanishes while this tab can't save: when it writes its board back later, it doesn't
    // write over what the other tab has saved meanwhile.
    const count = Object.keys(await storedRecords(page)).length;
    await B(() => { window.__failPut = 'unnamed'; });
    await loseDatabase();
    timerX = await moveTimer();
    await page.waitForSelector('.save-note.left:visible');
    await fillNote(note2, 'saved by the other tab after the loss');
    await until(async () => ((await storedRecords(page))['data:1:notes:1'] || {}).text === 'saved by the other tab after the loss');
    await B(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    now = JSON.parse(await stored());
    ok(Object.keys(now).length === count && now['inst:1:timer:1'].rect.x === timerX && now['data:1:notes:1'].text === 'saved by the other tab after the loss' && await noteIs('saved by the other tab after the loss'),
      'a board written back after it vanished fills in what is missing, and never replaces what another tab saved meanwhile');
    // An import that fails in the other tab replaced nothing: this tab keeps what it couldn't save yet.
    await B(() => { window.__failPut = 'unnamed'; });
    await fillNote(note, 'not saved yet when the other tab’s import failed');
    await page.waitForSelector('.save-note.left:visible');
    const refused = await page2.evaluate(async () => { window.__failPut = 'unnamed'; try { await window.__board21.applyImport(await window.__board21.buildExport('full'), 'replace'); return false; } catch (e) { return true; } finally { window.__failPut = null; } });
    await page.waitForTimeout(400);
    ok(refused && await noteIs('not saved yet when the other tab’s import failed') && await noteShown() === 1, 'an import that fails in another tab doesn’t make this tab drop its unsaved changes');
    await B(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    ok(JSON.parse(await stored())['data:1:notes:1'].text === 'not saved yet when the other tab’s import failed', 'they are saved once saving works again');
    // The other tab replaces the board.
    await B(() => { window.__failPut = 'unnamed'; });
    await fillNote(note, 'left over from the old board');
    await page.waitForSelector('.save-note.left:visible');
    await page2.evaluate(async () => { const e = await window.__board21.buildExport('full'); e.instances.find(i => i.widgetId === 'notes').data = { text: 'the imported board' }; await window.__board21.applyImport(e, 'replace'); });
    ok(await noteIs('the imported board') && await noteShown() === 0, 'another tab replaces the board: this tab shows the new one and drops its unsaved changes to the old one');
    await B(() => { window.__failPut = null; window.__board21.setRect('notes:1', { x: 60, y: 60, w: 420, h: 320 }); });
    await until(async () => JSON.parse(await stored())['inst:1:notes:1'].rect.x === 60);
    ok(JSON.parse(await stored())['data:1:notes:1'].text === 'the imported board', 'so they are never written over the new board later');
    // A read that fails later, not at start-up: this tab can't read the board another tab has just replaced.
    await B(() => { window.__failRead = true; });
    await page2.evaluate(async () => { const e = await window.__board21.buildExport('full'); e.instances.find(i => i.widgetId === 'notes').data = { text: 'imported again' }; await window.__board21.applyImport(e, 'replace'); });
    await failed();
    const replaced = await stored();
    await B(() => { window.__board21.openWidget('timer'); window.__board21.setBoardShape('16:9'); });
    await page.waitForTimeout(400);
    ok(/couldn’t open your board/.test(await page.locator('#startup h3').innerText()) && await stored() === replaced, 'a board that can’t be read after another tab replaced it gets the same message, and nothing is saved over it');
    await page.click('#startup [data-go="retry"]'); await started();
    ok(await noteIs('imported again'), 'Try again opens it');
    await page2.close();

    // ---- one record that can't be read (the background photo's file is gone)
    const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.evaluate(async px => { const e = await window.__board21.buildExport('full'); e.media = { background: { data: px, w: 1, h: 1, bytes: 70, name: 'p.png', addedAt: 1 }, look: { on: true, fit: 'fill', focus: { x: 0.5, y: 0.5 }, fade: 0 } }; await window.__board21.applyImport(e, 'replace'); }, px);
    await until(() => B(() => document.body.classList.contains('has-photo')));
    await faults({ readKey: 'media:1:background' }); await page.reload(); await started();
    ok(await noteIs('imported again') && await page.locator('.toast', { hasText: 'Couldn’t show the background photo on this device. Board history may still have it.' }).count() === 1 && await B(() => !document.body.classList.contains('has-photo')),
      'one unreadable record (the photo) doesn’t hide the board: the rest opens, and a message says what is missing');
    ok(await B(async () => (await window.__board21.buildExport('full')).instances.length === 2) && !!(await storedRecords(page))['media:1:background'], 'the board can still be exported, and the unreadable record is left as it is');
    // Two records: one sentence names both, joined with “and”, and says “them”.
    await faults({ readKey: ['media:1:background', 'data:1:notes:1'] }); await page.reload(); await started();
    const unread = await page.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast span'), t => t.textContent).filter(t => /^Couldn’t show/.test(t)));
    ok(unread.length === 1 && /^Couldn’t show (Notes and the background photo|the background photo and Notes) on this device\. Board history may still have them\.$/.test(unread[0]),
      `two unreadable records: one message names both, with “and”, and says Board history may still have them (${unread.join(' | ')})`);

    // ---- the page and board.js from different versions (the offline copy refreshes its files one by one)
    await faults(null);
    const bootNote = () => B(() => { const n = document.getElementById('boot-note'), cs = n && getComputedStyle(n); return n ? `${cs.animationName} ${cs.visibility}` : 'removed'; });
    await page.route('**/board.js', r => r.abort());
    await page.reload();
    ok(await bootNote() === 'boot-note hidden' && await B(() => { const n = document.getElementById('boot-note'); n.getAnimations().forEach(a => a.finish()); return getComputedStyle(n).visibility === 'visible'; }),
      'if board.js never starts, the page says so after a few seconds');
    await page.unroute('**/board.js');
    const boardJs = fs.readFileSync(path.join(ROOT, 'board.js'), 'utf8');
    await page.route('**/board.js', r => r.fulfill({ contentType: 'text/javascript', body: boardJs.replace('if (late) late.remove();', '') }));
    await page.reload(); await started();
    ok(boardJs.includes('if (late) late.remove();') && await bootNote() === 'none hidden', 'a board.js from before that message (it doesn’t remove it) never gets it shown over a working board');
    await page.unroute('**/board.js');
    await page.route(BASE, r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\.save-note/g, '.no-such-note') }));
    await page.reload(); await started();
    const shownBefore = await noteShown();
    await B(() => { window.__failPut = 'unnamed'; window.__board21.setRect('notes:1', { x: 140, y: 90, w: 420, h: 320 }); });
    await page.waitForSelector('.save-note.left:visible');
    const box = await page.locator('.save-note.left').boundingBox(), pick = await page.locator('.picker-btn.left').boundingBox();
    ok(shownBefore === 0 && box.x >= 0 && box.x < 60 && box.y > 500 && box.y + box.height <= pick.y && await page.locator('.save-note.left').evaluate(b => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)'),
      'on a page from before the “Not saved” note (no styles for it), the note still shows above the Widget Picker button');
    await B(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await page.locator('#modal.open .btn', { hasText: 'Try again now' }).click();
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    ok(JSON.parse(await stored())['inst:1:notes:1'].rect.x === 140, 'and goes away again once the change is saved');
    await page.unroute(BASE);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Updating: the prompt, Update in every tab, the version in Settings', async (browser) => {
    ok(stamped(), STAMPED);

    deploy('up', { version: 'TEST-1', change: marked('v1') });
    const url = BASE + '__site/up/';
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(STORAGE_FAULTS);
    const a = await ctx.newPage(), b = await ctx.newPage();
    const errors = []; for (const p of [a, b]) p.on('pageerror', e => errors.push(e.message));
    const both = fn => Promise.all([a, b].map(fn));
    const settings = async p => { await openSettings(p, ['about']); await p.waitForSelector('#st-version'); };
    const shown = async p => { await settings(p); const t = await p.locator('#settings .about').innerText(); await p.keyboard.press('Escape'); return t; };
    const prompt = p => p.locator('.toast', { hasText: 'A new version of 21Board is ready.' });
    const offered = () => both(p => p.waitForFunction(() => !!window.__board21.state.sw.updateReady && !!document.querySelector('.toast'), null, { timeout: 20000 }));
    // Every tab on that release, in all four parts, with the board up. Returns how long it took.
    const allOn = async (v, ms = 20000) => {
      const t0 = Date.now(), want = `${v} ${v} ${v} ${v}`;
      for (;;) {
        const now = await both(p => parts(p).catch(() => 'starting'));
        if (now.every(x => x === want) && (await both(p => p.evaluate(() => !!window.__board21 && window.__board21.store.loaded && !document.getElementById('startup')).catch(() => false))).every(Boolean)) return Date.now() - t0;
        if (Date.now() - t0 > ms) return `never (${now.join(' | ')})`;
        await a.waitForTimeout(100);
      }
    };
    const noteText = p => p.frameLocator('.win[data-ikey="notes:1"] iframe').locator('#t').inputValue();

    await a.goto(url); await a.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    await b.goto(url); await b.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    await a.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('dice'); });
    await fillNote(a.frameLocator('.win[data-ikey="notes:1"] iframe'), 'kept through the update');
    await b.waitForSelector('.win[data-ikey="dice:1"] iframe');
    await allOn('v1');
    const build1 = SITES.up.build;
    ok(/^[0-9a-f]{8}$/.test(build1) && (await shown(a)).startsWith(`21Board TEST-1 (${build1}) · `) && !(await shown(a)).includes('Offline copy'),
      'Settings → About shows the release’s name and build, the same as the offline copy’s: ' + (await shown(a)).split('\n')[0]);
    ok(await a.evaluate(async () => (await window.__board21.buildExport('full')).generator) === `21Board TEST-1 (${build1})`, 'and an exported file says which release made it');

    // ---- a new release: the prompt, Later, Update
    deploy('up', { version: 'TEST-2', change: marked('v2') });
    await both(p => p.evaluate(() => { window.__same = 1; }));
    await updateCheck(a);
    await offered();
    ok((await both(p => prompt(p).locator('button').allTextContents())).every(t => t.join() === 'Update,Later'), 'a new release is offered in every open tab, with Update and Later');
    await prompt(a).locator('button', { hasText: 'Later' }).click();
    await a.waitForFunction(() => !document.querySelector('.toast'));
    await b.evaluate(() => window.__board21.closeWin('dice:1')); await b.waitForSelector('.win[data-ikey="dice:1"]', { state: 'detached' });
    await b.evaluate(() => window.__board21.openWidget('dice')); await b.waitForFunction(() => { const w = window.__board21.state.wins.get('dice:1'); return w && w.connected; });
    ok(typeof await allOn('v1', 5000) === 'number' && await a.evaluate(() => window.__same === 1) && await a.locator('.picker-btn.left .dot').count() === 1,
      'Later puts it off: nothing restarts, a dot stays on the Widget Picker button, and both tabs stay wholly on the old release (a widget opened now is the old one too)');
    await a.click('.picker-btn.left');
    const marks = await a.evaluate(() => { const g = document.querySelector('[data-ctl="settings"]'), w = document.querySelector('.picker-btn.left'); return [!!g.querySelector('.dot'), g.getAttribute('aria-label'), w.getAttribute('aria-label'), w.title].join(' | '); });
    await a.click('[data-ctl="settings"]'); await a.waitForSelector('#st-version', { state: 'attached' });
    const note = a.locator('#settings #st-update'), box = await note.boundingBox({ timeout: 2000 }).catch(() => null);
    ok(marks === 'true | Settings, new version ready | Widget Picker, new version ready | A new version is ready. Open Settings to update.' && !!box && box.y > 0 && box.y + box.height < 400 && (await note.innerText()).startsWith('A new version is ready') && await a.locator('#settings [data-act="update"]').count() === 1,
      'after Later, how to update stays in view: the ▦ button and the Settings gear carry a dot and say why, and Settings opens with “A new version is ready” and Update now at the top (' + marks + ')');
    await a.locator('#settings [data-act="update"]').click();
    const took = await allOn('v2');
    ok(took < 8000, `Settings → Update now takes effect in seconds, and every open tab restarts on the new release (${typeof took === 'number' ? (took / 1000).toFixed(1) + ' s' : took})`);
    const build2 = SITES.up.build;
    ok(build2 !== build1 && (await shown(a)).startsWith(`21Board TEST-2 (${build2}) · `) && (await shown(b)).startsWith(`21Board TEST-2 (${build2}) · `) && await a.evaluate(() => caches.keys().then(k => k.join())) === `21board-TEST-2-${build2}`,
      'both tabs then say the new release in Settings, and only its offline copy is kept');
    await settings(a);
    // (Each tab may also say “Updated to TEST-2.” once as it starts again: suite "Updated to:". Any other message counts.)
    ok((await both(noteText)).join() === 'kept through the update,kept through the update' && (await both(p => p.locator('.win').count())).join() === '2,2' && (await both(p => p.locator('.toast').allTextContents())).every(ts => ts.length <= 1 && ts.every(t => t === 'Updated to TEST-2.')) &&
      (await both(p => p.locator('.picker-btn .dot').count())).join() === '0,0' && await a.locator('#settings #st-update').isHidden() && (await both(p => p.evaluate(() => [...document.querySelectorAll('.picker-btn')].map(b => b.getAttribute('aria-label')).join()))).join() === 'Widget Picker,Widget Picker,Widget Picker,Widget Picker',
      'the windows and their content are as they were, and the prompt, the dots and the line in Settings are gone');
    await a.keyboard.press('Escape');

    // ---- the waiting release was put to sleep by the browser before Update is tapped (the usual case)
    deploy('up', { version: 'TEST-3', change: marked('v3') });
    await updateCheck(b);
    await offered();
    const cdp = await ctx.newCDPSession(a);
    await cdp.send('ServiceWorker.enable'); await cdp.send('ServiceWorker.stopAllWorkers');
    await prompt(b).locator('button', { hasText: 'Update' }).click();
    const took3 = await allOn('v3');
    ok(took3 < 8000, `Update on the prompt works the same after the browser put the waiting release to sleep, in both tabs (${typeof took3 === 'number' ? (took3 / 1000).toFixed(1) + ' s' : took3})`);

    // ---- a tab whose board isn't saved is not restarted under the teacher's hands
    deploy('up', { version: 'TEST-4', change: marked('v4') });
    await updateCheck(a);
    await offered();
    await b.evaluate(() => { window.__same = 1; window.__failPut = 'unnamed'; window.__board21.setRect('notes:1', { x: 140, y: 90, w: 420, h: 320 }); });
    await b.waitForSelector('.save-note.left:visible');
    await prompt(a).locator('button', { hasText: 'Update' }).click();
    await a.waitForFunction(() => window.__rel === 'v4', null, { timeout: 15000 }); await boardUp(a);
    const left = await b.waitForFunction(() => window.__board21.state.sw.updateReady === true, null, { timeout: 10000 }).then(() => true, () => false);
    ok(left && await b.evaluate(() => window.__same === 1 && window.__rel === 'v3') && await b.locator('.picker-btn.left .dot').count() === 1,
      'a tab with changes that couldn’t be saved isn’t restarted when another tab updates: it keeps its board, and Update stays on offer');
    if (left) {
      await settings(b); await b.locator('#settings [data-act="update"]').click();
      await b.waitForSelector('#modal.open');
      const warn = await b.locator('#modal.open').innerText();
      await b.locator('#modal.open .btn', { hasText: 'Later' }).click();
      ok(/Update 21Board now\?/.test(warn) && warn.includes('Your latest changes aren’t saved yet. Update now and they’ll be lost.') && await b.evaluate(() => window.__same === 1), 'Update there first says the changes would be lost; Later leaves the board as it is');
      await b.evaluate(() => { window.__failPut = null; });
      await b.locator('#settings [data-act="update"]').click();
      await b.waitForFunction(() => window.__rel === 'v4' && !window.__same, null, { timeout: 15000 }); await boardUp(b);
      ok(await b.evaluate(() => window.__board21.state.insts.get('notes:1').rect.x) === 140 && await allOn('v4') < 8000, 'once the changes can be saved, Update saves them and restarts the tab on the new release');
      // Update tapped in the tab that can't save, and confirmed: it goes ahead at once.
      deploy('up', { version: 'TEST-5', change: marked('v5') });
      await updateCheck(a);
      await offered();
      await b.evaluate(() => { window.__failPut = 'unnamed'; window.__board21.setRect('notes:1', { x: 200, y: 90, w: 420, h: 320 }); });
      await b.waitForSelector('.save-note.left:visible');
      await prompt(b).locator('button', { hasText: 'Update' }).click();
      await b.locator('#modal.open .btn', { hasText: 'Update' }).click();
      const took5 = await allOn('v5');
      ok(took5 < 3500, `Update confirmed there restarts that tab without more waiting, and the other one with it (${typeof took5 === 'number' ? (took5 / 1000).toFixed(1) + ' s' : took5})`);
    }
    // A tab still running release 2026.11.10-30 doesn't restart by itself when another tab updates; its own
    // Update button then asks the release that has already taken over.
    await a.evaluate(() => { window.__same = 1; navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' }); });
    ok(await a.waitForFunction(() => !window.__same && !!window.__board21 && window.__board21.store.loaded, null, { timeout: 8000 }).then(() => true, () => false), 'a tab left behind on the release before this one is restarted when its Update is tapped');

    // ---- the release in charge is busy with another tab at the moment Update is tapped. (It then can't hand
    // over at once, and Chromium has been seen to leave the tab's reload unanswered when it finally does. Last
    // in this suite: a tab in that state answers nothing more.)
    await boardUp(a);
    deploy('up', { version: 'TEST-6', change: marked('v6') });
    await updateCheck(a);
    await offered();
    // (Tab B sends the release in charge a message about every millisecond for 0.4 s, by a loop that isn't slowed down like a timer.)
    await b.evaluate(() => { const t0 = Date.now(), ch = new MessageChannel(); let last = 0; ch.port1.onmessage = () => { const t = performance.now(); if (t - last >= 1) { last = t; navigator.serviceWorker.controller.postMessage({ type: 'BUSY' }); } if (Date.now() - t0 < 400) ch.port2.postMessage(0); }; ch.port2.postMessage(0); });
    await a.waitForTimeout(30);
    await a.evaluate(() => Array.from(document.querySelectorAll('.toast button')).find(x => x.textContent === 'Update').click());
    const took6 = await Promise.race([allOn('v6', 25000), new Promise(res => setTimeout(() => res('never: a tab’s reload went unanswered'), 40000))]);
    ok(took6 < 15000, `Update still reaches every open tab when the release in charge was busy as it was tapped (${typeof took6 === 'number' ? (took6 / 1000).toFixed(1) + ' s' : took6})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Updating: never part old and part new', async (browser) => {
    const errors = [];
    const watch = p => { p.on('pageerror', e => errors.push(e.message)); return p; };
    const controlled = p => p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    const offered = p => p.waitForFunction(() => !!window.__board21 && !!window.__board21.state.sw.updateReady, null, { timeout: 20000 });
    const idle = p => p.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!r && !r.installing), null, { timeout: 20000 });   // no download going on
    // Has the device look for a new release and waits until its download has asked for that file and ended.
    const tried = async (p, site, file) => {
      site.asked.length = 0;
      await updateCheck(p);
      for (const t0 = Date.now(); !site.asked.includes(file) && Date.now() - t0 < 10000;) await p.waitForTimeout(50);
      await idle(p); await p.waitForTimeout(300);
      return site.asked.includes(file);
    };
    const withDice = async p => { await p.evaluate(() => window.__board21.openWidget('dice')); await p.waitForFunction(() => { const w = window.__board21.state.wins.get('dice:1'); return w && w.connected; }); };
    const on = async (p, v, ms = 15000) => { const want = `${v} ${v} ${v} ${v}`; let now; for (const t0 = Date.now(); Date.now() - t0 < ms; await p.waitForTimeout(100)) { now = await parts(p).catch(() => 'starting'); if (now === want) { await boardUp(p); return true; } } console.log('    ' + now); return false; };
    const label = p => p.evaluate(() => `${window.__board21.version} (${window.__board21.build})`);

    // ---- kiosk address: reloads stay on the old release; the next launch is the new one
    {
      deploy('kiosk', { version: 'TEST-1', change: marked('v1') });
      const url = BASE + '__site/kiosk/?kiosk=yes';
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      let page = watch(await ctx.newPage());
      await page.goto(url); await controlled(page); await withDice(page);
      deploy('kiosk', { version: 'TEST-2', change: marked('v2') });
      const seen = [];
      for (let i = 0; i < 3; i++) {
        await page.reload(); await boardUp(page);
        if (i) await offered(page).catch(() => {});   // (by the second reload the new release has been saved)
        await page.waitForFunction(() => { const w = window.__board21.state.wins.get('dice:1'); return w && w.connected; });
        seen.push(await parts(page));
      }
      ok(seen.join() === 'v1 v1 v1 v1,v1 v1 v1 v1,v1 v1 v1 v1' && await page.locator('.toast', { hasText: 'A new version' }).count() === 1,
        'at the kiosk address (?kiosk=yes), reloading after a release keeps the page, board.js, widgets and SDK all on the old release, with Update on offer: ' + seen.join(', '));
      await page.close();
      page = watch(await ctx.newPage());
      await page.goto(url);
      ok(await on(page, 'v2') && await page.evaluate(() => document.body.classList.contains('kiosk')) && await label(page) === `TEST-2 (${SITES.kiosk.build})`,
        'the next time the kiosk starts, it is wholly on the new release without anyone tapping Update');

      // ---- files changed on the server with no new stamp (tools/release.js wasn't run)
      const before = SITES.kiosk.build;
      const site = deploy('kiosk', { change: marked('v3'), stamp: false });
      await page.reload(); await boardUp(page); await page.reload(); await boardUp(page);
      await page.waitForFunction(() => { const w = window.__board21.state.wins.get('dice:1'); return w && w.connected; });
      const looked = await tried(page, site, 'sw.js');
      ok(looked && await parts(page) === 'v2 v2 v2 v2' && await label(page) === `TEST-2 (${before})` && !(await page.evaluate(() => window.__board21.state.sw.updateReady)) && site.asked.every(f => f === 'sw.js' || f === 'widgets/registry.js'),
        'files changed on the server without a new stamp don’t reach a device in pieces: it stays wholly on the release it has (it asked the server only for: ' + Array.from(new Set(site.asked)).join(', ') + ')');
      const r = release.stamp(f => site.files[f] || fs.readFileSync(path.join(ROOT, f)));
      ok(r.out['sw.js'] !== String(site.files['sw.js']) && ['board.js', 'index.html', 'widgets/dice/index.html', 'sdk/board21.js'].every(f => r.changed.includes(f)),
        'and tools/release.js --check would have failed for that deploy, naming the changed files: ' + r.changed.filter(f => f !== './').join(', '));
      const fresh = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const f = watch(await fresh.newPage());
      await f.goto(BASE + '__site/kiosk/'); await boardUp(f); await withDice(f);
      await f.waitForFunction(() => window.__board21.state.sw.state === 'error', null, { timeout: 15000 }).catch(() => {});
      await f.click('.picker-btn.left'); await f.click('[data-ctl="settings"]');
      ok(await parts(f) === 'v3 v3 v3 v3' && await f.evaluate(async () => !navigator.serviceWorker.controller && !(await caches.keys()).length) && (await f.locator('#st-offline').innerText()).includes('Offline copy unavailable'),
        'a device new to that deploy runs it from the network, saves no offline copy of it, and says so in Settings');
      await fresh.close();

      // ---- a release that doesn't download whole
      const s4 = deploy('kiosk', { version: 'TEST-4', change: marked('v4') });
      s4.fault['widgets/notes/index.html'] = res => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>Sign in to this network</html>'); return true; };
      const portal = await tried(page, s4, 'widgets/notes/index.html') && !(await page.evaluate(() => window.__board21.state.sw.updateReady));
      s4.fault['widgets/notes/index.html'] = res => { res.destroy(); return true; };
      const dropped = await tried(page, s4, 'widgets/notes/index.html') && !(await page.evaluate(() => window.__board21.state.sw.updateReady));
      await ctx.setOffline(true);
      await page.reload(); await boardUp(page);
      await page.evaluate(() => window.__board21.openWidget('notes'));
      await page.waitForFunction(() => { const w = window.__board21.state.wins.get('notes:1'); return w && w.connected; });
      ok(portal && dropped && await parts(page) === 'v2 v2 v2 v2' && await page.evaluate(() => caches.keys().then(k => k.length)) === 1,
        'a release with one file that doesn’t arrive right (a sign-in page in its place, then a dropped connection) is not taken: no prompt, and offline the device still runs the whole old release');
      await ctx.setOffline(false);
      delete s4.fault['widgets/notes/index.html'];
      await updateCheck(page); await offered(page);
      await page.locator('.toast button', { hasText: 'Update' }).click();
      ok(await on(page, 'v4') && await label(page) === `TEST-4 (${s4.build})`, 'once every file arrives, the release is offered and Update moves the device to it whole');

      // ---- a release with one more file, while the server still hands out the widget list from before
      const listBefore = fs.readFileSync(path.join(ROOT, 'widgets', 'registry.js'));
      const s5 = deploy('kiosk', { version: 'TEST-5', change: Object.assign(marked('v5'), { 'widgets/registry.js': t => t.replace("files: ['widgets/sdk-playground/index.html']", "files: ['widgets/sdk-playground/index.html', 'widgets/_template/index.html']") }) });
      let stale = true;
      s5.fault['widgets/registry.js'] = res => { if (!stale) return; stale = false; res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(listBefore); return true; };
      ok(String(s5.files['widgets/registry.js']).includes('_template') && await tried(page, s5, 'widgets/registry.js') && !stale && !(await page.evaluate(() => window.__board21.state.sw.updateReady)),
        'a release isn’t taken either while its list of files arrives out of date (it would have been saved with a file missing)');
      await updateCheck(page); await offered(page);
      await page.locator('.toast button', { hasText: 'Update' }).click();
      ok(await on(page, 'v5') && await page.evaluate(() => caches.match('widgets/_template/index.html').then(r => !!r)), 'and is taken, with every file, once the list is the right one');

      // ---- VERSION not changed, but the files were stamped again
      const build5 = s5.build;
      const s6 = deploy('kiosk', { version: 'TEST-5', change: marked('v6') });
      await updateCheck(page); await offered(page);
      await page.locator('.toast button', { hasText: 'Update' }).click();
      ok(await on(page, 'v6') && s6.build !== build5 && await label(page) === `TEST-5 (${s6.build})`, 'a release stamped without a new VERSION still arrives whole, and Settings tells it apart by its build');
      await ctx.close();
    }

    // ---- a first visit while a release is being put on the server
    {
      const s1 = deploy('race', { version: 'TEST-1', change: marked('v1') });
      let go; const hold = new Promise(res => { go = res; });
      s1.fault['sw.js'] = () => hold;
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = watch(await ctx.newPage());
      await page.goto(BASE + '__site/race/'); await boardUp(page); await withDice(page);
      deploy('race', { version: 'TEST-2', change: marked('v2') });
      delete SITES.race.fault['sw.js']; go();
      await offered(page);
      ok(await page.evaluate(async () => !navigator.serviceWorker.controller && (await caches.keys()).length === 1) && (await parts(page)).startsWith('v1 v1') && await page.locator('.toast', { hasText: 'A new version' }).count() === 1,
        'a tab that opened just before a release isn’t handed to the offline copy of the new one: it stays as it is and offers Update');
      await page.locator('.toast button', { hasText: 'Update' }).click();
      ok(await on(page, 'v2') && await page.evaluate(() => !!navigator.serviceWorker.controller), 'Update restarts it on the new release, from its offline copy');
      await ctx.close();
    }

    // ---- a still newer release finishes downloading just as the one before it takes over
    {
      const copies = p => p.evaluate(async () => { const out = []; for (const k of await caches.keys()) out.push(k.replace('21board-', '') + ':' + (await (await caches.open(k)).keys()).length); return out.join(' '); });
      const offline = p => p.locator('#st-offline').innerText();
      const start = async p => { await p.reload().catch(() => {}); await boardUp(p).catch(() => {}); };   // (it may not start: that is what is checked)
      const now = p => parts(p).catch(() => 'not started');
      deploy('three', { version: 'TEST-1', change: marked('v1') });
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = watch(await ctx.newPage());
      await page.goto(BASE + '__site/three/'); await controlled(page); await withDice(page);
      const s2 = deploy('three', { version: 'TEST-2', change: marked('v2') });
      const n = (String(s2.files['sw.js']).match(/^  '[^']+': '[0-9a-f]{16}',?$/gm) || []).length;   // the files of a copy
      await updateCheck(page); await offered(page);
      await page.locator('.toast button', { hasText: 'Later' }).click();
      // Release 3 is published; its last file is slow to arrive. Update is tapped (release 2 takes over), and
      // the file arrives a moment later, before release 2 has tidied up (Chromium does that about a second on).
      const s3 = deploy('three', { version: 'TEST-3', change: marked('v3') });
      let go; const hold = new Promise(res => { go = res; });
      s3.fault['widgets/notes/index.html'] = () => hold;
      s3.asked.length = 0;
      await updateCheck(page);
      for (const t0 = Date.now(); !s3.asked.includes('widgets/notes/index.html') && Date.now() - t0 < 10000;) await page.waitForTimeout(50);
      await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]');
      await page.locator('#settings [data-act="update"]').click();
      await page.waitForTimeout(150);
      delete s3.fault['widgets/notes/index.html']; go();
      const on2 = await on(page, 'v2');
      await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!r && !!r.waiting && !r.installing && r.active.state === 'activated'), null, { timeout: 15000 }).catch(() => {});   // (tidied up by then)
      const kept = await copies(page);
      ok(on2 && n > 20 && kept === `TEST-2-${s2.build}:${n} TEST-3-${s3.build}:${n}`,
        'a release that takes over removes the copies saved before its own, and never the copy of a still newer release that finished downloading meanwhile: ' + kept);
      await offered(page);
      await page.locator('.toast button', { hasText: 'Update' }).click();
      const on3 = await on(page, 'v3');
      await ctx.setOffline(true);
      await start(page);
      await page.waitForFunction(() => { const w = window.__board21.state.wins.get('dice:1'); return w && w.connected; }, null, { timeout: 8000 }).catch(() => {});
      ok(on3 && await now(page) === 'v3 v3 v3 v3' && await copies(page) === `TEST-3-${s3.build}:${n}`, 'that release then takes over whole, and starts with no connection: ' + await copies(page));
      await ctx.setOffline(false);

      // ---- a release whose saved copy has gone missing (release 2026.11.10-30 could delete it as above)
      await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
      let drop; const held = new Promise(res => { drop = res; });
      s3.fault['widgets/notes/index.html'] = async res => { await held; res.destroy(); return true; };
      s3.asked.length = 0;
      await start(page);
      for (const t0 = Date.now(); !s3.asked.includes('widgets/notes/index.html') && Date.now() - t0 < 10000;) await page.waitForTimeout(50);
      await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]');
      const during = await offline(page);
      drop();
      await page.waitForFunction(() => window.__board21.state.sw.state === 'error', null, { timeout: 10000 }).catch(() => {});
      const failed = await offline(page);
      ok(during.includes('Saving an offline copy') && failed.includes('Offline copy unavailable') && await now(page) === 'v3 v3 v3 v3',
        `a release whose saved copy has gone missing doesn’t say “Ready to work offline”: it runs from the network and saves its copy again (“${during}”), and says so if that fails (“${failed}”)`);
      delete s3.fault['widgets/notes/index.html'];
      await start(page);
      await page.waitForFunction(() => window.__board21.state.sw.state === 'ready', null, { timeout: 15000 }).catch(() => {});
      await openSettings(page, ['advanced']);
      const saved = await copies(page), says = await offline(page);
      // A widget under test in Developer mode (uploaded as a file) is not part of the copy: its file is kept on this device.
      await page.click('#settings [data-act="devmode"]');
      await page.setInputFiles('#widget-input', path.join(ROOT, 'widgets', '_template', 'index.html'));
      const both = () => window.__board21.state.wins.size === 2 && Array.from(window.__board21.state.wins.values()).every(w => w.connected);
      await page.waitForFunction(both, null, { timeout: 8000 }).catch(() => {});   // (uploading it opens it)
      await page.keyboard.press('Escape');
      const online = await page.evaluate(both);
      await ctx.setOffline(true);
      await start(page);
      await page.waitForFunction(() => { const w = window.__board21.state.wins.get('dice:1'); return w && w.connected; }, null, { timeout: 8000 }).catch(() => {});
      ok(saved === `TEST-3-${s3.build}:${n}` && says.includes('Ready to work offline') && await now(page) === 'v3 v3 v3 v3',
        'the next time it starts with a connection, the copy is saved again, and 21Board works offline as before: ' + saved);
      const tested = await page.waitForFunction(() => { const w = window.__board21.state.wins.get('dev-my-widget:1'); return w && w.connected && !w.left; }, null, { timeout: 8000 }).then(() => true, () => false);
      ok(online && tested, 'offline, a widget under test (Developer mode, uploaded as a file) opens and connects: its file is kept on this device, and the SDK put into it comes from the copy');
      // A page of the site that isn't in the copy, shown in a frame (as when a widget's window goes to one).
      const unlisted = await page.evaluate(() => new Promise(res => { const f = document.createElement('iframe'); f.onload = () => { try { res(f.contentDocument.body.innerText.replace(/\n/g, ' / ')); } catch (e) { res(String(e)); } }; f.src = 'widgets/not-in-the-copy/index.html'; document.body.appendChild(f); setTimeout(() => res('(not loaded)'), 8000); }));
      ok(unlisted === 'This widget needs a connection / Only the widgets in 21Board’s own list are kept for offline use.',
        'offline, a page of the site that isn’t in the copy says in its window that it needs a connection, not that connecting once will save it: ' + unlisted);
      const faces = await page.evaluate(() => new Promise(res => { const f = document.createElement('iframe'); f.onload = async () => { try { await f.contentDocument.fonts.ready; res(Array.from(f.contentDocument.fonts).filter(x => x.family.replace(/"/g, '') === 'Inter').map(x => x.status).join()); } catch (e) { res(String(e)); } }; f.src = 'widgets/not-in-the-copy/again.html'; document.body.append(f); }));
      ok(/loaded/.test(faces), `and says it in Inter, from the copy (${faces || 'no Inter face'})`);
      await ctx.close();
    }

    // ---- the offline copy saved by the release before builds (it replaced its files one at a time)
    {
      // (Without the icons that release had and the site no longer does: icon.svg, icon-maskable-512.png and
      // apple-touch-icon.png, removed in 2026.11.16-7. Its worker saves its copy only if every file arrives.)
      const oldSw = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'sw-2026.11.10-30.js'), 'utf8').replace("'2026.11.10-30'", "'OLD-1'")
        .replace(/\n  'icons\/(icon\.svg|icon-maskable-512\.png|apple-touch-icon\.png)',?/g, '');
      ok(oldSw.includes("'OLD-1'") && oldSw.includes('refresh in the background') && !/icon\.svg|maskable|apple-touch/.test(oldSw),
        '(the fixture is the service worker of release 2026.11.10-30)');
      // (That release had no district apps: its worker would try to save their pages, on another site, with its own
      // files, and never install. A device that has it keeps the list it installed with.)
      const noApps = t => t.replace(/\n  \/\/ The district's own apps[\s\S]*?(?=\n  \{\n    id: 'sdk-playground')/, '');
      ok(!/external: true/.test(noApps(fs.readFileSync(path.join(ROOT, 'widgets', 'registry.js'), 'utf8'))), '(and its list of widgets is from before the district apps)');
      deploy('old', { version: 'TEST-1', change: Object.assign(marked('v1'), { 'widgets/registry.js': noApps }), sw: oldSw });
      const url = BASE + '__site/old/?kiosk=yes';
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      // Each time the board comes up in this tab, which release its page and its script are from.
      await ctx.addInitScript(() => {
        if (window.top !== window) return;
        const t = setInterval(() => {
          if (!window.__board21 || !window.__board21.store.loaded || document.getElementById('startup')) return;
          clearInterval(t);
          const ups = JSON.parse(sessionStorage.getItem('test-ups') || '[]');
          ups.push(`${document.body.dataset.rel}+${window.__rel}`);
          sessionStorage.setItem('test-ups', JSON.stringify(ups));
        }, 20);
      });
      const page = watch(await ctx.newPage());
      await page.goto(url); await controlled(page); await withDice(page);
      ok(await page.evaluate(() => caches.keys().then(k => k.join())) === '21board-OLD-1', '(a device with that release’s offline copy)');
      deploy('old', { version: 'TEST-2', change: marked('v2') });
      await page.reload(); await boardUp(page); await offered(page);
      // By now the old copy has fetched the new board.js for next time, but at this address not the new page.
      await page.reload();
      const whole = await on(page, 'v2');
      const ups = await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-ups') || '[]'));
      ok(whole && ups.every(u => u === 'v1+v1' || u === 'v2+v2') && await page.evaluate(() => caches.keys().then(k => k.join())) === `21board-TEST-2-${SITES.old.build}`,
        'updating from the release before builds, at the kiosk address: the board never comes up on an old page with new code; it takes the complete new release and starts again (came up on: ' + ups.join(', ') + ')');
      ok(await page.locator('.win[data-ikey="dice:1"]').count() === 1 && await page.locator('#startup').count() === 0 && await page.evaluate(() => document.body.classList.contains('kiosk')), 'and the board is there afterwards, still in kiosk mode');
      await ctx.close();
    }

    // ---- no offline copy at all (it is blocked here): the browser's own cache hands out an old page with new code
    {
      deploy('plain', { version: 'TEST-1', change: marked('v1') });
      const url = BASE + '__site/plain/';
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
      const page = watch(await ctx.newPage());
      const html = String(SITES.plain.files['index.html']);
      let loads = 0, stale = 1;
      page.on('framenavigated', fr => { if (fr === page.mainFrame()) loads++; });
      await page.route(url, r => stale-- > 0 ? r.fulfill({ contentType: 'text/html', body: html.replace(/data-build="[^"]*"/, 'data-build="00000000"') }) : r.continue());
      await page.goto(url); await boardUp(page);
      ok(loads === 2 && await page.evaluate(() => document.documentElement.dataset.build === window.__board21.build), 'a page from another build than board.js isn’t started on: both are fetched afresh and 21Board starts again, once');
      loads = 0; stale = Infinity;
      await page.evaluate(() => sessionStorage.clear());
      await page.goto(url); await boardUp(page);
      await page.evaluate(() => window.__board21.openWidget('notes'));
      ok(loads === 2 && await page.evaluate(() => document.documentElement.dataset.build === '00000000') && await page.locator('.win').count() === 1, 'if they still differ after that, it doesn’t go round in circles: the board starts with what there is');
      await ctx.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  // "Updated to …" (board.js section 15, updatedNote): the first time a tab runs a release this device hasn't run before,
  // the board says so once. The device keeps the last release it ran in localStorage["21board-last-release"].
  ['Updated to: the first time a new version opens (a first run says nothing; a board from before this note, nothing recorded: said; another release recorded: said once, not after a reload or in another tab; a later release recorded; a tab that starts hidden; storage that throws, the board’s storage blocked; kiosk; never in the widget dev window or lab; never pushes out another message; a real update, by Update and with every tab closed; the docs)', async (browser) => {
    const errors = [];
    const KEY = '21board-last-release', OLD = JSON.stringify({ version: '2026.11.1-1', build: '0000aaaa' });   // (an earlier release, never this one)
    // Every toast a page shows from its start (window.__said), and on cue (sessionStorage 'test-fake') messages already
    // showing as the board starts: 'nv' (“A new version of 21Board is ready.”) or '3' (three messages).
    const HEAR = () => {
      window.__said = [];
      let fake = null;
      try { fake = window.top === window && sessionStorage.getItem('test-fake'); if (fake) sessionStorage.removeItem('test-fake'); } catch (e) { /* no storage */ }
      new MutationObserver(ms => {
        for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__said.push((n.querySelector('span') || n).textContent);
        const host = fake && document.getElementById('toasts');
        if (!host) return;
        for (const t of fake === 'nv' ? ['A new version of 21Board is ready.'] : ['One', 'Two', 'Three']) { const d = document.createElement('div'); d.className = 'toast fake'; d.innerHTML = `<span>${t}</span>`; host.appendChild(d); }
        fake = null;
      }).observe(document, { childList: true, subtree: true });
    };
    // A device that last ran another release (recorded once, before its first start: not again at a reload or in another tab).
    const SEED = old => { if (window.top !== window || localStorage.getItem('test-seeded')) return; localStorage.setItem('test-seeded', '1'); localStorage.setItem('21board-last-release', old); };
    const device = async (seed, opts = {}) => {
      const c = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 768 } }, opts));
      await c.addInitScript(HEAR);
      if (seed) await c.addInitScript(SEED, seed);
      return c;
    };
    const open = async (c, url = BASE) => { const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(url); await boardUp(p); return p; };
    const said = p => p.evaluate(() => (window.__said || []).filter(t => /^Updated to/.test(t)));
    const kept = p => p.evaluate(k => localStorage.getItem(k), KEY);
    const keptAs = async (p, v) => { try { const r = JSON.parse(await kept(p)); return !!r && r.version === v.version && r.build === v.build; } catch (e) { return false; } };
    const settle = p => p.waitForTimeout(1500);   // (the note comes as the board comes up)
    const kids = (p, f) => p.frames().filter(x => x.parentFrame() === f);

    // ---- a first run on a new device: nothing is said, and the release is recorded
    let ctx = await device();
    let page = await open(ctx);
    const v = await page.evaluate(() => ({ version: window.__board21.version, build: window.__board21.build }));
    const NOTE = `Updated to ${v.version}.`;
    await settle(page);
    ok(!(await said(page)).length && await keptAs(page, v), `a first run on a new device says nothing, and records the release (${await kept(page)})`);
    // ---- a device that ran 21Board before this note (2026.11.18-16 or earlier): a board, nothing recorded. Said once.
    await page.evaluate(() => window.__board21.openWidget('notes'));
    await page.waitForFunction(() => { const w = window.__board21.state.wins.get('notes:1'); return w && w.connected; }, null, { timeout: 8000 });
    await page.evaluate(k => localStorage.removeItem(k), KEY);
    await page.reload(); await boardUp(page); await settle(page);
    ok((await said(page)).join(' | ') === NOTE && await keptAs(page, v), `a device with a board from before this note, nothing recorded, says “${NOTE}” (${(await said(page)).join(' | ') || 'nothing'}; ${await kept(page)})`);
    await page.reload(); await boardUp(page); await settle(page);
    ok(!(await said(page)).length, `once: a reload says nothing (${(await said(page)).join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- a device that last ran another release: said once as the board opens; a reload and another tab say nothing
    ctx = await device(OLD);
    page = await open(ctx);
    await settle(page);
    const look = await page.locator('#toasts .toast', { hasText: 'Updated to' }).evaluateAll(ts => ts.map(t => ({ text: t.textContent, buttons: t.querySelectorAll('button').length })));
    ok((await said(page)).join(' | ') === NOTE && look.length === 1 && look[0].text === NOTE && look[0].buttons === 0, `a device that last ran another release says “${NOTE}” once as the board opens, with no button (${(await said(page)).join(' | ') || 'nothing'})`);
    ok(await keptAs(page, v), `and records this release at once (${await kept(page)})`);
    ok(await eventually(async () => !(await page.locator('#toasts .toast', { hasText: 'Updated to' }).count()), 6000), 'it goes by itself, as other messages do');
    await page.reload(); await boardUp(page); await settle(page);
    ok(!(await said(page)).length, `a reload says nothing (${(await said(page)).join(' | ') || 'nothing'})`);
    const p2 = await open(ctx); await settle(p2);
    ok(!(await said(p2)).length, `nor does another tab opened after it (${(await said(p2)).join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- a later release recorded (a device that ran a test build, then this one): said as well
    ctx = await device(JSON.stringify({ version: '2099.1.1-1', build: 'ffffffff' }));
    page = await open(ctx); await settle(page);
    ok((await said(page)).join(' | ') === NOTE && await keptAs(page, v), `after a later release, an earlier one says “${NOTE}” too (${(await said(page)).join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- a tab that starts hidden (restored in the background): nothing until it is first shown, then the note
    const HIDDEN = () => {
      if (window.top !== window) return;
      let vis = 'hidden';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => vis !== 'visible' });
      window.__show = () => { vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); };
    };
    ctx = await device(OLD);
    await ctx.addInitScript(HIDDEN);
    page = await open(ctx); await settle(page);
    const hidden = { said: await said(page), kept: await kept(page) };
    await page.evaluate(() => window.__show()); await settle(page);
    ok(!hidden.said.length && hidden.kept === OLD && (await said(page)).join(' | ') === NOTE && await keptAs(page, v),
      `a tab that starts hidden waits, and says it when first shown (hidden: ${hidden.said.join(' | ') || 'nothing'}; shown: ${(await said(page)).join(' | ') || 'nothing'})`);
    await ctx.close();
    // A new device whose first tab starts hidden records at once: a second tab, shown first, has nothing to say either.
    ctx = await device();
    await ctx.addInitScript(HIDDEN);
    page = await open(ctx); await settle(page);
    const firstKept = await kept(page);
    const h2 = await open(ctx); await settle(h2);
    await h2.evaluate(() => window.__show()); await settle(h2);
    await page.evaluate(() => window.__show()); await settle(page);
    const hiddenSaid = (await said(h2)).concat(await said(page));
    ok(await keptAs(page, v) && firstKept === (await kept(page)) && !hiddenSaid.length,
      `a new device’s first tab records the release even while hidden, so no tab says it (${firstKept}; ${hiddenSaid.join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- storage that throws (site data blocked): nothing is said, and the board works
    ctx = await device();
    await ctx.addInitScript(() => { if (window.top === window) Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); } }); });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });   // (a start-up problem after the board is up is only logged)
    await page.goto(BASE); await boardUp(page);
    await page.evaluate(() => window.__board21.openWidget('notes'));
    const works = await page.waitForFunction(() => { const w = window.__board21.state.wins.get('notes:1'); return w && w.connected; }, null, { timeout: 8000 }).then(() => true, () => false);
    await settle(page);
    const threw = await page.evaluate(() => { try { return !localStorage; } catch (e) { return true; } });
    const started = await eventually(() => page.evaluate(() => window.__board21.history.started), 5000);   // (start-up went on past the note)
    ok(threw && works && started && !(await said(page)).length && !errors.length, `where storage throws, nothing is said and the board works (${started ? 'started' : 'start-up stopped'}; ${errors.join(' | ') || 'no errors'})`);
    await ctx.close();

    // ---- the board's storage blocked by the browser: only that is said; the note waits for a start where the board is saved
    ctx = await device(OLD);
    await ctx.addInitScript(() => { if (window.top === window) localStorage.setItem('test-faults', JSON.stringify({ open: 'blocked' })); });
    await ctx.addInitScript(STORAGE_FAULTS);
    page = await open(ctx); await settle(page);
    ok(await page.evaluate(() => window.__board21.store.failed === 'blocked') && await page.locator('.toast', { hasText: 'blocking storage' }).count() === 1 && !(await said(page)).length && await kept(page) === OLD,
      `where the browser blocks the board’s storage, only that is said, and nothing is recorded (${(await said(page)).join(' | ') || 'nothing'}; ${await kept(page)})`);
    await ctx.close();

    // ---- kiosk mode says it too
    ctx = await device(OLD);
    page = await open(ctx, BASE + '?kiosk=yes'); await settle(page);
    ok(await page.evaluate(() => document.body.classList.contains('kiosk')) && (await said(page)).join(' | ') === NOTE, `kiosk mode says it too (${(await said(page)).join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- the widget dev window and the widget lab: their test board says nothing and records nothing; the board then does
    ctx = await device(OLD);
    const dv = await ctx.newPage();   // (no error listener: the test widget throws on purpose, see DEV_WIDGET)
    const inBoard = async () => {
      const board = kids(dv, dv.mainFrame())[0];
      return board ? board.evaluate(() => ({ lab: !!window.__board21 && window.__board21.store.loaded,
        said: Array.from(document.querySelectorAll('#toasts .toast span'), s => s.textContent).concat(window.__said || []).filter(t => /^Updated to/.test(t)) })) : null;
    };
    await dv.goto(BASE + '__dev/widget.html'); await dv.waitForTimeout(3000);
    const devSaid = await inBoard(), devKept = await kept(dv);
    await dv.goto(BASE + 'sdk/lab.html'); await dv.waitForTimeout(400);
    await dv.click('#sample'); await dv.click('#run'); await dv.waitForTimeout(3500);
    const labSaid = await inBoard(), labKept = await kept(dv);
    ok(!!devSaid && devSaid.lab && !devSaid.said.length && devKept === OLD, `the widget dev window’s board says nothing, and records nothing (${JSON.stringify(devSaid)}; ${devKept})`);
    ok(!!labSaid && labSaid.lab && !labSaid.said.length && labKept === OLD, `nor does the widget lab’s (${JSON.stringify(labSaid)}; ${labKept})`);
    await dv.close();
    page = await open(ctx); await settle(page);
    ok((await said(page)).join(' | ') === NOTE, `and 21Board itself says it next (${(await said(page)).join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- it never pushes out another message: with three showing, it waits for the next start; and it is the first to go
    ctx = await device();
    page = await open(ctx);
    await page.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('notes'); });
    await page.waitForFunction(() => window.__board21.state.wins.size === 2 && [...window.__board21.state.wins.values()].every(w => w.connected), null, { timeout: 8000 });
    await page.evaluate(([k, old]) => { localStorage.setItem(k, old); sessionStorage.setItem('test-fake', '3'); }, [KEY, OLD]);
    await page.reload(); await boardUp(page); await settle(page);
    const full = { said: await said(page), toasts: await page.locator('#toasts .toast').allTextContents(), kept: await kept(page) };
    ok(!full.said.length && full.toasts.join() === 'One,Two,Three' && full.kept === OLD, `with three messages showing as the board opens, it says nothing and pushes none out (${full.toasts.join(' | ')})`);
    await page.reload(); await boardUp(page); await settle(page);
    ok((await said(page)).join(' | ') === NOTE && await keptAs(page, v), `it is said the next time 21Board opens (${(await said(page)).join(' | ') || 'nothing'})`);
    // “A new version of 21Board is ready.” already showing (a still newer release waiting), then two windows closed at once
    await page.evaluate(([k, old]) => { localStorage.setItem(k, old); sessionStorage.setItem('test-fake', 'nv'); }, [KEY, OLD]);
    await page.reload(); await boardUp(page);
    await page.locator('#toasts .toast', { hasText: NOTE }).waitFor({ timeout: 5000 }).catch(() => {});
    const order = await page.locator('#toasts .toast').allTextContents();
    await page.evaluate(() => Promise.all([window.__board21.closeWin('notes:1'), window.__board21.closeWin('notes:2')]));
    await page.waitForTimeout(400);
    const after = await page.locator('#toasts .toast:not(.out)').allTextContents();
    ok(order.join(' | ') === `A new version of 21Board is ready. | ${NOTE}` && after.length === 3 && after[0] === 'A new version of 21Board is ready.' && after.filter(t => /closed\./.test(t)).length === 2 && !after.includes(NOTE),
      `with “A new version of 21Board is ready.” showing, it comes after it; when two more messages come, it goes, not that one (${order.join(' | ')} → ${after.join(' | ')})`);
    await ctx.close();

    // ---- a real update through the offline copy: TEST-1, then TEST-2 offered and Update tapped, then TEST-3 left with
    // Later and taking over when 21Board opens again after its only tab closed
    ok(stamped(), STAMPED);
    deploy('updnote', { version: 'TEST-1', change: marked('v1') });
    const url = BASE + '__site/updnote/';
    ctx = await device();
    page = await open(ctx, url);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    await settle(page);
    ok(!(await said(page)).length && await keptAs(page, { version: 'TEST-1', build: SITES.updnote.build }), `(TEST-1, a first run: nothing said; ${await kept(page)})`);
    const ready = p => p.waitForFunction(() => !!window.__board21 && !!window.__board21.state.sw.updateReady, null, { timeout: 20000 });
    const prompt = p => p.locator('#toasts .toast', { hasText: 'A new version of 21Board is ready.' });
    const on = (p, r) => eventually(() => p.evaluate(r => window.__rel === r && !!window.__board21 && window.__board21.store.loaded && !document.getElementById('startup'), r), 20000);
    deploy('updnote', { version: 'TEST-2', change: marked('v2') });
    await updateCheck(page); await ready(page);
    await prompt(page).locator('button', { hasText: 'Update' }).click();
    const on2 = await on(page, 'v2'); await settle(page);
    ok(on2 && (await said(page)).join(' | ') === 'Updated to TEST-2.' && await keptAs(page, { version: 'TEST-2', build: SITES.updnote.build }),
      `Update tapped: the tab starts again on TEST-2 and says “Updated to TEST-2.” (${(await said(page)).join(' | ') || 'nothing'})`);
    await page.screenshot({ path: OUT + 'updated-to.png' });
    await page.reload(); await boardUp(page); await settle(page);
    ok(!(await said(page)).length, `once: a reload says nothing (${(await said(page)).join(' | ') || 'nothing'})`);
    deploy('updnote', { version: 'TEST-3', change: marked('v3') });
    await updateCheck(page); await ready(page);
    await prompt(page).locator('button', { hasText: 'Later' }).click();
    await page.evaluate(k => localStorage.removeItem(k), KEY);   // (as on a device from before this note: Tyler’s update to 2026.11.18-17)
    await page.close();
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    const on3 = await on(page, 'v3'); await settle(page);
    ok(on3 && (await said(page)).join(' | ') === 'Updated to TEST-3.' && await keptAs(page, { version: 'TEST-3', build: SITES.updnote.build }),
      `Later, then every tab closed, on a device from before this note: TEST-3 takes over as 21Board opens again, which says “Updated to TEST-3.” (${(await said(page)).join(' | ') || 'nothing'})`);
    await ctx.close();

    // ---- the docs
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), data = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    const row = (readme.match(/\| \*\*Updates\*\* \|[^|]*\|/) || [''])[0];
    ok(readme.includes('Updated to …') && data.includes('`localStorage["21board-last-release"]`'), 'the README names “Updated to …”, and the data format guide names its key');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Opened from disk (file://)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const url = 'file://' + path.join(ROOT, 'index.html').split(path.sep).join('/').replace(/^\/?/, '/');
    const a = await ctx.newPage();
    const errors = []; a.on('pageerror', e => errors.push(e.message));
    await a.goto(url); await a.waitForTimeout(600);
    await a.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('timer'); });
    await a.waitForTimeout(1500);
    ok((await a.evaluate(() => Array.from(window.__board21.state.wins.values()).every(w => w.connected))), 'widgets connect when index.html is opened from disk');
    const b = await ctx.newPage(); await b.goto(url); await b.waitForTimeout(1500);
    await fillNote(a.frameLocator('.win[data-ikey="notes:1"] iframe'), 'from disk');
    await a.waitForTimeout(800);
    ok(await b.frameLocator('.win[data-ikey="notes:1"] iframe').locator('textarea').inputValue() === 'from disk', 'tabs opened from disk stay in sync');
    await a.reload(); await a.waitForTimeout(1500);
    ok(await a.frameLocator('.win[data-ikey="notes:1"] iframe').locator('textarea').inputValue() === 'from disk', 'content persists when opened from disk');
    await openSettings(a, ['advanced']);
    ok((await a.locator('#st-persist').textContent()).includes('Unavailable') && !(await a.locator('#st-persist-hint').textContent()).includes('address bar'), 'data-protection status is accurate for a copy opened from a file');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    await openSettings(a, ['about']);
    ok((await a.locator('#settings .about').innerText()).startsWith(`21Board ${/const VERSION = '([^']+)'/.exec(sw)[1]} (${/const BUILD = '([0-9a-f]{8})'/.exec(sw)[1]}) · `), 'Settings → About names the release and build there too, where there is no offline copy to ask');
    // About's pictures load from disk; a license's text can't be read there (the browser won't), so it says where it is.
    await openSettings(a, ['code-license']);
    let lic = '';
    await eventually(async () => { lic = (await a.locator('#grp-code-license').innerText()).trim(); return lic !== 'Loading…'; }, 5000);
    const pics = await a.evaluate(() => [...document.querySelectorAll('#grp-about img')].map(i => i.complete && i.naturalWidth > 0));
    ok(pics.length === 2 && pics.every(Boolean) && lic === 'Can’t show the license here. See the LICENSE file.', `and its two pictures, and for the license “${lic.slice(0, 60)}”`);
    // (Opening Docs draws Settings again: Code shows that at once, and isn't read again.)
    const again = await a.evaluate(() => { document.querySelector('#settings [data-act="group"][data-val="docs-license"]').click(); return document.getElementById('grp-code-license').innerText.trim(); });
    ok(again === 'Can’t show the license here. See the LICENSE file.', `drawn again, it shows that at once, with no “Loading…” (“${again}”)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
