// Weather: the forecast, warnings, What to wear, and saving.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, openSettings, setTheme, lockBoard, unlockBoard, setCornerClock, setClock, linkFolder,
    syncNow, syncDev, eventually, stamped, STAMPED, parts, boardUp, contrast, rgbOf, WX_AT, WX_FIX, stubWeather, WXT,
    BASE
  } = T;
  return [
  // ---- Weather (2026.11.24-3): a new built-in widget that goes online for the weather. Its sites never answer for real:
  // stubWeather answers from tests/fixtures/weather/, as they did on Mon Nov 23 2026 at 11:50 AM Central.
  ['Weather: the registry, the Widget Picker, a new window on Wheeling, its menu, and the docs', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const { K, F, text } = WXT;
    const norm = s => String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

    // ---- 1. The registry, its page, and the Widget Picker.
    await part('Registry', async () => {
      const { ctx, page } = await WXT.board(browser, errors);
      const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'weather'); return a && { name: a.name, version: a.version, entry: a.entry, files: a.files, clash: a.clash, permissions: a.permissions, win: a.win, color: a.color, icon: a.icon, external: !!a.external, single: !!a.single, devOnly: !!a.devOnly, description: a.description }; });
      ok(!!reg && reg.name === 'Weather' && reg.version === '1.0.0' && reg.entry === 'widgets/weather/index.html' && reg.files[0] === 'widgets/weather/index.html' && reg.files.every(f => /^widgets\/weather\/[\w.-]+$/.test(f) && fs.existsSync(path.join(ROOT, f))) &&
        reg.clash === 'later' && reg.permissions.length === 0 && !reg.external && !reg.single && !reg.devOnly && reg.win.width === 480 && reg.win.height === 360 && reg.win.minWidth === 260 && reg.win.minHeight === 220,
        `it is in the registry as Weather: 480 × 360, at least 260 × 220, clash 'later', no permissions (${JSON.stringify(reg && { files: reg.files, win: reg.win, clash: reg.clash })})`);
      ok(!!reg && reg.description === 'See the weather and what to wear.' && reg.color === '#0395db', `its tooltip and color: “See the weather and what to wear.”, #0395db (${reg && reg.description}, ${reg && reg.color})`);
      const others = await page.evaluate(() => window.__board21.catalog().filter(w => w.id !== 'weather').map(w => String(w.color || '').toLowerCase()));
      ok(!!reg && /^<svg viewBox="0 0 24 24">/.test(reg.icon) && contrast('rgb(255, 255, 255)', rgbOf(reg.color)) >= 3 && !others.includes(reg.color.toLowerCase()), `its tile is a color of its own, the white icon readable on it (${reg && contrast('rgb(255, 255, 255)', rgbOf(reg.color)).toFixed(2)}:1, at least 3:1 for an icon)`);
      const order = await page.evaluate(() => window.BOARD21_WIDGETS.map(w => w.id));
      ok(order.indexOf('weather') === order.indexOf('calculator') + 1 && order.indexOf('21sketch') === order.indexOf('weather') + 1, 'it follows the Calculator in the registry, before the district apps');
      const src = fs.existsSync(path.join(ROOT, 'widgets', 'weather', 'index.html')) ? fs.readFileSync(path.join(ROOT, 'widgets', 'weather', 'index.html'), 'utf8') : '';
      const mf = /<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(src), manifest = mf ? JSON.parse(mf[1]) : {};
      ok(!!reg && manifest.id === 'weather' && manifest.name === reg.name && manifest.version === reg.version && manifest.description === reg.description && manifest.color === reg.color &&
        ['width', 'height', 'minWidth', 'minHeight'].every(k => (manifest.window || {})[k] === reg.win[k]) && /<title>Weather<\/title>/.test(src) && /^<!DOCTYPE html>/.test(src) &&
        /<meta charset="utf-8">\s*<script src="\.\.\/\.\.\/sdk\/board21\.js"><\/script>/.test(src), 'its manifest block matches the registry entry, and the SDK is its first script');
      ok(!!src && !/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie|\b(alert|confirm|prompt)\s*\(|autofocus|navigator\.geolocation/.test(src.replace(/<!--[\s\S]*?-->/g, '')), 'it keeps nothing itself, never asks where the device is, and never stops the board with a dialog');
      const hosts = [...new Set((src.match(/https:\/\/[a-z0-9.-]+/g) || []))].sort();
      ok(hosts.join(' ') === 'https://air-quality-api.open-meteo.com https://api.open-meteo.com https://api.weather.gov https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com https://open-meteo.com', `it names only the five weather sites, and Open-Meteo's own (${hosts.join(' ')})`);
      const vm = require('vm'), box = { addEventListener() {} }; box.self = box;
      box.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), box));
      vm.createContext(box);
      const list = vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + '\n;PRECACHE;', box);
      ok(!!reg && reg.files.every(f => list.includes(f)), 'its files are in the offline copy (sw.js PRECACHE)');
      await page.click('.picker-btn.left'); await page.waitForTimeout(300);
      const tiles = await page.locator('#panel .widget-tile').count(), tile = page.locator('#panel [data-widget="weather"]');
      const teachers = await page.evaluate(() => window.__board21.catalog().filter(a => !a.devOnly && !a.dev).length);
      ok(tiles === teachers && await tile.count() === 1 && (await tile.innerText()).trim() === 'Weather' && (await tile.getAttribute('title')) === 'Weather\nSee the weather and what to wear.', `the Widget Picker has a tile for each of a teacher’s widgets, Weather’s with its tooltip (${tiles} of ${teachers})`);
      await page.keyboard.press('Escape');
      await ctx.close();
    });

    // ---- 2. A new window from the Widget Picker, on Mon Nov 23 (no school): Wheeling, from the five sites only.
    await part('A new window', async () => {
      const { ctx, page, wx } = await WXT.board(browser, errors);
      await page.click('.picker-btn.left'); await page.waitForTimeout(200);
      await page.click('#panel [data-widget="weather"]');
      ok(await WXT.connected(page) && await WXT.drawn(page), 'tapping its tile opens a window, which connects and draws the weather');
      await page.waitForTimeout(800);
      const rect = await page.evaluate(k => window.__board21.state.insts.get(k).rect, K);
      ok(Math.round(rect.w) === 480 && Math.round(rect.h) === 400, `it opens at 480 × 360, Medium (${JSON.stringify(rect)})`);
      const s = await F(page, () => {
        const q = s => document.querySelector('#app ' + s), t = e => e ? e.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : null;
        return { layout: (q('.wx') || {}).className, place: t(q('.place')), temp: t(q('.temp')), unit: t(q('.temp .unit')), unitDim: q('.temp .unit') ? getComputedStyle(q('.temp .unit')).color : '',
          src: [...document.querySelectorAll('#app .hero .src')].map(t), cond: t(q('.hero .cond')), hl: t(q('.hero .hl')),
          week: [...document.querySelectorAll('#app .week .col')].map(c => [t(c.querySelector('.n')), t(c.querySelector('.h')), t(c.querySelector('.l'))].join(' ')), weekHead: t(q('.week') && q('.week').closest('.card').querySelector('h3')),
          wear: { buttons: [...document.querySelectorAll('#app .wl .tg b')].map(t), says: t(q('.wl .says')), items: [...document.querySelectorAll('#app .wl [data-item]')].map(e => e.dataset.item) } };
      });
      ok(/\bL-m\b/.test(s.layout) && s.place === 'Wheeling' && s.temp === '39°F' && s.unit === 'F' && s.src.includes('At Chicago Executive Airport') && s.cond === 'Sunny' && s.hl === 'H 40° L 25°',
        `it shows Wheeling, 39°F with a dim F, “At Chicago Executive Airport”, Sunny, and H 40° L 25° (${JSON.stringify(s).slice(0, 400)})`);
      ok(s.week.join(' | ') === 'Today 40° 25° | Tue 40° 23° | Wed 44° 33° | Thu 45° 42° | Fri 49° 39°' && /Open-Meteo/.test(s.weekHead || ''), `the week: Today 40/25, Tue 40/23, Wed 44/33, Thu 45/42, Fri 49/39, with Open-Meteo in its heading (${s.week.join(' | ')}; ${s.weekHead})`);
      ok(s.wear.buttons.join() === 'Mon, Nov 30' && s.wear.says === 'Dress for chilly weather.' && s.wear.items.join() === 'coat', `What to wear shows only Mon, Nov 30: “Dress for chilly weather.” and a coat (${JSON.stringify(s.wear)})`);
      const hosts = wx.hosts();
      ok(hosts.length && hosts.every(h => /^(api|air-quality-api|archive-api|geocoding-api)\.open-meteo\.com$|^api\.weather\.gov$/.test(h)) && wx.asked.every(a => !a.cookie && !a.referer),
        `it asks only the weather sites, with no cookie and no Referer (${hosts.join(', ')}; ${wx.asked.length} requests)`);
      ok(wx.asked.some(a => a.path === '/points/42.1392,-87.929') && wx.asked.some(a => a.path === '/v1/forecast' && a.query.current && a.query.timeformat === 'unixtime' && a.query.forecast_days === '8' && a.query.timezone === 'America/Chicago'),
        'it looks Wheeling up at the Weather Service at 4 decimals, and asks Open-Meteo for 8 days in unix time, with Now, the first time');
      await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-new.png' });
      await ctx.close();
    });

    // ---- 3. The menu: exactly spec §7.1's items, which fit; the link to Open-Meteo, and none in kiosk mode.
    await part('The menu', async () => {
      const { ctx, page } = await WXT.board(browser, errors);
      await ctx.route(/^https:\/\/open-meteo\.com\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Open-Meteo stand-in</title>' }));
      await WXT.open(page);
      const m = await WXT.menuOf(page);
      const MENU = '[Show] | ✓ Hourly forecast | ✓ 7-day forecast | ✓ What to wear | ✓ Sunrise and sunset | ✓ Moon | ✓ Wind | ✓ Air quality | ✓ Watches | — | On a date… | Location… | ☐ Simple words | ☐ No motion | — | [Units] | ✓ °F and mph | ☐ °C and km/h | — | Forecast from Open-Meteo | Now from the National Weather Service (off) | Air quality from Open-Meteo and Copernicus (off)';
      const n = await page.evaluate(k => window.__board21.state.wins.get(k).menuItems.length, K);
      ok(m === MENU && n === 22, `its menu, 22 items (${n}: ${m})`);
      const icon = await page.evaluate(k => (window.__board21.state.wins.get(k).menuItems.find(i => i.label === 'Forecast from Open-Meteo') || {}).icon || '', K);
      ok(/M14 4h6v6/.test(icon), 'Forecast from Open-Meteo has the board’s open-in-a-tab icon');
      const pics = await page.evaluate(k => window.__board21.state.wins.get(k).menuItems.filter(i => i.icon).map(i => i.id).join(), K);
      ok(pics === 'date,place,open', `On a date…, Location…, and Forecast from Open-Meteo have pictures, and no other item does (${pics})`);
      for (const [where, y] of [['near the top', 0], ['near the bottom', 100000]]) {
        await page.evaluate(([k, y]) => window.__board21.setRect(k, Object.assign({}, window.__board21.state.insts.get(k).rect, { x: 300, y })), [K, y]); await page.waitForTimeout(500);
        await page.click(`.win[data-ikey="${K}"] .win-label`); await page.waitForTimeout(400);
        const r = await page.evaluate(() => { const e = document.getElementById('menu'), b = e.getBoundingClientRect(); return { cls: e.className, top: Math.round(b.top), bottom: Math.round(b.bottom), scrolls: e.scrollHeight > e.clientHeight + 1 }; });
        ok(!r.scrolls && r.top >= 0 && r.bottom <= 768 && !/\bcols\b/.test(r.cls), `${where}: the whole menu fits on a 1366 × 768 board without scrolling or two columns (${r.top} to ${r.bottom}; ${r.cls})`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      }
      const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), WXT.choose(page, 'open')]);
      ok(!!pop && /^https:\/\/open-meteo\.com\/?$/.test(pop.url()), `Forecast from Open-Meteo opens open-meteo.com in a new tab (${pop && pop.url()})`);
      if (pop) await pop.close();
      await ctx.close();
      const k = await WXT.board(browser, errors, { query: '?kiosk=yes' });
      await WXT.open(k.page);
      const km = await WXT.menuOf(k.page);
      ok(!/Forecast from Open-Meteo/.test(km) && /Now from the National Weather Service/.test(km), `in kiosk mode the menu has no link (${km.split(' | ').length} items)`);
      await k.ctx.close();
    });

    // ---- 4. The docs say what it does and what it reaches.
    await part('Docs', async () => {
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), flat = f => read(f).replace(/\s+/g, ' ');
      const readme = flat('README.md'), sdkDoc = flat('docs/WIDGET-SDK.md'), dataDoc = flat('docs/DATA-FORMAT.md'), claude = flat('CLAUDE.md');
      ok(claude.includes('Going online for updates, district apps, videos, and the weather is fine.'), 'CLAUDE.md: “Going online for updates, district apps, videos, and the weather is fine.”');
      const row = (/\| \*\*Weather\*\* \|[^|]*\|/.exec(readme) || [''])[0];
      ok(!!row && readme.indexOf(row) > readme.indexOf('| **Calculator** |') && readme.indexOf(row) < readme.indexOf('| **21Sketch** |'), `README: a Weather row after the Calculator’s (${(row || '').slice(0, 120)}…)`);
      const sec = readme.slice(readme.indexOf('## Weather'), readme.indexOf('## District apps'));
      const items = ['**Show:**', '**On a date…:**', '**Location…:**', '**Simple words:**', '**No motion:**', '**Units:**', '**Forecast from Open-Meteo:**'];
      const at = items.map(i => sec.indexOf(i));
      ok(readme.indexOf('## Weather') > readme.indexOf('## Calculator') && at.every((x, i) => x > 0 && (!i || x > at[i - 1])) && !/clear all/i.test(sec), `README: a Weather section, its menu in the menu’s order (${at.join(', ')})`);
      ok(readme.includes('connect-src https://api.open-meteo.com https://air-quality-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com https://api.weather.gov') &&
        readme.includes('Open-Meteo allows 10,000 calls a day from each Internet address. A window showing all day uses about 18. Past that, Weather uses the National Weather Service\'s forecast.'),
        'README For IT: the five sites a CSP needs for its page, and Open-Meteo’s daily limit');
      ok(dataDoc.includes('`{ saved: { at, place, days, wear } }`') && dataDoc.includes('`{ place: { id, name, region, country, lat, lon, tz }, units, hide, simple, still, date }`') &&
        dataDoc.indexOf('Weather (`weather`) saves') > dataDoc.indexOf('The Clock (`clock`)'), 'docs/DATA-FORMAT.md gives its content and its config, after the Clock’s');
      const tiles = JSON.parse(read('docs/teacher-guide/tiles.json')), t = tiles.find(x => x.id === 'weather');
      const reg = (() => { const box = { self: {} }; require('vm').runInNewContext(read('widgets/registry.js'), box); return box.self.BOARD21_WIDGETS.find(w => w.id === 'weather'); })();
      ok(!!t && !!reg && ['name', 'color', 'icon', 'description'].every(k => t[k] === reg[k]) && tiles.indexOf(t) === tiles.findIndex(x => x.id === 'calculator') + 1, 'the Teacher Guide’s tiles.json has Weather as the registry has it, after the Calculator');
      const guide = read('docs/teacher-guide/page-src.html'), i = guide.indexOf('id="w-weather"'), card = i < 0 ? '' : guide.slice(i, guide.indexOf('</article>', i));
      ok(i > 0 && guide.includes('{{tile:weather}}') && ['Coldest below 10°F', 'Coldest 10°F to 31°F', 'Coldest 32°F to 44°F', 'Coldest 45°F to 59°F', 'Coldest 60°F or more', 'Warmest 75°F or more', 'Rain 40% or more', 'Snow 40% or more'].every(r => card.includes(`<td>${r}</td>`)), 'the Teacher Guide: a Weather card with its What to wear table');
    });

    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  ['Weather: every size, light and dark, filling the board locked and unlocked, the Show list, and the unit letter', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const { K } = WXT;
    // ---- 1. Each layout at its smallest and as the mockup draws it, light and dark, then filling the board unlocked and
    // locked (the corner clock on, so every corner mark shows), with the parts spec §5.1 gives each.
    await part('Sizes', async () => {
      const { ctx, page } = await WXT.board(browser, errors, { opts: { viewport: { width: 1680, height: 1000 } } });
      await WXT.open(page);
      await setCornerClock(page, 'on');
      const WANT = {
        s: x => x.hero && !x.days && !x.wear && !x.hourly && !x.sun,
        m: x => x.hero && x.days === 5 && x.wear === 'line' && !x.sun && !x.hourly,
        l: x => x.hero && x.feels && x.windLine && x.airLine && x.days === 7 && x.wear === 'card' && x.sun && x.moonline && !x.hourly && !x.wind,
        xl: x => x.hero && x.hourly && x.wear === 'card' && x.days === 7 && x.sun && x.wind && x.moon && x.air };
      const SIZES = [['s', 'Small at its smallest', 260, 220], ['s', 'Small', 340, 260], ['m', 'Medium at its smallest', 380, 280], ['m', 'Medium', 480, 360], ['l', 'Large at its smallest', 760, 480], ['l', 'Large', 900, 560], ['xl', 'Fill the board’s layout', 1600, 860]];
      const bad = [], seen = [], ref = [];
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        for (const [L, label, w, h] of SIZES) {
          await WXT.size(page, w, h);
          const p = await WXT.problems(page, false), x = await WXT.parts(page);
          if (L === 'l' && w === 900) ref.push(`${theme}: ` + await WXT.F(page, () => { const wx = document.querySelector('#app .wx'); return (['tight', 'tighter', 'tightest'].filter(c => wx.classList.contains(c)).join('+') || 'no step') + ', ' + (parseFloat(getComputedStyle(wx.querySelector('.temp')).fontSize) / parseFloat(getComputedStyle(wx).fontSize)).toFixed(2) + 'em'; }));
          if (!x || x.layout !== L) p.list.push(`the layout is ${x && x.layout}, not ${L}`);
          else if (!WANT[L](x)) p.list.push(`its parts: ${JSON.stringify(x)}`);
          if (x && x.gaps.length) p.list.push(...x.gaps);
          (p.list.length ? bad : seen).push(`${theme}, ${label} (${p.size})${p.list.length ? ': ' + p.list.join(', ') : ''}`);
          await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + `weather-${theme}-${label.replace(/\W+/g, '-')}.png` });
        }
        for (const [vw, vh, L] of [[1680, 1000, 'xl'], [1100, 640, 'xl'], [1000, 640, 'l']]) for (const locked of [false, true]) {
          await page.setViewportSize({ width: vw, height: vh }); await page.waitForTimeout(300);
          await page.evaluate(k => window.__board21.setMaximized(k, true), K); await page.waitForTimeout(600);
          if (locked) { await lockBoard(page, 'widgets'); await page.waitForTimeout(600); }
          const p = await WXT.problems(page, true), x = await WXT.parts(page), want = locked ? 5 : 3;
          if (!x || x.layout !== L) p.list.push(`the layout is ${x && x.layout}, not ${L}`);
          if (p.marks < want) p.list.push(`only ${p.marks} of the board’s ${want} corner marks show`);
          (p.list.length ? bad : seen).push(`${theme}, filling a ${vw} × ${vh} board${locked ? ', locked' : ''} (${p.size})${p.list.length ? ': ' + p.list.join(', ') : ''}`);
          await page.screenshot({ path: OUT + `weather-${theme}-fill-${vw}${locked ? '-locked' : ''}.png` });
          if (locked) await unlockBoard(page);
          await page.evaluate(k => window.__board21.setMaximized(k, false), K); await page.waitForTimeout(300);
        }
        await page.setViewportSize({ width: 1680, height: 1000 }); await page.waitForTimeout(300);
      }
      ok(!bad.length && seen.length === 26, `Small, Medium, Large, and Fill the board, each at its smallest too, light and dark, and filling the board unlocked and locked: each layout’s parts, no text under 14 px, nothing cut off or out of its card, no gap, nothing under the board’s corner marks (${bad.join(' | ') || seen.length + ' layouts'})`);
      // (A card 2 px into its own padding takes no step, so Large's own size looks as the mockup does.)
      ok(ref.length === 2 && ref.every(r => /: no step, 5\.40em$/.test(r)), `at 900 × 560, Large’s own size, it draws the mockup’s sizes: no step, and the temperature at 5.4em (${ref.join(' | ')})`);
      await ctx.close();
    });

    // ---- 2. The Show list hides each part at Medium, Large, and Fill the board, with no gap and no overflow; alone, and
    // in the mockup's Round 3 combinations. The unit letter is on the big temperature only.
    await part('Show list', async () => {
      const { ctx, page } = await WXT.board(browser, errors, { opts: { viewport: { width: 1680, height: 1000 } } });
      await WXT.open(page);
      const KEYS = ['hourly', 'days', 'wear', 'sun', 'moon', 'wind', 'air'];
      const GONE = { hourly: x => !x.hourly, days: x => !x.days, wear: x => !x.wear, sun: x => !x.sun, moon: x => !x.moon && !x.moonline, wind: x => !x.wind && !x.windLine, air: x => !x.air && !x.airLine };
      const COMBOS = [['wear'], ['sun', 'moon'], ['hourly', 'wind'], ['hourly', 'wear', 'sun', 'wind', 'air'], ['days'], ['days', 'hourly', 'wear'], ['days', 'wear', 'sun', 'moon']];
      const bad = [], seen = [], units = [];
      for (const [L, w, h] of [['m', 480, 360], ['l', 760, 480], ['l', 900, 560], ['xl', 1600, 860]]) {
        await WXT.size(page, w, h);
        for (const hide of KEYS.map(k => [k]).concat(COMBOS)) {
          const c = Object.assign({}, await WXT.conf(page), { hide });
          await WXT.put(page, 'config', c); await page.waitForTimeout(250);
          const p = await WXT.problems(page, false), x = await WXT.parts(page);
          if (!x || x.layout !== L) p.list.push(`layout ${x && x.layout}`);
          else { for (const k of hide) if (!GONE[k](x)) p.list.push(`${k} still shows`); p.list.push(...x.gaps); if (!x.hero) p.list.push('no Now'); }
          if (x && !(x.units.length === 1 && x.units[0] === 'F:temp')) units.push(`${L} without ${hide.join(', ')}: ${x.units.join(', ')}`);
          (p.list.length ? bad : seen).push(`${L} (${w} × ${h}) without ${hide.join(', ')}${p.list.length ? ': ' + p.list.join(', ') : ''}`);
          if ((L !== 'm' || hide.length > 1) && w !== 760) await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + `weather-hide-${L}-${hide.join('-')}.png` });
        }
      }
      ok(!bad.length && seen.length === 56, `each Show item hides its part at Medium, Large (at its smallest too), and Fill the board, alone and in the mockup’s combinations, with no gap, no overflow, and no text over text (${bad.join(' | ') || seen.length + ' layouts'})`);
      ok(!units.length, `the dim F is on the big temperature and nowhere else (${units.join(' | ') || 'every layout'})`);
      // Medium without the 7 days: the hourly forecast takes their place. Without both and What to wear, Now fills it.
      await WXT.size(page, 480, 360);
      await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { hide: ['days'] })); await page.waitForTimeout(250);
      let x = await WXT.parts(page);
      ok(!!x && x.hourly && !x.days, 'Medium without the 7 days shows the hourly forecast in their place');
      // The Now view (tap the temperature) with wind hidden, and the unit letter there.
      await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { hide: ['wind'] })); await page.waitForTimeout(250);
      await WXT.wf(page).locator('#app .hero[data-go="now"]').click(); await page.waitForTimeout(300);
      const now = await WXT.F(page, () => ({ title: (document.querySelector('#app .bar2 .title') || {}).textContent, wind: !!document.querySelector('#app .windc'), units: [...document.querySelectorAll('#app .unit')].map(u => u.textContent + (u.closest('.temp') ? ':temp' : '')), text: document.getElementById('app').innerText }));
      ok(now.title === 'Now' && !now.wind && now.units.join() === 'F:temp' && /Feels like/.test(now.text) && /Air quality/.test(now.text) && /High, low, and air quality from Open-Meteo/.test(now.text), `the Now view follows the Show list: no wind; feels like and air quality; the F on its temperature (${JSON.stringify(now).slice(0, 300)})`);
      const hl = await WXT.F(page, () => document.querySelector('#app .dnow .hl').textContent.replace(/\u00a0/g, '+'));
      ok(hl === 'High 40°++ Low 25°', `its high and low, three spaces apart as in Large: “High 40°   Low 25°” (${hl})`);
      { const pr = await WXT.problems(page, false); ok(!pr.list.length, `the Now view fits (${pr.list.join(', ') || pr.size})`); }
      await WXT.wf(page).locator('#app [data-go="main"]').first().click(); await page.waitForTimeout(300);
      // Watches hide the watch band; a warning still shows.
      await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { hide: [] }));
      await ctx.close();
      for (const [file, hide, want] of [['nws-alerts-midland.json', [], /^watch: Freeze Watch/], ['nws-alerts-midland.json', ['watches'], /^$/], ['nws-alerts-fortworth.json', ['watches'], /^warn: Freeze Warning/]]) {
        const b = await WXT.board(browser, errors, { more: { 'api.weather.gov/alerts/active': file } });
        await WXT.open(b.page);
        if (hide.length) { await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide })); await b.page.waitForTimeout(300); }
        const got = await WXT.F(b.page, () => { const b = document.querySelector('#app .band'); return b ? b.className.replace('band ', '') + ': ' + b.textContent.replace(/\u00a0/g, ' ').trim() : ''; });
        ok(want.test(got), `${file.includes('midland') ? 'a Freeze Watch' : 'a Freeze Warning'}${hide.length ? ', with Watches unticked' : ''}: ${want.source === '^$' ? 'no band' : 'its band shows'} (${got || 'no band'})`);
        await b.ctx.close();
      }
    });

    // ---- 3. Filling the board at a larger board Size (Settings › Size of windows and menus), locked and unlocked, with
    // and without a saved forecast offline: the parts scale to the height the corner strips leave.
    await part('Board Size', async () => {
      const b = await WXT.board(browser, errors, { at: '2026-12-01T11:50:00-06:00' });
      b.wx.shift = 8 * 86400;
      await WXT.open(b.page);
      const bad = [], seen = [];
      for (const off of [false, true]) {
        if (off) { await eventually(async () => !!((await WXT.data(b.page)) || {}).saved); await b.ctx.setOffline(true); await b.page.waitForTimeout(400); }
        for (const [vw, vh] of [[1366, 768], [1280, 800], [1920, 1080]]) for (const scale of [1.5, 2]) for (const locked of [false, true]) {
          await b.page.setViewportSize({ width: vw, height: vh }); await b.page.waitForTimeout(200);
          await b.page.evaluate(s => window.__board21.setBoardScale(s), scale); await b.page.waitForTimeout(300);
          await b.page.evaluate(k => window.__board21.setMaximized(k, true), K); await b.page.waitForTimeout(700);
          if (locked) { await lockBoard(b.page, 'widgets'); await b.page.waitForTimeout(700); }
          // (Online, with the 7-day forecast hidden too, and the small cards: Now has a taller row to fill.)
          for (const hide of off ? [[]] : [[], ['days'], ['sun', 'moon', 'wind', 'air']]) {
            if (hide.length) { await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide })); await b.page.waitForTimeout(300); }
            const p = await WXT.problems(b.page, true), x = await WXT.parts(b.page), list = p.list.concat(x ? x.gaps : ['nothing drawn']);
            (list.length ? bad : seen).push(`${off ? 'offline, ' : ''}${vw} × ${vh} at Size ${scale}${locked ? ', locked' : ''}${hide.length ? ' without ' + hide.join(', ') : ''} (${p.size}, ${x && x.layout})${list.length ? ': ' + list.join(', ') : ''}`);
          }
          if (!off) { await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide: [] })); await b.page.waitForTimeout(300); }
          if (scale === 1.5 && vw === 1366 && !locked) await b.page.screenshot({ path: OUT + `weather-fill-size-1.5${off ? '-offline' : ''}.png` });
          if (locked) await unlockBoard(b.page);
          await b.page.evaluate(k => window.__board21.setMaximized(k, false), K); await b.page.waitForTimeout(200);
        }
      }
      ok(!bad.length && seen.length === 48, `filling the board at Size 1.5 and 2, on 1366 × 768, 1280 × 800, and 1920 × 1080, locked and unlocked, online and offline, and online without the 7-day forecast or the small cards: everything fits, with no text over text, clear of the corner marks (${bad.join(' | ') || seen.length + ' layouts'})`);
      await b.ctx.close();
    });

    // ---- 4. Every height of each layout, with no band, a warning, and offline: the spacing closes up as it must.
    await part('Heights', async () => {
      const bad = []; let n = 0;
      const H = { m: [[480, 759], [280, 305, 330, 355, 380, 405, 430, 455, 479]], l: [[900, 1299], [480, 520, 540, 580, 620, 680, 759]], xl: [[1300, 1600], [760, 800, 860, 900]] };
      for (const state of ['plain', 'warning', 'offline']) {
        const b = await WXT.board(browser, errors, { opts: { viewport: { width: 1680, height: 1000 } }, more: state === 'warning' ? { 'api.weather.gov/alerts/active': 'nws-alerts-fortworth.json' } : {} });
        await WXT.open(b.page);
        if (state === 'offline') { await eventually(async () => !!((await WXT.data(b.page)) || {}).saved); await b.ctx.setOffline(true); await b.page.waitForTimeout(400); }
        for (const [L, [ws, hs]] of Object.entries(H)) for (const w of ws) for (const h of hs) {
          await WXT.size(b.page, w, h); n++;
          const p = await WXT.problems(b.page, false), x = await WXT.parts(b.page), list = p.list.concat(x ? x.gaps : ['nothing drawn']);
          if (x && x.layout !== L) list.push(`layout ${x.layout}`);
          if (list.length) bad.push(`${state}, ${w} × ${h}: ${list.join(', ')}`);
        }
        await b.ctx.close();
      }
      ok(!bad.length && n === 120, `Medium, Large, and Fill the board at every height, with no band, a warning, and offline: nothing runs out of its card (${bad.join(' | ') || n + ' sizes'})`);
    });

    // ---- 5. The views at their smallest: Now, and On a date with its chart. Words in a picture count too.
    await part('Smallest views', async () => {
      const b = await WXT.board(browser, errors, { opts: { viewport: { width: 1680, height: 1000 } } });
      await WXT.open(b.page);
      const bad = [], seen = [];
      // The compass: its size, its letters, and how far W and E keep from the ticks beside them (x 14 and 86 of 100).
      const compass = () => WXT.F(b.page, () => {
        const c = [...document.querySelectorAll('#app svg.compass')].find(e => e.getBoundingClientRect().width > 0), g = c && c.querySelector('.nesw');
        if (!g) return null;
        const t = [...g.querySelectorAll('text')], box = n => t.find(e => e.textContent === n).getBBox(), W = box('W'), E = box('E');
        return { px: Math.round(c.getBoundingClientRect().width), letters: getComputedStyle(g).display !== 'none', w: +(W.x - 14).toFixed(1), e: +(86 - E.x - E.width).toFixed(1) };
      });
      let now480 = null;
      for (const [w, h] of [[380, 280], [480, 360], [600, 420], [900, 560]]) {
        await WXT.size(b.page, w, h);
        await WXT.wf(b.page).locator('#app .hero[data-go="now"]').click(); await b.page.waitForTimeout(250);
        const p = await WXT.problems(b.page, false);
        (p.list.length ? bad : seen).push(`the Now view at ${w} × ${h}${p.list.length ? ': ' + p.list.join(', ') : ''}`);
        if (w === 380) await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-now-380x280.png' });
        if (w === 480) now480 = Object.assign({}, await compass(), { temp: await WXT.F(b.page, () => Math.round(parseFloat(getComputedStyle(document.querySelector('#app .dnow .temp')).fontSize))) });
        await WXT.wf(b.page).locator('#app [data-go="main"]').first().click(); await b.page.waitForTimeout(200);
      }
      // At its default size the Now view draws as the mockup does: a 99 px compass with its letters, and a 58 px temperature.
      ok(!!now480 && now480.px >= 95 && now480.letters && now480.temp >= 56, `the Now view at 480 × 360 keeps the mockup’s compass, with N, E, S, and W, and its temperature (${JSON.stringify(now480)})`);
      // W and E clear of their ticks as the letters grow to 14 px: Fill the board's wind card, and the Now view without air quality.
      const near = [];
      for (const [w, h, v] of [[1300, 760], [1500, 860], [420, 320, 'now'], [480, 360, 'now']]) {
        await WXT.size(b.page, w, h);
        if (v) { await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide: ['air'] })); await b.page.waitForTimeout(250); await WXT.wf(b.page).locator('#app .hero[data-go="now"]').click(); await b.page.waitForTimeout(250); }
        const c = await compass();
        if (!c || !c.letters || c.w < 0.5 || c.e < 0.5) near.push(`${w} × ${h}${v ? ', the Now view without air quality' : ''}: ${JSON.stringify(c)}`);
        else seen.push(`the compass at ${w} × ${h}: ${JSON.stringify(c)}`);
        if (v) { await WXT.wf(b.page).locator('#app [data-go="main"]').first().click(); await b.page.waitForTimeout(200); await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide: [] })); await b.page.waitForTimeout(250); }
      }
      ok(!near.length, `the compass’s W and E stay clear of the ticks beside them as they grow to 14 px (${near.join(' | ') || 'all clear'})`);
      await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { date: '2019-01-30' })); await b.page.waitForTimeout(800);
      for (const [w, h] of [[260, 220], [380, 280], [480, 360], [760, 480], [900, 560]]) {
        await WXT.size(b.page, w, h);
        for (const end of [false, true]) {
          await WXT.F(b.page, end => { const s = document.querySelector('#app .dscroll'); if (s) s.scrollTop = end ? s.scrollHeight : 0; }, end); await b.page.waitForTimeout(150);
          const p = await WXT.problems(b.page, false), c = await WXT.F(b.page, () => { const e = document.querySelector('#app .chart'); return e ? Math.round(e.getBoundingClientRect().height) : 0; });
          if (c < 100) p.list.push(`its chart is ${c} px tall`);
          (p.list.length ? bad : seen).push(`On a date at ${w} × ${h}${end ? ', scrolled to the chart' : ''}${p.list.length ? ': ' + p.list.join(', ') : ''}`);
        }
        if (w === 480) await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-on-a-date-480x360.png' });
      }
      ok(!bad.length, `the Now view and On a date at their smallest: every word 14 px or more, in the compass and the chart too, nothing cut off, and the chart over 100 px tall (${bad.join(' | ') || seen.length + ' views'})`);
      await WXT.size(b.page, 480, 360);
      const bar = await WXT.F(b.page, () => document.querySelector('#app .pick').innerText.trim());
      ok(bar === 'Wed, January 30, 2019', `at 480 × 360 the bar has the whole date (${bar})`);
      await b.ctx.close();
    });

    // ---- 6. A long warning at Medium's smallest, a band at its default size, and the 7-day forecast hidden.
    await part('Long warnings', async () => {
      const fw = WX_FIX('nws-alerts-fortworth.json'), bad = [];
      for (const ev of ['Severe Thunderstorm Warning', 'Extreme Cold Warning', 'Freeze Warning']) {
        const x = JSON.parse(JSON.stringify(fw)); x.features[0].properties.event = ev;
        const b = await WXT.board(browser, errors, { more: { 'api.weather.gov/alerts/active': { json: x } } });
        await WXT.open(b.page);
        for (const [w, h] of [[380, 280], [420, 300], [480, 360]]) for (const hide of [[], ['days'], ['days', 'wear']]) {
          await WXT.size(b.page, w, h);
          await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide })); await b.page.waitForTimeout(250);
          const p = await WXT.problems(b.page, false), x = await WXT.parts(b.page), band = await WXT.F(b.page, () => { const e = document.querySelector('#app .band'); return e ? { t: e.innerText.replace(/\s+/g, ' ').trim(), h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) } : null; });
          const list = p.list.concat(x ? x.gaps : []);
          if (!band || !band.t.startsWith(ev)) list.push(`the band reads “${band && band.t}”`);
          else if (band.h > band.fs * 2.4) list.push(`the band takes two lines (${Math.round(band.h)} px)`);
          if (list.length) bad.push(`${ev} at ${w} × ${h}${hide.length ? ' without ' + hide.join(', ') : ''}: ${list.join(', ')}`);
          if (ev === 'Severe Thunderstorm Warning' && w === 380 && !hide.length) await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-long-warning-380x280.png' });
        }
        await b.ctx.close();
      }
      ok(!bad.length, `a long warning at Medium’s smallest sizes, with the 7-day forecast and What to wear hidden too: one line, and everything fits (${bad.join(' | ') || 'all'})`);
      // At the default size a band leaves the week its pictures.
      const b = await WXT.board(browser, errors, { more: { 'api.weather.gov/alerts/active': 'nws-alerts-fortworth.json' } });
      await WXT.open(b.page);
      const ic = await WXT.F(b.page, () => Math.round(document.querySelector('#app .week svg').getBoundingClientRect().width));
      ok(ic >= 24, `at 480 × 360 with a warning, the week’s pictures stay ${ic} px wide, 24 or more`);
      await b.ctx.close();
    });

    // ---- 7. Every word in Weather is in Inter, the Location sheet too.
    await part('Every word in Inter', async () => {
      const { ctx, page } = await WXT.board(browser, errors, { opts: { viewport: { width: 1680, height: 1000 } } });
      await WXT.open(page);
      await WXT.choose(page, 'place');
      const off = await WXT.F(page, () => { const out = new Set(), inter = e => /^"?Inter"?,/.test(getComputedStyle(e).fontFamily), walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = walk.nextNode());) { const e = n.parentElement; if (e && /[A-Za-z0-9]/.test(n.textContent) && e.getBoundingClientRect().width && !inter(e)) out.add(e.tagName.toLowerCase() + ' “' + n.textContent.trim().slice(0, 20) + '”'); }
        const i = document.querySelector('#sheet input'); if (i && !inter(i)) out.add('the search field');
        return [...out]; });
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      ok(!off.length, `every word in Weather is in Inter, the Location sheet too (${off.slice(0, 5).join(', ') || 'all'})`);
      await ctx.close();
    });

    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  ['Weather: What to wear and school days, °C, the sources, and watches and warnings', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const { K, F, text } = WXT;
    const at = s => Date.parse(s);
    // ---- 1. Which day What to wear shows, from the district calendar, and what it says: the widget's own functions.
    await part('School days and clothes', async () => {
      const { ctx, page } = await WXT.board(browser, errors);
      await WXT.open(page);
      const W = (fn, arg) => F(page, ([fn, arg]) => { const W = window.B21Weather; return W ? W[fn](...arg) : null; }, [fn, arg]);
      // (What it opens on, then the other button: "only" when today has no school.)
      const plan = async t => { const p = await W('plan', [at(t)]); return !p ? null : !p.today ? 'only ' + p.label : p.show === 'today' ? 'Today, then ' + p.label : p.label + ', then Today'; };
      const CASES = [['2026-11-20T13:59:00-06:00', 'Today, then Mon, Nov 30'], ['2026-11-20T14:00:00-06:00', 'Mon, Nov 30, then Today'], ['2026-11-23T09:00:00-06:00', 'only Mon, Nov 30'],
        ['2026-12-18T14:30:00-06:00', 'Tue, Jan 5, then Today'], ['2027-03-19T15:00:00-05:00', 'Mon, Mar 29, then Today'], ['2027-04-05T09:00:00-05:00', 'Today, then Wed'],
        ['2027-05-27T09:00:00-05:00', 'Today, then Fri'], ['2027-05-28T14:30:00-05:00', 'Tue, then Today'], ['2027-01-15T09:00:00-06:00', 'Today, then Tue']];
      const got = [];
      for (const [t, want] of CASES) { const g = await plan(t); if (g !== want) got.push(`${t}: ${g}, not ${want}`); }
      ok(!got.length, `the next school day: Fri Nov 20 before 2 PM opens on Today with Mon, Nov 30; from 2 PM on Mon, Nov 30; Nov 23 only Mon, Nov 30; Dec 18 after 2 PM Jan 5; Mar 19 Mar 29; Apr 5 Apr 7; May 27 May 28; May 28 after 2 PM Jun 1, a weekday after the calendar; Fri Jan 15 Tue Jan 19 (${got.join(' | ') || CASES.length + ' cases'})`);
      const dates = await F(page, ts => ts.map(t => { const p = window.B21Weather.plan(Date.parse(t)); return p.next; }), CASES.map(c => c[0]));
      ok(dates.join() === '2026-11-30,2026-11-30,2026-11-30,2027-01-05,2027-03-29,2027-04-07,2027-05-28,2027-06-01,2027-01-19', `and its dates (${dates.join()})`);
      const labels = await F(page, () => [window.B21Weather.label('2026-11-24', '2026-11-23'), window.B21Weather.label('2026-11-29', '2026-11-23'), window.B21Weather.label('2026-11-30', '2026-11-23')]);
      ok(labels.join(' | ') === 'Tue | Sun | Mon, Nov 30', `its name: “Tue” within 6 days, “Mon, Nov 30” from 7 (${labels.join(' | ')})`);
      const tier = f => F(page, f => { const a = window.B21Weather.advise([{ temp: f, feels: f, pop: 0 }]); return a.advice + ' ' + a.items.join(','); }, f);
      const TIERS = [[9.9, 'Dress for very cold weather. coat,hat,gloves,scarf'], [10, 'Dress for cold weather. coat,hat,gloves'], [31.9, 'Dress for cold weather. coat,hat,gloves'], [32, 'Dress for chilly weather. coat'],
        [44.9, 'Dress for chilly weather. coat'], [45, 'Dress for cool weather. jacket'], [59.9, 'Dress for cool weather. jacket'], [60, 'Dress for mild weather. tshirt']];
      const tiers = [];
      for (const [f, want] of TIERS) { const g = await tier(f); if (g !== want) tiers.push(`${f}: ${g}`); }
      ok(!tiers.length, `each row at its edges: 9.9 very cold, 10 cold, 31.9 cold, 32 chilly, 44.9 chilly, 45 cool, 59.9 cool, 60 mild (${tiers.join(' | ') || 'all'})`);
      const mix = await F(page, () => { const A = h => { const a = window.B21Weather.advise(h); return a.advice + ' ' + a.items.join(','); };
        return [A([{ temp: 60, feels: 60, pop: 0 }, { temp: 75, feels: 75, pop: 0 }]), A([{ temp: 50, feels: 50, pop: 0 }, { temp: 80, feels: 80, pop: 0 }]),
          A([{ temp: 40, feels: 35, pop: 40 }]), A([{ temp: 32, feels: 25, pop: 40 }]), A([{ temp: 40, feels: 35, pop: 39 }])]; });
      ok(mix[0] === 'Dress for warm weather. tshirt,shorts' && mix[1] === 'Dress for cool weather. jacket', `warm only when the coldest is 60° or more: 60 and 75 warm, 50 and 80 cool (${mix[0]} | ${mix[1]})`);
      ok(mix[2] === 'Dress for chilly weather. Bring a rain jacket. coat,rain' && mix[3] === 'Dress for cold weather. Wear boots. coat,hat,gloves,boots' && mix[4] === 'Dress for chilly weather. coat',
        `rain at 40% above 32°F adds a rain jacket, snow at 40% at 32°F or below adds boots (${mix.slice(2).join(' | ')})`);
      const hours = await F(page, () => [window.B21Weather.hours('2027-02-18').join('–'), window.B21Weather.hours('2026-12-01').join('–')]);
      ok(hours.join(' | ') === '8–11 | 8–15', `a half day counts 8 AM to 11 AM, a full day 8 AM to 3 PM (${hours.join(' | ')})`);
      await ctx.close();
      // On Dec 18 after 2 PM (the fixtures moved 25 days), Jan 5 is past the forecast.
      const late = await WXT.board(browser, errors, { at: '2026-12-18T14:30:00-06:00' });
      late.wx.shift = 25 * 86400;
      await WXT.open(late.page); await WXT.size(late.page, 900, 560);
      const lt = await text(late.page);
      ok(/Tue, Jan 5/.test(lt) && /Its forecast isn’t out yet\./.test(lt) && !await WXT.F(late.page, () => !!document.querySelector('#app .wear .items figure')), `past the forecast: Tue, Jan 5, “Its forecast isn’t out yet.”, and no clothes (${lt.slice(0, 200)})`);
      await late.ctx.close();
      // On a school day (Tue Dec 1, the fixtures moved 8 days), Large: Today, with the next school day a tap away.
      const sd = await WXT.board(browser, errors, { at: '2026-12-01T11:50:00-06:00' });
      sd.wx.shift = 8 * 86400;
      await WXT.open(sd.page); await WXT.size(sd.page, 900, 560);
      const w1 = await F(sd.page, () => ({ b: [...document.querySelectorAll('#app .wear .tg b')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(','), advice: document.querySelector('#app .wear .advice').textContent, note: document.querySelector('#app .wear .note').textContent.replace(/\u00a0/g, ' ') }));
      ok(w1.b === 'Today*,Wed' && w1.advice === 'Dress for cold weather.' && w1.note === 'Feels like 31° now. High of 40° at 2 PM.', `a school day before 2 PM opens on Today, with Wed a tap away (${JSON.stringify(w1)})`);
      await WXT.wf(sd.page).locator('#app .wear [data-wear="next"]').click(); await sd.page.waitForTimeout(300);
      const w2 = await F(sd.page, () => ({ b: [...document.querySelectorAll('#app .wear .tg b')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(','), advice: document.querySelector('#app .wear .advice').textContent, note: document.querySelector('#app .wear .note').textContent.replace(/\u00a0/g, ' ') }));
      ok(w2.b === 'Today,Wed*' && w2.advice === 'Dress for cold weather.' && w2.note === 'Feels like 18° at 8 AM. High of 40° at 2 PM.', `tapping Wed shows its advice and its note (${JSON.stringify(w2)})`);
      await sd.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-school-day.png' });
      await sd.ctx.close();
    });

    // ---- 2. °C from the menu, rounded once from the sources' numbers: never −0. km/h.
    await part('°C', async () => {
      const { ctx, page } = await WXT.board(browser, errors);
      await WXT.open(page);
      await WXT.choose(page, 'units:c');
      const m = await F(page, () => ({ temp: document.querySelector('#app .temp').textContent, hl: document.querySelector('#app .hero .hl').textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ') }));
      ok(m.temp === '4°C' && m.hl === 'H 5° L −4°', `°C at Medium: 39.2°F is 4°C, H 40.4 is 5°, L 25.0 is −4° (${JSON.stringify(m)})`);
      await WXT.size(page, 900, 560);
      const l = await F(page, () => [...document.querySelectorAll('#app .hero .more')].map(e => e.textContent.replace(/\u00a0/g, ' ').trim()));
      ok(l[0] === 'Feels like 0° · Wind 22 km/h NW', `Large: feels like 31.2°F shows 0°, not −0°, and wind 13.8 mph shows 22 km/h (${l.join(' | ')})`);
      ok(((await WXT.conf(page)) || {}).units === 'c', '°C is saved with the window');
      await ctx.close();
    });

    // ---- 3. Where Now and the forecast come from.
    await part('Sources', async () => {
      // A report more than 90 minutes old: Now from Open-Meteo's current, labeled.
      let b = await WXT.board(browser, errors);
      b.wx.later['api.weather.gov/stations/KPWK/observations'] = -2 * 3600;
      await WXT.open(b.page);
      let s = await F(b.page, () => [...document.querySelectorAll('#app .hero .src')].map(e => e.textContent.replace(/\u00a0/g, ' ')).join(' | ') + ' / ' + document.querySelector('#app .temp').textContent);
      ok(/^From Open-Meteo/.test(s) && /\/ 39°F$/.test(s), `a report over 90 minutes old: Now from Open-Meteo’s current, labeled (${s})`);
      await WXT.size(b.page, 900, 560);
      s = await F(b.page, () => document.querySelector('#app .hero .src').textContent.replace(/\u00a0/g, ' '));
      ok(s === 'From Open-Meteo, 11:45 AM', `Large adds its time (${s})`);
      await b.ctx.close();
      // No sky text in any of the 12 reports: the sky of the forecast's current hour (11 AM, mostly sunny).
      const obs = WX_FIX('nws-observations-KPWK.json'); obs.features.forEach(f => { f.properties.textDescription = ''; });
      b = await WXT.board(browser, errors, { more: { 'api.weather.gov/stations/KPWK/observations': { json: obs } } });
      await WXT.open(b.page);
      s = await F(b.page, () => document.querySelector('#app .hero .cond').textContent.trim());
      ok(s === 'Mostly sunny', `no sky in the reports: the sky of the forecast’s current hour (${s})`);
      await b.ctx.close();
      // Open-Meteo turns the school away (429): the National Weather Service's forecast, until Retry-After has passed.
      b = await WXT.board(browser, errors, { clock: 'install', more: { 'api.open-meteo.com/v1/forecast': { status: 429, headers: { 'retry-after': '5400', 'access-control-expose-headers': 'retry-after' }, json: { error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' } } } });
      await WXT.open(b.page);
      await b.page.clock.runFor(15000);
      s = await F(b.page, () => [...document.querySelectorAll('#app .week .col')].map(c => ['.n', '.h', '.l'].map(k => c.querySelector(k).textContent).join(' ')).join(' | '));
      ok(s === 'Today 42° 25° | Tue 43° 31° | Wed 45° 36° | Thu 44° 36° | Fri 46° 35°', `a 429: the week from the National Weather Service (${s})`);
      await WXT.size(b.page, 900, 560);
      s = await F(b.page, () => (document.querySelector('#app .hero .foot') || {}).textContent.replace(/\u00a0/g, ' '));
      ok(/^Forecast from the National Weather Service, \d/.test(s), `its credit: “${s}”`);
      const om = () => b.wx.count(/api\.open-meteo\.com\/v1\/forecast/), nws = () => b.wx.count(/gridpoints\/LOT\/65,84\/forecast$/);
      const was = [om(), nws()];
      await WXT.later(b.page, 61);
      const mid = [om(), nws()];
      await WXT.later(b.page, 60);
      const end = [om(), nws()];
      ok(mid[0] === was[0] && mid[1] > was[1] && end[0] > mid[0], `it asks Open-Meteo again only once Retry-After (1.5 hours) has passed, and the Weather Service meanwhile (Open-Meteo ${was[0]}, ${mid[0]}, ${end[0]}; the Weather Service ${was[1]}, ${mid[1]}, ${end[1]})`);
      await b.ctx.close();
      // A school day (Tue Dec 1, 11:50 AM) with Open-Meteo turning the school away: the Weather Service's hours start at
      // this hour, and the school hours still ahead are enough for Today.
      const T429 = { 'api.open-meteo.com/v1/forecast': { status: 429, headers: { 'retry-after': '5400', 'access-control-expose-headers': 'retry-after' }, json: { error: true } } };
      b = await WXT.board(browser, errors, { at: '2026-12-01T11:50:00-06:00', more: T429 });
      b.wx.shift = 8 * 86400;
      await WXT.open(b.page); await WXT.size(b.page, 900, 560); await b.page.waitForTimeout(500);
      const wl = await F(b.page, () => ({ b: [...document.querySelectorAll('#app .wear .tg b')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')).join(','), advice: (document.querySelector('#app .wear .advice') || {}).textContent, items: [...document.querySelectorAll('#app .wear [data-item]')].map(e => e.dataset.item).join() }));
      ok(wl.b === 'Today*,Wed' && wl.advice === 'Dress for cold weather.' && wl.items === 'coat,hat,gloves', `a school day on the Weather Service’s forecast: Today says “Dress for cold weather.” with a coat, hat, and gloves (${JSON.stringify(wl)})`);
      await WXT.size(b.page, 480, 360);
      const ml = await F(b.page, () => (document.querySelector('#app .wl .says') || {}).textContent);
      ok(ml === 'Dress for cold weather.', `and so does Medium’s line (${ml})`);
      const sw = ((await WXT.data(b.page)) || { saved: { wear: {} } }).saved.wear['2026-12-01'];
      ok(!!sw && sw.advice === 'Dress for cold weather.', `and it saves that, not “Its forecast isn’t out yet.” (${JSON.stringify(sw)})`);
      await b.ctx.close();
      // Honolulu: PHNL's newest temperature is 2 hours old, so Now is Open-Meteo's, and times are Hawaii's.
      b = await WXT.board(browser, errors);
      await WXT.open(b.page);
      await WXT.put(b.page, 'config', { place: { id: 5856195, name: 'Honolulu', region: 'Hawaii', country: 'United States', lat: 21.30694, lon: -157.85834, tz: 'Pacific/Honolulu' }, units: 'f', hide: [], simple: false, still: false, date: null });
      await WXT.size(b.page, 900, 560); await WXT.drawn(b.page); await b.page.waitForTimeout(1200);
      s = await F(b.page, () => ({ place: document.querySelector('#app .place').textContent, src: document.querySelector('#app .hero .src').textContent.replace(/\u00a0/g, ' '), rise: [...document.querySelectorAll('#app .sunrow b')].map(e => e.textContent.replace(/\u00a0/g, ' ')).join(' ') }));
      ok(s.place === 'Honolulu' && s.src === 'From Open-Meteo, 8 AM' && /^6:47 AM 5:4\d PM$/.test(s.rise), `Honolulu: Now from Open-Meteo, its time and sunrise in Hawaii time (${JSON.stringify(s)})`);
      ok(b.wx.asked.some(a => a.path === '/stations/PHNL/observations') && b.wx.asked.some(a => a.path === '/v1/forecast' && a.query.timezone === 'Pacific/Honolulu' && a.query.latitude === '21.30694'), 'it asked about Honolulu: its forecast, and its airport’s reports');
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-honolulu.png' });
      await b.ctx.close();
      // A place outside the U.S. (the Weather Service answers 404): no alerts, and Now from Open-Meteo.
      b = await WXT.board(browser, errors, { more: { 'api.weather.gov/points/51.5085,-0.1257': { status: 404, json: { title: 'Data Unavailable For Requested Point' } } } });
      await WXT.open(b.page);
      const n0 = b.wx.count(/alerts\/active/);
      await WXT.put(b.page, 'config', { place: { id: 2643743, name: 'London', region: 'England', country: 'United Kingdom', lat: 51.50853, lon: -0.12574, tz: 'Europe/London' }, units: 'c', hide: [], simple: false, still: false, date: null });
      await b.page.waitForTimeout(1500);
      s = await F(b.page, () => document.querySelector('#app .place').textContent + ' / ' + [...document.querySelectorAll('#app .hero .src')].map(e => e.textContent).join(' | '));
      const m = await WXT.menuOf(b.page);
      ok(/^London \/ From Open-Meteo/.test(s) && b.wx.count(/alerts\/active/) === n0 && !b.wx.asked.some(a => /stations\/.*\/observations/.test(a.path) && /London/.test(a.url)) && !/National Weather Service/.test(m),
        `outside the U.S.: Now from Open-Meteo, no alerts asked for, and no Weather Service line in the menu (${s}; ${m.split(' | ').length} items)`);
      await b.ctx.close();
    });

    // ---- 4. Watches and warnings.
    await part('Alerts', async () => {
      const band = p => F(p, () => { const b = document.querySelector('#app .band'); return b ? b.className.replace(/^band /, '') + ': ' + b.textContent.replace(/\u00a0/g, ' ').trim() : ''; });
      let b = await WXT.board(browser, errors, { more: { 'api.weather.gov/alerts/active': 'nws-alerts-fortworth.json' } });
      await WXT.open(b.page);
      let s = await band(b.page);
      ok(s === 'warn: Freeze Warning Tue 11 PM to Wed 9 AM', `a Freeze Warning: an orange band, “Freeze Warning” and “Tue 11 PM to Wed 9 AM” (${s})`);
      const bg = await F(b.page, () => getComputedStyle(document.querySelector('#app .band')).backgroundColor);
      ok(bg === 'rgb(255, 138, 61)', `orange (${bg})`);
      await WXT.wf(b.page).locator('#app .band').click(); await b.page.waitForTimeout(300);
      const v = await text(b.page);
      ok(/Watches and warnings/.test(v) && /Freeze Warning/.test(v) && /Tue 11 PM to Wed 9 AM/.test(v) && v.includes('Sub-freezing temperatures as low as 27 expected.') && v.includes('Areas along and west of a line from Gainesville to Fort Worth to Meridian to Lampasas.') &&
        /What to do/.test(v) && v.includes('A Freeze Warning means that the season\'s first episode of sub-freezing temperatures are likely to occur.') && /From the National Weather Service/.test(v) && !/WHAT\.\.\.|WHERE\.\.\.|Montague/.test(v),
        `tapped: the event, its time span, what and where without their labels, What to do, and “From the National Weather Service” (${v.slice(0, 300)})`);
      { const pr = await WXT.problems(b.page, false); ok(!pr.list.length, `the alert view fits (${pr.list.join(', ') || pr.size})`); }
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-warning-view.png' });
      await b.ctx.close();
      b = await WXT.board(browser, errors, { more: { 'api.weather.gov/alerts/active': 'nws-alerts-midland.json' } });
      await WXT.open(b.page);
      s = await band(b.page);
      ok(s === 'watch: Freeze Watch Wed 12 AM to 9 AM', `a Freeze Watch, in Central time: a yellow band, “Wed 12 AM to 9 AM” (${s})`);
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-watch.png' });
      await b.ctx.close();
      // Never shown: a Cancel, an EXP or CAN action, one that has ended, a marine warning, and the Winter Storm Warnings of Nov 20 and 21.
      const fw = WX_FIX('nws-alerts-fortworth.json'), one = f => { const x = JSON.parse(JSON.stringify(fw)); f(x.features[0].properties); return { json: x }; };
      const NEVER = [['a Cancel', one(p => { p.messageType = 'Cancel'; })], ['an EXP action', one(p => { p.parameters.VTEC = ['/O.EXP.KFWD.FZ.W.0003.261125T0500Z-261125T1500Z/']; })],
        ['a CAN action', one(p => { p.parameters.VTEC = ['/O.CAN.KFWD.FZ.W.0003.261125T0500Z-261125T1500Z/']; })], ['one that has ended', one(p => { p.onset = '2026-11-23T05:00:00-06:00'; p.ends = '2026-11-23T09:00:00-06:00'; })],
        ['a Gale Warning', one(p => { p.event = 'Gale Warning'; })], ['an advisory', one(p => { p.event = 'Wind Advisory'; })], ['the Winter Storm Warnings of Nov 20 and 21', 'nws-alerts-wsw.json']];
      const shown = [];
      for (const [what, ans] of NEVER) {
        b = await WXT.board(browser, errors, { more: { 'api.weather.gov/alerts/active': ans } });
        await WXT.open(b.page);
        const got = await band(b.page);
        if (got) shown.push(`${what}: ${got}`);
        await b.ctx.close();
      }
      ok(!shown.length, `Cancel messages, EXP and CAN actions, ended alerts, marine warnings, and advisories never show (${shown.join(' | ') || NEVER.length + ' cases'})`);
      // A warning that ends at 8:30 PM, seen at 7:55 PM: it goes when it ends, though nothing is asked from 8 PM to 6 AM.
      const late = JSON.parse(JSON.stringify(fw)), lp = late.features[0].properties;
      Object.assign(lp, { sent: '2026-11-23T15:00:00-06:00', effective: '2026-11-23T15:00:00-06:00', onset: '2026-11-23T21:00:00-06:00', ends: '2026-11-23T22:30:00-06:00', expires: '2026-11-23T22:30:00-06:00' });
      lp.parameters.VTEC = ['/O.NEW.KFWD.FZ.W.0003.261124T0300Z-261124T0430Z/'];
      b = await WXT.board(browser, errors, { at: '2026-11-23T19:55:00-06:00', clock: 'install', more: { 'api.weather.gov/alerts/active': { json: late } } });
      await WXT.open(b.page);
      const b0 = await band(b.page);
      await WXT.later(b.page, 70);   // (9:05 PM)
      const b1 = await band(b.page);
      await WXT.later(b.page, 90);   // (10:35 PM)
      const b2 = await band(b.page), asked = b.wx.count(/alerts\/active/);
      ok(b0 === 'warn: Freeze Warning Mon 9 PM to 10:30 PM' && b1 === 'warn: Freeze Warning Until 10:30 PM' && b2 === '' && asked === 1,
        `a warning from 9 PM to 10:30 PM, seen from 7:55 PM: its span reads “Until 10:30 PM” once it starts, and it goes at 10:30 PM, with no request after 8 PM (${b0} | ${b1} | “${b2}”; asked ${asked} time)`);
      await b.ctx.close();
    });

    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  ['Weather: saving, Board Sync and Board history, refresh clocks, offline, and No motion', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const { K, F, text } = WXT;
    const HNL = { id: 5856195, name: 'Honolulu', region: 'Hawaii', country: 'United States', lat: 21.30694, lon: -157.85834, tz: 'Pacific/Honolulu' };
    // ---- 1. Settings go in config, and stay; the forecast goes in content, tagged with its place.
    await part('Saving', async () => {
      const { ctx, page } = await WXT.board(browser, errors);
      await WXT.open(page);
      ok(await eventually(async () => { const d = await WXT.data(page); return !!(d && d.saved && d.saved.place === 4916311 && d.saved.days.length === 7 && d.saved.wear && d.saved.wear['2026-11-30']); }),
        'the forecast is saved in the window’s content, tagged with its place: 7 days, and What to wear for Mon, Nov 30');
      const d0 = await WXT.data(page);
      ok(!!d0 && d0.saved.days[0].date === '2026-11-23' && Math.round(d0.saved.days[0].high) === 40 && d0.saved.wear['2026-11-30'].advice === 'Dress for chilly weather.' && !/now/i.test(JSON.stringify(d0.saved.wear)),
        `its days and What to wear, without “Feels like … now” (${JSON.stringify(d0).slice(0, 300)})`);
      for (const id of ['units:c', 'show:moon', 'simple', 'still']) await WXT.choose(page, id);
      await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { place: HNL }));
      await WXT.choose(page, 'simple');
      await WXT.choose(page, 'date'); await page.waitForTimeout(300);
      let c = await WXT.conf(page);
      ok(!!c && c.units === 'c' && c.hide.join() === 'moon' && c.simple === false && c.still === true && c.place.id === 5856195 && c.date === '2026-11-22', `units, the Show list, Simple words, No motion, the place, and the date go in config (${JSON.stringify(c)})`);
      const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push('tab 2: ' + e.message));
      await page2.clock.setFixedTime(WX_AT); await page2.goto(BASE); await boardUp(page2);
      ok(await eventually(async () => JSON.stringify(await WXT.conf(page2)) === JSON.stringify(c)), 'another tab has them');
      await page2.close();
      await page.reload(); await boardUp(page); await WXT.connected(page); await page.waitForTimeout(1000);
      const t = await text(page), sub = await page.evaluate(k => window.__board21.state.wins.get(k).subtitle, K);
      ok(JSON.stringify(await WXT.conf(page)) === JSON.stringify(c) && /Back to today/.test(t) && sub === 'Nov 22, 2026', `after a reload: the same settings, On a date on Nov 22, 2026 (${sub}; ${t.replace(/\n+/g, ' / ').slice(0, 80)})`);
      const tpl = await page.evaluate(() => window.__board21.buildExport('template')), ti = tpl.instances.find(i => i.widgetId === 'weather');
      ok(!!ti && ti.data === null && JSON.stringify(ti.config) === JSON.stringify(c), 'a template keeps its settings, and never its forecast');
      await ctx.close();
    });

    // ---- 2. A refresh with the same forecast saves nothing: the window's record, Board history, and Board Sync's files.
    await part('Same forecast, no save', async () => {
      const A = await syncDev(browser, 'the smartboard', errors);
      const wx = await stubWeather(A.c);
      await setClock(A.p, Date.parse(WX_AT) - Date.now()); await A.p.reload(); await boardUp(A.p);   // (the fixtures' morning)
      await A.p.evaluate(() => window.__board21.history.cfg({ quiet: 300, every: 600, skipOpen: true }));
      await A.p.evaluate(() => window.__board21.openWidget('weather', { fresh: true }));
      ok(await WXT.connected(A.p) && await eventually(async () => !!((await WXT.data(A.p)) || {}).saved), 'a window on a linked board saves its forecast');
      await linkFolder(A.p); await syncNow(A.p); await A.p.waitForTimeout(1500); await syncNow(A.p);
      const rec = () => A.p.evaluate(async k => { const B = window.__board21, r = (await B.store.getAll()).find(r => r.key === `data:${B.state.boardId}:${k}`); return r ? JSON.stringify(r) : null; }, K);
      const before = await rec(), metas = await A.p.evaluate(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.length; });
      const writes = await A.p.evaluate(() => (window.__writes || []).length), n = wx.count(/v1\/forecast/);
      await F(A.p, () => window.B21Weather.refresh());
      ok(await eventually(async () => wx.count(/v1\/forecast/) > n), 'it asks for the forecast again');
      await A.p.waitForTimeout(2500); await syncNow(A.p);
      const after = await rec(), metas2 = await A.p.evaluate(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.length; }), writes2 = await A.p.evaluate(() => (window.__writes || []).length);
      ok(!!before && before === after && metas2 === metas && writes2 === writes, `the same forecast again saves nothing: the record, Board history (${metas} versions, then ${metas2}), and Board Sync’s writes (${writes}, then ${writes2}) are unchanged`);
      const line = await A.p.evaluate(k => window.__board21.history.excerptOf(window.__board21.state.data.get(k), 'weather', window.__board21.state.conf.get(k)), K);
      ok(/^Wheeling forecast, [A-Z][a-z]{2} \d{1,2}$/.test(line), `Board history’s line for it: “${line}”`);
      await A.c.close();
    });

    // ---- 3. Crafted config and content take the defaults, with no page error.
    await part('Crafted', async () => {
      const { ctx, page } = await WXT.board(browser, errors);
      await WXT.open(page);
      const BAD = [{ place: { id: 1, name: 'X', lat: 999, lon: -87, tz: 'America/Chicago' } }, { place: { id: 1, name: 'X', lat: 42, lon: -87, tz: 'Mars/Olympus' } }, { hide: ['<img src=x onerror=alert(1)>'] },
        { place: { id: 1, name: 'x'.repeat(100000), lat: 42, lon: -87, tz: 'America/Chicago' } }, { units: '<b>', simple: 'yes', still: 7, date: '1800-01-01' }, 'text', [1, 2], 42];
      const wrong = [];
      for (const c of BAD) {
        await WXT.put(page, 'config', c); await page.waitForTimeout(300);
        const s = await F(page, () => ({ place: (document.querySelector('#app .place') || {}).textContent || '', imgs: document.querySelectorAll('#app img').length, date: !!document.querySelector('#app .V-date, #app .wx.V-date') }));
        if (s.imgs || s.date || (s.place !== 'Wheeling' && s.place.length > 60)) wrong.push(`${JSON.stringify(c).slice(0, 60)}: ${JSON.stringify(s).slice(0, 80)}`);
      }
      const names = await F(page, () => document.querySelector('#app .place') && document.querySelector('#app .place').textContent);
      for (const d of [{ saved: { at: 'x', place: 4916311, days: 'no', wear: 5 } }, { saved: { at: Date.now(), place: 4916311, days: [{ date: '<img>', code: 'x', low: {}, high: [], rain: null }], wear: { '<img>': { advice: '<img src=x>' } } } }, 'text', null, [1]]) {
        await WXT.put(page, 'data', d); await page.waitForTimeout(300);
        const imgs = await F(page, () => document.querySelectorAll('#app img').length);
        if (imgs) wrong.push(`content ${JSON.stringify(d).slice(0, 60)} drew a picture`);
      }
      ok(!wrong.length, `crafted config and content (bad coordinates, an unknown time zone, markup in the Show list, a huge name, bad types) take the defaults (${wrong.join(' | ') || 'all'}; ${names})`);
      const wx = await F(page, () => document.querySelectorAll('#app .wx').length);
      ok(wx === 1, 'and it still draws the weather');
      await ctx.close();
      // Times no date can be made from, drawn offline: the window keeps drawing (a menu change, a new size).
      for (const [what, mut] of [['saved.at 1e20', x => { x.at = 1e20; }], ['each wear.at 1e15', x => { for (const k of Object.keys(x.wear)) x.wear[k].at = 1e15; }], ['saved.at -1e16', x => { x.at = -1e16; }]]) {
        const b = await WXT.board(browser, errors), logs = [];
        b.page.on('console', m => { if (/RangeError|listener for .* failed/.test(m.text())) logs.push(m.text().slice(0, 120)); });
        await WXT.open(b.page);
        await eventually(async () => !!((await WXT.data(b.page)) || {}).saved);
        const d = JSON.parse(JSON.stringify(await WXT.data(b.page))); mut(d.saved);
        await b.ctx.setOffline(true); await b.page.waitForTimeout(300);
        await WXT.put(b.page, 'data', d); await b.page.waitForTimeout(400);
        await WXT.choose(b.page, 'units:c'); await WXT.size(b.page, 900, 560);
        const t = await text(b.page);
        ok(!logs.length && /You’re offline\./.test(t) && (/\d°C/.test(t) || /The weather shows once you’re online\./.test(t)), `content with ${what}, offline: no error, and it still draws after °C and a new size (${logs.join(' | ') || t.replace(/\n+/g, ' / ').slice(0, 90)})`);
        await b.ctx.close();
      }
      // Temperatures no place could have, drawn offline: a dash, never “1e+300°”.
      {
        const b = await WXT.board(browser, errors);
        await WXT.open(b.page); await WXT.size(b.page, 900, 560);
        await eventually(async () => !!((await WXT.data(b.page)) || {}).saved);
        const d = JSON.parse(JSON.stringify(await WXT.data(b.page)));
        Object.assign(d.saved.days[0], { high: 1e300, low: -1e300 });
        for (const w of Object.values(d.saved.wear)) Object.assign(w, { high: 1e21, feels8: -1e21 });
        await b.ctx.setOffline(true); await b.page.waitForTimeout(300);
        await WXT.put(b.page, 'data', d); await b.page.waitForTimeout(400);
        const got = [];
        for (const [w, h] of [[900, 560], [480, 360]]) {
          await WXT.size(b.page, w, h);
          const t = await text(b.page), pr = await WXT.problems(b.page, false);
          got.push({ size: `${w} × ${h}`, ok: /You’re offline\./.test(t) && /Today’s high/.test(t) && !/\de[+-]?\d/.test(t) && !pr.list.length, t: t.replace(/\n+/g, ' / ').slice(0, 110), pr: pr.list.slice(0, 3) });
        }
        ok(got.every(g => g.ok), `content with a high of 1e300°, a low of −1e300°, and What to wear at ±1e21°, offline: the window draws, with no such number (${JSON.stringify(got)})`);
        await b.ctx.close();
      }
    });

    // ---- 4. Each part on its own clock, only while the window shows, and never on a timer from 8 PM to 6 AM.
    await part('Refresh clocks', async () => {
      const { ctx, page, wx } = await WXT.board(browser, errors, { clock: 'install' });
      await WXT.open(page);
      const C = { now: /stations\/KPWK\/observations/, forecast: /api\.open-meteo\.com\/v1\/forecast/, air: /air-quality/, alerts: /alerts\/active/ };
      const counts = () => Object.fromEntries(Object.entries(C).map(([k, re]) => [k, wx.count(re)]));
      const c0 = counts();
      // (Each half hour the airport's newest report is half an hour newer.)
      for (let i = 1; i <= 8; i++) { wx.later['api.weather.gov/stations/KPWK/observations'] = i * 1800; await WXT.later(page, 30); }
      await WXT.later(page, 1);
      const c1 = counts(), d = Object.fromEntries(Object.keys(C).map(k => [k, c1[k] - c0[k]]));
      ok(c0.now === 1 && c0.forecast === 1 && c0.air === 1 && c0.alerts === 1 && d.now === 8 && d.forecast === 4 && d.air === 1 && d.alerts === 48,
        `in 4 hours from 11:50 AM: Now every 30 minutes, the forecast every hour, air quality every 4 hours, and alerts every 5 minutes (on open ${JSON.stringify(c0)}, then ${JSON.stringify(d)})`);
      // Hidden, it asks nothing. Shown again, it asks for what's stale.
      await F(page, () => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      const h0 = counts();
      await WXT.later(page, 90);
      const h1 = counts();
      ok(JSON.stringify(h0) === JSON.stringify(h1), `hidden for 90 minutes, it asks nothing (${JSON.stringify(h0)}, then ${JSON.stringify(h1)})`);
      await F(page, () => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.clock.runFor(5000); await page.waitForTimeout(1500);
      const h2 = counts();
      ok(h2.now === h1.now + 1 && h2.forecast === h1.forecast + 1 && h2.alerts === h1.alerts + 1 && h2.air === h1.air, `shown again, it asks at once for Now, the forecast, and alerts, which are stale, and not air quality (${JSON.stringify(h2)})`);
      await ctx.close();
      // The airport's report always 2 hours old, so Now comes from Open-Meteo: still one forecast an hour, each with Now.
      const st = await WXT.board(browser, errors, { clock: 'install' });
      st.wx.later['api.weather.gov/stations/KPWK/observations'] = -2 * 3600;
      await WXT.open(st.page);
      const om = () => st.wx.asked.filter(a => a.host === 'api.open-meteo.com'), s0 = om().length, src = await F(st.page, () => document.querySelector('#app .hero .src').textContent);
      for (let i = 1; i <= 8; i++) { st.wx.later['api.weather.gov/stations/KPWK/observations'] = i * 1800 - 2 * 3600; await WXT.later(st.page, 30); }
      await WXT.later(st.page, 1);
      const s1 = om().slice(s0);
      ok(s0 === 1 && s1.length === 4 && s1.every(a => a.query.current) && /^From Open-Meteo/.test(src), `with Now from Open-Meteo, it asks Open-Meteo once an hour, each time with Now: about 18 calls a day, as README says (on open ${s0}, then ${s1.length} in 4 hours, ${s1.filter(a => a.query.current).length} with Now; ${src})`);
      await st.ctx.close();
      // From 8 PM to 6 AM nothing on a timer; a window opened at 9 PM asks once.
      const q = await WXT.board(browser, errors, { clock: 'install', at: '2026-11-23T21:00:00-06:00' });
      await WXT.open(q.page);
      const q0 = Object.fromEntries(Object.entries(C).map(([k, re]) => [k, q.wx.count(re)]));
      await WXT.later(q.page, 30); await q.page.clock.fastForward(8 * 3600e3); await WXT.later(q.page, 1);
      const q1 = Object.fromEntries(Object.entries(C).map(([k, re]) => [k, q.wx.count(re)]));
      ok(Object.values(q0).every(n => n === 1) && JSON.stringify(q0) === JSON.stringify(q1), `opened at 9 PM it asks once for each part, then nothing until 6 AM (${JSON.stringify(q0)}, at 5:31 AM ${JSON.stringify(q1)})`);
      await WXT.later(q.page, 45);
      const q2 = Object.fromEntries(Object.entries(C).map(([k, re]) => [k, q.wx.count(re)]));
      ok(Object.keys(C).every(k => q2[k] > q1[k]), `after 6 AM it asks again (${JSON.stringify(q2)})`);
      await q.ctx.close();
    });

    // ---- 5. Offline.
    await part('Offline', async () => {
      const { ctx, page, wx } = await WXT.board(browser, errors);
      await WXT.open(page);
      ok(await eventually(async () => !!((await WXT.data(page)) || {}).saved), 'online, the forecast is saved');
      await ctx.setOffline(true); await page.waitForTimeout(600);
      let t = await text(page), p = await WXT.parts(page);
      ok(/You’re offline\./.test(t) && /Updated 11:50 AM/.test(t) && p && p.days === 5 && p.wear === 'line' && !/At Chicago Executive Airport/.test(t) && /Today’s high/.test(t) && /\b40°/.test(t) && /Dress for chilly weather\./.test(t),
        `going offline: “You’re offline.”, “Updated 11:50 AM”, today’s high, the days and What to wear from the save, and no Now (${t.replace(/\n+/g, ' / ').slice(0, 220)})`);
      await WXT.size(page, 1600, 860);
      p = await WXT.parts(page);
      ok(!!p && !p.hourly && !p.wind && !p.air && p.days === 7 && p.sun, `offline at Fill the board: no hourly forecast, wind, or air quality; the 7 days and the sun (${JSON.stringify(p).slice(0, 200)})`);
      await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-offline-xl.png' });
      await WXT.size(page, 480, 360);
      await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-offline.png' });
      const n = wx.asked.length;
      await ctx.setOffline(false);
      ok(await eventually(async () => wx.asked.length > n && !/You’re offline/.test(await text(page)), 6000), 'back online, it asks again by itself and drops the band');
      // A save from Fri Nov 20 at 7:02 AM: only its days from today on, and the band names the day.
      const d = await WXT.data(page), old = JSON.parse(JSON.stringify(d));
      old.saved.at = Date.parse('2026-11-20T07:02:00-06:00');
      old.saved.days = old.saved.days.map((x, i) => Object.assign({}, x, { date: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'][i] }));
      await ctx.setOffline(true); await WXT.put(page, 'data', old); await page.waitForTimeout(500);
      t = await text(page); p = await WXT.parts(page);
      ok(/Updated Fri 7:02 AM/.test(t) && p && p.days === 4, `a save from Friday: “Updated Fri 7:02 AM”, and only its 4 days from today on (${p && p.days}; ${t.replace(/\n+/g, ' / ').slice(0, 160)})`);
      await ctx.close();
      // Nothing saved, offline.
      const HANG = { 'api.open-meteo.com/v1/forecast': { hang: true }, 'air-quality-api.open-meteo.com/v1/air-quality': { hang: true }, 'api.weather.gov/points/42.1392,-87.929': { hang: true }, 'api.weather.gov/alerts/active': { hang: true } };
      let b = await WXT.board(browser, errors, { more: HANG });
      await b.page.evaluate(() => window.__board21.openWidget('weather', { fresh: true })); await WXT.connected(b.page); await b.page.waitForTimeout(500);
      const t0 = await text(b.page), n0 = b.wx.asked.length;
      await b.ctx.setOffline(true); await b.page.waitForTimeout(500);
      t = await text(b.page);
      ok(/Getting the weather…/.test(t0) && /You’re offline\./.test(t) && /The weather shows once you’re online\./.test(t), `nothing saved: “Getting the weather…”, then offline “You’re offline.” and “The weather shows once you’re online.” (${t0} | ${t.replace(/\n+/g, ' / ')})`);
      await WXT.choose(b.page, 'units:c'); await b.page.waitForTimeout(300);
      ok(b.wx.asked.length === n0, 'offline, it asks nothing');
      await b.ctx.close();
      // Online, but every site fails.
      const FAIL = { 'api.open-meteo.com/v1/forecast': { abort: true }, 'air-quality-api.open-meteo.com/v1/air-quality': { abort: true }, 'api.weather.gov/points/42.1392,-87.929': { abort: true }, 'api.weather.gov/alerts/active': { abort: true } };
      b = await WXT.board(browser, errors, { clock: 'install', more: FAIL });
      await b.page.evaluate(() => window.__board21.openWidget('weather', { fresh: true })); await WXT.connected(b.page);
      await b.page.clock.runFor(20000);
      t = await text(b.page);
      ok(/Can’t get the weather\./.test(t) && /It tries again on its own\./.test(t), `online, every site failing, nothing saved: “Can’t get the weather.” and “It tries again on its own.” (${t.replace(/\n+/g, ' / ')})`);
      await WXT.put(b.page, 'data', d); await b.page.waitForTimeout(300);
      await F(b.page, () => window.B21Weather.refresh()); await b.page.clock.runFor(20000);
      t = await text(b.page);
      ok(/Can’t get new weather\./.test(t) && /Updated 11:50 AM/.test(t) && /Dress for chilly weather\./.test(t), `with a save: “Can’t get new weather.” and “Updated 11:50 AM”, and the saved forecast (${t.replace(/\n+/g, ' / ').slice(0, 160)})`);
      await b.ctx.close();
      // Every site failing after a good start (a school's filter, an outage): once the forecast is two hours old, the
      // saved view with “Can’t get new weather.”, and the band goes when the weather comes again.
      b = await WXT.board(browser, errors, { at: '2026-11-23T09:50:00-06:00', clock: 'install' });
      b.wx.shift = -2 * 3600;   // (the answers as at 9:50 AM)
      await WXT.open(b.page); await WXT.size(b.page, 900, 560);
      ok(await eventually(async () => !!((await WXT.data(b.page)) || {}).saved), 'a good start: the forecast is saved');
      const good = Object.assign({}, b.wx.answers);
      for (const k of Object.keys(b.wx.answers)) b.wx.answers[k] = { abort: true };
      await WXT.later(b.page, 100);
      const t1 = await text(b.page);
      await WXT.later(b.page, 80);
      const t2 = await text(b.page), p2 = await WXT.parts(b.page);
      ok(!/Can’t get new weather/.test(t1) && /Can’t get new weather\./.test(t2) && /Updated 9:50 AM/.test(t2) && !/From Open-Meteo|At Chicago Executive Airport/.test(t2) && p2 && !p2.wind && !p2.air && p2.days === 7,
        `three hours of every site failing: at 11:30 AM it still shows the weather; by 12:50 PM “Can’t get new weather.” and “Updated 9:50 AM”, the saved days, and no Now (${t1.replace(/\n+/g, ' / ').slice(0, 80)} | ${t2.replace(/\n+/g, ' / ').slice(0, 140)})`);
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-failing.png' });
      Object.assign(b.wx.answers, good);
      await WXT.later(b.page, 65);
      const t3 = await text(b.page);
      ok(!/Can’t get new weather/.test(t3) && /At Chicago Executive Airport|From Open-Meteo, \d/.test(t3), `the next answer drops the band (${t3.replace(/\n+/g, ' / ').slice(0, 100)})`);
      await b.ctx.close();
      // Only the forecasts failing for two hours, with the airport's report old, while the alerts still come: not every
      // source fails, so a warning in force still shows. Once the alerts fail too: “Can’t get new weather.”
      b = await WXT.board(browser, errors, { clock: 'install', more: { 'api.weather.gov/alerts/active': 'nws-alerts-fortworth.json' } });
      await WXT.open(b.page); await WXT.size(b.page, 900, 560);
      await eventually(async () => !!((await WXT.data(b.page)) || {}).saved);
      const band = () => F(b.page, () => { const e = document.querySelector('#app .band'); return e ? e.className.replace('band ', '') + ': ' + e.textContent.replace(/\u00a0/g, ' ').trim() : ''; });
      b.wx.answers['api.open-meteo.com/v1/forecast'] = { abort: true };
      for (const k of ['api.weather.gov/gridpoints/LOT/65,84/forecast', 'api.weather.gov/gridpoints/LOT/65,84/forecast/hourly']) b.wx.answers[k] = { status: 500, json: {} };
      b.wx.later['api.weather.gov/stations/KPWK/observations'] = -3 * 3600;
      const a0 = b.wx.count(/alerts\/active/);
      await WXT.later(b.page, 130);
      const w1 = await band(), a1 = b.wx.count(/alerts\/active/);
      b.wx.answers['api.weather.gov/alerts/active'] = { status: 500, json: {} };
      await WXT.later(b.page, 6);
      const w2 = await band();
      ok(/^warn: Freeze Warning/.test(w1) && a1 - a0 >= 20 && /^off: Can’t get new weather\. Updated 11:50 AM/.test(w2),
        `the forecasts failing for two hours while ${a1 - a0} alerts answer: the warning still shows (“${w1}”); the alerts failing too: “${w2}”`);
      await b.ctx.close();
    });

    // ---- 6. No motion, from the menu or the device; snow in two layers.
    await part('Motion', async () => {
      const moving = p => F(p, () => { const fx = document.querySelector('#app .fx'); return fx ? fx.getAnimations({ subtree: true }).length : -1; });
      const obs = WX_FIX('nws-observations-KPWK.json'); obs.features.forEach(f => { f.properties.textDescription = 'Light Snow'; });
      let b = await WXT.board(browser, errors, { more: { 'api.weather.gov/stations/KPWK/observations': { json: obs } } });
      await WXT.open(b.page);
      const snow = await F(b.page, () => [...document.querySelectorAll('#app .fx .sway')].map(s => getComputedStyle(s).animationDuration + '/' + (s.querySelector('[class^="snow-"]') ? getComputedStyle(s.querySelector('[class^="snow-"]')).animationDuration : '-')));
      ok(snow.length === 2 && snow[0] !== snow[1] && snow.every(s => !/\/-$/.test(s)), `snow: two faint layers, each drifting on its own path, at different speeds (${snow.join(', ')})`);
      ok(await moving(b.page) > 0, `the sky moves (${await moving(b.page)} animations)`);
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-snow.png' });
      await WXT.choose(b.page, 'still');
      ok(await moving(b.page) === 0 && ((await WXT.conf(b.page)) || {}).still === true, 'No motion stops every animation in the sky, and is saved');
      await b.ctx.close();
      b = await WXT.board(browser, errors, { opts: { reducedMotion: 'reduce' } });
      await WXT.open(b.page);
      ok(await moving(b.page) === 0, 'with Reduce motion on the device, the sky is still too');
      await b.ctx.close();
      // Large by day, snowing, for half an hour of the window's 20-second redraws: what it shows changes (the sun moves on),
      // and the moving sky carries on through it, never taken out of the page to start over.
      b = await WXT.board(browser, errors, { clock: 'install', more: { 'api.weather.gov/stations/KPWK/observations': { json: obs } } });
      await WXT.open(b.page); await WXT.size(b.page, 900, 560); await b.page.clock.runFor(2000);
      await F(b.page, () => {
        window.__sky = document.querySelector('#app .fx i').getAnimations()[0]; window.__views = 0; window.__redraws = 0;
        new MutationObserver(rs => { for (const r of rs) if (r.target.id === 'view') window.__views++; else if (r.target.classList.contains('wx')) window.__redraws++; })
          .observe(document.getElementById('view'), { childList: true, subtree: true });
      });
      for (let i = 0; i < 90; i++) { await b.page.clock.fastForward(20e3); await b.page.waitForTimeout(30); }
      const sky = await F(b.page, () => { const a = document.querySelector('#app .fx i').getAnimations()[0]; return { views: window.__views, redraws: window.__redraws, same: a === window.__sky, state: a && a.playState, sky: document.querySelector('#app .fx').dataset.sc }; });
      ok(sky.redraws > 0 && sky.views === 0 && sky.same && sky.state === 'running' && sky.sky === 'snow-d', `half an hour of redraws in Large: the window drew again ${sky.redraws} times, and the snowy sky stayed in the page, still moving (${JSON.stringify(sky)})`);
      await b.ctx.close();
    });

    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  ['Weather: Location, On a date, and Simple words', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const { K, F, text } = WXT;
    // ---- 1. Location: search as you type. Other towns named Wheeling never show.
    await part('Location', async () => {
      const { ctx, page, wx } = await WXT.board(browser, errors);
      await WXT.open(page);
      await WXT.choose(page, 'place');
      const field = WXT.wf(page).locator('#app .sheet input');
      ok(await field.count() === 1 && (await field.getAttribute('placeholder')) === 'Search for a town' && /Location/.test(await text(page)), 'Location… opens a sheet with a search field');
      const results = () => F(page, () => [...document.querySelectorAll('#app .sheet .res li')].map(li => li.innerText.replace(/\s*\n\s*/g, ' / ').trim()));
      await field.fill('Wheeling'); await page.waitForTimeout(900);
      let r = await results();
      ok(r.length === 1 && /^Wheeling \/ Illinois, United States/.test(r[0]) && /✓/.test(r[0]), `searching “Wheeling” lists only Wheeling, Illinois, checked (${r.join(' | ')})`);
      await field.fill('Zzz'); await page.waitForTimeout(900);
      ok(/No towns found\./.test(await text(page)), 'no results: “No towns found.”');
      await field.fill('Honolulu'); await page.waitForTimeout(900);
      r = await results();
      ok(r.length === 1 && /^Honolulu \/ Hawaii, United States/.test(r[0]), `“Honolulu” lists Honolulu (${r.join(' | ')})`);
      const n = wx.count(/latitude=21\.30694/);
      await WXT.wf(page).locator('#app .sheet .res li').first().click(); await page.waitForTimeout(1200);
      const c = await WXT.conf(page), sub = await page.evaluate(k => window.__board21.state.wins.get(k).subtitle, K);
      ok(!!c && c.place.id === 5856195 && c.place.tz === 'Pacific/Honolulu' && wx.count(/latitude=21\.30694/) > n && /Honolulu/.test(await text(page)) && !sub && await page.locator(`.win[data-ikey="${K}"] .win-label`).innerText() === 'Weather',
        `choosing it refreshes the window for Honolulu, and the title stays Weather (${JSON.stringify(c && c.place)}; “${sub || ''}”)`);
      // (The sheet's box stays in the page, hidden and empty, while it's closed.)
      const sheetOpen = () => F(page, () => [...document.querySelectorAll('#app .sheet')].some(s => !s.hidden && s.getClientRects().length > 0));
      await WXT.choose(page, 'place');
      const esc0 = await sheetOpen();
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      ok(esc0 && !await sheetOpen(), `Escape closes it (${esc0 ? 'open' : 'never opened'}, then ${await sheetOpen() ? 'still open' : 'closed'})`);
      await WXT.choose(page, 'place');
      const tap0 = await sheetOpen(), wb = await page.locator(`.win[data-ikey="${K}"] iframe`).boundingBox();
      await page.mouse.click(wb.x + 12, wb.y + wb.height / 2); await page.waitForTimeout(300);   // (beside the panel)
      ok(tap0 && !await sheetOpen(), `tapping outside it closes it too (${tap0 ? 'open' : 'never opened'}, then ${await sheetOpen() ? 'still open' : 'closed'})`);
      await ctx.setOffline(true);
      await WXT.choose(page, 'place');
      await WXT.wf(page).locator('#app .sheet input').fill('Chicago'); await page.waitForTimeout(900);
      ok(/Search needs the Internet\./.test(await text(page)), 'offline: “Search needs the Internet.”');
      await ctx.close();
    });

    // ---- 2. On a date: Jan 30, 2019.
    await part('On a date', async () => {
      const { ctx, page, wx } = await WXT.board(browser, errors);
      await WXT.open(page); await WXT.size(page, 900, 560);
      await WXT.choose(page, 'date'); await page.waitForTimeout(500);
      const input = WXT.wf(page).locator('#app input[type="date"]');
      ok(await input.count() === 1 && (await input.getAttribute('min')) === '1940-01-01' && (await input.getAttribute('max')) === '2026-11-22', 'On a date… opens on yesterday; its date picker runs from Jan 1, 1940 to yesterday');
      await input.fill('2019-01-30'); await input.dispatchEvent('change'); await page.waitForTimeout(800);
      const t = await text(page), sub = await page.evaluate(k => window.__board21.state.wins.get(k).subtitle, K);
      const big = await F(page, () => document.querySelector('#app .temp').textContent);
      ok(big === '−13°F' && /Wed, January 30, 2019/.test(t) && /Low −25°/.test(t) && /Feels like −38° · Wind 15 mph/.test(t) && /Snow 0 inches · Rain 0 inches/.test(t) && /53° colder/.test(t) && /Today’s high is 40°\./.test(t) && /Back to today/.test(t) && /From Open-Meteo/.test(t),
        `Jan 30, 2019: −13°F, Low −25°, 53° colder, Today’s high is 40°. (${big}; ${t.replace(/\n+/g, ' / ').slice(0, 300)})`);
      ok(sub === 'Jan 30, 2019', `the title’s subtitle: “${sub}”`);
      ok(wx.asked.some(a => a.host === 'archive-api.open-meteo.com' && a.query.start_date === '2019-01-30' && a.query.end_date === '2019-01-30'), 'it asked Open-Meteo’s archive for that day');
      { const pr = await WXT.problems(page, false); ok(!pr.list.length, `On a date fits (${pr.list.join(', ') || pr.size})`); }
      await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-on-a-date.png' });
      // The chart's line never runs through the high's or the low's number: the high's sits above its dot, the low's
      // below. Jan 30, 2019, and a day that peaks mid-afternoon, large and small.
      const through = () => F(page, () => {
        const s = document.querySelector('#app .dscroll'); if (s) s.scrollTop = s.scrollHeight;
        const ch = document.querySelector('#app .chart'), path = ch.querySelector('path[fill="none"]'), m = path.getScreenCTM(), segs = [];
        for (const run of path.getAttribute('d').split('M').filter(Boolean)) {
          const pts = run.split('L').map(p => p.split(',').map(Number)).map(([x, y]) => ({ x: m.a * x + m.e, y: m.d * y + m.f }));
          for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
        }
        // (How much of a segment lies in a box: Liang–Barsky.)
        const inBox = (a, b, r) => {
          let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
          for (const [p, q] of [[-dx, a.x - r.l], [dx, r.r - a.x], [-dy, a.y - r.t], [dy, r.b - a.y]]) {
            if (!p) { if (q < 0) return 0; continue; }
            const t = q / p; if (p < 0) { if (t > t1) return 0; t0 = Math.max(t0, t); } else { if (t < t0) return 0; t1 = Math.min(t1, t); }
          }
          return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
        };
        // (Each number's ink, and half the line's width around it.)
        return [...ch.querySelectorAll('.lab')].map(e => {
          const q = e.getBoundingClientRect(), fs = parseFloat(getComputedStyle(e).fontSize), r = { l: q.left - 1.2, r: q.right + 1.2, t: q.top + 0.22 * fs - 1.2, b: q.bottom - 0.2 * fs + 1.2 };
          const n = segs.reduce((sum, [a, b]) => sum + inBox(a, b, r), 0);
          return e.textContent.trim() + (n > 0.5 ? ` under ${n.toFixed(1)} px of line` : '');
        });
      });
      const peak = WX_FIX('om-archive-2019-01-30.json'), p0 = Date.parse('2019-10-03T05:00:00Z') / 1000;
      const temps = [70, 71, 72, 72.5, 73, 74, 75, 76, 78, 80, 82, 83, 84, 84.5, 84, 82, 79, 75, 70, 66, 62, 59, 57, 55];
      peak.hourly.time = temps.map((_, i) => p0 + i * 3600); peak.hourly.temperature_2m = temps; peak.daily.time = [p0];
      Object.assign(peak.daily, { temperature_2m_max: [84.5], temperature_2m_min: [55], weather_code: [1] });
      const labs = [];
      for (const date of ['2019-01-30', '2019-10-03']) {
        if (date !== '2019-01-30') { wx.answers['archive-api.open-meteo.com/v1/archive'] = { json: peak }; await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { date })); await page.waitForTimeout(800); }
        for (const [w, h] of [[900, 560], [480, 360], [380, 280]]) { await WXT.size(page, w, h); labs.push(`${date} at ${w} × ${h}: ${(await through()).join(', ')}`); }
      }
      ok(labs.length === 6 && labs.every(l => /: \S+°, \S+°$/.test(l) && !/ under /.test(l)), `the chart’s line runs through neither the high nor the low (${labs.join(' | ')})`);
      await WXT.size(page, 900, 560);
      await WXT.wf(page).locator('#app [data-act="today"]').click(); await page.waitForTimeout(500);
      ok(((await WXT.conf(page)) || {}).date === null && !(await page.evaluate(k => window.__board21.state.wins.get(k).subtitle, K)), 'Back to today returns, and the subtitle goes');
      // A summer day: the archive keeps standard time all year, so its hours run from 1 AM daylight time. The chart puts
      // each at its own time, and a missing hour is a gap.
      const sum = WX_FIX('om-archive-2019-01-30.json'), t0 = Date.parse('2019-07-15T06:00:00Z') / 1000;
      sum.hourly.time = sum.hourly.time.map((t, i) => t0 + i * 3600); sum.daily.time = [t0];
      sum.hourly.temperature_2m = sum.hourly.temperature_2m.map((f, i) => (i === 10 ? null : 70 + i / 2));
      Object.assign(sum.daily, { temperature_2m_max: [81.5], temperature_2m_min: [70], weather_code: [1] });
      wx.answers['archive-api.open-meteo.com/v1/archive'] = { json: sum };
      await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { date: '2019-07-15' })); await page.waitForTimeout(800);
      const ch = await F(page, () => ({ ticks: [...document.querySelectorAll('#app .chart .tk')].map(e => e.textContent.replace(/\u00a0/g, ' ') + '@' + e.style.left), runs: (document.querySelector('#app .chart svg path[fill="none"]').getAttribute('d').match(/M/g) || []).length }));
      // (6 AM daylight time is the archive's 6th hour, 11:00 UTC: 10 + 280 × 5 / 23 of the 300-wide drawing.)
      ok(ch.ticks.join(' | ') === '6 AM@23.62% | 12 PM@47.97% | 6 PM@72.32%' && ch.runs === 2, `a summer day’s chart: 6 AM, 12 PM, and 6 PM at their own hours, and a gap where an hour is missing (${ch.ticks.join(' | ')}; ${ch.runs} runs)`);
      // The archive failing while online: “Can’t get the weather.”, then once more after 5 to 10 seconds.
      let tries = 0;
      wx.answers['archive-api.open-meteo.com/v1/archive'] = () => (++tries === 1 ? { status: 500, json: { error: true } } : 'om-archive-2019-01-30.json');
      await WXT.put(page, 'config', Object.assign({}, await WXT.conf(page), { date: '2019-01-30' })); await page.waitForTimeout(600);
      const f1 = await text(page);
      ok(/Can’t get the weather\./.test(f1) && !/No weather for that date/.test(f1), `the archive failing while online: “Can’t get the weather.” (${f1.replace(/\n+/g, ' / ').slice(0, 100)})`);
      ok(await eventually(async () => /Low −25°/.test(await text(page)), 14000) && tries === 2, `it tries once more by itself, and shows the day (${tries} tries)`);
      await ctx.setOffline(true);
      await WXT.choose(page, 'date'); await page.waitForTimeout(500);
      ok(/On a date needs the Internet\./.test(await text(page)), 'offline: “On a date needs the Internet.”');
      await ctx.close();
    });

    // ---- 3. Simple words, for the day What to wear shows.
    await part('Simple words', async () => {
      let b = await WXT.board(browser, errors, { at: '2026-12-01T11:50:00-06:00' });
      b.wx.shift = 8 * 86400;
      await WXT.open(b.page);
      await WXT.choose(b.page, 'simple');
      let s = await F(b.page, () => ({ say: (document.querySelector('#app .say') || {}).textContent, items: [...document.querySelectorAll('#app .simple figcaption')].map(e => e.textContent), chip: (document.querySelector('#app .chip') || {}).textContent, credit: (document.querySelector('#app .simple .src') || {}).textContent }));
      ok(s.say === 'Cold and sunny.' && s.items.join() === 'Coat,Hat,Gloves' && s.chip === '39°' && s.credit === 'At Chicago Executive Airport. Forecast from Open-Meteo', `Tue Dec 1 before 2 PM: “Cold and sunny.” with a coat, hat, and gloves (${JSON.stringify(s)})`);
      await WXT.put(b.page, 'config', Object.assign({}, await WXT.conf(b.page), { hide: ['wear', 'days', 'hourly'] })); await b.page.waitForTimeout(300);
      s = await F(b.page, () => ({ say: (document.querySelector('#app .say') || {}).textContent, items: [...document.querySelectorAll('#app .simple figcaption')].map(e => e.textContent) }));
      ok(s.say === 'Cold and sunny.' && s.items.length === 3, 'it ignores the Show list');
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-simple.png' });
      { const pr = await WXT.problems(b.page, false); ok(!pr.list.length, `Simple words fits (${pr.list.join(', ') || pr.size})`); }
      // In Small its credit takes two lines: the sentence stays clear of it.
      const small = async (pg, tag) => {
        const bad = [];
        for (const [w, h] of [[260, 220], [300, 250], [340, 270]]) { await WXT.size(pg, w, h); const pr = await WXT.problems(pg, false); if (pr.list.length) bad.push(`${tag} at ${w} × ${h}: ${pr.list.join(', ')}`); }
        return bad;
      };
      const smallBad = await small(b.page, '“Cold and sunny.”');
      await b.ctx.close();
      // Mon Nov 23, no school: Mon Nov 30, its forecast's sky (cloudy).
      b = await WXT.board(browser, errors);
      await WXT.open(b.page);
      await WXT.choose(b.page, 'simple');
      s = await F(b.page, () => ({ say: (document.querySelector('#app .say') || {}).textContent, items: [...document.querySelectorAll('#app .simple figcaption')].map(e => e.textContent) }));
      ok(s.say === 'Chilly and cloudy.' && s.items.join() === 'Coat', `Mon Nov 23 follows Mon Nov 30: “Chilly and cloudy.”, the sky of Monday’s forecast, with a coat (${JSON.stringify(s)})`);
      smallBad.push(...await small(b.page, '“Chilly and cloudy.”'));
      await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'weather-simple-small.png' });
      ok(!smallBad.length, `Simple words in Small windows, from 260 × 220: the sentence clear of the credit, and everything fits (${smallBad.join(' | ') || 'all'})`);
      await b.ctx.close();
    });

    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ];
};
