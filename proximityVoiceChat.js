// ==UserScript==
// @name         TagPro Proximity Voice Chat
// @namespace    https://tagpro.koalabeast.com/
// @version      1.0.1
// @description  Peer-to-peer voice chat with the players you can see. Teammates in your viewport by default; optionally everyone in your viewport (both sides have to opt in). Push-to-talk or open mic, distance falloff, stereo panning. Everyone who wants to talk needs this script installed.
// @author       Claude Fable 5.1, gryff6
// @match        https://tagpro.koalabeast.com/*
// @match        https://*.koalabeast.com/*
// @require      https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  HOW IT WORKS (short version)
  ----------------------------
  * Audio is WebRTC, browser to browser. The only server involved is a tiny
    PeerJS "signaling" server that introduces peers to each other; it never
    carries audio. By default that's the free public one at 0.peerjs.com —
    change it in Settings if you self-host (`npx peer --port 9000`).
  * There's no lobby to join: every player's PeerJS id is derived from the
    game server you're on plus your in-game player id, so anyone in the same
    game who has this script can find you automatically.
  * Range = your viewport. Someone you can see on screen is someone you can
    talk to. Volume fades toward the edge of the screen (optional) and pans
    left/right to where they are (optional).
  * "Who": TEAM = teammates only. ALL = teammates + opponents. Your mic is
    only ever sent to people your own setting allows, so an opponent hears
    you only if BOTH of you chose ALL.
*/

(function () {
  'use strict';

  const VERSION = '1.0.1';
  const STORAGE_KEY = 'tpVoiceSettings';
  const TILE = 40;

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------
  const defaultSettings = {
    enabled: true,
    mode: 'ptt',          // 'ptt' (hold key) | 'open' (always on, key toggles mute)
    pttKey: 'v',          // key name (KeyboardEvent.key, lower-cased)
    who: 'team',          // 'team' | 'all'
    falloff: true,        // fade volume toward the edge of the viewport
    edgeGain: 0.35,       // volume at the very edge when falloff is on
    stereo: true,         // pan voices left/right to where the player is
    masterVolume: 1,
    micDeviceId: '',
    rangeTiles: 0,        // 0 = use the viewport; >0 = fixed radius in tiles instead
    showHud: true,
    server: { host: '0.peerjs.com', port: 443, path: '/', key: 'peerjs', secure: true },
  };
  let settings = deepMerge(defaultSettings, loadSettings());

  function deepMerge(base, over) {
    const out = Object.assign({}, base);
    Object.keys(over || {}).forEach((k) => {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
        out[k] = deepMerge(base[k], over[k]);
      } else if (over[k] !== undefined) {
        out[k] = over[k];
      }
    });
    return out;
  }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // ---------------------------------------------------------------------
  // Styles + HUD
  // ---------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    #tpv-hud {
      position: fixed; left: 8px; bottom: 8px; z-index: 999990;
      min-width: 170px; max-width: 260px;
      background: rgba(10,11,14,.88); color: #e8eaee;
      border: 1px solid rgba(255,255,255,.14); border-radius: 6px;
      font: 12px/1.35 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      user-select: none; box-shadow: 0 6px 16px rgba(0,0,0,.5);
    }
    #tpv-hud * { box-sizing: border-box; }
    #tpv-head {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 7px; border-bottom: 1px solid rgba(255,255,255,.1);
      cursor: default;
    }
    #tpv-head b { letter-spacing: .08em; font-size: 10px; text-transform: uppercase; color: rgba(255,255,255,.6); flex: 1; }
    #tpv-gear { background: none; border: none; color: #fff; opacity: .5; cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1; }
    #tpv-gear:hover { opacity: 1; }
    #tpv-self { display: flex; align-items: center; gap: 6px; padding: 5px 7px; font-weight: 600; }
    .tpv-mic {
      width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto;
      background: #555; box-shadow: 0 0 0 2px rgba(255,255,255,.08) inset;
    }
    .tpv-mic.tpv-live { background: #3ddc84; box-shadow: 0 0 8px 1px #3ddc84; }
    .tpv-mic.tpv-muted { background: #ff4655; }
    .tpv-mic.tpv-off { background: #333; }
    #tpv-self .tpv-tag {
      margin-left: auto; font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
      padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.75);
    }
    #tpv-self .tpv-tag.tpv-all { background: rgba(255,176,59,.2); color: #ffb03b; }
    #tpv-status { padding: 0 7px 5px; font-size: 10.5px; color: rgba(255,255,255,.5); }
    #tpv-list { padding: 2px 0 4px; }
    .tpv-row { display: flex; align-items: center; gap: 6px; padding: 2px 7px; opacity: .45; }
    .tpv-row.tpv-inrange { opacity: 1; }
    .tpv-row .tpv-dot { width: 8px; height: 8px; border-radius: 50%; background: #444; flex: 0 0 auto; }
    .tpv-row.tpv-connected .tpv-dot { background: #7a8; }
    .tpv-row.tpv-talking .tpv-dot { background: #3ddc84; box-shadow: 0 0 7px 1px #3ddc84; }
    .tpv-row.tpv-nolink .tpv-dot { background: #444; }
    .tpv-row .tpv-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .tpv-row.tpv-team-1 .tpv-name { color: #ff6b76; }
    .tpv-row.tpv-team-2 .tpv-name { color: #6fb1ff; }
    .tpv-row .tpv-meta { font-size: 9px; color: rgba(255,255,255,.4); letter-spacing: .04em; white-space: nowrap; }
    .tpv-bar { width: 26px; height: 4px; background: rgba(255,255,255,.1); border-radius: 2px; overflow: hidden; flex: 0 0 auto; }
    .tpv-bar i { display: block; height: 100%; background: #9ab; width: 0; }
    #tpv-hud.tpv-collapsed #tpv-list, #tpv-hud.tpv-collapsed #tpv-status { display: none; }

    #tpv-panel {
      position: fixed; left: 8px; bottom: 8px; z-index: 999995; width: 290px;
      max-height: calc(100vh - 24px); overflow-y: auto;
      background: rgba(14,15,19,.97); color: #eee;
      border: 1px solid rgba(255,255,255,.15); border-radius: 6px; padding: 12px;
      font: 13px/1.35 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: none;
    }
    #tpv-panel.tpv-open { display: block; }
    #tpv-panel h4 { margin: 0 0 8px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.6); display: flex; align-items: center; }
    #tpv-panel h4 span { flex: 1; }
    #tpv-panel h4 button { background: none; border: none; color: #fff; cursor: pointer; font-size: 16px; opacity: .6; }
    #tpv-panel label { display: block; margin: 9px 0 3px; color: rgba(255,255,255,.6); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; }
    #tpv-panel .tpv-r { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
    #tpv-panel input[type=text], #tpv-panel input[type=number], #tpv-panel select {
      width: 100%; background: #1a1c22; border: 1px solid rgba(255,255,255,.15); color: #fff;
      border-radius: 3px; padding: 5px 6px; font: inherit;
    }
    #tpv-panel input[type=number] { width: 70px; }
    #tpv-panel input[type=range] { accent-color: #4a9dff; width: 140px; }
    #tpv-panel .tpv-seg { display: flex; border: 1px solid rgba(255,255,255,.2); border-radius: 4px; overflow: hidden; }
    #tpv-panel .tpv-seg button { flex: 1; background: transparent; border: none; color: rgba(255,255,255,.6); padding: 5px; cursor: pointer; font: inherit; font-size: 12px; }
    #tpv-panel .tpv-seg button.tpv-on { background: #4a9dff; color: #fff; }
    #tpv-panel .tpv-seg button.tpv-on.tpv-warn { background: #b8741a; }
    #tpv-panel .tpv-hint { margin-top: 8px; font-size: 10.5px; color: rgba(255,255,255,.45); line-height: 1.4; }
    #tpv-panel .tpv-key { display: inline-block; min-width: 40px; text-align: center; padding: 4px 8px; background: #1a1c22; border: 1px solid rgba(255,255,255,.25); border-radius: 3px; cursor: pointer; font-family: monospace; }
    #tpv-panel .tpv-key.tpv-listening { border-color: #ffb03b; color: #ffb03b; }
    #tpv-panel details { margin-top: 10px; }
    #tpv-panel summary { cursor: pointer; font-size: 11px; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .06em; }
    #tpv-panel .tpv-grid2 { display: grid; grid-template-columns: 1fr 70px; gap: 6px; }
    #tpv-panel button.tpv-btn { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); color: #fff; border-radius: 3px; padding: 5px 9px; cursor: pointer; font: inherit; font-size: 12px; }
  `;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'tpv-hud';
  hud.innerHTML = `
    <div id="tpv-head"><b>Voice</b><button id="tpv-gear" title="Voice chat settings">⚙</button></div>
    <div id="tpv-self"><span class="tpv-mic tpv-off" id="tpv-self-mic"></span><span id="tpv-self-label">off</span><span class="tpv-tag" id="tpv-self-who">team</span></div>
    <div id="tpv-status"></div>
    <div id="tpv-list"></div>
  `;
  document.body.appendChild(hud);

  const panel = document.createElement('div');
  panel.id = 'tpv-panel';
  panel.innerHTML = `
    <h4><span>Voice chat v${VERSION}</span><button id="tpv-close" title="Close">×</button></h4>
    <div class="tpv-r"><span>Voice chat enabled</span><input type="checkbox" id="tpv-in-enabled"></div>
    <label>Who can you talk to</label>
    <div class="tpv-seg" id="tpv-seg-who">
      <button data-v="team">Teammates</button><button data-v="all" class="tpv-warn-opt">Everyone</button>
    </div>
    <div class="tpv-hint">Everyone = teammates plus opponents in your viewport. An opponent only hears you if they picked Everyone too.</div>
    <label>Mic mode</label>
    <div class="tpv-seg" id="tpv-seg-mode">
      <button data-v="ptt">Push to talk</button><button data-v="open">Open mic</button>
    </div>
    <div class="tpv-r"><span id="tpv-key-label">Push-to-talk key</span><span class="tpv-key" id="tpv-key" title="Click, then press a key">v</span></div>
    <label>Microphone</label>
    <select id="tpv-in-mic"><option value="">Default</option></select>
    <div class="tpv-r"><span>Incoming volume</span><input type="range" id="tpv-in-vol" min="0" max="2" step="0.05"></div>
    <div class="tpv-r"><span>Fade toward screen edge</span><input type="checkbox" id="tpv-in-falloff"></div>
    <div class="tpv-r"><span>Stereo (pan to position)</span><input type="checkbox" id="tpv-in-stereo"></div>
    <div class="tpv-r"><span>Show HUD</span><input type="checkbox" id="tpv-in-hud"></div>
    <details>
      <summary>Advanced</summary>
      <label>Range override (tiles, 0 = use viewport)</label>
      <input type="number" id="tpv-in-range" min="0" max="60" step="1">
      <label>Signaling server (PeerJS)</label>
      <div class="tpv-grid2">
        <input type="text" id="tpv-in-host" placeholder="host">
        <input type="number" id="tpv-in-port" placeholder="port">
      </div>
      <div class="tpv-grid2" style="margin-top:6px">
        <input type="text" id="tpv-in-path" placeholder="/">
        <input type="text" id="tpv-in-key" placeholder="key">
      </div>
      <div class="tpv-r"><span>Secure (wss)</span><input type="checkbox" id="tpv-in-secure"></div>
      <div class="tpv-r"><button class="tpv-btn" id="tpv-reconnect">Reconnect</button><span id="tpv-debug" style="font-size:10px;color:rgba(255,255,255,.4)"></span></div>
    </details>
    <div class="tpv-hint">Hold <b id="tpv-hint-key">V</b> to talk. Alt+V toggles voice chat. Range is whatever you can see on screen; volume fades toward the edge. Everyone who wants in needs this script — there is no account or lobby, players in the same game find each other automatically.</div>
  `;
  document.body.appendChild(panel);

  const $ = (sel) => panel.querySelector(sel);
  document.getElementById('tpv-gear').addEventListener('click', () => panel.classList.toggle('tpv-open'));
  document.getElementById('tpv-self').addEventListener('click', () => {
    if (!running) { settings.enabled = true; saveSettings(); fillPanel(); start(); }
  });
  $('#tpv-close').addEventListener('click', () => panel.classList.remove('tpv-open'));

  function fillPanel() {
    $('#tpv-in-enabled').checked = settings.enabled;
    $('#tpv-seg-who').querySelectorAll('button').forEach((b) => b.classList.toggle('tpv-on', b.dataset.v === settings.who));
    $('#tpv-seg-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('tpv-on', b.dataset.v === settings.mode));
    $('#tpv-seg-who button[data-v=all]').classList.toggle('tpv-warn', settings.who === 'all');
    $('#tpv-key').textContent = prettyKey(settings.pttKey);
    $('#tpv-hint-key').textContent = prettyKey(settings.pttKey);
    $('#tpv-key-label').textContent = settings.mode === 'ptt' ? 'Push-to-talk key' : 'Mute toggle key';
    $('#tpv-in-vol').value = settings.masterVolume;
    $('#tpv-in-falloff').checked = settings.falloff;
    $('#tpv-in-stereo').checked = settings.stereo;
    $('#tpv-in-hud').checked = settings.showHud;
    $('#tpv-in-range').value = settings.rangeTiles;
    $('#tpv-in-host').value = settings.server.host;
    $('#tpv-in-port').value = settings.server.port;
    $('#tpv-in-path').value = settings.server.path;
    $('#tpv-in-key').value = settings.server.key;
    $('#tpv-in-secure').checked = settings.server.secure;
    $('#tpv-in-mic').value = settings.micDeviceId;
    hud.style.display = settings.showHud ? '' : 'none';
  }
  function prettyKey(k) { return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k; }

  panel.addEventListener('click', (e) => {
    const seg = e.target.closest('.tpv-seg');
    if (seg && e.target.dataset.v) {
      if (seg.id === 'tpv-seg-who') { settings.who = e.target.dataset.v; broadcast({ t: 'who', who: settings.who }); }
      if (seg.id === 'tpv-seg-mode') { settings.mode = e.target.dataset.v; muted = false; pttHeld = false; }
      saveSettings(); fillPanel();
    }
  });
  panel.addEventListener('input', (e) => {
    const t = e.target;
    settings.enabled = $('#tpv-in-enabled').checked;
    settings.masterVolume = parseFloat($('#tpv-in-vol').value);
    settings.falloff = $('#tpv-in-falloff').checked;
    settings.stereo = $('#tpv-in-stereo').checked;
    settings.showHud = $('#tpv-in-hud').checked;
    settings.rangeTiles = Math.max(0, parseInt($('#tpv-in-range').value, 10) || 0);
    settings.server.host = $('#tpv-in-host').value.trim() || defaultSettings.server.host;
    settings.server.port = parseInt($('#tpv-in-port').value, 10) || defaultSettings.server.port;
    settings.server.path = $('#tpv-in-path').value.trim() || '/';
    settings.server.key = $('#tpv-in-key').value.trim() || 'peerjs';
    settings.server.secure = $('#tpv-in-secure').checked;
    if (t.id === 'tpv-in-mic') { settings.micDeviceId = t.value; saveSettings(); restartMic(); }
    if (masterGain) masterGain.gain.value = settings.masterVolume;
    saveSettings(); fillPanel();
    if (t.id === 'tpv-in-enabled') settings.enabled ? start() : stop('disabled');
  });
  $('#tpv-reconnect').addEventListener('click', () => { stop('reconnect'); start(); });

  // Key capture for the PTT / mute key
  let listeningForKey = false;
  $('#tpv-key').addEventListener('click', () => {
    listeningForKey = true;
    $('#tpv-key').classList.add('tpv-listening');
    $('#tpv-key').textContent = '…';
  });

  // ---------------------------------------------------------------------
  // Keyboard: push-to-talk / mute toggle / Alt+V
  // ---------------------------------------------------------------------
  let pttHeld = false;
  let muted = false;

  function typingInChat() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  window.addEventListener('keydown', (e) => {
    if (listeningForKey) {
      if (e.key === 'Escape') { listeningForKey = false; fillPanel(); return; }
      settings.pttKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      listeningForKey = false;
      $('#tpv-key').classList.remove('tpv-listening');
      saveSettings(); fillPanel();
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (e.altKey && (e.key === 'v' || e.key === 'V')) {
      settings.enabled = !settings.enabled; saveSettings(); fillPanel();
      settings.enabled ? start() : stop('disabled');
      return;
    }
    if (typingInChat() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (keyMatches(e)) {
      if (settings.mode === 'ptt') { if (!pttHeld) { pttHeld = true; onTalkChange(); } }
      else if (!e.repeat) { muted = !muted; onTalkChange(); }
      resumeAudio();
    }
  }, true);
  window.addEventListener('keyup', (e) => {
    if (keyMatches(e) && settings.mode === 'ptt' && pttHeld) { pttHeld = false; onTalkChange(); }
  }, true);
  window.addEventListener('blur', () => { if (pttHeld) { pttHeld = false; onTalkChange(); } });
  function keyMatches(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return k === settings.pttKey;
  }

  // ---------------------------------------------------------------------
  // Audio plumbing
  // ---------------------------------------------------------------------
  let ctx = null, masterGain = null;
  let micStream = null, micTrack = null, micOk = false;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = settings.masterVolume;
    masterGain.connect(ctx.destination);
    return ctx;
  }
  function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  window.addEventListener('mousedown', resumeAudio, true);

  async function acquireMic() {
    ensureCtx();
    const constraints = {
      audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        ...(settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : {}),
      },
    };
    try {
      micStream = await navigator.mediaDevices.getUserMedia(constraints);
      micTrack = micStream.getAudioTracks()[0];
      micOk = true;
      populateMicList();
    } catch (err) {
      // No mic / permission denied: still join, listen-only, sending silence.
      console.warn('[tpv] mic unavailable, listen-only:', err);
      const dest = ctx.createMediaStreamDestination();
      micStream = dest.stream;
      micTrack = micStream.getAudioTracks()[0];
      micOk = false;
      setStatus('No mic access — listen-only. Allow the microphone and click Reconnect.');
    }
  }
  async function populateMicList() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const sel = $('#tpv-in-mic');
      const cur = settings.micDeviceId;
      sel.innerHTML = '<option value="">Default</option>' + devs.filter((d) => d.kind === 'audioinput')
        .map((d) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || 'Microphone')}</option>`).join('');
      sel.value = cur;
    } catch (e) {}
  }
  async function restartMic() {
    // Swapping devices mid-game: replace the track on every live sender.
    if (!running) return;
    const old = micStream;
    await acquireMic();
    peers.forEach((p) => {
      if (p.media && p.media.peerConnection && p.sendTrack) {
        const fresh = micTrack.clone();
        const sender = p.media.peerConnection.getSenders().find((s) => s.track === p.sendTrack);
        if (sender) sender.replaceTrack(fresh).catch(() => {});
        p.sendTrack.stop();
        p.sendTrack = fresh;
      }
    });
    if (old) old.getTracks().forEach((t) => t.stop());
  }

  function transmitting() {
    return running && micOk && (settings.mode === 'ptt' ? pttHeld : !muted);
  }
  function onTalkChange() {
    broadcast({ t: 'talk', v: transmitting() });
    updateGates();
    renderHud();
  }

  // ---------------------------------------------------------------------
  // TagPro state helpers
  // ---------------------------------------------------------------------
  function tp() { return window.tagpro; }
  function inGame() {
    const t = tp();
    return !!(t && t.players && t.playerId && t.players[t.playerId] && !t.spectator);
  }
  function whyNotInGame() {
    const t = tp();
    if (!t) return 'Waiting for TagPro…';
    if (t.spectator) return 'Spectating — voice is for players only';
    if (!t.playerId || !t.players || !t.players[t.playerId]) return 'Waiting for the game to load…';
    return '';
  }
  function myTeam() { const t = tp(); const me = t && t.players && t.players[t.playerId]; return me ? me.team : 0; }
  function myName() { const t = tp(); const me = t && t.players && t.players[t.playerId]; return (me && me.name) || 'me'; }

  // Something stable that everyone in THIS game computes identically: the
  // game server's socket address, e.g. https://tagpro-atlanta.koalabeast.com:9003
  // (each running game has its own port).
  function gameKeyString() {
    const t = tp();
    for (const sock of [t.rawSocket, t.socket]) {
      try {
        const io = sock.io;
        if (io.uri) return io.uri;
        if (io.opts && io.opts.hostname) return io.opts.hostname + ':' + (io.opts.port || '');
      } catch (e) {}
    }
    if (t.serverHost) return t.serverHost + ':' + (t.serverPort || '');
    return location.host;
  }
  function hash36(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function peerIdFor(tpId) { return 'tpvc-' + gameHash + '-' + tpId; }
  function tpIdFromPeerId(pid) {
    const m = /^tpvc-([a-z0-9]+)-(\d+)$/.exec(pid || '');
    return m && m[1] === gameHash ? parseInt(m[2], 10) : null;
  }

  // Where is player p relative to what I can see? Returns
  //   fx, fy: signed fraction of half-viewport (-1..1 is on screen)
  //   f: max(|fx|,|fy|)  (<=1 on screen, >1 off screen)
  function viewMetrics(p) {
    const t = tp();
    const px = p.x + TILE / 2, py = p.y + TILE / 2;
    let cx, cy, hw, hh;
    const me = t.players[t.playerId];
    if (settings.rangeTiles > 0) {
      if (!me) return null;
      cx = me.x + TILE / 2; cy = me.y + TILE / 2; hw = hh = settings.rangeTiles * TILE;
    } else {
      const vb = viewportBox();
      if (!vb) return null;
      ({ cx, cy, hw, hh } = vb);
    }
    const fx = (px - cx) / hw, fy = (py - cy) / hh;
    return { fx, fy, f: Math.max(Math.abs(fx), Math.abs(fy)) };
  }
  let viewSrc = '';
  function viewportBox() {
    const t = tp();
    try {
      const r = t.renderer;
      const gc = r && r.gameContainer;
      const canvas = (r && r.canvas) || document.getElementById('viewport');
      // During the zoom-in animation at game start the container's scale
      // is ~0; the mapping is meaningless until it settles.
      if (gc && canvas && !(gc.scale && Math.abs(gc.scale.x) < 0.05)) {
        const res = (r.renderer && r.renderer.resolution) || 1;
        const W = canvas.width / res, H = canvas.height / res;
        if (typeof gc.toLocal === 'function') {
          // Accounts for any zoom/scale on the container or its parents.
          const c = gc.toLocal({ x: W / 2, y: H / 2 }, undefined, undefined, true);
          const e = gc.toLocal({ x: W, y: H }, undefined, undefined, true);
          if (isFinite(c.x) && isFinite(e.x) && e.x > c.x) { viewSrc = 'renderer'; return { cx: c.x, cy: c.y, hw: e.x - c.x, hh: e.y - c.y }; }
        }
        if (gc.position && gc.scale) {
          const sx = gc.scale.x || 1, sy = gc.scale.y || 1;
          viewSrc = 'container';
          return { cx: (W / 2 - gc.position.x) / sx, cy: (H / 2 - gc.position.y) / sy, hw: W / 2 / sx, hh: H / 2 / sy };
        }
      }
    } catch (e) {}
    const me = t.players[t.playerId];
    if (!me) return null;
    viewSrc = 'fallback';
    return { cx: me.x + TILE / 2, cy: me.y + TILE / 2, hw: 640, hh: 400 };
  }

  // Volume curve: full inside the middle of the screen, fading to edgeGain
  // at the screen edge, then to silence just past it (small hysteresis so
  // people hovering at the edge don't flicker in and out).
  function gainFor(f) {
    const FADE_OUT = 1.15, INNER = 0.6;
    if (f <= INNER) return 1;
    if (f <= 1) return settings.falloff ? lerp(1, settings.edgeGain, (f - INNER) / (1 - INNER)) : 1;
    if (f <= FADE_OUT) return lerp(settings.falloff ? settings.edgeGain : 1, 0, (f - 1) / (FADE_OUT - 1));
    return 0;
  }
  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  const SEND_RANGE = 1.3; // transmit a little past my screen edge so the other side's fade isn't cut off

  // ---------------------------------------------------------------------
  // Peer mesh
  // ---------------------------------------------------------------------
  let peer = null, running = false, gameHash = '', myTpId = 0;
  const peers = new Map(); // tpId -> entry
  let statusText = '';
  function setStatus(s) { statusText = s; }

  function entryFor(tpId) {
    let e = peers.get(tpId);
    if (!e) {
      e = {
        tpId, peerId: peerIdFor(tpId), name: '', team: 0,
        state: 'idle', lastAttempt: 0, missingSince: 0,
        media: null, data: null, sendTrack: null,
        stream: null, audioEl: null, src: null, gain: null, panner: null,
        talking: false, theirWho: 'team', f: Infinity, hear: 0, pan: 0,
      };
      peers.set(tpId, e);
    }
    return e;
  }

  function serverOpts() {
    const s = settings.server;
    return { host: s.host, port: s.port, path: s.path, key: s.key, secure: s.secure, debug: 0 };
  }

  async function start() {
    if (running || !settings.enabled) return;
    if (!inGame()) return;
    running = true;
    myTpId = tp().playerId;
    gameHash = hash36(gameKeyString());
    setStatus('Getting microphone…');
    renderHud();
    await acquireMic();
    if (!running) return; // stopped while waiting
    createPeer();
  }

  function createPeer() {
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    setStatus('Connecting to signaling server…');
    const p = new Peer(peerIdFor(myTpId), serverOpts());
    peer = p;
    p.on('open', () => { if (peer !== p) return; setStatus(''); renderHud(); });
    p.on('connection', (dc) => { if (peer !== p) return; bindData(dc); });
    p.on('call', (mc) => {
      if (peer !== p) return;
      const id = tpIdFromPeerId(mc.peer);
      if (id == null) { mc.close(); return; }
      const e = entryFor(id);
      if (e.media && e.media !== mc) { try { e.media.close(); } catch (x) {} }
      e.sendTrack = micTrack.clone();
      mc.answer(new MediaStream([e.sendTrack]));
      bindMedia(e, mc);
    });
    p.on('disconnected', () => { if (peer !== p) return; setStatus('Signaling lost — reconnecting…'); setTimeout(() => { if (peer === p && !p.destroyed) p.reconnect(); }, 1500); });
    p.on('close', () => { if (peer === p) peer = null; });
    p.on('error', (err) => {
      if (peer !== p) return;
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        const m = /peer (\S+)/.exec(err.message || '');
        const id = m && tpIdFromPeerId(m[1]);
        if (id != null) { const e = peers.get(id); if (e && e.state !== 'connected') { closeEntryLinks(e); e.state = 'absent'; } }
        return;
      }
      if (type === 'unavailable-id') {
        // My old session hasn't timed out on the server yet — try again shortly.
        setStatus('Id still in use on server — retrying…');
        setTimeout(() => { if (running && peer === p) createPeer(); }, 5000);
        return;
      }
      if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        setStatus('Signaling server unreachable — retrying…');
        setTimeout(() => { if (running && peer === p) createPeer(); }, 8000);
        return;
      }
      console.warn('[tpv] peer error', type, err);
    });
  }

  function attempt(e) {
    if (!peer || peer.disconnected || peer.destroyed || !peer.open) return;
    e.lastAttempt = Date.now();
    e.state = 'connecting';
    closeEntryLinks(e);
    const meta = { name: myName(), team: myTeam(), who: settings.who };
    const dc = peer.connect(e.peerId, { reliable: true, serialization: 'json', metadata: meta });
    bindData(dc);
    e.sendTrack = micTrack.clone();
    const mc = peer.call(e.peerId, new MediaStream([e.sendTrack]), { metadata: meta });
    bindMedia(e, mc);
  }

  function bindData(dc) {
    const id = tpIdFromPeerId(dc.peer);
    if (id == null) { dc.close(); return; }
    const e = entryFor(id);
    if (e.data && e.data !== dc) { try { e.data.close(); } catch (x) {} }
    e.data = dc;
    if (dc.metadata) { e.name = dc.metadata.name || e.name; e.team = dc.metadata.team || e.team; e.theirWho = dc.metadata.who || e.theirWho; }
    dc.on('open', () => {
      dc.send({ t: 'hello', name: myName(), team: myTeam(), who: settings.who, talk: transmitting(), v: VERSION });
    });
    dc.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') { e.name = msg.name || e.name; e.team = msg.team || e.team; e.theirWho = msg.who || 'team'; e.talking = !!msg.talk; }
      else if (msg.t === 'who') { e.theirWho = msg.who || 'team'; }
      else if (msg.t === 'talk') { e.talking = !!msg.v; }
    });
    dc.on('close', () => { if (e.data === dc) e.data = null; });
    dc.on('error', () => {});
  }

  function bindMedia(e, mc) {
    e.media = mc;
    mc.on('stream', (stream) => {
      if (e.media !== mc) return;
      attachRemote(e, stream);
      e.state = 'connected';
      renderHud();
    });
    mc.on('close', () => { if (e.media === mc) { detachRemote(e); e.media = null; if (e.state === 'connected') e.state = 'idle'; } });
    mc.on('error', () => { if (e.media === mc) { detachRemote(e); e.media = null; e.state = 'idle'; } });
  }

  function attachRemote(e, stream) {
    detachRemote(e);
    ensureCtx();
    e.stream = stream;
    // Chrome won't feed a remote WebRTC stream into Web Audio unless it's
    // also attached to a media element — keep a muted one around.
    const a = new Audio();
    a.srcObject = stream; a.muted = true; a.autoplay = true;
    a.play().catch(() => {});
    e.audioEl = a;
    e.src = ctx.createMediaStreamSource(stream);
    e.gain = ctx.createGain(); e.gain.gain.value = 0;
    e.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    e.src.connect(e.gain);
    if (e.panner) { e.gain.connect(e.panner); e.panner.connect(masterGain); } else { e.gain.connect(masterGain); }
    resumeAudio();
  }
  function detachRemote(e) {
    try { if (e.src) e.src.disconnect(); if (e.gain) e.gain.disconnect(); if (e.panner) e.panner.disconnect(); } catch (x) {}
    if (e.audioEl) { try { e.audioEl.pause(); e.audioEl.srcObject = null; } catch (x) {} }
    e.src = e.gain = e.panner = e.audioEl = e.stream = null;
    e.hear = 0;
  }
  function closeEntryLinks(e) {
    detachRemote(e);
    try { if (e.media) e.media.close(); } catch (x) {}
    try { if (e.data) e.data.close(); } catch (x) {}
    if (e.sendTrack) { try { e.sendTrack.stop(); } catch (x) {} }
    e.media = e.data = e.sendTrack = null;
    e.talking = false;
  }
  function dropEntry(id) {
    const e = peers.get(id);
    if (!e) return;
    closeEntryLinks(e);
    peers.delete(id);
  }

  function broadcast(msg) {
    peers.forEach((e) => { if (e.data && e.data.open) { try { e.data.send(msg); } catch (x) {} } });
  }

  function stop(reason) {
    running = false;
    peers.forEach((e) => closeEntryLinks(e));
    peers.clear();
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; micTrack = null; }
    micOk = false; pttHeld = false;
    setStatus(reason === 'disabled' ? 'Voice chat off (Alt+V)' : '');
    renderHud();
  }

  // Team + range gate on what *I* send, applied per peer.
  function allowedByWho(e) {
    const mt = myTeam();
    return settings.who === 'all' || (e.team && mt && e.team === mt);
  }
  function updateGates() {
    const tx = transmitting();
    peers.forEach((e) => {
      if (e.sendTrack) e.sendTrack.enabled = tx && allowedByWho(e) && e.f <= SEND_RANGE;
    });
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  const RETRY_MS = 10000, GONE_MS = 4000;
  function tick() {
    const t = tp();
    if (!inGame()) { setStatus(whyNotInGame()); renderHud(); return; }
    if (!running) {
      if (!window.Peer) { setStatus('PeerJS failed to load (check the @require URL)'); renderHud(); return; }
      if (settings.enabled) start();
      renderHud();
      return;
    }

    const now = Date.now();
    const players = t.players;

    // Discover / retry
    Object.keys(players).forEach((k) => {
      const id = parseInt(k, 10);
      const p = players[k];
      if (!p || id === myTpId) return;
      const e = entryFor(id);
      e.missingSince = 0;
      if (p.name) e.name = p.name;
      if (p.team) e.team = p.team;
      // Lower in-game id initiates; the other side just answers. The
      // initiator keeps retrying so late joiners get picked up.
      const initiator = myTpId < id;
      if (initiator && e.state !== 'connected' && e.state !== 'connecting' && now - e.lastAttempt > RETRY_MS) attempt(e);
      if (e.state === 'connecting' && now - e.lastAttempt > RETRY_MS * 2) e.state = 'idle';
    });
    // Forget players who left
    peers.forEach((e, id) => {
      if (!players[id]) {
        if (!e.missingSince) e.missingSince = now;
        else if (now - e.missingSince > GONE_MS) dropEntry(id);
      }
    });

    // Proximity: what I hear, what I send
    peers.forEach((e, id) => {
      const p = players[id];
      const m = p ? viewMetrics(p) : null;
      e.f = m ? m.f : Infinity;
      e.pan = m && settings.stereo ? Math.max(-1, Math.min(1, m.fx)) * 0.8 : 0;
      let g = 0;
      if (e.gain && (e.theirWho === 'all' || e.team === myTeam()) && allowedByWho(e)) g = gainFor(e.f);
      // Note: the other side gates what it sends by ITS "who" setting too,
      // so an opponent who didn't opt in is silent regardless of my choice.
      e.hear = g;
      if (e.gain) {
        const tc = ctx.currentTime;
        e.gain.gain.setTargetAtTime(g, tc, 0.06);
        if (e.panner) e.panner.pan.setTargetAtTime(e.pan, tc, 0.06);
      }
    });
    updateGates();
    renderHud();
  }
  setInterval(tick, 100);

  // ---------------------------------------------------------------------
  // HUD rendering
  // ---------------------------------------------------------------------
  let lastHud = 0, hudSig = '';
  function renderHud(force) {
    const now = Date.now();
    if (!force && now - lastHud < 200) return;
    lastHud = now;
    const mic = document.getElementById('tpv-self-mic');
    const label = document.getElementById('tpv-self-label');
    const who = document.getElementById('tpv-self-who');
    const tx = transmitting();
    mic.className = 'tpv-mic ' + (!running ? 'tpv-off' : tx ? 'tpv-live' : (settings.mode === 'open' && muted) ? 'tpv-muted' : '');
    label.textContent = !running ? (settings.enabled ? 'off — click to start' : 'off') : !micOk ? 'listen only' : tx ? 'talking' : settings.mode === 'ptt' ? 'hold ' + prettyKey(settings.pttKey) : muted ? 'muted' : 'open mic';
    who.textContent = settings.who === 'all' ? 'everyone' : 'team';
    who.className = 'tpv-tag' + (settings.who === 'all' ? ' tpv-all' : '');

    const st = document.getElementById('tpv-status');
    let status = statusText;
    if (!status && running && peer && !peer.open) status = 'Connecting…';
    st.textContent = status;
    st.style.display = status ? '' : 'none';

    const mt = myTeam();
    const rows = [];
    peers.forEach((e) => {
      const linked = e.state === 'connected' && !!e.gain;
      const inRange = linked && e.hear > 0;
      const teamOk = e.team === mt || (settings.who === 'all' && e.theirWho === 'all');
      const meta = !linked ? (e.state === 'absent' ? 'no script' : e.state === 'connecting' ? '…' : '') : !teamOk ? (settings.who === 'all' ? 'not opted in' : 'opp') : '';
      rows.push({ e, linked, inRange, teamOk, meta });
    });
    rows.sort((a, b) => (b.inRange - a.inRange) || (b.linked - a.linked) || (a.e.team - b.e.team) || a.e.name.localeCompare(b.e.name));
    const sig = rows.map((r) => [r.e.tpId, r.e.name, r.linked, r.inRange, r.e.talking && r.inRange, Math.round(r.e.hear * 10), r.meta].join('|')).join(';') + '|' + label.textContent + status;
    if (sig === hudSig) return;
    hudSig = sig;
    document.getElementById('tpv-list').innerHTML = rows.map((r) => `
      <div class="tpv-row tpv-team-${r.e.team} ${r.linked ? 'tpv-connected' : 'tpv-nolink'} ${r.inRange ? 'tpv-inrange' : ''} ${r.e.talking && r.inRange ? 'tpv-talking' : ''}">
        <span class="tpv-dot"></span>
        <span class="tpv-name">${escapeHtml(r.e.name || ('#' + r.e.tpId))}</span>
        ${r.meta ? `<span class="tpv-meta">${r.meta}</span>` : `<span class="tpv-bar"><i style="width:${Math.round(r.e.hear * 100)}%"></i></span>`}
      </div>`).join('');
    $('#tpv-debug').textContent = running ? `game ${gameHash} · me #${myTpId} · view: ${viewSrc || '-'}` : '';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.addEventListener('beforeunload', () => { if (peer) { try { peer.destroy(); } catch (e) {} } });

  // Small debugging handle: tpVoice.peers / tpVoice.settings in the console.
  window.tpVoice = {
    get peers() { return peers; }, get peer() { return peer; }, get settings() { return settings; },
    get running() { return running; }, transmitting, viewportBox, version: VERSION,
  };

  fillPanel();
  renderHud(true);
})();
