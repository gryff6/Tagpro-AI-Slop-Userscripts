// ==UserScript==
// @name         Tagpro Transparent Canvas and Video/GIF Background and Header
// @namespace    https://github.com/gryff6
// @version      2.0
// @description  Makes the game canvas transparent and plays a video (mp4/webm) or shows a GIF/image behind it. Based on the NewCompte / Catalyst transparent-canvas script.
// @author       Claude Fable 5.1, gryff6 (original: NewCompte, Catalyst)
// @match        *://*.koalabeast.com/game*
// @include      https://tagpro.koalabeast.com/*
// @grant        GM_addStyle
// ==/UserScript==

/* ------------------------------------------------------------------
   SETTINGS
   Put any mix of video URLs (.mp4 / .webm) and image URLs (.gif / .png /
   .jpg) in url_list.  One is picked at random each page load.
   ------------------------------------------------------------------ */
var url_list = [
    "https://i.imgur.com/IySFVVu.gif"
];

// true  = scale the background to fill the whole window (recommended)
// false = show it at its native pixel size, centred (original behaviour)
var FILL_WINDOW = true;

// Playback speed for videos. 1 = normal, 0.5 = half speed, etc.
var VIDEO_SPEED = 1;

/* ------------------------------------------------------------------ */

var url = url_list[Math.floor(Math.random() * url_list.length)];
var isVideo = /\.(mp4|webm|ogv|mov)(\?.*)?$/i.test(url);

function makeVideo() {
    var v = document.createElement('video');
    v.className = 'tp-bg-video';
    v.src = url;
    v.autoplay = true;
    v.loop = true;
    v.muted = true;          // required for autoplay in every browser
    v.defaultMuted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.playbackRate = VIDEO_SPEED;
    var tryPlay = function () {
        var p = v.play();
        if (p && p.catch) { p.catch(function () {}); }
    };
    v.addEventListener('loadedmetadata', tryPlay);
    v.addEventListener('canplay', tryPlay);
    // resume if the tab was hidden and the browser paused it
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { tryPlay(); }
    });
    return v;
}

if (!/game/.test(location.pathname) || /games/.test(location.pathname)) {
    // ---------- home / lobby pages: background in the header ----------
    if (isVideo) {
        GM_addStyle(
            '#header { position: relative; overflow: hidden; background: #2b2b2b !important; }' +
            '#header > .tp-bg-video { position: absolute; top: 0; left: 0; width: 100%; height: 100%;' +
            '  object-fit: cover; z-index: 0; pointer-events: none; }' +
            '#header > *:not(.tp-bg-video) { position: relative; z-index: 1; }'
        );
        $(function () { $('#header').prepend(makeVideo()); });
    } else {
        GM_addStyle('#header {background: #2b2b2b url(' + url + ') no-repeat top ' +
                    (FILL_WINDOW ? '/ cover' : '') + ' !important;}');
    }
} else {
    // ---------- in-game page: background behind a transparent canvas ----------
    $('html').css({ 'background-color': '#000000' });

    if (isVideo) {
        GM_addStyle(
            '.tp-bg-video { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;' +
            '  object-fit: ' + (FILL_WINDOW ? 'cover' : 'none') + ';' +
            '  z-index: -1; pointer-events: none; background: #000; }'
        );
        $(function () { $('body').prepend(makeVideo()); });
    } else {
        $('html').css({
            'background-image': 'url(' + url + ')',
            'background-repeat': 'no-repeat',
            'background-position': 'center',
            'background-size': FILL_WINDOW ? 'cover' : 'auto',
            'background-attachment': 'fixed'
        });
    }

    tagpro.ready(function () {
        var oldCanvas = $(tagpro.renderer.canvas);
        var newCanvas = $('<canvas id="viewport" width="1280" height="800"></canvas>');
        oldCanvas.after(newCanvas);
        oldCanvas.remove();
        tagpro.renderer.canvas = newCanvas.get(0);
        tagpro.renderer.options.transparent = true;
        tagpro.renderer.renderer = tagpro.renderer.createRenderer();
        tagpro.renderer.resizeAndCenterView();
        newCanvas.show();
    });
}
