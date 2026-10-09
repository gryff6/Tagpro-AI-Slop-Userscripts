// ==UserScript==
// @name         TagPro Stat Leaderboards
// @namespace    tagpro-leaderboards
// @version      1.2
// @description  Movable, resizable on-screen top-N leaderboards for any in-game stat (broadcast-style look)
// @match        *://*.koalabeast.com/*
// @match        *://tagpro.gg/*
// @match        *://*.tagpro.gg/*
// @grant        none
// ==/UserScript==
(() => {
  const STATS = {
    score: 'Score', 's-tags': 'Tags', 's-pops': 'Pops', 's-grabs': 'Grabs', 's-drops': 'Drops',
    's-hold': 'Hold', 's-captures': 'Caps', 's-prevent': 'Prevent', 's-returns': 'Returns',
    's-support': 'Support', 's-powerups': 'Powerups',
    's-flaccids': 'Flaccid', kd: 'K/D',
    's-handoffs': 'Handoffs', 's-goodHandoffs': 'Good Handoffs',
    oscore: 'Offense Score', dscore: 'Defense Score',
  };
  // computed stats
  const CALC = {
    kd: p => (p['s-tags'] || 0) / Math.max(p['s-pops'] || 0, 1),
  };
  const val = (p, k) => CALC[k] ? CALC[k](p) : p[k] || 0;

  const KEY = 'tpLeaderboards';
  let cfg = {};
  try { cfg = JSON.parse(localStorage[KEY]); } catch {}
  cfg = { n: 5, on: ['score'], pos: {}, ...cfg };
  const save = () => { try { localStorage[KEY] = JSON.stringify(cfg); } catch {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const wait = setInterval(() => {
    if (window.tagpro && tagpro.players) { clearInterval(wait); init(); }
  }, 500);

  function init() {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Teko:wght@500;600;700&display=swap';
    document.head.appendChild(font);

    document.head.insertAdjacentHTML('beforeend', `<style>
      .tplb, #tplb-btn, #tplb-menu { font-family: 'Rajdhani', sans-serif; }
      .tplb{position:fixed;z-index:9999;min-width:110px;min-height:56px;overflow:hidden;resize:both;
        background:linear-gradient(180deg,rgba(12,13,16,.94),rgba(8,9,11,.94));color:#e8eaee;
        border-radius:4px;box-shadow:0 6px 16px rgba(0,0,0,.5);user-select:none}
      .tplb-h{cursor:move;display:flex;justify-content:space-between;align-items:baseline;gap:.5em;
        padding:.25em .6em;border-bottom:1px solid rgba(255,255,255,.08)}
      .tplb-t{font-family:'Teko',sans-serif;font-weight:600;font-size:1.25em;letter-spacing:.06em;
        text-transform:uppercase;color:#eef1f5;line-height:1.1;white-space:nowrap}
      .tplb-top{font-size:.65em;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.4);white-space:nowrap}
      .tplb-r{display:flex;align-items:center;gap:.5em;padding:.18em .6em;font-weight:600;
        border-left:3px solid transparent;border-bottom:1px solid rgba(255,255,255,.035)}
      .tplb-r.tplb-red{border-left-color:#ff4655}
      .tplb-r.tplb-blue{border-left-color:#4a9dff}
      .tplb-rk{width:1.2em;text-align:center;font-size:.8em;color:rgba(255,255,255,.4);flex:0 0 auto}
      .tplb-nm{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .tplb-v{font-family:'Teko',sans-serif;font-size:1.2em;line-height:1;font-variant-numeric:tabular-nums;
        color:rgba(255,255,255,.85);flex:0 0 auto}
      .tplb-r.tplb-lead .tplb-v{font-weight:700}
      .tplb-r.tplb-lead.tplb-red .tplb-v{color:#ff4655;text-shadow:0 0 8px rgba(255,70,85,.55)}
      .tplb-r.tplb-lead.tplb-blue .tplb-v{color:#4a9dff;text-shadow:0 0 8px rgba(74,157,255,.55)}
      #tplb-btn{position:fixed;left:8px;bottom:8px;z-index:10000;cursor:pointer;
        background:rgba(12,13,16,.85);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:4px;
        font-size:12px;padding:5px 9px;opacity:.5;transition:opacity .15s ease;letter-spacing:.06em}
      #tplb-btn:hover{opacity:1}
      #tplb-menu{position:fixed;left:8px;bottom:40px;z-index:10000;display:none;padding:12px;width:260px;
        background:rgba(14,15,19,.97);border:1px solid rgba(255,255,255,.15);border-radius:6px;
        color:#eee;font-size:13px}
      #tplb-menu .tplb-lbl{display:block;margin:10px 0 4px;color:rgba(255,255,255,.6);font-size:11px;
        text-transform:uppercase;letter-spacing:.06em}
      #tplb-menu .tplb-lbl:first-child{margin-top:0}
      #tplb-menu select{background:#1a1c22;color:#fff;border:1px solid rgba(255,255,255,.15);
        border-radius:3px;padding:3px 6px;font:inherit}
      #tplb-menu .tplb-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}
      #tplb-menu input{accent-color:#4a9dff}
    </style>`);

    // menu: N dropdown + one checkbox per stat
    const btn = Object.assign(document.createElement('div'), { id: 'tplb-btn', textContent: 'LEADERBOARDS ⚙' });
    const menu = Object.assign(document.createElement('div'), { id: 'tplb-menu' });
    menu.innerHTML = `<span class="tplb-lbl">Top <select id="tplb-n">${Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
      `<option ${n === cfg.n ? 'selected' : ''}>${n}</option>`).join('')}</select> players</span>
      <span class="tplb-lbl">Stats to show</span><div class="tplb-grid">` +
      Object.entries(STATS).map(([k, v]) =>
        `<label><input type="checkbox" value="${k}" ${cfg.on.includes(k) ? 'checked' : ''}> ${v}</label>`).join('') +
      '</div>';
    document.body.append(btn, menu);
    btn.onclick = () => menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    menu.onchange = () => {
      cfg.n = +menu.querySelector('select').value;
      cfg.on = [...menu.querySelectorAll('input:checked')].map(i => i.value);
      save(); render();
    };

    const panels = {};
    function panel(k) {
      if (panels[k]) return panels[k];
      const saved = cfg.pos[k] || {};
      const el = document.createElement('div');
      el.className = 'tplb';
      const i = Object.keys(panels).length;
      Object.assign(el.style, { left: (saved.x ?? 10 + i * 30) + 'px', top: (saved.y ?? 80 + i * 30) + 'px',
        width: saved.w || '190px', height: saved.h || '' });
      el.innerHTML = `<div class="tplb-h"><span class="tplb-t">${STATS[k]}</span><span class="tplb-top"></span></div><div class="tplb-b"></div>`;
      // drag by header
      el.firstChild.onpointerdown = e => {
        const dx = e.clientX - el.offsetLeft, dy = e.clientY - el.offsetTop;
        const move = m => { el.style.left = m.clientX - dx + 'px'; el.style.top = m.clientY - dy + 'px'; };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', () => document.removeEventListener('pointermove', move), { once: true });
      };
      // text scales with width, so resizing the box scales the board
      new ResizeObserver(() => el.style.fontSize = Math.max(8, el.offsetWidth / 14) + 'px').observe(el);
      document.body.append(el);
      return panels[k] = el;
    }
    // persist position/size after any drag or resize
    document.addEventListener('pointerup', () => {
      for (const [k, el] of Object.entries(panels))
        cfg.pos[k] = { x: el.offsetLeft, y: el.offsetTop, w: el.style.width, h: el.style.height };
      save();
    });

    function render() {
      const players = Object.values(tagpro.players);
      for (const k of Object.keys(STATS)) {
        if (!cfg.on.includes(k)) { if (panels[k]) panels[k].style.display = 'none'; continue; }
        const el = panel(k);
        el.style.display = '';
        el.querySelector('.tplb-top').textContent = 'Top ' + cfg.n;
        el.lastChild.innerHTML = players
          .sort((a, b) => val(b, k) - val(a, k)).slice(0, cfg.n)
          .map((p, i) => `<div class="tplb-r ${p.team === 1 ? 'tplb-red' : 'tplb-blue'} ${i === 0 && val(p, k) > 0 ? 'tplb-lead' : ''}">
            <span class="tplb-rk">${i + 1}</span><span class="tplb-nm">${esc(p.name)}</span>
            <span class="tplb-v">${k === 'kd' ? val(p, k).toFixed(2) : val(p, k)}</span></div>`).join('');
      }
    }
    setInterval(render, 500);
    render();
  }
})();
