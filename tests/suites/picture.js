// The Picture widget: pictures opened, pasted, and dropped.
'use strict';
module.exports = T => {
  const {
    http, fs, path, ROOT, OUT, ok, freeBoard, openSettings, lockBoard, unlockBoard, deliver, linkFolder, syncNow,
    addNote, noteOf, addWin, winList, ikOf, syncDev, exchange, ownJSON, eventually, release, stamped, STAMPED,
    boardUp, ytChoose, picWin, picLook, picData, picConf, picMenu, picOpen, picFile, FIXTURE, picWins, drawPic, PMSG,
    padGif, padWebp, pngHeader, apng, alphaAt, sendFiles, copyPic, copyText, contentOf, contrast, rgbOf, BASE
  } = T;
  return [
  // ---- Board Sync suites ----
  ['Image: the Picture widget (the Widget Picker, PNG, JPEG, GIF, WebP and AVIF, animations kept, files turned away kindly, sizes and downscaling, the window takes the picture’s shape, Whole picture and Crop to fill, Open… from the menu, Remove picture, reload, Reset, delete, light and dark, the widget dev window, the docs)', async (browser) => {
    const file = path.join(ROOT, 'widgets', 'image', 'index.html'), src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    ok(!!src && !/--b21-[\w-]+\s*:/.test(src) && !/localStorage|indexedDB|XMLHttpRequest|sessionStorage/.test(src) && !/https?:\/\/(?!www\.w3\.org\/)/.test(src),
      'the widget is one page, widgets/image/index.html: it never sets a --b21-* value of its own, stores nothing itself and loads nothing from the Internet');
    // The docs: the widget's row, pasting a picture, the SDK's file event and paste, the content and Board history.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), sdkDoc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8').replace(/\s+/g, ' ');
    const dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    const row = readme.indexOf('| **Picture** |') >= 0 ? readme.slice(readme.indexOf('| **Picture** |'), readme.indexOf('|', readme.indexOf('| **Picture** |') + 16) + 400) : '';
    ok(/PNG, JPEG, GIF, WebP, or AVIF/.test(row) && readme.indexOf('| **Picture** |') > readme.indexOf('### Included widgets'), 'the README’s Included widgets has a Picture row naming the five kinds of picture');
    ok(/\| \*\*Paste\*\* \|[^|]*Ctrl\+V/.test(readme) && /ClipboardAllowedForUrls/.test(readme), 'the README says how to paste a picture, and tells IT how to allow the Paste button ahead of time');
    ok(/\| `file` \| `\(file, \{ reason \}\)` \|/.test(sdkDoc) && /new Picture window/.test(sdkDoc), 'the SDK guide has the file event, and says what happens to a picture pasted or dropped in a widget');
    ok(/\{ src, w, h, name, bytes \}/.test(dataDoc) && /"b21pic"/.test(dataDoc), 'the data format guide has the Picture’s content and how Board history keeps pictures');

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'image'); return a && { name: a.name, version: a.version, entry: a.entry, files: a.files, clash: a.clash, permissions: a.permissions, win: a.win, color: a.color, icon: a.icon, external: !!a.external, single: !!a.single, description: a.description }; });
    ok(reg && reg.name === 'Picture' && reg.version === '1.0.0' && reg.entry === 'widgets/image/index.html' && JSON.stringify(reg.files) === '["widgets/image/index.html"]' && reg.clash === 'later' &&
      reg.permissions.length === 0 && !reg.external && !reg.single && reg.win.width === 480 && reg.win.height === 360 && reg.win.minWidth === 160 && reg.win.minHeight === 120 && !reg.win.aspectRatio && reg.win.dragFromContent !== false,
      `it is in the registry as Picture (id image): one file, clash 'later', 480 × 360, at least 160 × 120, no shape lock, moved from inside (${JSON.stringify(reg && reg.win)})`);
    ok(!!reg && reg.description === 'Show a picture you open or paste.' && /<title>Picture<\/title>/.test(src), `its description and page title (${reg && reg.description})`);
    const mf = /<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(src), manifest = mf ? JSON.parse(mf[1]) : {};
    ok(!!reg && manifest.id === 'image' && manifest.name === reg.name && manifest.version === reg.version && ['width', 'height', 'minWidth', 'minHeight'].every(k => (manifest.window || {})[k] === reg.win[k]), 'its manifest block matches the registry entry');
    const others = await page.evaluate(() => window.__board21.catalog().filter(w => w.id !== 'image').map(w => String(w.color || '').toLowerCase()));
    ok(!!reg && /^<svg viewBox="0 0 24 24">/.test(reg.icon) && contrast('rgb(255, 255, 255)', rgbOf(reg.color)) >= 4.5 && !others.includes(reg.color.toLowerCase()), `its tile is a color of its own (${reg && reg.color}), the white icon readable on it`);

    // The Widget Picker; an empty window.
    await page.click('.picker-btn.left'); await page.waitForTimeout(250);
    const tile = page.locator('[data-widget="image"]');
    ok(await tile.count() === 1 && (await tile.innerText()).trim() === 'Picture', 'the Widget Picker has a Picture tile');
    if (await tile.count()) await tile.click();
    ok(await eventually(() => page.evaluate(() => { const w = window.__board21.state.wins.get('image:1'); return !!w && w.connected; })), 'tapping it opens a window, which connects');
    let L = await picLook(page);
    ok(L.ask && !L.pic && L.title === 'Show a picture' && L.open === 'Open…' && L.paste && L.pasteLabel === 'Paste' && !L.err, `an empty window: “Show a picture”, Open… and Paste (${JSON.stringify([L.title, L.open, L.pasteLabel, L.err])})`);
    ok(await picMenu(page) === '', `no window menu items of its own while it is empty (${await picMenu(page)})`);
    ok(await picWin(page).locator('html').evaluate(() => document.activeElement === document.body).catch(() => false), 'nothing in it takes the focus by itself (no keyboard popping up)');
    ok(!!L.font && L.buttonFont === L.font, `its buttons are in the text style’s font (${L.buttonFont})`);

    // Open… shows the file dialog, for the five kinds and SVG; a small PNG is kept exactly as it is.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), picWin(page).locator('#open').click({ timeout: 3000 }).catch(() => {})]);
    const accept = chooser ? await chooser.element().getAttribute('accept') : '';
    ok(!!chooser && !chooser.isMultiple() && ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'].every(t => accept.includes(t)) && !/heic/i.test(accept), `Open… shows the file dialog, for PNG, JPEG, GIF, WebP, AVIF and SVG (${accept})`);
    const small = await drawPic(page, 64, 48, 'image/png');
    if (chooser) await chooser.setFiles(picFile('Field trip.png', small, 'image/png'));
    ok(await eventually(async () => (await picLook(page)).pic), 'the picture shows');
    let d = await picData(page);
    ok(!!d && d.src === 'data:image/png;base64,' + small.toString('base64') && d.w === 64 && d.h === 48 && d.name === 'Field trip.png' && d.bytes === small.length && Object.keys(d).sort().join() === 'bytes,h,name,src,w',
      `a small PNG is kept exactly as it is, saved as { src, w, h, name, bytes } (${d && JSON.stringify(Object.assign({}, d, { src: String(d.src).slice(0, 30) }))})`);
    L = await picLook(page);
    ok(L.alt === 'Field trip' && L.nw === 64 && L.nh === 48, `its alt text is its name without the extension (${L.alt})`);
    let c = await contentOf(page, 'image:1');
    ok(Math.abs(c.w - 360) <= 2 && Math.abs(c.h - 270) <= 2, `the window takes the picture’s shape, a small picture at 360 on its long side (${c.w} × ${c.h})`);

    // Whole picture (the default) and Crop to fill, in a window of another shape.
    const fits = L => { const b = L.box || {}; return { inside: b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= L.vw + 0.5 && b.y + b.h <= L.vh + 0.5, touches: Math.abs(b.w - L.vw) < 1 || Math.abs(b.h - L.vh) < 1,
      covers: b.x <= 0.5 && b.y <= 0.5 && b.x + b.w >= L.vw - 0.5 && b.y + b.h >= L.vh - 0.5, ratio: b.w / b.h }; };
    await page.evaluate(() => window.__board21.setRect('image:1', Object.assign({}, window.__board21.state.insts.get('image:1').rect, { w: 600, h: 280 }))); await page.waitForTimeout(400);
    L = await picLook(page); let f = fits(L);
    ok(f.inside && f.touches && !f.covers && Math.abs(f.ratio - 64 / 48) < 0.02, `Whole picture: all of it shows, as large as fits, in its own shape (${JSON.stringify(L.box)} in ${L.vw} × ${L.vh})`);
    ok(L.behind === 'rgba(0, 0, 0, 0)' && L.around === 'rgb(255, 255, 255)', `nothing behind the picture: the window’s own color shows behind it and around it (${L.behind} / ${L.around})`);
    ok(await picMenu(page) === 'Open… | Paste | — | ✓ Whole picture | Crop to fill | — | Remove picture', `the window menu (${await picMenu(page)})`);
    await ytChoose(page, 'Crop to fill', 'image:1');
    L = await picLook(page); f = fits(L);
    ok(f.covers && Math.abs(f.ratio - 64 / 48) < 0.02 && (await picConf(page) || {}).fit === 'fill', `Crop to fill: the picture covers the window in its own shape, saved as a setting (${JSON.stringify(await picConf(page))})`);
    ok(await picMenu(page) === 'Open… | Paste | — | Whole picture | ✓ Crop to fill | — | Remove picture', `and the menu shows it (${await picMenu(page)})`);
    await ytChoose(page, 'Whole picture', 'image:1');
    ok(fits(await picLook(page)).inside && (await picConf(page) || {}).fit === 'whole', 'Whole picture again');
    // Open… from the window menu shows the file dialog too.
    const [chooser2] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), ytChoose(page, 'Open…', 'image:1').catch(() => {})]);
    ok(!!chooser2, 'Open… in the window menu shows the file dialog');
    if (chooser2) await chooser2.setFiles(picFile('Field trip.png', small, 'image/png'));
    await page.waitForTimeout(500);

    // Each kind of picture, in a window of its own: small ones kept byte for byte, and animations too.
    const kinds = [
      ['Map.jpg', await drawPic(page, 80, 60, 'image/jpeg', { q: 0.8 }), 'image/jpeg', 80, 60],
      ['Leaf.webp', await drawPic(page, 60, 80, 'image/webp', { q: 0.8 }), 'image/webp', 60, 80],
      ['Dance.gif', FIXTURE('picture-animated.gif'), 'image/gif', 32, 24],
      ['Still.gif', FIXTURE('picture-still.gif'), 'image/gif', 32, 24],
      ['Spin.webp', FIXTURE('picture-animated.webp'), 'image/webp', 32, 24],
      ['Sky.avif', FIXTURE('picture.avif'), 'image/avif', 32, 24],
      ['Twirl.avif', FIXTURE('picture-animated.avif'), 'image/avif', 32, 24]];
    const ik2 = await addWin(page, 'image');
    for (const [name, buf, type, w, h] of kinds) {
      await picOpen(page, picFile(name, buf), ik2);   // (no type given: its first bytes say what it is)
      const d2 = await picData(page, ik2), L2 = await picLook(page, ik2);
      ok(!!d2 && d2.src === `data:${type};base64,${buf.toString('base64')}` && d2.w === w && d2.h === h && L2.pic && L2.nw === w && L2.nh === h && !L2.err,
        `${name} opens and shows, kept as it is (${d2 && String(d2.src).slice(0, 24)}…, ${L2.nw} × ${L2.nh}${L2.err ? ', ' + L2.err : ''})`);
    }
    for (const [name, buf, type, w] of [['Big dance.gif', padGif(FIXTURE('picture-animated.gif'), 1.5e6), 'image/gif', 32], ['Big spin.webp', padWebp(FIXTURE('picture-animated.webp'), 1.5e6), 'image/webp', 32],
      ['Blink.png', apng(40, 30, false), 'image/png', 40], ['Big blink.png', apng(800, 800, true), 'image/png', 800]]) {
      await picOpen(page, picFile(name, buf, type), ik2);
      const d2 = await picData(page, ik2), L2 = await picLook(page, ik2);
      ok(!!d2 && d2.src === `data:${type};base64,${buf.toString('base64')}` && d2.bytes === buf.length && L2.nw === w, `an animation (${name}, ${(buf.length / 1e6).toFixed(2)} MB) is kept byte for byte, so it still moves (${d2 && String(d2.src).slice(0, 22)}, ${d2 && d2.w} × ${d2 && d2.h})`);
    }

    // Files turned away, kindly, in an empty window: nothing is saved. Then a good one shows and the message goes.
    const ik3 = await addWin(page, 'image');
    const turned = [
      ['notes.png', Buffer.from('These are my notes, not a picture.'), 'image/png', PMSG.type],
      ['IMG_0042.HEIC', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic\0\0\0\0mif1heic', 'latin1'), Buffer.alloc(64)]), 'image/heic', PMSG.heic],
      ['huge.png', Buffer.concat([small, Buffer.alloc(27e6 - small.length)]), 'image/png', PMSG.big],
      ['scan.bmp', Buffer.concat([Buffer.from('BM'), Buffer.alloc(60)]), 'image/bmp', PMSG.type],
      ['poster.png', pngHeader(10000, 6000), 'image/png', PMSG.pixels],
      ['long dance.gif', padGif(FIXTURE('picture-animated.gif'), 5.3e6), 'image/gif', PMSG.anim],
      ['broken.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]), 'image/jpeg', PMSG.broken]];
    for (const [name, buf, type, say] of turned) {
      await picOpen(page, picFile(name, buf, type), ik3, say);
      const L3 = await picLook(page, ik3);
      ok(L3.ask && !L3.pic && L3.err === say && await picData(page, ik3) === null, `${name} is turned away: “${L3.err}”, and nothing is saved`);
    }
    await picOpen(page, picFile('ok.png', small, 'image/png'), ik3);
    L = await picLook(page, ik3);
    ok(L.pic && !L.err, 'a good picture after that shows, and the message goes');

    // Sizes: a big photo is drawn again at 2560 px as a WebP; with transparency too; a small file wider than
    // 3840 px is drawn again too. Its window takes its shape, at most 720 × 540.
    const ik4 = await addWin(page, 'image');
    const photo = await drawPic(page, 4200, 2800, 'image/jpeg', { noise: 63, q: 0.92 });
    await picOpen(page, picFile('Class photo.jpg', photo, 'image/jpeg'), ik4);
    d = await picData(page, ik4);
    ok(!!d && /^data:image\/webp;base64,/.test(d.src) && d.w === 2560 && d.h === 1707 && d.bytes < photo.length && d.bytes === Buffer.from(String(d.src).split(',')[1] || '', 'base64').length,
      `a ${(photo.length / 1e6).toFixed(1)} MB photo, 4200 × 2800, is drawn again at 2560 × 1707 as a WebP of ${d && (d.bytes / 1e6).toFixed(2)} MB`);
    c = await contentOf(page, ik4);
    ok(Math.abs(c.w - 720) <= 2 && Math.abs(c.h - 480) <= 2, `its window takes its shape, at most 720 × 540 (${c.w} × ${c.h})`);
    const logo = await drawPic(page, 3200, 1600, 'image/png', { noise: 63, alpha: true });
    await picOpen(page, picFile('Logo.png', logo, 'image/png'), ik4);
    d = await picData(page, ik4);
    ok(!!d && /^data:image\/webp;base64,/.test(d.src) && d.w === 2560 && d.h === 1280, `a ${(logo.length / 1e6).toFixed(1)} MB PNG with transparency is drawn again at 2560 as a WebP, which keeps the transparency (${d && String(d.src).slice(0, 22)}, ${d && d.w + ' × ' + d.h})`);
    c = await contentOf(page, ik4);
    ok(Math.abs(c.w - 720) <= 2 && Math.abs(c.h - 360) <= 2, `and the window takes the new picture’s shape (${c.w} × ${c.h})`);
    // A WebP still over 1.2 MB is made again at a lower quality, as a JPEG is.
    const confetti = await drawPic(page, 2560, 1280, 'image/png', { noise: 255, alpha: true });
    await picOpen(page, picFile('Confetti.png', confetti, 'image/png'), ik4);
    d = await picData(page, ik4);
    const webp9 = await page.evaluate(async b64 => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))], { type: 'image/png' }));
      const cv = document.createElement('canvas'); cv.width = 2560; cv.height = 1280;
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, 2560, 1280);
      return (await new Promise(r => cv.toBlob(r, 'image/webp', 0.9))).size;
    }, confetti.toString('base64'));
    ok(!!d && d.name === 'Confetti.png' && /^data:image\/webp/.test(d.src) && webp9 > 1.2e6 && d.bytes < webp9 * 0.9, `with transparency, a picture still over 1.2 MB is saved at a lower quality (${d && (d.bytes / 1e6).toFixed(2)} MB, not ${(webp9 / 1e6).toFixed(2)} MB)`);
    // Transparency only at the edges, a few pixels of a large picture: rounded corners, a thin clear border. Kept clear.
    for (const [name, w, h, o] of [['Card.png', 2400, 1600, { noise: 31, round: 24 }], ['Sticker.png', 1600, 1200, { noise: 31, margin: 4 }]]) {
      const buf = await drawPic(page, w, h, 'image/png', o);
      await picOpen(page, picFile(name, buf, 'image/png'), ik4);
      d = await picData(page, ik4);
      const a = d && d.src ? await alphaAt(page, d.src, 1, 1) : 255;
      ok(!!d && d.name === name && !/^data:image\/jpeg/.test(d.src) && a < 128, `a ${(buf.length / 1e6).toFixed(1)} MB PNG clear only at its edges (${o.round ? 'rounded corners' : 'a 4 px border'}) stays clear there (${d && String(d.src).slice(0, 22)}, corner alpha ${a})`);
    }
    // Far taller or wider than the window's box: the window stays within 720 × 540, at its least size across, and the
    // whole picture shows inside it.
    for (const [name, w, h] of [['Timeline.png', 300, 2400], ['Banner.png', 3000, 200]]) {
      await picOpen(page, picFile(name, await drawPic(page, w, h, 'image/png'), 'image/png'), ik4);
      c = await contentOf(page, ik4); L = await picLook(page, ik4);
      ok(((await picData(page, ik4)) || {}).name === name && c.w <= 722 && c.h <= 542 && (Math.abs(c.w - 160) <= 2 || Math.abs(c.h - 120) <= 2) && fits(L).inside && fits(L).touches,
        `a ${w} × ${h} picture: its window stays within 720 × 540 (${c.w} × ${c.h}), the whole picture inside it`);
    }
    const banner = await drawPic(page, 4000, 300, 'image/jpeg', { q: 0.7 });
    await picOpen(page, picFile('Banner.jpg', banner, 'image/jpeg'), ik4);
    d = await picData(page, ik4);
    ok(!!d && banner.length <= 1048576 && d.w === 2560 && d.h === 192, `a small file (${Math.round(banner.length / 1e3)} KB) wider than 3840 px is drawn again at 2560 (${d && d.w + ' × ' + d.h})`);
    await page.evaluate(ik => window.__board21.setMaximized(ik, true), ik4); await page.waitForTimeout(400);
    await picOpen(page, picFile('Map.jpg', kinds[0][1], 'image/jpeg'), ik4);
    ok((await contentOf(page, ik4)).max, 'a picture opened in a window that fills the board leaves it filling the board');
    await page.evaluate(ik => window.__board21.setMaximized(ik, false), ik4); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + 'picture-kinds.png' });

    // Reload: the same pictures, the same setting.
    await ytChoose(page, 'Crop to fill', ik2);
    const before2 = (await picData(page, ik2)).src;
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => (await picLook(page, ik2)).src === before2 && (await picLook(page, ik2)).pic), 'a reload shows the same picture');
    ok((await picConf(page, ik2) || {}).fit === 'fill' && fits(await picLook(page, ik2)).covers, 'and keeps Crop to fill');

    // At its least size, 160 × 120, a message and the buttons still fit in the window.
    const ik6 = await addWin(page, 'image');
    await page.evaluate(ik => window.__board21.setRect(ik, Object.assign({}, window.__board21.state.insts.get(ik).rect, { w: 160, h: 160 })), ik6); await page.waitForTimeout(400);
    await picOpen(page, picFile('notes.png', Buffer.from('These are my notes, not a picture.'), 'image/png'), ik6, PMSG.type);
    const tiny = await picWin(page, ik6).locator('html').evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { vw: innerWidth, vh: innerHeight, err: r('err').top, open: r('open').bottom, paste: r('paste').bottom }; }).catch(() => ({}));
    ok(tiny.vw === 160 && tiny.vh === 120 && tiny.err >= 0 && tiny.open <= tiny.vh + 0.5 && tiny.paste <= tiny.vh + 0.5, `at 160 × 120, the message and the buttons fit in the window (${JSON.stringify(tiny)})`);
    // A picture that takes a while to open: after a moment the window says so, with no buttons showing first.
    await page.evaluate(ik => window.__board21.setRect(ik, Object.assign({}, window.__board21.state.insts.get(ik).rect, { w: 480, h: 400 })), ik6); await page.waitForTimeout(400);
    await picWin(page, ik6).locator('html').evaluate(() => { const make = window.createImageBitmap; window.createImageBitmap = (...a) => new Promise(r => setTimeout(r, 1500)).then(() => make.apply(window, a)); });
    await picWin(page, ik6).locator('#file').setInputFiles(picFile('Slow.png', small, 'image/png'));
    const waiting = () => picWin(page, ik6).locator('html').evaluate(() => { const w = document.getElementById('wait'), box = document.querySelector('#ask .box'); return { text: w ? w.textContent : null, shown: !!w && w.offsetHeight > 0, role: w && w.getAttribute('role'), box: getComputedStyle(box).visibility }; }).catch(() => ({}));
    await page.waitForTimeout(150);
    const soon = await waiting();
    ok(await eventually(async () => { const x = await waiting(); return x.text === 'Opening…' && x.shown && x.role === 'status' && x.box === 'hidden'; }, 1300) && !soon.shown && soon.box === 'hidden',
      `while a picture takes a while, the window says “Opening…” after a moment, with no buttons showing (at first: ${JSON.stringify(soon)})`);
    ok(await eventually(async () => (await picLook(page, ik6)).pic) && (await waiting()).text === '', 'then the picture shows, and “Opening…” goes');

    // Dark: the empty window and the space around and behind a picture follow the theme.
    await openSettings(page); await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const ik5 = await addWin(page, 'image');
    L = await picLook(page, ik5);
    ok(L.ask && L.around === 'rgb(30, 30, 30)', `dark: an empty window is dark (${L.around})`);
    await ytChoose(page, 'Whole picture', ik2);
    L = await picLook(page, ik2);
    ok(L.around === 'rgb(30, 30, 30)' && L.behind === 'rgba(0, 0, 0, 0)', `dark: around a picture is dark, and nothing is behind it: the window’s color shows through (${L.around} / ${L.behind})`);
    await page.screenshot({ path: OUT + 'picture-dark.png' });
    await openSettings(page); await page.click('#settings [data-act="theme"][data-val="light"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // Remove picture: empty again, saved as no picture. Reset: empty, nothing saved. Delete: the records go.
    await ytChoose(page, 'Remove picture', 'image:1');
    L = await picLook(page); d = await picData(page);
    ok(L.ask && !L.pic && L.title === 'Show a picture' && !!d && d.src === null && await picMenu(page) === '', `Remove picture: the window is empty again, saved as no picture (${JSON.stringify(d)})`);
    await page.evaluate(ik => window.__board21.resetWin(ik), ik2); await page.waitForTimeout(800);
    ok(await eventually(async () => (await picLook(page, ik2)).ask) && await picData(page, ik2) === null && await picConf(page, ik2) === null, 'Reset: the window is empty, and its picture and setting are gone');
    await page.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), ik3); await page.waitForTimeout(800);
    const keys = await page.evaluate(async ik => (await window.__board21.store.getAll()).map(r => r.key).filter(k => k.endsWith(':' + ik)), ik3);
    ok(!keys.length, `deleting a window deletes its picture (${keys.join(', ')})`);

    // The widget dev window: the page opened on its own runs in a real board window, and a picture opens there.
    const dev = await ctx.newPage(); dev.on('pageerror', e => errors.push('[dev] ' + e.message));
    await dev.goto(BASE + 'widgets/image/index.html'); await dev.waitForTimeout(3000);
    const devBoard = dev.mainFrame().childFrames()[0], devPic = devBoard && devBoard.childFrames()[0];
    ok(!!devPic && await devPic.evaluate(() => document.querySelector('#ask h1').textContent === 'Show a picture' && Board21.context.host === 'dev').catch(() => false), 'in the widget dev window, it runs in a real board window');
    if (devPic) await devPic.locator('#file').setInputFiles(picFile('Dev.png', small, 'image/png')).catch(() => {});
    ok(!!devPic && await eventually(() => devPic.evaluate(() => !document.getElementById('pic').hidden && document.getElementById('img').naturalWidth === 64).catch(() => false)), 'and a picture opened there shows');
    await dev.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Image: SVG drawings, drawn as a picture (Open…, Paste, pasted and dropped on the board and on a window; no script runs and nothing is fetched; 2560 px on the long side from its size, its viewBox or neither; text in a foreignObject; too big, broken, SVGZ)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const asked = []; ctx.on('request', r => asked.push(r.url()));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    // A drawing as an app saves one: a blue left half and a yellow circle on nothing, with what must never run or load
    // (a script, onload, a stylesheet and pictures from elsewhere).
    const PROBE = BASE + '__svg-probe/';
    const drawing = (size, more = '') => Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${size} onload="top.__svgRan = (top.__svgRan || 0) + 1">
<script>top.__svgRan = (top.__svgRan || 0) + 1; parent.postMessage({ b21: 1, type: 'toast', text: 'The SVG ran' }, '*');</script>
<style>@import url("${PROBE}style.css"); rect { fill: #2563eb; }</style>
<rect x="0" y="0" width="50%" height="100%"/><circle cx="50%" cy="50%" r="20%" fill="#fde68a"/>
<image href="${PROBE}photo.png" xlink:href="${PROBE}photo2.png" x="0" y="0" width="10%" height="10%"/>${more}
</svg>`);
    // One pixel of a saved picture (a data: URL), at a fraction of its width and height: [r, g, b, a].
    const pixel = (src, fx, fy) => page.evaluate(async ([src, fx, fy]) => {
      const i = new Image(); i.src = src; await i.decode();
      const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
      return Array.from(g.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data);
    }, [src, fx, fy]);
    const near = (px, rgb) => !!px && px[3] > 240 && rgb.every((v, k) => Math.abs(px[k] - v) <= 12);
    const raster = s => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s || '');
    const ran = async ik => (await page.evaluate(() => window.__svgRan || 0)) + (await picWin(page, ik).locator('html').evaluate(() => window.__svgRan || 0).catch(() => 0));
    const fetched = () => asked.filter(u => u.includes('__svg-probe'));

    // Open… takes SVG.
    const ik = await addWin(page, 'image');
    const accept = await picWin(page, ik).locator('#file').getAttribute('accept');
    ok(/image\/svg\+xml/.test(accept) && /\.svg\b/.test(accept) && !/heic|svgz/i.test(accept), `Open… lists SVG drawings, with the five kinds of picture (${accept})`);
    const svg1 = drawing('width="400" height="300"');
    await picOpen(page, picFile('Water cycle.svg', svg1, 'image/svg+xml'), ik);
    let d = await picData(page, ik), L = await picLook(page, ik);
    ok(!!d && raster(d.src) && d.w === 2560 && d.h === 1920 && L.pic && L.nw === 2560 && L.nh === 1920 && !L.err,
      `Open…: a 400 × 300 SVG opens as a picture, drawn at 2560 × 1920 and saved as one, never as SVG (${d && String(d.src).slice(0, 23)}, ${d && d.w} × ${d && d.h}${L.err ? ', ' + L.err : ''})`);
    ok(!!d && d.name === 'Water cycle.svg' && L.alt === 'Water cycle' && d.bytes === Buffer.from(String(d.src).split(',')[1] || '', 'base64').length, `its name and alt text come from the file’s name (${d && d.name}, “${L.alt}”)`);
    const [mid, left, right] = d ? [await pixel(d.src, 0.5, 0.5), await pixel(d.src, 0.1, 0.5), await pixel(d.src, 0.9, 0.5)] : [];
    ok(near(mid, [253, 230, 138]) && near(left, [37, 99, 235]) && !!right && right[3] < 10 && /^data:image\/(webp|png)/.test(d.src),
      `it is the drawing: the yellow circle in the middle, blue on the left, and see-through where it draws nothing, so saved as a WebP, or a PNG where WebP can’t be made (${JSON.stringify([mid, left, right])})`);
    ok(await ran(ik) === 0 && await page.locator('.toast', { hasText: 'The SVG ran' }).count() === 0 && !fetched().length,
      `nothing in it ran (its script and onload) and nothing was fetched (its stylesheet and pictures from elsewhere: ${fetched().join(', ') || 'none'})`);

    // Its size: width and height, else its viewBox (also where they're percentages), else 300 × 150. Always 2560 on its long side.
    for (const [size, w, h, what] of [
      ['viewBox="0 0 30 60"', 1280, 2560, 'a viewBox and no size'],
      ['width="100%" height="100%" viewBox="0 0 400 100"', 2560, 640, 'a size in percent, and a viewBox'],
      ['width="10cm" height="5cm"', 2560, 1280, 'a size in centimetres'],
      ['width="200" viewBox="0 0 100 50"', 2560, 1280, 'a width and a viewBox'],
      ['width="16" height="16"', 2560, 2560, 'a 16 × 16 icon'],
      ['', 2560, 1280, 'no size and no viewBox (taken as 300 × 150)'],
      ['viewBox="0 0 10000 10"', 2560, 3, 'a viewBox 1000 times wider than tall']]) {
      await picOpen(page, picFile('Shape.svg', drawing(size), 'image/svg+xml'), ik);
      d = await picData(page, ik); L = await picLook(page, ik);
      const c = await contentOf(page, ik);
      ok(!!d && raster(d.src) && d.w === w && d.h === h && !L.err && c.w <= 722 && c.h <= 542 && c.w >= 158 && c.h >= 118,
        `${what}: drawn at ${w} × ${h} (${d && d.w} × ${d && d.h}${L.err ? ', ' + L.err : ''}), its window within 720 × 540 (${c.w} × ${c.h})`);
    }
    // Text in a foreignObject, as diagram apps write it.
    await picOpen(page, picFile('Diagram.svg', drawing('width="300" height="200"', '<foreignObject x="0" y="0" width="100%" height="40%"><div xmlns="http://www.w3.org/1999/xhtml" style="font: 30px sans-serif">Evaporation</div></foreignObject>'), 'image/svg+xml'), ik);
    d = await picData(page, ik); L = await picLook(page, ik);
    ok(!!d && d.name === 'Diagram.svg' && raster(d.src) && d.w === 2560 && !L.err, `a drawing with text in a foreignObject (as diagram apps make) opens too (${d && d.name}${L.err ? ', ' + L.err : ''})`);
    // Saved as UTF-16 with its byte order mark (Windows' "Unicode"), accents and all; known by its content too.
    const utf16 = (buf, be) => {
      const b = Buffer.from(buf.toString('utf8').replace('encoding="UTF-8"', 'encoding="UTF-16"'), 'utf16le');
      if (be) b.swap16();
      return Buffer.concat([Buffer.from(be ? [0xfe, 0xff] : [0xff, 0xfe]), b]);
    };
    const accents = drawing('width="400" height="300"', '<text x="10" y="290" font-size="12">Été à l’école</text>');
    for (const [name, buf, type, what] of [['Été.svg', utf16(accents), 'image/svg+xml', 'UTF-16, little-endian'], ['École.svg', utf16(accents, true), 'image/svg+xml', 'UTF-16, big-endian'],
      ['Diagram', utf16(accents), '', 'UTF-16, with no .svg in its name and no type']]) {
      await picOpen(page, picFile(name, buf, type), ik);
      d = await picData(page, ik); L = await picLook(page, ik);
      const [m2, l2] = d ? [await pixel(d.src, 0.5, 0.5), await pixel(d.src, 0.1, 0.5)] : [];
      ok(!!d && d.name === name && raster(d.src) && d.w === 2560 && d.h === 1920 && near(m2, [253, 230, 138]) && near(l2, [37, 99, 235]) && !L.err,
        `an SVG saved as ${what} opens, drawn (${d && d.name}, ${d && d.w} × ${d && d.h}${L.err ? ', ' + L.err : ''}${(await page.locator('.toast').allTextContents()).map(t => '; ' + t).join('')})`);
    }

    // Too big, broken, compressed (SVGZ): turned away kindly in an empty window, nothing saved. Then a good one.
    const ik2 = await addWin(page, 'image');
    for (const [name, buf, say] of [
      ['Huge.svg', drawing('width="400" height="300"', '<!--' + 'x'.repeat(5.3e6) + '-->'), PMSG.svgBig],
      ['Broken.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect></svg>'), PMSG.svgBroken],
      ['Water cycle.svgz', require('zlib').gzipSync(svg1), PMSG.svgBroken]]) {
      await picOpen(page, picFile(name, buf, 'image/svg+xml'), ik2, say);
      L = await picLook(page, ik2);
      ok(L.ask && !L.pic && L.err === say && await picData(page, ik2) === null, `${name} (${(buf.length / 1e6).toFixed(2)} MB): “${L.err}”, and nothing is saved`);
    }
    await picOpen(page, picFile('Water cycle.svg', svg1, 'image/svg+xml'), ik2);
    ok((await picLook(page, ik2)).pic && !(await picLook(page, ik2)).err, 'a good drawing after that shows, and the message goes');

    // Pasted on the board (Ctrl+V), dropped on the board and on a Picture window, and Paste in an empty window.
    const count = async () => (await picWins(page)).length, newest = async () => (await picWins(page)).slice(-1)[0].ik;
    let n = await count();
    await page.mouse.click(30, 330);
    await sendFiles(page, page, 'paste', [picFile('', svg1, 'image/svg+xml')]);
    ok(await eventually(async () => await count() === n + 1 && raster(((await picData(page, await newest())) || {}).src)), 'Ctrl+V on the board with an SVG opens a Picture window with it drawn');
    d = await picData(page, await newest());
    ok(!!d && d.w === 2560 && d.h === 1920 && d.name === '' && (await picLook(page, await newest())).alt === 'Picture', `a pasted drawing has no name of its own (“${(await picLook(page, await newest())).alt}”)`);
    n = await count();
    await sendFiles(page, page, 'drop', [picFile('Map.svg', drawing('viewBox="0 0 30 60"'), 'image/svg+xml')], { x: 700, y: 400 });
    ok(await eventually(async () => await count() === n + 1 && ((await picData(page, await newest())) || {}).h === 2560), 'an SVG dropped on the board opens in a Picture window, drawn');
    await sendFiles(page, ik2, 'drop', [picFile('Leaf.svg', drawing('width="16" height="16"'), 'image/svg+xml')], { x: 20, y: 20 });
    ok(await eventually(async () => ((await picData(page, ik2)) || {}).name === 'Leaf.svg' && raster(((await picData(page, ik2)) || {}).src)), 'an SVG dropped on a Picture window goes into that window, drawn');
    const copied = await page.evaluate(async svg => { await navigator.clipboard.write([new ClipboardItem({ 'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }) })]); return (await navigator.clipboard.read()).map(i => i.types.join(' ')).join(', '); }, svg1.toString()).catch(e => 'not written: ' + e.message);
    const ik3 = await page.evaluate(async () => { const ik = window.__board21.openWidget('image', { fresh: true }); await new Promise(r => setTimeout(r, 900)); return ik; });
    await picWin(page, ik3).locator('#paste').click({ timeout: 3000 }).catch(() => {});
    ok(/image\/svg\+xml/.test(copied) && await eventually(async () => raster(((await picData(page, ik3)) || {}).src) && ((await picData(page, ik3)) || {}).w === 2560),
      `with only an SVG on the clipboard (${copied}), Paste in a Picture window draws it (${(await picLook(page, ik3)).err || 'no message'})`);
    ok(await ran(ik3) === 0 && await ran(ik2) === 0 && await page.locator('.toast', { hasText: 'The SVG ran' }).count() === 0 && !fetched().length, `and still nothing ran or was fetched (${fetched().join(', ') || 'none'})`);
    await page.screenshot({ path: OUT + 'picture-svg.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Image: photos saved as WebP (smaller than the JPEG before, a second smaller try, JPEG where WebP can’t be made; see-through pictures as before), and see-through pictures on the window’s own color, light and dark', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const ik = await addWin(page, 'image');
    // A still drawn again at w × h as the release before saved it: opaque, a JPEG at 0.85, or the smaller of that and
    // 0.72 where it was over 1.2 MB; see-through, a WebP at 0.9 or 0.75. Or at one type and quality (q).
    const encode = (buf, w, h, type, q, clear) => page.evaluate(async ([b64, w, h, type, q, clear]) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))]));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: clear }); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
      const enc = q => new Promise(r => c.toBlob(r, type, q));
      if (q) return (await enc(q)).size;
      const hi = type === 'image/jpeg' ? 0.85 : 0.9, lo = type === 'image/jpeg' ? 0.72 : 0.75;
      const a = await enc(hi); if (a.size <= 1200000) return a.size;
      const b = await enc(lo); return Math.min(a.size, b.size);
    }, [buf.toString('base64'), w, h, type, q || 0, !!clear]);
    const kb = n => Math.round(n / 1e3) + ' KB';

    // A photo: WebP, smaller than the JPEG the release before made from it.
    const photo = await drawPic(page, 4200, 2800, 'image/jpeg', { noise: 15, q: 0.92 });
    await picOpen(page, picFile('Class photo.jpg', photo, 'image/jpeg'), ik);
    let d = await picData(page, ik);
    const jpegBefore = await encode(photo, 2560, 1707, 'image/jpeg');
    ok(!!d && /^data:image\/webp;base64,/.test(d.src) && d.w === 2560 && d.h === 1707 && d.bytes < jpegBefore && d.bytes === Buffer.from(String(d.src).split(',')[1] || '', 'base64').length,
      `a ${(photo.length / 1e6).toFixed(1)} MB photo, 4200 × 2800, is saved as a WebP at 2560 × 1707: ${d && kb(d.bytes)}, where the JPEG before was ${kb(jpegBefore)} (${d && String(d.src).slice(0, 23)})`);
    console.log(`  (the photo: WebP ${d && kb(d.bytes)}, JPEG before ${kb(jpegBefore)}: ${d && Math.round(100 - 100 * d.bytes / jpegBefore)}% smaller)`);
    ok(!!d && d.bytes === await encode(photo, 2560, 1707, 'image/webp', 0.85), `at quality 0.85 (${d && kb(d.bytes)})`);
    // Still over 1.2 MB at 0.85: made again at 0.72, as the JPEG was.
    const grain = await drawPic(page, 4200, 2800, 'image/jpeg', { noise: 255, q: 0.9 });
    await picOpen(page, picFile('Sand.jpg', grain, 'image/jpeg'), ik);
    d = await picData(page, ik);
    const w85 = await encode(grain, 2560, 1707, 'image/webp', 0.85), w72 = await encode(grain, 2560, 1707, 'image/webp', 0.72);
    ok(!!d && d.name === 'Sand.jpg' && /^data:image\/webp/.test(d.src) && w85 > 1.2e6 && d.bytes === Math.min(w85, w72) && d.bytes < w85,
      `a photo still over 1.2 MB as a WebP at 0.85 (${kb(w85)}) is made again at 0.72 (${d && kb(d.bytes)})`);
    // See-through: as before, a WebP at 0.9.
    const logo = await drawPic(page, 3200, 1600, 'image/png', { noise: 63, alpha: true });
    await picOpen(page, picFile('Logo.png', logo, 'image/png'), ik);
    d = await picData(page, ik);
    const logoBefore = await encode(logo, 2560, 1280, 'image/webp', 0, true);
    ok(!!d && d.name === 'Logo.png' && /^data:image\/webp/.test(d.src) && d.bytes === logoBefore && await alphaAt(page, d.src, 10, 10) < 10,
      `a see-through picture is saved as before: a WebP at 0.9, still clear where it was (${d && kb(d.bytes)}, before ${kb(logoBefore)})`);

    // A browser that can't make a WebP (it gives a PNG instead): the photo is a JPEG as before, a see-through picture a PNG.
    await picWin(page, ik).locator('html').evaluate(() => { const tb = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { return tb.call(this, cb, type === 'image/webp' ? 'image/png' : type, q); }; });
    await picOpen(page, picFile('Class photo.jpg', photo, 'image/jpeg'), ik);
    d = await picData(page, ik);
    ok(!!d && /^data:image\/jpeg;base64,/.test(d.src) && d.w === 2560 && d.bytes === jpegBefore, `where WebP can’t be made, a photo is a JPEG, as before (${d && String(d.src).slice(0, 23)}, ${d && kb(d.bytes)})`);
    await picOpen(page, picFile('Logo.png', logo, 'image/png'), ik);
    d = await picData(page, ik);
    ok(!!d && d.name === 'Logo.png' && /^data:image\/png;base64,/.test(d.src) && await alphaAt(page, d.src, 10, 10) < 10, `and a see-through picture a PNG (${d && String(d.src).slice(0, 22)})`);

    // A see-through picture shows the window's own color behind it, light and dark: no white backing.
    const clear = await drawPic(page, 240, 180, 'image/png', { alpha: true });   // (its top-left quarter clear)
    const ik2 = await addWin(page, 'image');
    await picOpen(page, picFile('Clip art.png', clear, 'image/png'), ik2);
    // One pixel of the screen.
    const screenPx = async (x, y) => page.evaluate(async b64 => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return Array.from(g.getImageData(0, 0, 1, 1).data).slice(0, 3); },
      (await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })).toString('base64'));
    for (const theme of ['light', 'dark']) {
      await openSettings(page); await page.click(`#settings [data-act="theme"][data-val="${theme}"]`); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      await page.evaluate(ik => window.__board21.focusWin(ik), ik2); await page.waitForTimeout(200);
      const L = await picLook(page, ik2), fr = await page.locator(`.win[data-ikey="${ik2}"] iframe`).boundingBox();
      const px = await screenPx(fr.x + L.box.x + L.box.w * 0.2, fr.y + L.box.y + L.box.h * 0.2), win = (L.around.match(/\d+/g) || []).slice(0, 3).map(Number);
      ok(L.behind === 'rgba(0, 0, 0, 0)' && px.every((v, k) => Math.abs(v - win[k]) <= 2) && (theme === 'light' || px.some(v => v < 200)),
        `${theme}: where the picture is see-through, the window’s own color shows (${JSON.stringify(px)}, the window ${L.around}; behind the picture ${L.behind})`);
      await page.screenshot({ path: OUT + `picture-see-through-${theme}.png` });
    }
    await openSettings(page); await page.click('#settings [data-act="theme"][data-val="light"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Image: pasting and dropping pictures onto the board (Ctrl+V, after tapping a widget, Notes keeps its paste, an empty Picture window, text, the Paste button, locked windows, drops on the board and on windows, kiosk, offline)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const small = await drawPic(page, 90, 60, 'image/png'), tall = await drawPic(page, 60, 90, 'image/png');
    const count = async () => (await picWins(page)).length;
    const board = () => page.evaluate(() => window.__board21.boundsRect());
    const centre = ik => page.evaluate(ik => { const r = window.__board21.state.insts.get(ik).rect; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }, ik);
    const newest = async () => { const w = await picWins(page); return w.length ? w[w.length - 1].ik : null; };
    const tapBoard = () => page.mouse.click(30, 330);   // (the empty board, at its left edge)
    // A new, empty Picture window (never one closed earlier, which has its picture).
    const freshPic = p => p.evaluate(async () => { const ik = window.__board21.openWidget('image', { fresh: true }); await new Promise(r => setTimeout(r, 900)); return ik; });

    // Ctrl+V on the board: a new Picture window, in the middle of the board, in front and selected.
    await copyPic(page, small);
    await tapBoard();
    await page.keyboard.press('Control+V');
    ok(await eventually(async () => ((await picData(page, 'image:1')) || {}).w === 90), 'Ctrl+V on the board opens a Picture window with the picture copied');
    await page.waitForTimeout(300);
    let L = await picLook(page);
    const b = await board(), m = await centre('image:1'), c1 = await contentOf(page, 'image:1');
    ok(L.pic && L.nw === 90 && L.alt === 'Picture' && ((await picData(page)) || {}).name === '', `it shows, named “Picture” for a screen reader (a pasted picture has no name of its own: ${L.alt})`);
    ok(Math.abs(m.x - (b.x + b.w / 2)) < 40 && Math.abs(m.y - (b.y + b.h * 0.42)) < 40 && Math.abs(c1.w - 360) <= 2 && Math.abs(c1.h - 240) <= 2 && await page.evaluate(() => window.__board21.state.focused) === 'image:1',
      `in the middle of the board, where new windows open, in the picture’s shape, in front and selected (${Math.round(m.x)}, ${Math.round(m.y)} on ${b.w} × ${b.h}; ${c1.w} × ${c1.h})`);
    await page.screenshot({ path: OUT + 'picture-pasted.png' });
    // Again: another new window. A closed Picture window isn't used: it keeps its own picture.
    await tapBoard(); await page.keyboard.press('Control+V');
    ok(await eventually(async () => await count() === 2), 'pasting again opens a second window');
    await page.evaluate(() => window.__board21.closeWin('image:1', { quiet: true })); await page.waitForTimeout(400);
    await copyPic(page, tall);
    await tapBoard(); await page.keyboard.press('Control+V');
    ok(await eventually(async () => await count() === 3), 'with a Picture window closed, a paste still opens a new one');
    ok(await eventually(async () => ((await picData(page, await newest())) || {}).w === 60), 'the new one has the new picture');
    const shut = (await picWins(page)).find(w => w.ik === 'image:1');
    ok(shut && !shut.open && ((await picData(page, 'image:1')) || {}).w === 90, 'the closed one keeps its own picture');

    // After tapping a widget (the keyboard goes to its window): Ctrl+V still opens a Picture window. In Notes, the
    // paste is the note's.
    const timer = await addWin(page, 'timer');
    await page.frameLocator(`.win[data-ikey="${timer}"] iframe`).locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    let n = await count();
    await page.keyboard.press('Control+V');
    ok(await eventually(async () => await count() === n + 1), 'after tapping a Timer, Ctrl+V opens a Picture window (the widget passes the paste to the board)');
    const note = await addNote(page, 'Spelling words');
    n = await count();
    const nf = page.frame({ name: 'b21-board:' + note });
    if (await nf.isVisible('#view')) await nf.click('#view');
    await nf.focus('#t');
    await page.keyboard.press('Control+V'); await page.waitForTimeout(1200);
    ok(await count() === n && await noteOf(page, note) === 'Spelling words', 'in Notes, Ctrl+V is the note’s: no Picture window');
    // An empty Picture window that has the keyboard takes the picture itself; one with a picture leaves it to the board.
    const empty = await freshPic(page);
    await picWin(page, empty).locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    n = await count();
    await page.keyboard.press('Control+V');
    ok(await eventually(async () => ((await picData(page, empty)) || {}).w === 60) && await count() === n, 'in an empty Picture window, the picture goes into that window');
    await picWin(page, empty).locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Control+V');
    ok(await eventually(async () => await count() === n + 1), 'in a Picture window with a picture, Ctrl+V opens a new one');
    // Words on the clipboard: nothing new. (A video link opens a Video Player: its own suite.)
    await copyText(page, 'Spelling words');
    n = await count();
    await tapBoard(); await page.keyboard.press('Control+V'); await page.waitForTimeout(1000);
    ok(await count() === n, 'pasting text on the board opens nothing');

    // The Paste button, in an empty window: the clipboard's picture, or what to do.
    const p1 = await freshPic(page);
    await picWin(page, p1).locator('#paste').click({ timeout: 3000 }).catch(() => {});
    ok(await eventually(async () => (await picLook(page, p1)).err === PMSG.empty), `Paste with no picture on the clipboard says so (${(await picLook(page, p1)).err})`);
    await copyPic(page, tall);
    await picWin(page, p1).locator('#paste').click({ timeout: 3000 }).catch(() => {});
    ok(await eventually(async () => ((await picData(page, p1)) || {}).w === 60 && (await picLook(page, p1)).pic), 'Paste puts the clipboard’s picture in the window');
    await ctx.clearPermissions();
    const p2 = await freshPic(page);
    await picWin(page, p2).locator('#paste').click({ timeout: 3000 }).catch(() => {});
    ok(await eventually(async () => (await picLook(page, p2)).err === PMSG.blocked, 4000), `when the browser won’t let 21Board see the clipboard, it says so (${(await picLook(page, p2)).err})`);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    // An SVG and a PNG on the clipboard, as a drawing app may copy: Paste uses the PNG.
    const both = await page.evaluate(async b64 => {
      const png = new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))], { type: 'image/png' }), svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="90" height="60"/>'], { type: 'image/svg+xml' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/svg+xml': svg, 'image/png': png })]);
      return (await navigator.clipboard.read()).map(i => i.types.join(' ')).join(', ');
    }, small.toString('base64')).catch(e => 'not written: ' + e.message);
    const p3 = await freshPic(page);
    await picWin(page, p3).locator('#paste').click({ timeout: 3000 }).catch(() => {});
    ok(/image\/svg\+xml/.test(both) && await eventually(async () => ((await picData(page, p3)) || {}).w === 90 && /^data:image\/png/.test(((await picData(page, p3)) || {}).src)),
      `with an SVG and a PNG on the clipboard (${both}), Paste uses the PNG (${(await picLook(page, p3)).err || 'no message'})`);
    // On a touch screen, the Picture tile can bring back a closed Picture window with its picture. Its menu has Paste,
    // which puts the clipboard's picture in place of the old one.
    await copyPic(page, tall);
    await page.click('.picker-btn.left'); await page.waitForTimeout(250); await page.click('[data-widget="image"]');
    ok(await eventually(async () => (await picLook(page, 'image:1')).pic) && ((await picData(page, 'image:1')) || {}).w === 90, 'the Picture tile brings back the closed Picture window, with its picture');
    ok(await picMenu(page, 'image:1') === 'Open… | Paste | — | ✓ Whole picture | Crop to fill | — | Remove picture', `its menu has Paste (${await picMenu(page, 'image:1')})`);
    const menuPaste = () => ytChoose(page, 'Paste', 'image:1').catch(() => page.keyboard.press('Escape'));
    await menuPaste();
    ok(await eventually(async () => ((await picData(page, 'image:1')) || {}).w === 60), 'Paste in the menu puts the clipboard’s picture in its place');
    await copyText(page, 'Spelling words');
    await menuPaste();
    ok(await eventually(async () => await page.locator('.toast', { hasText: PMSG.empty }).count() > 0) && ((await picData(page, 'image:1')) || {}).w === 60, 'with no picture on the clipboard, it says so, and the picture stays');

    // Locked: no new window, and the board says it's locked.
    await lockBoard(page, 'widgets');
    n = await count();
    await copyPic(page, small);
    await tapBoard(); await page.keyboard.press('Control+V'); await page.waitForTimeout(800);
    ok(await count() === n && await page.locator('.toast', { hasText: 'The board is locked.' }).count() > 0, 'locked: a paste opens nothing, and the board says it’s locked');
    n = await count();
    await sendFiles(page, page, 'drop', [picFile('Frog.png', small, 'image/png')], { x: 300, y: 300 }); await page.waitForTimeout(800);
    ok(await count() === n, 'nor does a drop');
    await unlockBoard(page);

    // Drops on the board: a window for each picture, where they were dropped. A file that isn't one opens nothing.
    // (The left half of the board is cleared first: the Timer and the note move to the right.)
    for (const k of (await picWins(page)).filter(w => w.open).map(w => w.ik)) await page.evaluate(ik => window.__board21.closeWin(ik, { quiet: true }), k);
    await page.evaluate(iks => { const B = window.__board21, v = B.boundsRect(); iks.forEach((ik, j) => { const r = B.state.insts.get(ik).rect; B.setRect(ik, Object.assign({}, r, { x: v.x + v.w - r.w - 40, y: v.y + 40 + j * (v.h / 2) })); }); }, [timer, note]);
    await page.waitForTimeout(400);
    n = await count();
    const took = await sendFiles(page, page, 'drop', [picFile('Frog.png', small, 'image/png'), picFile('Dance.gif', FIXTURE('picture-animated.gif'), 'image/gif'), picFile('list.txt', Buffer.from('words'), 'text/plain')], { x: 260, y: 260 });
    ok(took && await eventually(async () => await count() === n + 2), `dropping two pictures and a text file on the board opens two Picture windows (${await count() - n})`);
    const dropped = (await picWins(page)).slice(-2).map(w => w.ik), bb = await board();
    ok(await eventually(async () => ((await picData(page, dropped[0])) || {}).name === 'Frog.png' && ((await picData(page, dropped[1])) || {}).name === 'Dance.gif'), 'each with its picture');
    await page.waitForTimeout(300);
    const at = await page.evaluate(() => { const Z = window.__board21.zoom; return { x: (260 - Z.ox) / Z.s, y: (260 - Z.oy) / Z.s }; });
    const rs = await page.evaluate(iks => iks.map(ik => window.__board21.state.insts.get(ik).rect), dropped), cs = rs.map(r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 }));
    const apart = rs[0].x + rs[0].w <= rs[1].x || rs[1].x + rs[1].w <= rs[0].x || rs[0].y + rs[0].h <= rs[1].y || rs[1].y + rs[1].h <= rs[0].y;
    ok(Math.hypot(cs[0].x - at.x, cs[0].y - at.y) < 40 && apart && Math.hypot(cs[1].x - at.x, cs[1].y - at.y) < 600 && cs.every(q => q.x < bb.x + bb.w / 2),
      `where they were dropped, in their pictures’ shapes: the first there, the next beside it (${cs.map(q => Math.round(q.x) + ',' + Math.round(q.y)).join(' ')}; dropped at ${Math.round(at.x)},${Math.round(at.y)})`);
    await sendFiles(page, page, 'drop', [picFile('drawing.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="60"><rect width="45" height="60" fill="#2563eb"/></svg>'), 'image/svg+xml')], { x: 900, y: 500 });
    ok(await eventually(async () => /^data:image\/(webp|png);base64,/.test(((await picData(page, await newest())) || {}).src) && ((await picData(page, await newest())) || {}).w === 2560), 'an SVG dropped on the board opens in a window, drawn as a picture');
    // On a window: a Picture window takes it; any other keeps its page, and the board opens the picture beside it.
    n = await count();
    const onPic = await sendFiles(page, dropped[0], 'drop', [picFile('Tall.png', tall, 'image/png')], { x: 20, y: 20 });
    ok(onPic && await eventually(async () => ((await picData(page, dropped[0])) || {}).name === 'Tall.png') && await count() === n, 'dropped on a Picture window, the picture goes into that window');
    const onNote = await sendFiles(page, note, 'drop', [picFile('Frog.png', small, 'image/png')], { x: 20, y: 20 });
    ok(onNote && await eventually(async () => await count() === n + 1), 'dropped on a Notes window, the board opens a Picture window for it');
    ok(await page.frame({ name: 'b21-board:' + note }).evaluate(() => /widgets\/notes\/index\.html$/.test(location.pathname)).catch(() => false) && await noteOf(page, note) === 'Spelling words', 'and the note stays as it was (the browser doesn’t open the file in its place)');
    // A .21board file dropped on a window: the board asks how to import it, as when it is dropped on the board.
    const file21 = Buffer.from(JSON.stringify(await page.evaluate(() => window.__board21.buildExport('template'))));
    await sendFiles(page, note, 'drop', [picFile('Class.21board', file21, '')], { x: 20, y: 20 });
    ok(await eventually(async () => /Import “Class”/.test(await page.locator('#modal.open').innerText().catch(() => ''))), 'a .21board file dropped on a window asks how to import it, as on the board');
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300);
    // Several pictures dropped on a Picture window: a window for each, as on the board. That window keeps its own.
    n = await count();
    const three = await sendFiles(page, dropped[0], 'drop', [picFile('a.png', small, 'image/png'), picFile('b.png', tall, 'image/png'), picFile('c.png', small, 'image/png')], { x: 20, y: 20 });
    ok(three && await eventually(async () => await count() === n + 3) && ((await picData(page, dropped[0])) || {}).name === 'Tall.png', `three pictures dropped on a Picture window open a window each (${await count() - n}), and it keeps its own picture`);
    ok(await eventually(async () => (await Promise.all((await picWins(page)).slice(-3).map(async w => ((await picData(page, w.ik)) || {}).name))).join() === 'a.png,b.png,c.png'), 'each with its picture');
    // More than 10 pictures at once, on the board or on a window: 10 open, and the board says to drop the rest again.
    for (const [where, label] of [[page, 'on the board'], [note, 'on a window']]) {
      for (const w of (await picWins(page)).filter(w => w.open)) await page.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), w.ik);
      await page.locator('.toast').evaluateAll(ts => ts.forEach(t => t.remove())).catch(() => {});
      n = await count();
      await sendFiles(page, where, 'drop', Array.from({ length: 12 }, (_, i) => picFile(`p${i + 1}.png`, small, 'image/png')), { x: where === page ? 500 : 20, y: where === page ? 400 : 20 });
      ok(await eventually(async () => await count() === n + 10) && await eventually(async () => await page.locator('.toast', { hasText: 'Opened 10 pictures. Drop the rest again.' }).count() > 0),
        `12 pictures dropped ${label}: 10 open, and the board says “Opened 10 pictures. Drop the rest again.” (${await count() - n})`);
    }
    for (const w of (await picWins(page)).filter(w => w.open)) await page.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), w.ik);

    // A widget uploaded in Developer mode is sealed off: a paste in it isn't passed on.
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]');
    fs.writeFileSync(OUT + 'picture-sealed.html', '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Sealed</title><script type="application/json" id="board21-widget">{"id":"sealed","name":"Sealed","window":{"width":300,"height":200}}</script></head><body style="height:100vh;margin:0">sealed</body></html>');
    await page.setInputFiles('#widget-input', OUT + 'picture-sealed.html');
    ok(await eventually(() => page.evaluate(() => { const w = window.__board21.state.wins.get('dev-sealed:1'); return !!w && w.connected; })), 'a widget file uploaded in Developer mode opens');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await copyPic(page, small);
    n = await count();
    await page.frameLocator('.win[data-ikey="dev-sealed:1"] iframe').locator('body').click({ position: { x: 20, y: 20 } }).catch(() => {});
    await page.keyboard.press('Control+V'); await page.waitForTimeout(1200);
    ok(await count() === n, 'a paste in a widget uploaded in Developer mode isn’t passed on: no Picture window');

    // Kiosk mode: Open… and Ctrl+V work there too.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    const kk = await freshPic(k);
    const [kc] = await Promise.all([k.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), picWin(k, kk).locator('#open').click({ timeout: 3000 }).catch(() => {})]);
    ok(!!kc, 'kiosk: Open… shows the file dialog (ChromeOS’s Files)');
    if (kc) await kc.setFiles(picFile('Kiosk.png', small, 'image/png'));
    ok(await eventually(async () => (await picLook(k, kk)).pic), 'and the picture shows');
    n = (await picWins(k)).length;
    await copyPic(k, tall); await k.mouse.click(30, 330); await k.keyboard.press('Control+V');
    ok(await eventually(async () => (await picWins(k)).length === n + 1), 'kiosk: Ctrl+V opens a Picture window');
    await k.close();

    // Offline: a picture still opens and pastes.
    if (stamped()) {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {});
      await ctx.setOffline(true);
      await page.reload(); await boardUp(page);
      n = await count();
      await copyPic(page, small); await tapBoard(); await page.keyboard.press('Control+V');
      ok(await eventually(async () => await count() === n + 1 && (await picLook(page, await newest())).pic), 'offline: a pasted picture opens and shows');
      await ctx.setOffline(false);
    } else ok(false, STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Image: two tabs, export and import, Board history (each picture kept once: what one version costs), going back and putting back', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const a = await ctx.newPage(), b = await ctx.newPage();
    const errors = []; a.on('pageerror', e => errors.push('[A] ' + e.message)); b.on('pageerror', e => errors.push('[B] ' + e.message));
    await a.goto(BASE); await boardUp(a); await b.goto(BASE); await boardUp(b);
    const ik = await addWin(a, 'image');
    const photo = await drawPic(a, 1400, 1000, 'image/jpeg', { noise: 15, q: 0.85 });
    await picOpen(a, picFile('Volcano.jpg', photo, 'image/jpeg'), ik);
    const pic = ((await picData(a, ik)) || {}).src || '';
    ok(pic.length > 1000 && await eventually(async () => (await picLook(b, ik)).src === pic), `the other tab shows the same picture (${Math.round(pic.length / 1e3)} KB as content)`);
    const rect = p => p.evaluate(ik => JSON.stringify(window.__board21.state.insts.get(ik).rect), ik);
    ok(await eventually(async () => await rect(a) === await rect(b)), 'and the window has the picture’s shape there too');
    await ytChoose(b, 'Crop to fill', ik);
    ok(await eventually(async () => ((await picConf(a, ik)) || {}).fit === 'fill'), 'Crop to fill in one tab is Crop to fill in the other');
    await ytChoose(b, 'Remove picture', ik);
    ok(await eventually(async () => (await picLook(a, ik)).ask), 'Remove picture in one tab empties the window in the other');
    await picOpen(a, picFile('Volcano.jpg', photo, 'image/jpeg'), ik);
    ok(await eventually(async () => (await picLook(b, ik)).src === pic), 'a picture opened again shows in both');

    // Export and import: a full backup carries the picture, a template leaves it out (Crop to fill stays).
    const full = await a.evaluate(() => window.__board21.buildExport('full')), tpl = await a.evaluate(() => window.__board21.buildExport('template'));
    const fi = full.instances.find(i => i.widgetId === 'image'), ti = tpl.instances.find(i => i.widgetId === 'image');
    ok(!!fi && fi.data && fi.data.src === pic && fi.data.name === 'Volcano.jpg' && (fi.config || {}).fit === 'fill', 'a full export carries the picture in the window’s content');
    ok(!!ti && ti.data === null && (ti.config || {}).fit === 'fill', 'a template leaves the picture out (a picture may show the class), and keeps Crop to fill');
    fs.writeFileSync(OUT + 'picture-board.21board', JSON.stringify(full));
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } }), c = await ctx2.newPage();
    c.on('pageerror', e => errors.push('[C] ' + e.message));
    await c.goto(BASE); await boardUp(c);
    await c.setInputFiles('#import-input', OUT + 'picture-board.21board');
    await c.locator('#modal.open .btn', { hasText: 'Replace this page' }).click({ timeout: 5000 }).catch(() => {});
    ok(await eventually(async () => (await picLook(c, ik)).src === pic && (await picLook(c, ik)).pic), 'importing it on another device shows the picture');
    await ctx2.close();

    // Board history: each picture is kept once. One version costs what the page costs without its pictures.
    const H = () => a.evaluate(async () => {
      const BH = window.__board21.history, all = s => BH.tx([s], 'readonly', (o, set) => { const q = o[s].getAll(); q.onsuccess = () => set(q.result); });
      const metas = await all('meta'), photos = await all('photo'), bodies = await all('body');
      return { metas: metas.map(m => ({ id: m.id, bytes: m.bytes, pics: m.pics || null, wins: m.wins })), pics: photos.filter(p => /^pic-/.test(p.key)).map(p => ({ key: p.key, size: (p.data || '').length })),
        bodies: bodies.map(x => ({ id: x.id, size: JSON.stringify(x.exp).length, src: (x.exp.instances.find(i => i.widgetId === 'image') || { data: null }).data })) };
    });
    const v1 = await a.evaluate(() => window.__board21.history.save('With the volcano'));
    await a.evaluate(ik => window.__board21.setRect(ik, Object.assign({}, window.__board21.state.insts.get(ik).rect, { x: 60, y: 60 })), ik); await a.waitForTimeout(600);
    const v2 = await a.evaluate(() => window.__board21.history.save('Moved'));
    let h = await H();
    const m1 = h.metas.find(x => x.id === v1), m2 = h.metas.find(x => x.id === v2), b1 = h.bodies.find(x => x.id === v1);
    ok(!!v1 && !!v2 && v1 !== v2 && h.pics.length === 1 && h.pics[0].size === pic.length && m1 && m2 && m1.bytes < 20000 && m2.bytes < 20000 && JSON.stringify(m1.pics) === JSON.stringify([h.pics[0].key]),
      `Board history keeps the picture once (${Math.round(pic.length / 1e3)} KB), however many versions show it; each version costs ${m1 && m1.bytes} and ${m2 && m2.bytes} bytes`);
    console.log(`  (Board history: one version of this page costs ${m1 && m1.bytes} bytes, its ${Math.round(pic.length / 1e3)} KB picture once: ${h.pics.length} kept)`);
    ok(!!b1 && b1.size < 20000 && b1.src && b1.src.src && b1.src.src.b21pic === (h.pics[0] || {}).key, `a version names its picture ({ "b21pic": key }) instead of holding it (${b1 && JSON.stringify(b1.src).slice(0, 80)})`);
    ok((m1 && m1.wins[ik] && m1.wins[ik][5]) === 'Volcano.jpg', `the version’s list of windows shows the picture’s name, not its data (${m1 && m1.wins[ik] && m1.wins[ik][5]})`);
    const back = await a.evaluate(id => window.__board21.history.get(id).then(r => r.body.exp.instances.find(i => i.widgetId === 'image').data.src), v1);
    ok(back === pic, 'reading a version gives its picture back whole');
    // Tidying board history (2 s after each version) reads no picture: their sizes are in their keys.
    const read = await a.evaluate(async () => {
      const got = [], getAll = IDBObjectStore.prototype.getAll, get = IDBObjectStore.prototype.get;
      const watch = (r, store) => { if (store === 'photo') r.addEventListener('success', () => [].concat(r.result || []).forEach(x => { if (x && /^pic-/.test(x.key)) got.push(x.key); })); return r; };
      IDBObjectStore.prototype.getAll = function (...x) { return watch(getAll.apply(this, x), this.name); };
      IDBObjectStore.prototype.get = function (...x) { return watch(get.apply(this, x), this.name); };
      try { await window.__board21.history.prune(); } finally { IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.get = get; }
      return got;
    });
    h = await H();
    ok(read.length === 0 && h.pics.length === 1, `tidying board history reads no picture (${read.length} read), and keeps the one its versions name (${h.pics.length})`);
    // Going back after Remove picture, and putting back a deleted window.
    await ytChoose(a, 'Remove picture', ik);
    await a.evaluate(id => window.__board21.history.restore(id), v1);
    ok(await eventually(async () => (await picLook(a, ik)).src === pic && (await picLook(b, ik)).src === pic), 'going back to a version brings the picture back, in both tabs');
    await a.evaluate(ik => window.__board21.deleteInstance(ik, { history: false }), ik); await a.waitForTimeout(600);
    await a.evaluate(([id, ik]) => window.__board21.history.putBack(id, ik), [v1, ik]);
    ok(await eventually(async () => (await picLook(a, ik)).src === pic), 'putting back a deleted window brings its picture');
    // Versions deleted: the picture goes with the last one that named it.
    await a.evaluate(() => window.__board21.history.clearBoard());
    h = await H();
    ok(h.pics.length === 0, `deleting the page’s versions deletes the picture they kept (${h.pics.length} left)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Image: Board Sync on two devices (a picture added on the laptop shows on the smartboard, changed on both: the later one wins, Crop to fill, Remove picture, the picture inside the device file)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const ik = await addWin(A.p, 'image');
    const one = await drawPic(A.p, 120, 90, 'image/png'), two = await drawPic(A.p, 90, 120, 'image/jpeg', { q: 0.8 }), three = FIXTURE('picture-animated.gif');
    const url = (buf, type) => `data:${type};base64,${buf.toString('base64')}`;
    await picOpen(A.p, picFile('One.png', one, 'image/png'), ik);
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const wid = await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ik), ikB = await ikOf(B.p, wid);
    ok(!!ikB && await eventually(async () => (await picLook(B.p, ikB)).src === url(one, 'image/png')), 'the smartboard shows the picture added on the laptop');
    const own = await ownJSON(A.p), inFile = own && JSON.stringify(own).includes(url(one, 'image/png'));
    ok(inFile, `a picture under 32 KB as content travels inside the laptop’s file in the folder (${own ? Math.round(JSON.stringify(own).length / 1e3) + ' KB' : 'no file'})`);
    // Changed on both before they synced: the later one wins, on both, with no copy.
    await picOpen(B.p, picFile('Two.jpg', two, 'image/jpeg'), ikB); await syncNow(B.p); await B.p.waitForTimeout(1500);
    await picOpen(A.p, picFile('Three.gif', three, 'image/gif'), ik); await A.p.waitForTimeout(300); await syncNow(A.p);
    await exchange(A, B); await A.p.waitForTimeout(800);
    const wins = async d => (await winList(d.p)).filter(x => x.widgetId === 'image');
    const sa = await picLook(A.p, ik), sb = await picLook(B.p, ikB);
    ok(sa.src === url(three, 'image/gif') && sb.src === url(three, 'image/gif') && (await wins(A)).length === 1 && (await wins(B)).length === 1,
      `a picture changed on both devices: the later one shows on both, and no copy is kept (laptop ${sa.src.slice(0, 20)}, smartboard ${sb.src.slice(0, 20)})`);
    await ytChoose(B.p, 'Crop to fill', ikB); await B.p.waitForTimeout(300); await syncNow(B.p); await exchange(A, B);
    ok(await eventually(async () => ((await picConf(A.p, ik)) || {}).fit === 'fill'), 'Crop to fill reaches the other device');
    await ytChoose(A.p, 'Remove picture', ik); await A.p.waitForTimeout(300); await syncNow(A.p); await exchange(A, B);
    ok(await eventually(async () => (await picLook(B.p, ikB)).ask), 'Remove picture reaches the other device');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ];
};
