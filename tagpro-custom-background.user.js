// ==UserScript==
// @name         TagPro Custom Background
// @namespace    tagpro-custom-background
// @author       Claude Fable 5.1, gryff6
// @version      4.3.0
// @description  Pick a picture or video from your computer and use it as the TagPro map background.
// @match        *://*.koalabeast.com/*
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

/*
 * Homepage: a "Background" tab appears in the site nav. Open it, pick a file
 * from your computer, save. Your choice is stored by Tampermonkey, so it
 * carries across to whichever game server you end up on.
 *
 * Game page: the picture is drawn INSIDE the game canvas as a PIXI sprite at
 * the very bottom of the scene. Nothing in the page DOM is touched, so
 * TagPro's own scoreboard and other overlays are left exactly as they were,
 * and Viewport Expander's canvas swaps don't matter.
 *
 * Animated GIFs show their first frame only (a WebGL texture is a still).
 * For motion, use an .mp4 or .webm.
 *
 * Diagnostics: run tpbgDiagnose() in the console during a game.
 */

(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  const IS_GAME = /^\/game/.test(location.pathname);
  const KEY_SETTINGS = 'tpbg_settings';
  const KEY_MEDIA = 'tpbg_media';
  const MAX_MB = 15;
  const WARN_MB = 5;
  const USE_NAV_TAB = true;   // false = always use the corner button instead

  const DEFAULTS = {
    enabled: true,
    source: 'builtin',     // 'builtin' | 'file' | 'url'
    builtIn: 'split',      // 'split' | 'gradient' | 'grid'
    url: '',
    fileName: '',
    fileKind: 'image',     // 'image' | 'video'
    fit: 'cover',          // 'cover' | 'contain' | 'tile'
    opacity: 0.8,
    hideMode: 'auto',      // 'auto' | 'layer' | 'off'
    muteVideo: true,
    debug: false
  };

  const log = (...a) => console.log('[tp-bg]', ...a);
  if (IS_GAME) log('script loaded on game page');

  // --- Storage (Tampermonkey, shared across koalabeast subdomains) --------

  const store = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === 'function') return Promise.resolve(GM_getValue(key, fallback));
        if (typeof GM !== 'undefined' && GM.getValue) return GM.getValue(key, fallback);
      } catch (e) { log('read failed', e); }
      return Promise.resolve(fallback);
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') { GM_setValue(key, value); return Promise.resolve(); }
        if (typeof GM !== 'undefined' && GM.setValue) return GM.setValue(key, value);
      } catch (e) { log('write failed', e); return Promise.reject(e); }
      return Promise.reject(new Error('no storage available'));
    },
    del(key) {
      try {
        if (typeof GM_deleteValue === 'function') { GM_deleteValue(key); return Promise.resolve(); }
        if (typeof GM !== 'undefined' && GM.deleteValue) return GM.deleteValue(key);
      } catch (e) { log('delete failed', e); }
      return Promise.resolve();
    }
  };

  async function loadSettings() {
    const raw = await store.get(KEY_SETTINGS, null);
    let parsed = {};
    if (raw) { try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { parsed = {}; } }
    return Object.assign({}, DEFAULTS, parsed);
  }

  function saveSettings(s) {
    return store.set(KEY_SETTINGS, JSON.stringify(s));
  }

  // --- Built-in team-colored backgrounds ---------------------------------

  // Built-ins are generated at the exact pixel size they'll be shown at, so
  // the grid stays on TagPro's 40px tile pitch and nothing gets upscaled.
  function svgHead(w, h) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h +
           "' viewBox='0 0 " + w + " " + h + "'>";
  }
  const GRID_DIM = "<pattern id='g' width='40' height='40' patternUnits='userSpaceOnUse'>" +
    "<path d='M40 0H0V40' fill='none' stroke='#ffffff' stroke-opacity='.05' stroke-width='1'/></pattern>";
  const GRID_LIT = "<pattern id='g' width='40' height='40' patternUnits='userSpaceOnUse'>" +
    "<path d='M40 0H0V40' fill='none' stroke='#8fa4c8' stroke-opacity='.14' stroke-width='1'/></pattern>";

  const BUILT_IN = {
    split: function (w, h) {
      const rad = Math.round(Math.min(w, h) * 0.16);
      return svgHead(w, h) +
        "<defs>" +
        "<linearGradient id='r' x1='0' y1='0' x2='1' y2='1'>" +
        "<stop offset='0' stop-color='#8e1b26'/><stop offset='1' stop-color='#2b1218'/></linearGradient>" +
        "<linearGradient id='b' x1='1' y1='1' x2='0' y2='0'>" +
        "<stop offset='0' stop-color='#16357c'/><stop offset='1' stop-color='#111725'/></linearGradient>" +
        GRID_DIM + "</defs>" +
        "<rect width='" + w + "' height='" + h + "' fill='#0f1116'/>" +
        "<polygon points='0,0 " + w + ",0 0," + h + "' fill='url(#r)'/>" +
        "<polygon points='" + w + ",0 " + w + "," + h + " 0," + h + "' fill='url(#b)'/>" +
        "<line x1='" + w + "' y1='0' x2='0' y2='" + h + "' stroke='#ffffff' stroke-opacity='.16' stroke-width='2'/>" +
        "<circle cx='" + (w / 2) + "' cy='" + (h / 2) + "' r='" + rad + "' fill='none' stroke='#ffffff' stroke-opacity='.10' stroke-width='2'/>" +
        "<rect width='" + w + "' height='" + h + "' fill='url(#g)'/></svg>";
    },

    gradient: function (w, h) {
      return svgHead(w, h) +
        "<defs>" +
        "<radialGradient id='r' cx='.18' cy='.18' r='.85'>" +
        "<stop offset='0' stop-color='#c0392b' stop-opacity='.62'/>" +
        "<stop offset='1' stop-color='#c0392b' stop-opacity='0'/></radialGradient>" +
        "<radialGradient id='b' cx='.82' cy='.82' r='.85'>" +
        "<stop offset='0' stop-color='#2f5fc4' stop-opacity='.62'/>" +
        "<stop offset='1' stop-color='#2f5fc4' stop-opacity='0'/></radialGradient>" +
        "</defs>" +
        "<rect width='" + w + "' height='" + h + "' fill='#101219'/>" +
        "<rect width='" + w + "' height='" + h + "' fill='url(#r)'/>" +
        "<rect width='" + w + "' height='" + h + "' fill='url(#b)'/></svg>";
    },

    grid: function (w, h) {
      return svgHead(w, h) +
        "<defs>" +
        "<linearGradient id='w' x1='0' y1='0' x2='1' y2='0'>" +
        "<stop offset='0' stop-color='#a52633' stop-opacity='.55'/>" +
        "<stop offset='.5' stop-color='#0d0f14' stop-opacity='.15'/>" +
        "<stop offset='1' stop-color='#2a55b8' stop-opacity='.55'/></linearGradient>" +
        GRID_LIT + "</defs>" +
        "<rect width='" + w + "' height='" + h + "' fill='#0d0f14'/>" +
        "<rect width='" + w + "' height='" + h + "' fill='url(#g)'/>" +
        "<rect width='" + w + "' height='" + h + "' fill='url(#w)'/></svg>";
    }
  };

  function svgDataUri(name, w, h) {
    const fn = BUILT_IN[name] || BUILT_IN.split;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fn(w || 800, h || 600));
  }

  // Returns { src, kind } or null.
  async function resolveSource(s) {
    if (!s.enabled) return null;
    if (s.source === 'builtin') return { src: svgDataUri(s.builtIn, 800, 600), kind: 'image', builtIn: s.builtIn };
    if (s.source === 'url') {
      if (!s.url) return null;
      const kind = /\.(mp4|webm|ogv|m4v|mov)(\?|#|$)/i.test(s.url) ? 'video' : 'image';
      return { src: s.url, kind: kind };
    }
    if (s.source === 'file') {
      const data = await store.get(KEY_MEDIA, '');
      if (!data) return null;
      return { src: data, kind: s.fileKind === 'video' ? 'video' : 'image' };
    }
    return null;
  }

  // ======================================================================
  // GAME PAGE
  // ======================================================================

  const bg = { plate: null, sprite: null, texture: null, video: null, settings: null,
               builtIn: null, builtSize: '', pageKey: '', media: null };

  function whenGameReady(cb) {
    let tries = 0;
    (function poll() {
      if (W.tagpro && typeof W.tagpro.ready === 'function') W.tagpro.ready(cb);
      else if (++tries < 600) setTimeout(poll, 100);
    })();
  }

  function isTilingSprite(obj) {
    const P = W.PIXI || {};
    const T = P.TilingSprite || (P.extras && P.extras.TilingSprite);
    if (T && obj instanceof T) return true;
    return !!(obj && obj.constructor && /tilingsprite/i.test(obj.constructor.name)) ||
           !!(obj && obj.tilePosition && typeof obj.tilePosition === 'object');
  }

  // The map is baked into one big sprite; the backdrop is a repeating tile.
  // Hide the tile and anything named "background", leave the map alone.
  function hideBackgroundSprites(root, depth) {
    depth = depth || 0;
    if (!root || depth > 4) return 0;
    let hidden = 0;
    const kids = root.children || [];
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (!kid || kid === bg.sprite || kid === bg.plate) continue;
      if (isTilingSprite(kid) || (kid.name && /background/i.test(kid.name))) {
        if (kid.visible) { kid.visible = false; hidden++; }
      } else {
        hidden += hideBackgroundSprites(kid, depth + 1);
      }
    }
    return hidden;
  }

  function hideBackdrop(settings) {
    const r = W.tagpro && W.tagpro.renderer;
    if (!r || settings.hideMode === 'off') return;
    const bgLayers = [];
    if (r.layers) {
      Object.keys(r.layers).forEach(function (key) {
        if (/background/i.test(key) && r.layers[key]) bgLayers.push(r.layers[key]);
      });
    }
    if (settings.hideMode === 'layer') { bgLayers.forEach(l => { l.visible = false; }); return; }
    bgLayers.forEach(l => hideBackgroundSprites(l));
  }

  // --- Draw the background inside the canvas -----------------------------

  function makeTexture(PIXI, media) {
    if (media.kind === 'video') {
      const v = document.createElement('video');
      v.src = media.src;
      v.loop = true; v.muted = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.crossOrigin = 'anonymous';
      v.play().catch(() => {});
      bg.video = v;
      if (typeof PIXI.Texture.from === 'function') return PIXI.Texture.from(v);
      if (typeof PIXI.Texture.fromVideo === 'function') return PIXI.Texture.fromVideo(v);
    }
    if (typeof PIXI.Texture.from === 'function') return PIXI.Texture.from(media.src);
    return PIXI.Texture.fromImage(media.src, true);
  }

  function textureReady(tex) {
    if (!tex) return false;
    const bt = tex.baseTexture;
    if (!bt) return tex.width > 1 && tex.height > 1;
    if (bt.hasLoaded === false || bt.valid === false) return false;
    return bt.width > 1 && bt.height > 1;
  }

  // TagPro's stage coordinates follow canvas_width / canvas_height - that's
  // what its own viewport math and Viewport Expander both use.
  function rendererSize() {
    const r = W.tagpro.renderer;
    if (r.canvas_width && r.canvas_height) return { w: r.canvas_width, h: r.canvas_height };
    const ren = r.renderer;
    if (ren && ren.width && ren.height) {
      const res = ren.resolution || 1;
      return { w: Math.round(ren.width / res), h: Math.round(ren.height / res) };
    }
    const c = r.canvas;
    return { w: (c && (c.clientWidth || c.width)) || 1280, h: (c && (c.clientHeight || c.height)) || 800 };
  }

  function ensureInStage() {
    const stage = W.tagpro.renderer.stage;
    if (!stage) return;
    let idx = 0;
    [bg.plate, bg.sprite].forEach(function (node) {
      if (!node) return;
      if (node.parent !== stage) stage.addChildAt(node, Math.min(idx, stage.children.length));
      else if (stage.getChildIndex(node) !== idx) stage.setChildIndex(node, idx);
      idx++;
    });
  }

  function viewSize() {
    return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  }

  function canvasOffset() {
    const c = W.tagpro.renderer.canvas;
    if (!c || !c.getBoundingClientRect) return { left: 0, top: 0 };
    const b = c.getBoundingClientRect();
    return { left: b.left, top: b.top };
  }

  function refreshBuiltIn(PIXI, w, h) {
    const key = w + 'x' + h;
    if (bg.builtSize === key) return;
    bg.builtSize = key;
    const uri = svgDataUri(bg.builtIn, w, h);
    const tex = (typeof PIXI.Texture.from === 'function') ? PIXI.Texture.from(uri)
                                                           : PIXI.Texture.fromImage(uri);
    bg.texture = tex;
    if (bg.sprite) bg.sprite.texture = tex;
  }

  // The page body gets the same window-sized image as a fixed background, so
  // the area outside the canvas matches what the canvas shows inside it.
  // Only the body's background style is touched: no elements, no z-index.
  function applyPageBackground(vw, vh) {
    const s = bg.settings;
    const m = bg.media;
    if (!m) return;

    const veil = 'rgba(15,17,22,' + (1 - s.opacity).toFixed(3) + ')';
    const veilLayer = 'linear-gradient(' + veil + ',' + veil + ')';
    let key, image, size, repeat, position;

    if (bg.builtIn) {
      key = 'b:' + bg.builtIn + ':' + vw + 'x' + vh + ':' + s.opacity;
      image = 'url("' + svgDataUri(bg.builtIn, vw, vh) + '")';
      size = '100% 100%, ' + vw + 'px ' + vh + 'px';
      repeat = 'no-repeat';
      position = '0 0';
    } else if (m.kind === 'video') {
      key = 'v:' + s.opacity;
      image = 'none';
      size = 'auto';
      repeat = 'no-repeat';
      position = '0 0';
    } else {
      key = 'i:' + s.fit + ':' + s.opacity + ':' + m.src.length;
      image = 'url("' + m.src + '")';
      if (s.fit === 'tile') { size = '100% 100%, auto'; repeat = 'no-repeat, repeat'; position = '0 0'; }
      else if (s.fit === 'contain') { size = '100% 100%, contain'; repeat = 'no-repeat'; position = 'center center'; }
      else { size = '100% 100%, cover'; repeat = 'no-repeat'; position = 'center center'; }
    }

    if (bg.pageKey === key) return;
    bg.pageKey = key;

    const body = document.body;
    body.style.backgroundColor = '#0f1116';
    body.style.backgroundImage = image === 'none' ? 'none' : veilLayer + ', ' + image;
    body.style.backgroundSize = size;
    body.style.backgroundRepeat = repeat;
    body.style.backgroundPosition = position;
    body.style.backgroundAttachment = 'fixed';
  }

  function layout() {
    const s = bg.settings;
    const cs = rendererSize();
    const vs = viewSize();
    const off = canvasOffset();

    if (bg.plate) {
      bg.plate.clear();
      bg.plate.beginFill(0x0f1116);
      bg.plate.drawRect(0, 0, cs.w, cs.h);
      bg.plate.endFill();
    }

    applyPageBackground(vs.w, vs.h);

    if (bg.builtIn) {
      refreshBuiltIn(W.PIXI, vs.w, vs.h);
      if (bg.sprite) {
        bg.sprite.scale.set(1, 1);
        bg.sprite.x = Math.round(-off.left);
        bg.sprite.y = Math.round(-off.top);
      }
      return;
    }

    const tex = bg.texture;
    if (!bg.sprite || !textureReady(tex)) return;
    const tw = tex.width, th = tex.height;

    if (s.fit === 'tile') {
      bg.sprite.x = 0; bg.sprite.y = 0;
      bg.sprite.width = cs.w; bg.sprite.height = cs.h;
      if (bg.sprite.tilePosition) bg.sprite.tilePosition.set(-off.left, -off.top);
    } else {
      const k = s.fit === 'contain' ? Math.min(vs.w / tw, vs.h / th) : Math.max(vs.w / tw, vs.h / th);
      bg.sprite.scale.set(k, k);
      bg.sprite.x = Math.round((vs.w - tw * k) / 2 - off.left);
      bg.sprite.y = Math.round((vs.h - th * k) / 2 - off.top);
    }
  }

  function install(settings, media) {
    const PIXI = W.PIXI;
    const r = W.tagpro && W.tagpro.renderer;
    if (!PIXI || !PIXI.Sprite || !PIXI.Texture) { log('PIXI not reachable on window'); return false; }
    if (!r || !r.stage) { log('renderer stage not found'); return false; }

    bg.settings = settings;
    bg.media = media;
    bg.builtIn = media.builtIn || null;
    if (bg.builtIn) {
      const size = viewSize();
      refreshBuiltIn(PIXI, size.w, size.h);
    } else {
      bg.texture = makeTexture(PIXI, media);
    }

    if (settings.fit === 'tile' && !bg.builtIn) {
      const T = PIXI.TilingSprite || (PIXI.extras && PIXI.extras.TilingSprite);
      bg.sprite = T ? new T(bg.texture, 100, 100) : new PIXI.Sprite(bg.texture);
    } else {
      bg.sprite = new PIXI.Sprite(bg.texture);
    }
    bg.sprite.alpha = settings.opacity;
    if (PIXI.Graphics) bg.plate = new PIXI.Graphics();

    ensureInStage();
    layout();
    hideBackdrop(settings);
    return true;
  }

  W.tpbgInspect = function () {
    const r = W.tagpro && W.tagpro.renderer;
    if (!r) return console.log('[tp-bg] no renderer');
    console.log('[tp-bg] layers:', r.layers && Object.keys(r.layers));
    function walk(node, label, depth) {
      if (!node || depth > 4) return;
      const kids = node.children || [];
      console.log('  '.repeat(depth) + (label || '?'),
        '| type:', node.constructor && node.constructor.name,
        '| name:', node.name, '| visible:', node.visible,
        '| tiling:', isTilingSprite(node), '| children:', kids.length);
      kids.forEach((k, i) => walk(k, '[' + i + ']', depth + 1));
    }
    walk(r.stage, 'stage', 0);
  };

  W.tpbgDiagnose = async function () {
    const out = { version: '4.3.0', gamePage: IS_GAME, hasPIXI: !!W.PIXI };
    out.settings = await loadSettings();
    const media = await resolveSource(out.settings);
    out.mediaResolved = media ? media.kind + ' / ' + String(media.src).slice(0, 60) : null;
    const r = W.tagpro && W.tagpro.renderer;
    out.hasStage = !!(r && r.stage);
    out.rendererSize = r ? rendererSize() : null;
    out.viewSize = viewSize();
    out.canvasOffset = r ? canvasOffset() : null;
    out.spriteInStage = !!(bg.sprite && r && bg.sprite.parent === r.stage);
    out.spriteIndex = out.spriteInStage ? r.stage.getChildIndex(bg.sprite) : null;
    out.textureReady = textureReady(bg.texture);
    out.textureSize = bg.texture ? bg.texture.width + 'x' + bg.texture.height : null;
    console.log('[tp-bg] diagnosis', out);
    return out;
  };

  function runGame() {
    whenGameReady(function () {
      (function waitForId() {
        if (!W.tagpro.playerId) return setTimeout(waitForId, 100);
        setTimeout(async function () {
          try {
            const settings = await loadSettings();
            const media = await resolveSource(settings);
            if (!media) { log('no background configured'); return; }
            if (!install(settings, media)) return;
            log('background installed in stage');

            // Keep it at the bottom and sized to the renderer. Viewport
            // Expander rebuilds the renderer on resize; the stage survives.
            setInterval(function () {
              try { ensureInStage(); layout(); hideBackdrop(settings); }
              catch (e) { log('tick failed', e); }
            }, 500);
          } catch (e) {
            console.error('[tp-bg] failed:', e);
          }
        }, 800);
      })();
    });
  }

  // ======================================================================
  // HOMEPAGE SETTINGS PANEL
  // ======================================================================

  const PANEL_CSS = `
#tpbg-overlay{position:fixed;inset:0;background:rgba(6,8,12,.72);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif}
#tpbg-panel{width:min(560px,92vw);max-height:88vh;overflow:auto;background:#161a22;color:#e8ecf4;border:1px solid #2a3140;border-radius:10px;padding:22px 24px}
#tpbg-panel h2{margin:0 0 4px;font-size:19px;font-weight:500}
#tpbg-panel .tpbg-sub{color:#9aa6ba;font-size:13px;margin:0 0 18px}
#tpbg-panel label{display:block;font-size:13px;color:#9aa6ba;margin:14px 0 6px}
#tpbg-panel select,#tpbg-panel input[type=text]{width:100%;box-sizing:border-box;background:#0f131a;color:#e8ecf4;border:1px solid #2a3140;border-radius:6px;padding:8px 10px;font-size:14px}
#tpbg-panel input[type=range]{width:100%}
.tpbg-seg{display:flex;gap:6px}
.tpbg-seg button{flex:1;background:#0f131a;color:#9aa6ba;border:1px solid #2a3140;border-radius:6px;padding:8px;font-size:13px;cursor:pointer}
.tpbg-seg button.on{background:#1e2836;color:#e8ecf4;border-color:#3d5a86}
.tpbg-row{display:flex;gap:14px}
.tpbg-row>div{flex:1}
#tpbg-preview{margin-top:14px;height:130px;border:1px solid #2a3140;border-radius:6px;background:#0b0e13;display:flex;align-items:center;justify-content:center;overflow:hidden}
#tpbg-preview img,#tpbg-preview video{width:100%;height:100%;object-fit:cover}
#tpbg-preview span{color:#5d6779;font-size:13px}
.tpbg-actions{display:flex;gap:10px;margin-top:20px;align-items:center}
.tpbg-actions button{border-radius:6px;padding:9px 16px;font-size:14px;cursor:pointer;border:1px solid #2a3140;background:#0f131a;color:#c3ccdb}
#tpbg-save{background:#2a55b8;border-color:#2a55b8;color:#fff}
#tpbg-note{font-size:12px;color:#9aa6ba;margin-left:auto;text-align:right}
#tpbg-file{display:none}
#tpbg-pick{width:100%;text-align:left;background:#0f131a;color:#c3ccdb;border:1px dashed #3a4356;border-radius:6px;padding:10px 12px;font-size:14px;cursor:pointer}
`;

  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('could not read that file'));
      r.readAsDataURL(file);
    });
  }

  async function openPanel() {
    if (document.getElementById('tpbg-overlay')) return;
    const settings = await loadSettings();
    let pendingData = null;   // set when a new file is chosen this session

    const overlay = el('<div id="tpbg-overlay"></div>');
    const panel = el(`
      <div id="tpbg-panel">
        <h2>Map background</h2>
        <p class="tpbg-sub">Pick an image or video to sit behind the map. Saved for every server. GIFs show their first frame only; use mp4 or webm for motion.</p>

        <label>Source</label>
        <div class="tpbg-seg" id="tpbg-source">
          <button data-v="builtin">Built-in</button>
          <button data-v="file">From my computer</button>
          <button data-v="url">Web link</button>
        </div>

        <div id="tpbg-builtin-box">
          <label>Preset</label>
          <select id="tpbg-builtin">
            <option value="split">Split - diagonal red vs blue</option>
            <option value="gradient">Gradient - red and blue corners</option>
            <option value="grid">Grid - lit red to blue</option>
          </select>
        </div>

        <div id="tpbg-file-box">
          <label>File</label>
          <button id="tpbg-pick">Choose a file...</button>
          <input type="file" id="tpbg-file" accept="image/*,video/*">
        </div>

        <div id="tpbg-url-box">
          <label>Direct link</label>
          <input type="text" id="tpbg-url" placeholder="https://example.com/background.gif">
        </div>

        <div class="tpbg-row">
          <div>
            <label>Fit</label>
            <select id="tpbg-fit">
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="tile">Tile</option>
            </select>
          </div>
          <div>
            <label>Map art</label>
            <select id="tpbg-hide">
              <option value="auto">Hide backdrop only</option>
              <option value="layer">Hide whole layer</option>
              <option value="off">Keep everything</option>
            </select>
          </div>
        </div>

        <label>Opacity <span id="tpbg-oplabel"></span></label>
        <input type="range" id="tpbg-opacity" min="0" max="1" step="0.05">

        <div id="tpbg-preview"><span>No background selected</span></div>

        <div class="tpbg-actions">
          <button id="tpbg-save">Save</button>
          <button id="tpbg-off">Turn off</button>
          <button id="tpbg-close">Close</button>
          <span id="tpbg-note"></span>
        </div>
      </div>`);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const $ = id => panel.querySelector('#' + id);
    const note = msg => { $('tpbg-note').textContent = msg || ''; };

    function paintSource() {
      panel.querySelectorAll('#tpbg-source button').forEach(b =>
        b.classList.toggle('on', b.dataset.v === settings.source));
      $('tpbg-builtin-box').style.display = settings.source === 'builtin' ? '' : 'none';
      $('tpbg-file-box').style.display = settings.source === 'file' ? '' : 'none';
      $('tpbg-url-box').style.display = settings.source === 'url' ? '' : 'none';
    }

    async function paintPreview() {
      const box = $('tpbg-preview');
      box.innerHTML = '';
      const media = pendingData
        ? { src: pendingData.data, kind: pendingData.kind }
        : await resolveSource(Object.assign({}, settings, { enabled: true }));
      if (!media) { box.appendChild(el('<span>No background selected</span>')); return; }
      const node = document.createElement(media.kind === 'video' ? 'video' : 'img');
      node.src = media.src;
      node.style.opacity = String(settings.opacity);
      if (media.kind === 'video') { node.muted = true; node.loop = true; node.autoplay = true; }
      box.appendChild(node);
    }

    panel.querySelectorAll('#tpbg-source button').forEach(b => {
      b.onclick = () => { settings.source = b.dataset.v; paintSource(); paintPreview(); };
    });

    $('tpbg-builtin').value = settings.builtIn;
    $('tpbg-builtin').onchange = e => { settings.builtIn = e.target.value; paintPreview(); };

    $('tpbg-url').value = settings.url;
    $('tpbg-url').oninput = e => { settings.url = e.target.value.trim(); };
    $('tpbg-url').onchange = paintPreview;

    $('tpbg-fit').value = settings.fit;
    $('tpbg-fit').onchange = e => { settings.fit = e.target.value; };

    $('tpbg-hide').value = settings.hideMode;
    $('tpbg-hide').onchange = e => { settings.hideMode = e.target.value; };

    $('tpbg-opacity').value = settings.opacity;
    $('tpbg-oplabel').textContent = Math.round(settings.opacity * 100) + '%';
    $('tpbg-opacity').oninput = e => {
      settings.opacity = parseFloat(e.target.value);
      $('tpbg-oplabel').textContent = Math.round(settings.opacity * 100) + '%';
      const n = $('tpbg-preview').firstElementChild;
      if (n) n.style.opacity = String(settings.opacity);
    };

    $('tpbg-pick').onclick = () => $('tpbg-file').click();
    $('tpbg-file').onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const mb = file.size / 1048576;
      if (mb > MAX_MB) { note('Too big (' + mb.toFixed(1) + ' MB). Keep it under ' + MAX_MB + ' MB.'); return; }
      note('Reading ' + file.name + '...');
      try {
        const data = await fileToDataUrl(file);
        pendingData = { data: data, kind: /^video\//.test(file.type) ? 'video' : 'image', name: file.name };
        settings.fileName = file.name;
        settings.fileKind = pendingData.kind;
        settings.source = 'file';
        $('tpbg-pick').textContent = file.name;
        paintSource();
        await paintPreview();
        note(mb > WARN_MB ? 'Large file - saving may take a moment.' : 'Ready. Press save.');
      } catch (err) {
        note(err.message);
      }
    };

    $('tpbg-save').onclick = async () => {
      note('Saving...');
      try {
        if (pendingData) { await store.set(KEY_MEDIA, pendingData.data); pendingData = null; }
        settings.enabled = true;
        await saveSettings(settings);
        note('Saved. Takes effect next game.');
      } catch (err) {
        note('Save failed: ' + err.message);
      }
    };

    $('tpbg-off').onclick = async () => {
      settings.enabled = false;
      await saveSettings(settings);
      note('Turned off.');
    };

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    $('tpbg-close').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    if (settings.fileName) $('tpbg-pick').textContent = settings.fileName;
    paintSource();
    paintPreview();
  }

  // Clone a real nav item so the new tab carries the exact same markup and
  // classes, then verify the nav's box didn't change. If it did, back out.
  function addNavTab() {
    if (document.getElementById('tpbg-tab')) return true;

    const anchor = Array.from(document.querySelectorAll('a')).find(function (a) {
      return /^(groups|leaders|maps)$/i.test((a.textContent || '').trim());
    });
    if (!anchor) return false;

    const item = anchor.closest('li') || anchor;
    const container = item.parentElement;
    if (!container) return false;
    const outer = container.parentElement || container;

    const before = [container.offsetHeight, outer.offsetHeight, container.offsetTop].join(',');

    const clone = item.cloneNode(true);
    clone.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    clone.removeAttribute('id');
    clone.classList.remove('active', 'selected', 'current');
    const link = clone.tagName === 'A' ? clone : clone.querySelector('a');
    if (!link) return false;
    link.classList.remove('active', 'selected', 'current');
    link.textContent = 'Background';
    link.href = '#';
    link.removeAttribute('target');
    link.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
    clone.id = 'tpbg-tab';

    container.appendChild(clone);

    const after = [container.offsetHeight, outer.offsetHeight, container.offsetTop].join(',');
    if (before !== after) {
      clone.remove();
      return false;
    }
    return true;
  }

  function addFloatingButton() {
    if (document.getElementById('tpbg-fab')) return;
    const btn = el('<button id="tpbg-fab">Background</button>');
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: '99998',
      background: '#1e2836', color: '#e8ecf4', border: '1px solid #3d5a86',
      borderRadius: '6px', padding: '9px 14px', fontSize: '14px', cursor: 'pointer',
      fontFamily: 'system-ui, sans-serif'
    });
    btn.onclick = openPanel;
    document.body.appendChild(btn);
  }

  function runHome() {
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    // The nav may be built by the page's own scripts after DOMContentLoaded,
    // so give it a few tries before settling for the corner button.
    let tries = 0;
    (function attempt() {
      if (addNavTab()) return;
      if (++tries < 10) return setTimeout(attempt, 300);
      addFloatingButton();
    })();
  }

  // ======================================================================

  if (IS_GAME) {
    runGame();
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runHome);
    } else {
      runHome();
    }
  }
})();
