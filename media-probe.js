/*
 * Lê as características técnicas de vídeos e imagens no navegador, sem enviar nada:
 * formato, resolução (já considerando rotação), duração, fps, codecs, bitrates e áudio.
 * Também faz a análise visual/sonora usada pelo Checador (movimento, faixas pretas,
 * QR code e áudio mudo).
 */
(function (root) {
  'use strict';
  var CONTAINERS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 1, mvex: 1 };

  function readBytes(blob, start, end) {
    var part = blob.slice(start, end);
    if (part.arrayBuffer) return part.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(new Uint8Array(r.result)); }; r.onerror = no; r.readAsArrayBuffer(part); });
  }
  function u32(u8, p) { return ((u8[p] << 24) >>> 0) + (u8[p + 1] << 16) + (u8[p + 2] << 8) + u8[p + 3]; }
  function u64(u8, p) { return u32(u8, p) * 0x100000000 + u32(u8, p + 4); }
  function u16(u8, p) { return (u8[p] << 8) | u8[p + 1]; }
  function s32(u8, p) { var v = u32(u8, p); return v > 0x7fffffff ? v - 0x100000000 : v; }
  function type4(u8, p) { return String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]); }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  function sniff(head, name) {
    var e = ext(name);
    if (head[0] === 0xff && head[1] === 0xd8) return { kind: 'image', container: 'jpg' };
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return { kind: 'image', container: 'png' };
    if (type4(head, 0) === 'RIFF' && type4(head, 8) === 'WEBP') return { kind: 'image', container: 'webp' };
    if (type4(head, 0) === 'GIF8') return { kind: 'image', container: 'gif' };
    if (type4(head, 4) === 'ftyp') {
      var brand = type4(head, 8);
      if (/^(heic|heix|mif1|msf1|avif)/.test(brand)) return { kind: 'image', container: brand.indexOf('avif') === 0 ? 'avif' : 'heic' };
      if (brand === 'qt  ') return { kind: 'video', container: 'mov' };
      if (brand.indexOf('3g') === 0) return { kind: 'video', container: '3gp' };
      return { kind: 'video', container: 'mp4' };
    }
    if (['moov', 'mdat', 'wide', 'free', 'skip'].indexOf(type4(head, 4)) >= 0) return { kind: 'video', container: e === 'mov' ? 'mov' : 'mp4' };
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { kind: 'video', container: e === 'mkv' ? 'mkv' : 'webm' };
    if (type4(head, 0) === 'RIFF' && type4(head, 8) === 'AVI ') return { kind: 'video', container: 'avi' };
    if (head[0] === 0 && head[1] === 0 && head[2] === 1 && (head[3] === 0xba || head[3] === 0xb3)) return { kind: 'video', container: 'mpeg' };
    if (head[0] === 0x30 && head[1] === 0x26 && head[2] === 0xb2 && head[3] === 0x75) return { kind: 'video', container: 'wmv' };
    if (type4(head, 0) === 'FLV\u0001') return { kind: 'video', container: 'flv' };
    return { kind: /^(jpe?g|png|webp|gif|heic|avif)$/.test(e) ? 'image' : 'video', container: e || 'desconhecido' };
  }

  function parse(u8, start, end) {
    var out = [], pos = start;
    while (pos + 8 <= end) {
      var size = u32(u8, pos), type = type4(u8, pos + 4), hdr = 8;
      if (size === 1) { size = u64(u8, pos + 8); hdr = 16; } else if (size === 0) size = end - pos;
      if (size < hdr || pos + size > end) break;
      var node = { type: type, start: pos, size: size, hdr: hdr };
      if (CONTAINERS[type]) node.children = parse(u8, pos + hdr, pos + size);
      out.push(node); pos += size;
    }
    return out;
  }
  function child(node, type) { return (node.children || []).find(function (c) { return c.type === type; }); }

  async function scanTop(file) {
    var boxes = [], pos = 0, guard = 0;
    while (pos + 8 <= file.size && guard++ < 10000) {
      var head = await readBytes(file, pos, Math.min(file.size, pos + 16));
      var size = u32(head, 0), type = type4(head, 4), hdr = 8;
      if (size === 1) { size = u64(head, 8); hdr = 16; } else if (size === 0) size = file.size - pos;
      if (size < hdr) break;
      boxes.push({ type: type, start: pos, size: Math.min(size, file.size - pos), hdr: hdr });
      pos += size;
    }
    return boxes;
  }

  var VCODEC = { avc1: 'h264', avc3: 'h264', hvc1: 'hevc', hev1: 'hevc', vp09: 'vp9', vp08: 'vp8', av01: 'av1', mp4v: 'mpeg4', s263: 'h263', jpeg: 'mjpeg', apcn: 'prores', apch: 'prores', apcs: 'prores', ap4h: 'prores' };

  function audioCodecOf(u8, entryStart, entryEnd, entryType) {
    if (entryType === 'mp4a') {
      for (var p = entryStart + 8; p + 4 <= entryEnd; p++) {
        if (u8[p] === 0x65 && u8[p + 1] === 0x73 && u8[p + 2] === 0x64 && u8[p + 3] === 0x73) {
          var q = p + 8; // depois do 'esds' + versão/flags
          if (u8[q] !== 0x03) continue;
          q++; while (u8[q] & 0x80) q++; q++;
          var flags = u8[q + 2]; q += 3;
          if (flags & 0x80) q += 2; if (flags & 0x40) q += 1 + u8[q]; if (flags & 0x20) q += 2;
          if (u8[q] !== 0x04) continue;
          q++; while (u8[q] & 0x80) q++; q++;
          var ot = u8[q];
          return ot === 0x40 || ot === 0x66 || ot === 0x67 || ot === 0x68 ? 'aac' : (ot === 0x6b || ot === 0x69 ? 'mp3' : 'mp4a-' + ot.toString(16));
        }
      }
      return 'aac';
    }
    return { '.mp3': 'mp3', Opus: 'opus', 'ac-3': 'ac3', 'ec-3': 'eac3', lpcm: 'pcm', sowt: 'pcm', twos: 'pcm', alac: 'alac', samr: 'amr', sawb: 'amr', fLaC: 'flac' }[entryType] || entryType;
  }

  function readTrak(u8, trak) {
    var mdia = child(trak, 'mdia'), minf = mdia && child(mdia, 'minf'), stbl = minf && child(minf, 'stbl');
    var tkhd = child(trak, 'tkhd'), hdlr = mdia && child(mdia, 'hdlr'), mdhd = mdia && child(mdia, 'mdhd');
    var t = { handler: hdlr ? type4(u8, hdlr.start + hdlr.hdr + 8) : '' };
    if (tkhd) {
      var p = tkhd.start + tkhd.hdr, v = u8[p], m = p + (v === 1 ? 52 : 40);
      t.matrix = [s32(u8, m), s32(u8, m + 4), s32(u8, m + 12), s32(u8, m + 16)];
      t.tkW = u32(u8, m + 36) / 65536; t.tkH = u32(u8, m + 40) / 65536;
    }
    if (mdhd) { var q = mdhd.start + mdhd.hdr, mv = u8[q]; t.timescale = mv === 1 ? u32(u8, q + 20) : u32(u8, q + 12); t.duration = mv === 1 ? u64(u8, q + 24) : u32(u8, q + 16); }
    if (!stbl) return t;
    var stsd = child(stbl, 'stsd'), stsz = child(stbl, 'stsz'), stz2 = child(stbl, 'stz2'), stts = child(stbl, 'stts');
    if (stsd && stsd.size > 24) {
      var e = stsd.start + stsd.hdr + 8, eSize = u32(u8, e), eType = type4(u8, e + 4), eEnd = Math.min(e + eSize, stsd.start + stsd.size);
      t.entry = eType;
      if (t.handler === 'vide') { t.w = u16(u8, e + 32); t.h = u16(u8, e + 34); t.codec = VCODEC[eType] || eType; }
      if (t.handler === 'soun') {
        var ver = u16(u8, e + 16);
        t.channels = u16(u8, e + 24); t.rate = u32(u8, e + 32) / 65536;
        if (ver === 2 && e + 72 <= eEnd) { var dv = new DataView(u8.buffer, u8.byteOffset + e + 40, 8); t.rate = dv.getFloat64(0); t.channels = u32(u8, e + 48); }
        t.codec = audioCodecOf(u8, e, eEnd, eType);
      }
    }
    var bytes = 0, count = 0;
    if (stsz) {
      var b = stsz.start + stsz.hdr, fixed = u32(u8, b + 4); count = u32(u8, b + 8);
      if (fixed) bytes = fixed * count;
      else for (var i = 0; i < count && b + 12 + i * 4 + 4 <= stsz.start + stsz.size; i++) bytes += u32(u8, b + 12 + i * 4);
    } else if (stz2) {
      var b2 = stz2.start + stz2.hdr, field = u8[b2 + 7]; count = u32(u8, b2 + 8);
      for (var j = 0; j < count; j++) bytes += field === 16 ? u16(u8, b2 + 12 + j * 2) : field === 8 ? u8[b2 + 12 + j] : (j % 2 ? u8[b2 + 12 + (j >> 1)] & 15 : u8[b2 + 12 + (j >> 1)] >> 4);
    }
    t.bytes = bytes; t.samples = count;
    if (stts) {
      var tb = stts.start + stts.hdr, tc = u32(u8, tb + 4), deltas = {}, total = 0;
      for (var k = 0; k < tc && tb + 16 + k * 8 <= stts.start + stts.size; k++) {
        var cnt = u32(u8, tb + 8 + k * 8), d = u32(u8, tb + 12 + k * 8);
        deltas[d] = (deltas[d] || 0) + cnt; total += cnt;
      }
      var top = Object.keys(deltas).reduce(function (a, c) { return deltas[c] > (deltas[a] || 0) ? c : a; }, null);
      t.vfr = total > 10 && top !== null && deltas[top] / total < 0.9;
    }
    return t;
  }

  async function probeMp4(file, info) {
    var top = await scanTop(file);
    var moovBox = top.find(function (b) { return b.type === 'moov'; });
    info.fragmented = top.some(function (b) { return b.type === 'moof'; });
    info.faststart = !!moovBox && top.findIndex(function (b) { return b.type === 'moov'; }) < top.findIndex(function (b) { return b.type === 'mdat'; });
    if (!moovBox || moovBox.size > 300 * 1048576) return info;
    var u8 = await readBytes(file, moovBox.start, moovBox.start + moovBox.size);
    var moov = parse(u8, 0, u8.length)[0];
    if (!moov) return info;
    info.fragmented = info.fragmented || !!child(moov, 'mvex');
    var mvhd = child(moov, 'mvhd');
    if (mvhd) { var p = mvhd.start + mvhd.hdr, v = u8[p], ts = v === 1 ? u32(u8, p + 20) : u32(u8, p + 12), du = v === 1 ? u64(u8, p + 24) : u32(u8, p + 16); if (ts) info.duration = du / ts; }
    var traks = (moov.children || []).filter(function (c) { return c.type === 'trak'; }).map(function (t) { return readTrak(u8, t); });
    var vt = traks.find(function (t) { return t.handler === 'vide'; });
    var at = traks.find(function (t) { return t.handler === 'soun'; });
    if (vt) {
      var w = vt.tkW || vt.w, h = vt.tkH || vt.h;
      if (vt.matrix && vt.matrix[1] !== 0 && vt.matrix[0] === 0) { var tmp = w; w = h; h = tmp; } // girado 90°/270°
      info.width = Math.round(w); info.height = Math.round(h);
      info.videoCodec = vt.codec;
      var vdur = vt.timescale ? vt.duration / vt.timescale : info.duration;
      if (vdur > 0) { info.fps = vt.samples / vdur; info.videoBitrate = vt.bytes * 8 / vdur; if (!info.duration) info.duration = vdur; }
      info.vfr = !!vt.vfr;
    }
    info.hasAudio = !!(at && at.samples);
    if (at) {
      info.audioCodec = at.codec; info.audioChannels = at.channels; info.audioRate = at.rate;
      var adur = at.timescale ? at.duration / at.timescale : info.duration;
      if (adur > 0 && at.bytes) info.audioBitrate = at.bytes * 8 / adur;
    }
    info.parseOk = !!vt;
    return info;
  }

  function videoElementInfo(file) {
    return new Promise(function (resolve) {
      var v = document.createElement('video'), url = URL.createObjectURL(file);
      var done = function (r) { clearTimeout(t); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); resolve(r); };
      var t = setTimeout(function () { done(null); }, 8000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = function () { done({ width: v.videoWidth, height: v.videoHeight, duration: isFinite(v.duration) ? v.duration : 0 }); };
      v.onerror = function () { done(null); };
      v.src = url;
    });
  }
  function imageInfo(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = function () { resolve(null); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  async function probe(file) {
    var head = await readBytes(file, 0, Math.min(file.size, 64));
    var s = sniff(head, file.name);
    var info = { kind: s.kind, container: s.container, ext: ext(file.name) || s.container, size: file.size, name: file.name, parseOk: false, metadata: [] };
    if (s.kind === 'image') {
      var im = await imageInfo(file);
      if (im) { info.width = im.width; info.height = im.height; info.parseOk = true; }
      return info;
    }
    if (['mp4', 'mov', '3gp'].indexOf(s.container) >= 0) {
      try { await probeMp4(file, info); } catch (e) { /* tenta pelo navegador */ }
    }
    if (!info.width || !info.duration) {
      var el = await videoElementInfo(file);
      if (el) { info.width = info.width || el.width; info.height = info.height || el.height; info.duration = info.duration || el.duration; }
      if (el && !info.videoBitrate && info.duration) info.videoBitrate = file.size * 8 / info.duration; // estimativa (inclui o áudio)
    }
    return info;
  }

  // ------------------------------------------------------------ análise visual e sonora
  function seek(video, t) {
    return new Promise(function (resolve) {
      var done = function () { video.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
      var timer = setTimeout(done, 3000);
      video.addEventListener('seeked', done);
      video.currentTime = t;
    });
  }
  async function analyzeVideo(file, info, onProgress) {
    var result = { staticRatio: null, blackBars: null, qr: null, frames: 0 };
    var url = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.muted = true; video.preload = 'auto'; video.playsInline = true; video.src = url;
    try {
      await new Promise(function (ok, no) { video.onloadeddata = ok; video.onerror = no; setTimeout(no, 10000); });
    } catch (e) { URL.revokeObjectURL(url); return result; }
    var dur = video.duration || info.duration || 0;
    var N = Math.max(6, Math.min(24, Math.round(dur * 1.5)));
    var cw = 96, ch = Math.max(1, Math.round(96 * (video.videoHeight / video.videoWidth || 16 / 9)));
    var small = document.createElement('canvas'); small.width = cw; small.height = ch;
    var sctx = small.getContext('2d', { willReadFrequently: true });
    var big = null, detector = null;
    if ('BarcodeDetector' in window) {
      try { var formats = await window.BarcodeDetector.getSupportedFormats(); if (formats.indexOf('qr_code') >= 0) { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); result.qr = false; } } catch (e) { /* sem detector */ }
      big = document.createElement('canvas'); big.width = Math.min(720, video.videoWidth); big.height = Math.round(big.width * video.videoHeight / video.videoWidth);
    }
    var prev = null, still = 0, pairs = 0, bars = { top: 0, side: 0 };
    for (var i = 0; i < N; i++) {
      var t = Math.min(dur - 0.05, (i + 0.5) * dur / N);
      await seek(video, Math.max(0, t));
      sctx.drawImage(video, 0, 0, cw, ch);
      var px = sctx.getImageData(0, 0, cw, ch).data;
      var lum = new Float32Array(cw * ch);
      for (var k = 0, j = 0; k < px.length; k += 4, j++) lum[j] = px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114;
      if (i === 0) {
        var th = document.createElement('canvas'); th.width = 160; th.height = Math.round(160 * (video.videoHeight / video.videoWidth || 16 / 9));
        th.getContext('2d').drawImage(video, 0, 0, th.width, th.height);
        try { result.thumb = th.toDataURL('image/jpeg', 0.7); } catch (e) { /* sem prévia */ }
      }
      if (prev) {
        var diff = 0; for (var m = 0; m < lum.length; m++) diff += Math.abs(lum[m] - prev[m]);
        diff /= lum.length;
        pairs++; if (diff < 1.2) still++;
      }
      prev = lum;
      // faixas pretas: linhas/colunas das bordas quase pretas e sem variação
      var rowDark = function (y) { var s = 0, mx = 0; for (var x = 0; x < cw; x++) { var l = lum[y * cw + x]; s += l; if (l > mx) mx = l; } return s / cw < 12 && mx < 28; };
      var colDark = function (x) { var s = 0, mx = 0; for (var y = 0; y < ch; y++) { var l = lum[y * cw + x]; s += l; if (l > mx) mx = l; } return s / ch < 12 && mx < 28; };
      var band = Math.max(2, Math.round(ch * 0.06)), bandX = Math.max(2, Math.round(cw * 0.06));
      var midDark = (function () { var s = 0; for (var y = Math.round(ch * 0.4); y < Math.round(ch * 0.6); y++) for (var x = 0; x < cw; x++) s += lum[y * cw + x]; return s / (cw * Math.round(ch * 0.2)) < 12; })();
      if (!midDark) {
        var topOk = true, sideOk = true;
        for (var y2 = 0; y2 < band; y2++) if (!rowDark(y2) || !rowDark(ch - 1 - y2)) { topOk = false; break; }
        for (var x2 = 0; x2 < bandX; x2++) if (!colDark(x2) || !colDark(cw - 1 - x2)) { sideOk = false; break; }
        if (topOk) bars.top++; if (sideOk) bars.side++;
      }
      if (detector && i % 2 === 0) {
        try {
          big.getContext('2d').drawImage(video, 0, 0, big.width, big.height);
          var codes = await detector.detect(big);
          if (codes && codes.length) result.qr = true;
        } catch (e) { /* ignora */ }
      }
      if (onProgress) onProgress((i + 1) / N);
    }
    result.frames = N;
    result.staticRatio = pairs ? still / pairs : null;
    if (bars.top >= N * 0.7) result.blackBars = 'letterbox';
    else if (bars.side >= N * 0.7) result.blackBars = 'pillarbox';
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
    return result;
  }

  // Áudio mudo? (decodifica e mede o volume máximo)
  async function analyzeAudio(file) {
    if (file.size > 250 * 1048576) return null;
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return null;
    try {
      var buf = await file.arrayBuffer();
      var ctx = new Ctx(1, 8000, 8000);
      var audio = await ctx.decodeAudioData(buf);
      var peak = 0, sum = 0, n = 0;
      for (var c = 0; c < audio.numberOfChannels; c++) {
        var d = audio.getChannelData(c);
        for (var i = 0; i < d.length; i += 4) { var v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; n++; }
      }
      var rms = Math.sqrt(sum / Math.max(1, n));
      var peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      return { silent: peakDb < -50, peakDb: peakDb, rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity };
    } catch (e) { return null; }
  }

  root.MediaProbe = { probe: probe, analyzeVideo: analyzeVideo, analyzeAudio: analyzeAudio, sniff: sniff };
})(typeof self !== 'undefined' ? self : this);
