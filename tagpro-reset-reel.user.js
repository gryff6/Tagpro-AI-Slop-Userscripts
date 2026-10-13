// ==UserScript==
// @name         TagPro Reset Reel
// @namespace    https://tagpro.koalabeast.com/
// @version      1.1.3
// @description  In a replay: records only the stretches where BOTH flags are "reset" (each flag is either at home or has been carried past the halfway line) as a 1080p60 video, or builds a "reset only" replay file for the Upload tab. Sibling of TagPro Cap Reel.
// @author       Claude Sonnet 5.5, gryff6
// @match        https://tagpro.koalabeast.com/game*
// @match        https://tagpro.gg/game*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (!window.tagproConfig || !tagproConfig.replay) return;

    // ------------------------------------------------------------------ config
    // A flag counts as RESET while it sits in its base, or while it is being carried but its carrier
    // is still less than `depth` of the way along the route from the flag's base to the carrier's own
    // base (0.25 = a quarter of the way). Once the carrier is that far along, the flag is "out" and
    // the stretch ends.
    // A stretch is kept while BOTH flags are reset.
    const DEFAULTS = {
        depth: 0.25,       // a carried flag stops being reset once its carrier is this fraction of the way along the route from the flag's base to the carrier's own base
        minLen: 3,         // drop stretches shorter than this many seconds
        mergeGap: 1,       // join stretches separated by a gap shorter than this (seconds)
        pre: 0,            // seconds added before each stretch
        post: 0,           // seconds added after each stretch
        camera: 'map',     // 'map' = fixed camera, whole map in view; 'follow' = camera follows the action
        zoom: 1.0,         // 'follow' camera only: 1 = in-game view (16:9, 1280x720 world px); <1 closer, >1 wider
        hideHud: true,     // hide score / timer / flag indicators while recording
        banners: true,     // "RESET n" card at the start of each stretch
        fades: true,       // short fade to black between clips
        bg: '#000000',     // colour behind the map (the canvas is transparent)
        webm: false,       // record WebM instead of MP4 (H.264)
        lockView: true,    // while watching a reset-only replay: keep the camera on the followed player and the view at `zoom`
        loop: true,        // while watching a reset-only replay: start over when it reaches the end
        loopDelay: 1,      // seconds the last frame stays on screen before it starts over
        width: 1920, height: 1080, fps: 60, bitrate: 14e6,
    };
    const VERSION = '1.1.3';
    const LS_KEY = 'tpResetReel';
    const CFG = Object.assign({}, DEFAULTS, safeParse(localStorage.getItem(LS_KEY)));
    function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }
    function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(CFG)); } catch (e) { /* ignore */ } }

    const ACTIVE_STATES = [1, 5, 7];   // 'time' packet states in which the clock is running (play / overtime)
    const TILE = 40;
    const mapCam = () => CFG.camera !== 'follow';
    // zoom at which the whole map fits the 16:9 view (1 = 1280x720 world px)
    function fitZoom() {
        const m = tagpro.map;
        return Math.max(m.length * TILE / 1280, m[0].length * TILE / 720) * 1.02;
    }
    const zoomNow = () => (mapCam() ? fitZoom() : CFG.zoom);

    // ------------------------------------------------------------------ helpers
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frames = (n) => new Promise((r) => {
        let done = false;
        const f = () => { if (done) return; if (--n <= 0) { done = true; r(); } else requestAnimationFrame(f); };
        requestAnimationFrame(f);
        setTimeout(() => { if (!done) { done = true; r(); } }, 300 * n + 500);   // never hang if the tab stops painting
    });
    const diag = [];
    const log = (...a) => {
        const line = a.map((x) => (typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x))).join(' ');
        diag.push(new Date().toISOString().slice(11, 19) + ' ' + line);
        if (diag.length > 400) diag.shift();
        console.log('[ResetReel]', ...a);
    };
    function waitFor(fn, timeout = 60000) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            (function poll() {
                let v; try { v = fn(); } catch (e) { v = null; }
                if (v) return resolve(v);
                if (Date.now() - t0 > timeout) return reject(new Error('timeout'));
                setTimeout(poll, 200);
            })();
        });
    }
    function fmtClock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function recorderMeta() { return (tagpro.replayData.packets.find((p) => p[1] === 'recorder-metadata') || [])[2] || {}; }
    function playerName(pid) {
        const live = tagpro.players[pid];
        if (live && live.name) return live.name;
        const mp = (recorderMeta().players || []).find((p) => p.id === pid);
        return (mp && mp.displayName) || ('#' + pid);
    }

    // ------------------------------------------------------------------ reset stretches
    // One pass over the replay packets, tracking where every player is and who holds a flag.
    // `follows` is a camera schedule for the whole game: the flag carrier if there is one,
    // otherwise whoever is closest to the middle of the map.
    function findSegments() {
        const all = player().origPackets;
        const mapPkt = all.find((p) => p[1] === 'map');
        const tiles = (mapPkt && mapPkt[2].tiles) || tagpro.map;
        const w = tiles.length, h = tiles[0].length;
        let R = null, B = null;
        for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
            const v = Math.floor(Number(tiles[x][y]));
            if (v === 3 && !R) R = [x, y];
            if (v === 4 && !B) B = [x, y];
        }
        if (!R || !B) { R = [0, (h - 1) / 2]; B = [w - 1, (h - 1) / 2]; log('no red/blue flag tiles found, assuming a left/right map'); }
        const cx = (R[0] + B[0]) / 2 * TILE + TILE / 2, cy = (R[1] + B[1]) / 2 * TILE + TILE / 2;
        let ux = B[0] - R[0], uy = B[1] - R[1];
        const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
        const D = ul * TILE, thr = CFG.depth * D - D / 2;   // progress along the route = (proj + D/2) / D (red flag) or (D/2 - proj) / D (blue flag); thr is proj at `depth`
        // Player packets carry no x / y; the position is rx / ry in physics units (100 px each).
        const px = (o) => (isFinite(o.x) ? o.x : o.rx * 100), py = (o) => (isFinite(o.y) ? o.y : o.ry * 100);
        const proj = (p) => (px(p) - cx) * ux + (py(p) - cy) * uy;   // < 0: red half, > 0: blue half

        // Who carries which flag comes from the 'flag' field of the player packets (1 = red flag,
        // 2 = blue flag); if a replay has none, from the stats timeline (s-grabs, then the next
        // s-drops / s-pops / s-captures for that player; red players carry the blue flag).
        const tl = tagpro.replayData.timeline || {};
        const carryEv = [];
        for (const k of Object.keys(tl)) {
            if (!/^\d+$/.test(k)) continue;
            for (const [et, en] of tl[k]) {
                if (en === 's-grabs') carryEv.push({ t: et, pid: Number(k), on: true });
                else if (en === 's-drops' || en === 's-pops' || en === 's-captures') carryEv.push({ t: et, pid: Number(k), on: false });
            }
        }
        carryEv.sort((a, b) => a.t - b.t || (a.on ? 1 : 0) - (b.on ? 1 : 0));
        const flagFieldPresent = all.some((p) => p[1] === 'p' && (p[2].u || p[2]).some((u) => u.flag === 1 || u.flag === 2));
        const useTl = !flagFieldPresent && carryEv.some((e) => e.on);
        const metaTeam = {};
        for (const mp of recorderMeta().players || []) metaTeam[mp.id] = mp.team;
        const teamOf = (o) => Number(o.team) || Number(metaTeam[o.id]) || 0;
        let ci = 0, flagFieldSeen = 0;
        const pl = {};   // note: player packets have their own `left` (the key state), so "left the game" is tracked as `gone`
        const pname = (o) => playerName(o.id);
        const states = new Set();
        const intervals = [], follows = [];
        let gs = 0, runStart = null, cur = null, lastSwitch = -1e9, lastT = 0;
        for (const p of all) {
            const t = p[0], ev = p[1], d = p[2];
            while (ci < carryEv.length && carryEv[ci].t <= t) { const e = carryEv[ci++]; const o = pl[e.pid] || (pl[e.pid] = { id: e.pid }); o.carry = e.on; }
            if (ev === 'p') {
                for (const u of (d.u || d)) {
                    const o = pl[u.id] || (pl[u.id] = { id: u.id });
                    Object.assign(o, u);
                    if (u.flag) flagFieldSeen++;
                    if (o.dead) { o.flag = null; o.carry = false; }
                }
            } else if (ev === 'playerLeft') {
                if (pl[d]) { pl[d].gone = true; pl[d].flag = null; pl[d].carry = false; }
            } else if (ev === 'time') {
                gs = d.state; states.add(gs);
            } else continue;
            lastT = t;

            // are both flags reset right now?
            let ok = ACTIVE_STATES.includes(gs);
            const out = [];
            const alive = [];
            let carrier = null;
            for (const id of Object.keys(pl)) {
                const o = pl[id];
                if (o.gone) continue;
                const f = useTl ? (o.carry ? (teamOf(o) === 1 ? 2 : teamOf(o) === 2 ? 1 : 0) : 0) : Number(o.flag);
                if (f === 1) { carrier = o; if (proj(o) >= thr) { ok = false; out.push('red flag out, ' + pname(o) + ' ' + Math.round((proj(o) + D / 2) / D * 100) + '%'); } }       // red flag: out once its (blue) carrier has gone `depth` of the way toward the blue base
                else if (f === 2) { carrier = o; if (proj(o) <= -thr) { ok = false; out.push('blue flag out, ' + pname(o) + ' ' + Math.round((D / 2 - proj(o)) / D * 100) + '%'); } }    // blue flag: out once its (red) carrier has gone `depth` of the way toward the red base
                if (!o.dead && isFinite(px(o)) && isFinite(py(o))) alive.push(o);
            }
            if (ok && runStart == null) { runStart = t; log('t=' + (t / 1000).toFixed(1) + 's both flags reset'); }
            else if (!ok && runStart != null) { intervals.push([runStart, t]); runStart = null; log('t=' + (t / 1000).toFixed(1) + 's ' + (out.join(' + ') || 'clock not running (state ' + gs + ')')); }

            // camera target
            if (!alive.length) continue;
            const curObj = cur != null ? pl[cur] : null;
            const curValid = curObj && !curObj.gone && !curObj.dead;
            let cand = carrier && !carrier.dead ? carrier : null;
            if (!cand) {
                if (curValid && t - lastSwitch < 2500) cand = curObj;
                else cand = alive.reduce((a, b) => (Math.hypot(px(b) - cx, py(b) - cy) < Math.hypot(px(a) - cx, py(a) - cy) ? b : a));
            }
            if (cand.id !== cur && (!curValid || t - lastSwitch >= (carrier ? 800 : 2500))) {
                cur = cand.id; lastSwitch = t; follows.push({ t, pid: cur });
            }
        }
        if (runStart != null) intervals.push([runStart, lastT]);
        log('analysed ' + all.length + ' packets (flag source: ' + (useTl ? 'timeline, ' + carryEv.filter((e) => e.on).length + ' grabs' : 'packet flag field') + '; packets with a flag field: ' + flagFieldSeen + '): states seen ' + [...states].join(',') + ', ' + intervals.length + ' raw stretches, axis ' + ux.toFixed(2) + ',' + uy.toFixed(2) + ' through ' + cx + ',' + cy);

        // merge short gaps, drop short stretches
        const merged = [];
        for (const iv of intervals) {
            const last = merged[merged.length - 1];
            if (last && iv[0] - last[1] < CFG.mergeGap * 1000) last[1] = iv[1]; else merged.push(iv.slice());
        }
        const segs = merged.filter((iv) => iv[1] - iv[0] >= CFG.minLen * 1000).map((iv, i) => {
            const sched = [];
            let before = null;
            for (const f of follows) { if (f.t <= iv[0]) before = f; else if (f.t < iv[1]) sched.push(f); else break; }
            sched.unshift({ t: iv[0], pid: before ? before.pid : (follows[0] ? follows[0].pid : 1) });
            return { index: i + 1, start: iv[0], end: iv[1], name: 'Reset ' + (i + 1), pid: sched[0].pid, schedule: sched };
        });
        segs.forEach((s) => { s.count = segs.length; });
        return segs;
    }
    function clipWindow(seg) {
        const minTS = tagpro.replayData.minTS || 0;
        return { t0: Math.max(minTS, seg.start - CFG.pre * 1000), t1: seg.end + CFG.post * 1000 };
    }

    // ------------------------------------------------------------------ playback control
    // Everything goes through the replay bar's own code paths where possible, so the
    // viewer stays consistent (players re-created, splats reset, timers re-synced).
    const player = () => tagpro.replayPlayer.player;
    const nowMs = () => { const p = player(); return p.pausedAt ? p.currentTime : performance.now() - p.startedAt; };
    const $ = window.jQuery;
    function pauseUI() { if (!tagpro.replayPaused) tagpro.replayActions.playpause(); }
    function playUI() { if (tagpro.replayPaused) tagpro.replayActions.playpause(); }
    function setSpeed1() {
        const a = $ && $('a[data-replay-speed="1"]');
        if (a && a.length) a.first().trigger('click'); else tagpro.replayPlayer.speed(1);
        tagpro.replaySpeed = 1;
    }
    function seekTo(t, keepPlaying) {
        const rd = tagpro.replayData;
        t = Math.min(Math.max(t, rd.minTS || 0), rd.maxTSSeek || rd.maxTS || t);
        const bar = $ && $('#replaySeekBar');
        if (bar && bar.length && tagpro.state !== tagpro.states.ENDED) {
            bar.val(Math.round(t)).trigger('mouseup');      // the bar's handler: reset + seek + play
        } else {
            // mirror of the replay bar's seek for the case the UI refuses (game already ended)
            tagpro.replayPlayer.pause();
            tagpro.renderer.options.disableCapAnimations = true; tagpro.renderer.options.disableAllExplosions = true;
            tagpro.gameEndsAt = null; tagpro.extraTimeStartedAt = null;
            Object.keys(tagpro.players).map(Number).forEach((id) => { tagpro.players[id].lastSync = {}; tagpro.replayPlayer.emit('playerLeft', id); });
            if (tagpro.pauseableTimeouts) tagpro.pauseableTimeouts.shiftAll(-1);
            tagpro.renderer.replayReset();
            tagpro.replayPlayer.seek(t / (tagpro.replaySpeed || 1));
            setTimeout(() => { tagpro.renderer.options.disableCapAnimations = false; tagpro.renderer.options.disableAllExplosions = false; }, 0);
            tagpro.replayPlayer.play(); tagpro.replayPaused = false;
        }
        // the seek itself (re)plays the first 'time' packet, so a replay that had ended is ACTIVE again here
        pauseUI();
        if (keepPlaying) playUI();
    }
    const seekPaused = (t) => seekTo(t, false);
    const atEnd = () => { const p = player(); return !!p && !p.packets[p.currentIndex]; };
    function follow(pid) {
        state.followPid = pid;
        try {
            if (typeof tagpro.replayFollowPlayer === 'function') tagpro.replayFollowPlayer(pid);   // same as clicking a name in the player list
            else tagpro.replayPlayer.emit('id', pid);
        } catch (e) { log('replayFollowPlayer failed, forcing playerId', e); }
        enforceCamera();
    }
    // The game itself fights the camera while a replay seeks (its arrivedInGame handler puts
    // the viewer back into the map overview and resets the zoom, and an id event starts a
    // 750 ms pan), so while a clip records the camera state is re-applied every frame.
    function enforceCamera() {
        const r = tagpro.renderer;
        r.forceZoomUpdate = true;                    // re-apply container scale from the locked zoom/scale
        if (CFG.hideHud && r.layers.ui.visible) r.layers.ui.visible = false;
    }

    // ------------------------------------------------------------------ record mode (canvas size, HUD)
    // Other userscripts on the replay page (e.g. Viewport Expander) and the game itself keep
    // writing the properties the recorder depends on. Record mode turns those properties into
    // locked accessors: reads return the recorder's value, writes are remembered and applied
    // when the lock is lifted.
    let saved = null;
    const locks = [];
    function lockProp(obj, prop, value) {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        let store = obj[prop];
        Object.defineProperty(obj, prop, {
            configurable: true, enumerable: true,
            get() { return (typeof value === 'function') ? value(store) : value; },
            set(v) { store = v; },
        });
        locks.push(() => { delete obj[prop]; if (desc && (desc.get || desc.set)) Object.defineProperty(obj, prop, desc); else obj[prop] = store; });
    }
    function unlockAll() { while (locks.length) { try { locks.pop()(); } catch (e) { /* ignore */ } } }
    // Reset-only playback: the file switches the followed player itself (id packets), but other
    // scripts and the game's overview reset keep changing the view. Optional locks keep the
    // camera following and the zoom at the panel's View value.
    let viewLocked = false;
    function enterViewMode() {
        if (viewLocked) return;
        viewLocked = true;
        const on = () => CFG.lockView;
        const vp = tagpro.viewport;
        Object.defineProperty(tagpro, 'zoom', { configurable: true, enumerable: true, get() { return on() ? zoomNow() : (this.__zoomStore == null ? zoomNow() : this.__zoomStore); }, set(v) { this.__zoomStore = v; } });
        const flag = (prop, val) => { let store = vp[prop]; Object.defineProperty(vp, prop, { configurable: true, enumerable: true, get() { return on() ? val : store; }, set(v) { store = v; } }); };
        const cam = () => !mapCam();
        const flagFn = (prop, fn) => { let store = vp[prop]; Object.defineProperty(vp, prop, { configurable: true, enumerable: true, get() { return on() ? fn() : store; }, set(v) { store = v; } }); };
        flagFn('overview', () => mapCam()); flagFn('centerLock', () => mapCam()); flagFn('followPlayer', cam);
        tagpro.renderer.forceZoomUpdate = true;
        log('view mode: camera follows the schedule, view ' + CFG.zoom + ' (lock ' + (CFG.lockView ? 'on' : 'off') + ')');
    }
    // Play the reel again when it reaches the end. When the replay player runs out of packets it
    // calls its doneCallback, and the replay bar turns that into "replayEnd" (state ENDED, controls
    // disabled, nothing can play again). Taking over that callback keeps the viewer alive; the reel
    // is then restarted through the bar's own seek.
    let loopTimer = null;
    function installLoop() {
        const p = player();
        if (!p || p.__resetReelLoop) return;
        p.__resetReelLoop = true;
        const origDone = p.doneCallback;
        p.doneCallback = () => {
            if (state.restarting) return;
            if (!CFG.loop || state.recording) { if (origDone) origDone(); return; }
            state.restarting = true;
            state.loops = (state.loops || 0) + 1;
            log(`reel finished at ${(p.currentTime / 1000).toFixed(1)} s — playing it again in ${CFG.loopDelay} s (loop ${state.loops})`);
            try { pauseUI(); } catch (e) { /* ignore */ }
            setStatus(`Reel finished — starts again in ${CFG.loopDelay} s`);
            clearTimeout(loopTimer);
            loopTimer = setTimeout(restartReel, Math.max(0, (+CFG.loopDelay || 0) * 1000));
        };
        log('loop: ' + (CFG.loop ? 'on, ' + CFG.loopDelay + ' s hold' : 'off'));
    }
    function restartReel() {
        clearTimeout(loopTimer);
        if (state.recording) { state.restarting = false; return; }
        state.restarting = true;
        try {
            seekTo(tagpro.replayData.minTS || 0, true);
            enforceCamera();
            if (CFG.hideHud) tagpro.renderer.layers.ui.visible = false;
            setStatus(`Reset-only replay: playing again (loop ${state.loops || 0})`);
        } catch (e) { log('restart failed', e); setStatus('Could not restart the reel: ' + (e && e.message)); }
        state.restarting = false;
    }
    const clipActive = () => state.recording && !state.transition && !!state.followPid;
    function fitCss() {
        const c = tagpro.renderer.canvas, W = CFG.width, H = CFG.height;
        const ww = window.innerWidth, wh = window.innerHeight;
        let cw = ww, ch = Math.round(ww * H / W);
        if (ch > wh) { ch = wh; cw = Math.round(wh * W / H); }
        Object.assign(c.style, { width: cw + 'px', height: ch + 'px', position: 'absolute', left: ((ww - cw) / 2) + 'px', top: ((wh - ch) / 2) + 'px' });
    }
    function enterRecordMode() {
        const r = tagpro.renderer;
        if (saved) return;
        const worldW = 1280, worldH = Math.round(1280 * CFG.height / CFG.width);   // 1280x720 world px -> 1920x1080 (1.5x)
        saved = {
            cw: r.canvas_width, ch: r.canvas_height, resizeView: r.resizeView, centerView: r.centerView,
            dvs: r.options.disableViewportScaling, ui: r.layers.ui.visible, zoom: tagpro.zoom,
            vp: Object.assign({}, tagpro.viewport), playerId: tagpro.playerId, style: r.canvas.getAttribute('style') || '',
        };
        r.options.disableViewportScaling = false;
        r.resizeView = function () {
            const pr = r.renderer; if (!pr) return;
            r.originalWidth = worldW; r.originalHeight = worldH;
            r.adjustedWidth = CFG.width; r.adjustedHeight = CFG.height;
            if (!pr.view || pr.view.width !== CFG.width || pr.view.height !== CFG.height) pr.resize(CFG.width, CFG.height);   // resizing to the same size would still clear the canvas
            fitCss();
        };
        r.centerView = function () {
            fitCss();
            tagpro.ui.resize(CFG.width, CFG.height);
            r.vpWidth = CFG.width; r.vpHeight = CFG.height;
            if (tagpro.chat && tagpro.chat.resize) tagpro.chat.resize();
        };
        lockProp(r, 'canvas_width', worldW);
        lockProp(r, 'canvas_height', worldH);
        lockProp(r, 'resizeScaleFactor', CFG.height / worldH);
        lockProp(tagpro, 'zoom', zoomNow);
        lockProp(tagpro, 'zooming', 0);
        const vp = tagpro.viewport;
        lockProp(vp, 'overview', (s) => (clipActive() ? mapCam() : s));
        lockProp(vp, 'centerLock', (s) => (clipActive() ? mapCam() : s));
        lockProp(vp, 'followPlayer', (s) => (clipActive() ? !mapCam() : s));
        lockProp(vp, 'pan', (s) => (clipActive() ? false : s));
        lockProp(vp, 'panning', (s) => (clipActive() ? false : s));
        lockProp(vp, 'newTarget', (s) => (clipActive() ? false : s));
        lockProp(tagpro, 'playerId', (s) => (clipActive() && tagpro.players[state.followPid] ? state.followPid : s));
        r.resizeAndCenterView();
        r.forceZoomUpdate = true;
        if (CFG.hideHud) r.layers.ui.visible = false;
        log('record mode on: canvas ' + r.renderer.view.width + 'x' + r.renderer.view.height + ', world ' + worldW + 'x' + worldH + ', scale ' + r.resizeScaleFactor + ', zoom ' + tagpro.zoom);
    }
    function exitRecordMode() {
        const r = tagpro.renderer;
        if (!saved) return;
        unlockAll();
        r.canvas_width = saved.cw; r.canvas_height = saved.ch;
        r.resizeView = saved.resizeView; r.centerView = saved.centerView;
        r.options.disableViewportScaling = saved.dvs;
        r.layers.ui.visible = saved.ui;
        r.canvas.setAttribute('style', saved.style);
        tagpro.zoom = saved.zoom; tagpro.zooming = 0;
        Object.assign(tagpro.viewport, saved.vp);
        tagpro.playerId = saved.playerId;
        try { r.resizeAndCenterView(); } catch (e) { log('resizeAndCenterView on exit failed', e); }
        r.forceZoomUpdate = true;
        saved = null;
    }

    // ------------------------------------------------------------------ compositor + overlays
    const rec = document.createElement('canvas');
    Object.assign(rec.style, { position: 'fixed', left: '-10000px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    (document.body || document.documentElement).appendChild(rec);
    const ctx = rec.getContext('2d');
    const state = { recording: false, transition: false, abort: false, cap: null, clip: null, segs: [], status: '', followPid: null, framesTotal: 0, framesClip: 0, lastFrameAt: 0, pausedHidden: false, restarting: false, loops: 0 };
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    const FONT = '"Poppins", "Helvetica Neue", Helvetica, Arial, sans-serif';
    function drawOverlay(t) {
        const seg = state.cap, clip = state.clip; if (!seg || !clip) return;
        const W = CFG.width, H = CFG.height, s = H / 1080;
        if (CFG.banners && t < seg.start + 2200) {
            const a = Math.min(1, Math.max(0, (t - clip.t0) / 300)) * Math.min(1, Math.max(0, (seg.start + 2200 - t) / 500));
            if (a > 0) {
                ctx.save(); ctx.globalAlpha = a;
                const title = `RESET ${seg.index} OF ${seg.count}`;
                const big = `${fmtClock(remainingAt(seg.start))}  →  ${fmtClock(remainingAt(seg.end))}`;
                const sub = `both flags reset  ·  ${((seg.end - seg.start) / 1000).toFixed(0)} s`;
                ctx.font = `600 ${Math.round(46 * s)}px ${FONT}`; const bigW = ctx.measureText(big).width;
                ctx.font = `500 ${Math.round(24 * s)}px ${FONT}`; const subW = ctx.measureText(sub).width;
                const w = Math.max(bigW, subW, 200 * s) + 70 * s, h = 150 * s, x = 60 * s, y = H - h - 60 * s;
                ctx.fillStyle = 'rgba(13,15,20,0.85)'; roundRect(x, y, w, h, 8 * s); ctx.fill();
                ctx.fillStyle = '#9aa3b8'; ctx.fillRect(x, y, 8 * s, h);
                ctx.textBaseline = 'alphabetic';
                ctx.font = `500 ${Math.round(20 * s)}px ${FONT}`; ctx.fillText(title, x + 36 * s, y + 38 * s);
                ctx.fillStyle = '#ffffff'; ctx.font = `600 ${Math.round(46 * s)}px ${FONT}`; ctx.fillText(big, x + 34 * s, y + 88 * s);
                ctx.fillStyle = 'rgba(200,205,220,1)'; ctx.font = `500 ${Math.round(24 * s)}px ${FONT}`; ctx.fillText(sub, x + 36 * s, y + 124 * s);
                ctx.restore();
            }
        }
        if (CFG.fades) {
            const f = Math.min(1, (t - clip.t0) / 350, (clip.t1 - t) / 350);
            if (f < 1) { ctx.save(); ctx.globalAlpha = 1 - Math.max(0, f); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
        }
    }
    function remainingAt(t) {   // game clock (ms remaining) at replay time t, from the last 'time' packet
        let last = null;
        for (const p of tagpro.replayPlayer.player.origPackets) { if (p[0] > t) break; if (p[1] === 'time') last = p; }
        if (!last) return 0;
        const dt = t - last[0];
        return [5, 7].includes(last[2].state) ? last[2].time + dt : last[2].time - dt;
    }
    function composite() {
        if (!state.recording) return;
        state.lastFrameAt = performance.now();
        if (state.pausedHidden) {                          // window is back: continue the clip
            state.pausedHidden = false;
            try { playUI(); } catch (e) { /* ignore */ }
            setStatus(state.cap ? `Stretch ${state.cap.index}/${state.segs.length} … recording` : 'Recording…');
            log('window visible again, resuming');
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, rec.width, rec.height);
        state.framesTotal++;
        if (state.transition) return;                       // between clips: plain black frames
        state.framesClip++;
        ctx.fillStyle = CFG.bg; ctx.fillRect(0, 0, rec.width, rec.height);
        try { ctx.drawImage(tagpro.renderer.canvas, 0, 0, rec.width, rec.height); } catch (e) { /* ignore */ }
        drawOverlay(nowMs());
    }
    // Frames are grabbed right after PIXI has drawn the stage (same task, so the WebGL buffer is
    // still intact). The hook lives on the PIXI renderer instance; a guard loop re-installs it if
    // the instance is ever replaced while recording.
    let hookedRenderer = null;
    function hookPixiRender() {
        const r = tagpro.renderer, pr = r && r.renderer;
        if (!pr || hookedRenderer === pr) return;
        const orig = pr.render;
        pr.render = function (target, options) {
            const res = orig.call(this, target, options);
            if (state.recording && target === tagpro.renderer.stage && !(options && options.renderTexture)) composite();
            return res;
        };
        hookedRenderer = pr;
        log('frame hook installed on the PIXI renderer');
    }
    function guardLoop() {
        if (!state.recording) return;
        try { hookPixiRender(); if (clipActive()) enforceCamera(); } catch (e) { /* ignore */ }
        requestAnimationFrame(guardLoop);
    }

    // ------------------------------------------------------------------ recording
    function pickMime() {
        const list = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'];
        return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    }
    function onVisibility() {
        if (document.hidden && state.recording && clipActive() && !state.pausedHidden) {
            state.pausedHidden = true;
            try { pauseUI(); } catch (e) { /* ignore */ }
            setStatus('Paused — bring this window to the front to keep recording');
            log('tab hidden, pausing the clip');
        }
    }
    function mimeCandidates() {
        const mp4 = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'];
        const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        return (CFG.webm ? webm.concat(mp4) : mp4.concat(webm)).filter((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    }
    async function recordReel(segs) {
        if (state.recording) return;
        if (!mimeCandidates().length) { setStatus('This browser cannot record video (MediaRecorder unavailable).'); return; }
        state.recording = true; state.transition = true; state.abort = false; state.segs = segs; state.followPid = null;
        state.framesTotal = 0; state.framesClip = 0;
        clearTimeout(loopTimer); state.restarting = false;   // the recorder drives the seeks itself
        rec.width = CFG.width; rec.height = CFG.height;
        const chunks = [];
        const clipReport = [];
        let recorder = null, mime = '', stopped = null, started = false;
        const tRec0 = performance.now();
        try {
            enterRecordMode();
            hookPixiRender();
            requestAnimationFrame(guardLoop);
            setSpeed1();
            const stream = rec.captureStream(CFG.fps);
            for (const m of mimeCandidates()) {
                try { recorder = new MediaRecorder(stream, { mimeType: m, videoBitsPerSecond: CFG.bitrate }); mime = m; break; }
                catch (e) { log('MediaRecorder rejected ' + m + ': ' + e.message); }
            }
            if (!recorder) throw new Error('no usable video format for MediaRecorder');
            recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            recorder.onerror = (e) => log('recorder error', e.error || e);
            stopped = new Promise((r) => { recorder.onstop = r; });
            log('recording ' + segs.length + ' stretches as ' + mime + ' at ' + CFG.width + 'x' + CFG.height);
            // One continuous recording; the seeks between clips are covered by black frames.
            recorder.start(1000); started = true;
            state.lastFrameAt = performance.now(); state.pausedHidden = false;
            document.addEventListener('visibilitychange', onVisibility);
            // warm-up: make sure frames are actually flowing into the encoder before the first clip
            const warm0 = performance.now();
            while (chunks.length < 2 && performance.now() - warm0 < 6000) await frames(6);
            log('warm-up done: ' + chunks.length + ' chunks, ' + state.framesTotal + ' frames in ' + ((performance.now() - warm0) / 1000).toFixed(1) + 's');
            if (!state.framesTotal) throw new Error('no frames are being drawn — is the tab visible?');
            for (const seg of segs) {
                if (state.abort) break;
                const clip = clipWindow(seg);
                state.transition = true; state.cap = seg; state.clip = clip;
                setStatus(`Stretch ${seg.index}/${segs.length} (${fmtClock(remainingAt(seg.start))}) … recording (keep this window in front)`);
                log(`stretch ${seg.index}: window ${(clip.t0 / 1000).toFixed(1)}s → ${(clip.t1 / 1000).toFixed(1)}s, ${seg.schedule.length} camera targets`);
                const sched = seg.schedule;
                let si = 0;
                while (si < sched.length && sched[si].t <= clip.t0) si++;
                const firstPid = sched[Math.max(0, si - 1)].pid;
                seekPaused(clip.t0);
                follow(firstPid);
                await frames(4);
                state.framesClip = 0;
                state.transition = false;
                playUI();
                const tStart = performance.now();
                await new Promise((resolve) => {
                    const tick = () => {
                        if (state.abort || nowMs() >= clip.t1 || !player().packets[player().currentIndex]) { resolve(); return; }
                        const nt = nowMs();
                        while (si < sched.length && sched[si].t <= nt) { follow(sched[si].pid); si++; }
                        if (!state.pausedHidden && performance.now() - state.lastFrameAt > 800) {
                            // no frames are being drawn (window hidden / minimised): hold the clip until they return
                            state.pausedHidden = true;
                            try { pauseUI(); } catch (e) { /* ignore */ }
                            setStatus('Paused — bring this window to the front to keep recording');
                            log('no frames for 800 ms, pausing the clip');
                        }
                        let done = false;
                        requestAnimationFrame(() => { if (!done) { done = true; tick(); } });
                        setTimeout(() => { if (!done) { done = true; tick(); } }, 120);
                    };
                    tick();
                });
                pauseUI();
                state.transition = true;
                const real = (performance.now() - tStart) / 1000;
                clipReport.push({ seg: seg.index, seconds: real, frames: state.framesClip });
                log(`  clip done: replay time ${(nowMs() / 1000).toFixed(2)}s after ${real.toFixed(1)}s real time, ${state.framesClip} frames, ${chunks.length} chunks so far`);
                await frames(2);
            }
        } catch (e) {
            console.error('[ResetReel]', e);
            setStatus('Error: ' + e.message);
        }
        state.followPid = null;
        document.removeEventListener('visibilitychange', onVisibility);
        if (started) { try { recorder.stop(); await stopped; } catch (e) { log('stop failed', e); } }
        state.recording = false; state.transition = false; state.cap = null; state.clip = null;
        exitRecordMode();
        const wall = (performance.now() - tRec0) / 1000;
        log('summary: ' + clipReport.map((c) => `#${c.seg} ${c.seconds.toFixed(1)}s/${c.frames}f`).join(', ') + ` | total ${wall.toFixed(1)}s wall, ${state.framesTotal} frames, ${chunks.length} chunks`);
        if (chunks.length) {
            const blob = new Blob(chunks, { type: mime.split(';')[0] });
            const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            const meta = recorderMeta();
            const name = `${meta.mapName || 'tagpro'}-${meta.gameId || 'replay'}-reset.${ext}`;
            download(blob, name);
            log('saved ' + name + ' ' + blob.size + ' bytes');
            const bad = clipReport.filter((c) => c.frames < c.seconds * 10);
            setStatus(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB, ${clipReport.length} clips, ~${Math.round(wall)} s)` +
                (state.abort ? ' — stopped early' : '') + (bad.length ? ` — WARNING: too few frames for stretch ${bad.map((c) => c.seg).join(', ')}` : '') + ' — use "Copy diagnostics" if anything is missing.');
            state.lastBlob = blob;
        } else if (!state.status.startsWith('Error')) {
            setStatus(state.abort ? 'Stopped.' : 'Nothing recorded — was the tab visible?');
        }
    }
    function download(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    }

    // ------------------------------------------------------------------ reset-only replay file
    const DYNAMIC = new Set([3, 4, 5, 6, 9, 10, 13, 14, 15, 16]);
    function buildResetOnlyReplay(segs) {
        const all = tagpro.replayPlayer.player.origPackets.filter((p) => p[1] !== 'no-op');
        const firstP = all.findIndex((p) => p[1] === 'p');
        const header = all.slice(0, firstP < 0 ? all.length : firstP).filter((p) => !['time', 'score', 'id'].includes(p[1]));
        const mapPkt = header.find((p) => p[1] === 'map');
        const tiles = mapPkt ? mapPkt[2].tiles : [];
        const out = [];
        let dur = 0;
        for (const h of header) {
            const copy = JSON.parse(JSON.stringify(h)); copy[0] = 0;
            if (copy[1] === 'recorder-metadata') { copy[2].resetOnly = true; delete copy[2].follow; }   // `follow` makes the viewer auto-seek to that player's first cap
            out.push(copy);
        }
        // stretches are disjoint in time; padding that makes two windows touch merges them into one
        // continuous stretch (a rewind in a replay looks broken)
        const stretches = [];
        for (const sg of segs) {
            const w = clipWindow(sg);
            const last = stretches[stretches.length - 1];
            if (last && w.t0 <= last.t1) {
                last.t1 = Math.max(last.t1, w.t1);
                for (const e of sg.schedule) if (e.t > last.switches[last.switches.length - 1].t) last.switches.push(e);
            } else {
                stretches.push({ t0: w.t0, t1: w.t1, switches: sg.schedule.map((e) => ({ t: Math.max(e.t, w.t0), pid: e.pid })) });
            }
        }
        // state machine
        const players = {}, left = new Set(), tileNow = {}, tileEmitted = {};
        let score = { r: 0, b: 0 }, lastTime = null;
        const splats = [], spawns = [];
        let emittedSplats = 0;
        const apply = (p) => {
            const [t, ev, d] = p;
            if (ev === 'p') { for (const u of (d.u || d)) { players[u.id] = Object.assign(players[u.id] || {}, u); } }
            else if (ev === 'playerLeft') { left.add(d); }
            else if (ev === 'mapupdate') { for (const it of (Array.isArray(d) ? d : [d])) tileNow[it.x + ',' + it.y] = it.v; }
            else if (ev === 'score') score = d;
            else if (ev === 'time') lastTime = p;
            else if (ev === 'splat') splats.push(p);
            else if (ev === 'spawn') spawns.push(p);
        };
        const remaining = (t) => { if (!lastTime) return 0; const dt = t - lastTime[0]; return [5, 7].includes(lastTime[2].state) ? lastTime[2].time + dt : lastTime[2].time - dt; };
        let i = 0, o = 100;
        const emittedPlayers = new Set();
        for (const st of stretches) {
            while (i < all.length && all[i][0] <= st.t0) { apply(all[i]); i++; }
            const a = st.t0;
            // snapshot of the world at the start of the stretch
            out.push([o, 'time', { time: Math.round(remaining(a)), state: lastTime ? lastTime[2].state : 1 }]);
            out.push([o, 'score', Object.assign({}, score)]);
            for (const pid of emittedPlayers) if (left.has(Number(pid)) && players[pid] && !players[pid].__left) { out.push([o, 'playerLeft', Number(pid)]); players[pid].__left = true; }
            const full = [];
            for (const pid of Object.keys(players)) { if (left.has(Number(pid))) continue; const s = Object.assign({}, players[pid]); delete s.__left; full.push(s); emittedPlayers.add(pid); }
            if (full.length) out.push([o, 'p', full]);
            const ups = [];
            for (let x = 0; x < tiles.length; x++) for (let y = 0; y < tiles[x].length; y++) {
                const base = tiles[x][y]; const k = x + ',' + y;
                const cur = (k in tileNow) ? tileNow[k] : base;
                const prev = (k in tileEmitted) ? tileEmitted[k] : base;
                if (String(cur) !== String(prev) || (DYNAMIC.has(Math.floor(Number(base))) && String(cur) !== String(base))) { ups.push({ x, y, v: cur }); tileEmitted[k] = cur; }
            }
            if (ups.length) out.push([o, 'mapupdate', ups]);
            for (; emittedSplats < splats.length; emittedSplats++) { const sp = splats[emittedSplats]; if (sp[2].temp) continue; out.push([o, 'splat', Object.assign({}, sp[2], { temp: false })]); }
            for (const sp of spawns) if (sp[0] <= a && a < sp[0] + (sp[2].w || 0)) out.push([o, 'spawn', Object.assign({}, sp[2], { w: sp[0] + sp[2].w - a })]);
            const sw = st.switches.slice().sort((p, q) => p.t - q.t);
            out.push([o, 'id', sw[0].pid]);
            let si = 1;
            while (i < all.length && all[i][0] <= st.t1) {
                const p = all[i]; i++;
                while (si < sw.length && sw[si].t <= p[0]) { out.push([Math.round(sw[si].t - a + o), 'id', sw[si].pid]); si++; }
                apply(p);
                if (['id', 'end', 'postGameStats'].includes(p[1])) continue;
                const copy = JSON.parse(JSON.stringify(p)); copy[0] = Math.round(p[0] - a + o);
                for (const k of Object.keys(tileNow)) tileEmitted[k] = tileNow[k];
                out.push(copy);
            }
            o += Math.round(st.t1 - a) + 10;
            dur = o;
        }
        out.sort((p, q) => p[0] - q[0]);
        const meta = out.find((p) => p[1] === 'recorder-metadata'); if (meta) meta[2].duration = dur;
        return out.map((p) => JSON.stringify(p)).join('\n') + '\n';
    }
    function resetOnlyName() {
        const meta = recorderMeta();
        return `${meta.mapName || 'tagpro'}-${meta.gameId || 'replay'}-reset-only.ndjson`;
    }
    function saveResetOnly(segs) {
        const text = buildResetOnlyReplay(segs);
        download(new Blob([text], { type: 'application/x-ndjson' }), resetOnlyName());
        setStatus(`Saved ${resetOnlyName()} — load it with Replays → Upload`);
    }
    function openResetOnly(segs) {
        const text = buildResetOnlyReplay(segs);
        const req = indexedDB.open('tagpro-game-history', 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('active-replay')) db.createObjectStore('active-replay'); };
        req.onerror = () => setStatus('Could not open the replay store: ' + req.error);
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('active-replay', 'readwrite');
            tx.objectStore('active-replay').put({ recording: text, name: resetOnlyName(), key: 'upload' }, 'active-replay');
            tx.oncomplete = () => { db.close(); window.open('/game?replay=upload', 'replay'); setStatus('Opened the reset-only replay in a new tab'); };
            tx.onerror = () => setStatus('Could not store the replay: ' + tx.error);
        };
    }

    // ------------------------------------------------------------------ UI
    let statusEl = null;
    function setStatus(s) { state.status = s; if (statusEl) statusEl.textContent = s; log('status: ' + s); }
    function buildPanel(segs) {
        const css = document.createElement('style');
        css.textContent = `
            #tpResetReel{position:fixed;left:12px;bottom:12px;z-index:100000;background:rgba(13,15,20,.94);color:#e8ebf2;font:13px/1.35 "Helvetica Neue",Arial,sans-serif;border:1px solid #2a2e3a;border-radius:8px;padding:10px 12px;width:270px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
            #tpResetReel h4{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9aa3b8;display:flex;justify-content:space-between;align-items:center}
            #tpResetReel h4 span{cursor:pointer;color:#6b7387;font-weight:normal}
            #tpResetReel .row{display:flex;gap:6px;align-items:center;margin:4px 0}
            #tpResetReel label{flex:1;color:#c3c9d6}
            #tpResetReel input[type=number]{width:52px;background:#0b0c10;color:#fff;border:1px solid #333947;border-radius:4px;padding:2px 4px}
            #tpResetReel button{width:100%;margin-top:6px;padding:7px 8px;border:0;border-radius:6px;background:#4a9dff;color:#fff;font-weight:600;cursor:pointer}
            #tpResetReel button.secondary{background:#2a2e3a;color:#e8ebf2}
            #tpResetReel button.stop{background:#ff4655}
            #tpResetReel button:disabled{opacity:.5;cursor:default}
            #tpResetReel .status{margin-top:8px;color:#9aa3b8;min-height:16px;word-break:break-word}
            #tpResetReel.collapsed .body{display:none}
            #tpResetReel .segs{max-height:110px;overflow:auto;color:#9aa3b8;font-size:12px;margin:4px 0 6px}
        `;
        document.head.appendChild(css);
        const el = document.createElement('div');
        el.id = 'tpResetReel';
        el.innerHTML = `
            <h4>Reset Reel <span title="collapse">–</span></h4>
            <div class="body">
              <div class="segs" id="tpr-list"></div>
              <div class="row"><label title="A carried flag stops being reset once its carrier is this fraction of the way from the flag's base to their own base">Flag out at (0.25 = quarter of the way)</label><input id="tprDepth" type="number" min="0" max="1" step="0.05"></div>
              <div class="row"><label>Min length / merge gap (s)</label><input id="tprMinLen" type="number" min="0" max="120" step="0.5"><input id="tprMerge" type="number" min="0" max="30" step="0.5"></div>
              <div class="row"><label>Before / after (s)</label><input id="tprPre" type="number" min="0" max="15" step="0.5"><input id="tprPost" type="number" min="0" max="15" step="0.5"></div>
              <div class="row"><label>Camera</label><select id="tprCam"><option value="map">whole map, fixed</option><option value="follow">follow the action</option></select></div>
              <div class="row"><label>Follow view (1 = in-game, 0.8 = closer)</label><input id="tprZoom" type="number" min="0.5" max="2" step="0.05"></div>
              <div class="row"><label><input id="tprHud" type="checkbox"> hide score / timer</label></div>
              <div class="row"><label><input id="tprBanners" type="checkbox"> stretch banners</label></div>
              <div class="row"><label><input id="tprFades" type="checkbox"> fades between clips</label></div>
              <div class="row"><label><input id="tprWebm" type="checkbox"> record as WebM instead of MP4</label></div>
              <div class="row"><label><input id="tprLock" type="checkbox"> reset-only playback: lock the view</label></div>
              <div class="row"><label title="When the reset-only replay reaches its end, hold the last frame for this many seconds, then play the whole reel again"><input id="tprLoop" type="checkbox"> reset-only playback: replay automatically (hold, s)</label><input id="tprLoopDelay" type="number" min="0" max="60" step="0.5"></div>
              <button id="tprRecord">Record reset reel (1080p60)</button>
              <button id="tprStop" class="stop" style="display:none">Stop</button>
              <button id="tprSave" class="secondary">Save reset-only replay (.ndjson)</button>
              <button id="tprOpen" class="secondary">Open reset-only replay</button>
              <button id="tprDiag" class="secondary">Copy diagnostics</button>
              <div class="status" id="tprStatus"></div>
            </div>`;
        document.body.appendChild(el);
        statusEl = el.querySelector('#tprStatus');
        const q = (s) => el.querySelector(s);
        function renderList() {
            const total = segs.reduce((s, g) => { const w = clipWindow(g); return s + (w.t1 - w.t0); }, 0) / 1000;
            q('#tpr-list').innerHTML = segs.length
                ? `<div>${segs.length} stretches, ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')} total</div>` +
                  segs.map((g) => `<div>${g.index}. ${fmtClock(remainingAt(g.start))} → ${fmtClock(remainingAt(g.end))} (${((g.end - g.start) / 1000).toFixed(0)} s)</div>`).join('')
                : 'No stretches where both flags are reset.';
        }
        const refresh = () => { const n = findSegments(); segs.splice(0, segs.length, ...n); renderList(); };
        renderList();
        q('#tprDepth').value = CFG.depth; q('#tprMinLen').value = CFG.minLen; q('#tprMerge').value = CFG.mergeGap; q('#tprPre').value = CFG.pre; q('#tprPost').value = CFG.post;
        q('#tprCam').value = CFG.camera; q('#tprZoom').value = CFG.zoom; q('#tprHud').checked = CFG.hideHud; q('#tprBanners').checked = CFG.banners; q('#tprFades').checked = CFG.fades; q('#tprWebm').checked = !!CFG.webm; q('#tprLock').checked = CFG.lockView !== false;
        q('#tprLoop').checked = CFG.loop !== false; q('#tprLoopDelay').value = CFG.loopDelay;
        const read = () => {
            const oldKey = CFG.minLen + '/' + CFG.mergeGap + '/' + CFG.depth;
            CFG.depth = Math.min(1, Math.max(0, isFinite(parseFloat(q('#tprDepth').value)) ? parseFloat(q('#tprDepth').value) : 0.25));
            CFG.minLen = Math.max(0, +q('#tprMinLen').value || 0); CFG.mergeGap = Math.max(0, +q('#tprMerge').value || 0);
            CFG.pre = +q('#tprPre').value || 0; CFG.post = +q('#tprPost').value || 0;
            CFG.camera = q('#tprCam').value; CFG.zoom = Math.min(2, Math.max(0.5, +q('#tprZoom').value || 1)); CFG.hideHud = q('#tprHud').checked; CFG.banners = q('#tprBanners').checked; CFG.fades = q('#tprFades').checked; CFG.webm = q('#tprWebm').checked; CFG.lockView = q('#tprLock').checked; if (viewLocked) tagpro.renderer.forceZoomUpdate = true;
            const wasLoop = CFG.loop;
            CFG.loop = q('#tprLoop').checked; CFG.loopDelay = Math.min(60, Math.max(0, +q('#tprLoopDelay').value || 0));
            if (CFG.loop && !wasLoop && viewLocked && atEnd() && !state.recording) restartReel();
            if (!CFG.loop) { clearTimeout(loopTimer); state.restarting = false; }
            saveCfg();
            if (oldKey !== CFG.minLen + '/' + CFG.mergeGap + '/' + CFG.depth) refresh(); else renderList();
        };
        el.addEventListener('change', (ev) => { read(); if (ev.target && ev.target.blur) ev.target.blur(); });
        el.addEventListener('keydown', (ev) => { if ((ev.key === 'Escape' || ev.key === 'Enter') && ev.target && ev.target.blur) ev.target.blur(); });
        q('h4 span').onclick = () => el.classList.toggle('collapsed');
        q('#tprRecord').onclick = async () => {
            read();
            if (!segs.length) return;
            const total = segs.reduce((s, g) => { const w = clipWindow(g); return s + (w.t1 - w.t0); }, 0) / 1000;
            setStatus(`Recording ~${Math.round(total)} s of clips in real time — keep this window in front; it pauses itself if you switch away.`);
            el.querySelectorAll('input,select').forEach((i) => { i.disabled = true; });
            q('#tprRecord').disabled = true; q('#tprStop').style.display = '';
            await recordReel(segs.slice());
            el.querySelectorAll('input,select').forEach((i) => { i.disabled = false; });
            q('#tprRecord').disabled = false; q('#tprStop').style.display = 'none';
        };
        q('#tprStop').onclick = () => { state.abort = true; };
        q('#tprSave').onclick = () => { read(); saveResetOnly(segs); };
        q('#tprOpen').onclick = () => { read(); openResetOnly(segs); };
        q('#tprDiag').onclick = async () => {
            const meta = recorderMeta();
            const head = [`TagPro Reset Reel ${VERSION} — ${navigator.userAgent}`, `replay ${meta.mapName || ''} ${meta.gameId || ''}, ${segs.length} stretches, window ${window.innerWidth}x${window.innerHeight}, replaySpeed ${tagpro.replaySpeed}, state ${tagpro.state}`,
                `settings ${JSON.stringify(CFG)}`, `stretches ${segs.map((g) => `${g.index}:${g.start}-${g.end}`).join(' ')}`];
            const text = head.concat(diag).join('\n');
            try { await navigator.clipboard.writeText(text); setStatus('Diagnostics copied — paste them into the chat.'); }
            catch (e) { console.log(text); setStatus('Could not copy; the diagnostics were printed to the console instead.'); }
        };
        if (!pickMime()) { q('#tprRecord').disabled = true; setStatus('Video recording is not supported in this browser; the reset-only replay still works.'); }
    }

    // ------------------------------------------------------------------ boot
    waitFor(() => window.tagpro && tagpro.replayData && tagpro.replayData.timeline && tagpro.replayPlayer && tagpro.replayPlayer.player && tagpro.renderer && tagpro.renderer.renderer && tagpro.map && tagpro.map.length)
        .then(async () => {
            await sleep(500);
            const segs = findSegments();
            buildPanel(segs);
            const meta = recorderMeta();
            if (meta.resetOnly) {
                // a reset-only file: the id packets switch the camera; keep the view steady, hide the HUD if wanted
                enterViewMode();
                if (CFG.hideHud) tagpro.renderer.layers.ui.visible = false;
                installLoop();
                if (CFG.loop && atEnd()) restartReel();   // the script came up after the replay had already run out
                setStatus('Reset-only replay: camera ' + (mapCam() ? 'shows the whole map' : 'follows the action') + (CFG.loop ? ', plays again when it ends' : '') + '.');
            }
            window.tpResetReel = { CFG, findSegments, recordReel, buildResetOnlyReplay, saveResetOnly, openResetOnly, state, follow, seekTo, seekPaused, playUI, pauseUI, enterRecordMode, exitRecordMode, clipWindow, installLoop, restartReel, atEnd, segs };
        })
        .catch((e) => console.warn('[ResetReel] not initialised:', e));
})();
