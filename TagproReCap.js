// ==UserScript==
// @name         TagPro ReCap - Cap Reel
// @namespace    https://tagpro.koalabeast.com/
// @version      1.0.1
// @description  In a replay: one click records every capture (whole run, camera on the capper) as a 1080p60 video, rendered by the game itself with your texture pack. Can also build a "caps only" replay file for the Upload tab.
// @author       Claude Fable 5.1, gryff6
// @match        https://tagpro.koalabeast.com/game*
// @match        https://tagpro.gg/game*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (!window.tagproConfig || !tagproConfig.replay) return;

    // ------------------------------------------------------------------ config
    const DEFAULTS = {
        pre: 2.5,          // seconds before the run starts
        post: 2.5,         // seconds after the cap
        mode: 'run',       // 'run' = from the grab, 'fixed' = last N seconds before the cap
        before: 8,         // N for 'fixed'
        zoom: 1.0,         // 1 = in-game view (16:9, 1280x720 world px); <1 closer, >1 wider
        hideHud: true,     // hide score / timer / flag indicators while recording
        banners: true,     // "CAP n" card during the lead-in + CAPTURE banner after the cap
        fades: true,       // short fade to black between clips
        bg: '#000000',     // colour behind the map (the canvas is transparent)
        width: 1920, height: 1080, fps: 60, bitrate: 14e6,
    };
    const LS_KEY = 'tpCapReel';
    const CFG = Object.assign({}, DEFAULTS, safeParse(localStorage.getItem(LS_KEY)));
    function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }
    function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(CFG)); } catch (e) { /* ignore */ } }

    const TEAM_COLOR = { 1: '#ff4655', 2: '#4a9dff' };

    // ------------------------------------------------------------------ helpers
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
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
    function metaPlayers() {
        const meta = (tagpro.replayData.packets.find((p) => p[1] === 'recorder-metadata') || [])[2] || {};
        const out = {};
        for (const p of meta.players || []) out[p.id] = { name: p.displayName, team: p.team };
        return out;
    }
    function playerInfo(pid) {
        const mp = metaPlayers()[pid];
        const live = tagpro.players[pid];
        return { name: (live && live.name) || (mp && mp.name) || ('#' + pid), team: (live && live.team) || (mp && mp.team) || 0 };
    }

    // ------------------------------------------------------------------ caps
    function findCaps() {
        const tl = tagpro.replayData.timeline || {};
        const caps = [];
        for (const k of Object.keys(tl)) {
            if (!/^\d+$/.test(k)) continue;
            const pid = Number(k);
            const ev = tl[k];
            for (const [t, name] of ev) {
                if (name !== 's-captures') continue;
                const grabs = ev.filter((e) => e[1] === 's-grabs' && e[0] < t);
                const grab = grabs.length ? grabs[grabs.length - 1][0] : t - 8000;
                const info = playerInfo(pid);
                caps.push({ t, grab, pid, name: info.name, team: info.team });
            }
        }
        caps.sort((a, b) => a.t - b.t);
        caps.forEach((c, i) => { c.index = i + 1; });
        return caps;
    }
    function clipWindow(cap) {
        const start = CFG.mode === 'run' ? cap.grab : cap.t - CFG.before * 1000;
        const minTS = tagpro.replayData.minTS || 0;
        return { t0: Math.max(minTS, start - CFG.pre * 1000), t1: cap.t + CFG.post * 1000 };
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
    function seekPaused(t) {
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
        pauseUI();
    }
    function follow(pid) {
        const vp = tagpro.viewport;
        vp.overview = false; vp.centerLock = false; vp.followPlayer = true;
        if (typeof tagpro.replayFollowPlayer === 'function') tagpro.replayFollowPlayer(pid);   // same as clicking a name in the player list
        else tagpro.replayPlayer.emit('id', pid);
        tagpro.playerId = pid;
        vp.pan = false; vp.panning = false; vp.newTarget = false;   // skip the 750 ms pan animation
        tagpro.zoom = CFG.zoom; tagpro.renderer.forceZoomUpdate = true;
    }

    // ------------------------------------------------------------------ record mode (canvas size, HUD)
    let saved = null;
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
        saved = {
            cw: r.canvas_width, ch: r.canvas_height, resizeView: r.resizeView, centerView: r.centerView,
            dvs: r.options.disableViewportScaling, ui: r.layers.ui.visible, zoom: tagpro.zoom,
            vp: Object.assign({}, tagpro.viewport), playerId: tagpro.playerId, style: r.canvas.getAttribute('style') || '',
        };
        r.canvas_width = 1280; r.canvas_height = Math.round(1280 * CFG.height / CFG.width);   // 1280x720 world px -> 1920x1080 (1.5x)
        r.options.disableViewportScaling = false;
        r.resizeView = function () {
            if (!r.renderer) return;
            r.originalWidth = r.canvas_width; r.originalHeight = r.canvas_height;
            r.adjustedWidth = CFG.width; r.adjustedHeight = CFG.height;
            r.renderer.resize(CFG.width, CFG.height);
            fitCss();
        };
        r.centerView = function () {
            fitCss();
            tagpro.ui.resize(CFG.width, CFG.height);
            r.vpWidth = CFG.width; r.vpHeight = CFG.height;
            if (tagpro.chat && tagpro.chat.resize) tagpro.chat.resize();
        };
        r.resizeAndCenterView();
        r.forceZoomUpdate = true;
        if (CFG.hideHud) r.layers.ui.visible = false;
    }
    function exitRecordMode() {
        const r = tagpro.renderer;
        if (!saved) return;
        r.canvas_width = saved.cw; r.canvas_height = saved.ch;
        r.resizeView = saved.resizeView; r.centerView = saved.centerView;
        r.options.disableViewportScaling = saved.dvs;
        r.layers.ui.visible = saved.ui;
        r.canvas.setAttribute('style', saved.style);
        r.resizeAndCenterView();
        tagpro.zoom = saved.zoom; r.forceZoomUpdate = true;
        Object.assign(tagpro.viewport, saved.vp);
        saved = null;
    }

    // ------------------------------------------------------------------ compositor + overlays
    const rec = document.createElement('canvas');
    const ctx = rec.getContext('2d');
    const state = { recording: false, abort: false, cap: null, clip: null, caps: [], status: '' };
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    const FONT = '"Poppins", "Helvetica Neue", Helvetica, Arial, sans-serif';
    function drawOverlay(t) {
        const cap = state.cap, clip = state.clip; if (!cap || !clip) return;
        const W = CFG.width, H = CFG.height, s = H / 1080;
        const grab = CFG.mode === 'run' ? cap.grab : cap.t - CFG.before * 1000;
        if (CFG.banners) {
            // intro card, bottom-left, fades out at the grab
            if (t < grab + 200) {
                const a = Math.min(1, Math.max(0, (t - clip.t0) / 300)) * Math.min(1, Math.max(0, (grab + 200 - t) / 400));
                if (a > 0) {
                    ctx.save(); ctx.globalAlpha = a;
                    const col = TEAM_COLOR[cap.team] || '#ffffff';
                    ctx.font = `600 ${Math.round(46 * s)}px ${FONT}`;
                    const nameW = ctx.measureText(cap.name).width;
                    ctx.font = `500 ${Math.round(24 * s)}px ${FONT}`;
                    const sub = `${(tagpro.teamNames[cap.team === 1 ? 'redTeamName' : 'blueTeamName'] || (cap.team === 1 ? 'Red' : 'Blue')).toUpperCase()}  ·  flag grabbed at ${fmtClock(remainingAt(grab))}`;
                    const subW = ctx.measureText(sub).width;
                    const w = Math.max(nameW, subW, 200 * s) + 70 * s, h = 150 * s, x = 60 * s, y = H - h - 60 * s;
                    ctx.fillStyle = 'rgba(13,15,20,0.85)'; roundRect(x, y, w, h, 8 * s); ctx.fill();
                    ctx.fillStyle = col; ctx.fillRect(x, y, 8 * s, h);
                    ctx.textBaseline = 'alphabetic';
                    ctx.font = `500 ${Math.round(20 * s)}px ${FONT}`; ctx.fillText(`CAP ${cap.index} OF ${state.caps.length}`, x + 36 * s, y + 38 * s);
                    ctx.fillStyle = '#ffffff'; ctx.font = `600 ${Math.round(46 * s)}px ${FONT}`; ctx.fillText(cap.name, x + 34 * s, y + 88 * s);
                    ctx.fillStyle = 'rgba(200,205,220,1)'; ctx.font = `500 ${Math.round(24 * s)}px ${FONT}`; ctx.fillText(sub, x + 36 * s, y + 124 * s);
                    ctx.restore();
                }
            }
            // capture banner, top centre
            if (t >= cap.t) {
                const u = (t - cap.t) / 1000;
                const a = Math.min(1, u / 0.18) * Math.min(1, Math.max(0, (clip.t1 - t) / 500));
                if (a > 0) {
                    ctx.save(); ctx.globalAlpha = a;
                    const col = TEAM_COLOR[cap.team] || '#ffffff';
                    const sc = tagpro.score || {}; const scoreTxt = `${sc.r || 0} – ${sc.b || 0}`;
                    ctx.font = `600 ${Math.round(34 * s)}px ${FONT}`;
                    const nameW = ctx.measureText(cap.name).width, scoreW = ctx.measureText(scoreTxt).width;
                    const w = 48 * s + nameW + 40 * s + scoreW + 48 * s, h = 84 * s, x = (W - w) / 2, y = 40 * s;
                    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + 18 * s, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 18 * s, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `500 ${Math.round(20 * s)}px ${FONT}`; ctx.fillText('CAPTURE', x + 40 * s, y + 30 * s);
                    ctx.fillStyle = '#ffffff'; ctx.font = `600 ${Math.round(34 * s)}px ${FONT}`; ctx.fillText(cap.name, x + 40 * s, y + 66 * s);
                    ctx.fillText(scoreTxt, x + w - 40 * s - scoreW, y + 56 * s);
                    ctx.restore();
                }
                if (u < 0.07) { ctx.save(); ctx.globalAlpha = 0.22 * (1 - u / 0.07); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
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
        ctx.globalAlpha = 1;
        ctx.fillStyle = CFG.bg; ctx.fillRect(0, 0, rec.width, rec.height);
        try { ctx.drawImage(tagpro.renderer.canvas, 0, 0, rec.width, rec.height); } catch (e) { /* ignore */ }
        drawOverlay(nowMs());
    }
    let renderHooked = false;
    function hookRender() {
        if (renderHooked) return;
        const r = tagpro.renderer;
        const orig = r.render;
        r.render = function () { orig.call(r); composite(); };
        renderHooked = true;
    }

    // ------------------------------------------------------------------ recording
    function pickMime() {
        const list = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'];
        return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    }
    async function recordReel(caps) {
        if (state.recording) return;
        const mime = pickMime();
        if (!mime) { setStatus('This browser cannot record video (MediaRecorder unavailable).'); return; }
        state.recording = true; state.abort = false; state.caps = caps;
        rec.width = CFG.width; rec.height = CFG.height;
        enterRecordMode();
        hookRender();
        setSpeed1();
        const stream = rec.captureStream(CFG.fps);
        const chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CFG.bitrate });
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        const stopped = new Promise((r) => { recorder.onstop = r; });
        let started = false;
        try {
            for (const cap of caps) {
                if (state.abort) break;
                const clip = clipWindow(cap);
                state.cap = cap; state.clip = clip;
                setStatus(`Cap ${cap.index}/${caps.length} — ${cap.name} … keep this tab visible`);
                seekPaused(clip.t0);
                follow(cap.pid);
                await frames(4);
                if (!started) { recorder.start(1000); started = true; } else { recorder.resume(); }
                await frames(1);
                playUI();
                await new Promise((resolve) => {
                    const tick = () => { if (state.abort || nowMs() >= clip.t1 || !player().packets[player().currentIndex]) resolve(); else requestAnimationFrame(tick); };
                    requestAnimationFrame(tick);
                });
                pauseUI();
                await frames(1);
                recorder.pause();
            }
        } catch (e) {
            console.error('[CapReel]', e); setStatus('Error: ' + e.message);
        }
        if (started) { recorder.stop(); await stopped; }
        state.recording = false; state.cap = null; state.clip = null;
        exitRecordMode();
        if (chunks.length) {
            const blob = new Blob(chunks, { type: mime.split(';')[0] });
            const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            const meta = (tagpro.replayData.packets.find((p) => p[1] === 'recorder-metadata') || [])[2] || {};
            const name = `${meta.mapName || 'tagpro'}-${meta.gameId || 'replay'}-caps.${ext}`;
            download(blob, name);
            setStatus(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB)`);
        } else {
            setStatus(state.abort ? 'Stopped.' : 'Nothing recorded — was the tab visible?');
        }
        state.lastBlob = chunks.length ? new Blob(chunks, { type: mime.split(';')[0] }) : null;
    }
    function download(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    }

    // ------------------------------------------------------------------ caps-only replay file
    const DYNAMIC = new Set([3, 4, 5, 6, 9, 10, 13, 14, 15, 16]);
    function buildCapsOnlyReplay(caps) {
        const all = tagpro.replayPlayer.player.origPackets.filter((p) => p[1] !== 'no-op');
        const firstP = all.findIndex((p) => p[1] === 'p');
        const header = all.slice(0, firstP < 0 ? all.length : firstP).filter((p) => !['time', 'score', 'id'].includes(p[1]));
        const mapPkt = header.find((p) => p[1] === 'map');
        const tiles = mapPkt ? mapPkt[2].tiles : [];
        const out = [];
        let dur = 0;
        for (const h of header) {
            const copy = JSON.parse(JSON.stringify(h)); copy[0] = 0;
            if (copy[1] === 'recorder-metadata') copy[2].capsOnly = true;
            out.push(copy);
        }
        // merge overlapping windows into stretches, remembering where each cap's lead-in starts
        const wins = caps.map((c) => Object.assign({ cap: c }, clipWindow(c))).sort((a, b) => a.t0 - b.t0);
        // Overlapping windows: if the next run starts after the previous cap, keep one continuous
        // stretch and switch the camera only after that cap has been seen (hold up to `post`
        // seconds, but move on by the time the next capper grabs). If the runs truly overlap
        // (next grab before the previous cap), rewind and show the next run from its own lead-in.
        const stretches = [];
        for (const w of wins) {
            const c = w.cap;
            const last = stretches[stretches.length - 1];
            if (last && w.t0 <= last.t1 && c.grab >= last.caps[last.caps.length - 1].t + 300) {
                const prev = last.caps[last.caps.length - 1];
                const hold = Math.min(Math.max(c.grab - prev.t, 800), CFG.post * 1000);
                const sw = Math.max(w.t0, Math.min(prev.t + hold, c.t - 300));
                last.t1 = Math.max(last.t1, w.t1); last.switches.push({ t: sw, pid: c.pid }); last.caps.push(c);
            } else {
                stretches.push({ t0: w.t0, t1: w.t1, switches: [{ t: w.t0, pid: c.pid }], caps: [c] });
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
            // snapshot
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
    function capsOnlyName() {
        const meta = (tagpro.replayData.packets.find((p) => p[1] === 'recorder-metadata') || [])[2] || {};
        return `${meta.mapName || 'tagpro'}-${meta.gameId || 'replay'}-caps-only.ndjson`;
    }
    function saveCapsOnly(caps) {
        const text = buildCapsOnlyReplay(caps);
        download(new Blob([text], { type: 'application/x-ndjson' }), capsOnlyName());
        setStatus(`Saved ${capsOnlyName()} — load it with Replays → Upload`);
    }
    function openCapsOnly(caps) {
        const text = buildCapsOnlyReplay(caps);
        const req = indexedDB.open('tagpro-game-history', 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('active-replay')) db.createObjectStore('active-replay'); };
        req.onerror = () => setStatus('Could not open the replay store: ' + req.error);
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('active-replay', 'readwrite');
            tx.objectStore('active-replay').put({ recording: text, name: capsOnlyName(), key: 'upload' }, 'active-replay');
            tx.oncomplete = () => { db.close(); window.open('/game?replay=upload', 'replay'); setStatus('Opened the caps-only replay in a new tab'); };
            tx.onerror = () => setStatus('Could not store the replay: ' + tx.error);
        };
    }

    // ------------------------------------------------------------------ UI
    let statusEl = null;
    function setStatus(s) { state.status = s; if (statusEl) statusEl.textContent = s; console.log('[CapReel] ' + s); }
    function buildPanel(caps) {
        const css = document.createElement('style');
        css.textContent = `
            #tpCapReel{position:fixed;right:12px;bottom:12px;z-index:100000;background:rgba(13,15,20,.94);color:#e8ebf2;font:13px/1.35 "Helvetica Neue",Arial,sans-serif;border:1px solid #2a2e3a;border-radius:8px;padding:10px 12px;width:270px;box-shadow:0 6px 24px rgba(0,0,0,.5)}
            #tpCapReel h4{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9aa3b8;display:flex;justify-content:space-between;align-items:center}
            #tpCapReel h4 span{cursor:pointer;color:#6b7387;font-weight:normal}
            #tpCapReel .row{display:flex;gap:6px;align-items:center;margin:4px 0}
            #tpCapReel label{flex:1;color:#c3c9d6}
            #tpCapReel input[type=number]{width:52px;background:#0b0c10;color:#fff;border:1px solid #333947;border-radius:4px;padding:2px 4px}
            #tpCapReel select{background:#0b0c10;color:#fff;border:1px solid #333947;border-radius:4px;padding:2px 4px}
            #tpCapReel button{width:100%;margin-top:6px;padding:7px 8px;border:0;border-radius:6px;background:#4a9dff;color:#fff;font-weight:600;cursor:pointer}
            #tpCapReel button.secondary{background:#2a2e3a;color:#e8ebf2}
            #tpCapReel button.stop{background:#ff4655}
            #tpCapReel button:disabled{opacity:.5;cursor:default}
            #tpCapReel .status{margin-top:8px;color:#9aa3b8;min-height:16px;word-break:break-word}
            #tpCapReel.collapsed .body{display:none}
            #tpCapReel .caps{max-height:90px;overflow:auto;color:#9aa3b8;font-size:12px;margin:4px 0 6px}
        `;
        document.head.appendChild(css);
        const el = document.createElement('div');
        el.id = 'tpCapReel';
        const capList = caps.map((c) => `<div><span style="color:${TEAM_COLOR[c.team] || '#fff'}">●</span> ${c.index}. ${c.name} — ${fmtClock(remainingAt(c.t))} (run ${((c.t - c.grab) / 1000).toFixed(1)} s)</div>`).join('');
        el.innerHTML = `
            <h4>Cap Reel <span title="collapse">–</span></h4>
            <div class="body">
              <div class="caps">${capList || 'No captures in this replay.'}</div>
              <div class="row"><label>Lead-in</label><select id="tpcrMode"><option value="run">whole run (from grab)</option><option value="fixed">last N seconds</option></select></div>
              <div class="row"><label>N (s)</label><input id="tpcrBefore" type="number" min="1" max="60" step="1"></div>
              <div class="row"><label>Before / after (s)</label><input id="tpcrPre" type="number" min="0" max="15" step="0.5"><input id="tpcrPost" type="number" min="0" max="15" step="0.5"></div>
              <div class="row"><label>View (1 = in-game, 0.8 = closer)</label><input id="tpcrZoom" type="number" min="0.5" max="2" step="0.05"></div>
              <div class="row"><label><input id="tpcrHud" type="checkbox"> hide score / timer</label></div>
              <div class="row"><label><input id="tpcrBanners" type="checkbox"> cap banners</label></div>
              <div class="row"><label><input id="tpcrFades" type="checkbox"> fades between clips</label></div>
              <button id="tpcrRecord">Record cap reel (1080p60)</button>
              <button id="tpcrStop" class="stop" style="display:none">Stop</button>
              <button id="tpcrSave" class="secondary">Save caps-only replay (.ndjson)</button>
              <button id="tpcrOpen" class="secondary">Open caps-only replay</button>
              <div class="status" id="tpcrStatus"></div>
            </div>`;
        document.body.appendChild(el);
        statusEl = el.querySelector('#tpcrStatus');
        const q = (s) => el.querySelector(s);
        q('#tpcrMode').value = CFG.mode; q('#tpcrBefore').value = CFG.before; q('#tpcrPre').value = CFG.pre; q('#tpcrPost').value = CFG.post;
        q('#tpcrZoom').value = CFG.zoom; q('#tpcrHud').checked = CFG.hideHud; q('#tpcrBanners').checked = CFG.banners; q('#tpcrFades').checked = CFG.fades;
        const read = () => {
            CFG.mode = q('#tpcrMode').value; CFG.before = +q('#tpcrBefore').value || 8; CFG.pre = +q('#tpcrPre').value || 0; CFG.post = +q('#tpcrPost').value || 0;
            CFG.zoom = Math.min(2, Math.max(0.5, +q('#tpcrZoom').value || 1)); CFG.hideHud = q('#tpcrHud').checked; CFG.banners = q('#tpcrBanners').checked; CFG.fades = q('#tpcrFades').checked;
            saveCfg();
        };
        el.addEventListener('change', read);
        q('h4 span').onclick = () => el.classList.toggle('collapsed');
        q('#tpcrRecord').onclick = async () => {
            read();
            if (!caps.length) return;
            const total = caps.reduce((s, c) => { const w = clipWindow(c); return s + (w.t1 - w.t0); }, 0) / 1000;
            setStatus(`Recording ~${Math.round(total)} s of clips in real time — keep this tab visible.`);
            el.querySelectorAll('input,select').forEach((i) => { i.disabled = true; });
            q('#tpcrRecord').disabled = true; q('#tpcrStop').style.display = '';
            await recordReel(caps);
            el.querySelectorAll('input,select').forEach((i) => { i.disabled = false; });
            q('#tpcrRecord').disabled = false; q('#tpcrStop').style.display = 'none';
        };
        q('#tpcrStop').onclick = () => { state.abort = true; };
        q('#tpcrSave').onclick = () => { read(); saveCapsOnly(caps); };
        q('#tpcrOpen').onclick = () => { read(); openCapsOnly(caps); };
        if (!pickMime()) { q('#tpcrRecord').disabled = true; setStatus('Video recording is not supported in this browser; the caps-only replay still works.'); }
    }

    // ------------------------------------------------------------------ boot
    waitFor(() => window.tagpro && tagpro.replayData && tagpro.replayData.timeline && tagpro.replayPlayer && tagpro.replayPlayer.player && tagpro.renderer && tagpro.renderer.renderer && tagpro.map && tagpro.map.length)
        .then(async () => {
            await sleep(500);
            const caps = findCaps();
            buildPanel(caps);
            const meta = (tagpro.replayData.packets.find((p) => p[1] === 'recorder-metadata') || [])[2] || {};
            if (meta.capsOnly) {
                // a caps-only file: follow whoever the file says, hide the HUD if wanted
                const vp = tagpro.viewport; vp.overview = false; vp.centerLock = false; vp.followPlayer = true; vp.pan = false; vp.panning = false; vp.newTarget = false;
                tagpro.zoom = CFG.zoom; tagpro.renderer.forceZoomUpdate = true;
                if (CFG.hideHud) tagpro.renderer.layers.ui.visible = false;
                setStatus('Caps-only replay: camera follows each capper automatically.');
            }
            window.tpCapReel = { CFG, findCaps, recordReel, buildCapsOnlyReplay, saveCapsOnly, openCapsOnly, state, follow, seekPaused, playUI, pauseUI, enterRecordMode, exitRecordMode, clipWindow };
        })
        .catch((e) => console.warn('[CapReel] not initialised:', e));
})();
