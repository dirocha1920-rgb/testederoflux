/*
 * Imagem para vídeo, no navegador.
 * Desenha a imagem quadro a quadro (parada ou com zoom lento), codifica em H.264 com
 * WebCodecs (bem mais rápido que tempo real) e monta um MP4 comum. Depois, o
 * audio-fix.js acrescenta uma faixa de áudio silenciosa a 128 kbps (exigida por
 * plataformas de anúncio como o Kwai).
 * Sem WebCodecs H.264, grava em tempo real com MediaRecorder.
 */
(function (root) {
  'use strict';
  var FPS = 30, TIMESCALE = 30000, DELTA = TIMESCALE / FPS;

  function ImageVideoError(message) { this.name = 'ImageVideoError'; this.message = message; }
  ImageVideoError.prototype = Object.create(Error.prototype);

  // ------------------------------------------------------------ MP4 (uma faixa H.264)
  function box(type, parts) {
    var len = 8; parts.forEach(function (x) { len += x.byteLength; });
    var out = new Uint8Array(len), dv = new DataView(out.buffer);
    dv.setUint32(0, len); for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    var p = 8; parts.forEach(function (x) { out.set(x instanceof Uint8Array ? x : new Uint8Array(x.buffer || x, x.byteOffset || 0, x.byteLength), p); p += x.byteLength; });
    return out;
  }
  function be(values, widths) {
    var len = widths.reduce(function (a, b) { return a + b; }, 0), out = new Uint8Array(len), dv = new DataView(out.buffer), p = 0;
    values.forEach(function (v, i) { var w = widths[i]; if (w === 1) dv.setUint8(p, v); else if (w === 2) dv.setUint16(p, v); else if (w === 3) { dv.setUint8(p, (v >> 16) & 255); dv.setUint16(p + 1, v & 0xffff); } else dv.setUint32(p, v >>> 0); p += w; });
    return out;
  }
  function zeros(n) { return new Uint8Array(n); }
  function str(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }
  var MATRIX = be([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000], [4, 4, 4, 4, 4, 4, 4, 4, 4]);

  // samples: [{ data: Uint8Array, key: bool }] em ordem; description: avcC
  function muxH264(samples, description, width, height) {
    var n = samples.length, mediaDuration = n * DELTA, ms = Math.round(n * 1000 / FPS);
    var dataSize = samples.reduce(function (s, x) { return s + x.data.byteLength; }, 0);
    var ftyp = box('ftyp', [str('isom'), be([0x200], [4]), str('isomiso2avc1mp41')]);
    function moov(chunkOffset) {
      var mvhd = box('mvhd', [zeros(4), zeros(8), be([1000, ms, 0x10000, 0x0100], [4, 4, 4, 2]), zeros(10), MATRIX, zeros(24), be([2], [4])]);
      var tkhd = box('tkhd', [be([0, 3], [1, 3]), zeros(8), be([1, 0, ms], [4, 4, 4]), zeros(8), be([0, 0, 0, 0], [2, 2, 2, 2]), MATRIX, be([width * 65536, height * 65536], [4, 4])]);
      var mdhd = box('mdhd', [zeros(4), zeros(8), be([TIMESCALE, mediaDuration, 0x55c4, 0], [4, 4, 2, 2])]);
      var hdlr = box('hdlr', [zeros(8), str('vide'), zeros(12), str('VideoHandler'), zeros(1)]);
      var vmhd = box('vmhd', [be([0, 1], [1, 3]), zeros(8)]);
      var dinf = box('dinf', [box('dref', [zeros(4), be([1], [4]), box('url ', [be([0, 1], [1, 3])])])]);
      var avc1 = box('avc1', [zeros(6), be([1], [2]), zeros(16), be([width, height, 0x480000, 0x480000, 0, 1], [2, 2, 4, 4, 4, 2]), zeros(32), be([0x18, 0xffff], [2, 2]),
        box('avcC', [new Uint8Array(description)]), box('pasp', [be([1, 1], [4, 4])])]);
      var stsd = box('stsd', [zeros(4), be([1], [4]), avc1]);
      var stts = box('stts', [zeros(4), be([1, n, DELTA], [4, 4, 4])]);
      var keys = []; samples.forEach(function (s, i) { if (s.key) keys.push(i + 1); });
      var stss = box('stss', [zeros(4), be([keys.length], [4]), be(keys, keys.map(function () { return 4; }))]);
      var stsc = box('stsc', [zeros(4), be([1, 1, n, 1], [4, 4, 4, 4])]);
      var stsz = box('stsz', [zeros(4), be([0, n], [4, 4]), be(samples.map(function (s) { return s.data.byteLength; }), samples.map(function () { return 4; }))]);
      var stco = box('stco', [zeros(4), be([1, chunkOffset], [4, 4])]);
      var stbl = box('stbl', [stsd, stts, stss, stsc, stsz, stco]);
      return box('moov', [mvhd, box('trak', [tkhd, box('mdia', [mdhd, hdlr, box('minf', [vmhd, dinf, stbl])])])]);
    }
    var moovLen = moov(0).byteLength;
    var start = ftyp.byteLength + moovLen + 8;
    if (start + dataSize > 0xFFFFFFFF) throw new ImageVideoError('O vídeo ficaria grande demais.');
    var parts = [ftyp, moov(start), be([dataSize + 8, 0x6d646174], [4, 4])];
    samples.forEach(function (s) { parts.push(s.data); });
    return new Blob(parts, { type: 'video/mp4' });
  }

  // ------------------------------------------------------------ desenho
  // effect: 'parada' | 'zoom-in' | 'zoom-out'; t de 0 a 1
  function drawFrame(ctx, img, w, h, fit, effect, t) {
    var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var zoom = effect === 'zoom-in' ? 1 + 0.12 * ease : effect === 'zoom-out' ? 1.12 - 0.12 * ease : 1;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var scale = (fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih)) * zoom;
    var dw = iw * scale, dh = ih * scale;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  // Tamanho final: formato escolhido ou o da imagem (lado maior até 1920, medidas pares)
  function outputSize(img, format) {
    if (format && format.w) return { w: format.w, h: format.h };
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var s = Math.min(1, 1920 / Math.max(iw, ih));
    return { w: Math.max(2, Math.round(iw * s / 2) * 2), h: Math.max(2, Math.round(ih * s / 2) * 2) };
  }

  var CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640033', 'avc1.4d0033'];
  async function pickCodec(w, h, bitrate) {
    if (typeof VideoEncoder === 'undefined') return null;
    for (var i = 0; i < CODECS.length; i++) {
      var cfg = { codec: CODECS[i], width: w, height: h, bitrate: bitrate, framerate: FPS, avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* tenta o próximo */ }
    }
    return null;
  }
  function bitrateFor(w, h) { return Math.round(Math.min(12e6, Math.max(3e6, w * h * FPS * 0.12))); }

  async function supportsFast() {
    return !!(await pickCodec(1080, 1920, 8e6));
  }

  // options: { seconds, format, fit, effect, onProgress(0..1) }
  async function make(img, options) {
    var size = outputSize(img, options.format), w = size.w, h = size.h;
    var frames = Math.round(options.seconds * FPS);
    var cfg = await pickCodec(w, h, bitrateFor(w, h));
    if (!cfg) return recordRealtime(img, w, h, options);
    var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d', { alpha: false });
    var samples = [], description = null, failure = null, lastTs = -1;
    var encoder = new VideoEncoder({
      output: function (chunk, meta) {
        if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) description = meta.decoderConfig.description;
        if (chunk.timestamp < lastTs) failure = new ImageVideoError('O codificador deste navegador gerou quadros fora de ordem.');
        lastTs = chunk.timestamp;
        var data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        samples.push({ data: data, key: chunk.type === 'key' });
      },
      error: function (e) { failure = e; },
    });
    encoder.configure(cfg);
    var still = options.effect === 'parada';
    if (still) drawFrame(ctx, img, w, h, options.fit, 'parada', 0);
    for (var i = 0; i < frames; i++) {
      if (failure) break;
      if (!still) drawFrame(ctx, img, w, h, options.fit, options.effect, frames > 1 ? i / (frames - 1) : 0);
      var frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 8) await new Promise(function (r) { setTimeout(r, 4); });
      if (options.onProgress && i % 10 === 0) options.onProgress(i / frames * 0.95);
    }
    await encoder.flush().catch(function (e) { failure = failure || e; });
    encoder.close();
    if (failure) throw failure instanceof ImageVideoError ? failure : new ImageVideoError('O navegador não conseguiu codificar o vídeo.');
    if (!description || samples.length !== frames) throw new ImageVideoError('O navegador não devolveu o vídeo completo.');
    if (!samples[0].key) throw new ImageVideoError('O vídeo gerado começou sem quadro-chave.');
    var video = muxH264(samples, description, w, h);
    if (options.onProgress) options.onProgress(0.97);
    var fixed = await root.AjustaAudio.fix(video, { addSilent: true, targetKbps: 128 });
    if (options.onProgress) options.onProgress(1);
    return { blob: fixed.output, width: w, height: h, ext: '.mp4', fast: true };
  }

  // Alternativa: grava em tempo real (navegadores sem H.264 no WebCodecs)
  function recordRealtime(img, w, h, options) {
    return new Promise(function (resolve, reject) {
      if (typeof MediaRecorder === 'undefined') { reject(new ImageVideoError('Este navegador não consegue gerar vídeo. Use o Chrome ou o Edge.')); return; }
      var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d', { alpha: false });
      drawFrame(ctx, img, w, h, options.fit, options.effect, 0);
      var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
      var mime = types.find(function (t) { return MediaRecorder.isTypeSupported(t); }) || '';
      var stream = canvas.captureStream(FPS);
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrateFor(w, h) });
      var parts = [];
      rec.ondataavailable = function (e) { if (e.data.size) parts.push(e.data); };
      rec.onerror = function () { reject(new ImageVideoError('A gravação falhou neste navegador.')); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var type = rec.mimeType || mime || 'video/webm';
        resolve({ blob: new Blob(parts, { type: type }), width: w, height: h, ext: /mp4/.test(type) ? '.mp4' : '.webm', fast: false });
      };
      rec.start(1000);
      var t0 = performance.now(), total = options.seconds * 1000;
      (function tick() {
        var t = Math.min(1, (performance.now() - t0) / total);
        drawFrame(ctx, img, w, h, options.fit, options.effect, t);
        if (options.onProgress) options.onProgress(t);
        if (t < 1) requestAnimationFrame(tick); else rec.stop();
      })();
    });
  }

  root.ImagemVideo = { make: make, drawFrame: drawFrame, outputSize: outputSize, supportsFast: supportsFast, muxH264: muxH264, ImageVideoError: ImageVideoError };
})(typeof self !== 'undefined' ? self : this);
