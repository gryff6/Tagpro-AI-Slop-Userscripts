// ==UserScript==
// @name         TagPro Pro Scoreboard
// @namespace    https://tagpro.koalabeast.com/
// @version      2.4.0
// @description  Adds a broadcast-style scoreboard/HUD overlay to TagPro. Hides the native TagPro score/clock/map HUD and replaces it with a compact, moveable one.
// @author       Claude Fable 5.1, gryff6
// @match        https://tagpro.koalabeast.com/*
// @match        https://*.koalabeast.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Settings (persisted in localStorage so they survive reloads)
  // ---------------------------------------------------------------------
  const STORAGE_KEY = 'tpProScoreboardSettings';
  const POS_KEY = 'tpProScoreboardRosterPos';
  const POS_KEY_SERIES = 'tpProScoreboardSeriesPos';
  const SERIES_SIZE = 5;
  // Series games are keyed by TEAM (A/B), not by red/blue side — teams swap
  // colors between games, but the two series participants stay the same,
  // so tracking scores by color would make old games show the wrong winner.
  function freshSeries() {
    return Array.from({ length: SERIES_SIZE }, () => ({ map: '', aScore: '', bScore: '' }));
  }
  // Seeded from the NALTP S40 Logos/Jerseys sheet. Acronym = division letter
  // (M=Majors, N=Minors, A=Novice) + the 3-letter team code. Edit freely in
  // Settings — this is just a starting point, not re-fetched automatically.
  // A couple of teams (marked below) didn't have a clean 3-letter code in
  // the sheet, so the acronym there is a best guess — fix it if it's wrong.
  function defaultTeamDirectory() {
    return [
      { acronym: 'MFUR', name: 'Furballers', logo: 'https://i.imgur.com/Uj2G0Lk.png' },
      { acronym: 'MFWO', name: 'FWO', logo: 'https://i.imgur.com/mc9sb3m.png' },
      { acronym: 'MHOH', name: 'Heart of the Hold', logo: 'https://i.imgur.com/tDDPkTW.png' },
      { acronym: 'MPTB', name: 'Portland Tile Blazers', logo: 'https://i.imgur.com/jhWDgdJ.png' },
      { acronym: 'MRFP', name: 'Rolling for Poost', logo: 'https://i.imgur.com/sU7GFmf.png' }, // guessed acronym
      { acronym: 'MSCP', name: 'Secure. Contain. Prevent.', logo: 'https://i.imgur.com/nl3TJrM.png' },
      { acronym: 'MSNI', name: 'Snipe Hunt', logo: 'https://www.tagproleague.com/assets/img/MLTPS11/snipe_hunt.png' },
      { acronym: 'MCRM', name: 'C.R.E.A.M.', logo: 'https://i.imgur.com/gK4RUBM.png' },
      { acronym: 'MABO', name: 'A Blockwork Orange', logo: 'https://i.imgur.com/2FoXKca.png' },
      { acronym: 'MTHS', name: 'The Holy Seehawks', logo: 'https://i.imgur.com/4RxKOOJ.png' },
      { acronym: 'NATI', name: 'Balluminati', logo: 'https://i.imgur.com/Mgrmf0g.png' },
      { acronym: 'NCMA', name: 'Cap Miasma', logo: 'https://i.imgur.com/N56sCEY.png' },
      { acronym: 'NAFB', name: 'Fraggle Block', logo: 'https://i.imgur.com/lcHiobZ.jpeg' },
      { acronym: 'NFWO', name: 'FWO', logo: 'https://i.imgur.com/mc9sb3m.png' },
      { acronym: 'NHGB', name: 'Harlem GlobeBotters', logo: 'https://i.imgur.com/JlMLsMj.png' },
      { acronym: 'NMRV', name: 'Mercury Revolutions', logo: 'https://i.imgur.com/eNhxMGL.png' },
      { acronym: 'NOPH', name: 'Over the Pants Handoffs', logo: 'https://i.imgur.com/V4pBCVC.png' },
      { acronym: 'NPTB', name: 'Portland Tile Blazers', logo: 'https://i.imgur.com/jhWDgdJ.png' },
      { acronym: 'NSTF', name: 'Stat Farmers', logo: 'https://i.imgur.com/ciCMj0y.png' },
      { acronym: 'NFWP', name: 'The Flair Witch Project', logo: 'https://i.imgur.com/Ahydf1p.png' },
      { acronym: 'NWOP', name: 'The Way of Pings', logo: 'https://i.imgur.com/sX2fHoc.png' },
      { acronym: 'NABS', name: 'Anaballic Spheroids', logo: 'https://i.imgur.com/eKU4qDd.png' },
      { acronym: 'ACRS', name: 'CapRe Sun', logo: 'https://i.imgur.com/Jup04JM.png' }, // guessed acronym (sheet had no code)
      { acronym: 'ARPO', name: 'Rolly Polies', logo: 'https://i.imgur.com/c54ihmK.png' },
      { acronym: 'AHOG', name: 'The Handoff God', logo: 'https://i.imgur.com/nLyD2CX.png' },
      { acronym: 'APPS', name: 'The Pup Sweeps', logo: 'https://i.imgur.com/uRIVWsv.png' },
      { acronym: 'ATSR', name: 'The Swipe Rights', logo: 'https://i.imgur.com/QxqcgLL.png' },
      { acronym: 'ADNO', name: 'WCYDinos', logo: 'https://i.imgur.com/Ewwdq4r.png' },
      { acronym: 'AFWO', name: 'FWO', logo: 'https://i.imgur.com/mc9sb3m.png' },
      { acronym: 'AWOW', name: 'Way of Waoting', logo: 'https://i.imgur.com/FGI2paX.png' },
    ];
  }

  const defaultSettings = {
    enabled: true,
    showRoster: true,
    hideNative: true, // hide TagPro's own score/timer/map-name HUD
    redName: '',       // blank = use TagPro's own team name
    blueName: '',
    redLogo: '',        // manual fallback image URL (used when auto-match is off or finds nothing)
    blueLogo: '',
    logoFollowsName: true, // look up the logo by matching red/blue team name against teamDirectory
    teamDirectory: defaultTeamDirectory(),
    showSeries: true,
    seriesTeamA: '', // the two series participants — fixed all series long, independent of red/blue side
    seriesTeamB: '',
    currentGame: 1,     // 1-based index into series[]
    series: freshSeries(),
  };
  let settings = Object.assign({}, defaultSettings, loadSettings());

  // Migrate pre-existing saved data from the old red/blue-keyed series shape
  // ({r, b}) to the team-keyed shape ({aScore, bScore}). Best-effort only —
  // old entries didn't record which team was on which color, so this just
  // carries the numbers over positionally; re-check old games after upgrading.
  if (Array.isArray(settings.series)) {
    settings.series = settings.series.map((g) => {
      if (g && g.aScore === undefined && g.bScore === undefined && (g.r !== undefined || g.b !== undefined)) {
        return { map: g.map || '', aScore: g.r || '', bScore: g.b || '' };
      }
      return Object.assign({ map: '', aScore: '', bScore: '' }, g);
    });
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------
  // Fonts + styles
  // ---------------------------------------------------------------------
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Teko:wght@500;600;700&display=swap';
  document.head.appendChild(fontLink);

  const style = document.createElement('style');
  style.textContent = `
    #tp-scoreboard-root {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      pointer-events: none;
      font-family: 'Rajdhani', 'Teko', sans-serif;
      user-select: none;
    }
    #tp-scoreboard-root *, #tp-roster * { box-sizing: border-box; }

    /* ---- top bar ---- */
    /* 3-column layout — CURRENT/NEXT map on the left, score centered
       (truly centered regardless of side widths), room for a title on the
       right — matching a broadcast-style strip instead of a stacked block. */
    #tp-topbar {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      column-gap: 18px;
      margin-top: 0; /* flush with the top of the screen */
      filter: drop-shadow(0 6px 18px rgba(0,0,0,.55));
    }
    #tp-topbar-left {
      justify-self: start;
      display: flex;
      gap: 16px;
      padding-left: 4px;
    }
    #tp-topbar-right { justify-self: end; }
    .tp-map-tag {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: rgba(255,255,255,.5);
      white-space: nowrap;
    }
    .tp-map-tag .tp-map-dot {
      width: 5px; height: 5px;
      transform: rotate(45deg);
      background: rgba(255,255,255,.35);
      flex: 0 0 auto;
    }
    .tp-map-tag b { color: #eef1f5; font-weight: 700; letter-spacing: .04em; }
    /* "Chevron" broadcast score-line (red/blue):
       each side panel is a trapezoid with its long side on top (outer end
       angled inward going down); the clock block in the middle is the
       opposite trapezoid (narrow top, wide bottom) that hangs below the bar
       and ends in a pointed foot. The side panels' inner edges lean parallel to
       the clock block's slanted edges, and the clock block overlaps them by
       exactly that lean (8px), so the bottom corner of the clock block and
       the bottom corner of each side panel are the same point — no seam. */
    /* Grid, not flex: the two 1fr side tracks always resolve to the same
       width (the wider side's natural width), so the bar stays symmetric
       around the clock even when only one team has a logo, or one name is
       longer. Whichever side needs more room dictates both. */
    #tp-topbar-center {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: stretch;
      justify-self: center;
      position: relative;
    }
    .tp-side {
      display: flex;
      align-items: center;
      gap: 10px;
      position: relative;
      background: linear-gradient(180deg, #1c1f26, #0b0c0f);
    }
    .tp-side.tp-red {
      flex-direction: row;
      padding: 8px 18px 8px 66px;
      background-image:
        linear-gradient(90deg, rgba(255,70,85,.28), rgba(255,70,85,0) 55%),
        linear-gradient(180deg, #1c1f26, #0b0c0f);
      clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 56px 100%); /* 56px lean over a 56px-tall bar = 45° */
    }
    .tp-side.tp-blue {
      flex-direction: row-reverse;
      padding: 8px 66px 8px 18px;
      background-image:
        linear-gradient(270deg, rgba(74,157,255,.28), rgba(74,157,255,0) 55%),
        linear-gradient(180deg, #1c1f26, #0b0c0f);
      clip-path: polygon(0 0, 100% 0, calc(100% - 56px) 100%, 8px 100%);
    }
    /* Team-color rule along the bottom of each side, fading toward the clock. */
    .tp-side::after {
      content: '';
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 3px;
      pointer-events: none;
    }
    .tp-side.tp-red::after { background: linear-gradient(90deg, #ff4655, rgba(255,70,85,.15)); }
    .tp-side.tp-blue::after { background: linear-gradient(270deg, #4a9dff, rgba(74,157,255,.15)); }

    /* Logos keep their own aspect ratio: fixed height, width follows
       (capped so a banner-shaped logo can't run away with the bar). */
    .tp-logo {
      height: 34px;
      width: auto;
      max-width: 110px;
      border-radius: 3px;
      object-fit: contain;
      flex: 0 0 auto;
      position: relative;
      z-index: 1;
    }
    .tp-team-name {
      font-weight: 700;
      font-size: 17px;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #eef1f5;
      line-height: 1;
      white-space: nowrap;
      flex: 0 0 auto;
      position: relative;
      z-index: 1;
    }
    .tp-score {
      font-family: 'Teko', sans-serif;
      font-weight: 700;
      font-size: 40px;
      line-height: 1;
      width: 40px;
      flex: 0 0 40px;
      text-align: center;
      color: #fff;
      transition: transform .12s ease;
      position: relative;
      z-index: 1;
    }
    .tp-red .tp-score { color: #ff4655; margin-left: 6px; text-shadow: 0 0 18px rgba(255,70,85,.5); }
    .tp-blue .tp-score { color: #4a9dff; margin-right: 6px; text-shadow: 0 0 18px rgba(74,157,255,.5); }
    /* When a side is wider than its content (it's matching the other side),
       the slack goes at the OUTER edge: logo, name and score stay packed
       together against the clock, so the name reads right-aligned on the
       red side / left-aligned on the blue side. The auto margin sits on the
       outermost visible item — the logo when there is one, else the name
       (tp-has-logo is toggled by setLogo). */
    .tp-red .tp-team-name { margin-left: auto; }
    .tp-blue .tp-team-name { margin-right: auto; }
    .tp-red.tp-has-logo .tp-team-name { margin-left: 0; }
    .tp-blue.tp-has-logo .tp-team-name { margin-right: 0; }
    .tp-red.tp-has-logo .tp-logo { margin-left: auto; }
    .tp-blue.tp-has-logo .tp-logo { margin-right: auto; }
    .tp-score.tp-bump { transform: scale(1.35); }

    /* Clock block. Body + pointed foot are ONE clipped pseudo-element (a
       clip-path on the element itself would clip the foot off, and two
       separate shapes butted together leave a hairline anti-aliasing seam
       where they meet). The shape box is extended 1px past each side and
       10px below, so the slanted edges overlap the side panels by 1px —
       that hides the matching hairline between the clock block and the
       sides — while staying parallel to them. column-reverse puts the
       state label (OVERTIME etc.) above the clock, as on a broadcast HUD,
       without changing the DOM. */
    .tp-center {
      background: none;
      color: #fff;
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 6px 20px 6px;
      min-width: 104px;
      margin: 0 -8px;
      position: relative;
      z-index: 1;
    }
    .tp-center::before {
      content: '';
      position: absolute;
      inset: 0 -1px -10px -1px;
      z-index: 1;
      /* Lightens toward the foot so the point still reads on a dark map. */
      background: linear-gradient(180deg, #07080a 0%, #0b0c10 70%, #2a2e38 100%);
      clip-path: polygon(
        8px 0, calc(100% - 8px) 0,
        100% calc(100% - 10px),
        50% 100%,
        0 calc(100% - 10px)
      );
    }
    /* Thin light rim along the two edges of the foot: a triangle 1px
       larger than the foot, sitting just underneath it. */
    .tp-center::after {
      content: '';
      position: absolute;
      left: -2px; right: -2px; top: 100%;
      height: 11.5px;
      z-index: 0;
      background: rgba(255,255,255,.28);
      clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
    .tp-center > * { position: relative; z-index: 2; }
    .tp-clock {
      font-family: 'Teko', sans-serif;
      font-size: 26px;
      font-weight: 600;
      letter-spacing: .04em;
      line-height: 1;
    }
    .tp-clock.tp-low { color: #ff4655; animation: tp-pulse 1s infinite; }
    @keyframes tp-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    .tp-substate {
      font-size: 10px;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: #ffb03b;
      line-height: 1;
      height: 10px;
    }

    /* map / event label under the bar */
    #tp-subline {
      text-align: center;
      margin-top: 14px; /* clears the clock block's foot, which hangs 10px below the bar */
      font-size: 11px;
      letter-spacing: .22em;
      text-transform: uppercase;
      color: rgba(255,255,255,.55);
      text-shadow: 0 2px 6px rgba(0,0,0,.8);
    }

    /* End-of-game winner banner — replaces TagPro's red/blue Arial
       "X Wins!" canvas text. Sits between the series box and the big
       stat panel (positioned by checkBigMode). */
    #tp-winner {
      position: fixed;
      left: 50%;
      top: 120px;
      transform: translateX(-50%);
      z-index: 999999;
      pointer-events: none;
      font-family: 'Rajdhani', 'Teko', sans-serif;
      width: max-content;
      transition: top .38s cubic-bezier(.2,.8,.2,1);
      filter: drop-shadow(0 8px 20px rgba(0,0,0,.6));
      padding: 6px 28px 8px;
      text-align: center;
      background: linear-gradient(180deg, rgba(20,22,28,.96), rgba(8,9,11,.96));
      border: 1px solid rgba(255,255,255,.12);
      border-top: 2px solid var(--tp-win, #ffd23b);
      clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 100%, 0 100%);
      animation: tp-winner-in .55s cubic-bezier(.2,.8,.2,1) both;
      will-change: transform, opacity;
    }
    @keyframes tp-winner-in { from { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(.96); } to { opacity: 1; transform: translateX(-50%); } }
    .tp-winner-eyebrow {
      font-size: 9px;
      letter-spacing: .32em;
      text-transform: uppercase;
      color: rgba(255,255,255,.5);
      line-height: 1;
      margin-bottom: 2px;
    }
    .tp-winner-text {
      font-family: 'Teko', sans-serif;
      font-weight: 700;
      font-size: 44px;
      line-height: .95;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--tp-win, #ffd23b);
      text-shadow: 0 0 22px color-mix(in srgb, var(--tp-win, #ffd23b) 55%, transparent), 0 2px 4px rgba(0,0,0,.8);
      white-space: nowrap;
    }

    /* ---- series / map-by-map section (separate, moveable + resizeable) ---- */
    #tp-series-wrap {
      position: fixed;
      top: 96px;
      left: 50%;
      transform: translateX(-50%);
      transform-origin: top left;
      z-index: 999997;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      pointer-events: auto;
      cursor: move;
      user-select: none;
    }
    /* Resize hit-region kept fully invisible (no drawn glyph) but still
       functional, same treatment as the stat panel's corner. */
    #tp-series-resize {
      position: absolute;
      right: -6px;
      bottom: -6px;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      pointer-events: auto;
      opacity: 0;
    }
    /* Series score row: CURRENT/NEXT map labels on top, then the per-map
       score chips flanked by the team-A/team-B acronym running vertically
       up each side — keeps the team legend out of its own horizontal row
       (saves vertical space) and out of a wide horizontal label (saves
       horizontal space). Team A is always red and Team B is always blue
       here — a fixed legend color per team, not tied to whichever in-game
       side (red/blue) that team happens to be on for a given map. The
       current map gets a gold outline. */
    .tp-s-game {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: rgba(255,255,255,.8);
      line-height: 1;
      margin-bottom: 3px;
    }
    .tp-series-slot.tp-cur .tp-s-game { color: #ffd23b; }
    #tp-series {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .tp-s-slots-outer {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .tp-s-vert-team {
      writing-mode: vertical-lr;
      text-orientation: upright;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      line-height: 1;
    }
    .tp-s-vert-team.tp-s-team-a { color: #ff4655; }
    .tp-s-vert-team.tp-s-team-b { color: #4a9dff; }
    .tp-s-slots-row {
      display: flex;
      gap: 4px;
    }
    .tp-series-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 78px;
      flex: 0 0 78px;
      padding: 5px 4px 6px;
      background: linear-gradient(180deg, rgba(20,22,28,.94), rgba(10,11,15,.94));
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 4px;
      position: relative;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,.5));
    }
    .tp-series-slot.tp-cur { box-shadow: inset 0 0 0 1px #ffd23b; background: rgba(255,210,59,.08); }
    /* Up to 2 lines before truncating, instead of clipping most of the
       name after a few characters on one line. */
    .tp-s-map {
      font-size: 8px;
      letter-spacing: .02em;
      text-transform: uppercase;
      color: rgba(255,255,255,.45);
      max-width: 100%;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.25;
      text-align: center;
      word-break: break-word;
      margin-bottom: 3px;
    }
    .tp-s-score {
      font-family: 'Teko', sans-serif;
      font-size: 22px;
      font-weight: 700;
      line-height: 1;
      display: flex;
      align-items: center;
      gap: 3px;
      color: rgba(255,255,255,.35);
    }
    .tp-s-score .tp-s-sep { font-size: 12px; color: rgba(255,255,255,.25); }
    .tp-s-score .tp-s-a.tp-s-win { color: #ff4655; }
    .tp-s-score .tp-s-b.tp-s-win { color: #4a9dff; }
    .tp-s-dot {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff2b39;
      box-shadow: 0 0 6px 1px #ff2b39;
      animation: tp-blink 1s infinite;
      z-index: 1;
    }
    @keyframes tp-blink { 0%, 100% { opacity: 1; } 50% { opacity: .15; } }

    /* ---- roster / stat panel (separate, moveable) ---- */
    #tp-roster {
      position: fixed;
      top: 174px;
      left: 50%;
      transform: translateX(-50%);
      transform-origin: top left;
      z-index: 999998;
      width: 365px;
      background: linear-gradient(180deg, rgba(12,13,16,.94), rgba(8,9,11,.94));
      border-radius: 4px;
      overflow: visible;
      /* box-shadow on the inner box (not a filter on the scaled panel):
         filters re-rasterise every frame of the big-mode transition. */
      font-family: 'Rajdhani', sans-serif;
      user-select: none;
    }
    #tp-roster-inner { border-radius: 4px; overflow: hidden; box-shadow: 0 6px 16px rgba(0,0,0,.5); }
    /* Big mode (native scoreboard open / game over): the panel glides to
       the middle of the screen and scales up; same element, animated. */
    #tp-roster.tp-anim { transition: left .45s cubic-bezier(.2,.8,.2,1), top .45s cubic-bezier(.2,.8,.2,1), transform .45s cubic-bezier(.2,.8,.2,1); will-change: transform, left, top; }
    #tp-roster.tp-big { z-index: 999999; }
    #tp-roster.tp-big #tp-roster-inner { box-shadow: 0 18px 40px rgba(0,0,0,.7); }
    #tp-roster.tp-big #tp-roster-header { cursor: default; }
    /* TagPro's own stat table is replaced by ours, so it never renders while
       the overlay's stat panel is on — not even for the frame before big
       mode kicks in. Hidden by a body class set at load, not per-tick. */
    body.tp-roster-on #options #stats { display: none !important; }
    /* ...and the whole native menu box it lives in (name field, buttons)
       is made invisible too. opacity rather than display: TagPro still
       "opens" it, which is the signal that flips our panel into big mode. */
    body.tp-roster-on #options { opacity: 0 !important; pointer-events: none !important; }
    /* Resize hit-region kept fully invisible (no drawn glyph) but still
       functional — the corner is still grabbable, it's just not rendered. */
    #tp-roster-resize {
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
      pointer-events: auto;
      opacity: 0;
    }
    .tp-stat-row {
      display: grid;
      /* TAG POP GRB DRP HLD CAP PRV RET PUP FLA K/D — HLD/PRV wider for
         m:ss, K/D wider for "1.50" */
      grid-template-columns: 96px 19px 19px 19px 19px 32px 19px 32px 19px 19px 19px 30px;
      align-items: center;
      column-gap: 1px;
    }
    .tp-roster-header.tp-stat-row {
      padding: 2px 6px;
      font-size: 7px;
      letter-spacing: 0;
      text-transform: uppercase;
      color: rgba(255,255,255,.4);
      border-bottom: 1px solid rgba(255,255,255,.08);
      cursor: move;
      pointer-events: auto;
    }
    .tp-roster-header span { text-align: center; }
    .tp-roster-header span:first-child { text-align: left; }
    .tp-row.tp-stat-row {
      padding: 1.5px 6px;
      font-size: 10px;
      font-weight: 600;
      color: #e8eaee;
      border-bottom: 1px solid rgba(255,255,255,.035);
      border-left: 3px solid transparent;
    }
    .tp-row.tp-team-1 { border-left-color: #ff4655; }
    .tp-row.tp-team-2 { border-left-color: #4a9dff; }
    .tp-row.tp-dead { opacity: .35; }
    .tp-row.tp-carrier { background: rgba(255,255,255,.06); }
    .tp-row span { text-align: center; font-variant-numeric: tabular-nums; color: rgba(255,255,255,.8); }
    /* Whoever's on top for a given stat column gets that cell colored in
       their own team's color, not a neutral highlight. */
    .tp-row span.tp-stat-lead { font-weight: 800; }
    .tp-row span.tp-stat-lead.tp-lead-1 { color: #ff4655; text-shadow: 0 0 6px rgba(255,70,85,.55); }
    .tp-row span.tp-stat-lead.tp-lead-2 { color: #4a9dff; text-shadow: 0 0 6px rgba(74,157,255,.55); }
    /* Team cumulative-stats footer row — sits under each team's players,
       leader cell per column colored the same way as individual leaders. */
    .tp-row.tp-team-total {
      font-weight: 800;
      padding-top: 2.5px; padding-bottom: 2.5px;
    }
    .tp-row.tp-team-total.tp-team-1 { background: rgba(255,70,85,.12); border-top: 1px solid rgba(255,70,85,.3); }
    .tp-row.tp-team-total.tp-team-2 { background: rgba(74,157,255,.12); border-top: 1px solid rgba(74,157,255,.3); }
    .tp-row.tp-team-total .tp-nm { text-transform: uppercase; letter-spacing: .03em; font-size: 9px; color: rgba(255,255,255,.85); }
    .tp-row.tp-team-total span { font-size: 9.5px; }
    .tp-pname { display: flex; align-items: center; gap: 4px; overflow: hidden; min-width: 0; text-align: left !important; }
    .tp-pname span.tp-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1 1 auto; }
    .tp-flagdot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 5px 1px currentColor; }
    .tp-team-divider { height: 5px; background: rgba(255,255,255,.03); }

    /* ---- settings toggle ---- */
    #tp-settings-btn {
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 1000000;
      pointer-events: auto;
      background: rgba(12,13,16,.85);
      color: #fff;
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 4px;
      font-family: 'Rajdhani', sans-serif;
      font-size: 12px;
      padding: 5px 9px;
      cursor: pointer;
      opacity: .35;
      transition: opacity .15s ease;
    }
    #tp-settings-btn:hover { opacity: 1; }

    #tp-settings-panel {
      position: fixed;
      top: 40px;
      right: 8px;
      z-index: 1000000;
      pointer-events: auto;
      background: rgba(14,15,19,.97);
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 6px;
      padding: 12px;
      width: 250px;
      max-height: calc(100vh - 60px);
      overflow-y: auto;
      color: #eee;
      font-family: 'Rajdhani', sans-serif;
      font-size: 13px;
      display: none;
    }
    #tp-settings-panel.tp-open { display: block; }
    #tp-settings-panel label { display: block; margin: 8px 0 3px; color: rgba(255,255,255,.6); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
    #tp-settings-panel input[type=text] {
      width: 100%; background: #1a1c22; border: 1px solid rgba(255,255,255,.15);
      color: #fff; border-radius: 3px; padding: 5px 6px; font-family: inherit; font-size: 13px;
    }
    #tp-settings-panel .tp-row2 { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
    #tp-settings-panel .tp-hint { margin-top: 10px; font-size: 10.5px; color: rgba(255,255,255,.4); line-height: 1.4; }
    #tp-settings-panel input[type=range] { accent-color: #4a9dff; }

    /* TagPro's own sound/music icons + volume slider (top-right of the
       game canvas) — replaced by the Sound controls above, which forward
       to these same native elements, so hide the originals to avoid a
       duplicate, overlapping control cluster in the capture. */
    #sound { display: none !important; }

    .tp-series-teams-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    #tp-series-editor { margin-top: 4px; }
    .tp-series-row { display: grid; grid-template-columns: 18px 1fr 30px 30px; gap: 4px; align-items: center; margin-bottom: 4px; }
    .tp-series-row input { background: #1a1c22; border: 1px solid rgba(255,255,255,.15); color: #fff; border-radius: 3px; padding: 4px 3px; font-family: inherit; font-size: 12px; width: 100%; text-align: center; }
    .tp-series-row input.tp-s-map-in { text-align: left; padding-left: 5px; }
    .tp-cur-btn {
      width: 16px; height: 16px; border-radius: 50%;
      border: 1px solid rgba(255,255,255,.3); background: transparent;
      cursor: pointer; padding: 0;
    }
    .tp-cur-btn.tp-cur-active { background: #ff2b39; border-color: #ff2b39; box-shadow: 0 0 5px 1px #ff2b39; }

    /* ---- team logo directory ---- */
    #tp-team-dir-list { max-height: 190px; overflow-y: auto; margin-top: 4px; padding-right: 2px; }
    .tp-dir-row { margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.06); }
    .tp-dir-name { font-size: 10px; color: rgba(255,255,255,.45); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tp-dir-fields { display: grid; grid-template-columns: 52px 1fr 16px; gap: 4px; align-items: center; }
    .tp-dir-fields input {
      background: #1a1c22; border: 1px solid rgba(255,255,255,.15); color: #fff;
      border-radius: 3px; padding: 3px 4px; font-family: inherit; font-size: 11px; width: 100%;
    }
    .tp-dir-fields input.tp-dir-acr { text-transform: uppercase; text-align: center; }
    .tp-dir-remove { background: transparent; border: none; color: rgba(255,90,90,.85); cursor: pointer; font-size: 15px; line-height: 1; padding: 0; }
    #tp-team-dir-add {
      display: grid; grid-template-columns: 1fr; gap: 4px; margin-top: 8px;
      padding-top: 8px; border-top: 1px solid rgba(255,255,255,.1);
    }
    #tp-team-dir-add .tp-dir-add-row2 { display: grid; grid-template-columns: 52px 1fr 22px; gap: 4px; }
    #tp-team-dir-add input {
      background: #1a1c22; border: 1px solid rgba(255,255,255,.15); color: #fff;
      border-radius: 3px; padding: 4px 5px; font-family: inherit; font-size: 11px; width: 100%;
    }
    #tp-team-dir-add input.tp-dir-add-acr { text-transform: uppercase; text-align: center; }
    #tp-team-dir-add-btn {
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); color: #fff;
      border-radius: 3px; cursor: pointer; font-size: 14px; line-height: 1;
    }
  `;
  document.head.appendChild(style);

  // ---------------------------------------------------------------------
  // Stat columns shown in the roster panel
  // (excludes score, oscore, dscore, s-support, tagcoins per request)
  // ---------------------------------------------------------------------
  // Same left-to-right order as TagPro's own scoreboard (Tags, Popped,
  // Grabs, Drops, Hold, Captures, Prevent, Returns, Power-ups), minus the
  // columns excluded earlier (Score/O/D, Support, Tagcoins, Active), then
  // Flaccids (not on the native board) and a derived K/D (tags ÷ pops).
  const STAT_COLS = [
    { key: 's-tags', label: 'TAG' },
    { key: 's-pops', label: 'POP' },
    { key: 's-grabs', label: 'GRB' },
    { key: 's-drops', label: 'DRP' },
    { key: 's-hold', label: 'HLD', time: true },
    { key: 's-captures', label: 'CAP' },
    { key: 's-prevent', label: 'PRV', time: true },
    { key: 's-returns', label: 'RET' },
    { key: 's-powerups', label: 'PUP' },
    { key: 's-flaccids', label: 'FLA' },
    { key: 'kd', label: 'K/D', ratio: true, calc: (st) => kdRatio(st['s-tags'], st['s-pops']) },
  ];
  // Kills = tags, deaths = pops. With no deaths yet, K/D is just the kill count.
  function kdRatio(tags, pops) {
    tags = tags || 0; pops = pops || 0;
    return pops > 0 ? tags / pops : tags;
  }
  // Raw per-player stats for a column set, with derived columns filled in.
  function statsOf(p) {
    const st = {};
    STAT_COLS.forEach((c) => { if (!c.calc) st[c.key] = p[c.key] || 0; });
    STAT_COLS.forEach((c) => { if (c.calc) st[c.key] = c.calc(st); });
    return st;
  }

  // ---------------------------------------------------------------------
  // Build DOM
  // ---------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'tp-scoreboard-root';
  root.innerHTML = `
    <div id="tp-topbar">
      <div id="tp-topbar-left"></div>
      <div id="tp-topbar-center">
        <div class="tp-side tp-red">
          <img class="tp-logo" id="tp-red-logo" style="display:none">
          <div class="tp-team-name" id="tp-red-name">RED</div>
          <div class="tp-score" id="tp-red-score">0</div>
        </div>
        <div class="tp-center">
          <div class="tp-clock" id="tp-clock">--:--</div>
          <div class="tp-substate" id="tp-substate"></div>
        </div>
        <div class="tp-side tp-blue">
          <img class="tp-logo" id="tp-blue-logo" style="display:none">
          <div class="tp-team-name" id="tp-blue-name">BLUE</div>
          <div class="tp-score" id="tp-blue-score">0</div>
        </div>
      </div>
      <div id="tp-topbar-right"></div>
    </div>
    <div id="tp-subline"></div>
  `;
  document.body.appendChild(root);

  const winnerEl = document.createElement('div');
  winnerEl.id = 'tp-winner';
  winnerEl.hidden = true;
  winnerEl.innerHTML = `
    <div class="tp-winner-eyebrow">FINAL</div>
    <div class="tp-winner-text"></div>
  `;
  document.body.appendChild(winnerEl);

  const seriesPanel = document.createElement('div');
  seriesPanel.id = 'tp-series-wrap';
  seriesPanel.innerHTML = `
    <div id="tp-series"></div>
    <div id="tp-series-resize"></div>
  `;
  document.body.appendChild(seriesPanel);

  const roster = document.createElement('div');
  roster.id = 'tp-roster';
  roster.innerHTML = `
    <div id="tp-roster-inner">
      <div id="tp-roster-header" class="tp-roster-header tp-stat-row">
        <span>Player</span>${STAT_COLS.map((c) => `<span>${c.label}</span>`).join('')}
      </div>
      <div id="tp-roster-body"></div>
    </div>
    <div id="tp-roster-resize"></div>
  `;
  document.body.appendChild(roster);

  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'tp-settings-btn';
  settingsBtn.textContent = 'SCOREBOARD ⚙';
  settingsBtn.title = 'TagPro Pro Scoreboard v2.4.0';
  document.body.appendChild(settingsBtn);

  const panel = document.createElement('div');
  panel.id = 'tp-settings-panel';
  panel.innerHTML = `
    <div class="tp-hint" style="margin:0 0 8px;">TagPro Pro Scoreboard <b>v2.4.0</b> — if this number doesn't match the file you just installed, the browser is still running an older copy.</div>
    <div class="tp-row2">
      <span>Show series section</span>
      <input type="checkbox" id="tp-in-show-series">
    </div>
    <label>Series teams (the two participants — fixed all series long, independent of which side is red/blue)</label>
    <div class="tp-series-teams-row">
      <input type="text" id="tp-in-series-team-a" placeholder="Team A acronym">
      <input type="text" id="tp-in-series-team-b" placeholder="Team B acronym">
    </div>
    <label>Series — click ● to mark the map live, edit map name / Team A score / Team B score</label>
    <div id="tp-series-editor"></div>
    <div style="height:1px;background:rgba(255,255,255,.1);margin:10px 0 8px;"></div>
    <label>Red team display name</label>
    <input type="text" id="tp-in-red-name" placeholder="(use in-game name)">
    <label>Blue team display name</label>
    <input type="text" id="tp-in-blue-name" placeholder="(use in-game name)">
    <div class="tp-row2">
      <span>Auto-match logos to team name</span>
      <input type="checkbox" id="tp-in-logo-follow">
    </div>
    <label>Red logo URL (fallback, used when auto-match is off or finds no team)</label>
    <input type="text" id="tp-in-red-logo" placeholder="https://...">
    <label>Blue logo URL (fallback)</label>
    <input type="text" id="tp-in-blue-logo" placeholder="https://...">
    <label>Team logo directory — logo auto-shows on whichever side (red/blue) has this acronym as its team name</label>
    <div id="tp-team-dir-list"></div>
    <div id="tp-team-dir-add">
      <input type="text" id="tp-dir-add-name" placeholder="Team name">
      <div class="tp-dir-add-row2">
        <input type="text" class="tp-dir-add-acr" id="tp-dir-add-acr" placeholder="ACR" maxlength="10">
        <input type="text" id="tp-dir-add-logo" placeholder="Logo URL">
        <button type="button" id="tp-team-dir-add-btn" title="Add team">+</button>
      </div>
    </div>
    <div class="tp-row2">
      <span>Show stat panel</span>
      <input type="checkbox" id="tp-in-show-roster">
    </div>
    <div class="tp-row2">
      <span>Hide TagPro's native HUD</span>
      <input type="checkbox" id="tp-in-hide-native">
    </div>
    <div class="tp-row2">
      <span>Overlay enabled</span>
      <input type="checkbox" id="tp-in-enabled">
    </div>
    <label>Sound — moved here from the small icons TagPro shows in the top-right corner (hidden while this overlay is active)</label>
    <div class="tp-row2">
      <span>Sound effects</span>
      <input type="checkbox" id="tp-in-sound-fx">
    </div>
    <div class="tp-row2">
      <span>Music</span>
      <input type="checkbox" id="tp-in-sound-music">
    </div>
    <input type="range" id="tp-in-volume" min="-50" max="0" step="1" style="width:100%;margin-top:4px;">
    <div class="tp-hint">Alt+S toggles the overlay on/off anytime. Both the stat panel and the series panel can be dragged (click anywhere on the stat panel's top row, or anywhere on the series panel) and resized (drag the bottom-right corner — invisible, but still grabbable). Double-click to reset each. Positions/size are remembered. With auto-match on, set a side's team name to a directory acronym (e.g. MFUR) and its logo follows — so when teams swap red/blue between games, just re-type the names and the right logo comes along. In OBS, capture this browser window (Window Capture) or a fullscreen tab.</div>
  `;
  document.body.appendChild(panel);

  const teamDirList = panel.querySelector('#tp-team-dir-list');
  const seriesEditor = panel.querySelector('#tp-series-editor');
  seriesEditor.innerHTML = Array.from({ length: SERIES_SIZE }, (_, i) => `
    <div class="tp-series-row">
      <button type="button" class="tp-cur-btn" data-i="${i}" title="Mark game ${i + 1} as live"></button>
      <input type="text" class="tp-s-map-in" data-i="${i}" placeholder="Map ${i + 1}">
      <input type="text" class="tp-s-a-in" data-i="${i}" placeholder="A">
      <input type="text" class="tp-s-b-in" data-i="${i}" placeholder="B">
    </div>
  `).join('');

  // Keep the score-column placeholders showing the actual team acronyms
  // once they're set, instead of the generic "A" / "B".
  function updateSeriesPlaceholders() {
    const aLabel = settings.seriesTeamA || 'A';
    const bLabel = settings.seriesTeamB || 'B';
    seriesEditor.querySelectorAll('.tp-s-a-in').forEach((el) => { el.placeholder = aLabel; });
    seriesEditor.querySelectorAll('.tp-s-b-in').forEach((el) => { el.placeholder = bLabel; });
  }

  // TagPro's own sound-effects/music toggles + volume slider (a fixed
  // #sound cluster the game adds in the top-right corner on game/spectate
  // pages, absent elsewhere). We don't own this state — we just read it
  // and forward clicks/value changes to these same elements, so our
  // panel always reflects however the native controls are actually set.
  function getSoundEls() {
    return {
      fx: document.getElementById('soundEffects'),
      music: document.getElementById('soundMusic'),
      slider: document.getElementById('volumeSlider'),
    };
  }
  function syncSoundUI() {
    const { fx, music, slider } = getSoundEls();
    if (fx) panel.querySelector('#tp-in-sound-fx').checked = !fx.classList.contains('off');
    if (music) panel.querySelector('#tp-in-sound-music').checked = !music.classList.contains('off');
    if (slider) panel.querySelector('#tp-in-volume').value = slider.value;
  }

  function fillPanel() {
    panel.querySelector('#tp-in-red-name').value = settings.redName;
    panel.querySelector('#tp-in-blue-name').value = settings.blueName;
    panel.querySelector('#tp-in-logo-follow').checked = settings.logoFollowsName;
    panel.querySelector('#tp-in-red-logo').value = settings.redLogo;
    panel.querySelector('#tp-in-blue-logo').value = settings.blueLogo;
    panel.querySelector('#tp-in-show-roster').checked = settings.showRoster;
    panel.querySelector('#tp-in-hide-native').checked = settings.hideNative;
    panel.querySelector('#tp-in-enabled').checked = settings.enabled;
    panel.querySelector('#tp-in-show-series').checked = settings.showSeries;
    panel.querySelector('#tp-in-series-team-a').value = settings.seriesTeamA;
    panel.querySelector('#tp-in-series-team-b').value = settings.seriesTeamB;
    fillSeriesEditor();
    updateSeriesPlaceholders();
    renderTeamDirList();
    syncSoundUI();
  }
  fillPanel();

  function renderTeamDirList() {
    teamDirList.innerHTML = settings.teamDirectory.map((t, i) => `
      <div class="tp-dir-row">
        <div class="tp-dir-name">${escapeHtml(t.name || '')}</div>
        <div class="tp-dir-fields">
          <input type="text" class="tp-dir-acr" data-i="${i}" value="${escapeHtml(t.acronym || '')}">
          <input type="text" class="tp-dir-logo" data-i="${i}" value="${escapeHtml(t.logo || '')}" placeholder="Logo URL">
          <button type="button" class="tp-dir-remove" data-i="${i}" title="Remove">×</button>
        </div>
      </div>
    `).join('');
  }

  function fillSeriesEditor() {
    for (let i = 0; i < SERIES_SIZE; i++) {
      const g = settings.series[i] || { map: '', aScore: '', bScore: '' };
      seriesEditor.querySelector(`.tp-s-map-in[data-i="${i}"]`).value = g.map;
      seriesEditor.querySelector(`.tp-s-a-in[data-i="${i}"]`).value = g.aScore;
      seriesEditor.querySelector(`.tp-s-b-in[data-i="${i}"]`).value = g.bScore;
      seriesEditor.querySelector(`.tp-cur-btn[data-i="${i}"]`).classList.toggle('tp-cur-active', settings.currentGame === i + 1);
    }
  }

  settingsBtn.addEventListener('click', () => {
    panel.classList.toggle('tp-open');
    // #sound may not have existed yet when the panel was first built (it's
    // only added on game/spectate pages), and its state can also drift from
    // whatever we last read — re-sync every time the panel opens.
    if (panel.classList.contains('tp-open')) syncSoundUI();
  });
  panel.addEventListener('input', (e) => {
    settings.redName = panel.querySelector('#tp-in-red-name').value.trim();
    settings.blueName = panel.querySelector('#tp-in-blue-name').value.trim();
    settings.logoFollowsName = panel.querySelector('#tp-in-logo-follow').checked;
    settings.redLogo = panel.querySelector('#tp-in-red-logo').value.trim();
    settings.blueLogo = panel.querySelector('#tp-in-blue-logo').value.trim();
    settings.showRoster = panel.querySelector('#tp-in-show-roster').checked;
    settings.hideNative = panel.querySelector('#tp-in-hide-native').checked;
    settings.enabled = panel.querySelector('#tp-in-enabled').checked;
    settings.showSeries = panel.querySelector('#tp-in-show-series').checked;
    settings.seriesTeamA = panel.querySelector('#tp-in-series-team-a').value.trim();
    settings.seriesTeamB = panel.querySelector('#tp-in-series-team-b').value.trim();

    const t = e.target;
    if (t.classList.contains('tp-s-map-in') || t.classList.contains('tp-s-a-in') || t.classList.contains('tp-s-b-in')) {
      const i = parseInt(t.dataset.i, 10);
      settings.series[i] = settings.series[i] || { map: '', aScore: '', bScore: '' };
      settings.series[i].map = seriesEditor.querySelector(`.tp-s-map-in[data-i="${i}"]`).value;
      settings.series[i].aScore = seriesEditor.querySelector(`.tp-s-a-in[data-i="${i}"]`).value.trim();
      settings.series[i].bScore = seriesEditor.querySelector(`.tp-s-b-in[data-i="${i}"]`).value.trim();
    }
    if (t.id === 'tp-in-series-team-a' || t.id === 'tp-in-series-team-b') {
      updateSeriesPlaceholders();
    }
    if (t.classList.contains('tp-dir-acr') || t.classList.contains('tp-dir-logo')) {
      const i = parseInt(t.dataset.i, 10);
      if (settings.teamDirectory[i]) {
        if (t.classList.contains('tp-dir-acr')) settings.teamDirectory[i].acronym = t.value.trim();
        if (t.classList.contains('tp-dir-logo')) settings.teamDirectory[i].logo = t.value.trim();
      }
    }
    // Sound controls don't live in `settings` — they just forward to
    // TagPro's own native sound elements, which own the real state.
    if (t.id === 'tp-in-sound-fx' || t.id === 'tp-in-sound-music') {
      const { fx, music } = getSoundEls();
      const nativeEl = t.id === 'tp-in-sound-fx' ? fx : music;
      if (nativeEl) {
        const isOn = !nativeEl.classList.contains('off');
        if (t.checked !== isOn) nativeEl.click();
      }
      syncSoundUI();
    }
    if (t.id === 'tp-in-volume') {
      const { slider } = getSoundEls();
      if (slider) {
        slider.value = t.value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    saveSettings();
    applyStaticSettings();
  });
  seriesEditor.addEventListener('click', (e) => {
    const btn = e.target.closest('.tp-cur-btn');
    if (!btn) return;
    settings.currentGame = parseInt(btn.dataset.i, 10) + 1;
    saveSettings();
    fillSeriesEditor();
    renderSeries();
  });
  teamDirList.addEventListener('click', (e) => {
    const btn = e.target.closest('.tp-dir-remove');
    if (!btn) return;
    const i = parseInt(btn.dataset.i, 10);
    settings.teamDirectory.splice(i, 1);
    saveSettings();
    renderTeamDirList();
  });
  panel.querySelector('#tp-team-dir-add-btn').addEventListener('click', () => {
    const nameEl = panel.querySelector('#tp-dir-add-name');
    const acrEl = panel.querySelector('#tp-dir-add-acr');
    const logoEl = panel.querySelector('#tp-dir-add-logo');
    const acronym = acrEl.value.trim();
    if (!acronym) { acrEl.focus(); return; }
    settings.teamDirectory.push({ acronym, name: nameEl.value.trim(), logo: logoEl.value.trim() });
    saveSettings();
    renderTeamDirList();
    nameEl.value = ''; acrEl.value = ''; logoEl.value = '';
    nameEl.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      settings.enabled = !settings.enabled;
      saveSettings();
      fillPanel();
      applyStaticSettings();
    }
  });

  function applyStaticSettings() {
    root.style.display = settings.enabled ? '' : 'none';
    roster.style.display = settings.enabled && settings.showRoster ? 'block' : 'none';
    document.body.classList.toggle('tp-roster-on', !!(settings.enabled && settings.showRoster));
    settingsBtn.style.display = 'block';
    document.getElementById('tp-series-wrap').style.display = settings.showSeries ? 'flex' : 'none';
    renderSeries();
  }

  // Team-name -> logo lookup, matched against the acronym (preferred) or
  // full name in settings.teamDirectory. Used every tick in update() so it
  // tracks whichever team is actually on red/blue that game, not a fixed side.
  function normalizeKey(s) {
    return (s || '').trim().toUpperCase();
  }
  function resolveTeamLogo(nameValue) {
    const key = normalizeKey(nameValue);
    if (!key) return null;
    let entry = settings.teamDirectory.find((t) => normalizeKey(t.acronym) === key);
    if (!entry) entry = settings.teamDirectory.find((t) => normalizeKey(t.name) === key);
    return entry ? entry.logo : null;
  }
  function setLogo(el, url) {
    if (url) { el.src = url; el.style.display = ''; } else { el.style.display = 'none'; }
    // Lets CSS put the outer-edge slack on the logo when there is one, else on the name.
    if (el.parentElement) el.parentElement.classList.toggle('tp-has-logo', !!url);
  }

  function renderSeries() {
    const wrap = document.getElementById('tp-series-wrap');
    if (!wrap || wrap.style.display === 'none') {
      return;
    }

    const cur = Math.min(Math.max(settings.currentGame, 1), SERIES_SIZE);

    const teamA = settings.seriesTeamA || 'TEAM A';
    const teamB = settings.seriesTeamB || 'TEAM B';

    const slots = settings.series.map((g, idx) => {
      const gameNum = idx + 1;
      const hasScore = g.aScore !== '' && g.bScore !== '' && g.aScore != null && g.bScore != null;
      const aNum = parseFloat(g.aScore), bNum = parseFloat(g.bScore);
      let aCls = '', bCls = '';
      if (hasScore && !isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
        if (aNum > bNum) { aCls = 'tp-s-win'; } else { bCls = 'tp-s-win'; }
      }
      const isCurrent = gameNum === cur;
      const mapText = g.map ? escapeHtml(g.map) : '';
      const aEmpty = g.aScore === '' || g.aScore == null;
      const bEmpty = g.bScore === '' || g.bScore == null;
      // Neither score entered yet (the normal not-played-yet state): show
      // one plain dash instead of "– – –". If only one side got typed in,
      // still show both slots so it's clear which one is missing.
      const scoreHtml = (aEmpty && bEmpty)
        ? `<span class="tp-s-pending">–</span>`
        : `<span class="tp-s-a ${aCls}">${aEmpty ? '–' : escapeHtml(String(g.aScore))}</span><span class="tp-s-sep">–</span><span class="tp-s-b ${bCls}">${bEmpty ? '–' : escapeHtml(String(g.bScore))}</span>`;
      return `<div class="tp-series-slot ${isCurrent ? 'tp-cur' : ''}">
        ${isCurrent ? '<span class="tp-s-dot"></span>' : ''}
        <div class="tp-s-game">Game ${gameNum}</div>
        <div class="tp-s-map">${mapText}</div>
        <div class="tp-s-score">${scoreHtml}</div>
      </div>`;
    }).join('');

    const seriesEl = document.getElementById('tp-series');
    seriesEl.innerHTML = `
      <div class="tp-s-slots-outer">
        <div class="tp-s-vert-team tp-s-team-a">${escapeHtml(teamA)}</div>
        <div class="tp-s-slots-row">${slots}</div>
        <div class="tp-s-vert-team tp-s-team-b">${escapeHtml(teamB)}</div>
      </div>
    `;
  }

  applyStaticSettings();

  // ---------------------------------------------------------------------
  // Draggable (+ optionally resizeable) panel (position & scale persisted
  // in localStorage). Used for both the stat panel (drag + resize) and the
  // series panel (drag only, resizeEl is null).
  // ---------------------------------------------------------------------
  function makeMovable(panelEl, handleEl, resizeEl, storageKey, resetPos) {
    const MIN_SCALE = 0.55, MAX_SCALE = 2;
    let scale = 1;

    function applyScale() {
      // Always set an inline transform (even at scale 1) so it overrides
      // the stylesheet's initial centering transform (translateX(-50%))
      // once we've captured the panel's starting position below.
      panelEl.style.transform = 'scale(' + scale + ')';
    }

    function persist() {
      try {
        const data = {
          left: parseFloat(panelEl.style.left),
          top: parseFloat(panelEl.style.top),
        };
        if (resizeEl) data.scale = scale;
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch (e) {}
    }

    // restore saved position + scale
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch (e) {}
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      panelEl.style.left = saved.left + 'px';
      panelEl.style.top = saved.top + 'px';
    } else {
      // Compute the initial centered position directly from window/panel
      // dimensions (same formula resetPos uses) rather than reading
      // getBoundingClientRect() against the CSS's own translateX(-50%)
      // centering — that transform isn't guaranteed to have been applied
      // by the time this runs, which can yield a bogus (e.g. off-screen)
      // rect on some page-load timings.
      resetPos(panelEl);
    }
    if (resizeEl && saved && typeof saved.scale === 'number') {
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, saved.scale));
    }
    applyScale();

    // ---- drag to move (click anywhere on handleEl) ----
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    handleEl.addEventListener('mousedown', (e) => {
      if (resizeEl && e.target === resizeEl) return; // let the resize handler take it
      if (panelEl.classList.contains('tp-big')) return; // parked in big mode
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseFloat(panelEl.style.left) || 0;
      startTop = parseFloat(panelEl.style.top) || 0;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      const w = panelEl.offsetWidth * scale, h = panelEl.offsetHeight * scale;
      newLeft = Math.max(0, Math.min(window.innerWidth - w, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - h, newTop));
      panelEl.style.left = newLeft + 'px';
      panelEl.style.top = newTop + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      persist();
    });
    handleEl.addEventListener('dblclick', (e) => {
      if (resizeEl && e.target === resizeEl) return;
      if (panelEl.classList.contains('tp-big')) return;
      try { localStorage.removeItem(storageKey); } catch (e) {}
      scale = 1;
      applyScale();
      resetPos(panelEl);
    });

    // ---- drag corner to resize (uniform scale), only when resizeEl is given ----
    if (resizeEl) {
      let resizing = false, rStartX = 0, rStartY = 0, rStartScale = 1, baseW = 0, baseH = 0;
      resizeEl.addEventListener('mousedown', (e) => {
        if (panelEl.classList.contains('tp-big')) return;
        resizing = true;
        rStartX = e.clientX;
        rStartY = e.clientY;
        rStartScale = scale;
        baseW = panelEl.offsetWidth;   // unscaled layout size (transform doesn't affect this)
        baseH = panelEl.offsetHeight;
        e.preventDefault();
        e.stopPropagation();
      });
      window.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const dx = e.clientX - rStartX;
        const dy = e.clientY - rStartY;
        const delta = (dx + dy) / (baseW + baseH);
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rStartScale + delta));
        applyScale();
      });
      window.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        persist();
      });
    }
  }

  makeMovable(roster, document.getElementById('tp-roster-header'), document.getElementById('tp-roster-resize'), POS_KEY, (panelEl) => {
    panelEl.style.left = ((window.innerWidth - panelEl.offsetWidth) / 2) + 'px';
    panelEl.style.top = '174px';
  });
  makeMovable(seriesPanel, seriesPanel, document.getElementById('tp-series-resize'), POS_KEY_SERIES, (panelEl) => {
    panelEl.style.left = ((window.innerWidth - panelEl.offsetWidth) / 2) + 'px';
    panelEl.style.top = '96px';
  });

  // ---------------------------------------------------------------------
  // Patch out TagPro's own score/timer/map-name/flag/player-indicator HUD
  // so only our overlay shows. Ping/FPS info is left alone.
  // ---------------------------------------------------------------------
  const noop = function () {};
  const uiPatch = { ref: null, orig: {} };
  const HIDDEN_SPRITE_KEYS = [
    'redScore', 'blueScore', 'timer', 'mapInfo',
    'redFlag', 'blueFlag', 'yellowFlagTakenByRed', 'yellowFlagTakenByBlue',
    'redPotatoTaken', 'bluePotatoTaken', 'yellowPotatoTakenByRed', 'yellowPotatoTakenByBlue',
    'playerIndicators',
  ];

  function currentTeamNames() {
    const tp = window.tagpro || {};
    return {
      red: settings.redName || (tp.teamNames && tp.teamNames.redTeamName) || 'RED',
      blue: settings.blueName || (tp.teamNames && tp.teamNames.blueTeamName) || 'BLUE',
    };
  }
  // What the banner is currently showing: the game-end result, or a
  // passthrough of one of TagPro's big canvas alerts ("Match Begins
  // Soon...", "Joining red team", "Switch!"), mirrored from its sprite.
  const banner = { kind: null, sprite: null };
  function showAlertBanner(text, sprite) {
    const el = document.getElementById('tp-winner');
    const clean = text.replace(/[.…]+$/, '').trim();
    let eyebrow = '';
    if (/begins? soon/i.test(clean)) eyebrow = 'GET READY';
    else if (/^joining/i.test(clean)) eyebrow = 'TEAM';
    else if (/switch/i.test(clean)) eyebrow = 'SIDES';
    el.querySelector('.tp-winner-text').textContent = clean.toUpperCase();
    el.querySelector('.tp-winner-eyebrow').textContent = eyebrow;
    el.querySelector('.tp-winner-eyebrow').style.display = eyebrow ? '' : 'none';
    el.style.setProperty('--tp-win', '#ffd23b');
    banner.kind = 'alert';
    banner.sprite = sprite || null;
    el.hidden = false;
  }
  function showWinnerBanner() {
    const tp = window.tagpro || {};
    const el = document.getElementById('tp-winner');
    el.querySelector('.tp-winner-eyebrow').style.display = '';
    banner.kind = 'winner';
    banner.sprite = null;
    const names = currentTeamNames();
    let text, color;
    if (tp.winner === 'red') { text = names.red + ' WINS'; color = '#ff4655'; }
    else if (tp.winner === 'blue') { text = names.blue + ' WINS'; color = '#4a9dff'; }
    else if (tp.winner === 'tie') { text = "IT'S A TIE"; color = '#ffd23b'; }
    else { text = String(tp.winner || 'GAME OVER').toUpperCase(); color = '#ffd23b'; }
    el.querySelector('.tp-winner-text').textContent = text;
    el.querySelector('.tp-winner-eyebrow').textContent = tp.gameEndedWithMercy ? 'FINAL · MERCY' : 'FINAL';
    el.style.setProperty('--tp-win', color);
    el.hidden = false;
  }

  function syncNativeHud() {
    const tp = window.tagpro;
    if (!tp || !tp.ui) return;

    if (uiPatch.ref !== tp.ui) {
      // fresh tagpro.ui instance (new game load) — capture its real functions
      uiPatch.ref = tp.ui;
      uiPatch.orig = {
        scores: tp.ui.scores,
        timer: tp.ui.timer,
        createMapInfo: tp.ui.createMapInfo,
        updateFlags: tp.ui.updateFlags,
        updatePlayerIndicators: tp.ui.updatePlayerIndicators,
        largeAlert: tp.ui.largeAlert,
      };
      // TagPro draws "<team> Wins!" / "It's a tie!" through
      // tagpro.ui.largeAlert once the state hits ENDED. Intercept just that
      // call (countdown banners like "Match Begins Soon" pass straight
      // through) and show our own styled banner instead. The native code
      // ignores the return value, so a dummy is fine.
      const origLarge = uiPatch.orig.largeAlert;
      if (typeof origLarge === 'function') {
        tp.ui.largeAlert = function (layer, center, size, text, color) {
          // Let TagPro build and track its sprite as usual (it may hold on
          // to it and remove it later), just never let it be seen; our
          // styled banner shows the same message instead.
          const sprite = origLarge.apply(this, arguments);
          if (settings.hideNative && settings.enabled) {
            if (sprite) sprite.visible = false;
            const st = tp.states || {};
            const isWinnerMsg = tp.state === st.ENDED && /\bWins!$|It's a tie!/i.test(String(text || ''));
            if (isWinnerMsg) showWinnerBanner();
            else showAlertBanner(String(text || ''), sprite);
          }
          return sprite;
        };
      }
    }

    const hide = settings.hideNative;
    tp.ui.scores = hide ? noop : uiPatch.orig.scores;
    tp.ui.timer = hide ? noop : uiPatch.orig.timer;
    tp.ui.createMapInfo = hide ? noop : uiPatch.orig.createMapInfo;
    tp.ui.updateFlags = hide ? noop : uiPatch.orig.updateFlags;
    tp.ui.updatePlayerIndicators = hide ? noop : uiPatch.orig.updatePlayerIndicators;

    if (tp.ui.sprites) {
      HIDDEN_SPRITE_KEYS.forEach((k) => {
        if (tp.ui.sprites[k]) tp.ui.sprites[k].visible = !hide;
      });
    }
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function formatClock(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // s-hold / s-prevent come from tagpro's player stats in whole seconds.
  function formatMMSS(totalSeconds) {
    const total = Math.max(0, Math.round(totalSeconds || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function formatStatVal(col, val) {
    if (col.time) return formatMMSS(val);
    if (col.ratio) return (Math.round(val * 100) / 100).toFixed(2);
    return String(val);
  }

  // TagPro flag id -> color, per team-flag conventions (1=red flag,2=blue flag,3=neutral flag)
  function flagColor(flagId) {
    if (flagId === 1) return '#ff4655';
    if (flagId === 2) return '#4a9dff';
    if (flagId === 3) return '#ffd23b';
    return null;
  }

  let lastRed = null, lastBlue = null;
  function bump(el) {
    el.classList.remove('tp-bump');
    void el.offsetWidth; // restart animation
    el.classList.add('tp-bump');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderRoster(players, redName, blueName) {
    const teams = { 1: [], 2: [] };
    Object.keys(players).forEach((id) => {
      const p = players[id];
      if (!p || (p.team !== 1 && p.team !== 2)) return;
      teams[p.team].push(p);
    });
    const byImpact = (a, b) => (b['s-captures'] || 0) - (a['s-captures'] || 0) || (b['s-tags'] || 0) - (a['s-tags'] || 0);
    teams[1].sort(byImpact);
    teams[2].sort(byImpact);

    // Highest value per stat column across the whole roster (both teams
    // together) — the cell(s) at that value get colored with whichever
    // team the leading player is on, instead of a neutral highlight.
    // A column that's still all zeros has no leader yet.
    const allPlayers = teams[1].concat(teams[2]);
    const statsById = new Map(allPlayers.map((p) => [p, statsOf(p)]));
    const maxByStat = {};
    STAT_COLS.forEach((c) => {
      maxByStat[c.key] = allPlayers.reduce((m, p) => Math.max(m, statsById.get(p)[c.key]), 0);
    });

    const renderRow = (p, teamClass) => {
      const fc = flagColor(p.flag);
      const dotStyle = fc ? `style="background:${fc};color:${fc}"` : 'style="visibility:hidden"';
      const st = statsById.get(p);
      const cells = STAT_COLS.map((c) => {
        const val = st[c.key];
        const isLeader = maxByStat[c.key] > 0 && val === maxByStat[c.key];
        const cls = isLeader ? ` class="tp-stat-lead tp-lead-${p.team}"` : '';
        return `<span${cls}>${formatStatVal(c, val)}</span>`;
      }).join('');
      return `<div class="tp-row tp-stat-row ${teamClass} ${p.dead ? 'tp-dead' : ''} ${fc ? 'tp-carrier' : ''}">
        <span class="tp-pname"><span class="tp-flagdot" ${dotStyle}></span><span class="tp-nm">${escapeHtml(p.name || '')}</span></span>
        ${cells}
      </div>`;
    };

    // Cumulative per-team totals, one column sum at a time. The team with
    // the higher total in a given column gets that cell colored in their
    // own color (same tp-stat-lead mechanism as individual leaders); a
    // column that's still 0-0 has no leader yet.
    const sumStat = (list, key) => list.reduce((s, p) => s + (p[key] || 0), 0);
    const totals = { 1: {}, 2: {} };
    STAT_COLS.forEach((c) => {
      if (c.calc) return;
      totals[1][c.key] = sumStat(teams[1], c.key);
      totals[2][c.key] = sumStat(teams[2], c.key);
    });
    // Derived columns (K/D) come from the team's summed raw stats, not a
    // sum of per-player ratios.
    STAT_COLS.forEach((c) => {
      if (!c.calc) return;
      totals[1][c.key] = c.calc(totals[1]);
      totals[2][c.key] = c.calc(totals[2]);
    });
    const maxTotalByStat = {};
    STAT_COLS.forEach((c) => {
      maxTotalByStat[c.key] = Math.max(totals[1][c.key], totals[2][c.key]);
    });

    const renderTotalRow = (teamNum, teamName) => {
      const cells = STAT_COLS.map((c) => {
        const val = totals[teamNum][c.key];
        const isLeader = maxTotalByStat[c.key] > 0 && val === maxTotalByStat[c.key];
        const cls = isLeader ? ` class="tp-stat-lead tp-lead-${teamNum}"` : '';
        return `<span${cls}>${formatStatVal(c, val)}</span>`;
      }).join('');
      const label = (teamName || (teamNum === 1 ? 'RED' : 'BLUE')).toUpperCase();
      return `<div class="tp-row tp-stat-row tp-team-total tp-team-${teamNum}">
        <span class="tp-pname"><span class="tp-nm">${escapeHtml(label)}</span></span>
        ${cells}
      </div>`;
    };

    const html =
      teams[1].map((p) => renderRow(p, 'tp-team-1')).join('') +
      renderTotalRow(1, redName) +
      '<div class="tp-team-divider"></div>' +
      teams[2].map((p) => renderRow(p, 'tp-team-2')).join('') +
      renderTotalRow(2, blueName);

    document.getElementById('tp-roster-body').innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Main update loop — polls window.tagpro directly (no fragile socket hooking)
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Big mode: while TagPro's own scoreboard (#options — Escape, or the
  // end-of-game screen) is open, the stat panel animates from wherever the
  // user parked it to the middle of the screen and scales up, then goes
  // back when the native board closes. Same DOM, just moved/scaled, so the
  // live data keeps updating throughout.
  // ---------------------------------------------------------------------
  const bigMode = { on: false, saved: null, armed: false, settleUntil: 0 };
  function nativeBoardOpen() {
    const o = document.getElementById('options');
    if (!o) return false;
    return o.offsetParent !== null && getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility !== 'hidden';
  }
  function bigTarget() {
    const w = roster.offsetWidth, h = roster.offsetHeight;
    const W = window.innerWidth, H = window.innerHeight;
    // Only the top bar is a hard floor. The series box is wherever the user
    // parked it (could be anywhere on screen), so it's deliberately NOT
    // used as a floor — using it pushed the panel off the bottom of the
    // screen when the series box sat low.
    const floor = root.getBoundingClientRect().bottom + 16;
    const bannerH = winnerEl.hidden ? 0 : winnerEl.offsetHeight + 12;
    // Fit inside the space below the floor (minus banner), never off-screen.
    const avail = Math.max(120, H - floor - bannerH - 16);
    const scale = Math.max(1, Math.min(2.4, (W * 0.62) / w, avail / h));
    // Place the banner+panel group in the upper part of the free space
    // (about 20% of the way down, not dead center — reads better under
    // the score line and keeps clear of the bottom of the screen).
    const groupH = bannerH + h * scale;
    const top = Math.max(floor + bannerH, floor + (H - floor - groupH) * 0.2 + bannerH);
    return {
      scale,
      left: (W - w * scale) / 2,
      top,
      bannerTop: top - bannerH,
    };
  }
  function setBigMode(on) {
    if (on === bigMode.on) return;
    bigMode.on = on;
    if (!bigMode.armed) {
      // Enable the transition only after the first frame so the initial
      // saved-position restore on page load doesn't animate in from 0,0.
      roster.classList.add('tp-anim');
      bigMode.armed = true;
    }
    document.body.classList.toggle('tp-big-mode', on);
    // Don't rebuild the roster's innerHTML while it's mid-glide — a layout
    // pass on a transforming element is what makes the move stutter.
    bigMode.settleUntil = Date.now() + 500;
    if (on) {
      bigMode.saved = { left: roster.style.left, top: roster.style.top, transform: roster.style.transform };
      const t = bigTarget();
      roster.classList.add('tp-big');
      roster.style.left = t.left + 'px';
      roster.style.top = t.top + 'px';
      roster.style.transform = 'scale(' + t.scale + ')';
    } else {
      roster.classList.remove('tp-big');
      if (bigMode.saved) {
        roster.style.left = bigMode.saved.left;
        roster.style.top = bigMode.saved.top;
        roster.style.transform = bigMode.saved.transform;
      }
    }
  }
  window.addEventListener('resize', () => {
    if (!bigMode.on) return;
    const t = bigTarget();
    roster.style.left = t.left + 'px';
    roster.style.top = t.top + 'px';
    roster.style.transform = 'scale(' + t.scale + ')';
  });

  function checkBigMode() {
    const tp = window.tagpro;
    const states = (tp && tp.states) || {};
    const ended = !!tp && (tp.state === states.ENDED || tp.state === states.EXITED || tp.state === states.EXITING);
    // Show the winner banner as soon as the game is over (tagpro.winner is
    // set in the same socket handler that flips the state), rather than
    // waiting for the native alert call a frame or two later — otherwise
    // the panel moves once, then shifts again when the banner appears.
    if (tp && tp.state === states.ENDED && tp.winner && winnerEl.hidden && settings.enabled && settings.hideNative) {
      showWinnerBanner();
    }
    setBigMode(settings.enabled && settings.showRoster && !!tp && !!tp.players && (nativeBoardOpen() || ended));
    if (bigMode.on) {
      // Re-aim while big (the winner banner can appear a beat after we
      // moved, and the roster grows as rows render).
      const t = bigTarget();
      const left = t.left + 'px', top = t.top + 'px', tf = 'scale(' + t.scale + ')';
      if (roster.style.left !== left) roster.style.left = left;
      if (roster.style.top !== top) roster.style.top = top;
      if (roster.style.transform !== tf) roster.style.transform = tf;
      const bt = t.bannerTop + 'px';
      if (winnerEl.style.top !== bt) winnerEl.style.top = bt;
    }
  }
  // React the instant TagPro shows/hides #options (it toggles inline
  // style/class) instead of waiting for the next 200ms poll, so the big
  // panel starts moving in the same frame the native board would appear.
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.target && m.target.id === 'options') { checkBigMode(); return; }
    }
  }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') requestAnimationFrame(checkBigMode);
  }, true);

  function update() {
    const tp = window.tagpro;
    syncNativeHud();
    checkBigMode();
    {
      const st = (tp && tp.states) || {};
      const ended = !!tp && tp.state === st.ENDED;
      if (banner.kind === 'winner' && !ended) { winnerEl.hidden = true; banner.kind = null; }
      if (banner.kind === 'alert') {
        // Follow the native sprite: gone from its layer (or the game moved
        // on to a live/ended state) means the alert is over. Mirror text
        // edits too, in case TagPro updates the message in place.
        const sp = banner.sprite;
        const spriteGone = !sp || !sp.parent || sp.destroyed;
        const stateOver = !!tp && (tp.state === st.ACTIVE || ended);
        if (spriteGone || stateOver) { winnerEl.hidden = true; banner.kind = null; banner.sprite = null; }
        else if (typeof sp.text === 'string') {
          const clean = sp.text.replace(/[.…]+$/, '').trim().toUpperCase();
          const t = winnerEl.querySelector('.tp-winner-text');
          if (t.textContent !== clean) t.textContent = clean;
        }
      }
      if (!bigMode.on && !winnerEl.hidden) {
        // Not in big mode (countdown alerts): out over the map, about 40%
        // down the screen — clear of the series box and stat panel in
        // their default spots under the score line.
        const bt = Math.round(window.innerHeight * 0.4 - winnerEl.offsetHeight / 2) + 'px';
        if (winnerEl.style.top !== bt) winnerEl.style.top = bt;
      }
    }

    if (!tp || !tp.score) {
      document.getElementById('tp-topbar').style.visibility = 'hidden';
      document.getElementById('tp-series-wrap').style.visibility = 'hidden';
      roster.style.visibility = 'hidden';
      document.getElementById('tp-subline').textContent = '';
      return;
    }
    document.getElementById('tp-topbar').style.visibility = '';
    document.getElementById('tp-series-wrap').style.visibility = '';
    roster.style.visibility = '';

    const redName = settings.redName || (tp.teamNames && tp.teamNames.redTeamName) || 'RED';
    const blueName = settings.blueName || (tp.teamNames && tp.teamNames.blueTeamName) || 'BLUE';
    document.getElementById('tp-red-name').textContent = redName.toUpperCase();
    document.getElementById('tp-blue-name').textContent = blueName.toUpperCase();

    // Logo follows whichever team name is actually showing on each side
    // (so it stays with the team, not the side, when teams swap colors).
    const redAutoLogo = settings.logoFollowsName ? resolveTeamLogo(redName) : null;
    const blueAutoLogo = settings.logoFollowsName ? resolveTeamLogo(blueName) : null;
    setLogo(document.getElementById('tp-red-logo'), redAutoLogo || settings.redLogo);
    setLogo(document.getElementById('tp-blue-logo'), blueAutoLogo || settings.blueLogo);

    const r = tp.score.r || 0, b = tp.score.b || 0;
    const redEl = document.getElementById('tp-red-score');
    const blueEl = document.getElementById('tp-blue-score');
    if (lastRed !== null && r !== lastRed) bump(redEl);
    if (lastBlue !== null && b !== lastBlue) bump(blueEl);
    redEl.textContent = r;
    blueEl.textContent = b;
    lastRed = r; lastBlue = b;

    // clock
    const clockEl = document.getElementById('tp-clock');
    const subEl = document.getElementById('tp-substate');
    const states = tp.states || {};
    const remaining = (tp.gameEndsAt || 0) - Date.now();
    if (tp.state === states.COUNTDOWN) {
      clockEl.textContent = formatClock(remaining);
      subEl.textContent = 'STARTING';
    } else if (tp.state === states.ENDED || tp.state === states.EXITED || tp.state === states.EXITING) {
      clockEl.textContent = 'FINAL';
      subEl.textContent = '';
    } else if (tp.state === states.OVERTIME || tp.state === states.CLUTCH) {
      // Regulation is over, so gameEndsAt is in the past and "remaining"
      // is negative — count UP from the moment regulation ended, like the
      // native clock does, instead of pinning at 0:00.
      clockEl.textContent = formatClock(remaining < 0 ? -remaining : remaining);
      subEl.textContent = tp.state === states.OVERTIME ? 'OVERTIME' : 'CLUTCH';
    } else {
      clockEl.textContent = formatClock(remaining);
      subEl.textContent = '';
    }
    clockEl.classList.toggle('tp-low', remaining > 0 && remaining < 30000 && tp.state === states.ACTIVE);

    // map / mode subline
    const mapName = (tp.map && tp.map.name) || (tp.clientInfo && tp.clientInfo.map) || '';
    const mode = (tp.clientInfo && tp.clientInfo.classicGameMode) ? tp.clientInfo.classicGameMode.toUpperCase() : '';
    document.getElementById('tp-subline').textContent = [mapName, mode].filter(Boolean).join('  •  ');

    // roster
    if (settings.showRoster && tp.players && !(bigMode.settleUntil && Date.now() < bigMode.settleUntil)) {
      renderRoster(tp.players, redName, blueName);
    }
  }

  setInterval(update, 200);
  update();
})();
