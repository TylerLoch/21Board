/*
 * Name Picker style: Big name (the Name Picker's look from before there were styles).
 * Names flicker for about 1½ seconds, then the winner fills the stage. Several winners stack, numbered 1, 2, 3, all at
 * one size: as large as the stage allows. How a style plugs in: the comment at the top of index.html.
 */
NamePicker.register('name', {
  css: `
.bn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: clamp(6px, 4%, 40px); box-sizing: border-box; overflow: hidden; text-align: center; }
.bn-list { display: flex; flex-direction: column; align-items: center; gap: .06em; width: max-content; font-weight: 800; line-height: 1.12; }
.bn-row { display: flex; align-items: center; gap: .25em; white-space: nowrap; }
.bn-num { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; border-radius: 50%; font-size: .5em; line-height: 1; background: var(--b21-accent); color: var(--b21-on-accent); }
.bn-q { color: var(--b21-muted); }
.bn-rolling { opacity: .55; }
.bn-win { color: var(--b21-accent); }
.bn-pop .bn-row { animation: bn-pop .35s ease-out both; }
.bn-pop .bn-row:nth-child(2) { animation-delay: .05s; } .bn-pop .bn-row:nth-child(3) { animation-delay: .1s; }
.bn-pop .bn-row:nth-child(4) { animation-delay: .15s; } .bn-pop .bn-row:nth-child(5) { animation-delay: .2s; }
.bn-fade { animation: bn-fade .3s ease-out both; }
@keyframes bn-pop { 0% { transform: scale(.85); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes bn-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .bn-pop .bn-row { animation: none; } }
`,
  mount(root, host) {
    // When each new name shows during the shuffle (ms): quick at first, then slowing down; the winners at END.
    const TIMES = [0];
    for (let k = 1; k <= 13; k++) TIMES.push(TIMES[k - 1] + 40 + 9 * k);
    const END = TIMES[TIMES.length - 1] + 120;   // about 1.5 s, for any number of winners
    const box = host.el('div', 'bn', root), list = host.el('div', 'bn-list', box);
    const measure = document.createElement('canvas').getContext('2d');
    let timer = 0, landing = null;   // the shuffle running, and the winners it lands on

    function draw(names, cls, numbered) {
      list.className = 'bn-list ' + cls;
      list.replaceChildren(...names.map((n, i) => {
        const row = host.el('div', 'bn-row');
        if (numbered) host.el('span', 'bn-num', row, String(i + 1));
        host.el('span', 'bn-name', row, n);
        return row;
      }));
    }
    // One name fills the stage; several share it. (A lone "?" stays smaller.)
    const fit = () => host.fitText(list, box, Math.max(12, box.clientHeight * (list.classList.contains('bn-q') ? 0.4 : 0.6)));
    function stop() { clearTimeout(timer); timer = 0; landing = null; }
    function land(names, cls) { stop(); draw(names, cls, names.length > 1); fit(); }
    // The widest of these names in the stage's letters, so the size can stay put while names flicker.
    function widest(names) {
      measure.font = '800 100px ' + (host.token('font') || 'system-ui, sans-serif');
      let best = names[0], most = -1;
      for (const n of names) { const w = measure.measureText(n).width; if (w > most) { most = w; best = n; } }
      return best;
    }

    return {
      show(view, how) {
        const names = view.winners.map(i => view.names[i]);
        if (names.length) land(names, 'bn-win' + (how && how.fade ? ' bn-fade' : ''));
        else land(['?'], 'bn-q');
      },
      play(view) {
        stop();
        const final = view.winners.map(i => view.names[i]);
        // The names that flicker are the ones that were in the draw.
        const inDraw = view.names.filter((n, i) => !view.picked[i] || view.winners.includes(i));
        const deck = inDraw.length ? inDraw : view.names;
        draw(final.map(() => widest(deck)), 'bn-rolling', final.length > 1);
        fit();
        landing = final;
        let n = 0;
        const step = () => {
          if (n < TIMES.length) {
            for (const e of list.querySelectorAll('.bn-name')) e.textContent = deck[Math.floor(Math.random() * deck.length)];
            host.sound('tick', { volume: 0.6 });
            timer = setTimeout(step, (n + 1 < TIMES.length ? TIMES[n + 1] : END) - TIMES[n]);
            n++;
          } else {
            land(final, 'bn-win bn-pop');
            host.sound('chime');
            host.done();
          }
        };
        step();
      },
      skip() { if (landing) land(landing, 'bn-win'); },
      resize: fit,
      destroy() { stop(); box.remove(); }
    };
  }
});
