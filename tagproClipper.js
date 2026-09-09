// ==UserScript==
// @name         TagPro Clipper
// @namespace    https://tagpro.koalabeast.com/
// @version      1.0.1
// @description  Instant replay for live games: press \ (configurable) to save the last 30 seconds (configurable) of the game as an MP4 clip. Clips are kept in the browser and can be watched from the TagPro homepage (Clips button) or downloaded.
// @author       Claude Fable 5.1, gryff6
// @match        https://tagpro.koalabeast.com/*
// @match        https://tagpro.gg/*
// @run-at       document-end
// @noframes
// @grant        none
// ==/UserScript==

/*
 * How it works (live game page, /game):
 *   The PIXI renderer's render(stage) call is wrapped; right after every frame is drawn the game
 *   canvas is copied onto an off-screen canvas (background colour behind the map, optional
 *   down-scale), turned into a VideoFrame and pushed through a WebCodecs VideoEncoder (H.264 if
 *   the browser has it, otherwise VP9). The encoded chunks go into a ring buffer that always holds
 *   at least the last N seconds, starting on a keyframe (one is forced every second). The hotkey
 *   muxes the buffer into an MP4 (mp4-muxer, bundled below) and stores it in IndexedDB — and/or downloads it.
 *
 * Homepage (/): a "Clips" button opens a viewer for the stored clips (play, loop, fullscreen,
 *   download, delete). Nothing is uploaded anywhere; the clips live in this browser's storage.
 */

(function () {
    'use strict';

    // ------------------------------------------------------------------ mp4-muxer 5.2.2 (bundled)
    // Verbatim copy of https://www.npmjs.com/package/mp4-muxer build/mp4-muxer.js by Vanilagy, MIT licence:
    // MIT License
    // 
    // Copyright (c) 2023 Vanilagy
    // 
    // Permission is hereby granted, free of charge, to any person obtaining a copy
    // of this software and associated documentation files (the "Software"), to deal
    // in the Software without restriction, including without limitation the rights
    // to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    // copies of the Software, and to permit persons to whom the Software is
    // furnished to do so, subject to the following conditions:
    // 
    // The above copyright notice and this permission notice shall be included in all
    // copies or substantial portions of the Software.
    // 
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    // OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    // SOFTWARE.
    // (bundled so the script has no network dependency; it defines the local `Mp4Muxer`)
    /* eslint-disable */
"use strict";
var Mp4Muxer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => {
    if (!member.has(obj))
      throw TypeError("Cannot " + msg);
  };
  var __privateGet = (obj, member, getter) => {
    __accessCheck(obj, member, "read from private field");
    return getter ? getter.call(obj) : member.get(obj);
  };
  var __privateAdd = (obj, member, value) => {
    if (member.has(obj))
      throw TypeError("Cannot add the same private member more than once");
    member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  };
  var __privateSet = (obj, member, value, setter) => {
    __accessCheck(obj, member, "write to private field");
    setter ? setter.call(obj, value) : member.set(obj, value);
    return value;
  };
  var __privateWrapper = (obj, member, setter, getter) => ({
    set _(value) {
      __privateSet(obj, member, value, setter);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  });
  var __privateMethod = (obj, member, method) => {
    __accessCheck(obj, member, "access private method");
    return method;
  };

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    ArrayBufferTarget: () => ArrayBufferTarget,
    FileSystemWritableFileStreamTarget: () => FileSystemWritableFileStreamTarget,
    Muxer: () => Muxer,
    StreamTarget: () => StreamTarget
  });

  // src/misc.ts
  var bytes = new Uint8Array(8);
  var view = new DataView(bytes.buffer);
  var u8 = (value) => {
    return [(value % 256 + 256) % 256];
  };
  var u16 = (value) => {
    view.setUint16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var i16 = (value) => {
    view.setInt16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var u24 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[1], bytes[2], bytes[3]];
  };
  var u32 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var i32 = (value) => {
    view.setInt32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var u64 = (value) => {
    view.setUint32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var fixed_8_8 = (value) => {
    view.setInt16(0, 2 ** 8 * value, false);
    return [bytes[0], bytes[1]];
  };
  var fixed_16_16 = (value) => {
    view.setInt32(0, 2 ** 16 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var fixed_2_30 = (value) => {
    view.setInt32(0, 2 ** 30 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var ascii = (text, nullTerminated = false) => {
    let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      bytes2.push(0);
    return bytes2;
  };
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };
  var lastPresentedSample = (samples) => {
    let result = void 0;
    for (let sample of samples) {
      if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
        result = sample;
      }
    }
    return result;
  };
  var intoTimescale = (timeInSeconds, timescale, round = true) => {
    let value = timeInSeconds * timescale;
    return round ? Math.round(value) : value;
  };
  var rotationMatrix = (rotationInDegrees) => {
    let theta = rotationInDegrees * (Math.PI / 180);
    let cosTheta = Math.cos(theta);
    let sinTheta = Math.sin(theta);
    return [
      cosTheta,
      sinTheta,
      0,
      -sinTheta,
      cosTheta,
      0,
      0,
      0,
      1
    ];
  };
  var IDENTITY_MATRIX = rotationMatrix(0);
  var matrixToBytes = (matrix) => {
    return [
      fixed_16_16(matrix[0]),
      fixed_16_16(matrix[1]),
      fixed_2_30(matrix[2]),
      fixed_16_16(matrix[3]),
      fixed_16_16(matrix[4]),
      fixed_2_30(matrix[5]),
      fixed_16_16(matrix[6]),
      fixed_16_16(matrix[7]),
      fixed_2_30(matrix[8])
    ];
  };
  var deepClone = (x) => {
    if (!x)
      return x;
    if (typeof x !== "object")
      return x;
    if (Array.isArray(x))
      return x.map(deepClone);
    return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)]));
  };
  var isU32 = (value) => {
    return value >= 0 && value < 2 ** 32;
  };

  // src/box.ts
  var box = (type, contents, children) => ({
    type,
    contents: contents && new Uint8Array(contents.flat(10)),
    children
  });
  var fullBox = (type, version, flags, contents, children) => box(
    type,
    [u8(version), u24(flags), contents ?? []],
    children
  );
  var ftyp = (details) => {
    let minorVersion = 512;
    if (details.fragmented)
      return box("ftyp", [
        ascii("iso5"),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("iso5"),
        ascii("iso6"),
        ascii("mp41")
      ]);
    return box("ftyp", [
      ascii("isom"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("isom"),
      details.holdsAvc ? ascii("avc1") : [],
      ascii("mp41")
    ]);
  };
  var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
  var free = (size) => ({ type: "free", size });
  var moov = (tracks, creationTime, fragmented = false) => box("moov", null, [
    mvhd(creationTime, tracks),
    ...tracks.map((x) => trak(x, creationTime)),
    fragmented ? mvex(tracks) : null
  ]);
  var mvhd = (creationTime, tracks) => {
    let duration = intoTimescale(Math.max(
      0,
      ...tracks.filter((x) => x.samples.length > 0).map((x) => {
        const lastSample = lastPresentedSample(x.samples);
        return lastSample.presentationTimestamp + lastSample.duration;
      })
    ), GLOBAL_TIMESCALE);
    let nextTrackId = Math.max(...tracks.map((x) => x.id)) + 1;
    let needsU64 = !isU32(creationTime) || !isU32(duration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mvhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u32OrU64(duration),
      // Duration
      fixed_16_16(1),
      // Preferred rate
      fixed_8_8(1),
      // Preferred volume
      Array(10).fill(0),
      // Reserved
      matrixToBytes(IDENTITY_MATRIX),
      // Matrix
      Array(24).fill(0),
      // Pre-defined
      u32(nextTrackId)
      // Next track ID
    ]);
  };
  var trak = (track, creationTime) => box("trak", null, [
    tkhd(track, creationTime),
    mdia(track, creationTime)
  ]);
  var tkhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let durationInGlobalTimescale = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      GLOBAL_TIMESCALE
    );
    let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
    let u32OrU64 = needsU64 ? u64 : u32;
    let matrix;
    if (track.info.type === "video") {
      matrix = typeof track.info.rotation === "number" ? rotationMatrix(track.info.rotation) : track.info.rotation;
    } else {
      matrix = IDENTITY_MATRIX;
    }
    return fullBox("tkhd", +needsU64, 3, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.id),
      // Track ID
      u32(0),
      // Reserved
      u32OrU64(durationInGlobalTimescale),
      // Duration
      Array(8).fill(0),
      // Reserved
      u16(0),
      // Layer
      u16(0),
      // Alternate group
      fixed_8_8(track.info.type === "audio" ? 1 : 0),
      // Volume
      u16(0),
      // Reserved
      matrixToBytes(matrix),
      // Matrix
      fixed_16_16(track.info.type === "video" ? track.info.width : 0),
      // Track width
      fixed_16_16(track.info.type === "video" ? track.info.height : 0)
      // Track height
    ]);
  };
  var mdia = (track, creationTime) => box("mdia", null, [
    mdhd(track, creationTime),
    hdlr(track.info.type === "video" ? "vide" : "soun"),
    minf(track)
  ]);
  var mdhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let localDuration = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      track.timescale
    );
    let needsU64 = !isU32(creationTime) || !isU32(localDuration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mdhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.timescale),
      // Timescale
      u32OrU64(localDuration),
      // Duration
      u16(21956),
      // Language ("und", undetermined)
      u16(0)
      // Quality
    ]);
  };
  var hdlr = (componentSubtype) => fullBox("hdlr", 0, 0, [
    ascii("mhlr"),
    // Component type
    ascii(componentSubtype),
    // Component subtype
    u32(0),
    // Component manufacturer
    u32(0),
    // Component flags
    u32(0),
    // Component flags mask
    ascii("mp4-muxer-hdlr", true)
    // Component name
  ]);
  var minf = (track) => box("minf", null, [
    track.info.type === "video" ? vmhd() : smhd(),
    dinf(),
    stbl(track)
  ]);
  var vmhd = () => fullBox("vmhd", 0, 1, [
    u16(0),
    // Graphics mode
    u16(0),
    // Opcolor R
    u16(0),
    // Opcolor G
    u16(0)
    // Opcolor B
  ]);
  var smhd = () => fullBox("smhd", 0, 0, [
    u16(0),
    // Balance
    u16(0)
    // Reserved
  ]);
  var dinf = () => box("dinf", null, [
    dref()
  ]);
  var dref = () => fullBox("dref", 0, 0, [
    u32(1)
    // Entry count
  ], [
    url()
  ]);
  var url = () => fullBox("url ", 0, 1);
  var stbl = (track) => {
    const needsCtts = track.compositionTimeOffsetTable.length > 1 || track.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
    return box("stbl", null, [
      stsd(track),
      stts(track),
      stss(track),
      stsc(track),
      stsz(track),
      stco(track),
      needsCtts ? ctts(track) : null
    ]);
  };
  var stsd = (track) => fullBox("stsd", 0, 0, [
    u32(1)
    // Entry count
  ], [
    track.info.type === "video" ? videoSampleDescription(
      VIDEO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    ) : soundSampleDescription(
      AUDIO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    )
  ]);
  var videoSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Pre-defined
    u16(0),
    // Reserved
    Array(12).fill(0),
    // Pre-defined
    u16(track.info.width),
    // Width
    u16(track.info.height),
    // Height
    u32(4718592),
    // Horizontal resolution
    u32(4718592),
    // Vertical resolution
    u32(0),
    // Reserved
    u16(1),
    // Frame count
    Array(32).fill(0),
    // Compressor name
    u16(24),
    // Depth
    i16(65535)
    // Pre-defined
  ], [
    VIDEO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track),
    track.info.decoderConfig.colorSpace ? colr(track) : null
  ]);
  var COLOR_PRIMARIES_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // ITU-R BT.601 525 - SMPTE 170M
  };
  var TRANSFER_CHARACTERISTICS_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "smpte170m": 6,
    // SMPTE 170M
    "iec61966-2-1": 13
    // IEC 61966-2-1
  };
  var MATRIX_COEFFICIENTS_MAP = {
    "rgb": 0,
    // Identity
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // SMPTE 170M
  };
  var colr = (track) => box("colr", [
    ascii("nclx"),
    // Colour type
    u16(COLOR_PRIMARIES_MAP[track.info.decoderConfig.colorSpace.primaries]),
    // Colour primaries
    u16(TRANSFER_CHARACTERISTICS_MAP[track.info.decoderConfig.colorSpace.transfer]),
    // Transfer characteristics
    u16(MATRIX_COEFFICIENTS_MAP[track.info.decoderConfig.colorSpace.matrix]),
    // Matrix coefficients
    u8((track.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
    // Full range flag
  ]);
  var avcC = (track) => track.info.decoderConfig && box("avcC", [
    // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var hvcC = (track) => track.info.decoderConfig && box("hvcC", [
    // For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var vpcC = (track) => {
    if (!track.info.decoderConfig) {
      return null;
    }
    let decoderConfig = track.info.decoderConfig;
    if (!decoderConfig.colorSpace) {
      throw new Error(`'colorSpace' is required in the decoder config for VP9.`);
    }
    let parts = decoderConfig.codec.split(".");
    let profile = Number(parts[1]);
    let level = Number(parts[2]);
    let bitDepth = Number(parts[3]);
    let chromaSubsampling = 0;
    let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    return fullBox("vpcC", 1, 0, [
      u8(profile),
      // Profile
      u8(level),
      // Level
      u8(thirdByte),
      // Bit depth, chroma subsampling, full range
      u8(colourPrimaries),
      // Colour primaries
      u8(transferCharacteristics),
      // Transfer characteristics
      u8(matrixCoefficients),
      // Matrix coefficients
      u16(0)
      // Codec initialization data size
    ]);
  };
  var av1C = () => {
    let marker = 1;
    let version = 1;
    let firstByte = (marker << 7) + version;
    return box("av1C", [
      firstByte,
      0,
      0,
      0
    ]);
  };
  var soundSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Version
    u16(0),
    // Revision level
    u32(0),
    // Vendor
    u16(track.info.numberOfChannels),
    // Number of channels
    u16(16),
    // Sample size (bits)
    u16(0),
    // Compression ID
    u16(0),
    // Packet size
    fixed_16_16(track.info.sampleRate)
    // Sample rate
  ], [
    AUDIO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track)
  ]);
  var esds = (track) => {
    let description = new Uint8Array(track.info.decoderConfig.description);
    return fullBox("esds", 0, 0, [
      // https://stackoverflow.com/a/54803118
      u32(58753152),
      // TAG(3) = Object Descriptor ([2])
      u8(32 + description.byteLength),
      // length of this OD (which includes the next 2 tags)
      u16(1),
      // ES_ID = 1
      u8(0),
      // flags etc = 0
      u32(75530368),
      // TAG(4) = ES Descriptor ([2]) embedded in above OD
      u8(18 + description.byteLength),
      // length of this ESD
      u8(64),
      // MPEG-4 Audio
      u8(21),
      // stream type(6bits)=5 audio, flags(2bits)=1
      u24(0),
      // 24bit buffer size
      u32(130071),
      // max bitrate
      u32(130071),
      // avg bitrate
      u32(92307584),
      // TAG(5) = ASC ([2],[3]) embedded in above OD
      u8(description.byteLength),
      // length
      ...description,
      u32(109084800),
      // TAG(6)
      u8(1),
      // length
      u8(2)
      // data
    ]);
  };
  var dOps = (track) => {
    let preskip = 3840;
    let gain = 0;
    const description = track.info.decoderConfig?.description;
    if (description) {
      if (description.byteLength < 18) {
        throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
      }
      const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
      preskip = view2.getUint16(10, true);
      gain = view2.getInt16(14, true);
    }
    return box("dOps", [
      u8(0),
      // Version
      u8(track.info.numberOfChannels),
      // OutputChannelCount
      u16(preskip),
      u32(track.info.sampleRate),
      // InputSampleRate
      fixed_8_8(gain),
      // OutputGain
      u8(0)
      // ChannelMappingFamily
    ]);
  };
  var stts = (track) => {
    return fullBox("stts", 0, 0, [
      u32(track.timeToSampleTable.length),
      // Number of entries
      track.timeToSampleTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleDelta)
        // Sample duration
      ])
    ]);
  };
  var stss = (track) => {
    if (track.samples.every((x) => x.type === "key"))
      return null;
    let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
    return fullBox("stss", 0, 0, [
      u32(keySamples.length),
      // Number of entries
      keySamples.map(([index]) => u32(index + 1))
      // Sync sample table
    ]);
  };
  var stsc = (track) => {
    return fullBox("stsc", 0, 0, [
      u32(track.compactlyCodedChunkTable.length),
      // Number of entries
      track.compactlyCodedChunkTable.map((x) => [
        // Sample-to-chunk table
        u32(x.firstChunk),
        // First chunk
        u32(x.samplesPerChunk),
        // Samples per chunk
        u32(1)
        // Sample description index
      ])
    ]);
  };
  var stsz = (track) => fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(track.samples.length),
    // Number of entries
    track.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
  var stco = (track) => {
    if (track.finalizedChunks.length > 0 && last(track.finalizedChunks).offset >= 2 ** 32) {
      return fullBox("co64", 0, 0, [
        u32(track.finalizedChunks.length),
        // Number of entries
        track.finalizedChunks.map((x) => u64(x.offset))
        // Chunk offset table
      ]);
    }
    return fullBox("stco", 0, 0, [
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((x) => u32(x.offset))
      // Chunk offset table
    ]);
  };
  var ctts = (track) => {
    return fullBox("ctts", 0, 0, [
      u32(track.compositionTimeOffsetTable.length),
      // Number of entries
      track.compositionTimeOffsetTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleCompositionTimeOffset)
        // Sample offset
      ])
    ]);
  };
  var mvex = (tracks) => {
    return box("mvex", null, tracks.map(trex));
  };
  var trex = (track) => {
    return fullBox("trex", 0, 0, [
      u32(track.id),
      // Track ID
      u32(1),
      // Default sample description index
      u32(0),
      // Default sample duration
      u32(0),
      // Default sample size
      u32(0)
      // Default sample flags
    ]);
  };
  var moof = (sequenceNumber, tracks) => {
    return box("moof", null, [
      mfhd(sequenceNumber),
      ...tracks.map(traf)
    ]);
  };
  var mfhd = (sequenceNumber) => {
    return fullBox("mfhd", 0, 0, [
      u32(sequenceNumber)
      // Sequence number
    ]);
  };
  var fragmentSampleFlags = (sample) => {
    let byte1 = 0;
    let byte2 = 0;
    let byte3 = 0;
    let byte4 = 0;
    let sampleIsDifferenceSample = sample.type === "delta";
    byte2 |= +sampleIsDifferenceSample;
    if (sampleIsDifferenceSample) {
      byte1 |= 1;
    } else {
      byte1 |= 2;
    }
    return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
  };
  var traf = (track) => {
    return box("traf", null, [
      tfhd(track),
      tfdt(track),
      trun(track)
    ]);
  };
  var tfhd = (track) => {
    let tfFlags = 0;
    tfFlags |= 8;
    tfFlags |= 16;
    tfFlags |= 32;
    tfFlags |= 131072;
    let referenceSample = track.currentChunk.samples[1] ?? track.currentChunk.samples[0];
    let referenceSampleInfo = {
      duration: referenceSample.timescaleUnitsToNextSample,
      size: referenceSample.size,
      flags: fragmentSampleFlags(referenceSample)
    };
    return fullBox("tfhd", 0, tfFlags, [
      u32(track.id),
      // Track ID
      u32(referenceSampleInfo.duration),
      // Default sample duration
      u32(referenceSampleInfo.size),
      // Default sample size
      u32(referenceSampleInfo.flags)
      // Default sample flags
    ]);
  };
  var tfdt = (track) => {
    return fullBox("tfdt", 1, 0, [
      u64(intoTimescale(track.currentChunk.startTimestamp, track.timescale))
      // Base Media Decode Time
    ]);
  };
  var trun = (track) => {
    let allSampleDurations = track.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
    let allSampleSizes = track.currentChunk.samples.map((x) => x.size);
    let allSampleFlags = track.currentChunk.samples.map(fragmentSampleFlags);
    let allSampleCompositionTimeOffsets = track.currentChunk.samples.map((x) => intoTimescale(x.presentationTimestamp - x.decodeTimestamp, track.timescale));
    let uniqueSampleDurations = new Set(allSampleDurations);
    let uniqueSampleSizes = new Set(allSampleSizes);
    let uniqueSampleFlags = new Set(allSampleFlags);
    let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
    let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
    let sampleDurationPresent = uniqueSampleDurations.size > 1;
    let sampleSizePresent = uniqueSampleSizes.size > 1;
    let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
    let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
    let flags = 0;
    flags |= 1;
    flags |= 4 * +firstSampleFlagsPresent;
    flags |= 256 * +sampleDurationPresent;
    flags |= 512 * +sampleSizePresent;
    flags |= 1024 * +sampleFlagsPresent;
    flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
    return fullBox("trun", 1, flags, [
      u32(track.currentChunk.samples.length),
      // Sample count
      u32(track.currentChunk.offset - track.currentChunk.moofOffset || 0),
      // Data offset
      firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
      track.currentChunk.samples.map((_, i) => [
        sampleDurationPresent ? u32(allSampleDurations[i]) : [],
        // Sample duration
        sampleSizePresent ? u32(allSampleSizes[i]) : [],
        // Sample size
        sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
        // Sample flags
        // Sample composition time offsets
        sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
      ])
    ]);
  };
  var mfra = (tracks) => {
    return box("mfra", null, [
      ...tracks.map(tfra),
      mfro()
    ]);
  };
  var tfra = (track, trackIndex) => {
    let version = 1;
    return fullBox("tfra", version, 0, [
      u32(track.id),
      // Track ID
      u32(63),
      // This specifies that traf number, trun number and sample number are 32-bit ints
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((chunk) => [
        u64(intoTimescale(chunk.startTimestamp, track.timescale)),
        // Time
        u64(chunk.moofOffset),
        // moof offset
        u32(trackIndex + 1),
        // traf number
        u32(1),
        // trun number
        u32(1)
        // Sample number
      ])
    ]);
  };
  var mfro = () => {
    return fullBox("mfro", 0, 0, [
      // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
      // is known
      u32(0)
      // Size
    ]);
  };
  var VIDEO_CODEC_TO_BOX_NAME = {
    "avc": "avc1",
    "hevc": "hvc1",
    "vp9": "vp09",
    "av1": "av01"
  };
  var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
    "avc": avcC,
    "hevc": hvcC,
    "vp9": vpcC,
    "av1": av1C
  };
  var AUDIO_CODEC_TO_BOX_NAME = {
    "aac": "mp4a",
    "opus": "Opus"
  };
  var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
    "aac": esds,
    "opus": dOps
  };

  // src/target.ts
  var isTarget = Symbol("isTarget");
  var Target = class {
  };
  isTarget;
  var ArrayBufferTarget = class extends Target {
    constructor() {
      super(...arguments);
      this.buffer = null;
    }
  };
  var StreamTarget = class extends Target {
    constructor(options) {
      super();
      this.options = options;
      if (typeof options !== "object") {
        throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
      }
      if (options.onData) {
        if (typeof options.onData !== "function") {
          throw new TypeError("options.onData, when provided, must be a function.");
        }
        if (options.onData.length < 2) {
          throw new TypeError(
            "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
          );
        }
      }
      if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
        throw new TypeError("options.chunked, when provided, must be a boolean.");
      }
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
        throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
      }
    }
  };
  var FileSystemWritableFileStreamTarget = class extends Target {
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.options = options;
      if (!(stream instanceof FileSystemWritableFileStream)) {
        throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
      }
      if (options !== void 0 && typeof options !== "object") {
        throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
      }
      if (options) {
        if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
          throw new TypeError("options.chunkSize, when provided, must be a positive integer");
        }
      }
    }
  };

  // src/writer.ts
  var _helper, _helperView;
  var Writer = class {
    constructor() {
      this.pos = 0;
      __privateAdd(this, _helper, new Uint8Array(8));
      __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
      /**
       * Stores the position from the start of the file to where boxes elements have been written. This is used to
       * rewrite/edit elements that were already added before, and to measure sizes of things.
       */
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    /** Sets the current position for future writes to a new one. */
    seek(newPos) {
      this.pos = newPos;
    }
    writeU32(value) {
      __privateGet(this, _helperView).setUint32(0, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 4));
    }
    writeU64(value) {
      __privateGet(this, _helperView).setUint32(0, Math.floor(value / 2 ** 32), false);
      __privateGet(this, _helperView).setUint32(4, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7)
          this.write(__privateGet(this, _helper));
      }
      if (text.length % 8 !== 0) {
        this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
      }
    }
    writeBox(box2) {
      this.offsets.set(box2, this.pos);
      if (box2.contents && !box2.children) {
        this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
        this.write(box2.contents);
      } else {
        let startPos = this.pos;
        this.writeBoxHeader(box2, 0);
        if (box2.contents)
          this.write(box2.contents);
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              this.writeBox(child);
        }
        let endPos = this.pos;
        let size = box2.size ?? endPos - startPos;
        this.seek(startPos);
        this.writeBoxHeader(box2, size);
        this.seek(endPos);
      }
    }
    writeBoxHeader(box2, size) {
      this.writeU32(box2.largeSize ? 1 : size);
      this.writeAscii(box2.type);
      if (box2.largeSize)
        this.writeU64(size);
    }
    measureBoxHeader(box2) {
      return 8 + (box2.largeSize ? 8 : 0);
    }
    patchBox(box2) {
      let endPos = this.pos;
      this.seek(this.offsets.get(box2));
      this.writeBox(box2);
      this.seek(endPos);
    }
    measureBox(box2) {
      if (box2.contents && !box2.children) {
        let headerSize = this.measureBoxHeader(box2);
        return headerSize + box2.contents.byteLength;
      } else {
        let result = this.measureBoxHeader(box2);
        if (box2.contents)
          result += box2.contents.byteLength;
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              result += this.measureBox(child);
        }
        return result;
      }
    }
  };
  _helper = new WeakMap();
  _helperView = new WeakMap();
  var _target, _buffer, _bytes, _maxPos, _ensureSize, ensureSize_fn;
  var ArrayBufferTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _ensureSize);
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _buffer, new ArrayBuffer(2 ** 16));
      __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
      __privateAdd(this, _maxPos, 0);
      __privateSet(this, _target, target);
    }
    write(data) {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos + data.byteLength);
      __privateGet(this, _bytes).set(data, this.pos);
      this.pos += data.byteLength;
      __privateSet(this, _maxPos, Math.max(__privateGet(this, _maxPos), this.pos));
    }
    finalize() {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos);
      __privateGet(this, _target).buffer = __privateGet(this, _buffer).slice(0, Math.max(__privateGet(this, _maxPos), this.pos));
    }
  };
  _target = new WeakMap();
  _buffer = new WeakMap();
  _bytes = new WeakMap();
  _maxPos = new WeakMap();
  _ensureSize = new WeakSet();
  ensureSize_fn = function(size) {
    let newLength = __privateGet(this, _buffer).byteLength;
    while (newLength < size)
      newLength *= 2;
    if (newLength === __privateGet(this, _buffer).byteLength)
      return;
    let newBuffer = new ArrayBuffer(newLength);
    let newBytes = new Uint8Array(newBuffer);
    newBytes.set(__privateGet(this, _bytes), 0);
    __privateSet(this, _buffer, newBuffer);
    __privateSet(this, _bytes, newBytes);
  };
  var DEFAULT_CHUNK_SIZE = 2 ** 24;
  var MAX_CHUNKS_AT_ONCE = 2;
  var _target2, _sections, _chunked, _chunkSize, _chunks, _writeDataIntoChunks, writeDataIntoChunks_fn, _insertSectionIntoChunk, insertSectionIntoChunk_fn, _createChunk, createChunk_fn, _flushChunks, flushChunks_fn;
  var StreamTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _writeDataIntoChunks);
      __privateAdd(this, _insertSectionIntoChunk);
      __privateAdd(this, _createChunk);
      __privateAdd(this, _flushChunks);
      __privateAdd(this, _target2, void 0);
      __privateAdd(this, _sections, []);
      __privateAdd(this, _chunked, void 0);
      __privateAdd(this, _chunkSize, void 0);
      /**
       * The data is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed out.
       * A chunk is flushed if all of its contents have been written.
       */
      __privateAdd(this, _chunks, []);
      __privateSet(this, _target2, target);
      __privateSet(this, _chunked, target.options?.chunked ?? false);
      __privateSet(this, _chunkSize, target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE);
    }
    write(data) {
      __privateGet(this, _sections).push({
        data: data.slice(),
        start: this.pos
      });
      this.pos += data.byteLength;
    }
    flush() {
      if (__privateGet(this, _sections).length === 0)
        return;
      let chunks = [];
      let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        let lastChunk = chunks[chunks.length - 1];
        let section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (let chunk of chunks) {
        chunk.data = new Uint8Array(chunk.size);
        for (let section of __privateGet(this, _sections)) {
          if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
            chunk.data.set(section.data, section.start - chunk.start);
          }
        }
        if (__privateGet(this, _chunked)) {
          __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, chunk.data, chunk.start);
          __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
        } else {
          __privateGet(this, _target2).options.onData?.(chunk.data, chunk.start);
        }
      }
      __privateGet(this, _sections).length = 0;
    }
    finalize() {
      if (__privateGet(this, _chunked)) {
        __privateMethod(this, _flushChunks, flushChunks_fn).call(this, true);
      }
    }
  };
  _target2 = new WeakMap();
  _sections = new WeakMap();
  _chunked = new WeakMap();
  _chunkSize = new WeakMap();
  _chunks = new WeakMap();
  _writeDataIntoChunks = new WeakSet();
  writeDataIntoChunks_fn = function(data, position) {
    let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + __privateGet(this, _chunkSize));
    if (chunkIndex === -1)
      chunkIndex = __privateMethod(this, _createChunk, createChunk_fn).call(this, position);
    let chunk = __privateGet(this, _chunks)[chunkIndex];
    let relativePosition = position - chunk.start;
    let toWrite = data.subarray(0, Math.min(__privateGet(this, _chunkSize) - relativePosition, data.byteLength));
    chunk.data.set(toWrite, relativePosition);
    let section = {
      start: relativePosition,
      end: relativePosition + toWrite.byteLength
    };
    __privateMethod(this, _insertSectionIntoChunk, insertSectionIntoChunk_fn).call(this, chunk, section);
    if (chunk.written[0].start === 0 && chunk.written[0].end === __privateGet(this, _chunkSize)) {
      chunk.shouldFlush = true;
    }
    if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
      for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
        __privateGet(this, _chunks)[i].shouldFlush = true;
      }
      __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
    }
    if (toWrite.byteLength < data.byteLength) {
      __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
    }
  };
  _insertSectionIntoChunk = new WeakSet();
  insertSectionIntoChunk_fn = function(chunk, section) {
    let low = 0;
    let high = chunk.written.length - 1;
    let index = -1;
    while (low <= high) {
      let mid = Math.floor(low + (high - low + 1) / 2);
      if (chunk.written[mid].start <= section.start) {
        low = mid + 1;
        index = mid;
      } else {
        high = mid - 1;
      }
    }
    chunk.written.splice(index + 1, 0, section);
    if (index === -1 || chunk.written[index].end < section.start)
      index++;
    while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
      chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
      chunk.written.splice(index + 1, 1);
    }
  };
  _createChunk = new WeakSet();
  createChunk_fn = function(includesPosition) {
    let start = Math.floor(includesPosition / __privateGet(this, _chunkSize)) * __privateGet(this, _chunkSize);
    let chunk = {
      start,
      data: new Uint8Array(__privateGet(this, _chunkSize)),
      written: [],
      shouldFlush: false
    };
    __privateGet(this, _chunks).push(chunk);
    __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
    return __privateGet(this, _chunks).indexOf(chunk);
  };
  _flushChunks = new WeakSet();
  flushChunks_fn = function(force = false) {
    for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
      let chunk = __privateGet(this, _chunks)[i];
      if (!chunk.shouldFlush && !force)
        continue;
      for (let section of chunk.written) {
        __privateGet(this, _target2).options.onData?.(
          chunk.data.subarray(section.start, section.end),
          chunk.start + section.start
        );
      }
      __privateGet(this, _chunks).splice(i--, 1);
    }
  };
  var FileSystemWritableFileStreamTargetWriter = class extends StreamTargetWriter {
    constructor(target) {
      super(new StreamTarget({
        onData: (data, position) => target.stream.write({
          type: "write",
          data,
          position
        }),
        chunked: true,
        chunkSize: target.options?.chunkSize
      }));
    }
  };

  // src/muxer.ts
  var GLOBAL_TIMESCALE = 1e3;
  var SUPPORTED_VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
  var SUPPORTED_AUDIO_CODECS = ["aac", "opus"];
  var TIMESTAMP_OFFSET = 2082844800;
  var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "cross-track-offset"];
  var _options, _writer, _ftypSize, _mdat, _videoTrack, _audioTrack, _creationTime, _finalizedChunks, _nextFragmentNumber, _videoSampleQueue, _audioSampleQueue, _finalized, _validateOptions, validateOptions_fn, _writeHeader, writeHeader_fn, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn, _prepareTracks, prepareTracks_fn, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn, _createSampleForTrack, createSampleForTrack_fn, _addSampleToTrack, addSampleToTrack_fn, _validateTimestamp, validateTimestamp_fn, _finalizeCurrentChunk, finalizeCurrentChunk_fn, _finalizeFragment, finalizeFragment_fn, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn, _ensureNotFinalized, ensureNotFinalized_fn;
  var Muxer = class {
    constructor(options) {
      __privateAdd(this, _validateOptions);
      __privateAdd(this, _writeHeader);
      __privateAdd(this, _computeMoovSizeUpperBound);
      __privateAdd(this, _prepareTracks);
      // https://wiki.multimedia.cx/index.php/MPEG-4_Audio
      __privateAdd(this, _generateMpeg4AudioSpecificConfig);
      __privateAdd(this, _createSampleForTrack);
      __privateAdd(this, _addSampleToTrack);
      __privateAdd(this, _validateTimestamp);
      __privateAdd(this, _finalizeCurrentChunk);
      __privateAdd(this, _finalizeFragment);
      __privateAdd(this, _maybeFlushStreamingTargetWriter);
      __privateAdd(this, _ensureNotFinalized);
      __privateAdd(this, _options, void 0);
      __privateAdd(this, _writer, void 0);
      __privateAdd(this, _ftypSize, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoTrack, null);
      __privateAdd(this, _audioTrack, null);
      __privateAdd(this, _creationTime, Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET);
      __privateAdd(this, _finalizedChunks, []);
      // Fields for fragmented MP4:
      __privateAdd(this, _nextFragmentNumber, 1);
      __privateAdd(this, _videoSampleQueue, []);
      __privateAdd(this, _audioSampleQueue, []);
      __privateAdd(this, _finalized, false);
      __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
      options.video = deepClone(options.video);
      options.audio = deepClone(options.audio);
      options.fastStart = deepClone(options.fastStart);
      this.target = options.target;
      __privateSet(this, _options, {
        firstTimestampBehavior: "strict",
        ...options
      });
      if (options.target instanceof ArrayBufferTarget) {
        __privateSet(this, _writer, new ArrayBufferTargetWriter(options.target));
      } else if (options.target instanceof StreamTarget) {
        __privateSet(this, _writer, new StreamTargetWriter(options.target));
      } else if (options.target instanceof FileSystemWritableFileStreamTarget) {
        __privateSet(this, _writer, new FileSystemWritableFileStreamTargetWriter(options.target));
      } else {
        throw new Error(`Invalid target: ${options.target}`);
      }
      __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
      __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
    }
    addVideoChunk(sample, meta, timestamp, compositionTimeOffset) {
      if (!(sample instanceof EncodedVideoChunk)) {
        throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addVideoChunkRaw(
        data,
        sample.type,
        timestamp ?? sample.timestamp,
        sample.duration,
        meta,
        compositionTimeOffset
      );
    }
    addVideoChunkRaw(data, type, timestamp, duration, meta, compositionTimeOffset) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).video)
        throw new Error("No video track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _videoTrack).samples.length === __privateGet(this, _options).fastStart.expectedVideoChunks) {
        throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedVideoChunks}).`);
      }
      let videoSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _videoTrack), data, type, timestamp, duration, meta, compositionTimeOffset);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _audioTrack)) {
        while (__privateGet(this, _audioSampleQueue).length > 0 && __privateGet(this, _audioSampleQueue)[0].decodeTimestamp <= videoSample.decodeTimestamp) {
          let audioSample = __privateGet(this, _audioSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        }
        if (videoSample.decodeTimestamp <= __privateGet(this, _audioTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        } else {
          __privateGet(this, _videoSampleQueue).push(videoSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      }
    }
    addAudioChunk(sample, meta, timestamp) {
      if (!(sample instanceof EncodedAudioChunk)) {
        throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
    }
    addAudioChunkRaw(data, type, timestamp, duration, meta) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).audio)
        throw new Error("No audio track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _audioTrack).samples.length === __privateGet(this, _options).fastStart.expectedAudioChunks) {
        throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedAudioChunks}).`);
      }
      let audioSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _audioTrack), data, type, timestamp, duration, meta);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _videoTrack)) {
        while (__privateGet(this, _videoSampleQueue).length > 0 && __privateGet(this, _videoSampleQueue)[0].decodeTimestamp <= audioSample.decodeTimestamp) {
          let videoSample = __privateGet(this, _videoSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        }
        if (audioSample.decodeTimestamp <= __privateGet(this, _videoTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        } else {
          __privateGet(this, _audioSampleQueue).push(audioSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      }
    }
    /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
    finalize() {
      if (__privateGet(this, _finalized)) {
        throw new Error("Cannot finalize a muxer more than once.");
      }
      if (__privateGet(this, _options).fastStart === "fragmented") {
        for (let videoSample of __privateGet(this, _videoSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        for (let audioSample of __privateGet(this, _audioSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this, false);
      } else {
        if (__privateGet(this, _videoTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
        if (__privateGet(this, _audioTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
      }
      let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter(Boolean);
      if (__privateGet(this, _options).fastStart === "in-memory") {
        let mdatSize;
        for (let i = 0; i < 2; i++) {
          let movieBox2 = moov(tracks, __privateGet(this, _creationTime));
          let movieBoxSize = __privateGet(this, _writer).measureBox(movieBox2);
          mdatSize = __privateGet(this, _writer).measureBox(__privateGet(this, _mdat));
          let currentChunkPos = __privateGet(this, _writer).pos + movieBoxSize + mdatSize;
          for (let chunk of __privateGet(this, _finalizedChunks)) {
            chunk.offset = currentChunkPos;
            for (let { data } of chunk.samples) {
              currentChunkPos += data.byteLength;
              mdatSize += data.byteLength;
            }
          }
          if (currentChunkPos < 2 ** 32)
            break;
          if (mdatSize >= 2 ** 32)
            __privateGet(this, _mdat).largeSize = true;
        }
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        __privateGet(this, _writer).writeBox(movieBox);
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
        for (let chunk of __privateGet(this, _finalizedChunks)) {
          for (let sample of chunk.samples) {
            __privateGet(this, _writer).write(sample.data);
            sample.data = null;
          }
        }
      } else if (__privateGet(this, _options).fastStart === "fragmented") {
        let startPos = __privateGet(this, _writer).pos;
        let mfraBox = mfra(tracks);
        __privateGet(this, _writer).writeBox(mfraBox);
        let mfraBoxSize = __privateGet(this, _writer).pos - startPos;
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos - 4);
        __privateGet(this, _writer).writeU32(mfraBoxSize);
      } else {
        let mdatPos = __privateGet(this, _writer).offsets.get(__privateGet(this, _mdat));
        let mdatSize = __privateGet(this, _writer).pos - mdatPos;
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _mdat).largeSize = mdatSize >= 2 ** 32;
        __privateGet(this, _writer).patchBox(__privateGet(this, _mdat));
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        if (typeof __privateGet(this, _options).fastStart === "object") {
          __privateGet(this, _writer).seek(__privateGet(this, _ftypSize));
          __privateGet(this, _writer).writeBox(movieBox);
          let remainingBytes = mdatPos - __privateGet(this, _writer).pos;
          __privateGet(this, _writer).writeBox(free(remainingBytes));
        } else {
          __privateGet(this, _writer).writeBox(movieBox);
        }
      }
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
      __privateGet(this, _writer).finalize();
      __privateSet(this, _finalized, true);
    }
  };
  _options = new WeakMap();
  _writer = new WeakMap();
  _ftypSize = new WeakMap();
  _mdat = new WeakMap();
  _videoTrack = new WeakMap();
  _audioTrack = new WeakMap();
  _creationTime = new WeakMap();
  _finalizedChunks = new WeakMap();
  _nextFragmentNumber = new WeakMap();
  _videoSampleQueue = new WeakMap();
  _audioSampleQueue = new WeakMap();
  _finalized = new WeakMap();
  _validateOptions = new WeakSet();
  validateOptions_fn = function(options) {
    if (typeof options !== "object") {
      throw new TypeError("The muxer requires an options object to be passed to its constructor.");
    }
    if (!(options.target instanceof Target)) {
      throw new TypeError("The target must be provided and an instance of Target.");
    }
    if (options.video) {
      if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
        throw new TypeError(`Unsupported video codec: ${options.video.codec}`);
      }
      if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
        throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
      }
      if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
        throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
      }
      const videoRotation = options.video.rotation;
      if (typeof videoRotation === "number" && ![0, 90, 180, 270].includes(videoRotation)) {
        throw new TypeError(`Invalid video rotation: ${videoRotation}. Has to be 0, 90, 180 or 270.`);
      } else if (Array.isArray(videoRotation) && (videoRotation.length !== 9 || videoRotation.some((value) => typeof value !== "number"))) {
        throw new TypeError(`Invalid video transformation matrix: ${videoRotation.join()}`);
      }
      if (options.video.frameRate !== void 0 && (!Number.isInteger(options.video.frameRate) || options.video.frameRate <= 0)) {
        throw new TypeError(
          `Invalid video frame rate: ${options.video.frameRate}. Must be a positive integer.`
        );
      }
    }
    if (options.audio) {
      if (!SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
        throw new TypeError(`Unsupported audio codec: ${options.audio.codec}`);
      }
      if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
        throw new TypeError(
          `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
        );
      }
      if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
        throw new TypeError(
          `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
        );
      }
    }
    if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
      throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
    }
    if (typeof options.fastStart === "object") {
      if (options.video) {
        if (options.fastStart.expectedVideoChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedVideoChunks) || options.fastStart.expectedVideoChunks < 0) {
          throw new TypeError(`'expectedVideoChunks' must be a non-negative integer.`);
        }
      }
      if (options.audio) {
        if (options.fastStart.expectedAudioChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedAudioChunks) || options.fastStart.expectedAudioChunks < 0) {
          throw new TypeError(`'expectedAudioChunks' must be a non-negative integer.`);
        }
      }
    } else if (![false, "in-memory", "fragmented"].includes(options.fastStart)) {
      throw new TypeError(`'fastStart' option must be false, 'in-memory', 'fragmented' or an object.`);
    }
    if (options.minFragmentDuration !== void 0 && (!Number.isFinite(options.minFragmentDuration) || options.minFragmentDuration < 0)) {
      throw new TypeError(`'minFragmentDuration' must be a non-negative number.`);
    }
  };
  _writeHeader = new WeakSet();
  writeHeader_fn = function() {
    __privateGet(this, _writer).writeBox(ftyp({
      holdsAvc: __privateGet(this, _options).video?.codec === "avc",
      fragmented: __privateGet(this, _options).fastStart === "fragmented"
    }));
    __privateSet(this, _ftypSize, __privateGet(this, _writer).pos);
    if (__privateGet(this, _options).fastStart === "in-memory") {
      __privateSet(this, _mdat, mdat(false));
    } else if (__privateGet(this, _options).fastStart === "fragmented") {
    } else {
      if (typeof __privateGet(this, _options).fastStart === "object") {
        let moovSizeUpperBound = __privateMethod(this, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn).call(this);
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos + moovSizeUpperBound);
      }
      __privateSet(this, _mdat, mdat(true));
      __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _computeMoovSizeUpperBound = new WeakSet();
  computeMoovSizeUpperBound_fn = function() {
    if (typeof __privateGet(this, _options).fastStart !== "object")
      return;
    let upperBound = 0;
    let sampleCounts = [
      __privateGet(this, _options).fastStart.expectedVideoChunks,
      __privateGet(this, _options).fastStart.expectedAudioChunks
    ];
    for (let n of sampleCounts) {
      if (!n)
        continue;
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += 8 * n;
    }
    upperBound += 4096;
    return upperBound;
  };
  _prepareTracks = new WeakSet();
  prepareTracks_fn = function() {
    if (__privateGet(this, _options).video) {
      __privateSet(this, _videoTrack, {
        id: 1,
        info: {
          type: "video",
          codec: __privateGet(this, _options).video.codec,
          width: __privateGet(this, _options).video.width,
          height: __privateGet(this, _options).video.height,
          rotation: __privateGet(this, _options).video.rotation ?? 0,
          decoderConfig: null
        },
        // The fallback contains many common frame rates as factors
        timescale: __privateGet(this, _options).video.frameRate ?? 57600,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
    }
    if (__privateGet(this, _options).audio) {
      __privateSet(this, _audioTrack, {
        id: __privateGet(this, _options).video ? 2 : 1,
        info: {
          type: "audio",
          codec: __privateGet(this, _options).audio.codec,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate,
          decoderConfig: null
        },
        timescale: __privateGet(this, _options).audio.sampleRate,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
      if (__privateGet(this, _options).audio.codec === "aac") {
        let guessedCodecPrivate = __privateMethod(this, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn).call(
          this,
          2,
          // Object type for AAC-LC, since it's the most common
          __privateGet(this, _options).audio.sampleRate,
          __privateGet(this, _options).audio.numberOfChannels
        );
        __privateGet(this, _audioTrack).info.decoderConfig = {
          codec: __privateGet(this, _options).audio.codec,
          description: guessedCodecPrivate,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate
        };
      }
    }
  };
  _generateMpeg4AudioSpecificConfig = new WeakSet();
  generateMpeg4AudioSpecificConfig_fn = function(objectType, sampleRate, numberOfChannels) {
    let frequencyIndices = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
    let frequencyIndex = frequencyIndices.indexOf(sampleRate);
    let channelConfig = numberOfChannels;
    let configBits = "";
    configBits += objectType.toString(2).padStart(5, "0");
    configBits += frequencyIndex.toString(2).padStart(4, "0");
    if (frequencyIndex === 15)
      configBits += sampleRate.toString(2).padStart(24, "0");
    configBits += channelConfig.toString(2).padStart(4, "0");
    let paddingLength = Math.ceil(configBits.length / 8) * 8;
    configBits = configBits.padEnd(paddingLength, "0");
    let configBytes = new Uint8Array(configBits.length / 8);
    for (let i = 0; i < configBits.length; i += 8) {
      configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
    }
    return configBytes;
  };
  _createSampleForTrack = new WeakSet();
  createSampleForTrack_fn = function(track, data, type, timestamp, duration, meta, compositionTimeOffset) {
    let presentationTimestampInSeconds = timestamp / 1e6;
    let decodeTimestampInSeconds = (timestamp - (compositionTimeOffset ?? 0)) / 1e6;
    let durationInSeconds = duration / 1e6;
    let adjusted = __privateMethod(this, _validateTimestamp, validateTimestamp_fn).call(this, presentationTimestampInSeconds, decodeTimestampInSeconds, track);
    presentationTimestampInSeconds = adjusted.presentationTimestamp;
    decodeTimestampInSeconds = adjusted.decodeTimestamp;
    if (meta?.decoderConfig) {
      if (track.info.decoderConfig === null) {
        track.info.decoderConfig = meta.decoderConfig;
      } else {
        Object.assign(track.info.decoderConfig, meta.decoderConfig);
      }
    }
    let sample = {
      presentationTimestamp: presentationTimestampInSeconds,
      decodeTimestamp: decodeTimestampInSeconds,
      duration: durationInSeconds,
      data,
      size: data.byteLength,
      type,
      // Will be refined once the next sample comes in
      timescaleUnitsToNextSample: intoTimescale(durationInSeconds, track.timescale)
    };
    return sample;
  };
  _addSampleToTrack = new WeakSet();
  addSampleToTrack_fn = function(track, sample) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      track.samples.push(sample);
    }
    const sampleCompositionTimeOffset = intoTimescale(sample.presentationTimestamp - sample.decodeTimestamp, track.timescale);
    if (track.lastTimescaleUnits !== null) {
      let timescaleUnits = intoTimescale(sample.decodeTimestamp, track.timescale, false);
      let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
      track.lastTimescaleUnits += delta;
      track.lastSample.timescaleUnitsToNextSample = delta;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        let lastTableEntry = last(track.timeToSampleTable);
        if (lastTableEntry.sampleCount === 1) {
          lastTableEntry.sampleDelta = delta;
          lastTableEntry.sampleCount++;
        } else if (lastTableEntry.sampleDelta === delta) {
          lastTableEntry.sampleCount++;
        } else {
          lastTableEntry.sampleCount--;
          track.timeToSampleTable.push({
            sampleCount: 2,
            sampleDelta: delta
          });
        }
        const lastCompositionTimeOffsetTableEntry = last(track.compositionTimeOffsetTable);
        if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
          lastCompositionTimeOffsetTableEntry.sampleCount++;
        } else {
          track.compositionTimeOffsetTable.push({
            sampleCount: 1,
            sampleCompositionTimeOffset
          });
        }
      }
    } else {
      track.lastTimescaleUnits = 0;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        track.timeToSampleTable.push({
          sampleCount: 1,
          sampleDelta: intoTimescale(sample.duration, track.timescale)
        });
        track.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset
        });
      }
    }
    track.lastSample = sample;
    let beginNewChunk = false;
    if (!track.currentChunk) {
      beginNewChunk = true;
    } else {
      let currentChunkDuration = sample.presentationTimestamp - track.currentChunk.startTimestamp;
      if (__privateGet(this, _options).fastStart === "fragmented") {
        let mostImportantTrack = __privateGet(this, _videoTrack) ?? __privateGet(this, _audioTrack);
        const chunkDuration = __privateGet(this, _options).minFragmentDuration ?? 1;
        if (track === mostImportantTrack && sample.type === "key" && currentChunkDuration >= chunkDuration) {
          beginNewChunk = true;
          __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this);
        }
      } else {
        beginNewChunk = currentChunkDuration >= 0.5;
      }
    }
    if (beginNewChunk) {
      if (track.currentChunk) {
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, track);
      }
      track.currentChunk = {
        startTimestamp: sample.presentationTimestamp,
        samples: []
      };
    }
    track.currentChunk.samples.push(sample);
  };
  _validateTimestamp = new WeakSet();
  validateTimestamp_fn = function(presentationTimestamp, decodeTimestamp, track) {
    const strictTimestampBehavior = __privateGet(this, _options).firstTimestampBehavior === "strict";
    const noLastDecodeTimestamp = track.lastDecodeTimestamp === -1;
    const timestampNonZero = decodeTimestamp !== 0;
    if (strictTimestampBehavior && noLastDecodeTimestamp && timestampNonZero) {
      throw new Error(
        `The first chunk for your media track must have a timestamp of 0 (received DTS=${decodeTimestamp}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`
      );
    } else if (__privateGet(this, _options).firstTimestampBehavior === "offset" || __privateGet(this, _options).firstTimestampBehavior === "cross-track-offset") {
      if (track.firstDecodeTimestamp === void 0) {
        track.firstDecodeTimestamp = decodeTimestamp;
      }
      let baseDecodeTimestamp;
      if (__privateGet(this, _options).firstTimestampBehavior === "offset") {
        baseDecodeTimestamp = track.firstDecodeTimestamp;
      } else {
        baseDecodeTimestamp = Math.min(
          __privateGet(this, _videoTrack)?.firstDecodeTimestamp ?? Infinity,
          __privateGet(this, _audioTrack)?.firstDecodeTimestamp ?? Infinity
        );
      }
      decodeTimestamp -= baseDecodeTimestamp;
      presentationTimestamp -= baseDecodeTimestamp;
    }
    if (decodeTimestamp < track.lastDecodeTimestamp) {
      throw new Error(
        `Timestamps must be monotonically increasing (DTS went from ${track.lastDecodeTimestamp * 1e6} to ${decodeTimestamp * 1e6}).`
      );
    }
    track.lastDecodeTimestamp = decodeTimestamp;
    return { presentationTimestamp, decodeTimestamp };
  };
  _finalizeCurrentChunk = new WeakSet();
  finalizeCurrentChunk_fn = function(track) {
    if (__privateGet(this, _options).fastStart === "fragmented") {
      throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");
    }
    if (!track.currentChunk)
      return;
    track.finalizedChunks.push(track.currentChunk);
    __privateGet(this, _finalizedChunks).push(track.currentChunk);
    if (track.compactlyCodedChunkTable.length === 0 || last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.samples.length) {
      track.compactlyCodedChunkTable.push({
        firstChunk: track.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: track.currentChunk.samples.length
      });
    }
    if (__privateGet(this, _options).fastStart === "in-memory") {
      track.currentChunk.offset = 0;
      return;
    }
    track.currentChunk.offset = __privateGet(this, _writer).pos;
    for (let sample of track.currentChunk.samples) {
      __privateGet(this, _writer).write(sample.data);
      sample.data = null;
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _finalizeFragment = new WeakSet();
  finalizeFragment_fn = function(flushStreamingWriter = true) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");
    }
    let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter((track) => track && track.currentChunk);
    if (tracks.length === 0)
      return;
    let fragmentNumber = __privateWrapper(this, _nextFragmentNumber)._++;
    if (fragmentNumber === 1) {
      let movieBox = moov(tracks, __privateGet(this, _creationTime), true);
      __privateGet(this, _writer).writeBox(movieBox);
    }
    let moofOffset = __privateGet(this, _writer).pos;
    let moofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(moofBox);
    {
      let mdatBox = mdat(false);
      let totalTrackSampleSize = 0;
      for (let track of tracks) {
        for (let sample of track.currentChunk.samples) {
          totalTrackSampleSize += sample.size;
        }
      }
      let mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      if (mdatSize >= 2 ** 32) {
        mdatBox.largeSize = true;
        mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      }
      mdatBox.size = mdatSize;
      __privateGet(this, _writer).writeBox(mdatBox);
    }
    for (let track of tracks) {
      track.currentChunk.offset = __privateGet(this, _writer).pos;
      track.currentChunk.moofOffset = moofOffset;
      for (let sample of track.currentChunk.samples) {
        __privateGet(this, _writer).write(sample.data);
        sample.data = null;
      }
    }
    let endPos = __privateGet(this, _writer).pos;
    __privateGet(this, _writer).seek(__privateGet(this, _writer).offsets.get(moofBox));
    let newMoofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(newMoofBox);
    __privateGet(this, _writer).seek(endPos);
    for (let track of tracks) {
      track.finalizedChunks.push(track.currentChunk);
      __privateGet(this, _finalizedChunks).push(track.currentChunk);
      track.currentChunk = null;
    }
    if (flushStreamingWriter) {
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
    }
  };
  _maybeFlushStreamingTargetWriter = new WeakSet();
  maybeFlushStreamingTargetWriter_fn = function() {
    if (__privateGet(this, _writer) instanceof StreamTargetWriter) {
      __privateGet(this, _writer).flush();
    }
  };
  _ensureNotFinalized = new WeakSet();
  ensureNotFinalized_fn = function() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
    }
  };
  return __toCommonJS(src_exports);
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mp4Muxer)
    /* eslint-enable */
    // ------------------------------------------------------------------ end of mp4-muxer

    const VERSION = '1.0.1';
    const LS_KEY = 'tpClipBuffer';
    const DB_NAME = 'tpClipBuffer';
    const DB_STORE = 'clips';

    // ------------------------------------------------------------------ settings
    const DEFAULTS = {
        enabled: true,
        seconds: 30,            // length of a clip
        hotkey: { code: 'Backslash', key: '\\', shift: false, alt: false, ctrl: false, meta: false },
        maxHeight: 1080,        // clip height cap (0 = the game canvas's own size)
        maxFps: 60,             // 0 = every rendered frame
        mbps: 10,               // video bitrate
        codec: 'auto',          // 'auto' (H.264 if the browser has it, else VP9), 'h264' or 'vp9'
        bg: '#000000',          // colour behind the map (the game canvas is transparent there)
        keyframeSeconds: 1,     // a clip can only start on a keyframe: this is how much longer than N a clip can be
        showPill: true,         // the little status pill in the corner
        library: true,          // keep clips in the browser (needed for the homepage viewer)
        download: false,        // also download the .mp4 right away
        maxClips: 30,           // oldest clips are deleted beyond this
        inReplays: false,       // also buffer while watching a replay
        libraryOnGroups: false, // show the Clips button on group pages too
    };
    const CFG = Object.assign({}, DEFAULTS, safeParse(localStorage.getItem(LS_KEY)));
    if (!CFG.hotkey || !CFG.hotkey.code) CFG.hotkey = Object.assign({}, DEFAULTS.hotkey);
    function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }
    function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(CFG)); } catch (e) { /* ignore */ } }

    // ------------------------------------------------------------------ helpers
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const diag = [];
    const log = (...a) => {
        const line = a.map((x) => (typeof x === 'string' ? x : (x && x.message) || safeJson(x))).join(' ');
        diag.push(new Date().toISOString().slice(11, 19) + ' ' + line);
        if (diag.length > 400) diag.shift();
        console.log('[ClipBuffer]', ...a);
    };
    function safeJson(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }
    function waitFor(fn, timeout) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            (function poll() {
                let v; try { v = fn(); } catch (e) { v = null; }
                if (v) return resolve(v);
                if (Date.now() - t0 > timeout) return reject(new Error('timeout'));
                setTimeout(poll, 250);
            })();
        });
    }
    function muxerLib() {
        try { if (typeof Mp4Muxer !== 'undefined' && Mp4Muxer && Mp4Muxer.Muxer) return Mp4Muxer; } catch (e) { /* not defined */ }
        return (window.Mp4Muxer && window.Mp4Muxer.Muxer) ? window.Mp4Muxer : null;
    }
    const fmtMB = (b) => (b < 1e6 ? Math.round(b / 1e3) + ' KB' : (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB');
    const fmtSec = (s) => (Math.round(s * 10) / 10).toFixed(1) + ' s';
    function pad2(n) { return String(n).padStart(2, '0'); }
    function stamp(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`; }
    function fmtDate(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function isTyping(el) {
        if (!el || el === document.body) return false;
        const tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
    }
    function hotkeyLabel(hk) {
        const parts = [];
        if (hk.ctrl) parts.push('Ctrl'); if (hk.alt) parts.push('Alt'); if (hk.shift) parts.push('Shift'); if (hk.meta) parts.push('Cmd');
        let k = hk.key || hk.code || '?';
        if (k.length === 1) k = k === ' ' ? 'Space' : k.toUpperCase();
        else if (/^Key[A-Z]$/.test(hk.code || '')) k = hk.code.slice(3);
        parts.push(k);
        return parts.join('+');
    }
    function download(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    }

    // ------------------------------------------------------------------ styles
    const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    function injectCss() {
        if (document.getElementById('tpcbCss')) return;
        const css = document.createElement('style');
        css.id = 'tpcbCss';
        css.textContent = `
            #tpcbPill{position:fixed;right:10px;bottom:10px;z-index:1000000;background:rgba(13,15,20,.92);color:#e8ebf2;font:12px/1 ${FONT};border:1px solid #2a2e3a;border-radius:999px;padding:6px 11px 6px 9px;opacity:.35;cursor:pointer;user-select:none;transition:opacity .15s;white-space:nowrap}
            #tpcbPill:hover,#tpcbPill.open{opacity:1}
            #tpcbPill .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff4655;margin-right:6px;vertical-align:0}
            #tpcbPill.off .dot{background:#6b7387}
            #tpcbPill.warn .dot{background:#ffb020}
            #tpcbToast{position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:1000003;background:rgba(13,15,20,.95);color:#fff;font:14px/1.35 ${FONT};border:1px solid #2a2e3a;border-left:4px solid #4a9dff;border-radius:6px;padding:10px 14px;box-shadow:0 6px 24px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:opacity .2s;max-width:70vw}
            #tpcbToast.show{opacity:1}
            #tpcbToast.err{border-left-color:#ff4655}
            #tpcbPanel{position:fixed;right:10px;bottom:44px;z-index:1000001;background:rgba(13,15,20,.96);color:#e8ebf2;font:13px/1.35 ${FONT};border:1px solid #2a2e3a;border-radius:8px;padding:10px 12px;width:290px;box-shadow:0 6px 24px rgba(0,0,0,.5);display:none;max-height:calc(100vh - 60px);overflow:auto}
            #tpcbPanel.open{display:block}
            #tpcbPanel h4{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9aa3b8;display:flex;justify-content:space-between;align-items:center}
            #tpcbPanel h4 span{cursor:pointer;color:#6b7387;font-weight:normal;font-size:14px}
            #tpcbPanel .st{color:#9aa3b8;font-size:12px;margin:0 0 8px;min-height:15px;word-break:break-word}
            #tpcbPanel .row{display:flex;gap:6px;align-items:center;margin:5px 0}
            #tpcbPanel label{flex:1;color:#c3c9d6}
            #tpcbPanel input[type=number],#tpcbPanel select{background:#0b0c10;color:#fff;border:1px solid #333947;border-radius:4px;padding:2px 4px;font:inherit}
            #tpcbPanel input[type=number]{width:58px}
            #tpcbPanel input[type=color]{width:34px;height:22px;padding:0;border:1px solid #333947;background:#0b0c10;border-radius:4px}
            #tpcbPanel button{width:100%;margin-top:6px;padding:7px 8px;border:0;border-radius:6px;background:#4a9dff;color:#fff;font-weight:600;cursor:pointer;font:inherit;font-weight:600}
            #tpcbPanel button.secondary{background:#2a2e3a;color:#e8ebf2}
            #tpcbPanel button.key{width:auto;margin:0;padding:3px 9px;background:#2a2e3a;color:#fff;font-weight:600;min-width:64px}
            #tpcbPanel button.key.listen{background:#ffb020;color:#111}
            #tpcbPanel .hint{margin-top:8px;color:#6b7387;font-size:11px;line-height:1.4}
            #tpcbLibBtn{position:fixed;right:14px;bottom:14px;z-index:1000000;background:#4a9dff;color:#fff;font:700 13px/1 ${FONT};letter-spacing:.08em;border:0;border-radius:6px;padding:10px 14px;cursor:pointer;opacity:.9;box-shadow:0 4px 16px rgba(0,0,0,.5);transition:opacity .15s}
            #tpcbLibBtn:hover{opacity:1}
            #tpcbLib{position:fixed;inset:0;z-index:1000002;background:rgba(5,6,9,.98);color:#e8ebf2;font:13px/1.35 ${FONT};display:none;flex-direction:column}
            #tpcbLib.open{display:flex}
            #tpcbLib .bar{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #2a2e3a;background:rgba(13,15,20,.9)}
            #tpcbLib .bar b{font-size:15px;letter-spacing:.04em}
            #tpcbLib .bar .usage{color:#9aa3b8}
            #tpcbLib .bar .sp{flex:1}
            #tpcbLib .bar label{color:#c3c9d6;cursor:pointer}
            #tpcbLib button{padding:6px 11px;border:0;border-radius:6px;background:#2a2e3a;color:#e8ebf2;font:inherit;font-weight:600;cursor:pointer}
            #tpcbLib button.primary{background:#4a9dff;color:#fff}
            #tpcbLib button.danger{background:#5a2229;color:#ffb3ba}
            #tpcbLib button.danger.armed{background:#ff4655;color:#fff}
            #tpcbLib .body{flex:1;display:flex;min-height:0}
            #tpcbLib .list{width:290px;overflow:auto;border-right:1px solid #2a2e3a;padding:8px}
            #tpcbLib .clip{display:flex;gap:8px;padding:6px;border-radius:6px;cursor:pointer;border:1px solid transparent}
            #tpcbLib .clip:hover{background:rgba(255,255,255,.04)}
            #tpcbLib .clip.sel{background:rgba(74,157,255,.14);border-color:rgba(74,157,255,.5)}
            #tpcbLib .clip img{width:96px;height:60px;object-fit:cover;border-radius:4px;background:#000;flex:none}
            #tpcbLib .clip .noimg{width:96px;height:60px;border-radius:4px;background:#111;flex:none}
            #tpcbLib .clip .t{font-weight:600}
            #tpcbLib .clip .m{color:#9aa3b8;font-size:11.5px;margin-top:2px}
            #tpcbLib .stage{flex:1;display:flex;flex-direction:column;min-width:0;background:#000}
            #tpcbLib video{flex:1;min-height:0;width:100%;height:100%;object-fit:contain;background:#000;outline:none}
            #tpcbLib .cap{display:flex;align-items:center;gap:10px;padding:8px 14px;background:rgba(13,15,20,.9);border-top:1px solid #2a2e3a;color:#c3c9d6;flex-wrap:wrap}
            #tpcbLib .cap .sp{flex:1}
            #tpcbLib .empty{margin:auto;color:#9aa3b8;text-align:center;line-height:1.7;padding:30px}
            #tpcbLib .empty b{color:#fff}
        `;
        document.head.appendChild(css);
    }

    // ------------------------------------------------------------------ toast
    let toastEl = null, toastTimer = null;
    function toast(msg, isError) {
        if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'tpcbToast'; document.body.appendChild(toastEl); }
        toastEl.textContent = msg;
        toastEl.classList.toggle('err', !!isError);
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), isError ? 6000 : 3500);
    }

    // ------------------------------------------------------------------ clip library (IndexedDB)
    function openDb() {
        return new Promise((resolve, reject) => {
            let req;
            try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    const s = db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
                    s.createIndex('createdAt', 'createdAt');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('could not open the clip store'));
            req.onblocked = () => reject(new Error('the clip store is blocked by another tab'));
        });
    }
    const dbReq = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error('store request failed')); });
    async function withDb(mode, fn) {
        const db = await openDb();
        try { return await fn(db.transaction(DB_STORE, mode).objectStore(DB_STORE)); }
        finally { db.close(); }
    }
    const dbAdd = (rec) => withDb('readwrite', (s) => dbReq(s.add(rec)));
    const dbDelete = (id) => withDb('readwrite', (s) => dbReq(s.delete(id)));
    const dbClear = () => withDb('readwrite', (s) => dbReq(s.clear()));
    const dbAll = () => withDb('readonly', (s) => dbReq(s.getAll())).then((all) => all.sort((a, b) => b.createdAt - a.createdAt));
    const dbCount = () => withDb('readonly', (s) => dbReq(s.count()));
    async function dbPrune(max) {
        const all = await dbAll();
        for (const r of all.slice(Math.max(1, max | 0))) { await dbDelete(r.id); log('library: deleted old clip ' + r.name); }
    }

    // ------------------------------------------------------------------ library viewer
    const lib = { el: null, clips: [], sel: null, urls: [], loop: true, keyHandler: null };
    function buildLibrary() {
        if (lib.el) return lib.el;
        injectCss();
        const el = document.createElement('div');
        el.id = 'tpcbLib';
        el.innerHTML = `
            <div class="bar">
              <b>CLIPS</b><span class="usage" id="tpcbUsage"></span><span class="sp"></span>
              <label><input type="checkbox" id="tpcbLoop" checked> Loop</label>
              <button id="tpcbFull" title="F">Fullscreen</button>
              <button id="tpcbClose" title="Esc">Close</button>
            </div>
            <div class="body">
              <div class="list" id="tpcbList"></div>
              <div class="stage" id="tpcbStage">
                <video id="tpcbVideo" controls loop muted playsinline></video>
                <div class="cap" id="tpcbCap"></div>
              </div>
            </div>`;
        document.body.appendChild(el);
        lib.el = el;
        el.querySelector('#tpcbClose').onclick = closeLibrary;
        el.querySelector('#tpcbFull').onclick = fullscreenVideo;
        el.querySelector('#tpcbLoop').onchange = (ev) => { lib.loop = ev.target.checked; el.querySelector('#tpcbVideo').loop = lib.loop; };
        el.querySelector('#tpcbList').addEventListener('click', (ev) => {
            const row = ev.target.closest('.clip'); if (!row) return;
            selectClip(Number(row.dataset.id));
        });
        el.querySelector('#tpcbStage').addEventListener('click', (ev) => {
            const b = ev.target.closest('button'); if (!b || !b.dataset.act) return;
            const clip = lib.clips.find((c) => c.id === lib.sel); if (!clip) return;
            if (b.dataset.act === 'download') download(clip.video, clip.name);
            else if (b.dataset.act === 'delete') {
                if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Really delete?'; setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Delete'; }, 3000); return; }
                dbDelete(clip.id).then(() => refreshLibrary()).catch((e) => toast('Delete failed: ' + e.message, true));
            }
        });
        return el;
    }
    function fullscreenVideo() {
        const v = lib.el && lib.el.querySelector('#tpcbVideo'); if (!v) return;
        const req = v.requestFullscreen || v.webkitRequestFullscreen || v.mozRequestFullScreen;
        try { if (req) req.call(v); } catch (e) { /* ignore */ }
    }
    async function openLibrary() {
        buildLibrary();
        lib.el.classList.add('open');
        if (!lib.keyHandler) {
            lib.keyHandler = (e) => {
                if (!lib.el.classList.contains('open') || isTyping(e.target)) return;
                const swallow = () => { e.preventDefault(); e.stopPropagation(); };   // the game must not see these keys
                if (e.key === 'Escape') { if (document.fullscreenElement) return; swallow(); closeLibrary(); }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    swallow();
                    const i = lib.clips.findIndex((c) => c.id === lib.sel);
                    const j = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? i + 1 : i - 1;
                    if (lib.clips[j]) selectClip(lib.clips[j].id);
                } else if (e.key === 'f' || e.key === 'F') { swallow(); fullscreenVideo(); }
                else if (e.key === 'l' || e.key === 'L') { swallow(); const cb = lib.el.querySelector('#tpcbLoop'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
                else if (e.key === ' ') { swallow(); const v = lib.el.querySelector('#tpcbVideo'); if (v) { if (v.paused) v.play().catch(() => { /* ignore */ }); else v.pause(); } }
            };
            window.addEventListener('keydown', lib.keyHandler, true);
        }
        await refreshLibrary();
    }
    function closeLibrary() {
        if (!lib.el) return;
        const v = lib.el.querySelector('#tpcbVideo');
        lib.el.classList.remove('open');
        for (const u of lib.urls) URL.revokeObjectURL(u);
        lib.urls = [];
        if (v) {
            try { v.pause(); } catch (e) { /* ignore */ }
            if (v.dataset.url) { URL.revokeObjectURL(v.dataset.url); delete v.dataset.url; }
            v.removeAttribute('src'); try { v.load(); } catch (e) { /* ignore */ }
        }
        updateLibButton();
    }
    async function refreshLibrary() {
        const list = lib.el.querySelector('#tpcbList');
        let clips = [];
        try { clips = await dbAll(); } catch (e) { list.innerHTML = `<div class="empty">Could not open the clip store: ${escapeHtml(e.message)}</div>`; return; }
        for (const u of lib.urls) URL.revokeObjectURL(u);
        lib.urls = [];
        lib.clips = clips;
        const total = clips.reduce((s, c) => s + (c.bytes || 0), 0);
        const usage = lib.el.querySelector('#tpcbUsage');
        usage.textContent = clips.length ? `${clips.length} clip${clips.length === 1 ? '' : 's'} · ${fmtMB(total)}` : 'no clips yet';
        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then((est) => { if (est && est.quota) usage.textContent += ` · ${Math.round((est.usage || 0) / est.quota * 100)}% of this browser's storage`; }).catch(() => { /* ignore */ });
        }
        if (!clips.length) {
            list.innerHTML = '';
            lib.el.querySelector('#tpcbStage').innerHTML = `<div class="empty"><b>No clips yet.</b><br>During a game press <b>${escapeHtml(hotkeyLabel(CFG.hotkey))}</b> to save the last ${CFG.seconds} seconds.<br>They show up here.</div>`;
            lib.sel = null;
            return;
        }
        if (!lib.el.querySelector('#tpcbVideo')) {
            lib.el.querySelector('#tpcbStage').innerHTML = '<video id="tpcbVideo" controls loop muted playsinline></video><div class="cap" id="tpcbCap"></div>';
        }
        list.innerHTML = clips.map((c) => {
            let img = '<div class="noimg"></div>';
            if (c.poster) { const u = URL.createObjectURL(c.poster); lib.urls.push(u); img = `<img src="${u}" alt="">`; }
            return `<div class="clip" data-id="${c.id}">${img}<div><div class="t">${escapeHtml(fmtDate(c.createdAt))}</div><div class="m">${fmtSec(c.seconds || 0)} · ${fmtMB(c.bytes || 0)}${c.map ? ' · ' + escapeHtml(c.map) : ''}</div></div></div>`;
        }).join('');
        const keep = clips.find((c) => c.id === lib.sel);
        selectClip(keep ? keep.id : clips[0].id);
    }
    function selectClip(id) {
        const clip = lib.clips.find((c) => c.id === id); if (!clip) return;
        lib.sel = id;
        lib.el.querySelectorAll('.clip').forEach((r) => r.classList.toggle('sel', Number(r.dataset.id) === id));
        const v = lib.el.querySelector('#tpcbVideo');
        if (v.dataset.url) { URL.revokeObjectURL(v.dataset.url); }
        const u = URL.createObjectURL(clip.video);
        v.dataset.url = u; v.src = u; v.loop = lib.loop; v.muted = true;
        v.onerror = () => { const n = lib.el.querySelector('#tpcbCap .note'); if (n) n.textContent = 'This browser cannot play this clip (codec ' + (clip.codec || '?') + ') — download it and play it in VLC/QuickTime.'; };
        const p = v.play(); if (p && p.catch) p.catch(() => { /* autoplay refused: the controls are there */ });
        lib.el.querySelector('#tpcbCap').innerHTML = `<span>${escapeHtml(clip.name)}</span><span>${fmtSec(clip.seconds || 0)} · ${clip.width}×${clip.height} · ${escapeHtml(clip.codec || '')} · ${fmtMB(clip.bytes || 0)}</span><span class="note" style="color:#ffb020"></span><span class="sp"></span><button data-act="download" class="primary">Download</button><button data-act="delete" class="danger">Delete</button>`;
        const row = lib.el.querySelector(`.clip[data-id="${id}"]`); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
    let libBtn = null;
    function bootLibraryButton() {
        injectCss();
        libBtn = document.createElement('button');
        libBtn.id = 'tpcbLibBtn';
        libBtn.textContent = 'CLIPS';
        libBtn.title = 'TagPro Clip Buffer v' + VERSION + ' — clips saved during games';
        libBtn.onclick = () => openLibrary();
        (document.body || document.documentElement).appendChild(libBtn);
        updateLibButton();
        setInterval(() => { if (!document.contains(libBtn)) (document.body || document.documentElement).appendChild(libBtn); }, 2000);   // survive a page that rebuilds its body
        window.addEventListener('keydown', (e) => {
            if (isTyping(e.target) || e.repeat) return;
            const hk = CFG.hotkey;
            if (keyMatches(e, hk) && !!e.shiftKey === !!hk.shift && !!e.altKey === !!hk.alt && !!e.ctrlKey === !!hk.ctrl && !!e.metaKey === !!hk.meta) {
                if (lib.el && lib.el.classList.contains('open')) return;
                e.preventDefault(); openLibrary();
            }
        }, true);
    }
    function updateLibButton() {
        if (!libBtn) return;
        dbCount().then((n) => { libBtn.textContent = n ? `CLIPS · ${n}` : 'CLIPS'; }).catch(() => { libBtn.textContent = 'CLIPS'; });
    }

    // ------------------------------------------------------------------ H.264 helpers (Annex B → length-prefixed, avcC from SPS/PPS)
    function isAnnexB(u8) {
        if (u8.length < 5 || u8[0] !== 0 || u8[1] !== 0) return false;
        if (u8[2] === 0 && u8[3] === 1) return true;              // 4-byte start code (a length prefix of 1 cannot happen)
        if (u8[2] !== 1) return false;
        // 00 00 01 xx is either a 3-byte start code or a NAL length of 256..511: see whether the lengths tile the sample
        let i = 0;
        while (i + 4 <= u8.length) { const len = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0; if (!len) return true; i += 4 + len; }
        return i !== u8.length;
    }
    function splitAnnexB(u8) {
        const nals = []; const n = u8.length; let i = 0, start = -1;
        while (i + 2 < n) {
            if (u8[i] === 0 && u8[i + 1] === 0 && (u8[i + 2] === 1 || (u8[i + 2] === 0 && i + 3 < n && u8[i + 3] === 1))) {
                if (start >= 0) nals.push(trimZeros(u8.subarray(start, i)));
                i += u8[i + 2] === 1 ? 3 : 4; start = i;
            } else i++;
        }
        if (start >= 0 && start < n) nals.push(trimZeros(u8.subarray(start)));
        return nals.filter((x) => x.length);
    }
    function trimZeros(u8) { let e = u8.length; while (e > 0 && u8[e - 1] === 0) e--; return u8.subarray(0, e); }
    function splitLengthPrefixed(u8) {
        const nals = []; let i = 0;
        while (i + 4 <= u8.length) {
            const len = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0;
            i += 4; if (!len || i + len > u8.length) break;
            nals.push(u8.subarray(i, i + len)); i += len;
        }
        return nals;
    }
    function joinLengthPrefixed(nals) {
        const out = new Uint8Array(nals.reduce((s, x) => s + 4 + x.length, 0)); let o = 0;
        for (const x of nals) { out[o++] = x.length >>> 24; out[o++] = (x.length >>> 16) & 255; out[o++] = (x.length >>> 8) & 255; out[o++] = x.length & 255; out.set(x, o); o += x.length; }
        return out;
    }
    function buildAvcC(sps, pps) {
        const hi = [100, 110, 122, 244].includes(sps[1]);
        const out = [1, sps[1], sps[2], sps[3], 0xFF, 0xE1, sps.length >> 8, sps.length & 255, ...sps, 1, pps.length >> 8, pps.length & 255, ...pps];
        if (hi) out.push(0xFD, 0xF8, 0xF8, 0);
        return new Uint8Array(out);
    }
    // Normalises one encoded H.264 sample: returns length-prefixed data, plus SPS/PPS if they were in-band.
    function avcNormalize(data) {
        const annexb = isAnnexB(data);
        const nals = annexb ? splitAnnexB(data) : splitLengthPrefixed(data);
        let sps = null, pps = null;
        for (const n of nals) { const t = n[0] & 0x1f; if (t === 7 && !sps) sps = n; else if (t === 8 && !pps) pps = n; }
        return { data: annexb ? joinLengthPrefixed(nals) : data, sps, pps, annexb, nals: nals.length };
    }

    // ------------------------------------------------------------------ recorder
    function avcLevel(w, h, fps) {
        const mbs = Math.ceil(w / 16) * Math.ceil(h / 16), rate = mbs * (fps || 60);
        const table = [[3600, 108000, '1F'], [5120, 216000, '20'], [8192, 245760, '28'], [8704, 522240, '2A'], [22080, 589824, '32'], [36864, 983040, '33'], [36864, 2073600, '34'], [139264, 4177920, '3C']];
        for (const [fs, r, lvl] of table) if (mbs <= fs && rate <= r) return lvl;
        return '3C';
    }
    const CANDIDATES = [
        { id: 'H.264', mux: 'avc', codec: (w, h, fps) => 'avc1.6400' + avcLevel(w, h, fps) },   // High
        { id: 'H.264', mux: 'avc', codec: (w, h, fps) => 'avc1.4D40' + avcLevel(w, h, fps) },   // Main
        { id: 'H.264', mux: 'avc', codec: (w, h, fps) => 'avc1.42E0' + avcLevel(w, h, fps) },   // Constrained Baseline
        { id: 'VP9', mux: 'vp9', codec: () => 'vp09.00.51.08' },
    ];
    const enc = {
        encoder: null, candidate: null, candidates: [], ready: false, broken: false,
        w: 0, h: 0, configuredCodec: '', cfgBoundaryUs: -1, decoderConfig: null, annexb: false,
        buf: [], bytes: 0, frames: 0, submitted: 0, chunks: 0, dropped: 0, drawErrors: 0, frameErrors: 0, hookErrors: 0,
        lastTsUs: 0, lastKeyUs: -Infinity, nextDueUs: 0, errors: 0, lastErrorAt: 0, configures: 0,
    };
    const rec = { el: null, ctx: null, canvas: null, started: 0, lastFrameAt: 0, failed: '' };
    let hookedRenderer = null, saving = false, pill = null, panel = null;

    function encoderConfig(c, w, h) {
        const fps = CFG.maxFps || 60;
        const cfg = { codec: c.codec(w, h, fps), width: w, height: h, bitrate: Math.max(5e5, Math.round((+CFG.mbps || 10) * 1e6)), framerate: fps, latencyMode: 'realtime', hardwareAcceleration: 'no-preference' };
        if (c.mux === 'avc') cfg.avc = { format: 'avc' };
        return cfg;
    }
    function targetSize(sw, sh) {
        const maxH = +CFG.maxHeight || 0;
        const s = (maxH && sh > maxH) ? maxH / sh : 1;
        return { w: Math.max(2, Math.round(sw * s / 2) * 2), h: Math.max(2, Math.round(sh * s / 2) * 2) };
    }
    async function chooseCodec(w, h) {
        enc.candidates = [];
        const pref = CFG.codec === 'vp9' ? 'vp9' : (CFG.codec === 'h264' ? 'avc' : null);
        const order = pref ? CANDIDATES.filter((c) => c.mux === pref).concat(CANDIDATES.filter((c) => c.mux !== pref)) : CANDIDATES;
        for (const c of order) {
            const cfg = encoderConfig(c, w, h);
            try {
                const r = await VideoEncoder.isConfigSupported(cfg);
                log('probe ' + cfg.codec + ' ' + w + 'x' + h + ': ' + (r.supported ? 'supported' : 'no'));
                if (r.supported) enc.candidates.push(c);
            } catch (e) { log('probe ' + cfg.codec + ' failed: ' + e.message); }
        }
        enc.candidate = enc.candidates[0] || null;
    }
    function createEncoder() {
        if (enc.encoder) { try { if (enc.encoder.state !== 'closed') enc.encoder.close(); } catch (e) { /* ignore */ } }
        enc.encoder = new VideoEncoder({ output: onChunk, error: onEncoderError });
    }
    function configure(w, h) {
        const c = enc.candidate; if (!c) return;
        const cfg = encoderConfig(c, w, h);
        enc.w = w; enc.h = h; enc.configuredCodec = cfg.codec; enc.configures++;
        enc.cfgBoundaryUs = enc.lastTsUs;
        enc.buf = []; enc.bytes = 0; enc.lastKeyUs = -Infinity; enc.decoderConfig = null; enc.annexb = false;
        if (rec.el.width !== w || rec.el.height !== h) { rec.el.width = w; rec.el.height = h; }
        try {
            if (!enc.encoder || enc.encoder.state === 'closed') createEncoder();
            enc.encoder.configure(cfg); enc.ready = true;
            log('encoder configured: ' + safeJson(cfg));
        } catch (e) { log('configure failed: ' + e.message); enc.ready = false; nextCandidate(); }
    }
    function nextCandidate() {
        enc.candidates.shift();
        enc.candidate = enc.candidates[0] || null;
        if (!enc.candidate) { fail('Video encoding failed with every codec this browser offers — use "Copy diagnostics".'); return; }
        log('switching to ' + enc.candidate.id);
        createEncoder();
        configure(enc.w, enc.h);
    }
    function onEncoderError(e) {
        enc.errors++; enc.ready = false;
        const msg = (e && e.message) || String(e);
        log('encoder error: ' + msg);
        if (enc.broken) return;
        const now = performance.now();
        const repeat = now - enc.lastErrorAt < 30000;
        enc.lastErrorAt = now;
        if (enc.errors > 8) { fail('The video encoder keeps failing — use "Copy diagnostics".'); return; }
        // first error for a codec: try the same codec once more with a fresh encoder; a repeat within 30 s means it is unusable here
        setTimeout(() => { if (repeat) nextCandidate(); else { createEncoder(); configure(enc.w, enc.h); } }, 50);
    }
    function onChunk(chunk, meta) {
        if (!enc.candidate || enc.broken) return;
        if (chunk.timestamp <= enc.cfgBoundaryUs) return;          // left over from before the last reconfigure
        let data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        if (meta && meta.decoderConfig) {
            enc.decoderConfig = Object.assign({}, meta.decoderConfig);
            const d = meta.decoderConfig.description;
            log('decoder config from the encoder: ' + meta.decoderConfig.codec + (d ? ', description ' + d.byteLength + ' bytes' : ', no description'));
        }
        if (enc.candidate.mux === 'avc') {
            const needSps = chunk.type === 'key' && !(enc.decoderConfig && enc.decoderConfig.description);
            if (enc.annexb || needSps || isAnnexB(data)) {
                const n = avcNormalize(data);
                if (n.annexb && !enc.annexb) { enc.annexb = true; log('H.264 output is Annex B; converting'); }
                data = n.data;
                if (needSps) {
                    if (n.sps && n.pps) { enc.decoderConfig = { codec: enc.configuredCodec, codedWidth: enc.w, codedHeight: enc.h, description: buildAvcC(n.sps, n.pps) }; log('avcC built from in-band SPS/PPS'); }
                    else { log('H.264 keyframe without SPS/PPS and no decoder description — this codec is unusable here'); setTimeout(nextCandidate, 0); return; }
                }
            }
        }
        if (chunk.type === 'key' && !enc.buf.length && !(enc.decoderConfig)) log('first chunk arrived without a decoder config');
        enc.buf.push({ ts: chunk.timestamp, key: chunk.type === 'key', data });
        enc.bytes += data.byteLength; enc.chunks++;
        prune();
    }
    function prune() {
        const buf = enc.buf; if (buf.length < 2) return;
        const cutoff = buf[buf.length - 1].ts - (+CFG.seconds || 30) * 1e6;
        let k = -1;
        for (let i = 0; i < buf.length && buf[i].ts <= cutoff; i++) if (buf[i].key) k = i;
        if (k > 0) { for (let i = 0; i < k; i++) enc.bytes -= buf[i].data.byteLength; buf.splice(0, k); }
    }
    function onRendered() {
        if (!CFG.enabled || !enc.ready || enc.broken) return;
        enc.frames++;
        let nowUs = Math.round(performance.now() * 1000);
        if (nowUs <= enc.lastTsUs) nowUs = enc.lastTsUs + 1000;
        const interval = CFG.maxFps ? Math.round(1e6 / CFG.maxFps) : 0;
        if (interval && nowUs < enc.nextDueUs - interval * 0.4) return;
        const src = rec.canvas; if (!src) return;
        const sw = src.width, sh = src.height; if (!sw || !sh) return;
        const t = targetSize(sw, sh);
        if (t.w !== enc.w || t.h !== enc.h) { log('canvas is now ' + sw + 'x' + sh + ' → clips ' + t.w + 'x' + t.h + ' (buffer restarted)'); configure(t.w, t.h); if (!enc.ready) return; }
        const ctx = rec.ctx;
        ctx.fillStyle = CFG.bg || '#000'; ctx.fillRect(0, 0, enc.w, enc.h);
        try { ctx.drawImage(src, 0, 0, sw, sh, 0, 0, enc.w, enc.h); } catch (e) { enc.drawErrors++; if (enc.drawErrors < 3) log('drawImage failed: ' + e.message); return; }
        if (enc.encoder.encodeQueueSize > 6) { enc.dropped++; return; }
        const key = nowUs - enc.lastKeyUs >= (+CFG.keyframeSeconds || 1) * 1e6;
        let frame;
        try { frame = new VideoFrame(rec.el, { timestamp: nowUs, alpha: 'discard' }); }
        catch (e) { enc.frameErrors++; if (enc.frameErrors < 3) log('VideoFrame failed: ' + e.message); return; }
        try { enc.encoder.encode(frame, { keyFrame: key }); enc.submitted++; enc.lastTsUs = nowUs; if (key) enc.lastKeyUs = nowUs; }
        catch (e) { enc.frameErrors++; if (enc.frameErrors < 3) log('encode failed: ' + e.message); }
        finally { frame.close(); }
        if (interval) enc.nextDueUs = Math.max(enc.nextDueUs + interval, nowUs + interval * 0.5);
        rec.lastFrameAt = performance.now();
    }
    // Frames are grabbed right after PIXI has drawn the stage (same task, so the WebGL buffer is still intact).
    function hookPixi() {
        const r = window.tagpro && tagpro.renderer, pr = r && r.renderer;
        if (!pr || hookedRenderer === pr) return;
        const orig = pr.render;
        if (typeof orig !== 'function') return;
        pr.render = function (target, options) {
            const res = orig.apply(this, arguments);
            if (!(options && options.renderTexture) && (!tagpro.renderer.stage || target === tagpro.renderer.stage)) {
                try { onRendered(); } catch (e) { enc.hookErrors++; if (enc.hookErrors < 3) log('frame hook error: ' + (e && e.message)); }
            }
            return res;
        };
        hookedRenderer = pr;
        rec.canvas = r.canvas || document.getElementById('viewport') || rec.canvas;
        log('frame hook installed on the PIXI renderer');
    }
    function bufferedSeconds() { const b = enc.buf; return b.length > 1 ? (b[b.length - 1].ts - b[0].ts) / 1e6 : 0; }
    function setPill(state, text, title) {
        if (!pill) return;
        pill.classList.toggle('off', state === 'off');
        pill.classList.toggle('warn', state === 'warn');
        pill.querySelector('span:last-child').textContent = text;
        if (title) pill.title = title;
    }
    function fail(msg) {
        rec.failed = msg; enc.broken = true; enc.ready = false;
        log('FAILED: ' + msg);
        setPill('off', 'clip buffer off', msg);
        toast(msg, true);
    }
    function mapName() {
        try {
            const map = window.tagpro && tagpro.map;
            const m = map && (map.name || (map.info && map.info.name));
            return typeof m === 'string' ? m.trim() : '';
        } catch (e) { return ''; }
    }
    function clipName() {
        const m = mapName().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
        return `tagpro-clip-${stamp(new Date())}${m ? '-' + m : ''}.mp4`;
    }
    function muxDecoderConfig() {
        const dc = enc.decoderConfig || {};
        const out = { codec: enc.configuredCodec, codedWidth: enc.w, codedHeight: enc.h };
        if (enc.candidate.mux === 'avc') {
            if (!dc.description) throw new Error('no H.264 decoder description yet');
            out.description = dc.description;
        } else if (enc.candidate.mux === 'vp9') {
            const cs = dc.colorSpace;
            out.colorSpace = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: !!(cs && cs.fullRange) };
        }
        return out;
    }
    function mux(chunks) {
        const M = muxerLib();
        const muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: enc.candidate.mux, width: enc.w, height: enc.h }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
        const meta = { decoderConfig: muxDecoderConfig() };
        const MAX_GAP = 1e6;                                   // a pause in the frames (hidden tab, freeze) is shortened to 1 s
        let t = 0, lastDur = Math.round(1e6 / (CFG.maxFps || 60));
        for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i], next = chunks[i + 1];
            if (i > 0) t += Math.min(c.ts - chunks[i - 1].ts, MAX_GAP);
            const dur = next ? Math.min(next.ts - c.ts, MAX_GAP) : lastDur;
            lastDur = dur;
            muxer.addVideoChunkRaw(c.data, c.key ? 'key' : 'delta', t, dur, i === 0 ? meta : undefined);
        }
        muxer.finalize();
        return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), seconds: (t + lastDur) / 1e6 };
    }
    function makePoster() {
        return new Promise((resolve) => {
            try {
                const w = 320, h = Math.max(2, Math.round(320 * enc.h / enc.w));
                const c = document.createElement('canvas'); c.width = w; c.height = h;
                c.getContext('2d').drawImage(rec.el, 0, 0, w, h);
                c.toBlob((b) => resolve(b || null), 'image/jpeg', 0.75);
            } catch (e) { resolve(null); }
        });
    }
    async function saveClip(trigger) {
        if (saving) return;
        if (enc.broken) { toast(rec.failed || 'The clip buffer is not running.', true); return; }
        if (!enc.buf.length) { toast('Nothing buffered yet — the clip buffer is ' + (CFG.enabled ? 'waiting for frames.' : 'switched off.'), true); return; }
        saving = true;
        const t0 = performance.now();
        try {
            // pull the frames that are still inside the encoder so the clip ends at the key press
            if (enc.encoder && enc.encoder.state === 'configured') await Promise.race([enc.encoder.flush().catch(() => { /* ignore */ }), sleep(400)]);
            const poster = await makePoster();
            const buf = enc.buf;
            const latest = buf[buf.length - 1].ts, cutoff = latest - (+CFG.seconds || 30) * 1e6;
            let start = 0;
            for (let i = 0; i < buf.length && buf[i].ts <= cutoff; i++) if (buf[i].key) start = i;
            while (start < buf.length && !buf[start].key) start++;
            if (start >= buf.length) throw new Error('no keyframe in the buffer yet');
            const chunks = buf.slice(start);
            const t1 = performance.now();
            const { blob, seconds } = mux(chunks);
            const t2 = performance.now();
            const name = clipName();
            const record = { name, createdAt: Date.now(), seconds, bytes: blob.size, width: enc.w, height: enc.h, frames: chunks.length, codec: enc.candidate.id, map: mapName(), video: blob, poster };
            let stored = false, storeErr = '';
            if (CFG.library) {
                try { await dbAdd(record); stored = true; dbPrune(CFG.maxClips).catch((e) => log('prune failed: ' + e.message)); }
                catch (e) { storeErr = e.message || String(e); log('storing the clip failed: ' + storeErr); }
            }
            if (CFG.download || !stored) download(blob, name);
            const where = stored ? (CFG.download ? 'saved + downloaded' : 'saved — watch it on the homepage (CLIPS)') : (storeErr ? 'downloaded (could not store it: ' + storeErr + ')' : 'downloaded');
            toast(`Clip ${where}: ${fmtSec(seconds)} · ${fmtMB(blob.size)}`);
            log(`clip (${trigger}): ${name}, ${fmtSec(seconds)}, ${chunks.length} frames, ${blob.size} bytes, ${enc.candidate.id} ${enc.w}x${enc.h}; flush+poster ${(t1 - t0).toFixed(0)} ms, mux ${(t2 - t1).toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms`);
            if (panel) updatePanelStatus();
        } catch (e) {
            log('saving the clip failed: ' + (e && e.message));
            toast('Could not save the clip: ' + (e && e.message), true);
        }
        saving = false;
    }
    async function applyEncoderSettings(reprobe) {
        if (enc.broken || !enc.candidate) return;
        if (!CFG.enabled) { if (enc.encoder && enc.encoder.state !== 'closed') { try { enc.encoder.close(); } catch (e) { /* ignore */ } } enc.ready = false; enc.buf = []; enc.bytes = 0; return; }
        const src = rec.canvas; const t = targetSize((src && src.width) || 1280, (src && src.height) || 800);
        if (reprobe) { enc.ready = false; await chooseCodec(t.w, t.h); if (!enc.candidate) { fail('No usable video encoder for that choice.'); return; } createEncoder(); }
        configure(t.w, t.h);
    }
    async function startCapture() {
        const r = tagpro.renderer;
        rec.canvas = r.canvas || document.getElementById('viewport');
        rec.el = document.createElement('canvas');
        rec.ctx = rec.el.getContext('2d', { alpha: false });
        const size = targetSize(rec.canvas.width || 1280, rec.canvas.height || 800);
        await chooseCodec(size.w, size.h);
        if (!enc.candidate) { fail('No usable video encoder (H.264 or VP9) in this browser.'); return; }
        createEncoder();
        if (CFG.enabled) configure(size.w, size.h);
        hookPixi();
        setInterval(hookPixi, 2000);
        setInterval(tick, 1000);
        rec.started = performance.now();
        log(`capture ready: ${enc.candidate.id}, canvas ${rec.canvas.width}x${rec.canvas.height} → ${size.w}x${size.h}, ${CFG.seconds} s, hotkey ${hotkeyLabel(CFG.hotkey)}`);
    }
    function tick() {
        if (!pill) return;
        const secs = bufferedSeconds();
        if (enc.broken) { setPill('off', 'clip buffer off'); return; }
        if (!CFG.enabled) { setPill('off', 'off', 'Clip buffer is switched off — click for settings'); return; }
        const noFrames = performance.now() - rec.started > 8000 && enc.submitted === 0;
        const stalled = enc.submitted > 0 && performance.now() - rec.lastFrameAt > 5000;
        const text = noFrames ? 'no frames' : (secs >= (+CFG.seconds || 30) ? `${Math.round(CFG.seconds)} s` : `${Math.floor(secs)} s`);
        setPill(noFrames ? 'warn' : (stalled ? 'off' : ''), text,
            `Clip buffer v${VERSION}: ${fmtSec(secs)} buffered (${fmtMB(enc.bytes)}), ${enc.w}x${enc.h} ${enc.candidate ? enc.candidate.id : ''}. Press ${hotkeyLabel(CFG.hotkey)} to save the last ${CFG.seconds} s; Shift+${hotkeyLabel(CFG.hotkey)} or click for settings.`);
        if (panel && panel.classList.contains('open')) updatePanelStatus();
    }

    // ------------------------------------------------------------------ pill + settings panel
    let hotkeyListen = false;
    function buildPill() {
        injectCss();
        pill = document.createElement('div');
        pill.id = 'tpcbPill';
        pill.innerHTML = '<span class="dot"></span><span>starting…</span>';
        pill.title = 'TagPro Clip Buffer v' + VERSION;
        pill.style.display = CFG.showPill ? '' : 'none';
        pill.onclick = () => togglePanel();
        document.body.appendChild(pill);
    }
    function togglePanel(force) {
        if (!panel) buildPanel();
        const open = force !== undefined ? !!force : !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        if (pill) pill.classList.toggle('open', open);
        if (open) { fillPanel(); updatePanelStatus(); }
    }
    function updatePanelStatus() {
        if (!panel) return;
        const st = panel.querySelector('.st');
        if (enc.broken) { st.textContent = rec.failed; return; }
        if (!CFG.enabled) { st.textContent = 'Switched off.'; return; }
        st.textContent = `Buffering ${fmtSec(bufferedSeconds())} · ${fmtMB(enc.bytes)} · ${enc.w}×${enc.h} · ${enc.candidate ? enc.candidate.id : '?'}` + (enc.dropped ? ` · ${enc.dropped} frames dropped` : '') + (enc.submitted === 0 && performance.now() - rec.started > 8000 ? ' · no frames yet' : '');
    }
    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'tpcbPanel';
        panel.innerHTML = `
            <h4>Clip Buffer v${VERSION} <span title="close">×</span></h4>
            <div class="st"></div>
            <div class="row"><label><input id="tpcbEnabled" type="checkbox"> Buffer the game</label></div>
            <div class="row"><label>Clip length (seconds)</label><input id="tpcbSeconds" type="number" min="3" max="300" step="1"></div>
            <div class="row"><label>Save hotkey</label><button class="key" id="tpcbHotkey" type="button"></button></div>
            <div class="row"><label>Clip size</label><select id="tpcbMaxH"><option value="0">game canvas size</option><option value="1080">up to 1080p</option><option value="720">up to 720p</option></select></div>
            <div class="row"><label>Frame rate</label><select id="tpcbFps"><option value="60">60 fps</option><option value="30">30 fps</option><option value="0">every frame</option></select></div>
            <div class="row"><label>Quality (Mbit/s)</label><input id="tpcbMbps" type="number" min="1" max="60" step="1"></div>
            <div class="row"><label>Video codec</label><select id="tpcbCodec"><option value="auto">automatic</option><option value="h264">H.264</option><option value="vp9">VP9</option></select></div>
            <div class="row"><label>Colour behind the map</label><input id="tpcbBg" type="color"></div>
            <div class="row"><label><input id="tpcbLibrary" type="checkbox"> Keep clips in the browser (homepage viewer)</label></div>
            <div class="row"><label><input id="tpcbDownload" type="checkbox"> Also download the .mp4 right away</label></div>
            <div class="row"><label>Keep the newest … clips</label><input id="tpcbMaxClips" type="number" min="1" max="500" step="1"></div>
            <div class="row"><label><input id="tpcbShowPill" type="checkbox"> Show the status pill</label></div>
            <div class="row"><label><input id="tpcbReplays" type="checkbox"> Also buffer in the replay viewer</label></div>
            <div class="row"><label><input id="tpcbGroups" type="checkbox"> Clips button on group pages too</label></div>
            <button id="tpcbSaveNow">Save a clip now</button>
            <button id="tpcbWatch" class="secondary">Watch clips</button>
            <button id="tpcbDiag" class="secondary">Copy diagnostics</button>
            <div class="hint">Press the hotkey during a game to save the last N seconds (Shift + hotkey opens this panel). Clips are the game canvas only — chat and overlays are not in them. Nothing is uploaded; clips stay in this browser until you delete them.</div>`;
        document.body.appendChild(panel);
        const q = (s) => panel.querySelector(s);
        q('h4 span').onclick = () => togglePanel(false);
        q('#tpcbSaveNow').onclick = () => saveClip('button');
        q('#tpcbWatch').onclick = () => openLibrary();
        q('#tpcbDiag').onclick = copyDiagnostics;
        q('#tpcbHotkey').onclick = () => { hotkeyListen = !hotkeyListen; q('#tpcbHotkey').classList.toggle('listen', hotkeyListen); q('#tpcbHotkey').textContent = hotkeyListen ? 'press a key…' : hotkeyLabel(CFG.hotkey); };
        panel.addEventListener('change', (ev) => { readPanel(); if (ev.target && ev.target.blur && ev.target.type !== 'checkbox') ev.target.blur(); });
        panel.addEventListener('keydown', (ev) => { if ((ev.key === 'Escape' || ev.key === 'Enter') && ev.target && ev.target.blur) { ev.target.blur(); ev.stopPropagation(); } });
    }
    function fillPanel() {
        const q = (s) => panel.querySelector(s);
        q('#tpcbEnabled').checked = !!CFG.enabled; q('#tpcbSeconds').value = CFG.seconds; q('#tpcbHotkey').textContent = hotkeyLabel(CFG.hotkey);
        q('#tpcbMaxH').value = String(CFG.maxHeight || 0); q('#tpcbFps').value = String(CFG.maxFps || 0); q('#tpcbMbps').value = CFG.mbps; q('#tpcbBg').value = /^#[0-9a-f]{6}$/i.test(CFG.bg) ? CFG.bg : '#000000';
        q('#tpcbCodec').value = ['h264', 'vp9'].includes(CFG.codec) ? CFG.codec : 'auto';
        q('#tpcbLibrary').checked = !!CFG.library; q('#tpcbDownload').checked = !!CFG.download; q('#tpcbMaxClips').value = CFG.maxClips;
        q('#tpcbShowPill').checked = !!CFG.showPill; q('#tpcbReplays').checked = !!CFG.inReplays; q('#tpcbGroups').checked = !!CFG.libraryOnGroups;
    }
    function readPanel() {
        const q = (s) => panel.querySelector(s);
        const before = { enabled: CFG.enabled, maxHeight: CFG.maxHeight, maxFps: CFG.maxFps, mbps: CFG.mbps, codec: CFG.codec };
        CFG.enabled = q('#tpcbEnabled').checked;
        CFG.seconds = Math.min(300, Math.max(3, Math.round(+q('#tpcbSeconds').value || 30)));
        CFG.maxHeight = +q('#tpcbMaxH').value || 0; CFG.maxFps = +q('#tpcbFps').value || 0;
        CFG.mbps = Math.min(60, Math.max(1, +q('#tpcbMbps').value || 10)); CFG.bg = q('#tpcbBg').value || '#000000';
        CFG.codec = q('#tpcbCodec').value || 'auto';
        CFG.library = q('#tpcbLibrary').checked; CFG.download = q('#tpcbDownload').checked;
        CFG.maxClips = Math.min(500, Math.max(1, Math.round(+q('#tpcbMaxClips').value || 30)));
        CFG.showPill = q('#tpcbShowPill').checked; CFG.inReplays = q('#tpcbReplays').checked; CFG.libraryOnGroups = q('#tpcbGroups').checked;
        if (!CFG.library && !CFG.download) { CFG.download = true; q('#tpcbDownload').checked = true; }
        saveCfg();
        if (pill) pill.style.display = CFG.showPill ? '' : 'none';
        if (before.enabled !== CFG.enabled || before.maxHeight !== CFG.maxHeight || before.maxFps !== CFG.maxFps || before.mbps !== CFG.mbps || before.codec !== CFG.codec) {
            log('settings applied: ' + safeJson(CFG));
            applyEncoderSettings(before.codec !== CFG.codec).catch((e) => log('applying the settings failed: ' + e.message));
        }
        fillPanel(); updatePanelStatus();
    }
    async function copyDiagnostics() {
        const head = [`TagPro Clip Buffer ${VERSION} — ${navigator.userAgent}`,
            `page ${location.pathname}, window ${window.innerWidth}x${window.innerHeight}, dpr ${window.devicePixelRatio}, canvas ${rec.canvas ? rec.canvas.width + 'x' + rec.canvas.height : '-'}, state ${window.tagpro ? tagpro.state : '-'}`,
            `settings ${safeJson(CFG)}`,
            `encoder ${enc.candidate ? enc.candidate.id + ' ' + enc.configuredCodec : 'none'} ${enc.w}x${enc.h}, ready ${enc.ready}, broken ${enc.broken}, candidates ${enc.candidates.map((c) => c.id).join('/')}`,
            `frames ${enc.frames} rendered, ${enc.submitted} encoded, ${enc.chunks} chunks, ${enc.dropped} dropped, ${enc.drawErrors}/${enc.frameErrors}/${enc.hookErrors} draw/frame/hook errors, ${enc.errors} encoder errors, ${enc.configures} configures`,
            `buffer ${enc.buf.length} chunks, ${fmtSec(bufferedSeconds())}, ${fmtMB(enc.bytes)}, annexb ${enc.annexb}, description ${enc.decoderConfig && enc.decoderConfig.description ? enc.decoderConfig.description.byteLength + ' bytes' : 'none'}`,
            `WebCodecs ${typeof VideoEncoder === 'function'}, muxer ${!!muxerLib()}, queue ${enc.encoder ? enc.encoder.encodeQueueSize : '-'}, encoder state ${enc.encoder ? enc.encoder.state : '-'}`];
        const text = head.concat(diag).join('\n');
        try { await navigator.clipboard.writeText(text); toast('Diagnostics copied — paste them into the chat.'); }
        catch (e) { console.log(text); toast('Could not copy; the diagnostics were printed to the console instead.', true); }
    }
    function onKey(e) {
        if (hotkeyListen) {
            if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation();
            hotkeyListen = false;
            if (e.key !== 'Escape') { CFG.hotkey = { code: e.code, key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }; saveCfg(); log('hotkey set to ' + hotkeyLabel(CFG.hotkey)); }
            if (panel) { const b = panel.querySelector('#tpcbHotkey'); b.classList.remove('listen'); b.textContent = hotkeyLabel(CFG.hotkey); }
            return;
        }
        if (isTyping(e.target)) return;
        const hk = CFG.hotkey;
        if (!keyMatches(e, hk)) return;
        const mods = (m) => !!e.shiftKey === !!m.shift && !!e.altKey === !!m.alt && !!e.ctrlKey === !!m.ctrl && !!e.metaKey === !!m.meta;
        if (mods(hk)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) saveClip('hotkey'); }
        else if (!hk.shift && mods(Object.assign({}, hk, { shift: true }))) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) togglePanel(); }
    }
    // the physical key (e.code) or the character it types (e.key) — so the hotkey works on any keyboard layout
    function keyMatches(e, hk) {
        if (hk.code && e.code === hk.code) return true;
        return !!hk.key && hk.key.length === 1 && typeof e.key === 'string' && e.key.toLowerCase() === hk.key.toLowerCase();
    }
    function bootRecorder() {
        if (window.tagproConfig && tagproConfig.replay && !CFG.inReplays) { log('replay viewer: buffer off (enable "Also buffer in the replay viewer" in the settings)'); return; }
        buildPill();
        window.addEventListener('keydown', onKey, true);
        if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function') { fail('This browser has no WebCodecs video encoder (needs Firefox 130+ or Chrome 94+).'); return; }
        if (!muxerLib()) { fail('The bundled mp4 muxer is missing — reinstall the script.'); return; }
        waitFor(() => window.tagpro && tagpro.renderer && tagpro.renderer.renderer && (tagpro.renderer.canvas || document.getElementById('viewport')), 300000)
            .then(startCapture)
            .catch((e) => fail('The game renderer never appeared: ' + e.message));
    }

    // ------------------------------------------------------------------ boot
    const path = location.pathname;
    console.log('[ClipBuffer] v' + VERSION + ' loaded on ' + path + (muxerLib() ? '' : ' (mp4 muxer missing!)'));
    if (/^\/game\b/.test(path)) bootRecorder();
    else if (path === '/' || path === '/index.html' || (CFG.libraryOnGroups && /^\/groups\//.test(path))) bootLibraryButton();
    window.tpClipBuffer = { VERSION, CFG, enc, rec, diag, saveClip, openLibrary, closeLibrary, dbAll, dbDelete, dbClear, prune, mux, hookPixi, chooseCodec, configure, avcNormalize, buildAvcC };
})();
