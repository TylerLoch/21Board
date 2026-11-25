// The Video Player: YouTube, Google Drive, and Vimeo links, its History, and Board Sync.
'use strict';
module.exports = T => {
  const {
    http, fs, path, ROOT, OUT, ok, openSettings, lockBoard, unlockBoard, setCornerClock, deliver, linkFolder,
    syncNow, addNote, noteOf, addWin, winList, ikOf, saveData, syncDev, exchange, eventually, release, boardUp, VID,
    VID2, YT_TITLES, YT_LABEL, OEMBED, EMBED, EMBED_CODE, PLAYLIST_EMBED, D1, D2, RK, V1, V2, VH, VIMEO_TITLES,
    DRIVE_EMBED, VIMEO_EMBED, VIMEO_OEMBED, DRIVE_OPEN, VIMEO_OPEN, DRIVE_LABEL, VMSG, vidFrames, DRIVE_CODE,
    VIMEO_CODE, stubVideos, ytWin, ytLook, ytFrames, ytMenu, ytData, ytChoose, ytShow, ytHistory, ytPick, drawPic,
    copyText, contrast, BASE
  } = T;
  return [
  ['Video Player: the Widget Picker, YouTube links, the frame YouTube gets, the window menu, kiosk, Open in YouTube, the docs and Settings › About', async (browser) => {
    const src = fs.readFileSync(path.join(ROOT, 'widgets', 'youtube-player', 'index.html'), 'utf8');
    ok(!/--b21-[\w-]+\s*:/.test(src), 'the widget never sets a --b21-* value of its own: the board’s theme colors reach it');
    ok(!/touchstart/.test(src), 'no touchstart handler (and no toolbar over the player: checked below)');
    ok(/const EMBED_HOST = 'https:\/\/www\.youtube\.com';/.test(src), 'the embed host is one named constant, www.youtube.com');
    // The docs: 21Board's value (work stored only on the device, and in the teacher's Drive with Board Sync; online when
    // needed), what the video sites see, kiosk mode's menu and Drive there, and what IT needs to know.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), registrySrc = fs.readFileSync(path.join(ROOT, 'widgets', 'registry.js'), 'utf8');
    ok(!/sends nothing|nothing anywhere|All data stays/.test(readme), 'and no longer says 21Board sends nothing anywhere');
    const row = readme.slice(readme.indexOf('| **Video Player**'), readme.indexOf('| **21Sketch**'));
    ok(/^\| \*\*Video Player\*\* \|.*History/.test(row) && row.includes('oEmbed without cookies') && !/YouTube Player/.test(readme), 'its row in Included widgets names the History and asks for titles without cookies, and the README calls it the Video Player');
    ok(!/widget that goes online/.test(readme + registrySrc), 'the README and registry don’t call it the one built-in widget that goes online (the district apps’ windows do too)');
    const kioskDoc = readme.slice(readme.indexOf('## Kiosk mode'), readme.indexOf('## District apps'));
    ok(/Video Player/.test(kioskDoc) && /\*Open in …\*/.test(kioskDoc) && /Anyone with the link/.test(kioskDoc), 'the README’s Kiosk mode section says the Video Player’s menu has no Open in … there, and that a Drive video plays there only if it’s shared with Anyone with the link');
    const it = readme.slice(readme.lastIndexOf('**For IT**'));
    ok(it.includes('A CSP for its page, `widgets/youtube-player/index.html`, needs `frame-src https://www.youtube.com https://drive.google.com https://player.vimeo.com`') && it.includes('connect-src https://www.youtube.com https://vimeo.com'),
      'the README’s note for IT names the Video Player’s page (its folder keeps the old name) and the CSP it needs: frame-src for the three players, connect-src for the titles');
    ok(it.includes('YouTube\'s player also contacts Google\'s ad servers.') && it.includes('Drive plays what the signed-in account can open. In a kiosk, or with third-party cookies blocked, only files shared with *Anyone with the link* play.'),
      'and the ad servers, and plainly which Drive videos play in a kiosk or with third-party cookies blocked');
    // The data format guide opens with the same value.
    const dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    ok(!/never sees any data/.test(dataDoc), 'the data format guide no longer says 21Board never sees any data');
    const sdkDoc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8').replace(/\s+/g, ' '), prompt = fs.readFileSync(path.join(ROOT, 'docs', 'AI-PROMPT.md'), 'utf8');
    ok(/1\. \*\*No Internet\.\*\*/.test(sdkDoc), 'the SDK guide’s rule 1 is No Internet');
    ok(/\*\*No network at all\*\*/.test(prompt) && /Make NO network requests/.test(prompt), 'the AI prompt keeps its rules: no network at all');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt = await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'youtube-player'); return a && { name: a.name, version: a.version, entry: a.entry, files: a.files, clash: a.clash, permissions: a.permissions, win: a.win, color: a.color, icon: a.icon, external: a.external, description: a.description }; });
    ok(reg && reg.name === 'Video Player' && reg.version === '1.0.0' && reg.entry === 'widgets/youtube-player/index.html' && JSON.stringify(reg.files) === '["widgets/youtube-player/index.html","widgets/youtube-player/video-links.js"]' &&
      reg.clash === 'later' && reg.permissions.length === 0 && !reg.external && reg.win.width === 480 && reg.win.height === 270 && reg.win.minWidth >= 200 && reg.win.minHeight >= 200 && !reg.win.aspectRatio && reg.description,
      `it is in the registry as the Video Player (its id still youtube-player): version 1.0.0, two files (the page and video-links.js), clash 'later', no extra permissions, 480 × 270, at least 200 × 200, no shape lock (${JSON.stringify(reg && reg.win)})`);
    ok(reg && reg.description === 'Play a video from YouTube, Google Drive, or Vimeo.' && /<title>Video Player<\/title>/.test(src), `its description and page title (${reg && reg.description})`);
    const manifest = JSON.parse(/<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(src)[1]);
    ok(manifest.id === 'youtube-player' && manifest.name === reg.name && manifest.version === reg.version && ['width', 'height', 'minWidth', 'minHeight'].every(k => manifest.window[k] === reg.win[k]), 'its manifest block matches the registry entry');
    ok(/^<svg viewBox="0 0 24 24">/.test(reg.icon) && contrast('rgb(255, 255, 255)', `rgb(${[1, 3, 5].map(i => parseInt(reg.color.slice(i, i + 2), 16)).join(', ')})`) >= 4.5 && reg.color.toLowerCase() !== '#ef4444',
      `its tile is a red of its own (${reg.color}, not the Timer’s #ef4444) with the white icon readable on it`);
    // In the Widget Picker; opening it shows the link box and asks YouTube for nothing.
    await page.click('.picker-btn.left'); await page.waitForTimeout(250);
    const tile = page.locator('[data-widget="youtube-player"]');
    ok(await tile.count() === 1 && (await tile.innerText()).trim() === 'Video Player', `the Widget Picker’s tile reads “Video Player” (${await tile.count() && (await tile.innerText()).trim()})`);
    await tile.click(); await page.waitForTimeout(1200);
    ok(await eventually(() => page.evaluate(() => { const w = window.__board21.state.wins.get('youtube-player:1'); return !!w && w.connected; })), 'tapping it opens a window, which connects');
    ok((await page.locator('.win[data-ikey="youtube-player:1"] .win-label').innerText()).trim() === 'Video Player', 'its window’s title is “Video Player”');
    let a = await ytLook(page);
    ok(a.ask && !a.player && !a.offline && a.frames === 0 && yt.hits.length === 0, 'a new window shows the link box, and nothing is asked of YouTube yet');
    ok(await ytMenu(page) === '', `the link box has no window menu items of its own (${await ytMenu(page)})`);
    const box = await ytWin(page).locator('html').evaluate(() => ({ title: document.querySelector('#ask h1').textContent, help: document.getElementById('help').textContent, go: document.getElementById('go').textContent.trim(),
      label: document.getElementById('link').getAttribute('aria-label'), focused: document.activeElement === document.getElementById('link') }));
    ok(box.title === 'Show a video' && box.help === 'Paste a link from YouTube, Google Drive, or Vimeo.' && box.go === 'Show video' && box.label === 'Video link' && !box.focused,
      `the link box: a short title, one line of help, a field and a button, in sentence case, and the field isn't focused by itself (no keyboard popping up): ${JSON.stringify(box)}`);

    // Links: every form it reads, and what it turns away.
    const forms = [
      [`https://www.youtube.com/watch?v=${VID}`, VID, 0], [`https://www.youtube.com/watch?feature=share&v=${VID}`, VID, 0], [`https://youtu.be/${VID}?si=Ab12Cd34`, VID, 0],
      [`https://www.youtube.com/embed/${VID}`, VID, 0], [`https://www.youtube.com/v/${VID}`, VID, 0], [`https://www.youtube.com/shorts/${VID}?feature=share`, VID, 0],
      [`https://www.youtube.com/live/${VID}?feature=shared`, VID, 0], [`https://www.youtube-nocookie.com/embed/${VID}`, VID, 0], [VID, VID, 0], [`  ${VID2}  `, VID2, 0],
      [`https://m.youtube.com/watch?v=${VID}`, VID, 0], [`https://music.youtube.com/watch?v=${VID}&list=RDAMVM${VID}`, VID, 0], [`youtube.com/watch?v=${VID}`, VID, 0],
      [`www.youtube.com/watch?v=${VID}`, VID, 0], [`http://youtube.com/watch?v=${VID}`, VID, 0], [`https://WWW.YouTube.com/watch?v=${VID}`, VID, 0], [`Watch this: https://youtu.be/${VID2} please`, VID2, 0],
      [`https://youtu.be/${VID}?t=90`, VID, 90], [`https://www.youtube.com/watch?v=${VID}&t=1m30s`, VID, 90], [`https://www.youtube.com/embed/${VID}?start=45`, VID, 45],
      [`https://www.youtube.com/watch?v=${VID}#t=2m`, VID, 120], [`https://youtu.be/${VID}?t=1h2m3s`, VID, 3723], [`https://youtu.be/${VID}?t=0`, VID, 0], [`https://youtu.be/${VID}?t=soon`, VID, 0],
      // (as teachers paste them: YouTube's Share › Embed code, and a link with punctuation or quotes around it)
      [EMBED_CODE, VID, 0], [`Watch this: https://youtu.be/${VID}.`, VID, 0], [`(https://youtu.be/${VID})`, VID, 0], [`https://youtu.be/${VID2}, then answer the questions`, VID2, 0],
      [`"https://youtu.be/${VID}?t=90"`, VID, 90], [`'https://www.youtube.com/watch?v=${VID2}'`, VID2, 0], [`<https://www.youtube.com/watch?v=${VID}>`, VID, 0], [`See https://youtu.be/${VID}?t=45!`, VID, 45],
      [`[https://youtu.be/${VID}];`, VID, 0], [`\u200bhttps://youtu.be/${VID}\u200b`, VID, 0],
      // (Share \u203a Embed with Start at, whose start comes after &amp;; a link in the curly quotes Docs, Slides and Word write)
      [EMBED_CODE.replace('?si=AbCdEf123', '?si=AbCdEf123&amp;start=90'), VID, 90], [`\u201chttps://youtu.be/${VID}?t=90\u201d`, VID, 90], [`\u2018https://www.youtube.com/watch?v=${VID2}\u2019`, VID2, 0]
    ];
    const bad = ['', 'hello there', 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', 'https://www.youtube.com/@ccsd21', 'https://www.dailymotion.com/video/x8abc12',
      `https://example.com/watch?v=${VID}`, `https://www.youtube.com.example.org/watch?v=${VID}`, `https://notyoutube.com/watch?v=${VID}`, 'javascript:alert(1)', VID.slice(0, 10),
      `https://www.youtube.com/watch?v=${VID}%22%3E%3Cimg`, `https://www.youtube.com/watch?v=${VID}<script>`, `https://www.youtube.com/results?search_query=${VID}`,
      PLAYLIST_EMBED, 'videoseries', `(https://www.youtube.com/watch?v=${VID}<script>)`];
    const parsed = await ytWin(page).locator('html').evaluate((html, [forms, bad]) => ({
      good: forms.map(([t]) => parseLink(t)), bad: bad.map(t => parseLink(t)) }), [forms, bad]);
    const wrong = forms.filter(([t, id, start], i) => !parsed.good[i] || parsed.good[i].source !== 'youtube' || parsed.good[i].id !== id || parsed.good[i].start !== start).map(([t], i) => t + ' → ' + JSON.stringify(parsed.good[forms.findIndex(f => f[0] === t)]));
    ok(!wrong.length, `every form of link is read, with its start time (${forms.length} forms${wrong.length ? '; wrong: ' + wrong.join('; ') : ''})`);
    const let_ = bad.filter((t, i) => parsed.bad[i] !== null);
    ok(!let_.length, `text that isn't a link to a YouTube video is turned away (${bad.length} kinds${let_.length ? '; let through: ' + let_.join(', ') : ''})`);
    await ytWin(page).locator('#go').click(); await page.waitForTimeout(200);
    a = await ytLook(page);
    ok(a.ask && a.err === VMSG.empty && a.frames === 0, `Show video with nothing typed says what to do (${a.err})`);
    await ytShow(page, 'https://www.dailymotion.com/video/x8abc12');
    a = await ytLook(page);
    ok(a.ask && a.err === VMSG.none && a.frames === 0 && await ytData(page) === null && yt.hits.length === 0, `a link to a video on another site gets a clear message, and nothing is saved or loaded (${a.err})`);
    await ytShow(page, PLAYLIST_EMBED);
    a = await ytLook(page);
    ok(a.ask && a.err === VMSG.list && a.frames === 0 && await ytData(page) === null && yt.hits.length === 0, `a playlist’s embed link (embed/videoseries) says it’s a list, not YouTube’s error in the window (${a.err})`);
    await ytWin(page).locator('#link').press('x');
    ok((await ytLook(page)).err === '', 'typing again takes the message away');

    // A video: YouTube's frame fills the window, with the address, rules and Referer it should have.
    await ytShow(page, `https://www.youtube.com/watch?v=${VID}`);
    a = await ytLook(page);
    ok(a.player && !a.ask && a.frames === 1 && a.src === EMBED(VID), `Show video puts YouTube’s player in the window: ${a.src}`);
    const saved1 = { source: 'youtube', videoId: VID, videoUrl: `https://www.youtube.com/watch?v=${VID}`, history: [{ source: 'youtube', videoId: VID, videoUrl: `https://www.youtube.com/watch?v=${VID}` }] };
    ok(await eventually(async () => JSON.stringify(await ytData(page)) === JSON.stringify(saved1), 3000), `it is saved as { source, videoId, videoUrl, history } (the title YouTube gives goes into the History with the window’s next change) (${JSON.stringify(await ytData(page))})`);
    const fr = await ytWin(page).locator('#player iframe').evaluate(f => ({ host: new URL(f.src).host, allow: f.getAttribute('allow'), fs: f.hasAttribute('allowfullscreen'), ref: f.getAttribute('referrerpolicy'), title: f.title, sandbox: f.hasAttribute('sandbox') }));
    ok(fr.host === 'www.youtube.com' && !/autoplay=/.test(a.src), `the frame comes from www.youtube.com, with no autoplay parameter (${fr.host})`);
    ok(fr.allow.split(/;\s*/).sort().join() === 'autoplay,clipboard-write,encrypted-media,fullscreen,picture-in-picture' && fr.fs && fr.ref === 'strict-origin-when-cross-origin' && !fr.sandbox,
      `allow="${fr.allow}" (no web-share), allowfullscreen, referrerpolicy="${fr.ref}"`);
    ok(await eventually(async () => ytFrames(page).length === 1), 'the stand-in for YouTube loads in it');
    const ref = await ytFrames(page)[0].evaluate(() => window.__ref);
    ok(ref === BASE, `YouTube is told where the board is (Referer ${ref}), as its embeds require`);
    const cover = await ytWin(page).locator('html').evaluate(() => { const f = document.querySelector('#player iframe'), out = [];
      for (const fx of [0.02, 0.25, 0.5, 0.75, 0.98]) for (const fy of [0.02, 0.25, 0.5, 0.75, 0.98]) out.push(document.elementFromPoint(innerWidth * fx, innerHeight * fy) === f);
      const r = f.getBoundingClientRect(); return { all: out.every(Boolean), fills: r.left === 0 && r.top === 0 && Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1, bg: getComputedStyle(document.getElementById('player')).backgroundColor }; });
    ok(cover.all && cover.fills && cover.bg === 'rgb(0, 0, 0)', 'the frame fills the window on black, and nothing of the widget’s is drawn over any part of it');
    ok(await ytMenu(page) === `Change video | Open in YouTube | — | Remove video | — | History | ${YT_LABEL[VID]}`, `with a video, the window menu has the controls, then the History (${await ytMenu(page)})`);
    // Open in YouTube: the watch page in a new tab.
    const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), ytChoose(page, 'Open in YouTube')]);
    ok(!!tab && tab.url() === `https://www.youtube.com/watch?v=${VID}`, `Open in YouTube opens the video’s watch page in a new tab (${tab && tab.url()})`);
    if (tab) { ok(await tab.evaluate(() => window.opener === null), 'the new tab can’t reach the board (noopener)'); await tab.close(); }
    ok((await ytLook(page)).player, 'and the video stays in its window');
    // A start time from the link goes into the saved content and the player's address (and the watch page's).
    await ytChoose(page, 'Change video'); await ytShow(page, `https://youtu.be/${VID2}?t=1m30s`);
    a = await ytLook(page);
    ok(a.src === EMBED(VID2, '&start=90') && (await ytData(page)).start === 90, `a start time in the link (t=1m30s) is kept and passed to the player (${a.src})`);
    const [tab2] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), ytChoose(page, 'Open in YouTube')]);
    ok(!!tab2 && tab2.url() === `https://www.youtube.com/watch?v=${VID2}&t=90s`, `Open in YouTube starts there too (${tab2 && tab2.url()})`);
    if (tab2) await tab2.close();
    // YouTube's embed code, pasted whole: the video shows, and only its link is kept.
    await ytChoose(page, 'Change video'); await ytShow(page, EMBED_CODE);
    a = await ytLook(page);
    ok(a.player && a.src === EMBED(VID) && (await ytData(page)).videoUrl === `https://www.youtube.com/embed/${VID}?si=AbCdEf123`, `YouTube’s Share › Embed code, pasted whole, shows the video and keeps just its link (${a.src}; ${(await ytData(page)).videoUrl})`);

    // Kiosk mode: no Open in YouTube (a kiosk can't open new windows).
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    ok(await eventually(async () => (await ytLook(k)).player), 'kiosk mode shows the video too');
    ok(await ytMenu(k) === `Change video | — | Remove video | — | History | ${YT_LABEL[VID]} | Big Buck Bunny 60fps 4K - Official… (from 1:30)`, `in kiosk mode the menu leaves out Open in YouTube, and keeps the History (${await ytMenu(k)})`);
    await k.close();
    // Settings → About says where the work is stored.
    await openSettings(page, ['about']);
    const about = (await page.locator('#settings .about').innerText()).replace(/\s+/g, ' ');
    ok(about.endsWith(' Your work is stored only on this device.') && !/sends nothing|YouTube/.test(about), `Settings → About says the work is stored only on this device (${about.slice(about.indexOf('·') + 1).trim()})`);
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: nothing plays behind the link box (Remove video here and in another tab, Change video and Cancel, Reset, another page), reload, saved data checked, offline', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt = await stubVideos(ctx);
    const errors = [];
    const A = await ctx.newPage(); A.on('pageerror', e => errors.push('[A] ' + e.message));
    await A.goto(BASE); await boardUp(A);
    await addWin(A, 'youtube-player');
    await ytShow(A, `https://youtu.be/${VID}`);
    ok(await eventually(async () => (await ytLook(A)).player && ytFrames(A).length === 1), 'a video shows');
    await A.reload(); await boardUp(A);
    ok(await eventually(async () => (await ytLook(A)).src === EMBED(VID) && ytFrames(A).length === 1), 'after a reload the same video shows');
    const B = await ctx.newPage(); B.on('pageerror', e => errors.push('[B] ' + e.message));
    await B.goto(BASE); await boardUp(B);
    ok(await eventually(async () => (await ytLook(B)).player && ytFrames(B).length === 1), 'a second tab shows it too');

    // Change video: the frame goes, the box holds the link; Cancel puts the same video back, loaded again.
    let loads = yt.embeds();
    await ytChoose(A, 'Change video');
    let a = await ytLook(A);
    ok(a.ask && !a.player && a.frames === 0 && ytFrames(A).length === 0, 'Change video removes YouTube’s frame: nothing goes on playing behind the link box');
    ok(a.link === `https://youtu.be/${VID}` && a.cancel && a.err === '', `the box holds the video’s link, with Cancel (${a.link})`);
    ok(JSON.stringify(await ytHistory(A)) === JSON.stringify(['✓ ' + YT_LABEL[VID]]) && await ytMenu(A) === `History | ${YT_LABEL[VID]}`, `while the box shows, the menu has just the History, the video it replaces still checked (${await ytMenu(A)})`);
    ok((await ytLook(B)).player && ytFrames(B).length === 1, 'the other tab keeps its video (nothing was changed yet)');
    await ytWin(A).locator('#cancel').click(); await A.waitForTimeout(500);
    a = await ytLook(A);
    ok(a.player && a.src === EMBED(VID) && ytFrames(A).length === 1 && yt.embeds() === loads + 1, 'Cancel puts the same video back (loaded again, so from the start)');
    ok(JSON.stringify(await ytData(A)) === JSON.stringify({ source: 'youtube', videoId: VID, videoUrl: `https://youtu.be/${VID}`, history: [{ source: 'youtube', videoId: VID, videoUrl: `https://youtu.be/${VID}` }] }), 'and nothing was saved');
    // Another video, from the box: both tabs show it.
    await ytChoose(A, 'Change video'); await ytShow(A, `https://www.youtube.com/watch?v=${VID2}`);
    ok(await eventually(async () => (await ytLook(A)).src === EMBED(VID2) && (await ytLook(B)).src === EMBED(VID2) && ytFrames(A).length === 1 && ytFrames(B).length === 1), 'a new video shows in both tabs, one frame in each');
    // Remove video, here: both tabs drop the frame.
    await ytChoose(A, 'Remove video');
    a = await ytLook(A);
    const removed = { videoId: null, videoUrl: '', history: [{ source: 'youtube', videoId: VID2, videoUrl: `https://www.youtube.com/watch?v=${VID2}`, title: YT_TITLES[VID2] }, { source: 'youtube', videoId: VID, videoUrl: `https://youtu.be/${VID}`, title: YT_TITLES[VID] }] };
    ok(a.ask && a.frames === 0 && ytFrames(A).length === 0 && a.link === '' && !a.cancel && JSON.stringify(await ytData(A)) === JSON.stringify(removed),
      `Remove video: the frame is removed, an empty link box shows, and the content says there is no video, as a change of its own (Board Sync: a later Remove video wins), its History kept (${JSON.stringify(await ytData(A))})`);
    ok(await eventually(async () => { const b = await ytLook(B); return b.ask && b.frames === 0 && ytFrames(B).length === 0; }), 'the other tab removes its frame too (no sound left playing there)');
    // Remove video in the other tab.
    await ytShow(A, VID);
    ok(await eventually(async () => (await ytLook(B)).player), 'a video again (typed as its id)');
    await ytChoose(B, 'Remove video');
    ok(await eventually(async () => { const x = await ytLook(A); return x.ask && x.frames === 0 && ytFrames(A).length === 0 && x.link === ''; }), 'Remove video in the other tab removes the frame here');
    // Typing in the box here while the other tab picks a video: what's typed stays, Cancel then shows that video.
    await ytWin(A).locator('#link').fill('https://youtu.be/');
    await ytShow(B, `https://youtu.be/${VID2}`);
    await A.waitForTimeout(600);
    a = await ytLook(A);
    ok(a.ask && a.link === 'https://youtu.be/' && a.cancel && a.frames === 0, 'a video chosen in another tab while a link is being typed here leaves the box and its text alone, and offers Cancel');
    await ytWin(A).locator('#cancel').click(); await A.waitForTimeout(500);
    ok((await ytLook(A)).src === EMBED(VID2), 'Cancel then shows the other tab’s video');
    // Reset (window menu).
    await A.click('.win[data-ikey="youtube-player:1"] .win-label'); await A.click('#menu [data-act="reset"]'); await A.click('#menu [data-act="reset-yes"]');
    ok(await eventually(async () => { const x = await ytLook(A), y = await ytLook(B); return x.ask && y.ask && x.frames + y.frames === 0 && ytFrames(A).length + ytFrames(B).length === 0; }), 'Reset: the link box in both tabs, and no YouTube frame left anywhere');
    ok(await ytData(A) === null, 'and the video is no longer saved');
    // Another page: its windows stop (every tab goes there).
    await ytShow(A, VID);
    ok(await eventually(async () => ytFrames(A).length === 1 && ytFrames(B).length === 1), 'a video in both tabs again');
    await A.evaluate(() => window.__board21.pages.create({ end: true, name: 'Two' }));
    ok(await eventually(async () => ytFrames(A).length === 0 && ytFrames(B).length === 0), 'going to another page removes the frame (in every tab): nothing plays out of sight');
    await A.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[0]));
    ok(await eventually(async () => (await ytLook(A)).src === EMBED(VID) && ytFrames(A).length === 1), 'coming back shows the video again');
    // Closing the window removes it too.
    await A.evaluate(() => window.__board21.closeWin('youtube-player:1', { quiet: true }));
    ok(await eventually(async () => ytFrames(A).length === 0 && ytFrames(B).length === 0), 'closing the window removes the frame');
    await A.evaluate(() => window.__board21.openWidget('youtube-player'));
    ok(await eventually(async () => (await ytLook(A)).player), 'opening it again shows the saved video');
    await B.close();

    // Offline: a calm message instead of the browser's error page; the video comes back online.
    await ctx.setOffline(true); await A.waitForTimeout(500);
    a = await ytLook(A);
    ok(a.offline && !a.player && !a.ask && a.frames === 0 && ytFrames(A).length === 0, 'offline, the frame goes and a message shows in its place');
    ok(a.text === 'You’re offline. The video comes back when you’re online.', `the message: “${a.text}”`);
    ok((await ytData(A)).videoId === VID, 'the saved video is kept');
    ok(await ytMenu(A) === `Change video | Open in YouTube | — | Remove video | — | History | ${YT_LABEL[VID]}`, `the menu still has the controls and the History (${await ytMenu(A)})`);
    loads = yt.embeds();
    await ytChoose(A, 'Change video'); await ytShow(A, `https://youtu.be/${VID2}`);
    a = await ytLook(A);
    ok(a.offline && a.frames === 0 && (await ytData(A)).videoId === VID2 && yt.embeds() === loads, 'a video chosen while offline is saved, and shows the message instead of loading');
    await ctx.setOffline(false); await A.waitForTimeout(600);
    ok(await eventually(async () => { const x = await ytLook(A); return x.player && x.src === EMBED(VID2) && ytFrames(A).length === 1; }), 'back online, the video comes back by itself');

    // Saved content is checked before it is used: anything else shows the link box, loads nothing, makes no markup.
    const send = d => A.evaluate(d => window.__board21.state.wins.get('youtube-player:1').post('data', { data: d, reason: 'remote' }), d);
    const evil = '"><img src=x onerror="top.document.title=\'PWNED\'">';
    const crafted = [{ videoId: 'short' }, { videoId: VID + evil, videoUrl: evil }, { videoId: 12345678901, videoUrl: '' }, { videoId: VID, videoUrl: 42 }, { videoId: VID, videoUrl: 'x'.repeat(5000) },
      { videoId: VID }, { videoId: '../../evi/l' }, 'dQw4w9WgXcQ', [VID], { videoId: ['dQw4w9WgXcQ'], videoUrl: '' }, { videoId: 'javascript:a', videoUrl: '' }, 7, true];
    const wrongly = [];
    for (const d of crafted) {
      await send({ videoId: VID, videoUrl: `https://youtu.be/${VID}` }); await A.waitForTimeout(250);
      loads = yt.embeds();
      await send(d); await A.waitForTimeout(250);
      const x = await ytLook(A);
      if (!(x.ask && x.frames === 0 && x.link === '' && yt.embeds() === loads)) wrongly.push(JSON.stringify(d).slice(0, 60));
    }
    ok(!wrongly.length, `damaged content from another tab or device shows the link box (${crafted.length} kinds${wrongly.length ? '; not: ' + wrongly.join(', ') : ''})`);
    await send({ videoId: VID2, videoUrl: evil, start: 'soon' }); await A.waitForTimeout(300);
    ok((await ytLook(A)).src === EMBED(VID2), 'a start time that isn’t a number of seconds is left out (the video starts at the beginning)');
    await send({ videoId: VID2, videoUrl: '', start: 1e9 }); await A.waitForTimeout(300);
    ok((await ytLook(A)).src === EMBED(VID2), 'and so is one longer than a day');
    await ytChoose(A, 'Change video');
    ok((await ytLook(A)).link === `https://www.youtube.com/watch?v=${VID2}`, 'Change video without a saved link fills in the video’s watch address');
    await ytWin(A).locator('#cancel').click(); await A.waitForTimeout(300);
    await send({ videoId: VID, videoUrl: evil, start: 75 }); await A.waitForTimeout(300);
    await ytChoose(A, 'Change video');
    ok((await ytLook(A)).link === evil && await ytWin(A).locator('html').evaluate(() => document.querySelectorAll('img, [onerror]').length === 0), 'a saved link is only ever text in the field');
    await ytWin(A).locator('#cancel').click(); await A.waitForTimeout(300);
    ok((await ytLook(A)).src === EMBED(VID, '&start=75'), 'a saved start time is used');
    // The same from a file: it opens with the link box.
    const file = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Crafted' }, instances: [
      { widgetId: 'youtube-player', instance: 1, open: true, z: 1, rect: { x: 40, y: 40, w: 480, h: 310 }, config: null, data: { videoId: VID + '"><script>top.document.title="PWNED"</script>', videoUrl: evil } },
      { widgetId: 'youtube-player', instance: 2, open: true, z: 2, rect: { x: 600, y: 40, w: 480, h: 310 }, config: null, data: { videoId: VID2, videoUrl: `https://youtu.be/${VID2}`, start: -5 } }] };
    await A.evaluate(f => window.__board21.applyImport(f, 'replace'), file); await A.waitForTimeout(1500);
    const c1 = await ytLook(A, 'youtube-player:1'), c2 = await ytLook(A, 'youtube-player:2');
    ok(c1.ask && c1.frames === 0 && c2.src === EMBED(VID2) && await A.title() !== 'PWNED', `from an imported file too: damaged content shows the link box, a bad start time is dropped (${c2.src})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: light and dark, at least 200 × 200 on screen (1366 × 768 and 1920 × 1080, every size and both board shapes), export and import', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    await addWin(page, 'youtube-player');
    // The link box in the board's light and dark themes, with its error and Cancel showing: every text readable.
    await ytShow(page, `https://youtu.be/${VID}`);
    await ytChoose(page, 'Change video'); await ytShow(page, 'not a link');
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(500);
      const c = await ytWin(page).locator('html').evaluate(() => {
        const cs = e => getComputedStyle(e), bg = cs(document.body).backgroundColor, $ = id => document.getElementById(id);
        const pairs = { title: [document.querySelector('#ask h1'), bg], help: [$('help'), bg], field: [$('link'), cs($('link')).backgroundColor], error: [$('err'), bg],
          show: [$('go'), cs($('go')).backgroundColor], cancel: [$('cancel'), cs($('cancel')).backgroundColor] };
        const out = {};
        for (const [k, [el, back]] of Object.entries(pairs)) out[k] = [cs(el).color, back, cs(el).fontSize, cs(el).fontFamily];
        const v = n => getComputedStyle(document.documentElement).getPropertyValue('--b21-' + n).trim();
        return { out, bg, palette: { bg: v('bg'), accent: v('accent') }, goBg: cs($('go')).backgroundColor, theme: document.documentElement.getAttribute('data-b21-theme'),
          big: ['link', 'go', 'cancel'].every(id => $(id).getBoundingClientRect().height >= 44), font: (() => { const t = document.createElement('span'); t.style.fontFamily = 'var(--b21-font)'; document.body.append(t);
            const want = cs(t).fontFamily; t.remove(); return [document.body, $('link'), $('go'), $('cancel')].every(e => cs(e).fontFamily === want); })() };
      });
      const low = Object.entries(c.out).map(([k, [fg, back]]) => [k, contrast(fg, back)]).filter(([, r]) => r < 4.5);
      ok(c.theme === scheme && !low.length, `${scheme}: every text in the link box is readable, 4.5:1 or more (${Object.entries(c.out).map(([k, [fg, back]]) => k + ' ' + contrast(fg, back).toFixed(1)).join(', ')})`);
      const hex = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
      ok(c.bg === hex(c.palette.bg) && c.goBg === hex(c.palette.accent) && c.font, `${scheme}: it takes the board’s colors (background ${c.bg}, Show video in the accent ${c.goBg}) and its font`);
      ok(c.big && Object.values(c.out).every(([, , size]) => parseFloat(size) >= 14), `${scheme}: field and buttons at least 44 px tall, no text under 14 px`);
      await page.screenshot({ path: OUT + `yt-linkbox-${scheme}.png`, clip: await page.locator('.win[data-ikey="youtube-player:1"]').boundingBox() });
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await ytWin(page).locator('#cancel').click(); await page.waitForTimeout(400);

    // At least 200 × 200 as drawn, and in YouTube's own frame, at the smallest size the window can be, on both screens,
    // at every size of windows and menus, on both board shapes (and no bigger than that needs).
    const fails = [], seen = [];
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300);
      for (const shape of ['16:9', 'free']) {
        await page.evaluate(s => window.__board21.setBoardShape(s), shape);
        for (const sc of [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]) {
          await page.evaluate(sc => { window.__board21.setBoardScale(sc); window.__board21.setRect('youtube-player:1', { x: 20, y: 20, w: 50, h: 60 }); }, sc);
          let m = null;
          const measure = async () => {
            const outer = await page.evaluate(() => { const r = document.querySelector('.win[data-ikey="youtube-player:1"] iframe').getBoundingClientRect(); return { w: r.width, h: r.height, zoom: window.__board21.zoom.s }; });
            const inner = await ytWin(page).locator('html').evaluate(() => { const f = document.querySelector('#player iframe'); if (!f) return null; const r = f.getBoundingClientRect(); return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
            if (!inner) return null;
            return { drawnW: outer.w * inner.w / inner.iw, drawnH: outer.h * inner.h / inner.ih, cssW: inner.w, cssH: inner.h, zoom: outer.zoom };
          };
          const good = x => x && x.drawnW >= 199.5 && x.drawnH >= 199.5 && x.cssW >= 200 && x.cssH >= 200;
          // (once it has settled: the window may still be moving to its new size)
          await eventually(async () => { const m0 = await measure(); await page.waitForTimeout(300); m = await measure();
            return good(m) && !!m0 && ['drawnW', 'drawnH', 'cssW', 'cssH'].every(k => Math.abs(m[k] - m0[k]) < 0.5); }, 4000);
          const label = `${w}×${h} ${shape} ${Math.round(sc * 100)}%`;
          // (no bigger than needed either: the board tells the widget its zoom rounded to 0.01, so it may be a few px over)
          if (!good(m) || Math.min(m.drawnW, m.cssW) > 206 || Math.min(m.drawnH, m.cssH) > 206) fails.push(`${label}: ${m ? [m.drawnW, m.drawnH, m.cssW, m.cssH].map(v => Math.round(v)).join('/') : 'no player'}`);
          else seen.push(`${label} ${Math.round(m.drawnW)}×${Math.round(m.drawnH)}`);
        }
      }
    }
    ok(!fails.length, `the player is never smaller than 200 × 200, on screen or in its own frame, at the window’s smallest size (48 setups${fails.length ? '; too small or bigger than needed: ' + fails.join('; ') : ''})`);
    console.log('    smallest players drawn:', seen.filter(s => / (50|80|200)%/.test(s)).join(', '));
    // The minimum only draws the window bigger: the size it was given is kept, to come back when the minimum goes down.
    const kept = await page.evaluate(() => window.__board21.state.insts.get('youtube-player:1').rect);
    ok(kept.w === 50 && kept.h === 60, `the window’s saved size stays as it was set (${kept.w} × ${kept.h})`);
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.evaluate(() => { window.__board21.setBoardShape('16:9'); window.__board21.setBoardScale(0.8); });

    // The link box at its smallest where the board draws it no smaller than its CSS size (Size 200% on a 1920 × 1080
    // panel: the window's own 200 × 200 minimum), with Cancel and either message: all of it fits without scrolling and
    // the title stays on one line, in every text style.
    await page.evaluate(() => { window.__board21.setBoardScale(2); window.__board21.setRect('youtube-player:1', { x: 20, y: 20, w: 50, h: 60 }); }); await page.waitForTimeout(600);
    await ytChoose(page, 'Change video');
    const tight = [], fitted = [], said = new Set();
    // (text that gets each of the link box's messages)
    const G = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', texts = ['not a link', '', 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'https://vimeo.com/showcase/11223344',
      `https://docs.google.com/document/d/${G}/edit`, `https://docs.google.com/spreadsheets/d/${G}/edit`, `https://docs.google.com/presentation/d/${G}/edit`];
    for (const letters of ['standard', 'legible', 'early']) {
      await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${letters}"]`); await page.keyboard.press('Escape');
      await page.waitForFunction(l => window.__board21.state.settings.letters === l, letters); await page.waitForTimeout(800);
      for (const text of texts) {
        await ytWin(page).locator('#link').fill(text); await ytWin(page).locator('#go').click(); await page.waitForTimeout(300);
        const r = await ytWin(page).locator('html').evaluate(async () => {
          await document.fonts.ready;
          const $ = id => document.getElementById(id), h1 = document.querySelector('#ask h1');
          const off = ['link', 'err', 'cancel', 'go'].filter(id => { const b = $(id).getBoundingClientRect(); return b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5; });
          return { w: innerWidth, h: innerHeight, scrolls: $('ask').scrollHeight > $('ask').clientHeight + 1, lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)), off, err: $('err').textContent, cancel: !$('cancel').hidden };
        });
        const label = `${letters}, “${r.err}”, ${r.w} × ${r.h}`;
        said.add(r.err);
        if (r.scrolls || r.lines !== 1 || r.off.length || !r.cancel || !r.err || r.w > 202 || r.h > 202) tight.push(`${label}: ${r.scrolls ? 'scrolls, ' : ''}title on ${r.lines} line(s)${r.off.length ? ', cut off: ' + r.off.join(' ') : ''}`);
        else fitted.push(label);
      }
    }
    ok(!tight.length && fitted.length === texts.length * 3 && Object.values(VMSG).every(m => said.has(m)),
      `the smallest link box fits, title on one line, in every text style and with each of its ${Object.keys(VMSG).length} messages (${tight.length ? 'not: ' + tight.join('; ') : fitted.length + ' fitted, 200 × 200'})`);
    await openSettings(page, ['letters']); await page.click('#settings [data-act="letters"][data-val="standard"]'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__board21.state.settings.letters === 'standard');
    await ytWin(page).locator('#cancel').click(); await page.waitForTimeout(400);

    // A window that fills the board: the board's own ▦ buttons and clock sit over its bottom corners, so YouTube's
    // player ends above them, on black, and nothing of the board's covers any part of it (its controls are at its foot).
    // (The clock On: Auto, the default, shows it only in full screen.)
    await setCornerClock(page, 'on');
    const ytOnScreen = async () => {
      const top = await page.evaluate(() => { const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0; };
        const r = document.querySelector('.win[data-ikey="youtube-player:1"] iframe').getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, marks: Array.from(document.querySelectorAll('.picker-btn, .corner-clock')).filter(vis).map(e => { const b = e.getBoundingClientRect(); return { name: e.className, x: b.left, y: b.top, w: b.width, h: b.height }; }) }; });
      const f = await ytWin(page).locator('html').evaluate(() => { const e = document.querySelector('#player iframe'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
      if (!f) return null;
      const sx = top.w / f.iw, sy = top.h / f.ih, yt = { x: top.x + f.x * sx, y: top.y + f.y * sy, w: f.w * sx, h: f.h * sy };
      const hit = top.marks.filter(c => Math.min(c.x + c.w, yt.x + yt.w) - Math.max(c.x, yt.x) > 0.5 && Math.min(c.y + c.h, yt.y + yt.h) - Math.max(c.y, yt.y) > 0.5).map(c => c.name);
      return { yt, hit, marks: top.marks.map(c => c.name), fills: Math.abs(f.h - f.ih) < 1 && Math.abs(f.w - f.iw) < 1 };
    };
    const covered = [], clear = [];
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => { window.__board21.setBoardScale(0.8); window.__board21.setMaximized('youtube-player:1', true); });
      let m = null;
      await eventually(async () => { await page.waitForTimeout(300); m = await ytOnScreen(); return !!m && m.marks.length >= 3 && !m.hit.length; }, 4000);
      const label = `${w} × ${h}`;
      if (!m || m.hit.length || m.marks.length < 3) covered.push(`${label}: ${m ? (m.hit.length ? 'covered by ' + m.hit.join(', ') : 'only ' + m.marks.join(', ')) : 'no player'}`);
      else clear.push(`${label}: player ${Math.round(m.yt.w)} × ${Math.round(m.yt.h)} clear of ${m.marks.join(', ')}`);
      await page.evaluate(() => window.__board21.setMaximized('youtube-player:1', false));
      ok(await eventually(async () => { const x = await ytOnScreen(); return !!x && x.fills; }), `${label}: back to its own size, the player fills the window again`);
    }
    ok(!covered.length, `in a window that fills the board, the board’s ▦ buttons and clock never cover YouTube’s player (${covered.length ? covered.join('; ') : clear.join('; ')})`);
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.evaluate(() => window.__board21.setBoardScale(0.8));

    // Export and import carry the video and its History; a template leaves them out (they are content). (Another video
    // and back to this one from the History first: the titles found go into the content with those changes.)
    await page.evaluate(() => window.__board21.setRect('youtube-player:1', { x: 40, y: 40, w: 640, h: 400 })); await page.waitForTimeout(300);
    await ytChoose(page, 'Change video'); await ytShow(page, `https://youtu.be/${VID2}`); await page.waitForTimeout(300);
    ok(await ytPick(page, YT_LABEL[VID]), 'back to the first video, from the History');
    const full = await page.evaluate(() => window.__board21.buildExport('full')), tpl = await page.evaluate(() => window.__board21.buildExport('template'));
    const fi = full.instances.find(i => i.widgetId === 'youtube-player'), ti = tpl.instances.find(i => i.widgetId === 'youtube-player');
    ok(fi && fi.data && fi.data.videoId === VID && JSON.stringify(fi.data.history) === JSON.stringify([{ source: 'youtube', videoId: VID, videoUrl: `https://youtu.be/${VID}`, title: YT_TITLES[VID] }, { source: 'youtube', videoId: VID2, videoUrl: `https://youtu.be/${VID2}`, title: YT_TITLES[VID2] }]) && ti && ti.data === null,
      `a full export has the video and its History, with the titles; a blank template has the window without them (${JSON.stringify(fi && fi.data)})`);
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt2 = await stubVideos(ctx2);
    const p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push('[2] ' + e.message));
    await p2.goto(BASE); await boardUp(p2);
    await p2.evaluate(f => window.__board21.applyImport(f, 'replace'), full);
    ok(await eventually(async () => (await ytLook(p2)).src === EMBED(VID) && ytFrames(p2).length === 1), 'importing it on another device shows the same video');
    ok(await eventually(async () => JSON.stringify(await ytHistory(p2)) === JSON.stringify(['✓ ' + YT_LABEL[VID], YT_LABEL[VID2]]), 2000) && yt2.oembeds() === 0, `and its History, by the titles in the file: YouTube isn’t asked for them (${JSON.stringify(await ytHistory(p2))}; ${yt2.oembeds()} requests)`);
    await p2.evaluate(f => window.__board21.applyImport(f, 'add'), tpl); await p2.waitForTimeout(1200);
    ok((await ytLook(p2, 'youtube-player:2')).ask, 'the template’s window opens with the link box');
    await ctx2.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: Board Sync, a YouTube video picked on one device and removed on the other before they synced (the later one wins)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await stubVideos(A.c); await stubVideos(B.c);
    const VID3 = 'M7lc1UVf-VE';
    const ik = await addWin(A.p, 'youtube-player');
    await ytShow(A.p, `https://youtu.be/${VID}`, ik);
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const ikB = await ikOf(B.p, await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ik));
    ok(!!ikB && await eventually(async () => (await ytLook(B.p, ikB)).src === EMBED(VID)), 'the smartboard shows the laptop’s video');
    const k = d => d === A ? ik : ikB;
    // (Change video and a link, or Remove video, as the teacher does it)
    const pick = async (d, id) => { if (!(await ytLook(d.p, k(d))).ask) await ytChoose(d.p, 'Change video', k(d)); await ytShow(d.p, `https://youtu.be/${id}`, k(d)); };
    const remove = d => ytChoose(d.p, 'Remove video', k(d));
    const look = async d => { const l = await ytLook(d.p, k(d)), data = await ytData(d.p, k(d));
      return { view: l.ask ? 'ask' : l.player ? 'player ' + l.src.replace(/^.*embed\/([^?]*).*$/, '$1') : l.offline ? 'offline' : '?', frames: l.frames, video: data && data.videoId, wins: (await winList(d.p)).filter(x => x.widgetId === 'youtube-player').length }; };
    for (const [first, firstDo, then, thenDo, label, want] of [
      [B, d => pick(d, VID3), A, remove, 'a video picked on the smartboard, then removed on the laptop', null],
      [A, d => pick(d, VID3), B, remove, 'a video picked on the laptop, then removed on the smartboard', null],
      [A, remove, B, d => pick(d, VID3), 'removed on the laptop, then another video picked on the smartboard', VID3]]) {
      await pick(A, VID); await syncNow(A.p); await exchange(A, B); await A.p.waitForTimeout(500);   // (the same video on both to start with)
      // The first change goes to the folder; the other device doesn't get it before its own, 1.5 s later.
      await firstDo(first); await syncNow(first.p); await first.p.waitForTimeout(1500);
      await thenDo(then); await then.p.waitForTimeout(300); await syncNow(then.p);
      await exchange(A, B); await A.p.waitForTimeout(800);
      const a = await look(A), b = await look(B);
      const good = x => x.wins === 1 && x.video === want && (want ? x.view === 'player ' + want && x.frames === 1 : x.view === 'ask' && x.frames === 0);
      ok(good(a) && good(b), `${label} (later): ${want ? 'that video' : 'no video, and no YouTube frame,'} on both, with no copy (laptop ${JSON.stringify(a)}; smartboard ${JSON.stringify(b)})`);
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Video Player: History in the window menu (the last five YouTube videos by their titles, the same video again, tapping one, Remove video, Reset, kiosk, reload, two tabs, an older release saving, content from before, saved history checked)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt = await stubVideos(ctx);
    // A YouTube cookie in this browser (as a signed-in student's would be): the request for a title must not carry it.
    await ctx.addCookies([{ name: 'PREF', value: 'f6=8', domain: '.youtube.com', path: '/', secure: true, sameSite: 'None' }]);
    const errors = [];
    const A = await ctx.newPage(); A.on('pageerror', e => errors.push('[A] ' + e.message));
    await A.goto(BASE); await boardUp(A);
    await addWin(A, 'youtube-player');
    ok(await ytHistory(A) === null && await ytMenu(A) === '', 'a new window has no History in its menu, not even the heading');
    const hist = async (p = A) => (await ytHistory(p)) || [];
    const same = async (want, p = A, ms = 3000) => eventually(async () => JSON.stringify(await hist(p)) === JSON.stringify(want), ms);
    const L = ids => ids.map((id, i) => (i ? '' : '✓ ') + YT_LABEL[id]);

    // One video: the History, by the title YouTube's oEmbed gives, checked.
    await ytShow(A, `https://www.youtube.com/watch?v=${VID}`);
    ok(await same(L([VID])), `after one video the menu has a History of it, by its title, checked (${(await hist()).join(' | ')})`);
    ok(await ytMenu(A) === `Change video | Open in YouTube | — | Remove video | — | History | ${YT_LABEL[VID]}`, `the controls first, then the History under its heading (${await ytMenu(A)})`);
    const q = yt.asked[0] || {};
    ok(yt.oembeds() === 1 && q.url === OEMBED(VID), `its title was asked for once, from YouTube’s oEmbed (${q.url})`);
    ok(q.cookie === '' && q.referer === '' && q.origin === new URL(BASE).origin, `with no cookie and no Referer: only the Origin, which YouTube needs to answer (cookie “${q.cookie}”, Referer “${q.referer}”, Origin ${q.origin})`);
    // (and that means something: a request from the same page that does send cookies carries this one)
    await ytWin(A).locator('html').evaluate(() => fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=c00k1eCheck') + '&format=json', { credentials: 'include' }).catch(() => {}));
    const probe = yt.asked.find(x => x.id === 'c00k1eCheck');
    ok(!!probe && /PREF=f6=8/.test(probe.cookie), `(a request with cookies from the same page does carry YouTube’s cookie: “${probe && probe.cookie}”)`);
    yt.asked = yt.asked.filter(x => x !== probe);
    ok(JSON.stringify((await ytData(A)).history) === JSON.stringify([{ source: 'youtube', videoId: VID, videoUrl: `https://www.youtube.com/watch?v=${VID}` }]),
      'the History is saved in the window’s content; its title, found after, is not saved by itself (Board Sync would count that as a newer change: see “History with Board Sync”)');

    // Five more: the last five are kept, newest first, the one showing checked.
    const week = ['w4tErCyc1e0', 'mU1t1pl1c8n', 'pLaNtsGr0w5', 'S0larSyst3m', 'r3adAl0udPd'];
    for (const id of week) { await ytChoose(A, 'Change video'); await ytShow(A, `https://youtu.be/${id}`); }
    let five = week.slice().reverse();
    ok(await same(L(five)), `after six videos the History keeps the last five, newest first, the one showing checked (${(await hist()).join(' | ')})`);
    ok(yt.oembeds() === 6 && week.every(id => yt.oembeds(id) === 1), `each title was asked for once (${yt.oembeds()} requests)`);
    let d = await ytData(A);
    ok(d.videoId === 'r3adAl0udPd' && (d.history || []).length === 5 && (d.history || []).every((e, i) => e.videoId === five[i] && e.videoUrl === `https://youtu.be/${five[i]}` && e.title === (i ? YT_TITLES[five[i]] : undefined) && !('start' in e)),
      'the content’s history: those five, each with its link as pasted and its title, saved with the next change (the newest one’s not yet)');
    // The same video again, from another form of its link: to the top, listed once, its title not asked for again.
    await ytChoose(A, 'Change video'); await ytShow(A, 'https://www.youtube.com/watch?v=mU1t1pl1c8n&feature=share');
    five = ['mU1t1pl1c8n', 'r3adAl0udPd', 'S0larSyst3m', 'pLaNtsGr0w5', 'w4tErCyc1e0'];
    ok(JSON.stringify(await hist()) === JSON.stringify(L(five)) && yt.oembeds() === 6, `a video shown again moves to the top, listed once, its title not asked for again (${(await hist()).join(' | ')})`);
    ok(((await ytData(A)).history || [])[0]?.videoUrl === 'https://www.youtube.com/watch?v=mU1t1pl1c8n&feature=share' && ((await ytData(A)).history || [])[1]?.title === YT_TITLES.r3adAl0udPd,
      'with the link it was shown from this time (and the title found for the one before is saved now)');
    // The same video from a start time: listed apart, its start in its label.
    await ytChoose(A, 'Change video'); await ytShow(A, 'https://youtu.be/mU1t1pl1c8n?t=90');
    const from90 = 'Multiplication Song: The 3 Times… (from 1:30)';
    ok(JSON.stringify(await hist()) === JSON.stringify(['✓ ' + from90, ...five.slice(0, 4).map(id => YT_LABEL[id])]) && yt.oembeds() === 6,
      `the same video from a start time is listed apart, “(from 1:30)” after its title, shortened to fit (${(await hist()).join(' | ')})`);

    // Tapping one shows it, from its start: at the top, saved, checked.
    let loads = yt.embeds();
    ok(await ytPick(A, YT_LABEL['S0larSyst3m']), 'a History item can be tapped');
    let a = await ytLook(A);
    ok(a.player && a.src === EMBED('S0larSyst3m') && ytFrames(A).length === 1 && yt.embeds() === loads + 1 && (await ytData(A)).videoId === 'S0larSyst3m' && (await hist())[0] === '✓ ' + YT_LABEL['S0larSyst3m'],
      `tapping one shows that video in place of the other, moves it to the top, checked, and saves it (${a.src})`);
    ok(await ytPick(A, from90), 'the one with a start time too');
    a = await ytLook(A);
    ok(a.src === EMBED('mU1t1pl1c8n', '&start=90') && (await ytData(A)).start === 90, `it starts from its start time (${a.src})`);
    // Tapping the one showing does nothing: it isn't loaded again.
    await ytWin(A).locator('#player iframe').evaluate(f => { f.__mark = 1; });
    loads = yt.embeds(); const before = JSON.stringify(await ytData(A));
    ok(await ytPick(A, from90) && await ytWin(A).locator('#player iframe').evaluate(f => f.__mark === 1) && yt.embeds() === loads && JSON.stringify(await ytData(A)) === before,
      'tapping the video already showing does nothing (it doesn’t start again)');
    // Remove video keeps the History, nothing checked; from the link box, a tap shows that video.
    await ytChoose(A, 'Remove video');
    a = await ytLook(A); d = await ytData(A);
    five = ['mU1t1pl1c8n', 'S0larSyst3m', 'mU1t1pl1c8n', 'r3adAl0udPd', 'pLaNtsGr0w5'];
    const labels5 = [from90, ...five.slice(1).map(id => YT_LABEL[id])];
    ok(a.ask && a.frames === 0 && d.videoId === null && (d.history || []).length === 5 && JSON.stringify(await hist()) === JSON.stringify(labels5), `Remove video keeps the History, with nothing checked (${(await hist()).join(' | ')})`);
    ok(await ytMenu(A) === 'History | ' + labels5.join(' | '), 'with the link box, the menu has just the History');
    ok(await ytPick(A, YT_LABEL['pLaNtsGr0w5']), 'an item can be tapped from the link box');
    a = await ytLook(A);
    ok(a.player && !a.ask && a.src === EMBED('pLaNtsGr0w5') && (await ytData(A)).videoId === 'pLaNtsGr0w5' && (await hist())[0] === '✓ ' + YT_LABEL['pLaNtsGr0w5'], 'tapped from the link box, it shows that video: the link box goes');
    // During Change video: the box goes (what was typed with it), that video shows.
    await ytChoose(A, 'Change video'); await ytWin(A).locator('#link').fill('https://youtu.be/');
    ok((await hist())[0] === '✓ ' + YT_LABEL['pLaNtsGr0w5'], 'during Change video, the video it would replace is still checked');
    ok(await ytPick(A, YT_LABEL['r3adAl0udPd']), 'an item can be tapped during Change video');
    a = await ytLook(A);
    ok(a.player && !a.ask && a.src === EMBED('r3adAl0udPd') && (await ytData(A)).videoId === 'r3adAl0udPd', 'tapped during Change video, that video shows and the link box goes');
    await ytChoose(A, 'Change video'); loads = yt.embeds();
    ok(await ytPick(A, YT_LABEL['r3adAl0udPd']) && (await ytLook(A)).src === EMBED('r3adAl0udPd') && !(await ytLook(A)).ask && yt.embeds() === loads + 1, 'tapping the checked one during Change video puts it back, as Cancel does');
    ok(yt.oembeds() === 6, `none of this asked YouTube for a title again (${yt.oembeds()} requests)`);
    const now5 = await hist();

    // Kiosk mode: the History, but no Open in YouTube.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    ok(await eventually(async () => await ytMenu(k) === 'Change video | — | Remove video | — | History | ' + now5.map(l => l.replace('✓ ', '')).join(' | ')), `in kiosk mode the menu keeps the History, without Open in YouTube (${await ytMenu(k)})`);
    await k.close();
    // Reload: the History and its titles are kept, and YouTube isn't asked again.
    await A.reload(); await boardUp(A);
    ok(await same(now5, A, 8000) && yt.oembeds() === 6, `after a reload the History is the same, titles and all, and YouTube isn’t asked for them again (${yt.oembeds()} requests)`);

    // Two tabs: a video added in one shows in the other, which asks for its title too (titles aren't saved by
    // themselves); a title arriving doesn't start the player there again.
    const B = await ctx.newPage(); B.on('pageerror', e => errors.push('[B] ' + e.message));
    await B.goto(BASE); await boardUp(B);
    ok(await same(now5, B, 8000), 'a second tab shows the same History');
    yt.titles['M7lc1UVf-VE'] = { delay: 1500, json: { title: YT_TITLES['M7lc1UVf-VE'] } };   // (an answer that takes a moment)
    await ytChoose(A, 'Change video'); await ytShow(A, 'https://youtu.be/M7lc1UVf-VE');
    ok(await eventually(async () => (await hist(B))[0] === '✓ YouTube video M7lc1UVf-VE' && (await ytLook(B)).src === EMBED('M7lc1UVf-VE'), 1200),
      `until its title is known, the video’s label says what it is: “YouTube video” and its id (${(await hist(B))[0]})`);
    await ytWin(B).locator('#player iframe').evaluate(f => { f.__mark = 1; }).catch(() => {});
    ok(await eventually(async () => (await hist(B))[0] === '✓ ' + YT_LABEL['M7lc1UVf-VE'], 5000) && (await hist(A))[0] === '✓ ' + YT_LABEL['M7lc1UVf-VE'], `its title shows in both tabs (${(await hist(B))[0]})`);
    ok(yt.oembeds('M7lc1UVf-VE') === 2 && await ytWin(B).locator('#player iframe').evaluate(f => f.__mark === 1).catch(() => false), `asked for once in each tab (${yt.oembeds('M7lc1UVf-VE')}), and the title arriving didn’t start the video there again`);
    // A tab still on the release before the History (2026.11.17-3) saves just { videoId, videoUrl } when its teacher
    // picks a video: the History here keeps its videos, that one moved to the top, with its title.
    await ytWin(B).locator('html').evaluate(() => Board21.save({ videoId: 'pLaNtsGr0w5', videoUrl: 'https://youtu.be/pLaNtsGr0w5' }));
    const kept = ['✓ ' + YT_LABEL.pLaNtsGr0w5, YT_LABEL['M7lc1UVf-VE'], YT_LABEL.r3adAl0udPd, from90, YT_LABEL.S0larSyst3m];
    ok(await same(kept) && (await ytLook(A)).src === EMBED('pLaNtsGr0w5'), `content saved by an older release (no history) keeps the History, its video moved to the top (${(await hist()).join(' | ')})`);
    await ytChoose(A, 'Change video'); await ytShow(A, `https://youtu.be/${VID}`);
    ok(JSON.stringify(((await ytData(A)).history || []).map(e => e.videoId)) === JSON.stringify([VID, 'pLaNtsGr0w5', 'M7lc1UVf-VE', 'r3adAl0udPd', 'mU1t1pl1c8n']), 'and the next change here saves that History');
    // Reset clears the History, in both tabs; a video after it starts a History of its own.
    await A.click('.win[data-ikey="youtube-player:1"] .win-label'); await A.click('#menu [data-act="reset"]'); await A.click('#menu [data-act="reset-yes"]');
    ok(await eventually(async () => await ytHistory(A) === null && await ytHistory(B) === null && await ytMenu(A) === '' && await ytMenu(B) === '' && await ytData(A) === null), 'Reset clears the History too, in both tabs');
    await ytShow(A, `https://youtu.be/${VID2}`);
    ok(await same(L([VID2])) && await same(L([VID2]), B), 'a video after a Reset starts a new History');
    await B.close();

    // Content saved before the History (no history): a History of just its video, its title asked for once.
    await saveData(A, 'youtube-player:1', { videoId: 'fR4ct10nsK1', videoUrl: 'https://youtu.be/fR4ct10nsK1?t=45', start: 45 });
    await A.reload(); await boardUp(A);
    ok(await same(['✓ Fractions for Kids | Halves, Thirds… (from 0:45)'], A, 8000) && yt.oembeds('fR4ct10nsK1') === 1 && (await ytLook(A)).src === EMBED('fR4ct10nsK1', '&start=45'),
      `content from before the History: the video shows, with a History of just it, by its title (${(await hist()).join(' | ')})`);
    await ytChoose(A, 'Change video'); await ytShow(A, `https://youtu.be/${VID}`);
    d = await ytData(A);
    ok(await same(L([VID]).concat(['Fractions for Kids | Halves, Thirds… (from 0:45)'])) && JSON.stringify((await ytData(A)).history) === JSON.stringify([{ source: 'youtube', videoId: VID, videoUrl: `https://youtu.be/${VID}` },
      { source: 'youtube', videoId: 'fR4ct10nsK1', videoUrl: 'https://youtu.be/fR4ct10nsK1?t=45', start: 45, title: YT_TITLES['fR4ct10nsK1'] }]), 'the next video goes above it, and the History is saved, with the title found when the window opened');

    // Saved history is checked before it is used: bad entries are dropped (not the rest), more than five cut to five,
    // a title is only ever text.
    const send = dd => A.evaluate(dd => window.__board21.state.wins.get('youtube-player:1').post('data', { data: dd, reason: 'remote' }), dd);
    Object.assign(yt.titles, { [VID2]: { status: 404 }, mU1t1pl1c8n: { status: 404 } });   // (titles arriving with content are asked for: these get none)
    const evil = '<img src=x onerror="top.document.title=\'PWNED\'">';   // (markup, and both kinds of quotes)
    await send({ videoId: VID2, videoUrl: `https://youtu.be/${VID2}`, history: [{ videoId: 'short', videoUrl: '' }, { videoId: 'videoseries', videoUrl: PLAYLIST_EMBED }, { videoId: VID, videoUrl: 42 }, { videoId: VID, videoUrl: 'x'.repeat(5000) }, VID, null, [VID], 7,
      { videoId: VID, videoUrl: `https://youtu.be/${VID}`, start: 'soon', title: evil }, { videoId: VID, videoUrl: 'another link', title: 'The same video again' },
      { videoId: 'mU1t1pl1c8n', videoUrl: '', start: 1e9, title: 42 }, { videoId: 'pLaNtsGr0w5', videoUrl: '', start: 30, title: '  How\tDo\nPlants\u0007 Grow?‮  ' },
      { videoId: 'S0larSyst3m', videoUrl: '', title: 'x'.repeat(500) }, { videoId: 'r3adAl0udPd', videoUrl: '' }, { videoId: 'w4tErCyc1e0', videoUrl: '' }] });
    await A.waitForTimeout(400);
    const got = await hist();
    ok(JSON.stringify(got) === JSON.stringify(['✓ YouTube video aqz-KE-bpKQ', evil, 'YouTube video mU1t1pl1c8n', 'How Do Plants Grow? (from 0:30)', 'x'.repeat(47) + '…']),
      `damaged history entries are dropped (“videoseries”, a playlist’s address, too), the rest kept (five, the video showing first), titles cleaned, a damaged start or title left out (${got.join(' | ')})`);
    await A.click('.win[data-ikey="youtube-player:1"] .win-label'); await A.waitForTimeout(300);
    const shown = await A.evaluate(() => ({ marks: document.querySelectorAll('#menu img, #menu [onerror]').length, texts: Array.from(document.querySelectorAll('#menu [data-act="widget"] .label')).map(e => e.textContent) }));
    ok(shown.marks === 0 && shown.texts.includes(evil) && await A.title() !== 'PWNED', 'a title with markup and quotes shows as text in the menu');
    await A.click('.win[data-ikey="youtube-player:1"] .win-label');
    await send({ videoId: VID, videoUrl: '', history: 'not a list' }); await A.waitForTimeout(300);
    ok(JSON.stringify(await hist()) === JSON.stringify(['✓ ' + YT_LABEL[VID]]), 'a history that isn’t a list is read as none: just the video showing');
    await send({ videoId: null, videoUrl: '', history: [{ videoId: VID2, videoUrl: 'x' }] }); await A.waitForTimeout(300);
    ok(JSON.stringify(await hist()) === JSON.stringify(['YouTube video aqz-KE-bpKQ']) && (await ytLook(A)).ask, 'no video and a History: the link box, the History in the menu, nothing checked');
    // A link typed in the link box and not shown yet stays when only the History changes (no video before or after),
    // even with the keyboard gone from the box.
    await ytWin(A).locator('#link').fill('https://youtu.be/r3adAl0udPd'); await ytWin(A).locator('h1').click();
    await send({ videoId: null, videoUrl: '', history: [{ videoId: VID2, videoUrl: 'x', title: YT_TITLES[VID2] }, { videoId: VID, videoUrl: 'y' }] }); await A.waitForTimeout(300);
    ok((await ytLook(A)).link === 'https://youtu.be/r3adAl0udPd' && JSON.stringify(await hist()) === JSON.stringify([YT_LABEL[VID2], YT_LABEL[VID]]),
      `a change to the History alone, with no video, keeps a link being typed (“${(await ytLook(A)).link}”)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: History titles YouTube doesn’t give (a private video, blocked, no answer, offline, then online), a hostile, invisible, long or wide title, a series, at most five requests at once, the menu at Size 200%', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt = await stubVideos(ctx);
    const errors = [];
    const A = await ctx.newPage(); A.on('pageerror', e => errors.push('[A] ' + e.message));
    const failed = []; A.on('requestfailed', r => { if (/\/oembed\?/.test(r.url())) failed.push({ url: r.url(), at: Date.now() }); });
    await A.goto(BASE); await boardUp(A);
    await addWin(A, 'youtube-player');
    const hist = async () => (await ytHistory(A)) || [];
    const show = async id => { if (!(await ytLook(A)).ask) await ytChoose(A, 'Change video'); await ytShow(A, `https://youtu.be/${id}`); };
    const titleOf = async id => { const e = (((await ytData(A)) || {}).history || []).find(x => x.videoId === id); return e ? e.title : null; };

    // YouTube gives no title: a private or removed video (404), a request that can't get through (a school's filter),
    // an answer that isn't oEmbed's, a title that isn't text. The label is "YouTube video" and its id; no title is saved.
    Object.assign(yt.titles, { pr1vat3V1d0: { status: 404 }, bl0ckedV1d0: { abort: true }, htmlAnsw3r0: { body: '<!doctype html><title>Blocked by your school</title>' }, n0T1tl3V1d0: { json: { title: 42 } } });
    for (const id of ['pr1vat3V1d0', 'bl0ckedV1d0', 'htmlAnsw3r0', 'n0T1tl3V1d0']) await show(id);
    await A.waitForTimeout(500);
    ok(JSON.stringify(await hist()) === JSON.stringify(['✓ YouTube video n0T1tl3V1d0', 'YouTube video htmlAnsw3r0', 'YouTube video bl0ckedV1d0', 'YouTube video pr1vat3V1d0']),
      `without a title, a video’s label is “YouTube video” and its id (${(await hist()).join(' | ')})`);
    ok(['pr1vat3V1d0', 'bl0ckedV1d0', 'htmlAnsw3r0', 'n0T1tl3V1d0'].every(id => yt.oembeds(id) === 1) && ((await ytData(A)).history || [null]).every(e => e && !('title' in e)) && (await ytLook(A)).src === EMBED('n0T1tl3V1d0'),
      'each was asked for once, no title is saved, and the video shows all the same');
    // No answer: the video shows at once; after a few seconds the widget stops waiting, keeping the label.
    yt.titles.h4ngingV1d0 = { hang: true };
    const t0 = Date.now(); await show('h4ngingV1d0');
    ok((await ytLook(A)).src === EMBED('h4ngingV1d0') && (await hist())[0] === '✓ YouTube video h4ngingV1d0', 'with no answer from YouTube, the video shows at once, labelled with its id');
    ok(await eventually(async () => failed.some(f => /h4ngingV1d0/.test(decodeURIComponent(f.url))), 12000), 'the request is given up after a while');
    const waited = (failed.find(f => /h4ngingV1d0/.test(decodeURIComponent(f.url))) || {}).at - t0;
    ok(waited >= 2500 && waited <= 9000, `after a few seconds (${(waited / 1000).toFixed(1)} s)`);
    // Asked once per page load: going offline and back doesn't ask again for these.
    await ctx.setOffline(true); await A.waitForTimeout(300); await ctx.setOffline(false); await A.waitForTimeout(800);
    ok(['pr1vat3V1d0', 'bl0ckedV1d0', 'htmlAnsw3r0', 'n0T1tl3V1d0', 'h4ngingV1d0'].every(id => yt.oembeds(id) === 1), `back online, a video whose title was already asked for isn’t asked again (${yt.oembeds()} requests)`);
    // A reload asks again for each one without a title, never more than five at once; a video added meanwhile waits
    // its turn.
    for (const id of ['pr1vat3V1d0', 'bl0ckedV1d0', 'htmlAnsw3r0', 'n0T1tl3V1d0', 'h4ngingV1d0']) yt.titles[id] = { hang: true };
    let n = yt.oembeds();
    await A.reload(); await boardUp(A);
    ok(await eventually(async () => yt.oembeds() === n + 5, 6000), `after a reload, the five without a title are asked for again (${yt.oembeds() - n})`);
    yt.titles.n3wV1de0xyz = 'How Volcanoes Work';
    await show('n3wV1de0xyz');
    await A.waitForTimeout(500);
    ok(yt.oembeds('n3wV1de0xyz') === 0 && (await hist())[0] === '✓ YouTube video n3wV1de0xyz', `with five requests waiting, a sixth isn’t sent yet (${yt.oembeds('n3wV1de0xyz')})`);
    ok(await eventually(async () => (await hist())[0] === '✓ How Volcanoes Work', 12000) && yt.oembeds('n3wV1de0xyz') === 1, 'once one is given up, it is sent, and its title shows');
    ok(await titleOf('n3wV1de0xyz') === undefined, 'not saved by itself, as for every title (it goes with the window’s next change)');

    // Offline: a video can be added (it is saved); its title isn't asked for. Back online, it is, and shows.
    await ctx.setOffline(true); await A.waitForTimeout(400);
    n = yt.oembeds();
    await show('S0larSyst3m');
    ok((await ytLook(A)).offline && yt.oembeds() === n && (await hist())[0] === '✓ YouTube video S0larSyst3m' && (await ytData(A)).videoId === 'S0larSyst3m', 'offline, a video added is saved, with its id as its label: nothing is asked of YouTube');
    await ctx.setOffline(false);
    ok(await eventually(async () => (await hist())[0] === '✓ ' + YT_LABEL['S0larSyst3m'], 6000) && yt.oembeds('S0larSyst3m') === 1, `back online, its title is asked for and shows (${(await hist())[0]})`);
    ok(await titleOf('S0larSyst3m') === undefined, 'a title found later like this is not saved by itself (Board Sync would count it as a newer change: see the next suite)');
    await show('r3adAl0udPd');
    ok(await eventually(async () => await titleOf('S0larSyst3m') === YT_TITLES['S0larSyst3m'], 3000) && await titleOf('r3adAl0udPd') === undefined, 'it is saved with the window’s next change (and that video’s own title with the one after)');

    // A hostile title: only ever text, cleaned (control characters out, white space collapsed).
    yt.titles.h0st1leT1tl = '\u0007<img src=x onerror="top.document.title=\'PWNED\'">\n';
    await show('h0st1leT1tl');
    const clean = '<img src=x onerror="top.document.title=\'PWNED\'">';
    ok(await eventually(async () => (await hist())[0] === '✓ ' + clean, 3000), `a title with markup, quotes and control characters is cleaned, and shown as text (${(await hist())[0]})`);
    await A.click('.win[data-ikey="youtube-player:1"] .win-label'); await A.waitForTimeout(300);
    const shown = await A.evaluate(() => ({ marks: document.querySelectorAll('#menu img, #menu [onerror]').length, first: (document.querySelector('#menu [role="menuitemcheckbox"] .label') || {}).textContent }));
    ok(shown.marks === 0 && shown.first === clean && await A.title() !== 'PWNED', `in the menu it is text (“${shown.first}”)`);
    await A.click('.win[data-ikey="youtube-player:1"] .win-label');
    // A title with nothing to see in it (zero-width characters, direction marks, a soft hyphen, a combining mark, a
    // Hangul filler, a blank Braille cell) is none: the label is the video's id, and nothing is saved.
    yt.titles.inv1s1bleT1 = '\u200b\u200e\u200f\u2060\ufeff\u00ad\u0301 \u3164\u2800';
    await show('inv1s1bleT1'); await A.waitForTimeout(500);
    ok((await hist())[0] === '✓ YouTube video inv1s1bleT1' && yt.oembeds('inv1s1bleT1') === 1, `a title with nothing to see is none: the label is the video’s id (${JSON.stringify((await hist())[0])})`);
    ok(await titleOf('h0st1leT1tl') === clean, 'the cleaned title before it was saved with this change');
    // A long title: saved up to 200 characters, its label shortened at a word, with …
    const long = 'A Very Long Title ' + 'about the water cycle and the weather '.repeat(10);
    yt.titles.l0ngT1tleV1 = long;
    await show('l0ngT1tleV1');
    ok(await eventually(async () => (await hist())[0] === '✓ A Very Long Title about the water cycle and the…', 3000), `a long title’s label is shortened at a word, with … (${(await hist())[0]})`);
    ok(await titleOf('inv1s1bleT1') === undefined, 'and the title with nothing to see wasn’t saved');
    // Videos of one series, whose titles differ only at the end: their labels keep the end too, so they can be told
    // apart (a screen reader says each one's name).
    Object.assign(yt.titles, { ph0n1csL1A0: 'Phonics for Kids | Learn to Read with Short Vowel Sounds | Lesson 1: Short A', ph0n1csL2E0: 'Phonics for Kids | Learn to Read with Short Vowel Sounds | Lesson 2: Short E' });
    await show('ph0n1csL1A0'); await show('ph0n1csL2E0');
    ok(await eventually(async () => JSON.stringify((await hist()).slice(0, 3)) === JSON.stringify(['✓ Phonics for Kids | Learn to… Lesson 2: Short E', 'Phonics for Kids | Learn to… Lesson 1: Short A', 'A Very Long Title about the water cycle and the…']), 3000),
      `two titles that differ only at the end keep their ends in their labels (${(await hist()).slice(0, 2).join(' | ')})`);
    const t = await titleOf('l0ngT1tleV1');
    ok(t && t.length > 190 && t.length <= 200 && long.startsWith(t), `the title saved is cut to 200 characters at most (${t && t.length})`);
    // Emoji: a label is cut between whole characters, short enough that the board doesn't cut it again (at 80 UTF-16
    // code units), so it ends with … and never with half an emoji.
    Object.assign(yt.titles, { thumbsUp000: 'a' + '👍'.repeat(60), fam1lyEm0j1: '👨‍👩‍👧‍👦'.repeat(30) + ' Family Fun' });
    for (const id of ['thumbsUp000', 'fam1lyEm0j1']) {
      await show(id);
      const l = await eventually(async () => !/^✓ YouTube video/.test((await hist())[0]), 3000) && (await hist())[0].slice(2);
      ok(l && l.endsWith('…') && l.length <= 80 && !/[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/.test(l) && (id !== 'fam1lyEm0j1' || /^(👨‍👩‍👧‍👦)+…$/u.test(l)),
        `an emoji title’s label: whole characters, then … (${l && l.length} UTF-16 units: ${l})`);
    }

    // The menu with a full History never scrolls: at Size 50% and 200%, on 1366 × 768 and 1920 × 1080, with a video,
    // in the link box, and in kiosk mode, with Board history's "Earlier versions…" in it too; it doesn't go into two
    // columns, no label takes more than two lines (Chinese, an emoji title, one in capitals), and items whose labels
    // wrap are set apart (a gap, or where the menu is tightest a line between them). (Size goes straight from 50% to
    // 200% here: the menu is measured where it has the room, not squeezed at the place it had at 50%.)
    await A.evaluate(() => window.__board21.history.cfg({ quiet: 300, every: 900 }));
    Object.assign(yt.titles, { c4Jk4nJ1V1d: '九九乘法表儿歌 小学数学 乘法口诀歌 轻松学会乘法 儿童学习歌曲 一年级二年级三年级', em0j1T1tle0: '🎵🎶 Baby Shark Dance 🦈🦈🦈 Sing and Dance! 🎶🎵 Animal Songs 🐳🐙🐠🐡🦀🦞🦑 PINKFONG Songs for Children 🎵',
      CAPSt1tLe00: 'WORLD MAP SONG | CONTINENTS AND OCEANS FOR KIDS | GEOGRAPHY' });
    for (const id of ['c4Jk4nJ1V1d', 'em0j1T1tle0', 'CAPSt1tLe00?t=1h2m3s', VID2 + '?t=90']) await show(id);
    await A.waitForTimeout(1500);
    const menuFits = async (p, label) => {
      await p.click('.win[data-ikey="youtube-player:1"] .win-label'); await p.waitForTimeout(350);
      const m = await p.evaluate(() => {
        const el = document.getElementById('menu'), r = el.getBoundingClientRect(), labels = Array.from(el.querySelectorAll('[data-act="widget"] .label'));
        const one = (() => { const x = labels[0].cloneNode(); x.textContent = 'X'; labels[0].parentNode.appendChild(x); const h = x.getBoundingClientRect().height; x.remove(); return h; })();
        // The History's items: from one's text to the next's (in the menu's own px), and a line drawn between them.
        const items = Array.from(el.querySelectorAll('[role="menuitemcheckbox"]')), ui = window.__board21.zoom.ui;
        const text = it => { const g = document.createRange(); g.selectNodeContents(it.querySelector('.label')); const q = Array.from(g.getClientRects()); return { top: Math.min(...q.map(x => x.top)), bottom: Math.max(...q.map(x => x.bottom)) }; };
        const gaps = items.slice(1).map((it, i) => ({ gap: (text(it).top - text(items[i]).bottom) / ui, line: getComputedStyle(it, '::before').content !== 'none' }));
        return { scrolls: el.scrollHeight > el.clientHeight + 1, inside: r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5, lines: Math.max(...labels.map(l => Math.round(l.getBoundingClientRect().height / one))),
          items: labels.length, mode: Array.from(el.classList).filter(c => /^(compact|tight|cols)$/.test(c)).join(' ') || 'normal', w: Math.round(r.width), h: Math.round(r.height),
          apart: gaps.every(g => g.gap >= 6 || g.line), gaps: gaps.map(g => Math.round(g.gap) + (g.line ? '+line' : '')).join('/'), earlier: !!el.querySelector('[data-act="history"]') };
      });
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      if (await p.locator('#menu.open').count()) { await p.click('.win[data-ikey="youtube-player:1"] .win-label'); await p.waitForTimeout(200); }
      return Object.assign(m, { label });
    };
    const seen = [];
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await A.setViewportSize({ width: w, height: h });
      for (const sc of [0.5, 2]) {
        await A.evaluate(sc => window.__board21.setBoardScale(sc), sc); await A.waitForTimeout(500);
        seen.push(await menuFits(A, `${w} × ${h} ${sc * 100}%, a video`));
        await ytChoose(A, 'Change video');
        seen.push(await menuFits(A, `${w} × ${h} ${sc * 100}%, the link box`));
        await ytWin(A).locator('#cancel').click(); await A.waitForTimeout(300);
      }
    }
    await A.setViewportSize({ width: 1366, height: 768 });
    const K = await ctx.newPage(); K.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await K.goto(BASE + '?kiosk=yes'); await boardUp(K);
    await K.evaluate(() => window.__board21.setBoardScale(2)); await K.waitForTimeout(500);
    seen.push(await menuFits(K, '1366 × 768 200%, kiosk'));
    await K.close();
    const bad = seen.filter(m => m.scrolls || !m.inside || /cols/.test(m.mode) || m.lines > 2 || m.items < 5 || !m.apart);
    ok(!bad.length, `the menu with a full History fits on screen without scrolling or columns, no label over two lines, items set apart (${seen.map(m => `${m.label}: ${m.w} × ${m.h} ${m.mode}, ${m.lines} line(s), gaps ${m.gaps}${m.scrolls ? ' SCROLLS' : ''}${m.inside ? '' : ' OFF SCREEN'}${m.earlier ? ', Earlier versions…' : ''}`).join('; ')})`);
    ok(seen.filter(m => !/kiosk/.test(m.label)).every(m => m.earlier), 'with “Earlier versions…” in the menu as well');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: History with Board Sync (YouTube titles arrive with it, the later change wins with its History, a title that comes after doesn’t count as a change)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    const ya = await stubVideos(A.c), yb = await stubVideos(B.c);
    const ik = await addWin(A.p, 'youtube-player');
    await ytShow(A.p, `https://youtu.be/${VID}`, ik);
    await eventually(async () => ((await ytHistory(A.p, ik)) || [])[0] === '✓ ' + YT_LABEL[VID], 3000);
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const ikB = await ikOf(B.p, await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ik));
    const k = d => d === A ? ik : ikB, hist = async d => (await ytHistory(d.p, k(d))) || [];
    const look = async d => ({ video: ((await ytData(d.p, k(d))) || {}).videoId, src: (await ytLook(d.p, k(d))).src, history: await hist(d), wins: (await winList(d.p)).filter(x => x.widgetId === 'youtube-player').length });
    ok(!!ikB && await eventually(async () => JSON.stringify(await hist(B)) === JSON.stringify(['✓ ' + YT_LABEL[VID]])) && yb.oembeds() === 1,
      `the smartboard gets the laptop’s History; the newest video’s title isn’t saved yet (it goes with the next change), so the smartboard asks for it, once (${(await hist(B)).join(' | ')}; ${yb.oembeds()} requests)`);
    const pick = async (d, link) => { if (!(await ytLook(d.p, k(d))).ask) await ytChoose(d.p, 'Change video', k(d)); await ytShow(d.p, link, k(d)); };

    // A title found on one device arrives on the other with the content, saved with the next change.
    await pick(A, `https://youtu.be/${VID2}`);
    await eventually(async () => (await hist(A))[0] === '✓ ' + YT_LABEL[VID2], 3000);
    await syncNow(A.p); await exchange(A, B); await A.p.waitForTimeout(500);
    ok(await eventually(async () => JSON.stringify(await hist(B)) === JSON.stringify(['✓ ' + YT_LABEL[VID2], YT_LABEL[VID]])) && (((await ytData(B.p, ikB)).history || [])[1] || {}).title === YT_TITLES[VID] &&
      yb.oembeds(VID) === 1 && yb.oembeds(VID2) === 1 && ya.oembeds() === 2,
      `a video added on the laptop arrives on the smartboard, the title of the one before in the content (${(await hist(B)).join(' | ')}; asked ${ya.oembeds()} times on the laptop, ${yb.oembeds()} on the smartboard, once for each video)`);

    // Both change the video before they sync: the later one wins, with its History.
    await pick(A, 'https://youtu.be/w4tErCyc1e0'); await syncNow(A.p); await A.p.waitForTimeout(1500);
    await pick(B, 'https://youtu.be/M7lc1UVf-VE'); await B.p.waitForTimeout(300); await syncNow(B.p);
    await exchange(A, B); await A.p.waitForTimeout(800);
    let want = ['✓ ' + YT_LABEL['M7lc1UVf-VE'], YT_LABEL[VID2], YT_LABEL[VID]];
    let a = await look(A), b = await look(B);
    const good = (x, id, w) => x.video === id && x.src === EMBED(id) && JSON.stringify(x.history) === JSON.stringify(w) && x.wins === 1;
    ok(good(a, 'M7lc1UVf-VE', want) && good(b, 'M7lc1UVf-VE', want), `the later change wins on both, its History with it (laptop ${JSON.stringify(a)}; smartboard ${JSON.stringify(b)})`);

    // A video added on the laptop while it is offline (no title yet); then the smartboard picks another, and before the
    // laptop gets that, the laptop comes back online and finds the title. Shown, it isn't a change of its own: the
    // smartboard's newer video still wins.
    await A.c.setOffline(true); await A.p.waitForTimeout(400);
    await pick(A, 'https://youtu.be/fR4ct10nsK1'); await syncNow(A.p); await exchange(A, B); await A.p.waitForTimeout(500);
    ok(await eventually(async () => (await hist(B))[0] === '✓ ' + YT_LABEL.fR4ct10nsK1 && (await hist(A))[0] === '✓ YouTube video fR4ct10nsK1') && ya.oembeds('fR4ct10nsK1') === 0 && yb.oembeds('fR4ct10nsK1') === 1,
      `both show the video: offline, the laptop labels it with its id; the smartboard asks for its title itself (laptop ${(await hist(A))[0]}; smartboard ${(await hist(B))[0]})`);
    await A.p.waitForTimeout(1500);
    await pick(B, 'https://youtu.be/r3adAl0udPd'); await B.p.waitForTimeout(300); await syncNow(B.p);
    await A.c.setOffline(false);
    ok(await eventually(async () => (await hist(A))[0] === '✓ ' + YT_LABEL.fR4ct10nsK1, 6000), `back online, the laptop finds the title and shows it (${(await hist(A))[0]})`);
    await A.p.waitForTimeout(1500); await syncNow(A.p);
    await exchange(A, B); await A.p.waitForTimeout(800);
    a = await look(A); b = await look(B);
    want = ['✓ ' + YT_LABEL.r3adAl0udPd, YT_LABEL.fR4ct10nsK1, YT_LABEL['M7lc1UVf-VE'], YT_LABEL[VID2], YT_LABEL[VID]];
    ok(good(b, 'r3adAl0udPd', want) && a.video === 'r3adAl0udPd' && a.src === EMBED('r3adAl0udPd') && a.history[0] === want[0] && a.wins === 1,
      `the smartboard’s newer video stays on both: the title found later didn’t count as a newer change (laptop ${JSON.stringify(a)}; smartboard ${JSON.stringify(b)})`);
    ok(a.history[1] === YT_LABEL.fR4ct10nsK1, 'the laptop still shows the title it found');
    // Remove video, later, still wins over a video picked at the same time, its History kept.
    await pick(A, `https://youtu.be/${VID}`); await syncNow(A.p); await A.p.waitForTimeout(1500);
    await ytChoose(B.p, 'Remove video', ikB); await B.p.waitForTimeout(300); await syncNow(B.p);
    await exchange(A, B); await A.p.waitForTimeout(800);
    a = await look(A); b = await look(B);
    ok(a.video === null && b.video === null && !a.src && !b.src && a.history.length === 5 && JSON.stringify(a.history) === JSON.stringify(b.history) && !b.history.some(l => l.startsWith('✓')),
      `a later Remove video wins on both, the History kept, nothing checked (laptop ${JSON.stringify(a)}; smartboard ${JSON.stringify(b)})`);

    // Picked on both within a moment, the laptop's title slow to come (a slow network): when it comes, the title isn't
    // a change of its own, so the smartboard's pick, made after the laptop's, wins on both.
    for (const [how, aId, bId, bLink] of [['a link pasted', 'mU1t1pl1c8n', 'S0larSyst3m', true], ['a History item tapped', 'pLaNtsGr0w5', 'r3adAl0udPd', false]]) {
      ya.titles[aId] = { json: { title: YT_TITLES[aId] }, delay: 4000 };   // (under TITLE_WAIT)
      await pick(A, `https://youtu.be/${aId}`);
      const t0 = Date.now();   // (each pick here waits about half a second after its tap: t0 to tB is about their distance)
      await A.p.waitForTimeout(300);
      if (bLink) await pick(B, `https://youtu.be/${bId}`); else ok(await ytPick(B.p, YT_LABEL[bId], ikB), `the smartboard taps “${YT_LABEL[bId]}” in its History`);
      const tB = Date.now() - t0;
      ok(tB < 3500 && await eventually(async () => (await hist(A))[0] === '✓ ' + YT_LABEL[aId], 6000), `${how}: the laptop’s title comes after the smartboard’s pick (that about ${(tB / 1000).toFixed(1)} s after the laptop’s; the title after 4 s)`);
      await A.p.waitForTimeout(500); await syncNow(A.p); await syncNow(B.p);
      await exchange(A, B); await A.p.waitForTimeout(1000);
      a = await look(A); b = await look(B);
      ok(a.video === bId && b.video === bId && a.src === EMBED(bId) && b.src === EMBED(bId) && a.wins === 1 && b.wins === 1 && a.history[0] === '✓ ' + YT_LABEL[bId],
        `${how} on the smartboard just after the laptop’s pick: the later pick wins on both (laptop ${JSON.stringify(a)}; smartboard ${JSON.stringify(b)})`);
      await exchange(A, B); await A.p.waitForTimeout(500);
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Video Player: Google Drive and Vimeo links (every form, what is turned away and why, start times, the frame each site gets, Open in Google Drive and Open in Vimeo, kiosk)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt = await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    await addWin(page, 'youtube-player');
    // Every form of a Drive or Vimeo link, as teachers paste them: [text, source, id, start, Vimeo's hash or Drive's
    // resource key].
    const forms = [
      [`https://drive.google.com/file/d/${D1}/view?usp=sharing`, 'drive', D1, 0], [`https://drive.google.com/file/d/${D1}/view?usp=drive_link`, 'drive', D1, 0],
      [`https://drive.google.com/file/d/${D1}/view`, 'drive', D1, 0], [`https://drive.google.com/file/d/${D1}/preview`, 'drive', D1, 0], [`https://drive.google.com/file/d/${D1}/edit`, 'drive', D1, 0],
      [`https://drive.google.com/file/d/${D1}`, 'drive', D1, 0], [`https://drive.google.com/file/u/0/d/${D1}/view`, 'drive', D1, 0], [`https://drive.google.com/file/u/1/d/${D1}/view?usp=sharing`, 'drive', D1, 0],
      [`https://drive.google.com/open?id=${D1}`, 'drive', D1, 0], [`https://drive.google.com/open?id=${D2}&resourcekey=${RK}`, 'drive', D2, 0, RK],
      [`https://drive.google.com/uc?id=${D1}&export=download`, 'drive', D1, 0], [`https://drive.google.com/uc?export=view&id=${D1}`, 'drive', D1, 0],
      [`https://docs.google.com/file/d/${D1}/edit`, 'drive', D1, 0], [`https://docs.google.com/file/d/${D2}/preview?resourcekey=${RK}`, 'drive', D2, 0, RK],
      [`https://drive.google.com/file/d/${D2}/view?usp=sharing&resourcekey=${RK}`, 'drive', D2, 0, RK], [`https://drive.google.com/a/ccsd21.org/file/d/${D1}/view`, 'drive', D1, 0],
      [DRIVE_CODE, 'drive', D1, 0], [`drive.google.com/file/d/${D1}/view`, 'drive', D1, 0], [`https://DRIVE.Google.com/file/d/${D1}/view`, 'drive', D1, 0],
      [`Watch this: https://drive.google.com/file/d/${D1}/view?usp=sharing.`, 'drive', D1, 0], [`(https://drive.google.com/file/d/${D1}/view)`, 'drive', D1, 0],
      // (a start time in a Drive link: Drive's player has none, so it is left out, and nothing is said)
      [`"https://drive.google.com/file/d/${D1}/view?t=90"`, 'drive', D1, 0], [`https://drive.google.com/file/d/${D1}/view#t=1m30s`, 'drive', D1, 0],
      [`https://vimeo.com/${V1}`, 'vimeo', V1, 0], [`vimeo.com/${V1}`, 'vimeo', V1, 0], [`https://www.vimeo.com/${V1}`, 'vimeo', V1, 0], [`http://vimeo.com/${V1}?share=copy`, 'vimeo', V1, 0],
      [`https://vimeo.com/${V2}/${VH}`, 'vimeo', V2, 0, VH], [`https://vimeo.com/${V2}/${VH}?share=copy`, 'vimeo', V2, 0, VH],
      [`https://vimeo.com/channels/staffpicks/${V1}`, 'vimeo', V1, 0], [`https://vimeo.com/groups/animation/videos/${V1}`, 'vimeo', V1, 0],
      [`https://vimeo.com/showcase/11223344/video/${V1}`, 'vimeo', V1, 0], [`https://vimeo.com/album/2233445/video/${V1}`, 'vimeo', V1, 0],
      [`https://player.vimeo.com/video/${V1}`, 'vimeo', V1, 0], [`https://player.vimeo.com/video/${V2}?h=${VH}`, 'vimeo', V2, 0, VH],
      [`https://player.vimeo.com/video/${V2}?h=${VH}&badge=0&autopause=0`, 'vimeo', V2, 0, VH], [VIMEO_CODE, 'vimeo', V2, 0, VH],
      [`https://vimeo.com/${V1}#t=90`, 'vimeo', V1, 90], [`https://vimeo.com/${V1}#t=1m30s`, 'vimeo', V1, 90], [`https://vimeo.com/${V2}/${VH}#t=2m`, 'vimeo', V2, 120, VH],
      [`https://player.vimeo.com/video/${V1}#t=45s`, 'vimeo', V1, 45], [`https://vimeo.com/${V1}#t=soon`, 'vimeo', V1, 0],
      [`Watch: https://vimeo.com/${V1}!`, 'vimeo', V1, 0], [`<https://vimeo.com/${V1}>`, 'vimeo', V1, 0], [`'https://vimeo.com/${V2}/${VH}',`, 'vimeo', V2, 0, VH],
      // (a folder's link, then a video's: the video)
      [`The folder https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345 and the video https://vimeo.com/${V1}`, 'vimeo', V1, 0],
      // (embed codes whose key comes after another parameter, written &amp;)
      [`<iframe src="https://drive.google.com/file/d/${D2}/preview?usp=sharing&amp;resourcekey=${RK}" width="640" height="480" allow="autoplay"></iframe>`, 'drive', D2, 0, RK],
      [`<iframe src="https://player.vimeo.com/video/${V2}?badge=0&amp;h=${VH}&amp;autopause=0" frameborder="0" allow="autoplay; fullscreen"></iframe>`, 'vimeo', V2, 0, VH],
      // (curly quotes, as Docs, Slides and Word write them, guillemets, and a full-width comma after a link)
      [`“https://vimeo.com/${V1}”`, 'vimeo', V1, 0], [`‘https://drive.google.com/file/d/${D1}/view?usp=sharing’`, 'drive', D1, 0], [`«https://vimeo.com/${V2}/${VH}#t=90»`, 'vimeo', V2, 90, VH],
      [`https://vimeo.com/${V1}，`, 'vimeo', V1, 0],
      // (Vimeo's address for one's own video, as its uploader sees it)
      [`https://vimeo.com/manage/videos/${V1}`, 'vimeo', V1, 0], [`https://vimeo.com/manage/videos/${V2}/${VH}`, 'vimeo', V2, 0, VH]
    ];
    const parsed = await ytWin(page).locator('html').evaluate((html, forms) => forms.map(([t]) => parseLink(t)), forms);
    const wrong = forms.filter(([t, source, id, start, extra], i) => { const p = parsed[i];
      return !p || p.source !== source || p.id !== id || p.start !== start || (p.hash || '') !== (source === 'vimeo' && extra || '') || (p.resourceKey || '') !== (source === 'drive' && extra || ''); })
      .map(f => f[0].slice(0, 80) + ' → ' + JSON.stringify(parsed[forms.indexOf(f)]));
    ok(!wrong.length, `every form of a Drive or Vimeo link is read, with its hash or resource key, and a start time for Vimeo only (${forms.length} forms${wrong.length ? '; wrong: ' + wrong.join('; ') : ''})`);
    // Each one shown: the player's address, and the stand-in for that site loading in it.
    const embedOf = ([, source, id, start, extra]) => source === 'drive' ? DRIVE_EMBED(id, extra) : VIMEO_EMBED(id, extra, start);
    const shownWrong = [];
    for (const f of forms) {
      if (!(await ytLook(page)).ask) await ytChoose(page, 'Change video');
      await ytShow(page, f[0]);
      const want = embedOf(f);
      const good = await eventually(async () => (await ytLook(page)).src === want && vidFrames(page).length === 1 && vidFrames(page)[0].url() === want && await vidFrames(page)[0].evaluate(() => /stand-in/.test(document.title)), 3000);
      if (!good) shownWrong.push(`${f[0].slice(0, 70)} → ${(await ytLook(page)).src || (await ytLook(page)).err}`);
    }
    ok(!shownWrong.length, `each shows its site’s player, at the right address, which loads (${forms.length} links${shownWrong.length ? '; not: ' + shownWrong.join('; ') : ''})`);

    // What is turned away, and what the link box says.
    const F = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345', G = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const refused = [
      ['', VMSG.empty], ['   ', VMSG.empty], ['hello there', VMSG.none], ['javascript:alert(1)', VMSG.none], ['https://www.dailymotion.com/video/x8abc12', VMSG.none],
      [`https://drive.google.com/drive/folders/${F}`, VMSG.folder], [`https://drive.google.com/drive/folders/${F}?usp=sharing`, VMSG.folder], [`https://drive.google.com/drive/u/0/folders/${F}`, VMSG.folder],
      ['https://drive.google.com/drive/my-drive', VMSG.folder], [`https://drive.google.com/folderview?id=${F}`, VMSG.folder], [`https://drive.google.com/embeddedfolderview?id=${F}#grid`, VMSG.folder],
      [`https://docs.google.com/document/d/${G}/edit`, VMSG.doc], [`https://docs.google.com/spreadsheets/d/${G}/edit#gid=0`, VMSG.sheet], [`https://docs.google.com/presentation/d/${G}/edit?usp=sharing`, VMSG.slides],
      [`https://docs.google.com/forms/d/${G}/viewform`, VMSG.none],
      [`https://drive.google.com/file/d/short/view`, VMSG.none], [`https://drive.google.com/file/d/${D1}%22%3E%3Cimg/view`, VMSG.none], [`https://drive.google.com/file/d/${'x'.repeat(80)}/view`, VMSG.none],
      [`https://drive.google.com.example.org/file/d/${D1}/view`, VMSG.none], [`https://example.org/drive.google.com/file/d/${D1}/view`, VMSG.none], [`https://drive.google.com/open?id=${D1}&resourcekey=%3Cscript%3E`, VMSG.none],
      [`https://drive.google.com/file/d/${D1}/view?resourcekey=${RK}<script>`, VMSG.none], [`ftp://drive.google.com/file/d/${D1}/view`, VMSG.none],
      ['https://vimeo.com/showcase/11223344', VMSG.list], ['https://vimeo.com/album/2233445', VMSG.list], ['https://vimeo.com/channels/staffpicks', VMSG.list], ['https://vimeo.com/groups/animation', VMSG.list],
      ['https://vimeo.com/blenderfoundation', VMSG.list], ['https://vimeo.com/user12345678', VMSG.list], ['https://vimeo.com/blenderfoundation/videos', VMSG.list],
      ['https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', VMSG.list], ['https://www.youtube.com/@ccsd21', VMSG.list], ['https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw', VMSG.list],
      [`https://vimeo.com/${V1}/zzzzzzzzzz`, VMSG.none], [`https://vimeo.com/${V1}abc`, VMSG.none], [`https://player.vimeo.com/video/${V2}?h=${VH}%22%3E%3Cimg`, VMSG.none], ['https://player.vimeo.com/video/abc', VMSG.none],
      [`https://vimeo.com.example.org/${V1}`, VMSG.none], [`https://notvimeo.com/${V1}`, VMSG.none], ['https://vimeo.com/0', VMSG.none], ['https://vimeo.com/1234567890123', VMSG.none], [V1, VMSG.none],
      // (more lists: a channel's or group's videos, a YouTube playlist's watch and embed links without a video)
      ['https://vimeo.com/channels/staffpicks/videos', VMSG.list], ['https://vimeo.com/groups/animation/videos', VMSG.list],
      ['https://www.youtube.com/watch?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', VMSG.list], ['https://www.youtube.com/embed?listType=playlist&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', VMSG.list],
      // (Vimeo's address for one's own video, damaged; a video on another site)
      ['https://vimeo.com/manage/videos/abc', VMSG.none], [`https://vimeo.com/manage/videos/${V1}/zzzz`, VMSG.none], ['https://vimeo.com/manage/folders/123', VMSG.none],
      ['https://www.dropbox.com/scl/fi/a1b2c3d4/lesson.mp4?rlkey=x1y2z3&dl=0', VMSG.none]
    ];
    const said = [];
    const players = () => yt.hits.filter(u => !/oembed/.test(u));
    yt.hits.length = 0;
    for (const [text, msg] of refused) {
      if (!(await ytLook(page)).ask) await ytChoose(page, 'Change video');
      const before = JSON.stringify(await ytData(page));
      await ytWin(page).locator('#link').fill(text); await ytWin(page).locator('#go').click(); await page.waitForTimeout(150);
      const l = await ytLook(page);
      if (!(l.ask && l.err === msg && l.frames === 0 && JSON.stringify(await ytData(page)) === before)) said.push(`${text.slice(0, 70)} → “${l.err}”${l.frames ? ' (a frame)' : ''}`);
    }
    ok(!said.length && players().length === 0, `text that isn’t a video’s link is turned away with a message that says what it is and what to paste, and nothing is saved or loaded (${refused.length} kinds${said.length ? '; not: ' + said.join('; ') : ''}${players().length ? '; loaded: ' + players().join(' ') : ''})`);
    ok(await ytWin(page).locator('html').evaluate(() => { const r = document.getElementById('err').getBoundingClientRect(); return r.bottom <= innerHeight && r.width > 0; }), 'the message shows in the window');

    // (a fresh start: Reset, then four videos)
    await page.click('.win[data-ikey="youtube-player:1"] .win-label'); await page.click('#menu [data-act="reset"]'); await page.click('#menu [data-act="reset-yes"]');
    ok(await eventually(async () => (await ytLook(page)).ask && await ytData(page) === null), 'Reset');
    for (const t of [`https://vimeo.com/${V1}`, `https://drive.google.com/file/d/${D1}/view`, `https://vimeo.com/${V2}/${VH}`]) { if (!(await ytLook(page)).ask) await ytChoose(page, 'Change video'); await ytShow(page, t); }
    // A Drive video: Drive's own preview page, no Referer, the menu's Open in Google Drive.
    await ytChoose(page, 'Change video'); await ytShow(page, `https://drive.google.com/open?id=${D2}&resourcekey=${RK}`);
    let a = await ytLook(page);
    ok(a.player && a.src === DRIVE_EMBED(D2, RK), `a Drive file shows Drive’s own preview page, its resource key passed on (${a.src})`);
    let d = await ytData(page);
    ok(d.source === 'drive' && d.videoId === D2 && d.resourceKey === RK && d.videoUrl === `https://drive.google.com/open?id=${D2}&resourcekey=${RK}` && !('start' in d) && !('hash' in d) && d.history[0].source === 'drive' && d.history[0].resourceKey === RK,
      `it is saved with its source and resource key, in the History too (${JSON.stringify(d).slice(0, 220)})`);
    let fr = await ytWin(page).locator('#player iframe').evaluate(f => ({ allow: f.getAttribute('allow'), fs: f.hasAttribute('allowfullscreen'), ref: f.getAttribute('referrerpolicy'), title: f.title, sandbox: f.hasAttribute('sandbox') }));
    ok(fr.allow.split(/;\s*/).sort().join() === 'autoplay,fullscreen' && fr.fs && fr.ref === 'no-referrer' && fr.title === 'Google Drive video player' && !fr.sandbox, `Drive’s frame: allow="${fr.allow}", allowfullscreen, referrerpolicy="${fr.ref}", title “${fr.title}”`);
    ok(await eventually(async () => vidFrames(page).length === 1 && await vidFrames(page)[0].evaluate(() => window.__ref) === ''), 'Drive isn’t told where the board is (no Referer)');
    ok(await eventually(async () => await ytMenu(page) === `Change video | Open in Google Drive | — | Remove video | — | History | ${DRIVE_LABEL(D2)} | ${VIMEO_TITLES[`${V2}/${VH}`]} | ${DRIVE_LABEL(D1)} | ${VIMEO_TITLES[V1]}`, 3000),
      `the menu: Open in Google Drive, and a History of Drive and Vimeo videos (${await ytMenu(page)})`);
    let [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), ytChoose(page, 'Open in Google Drive')]);
    ok(!!tab && tab.url() === DRIVE_OPEN(D2, RK) && await tab.evaluate(() => window.opener === null), `Open in Google Drive opens the file in Drive, in a new tab the board can’t reach (${tab && tab.url()})`);
    if (tab) await tab.close();
    // A Vimeo video, unlisted, from a time: Vimeo's player with "do not track" and its overlays quiet; Open in Vimeo.
    await ytChoose(page, 'Change video'); await ytShow(page, `https://vimeo.com/${V2}/${VH}#t=1m30s`);
    a = await ytLook(page); d = await ytData(page);
    ok(a.player && a.src === VIMEO_EMBED(V2, VH, 90) && d.source === 'vimeo' && d.videoId === V2 && d.hash === VH && d.start === 90 && !('resourceKey' in d),
      `an unlisted Vimeo video from 1:30: Vimeo’s player, its hash, dnt=1, no title, byline or portrait over it, from 1:30 (${a.src}; ${JSON.stringify(d).slice(0, 160)})`);
    fr = await ytWin(page).locator('#player iframe').evaluate(f => ({ allow: f.getAttribute('allow'), fs: f.hasAttribute('allowfullscreen'), ref: f.getAttribute('referrerpolicy'), title: f.title }));
    ok(fr.allow.split(/;\s*/).sort().join() === 'autoplay,clipboard-write,encrypted-media,fullscreen,picture-in-picture' && fr.fs && fr.ref === 'strict-origin-when-cross-origin' && fr.title === 'Vimeo video player',
      `Vimeo’s frame: allow="${fr.allow}" (no web-share), allowfullscreen, referrerpolicy="${fr.ref}", title “${fr.title}”`);
    ok(await eventually(async () => vidFrames(page).length === 1 && await vidFrames(page)[0].evaluate(() => window.__ref) === BASE), 'Vimeo is told the board’s site (Referer), as a video limited to some sites needs');
    ok(await eventually(async () => await ytMenu(page) === `Change video | Open in Vimeo | — | Remove video | — | History | ${VIMEO_TITLES[`${V2}/${VH}`]} (from 1:30) | ${DRIVE_LABEL(D2)} | ${VIMEO_TITLES[`${V2}/${VH}`]} | ${DRIVE_LABEL(D1)} | ${VIMEO_TITLES[V1]}`, 3000),
      `the menu: Open in Vimeo; the same video from a time is listed apart (${await ytMenu(page)})`);
    [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), ytChoose(page, 'Open in Vimeo')]);
    ok(!!tab && tab.url() === VIMEO_OPEN(V2, VH, 90) && await tab.evaluate(() => window.opener === null), `Open in Vimeo opens the video on Vimeo, from its time (${tab && tab.url()})`);
    if (tab) await tab.close();
    ok((await ytLook(page)).player, 'and the video stays in its window');
    // Change video fills in the link as pasted.
    await ytChoose(page, 'Change video');
    ok((await ytLook(page)).link === `https://vimeo.com/${V2}/${VH}#t=1m30s`, 'Change video shows the link as it was pasted');
    await ytWin(page).locator('#cancel').click(); await page.waitForTimeout(300);

    // Kiosk mode: no Open in … for Drive or Vimeo either.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    ok(await eventually(async () => (await ytLook(k)).src === VIMEO_EMBED(V2, VH, 90)), 'kiosk mode shows the Vimeo video too');
    ok(!/Open in/.test(await ytMenu(k)) && /^Change video \| — \| Remove video \| — \| History/.test(await ytMenu(k)), `in kiosk mode the menu has no Open in Vimeo (${await ytMenu(k)})`);
    await ytPick(k, DRIVE_LABEL(D2));
    ok(await eventually(async () => (await ytLook(k)).src === DRIVE_EMBED(D2, RK)) && !/Open in/.test(await ytMenu(k)), `nor Open in Google Drive (${await ytMenu(k)})`);
    await k.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: a History of YouTube, Google Drive and Vimeo videos (titles from YouTube and Vimeo, Drive’s labels told apart, tapping one, older content, damaged content from each site, offline, export and import)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt = await stubVideos(ctx);
    // Vimeo and Google cookies in this browser (a teacher signed in): the requests for titles carry neither.
    await ctx.addCookies([{ name: 'vuid', value: 'pl123.456', domain: '.vimeo.com', path: '/', secure: true, sameSite: 'None' }, { name: 'SID', value: 'g00gle', domain: '.google.com', path: '/', secure: true, sameSite: 'None' }]);
    const errors = [];
    const A = await ctx.newPage(); A.on('pageerror', e => errors.push('[A] ' + e.message));
    await A.goto(BASE); await boardUp(A);
    await addWin(A, 'youtube-player');
    const hist = async (p = A) => (await ytHistory(p)) || [];
    const same = async (want, p = A, ms = 3000) => eventually(async () => JSON.stringify(await hist(p)) === JSON.stringify(want), ms);
    const show = async text => { if (!(await ytLook(A)).ask) await ytChoose(A, 'Change video'); await ytShow(A, text); };
    // Five videos from the three sites.
    await show(`https://youtu.be/${VID}`); await show(`https://vimeo.com/${V1}`); await show(`https://drive.google.com/file/d/${D1}/view?usp=sharing`);
    await show(`https://vimeo.com/${V2}/${VH}`); await show(`https://drive.google.com/open?id=${D2}&resourcekey=${RK}`);
    const L5 = [DRIVE_LABEL(D2), VIMEO_TITLES[`${V2}/${VH}`], DRIVE_LABEL(D1), VIMEO_TITLES[V1], YT_LABEL[VID]];
    ok(await same(['✓ ' + L5[0], ...L5.slice(1)]), `a History of five from the three sites: YouTube’s and Vimeo’s by their titles, Drive’s as “Google Drive video” and the end of its id, so two can be told apart (${(await hist()).join(' | ')})`);
    const vq = yt.asked.filter(x => x.source === 'vimeo');
    ok(vq.length === 2 && vq[0].url === VIMEO_OEMBED(V1) && vq[1].url === VIMEO_OEMBED(V2, VH) && vq.every(x => x.cookie === '' && x.referer === '' && x.origin === new URL(BASE).origin),
      `Vimeo’s titles come from its oEmbed, asked once each, an unlisted one with its hash, with no cookie and no Referer (${vq.map(x => x.url + ' cookie “' + x.cookie + '” Referer “' + x.referer + '”').join('; ')})`);
    ok(yt.oembeds(VID) === 1 && yt.asked.length === 3 && !yt.hits.some(u => /drive\.google\.com\/(?!file\/d\/[^/]+\/preview)/.test(u)), `YouTube’s title asked once, and Drive is asked for nothing but its player (${yt.asked.length} title requests)`);
    let d = await ytData(A);
    ok(d.source === 'drive' && d.videoId === D2 && d.resourceKey === RK && JSON.stringify(d.history.map(e => [e.source, e.videoId, e.hash || e.resourceKey || ''])) === JSON.stringify([['drive', D2, RK], ['vimeo', V2, VH], ['drive', D1, ''], ['vimeo', V1, ''], ['youtube', VID, '']]),
      `the content: each video with its source, and a Vimeo hash or Drive resource key (${JSON.stringify(d).slice(0, 300)})`);
    ok(d.history[3].title === VIMEO_TITLES[V1] && d.history[4].title === YT_TITLES[VID] && !('title' in d.history[2]), 'the titles found are saved with the next change; a Drive video has none');
    // The same video from another form of its link: to the top, listed once, not asked for again.
    await show(`https://vimeo.com/channels/staffpicks/${V1}`); await show(`https://drive.google.com/file/d/${D2}/view?resourcekey=${RK}`);
    ok(await same(['✓ ' + DRIVE_LABEL(D2), VIMEO_TITLES[V1], VIMEO_TITLES[`${V2}/${VH}`], DRIVE_LABEL(D1), YT_LABEL[VID]]) && yt.asked.length === 3,
      `the same video from another form of its link moves to the top, listed once, its title not asked for again (${(await hist()).join(' | ')})`);
    // Tapping one shows it: from Drive to Vimeo to YouTube.
    let ok3 = true;
    for (const [label, want] of [[DRIVE_LABEL(D1), DRIVE_EMBED(D1)], [VIMEO_TITLES[`${V2}/${VH}`], VIMEO_EMBED(V2, VH)], [YT_LABEL[VID], EMBED(VID)]]) {
      ok3 = ok3 && await ytPick(A, label) && await eventually(async () => (await ytLook(A)).src === want && vidFrames(A).length === 1 && (await hist())[0] === '✓ ' + label, 3000);
    }
    ok(ok3, `tapping a History item shows that video, whatever its site, in place of the other (${(await hist()).join(' | ')})`);
    ok(/^Change video \| Open in YouTube \| — \| Remove video \| — \| History \| /.test(await ytMenu(A)), `the menu follows the site: Open in YouTube (${await ytMenu(A)})`);
    // Two Vimeo videos without a title (private: 404; blocked): "Vimeo video" and the number.
    Object.assign(yt.vimeo, { '22222222': { status: 404 }, '33333333': { abort: true } });
    await show('https://vimeo.com/22222222'); await show('https://vimeo.com/33333333');
    ok(await same(['✓ Vimeo video 33333333', 'Vimeo video 22222222', YT_LABEL[VID], VIMEO_TITLES[`${V2}/${VH}`], DRIVE_LABEL(D1)]), `a Vimeo video without a title is “Vimeo video” and its number (${(await hist()).join(' | ')})`);

    // Reload: the History stays.
    const now = await hist();
    await A.reload(); await boardUp(A);
    ok(await same(now, A, 8000), `after a reload the History is the same (${(await hist()).join(' | ')})`);

    // Content from before (no source) is YouTube's.
    await saveData(A, 'youtube-player:1', { videoId: VID2, videoUrl: `https://youtu.be/${VID2}`, start: 30, history: [{ videoId: VID2, videoUrl: `https://youtu.be/${VID2}`, start: 30, title: YT_TITLES[VID2] }, { videoId: VID, videoUrl: `https://youtu.be/${VID}` }] });
    await A.reload(); await boardUp(A);
    ok(await eventually(async () => (await ytLook(A)).src === EMBED(VID2, '&start=30')) && await same(['✓ Big Buck Bunny 60fps 4K - Official… (from 0:30)', YT_LABEL[VID]], A, 6000) && /Open in YouTube/.test(await ytMenu(A)),
      `content saved before (no source) plays from YouTube, with its History (${(await ytLook(A)).src}; ${(await hist()).join(' | ')})`);

    // Damaged content, from each site: the link box, nothing loaded.
    const send = dd => A.evaluate(dd => window.__board21.state.wins.get('youtube-player:1').post('data', { data: dd, reason: 'remote' }), dd);
    const evil = '"><img src=x onerror="top.document.title=\'PWNED\'">', evilT = '<img src=x onerror="top.document.title=\'PWNED\'">';
    const loads = () => yt.hits.filter(u => !/oembed/.test(u)).length;
    const crafted = [
      { source: 'drive', videoId: 'short', videoUrl: '' }, { source: 'drive', videoId: D1 + evil, videoUrl: '' }, { source: 'drive', videoId: D1, resourceKey: evil, videoUrl: '' },
      { source: 'drive', videoId: D1, resourceKey: 42, videoUrl: '' }, { source: 'drive', videoId: '../../evil/' + 'a'.repeat(30), videoUrl: '' }, { source: 'drive', videoId: VID, videoUrl: '' },
      { source: 'drive', videoId: 'x'.repeat(200), videoUrl: '' }, { source: 'drive', videoId: D1, videoUrl: 'x'.repeat(5000) },
      { source: 'vimeo', videoId: 'abc', videoUrl: '' }, { source: 'vimeo', videoId: +V1, videoUrl: '' }, { source: 'vimeo', videoId: V1, hash: 'javascript:alert(1)', videoUrl: '' },
      { source: 'vimeo', videoId: V1, hash: 'ZZZZZZZZZZ', videoUrl: '' }, { source: 'vimeo', videoId: V1, hash: 7, videoUrl: '' }, { source: 'vimeo', videoId: '0', videoUrl: '' },
      { source: 'vimeo', videoId: V1 + '#t=9', videoUrl: '' }, { source: 'vimeo', videoId: V1 + '?autoplay=1', videoUrl: '' }, { source: 'vimeo', videoId: VID, videoUrl: '' },
      { source: 'javascript', videoId: VID, videoUrl: '' }, { source: 'https://evil.example/', videoId: VID, videoUrl: '' }, { source: null, videoId: VID, videoUrl: '' },
      { source: 'youtube', videoId: D1, videoUrl: '' }, { source: ['vimeo'], videoId: V1, videoUrl: '' }, { source: 'Vimeo', videoId: V1, videoUrl: '' }, { source: 'vimeo', videoId: V1, videoUrl: 42 }];
    const wrongly = [];
    for (const dd of crafted) {
      await send({ source: 'vimeo', videoId: V1, videoUrl: `https://vimeo.com/${V1}` }); await A.waitForTimeout(250);
      const n = loads();
      await send(dd); await A.waitForTimeout(250);
      const x = await ytLook(A);
      if (!(x.ask && x.frames === 0 && loads() === n)) wrongly.push(JSON.stringify(dd).slice(0, 70));
    }
    ok(!wrongly.length && await A.title() !== 'PWNED', `damaged Drive, Vimeo or YouTube content from another tab or device shows the link box and loads nothing (${crafted.length} kinds${wrongly.length ? '; not: ' + wrongly.join(', ') : ''})`);
    await send({ source: 'drive', videoId: D1, videoUrl: '', start: 90 }); await A.waitForTimeout(300);
    ok((await ytLook(A)).src === DRIVE_EMBED(D1), 'a start time with a Drive video is left out');
    await send({ source: 'vimeo', videoId: V1, videoUrl: '', start: 1e9 }); await A.waitForTimeout(300);
    ok((await ytLook(A)).src === VIMEO_EMBED(V1), 'a Vimeo start time longer than a day is left out');
    await send({ source: 'vimeo', videoId: V1, videoUrl: '', start: 75 }); await A.waitForTimeout(300);
    ok((await ytLook(A)).src === VIMEO_EMBED(V1, '', 75), 'a saved Vimeo start time is used');
    await ytChoose(A, 'Change video');
    ok((await ytLook(A)).link === VIMEO_OPEN(V1, '', 75), `Change video without a saved link fills in the video’s Vimeo address (${(await ytLook(A)).link})`);
    await ytWin(A).locator('#cancel').click(); await A.waitForTimeout(300);
    // A History with damaged entries from each site: those are dropped, the rest kept.
    Object.assign(yt.vimeo, { '148751763': { status: 404 } });
    await send({ source: 'vimeo', videoId: '22439234', videoUrl: '', history: [{ source: 'drive', videoId: 'short', videoUrl: '' }, { source: 'vimeo', videoId: V1, hash: 'nothex!!!!', videoUrl: '' },
      { source: 'drive', videoId: D1, resourceKey: '<b>', videoUrl: '' }, { source: 'tiktok', videoId: VID, videoUrl: '' }, { source: 'vimeo', videoId: 'x', videoUrl: '' },
      { source: 'drive', videoId: D1, videoUrl: '', start: 30, title: evilT }, { source: 'vimeo', videoId: '148751763', videoUrl: '', start: 'soon' }, { videoId: VID, videoUrl: '', title: 'Old and YouTube’s' },
      { source: 'drive', videoId: D2, resourceKey: RK, videoUrl: '' }, { source: 'vimeo', videoId: V1, videoUrl: '' }] });
    ok(await same(['✓ The Mountain', evilT, 'Vimeo video 148751763', 'Old and YouTube’s', DRIVE_LABEL(D2)]),
      `damaged entries are dropped (each site’s own checks), the rest kept, five at most, a title only ever text, a Drive start time left out (${(await hist()).join(' | ')})`);
    await A.click('.win[data-ikey="youtube-player:1"] .win-label'); await A.waitForTimeout(300);
    ok(await A.evaluate(() => document.querySelectorAll('#menu img, #menu [onerror]').length) === 0 && await A.title() !== 'PWNED', 'a title with markup shows as text in the menu');
    await A.click('.win[data-ikey="youtube-player:1"] .win-label');
    // A file with damaged content opens with the link box too.
    const file = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Crafted' }, instances: [
      { widgetId: 'youtube-player', instance: 1, open: true, z: 1, rect: { x: 40, y: 40, w: 480, h: 310 }, config: null, data: { source: 'drive', videoId: D1, resourceKey: '"><script>top.document.title="PWNED"</script>', videoUrl: evil } },
      { widgetId: 'youtube-player', instance: 2, open: true, z: 2, rect: { x: 600, y: 40, w: 480, h: 310 }, config: null, data: { source: 'vimeo', videoId: V1, hash: 'javascript:x', videoUrl: '' } },
      { widgetId: 'youtube-player', instance: 3, open: true, z: 3, rect: { x: 40, y: 380, w: 480, h: 310 }, config: null, data: { source: 'vimeo', videoId: V2, hash: VH, start: 30, videoUrl: '' } }] };
    await A.evaluate(f => window.__board21.applyImport(f, 'replace'), file); await A.waitForTimeout(1500);
    const c1 = await ytLook(A, 'youtube-player:1'), c2 = await ytLook(A, 'youtube-player:2'), c3 = await ytLook(A, 'youtube-player:3');
    ok(c1.ask && c1.frames === 0 && c2.ask && c2.frames === 0 && c3.src === VIMEO_EMBED(V2, VH, 30) && await A.title() !== 'PWNED', `from an imported file too: damaged content shows the link box; good content plays (${c3.src})`);

    // Offline: Drive and Vimeo show the message, and come back by themselves.
    await A.evaluate(() => window.__board21.closeWin('youtube-player:2', { quiet: true })); await A.evaluate(() => window.__board21.closeWin('youtube-player:3', { quiet: true }));
    await ytShow(A, `https://drive.google.com/file/d/${D1}/view`, 'youtube-player:1');
    ok(await eventually(async () => (await ytLook(A)).src === DRIVE_EMBED(D1)), 'a Drive video');
    for (const [label, want, go] of [['Drive', DRIVE_EMBED(D1), null], ['Vimeo', VIMEO_EMBED(V2, VH), `https://vimeo.com/${V2}/${VH}`]]) {
      await ctx.setOffline(true); await A.waitForTimeout(500);
      if (go) { await ytChoose(A, 'Change video'); await ytShow(A, go); }
      const x = await ytLook(A);
      ok(x.offline && x.frames === 0 && vidFrames(A).length === 0 && x.text === 'You’re offline. The video comes back when you’re online.', `${label}, offline: the frame goes and the message shows (“${x.text}”)`);
      await ctx.setOffline(false);
      ok(await eventually(async () => { const y = await ytLook(A); return y.player && y.src === want && vidFrames(A).length === 1; }), `${label}: back online, the video comes back by itself`);
    }

    // Export and import carry the sources, hashes and keys, with the History and its titles.
    await show(`https://vimeo.com/${V1}`); await show(`https://youtu.be/${VID}`); await A.waitForTimeout(300);
    await ytPick(A, VIMEO_TITLES[V1]);
    const full = await A.evaluate(() => window.__board21.buildExport('full'));
    const fi = full.instances.find(i => i.widgetId === 'youtube-player');
    const wantH = [{ source: 'vimeo', videoId: V1, videoUrl: `https://vimeo.com/${V1}`, title: VIMEO_TITLES[V1] }, { source: 'youtube', videoId: VID, videoUrl: `https://youtu.be/${VID}`, title: YT_TITLES[VID] },
      { source: 'vimeo', videoId: V2, hash: VH, videoUrl: `https://vimeo.com/${V2}/${VH}`, title: VIMEO_TITLES[`${V2}/${VH}`] }, { source: 'drive', videoId: D1, videoUrl: `https://drive.google.com/file/d/${D1}/view` }];
    ok(fi && fi.data && fi.data.source === 'vimeo' && fi.data.videoId === V1 && JSON.stringify(fi.data.history.slice(0, 4)) === JSON.stringify(wantH), `a full export has the video and its History, each with its source, hash or key, and title (${JSON.stringify(fi && fi.data).slice(0, 400)})`);
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const yt2 = await stubVideos(ctx2);
    const p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push('[2] ' + e.message));
    await p2.goto(BASE); await boardUp(p2);
    await p2.evaluate(f => window.__board21.applyImport(f, 'replace'), full);
    ok(await eventually(async () => (await ytLook(p2)).src === VIMEO_EMBED(V1) && vidFrames(p2).length === 1), 'importing it on another device shows the same Vimeo video');
    ok(await eventually(async () => JSON.stringify(((await ytHistory(p2)) || []).slice(0, 4)) === JSON.stringify(['✓ ' + VIMEO_TITLES[V1], YT_LABEL[VID], VIMEO_TITLES[`${V2}/${VH}`], DRIVE_LABEL(D1)]), 3000) && yt2.asked.length === 0,
      `and its History, by the titles in the file: neither site is asked for them (${JSON.stringify(await ytHistory(p2))}; ${yt2.asked.length} requests)`);
    await ctx2.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Video Player: Board Sync with Google Drive and Vimeo videos (picked on one device and changed or removed on the other before they synced: the later one wins, with its History)', async (browser) => {
    const errors = [];
    const A = await syncDev(browser, 'the laptop', errors), B = await syncDev(browser, 'the smartboard', errors);
    await stubVideos(A.c); await stubVideos(B.c);
    const ik = await addWin(A.p, 'youtube-player');
    await ytShow(A.p, `https://drive.google.com/file/d/${D1}/view`, ik);
    await linkFolder(A.p); await deliver(A.p, B.p); await linkFolder(B.p); await exchange(A, B);
    const ikB = await ikOf(B.p, await A.p.evaluate(ik => window.__board21.state.insts.get(ik).wid, ik));
    ok(!!ikB && await eventually(async () => (await ytLook(B.p, ikB)).src === DRIVE_EMBED(D1)), 'the smartboard shows the laptop’s Drive video');
    const k = d => d === A ? ik : ikB;
    const pick = async (d, link) => { if (!(await ytLook(d.p, k(d))).ask) await ytChoose(d.p, 'Change video', k(d)); await ytShow(d.p, link, k(d)); };
    const remove = d => ytChoose(d.p, 'Remove video', k(d));
    const look = async d => { const l = await ytLook(d.p, k(d)), data = await ytData(d.p, k(d));
      return { src: l.ask ? 'ask' : l.src, frames: l.frames, video: data && data.videoId, source: data && data.source, top: ((await ytHistory(d.p, k(d))) || [])[0], wins: (await winList(d.p)).filter(x => x.widgetId === 'youtube-player').length }; };
    const vim = `https://vimeo.com/${V2}/${VH}`, drv = `https://drive.google.com/open?id=${D2}&resourcekey=${RK}`;
    for (const [first, firstDo, then, thenDo, label, want] of [
      [A, d => pick(d, drv), B, d => pick(d, vim), 'a Drive video picked on the laptop, then a Vimeo video on the smartboard', { src: VIMEO_EMBED(V2, VH), video: V2, source: 'vimeo', top: '✓ ' + VIMEO_TITLES[`${V2}/${VH}`] }],
      [B, d => pick(d, vim), A, d => pick(d, drv), 'a Vimeo video picked on the smartboard, then a Drive video on the laptop', { src: DRIVE_EMBED(D2, RK), video: D2, source: 'drive', top: '✓ ' + DRIVE_LABEL(D2) }],
      [A, d => pick(d, vim), B, remove, 'a Vimeo video picked on the laptop, then removed on the smartboard', { src: 'ask', video: null, source: undefined, top: DRIVE_LABEL(D1) }],
      [B, d => pick(d, drv), A, remove, 'a Drive video picked on the smartboard, then removed on the laptop', { src: 'ask', video: null, source: undefined, top: DRIVE_LABEL(D1) }],
      [A, remove, B, d => pick(d, vim), 'removed on the laptop, then a Vimeo video picked on the smartboard', { src: VIMEO_EMBED(V2, VH), video: V2, source: 'vimeo', top: '✓ ' + VIMEO_TITLES[`${V2}/${VH}`] }]]) {
      await pick(A, `https://drive.google.com/file/d/${D1}/view`); await syncNow(A.p); await exchange(A, B); await A.p.waitForTimeout(500);   // (the same video on both to start with)
      await firstDo(first); await syncNow(first.p); await first.p.waitForTimeout(1500);
      await thenDo(then); await then.p.waitForTimeout(300); await syncNow(then.p);
      await exchange(A, B); await A.p.waitForTimeout(800);
      const good = x => x.wins === 1 && x.src === want.src && x.video === want.video && x.source === want.source && x.frames === (want.video ? 1 : 0) && x.top === want.top;
      let a, b;
      await eventually(async () => { a = await look(A); b = await look(B); return good(a) && good(b); }, 3000);
      ok(good(a) && good(b), `${label} (later): ${want.video ? 'that video' : 'no video, and no frame,'} on both, with its History, and no copy (laptop ${JSON.stringify(a)}; smartboard ${JSON.stringify(b)})`);
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Video Player: a video link pasted or dropped on the board opens a Video Player (YouTube watch, youtu.be with a start time, Shorts, Google Drive, Vimeo; other text and links do nothing; Notes keeps its paste; a picture wins; after tapping a widget; an empty Video Player takes it; windows locked; kiosk; one link reader for the board and the widget)', async (browser) => {
    // One link reader: the Video Player's, in a file of its own that the board loads too.
    const vp = fs.readFileSync(path.join(ROOT, 'widgets', 'youtube-player', 'index.html'), 'utf8'), linksFile = path.join(ROOT, 'widgets', 'youtube-player', 'video-links.js');
    const links = fs.existsSync(linksFile) ? fs.readFileSync(linksFile, 'utf8') : '', shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    ok(/function readText\(/.test(links) && /function fromYouTube\(/.test(links) && !/function readText\(|function fromYouTube\(|function fromDrive\(|function fromVimeo\(/.test(vp) &&
      /<script src="video-links\.js"><\/script>/.test(vp) && /<script src="widgets\/youtube-player\/video-links\.js"><\/script>\s*<script src="board\.js">/.test(shell) && /'widgets\/youtube-player\/video-links\.js': '[0-9a-f]{16}'/.test(sw),
      'the Video Player reads links with widgets/youtube-player/video-links.js, which the board loads too, and which is in the offline copy');
    // Nothing in it that can't be seen: the zero-width characters (and the quotes and CJK marks) a link is split at are
    // written as \u escapes, as before the move, so an editor can't drop them. And it still splits there.
    let VL = null; try { VL = require(linksFile); } catch (e) { /* not there */ }
    const split = VL && ['“https://youtu.be/dQw4w9WgXcQ”', '«https://youtu.be/dQw4w9WgXcQ»', 'https://youtu.be/dQw4w9WgXcQ\u200bwatch', 'https://youtu.be/dQw4w9WgXcQ\u2060', '(https://youtu.be/dQw4w9WgXcQ)。', 'https://youtu.be/dQw4w9WgXcQ，']
      .every(t => (VL.readText(t).video || {}).link === 'https://youtu.be/dQw4w9WgXcQ');
    ok(!!links && !/[\u200b-\u200f\u2060\ufeff]/.test(links) && links.includes('\\u200b-\\u200d\\u2060]+/') && links.includes('\\u3001\\u3002\\uff0c]+$/') && split,
      `video-links.js has no invisible characters, and still splits a link from quotes, zero-width spaces and CJK marks (${(links.match(/[\u200b-\u200f\u2060\ufeff]/g) || []).map(c => 'U+' + c.charCodeAt(0).toString(16)).join(' ') || 'none'})`);
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), sdkDoc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8').replace(/\s+/g, ' ');

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const yt = await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const wins = (id, p = page) => p.evaluate(id => Array.from(window.__board21.state.insts.entries()).filter(([k, i]) => k.startsWith(id + ':') && i.open).map(([k]) => k).sort((a, b) => +a.split(':')[1] - +b.split(':')[1]), id);
    const tapBoard = () => page.mouse.click(30, 330);
    const pasteOnBoard = async text => { await copyText(page, text); await tapBoard(); await page.keyboard.press('Control+V'); };
    const board = () => page.evaluate(() => window.__board21.boundsRect());
    const centre = ik => page.evaluate(ik => { const r = window.__board21.state.insts.get(ik).rect; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }, ik);
    const closeAll = async id => { for (const k of await wins(id)) await page.evaluate(k => window.__board21.closeWin(k, { quiet: true }), k); await page.waitForTimeout(300); };

    // Each kind of link, pasted with Ctrl+V on the board: a new Video Player in the middle, in front and selected, on
    // that video, as if the link had been pasted into it.
    for (const [text, want, src, what] of [
      [`https://www.youtube.com/watch?v=${VID}`, { source: 'youtube', videoId: VID }, EMBED(VID), 'a YouTube link'],
      [`https://youtu.be/${VID2}?t=90`, { source: 'youtube', videoId: VID2, start: 90 }, EMBED(VID2, '&start=90'), 'a youtu.be link from 1:30'],
      ['https://www.youtube.com/shorts/M7lc1UVf-VE', { source: 'youtube', videoId: 'M7lc1UVf-VE' }, EMBED('M7lc1UVf-VE'), 'a YouTube Short'],
      [`  https://drive.google.com/file/d/${D1}/view?usp=sharing\n`, { source: 'drive', videoId: D1 }, DRIVE_EMBED(D1), 'a Google Drive file’s link, with spaces around it'],
      [`https://vimeo.com/${V2}/${VH}#t=30`, { source: 'vimeo', videoId: V2, hash: VH, start: 30 }, VIMEO_EMBED(V2, VH, 30), 'an unlisted Vimeo video from 0:30']]) {
      const n = (await wins('youtube-player')).length;
      await pasteOnBoard(text);
      ok(await eventually(async () => (await wins('youtube-player')).length === n + 1), `${what}: Ctrl+V on the board opens a Video Player`);
      const ik = (await wins('youtube-player')).slice(-1)[0];
      ok(!!ik && await eventually(async () => (await ytLook(page, ik)).src === src), `${what}: it plays that video (${ik && (await ytLook(page, ik)).src})`);
      const d = ik ? await ytData(page, ik) : null, bb = await board(), m = ik ? await centre(ik) : { x: 0, y: 0 };
      ok(!!d && Object.entries(want).every(([k, v]) => d[k] === v) && d.videoUrl === text.trim() && (d.history || []).length === 1 && await page.evaluate(() => window.__board21.state.focused) === ik &&
        Math.abs(m.x - (bb.x + bb.w / 2)) < 40 && Math.abs(m.y - (bb.y + bb.h * 0.42)) < 40,
        `${what}: saved as if pasted into it, in the middle of the board, in front and selected (${JSON.stringify(d && Object.assign({}, d, { history: (d.history || []).length }))}; ${Math.round(m.x)}, ${Math.round(m.y)})`);
      if (what === 'a YouTube link') await page.screenshot({ path: OUT + 'video-link-pasted.png' });
      await closeAll('youtube-player');
    }
    // Anything else does nothing: words, other links, a folder, a playlist, a bare id, a sentence with a link in it, an
    // embed code.
    for (const [text, what] of [['Spelling words', 'words'], ['https://www.example.com/watch?v=dQw4w9WgXcQ', 'a link to another site'], [`https://drive.google.com/drive/folders/${D1}`, 'a Drive folder'],
      [PLAYLIST_EMBED, 'a playlist'], [VID, 'a YouTube id on its own'], [`Watch this tonight: https://youtu.be/${VID}`, 'a sentence with a link in it'], [EMBED_CODE, 'an embed code']]) {
      const n = [(await wins('youtube-player')).length, (await wins('image')).length];
      await pasteOnBoard(text); await page.waitForTimeout(900);
      ok(JSON.stringify([(await wins('youtube-player')).length, (await wins('image')).length]) === JSON.stringify(n), `${what}: Ctrl+V opens nothing`);
    }
    // A picture and a link on the clipboard together: the picture wins.
    const png = await drawPic(page, 90, 60, 'image/png');
    const both = await page.evaluate(async ([b64, link]) => { await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))], { type: 'image/png' }), 'text/plain': new Blob([link], { type: 'text/plain' }) })]); return (await navigator.clipboard.read()).map(i => i.types.join(' ')).join(', '); }, [png.toString('base64'), `https://youtu.be/${VID}`]).catch(e => 'not written: ' + e.message);
    let n = [(await wins('youtube-player')).length, (await wins('image')).length];
    await tapBoard(); await page.keyboard.press('Control+V');
    ok(/image\/png/.test(both) && /text\/plain/.test(both) && await eventually(async () => (await wins('image')).length === n[1] + 1) && (await wins('youtube-player')).length === n[0],
      `with a picture and a link on the clipboard (${both}), Ctrl+V opens a Picture window, not a Video Player`);
    await closeAll('image');
    // In Notes, the paste is the note's.
    const note = await addNote(page, 'Watch: ');
    const nf = page.frame({ name: 'b21-board:' + note });
    if (await nf.isVisible('#view')) await nf.click('#view');
    await nf.focus('#t'); await nf.evaluate(() => { const t = document.getElementById('t'); t.selectionStart = t.selectionEnd = t.value.length; });
    await copyText(page, `https://youtu.be/${VID}`);
    n = (await wins('youtube-player')).length;
    await page.keyboard.press('Control+V'); await page.waitForTimeout(1200);
    ok((await wins('youtube-player')).length === n && (await noteOf(page, note)).includes(`https://youtu.be/${VID}`), `a link pasted in a Notes window goes into the note (${JSON.stringify(await noteOf(page, note))}), no Video Player`);
    // After tapping a widget that takes no paste (a Timer): the link opens a Video Player; words still do nothing.
    const timer = await addWin(page, 'timer');
    for (const [text, opens] of [['Spelling words', false], [`https://www.youtube.com/watch?v=${VID2}`, true]]) {
      await copyText(page, text);
      await page.frameLocator(`.win[data-ikey="${timer}"] iframe`).locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
      n = (await wins('youtube-player')).length;
      await page.keyboard.press('Control+V');
      ok(opens ? await eventually(async () => (await wins('youtube-player')).length === n + 1) : (await page.waitForTimeout(1000), (await wins('youtube-player')).length === n),
        opens ? 'after tapping a Timer, Ctrl+V with a video link opens a Video Player (the widget passes it to the board)' : 'after tapping a Timer, Ctrl+V with words opens nothing');
    }
    await closeAll('youtube-player');
    // An empty Video Player that has the keyboard (not in its link box) takes the link itself, as if pasted into its box.
    const empty = await page.evaluate(async () => { const ik = window.__board21.openWidget('youtube-player', { fresh: true }); await new Promise(r => setTimeout(r, 900)); return ik; });
    await ytWin(page, empty).locator('h1').click().catch(() => {});
    await copyText(page, `https://vimeo.com/${V1}`);
    n = (await wins('youtube-player')).length;
    await page.keyboard.press('Control+V');
    ok(await eventually(async () => (await ytLook(page, empty)).src === VIMEO_EMBED(V1)) && (await wins('youtube-player')).length === n, 'an empty Video Player with the keyboard takes the link itself: no new window');
    await ytChoose(page, 'Change video', empty).catch(() => {});   // (a missing item fails the check below, not the suite)
    await ytWin(page, empty).locator('h1').click().catch(() => {});
    await copyText(page, 'Spelling words');
    await page.keyboard.press('Control+V');
    ok(await eventually(async () => (await ytLook(page, empty)).err === VMSG.none) && (await ytLook(page, empty)).link === 'Spelling words', `words pasted there go into its link box, which says what it needs (${(await ytLook(page, empty)).err})`);
    await closeAll('youtube-player');

    // A link dropped on the board: a Video Player where it was dropped. Another link dropped there does nothing (and the
    // browser doesn't go to it).
    const dropLink = (text, x, y) => page.evaluate(([text, x, y]) => {
      const dt = new DataTransfer(); dt.setData('text/uri-list', text); dt.setData('text/plain', text);
      const at = document.elementFromPoint(x, y), o = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y };
      const over = new DragEvent('dragover', o); at.dispatchEvent(over);
      const drop = new DragEvent('drop', o); at.dispatchEvent(drop);
      return { over: over.defaultPrevented, took: drop.defaultPrevented };
    }, [text, x, y]);
    n = (await wins('youtube-player')).length;
    const dropped = await dropLink(`https://www.youtube.com/watch?v=${VID}`, 420, 330);
    ok(dropped.over && dropped.took && await eventually(async () => (await wins('youtube-player')).length === n + 1), `a YouTube link dropped on the board opens a Video Player (${JSON.stringify(dropped)})`);
    const dk = (await wins('youtube-player')).slice(-1)[0];
    const at = await page.evaluate(() => { const Z = window.__board21.zoom; return { x: (420 - Z.ox) / Z.s, y: (330 - Z.oy) / Z.s }; }), dm = dk ? await centre(dk) : { x: 1e9, y: 1e9 };
    ok(!!dk && await eventually(async () => (await ytLook(page, dk)).src === EMBED(VID)) && Math.hypot(dm.x - at.x, dm.y - at.y) < 60, `where it was dropped, on that video (${Math.round(dm.x)}, ${Math.round(dm.y)}; dropped at ${Math.round(at.x)}, ${Math.round(at.y)})`);
    n = (await wins('youtube-player')).length;
    // (A synthetic drop never leaves the page: what keeps a real one from going to the link is the board taking the
    // dragover and the drop.)
    const url0 = page.url(), other = await dropLink('https://www.example.com/', 900, 330); await page.waitForTimeout(900);
    ok(other.over && other.took && (await wins('youtube-player')).length === n && page.url() === url0, `another link dropped on the board opens nothing, and the board takes it, so the browser stays (${JSON.stringify(other)})`);
    const two = await dropLink(`https://www.youtube.com/watch?v=${VID}\r\nhttps://youtu.be/${VID2}`, 900, 330); await page.waitForTimeout(900);
    ok(two.over && two.took && (await wins('youtube-player')).length === n, `two links dropped at once open nothing, and the board takes them too (${JSON.stringify(two)})`);
    await closeAll('youtube-player');
    // In one of the board's text fields, a dropped link is the field's; while a dialog is open, it opens nothing.
    n = (await wins('youtube-player')).length;
    await page.evaluate(() => { window.__board21.pages.rename(); }); await page.waitForSelector('#modal.open input');
    const fb = await page.locator('#modal.open input').boundingBox(), cb = await page.locator('#modal.open .modal-card').boundingBox();
    const inField = await dropLink(`https://www.youtube.com/watch?v=${VID}`, fb.x + fb.width / 2, fb.y + fb.height / 2);
    const inDialog = await dropLink(`https://www.youtube.com/watch?v=${VID}`, cb.x + 12, cb.y + 12); await page.waitForTimeout(900);
    ok(!inField.over && !inField.took && inDialog.over && inDialog.took && (await wins('youtube-player')).length === n && await page.locator('#modal.open').count() === 1,
      `a link dropped in the Rename dialog’s box is left to the box, and one dropped elsewhere on the dialog opens nothing (${JSON.stringify({ inField, inDialog })})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // Locked: no window, and the board says it's locked, as for a picture.
    await lockBoard(page, 'widgets');
    n = (await wins('youtube-player')).length;
    await pasteOnBoard(`https://www.youtube.com/watch?v=${VID}`); await page.waitForTimeout(900);
    ok((await wins('youtube-player')).length === n && await page.locator('.toast', { hasText: 'The board is locked.' }).count() > 0, 'locked: a pasted link opens nothing, and the board says it’s locked');
    await unlockBoard(page);

    // Kiosk mode: Ctrl+V with a link works there too.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    await copyText(k, `https://youtu.be/${VID}`);
    const kn = (await wins('youtube-player', k)).length;
    await k.mouse.click(30, 330); await k.keyboard.press('Control+V');
    ok(await eventually(async () => (await wins('youtube-player', k)).length === kn + 1), 'kiosk: Ctrl+V with a video link opens a Video Player');
    await k.close();
    ok(yt.hits.every(u => /^https:\/\/(www\.youtube\.com|drive\.google\.com|player\.vimeo\.com|vimeo\.com\/api\/oembed\.json)/.test(u)), `only the video sites’ players and titles were asked for (${yt.hits.length})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
