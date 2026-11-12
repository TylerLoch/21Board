/*
 * Name Picker style: Lotto. STAND-IN, until the real Lotto is built in this file.
 * It shows the winners as a numbered list that fades in, so the widget works meanwhile. Replace all of it (keep the
 * id 'lotto' and the class prefix 'lotto-'); how a style plugs in: the comment at the top of index.html.
 */
NamePicker.register('lotto', {
  css: `
.lotto-stub { position: absolute; inset: 0; display: flex; flex-direction: column; padding: clamp(6px, 4%, 32px); box-sizing: border-box; text-align: center; }
.lotto-stub-title { color: var(--b21-muted); font-weight: 650; font-size: clamp(11px, 2.4vh, 16px); }
.lotto-stub-area { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.lotto-stub-list { margin: 0; padding: 0; list-style: none; width: max-content; font-weight: 800; line-height: 1.15; color: var(--b21-accent); white-space: nowrap; }
.lotto-stub-list b { display: inline-block; min-width: 1.4em; color: var(--b21-muted); }
.lotto-stub-q { color: var(--b21-muted); }
.lotto-stub-wait { opacity: .3; }
.lotto-stub-fade { animation: lotto-stub-fade .3s ease-out both; }
@keyframes lotto-stub-fade { from { opacity: 0; } to { opacity: 1; } }
`,
  mount(root, host) {
    const box = host.el('div', 'lotto-stub', root);
    host.el('div', 'lotto-stub-title', box, 'Lotto');
    const area = host.el('div', 'lotto-stub-area', box), list = host.el('ol', 'lotto-stub-list', area);
    let timer = 0, landing = null;
    const fit = () => host.fitText(list, area, Math.max(12, area.clientHeight * 0.5));
    function draw(view, cls) {
      clearTimeout(timer); timer = 0; landing = null;
      const names = view.winners.map(i => view.names[i]);
      list.className = 'lotto-stub-list' + (names.length ? '' : ' lotto-stub-q') + (cls ? ' ' + cls : '');
      list.replaceChildren(...(names.length ? names : ['?']).map((n, i) => {
        const li = host.el('li');
        if (names.length > 1) host.el('b', '', li, (i + 1) + '.');
        host.el('span', '', li, n);
        return li;
      }));
      fit();
    }
    return {
      show(view, how) { draw(view, how && how.fade ? 'lotto-stub-fade' : ''); },
      play(view) {
        clearTimeout(timer);
        landing = view;
        list.classList.add('lotto-stub-wait');
        timer = setTimeout(() => { draw(view, 'lotto-stub-fade'); host.sound('chime'); host.done(); }, view.quick ? 400 : 1200);
      },
      skip() { if (landing) draw(landing, ''); },
      resize: fit,
      destroy() { clearTimeout(timer); box.remove(); }
    };
  }
});
