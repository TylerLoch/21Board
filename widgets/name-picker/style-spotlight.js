/*
 * Name Picker style: Spotlight. STAND-IN, until the real Spotlight is built in this file.
 * It shows the winners as a numbered list that fades in, so the widget works meanwhile. Replace all of it (keep the
 * id 'spotlight' and the class prefix 'spotlight-'); how a style plugs in: the comment at the top of index.html.
 */
NamePicker.register('spotlight', {
  css: `
.spotlight-stub { position: absolute; inset: 0; display: flex; flex-direction: column; padding: clamp(6px, 4%, 32px); box-sizing: border-box; text-align: center; }
.spotlight-stub-title { color: var(--b21-muted); font-weight: 650; font-size: clamp(11px, 2.4vh, 16px); }
.spotlight-stub-area { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.spotlight-stub-list { margin: 0; padding: 0; list-style: none; width: max-content; font-weight: 800; line-height: 1.15; color: var(--b21-accent); white-space: nowrap; }
.spotlight-stub-list b { display: inline-block; min-width: 1.4em; color: var(--b21-muted); }
.spotlight-stub-q { color: var(--b21-muted); }
.spotlight-stub-wait { opacity: .3; }
.spotlight-stub-fade { animation: spotlight-stub-fade .3s ease-out both; }
@keyframes spotlight-stub-fade { from { opacity: 0; } to { opacity: 1; } }
`,
  mount(root, host) {
    const box = host.el('div', 'spotlight-stub', root);
    host.el('div', 'spotlight-stub-title', box, 'Spotlight');
    const area = host.el('div', 'spotlight-stub-area', box), list = host.el('ol', 'spotlight-stub-list', area);
    let timer = 0, landing = null;
    const fit = () => host.fitText(list, area, Math.max(12, area.clientHeight * 0.5));
    function draw(view, cls) {
      clearTimeout(timer); timer = 0; landing = null;
      const names = view.winners.map(i => view.names[i]);
      list.className = 'spotlight-stub-list' + (names.length ? '' : ' spotlight-stub-q') + (cls ? ' ' + cls : '');
      list.replaceChildren(...(names.length ? names : ['?']).map((n, i) => {
        const li = host.el('li');
        if (names.length > 1) host.el('b', '', li, (i + 1) + '.');
        host.el('span', '', li, n);
        return li;
      }));
      fit();
    }
    return {
      show(view, how) { draw(view, how && how.fade ? 'spotlight-stub-fade' : ''); },
      play(view) {
        clearTimeout(timer);
        landing = view;
        list.classList.add('spotlight-stub-wait');
        timer = setTimeout(() => { draw(view, 'spotlight-stub-fade'); host.sound('chime'); host.done(); }, view.quick ? 400 : 1200);
      },
      skip() { if (landing) draw(landing, ''); },
      resize: fit,
      destroy() { clearTimeout(timer); box.remove(); }
    };
  }
});
