/*
 * Name Picker style: Spinning wheel. STAND-IN, until the real Spinning wheel is built in this file.
 * It shows the winners as a numbered list that fades in, so the widget works meanwhile. Replace all of it (keep the
 * id 'wheel' and the class prefix 'wheel-'); how a style plugs in: the comment at the top of index.html.
 */
NamePicker.register('wheel', {
  css: `
.wheel-stub { position: absolute; inset: 0; display: flex; flex-direction: column; padding: clamp(6px, 4%, 32px); box-sizing: border-box; text-align: center; }
.wheel-stub-title { color: var(--b21-muted); font-weight: 650; font-size: clamp(11px, 2.4vh, 16px); }
.wheel-stub-area { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.wheel-stub-list { margin: 0; padding: 0; list-style: none; width: max-content; font-weight: 800; line-height: 1.15; color: var(--b21-accent); white-space: nowrap; }
.wheel-stub-list b { display: inline-block; min-width: 1.4em; color: var(--b21-muted); }
.wheel-stub-q { color: var(--b21-muted); }
.wheel-stub-wait { opacity: .3; }
.wheel-stub-fade { animation: wheel-stub-fade .3s ease-out both; }
@keyframes wheel-stub-fade { from { opacity: 0; } to { opacity: 1; } }
`,
  mount(root, host) {
    const box = host.el('div', 'wheel-stub', root);
    host.el('div', 'wheel-stub-title', box, 'Spinning wheel');
    const area = host.el('div', 'wheel-stub-area', box), list = host.el('ol', 'wheel-stub-list', area);
    let timer = 0, landing = null;
    const fit = () => host.fitText(list, area, Math.max(12, area.clientHeight * 0.5));
    function draw(view, cls) {
      clearTimeout(timer); timer = 0; landing = null;
      const names = view.winners.map(i => view.names[i]);
      list.className = 'wheel-stub-list' + (names.length ? '' : ' wheel-stub-q') + (cls ? ' ' + cls : '');
      list.replaceChildren(...(names.length ? names : ['?']).map((n, i) => {
        const li = host.el('li');
        if (names.length > 1) host.el('b', '', li, (i + 1) + '.');
        host.el('span', '', li, n);
        return li;
      }));
      fit();
    }
    return {
      show(view, how) { draw(view, how && how.fade ? 'wheel-stub-fade' : ''); },
      play(view) {
        clearTimeout(timer);
        landing = view;
        list.classList.add('wheel-stub-wait');
        timer = setTimeout(() => { draw(view, 'wheel-stub-fade'); host.sound('chime'); host.done(); }, view.quick ? 400 : 1200);
      },
      skip() { if (landing) draw(landing, ''); },
      resize: fit,
      destroy() { clearTimeout(timer); box.remove(); }
    };
  }
});
