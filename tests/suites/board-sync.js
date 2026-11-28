// Board Sync: two or three devices sharing one board through a Google Drive folder.
'use strict';
module.exports = T => {
  const {
    fs, path, OUT, ok, freeBoard, openSettings, lockBoard, unlockBoard, renamePage, fillNote, DRIVE_PICK, CLOCK,
    setClock, driveDevice, readFolder, fileText, putText, readPhotos, addPhotos, ownFile, deliver, dupFolder,
    seedFolder, syncWaits, nameDevice, linkFolder, syncNow, shownBoard, sorted, sameBoards, notesText, loseLedger,
    typeNote, addNote, noteOf, addWin, winList, copiesOf, ikOf, saveData, syncDev, exchange, ownJSON, hear, heard,
    eventually, readHistory, writeHistory, OLD_NOTE, OLD_HIST_NOTE, release, boardUp, ytChoose, picLook, picData,
    picConf, picOpen, picFile, FIXTURE, drawPic, padGif, padWebp, pngHeader, copyPic, copyText, BASE
  } = T;
  return [
  ['Board Sync: pictures in windows (each kept once in Photos and named by the device file, the other device gets them whole, typing writes no picture again, a write cut off between two pictures, a picture still arriving, a file in Photos that lies, the folder’s note from the release before, a device file from the release before, Export and Import, background photos as before, pictures pasted just before 21Board is hidden)', async (browser) => {
    const errors = [], crypto = require('crypto');
    const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
    const bytesOf = src => Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    const nameOf = src => `${sha(bytesOf(src))}.${{ jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', avif: 'avif' }[/^data:image\/([a-z]+);/.exec(src)[1]]}`;
    const status = p => p.evaluate(() => window.__board21.link.status());
    const writes = p => p.evaluate(() => { (window.__writes || []).splice(0); return (window.__wrote || []).splice(0); });   // ([{name, bytes}])
    const pagesOf = j => [j].concat((j.pages || []).filter(x => !x.main));
    const refsIn = j => pagesOf(j).flatMap(pg => pg.instances || []).map(i => i.data && i.data.src && i.data.src.b21photo).filter(Boolean);
    const bigIn = text => /"data:[^"]{32768,}"/.test(text);
    const widOf = (p, ik) => p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ik);
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);

    // ---- Two Picture windows: a JPEG photo (kept as it is, under 1 MB) and an animated GIF (kept byte for byte).
    const jpg = await drawPic(A.p, 1400, 1000, 'image/jpeg', { noise: 15, q: 0.85 }), gif = padGif(FIXTURE('picture-animated.gif'), 60000);
    const k1 = await addWin(A.p, 'image'); await picOpen(A.p, picFile('Volcano.jpg', jpg, 'image/jpeg'), k1);
    const k2 = await addWin(A.p, 'image'); await picOpen(A.p, picFile('Spinning.gif', gif, 'image/gif'), k2);
    await ytChoose(A.p, 'Crop to fill', k2);
    const s1 = ((await picData(A.p, k1)) || {}).src || '', s2 = ((await picData(A.p, k2)) || {}).src || '';
    const exportedBefore = JSON.stringify(await A.p.evaluate(() => window.__board21.buildExport('full'))).length;
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const photosA = await readPhotos(A.p) || {};
    ok(s2 === `data:image/gif;base64,${gif.toString('base64')}` && Object.keys(photosA).sort().join() === [nameOf(s1), nameOf(s2)].sort().join() && photosA[nameOf(s1)] === bytesOf(s1).toString('base64') && photosA[nameOf(s2)] === gif.toString('base64'),
      `Photos holds each picture once, as its own bytes, named by its content (${Object.keys(photosA).join(', ')})`);
    const textA = await fileText(A.p, await ownFile(A.p)), jA = JSON.parse(textA);
    ok(!bigIn(textA) && refsIn(jA).sort().join() === [nameOf(s1), nameOf(s2)].sort().join() && jA.formatVersion === 2 && jA.sync.v === 2,
      `the laptop’s file holds no picture, and names both (formatVersion ${jA.formatVersion}, sync.v ${jA.sync.v})`);
    const saved = exportedBefore - textA.length, pics = s1.length + s2.length;
    ok(saved > 0.95 * pics, `the file is smaller by about the pictures: ${Math.round(textA.length / 1e3)} KB, against ${Math.round(exportedBefore / 1e3)} KB with them inside (${Math.round(pics / 1e3)} KB of pictures)`);
    console.log(`  (the laptop’s file: ${textA.length} characters; the same board with its pictures inside: ${exportedBefore}; pictures: ${pics})`);
    const w1 = await widOf(A.p, k1), w2 = await widOf(A.p, k2), b1 = await ikOf(B.p, w1), b2 = await ikOf(B.p, w2);
    const l1 = b1 ? await picLook(B.p, b1) : {}, l2 = b2 ? await picLook(B.p, b2) : {};
    ok(l1.src === s1 && l2.src === s2 && l1.alt === 'Volcano' && l2.alt === 'Spinning' && ((await picConf(B.p, b2)) || {}).fit === 'fill',
      'the smartboard shows both pictures whole (the GIF the same bytes, so it still moves), with their alt text, and Crop to fill');
    const jB = await ownJSON(B.p);
    ok(jB && refsIn(jB).sort().join() === refsIn(jA).sort().join() && Object.keys(await readPhotos(B.p) || {}).length === 2, 'its own file names the same two pictures, and Photos still holds two');

    // ---- Typing in a note: the device file is written again, and no picture is.
    const kn = await addNote(A.p, 'Spelling'); await A.p.waitForTimeout(700); await syncNow(A.p); await A.p.waitForTimeout(700); await syncNow(A.p);
    await writes(A.p);
    const seq0 = (await ownJSON(A.p)).sync.seq;
    await typeNote(A.p, kn, 'Spelling words for Friday'); await A.p.waitForTimeout(700); await syncNow(A.p);
    const wrote = await writes(A.p), seq1 = (await ownJSON(A.p)).sync.seq, bytes = wrote.reduce((t, w) => t + w.bytes, 0);
    ok(seq1 > seq0 && wrote.some(w => /\.21board$/.test(w.name)) && !wrote.some(w => /^[0-9a-f]{32}\./.test(w.name)) && bytes < 10000,
      `typing in a note writes the laptop’s file again, ${bytes} bytes in all, and no picture (${wrote.map(w => `${w.name}: ${w.bytes}`).join(', ')})`);
    await exchange(A, B);

    // ---- A picture still on its way: the laptop's file reaches the smartboard before its pictures.
    const jpg2 = await drawPic(A.p, 900, 700, 'image/jpeg', { noise: 15, q: 0.9 }), png3 = await drawPic(A.p, 360, 280, 'image/png', { noise: 63 });
    // (first the write is cut off before the second picture is in Photos, as when the device sleeps: its put fails once)
    await A.p.evaluate(n => { window.__drive = { failWrite: [n] }; }, `${sha(png3)}.png`);
    await picOpen(A.p, picFile('Lake.jpg', jpg2, 'image/jpeg'), k1);
    const k3 = await addWin(A.p, 'image'); await picOpen(A.p, picFile('Map.png', png3, 'image/png'), k3);
    const s1b = (await picData(A.p, k1)).src, s3 = (await picData(A.p, k3)).src, w3 = await widOf(A.p, k3);
    await A.p.waitForTimeout(700); await syncNow(A.p);
    const noted = () => A.p.evaluate(() => (window.__board21.link.sync || {}).pics || []);
    const cut = { st: await status(A.p), own: refsIn(await ownJSON(A.p)), pics: await noted(), failed: await A.p.evaluate(() => !(window.__drive.failWrite || []).length) };
    ok(nameOf(s3) === `${sha(png3)}.png` && cut.failed && /^Not synced\./.test(cut.st) && !cut.own.includes(nameOf(s3)) && !cut.pics.includes(nameOf(s3)),
      `a write cut off before the second picture is in Photos: “Not synced”, and neither the file nor what it notes as written names that picture (“${cut.st}”)`);
    await A.p.evaluate(() => { window.__drive = {}; });
    ok(await eventually(async () => { await syncNow(A.p); const j = await ownJSON(A.p), ph = await readPhotos(A.p) || {}; return refsIn(j).includes(nameOf(s1b)) && refsIn(j).includes(nameOf(s3)) && !!ph[nameOf(s1b)] && !!ph[nameOf(s3)]; }),
      'tried again, it puts what is missing and writes the file, which names both');
    await deliver(A.p, B.p, { photos: false }); await syncNow(B.p);
    const kept = await picData(B.p, b1);
    ok((await picLook(B.p, b1)).src === s1 && kept && kept.src === s1 && !await ikOf(B.p, w3), 'the file arrives first: the smartboard’s window keeps its picture, and the new window waits for its own');
    await B.p.waitForTimeout(2700); await syncNow(B.p);
    ok(/2 pictures on “Page 1” are still arriving\./.test(await status(B.p)), `after a while Settings says so (“${await status(B.p)}”)`);
    const jB2 = await ownJSON(B.p);
    ok(refsIn(jB2).includes(nameOf(s1)) && !refsIn(jB2).includes(nameOf(s3)), 'its own file still names the picture it shows, never an empty one');
    await putText(B.p, 'About this folder.txt', OLD_NOTE);   // (the folder's note as the release before wrote it)
    await B.p.reload(); await boardUp(B.p); await linkFolder(B.p, null);
    ok(((await picData(B.p, b1)) || {}).src === s1, 'reloaded while it waits, it still shows it');
    await deliver(A.p, B.p);
    ok(await eventually(async () => { await syncNow(B.p); const b3 = await ikOf(B.p, w3); return ((await picData(B.p, b1)) || {}).src === s1b && !!b3 && (await picLook(B.p, b3)).src === s3; }),
      'once the pictures arrive, both windows fill in');
    ok(!/still arriving/.test(await status(B.p)), `and Settings no longer waits (“${await status(B.p)}”)`);
    ok(await eventually(async () => /- The "Photos" folder holds each picture once\. The board files only name them\./.test(await fileText(B.p, 'About this folder.txt') || '')),
      'the folder’s note from the release before is written again, with what Photos holds now');

    // ---- A file in Photos that isn't the picture it's named for: refused, and the window is unharmed.
    const webp = padWebp(FIXTURE('picture-animated.webp'), 50000);
    await picOpen(A.p, picFile('Wave.webp', webp, 'image/webp'), k2);
    const s2b = (await picData(A.p, k2)).src;
    await A.p.waitForTimeout(700); await syncNow(A.p); await deliver(A.p, B.p, { photos: false });
    await addPhotos(B.p, { [nameOf(s2b)]: gif.toString('base64') });   // (the GIF's bytes, under the new picture's name)
    await syncNow(B.p);
    ok(((await picData(B.p, b2)) || {}).src === s2 && (await picLook(B.p, b2)).src === s2 && await B.p.evaluate(n => window.__board21.link.badPhotos.has(n), nameOf(s2b)),
      'a file whose bytes aren’t the picture its name says is refused, and the window keeps its picture');
    await B.p.waitForTimeout(2700); await syncNow(B.p);
    ok(/A picture on “Page 1” can’t be used\. Its window keeps what it shows\./.test(await status(B.p)), `Settings says so (“${await status(B.p)}”)`);
    await deliver(A.p, B.p);
    ok(await eventually(async () => { await syncNow(B.p); return ((await picData(B.p, b2)) || {}).src === s2b; }), 'the right bytes arrive: it fills in');
    // Files nobody should be able to slip in, each named by its own bytes: a text file, a PNG that says it is 8000 × 7000
    // (56 MP, over the Picture widget's 50), a GIF named .png, an animated GIF over 5 MB (the widget's limit); and a
    // picture of 11,999,983 bytes as Google Drive shows it, one byte more than Photos takes (as a data URL, 16e6
    // characters or more). Each is turned away before it is decoded. (A PNG of 100 × 100 that doesn't open, and a good
    // picture, are decoded once each. The good one shows 11,999,982 bytes, the most Photos takes: it is read whole.)
    const text = Buffer.from('not a picture at all. '.repeat(200)), huge = pngHeader(8000, 7000), anim = padGif(FIXTURE('picture-animated.gif'), 5.5 * 1048576), broken = pngHeader(100, 100);
    const lies = { [`${sha(text)}.png`]: text, [`${sha(huge)}.png`]: huge, [`${sha(gif)}.png`]: gif, [`${sha(anim)}.gif`]: anim };
    await addPhotos(B.p, Object.fromEntries(Object.entries(lies).concat([[`${sha(broken)}.png`, broken]]).map(([n, b]) => [n, b.toString('base64')])));
    await B.p.evaluate(([n, good]) => { window.__drive = { stamp: { [n]: { size: 11999983, lastModified: Date.now() }, [good]: { size: 11999982, lastModified: Date.now() } } }; }, [nameOf(s2), nameOf(s1b)]);
    const read = await B.p.evaluate(async names => {
      const l = window.__board21.link, out = {}, real = window.createImageBitmap;
      let n = 0;
      window.createImageBitmap = (...a) => { n++; return real.apply(window, a); };
      try { for (const f of names) { n = 0; const m = await l.readPhoto({ file: f }, true).catch(() => null); out[f] = { data: m ? m.data : null, decoded: n }; } } finally { window.createImageBitmap = real; }
      return out;
    }, Object.keys(lies).concat(nameOf(s2), `${sha(broken)}.png`, nameOf(s1b)));
    await B.p.evaluate(() => { window.__drive = {}; });
    const said = Object.values(read).map(x => `${x.data ? 'read' : 'refused'} (${x.decoded})`).join(', ');
    ok(Object.keys(lies).concat(nameOf(s2)).every(n => read[n].data === null && read[n].decoded === 0) && read[`${sha(broken)}.png`].data === null && read[`${sha(broken)}.png`].decoded === 1 && read[nameOf(s1b)].data === s1b,
      `a non-picture, a picture over 50 MP, one of another type than its name, an animation over 5 MB and one a byte over what Photos takes are refused before they are decoded; a good one is read whole, at the most Photos takes too (${said})`);
    // (Merge.picType: a picture of 11,999,982 bytes, a data URL of 15,999,999 characters, goes to Photos; one byte more
    // stays in the device file. So every picture a file names in Photos can be read back.)
    const edge = await B.p.evaluate(src => {
      const M = window.__board21.merge, head = 'data:image/jpeg;base64,', start = src.slice(head.length, head.length + 128);
      const url = n => { const pad = (3 - n % 3) % 3; return head + start + 'A'.repeat(4 * Math.ceil(n / 3) - 128 - pad) + '='.repeat(pad); };
      return [11999982, 11999983].map(n => { const u = url(n); return { n, chars: u.length, type: M.picType(u) }; });
    }, s1b);
    ok(edge[0].type === 'jpeg' && edge[0].chars === 15999999 && edge[1].type === '' && edge[1].chars >= 16e6,
      `Photos takes a picture of up to 11,999,982 bytes, the size read back above; one byte more stays in the file (${edge.map(e => `${e.n} bytes, ${e.chars} characters: “${e.type}”`).join('; ')})`);

    // ---- A device file from the release before (sync.v 1, its pictures inside it): read as it is, with no Photos.
    const old = JSON.parse(await fileText(A.p, await ownFile(A.p))), srcs = {};
    for (const ik of [k1, k2, k3]) srcs[await widOf(A.p, ik)] = (await picData(A.p, ik)).src;
    for (const pg of pagesOf(old)) for (const i of pg.instances || []) if (i.data && i.data.src && i.data.src.b21photo) { i.data.src = srcs[i.wid]; delete i.vh; }
    old.formatVersion = 1; old.sync.v = 1; old.sync.sum = '';
    old.sync.sum = sha(Buffer.from(JSON.stringify(Object.assign({}, old, { sync: Object.assign({}, old.sync, { sum: '' }) }))));
    const D = await syncDev(browser, 'the desktop', errors);
    await seedFolder(D.p, '21Board', { [await ownFile(A.p)]: JSON.stringify(old) });
    await linkFolder(D.p);
    const dShows = async () => { const out = []; for (const w of Object.keys(srcs)) { const k = await ikOf(D.p, w); out.push(!!k && ((await picData(D.p, k)) || {}).src === srcs[w]); } return out.every(Boolean); };
    ok(await eventually(dShows), 'a file from the release before, its pictures inside, is read as it is: a new device shows them with nothing in Photos');
    ok(await eventually(async () => { const ph = Object.keys(await readPhotos(D.p) || {}).sort().join(); return ph === Object.values(srcs).map(nameOf).sort().join() && refsIn(await ownJSON(D.p) || {}).length === 3; }),
      'its own file then names them, and puts each in Photos');
    await D.c.close();

    // ---- Export is whole, as before. Import: an export; a device file from the folder; the same file on a device with no folder.
    const exp = await A.p.evaluate(() => window.__board21.buildExport('full'));
    const ei = exp.instances.filter(i => i.widgetId === 'image');
    ok(exp.formatVersion === 1 && !JSON.stringify(exp).includes('b21photo') && ei.length === 3 && ei.every(i => /^data:image\//.test(i.data.src)), 'an export holds its pictures (formatVersion 1), as before');
    fs.writeFileSync(OUT + 'pictures-export.21board', JSON.stringify(exp));
    fs.writeFileSync(OUT + 'pictures-device-file.21board', await fileText(A.p, await ownFile(A.p)));
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), E = await ctx.newPage();
    E.on('pageerror', e => errors.push('the computer: ' + e.message));
    await E.goto(BASE); await boardUp(E);
    const shown = async (p, want) => { const got = []; for (const [k] of await p.evaluate(() => Array.from(window.__board21.state.insts.entries()).filter(([k]) => k.startsWith('image:')))) got.push(((await picData(p, k)) || {}).src || ''); return got.sort().join() === want.slice().sort().join(); };
    const want = Object.values(srcs);
    await E.setInputFiles('#import-input', OUT + 'pictures-export.21board');
    await E.locator('#modal.open .btn', { hasText: 'Replace this page' }).click({ timeout: 5000 }).catch(() => {});
    ok(await eventually(() => shown(E, want)), 'importing an export shows its pictures');
    await E.setInputFiles('#import-input', OUT + 'pictures-device-file.21board');
    await E.locator('#modal.open').waitFor({ timeout: 5000 }).catch(() => {});
    const say = (await E.locator('#modal.open .modal-card').innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(/3 pictures can’t be found\. Their windows open empty\./.test(say), `a device file opened where its folder isn’t: the dialog says its pictures can’t be found (“${say}”)`);
    await E.locator('#modal.open .btn', { hasText: 'Replace this page' }).click({ timeout: 5000 }).catch(() => {});
    ok(await eventually(async () => { const ks = await E.evaluate(() => Array.from(window.__board21.state.insts.keys()).filter(k => k.startsWith('image:'))); return ks.length === 3 && (await Promise.all(ks.map(k => picLook(E, k)))).every(l => l.ask); }),
      'and its windows open empty, nothing else in their place');
    await ctx.close();
    await B.p.setInputFiles('#import-input', OUT + 'pictures-device-file.21board');
    await B.p.locator('#modal.open .btn', { hasText: 'Open as a new page' }).click({ timeout: 5000 }).catch(() => {});
    ok(await eventually(() => shown(B.p, want)), 'opened on the smartboard, linked to the folder, the same file’s pictures come from Photos');

    // ---- Background photos: as before.
    const bg = await A.p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#16a34a'; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png'); });
    await A.p.setInputFiles('#photo-input', { name: 'grass.png', mimeType: 'image/png', buffer: Buffer.from(bg.split(',')[1], 'base64') }); await A.p.waitForTimeout(1500);
    await A.p.waitForTimeout(700); await syncNow(A.p);
    const jA3 = await ownJSON(A.p), bgFile = jA3 && jA3.media && jA3.media.background && jA3.media.background.file;
    ok(/^[0-9a-f]{32}\.(jpg|png|webp)$/.test(bgFile || '') && !!(await readPhotos(A.p))[bgFile] && !refsIn(jA3).includes(bgFile), `a background photo is still put in Photos and named by the file, as before (${bgFile})`);
    await A.c.close(); await B.c.close();

    // ---- Pictures pasted on a slow laptop (the Picture window's page held back), then 21Board hidden at once: the
    // laptop's file waits for the pictures, so the smartboard never shows a new window empty, ready for another picture.
    // With Ctrl+V, and with the Widget Picker's Paste. A window whose widget never saves holds the file back only a while.
    const held = { on: false, wait: Promise.resolve(), go: null };
    const hold = on => { held.on = on; if (on) held.wait = new Promise(r => { held.go = r; }); else if (held.go) held.go(); };
    const lc = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });   // (no service worker: the route sees the widget's page)
    await lc.addInitScript(DRIVE_PICK); await lc.addInitScript(CLOCK);
    await lc.route('**/widgets/image/index.html', async r => { if (held.on) await held.wait; await r.continue().catch(() => {}); });
    const L = { c: lc, p: await lc.newPage() };
    L.p.on('pageerror', e => errors.push('the slow laptop: ' + e.message));
    await L.p.goto(BASE); await boardUp(L.p); await nameDevice(L.p, 'the slow laptop'); await syncWaits(L.p);
    const SB = await syncDev(browser, 'the smartboard', errors);
    await linkFolder(L.p); await deliver(L.p, SB.p); await linkFolder(SB.p); await exchange(L, SB);
    const hide = (p, on) => p.evaluate(on => { if (on) Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); else delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }, on);
    const picKeys = () => L.p.evaluate(() => Array.from(window.__board21.state.insts.keys()).filter(k => k.startsWith('image:')));
    const newPic = async before => { let ks = []; await eventually(async () => (ks = (await picKeys()).filter(k => !before.includes(k))).length > 0, 5000); return ks[0] || null; };
    const instsIn = j => (j ? pagesOf(j) : []).flatMap(pg => pg.instances || []);
    const pa = await drawPic(L.p, 400, 300, 'image/png', { noise: 63 }), pb = await drawPic(L.p, 360, 280, 'image/png', { noise: 31 });
    hold(true);
    let before = await picKeys();
    await copyPic(L.p, pa); await L.p.mouse.click(30, 330); await L.p.keyboard.press('Control+V');
    const kp = await newPic(before);
    before = await picKeys();
    await copyPic(L.p, pb); await L.p.click('.picker-btn.left'); await L.p.mouse.move(1, 1); await L.p.waitForTimeout(300); await L.p.click('#panel.open [data-ctl="paste"]');
    const kq = await newPic(before);
    await hide(L.p, true); await L.p.waitForTimeout(2500);
    const wids = kp && kq ? [await widOf(L.p, kp), await widOf(L.p, kq)] : [];
    const emptyIn = j => instsIn(j).filter(i => wids.includes(i.wid) && !(i.data && i.data.src));
    const hist = Object.values(await readHistory(L.p)).map(t => { try { return JSON.parse(t); } catch (e) { return null; } });
    const jL1 = await ownJSON(L.p);
    ok(wids.length === 2 && !emptyIn(jL1).length && !hist.some(h => emptyIn(h).length),
      `pasted with Ctrl+V and with the Widget Picker’s Paste, then hidden before their widget has them: the laptop’s file and its Board history copies name neither window empty (${instsIn(jL1).filter(i => wids.includes(i.wid)).map(i => JSON.stringify(i.data)).join(', ') || 'not in the file yet'})`);
    const emptyOn = async p => (await winList(p)).some(x => wids.includes(x.wid) && !(x.data && x.data.src));   // (from its records: a window it has, empty)
    await deliver(L.p, SB.p, { photos: false }); await syncNow(SB.p);
    ok(!await emptyOn(SB.p), 'that file reaches the smartboard: no empty window there');
    hold(false);
    ok(await eventually(async () => { const ins = instsIn(await ownJSON(L.p)); return wids.every(w => { const i = ins.find(x => x.wid === w); return !!(i && i.data && i.data.src && i.data.src.b21photo); }); }, 10000),
      'once the widget has the pictures, the laptop’s file names both, still hidden');
    await hide(L.p, false);
    await deliver(L.p, SB.p, { photos: false }); await syncNow(SB.p);
    ok(!await emptyOn(SB.p), 'it reaches the smartboard before the pictures: the new windows wait, never empty');
    await deliver(L.p, SB.p);
    const both = async () => { for (const [k, w] of [[kp, wids[0]], [kq, wids[1]]]) { const b = await ikOf(SB.p, w); if (!b || ((await picData(SB.p, b)) || {}).src !== ((await picData(L.p, k)) || {}).src) return false; } return true; };
    ok(await eventually(async () => { await syncNow(SB.p); return both(); }), 'the pictures arrive: the smartboard shows both');
    await syncWaits(L.p, { fill: 2000 });
    hold(true);
    before = await picKeys();
    await L.p.mouse.click(30, 330); await L.p.keyboard.press('Control+V');
    const kr = await newPic(before), wr = kr && await widOf(L.p, kr);
    await hide(L.p, true);
    ok(!!wr && await eventually(async () => instsIn(await ownJSON(L.p)).some(i => i.wid === wr), 8000), 'a window whose widget never saves holds the file back only a while (Link.waits.fill)');
    hold(false); await hide(L.p, false);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await L.c.close(); await SB.c.close();
  }],
  ['Board Sync: pictures in windows and Board history copies (a copy names its pictures in Photos, tidying keeps a picture any device file or copy names, in “Board history (1)” too, waits while the copies can’t be read, deletes one nobody names after a week and puts back one deleted by hand, going back to a copy or importing it puts its pictures back)', async (browser) => {
    const errors = [], crypto = require('crypto'), DAY = 864e5;
    const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
    const nameOf = src => `${sha(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'))}.${{ jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' }[/^data:image\/([a-z]+);/.exec(src)[1]]}`;
    const refsIn = j => [j].concat((j.pages || []).filter(x => !x.main)).flatMap(pg => pg.instances || []).map(i => i.data && i.data.src && i.data.src.b21photo).filter(Boolean);
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await A.p.evaluate(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    const pHist = await drawPic(A.p, 700, 500, 'image/jpeg', { noise: 15, q: 0.9 }), pKeep = await drawPic(A.p, 640, 480, 'image/png', { noise: 63 }), pNone = await drawPic(A.p, 600, 400, 'image/jpeg', { noise: 31, q: 0.9 });
    const k1 = await addWin(A.p, 'image'); await picOpen(A.p, picFile('Map.jpg', pHist, 'image/jpeg'), k1);
    const sHist = (await picData(A.p, k1)).src;
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);

    // ---- Save this version now: its copy in the folder names the picture in Photos, and holds none.
    await writeHistory(A.p, { 'About these files.txt': OLD_HIST_NOTE });   // (the note beside the copies, as the release before wrote it)
    await A.p.evaluate(() => window.__board21.history.save('With the map'));
    let copy = null;
    await eventually(async () => { const h = await readHistory(A.p); copy = Object.keys(h).find(n => / saved \(laptop\) \[[0-9a-z]{6}-[0-9a-z]{4}\]\.21board$/.test(n)); return !!copy; });
    const copyText = copy ? (await readHistory(A.p))[copy] : '{}', cj = JSON.parse(copyText);
    ok(!!copy && cj.formatVersion === 2 && refsIn(cj).join() === nameOf(sHist) && !/"data:[^"]{32768,}"/.test(copyText) && !!(await readPhotos(A.p) || {})[nameOf(sHist)],
      `a Board history copy in the folder names its picture in Photos, and holds none (${copy}: ${copyText.length} characters, the picture ${sHist.length})`);
    const about = (await readHistory(A.p))['About these files.txt'] || '';
    ok(/Pictures in windows are in the "Photos" folder, once each\./.test(about.replace(/\r\n\s*/g, ' ')), 'the note beside the copies, from the release before, is written again and says where their pictures are');

    // ---- The window then shows another picture. A third, put in a window and deleted, is named by nobody.
    await picOpen(A.p, picFile('Kite.png', pKeep, 'image/png'), k1);
    const sKeep = (await picData(A.p, k1)).src;
    const k2 = await addWin(A.p, 'image'); await picOpen(A.p, picFile('Gone.jpg', pNone, 'image/jpeg'), k2);
    const sNone = (await picData(A.p, k2)).src;
    await A.p.waitForTimeout(700); await syncNow(A.p);
    ok(!!(await readPhotos(A.p) || {})[nameOf(sNone)], 'the third picture went to Photos');
    await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), k2); await A.p.waitForTimeout(700);
    await syncNow(A.p); await exchange(A, B);
    ok(!refsIn(await ownJSON(A.p)).includes(nameOf(sNone)) && !refsIn(await ownJSON(B.p)).includes(nameOf(sNone)) && !refsIn(await ownJSON(A.p)).includes(nameOf(sHist)),
      'no device file names the copy’s picture or the deleted one');
    // Google Drive brings the copies to the smartboard, whose "Board history" can't be read just then. On the laptop it
    // moved them to a second folder, "Board history (1)".
    await writeHistory(B.p, await readHistory(A.p));
    await dupFolder(A.p, 'Board history');
    await B.p.evaluate(() => { window.__drive = { badDirs: ['Board history'] }; });
    const photosB = Object.keys(await readPhotos(B.p) || {}).sort().join(), tidyB = () => B.p.evaluate(() => (window.__board21.link.st.tidy || {}).at || 0), tidiedB0 = await tidyB();
    // A week later (each device tidies Photos at most once a day; a picture goes once found unnamed on two looks).
    const later = async d => {
      for (const D of [A, B]) { await setClock(D.p, d * DAY); await D.p.evaluate(() => window.__board21.link.awake()); }
      await A.p.waitForTimeout(2700); await deliver(B.p, A.p); await syncNow(A.p); await syncNow(B.p);
    };
    for (const d of [8, 9]) await later(d);
    const has = async n => !!(await readPhotos(A.p) || {})[n];
    ok(await eventually(async () => { await syncNow(A.p); return !await has(nameOf(sNone)); }), 'a week on, the picture nobody names is deleted from Photos');
    ok(await has(nameOf(sHist)) && await has(nameOf(sKeep)), 'the one only a Board history copy names stays, in “Board history (1)” too, and so does the one a device file names');
    const kept = await A.p.evaluate(() => (window.__board21.link.st.tidy || {}).copies || {});
    ok(JSON.stringify((kept[`Board history (1)/${copy}`] || {}).files) === JSON.stringify([nameOf(sHist)]), `what each copy names is kept with the tidying, so each copy is read once (${Object.keys(kept).length} kept)`);
    await syncNow(B.p);
    const photosB2 = Object.keys(await readPhotos(B.p) || {}).sort().join();
    ok(photosB.split(',').includes(nameOf(sHist)) && photosB2 === photosB && await tidyB() === tidiedB0, `while its “Board history” can’t be read, the smartboard deletes nothing from Photos (${photosB2.split(',').length} of ${photosB.split(',').length} left)`);
    // A picture deleted from Photos by hand: the laptop's next daily look finds it missing, and it is put back with no
    // change on the board.
    await A.p.evaluate(async n => { await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board')).getDirectoryHandle('Photos')).removeEntry(n); }, nameOf(sKeep));
    await B.p.evaluate(() => { window.__drive = {}; });
    const ownA = await fileText(A.p, await ownFile(A.p));
    await setClock(A.p, 10 * DAY); await A.p.evaluate(() => window.__board21.link.awake()); await A.p.waitForTimeout(2700); await syncNow(A.p);
    ok(await eventually(async () => { await syncNow(A.p); return await has(nameOf(sKeep)); }), 'a picture deleted from Photos by hand is put back after the next daily look, with no change on the board');
    console.log(`  (the laptop’s file ${(await fileText(A.p, await ownFile(A.p))) === ownA ? 'was not written again' : 'was written again'})`);
    await dupFolder(A.p, 'Board history (1)', 'Board history');   // (the copies back where Settings lists them)
    for (const D of [A, B]) await setClock(D.p, 0);

    // ---- Going back to the copy (Settings › Board history › In your Google Drive folder): its picture is back.
    await openSettings(A.p); await A.p.click('#settings [data-act="hist-open"]');
    const go = A.p.locator(`#history [data-act="folder-go"][data-val="${copy}"]`);
    await go.waitFor({ timeout: 5000 }).catch(() => {});
    await go.click({ timeout: 5000 }).catch(() => {});
    ok(await eventually(async () => ((await picData(A.p, k1)) || {}).src === sHist && (await picLook(A.p, k1)).src === sHist), 'going back to the copy puts its picture back in the window');
    await A.p.waitForTimeout(700); await syncNow(A.p); await exchange(A, B);
    const kB = await ikOf(B.p, await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, k1));
    ok(!!kB && ((await picData(B.p, kB)) || {}).src === sHist, 'and on the smartboard');
    // The same copy on a device whose folder lacks the picture: it goes back, and says what it couldn't bring.
    const C = await syncDev(browser, 'the desktop', errors);
    const folder = await readFolder(A.p), photos = await readPhotos(A.p) || {};
    await seedFolder(C.p, '21Board', folder); await writeHistory(C.p, await readHistory(A.p));
    delete photos[nameOf(sHist)]; await addPhotos(C.p, photos);
    await linkFolder(C.p);
    await openSettings(C.p); await C.p.click('#settings [data-act="hist-open"]');
    const goC = C.p.locator(`#history [data-act="folder-go"][data-val="${copy}"]`);
    await goC.waitFor({ timeout: 5000 }).catch(() => {});
    await goC.click({ timeout: 5000 }).catch(() => {});
    ok(await eventually(async () => await C.p.locator('.toast', { hasText: 'A picture from then can’t be found.' }).count() === 1),
      `a copy whose picture isn’t in Photos: going back says so (${(await C.p.locator('#toasts .toast').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' | ')})`);
    // The same copy opened with Import while its picture is in Photos but can't be read (the read never ends): the
    // dialog still opens, in time, and says so.
    await addPhotos(C.p, { [nameOf(sHist)]: sHist.slice(sHist.indexOf(',') + 1) });
    await C.p.evaluate(n => { window.__drive = { hang: [n] }; }, nameOf(sHist));
    fs.writeFileSync(OUT + 'pictures-history-copy.21board', copyText);
    const t0 = Date.now();
    await C.p.setInputFiles('#import-input', OUT + 'pictures-history-copy.21board');
    await C.p.locator('#modal.open').waitFor({ timeout: 12000 }).catch(() => {});
    const sayC = (await C.p.locator('#modal.open .modal-card').innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(/A picture can’t be found\. Its window opens empty\./.test(sayC), `importing it while its picture can’t be read: the dialog opens after ${((Date.now() - t0) / 1000).toFixed(1)} s and says so (“${sayC}”)`);
    await C.p.locator('#modal.open .btn', { hasText: 'Cancel' }).click().catch(() => {});
    await C.p.evaluate(() => { window.__drive = {}; });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close(); await C.c.close();
  }],
  ['Board Sync: setting up (scenarios 1–4: the first device, a fresh smartboard, a device with its own pages, two set up at once)', async (browser) => {
    const errors = [];
    const said = async p => (await p.locator('#modal.open').count()) ? (await p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ') : '';
    const dev = async label => { const d = await driveDevice(browser); d.p.on('pageerror', e => errors.push(label + ': ' + e.message)); await d.p.goto(BASE); await boardUp(d.p); await nameDevice(d.p, label); await syncWaits(d.p); return d; };
    const files = async p => Object.keys(await readFolder(p)).sort();
    const devFiles = async p => (await files(p)).filter(n => /^21Board \(/.test(n));
    const ENDING = 'Changes on any of your devices show up on the others, usually within a minute.';

    // ---- 1. The first device, an empty folder, a page with a note: its file and the note about the folder, at once.
    const A = await dev('the laptop');
    const nA = await addNote(A.p, 'Spelling words');
    await renamePage(A.p, 'Morning');
    await openSettings(A.p);
    await A.p.click('#settings [data-act="link-setup"]');
    const step1 = await said(A.p), steps = await A.p.locator('#modal.open .setup-steps li').allInnerTexts();
    ok(/Board Sync keeps your board in your school Google Drive, so your laptop and smartboard share it\./.test(step1) && steps.length === 3 &&
      /The first time, tap New folder and name it 21Board\. On your other device, pick this same folder\. To work on a board with a co-teacher, share this folder with them as an Editor\.$/.test(steps[1]),
      `step 1 says what Board Sync does, and step 2 to pick the same folder on the other device and how to share it (${steps[1]})`);
    await A.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await A.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    const last = await said(A.p);
    ok(last.includes('This device now syncs through your “21Board” folder. Now set up Board Sync on your other devices and pick this same folder. This board then shows up there. ' + ENDING) && await A.p.locator('#modal.open .btn').allInnerTexts().then(b => b.join('|') === 'Done'),
      `the last step says what comes next, with one button, Done (“${last}”)`);
    await A.p.locator('#modal.open .btn', { hasText: 'Done' }).click();
    let fA = await devFiles(A.p);
    ok(fA.length === 1 && /^21Board \(laptop\) \[[0-9a-z]{4}\]\.21board$/.test(fA[0]) && (await files(A.p)).includes('About this folder.txt'),
      `setting up writes this device’s file at once, named after it, beside “About this folder.txt” (${(await files(A.p)).join(', ')})`);
    const about = await fileText(A.p, 'About this folder.txt');
    ok(/Each device keeps its own copy of the whole board here, named after the device, such as\r\n"21Board \(laptop\) \[k3j9\]\.21board"\./.test(about) && /- To work on a board with a co-teacher, share this folder with them as an Editor\. They add a\r\n  shortcut to it in their My Drive, then pick it when they set up Board Sync\./.test(about) && /21Board deletes an unlinked device’s file two\r\n  months later\./.test(about) &&
      /- The "Photos" folder holds each picture once\. The board files only name them\. To give\r\n  someone a board, use Export in 21Board\./.test(about),
      'the note explains one file per device, sharing with a co-teacher, that an unlinked device’s file goes after two months, and what Photos holds');
    const jA = JSON.parse(await fileText(A.p, fA[0]));
    ok(jA.format === '21board' && jA.kind === 'full' && jA.board.name === 'Morning' && jA.sync && jA.sync.v === 2 && /^[0-9a-z]{12}$/.test(jA.sync.dev) && jA.sync.name === 'the laptop' && /^[0-9a-f]{32}$/.test(jA.sync.sum) &&
      jA.instances.some(i => i.data && i.data.text === 'Spelling words' && i.v && i.v.data) && /^[0-9a-z]{12}$/.test(jA.sync.folder),
      'the file is the whole board, with a version of each part, and a sync block: the device, its name, the folder’s id and a checksum');
    // It opens with Import as an all-pages backup.
    const E = await dev('a computer');
    await E.p.evaluate(j => window.__board21.applyImport(j, 'replace'), jA); await E.p.waitForTimeout(1200);
    ok(await E.p.evaluate(() => window.__board21.state.board.name) === 'Morning' && /Spelling words/.test(await notesText(E.p)), 'Import opens a device file as a backup of the board');
    await E.c.close();
    // Settings: three rows.
    await openSettings(A.p);
    const rows = await A.p.evaluate(() => { const h = [...document.querySelectorAll('#settings h3')].find(x => x.textContent === 'Board Sync'); const out = []; for (let e = h.nextElementSibling; e && e.tagName !== 'H3' && !e.classList.contains('gap'); e = e.nextElementSibling) out.push(e.innerText.replace(/\s+/g, ' ').trim()); return out; });
    ok(rows.length === 3 && /^Synced through “21Board” /.test(rows[0]) && /Up to date\. This device’s latest changes went to your folder at \d/.test(rows[0]) && /No other devices yet\. Set up Board Sync on another device and pick this same folder\./.test(rows[0]) &&
      /Change… Unlink$/.test(rows[0]) && /^This device’s name Shown on your other devices\.$/.test(rows[1]) && /^Keep history copies in the folder About hourly/.test(rows[2]),
      `Settings › Board Sync has three rows: the folder with how it is going, Change… and Unlink; this device’s name; history copies (${rows.join(' | ')})`);
    const nameHint = await A.p.evaluate(() => { const f = document.getElementById('set-link-label'), h = document.getElementById(f.getAttribute('aria-describedby') || '-'); return h && h.classList.contains('hint') ? h.textContent : null; });
    ok(nameHint === 'Shown on your other devices.', `this device’s name has a hint under the field, read with it, not a label in parentheses (${nameHint})`);
    ok(await A.p.locator('#settings [data-act="link-send"], #settings [data-act="link-auto"], #settings [data-act="link-photo"], #settings [data-act="group"][data-val="boards"], #settings [data-act="group"][data-val="folder"]').count() === 0,
      'no Send, Send automatically, Send the background photo, Boards from other devices or Folder settings');
    const hints = await A.p.evaluate(() => Array.from(document.querySelectorAll('#settings .hint')).map(h => h.textContent));
    ok(hints.filter(h => /This page, on all your devices\./.test(h)).length >= 2 && hints.filter(h => h === 'This device only.').length >= 2 && hints.filter(h => h === 'On all your devices.').length === 3 && !hints.some(h => /This page only\./.test(h)),
      'while linked, the page’s own settings say “This page, on all your devices.”, the device’s own say “This device only.”, and Theme, Accent color, and Default widget language “On all your devices.”');
    await openSettings(A.p, ['about']);
    const footer = (await A.p.locator('#settings .about').innerText()).replace(/\s+/g, ' ');
    ok(footer.endsWith(' Your work is stored only on this device and in your school Google Drive.') && !/sends nothing/.test(footer), `About says the work is stored only here and in the school Google Drive (${footer})`);
    await A.p.keyboard.press('Escape');
    // A placeholder-only device writes nothing, even after a Timer was opened and closed on it with no content. A new
    // device's first page is "Page 1".
    const C = await dev('a computer');
    ok(await C.p.evaluate(() => window.__board21.state.board.name) === 'Page 1', 'a new device starts with one page, “Page 1”');
    await C.p.evaluate(async () => { window.__board21.openWidget('timer'); await new Promise(r => setTimeout(r, 900)); window.__board21.closeWin('timer:1'); });
    await C.p.evaluate(() => { window.__drive = { pick: 'Empty' }; });
    await openSettings(C.p); await C.p.click('#settings [data-act="link-setup"]'); await C.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await C.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    ok((await said(C.p)).includes('Now set up Board Sync on your other device and pick this same folder. Its board then shows up here.'), 'a device with only the untouched first page: “… Its board then shows up here.”');
    await C.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await C.p.waitForTimeout(1500);
    ok((await seedFolder(C.p, 'Empty')).join() === 'About this folder.txt', 'and it writes no file: an empty “Page 1” would be added to every board that joins');
    await C.c.close();
    // A device set up before 2026.11.18-12 has "My Board" as its untouched first page: that is never sent either.
    const C2 = await dev('an older computer');
    await C2.p.evaluate(() => window.__board21.updateBoard({ name: 'My Board' })); await C2.p.waitForTimeout(400);
    await C2.p.evaluate(() => { window.__drive = { pick: 'Empty' }; });
    await openSettings(C2.p); await C2.p.click('#settings [data-act="link-setup"]'); await C2.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await C2.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    ok((await said(C2.p)).includes('Its board then shows up here.'), 'a device with only an untouched “My Board” is told the board then shows up there');
    await C2.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await C2.p.waitForTimeout(1500);
    ok((await seedFolder(C2.p, 'Empty')).join() === 'About this folder.txt' && await C2.p.evaluate(() => window.__board21.state.board.name) === 'My Board',
      'and it writes no file either, and keeps its page’s name');
    await C2.c.close();

    // ---- 2. A fresh smartboard joins: it takes the board, with no question; its first page is in no file.
    const B = await dev('the smartboard');
    const firstB = await B.p.evaluate(() => window.__board21.state.board.name);
    await deliver(A.p, B.p);
    await openSettings(B.p);
    await B.p.click('#settings [data-act="link-setup"]'); await B.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await B.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    const lastB = await said(B.p);
    ok(lastB.includes('This device now syncs through your “21Board” folder. The 1-page board from the laptop is here. ' + ENDING) && await B.p.locator('#modal.open input').inputValue() === 'the smartboard',
      `the smartboard says the board from the laptop is here, with its name in the field (“${lastB}”)`);
    const setupToasts = await B.p.locator('#toasts .toast span').allInnerTexts();
    ok(!setupToasts.some(t => /added on|is here|Updated from/.test(t)), `and no merge message besides (${setupToasts.join(' | ') || 'none'})`);
    await B.p.locator('#modal.open .btn', { hasText: 'Done' }).click();
    ok(await eventually(async () => await B.p.evaluate(() => window.__board21.state.board.name) === 'Morning' && (await notesText(B.p)).includes('Spelling words') && Object.keys(await shownBoard(B.p)).length === 1, 10000),
      'it shows the laptop’s page, and its own untouched first page is gone');
    ok(await eventually(async () => (await devFiles(B.p)).some(n => /^21Board \(smartboard\) \[/.test(n))) && firstB === 'Page 1' && !/"(Page 1|My Board)"/.test(await fileText(B.p, (await devFiles(B.p)).find(n => /smartboard/.test(n)))),
      `the smartboard writes its own file, without the placeholder (its first page was “${firstB}”), and no file names it`);
    await deliver(B.p, A.p); await syncNow(A.p); await syncNow(B.p);
    ok(await sameBoards(A.p, B.p), 'both show the same board');
    await openSettings(A.p);
    ok(/Shared with the smartboard\. Last change at \d/.test(await A.p.locator('#set-link-status').innerText()), `the laptop’s status names the smartboard (“${await A.p.locator('#set-link-status').innerText()}”)`);
    await A.p.keyboard.press('Escape');
    // A fresh device set up before the laptop's file arrived: the board that arrives later is taken, and said.
    const Late = await dev('the reading corner');
    await openSettings(Late.p); await Late.p.click('#settings [data-act="link-setup"]'); await Late.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await Late.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    await Late.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await Late.p.keyboard.press('Escape');
    await hear(Late.p); await deliver(A.p, Late.p); await syncNow(Late.p);
    ok(await eventually(async () => { await syncNow(Late.p); return await Late.p.evaluate(() => window.__board21.state.board.name) === 'Morning' && Object.keys(await shownBoard(Late.p)).length === 1; }, 10000)
      && (await heard(Late.p)).includes('The board from the laptop is here.'), `the board that arrives after set-up is taken: “The board from the laptop is here.” (${(await heard(Late.p)).join(' | ')})`);
    await Late.c.close();
    // Two devices both called "a Chromebook": the last step says so under the name field, its text selected to type over.
    const D = await dev('a Chromebook'), F = await dev('a Chromebook');
    await addNote(D.p, 'Twins');
    await linkFolder(D.p);
    await deliver(D.p, F.p);
    await openSettings(F.p); await F.p.click('#settings [data-act="link-setup"]'); await F.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await F.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    const twin = await F.p.evaluate(() => { const f = document.querySelector('#modal.open input'), n = (f.getAttribute('aria-describedby') || '').split(/\s+/).includes('name-twin') ? document.getElementById('name-twin') : null; return { note: n ? n.textContent : '', selected: document.activeElement === f && f.selectionStart === 0 && f.selectionEnd === f.value.length, value: f.value }; });
    ok(twin.value === 'a Chromebook' && twin.selected && twin.note === 'Another device in this folder is called “a Chromebook” too.',
      `when another device in the folder has this device’s name, the last step says so under the field (read with it), its text selected even as the board it took is shown (“${twin.note}”; selected: ${twin.selected})`);
    await F.p.fill('#modal.open input', 'the reading corner'); await F.p.locator('#modal.open .btn', { hasText: 'Done' }).click();
    ok(await eventually(async () => (await devFiles(F.p)).some(n => n.startsWith('21Board (reading corner) ['))), 'and the name given there names its file');
    await D.c.close(); await F.c.close();

    // ---- 3. A device with its own pages joins: they are added after the board's. One page both have from one import,
    // changed on the laptop since: the laptop's values stay.
    await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Science' })); await A.p.waitForTimeout(800);
    const sci = await addNote(A.p, 'Science');
    fs.writeFileSync(OUT + 'shared-page.21board', JSON.stringify(await A.p.evaluate(() => window.__board21.buildExport('full'))));   // (the file both import)
    await fillNote(A.p.frameLocator(`.win[data-ikey="${sci}"] iframe`), 'Science, from the laptop'); await A.p.waitForTimeout(400);
    await syncNow(A.p);
    const G = await dev('the projector');
    await renamePage(G.p, 'Art'); await addNote(G.p, 'Art notes');
    await G.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Music' })); await G.p.waitForTimeout(800);
    await G.p.setInputFiles('#import-input', OUT + 'shared-page.21board'); await G.p.waitForTimeout(400);
    await G.p.locator('#modal.open .btn', { hasText: 'Open as a new page' }).click(); await G.p.waitForTimeout(1500);
    await fillNote(G.p.frameLocator('.win[data-ikey="notes:1"] iframe'), 'Science, from the projector'); await G.p.waitForTimeout(400);
    await deliver(A.p, G.p);
    await openSettings(G.p); await G.p.click('#settings [data-act="link-setup"]'); await G.p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
    await G.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    const lastG = await said(G.p);
    ok(/The 2-page board from the laptop is here\. This device’s 2 pages were added at the end\./.test(lastG), `a device with pages of its own: they are added after the board’s, and the last step names both counts (“${lastG}”)`);
    await G.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await G.p.waitForTimeout(800);
    await deliver(G.p, A.p); await syncNow(A.p); await deliver(A.p, G.p); await syncNow(G.p);
    const names = async p => Object.values(await shownBoard(p)).map(x => x.name).sort().join();
    ok(await names(A.p) === 'Art,Morning,Music,Science' && await names(G.p) === 'Art,Morning,Music,Science', `both end with every page (${await names(A.p)} / ${await names(G.p)})`);
    ok(/Science, from the laptop/.test(await notesText(G.p)) && /Science, from the laptop/.test(await notesText(A.p)), 'the page both had from one import keeps the folder’s values');
    ok(/Science, from the projector/.test(await notesText(A.p)) && /Science, from the projector/.test(await notesText(G.p)) && (await copiesOf(A.p)).length === 1, 'and the projector’s different note on it becomes a labelled copy on both');
    await G.c.close();

    // ---- 4. Two devices set up "first" before either file arrives: the union, no placeholder, one folder id.
    const H = await dev('the laptop'), K = await dev('the smartboard');
    await addNote(H.p, 'From H');
    await linkFolder(H.p); await linkFolder(K.p);
    await addNote(K.p, 'From K'); await syncNow(K.p);
    await deliver(H.p, K.p); await deliver(K.p, H.p);
    await syncNow(H.p); await syncNow(K.p); await deliver(H.p, K.p); await deliver(K.p, H.p); await syncNow(H.p); await syncNow(K.p);
    const ids = async p => JSON.parse(await fileText(p, await ownFile(p))).sync.folder;
    ok(await sameBoards(H.p, K.p) && /From H/.test(await notesText(K.p)) && /From K/.test(await notesText(H.p)), 'two devices set up first at once end with the union of their boards');
    ok(await ids(H.p) === await ids(K.p), 'with one folder id (the smaller one)');
    await H.c.close(); await K.c.close();

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: setting up this device’s name on the last step (Laptop, Smartboard, Desktop, typed, Enter, Escape or a tap outside, a name another device has, touch screens, the file renamed)', async (browser) => {
    const errors = [];
    // A device with 21Board's own guess at its name (no nameDevice): a laptop screen with no touch, unless opts say otherwise.
    const device = async (label, opts) => {
      const c = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 768 } }, opts)); await c.addInitScript(DRIVE_PICK); await c.addInitScript(CLOCK);
      const p = await c.newPage(); p.on('pageerror', e => errors.push(label + ': ' + e.message)); await p.goto(BASE); await boardUp(p); await syncWaits(p); return { c, p };
    };
    const lastStep = async p => {
      await openSettings(p); await p.click('#settings [data-act="link-setup"]'); await p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
      await p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    };
    const said = async p => (await p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    const field = p => p.locator('#modal.open input');
    const quick = p => p.getByRole('group', { name: 'Pick a name' });
    const pressed = async p => (await p.locator('#modal.open .name-quick [aria-pressed="true"]').allInnerTexts()).join(',');
    const keyOn = p => p.evaluate(() => { const a = document.activeElement; return a.tagName === 'INPUT' ? 'the field' : (a.textContent || a.tagName).trim(); });
    const label = p => p.evaluate(() => window.__board21.link.device().label);
    const devFiles = async p => Object.keys(await readFolder(p)).filter(n => /^21Board \(/.test(n)).sort();
    const status = async p => { await openSettings(p); const s = await p.locator('#set-link-status').innerText(); await p.keyboard.press('Escape'); return s; };
    // The line under the field saying another device has the name in it, as shown and read with the field (null: not
    // shown, and nothing hidden left for a screen reader to read with the field).
    const twinLine = p => p.evaluate(() => { const f = document.querySelector('#modal.open input'), n = (f.getAttribute('aria-describedby') || '').split(/\s+/).includes('name-twin') ? document.getElementById('name-twin') : null;
      return !n ? null : n.offsetParent ? n.textContent : n.textContent ? 'hidden, but read: ' + n.textContent : null; });
    // The card on the screen, top to bottom: the message, the field, the quick names, Done (and its edges).
    const layout = p => p.evaluate(() => { const r = s => document.querySelector('#modal.open ' + s).getBoundingClientRect(), c = r('.modal-card');
      return { order: [r('#modal-text').bottom <= r('input').top, r('input').bottom <= r('.name-quick').top, r('.name-quick').bottom <= r('.modal-actions').top], inside: c.top >= 0 && c.left >= 0 && c.bottom <= innerHeight && c.right <= innerWidth, h: Math.round(c.height) }; });

    // ---- A first set-up on a laptop (no touch screen): the field has 21Board's guess, with the keyboard and its text selected.
    const A = await device('laptop'), B = await device('smartboard', { viewport: { width: 1920, height: 1080 }, hasTouch: true });
    await addNote(A.p, 'Spelling words');
    await lastStep(A.p);
    ok(await label(A.p) === 'a computer' && await field(A.p).inputValue() === 'a computer' && (await said(A.p)).includes('This device’s name Shown on your other devices.'),
      `the last step always has “This device’s name”, filled in with 21Board’s guess (“${await field(A.p).inputValue()}”), and a hint under it`);
    const hintRead = await A.p.evaluate(() => { const f = document.querySelector('#modal.open input'), h = document.getElementById('name-hint'); return !!h && h.offsetParent !== null && (f.getAttribute('aria-describedby') || '').split(/\s+/)[0] === 'name-hint' && h.textContent === 'Shown on your other devices.' && h.getBoundingClientRect().top >= f.getBoundingClientRect().bottom; });
    ok(hintRead, 'the hint “Shown on your other devices.” is under the field, not in its label, and a screen reader reads it with the field');
    ok(await A.p.evaluate(() => { const f = document.querySelector('#modal.open input'); return document.activeElement === f && f.selectionStart === 0 && f.selectionEnd === f.value.length; }),
      'with no touch screen, the field has the keyboard, its text selected to type over');
    ok((await quick(A.p).getByRole('button').allInnerTexts()).join(',') === 'Laptop,Smartboard,Desktop' && await pressed(A.p) === '' && await twinLine(A.p) === null,
      'under it, a group of three buttons, Laptop, Smartboard and Desktop: none is pressed for “a computer” (and no other device has that name)');
    let look = await layout(A.p);
    ok(look.order.every(Boolean) && look.inside, `the message, then the field and its buttons, then Done, all on a 1366×768 screen (${look.h}px high)`);
    await quick(A.p).getByRole('button', { name: 'Laptop' }).click();
    ok(await field(A.p).inputValue() === 'the laptop' && await pressed(A.p) === 'Laptop', 'Laptop fills in “the laptop”, and only Laptop is pressed');
    await field(A.p).fill('Room 14 smartboard');
    ok(await pressed(A.p) === '', 'typing “Room 14 smartboard”: none is pressed');
    await field(A.p).fill('  The Desktop ');
    ok(await pressed(A.p) === 'Desktop', 'typing “ The Desktop ” presses Desktop (spaces and capitals don’t count)');
    await quick(A.p).getByRole('button', { name: 'Laptop' }).click();
    const oldA = await devFiles(A.p);   // (the first round wrote this device's file under the guess)
    await deliver(A.p, B.p);            // (Google Drive brings it to the smartboard before the laptop is renamed)
    await field(A.p).press('Enter');
    await A.p.waitForSelector('#modal', { state: 'hidden' });
    ok(await label(A.p) === 'the laptop', 'Enter in the field saves the name, as Done does');
    ok(oldA.length === 1 && /^21Board \(computer\) \[[0-9a-z]{4}\]\.21board$/.test(oldA[0]) && await eventually(async () => { await syncNow(A.p); const f = await devFiles(A.p); return f.length === 1 && f[0] === oldA[0].replace('(computer)', '(laptop)'); }, 15000),
      `at its next write, its file in the folder takes the new name, and none is left under the old one (${oldA.join()} → ${(await devFiles(A.p)).join()})`);
    ok(JSON.parse(await fileText(A.p, (await devFiles(A.p))[0])).sync.name === 'the laptop', 'the file says the new name inside too');

    // ---- A second device, a smartboard (touch screen, 1920 wide): its guess with Smartboard pressed, and no on-screen keyboard unasked.
    await lastStep(B.p);
    ok(await label(B.p) === 'the smartboard' && await field(B.p).inputValue() === 'the smartboard' && await pressed(B.p) === 'Smartboard', `a second device: the field has its guess, “the smartboard”, and Smartboard is pressed (${await pressed(B.p)})`);
    ok(await keyOn(B.p) === 'Done', `on a touch screen the field doesn’t take the keyboard by itself (the on-screen keyboard would pop up): Done has it (${await keyOn(B.p)})`);
    look = await layout(B.p);
    ok(look.order.every(Boolean) && look.inside, `it fits a 1920×1080 smartboard (${look.h}px high)`);
    ok((await said(B.p)).includes('The 1-page board from a computer is here.'), 'the laptop’s old file was all the smartboard had: “The 1-page board from a computer”');
    const ownB = (await devFiles(B.p)).filter(n => /\(smartboard\)/.test(n));   // (written by the first round, or not yet)
    await field(B.p).fill('Room 14 smartboard');
    ok(await pressed(B.p) === '', 'typing “Room 14 smartboard”: none is pressed');
    await B.p.locator('#modal.open .btn', { hasText: 'Done' }).click();
    ok(await label(B.p) === 'Room 14 smartboard', 'Done saves the name typed');
    ok(await eventually(async () => { await syncNow(B.p); const f = (await devFiles(B.p)).filter(n => !/\((computer|laptop)\)/.test(n)); return f.length === 1 && /^21Board \(Room 14 smartboard\) \[[0-9a-z]{4}\]\.21board$/.test(f[0]); }, 15000),
      `its file takes that name, and none is left under “smartboard” (${ownB.join() || 'none written yet'} → ${(await devFiles(B.p)).join()})`);
    // The laptop's renamed file reaches the smartboard; the old one is still there until Google Drive removes it.
    await deliver(A.p, B.p); await syncNow(B.p);
    let st = await status(B.p);
    ok(/Shared with the laptop\. Last change at \d/.test(st) && !/computer/.test(st), `the smartboard’s Settings › Board Sync names the laptop by its new name, once (“${st}”)`);
    await deliver(A.p, B.p, { removed: oldA }); await syncNow(B.p);
    ok(!(await devFiles(B.p)).includes(oldA[0]) && await B.p.evaluate(() => Array.from(window.__board21.link.files.keys()).filter(n => /^21Board \((computer|laptop)\)/.test(n)).length) === 1
      && await B.p.evaluate(() => { const L = window.__board21.link; return Object.values(L.names()).filter(n => n !== L.device().label).join(); }) === 'the laptop',
      'once Google Drive removes the old file, the laptop is one device there, called the laptop');
    // A change on the laptop: the smartboard says where it came from by the new name.
    await hear(B.p);
    await addNote(A.p, 'Homework'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await eventually(async () => (await heard(B.p)).includes('Updated from the laptop.')), `“Updated from the laptop.” (${(await heard(B.p)).join(' | ')})`);
    // And the smartboard's new name reaches the laptop.
    await deliver(B.p, A.p, { removed: ownB }); await syncNow(A.p);
    st = await status(A.p);
    ok(/Shared with Room 14 smartboard\. Last change at \d/.test(st), `the laptop’s Settings › Board Sync names the smartboard “Room 14 smartboard” (“${st}”)`);

    // ---- An iPad, upright then on its side: it fits both ways; a name another device has is said as it is picked or
    // typed; an empty field keeps the name it had.
    const C = await device('iPad', { viewport: { width: 768, height: 1024 }, hasTouch: true });
    await deliver(A.p, C.p);
    await lastStep(C.p);
    look = await layout(C.p);
    const upright = look.order.every(Boolean) && look.inside;
    await C.p.setViewportSize({ width: 1024, height: 768 }); await C.p.waitForTimeout(200);
    look = await layout(C.p);
    ok(upright && look.order.every(Boolean) && look.inside && await keyOn(C.p) === 'Done', `it fits an iPad upright and on its side (${look.h}px high), with the keyboard on Done`);
    // The laptop is "the laptop" here: picking or typing that name says so under the field, and a name of its own doesn't.
    ok(await twinLine(C.p) === null, `“a computer”: no other device here has that name, and nothing says so (${await twinLine(C.p)})`);
    await quick(C.p).getByRole('button', { name: 'Laptop' }).click();
    ok(await twinLine(C.p) === 'Another device in this folder is called “the laptop” too.', `tapping Laptop, while the laptop is “the laptop”: the step says so under the field, read with it (${await twinLine(C.p)})`);
    await field(C.p).fill('Room 14 laptop');
    ok(await twinLine(C.p) === null, `typing “Room 14 laptop”: the line goes (${await twinLine(C.p)})`);
    await field(C.p).fill('');
    await C.p.locator('#modal.open .btn', { hasText: 'Done' }).click();
    ok(await label(C.p) === 'a computer', 'Done with the field emptied keeps the name it had');
    // Change… on the laptop to Room 9, whose board is still arriving (Google Drive has only part of its file): the
    // devices of the folder it left aren't in this one, so a name of theirs isn't said under the field.
    await seedFolder(A.p, 'Room 9', { '21Board (desktop) [q7k2].21board': '{"format":"21board","sync":{"v":1,' });
    await A.p.evaluate(() => { window.__drive = { pick: 'Room 9' }; });
    await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
    await A.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    await field(A.p).fill('Room 14 smartboard');
    ok((await said(A.p)).includes('Google Drive is still bringing the board in this folder') && await twinLine(A.p) === null,
      `Change… to a folder whose board is still arriving: the smartboard’s name, typed, isn’t said to be another device’s there (${await twinLine(A.p)})`);
    await field(A.p).fill('the laptop'); await A.p.locator('#modal.open .btn', { hasText: 'Done' }).click();
    await A.c.close(); await B.c.close(); await C.c.close();

    // ---- Closing the step without Done (Escape, or a tap outside the card, the usual way to close one on a smartboard):
    // set-up is over either way, so the name in the field is kept.
    const D = await device('laptop 2');
    await lastStep(D.p);
    await quick(D.p).getByRole('button', { name: 'Laptop' }).click();
    await D.p.keyboard.press('Escape');
    await D.p.waitForSelector('#modal', { state: 'hidden' });
    ok(await label(D.p) === 'the laptop' && await D.p.inputValue('#set-link-label') === 'the laptop', `Laptop, then Escape: “the laptop” is kept, and Settings › Board Sync shows it (${await label(D.p)})`);
    await D.p.evaluate(() => { window.__drive = { pick: 'Room 9' }; });
    await openSettings(D.p); await D.p.click('#settings [data-act="link-choose"]');
    await D.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    ok(await field(D.p).inputValue() === 'the laptop' && await pressed(D.p) === 'Laptop', 'after Change…, the last step has the name the device has, with Laptop pressed');
    await quick(D.p).getByRole('button', { name: 'Smartboard' }).click();
    await D.p.mouse.click(8, 8);   // (outside the card)
    await D.p.waitForSelector('#modal', { state: 'hidden' });
    ok(await label(D.p) === 'the smartboard', `Smartboard, then a tap outside the card: “the smartboard” is kept (${await label(D.p)})`);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await D.c.close();
  }],
  ['Board Sync: linking again, Change…, Unlink, a lost ledger, Erase, kiosk (scenarios 5–12)', async (browser) => {
    const errors = [], DAY = 864e5;
    const said = async p => (await p.locator('#modal.open').count()) ? (await p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ') : '';
    const wins = async p => Object.values(await shownBoard(p)).reduce((n, pg) => n + Object.keys(pg.wins).length, 0);
    const setUpAgain = async p => {
      await openSettings(p); await p.click('#settings [data-act="link-setup"]'); await p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
      await p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
      const t = await said(p); await p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await p.keyboard.press('Escape'); return t;
    };
    const unlinkUI = async p => {
      await openSettings(p); await p.click('#settings [data-act="link-unlink"]');
      const t = await said(p); await p.locator('#modal.open .btn', { hasText: 'Unlink' }).click(); await p.waitForTimeout(800); await p.keyboard.press('Escape'); return t;
    };

    // ---- 5. Unlink the smartboard; on the laptop delete a window and fix a note; link the smartboard again.
    let A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const fix = await addNote(A.p, 'Spelling: becuase'), gone = await addNote(A.p, 'Delete me');
    const fixWid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, fix);
    // (the page with that window shown, and its window number there: switching boards and back gives pages new ids)
    const showWid = (p, w) => p.evaluate(async w => {
      const B = window.__board21, r = (await B.store.getAll()).find(x => /^inst:/.test(x.key) && x.value && x.value.wid === w), [, b, wg, n] = r.key.split(':');
      if (+b !== B.state.boardId) { await B.pages.go(+b); await new Promise(res => setTimeout(res, 800)); }
      return `${wg}:${n}`;
    }, w);
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    ok(await sameBoards(A.p, B.p) && await wins(B.p) === 2, 'the laptop and the smartboard show the same board');
    const unlinkSaid = await unlinkUI(B.p);
    ok(/Unlink the “21Board” folder\? This device keeps its board but stops syncing\. Your other devices and the folder keep theirs\. Unlink Cancel/.test(unlinkSaid), `Unlink asks first, and says what stays (“${unlinkSaid}”)`);
    const left = await ownJSON(B.p);
    ok(!!left && left.sync.left && left.sync.left.at > 0 && !left.sync.left.erased && await B.p.evaluate(() => !window.__board21.link.dir) && await wins(B.p) === 2,
      'Unlink writes the smartboard’s file once more, saying it left; the board stays on the smartboard');
    await A.p.evaluate(ik => window.__board21.deleteInstance(ik), gone);
    await fillNote(A.p.frameLocator(`.win[data-ikey="${fix}"] iframe`), 'Spelling: because'); await A.p.waitForTimeout(400);
    await deliver(B.p, A.p); await syncNow(A.p);
    ok(await wins(A.p) === 1, 'the laptop keeps its own changes meanwhile');
    await deliver(A.p, B.p);
    const again = await setUpAgain(B.p);
    ok(again.includes('This device syncs again. Changes made here while it was unlinked are added to the board.'), `linking the same folder again carries on (“${again}”)`);
    ok(await eventually(async () => await wins(B.p) === 1 && /Spelling: because/.test(await notesText(B.p))), 'the window deleted on the laptop stays deleted, and the fix shows on the smartboard, with no copy');
    ok(await eventually(async () => { const j = await ownJSON(B.p); return j && !j.sync.left; }), 'the smartboard’s next write says it is back');
    await deliver(B.p, A.p); await syncNow(A.p);
    ok(await A.p.evaluate(() => { const p = Object.values(window.__board21.link.sync.peers)[0]; return !!p && !p.left; }) && await sameBoards(A.p, B.p), 'and the laptop merges it at once');

    // ---- 6. Unlink the smartboard, delete two pages and edit a note on it, link it again: the pages come back.
    for (const n of ['Math', 'Art']) { await A.p.evaluate(n => window.__board21.pages.create({ end: true, name: n }), n); await A.p.waitForTimeout(700); }
    await A.p.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0])); await A.p.waitForTimeout(800);
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
    ok(Object.keys(await shownBoard(B.p)).length === 3, 'the smartboard has the three pages');
    await unlinkUI(B.p);
    await B.p.evaluate(async () => { const P = window.__board21.pages, drop = P.ids().slice(1); P.drop(drop); await P.purge(drop); }); await B.p.waitForTimeout(500);
    await fillNote(B.p.frameLocator(`.win[data-ikey="${fix}"] iframe`), 'Edited while unlinked'); await B.p.waitForTimeout(400);
    ok(Object.keys(await shownBoard(B.p)).length === 1, 'two pages deleted on the smartboard while it was unlinked');
    await setUpAgain(B.p);
    ok(await eventually(async () => Object.keys(await shownBoard(B.p)).length === 3), 'linked again, the pages it deleted meanwhile are back (nothing deleted elsewhere because of how it looked while it wasn’t syncing)');
    await deliver(B.p, A.p); await syncNow(A.p);
    ok(Object.keys(await shownBoard(A.p)).length === 3 && /Edited while unlinked/.test(await notesText(A.p)), 'the laptop still has them, and gets the edit made while unlinked');

    // ---- 7. Unlinked for 70 days: the laptop removes the smartboard's file only after 60 days; a window deleted
    // meanwhile stays deleted when it links again.
    const del2 = await addNote(A.p, 'Deleted later'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
    const bName = await ownFile(B.p);
    await unlinkUI(B.p);
    await deliver(B.p, A.p); await syncNow(A.p);
    await A.p.evaluate(ik => window.__board21.deleteInstance(ik), del2); await syncNow(A.p);
    await setClock(A.p, 59 * DAY); await syncNow(A.p);
    ok(!!await fileText(A.p, bName), 'after 59 days the laptop still keeps the unlinked smartboard’s file');
    // (only the file as it was read: here it is written again, unchanged, after each round has read the folder and
    // before it tidies, as when Drive brings the file of a device that linked again just then)
    await A.p.evaluate(name => {
      const L = window.__board21.link, real = L.daily;
      window.__daily = { real, n: 0 };
      L.daily = async function (r) {
        const h = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board')).getFileHandle(name), was = await h.getFile(), text = await was.text();
        do { const w = await h.createWritable(); await w.write(text); await w.close(); } while ((await h.getFile()).lastModified === was.lastModified);   // (until its date changes)
        window.__daily.n++;
        return real.call(this, r);
      };
    }, bName);
    await setClock(A.p, 61 * DAY); await syncNow(A.p);
    ok(await A.p.evaluate(() => window.__daily.n > 0) && !!await fileText(A.p, bName), 'after 60 days, a round keeps it if it was written again after that round read the folder');
    await A.p.evaluate(() => { window.__board21.link.daily = window.__daily.real; }); await syncNow(A.p);
    ok(await eventually(async () => !await fileText(A.p, bName)), 'after 60 days it removes it (the smartboard had left, and everything in it is in the laptop’s board)');
    await setClock(B.p, 70 * DAY);
    await deliver(A.p, B.p, { removed: [bName] });
    await setUpAgain(B.p);
    ok(await eventually(async () => !/Deleted later/.test(await notesText(B.p))) && await eventually(async () => !!await ownFile(B.p) && !!await fileText(B.p, await ownFile(B.p))),
      'linked again after 70 days, the window deleted meanwhile stays deleted, and the smartboard writes its file again');
    await setClock(A.p, 0); await setClock(B.p, 0);

    // ---- 8. Change… to a folder with another board, then back.
    const C = await syncDev(browser, 'the Room 14 laptop', errors);
    await renamePage(C.p, 'Room 14'); await addNote(C.p, 'Room 14 plans');
    await C.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; }); await linkFolder(C.p);
    const room14 = await C.p.evaluate(async () => { let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Room 14'); const o = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file') o[n] = await (await h.getFile()).text(); return o; });
    await seedFolder(A.p, 'Room 14', room14);
    const before = JSON.stringify(sorted(await shownBoard(A.p)));
    await A.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; });
    await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
    await A.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
    const switched = await said(A.p);
    ok(switched.includes('The 1-page board from the Room 14 laptop is here. This device’s other pages are still in your “21Board” folder. They’re also in Board history › Deleted pages for 30 days.'), `Change… to a folder with another board switches to that board (“${switched}”)`);
    await A.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await A.p.keyboard.press('Escape');
    ok(await eventually(async () => { const b = await shownBoard(A.p); return Object.keys(b).length === 1 && Object.values(b)[0].name === 'Room 14' && /Room 14 plans/.test(await notesText(A.p)); }, 15000),
      'the laptop shows the Room 14 board: its own pages are deleted here only');
    ok(Object.keys(await shownBoard(B.p)).length === 3, 'the smartboard (in the first folder) loses nothing');
    const r14 = await A.p.evaluate(async () => { let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Room 14'); const o = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file') o[n] = await (await h.getFile()).text(); return o; });
    await seedFolder(C.p, 'Room 14', r14); await syncNow(C.p);
    ok(Object.keys(await shownBoard(C.p)).length === 1 && /Room 14 plans/.test(await notesText(C.p)), 'and the Room 14 laptop loses nothing, nor gets the laptop’s pages');
    await A.p.evaluate(() => { window.__drive = { pick: '21Board' }; });
    await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
    // (Its pages there were deleted here less than 20 seconds ago: while their Undo is offered the switch waits, and
    // then the folder's come back.)
    await A.p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 40000 });
    await A.p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await A.p.keyboard.press('Escape');
    ok(await eventually(async () => JSON.stringify(sorted(await shownBoard(A.p))) === before, 20000), 'back in the first folder, the laptop shows its board again');
    await deliver(A.p, B.p); await syncNow(B.p);
    ok(await sameBoards(A.p, B.p) && Object.keys(await shownBoard(B.p)).length === 3, 'and nothing is deleted on the smartboard or added to it');
    await C.c.close();

    // ---- 9. Summer: a third device unused for 75 days while the laptop deletes a page.
    const D = await syncDev(browser, 'the cart Chromebook', errors);
    await deliver(A.p, D.p); await deliver(B.p, D.p); await linkFolder(D.p); await exchange(A, B, D);
    ok(await sameBoards(A.p, D.p), 'a third device joins');
    const dName = await ownFile(D.p);
    await setClock(A.p, 75 * DAY);
    const art = await A.p.evaluate(() => { const P = window.__board21.pages, b = P.ids()[2]; return { b, uid: P.info.get(b).uid }; });
    await A.p.evaluate(async b => { const P = window.__board21.pages; P.drop([b]); await P.purge([b]); }, art.b); await syncNow(A.p); await syncNow(A.p);
    const aj = await ownJSON(A.p);
    ok(!!await fileText(A.p, dName) && aj.sync.gone.pages.some(t => t.uid === art.uid), 'the third device’s file isn’t removed, and the laptop’s file keeps the deletion');
    await setClock(D.p, 75 * DAY); await deliver(A.p, D.p); await syncNow(D.p);
    ok(!(await shownBoard(D.p))[art.uid], 'when the third device opens, the page stays deleted');
    await deliver(D.p, A.p); await deliver(D.p, B.p); await deliver(A.p, B.p); await syncNow(B.p); await syncNow(A.p);
    ok(!(await shownBoard(B.p))[art.uid] && !(await shownBoard(A.p))[art.uid], 'everywhere');
    await deliver(B.p, A.p);   // (the smartboard's file, with the deletion)
    await setClock(A.p, 106 * DAY); await syncNow(A.p); await syncNow(A.p);   // (the daily tidying runs after a round's write: the next one writes without it)
    ok(!(await ownJSON(A.p)).sync.gone.pages.some(t => t.uid === art.uid), '30 days after every device’s file shows the deletion, the laptop drops it');
    for (const x of [A, D]) await setClock(x.p, 0);
    await D.c.close();

    // ---- 10. A lost ledger on the smartboard: rebuilt from its own file. No copies, nothing lost, nothing deleted.
    await exchange(A, B);
    const n10 = await wins(A.p);
    await fillNote(A.p.frameLocator(`.win[data-ikey="${await showWid(A.p, fixWid)}"] iframe`), 'Changed on the laptop meanwhile'); await A.p.waitForTimeout(400); await syncNow(A.p);
    await loseLedger(B.p);
    await deliver(A.p, B.p); await syncNow(B.p);
    ok(await B.p.evaluate(() => !!window.__board21.link.sync && !window.__board21.link.sync.mode), 'the smartboard rebuilds its ledger from its own file');
    await deliver(B.p, A.p); await syncNow(A.p);
    ok(await wins(A.p) === n10 && await wins(B.p) === n10 && /Changed on the laptop meanwhile/.test(await notesText(B.p)) && await sameBoards(A.p, B.p), 'no copies, nothing lost on either, and nothing deleted on the laptop');

    // ---- 11. Erase on the smartboard: the laptop's board is untouched; its file says it was erased; removed after 60 days.
    const eName = await ownFile(B.p);
    await openSettings(B.p, ['advanced']); await B.p.click('#settings [data-act="erase"]');
    const erase = await said(B.p);
    ok(/This device also stops syncing\. The board stays in your folder and on your other devices\./.test(erase), 'Erase everything says this device stops syncing, and where the board stays');
    await B.p.locator('#modal.open .btn', { hasText: /^Erase everything$/ }).click(); await B.p.waitForTimeout(2500);
    const ej = JSON.parse(await fileText(B.p, eName));
    ok(!!ej.sync.left && ej.sync.left.erased === true && await B.p.evaluate(() => !window.__board21.link.dir && !window.__board21.link.st.device), 'its last write says it was erased, and the smartboard forgets the folder and its id');
    const kept = JSON.stringify(sorted(await shownBoard(A.p)));
    await deliver(B.p, A.p, { files: [eName] }); await syncNow(A.p);
    ok(JSON.stringify(sorted(await shownBoard(A.p))) === kept, 'the laptop’s board is untouched');
    await setClock(A.p, 61 * DAY); await syncNow(A.p);
    ok(await eventually(async () => !await fileText(A.p, eName)), 'and the laptop removes the erased device’s file after 60 days');
    await setClock(A.p, 0);

    // ---- 12. Kiosk and the widget dev window: no Board Sync.
    const K = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await K.addInitScript(DRIVE_PICK);
    const kp = await K.newPage(); await kp.goto(BASE + '?kiosk=yes'); await boardUp(kp);
    await openSettings(kp);
    ok(await kp.evaluate(() => !window.__board21.link.supported) && await kp.locator('#settings [data-act^="link-"]').count() === 0, 'kiosk mode has no Board Sync');
    await kp.goto(BASE + 'sdk/lab.html'); await kp.waitForTimeout(400);
    await kp.click('#sample'); await kp.click('#run'); await kp.waitForTimeout(3000);
    const lab = kp.mainFrame().childFrames()[0];
    ok(!!lab && await lab.evaluate(() => !!document.querySelector('.picker-btn.left') && !document.querySelector('.folder-note:not([hidden])')) && await lab.evaluate(() => { document.querySelector('.picker-btn.left').click(); document.querySelector('[data-ctl="settings"]').click(); return new Promise(r => setTimeout(() => r(!document.querySelector('#settings [data-act^="link-"]')), 800)); }),
      'nor has the widget dev window’s test board');
    await K.close();

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: merging (scenarios 14, 15, 24–30: different windows, a move and typing, page order, names and colors, new windows, scale, three devices)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const n1 = await addNote(A.p, 'One'), n2 = await addNote(A.p, 'Two');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const wid = async (p, ik) => p.evaluate(ik => { const i = window.__board21.state.insts.get(ik); return i.wid || `${i.widgetId}@${i.createdAt}`; }, ik);
    const ikOf = async (p, w) => p.evaluate(w => { for (const [k, i] of window.__board21.state.insts) if ((i.wid || `${i.widgetId}@${i.createdAt}`) === w) return k; return null; }, w);
    const wins = async p => Object.values(await shownBoard(p)).reduce((n, pg) => n + Object.keys(pg.wins).length, 0);
    const w1 = await wid(A.p, n1), w2 = await wid(A.p, n2);
    ok(await sameBoards(A.p, B.p) && await wins(B.p) === 2, 'the smartboard has the laptop’s two notes');

    // ---- 14. Different windows on one page changed on both: both kept, no copies.
    await typeNote(A.p, n1, 'One, laptop');
    await typeNote(B.p, await ikOf(B.p, w2), 'Two, smartboard');   // (typeNote waits until the window is no longer busy: see Link.waits.busy)
    await exchange(A, B);
    ok(await sameBoards(A.p, B.p) && await wins(A.p) === 2 && /One, laptop/.test(await notesText(B.p)) && /Two, smartboard/.test(await notesText(A.p)), 'different windows changed on both: both changes kept, no copies');

    // ---- 15. One window moved on the laptop and typed in on the smartboard: both apply, no copy.
    const r1 = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).rect, n1);
    await A.p.evaluate(([ik, r]) => window.__board21.setRect(ik, Object.assign({}, r, { x: r.x + 200, y: r.y + 60 })), [n1, r1]); await A.p.waitForTimeout(300);
    await typeNote(B.p, await ikOf(B.p, w1), 'One, typed on the smartboard');
    await exchange(A, B);
    const rB = await B.p.evaluate(ik => window.__board21.state.insts.get(ik).rect, await ikOf(B.p, w1));
    ok(await sameBoards(A.p, B.p) && await wins(B.p) === 2 && Math.round(rB.x) === Math.round(r1.x + 200) && /One, typed on the smartboard/.test(await notesText(A.p)), 'a window moved on one device and typed in on the other: both apply, no copy');

    // ---- 25, 26. Names and colors.
    await renamePage(A.p, 'Laptop name'); await A.p.waitForTimeout(200);
    await renamePage(B.p, 'Smartboard name');   // (the later one)
    await syncNow(A.p); await syncNow(B.p);   // (each in its own device's file before either reaches the other)
    await hear(A.p);
    await exchange(A, B);
    const nm = async p => Object.values(await shownBoard(p))[0].name;
    ok(await nm(A.p) === 'Smartboard name' && await nm(B.p) === 'Smartboard name', `the same page renamed on both: the later name on both (“${await nm(A.p)}”)`);
    ok((await heard(A.p)).includes('This page was also renamed on the smartboard. It’s called “Smartboard name” now.'), `the laptop says the page was also renamed, with its new name (${(await heard(A.p)).join(' | ')})`);
    ok(await A.p.evaluate(() => window.__board21.history.metas.some(m => m.name === 'Laptop name' && /Before changes from the smartboard/.test(m.label))), 'and Board history keeps a version with the other name');
    await renamePage(A.p, 'Morning');
    await B.p.evaluate(() => window.__board21.updateBoard({ background: { color: '#dbeafe', pattern: 'none' } })); await B.p.waitForTimeout(300);
    await exchange(A, B);
    const pg = async p => Object.values(await shownBoard(p))[0];
    ok((await pg(A.p)).name === 'Morning' && (await pg(A.p)).color === '#dbeafe' && await sameBoards(A.p, B.p), 'a rename on the laptop and a background color on the smartboard: both apply');

    // ---- 27. A new Timer on both on one page: two Timers on both, each with its own content.
    for (const [p, s] of [[A.p, 300], [B.p, 120]]) await p.evaluate(async s => { window.__board21.openWidget('timer'); await new Promise(r => setTimeout(r, 900)); }, s);
    await exchange(A, B);
    const timers = async p => Object.values(await pg(p)).length && Object.values((await pg(p)).wins).filter(w => w.widgetId === 'timer').length;
    ok(await timers(A.p) === 2 && await timers(B.p) === 2 && await sameBoards(A.p, B.p), 'a new Timer on both: two Timers on both');

    // ---- 28. 21Sketch opened on both: one window open after the merge.
    for (const p of [A.p, B.p]) await p.evaluate(async () => { window.__board21.openWidget('21sketch'); await new Promise(r => setTimeout(r, 600)); });
    await exchange(A, B);
    const sketches = async p => Object.values((await pg(p)).wins).filter(w => w.widgetId === '21sketch' && w.open).length;
    ok(await sketches(A.p) === 1 && await sketches(B.p) === 1, '21Sketch opened on both: one window open after the merge');

    // ---- 29. A scale change on the laptop and a move on the smartboard: the window moved is where it was put, in the
    // laptop's scale, and the others are rescaled, not moved.
    const before = await shownBoard(B.p);
    await A.p.evaluate(() => window.__board21.setBoardScale(1.25)); await A.p.waitForTimeout(400);
    const k2 = await ikOf(B.p, w2), r2 = await B.p.evaluate(ik => window.__board21.state.insts.get(ik).rect, k2);
    await B.p.evaluate(([ik, r]) => window.__board21.setRect(ik, Object.assign({}, r, { x: r.x + 100 })), [k2, r2]); await B.p.waitForTimeout(300);
    const moved = await shownBoard(B.p);
    await exchange(A, B);
    const after = await shownBoard(A.p), u = Object.keys(after)[0];
    ok(after[u].scale === 1.25 && (await shownBoard(B.p))[u].scale === 1.25 && await sameBoards(A.p, B.p), 'the laptop’s new scale reaches the smartboard');
    const near = (a, b) => a.split(',').map(Number).every((v, i) => Math.abs(v - b.split(',').map(Number)[i]) <= 2);
    ok(near(after[u].wins[w2].rect, moved[u].wins[w2].rect) && near(after[u].wins[w1].rect, before[u].wins[w1].rect),
      `the window moved on the smartboard is where it was put, in the laptop’s scale, and the untouched one is only rescaled (${after[u].wins[w2].rect} / ${moved[u].wins[w2].rect})`);

    // ---- 24. Page order: moves of different pages both apply; pages added at one spot on both, one order.
    for (const n of ['Two', 'Three', 'Four']) { await A.p.evaluate(n => window.__board21.pages.create({ end: true, name: n }), n); await A.p.waitForTimeout(600); }
    await exchange(A, B);
    const order = p => p.evaluate(() => window.__board21.pages.ids().map(b => window.__board21.pages.name(b)).join(','));
    ok(Object.keys(await shownBoard(B.p)).length === 4, 'four pages on both');
    await A.p.evaluate(async () => { const P = window.__board21.pages; await P.go(P.ids()[1]); P.move(1); });
    await B.p.evaluate(async () => { const P = window.__board21.pages; await P.go(P.ids()[3]); P.move(-1); });
    for (const p of [A.p, B.p]) { await p.evaluate(() => window.__board21.pages.create({ end: true, name: 'New ' + window.__board21.link.device().label })); await p.waitForTimeout(600); }
    await exchange(A, B);
    ok(Object.keys(await shownBoard(A.p)).length === 6 && await sameBoards(A.p, B.p), 'pages added at the end on both: both pages, on both');
    // (Two goes between Three and Four, Four between Two and Three: each page's place, pos, is the later move's)
    ok(await order(A.p) === await order(B.p) && /^Morning,Four,Three,Two,/.test(await order(A.p)), `moves of different pages both apply, and both devices have one order (${await order(A.p)} / ${await order(B.p)})`);

    // ---- 30. Three devices with deliveries in different orders: identical boards.
    const C = await syncDev(browser, 'the cart Chromebook', errors);
    await deliver(A.p, C.p); await deliver(B.p, C.p); await linkFolder(C.p); await exchange(A, B, C);
    await A.p.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0])); await B.p.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0])); await C.p.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0]));
    await A.p.waitForTimeout(800);
    await A.p.evaluate(() => window.__board21.updateBoard({ background: { color: '#fde68a', pattern: 'none' } })); await addNote(B.p, 'New on B'); await renamePage(C.p, 'Renamed on C');
    for (const p of [A.p, B.p, C.p]) await syncNow(p);
    await deliver(A.p, C.p); await syncNow(C.p); await deliver(C.p, B.p); await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
    await deliver(B.p, C.p); await deliver(C.p, A.p); await syncNow(A.p); await syncNow(C.p); await deliver(A.p, B.p); await syncNow(B.p);
    await exchange(C, B, A);
    ok(await sameBoards(A.p, B.p, C.p) && Object.values(await shownBoard(C.p)).some(x => x.color === '#fde68a') && /New on B/.test(await notesText(A.p)) && Object.values(await shownBoard(B.p)).some(x => x.name === 'Renamed on C'),
      'three devices, files delivered in different orders: the same board on all three, with every change');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close(); await C.c.close();
  }],
  ['Board Sync: Google Drive misbehaving (scenarios 32–38: offline for days, clocks, half files, old revisions, conflict copies, this device’s own file, a copied profile)', async (browser) => {
    const errors = [], DAY = 864e5, H = 36e5;
    const ikOf = async (p, w) => p.evaluate(w => { for (const [k, i] of window.__board21.state.insts) if ((i.wid || `${i.widgetId}@${i.createdAt}`) === w) return k; return null; }, w);
    const widOf = async (p, ik) => p.evaluate(ik => { const i = window.__board21.state.insts.get(ik); return i.wid || `${i.widgetId}@${i.createdAt}`; }, ik);
    const type = async (p, w, text) => typeNote(p, await ikOf(p, w), text);
    const wins = async p => Object.values(await shownBoard(p)).reduce((n, pg) => n + Object.keys(pg.wins).length, 0);
    const status = p => p.evaluate(() => window.__board21.link.status());
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const w1 = await widOf(A.p, await addNote(A.p, 'One')), w2 = await widOf(A.p, await addNote(A.p, 'Two'));
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const name = await ownFile(A.p);

    // ---- 32. Offline for days: the smartboard's clock 3 days behind, edits on both, then delivery both ways.
    await setClock(B.p, -3 * DAY);
    await type(B.p, w2, 'Two, on the smartboard offline'); await syncNow(B.p);
    await type(A.p, w1, 'One, on the laptop'); await syncNow(A.p);
    await exchange(A, B);
    ok(await sameBoards(A.p, B.p) && /Two, on the smartboard offline/.test(await notesText(A.p)) && /One, on the laptop/.test(await notesText(B.p)), 'a device offline with its clock 3 days behind: every edit is kept, the same on both');
    await setClock(B.p, 0);

    // ---- 33. Clocks disagree: the smartboard an hour ahead. A window moved on both ends in one place on both.
    await setClock(B.p, H);
    const mv = async (p, dx) => { const ik = await ikOf(p, w1); await p.evaluate(([ik, dx]) => { const r = window.__board21.state.insts.get(ik).rect; window.__board21.setRect(ik, Object.assign({}, r, { x: 40 + dx })); }, [ik, dx]); await p.waitForTimeout(300); await syncNow(p); };
    await mv(A.p, 100); await mv(B.p, 300);
    await exchange(A, B);
    ok(await sameBoards(A.p, B.p) && await wins(A.p) === 2, `a window moved on both with clocks an hour apart: the same place on both, and nothing lost (${await wins(A.p)} windows)`);
    await setClock(B.p, 0);
    // A device a year ahead: the smartboard believes its counters at most a day ahead of its own clock.
    const C = await syncDev(browser, 'the clock-wrong Chromebook', errors);
    await setClock(C.p, 365 * DAY);
    await deliver(A.p, C.p); await linkFolder(C.p); await addNote(C.p, 'From a year ahead'); await C.p.waitForTimeout(1000); await syncNow(C.p);
    await deliver(C.p, B.p); await syncNow(B.p);
    const ms = await B.p.evaluate(() => ({ seen: window.__board21.link.sync.maxSeen, now: Date.now() }));
    ok(/From a year ahead/.test(await notesText(B.p)) && ms.seen <= ms.now + DAY + 5000, `a device a year ahead: its change arrives, and the smartboard’s counters stay within a day of its clock (${Math.round((ms.seen - ms.now) / H)} h ahead)`);
    // (a clash with it: its version, a year ahead, is the later and stays in the window; the smartboard's copy is
    // labelled with the smartboard's own time for its version, not the counter or the other device's clock)
    const wy = (await winList(B.p)).find(x => x.data && x.data.text === 'From a year ahead').wid;
    const put = async (p, text) => { const x = (await winList(p)).find(y => y.wid === wy); await p.evaluate(([b, ik, text]) => window.__board21.writer.put(`data:${b}:${ik}`, 'data', { text }), [x.b, x.ikey, text]); await p.waitForTimeout(1000); };
    await put(C.p, 'From a year ahead, edited there'); await syncNow(C.p);
    await put(B.p, 'From a year ahead, edited on the smartboard'); await syncNow(B.p);
    await deliver(C.p, B.p); await syncNow(B.p);
    const cpy = (await copiesOf(B.p)).find(x => x.copyOf.wid === wy), nowB = await B.p.evaluate(() => Date.now());
    ok(!!cpy && cpy.data.text === 'From a year ahead, edited on the smartboard' && Math.abs(cpy.copyOf.at - nowB) < 5 * 60e3,
      `a copy label shows its version’s own time (${cpy ? Math.round((cpy.copyOf.at - nowB) / 1000) + ' s from now' : 'no copy'})`);
    await C.c.close();
    await exchange(A, B);

    // ---- 34. A half file (cut, then old and new mixed): ignored silently; after a while the status says it is
    // waiting; the whole file then merges, also when Drive completes it with the same size and date.
    await type(A.p, w1, 'One, the whole of it'); await syncNow(A.p);
    const toasts = () => B.p.locator('.toast').count(), t0 = await toasts();
    await deliver(A.p, B.p, { cut: 0.5 }); await syncNow(B.p);
    ok(!/the whole of it/.test(await notesText(B.p)) && await toasts() === t0, 'a file cut in half is ignored, and nothing is said');
    await B.p.waitForTimeout(2800); await syncNow(B.p);
    ok(/Waiting for Google Drive to bring the laptop’s latest changes\./.test(await status(B.p)), `once it has been arriving for a while, the status says so (“${await status(B.p)}”)`);
    await deliver(A.p, B.p, { mix: true }); await syncNow(B.p);
    ok(!/the whole of it/.test(await notesText(B.p)), 'a file mixing the new start with the old end (it parses) fails its checksum, and is ignored');
    await deliver(A.p, B.p, { sameStamp: true });
    ok(await eventually(async () => { await syncNow(B.p); return /the whole of it/.test(await notesText(B.p)); }), 'the whole file merges, even when Drive completes it with the same size and date');
    ok(!/Waiting for Google Drive/.test(await status(B.p)), 'and the status no longer says it is waiting');
    await B.p.evaluate(() => { window.__drive = {}; });

    // ---- 35. An older revision of the laptop's file arriving after a newer one: ignored.
    const v1 = await fileText(A.p, name);
    await type(A.p, w1, 'One, newer'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    await putText(B.p, name, v1); await syncNow(B.p);
    ok(/One, newer/.test(await notesText(B.p)) && !/the whole of it/.test(await notesText(B.p)), 'an older revision of the laptop’s file, arriving after a newer one, is ignored');
    await deliver(A.p, B.p);

    // ---- 36. Conflict copies of the laptop's file (older and newer) in both folders: merged once, no duplicates.
    const copy = name.replace(/\.21board$/, ' (1).21board'), old = await fileText(A.p, name);
    const n36 = await wins(B.p);
    await type(A.p, w2, 'Two, newest'); await syncNow(A.p);
    await putText(A.p, copy, old); await putText(B.p, copy, old); await deliver(A.p, B.p, { as: copy.replace(' (1)', ' (2)') });
    await syncNow(B.p);
    ok(/Two, newest/.test(await notesText(B.p)) && await wins(B.p) === n36, 'an older and a newer conflict copy: the newer one merges, once, with no duplicate windows');
    await syncNow(A.p);
    ok(await eventually(async () => { await syncNow(A.p); return !await fileText(A.p, copy); }), 'the laptop deletes its own conflict copy once everything in it is in its board');
    await deliver(A.p, B.p); await syncNow(B.p);
    ok(!!await fileText(B.p, copy), 'the smartboard never deletes the laptop’s files');

    // ---- 37. The laptop's own file replaced by an older one, or deleted: written again at its next look.
    const now1 = JSON.parse(await fileText(A.p, name)).sync.seq;
    await putText(A.p, name, v1);
    await A.p.evaluate(() => window.__board21.link.check(true));
    ok(await eventually(async () => { const j = JSON.parse(await fileText(A.p, name)); return j.sync.seq > now1; }), 'Drive puts back an older copy of the laptop’s file: it writes it again at its next look');
    await putText(A.p, name, null);
    await A.p.evaluate(() => window.__board21.link.check(true));
    ok(await eventually(async () => !!await fileText(A.p, name)), 'deleted: written again too');

    // ---- 38. The same device id on two installs (the laptop's profile copied): both take a new id; nothing is lost.
    const recs = await A.p.evaluate(() => window.__board21.store.getAll());
    const D = await syncDev(browser, 'unused', errors);
    await D.p.evaluate(recs => window.__board21.store.tx('readwrite', s => { for (const r of recs) s.put(r); }), recs);
    await D.p.reload(); await boardUp(D.p); await syncWaits(D.p);
    await deliver(A.p, D.p); await linkFolder(D.p);
    const devA = await A.p.evaluate(() => window.__board21.link.dev());
    ok(await D.p.evaluate(() => window.__board21.link.dev()) === devA, 'a copy of the laptop’s profile has the laptop’s device id');
    await type(D.p, w2, 'Two, on the copy'); await syncNow(D.p);
    await type(A.p, w1, 'One, on the laptop again'); await syncNow(A.p);
    await deliver(D.p, A.p, { files: [name], as: copy }); await deliver(A.p, D.p, { files: [name], as: copy });
    await syncNow(A.p); await syncNow(D.p);
    const ids = await Promise.all([A.p, D.p].map(p => p.evaluate(() => window.__board21.link.dev())));
    ok(ids[0] !== devA && ids[1] !== devA && ids[0] !== ids[1], 'each install finds a file with its id that it didn’t write, and takes a new id');
    await exchange(A, D);
    ok(await sameBoards(A.p, D.p) && /Two, on the copy/.test(await notesText(A.p)) && /One, on the laptop again/.test(await notesText(D.p)), 'nothing is lost: both edits are on both');
    // A crash between the write and its note doesn't fork: the write id was noted first.
    const devNow = await A.p.evaluate(() => window.__board21.link.dev());
    await A.p.evaluate(() => window.__board21.store.tx('readwrite', s => { const g = s.get('link:sync'); g.onsuccess = () => { const r = g.result; delete r.value.partsH; delete r.value.wroteAt; r.value.file = null; s.put(r); }; }));
    await A.p.evaluate(() => { window.__board21.link.sync = null; }); await syncNow(A.p);
    ok(await A.p.evaluate(() => window.__board21.link.dev()) === devNow, 'the laptop writing its file but closing before noting it doesn’t take its own file for another install’s');
    await D.c.close();

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: writing only when needed, a read that hangs, Photos (1), a newer 21Board (scenarios 39–42)', async (browser) => {
    const errors = [];
    const ikOf = async (p, w) => p.evaluate(w => { for (const [k, i] of window.__board21.state.insts) if ((i.wid || `${i.widgetId}@${i.createdAt}`) === w) return k; return null; }, w);
    const widOf = async (p, ik) => p.evaluate(ik => { const i = window.__board21.state.insts.get(ik); return i.wid || `${i.widgetId}@${i.createdAt}`; }, ik);
    const seqOf = async p => { const j = await ownJSON(p); return j ? j.sync.seq : 0; };
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const w1 = await widOf(A.p, await addNote(A.p, 'One')), w2 = await widOf(A.p, await addNote(A.p, 'Two'));
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);

    // ---- 39. Nothing changing: no writes. Moving windows for a while: at most one write per LINK_GAP_MS.
    const s0 = [await seqOf(A.p), await seqOf(B.p)];
    for (let i = 0; i < 4; i++) { await exchange(A, B); await A.p.waitForTimeout(1500); }
    ok(await seqOf(A.p) === s0[0] && await seqOf(B.p) === s0[1], 'two devices looking at each other’s files with nothing changing write nothing (no ping-pong)');
    await syncWaits(A.p, { gap: 2000 });
    const seqs = new Set(), k1 = await ikOf(A.p, w1), t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      await A.p.evaluate(([ik, i]) => { const r = window.__board21.state.insts.get(ik).rect; window.__board21.setRect(ik, Object.assign({}, r, { x: 40 + (i % 10) * 20 })); }, [k1, i]);
      await A.p.waitForTimeout(150); seqs.add(await seqOf(A.p));
    }
    const span = Date.now() - t0;
    await A.p.waitForTimeout(2500); seqs.add(await seqOf(A.p));
    ok(seqs.size - 1 <= Math.ceil(span / 2000) + 1 && seqs.size > 1, `moving a window over and over for ${Math.round(span / 1000)} s: ${seqs.size - 1} writes, at most one per LINK_GAP_MS, and the last move is written`);
    await syncWaits(A.p);

    // ---- 40. A read that never settles: the smartboard's own changes are still written, the round gives up in time,
    // and another tab on the smartboard isn't held up.
    const aName = await ownFile(A.p);
    await typeNote(A.p, await ikOf(A.p, w2), 'Two, changed on the laptop'); await syncNow(A.p); await deliver(A.p, B.p);
    await syncWaits(B.p, { read: 1500, round: 3000 });
    await B.p.evaluate(n => { window.__drive = { hang: [n] }; }, aName);
    const B2 = await B.c.newPage(); await B2.goto(BASE); await boardUp(B2);
    await typeNote(B.p, await ikOf(B.p, w1), 'One, typed while a read hangs');
    const t1 = Date.now();
    await syncNow(B.p);
    const took = Date.now() - t1, bj = await ownJSON(B.p);
    ok(!!bj && bj.instances.some(i => i.data && i.data.text === 'One, typed while a read hangs') && took < 9000, `a read that never settles: the smartboard’s own change is still written, and its round gives up in time (${took} ms)`);
    ok(await B2.evaluate(() => new Promise(r => { const t = Date.now(); setTimeout(() => r(Date.now() - t < 1000), 50); })) && await B2.evaluate(() => navigator.locks.query()).then(q => q.held.length === 0),
      'another tab on the smartboard isn’t held up (the lock is free again)');
    await B2.close();
    await B.p.evaluate(() => { window.__drive = {}; }); await syncWaits(B.p);
    await syncNow(B.p);
    ok(await eventually(async () => { await syncNow(B.p); return /Two, changed on the laptop/.test(await notesText(B.p)); }), 'once the file can be read, it merges');
    await exchange(A, B);

    // ---- 41. Two Photos folders ("Photos" and "Photos (1)"): a photo in either is found and shown.
    const png = await A.p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#4f9be0'; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png'); });
    await A.p.setInputFiles('#photo-input', { name: 'sky.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }); await A.p.waitForTimeout(1500);
    await syncNow(A.p);
    ok(Object.keys(await readPhotos(A.p) || {}).length === 1 && !!(await ownJSON(A.p)).media, 'the laptop puts the photo in Photos, and its file names it');
    await deliver(A.p, B.p); await dupFolder(B.p, 'Photos');
    ok(!Object.keys(await readPhotos(B.p) || {}).length && Object.keys(await readPhotos(B.p, 'Photos (1)') || {}).length === 1, 'on the smartboard the photo is in a second “Photos (1)” folder only');
    ok(await eventually(async () => { await syncNow(B.p); return B.p.evaluate(() => !!window.__board21.state.media.get('background')); }), 'it is found there, and shown');

    // ---- 42. A file from a newer 21Board: the note and the status say so; nothing in it is merged; others still merge.
    const fut = '21Board (new laptop) [zzzz].21board';
    await putText(B.p, fut, JSON.stringify({ format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Future', uid: 'aaaaaaaa-0000-4000-8000-000000000000' }, instances: [], sync: { v: 3, dev: 'zzzzzzzzzzzz', name: 'the new laptop', seq: Date.now(), sum: '' } }));
    await syncNow(B.p);
    ok(await B.p.locator('.folder-note:not([hidden])', { hasText: 'Update 21Board' }).count() >= 1 && await B.p.evaluate(() => window.__board21.link.problem()) === 'newer', 'a device with a newer 21Board: the note on the board says “Update 21Board”');
    ok(/The new laptop uses a newer 21Board\. Update 21Board on this device to keep syncing\./.test(await B.p.evaluate(() => window.__board21.link.status())), 'and the status says so');
    await B.p.locator('.folder-note.left').click();
    const dlg = (await B.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    ok(/^Update 21Board on this device The new laptop uses a newer 21Board\. Its changes show here once this device is updated too\./.test(dlg), `tapping it says why (“${dlg}”)`);
    await B.p.keyboard.press('Escape');
    ok(!Object.values(await shownBoard(B.p)).some(x => x.name === 'Future'), 'nothing in that file is merged');
    await typeNote(A.p, await ikOf(A.p, w1), 'One, still merging'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(/One, still merging/.test(await notesText(B.p)), 'and the other devices’ files still merge');
    await putText(B.p, fut, null); await syncNow(B.p);
    ok(await B.p.evaluate(() => window.__board21.link.problem()) === '', 'once it is gone, so is the note');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: not disturbing anyone, and races (scenarios 43, 45, 49–51)', async (browser) => {
    const errors = [];
    const ikOf = async (p, w) => p.evaluate(w => { for (const [k, i] of window.__board21.state.insts) if ((i.wid || `${i.widgetId}@${i.createdAt}`) === w) return k; return null; }, w);
    const widOf = async (p, ik) => p.evaluate(ik => { const i = window.__board21.state.insts.get(ik); return i.wid || `${i.widgetId}@${i.createdAt}`; }, ik);
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await freeBoard(A.p);   // (the smartboard takes this shape with the board)
    const w1 = await widOf(A.p, await addNote(A.p, 'One')), w2 = await widOf(A.p, await addNote(A.p, 'Two'));
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const textOn = async (p, w) => ((await shownBoard(p))[Object.keys(await shownBoard(p))[0]].wins[w].data || {}).text;
    const change = async text => { await typeNote(A.p, await ikOf(A.p, w2), text); await syncNow(A.p); await deliver(A.p, B.p); };

    // ---- 43. Mid-drag on the smartboard when the laptop's change arrives: applied after the drop; the drop is kept.
    const box = await B.p.locator(`.win[data-ikey="${await ikOf(B.p, w1)}"] .win-title`).boundingBox();
    await B.p.mouse.move(box.x + 20, box.y + 8); await B.p.mouse.down(); await B.p.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
    await change('Two, while dragging'); await syncNow(B.p);
    ok(await textOn(B.p, w2) !== 'Two, while dragging' && await B.p.evaluate(() => window.__board21.inter.active), 'during a drag, nothing from the other device lands on the board');
    await B.p.mouse.move(box.x + 120, box.y + 80, { steps: 5 }); await B.p.mouse.up(); await B.p.waitForTimeout(300);
    const dropped = await B.p.evaluate(ik => window.__board21.state.insts.get(ik).rect, await ikOf(B.p, w1));
    ok(await eventually(async () => { await syncNow(B.p); return await textOn(B.p, w2) === 'Two, while dragging'; }), 'after the drop, it is applied');
    const kept = await B.p.evaluate(ik => window.__board21.state.insts.get(ik).rect, await ikOf(B.p, w1));
    ok(Math.round(kept.x) === Math.round(dropped.x) && Math.round(kept.y) === Math.round(dropped.y), 'and the drop is kept');
    await exchange(A, B);
    // A drag that starts while the round waits for Board history: nothing moves under it.
    await B.p.evaluate(() => { const H = window.__board21.history, was = H.beforeMerge; H.beforeMerge = async (...a) => { window.__waiting = true; await new Promise(r => setTimeout(r, 1500)); window.__waiting = false; return was.apply(H, a); }; window.__undoHB = () => { H.beforeMerge = was; }; });
    await change('Two, during Board history');
    const round = B.p.evaluate(() => window.__board21.link.round('full'));
    await B.p.waitForFunction(() => window.__waiting, null, { timeout: 5000 }).catch(() => {});
    const box2 = await B.p.locator(`.win[data-ikey="${await ikOf(B.p, w1)}"] .win-title`).boundingBox();
    await B.p.mouse.move(box2.x + 20, box2.y + 8); await B.p.mouse.down(); await B.p.mouse.move(box2.x + 40, box2.y + 30, { steps: 4 });
    await round;
    ok(await textOn(B.p, w2) !== 'Two, during Board history', 'a drag that starts while the round waits for Board history: nothing lands under it');
    await B.p.mouse.up(); await B.p.evaluate(() => window.__undoHB());
    ok(await eventually(async () => { await syncNow(B.p); return await textOn(B.p, w2) === 'Two, during Board history'; }), 'it lands once the drag is over');
    await exchange(A, B);

    // ---- 45. A window menu or a dialog open: nothing moves until it closes; a menu left open closes after a while.
    // The Widget Picker open doesn't hold merges.
    await B.p.click(`.win[data-ikey="${await ikOf(B.p, w1)}"] .win-label`); await B.p.waitForTimeout(200);
    ok(await B.p.locator('#menu.open, #menu:not([hidden])').count() >= 1, 'a window menu is open on the smartboard');
    await syncWaits(B.p, { hold: 60000 });
    await change('Two, behind a menu'); await syncNow(B.p);
    ok(await textOn(B.p, w2) !== 'Two, behind a menu', 'while a window menu is open, nothing moves on the board');
    await syncWaits(B.p, { hold: 1500 });
    ok(await eventually(async () => { await syncNow(B.p); return await textOn(B.p, w2) === 'Two, behind a menu' && !await B.p.evaluate(() => !!document.querySelector('#menu.open')); }, 20000), 'a menu left open for a while closes, and the change applies');
    await syncWaits(B.p);
    const asked = B.p.evaluate(() => window.__board21.pages.rename());
    await B.p.waitForSelector('#modal.open');
    await change('Two, behind a dialog'); await syncNow(B.p); await B.p.waitForTimeout(800); await syncNow(B.p);
    ok(await textOn(B.p, w2) !== 'Two, behind a dialog', 'while a dialog is open, nothing moves');
    await B.p.keyboard.press('Escape'); await asked;
    ok(await eventually(async () => { await syncNow(B.p); return await textOn(B.p, w2) === 'Two, behind a dialog'; }), 'once it closes, the change applies');
    await B.p.click('.picker-btn.left'); await B.p.waitForTimeout(300);
    await change('Two, with the Widget Picker open'); await syncNow(B.p);
    ok(await textOn(B.p, w2) === 'Two, with the Widget Picker open' && await B.p.locator('#panel.open').count() === 1, 'the Widget Picker open doesn’t hold merges');
    await B.p.click('.picker-btn.left'); await B.p.waitForTimeout(200);
    await exchange(A, B);

    // ---- 49. A change here between the round's read and its transaction: the transaction aborts, the round runs
    // again, and both are kept.
    await renamePage(A.p, 'Renamed on the laptop'); await syncNow(A.p); await deliver(A.p, B.p);
    await B.p.evaluate(() => { const H = window.__board21.history, was = H.beforeMerge; H.beforeMerge = async (...a) => { H.beforeMerge = was; window.__board21.updateBoard({ background: { color: '#dcfce7', pattern: 'none' } }); await new Promise(r => setTimeout(r, 600)); return was.apply(H, a); }; });
    await syncNow(B.p); await syncNow(B.p);
    const pg = Object.values(await shownBoard(B.p))[0];
    ok(pg.name === 'Renamed on the laptop' && pg.color === '#dcfce7', `a change made here while a round was merging: both the change and the merge are kept (${pg.name}, ${pg.color})`);
    await exchange(A, B);
    ok(await sameBoards(A.p, B.p), 'and they reach the laptop too');

    // ---- 50. A crash after the round's transaction, before the file is written: written after a reload, nothing lost.
    await syncWaits(B.p, { afterCommit: 'stop' });
    await change('Two, before a crash'); await syncNow(B.p);
    const before = JSON.stringify(await ownJSON(B.p));
    ok(await textOn(B.p, w2) === 'Two, before a crash' && !before.includes('Two, before a crash'), 'the merge is saved on the smartboard, but 21Board closes before writing its file');
    await B.p.reload(); await boardUp(B.p);
    await linkFolder(B.p);   // (the stand-in folder handle can't be kept across a reload: see DRIVE_PICK)
    ok(await eventually(async () => JSON.stringify(await ownJSON(B.p)).includes('Two, before a crash')), 'after the reload, its file is written, with nothing lost');

    // ---- 51. The lid closed right after an edit: the send round writes the laptop's file before reading any other.
    const bName = await ownFile(B.p);
    await typeNote(B.p, await ikOf(B.p, w1), 'One, changed on the smartboard'); await syncNow(B.p); await deliver(B.p, A.p);
    await A.p.evaluate(n => { window.__drive = { hang: [n] }; }, bName);
    await A.p.evaluate(ik => { const r = window.__board21.state.insts.get(ik).rect; window.__board21.setRect(ik, Object.assign({}, r, { y: r.y + 30 })); }, await ikOf(A.p, w2));
    const s1 = (await ownJSON(A.p)).sync.seq;
    await A.p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok(await eventually(async () => (await ownJSON(A.p)).sync.seq > s1, 2500), 'hidden right after a change: the laptop writes its file at once, without waiting on another device’s file');
    await A.p.evaluate(() => { delete document.visibilityState; window.__drive = {}; });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: photos, a folder that can only be viewed, a full folder, and when the folder can’t be used (scenarios 52–55)', async (browser) => {
    const errors = [], DAY = 864e5;
    const status = p => p.evaluate(() => window.__board21.link.status());
    const photoKey = p => p.evaluate(() => { const m = window.__board21.state.media.get('background'); return m ? `${m.addedAt}-${m.bytes}` : null; });
    const pic = (p, color) => p.evaluate(c => { const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 400, 300); return cv.toDataURL('image/png'); }, color);
    const setPhoto = async (p, color) => { const png = await pic(p, color); await p.setInputFiles('#photo-input', { name: color + '.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }); await p.waitForTimeout(1500); };
    const named = async p => { const j = await ownJSON(p); return j && j.media && j.media.background ? j.media.background.file : null; };
    const note = p => p.evaluate(() => { const b = document.querySelector('.folder-note.left'); return b && !b.hidden ? b.textContent : ''; });
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await addNote(A.p, 'One');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);

    // ---- 52. A photo set on the laptop: the board file reaches the smartboard before the photo.
    await setPhoto(A.p, '#dc2626'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    const red = await photoKey(A.p), redFile = await named(A.p);
    ok(!!red && await photoKey(B.p) === red && await named(B.p) === redFile, 'a photo set on the laptop shows on the smartboard, and both files name it');
    await setPhoto(A.p, '#2563eb'); await syncNow(A.p);
    const blue = await photoKey(A.p);
    await deliver(A.p, B.p, { photos: false }); await syncNow(B.p);
    ok(await photoKey(B.p) === red && await named(B.p) === redFile, 'the file arrives before the new photo: the smartboard keeps its photo, and its file still names it (no flipping)');
    await B.p.waitForTimeout(2700); await syncNow(B.p);
    ok(/The background photo of “Page 1” is still arriving\./.test(await status(B.p)), `after a while the status says the photo is still arriving (“${await status(B.p)}”)`);
    await B.p.reload(); await boardUp(B.p); await linkFolder(B.p, null);
    ok(await photoKey(B.p) === red, 'reloaded while it waits, the smartboard still shows its photo');
    await deliver(A.p, B.p);
    ok(await eventually(async () => { await syncNow(B.p); return await photoKey(B.p) === blue; }), 'once the photo arrives, it shows');
    ok(await eventually(async () => { await syncNow(B.p); return await named(B.p) === await named(A.p) && !/still arriving/.test(await status(B.p)); }), 'the smartboard’s file names it too, and the status no longer waits');

    // ---- 53. A photo removed on the laptop: removed on the smartboard; the photo nobody names goes later; a photo
    // named again after days is put again, and stays.
    await openSettings(A.p, ['bg']);
    await A.p.click('#settings [data-act="photo-remove"]');
    const rm = (await A.p.locator('#modal.open p').innerText()).replace(/\s+/g, ' ');
    ok(rm === 'It’s removed from this page, here and on your other devices. Your full backups and Board history still have it.', `removing the photo says it goes on the other devices too (“${rm}”)`);
    await A.p.locator('#modal.open .btn', { hasText: 'Remove photo' }).click(); await A.p.waitForTimeout(500); await A.p.keyboard.press('Escape');
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(!await photoKey(B.p) && !await named(B.p) && !await named(A.p), 'removed on the laptop, it is removed on the smartboard');
    const photos = async () => Object.keys(await readPhotos(A.p) || {}).sort();
    ok((await photos()).length === 2, 'both photos are still in Photos for now');
    // (days later the device "wakes up" (Link.awake): Google Drive gets Link.waits.arrive from then before anything is tidied)
    const later = async d => { await setClock(A.p, d * DAY); await A.p.evaluate(() => window.__board21.link.awake()); await A.p.waitForTimeout(2700); await syncNow(A.p); };
    for (const d of [8, 9]) await later(d);
    ok(await eventually(async () => { await syncNow(A.p); return (await photos()).length === 0; }), 'a week later, photos no device file names are tidied away (found unnamed on two looks a day apart)');
    await setClock(A.p, 0);
    await setPhoto(A.p, '#2563eb'); await syncNow(A.p);
    ok((await photos()).length === 1 && await named(A.p) === (await photos())[0], 'a photo named again is put in Photos again');
    for (const d of [10, 11]) await later(d);
    ok((await photos()).length === 1, 'and a photo a device file names is never tidied away');
    await setClock(A.p, 0);
    await exchange(A, B);

    // ---- 54. A folder the smartboard can only view: it shows the laptop's changes, with no "Not synced" until a
    // change is made on it; given write access, its changes merge.
    await B.p.evaluate(() => { window.__drive = { readOnly: true }; });
    await renamePage(A.p, 'From the laptop'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(Object.values(await shownBoard(B.p))[0].name === 'From the laptop' && await note(B.p) === '', 'a folder that can only be viewed: the laptop’s changes still show, and there is no note');
    ok(/^You can only view this folder\. Changes from your other devices show here\. Changes made here stay on this device\./.test(await status(B.p)), `the status says so (“${await status(B.p)}”)`);
    await B.p.evaluate(() => window.__board21.updateBoard({ background: { color: '#fef9c3', pattern: 'none' } })); await syncNow(B.p);
    ok(await eventually(async () => await note(B.p) === 'Not synced'), 'once a change is made here, the note says “Not synced”');
    await B.p.evaluate(() => { window.__drive = {}; });
    await B.p.waitForTimeout(1600);
    ok(await eventually(async () => { await syncNow(B.p); return await note(B.p) === ''; }), 'given write access, the next write goes, and the note goes');
    await deliver(B.p, A.p); await syncNow(A.p);
    ok(Object.values(await shownBoard(A.p))[0].color === '#fef9c3', 'and the change merges on the laptop');

    // ---- 55. A full folder: the note, a retry after a while, nothing lost. A board too big to sync: its own note.
    await A.p.evaluate(() => { window.__drive = { full: true }; });
    await renamePage(A.p, 'While full'); await syncNow(A.p);
    ok(await note(A.p) === 'Not synced' && await A.p.locator('.toast', { hasText: 'Couldn’t sync this board with your folder: there’s no room left. 21Board keeps trying.' }).count() === 1, 'writing fails for lack of room: “Not synced”, and a message the first time');
    await A.p.locator('.folder-note.left').click();
    const full = (await A.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    ok(/^Your changes aren’t reaching your other devices 21Board couldn’t save them to your folder at .+?\. There’s no room left\. Make room in Google Drive or on this device\. 21Board keeps trying\. Changes from your other devices still show here\. Try again now Close$/.test(full), `tapping it says what happened (“${full}”)`);
    await A.p.keyboard.press('Escape');
    // (FIN-4) and Settings' status line doesn't say "Up to date" under that warning
    ok(await eventually(async () => /^Not synced\. Changes made here aren’t in your folder yet\. The last ones went there at .+?\./.test(await status(A.p))) && !/Up to date/.test(await status(A.p)),
      `the status says “Not synced. …”, not “Up to date” (“${await status(A.p)}”)`);
    await A.p.evaluate(() => { window.__drive = {}; });
    ok(await eventually(async () => { await A.p.evaluate(() => window.__board21.link.check(true)); return await note(A.p) === '' && (await ownJSON(A.p)).board.name === 'While full'; }), 'it is tried again after a while, and nothing was lost');
    await syncWaits(A.p, { maxFile: 500 });
    await renamePage(A.p, 'Too big'); await syncNow(A.p);
    await A.p.locator('.folder-note.left').click();
    const big = (await A.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    ok(await A.p.evaluate(() => window.__board21.link.trouble.code) === 'big' && /\. The board is too big to sync\. Remove some long notes, then try again\./.test(big), `a board too big to sync: “Not synced”, and why (“${big}”)`);
    await A.p.keyboard.press('Escape');
    await syncWaits(A.p);

    // ---- When the folder can't be used: missing, and Chrome wanting to be asked again.
    await A.p.evaluate(() => { window.__drive = { gone: true }; }); await A.p.evaluate(() => window.__board21.link.check(true));
    ok(await note(A.p) === 'Folder unavailable', 'a folder that can’t be found: “Folder unavailable”');
    await A.p.evaluate(() => { window.__drive = {}; }); await A.p.evaluate(() => window.__board21.link.check(true));
    ok(await note(A.p) === '', 'back: the note goes');
    await A.p.evaluate(() => { window.__drive = { perm: 'prompt', grant: 'granted' }; const l = window.__board21.link; l.nagged = false; return l.refresh(); });
    ok(await note(A.p) === 'Reconnect folder' && await A.p.locator('.toast', { hasText: 'Reconnect your “21Board” folder to keep syncing.' }).count() === 1, 'Chrome wants to be asked again: “Reconnect folder”, and a message for a device that has synced');
    // The one action has one name: the message's button, Settings' button and the dialog's all say Reconnect.
    const nagBtn = (await A.p.locator('.toast', { hasText: 'Reconnect your “21Board” folder to keep syncing.' }).locator('button').allInnerTexts()).filter(t => t.trim());
    await openSettings(A.p);
    const fixBtn = await A.p.locator('#settings .save-warn .btn').evaluateAll(bs => bs.map(b => b.textContent.trim() + '/' + b.dataset.act).join());
    await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(200);
    await A.p.evaluate(() => { const l = window.__board21.link; l.trouble = null; l.stuck('other'); });
    await A.p.locator('.toast', { hasText: 'Couldn’t sync this board with your folder' }).locator('button', { hasText: 'Details' }).click(); await A.p.locator('#modal.open').waitFor();
    const askBtns = (await A.p.locator('#modal.open .btn').allInnerTexts()).join('|'), askTitle = await A.p.locator('#modal.open .modal-card').innerText();
    await A.p.locator('#modal.open .btn', { hasText: 'Close' }).click(); await A.p.evaluate(() => { window.__board21.link.trouble = null; });
    ok(nagBtn.includes('Reconnect') && fixBtn === 'Reconnect/link-reconnect' && askBtns === 'Reconnect|Close' && /^Reconnect your “21Board” folder/.test(askTitle),
      `the message, Settings and the dialog each offer “Reconnect” (${nagBtn.join(', ')} / ${fixBtn} / ${askBtns})`);
    await A.p.locator('.folder-note.left').click();   // (waited for, not a fixed time: a busy machine is slower)
    ok(await eventually(async () => await note(A.p) === '' && await A.p.locator('.toast', { hasText: 'Your “21Board” folder is connected again.' }).count() === 1),
      `one tap reconnects it (note “${await note(A.p)}”; messages: ${(await A.p.locator('#toasts .toast').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' | ')})`);
    // Chrome refusing without asking: Settings' button does what its hint says, choose the folder again (here the
    // picker is cancelled). The board's note, tapped, offers the same.
    await A.p.evaluate(() => { window.__drive = { perm: 'denied', pickFails: 'AbortError' }; return window.__board21.link.refresh(); });
    await openSettings(A.p);
    const denyBtn = await A.p.locator('#settings .save-warn .btn').evaluateAll(bs => bs.map(b => b.textContent.trim() + '/' + b.dataset.act).join());
    const denyHint = await A.p.locator('#settings .save-warn .hint').innerText(), picks = await A.p.evaluate(() => (window.__picks || []).length);
    await A.p.locator('#settings .save-warn .btn').click();
    const denyPick = await eventually(() => A.p.evaluate(n => (window.__picks || []).length === n + 1 && window.__picks[n] === true, picks));
    await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(200);
    await A.p.locator('.folder-note.left').click(); await A.p.locator('#modal.open').waitFor();
    const denyAsk = (await A.p.locator('#modal.open .btn').allInnerTexts()).join('|');
    await A.p.locator('#modal.open .btn', { hasText: 'Close' }).click();
    ok(denyBtn === 'Choose the folder again…/link-choose' && /Chrome is blocking it\. Choose the folder again to allow it\./.test(denyHint) && denyPick && denyAsk === 'Choose the folder again…|Close',
      `a folder Chrome blocks: Settings and the note’s dialog offer “Choose the folder again…”, and Settings’ opens the folder picker (${denyBtn} / ${denyHint} / ${denyPick} / ${denyAsk})`);
    await A.p.evaluate(() => { window.__drive = {}; return window.__board21.link.refresh(); });
    ok(await eventually(async () => await note(A.p) === ''), `allowed again: the note goes (“${await note(A.p)}”, ${await A.p.evaluate(() => { const l = window.__board21.link; return l.perm + ' ' + l.problem() + ' ' + JSON.stringify(l.trouble); })})`);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: pages deleted, Import and going back (scenarios 59–61)', async (browser) => {
    const errors = [];
    const said = async p => (await p.locator('#modal.open').count()) ? (await p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ') : '';
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await A.p.evaluate(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    await renamePage(A.p, 'Morning'); const n1 = await addNote(A.p, 'Morning note');
    await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Math' })); await A.p.waitForTimeout(700); await addNote(A.p, 'Math note');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const uids = async p => Object.keys(await shownBoard(p)).sort().join();
    ok(Object.keys(await shownBoard(B.p)).length === 2 && await sameBoards(A.p, B.p), 'two pages on both');

    // ---- 59. A page deleted on the laptop: deleted on the smartboard too.
    await A.p.evaluate(() => { window.__board21.pages.remove(); });
    await A.p.locator('#modal.open').waitFor();
    const del = await said(A.p);
    ok(/This page and its 1 window are deleted here and on your other devices\./.test(del), `Delete this page says it goes on the other devices too (“${del}”)`);
    await A.p.locator('#modal.open .btn', { hasText: 'Delete page' }).click(); await A.p.waitForTimeout(1200);
    const math = await A.p.evaluate(() => { const P = window.__board21.pages; return Array.from(P.gone()); });
    await A.p.evaluate(b => window.__board21.pages.purge(b), math);   // (as when its Undo is over)
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(Object.values(await shownBoard(B.p)).map(x => x.name).join() === 'Morning' && await sameBoards(A.p, B.p), 'the page deleted on the laptop is deleted on the smartboard');
    ok(await B.p.locator('.toast', { hasText: '“Math” was deleted on the laptop.' }).locator('button', { hasText: 'Undo' }).count() === 1, 'the smartboard says so, with Undo');
    await B.p.evaluate(async () => { const P = window.__board21.pages; await P.purge(Array.from(P.gone())); });   // (as when its Undo is over)
    const deleted = async p => (await p.evaluate(() => window.__board21.history.deletedPages())).map(x => x.name);
    ok((await deleted(A.p)).includes('Math') && (await deleted(B.p)).includes('Math'), `after the Undo time the page is under Board history › Deleted pages on both (${await deleted(A.p)} / ${await deleted(B.p)})`);

    // ---- 60. Import › Replace all pages on the laptop: the smartboard gets the same pages and windows, as edits.
    // Replace this page keeps the page.
    await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Science' })); await A.p.waitForTimeout(700); await addNote(A.p, 'Science note');
    await exchange(A, B);
    const all = JSON.parse(await fileText(A.p, await ownFile(A.p)));   // (a device file: every page)
    for (const e of [all].concat(all.pages || [])) for (const i of e.instances || []) if (i.data && i.data.text === 'Science note') i.data.text = 'Science note, from the file';
    fs.writeFileSync(OUT + 'all-pages.21board', JSON.stringify(all));
    const before = await uids(A.p), science = (await winList(B.p)).find(x => x.data && x.data.text === 'Science note');
    // (meanwhile the smartboard changes that note: its file hasn't reached the laptop)
    await B.p.evaluate(([b, ik]) => window.__board21.writer.put(`data:${b}:${ik}`, 'data', { text: 'Science note, the smartboard’s' }), [science.b, science.ikey]); await B.p.waitForTimeout(1000); await syncNow(B.p);
    await A.p.setInputFiles('#import-input', OUT + 'all-pages.21board'); await A.p.waitForTimeout(400);
    await A.p.locator('#modal.open .btn', { hasText: 'Replace all pages' }).click(); await A.p.waitForTimeout(300);
    const second = await said(A.p);
    ok(/All 2 pages are deleted here and on your other devices, and the 2 pages in “all-pages” take their place\./.test(second), `the second question says the pages go on the other devices too (“${second}”)`);
    await A.p.locator('#modal.open .btn', { hasText: 'Replace all pages' }).click(); await A.p.waitForTimeout(2500);
    ok(await uids(A.p) === before, 'Replace all pages keeps the pages’ ids (the same boards)');
    await exchange(A, B);
    ok(await uids(B.p) === before && await sameBoards(A.p, B.p) && (await winList(B.p)).filter(x => !x.copyOf).length === 2,
      'the smartboard gets the same pages and windows, as edits (nothing deleted and added again)');
    const cp60 = await copiesOf(B.p);
    ok(cp60.length === 1 && cp60[0].copyOf.wid === science.wid && cp60[0].data.text === 'Science note, the smartboard’s' && /Science note, from the file/.test(await notesText(B.p)) && (await copiesOf(A.p)).length === 1,
      'and the smartboard’s concurrent edit becomes a labelled copy, on both');
    const page = JSON.parse(JSON.stringify(await A.p.evaluate(() => window.__board21.buildExport('full'))));
    const shown = await A.p.evaluate(() => window.__board21.state.board.uid);
    page.instances.forEach(i => { if (i.data && i.data.text) i.data.text += ', from a file'; });
    page.board.uid = 'ffffffff-0000-4000-8000-000000000000';   // (a file of another board)
    fs.writeFileSync(OUT + 'one-page.21board', JSON.stringify(page));
    await A.p.setInputFiles('#import-input', OUT + 'one-page.21board'); await A.p.waitForTimeout(400);
    const sub = await A.p.locator('#modal.open .btn', { hasText: 'Replace this page' }).innerText();
    ok(/This page’s windows and content are replaced, here and on your other devices\. You can undo this\./.test(sub.replace(/\s+/g, ' ')), `Replace this page says it changes the other devices too (“${sub.replace(/\s+/g, ' ')}”)`);
    await A.p.locator('#modal.open .btn', { hasText: 'Replace this page' }).click(); await A.p.waitForTimeout(2000);
    ok(await A.p.evaluate(() => window.__board21.state.board.uid) === shown, 'Replace this page keeps the page (its id), whatever board the file was');
    await exchange(A, B);
    ok((await shownBoard(B.p))[shown] && /, from a file/.test(await notesText(B.p)) && await uids(B.p) === before, 'and the smartboard gets the new content on the same page');

    // ---- 61. Going back (Board history) on the laptop syncs to the smartboard as edits.
    const ikA = Array.from(await A.p.evaluate(() => Array.from(window.__board21.state.insts.keys())))[0];
    await typeNote(A.p, ikA, 'Before going back'); await A.p.waitForTimeout(400);
    const v = await A.p.evaluate(() => window.__board21.history.capture('manual'));
    await typeNote(A.p, ikA, 'After the version'); await exchange(A, B);
    ok(/After the version/.test(await notesText(B.p)), 'the smartboard has the newer text');
    await A.p.evaluate(id => window.__board21.history.restore(id), v); await A.p.waitForTimeout(2000);
    await exchange(A, B);
    ok(/Before going back/.test(await notesText(B.p)) && !/After the version/.test(await notesText(B.p)) && await uids(B.p) === before && await sameBoards(A.p, B.p), 'going back on the laptop reaches the smartboard as edits to the same windows');
    // Going back to a version of another page (Science's, say, as a folder copy may be) keeps this page: its windows
    // come onto it, and no page is added or deleted anywhere.
    const here = await A.p.evaluate(() => window.__board21.state.board.uid);
    await A.p.evaluate(async () => { const P = window.__board21.pages; await P.go(P.ids()[1]); await new Promise(r => setTimeout(r, 800)); });
    const other = await A.p.evaluate(() => window.__board21.buildExport('full'));
    await A.p.evaluate(async () => { const P = window.__board21.pages; await P.go(P.ids()[0]); await new Promise(r => setTimeout(r, 800)); });
    await A.p.evaluate(e => window.__board21.history.restore({ exp: e }), other); await A.p.waitForTimeout(2000);
    await exchange(A, B);
    ok(await A.p.evaluate(() => window.__board21.state.board.uid) === here && await uids(A.p) === before && await uids(B.p) === before && await sameBoards(A.p, B.p),
      'going back to a version of another page keeps this page’s id: no page is added or deleted on either device');

    // ---- 59, continued: Bring back on the smartboard brings Math back on both.
    const mathId = ((await B.p.evaluate(() => window.__board21.history.deletedPages())).find(x => x.name === 'Math') || {}).id;
    await B.p.evaluate(id => window.__board21.history.bringBack(id), mathId); await B.p.waitForTimeout(800);
    await exchange(A, B);
    ok(Object.values(await shownBoard(A.p)).some(x => x.name === 'Math' && Object.values(x.wins).some(w => w.data && w.data.text === 'Math note')) && await sameBoards(A.p, B.p), 'Bring back on the smartboard brings Math back, on both');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: an update and its Undo, clashes and copies (scenarios 13, 16–19)', async (browser) => {
    const errors = [];
    // (a window with the keyboard in it stays busy while typing goes on, as with the real LINK_FOCUS_MS: see 17)
    const A = await syncDev(browser, 'the laptop', errors, { focus: 30000 }), B = await syncDev(browser, 'the smartboard', errors, { focus: 30000 });
    const n = await addNote(A.p, 'Homework: page 12');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const w = (await winList(A.p))[0].wid, nB = await ikOf(B.p, w);
    ok(await sameBoards(A.p, B.p) && !!nB, 'the smartboard has the laptop’s note');

    // ---- 13. An edit on the laptop only: the page shown on the smartboard updates by itself, with Undo. Undo on the
    // smartboard puts it back there and then on the laptop, which says so, with Redo.
    await typeNote(A.p, n, 'Homework: page 14'); await syncNow(A.p);
    await hear(B.p);
    await deliver(A.p, B.p); await syncNow(B.p);
    ok(/page 14/.test(await notesText(B.p)) && /page 14/.test(await noteOf(B.p, nB)), 'an edit on the laptop shows on the smartboard’s page by itself');
    ok((await heard(B.p)).includes('Updated from the laptop.') && await B.p.locator('#toasts button', { hasText: 'Undo' }).count() === 1, `and it says “Updated from the laptop.”, with Undo (${(await heard(B.p)).join(' | ')})`);
    await B.p.locator('#toasts .toast', { hasText: 'Updated from the laptop.' }).locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => /page 12/.test(await notesText(B.p)) && /page 12/.test(await noteOf(B.p, nB))), 'Undo on the smartboard puts the note back there');
    ok(await eventually(async () => (await heard(B.p)).includes('Undone. Your other devices get this too.')), 'and says the other devices get it too');
    await syncNow(B.p); await hear(A.p);
    await deliver(B.p, A.p); await syncNow(A.p);
    ok(/page 12/.test(await notesText(A.p)) && !/page 14/.test(await notesText(A.p)) && await sameBoards(A.p, B.p), 'then on the laptop');
    ok((await heard(A.p)).includes('The smartboard undid the changes from this device.') && await A.p.locator('#toasts button', { hasText: 'Redo' }).count() === 1,
      `which says “The smartboard undid the changes from this device.”, with Redo (${(await heard(A.p)).join(' | ')})`);
    await exchange(A, B);

    // ---- 16. The same Notes content changed on both: the later text stays in the window and the other is kept in one
    // labelled copy, on both. Another round makes no more copies. The label is short; its title and the window
    // name's label say whose it is. Moving the copy clears the label on both.
    await typeNote(A.p, n, 'Homework: page 20 (laptop)'); await syncNow(A.p);
    await typeNote(B.p, nB, 'Homework: page 21 (smartboard)'); await syncNow(B.p);   // (the later one)
    await exchange(A, B);
    const kept = async p => { const all = await winList(p), cp = all.filter(x => x.copyOf && x.copyOf.wid === w); return { main: ((all.find(x => x.wid === w) || {}).data || {}).text, copies: cp.map(x => (x.data || {}).text), cp }; };
    let kA = await kept(A.p), kB = await kept(B.p);
    ok(kA.main === 'Homework: page 21 (smartboard)' && kB.main === kA.main && kA.copies.join() === 'Homework: page 20 (laptop)' && kB.copies.join() === kA.copies.join() && await sameBoards(A.p, B.p),
      `the later text stays in the window and the other is in one labelled copy, on both (${JSON.stringify([kA.main, kA.copies, kB.main, kB.copies])})`);
    const devA = await A.p.evaluate(() => window.__board21.link.dev());
    ok(kA.cp[0].copyOf.from === devA && kA.cp[0].copyOf.name === 'the laptop', 'the copy says it is the laptop’s version');
    await exchange(A, B);
    ok((await copiesOf(A.p)).length === 1 && (await copiesOf(B.p)).length === 1, 'another round makes no more copies');
    const time = await B.p.evaluate(at => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), kB.cp[0].copyOf.at);
    const label = (p, ik) => p.evaluate(ik => { const w = document.querySelector(`.win[data-ikey="${ik}"] .win-label`), c = w && w.querySelector('.copy-label'); return c ? { text: c.textContent, hidden: c.hidden, title: c.title, aria: w.getAttribute('aria-label') } : null; }, ik);
    const lB = await label(B.p, kB.cp[0].ikey), lA = await label(A.p, kA.cp[0].ikey);
    ok(lB && !lB.hidden && lB.text === `Copy · ${time}`, `the copy’s label is short: “${lB && lB.text}”`);
    ok(lB.title === `The laptop’s version from ${time}. This window was changed on two devices at once.` && lB.aria === `Notes ${kB.cp[0].ikey.split(':')[1]}, the laptop’s version from ${time}, window menu`,
      `on the smartboard its title and the window name’s label name the laptop (“${lB.title}” / “${lB.aria}”)`);
    ok(lA && lA.title === `This device’s version from ${time}. This window was changed on two devices at once.`, `on the laptop they say it is this device’s (“${lA && lA.title}”)`);
    const box = await B.p.locator(`.win[data-ikey="${kB.cp[0].ikey}"] .win-title`).boundingBox();
    await B.p.mouse.move(box.x + box.width - 30, box.y + 12); await B.p.mouse.down(); await B.p.mouse.move(box.x + box.width - 110, box.y + 70, { steps: 6 }); await B.p.mouse.up();
    await B.p.waitForTimeout(1000);
    await exchange(A, B);
    ok(!(await winList(A.p)).some(x => x.copyOf) && !(await winList(B.p)).some(x => x.copyOf) && await sameBoards(A.p, B.p), 'moving the copy on the smartboard clears its label on both: it is an ordinary window now');

    // ---- 17. Typing in the same note on both for a while, files delivered every couple of seconds: at most one
    // copy per pause, and the last text typed on each device is in the window or the copy.
    const typing = async (rounds, lagged) => {
      const fA = A.p.frameLocator(`.win[data-ikey="${n}"] iframe`), fB = B.p.frameLocator(`.win[data-ikey="${nB}"] iframe`), late = [];
      let tA = 'Laptop typing:', tB = 'Smartboard typing:';
      for (let i = 0; i < rounds; i++) {
        tA += ` a${i}`; tB += ` b${i}`;
        await fillNote(fA, tA); await fillNote(fB, tB);   // (the keyboard stays in each window: they are busy)
        await A.p.waitForTimeout(250);
        await syncNow(A.p); await syncNow(B.p);
        if (lagged) { late.push(await fileText(A.p, await ownFile(A.p))); if (late.length > 2) await putText(B.p, await ownFile(A.p), late.shift()); }
        else await deliver(A.p, B.p);
        await deliver(B.p, A.p);
        await syncNow(A.p); await syncNow(B.p);
      }
      // (a pause: both leave the note)
      for (const p of [A.p, B.p]) await p.evaluate(() => { const a = document.activeElement; if (a && a.tagName === 'IFRAME') a.blur(); });
      await A.p.waitForTimeout(2300);
      await exchange(A, B); await exchange(A, B);
      return [tA, tB];
    };
    const c17 = (await copiesOf(A.p)).length;
    const [tA, tB] = await typing(8, false);
    const all17 = await notesText(A.p), c17b = (await copiesOf(A.p)).length;
    ok(c17b - c17 <= 1 && all17.includes(tA) && all17.includes(tB) && (await notesText(B.p)).includes(tA) && await sameBoards(A.p, B.p),
      `typing on both with files delivered every couple of seconds: at most one copy for the pause (${c17b - c17}), and both last texts are kept`);
    await setClock(B.p, -5 * 60e3);
    const [tA2, tB2] = await typing(8, true);
    const all17b = await notesText(B.p), c17c = (await copiesOf(B.p)).length;
    ok(c17c - c17b <= 1 && all17b.includes(tA2) && all17b.includes(tB2) && await sameBoards(A.p, B.p),
      `again with the laptop’s files arriving late and the smartboard’s clock 5 minutes slow: no copy per save (${c17c - c17b})`);
    await setClock(B.p, 0);

    // ---- 18. A clash while the laptop, its author, is closed: the smartboard makes the copy once it has seen no change
    // to the laptop's file for a while (Link.waits.idle). The laptop then makes no second one.
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);
    const c18 = (await copiesOf(B.p)).length;
    await typeNote(A.p, n, 'Spelling: the laptop’s list'); await syncNow(A.p);
    await typeNote(B.p, nB, 'Spelling: the smartboard’s list'); await syncNow(B.p);   // (the later one)
    await deliver(A.p, B.p); await syncNow(B.p);
    ok((await copiesOf(B.p)).length === c18 && /the smartboard’s list/.test(await noteOf(B.p, nB)), 'the smartboard keeps its text in the window and leaves the copy to the laptop for now');
    await B.p.waitForTimeout(2800); await syncNow(B.p);
    ok((await copiesOf(B.p)).length === c18 + 1 && /the laptop’s list/.test(await notesText(B.p)), 'once it has seen no change to the laptop’s file for a while, the smartboard makes the copy');
    await deliver(B.p, A.p); await syncNow(A.p); await exchange(A, B);
    ok((await copiesOf(A.p)).length === c18 + 1 && (await copiesOf(B.p)).length === c18 + 1 && await sameBoards(A.p, B.p), 'when the laptop opens, it makes no second copy');
    // (16, continued) Closing a copy and tapping Notes in the Widget Picker opens a new note.
    const cp18 = (await copiesOf(A.p))[0];
    await A.p.evaluate(ik => window.__board21.closeWin(ik, { quiet: true }), cp18.ikey); await A.p.waitForTimeout(400);
    const opened = await A.p.evaluate(() => window.__board21.openWidget('notes')); await A.p.waitForTimeout(600);
    ok(opened && opened !== cp18.ikey && !(await winList(A.p)).find(x => x.ikey === cp18.ikey).open, `closing the copy and tapping Notes opens a new note (${opened}), not the copy`);
    await exchange(A, B);

    // ---- 19. State widgets: a Traffic light and a running Timer changed on both make no copy (the later state on both,
    // and Board history keeps the other on the device whose state lost). A Task Timer changed on both makes one
    // copy, paused, so only one alarm rings.
    const tl = await addWin(A.p, 'traffic-light'), tm = await addWin(A.p, 'timer'), tt = await addWin(A.p, 'task-timer');
    await exchange(A, B);
    const wids = {}; for (const [k, ik] of Object.entries({ tl, tm, tt })) wids[k] = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ik);
    const at = Date.now(), task = { totalMode: 'sum', totalMinutes: 60, tasks: [{ emoji: '⭐', name: 'Reading', minutes: 10, color: '#ff5e57' }], activeIndex: 0, secondsLeft: 600, running: true, endsAt: at + 540e3, alarm: false };
    await saveData(A.p, tl, { active: 'red' }); await saveData(A.p, tm, { duration: 300e3, remaining: 300e3, endsAt: at + 300e3 }); await saveData(A.p, tt, task);
    await syncNow(A.p);
    await saveData(B.p, await ikOf(B.p, wids.tl), { active: 'green' }); await saveData(B.p, await ikOf(B.p, wids.tm), { duration: 120e3, remaining: 120e3, endsAt: at + 120e3 });
    await saveData(B.p, await ikOf(B.p, wids.tt), Object.assign({}, task, { endsAt: at + 300e3, secondsLeft: 300 }));
    await syncNow(B.p);
    const before19 = await A.p.evaluate(() => window.__board21.history.metas.filter(m => m.reason === 'merge').length);
    await exchange(A, B);
    const of = async (p, id) => (await winList(p)).filter(x => x.widgetId === id);
    const [lA19, lB19, mA19, mB19] = [await of(A.p, 'traffic-light'), await of(B.p, 'traffic-light'), await of(A.p, 'timer'), await of(B.p, 'timer')];
    ok(lA19.length === 1 && lB19.length === 1 && lA19[0].data.active === 'green' && lB19[0].data.active === 'green', `a Traffic light changed on both: no copy, the later state on both (${lA19.map(x => x.data.active)})`);
    ok(mA19.length === 1 && mB19.length === 1 && mA19[0].data.endsAt === at + 120e3 && mB19[0].data.endsAt === at + 120e3, 'a running Timer changed on both: no copy, the later state on both');
    ok(await A.p.evaluate(() => window.__board21.history.metas.filter(m => m.reason === 'merge').length) > before19, 'the laptop, whose state lost, keeps it in a Board history version first');
    const [tA19, tB19] = [await of(A.p, 'task-timer'), await of(B.p, 'task-timer')], cpT = tB19.find(x => x.copyOf);
    ok(tA19.length === 2 && tB19.length === 2 && !!cpT && cpT.data.running === false && cpT.data.endsAt === null && cpT.data.alarm === false && cpT.data.secondsLeft > 0,
      `a Task Timer changed on both: one copy, paused, so only one alarm rings (${JSON.stringify(cpT && cpT.data && { running: cpT.data.running, secondsLeft: cpT.data.secondsLeft })})`);
    ok(await sameBoards(A.p, B.p), 'and the boards match');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: deletions and edits, and stacking (scenarios 20–23, 31)', async (browser) => {
    const errors = [], DAY = 864e5;
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await renamePage(A.p, 'Morning');
    const n1 = await addNote(A.p, 'Seating plan'), n2 = await addNote(A.p, 'Lunch list');
    for (const [name, notes] of [['Math', ['Math warm-up']], ['Art', ['Art: paints', 'Art: brushes']]]) {
      await A.p.evaluate(name => window.__board21.pages.create({ end: true, name }), name); await A.p.waitForTimeout(700);
      for (const t of notes) await addNote(A.p, t);
    }
    const first = p => p.evaluate(async () => { const P = window.__board21.pages; if (P.ids()[0] !== window.__board21.state.boardId) { await P.go(P.ids()[0]); await new Promise(r => setTimeout(r, 800)); } });
    await first(A.p);
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B); await first(B.p);
    const names = async p => Object.values(await shownBoard(p)).map(x => x.name).sort().join();
    ok(await names(B.p) === 'Art,Math,Morning' && await sameBoards(A.p, B.p), 'three pages on both');
    const wins = await winList(A.p), widOf = t => wins.find(x => x.data && x.data.text === t).wid;
    const pageOf = async (p, name) => p.evaluate(name => { const P = window.__board21.pages; const b = P.ids().find(b => P.name(b) === name); return { b, uid: P.info.get(b).uid }; }, name);
    // Content saved for a window on any page (its records, as a merge or another tab would find them).
    const putData = async (p, wid, text) => { const x = (await winList(p)).find(y => y.wid === wid); await p.evaluate(([b, ik, text]) => window.__board21.writer.put(`data:${b}:${ik}`, 'data', { text }), [x.b, x.ikey, text]); await p.waitForTimeout(1000); };
    const dropPage = async (p, name) => { const { b } = await pageOf(p, name); await p.evaluate(async b => { const P = window.__board21.pages; P.drop([b]); await P.purge([b]); }, b); await p.waitForTimeout(300); };

    // ---- 20. A window deleted on the laptop and edited on the smartboard: it stays everywhere, with the edit.
    const w1 = widOf('Seating plan');
    await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), n1); await A.p.waitForTimeout(300); await syncNow(A.p);
    await typeNote(B.p, await ikOf(B.p, w1), 'Seating plan, fixed on the smartboard'); await syncNow(B.p);
    await exchange(A, B);
    ok((await winList(A.p)).some(x => x.wid === w1 && x.data.text === 'Seating plan, fixed on the smartboard') && await sameBoards(A.p, B.p), 'a window deleted on the laptop and edited on the smartboard stays everywhere, with the edit');

    // ---- 21. A page deleted on the laptop while a window on it is edited on the smartboard: the whole page comes back
    // on the laptop, which says why.
    const math = await pageOf(A.p, 'Math');
    await dropPage(A.p, 'Math'); await syncNow(A.p);
    ok(!(await shownBoard(A.p))[math.uid], 'the laptop deletes Math');
    await putData(B.p, widOf('Math warm-up'), 'Math warm-up: 7 × 8'); await syncNow(B.p);
    await hear(A.p);
    await exchange(A, B);
    const m21 = (await shownBoard(A.p))[math.uid];
    ok(!!m21 && Object.values(m21.wins).some(x => x.data && x.data.text === 'Math warm-up: 7 × 8') && await sameBoards(A.p, B.p), 'the whole page comes back on the laptop, with the smartboard’s edit');
    ok((await heard(A.p)).includes('“Math” is back. It was changed on the smartboard before the deletion reached it.'), `and the laptop says why (${(await heard(A.p)).join(' | ')})`);

    // ---- 22. A page deleted on the laptop while the smartboard only taps one window on it (z) and closes another: it
    // stays deleted.
    const art = await pageOf(B.p, 'Art');
    await B.p.evaluate(async b => { const W = window.__board21; await W.pages.go(b); await new Promise(r => setTimeout(r, 800)); const ks = Array.from(W.state.insts.keys()); for (let i = 0; i < 5; i++) W.focusWin(ks[0]); W.closeWin(ks[1], { quiet: true }); }, art.b);
    await B.p.waitForTimeout(600); await syncNow(B.p);
    await dropPage(A.p, 'Art'); await syncNow(A.p);
    for (let i = 0; i < 2; i++) await exchange(A, B);
    ok(await eventually(async () => { await syncNow(B.p); return !(await shownBoard(B.p))[art.uid] && !(await shownBoard(A.p))[art.uid]; }, 15000) && await names(A.p) === 'Math,Morning',
      'a page deleted on the laptop stays deleted when the smartboard only tapped or closed windows on it');
    await exchange(A, B);
    ok(await sameBoards(A.p, B.p), 'and the boards match');
    await first(A.p); await first(B.p);

    // ---- 23. The same window deleted on both: deleted. Its deletion is forgotten only once both files show it and 30
    // days have passed; a stale file arriving afterwards doesn't bring it back.
    const w2 = widOf('Lunch list'), nameA = await ownFile(A.p), stale = await fileText(A.p, nameA);
    await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), n2); await A.p.waitForTimeout(300); await syncNow(A.p);
    await B.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), await ikOf(B.p, w2)); await B.p.waitForTimeout(300); await syncNow(B.p);
    await exchange(A, B);
    const holds = async p => (await ownJSON(p)).sync.gone.windows.some(t => t.wid === w2);
    ok(!(await winList(A.p)).some(x => x.wid === w2) && !(await winList(B.p)).some(x => x.wid === w2) && await holds(A.p) && await holds(B.p), 'the same window deleted on both: deleted, and both files say so');
    for (const p of [A.p, B.p]) await setClock(p, 29 * DAY);
    await exchange(A, B);
    ok(await holds(A.p) && await holds(B.p), 'after 29 days both still remember the deletion');
    for (const p of [A.p, B.p]) await setClock(p, 31 * DAY);
    await exchange(A, B); await exchange(A, B);
    ok(!await holds(A.p) && !await holds(B.p), 'after 30 days, with both files showing it, both forget it');
    await putText(B.p, nameA.replace(/\.21board$/, ' (1).21board'), stale); await putText(B.p, nameA, stale);
    await syncNow(B.p); await syncNow(B.p);
    ok(!(await winList(B.p)).some(x => x.wid === w2), 'a stale file of the laptop’s arriving afterwards doesn’t bring it back');
    for (const p of [A.p, B.p]) await setClock(p, 0);
    await putText(B.p, nameA.replace(/\.21board$/, ' (1).21board'), null);
    await exchange(A, B);

    // ---- 31. Stacking: the smartboard's windows climb into the hundreds (z isn't synced). A Timer opened on the laptop
    // and a window moved there show on top on the smartboard. A copy with no free spot goes just under its original.
    await addNote(B.p, 'Tapped all day');
    const ks = await B.p.evaluate(() => Array.from(window.__board21.state.insts.entries()).filter(([, i]) => i.open).map(([k]) => k));
    await B.p.evaluate(ks => { for (let i = 0; i < 300; i++) window.__board21.focusWin(ks[i % ks.length]); }, ks);
    await B.p.waitForTimeout(800); await syncNow(B.p);
    const zTopB = Math.max(...(await B.p.evaluate(() => Array.from(window.__board21.state.insts.values()).map(i => i.z))));
    ok(zTopB >= 100, `the smartboard’s windows are stacked in the hundreds (${zTopB})`);
    const tm = await addWin(A.p, 'timer'), tmWid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, tm);
    const mv = (await winList(A.p)).find(x => x.wid === w1);
    await A.p.evaluate(([ik, r]) => window.__board21.setRect(ik, Object.assign({}, r, { x: r.x + 120 })), [await ikOf(A.p, w1), mv.rect]); await A.p.waitForTimeout(400);
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    const zB = await B.p.evaluate(([a, b]) => { const z = w => { for (const i of window.__board21.state.insts.values()) if (i.wid === w) return i.z; return null; }; return [z(a), z(b)]; }, [tmWid, w1]);
    ok(zB[0] > zTopB && zB[1] > zTopB, `a Timer opened on the laptop and a window moved there show on top on the smartboard (${zB.join(', ')} over ${zTopB})`);
    // (the note fills the board, so its copy has no free spot)
    const big = await A.p.evaluate(ik => { const W = window.__board21, v = W.boundsRect(); W.setRect(ik, { x: v.x, y: v.y, w: v.w, h: v.h }); return W.state.insts.get(ik).rect; }, await ikOf(A.p, w1));
    await A.p.waitForTimeout(400); await exchange(A, B);
    await typeNote(A.p, await ikOf(A.p, w1), 'Seating plan, the laptop’s'); await syncNow(A.p);
    await typeNote(B.p, await ikOf(B.p, w1), 'Seating plan, the smartboard’s'); await syncNow(B.p);   // (the later one: the laptop makes the copy)
    await deliver(B.p, A.p); await syncNow(A.p);
    const z31 = await A.p.evaluate(w => { let o = null, c = null; for (const i of window.__board21.state.insts.values()) { if (i.wid === w) o = i; else if (i.copyOf && i.copyOf.wid === w) c = i; } return o && c ? { o: [o.z, o.rect], c: [c.z, c.rect] } : null; }, w1);
    ok(!!z31 && z31.c[0] < z31.o[0] && big.w > 0, `a copy with no free spot goes just under its original (${JSON.stringify(z31 && [z31.o[0], z31.c[0]])})`);
    await exchange(A, B);
    ok(await sameBoards(A.p, B.p), 'and the boards match');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: typing, a Name Picker show, two tabs, and the race guard (scenarios 44, 46–48)', async (browser) => {
    const errors = [];
    const blur = p => p.evaluate(() => { const a = document.activeElement; if (a && a.tagName === 'IFRAME') a.blur(); });
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors, { focus: 30000 });
    const n = await addNote(A.p, 'Story: once upon a time');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const w = (await winList(A.p))[0].wid, nB = await ikOf(B.p, w);
    const keyB = `data:${(await winList(B.p)).find(x => x.wid === w).b}:${nB}`;
    ok(!!nB && await sameBoards(A.p, B.p), 'the smartboard has the laptop’s note');

    // ---- 44. Typing on the smartboard in a note the laptop changes: the change waits while the smartboard types, then
    // the clash rule keeps both; nothing typed is lost.
    await typeNote(A.p, n, 'Story: once upon a time, on the laptop'); await syncNow(A.p);
    await fillNote(B.p.frameLocator(`.win[data-ikey="${nB}"] iframe`), 'Story: typed on the smartboard');   // (the keyboard stays in it)
    await B.p.waitForTimeout(300);
    await deliver(A.p, B.p); await syncNow(B.p);
    ok(await noteOf(B.p, nB) === 'Story: typed on the smartboard' && !(await copiesOf(B.p)).length, 'while the smartboard types in the note, the laptop’s change to it waits');
    await blur(B.p); await B.p.waitForTimeout(1200);
    await exchange(A, B);
    const all44 = await notesText(B.p);
    ok(all44.includes('Story: typed on the smartboard') && all44.includes('Story: once upon a time, on the laptop') && (await copiesOf(B.p)).length === 1 && await sameBoards(A.p, B.p),
      'once it is left alone, both versions are kept (one in a labelled copy): nothing typed is lost');
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);
    // A Name Picker show saves first and runs up to 10 s: its window stays busy for LINK_BUSY_MS (12 s) after a save,
    // so a merge doesn't cut the show short.
    const np = await addWin(A.p, 'name-picker'), npWid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, np);
    const names = { names: ['Ana', 'Ben', 'Cy'], left: null, picked: [], pickId: null, current: null };
    await saveData(A.p, np, names); await exchange(A, B);
    const npB = await ikOf(B.p, npWid);
    await syncWaits(B.p, { busy: 12000, focus: 30000 });
    await saveData(A.p, np, Object.assign({}, names, { names: ['Ana', 'Ben', 'Cy', 'Dee'] })); await syncNow(A.p);
    await B.p.evaluate(([ik, v]) => { const W = window.__board21; return W.writer.put(`data:${W.state.boardId}:${ik}`, 'data', v); }, [npB, Object.assign({}, names, { picked: ['Ben'], pickId: 'p1', current: 'Ben' })]);   // (the show starts: saved first)
    await B.p.waitForTimeout(1500);
    await deliver(A.p, B.p); await syncNow(B.p);
    const npData = async () => ((await winList(B.p)).find(x => x.wid === npWid) || {}).data || {};
    ok((await npData()).current === 'Ben' && (await npData()).names.length === 3, 'a merge that arrives during a Name Picker show leaves that window alone');
    await syncWaits(B.p, { focus: 30000 });
    await B.p.waitForTimeout(1000); await exchange(A, B);
    ok((await winList(B.p)).filter(x => x.widgetId === 'name-picker').some(x => x.data && x.data.names && x.data.names.length === 4), 'after the show, the laptop’s change arrives (the clash rule: both kept)');
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);

    // ---- 46. Two tabs on the smartboard, one with a change waiting as a merge lands: not dropped, and a clash keeps both.
    const B2 = await B.c.newPage(); B2.on('pageerror', e => errors.push('smartboard tab 2: ' + e.message));
    await B2.goto(BASE); await boardUp(B2); await B2.waitForTimeout(800);
    await typeNote(A.p, n, 'Story: the laptop’s ending'); await syncNow(A.p); await deliver(A.p, B.p);
    await B2.evaluate(([key, text]) => { const W = window.__board21.writer; W.pending.set(key, W.based(key, { type: 'data', value: { text } })); }, [keyB, 'Story: typed in the other tab']);
    await syncNow(B.p); await B2.waitForTimeout(1000);
    ok(await B2.evaluate(k => window.__board21.writer.pending.has(k), keyB), 'the other tab’s waiting change isn’t dropped when the merge lands');
    await B2.evaluate(() => window.__board21.writer.run()); await B2.waitForTimeout(1200);
    await exchange(A, B);
    const all46 = await notesText(A.p);
    ok(all46.includes('Story: typed in the other tab') && all46.includes('Story: the laptop’s ending') && await sameBoards(A.p, B.p), 'it is written, and the clash keeps both versions, on both devices');
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);

    // ---- 47. Two tabs on the smartboard, one with a settings change waiting (Lock), as a merge deletes one page and adds
    // another: the deleted page stays deleted, and the order is the same on both devices.
    await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Extra' })); await A.p.waitForTimeout(700);
    await A.p.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0])); await A.p.waitForTimeout(800);
    await exchange(A, B);
    const order = p => p.evaluate(() => window.__board21.pages.ids().map(b => window.__board21.pages.name(b)).join(','));
    ok(await order(B.p) === await order(A.p) && /Extra/.test(await order(B.p)), 'two pages on both');
    const extra = await A.p.evaluate(() => { const P = window.__board21.pages; return P.ids().find(b => P.name(b) === 'Extra'); });
    await A.p.evaluate(async b => { const P = window.__board21.pages; P.drop([b]); await P.purge([b]); P.create({ end: true, name: 'Added' }); }, extra);
    await A.p.waitForTimeout(800);
    await A.p.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0])); await A.p.waitForTimeout(800); await syncNow(A.p);
    await B2.evaluate(() => { const W = window.__board21.writer; W.pending.set('settings', W.based('settings', { type: 'settings', patch: { set: { locked: true } } })); });
    await deliver(A.p, B.p); await syncNow(B.p); await B2.waitForTimeout(600);
    await B2.evaluate(() => window.__board21.writer.run()); await B2.waitForTimeout(1200);
    const st = await B.p.evaluate(async () => (await window.__board21.store.getMany(['settings']))[0].value);
    await exchange(A, B);
    ok(st.locked === true && !/Extra/.test(await order(B.p)) && /Added/.test(await order(B.p)) && await order(B.p) === await order(A.p),
      `the other tab’s Lock is saved, the deleted page stays deleted, and the order is the same on both (${await order(B.p)} / ${await order(A.p)})`);
    await B.p.evaluate(() => { const W = window.__board21; W.state.settings.locked = false; return W.writer.patch('settings', 'settings', { set: { locked: false } }); });
    await B2.close(); await B.p.waitForTimeout(600);

    // ---- 48. The race guard: a widget save just after a merged write (within LINK_RACE_MS) makes a copy, not an
    // overwrite. An Undo tapped within a second of the merge sticks.
    const c48 = (await copiesOf(B.p)).length;
    await typeNote(A.p, n, 'Story: the laptop’s new start'); await syncNow(A.p); await deliver(A.p, B.p);
    await syncNow(B.p);
    await fillNote(B.p.frameLocator(`.win[data-ikey="${nB}"] iframe`), 'Story: typed on the smartboard just then');   // (saved just after the merge's write, by a note that hadn't shown it yet)
    await blur(B.p); await B.p.waitForTimeout(1000);
    await exchange(A, B);
    const all48 = await notesText(A.p);
    ok(all48.includes('Story: typed on the smartboard just then') && all48.includes('Story: the laptop’s new start') && (await copiesOf(A.p)).length === c48 + 1 && await sameBoards(A.p, B.p),
      'a widget save just after a merged write makes a copy, not an overwrite');
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);
    const textB = async () => ((await winList(B.p)).find(x => x.wid === w).data || {}).text, shownB = await textB();
    await B.p.evaluate(() => window.__board21.mergeUI.drop());
    await typeNote(A.p, n, 'Story: undone on the smartboard'); await syncNow(A.p); await deliver(A.p, B.p);
    await syncNow(B.p);
    await B.p.locator('#toasts .toast', { hasText: 'Updated from the laptop.' }).locator('button', { hasText: 'Undo' }).click();   // (at once)
    ok(await eventually(async () => await textB() === shownB && await noteOf(B.p, nB) === shownB), 'an Undo tapped at once puts the note back');
    await B.p.waitForTimeout(800);
    await exchange(A, B);
    ok(await textB() === shownB && !/undone on the smartboard/.test(await notesText(A.p)) && !(await copiesOf(A.p)).length && await sameBoards(A.p, B.p), 'and it sticks, on both, with no copy');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board Sync: Undo, Board history and messages (scenarios 56–58)', async (browser) => {
    const errors = [], MIN = 60e3;
    // (typing here starts at once after a merge: race, the guard of scenario 48, is kept short so it isn't taken for a save of the old text)
    const A = await syncDev(browser, 'the laptop', errors, { race: 200 }), B = await syncDev(browser, 'the smartboard', errors, { race: 200 });
    await renamePage(A.p, 'Morning');
    const m1 = await addNote(A.p, 'Morning note'), gone = await addNote(A.p, 'Delete me later');
    for (const [name, text] of [['Math', 'Math note'], ['Art', 'Art note'], ['Music', 'Music note']]) {
      await A.p.evaluate(name => window.__board21.pages.create({ end: true, name }), name); await A.p.waitForTimeout(700); await addNote(A.p, text);
    }
    const go = (p, name) => p.evaluate(async name => { const P = window.__board21.pages, b = P.ids().find(b => P.name(b) === name); if (b !== window.__board21.state.boardId) { await P.go(b); await new Promise(r => setTimeout(r, 800)); } return P.info.get(b).uid; }, name);
    await go(A.p, 'Morning');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const morning = await go(B.p, 'Morning');
    ok(Object.keys(await shownBoard(B.p)).length === 4 && await sameBoards(A.p, B.p), 'four pages on both');
    const all = await winList(A.p), widOf = t => all.find(x => x.data && x.data.text === t).wid;
    const textOf = async (p, wid) => (((await winList(p)).find(x => x.wid === wid) || {}).data || {}).text;
    const putData = async (p, wid, text) => { const x = (await winList(p)).find(y => y.wid === wid); await p.evaluate(([b, ik, text]) => window.__board21.writer.put(`data:${b}:${ik}`, 'data', { text }), [x.b, x.ikey, text]); await p.waitForTimeout(1000); };
    const dropPage = async (p, name) => { await p.evaluate(async name => { const P = window.__board21.pages, b = P.ids().find(b => P.name(b) === name); P.drop([b]); await P.purge([b]); }, name); await p.waitForTimeout(300); };
    const toastOf = (p, text) => p.locator('#toasts .toast', { hasText: text });
    const fresh = async () => { await B.p.evaluate(() => { window.__board21.mergeUI.drop(); document.getElementById('toasts').innerHTML = ''; }); await hear(B.p); };
    const lock = (p, on) => p.evaluate(on => { const W = window.__board21; W.state.settings.locked = on; return W.writer.patch('settings', 'settings', { set: { locked: on } }); }, on);
    const wMorning = widOf('Morning note'), wMath = widOf('Math note');

    // ---- 56. Undo of a merge on the smartboard undoes the page shown only.
    await typeNote(A.p, m1, 'Morning note, from the laptop'); await putData(A.p, wMath, 'Math note, from the laptop'); await syncNow(A.p);
    await fresh(); await deliver(A.p, B.p); await syncNow(B.p);
    await toastOf(B.p, 'Updated from the laptop.').locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => await textOf(B.p, wMorning) === 'Morning note') && await textOf(B.p, wMath) === 'Math note, from the laptop', 'Undo of a merge undoes the page shown only (Math keeps the laptop’s change)');
    await B.p.waitForTimeout(600); await exchange(A, B);
    ok(await textOf(A.p, wMorning) === 'Morning note' && await sameBoards(A.p, B.p), 'and the laptop gets the Undo');
    // Pages the merge added have no Undo.
    await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Added on the laptop' })); await A.p.waitForTimeout(700); await go(A.p, 'Morning'); await syncNow(A.p);
    await fresh(); await deliver(A.p, B.p); await syncNow(B.p);
    ok((await heard(B.p)).includes('“Added on the laptop” was added on the laptop.') && await toastOf(B.p, 'was added on the laptop').locator('button').count() === 0, `a page added on the laptop: said, with no Undo (${(await heard(B.p)).join(' | ')})`);
    // Undo of a clash swaps: this device's version goes back in the window, and the laptop's stays, as the copy.
    await typeNote(B.p, await ikOf(B.p, wMorning), 'Morning: the smartboard’s plan'); await syncNow(B.p);
    await typeNote(A.p, m1, 'Morning: the laptop’s plan'); await syncNow(A.p);   // (the later one)
    await fresh(); await deliver(A.p, B.p); await syncNow(B.p);
    ok((await heard(B.p)).includes('Notes was changed here and on the laptop at once. Both versions are kept.'), `a clash on the page shown says both versions are kept (${(await heard(B.p)).join(' | ')})`);
    const devA = await A.p.evaluate(() => window.__board21.link.dev());
    let cp = (await copiesOf(B.p)).find(x => x.copyOf.wid === wMorning);
    ok(await textOf(B.p, wMorning) === 'Morning: the laptop’s plan' && cp && cp.data.text === 'Morning: the smartboard’s plan', 'the laptop’s text is in the window, the smartboard’s in the copy');
    await toastOf(B.p, 'at once. Both versions are kept').locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => { cp = (await copiesOf(B.p)).find(x => x.copyOf.wid === wMorning); return await textOf(B.p, wMorning) === 'Morning: the smartboard’s plan' && cp && cp.data.text === 'Morning: the laptop’s plan' && cp.copyOf.from === devA; }),
      'Undo swaps them: the smartboard’s text back in the window, and the laptop’s kept as the copy, labelled as the laptop’s');
    await B.p.waitForTimeout(600); await exchange(A, B);
    ok(await textOf(A.p, wMorning) === 'Morning: the smartboard’s plan' && (await copiesOf(A.p)).some(x => x.data.text === 'Morning: the laptop’s plan') && await sameBoards(A.p, B.p), 'the same on the laptop: its version is never removed');
    for (const x of await copiesOf(A.p)) await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), x.ikey);
    await A.p.waitForTimeout(400); await exchange(A, B);
    // No Undo while windows are locked.
    await lock(B.p, true);
    await typeNote(A.p, m1, 'Morning note, locked board'); await syncNow(A.p);
    await fresh(); await deliver(A.p, B.p); await syncNow(B.p);
    ok((await heard(B.p)).includes('Updated from the laptop.') && await toastOf(B.p, 'Updated from the laptop.').locator('button').count() === 0, `while windows are locked, the update has no Undo (${(await heard(B.p)).join(' | ')})`);
    // The page shown deleted on a locked board: the message points to Board history › Deleted pages.
    const art = await go(B.p, 'Art'); await fresh();
    await dropPage(A.p, 'Art'); await syncNow(A.p); await deliver(A.p, B.p);
    ok(await eventually(async () => { await syncNow(B.p); return (await heard(B.p)).includes('“Art” was deleted on the laptop. Find it in Board history › Deleted pages.'); }, 15000) && !(await shownBoard(B.p))[art],
      `the page shown, deleted on a locked board: “… Find it in Board history › Deleted pages.” (${(await heard(B.p)).join(' | ')})`);
    ok(await toastOf(B.p, 'Find it in Board history › Deleted pages.').locator('button').count() === 0, 'with no Undo');
    // Unlocked: the Undo of a deleted page brings it back, and goes back to it.
    await lock(B.p, false);
    const music = await go(B.p, 'Music'); await fresh();
    await dropPage(A.p, 'Music'); await syncNow(A.p); await deliver(A.p, B.p);
    ok(await eventually(async () => { await syncNow(B.p); return (await heard(B.p)).includes('“Music” was deleted on the laptop.'); }, 15000), 'unlocked, the page shown deleted on the laptop: said, with Undo');
    await toastOf(B.p, '“Music” was deleted on the laptop.').locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => await B.p.evaluate(() => window.__board21.state.board.uid) === music), 'its Undo brings it back and goes back to it');
    await B.p.waitForTimeout(800); await exchange(A, B);
    ok(!!(await shownBoard(A.p))[music] && await sameBoards(A.p, B.p), 'and it is back on the laptop too');
    await go(A.p, 'Morning'); await go(B.p, 'Morning');

    // ---- 57. Board history: a version before a merge that deletes a window. An hour of typing on the laptop with
    // nothing changed on the smartboard: at most two versions of that page before changes from the laptop.
    const merges = () => B.p.evaluate(uid => window.__board21.history.metas.filter(m => m.uid === uid && m.label === 'Before changes from the laptop'), morning);
    const ikGoneB = await ikOf(B.p, widOf('Delete me later')), c57 = (await merges()).length;
    await A.p.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), gone); await A.p.waitForTimeout(300); await syncNow(A.p);
    await deliver(A.p, B.p); await syncNow(B.p);
    const v57 = (await merges())[0];
    ok((await merges()).length === c57 + 1 && !!v57 && !!v57.wins[ikGoneB], 'a merge that deletes a window: a version with it first');
    const c57b = (await merges()).length;
    for (let i = 1; i <= 7; i++) {
      for (const p of [A.p, B.p]) await setClock(p, i * 10 * MIN);
      await typeNote(A.p, m1, `Morning note, typed for ${i * 10} minutes`); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    }
    const n57 = (await merges()).length - c57b;
    ok(n57 >= 1 && n57 <= 2 && /typed for 70 minutes/.test(await textOf(B.p, wMorning)), `an hour of typing on the laptop, nothing changed on the smartboard: ${n57} version(s) of the page there, at most two`);
    // With Board history full on the smartboard, a rename clash on that page waits, the status says so, and it applies
    // once a version can be saved.
    await B.p.evaluate(() => { const H = window.__board21.history; H.__tx = H.tx; H.tx = function (stores, mode, fn) { if (mode === 'readwrite' && stores.includes('body')) return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')); return H.__tx.call(this, stores, mode, fn); }; H.__thin = H.thin; H.thin = async () => false; });
    await renamePage(B.p, 'Morning (smartboard)'); await syncNow(B.p);
    await renamePage(A.p, 'Morning (laptop)'); await syncNow(A.p);   // (the later one)
    await deliver(A.p, B.p); await syncNow(B.p);
    const status = () => B.p.evaluate(() => window.__board21.link.status());
    ok((await shownBoard(B.p))[morning].name === 'Morning (smartboard)' && /Changes to “Morning \(smartboard\)” from the laptop wait until Board history can save a version on this device\. It may be full\./.test(await status(B.p)),
      `with Board history full, the rename clash waits, and the status says so (“${await status(B.p)}”)`);
    await B.p.evaluate(() => { const H = window.__board21.history; H.tx = H.__tx; H.thin = H.__thin; H.paused = ''; });
    await syncNow(B.p);
    ok((await shownBoard(B.p))[morning].name === 'Morning (laptop)' && !/wait until Board history/.test(await status(B.p)), 'once a version can be saved, it applies');
    await exchange(A, B);

    // ---- 58. A co-teacher typing on the laptop for a while: one message on the smartboard, updated in place (not a new
    // one each time). Another page changed quietly says so once when it is next shown.
    await syncWaits(B.p, { toast: 60000 });
    await fresh();
    await B.p.evaluate(() => { window.__nodes = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__nodes.push(n.textContent); }).observe(document.getElementById('toasts'), { childList: true }); });
    const nodes = re => B.p.evaluate(src => window.__nodes.filter(t => new RegExp(src).test(t)).length, re.source);
    for (let i = 0; i < 6; i++) { await typeNote(A.p, m1, `Co-teacher typing, part ${i}`); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p); }
    ok(/part 5/.test(await textOf(B.p, wMorning)) && await nodes(/^Updated from the laptop/) === 1 && await B.p.locator('#toasts .toast').count() === 1, `six updates: one message, updated in place (${await nodes(/^Updated from/)} new)`);
    await putData(A.p, wMath, 'Math note, changed quietly'); await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await textOf(B.p, wMath) === 'Math note, changed quietly' && await nodes(/Math|^Changed on/) === 0, 'another page changed: nothing said while it isn’t shown');
    await go(B.p, 'Math');
    ok(await eventually(async () => await nodes(/^Changed on the laptop (at|on) /) === 1) && await toastOf(B.p, 'Changed on the laptop').locator('button', { hasText: 'Board history' }).count() === 1, 'shown, it says “Changed on the laptop …”, with Board history');
    await go(B.p, 'Morning (laptop)'); await go(B.p, 'Math');
    await B.p.waitForTimeout(600);
    ok(await nodes(/^Changed on the laptop/) === 1, 'once only');
    for (const p of [A.p, B.p]) await setClock(p, 0);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],

  // Tyler's decision 5: the theme and accent color are the board's, on every device linked to the folder (the later
  // change wins, as for a page's name); the clock, Lock and Stay awake stay on each device.
  ['Board Sync: theme and accent color on every device (a change and what it says, Settings open, Auto back, locked, another tab, kiosk, a fresh smartboard, the hints)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    // theme, accent, and what the board shows: dark or light, and its accent shade
    const look = p => p.evaluate(() => { const s = window.__board21.state.settings, a = window.__board21.accentNow ? window.__board21.accentNow() : s.accent;
      return `${s.theme} ${a} ${document.body.classList.contains('dark') ? 'dark' : 'light'} ${document.body.style.getPropertyValue('--focus-ring').trim() || 'built-in'}`; });
    const hints = p => p.evaluate(() => {
      const hint = act => { const b = document.querySelector(`#settings [data-act="${act}"]`), r = b && b.closest('.row'), h = r && r.querySelector('.hint'); return h ? h.textContent.trim() : ''; };
      return { theme: hint('theme'), accent: hint('accent'), clock: hint('clock'), awake: hint('awake') };
    });
    const pick = async (p, act, val) => { await p.click(`#settings [data-act="${act}"][data-val="${val}"]`); await p.waitForTimeout(300); };
    const said = (p, text) => p.locator('#toasts .toast', { hasText: text });

    await openSettings(A.p);
    const h0 = await hints(A.p);
    ok(h0.theme === '' && h0.accent === '' && !/This device only/.test(h0.clock + h0.awake), `not linked: no hint beside Theme or Accent color (${JSON.stringify(h0)})`);
    await A.p.keyboard.press('Escape');
    await addNote(A.p, 'Morning meeting');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    await openSettings(A.p);
    const h1 = await hints(A.p);
    ok(h1.theme === 'On all your devices.' && h1.accent === 'On all your devices.' && h1.clock === 'This device only.' && h1.awake === 'This device only.',
      `linked: “On all your devices.” beside Theme and Accent color; the clock and Stay awake still “This device only.” (${JSON.stringify(h1)})`);
    const accentRow = await A.p.evaluate(() => {
      const row = document.querySelector('#settings .accent-row'), r = document.createRange();
      r.selectNodeContents(row.querySelector('.hint'));
      return { swatchLines: new Set(Array.from(row.querySelectorAll('.swatch'), b => Math.round(b.getBoundingClientRect().top))).size, hintLines: r.getClientRects().length };
    });
    ok(accentRow.swatchLines === 1 && accentRow.hintLines === 1, `the Accent color row’s choices stay on one line, its six colors and Custom…, and the hint under its name on one (${JSON.stringify(accentRow)})`);
    ok(await look(A.p) === 'system blue light built-in' && await look(B.p) === 'system blue light built-in', '(both start with Auto and Blue)');

    // The laptop sets Dark and Green while Settings is open on the smartboard, scrolled down, the keyboard on Auto.
    await openSettings(B.p);
    await B.p.evaluate(() => { const body = document.querySelector('#settings .sheet-body'); body.scrollTop = 0; body.scrollTop = Math.min(220, body.scrollHeight - body.clientHeight); });
    await B.p.focus('#settings [data-act="theme"][data-val="system"]');
    const top0 = await B.p.evaluate(() => document.querySelector('#settings .sheet-body').scrollTop);
    // (Settings isn't drawn again for it, and nothing in it moves: the choices are put in place; the grey line goes on
    // saying how things stand)
    await B.p.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body');
      window.__drawn = 0; window.__ys = []; window.__lines = [];
      new MutationObserver(ms => { if (ms.some(m => m.target === body)) window.__drawn++; }).observe(body, { childList: true });
      const look = () => {
        window.__ys.push(['hist-open', 'theme', 'accent'].map(a => Math.round(document.querySelector(`#settings [data-act="${a}"]`).getBoundingClientRect().top)).join());
        const t = document.getElementById('set-link-status').textContent;
        if (!window.__lines.includes(t)) window.__lines.push(t);
      };
      look(); window.__poll = setInterval(look, 40);
    });
    await hear(B.p);
    await pick(A.p, 'theme', 'dark'); await pick(A.p, 'accent', 'green');
    ok(await look(A.p) === 'dark green dark #4ade80', `(the laptop is dark and green: ${await look(A.p)})`);
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await look(B.p) === 'dark green dark #4ade80', `the smartboard turns dark and green within a round (${await look(B.p)})`);
    const nb = (await winList(B.p))[0].ikey;
    const wAccent = await B.p.frameLocator(`.win[data-ikey="${nb}"] iframe`).locator('html').evaluate(e => e.style.getPropertyValue('--b21-accent'));
    ok(wAccent === '#4ade80', `and its widgets get the new accent (${wAccent})`);
    ok((await heard(B.p)).includes('The laptop changed the theme to Dark and the accent color to Green.'), `it says “The laptop changed the theme to Dark and the accent color to Green.” (${(await heard(B.p)).join(' | ')})`);
    ok(await said(B.p, 'The laptop changed the theme').locator('button').count() === 0, 'with no Undo (changing it back in Settings is one tap)');
    const sb = await B.p.evaluate(() => ({ dark: document.querySelector('#settings [data-act="theme"][data-val="dark"]').getAttribute('aria-checked'), green: document.querySelector('#settings [data-act="accent"][data-val="green"]').getAttribute('aria-checked'),
      focus: `${document.activeElement.dataset.act}=${document.activeElement.dataset.val}`, top: document.querySelector('#settings .sheet-body').scrollTop,
      shade: document.querySelector('#settings [data-act="accent"][data-val="green"]').style.backgroundColor }));   // (as set: the shown one fades to it)
    ok(sb.dark === 'true' && sb.green === 'true' && sb.focus === 'theme=system' && Math.abs(sb.top - top0) <= 2 && sb.shade === 'rgb(74, 222, 128)',
      `Settings open on the smartboard shows Dark and Green chosen (the swatches in their dark shades), with the keyboard where it was and the same scroll (${JSON.stringify(sb)}; was ${top0})`);
    const quiet = await B.p.evaluate(() => { clearInterval(window.__poll); return { drawn: window.__drawn, ys: Array.from(new Set(window.__ys)), lines: window.__lines }; });
    ok(quiet.drawn === 0 && quiet.ys.length === 1, `put in place: Settings isn’t drawn again, and its rows don’t move (${quiet.drawn} drawings; y ${quiet.ys.join(' → ')})`);
    ok(quiet.lines.every(t => /^Up to date\. .*Shared with the laptop\. Last change at /.test(t)), `the grey line goes on saying “Up to date…”, with the laptop’s last change (${quiet.lines.join(' | ')})`);
    const fileA = await ownJSON(A.p), devA = await A.p.evaluate(() => window.__board21.link.dev());
    ok(fileA.theme === 'dark' && fileA.accent === 'green' && fileA.sync.style.theme[0] === devA && fileA.sync.style.accent[0] === devA, `the laptop’s file has them, and their versions (${JSON.stringify(fileA.sync.style)})`);

    // The smartboard sets Auto: the laptop follows, and says so.
    await hear(A.p);
    await pick(B.p, 'theme', 'system');
    await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
    ok(await look(A.p) === 'system green light #15803d' && await look(B.p) === 'system green light #15803d', `the smartboard sets Auto: the laptop follows (${await look(A.p)})`);
    ok((await heard(A.p)).includes('The smartboard changed the theme to Auto.'), `and says “The smartboard changed the theme to Auto.” (${(await heard(A.p)).join(' | ')})`);
    ok(await A.p.evaluate(() => document.querySelector('#settings [data-act="theme"][data-val="system"]').getAttribute('aria-checked')) === 'true', 'Settings open on the laptop shows Auto');
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await look(B.p) === 'system green light #15803d', 'nothing changes back');

    // Locked, with another tab and a kiosk tab of the smartboard open: the change still applies everywhere.
    const B2 = await B.c.newPage(); B2.on('pageerror', e => errors.push('smartboard tab 2: ' + e.message)); await B2.goto(BASE); await boardUp(B2);
    const K = await B.c.newPage(); K.on('pageerror', e => errors.push('smartboard kiosk: ' + e.message)); await K.goto(BASE + '?kiosk=yes'); await boardUp(K);
    await lockBoard(B.p, 'widgets');
    ok(await B.p.evaluate(() => window.__board21.state.settings.locked === 'widgets'), '(the smartboard is locked)');
    await hear(B.p);
    // (a color of the laptop's own, with Custom…: the pink that was a choice of its own until 2026.11.18-2)
    await pick(A.p, 'theme', 'dark');
    await A.p.locator('#set-accent-custom').evaluate(el => { el.value = '#db2777'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); await A.p.waitForTimeout(300);
    const pinkA = await look(A.p);
    ok(/^dark #db2777 dark #[0-9a-f]{6}$/.test(pinkA) && pinkA !== 'dark #db2777 dark #db2777', `(the laptop is dark, in a pink of its own, a lighter shade of it shown: ${pinkA})`);
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
    ok(await look(B.p) === pinkA, `locked: the change applies, the same pink and the same shade of it (${await look(B.p)})`);
    ok((await heard(B.p)).includes('The laptop changed the theme to Dark and the accent color to a custom one.') && await said(B.p, 'The laptop changed the theme').locator('button').count() === 0, `and is said, a custom color as “a custom one”, with no button (${(await heard(B.p)).join(' | ')})`);
    const filePink = await ownJSON(A.p);
    ok(filePink && filePink.accent === 'blue' && filePink.accentColor === '#db2777', `the laptop’s file says Blue for a release before 2026.11.18-2, and the color itself (${filePink && JSON.stringify([filePink.accent, filePink.accentColor])})`);
    ok(await eventually(async () => await look(B2) === pinkA), `another tab of the smartboard follows (${await look(B2)})`);
    ok(await eventually(async () => await look(K) === pinkA), `and so does one in kiosk mode (${await look(K)})`);
    await unlockBoard(B.p);
    await B2.close(); await K.close();

    // A fresh smartboard, set up against this folder: it takes the folder's Dark and pink, and changes nobody's.
    const C = await syncDev(browser, 'the hall smartboard', errors);
    await openSettings(C.p);
    await pick(C.p, 'theme', 'light'); await pick(C.p, 'accent', 'slate');
    const h2 = await hints(C.p);
    ok(h2.theme === '' && h2.accent === '', 'a device not linked yet: no hint beside them');
    await C.p.keyboard.press('Escape');
    await deliver(A.p, C.p); await deliver(B.p, C.p); await linkFolder(C.p);
    ok(await look(C.p) === pinkA, `a fresh smartboard set up against a folder whose board is Dark and pink becomes Dark and pink (${await look(C.p)})`);
    const devC = await C.p.evaluate(() => window.__board21.link.dev()), fileC = await ownJSON(C.p);
    ok(!fileC || !fileC.sync.style || ['theme', 'accent'].every(k => !fileC.sync.style[k] || fileC.sync.style[k][0] !== devC), `its file holds no change of its own to them (${fileC && JSON.stringify(fileC.sync.style)})`);
    await exchange(A, B, C);
    ok(await look(A.p) === pinkA && await look(B.p) === pinkA, 'the laptop and the smartboard keep theirs');
    await openSettings(C.p);
    const h3 = await hints(C.p);
    ok(h3.theme === 'On all your devices.' && h3.accent === 'On all your devices.', 'and once linked, it says “On all your devices.” beside them');
    await C.p.keyboard.press('Escape');

    // Import › Replace this page takes the file's theme and accent, as before: a change made here, so it syncs. The
    // dialog says so, and the import's Undo puts them back too, on every device.
    await hear(B.p);
    const exp = await A.p.evaluate(async () => { const e = await window.__board21.buildExport('full'); e.theme = 'light'; e.accent = 'orange'; e.board = Object.assign({}, e.board, { name: 'Fractions (Ms. Lee)' }); return e; });
    fs.writeFileSync(OUT + 'colleague-light-orange.21board', JSON.stringify(exp));
    await A.p.setInputFiles('#import-input', OUT + 'colleague-light-orange.21board');
    const sub = await A.p.locator('#modal.open .btn', { hasText: 'Replace this page' }).innerText();
    ok(/This page’s windows and content are replaced, here and on your other devices\. So are the theme and accent color\. You can undo this\./.test(sub.replace(/\s+/g, ' ')), `the dialog’s Replace this page says the theme and accent color change too (${sub.replace(/\s+/g, ' ')})`);
    await A.p.locator('#modal.open .btn', { hasText: 'Replace this page' }).click();
    await A.p.locator('#toasts .toast', { hasText: 'Board imported.' }).waitFor();
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p); await deliver(A.p, C.p); await syncNow(C.p);
    ok(await look(A.p) === 'light orange light #c2410c' && await look(B.p) === 'light orange light #c2410c' && await look(C.p) === 'light orange light #c2410c',
      `Import › Replace this page with a file in Light and Orange: every device takes them (${await look(B.p)})`);
    ok((await heard(B.p)).includes('The laptop changed the theme to Light and the accent color to Orange.'), `and says so (${(await heard(B.p)).join(' | ')})`);
    await A.p.locator('#toasts .toast', { hasText: 'Board imported.' }).locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => await look(A.p) === pinkA && await A.p.evaluate(() => window.__board21.state.board.name) !== 'Fractions (Ms. Lee)'),
      `the import’s Undo brings back the page, and the theme and accent it replaced (${await look(A.p)})`);
    await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p); await deliver(A.p, C.p); await syncNow(C.p);
    ok(await look(B.p) === pinkA && await look(C.p) === pinkA, `on every device (${await look(B.p)} / ${await look(C.p)})`);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close(); await C.c.close();
  }],
  ['Board Sync: linking again: a page deleted just before Change…, while its Undo is still offered', async (browser) => {
    const errors = [];
    const lastStep = p => p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 45000 });
    const done = async p => { await p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await p.keyboard.press('Escape'); await eventually(() => p.evaluate(() => { const l = window.__board21.link; return !l.sync.mode && !l.running && !l.timers.full; }), 20000); };
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await renamePage(A.p, 'Morning'); await addNote(A.p, 'Morning note');
    await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Math' }));
    await eventually(() => A.p.evaluate(() => window.__board21.state.board.name === 'Math' && !window.__board21.pages.busy)); await addNote(A.p, 'Math note');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const names = async p => Object.values(await shownBoard(p)).map(x => x.name).sort().join();
    ok(await names(B.p) === 'Math,Morning', `(two pages on both: ${await names(B.p)})`);
    // the laptop deletes Math, and before its Undo is over (20 s) uses Change… to go to another folder
    await A.p.evaluate(() => { window.__board21.pages.remove(); });
    await A.p.locator('#modal.open .btn', { hasText: 'Delete page' }).click();
    await eventually(async () => await names(A.p) === 'Morning');
    const t0 = Date.now();
    await A.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; }); await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]'); await lastStep(A.p); await done(A.p);
    ok(Date.now() - t0 < 12000, `(Change… done within the page's Undo: ${Date.now() - t0} ms)`);
    // its Undo, tapped after Change…, brings it back on the laptop, which now syncs through Room 14: there it goes
    await A.p.locator('#toasts .toast', { hasText: 'Deleted “Math”.' }).locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => await names(A.p) === 'Math,Morning'), `its Undo, after Change…, brings Math back on the laptop (${await names(A.p)})`);
    const room14 = () => A.p.evaluate(async () => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Room 14'), out = [];
      for await (const [n, h] of d.entries()) if (/\.21board$/.test(n)) { const o = JSON.parse(await (await h.getFile()).text()); for (const e of [o].concat(o.pages || [])) if (e && e.board) out.push(e.board.name); }
      return Array.from(new Set(out)).sort().join();
    });
    await syncNow(A.p);
    ok(await eventually(async () => await room14() === 'Math,Morning'), `and into the board in Room 14 (${await room14()})`);
    await deliver(A.p, B.p); await syncNow(B.p);
    ok(await names(B.p) === 'Morning', `the folder left hears of the deletion, sent as the laptop left it: the smartboard deletes Math too (${await names(B.p)})`);
    await A.c.close(); await B.c.close();
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  }],
  ['Board Sync: linking again: the Undo of a page deleted just before Change… or Unlink, tapped while Change… switches, and what is said', async (browser) => {
    const errors = [];
    const lastStep = (p, ms = 45000) => p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: ms });
    const said = async p => (await p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    const done = async p => { await p.locator('#modal.open .btn', { hasText: 'Done' }).click(); await p.keyboard.press('Escape'); await eventually(() => p.evaluate(() => { const l = window.__board21.link; return !!l.sync && !l.sync.mode && !l.running && !l.timers.full; }), 30000); };
    // Change… (or Set up… after Unlink) to the folder named pick; returns what the last step said
    const change = async (p, pick, act = 'link-choose') => {
      await p.evaluate(pick => { window.__drive = Object.assign({}, window.__drive, { pick }); }, pick);
      await openSettings(p); await p.click(`#settings [data-act="${act}"]`);
      if (act === 'link-setup') await p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
      await lastStep(p); const t = await said(p); await done(p); return t;
    };
    const names = async p => Object.values(await shownBoard(p)).map(x => x.name).sort().join();
    const folderNames = (p, folder) => p.evaluate(async folder => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder), out = [];
      for await (const [n, h] of d.entries()) if (/\.21board$/.test(n)) { const o = JSON.parse(await (await h.getFile()).text()); for (const e of [o].concat(o.pages || [])) if (e && e.board) out.push(e.board.name); }
      return Array.from(new Set(out)).sort().join();
    }, folder);
    const folderFiles = (p, folder) => p.evaluate(async folder => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder), o = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file') o[n] = await (await h.getFile()).text(); return o; }, folder);
    const self = '“Math” was deleted on the laptop.';
    // the laptop (Morning and Math) and the smartboard, linked to 21Board
    const two = async () => {
      const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
      await renamePage(A.p, 'Morning'); await addNote(A.p, 'Morning note');
      await A.p.evaluate(() => window.__board21.pages.create({ end: true, name: 'Math' }));
      await eventually(() => A.p.evaluate(() => window.__board21.state.board.name === 'Math' && !window.__board21.pages.busy)); await addNote(A.p, 'Math note');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      await hear(A.p); await hear(B.p);
      return { A, B };
    };
    // a third device whose board ("Room 14") is in the Room 14 folder, and that folder as the laptop's Google Drive has it
    const room14 = async A => {
      const C = await syncDev(browser, 'the Room 14 laptop', errors);
      await renamePage(C.p, 'Room 14'); await addNote(C.p, 'Room 14 plans');
      await C.p.evaluate(() => { window.__drive = { pick: 'Room 14' }; }); await linkFolder(C.p);
      await seedFolder(A.p, 'Room 14', await folderFiles(C.p, 'Room 14'));
      return C;
    };
    // the laptop deletes Math, the page shown (its Undo is offered for 20 s)
    const delMath = async p => {
      await p.evaluate(() => { window.__board21.pages.remove(); });
      await p.locator('#modal.open .btn', { hasText: 'Delete page' }).click();
      await eventually(async () => await names(p) === 'Morning');
    };
    const undo = p => p.locator('#toasts .toast', { hasText: 'Deleted “Math”.' }).locator('button', { hasText: 'Undo' }).click({ force: true });   // (toasts are above the set-up dialog)
    const switching = p => eventually(() => p.evaluate(() => { const l = window.__board21.link; return !!(l.sync && l.sync.mode); }), 10000);

    {
      // Change… to a folder that has a board, and the Undo tapped while the switch is still deciding (the folder is slow
      // to list): Math comes back once Room 14's board is here, into it, and isn't taken away by the switch
      const { A, B } = await two(), C = await room14(A);
      await delMath(A.p);
      await A.p.evaluate(() => { window.__drive = { pick: 'Room 14', slow: 2500 }; });
      await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
      ok(await switching(A.p), '(Change… to Room 14 is switching)');
      await undo(A.p);
      await A.p.evaluate(() => { window.__drive.slow = 0; });
      await lastStep(A.p); const s = await said(A.p); await done(A.p);
      ok(await eventually(async () => await names(A.p) === 'Math,Room 14', 20000), `Undo tapped while Change… switches: Math comes back with Room 14’s board, not before it (${await names(A.p)}; said “${s}”)`);
      await syncNow(A.p);
      ok(await eventually(async () => (await folderNames(A.p, 'Room 14')).includes('Math')), `and goes into Room 14’s board (${await folderNames(A.p, 'Room 14')})`);
      await deliver(A.p, B.p); await syncNow(B.p);
      ok(await names(B.p) === 'Morning', `the smartboard, in 21Board, deletes it, as the laptop left it there (${await names(B.p)})`);
      await A.c.close(); await B.c.close(); await C.c.close();
    }
    {
      // Change… to an empty folder and straight back, and the Undo tapped while the switch back waits: Math comes back
      // in 21Board on both devices, and the laptop never tells itself that it deleted Math
      const { A, B } = await two();
      await delMath(A.p);
      await change(A.p, 'Room 14');
      await A.p.evaluate(() => { window.__drive = Object.assign({}, window.__drive, { pick: '21Board' }); });
      await openSettings(A.p); await A.p.click('#settings [data-act="link-choose"]');
      ok(await switching(A.p), '(Change… back to 21Board is switching)');
      const up = await A.p.locator('#toasts .toast', { hasText: 'Deleted “Math”.' }).count();
      ok(up === 1, '(the Undo is still offered)');
      if (up) await undo(A.p);
      await lastStep(A.p, 60000); await done(A.p);
      ok(await eventually(async () => await names(A.p) === 'Math,Morning', 30000), `Undo tapped while Change… back waits: Math comes back on the laptop (${await names(A.p)})`);
      await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p); await deliver(B.p, A.p); await syncNow(A.p);
      ok(await names(B.p) === 'Math,Morning' && await sameBoards(A.p, B.p), `and on the smartboard (${await names(B.p)})`);
      ok(!(await heard(A.p)).includes(self), `the laptop doesn’t say “Math” was deleted on the laptop (${(await heard(A.p)).join(' | ')})`);
      await A.c.close(); await B.c.close();
    }
    {
      // Change… to an empty folder, Undo (Math goes into Room 14), then Change… back to 21Board with Math shown: Math,
      // which the laptop deleted there as it left, goes once another page is shown, without a message naming the laptop
      const { A, B } = await two();
      await delMath(A.p);
      await change(A.p, 'Room 14');
      await undo(A.p);
      ok(await eventually(async () => await names(A.p) === 'Math,Morning'), `(Undo after Change…: Math back on the laptop, ${await names(A.p)})`);
      await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
      ok(await A.p.evaluate(() => window.__board21.pages.name(window.__board21.state.boardId)) === 'Math', '(Math is the page shown)');
      await change(A.p, '21Board');
      ok(await eventually(async () => await names(A.p) === 'Morning', 20000), `back in 21Board, Math goes on the laptop too (${await names(A.p)})`);
      await syncNow(A.p);
      ok(!(await heard(A.p)).includes(self), `with no message that “Math” was deleted on the laptop (${(await heard(A.p)).join(' | ')})`);
      await A.c.close(); await B.c.close();
    }
    {
      // Unlink, Undo, then Set up… with another folder that has a board: the last step doesn't say Math is still in
      // 21Board, where the laptop's last write deleted it
      const { A, B } = await two(), C = await room14(A);
      await delMath(A.p);
      await openSettings(A.p); await A.p.click('#settings [data-act="link-unlink"]'); await A.p.locator('#modal.open .btn', { hasText: 'Unlink' }).click();
      await eventually(() => A.p.evaluate(() => !window.__board21.link.dir)); await A.p.keyboard.press('Escape');
      await undo(A.p);
      ok(await eventually(async () => await names(A.p) === 'Math,Morning'), `(Undo after Unlink: Math back on the laptop, ${await names(A.p)})`);
      await deliver(A.p, B.p); await syncNow(B.p);
      ok(await names(B.p) === 'Morning', `(the smartboard deletes Math: ${await names(B.p)})`);
      const s = await change(A.p, 'Room 14', 'link-setup');
      ok(/This device’s other pages are still in your “21Board” folder\. “Math” was deleted there\. All of them are in Board history › Deleted pages for 30 days\./.test(s), `the last step says Math was deleted in 21Board (“${s}”)`);
      await A.c.close(); await B.c.close(); await C.c.close();
    }
    ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  }],
  ['Board Sync: theme and accent color when two devices set up one folder at once, and a choice made while a round runs', async (browser) => {
    const errors = [];
    const look = p => p.evaluate(() => { const s = window.__board21.state.settings; return `${s.theme} ${s.accent}`; });
    const styleSaid = async p => (await heard(p)).filter(t => /changed the (theme|accent)/.test(t));

    // A laptop where Dark and Green were chosen, and a brand-new smartboard (its defaults, and settings written since):
    // both set up the same new folder before Google Drive has brought either one's file, so each finds it empty.
    let A = await syncDev(browser, 'the laptop', errors);
    await openSettings(A.p);
    await A.p.click('#settings [data-act="theme"][data-val="dark"]'); await A.p.click('#settings [data-act="accent"][data-val="green"]');
    await A.p.keyboard.press('Escape');
    await addNote(A.p, 'Laptop note');
    let B = await syncDev(browser, 'the smartboard', errors);
    await linkFolder(A.p); await linkFolder(B.p);
    const modes = [await A.p.evaluate(() => (window.__board21.link.linked || {}).mode), await B.p.evaluate(() => (window.__board21.link.linked || {}).mode)];
    await hear(A.p);
    await exchange(A, B); await exchange(A, B);
    ok(modes.join() === 'seed,seed' && await look(A.p) === 'dark green' && await look(B.p) === 'dark green',
      `two devices set up one empty folder at once, only the laptop having chosen a theme and accent: the laptop’s on both (${modes.join(', ')}: ${await look(A.p)} / ${await look(B.p)})`);
    ok(!(await styleSaid(A.p)).length, `and the laptop isn’t told the smartboard changed them (${(await styleSaid(A.p)).join(' | ')})`);
    await A.c.close(); await B.c.close();

    // The smartboard's round is merging the laptop's Dark when the teacher taps Light there (a later choice), after the
    // round read the settings and before it saves: stored at once, or still on its way to the database.
    for (const when of ['stored', 'not stored yet']) {
      A = await syncDev(browser, 'the laptop', errors); B = await syncDev(browser, 'the smartboard', errors);
      await addNote(A.p, 'Morning meeting');
      await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
      await openSettings(B.p); await hear(B.p);
      await B.p.evaluate(stored => {
        const L = window.__board21.link, orig = L.commit.bind(L);
        L.commit = async function (gen, r, plan, next, sync, full, T, dels) {
          if (full && plan && plan.settingsPatch && plan.settingsPatch.set && plan.settingsPatch.set.theme && !window.__raced) {
            window.__raced = true;
            document.querySelector('#settings [data-act="theme"][data-val="light"]').click();
            if (stored) await window.__board21.writer.settled(3000);
          }
          return orig(gen, r, plan, next, sync, full, T, dels);
        };
      }, when === 'stored');
      await openSettings(A.p);
      await A.p.click('#settings [data-act="theme"][data-val="dark"]'); await A.p.waitForTimeout(300);
      await syncNow(A.p); await deliver(A.p, B.p); await syncNow(B.p);
      const raced = await B.p.evaluate(() => !!window.__raced), now = await look(B.p);
      await exchange(A, B); await exchange(A, B);
      ok(raced && now === 'light blue' && await look(A.p) === 'light blue' && await look(B.p) === 'light blue',
        `Light tapped on the smartboard while its round merged the laptop’s earlier Dark (${when}): the later choice on both (raced: ${raced}; right after: ${now}; then ${await look(A.p)} / ${await look(B.p)})`);
      ok(!(await styleSaid(B.p)).length, `and the smartboard doesn’t say the laptop changed the theme (${(await styleSaid(B.p)).join(' | ')})`);
      await A.c.close(); await B.c.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  // The default widget language is the board's too, as the theme and accent. The text style, which only releases up to
  // 2026.11.28-1 show, stays in the settings and device files, unshown and unsaid.
  ['Board Sync: theme and accent color, and the default widget language (Español from the laptop, all three at once, Settings open, locked, another tab, kiosk, Import, and a text style from an older release)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const look = p => p.evaluate(() => { const s = window.__board21.state.settings; return `${s.theme} ${s.accent} ${s.widgetLanguage}`; });
    const said = (p, t) => p.locator('#toasts .toast', { hasText: t });
    // (a choice made, and stored: what the next round reads)
    const stored = (p, fn, arg) => p.waitForFunction(fn, arg).then(() => p.evaluate(() => window.__board21.writer.settled(5000)));
    const pick = async (p, act, val) => { await p.click(`#settings [data-act="${act}"][data-val="${val}"]`); await stored(p, ([a, v]) => window.__board21.state.settings[a === 'widget-language' ? 'widgetLanguage' : a] === v, [act, val]); };
    const lock = async (p, on) => { if (on) await lockBoard(p, 'widgets'); else await unlockBoard(p); await stored(p, on => !!window.__board21.state.settings.locked === on, on); };
    const round = async (from, ...to) => { await syncNow(from.p); for (const d of to) { await deliver(from.p, d.p); await syncNow(d.p); } };
    const letters = p => p.evaluate(() => { const s = window.__board21.state.settings; return { letters: s.letters, lettersAt: s.lettersAt }; });

    await addNote(A.p, 'Morning meeting');
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const devA = await A.p.evaluate(() => window.__board21.link.dev());

    // Two and three at once, said in one message.
    await hear(B.p);
    await openSettings(A.p); await pick(A.p, 'theme', 'dark'); await pick(A.p, 'accent', 'orange'); await A.p.keyboard.press('Escape');
    await round(A, B);
    ok(await look(B.p) === 'dark orange en' && (await heard(B.p)).includes('The laptop changed the theme to Dark and the accent color to Orange.'),
      `the theme and accent color: “The laptop changed the theme to Dark and the accent color to Orange.” (${await look(B.p)}; ${(await heard(B.p)).join(' | ')})`);
    await hear(A.p);
    await openSettings(B.p, ['widget-language']); await pick(B.p, 'theme', 'light'); await pick(B.p, 'accent', 'green'); await pick(B.p, 'widget-language', 'uk'); await B.p.keyboard.press('Escape');
    await round(B, A);
    ok(await look(A.p) === 'light green uk' && (await heard(A.p)).includes('The smartboard changed the theme to Light, the accent color to Green, and the default widget language to Українська.'),
      `all three: “The smartboard changed the theme to Light, the accent color to Green, and the default widget language to Українська.” (${await look(A.p)}; ${(await heard(A.p)).join(' | ')})`);
    await round(A, B);
    ok(await look(B.p) === 'light green uk', 'nothing changes back');

    // The default widget language: Español from the laptop, with Settings open on the smartboard at that group. It is put
    // in place there, said with no Undo, kept in the laptop's file with its version, and a Timer opened on the smartboard
    // then opens in Spanish.
    await openSettings(B.p, ['widget-language']);
    await B.p.evaluate(() => { const body = document.querySelector('#settings .sheet-body'); window.__drawn = 0; new MutationObserver(ms => { if (ms.some(m => m.target === body)) window.__drawn++; }).observe(body, { childList: true }); });
    await hear(B.p);
    await openSettings(A.p, ['widget-language']); await pick(A.p, 'widget-language', 'es'); await A.p.keyboard.press('Escape');
    await round(A, B);
    const wl = await B.p.evaluate(() => ({ set: window.__board21.state.settings.widgetLanguage, es: document.querySelector('#settings [data-act="widget-language"][data-val="es"]').getAttribute('aria-checked'),
      ticks: Array.from(document.querySelectorAll('#settings .lang-opt .tick'), t => t.parentElement.dataset.val).join(), value: document.querySelector('#settings [data-val="widget-language"] .v').textContent,
      lang: (document.querySelector('#settings [data-val="widget-language"] .v [lang]') || {}).lang, drawn: window.__drawn }));
    ok(wl.set === 'es' && wl.es === 'true' && wl.ticks === 'es' && wl.value === 'Español' && wl.lang === 'es' && wl.drawn === 0,
      `the smartboard takes Español within a round: its card ticked and its row reading Español, put in place, not drawn again (${JSON.stringify(wl)})`);
    ok((await heard(B.p)).includes('The laptop changed the default widget language to Español.') && await said(B.p, 'default widget language').locator('button').count() === 0,
      `it says “The laptop changed the default widget language to Español.”, with no Undo (${(await heard(B.p)).join(' | ')})`);
    const fileL = await ownJSON(A.p);
    ok(fileL.widgetLanguage === 'es' && fileL.sync.style.widgetLanguage && fileL.sync.style.widgetLanguage[0] === devA, `the laptop’s file has it, and its version (${JSON.stringify(fileL.sync.style.widgetLanguage)})`);
    await B.p.keyboard.press('Escape');
    const tk = await addWin(B.p, 'timer');
    ok(await B.p.evaluate(ik => window.__board21.state.insts.get(ik).language, tk) === 'es' && await eventually(async () => !!B.p.frame({ name: `b21-board:${tk};es` })),
      `a Timer opened on the smartboard opens in Spanish (${await B.p.evaluate(ik => window.__board21.state.insts.get(ik).language, tk)})`);
    await B.p.evaluate(ik => window.__board21.deleteInstance(ik), tk); await round(B, A);

    // Locked, with another tab and a kiosk tab of the smartboard open: Dark from the laptop applies everywhere.
    const dark = p => p.evaluate(() => document.body.classList.contains('dark'));
    const B2 = await B.c.newPage(); B2.on('pageerror', e => errors.push('smartboard tab 2: ' + e.message)); await B2.goto(BASE); await boardUp(B2);
    const K = await B.c.newPage(); K.on('pageerror', e => errors.push('smartboard kiosk: ' + e.message)); await K.goto(BASE + '?kiosk=yes'); await boardUp(K);
    await lock(B.p, true);
    ok(await B.p.evaluate(() => window.__board21.state.settings.locked === 'widgets') && !await dark(B2), '(the smartboard is locked; its other tab is light)');
    await hear(B.p);
    await openSettings(A.p); await pick(A.p, 'theme', 'dark'); await A.p.keyboard.press('Escape');
    await round(A, B);
    ok(await dark(B.p) && (await heard(B.p)).includes('The laptop changed the theme to Dark.'), `locked: Dark applies, and is said (${(await heard(B.p)).join(' | ')})`);
    ok(await eventually(() => dark(B2)), 'another tab of the smartboard follows');
    ok(await eventually(() => dark(K)), 'and so does one in kiosk mode');
    await lock(B.p, false);
    await B2.close(); await K.close();

    // A text style from an older release: written straight into the laptop's settings record, as an older release's
    // Settings does (shown in its tab as another tab's change). The smartboard takes it silently, keeps Inter, and
    // passes it on in its own file.
    await A.p.evaluate(async () => {
      const B = window.__board21, [rec] = await B.store.getMany(['settings']);
      rec.value = Object.assign({}, rec.value, { letters: 'legible', lettersAt: Date.now() }); rec.rev = Date.now(); rec.updatedAt = Date.now();
      await B.store.tx('readwrite', s => { s.put(rec); });
      B.applyMerged(['settings'], await B.store.getMany(['settings']));
    });
    ok(await A.p.evaluate(() => window.__board21.state.settings.letters) === 'legible', '(the laptop holds an older release’s text style)');
    await hear(B.p);
    await round(A, B);
    const old = await B.p.evaluate(() => ({ letters: window.__board21.state.settings.letters, font: getComputedStyle(document.body).fontFamily }));
    ok(old.letters === 'legible' && /^"?Inter"?,/.test(old.font), `the smartboard takes an older release’s text style into its settings, and stays in Inter (${JSON.stringify(old)})`);
    ok(!(await heard(B.p)).some(h => /text style|Easier to read/i.test(h)), `and says nothing of it (${(await heard(B.p)).join(' | ') || 'nothing said'})`);
    await syncNow(B.p);
    const fileB = await ownJSON(B.p);
    ok(fileB.letters === 'legible' && fileB.sync.style.letters && fileB.sync.style.letters[0] === devA, `its own file carries it, with the laptop’s version (${fileB.letters} ${JSON.stringify(fileB.sync.style.letters)})`);

    // Import › Replace this page takes the file's theme and accent color, never a text style, and its Undo stamps none.
    const fileWith = async (name, set) => {
      const exp = await A.p.evaluate(async set => {
        const e = await window.__board21.buildExport('full');
        for (const [k, v] of Object.entries(set)) { if (k === 'name') e.board = Object.assign({}, e.board, { name: v }); else if (v === null) delete e[k]; else e[k] = v; }
        return e;
      }, set);
      fs.writeFileSync(OUT + name, JSON.stringify(exp)); return OUT + name;
    };
    const offer = async f => { await A.p.setInputFiles('#import-input', f); return (await A.p.locator('#modal.open .btn', { hasText: 'Replace this page' }).innerText()).replace(/\s+/g, ' '); };
    let sub = await offer(await fileWith('colleague-two.21board', { theme: 'light', accent: 'purple' }));
    ok(/This page’s windows and content are replaced, here and on your other devices\. So are the theme and accent color\. You can undo this\./.test(sub), `a file in another theme and accent color: Replace this page names both (${sub})`);
    await A.p.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await A.p.locator('#modal.open').waitFor({ state: 'hidden' });
    const before = await letters(A.p);
    sub = await offer(await fileWith('colleague-early.21board', { letters: 'early', name: 'Fractions (Ms. Lee)' }));
    await A.p.locator('#modal.open .modal-card').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished))); await A.p.screenshot({ path: OUT + 'import-old-text-style.png' });
    ok(!/text style/.test(sub), `a file with a text style: Replace this page doesn’t name it (${sub})`);
    await A.p.locator('#modal.open .btn', { hasText: 'Replace this page' }).click();
    await A.p.locator('#toasts .toast', { hasText: 'Board imported.' }).waitFor(); await A.p.evaluate(() => window.__board21.writer.settled(5000));
    const afterReplace = await letters(A.p);
    await A.p.locator('#toasts .toast', { hasText: 'Board imported.' }).locator('button', { hasText: 'Undo' }).click();
    await eventually(async () => await A.p.evaluate(() => window.__board21.state.board.name) !== 'Fractions (Ms. Lee)'); await A.p.evaluate(() => window.__board21.writer.settled(5000));
    const afterUndo = await letters(A.p);
    ok(JSON.stringify(afterReplace) === JSON.stringify(before) && JSON.stringify(afterUndo) === JSON.stringify(before),
      `the text style and when it was chosen stay as they were, after Replace and after its Undo (${JSON.stringify({ before, afterReplace, afterUndo })})`);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ];
};
