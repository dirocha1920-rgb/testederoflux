/*
 * Ajusta o bitrate do áudio de vídeos MP4/MOV, direto no navegador.
 *
 * Plataformas como o Kwai recusam vídeos com áudio abaixo de 64 kbps. Isso acontece
 * muito com trilhas silenciosas ou muito comprimidas: o AAC gasta poucos bytes.
 * Aqui cada quadro de áudio AAC recebe bytes de preenchimento até atingir o bitrate
 * escolhido. O som e a imagem não são recodificados (ficam idênticos); só o arquivo
 * é reorganizado. Vídeos sem áudio podem ganhar uma faixa AAC silenciosa.
 */
(function (root) {
  'use strict';

  var SUPPORTED = /\.(mp4|mov|m4v)$/i;
  var CONTAINERS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 1, dinf: 1, udta: 1, mvex: 1 };
  // Quadro AAC-LC estéreo totalmente silencioso (gerado por um codificador AAC)
  var SILENT_FRAME = [0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c];
  var SILENT_RATE = 44100, SILENT_CONFIG = [0x12, 0x10]; // AAC-LC, 44,1 kHz, 2 canais

  function AudioFixError(message) { this.name = 'AudioFixError'; this.message = message; }
  AudioFixError.prototype = Object.create(Error.prototype);
  function fail(message) { throw new AudioFixError(message); }

  function readBytes(blob, start, end) {
    var part = blob.slice(start, end);
    if (part.arrayBuffer) return part.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(new Uint8Array(r.result)); }; r.onerror = no; r.readAsArrayBuffer(part); });
  }
  function u32(u8, p) { return ((u8[p] << 24) >>> 0) + (u8[p + 1] << 16) + (u8[p + 2] << 8) + u8[p + 3]; }
  function u64(u8, p) { return u32(u8, p) * 0x100000000 + u32(u8, p + 4); }
  function u16(u8, p) { return (u8[p] << 8) | u8[p + 1]; }
  function type4(u8, p) { return String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]); }

  // Caixas do topo do arquivo, lendo só os cabeçalhos
  async function scanTop(file) {
    var boxes = [], pos = 0;
    while (pos + 8 <= file.size) {
      var head = await readBytes(file, pos, Math.min(file.size, pos + 16));
      var size = u32(head, 0), type = type4(head, 4), hdr = 8;
      if (size === 1) { if (head.length < 16) break; size = u64(head, 8); hdr = 16; }
      else if (size === 0) size = file.size - pos;
      if (size < hdr || pos + size > file.size) {
        if (type === 'mdat') { size = file.size - pos; } else fail('O arquivo parece incompleto ou corrompido.');
      }
      boxes.push({ type: type, start: pos, size: size, hdr: hdr });
      pos += size;
    }
    return boxes;
  }

  function parse(u8, start, end) {
    var out = [], pos = start;
    while (pos + 8 <= end) {
      var size = u32(u8, pos), type = type4(u8, pos + 4), hdr = 8;
      if (size === 1) { size = u64(u8, pos + 8); hdr = 16; } else if (size === 0) size = end - pos;
      if (size < hdr || pos + size > end) fail('O índice do vídeo (moov) está corrompido.');
      var node = { type: type, start: pos, size: size, hdr: hdr };
      if (CONTAINERS[type]) node.children = parse(u8, pos + hdr, pos + size);
      out.push(node);
      pos += size;
    }
    return out;
  }
  function child(node, type) { return (node.children || []).find(function (c) { return c.type === type; }); }
  function path(node, types) { for (var i = 0; i < types.length && node; i++) node = child(node, types[i]); return node; }

  // ------------------------------------------------------------ leitura das tabelas
  var MAX_SAMPLES = 20000000;
  function readTrack(u8, trak, fileSize) {
    var mdia = child(trak, 'mdia'), stbl = path(trak, ['mdia', 'minf', 'stbl']);
    if (!mdia || !stbl) return null;
    var hdlr = child(mdia, 'hdlr'), mdhd = child(mdia, 'mdhd');
    var t = { trak: trak, stbl: stbl, handler: hdlr ? type4(u8, hdlr.start + hdlr.hdr + 8) : '' };
    if (mdhd) {
      var p = mdhd.start + mdhd.hdr, v = u8[p];
      t.timescale = v === 1 ? u32(u8, p + 20) : u32(u8, p + 12);
      t.duration = v === 1 ? u64(u8, p + 24) : u32(u8, p + 16);
    }
    var stsz = child(stbl, 'stsz'), stz2 = child(stbl, 'stz2'), stsc = child(stbl, 'stsc');
    var stco = child(stbl, 'stco'), co64 = child(stbl, 'co64'), stts = child(stbl, 'stts'), stsd = child(stbl, 'stsd');
    if (!stsc || !(stco || co64) || !(stsz || stz2)) return t; // trilha sem amostras
    t.stsd = stsd;
    // tamanhos das amostras
    var sizes = [];
    if (stsz) {
      var b = stsz.start + stsz.hdr, fixed = u32(u8, b + 4), count = u32(u8, b + 8);
      if ((!fixed && b + 12 + count * 4 > stsz.start + stsz.size) || count > MAX_SAMPLES || fixed * count > fileSize) fail('Tabela de amostras incompleta.');
      for (var i = 0; i < count; i++) sizes.push(fixed || u32(u8, b + 12 + i * 4));
    } else {
      var b2 = stz2.start + stz2.hdr, field = u8[b2 + 7], n2 = u32(u8, b2 + 8), q = b2 + 12;
      if (q + Math.ceil(n2 * field / 8) > stz2.start + stz2.size || [4, 8, 16].indexOf(field) < 0) fail('Tabela de amostras incompleta.');
      for (var j = 0; j < n2; j++) {
        if (field === 16) sizes.push(u16(u8, q + j * 2));
        else if (field === 8) sizes.push(u8[q + j]);
        else sizes.push(j % 2 ? u8[q + (j >> 1)] & 15 : u8[q + (j >> 1)] >> 4);
      }
    }
    // posições dos blocos (chunks)
    var offsets = [], ob = (stco || co64).start + (stco || co64).hdr, oc = u32(u8, ob + 4);
    if (ob + 8 + oc * (stco ? 4 : 8) > (stco || co64).start + (stco || co64).size) fail('Tabela de blocos incompleta.');
    for (var k = 0; k < oc; k++) offsets.push(stco ? u32(u8, ob + 8 + k * 4) : u64(u8, ob + 8 + k * 8));
    // quantas amostras por bloco
    var sb = stsc.start + stsc.hdr, sc = u32(u8, sb + 4), entries = [];
    if (sb + 8 + sc * 12 > stsc.start + stsc.size) fail('Tabela de blocos incompleta.');
    for (var e = 0; e < sc; e++) entries.push([u32(u8, sb + 8 + e * 12), u32(u8, sb + 12 + e * 12)]);
    var perChunk = [], x = 0, spc = 0, assigned = 0;
    for (var c = 0; c < offsets.length; c++) {
      while (x < entries.length && entries[x][0] <= c + 1) { spc = entries[x][1]; x++; }
      perChunk.push(spc);
      assigned += spc;
    }
    if (assigned > sizes.length) fail('As tabelas do vídeo não batem (mais amostras do que existem).');
    // duração de cada amostra
    var deltas = [];
    if (stts) {
      var tb = stts.start + stts.hdr, tc = u32(u8, tb + 4);
      if (tb + 8 + tc * 8 > stts.start + stts.size) fail('Tabela de tempos incompleta.');
      for (var s = 0; s < tc && deltas.length < sizes.length; s++) {
        var cnt = u32(u8, tb + 8 + s * 8), d = u32(u8, tb + 12 + s * 8);
        for (var r = 0; r < cnt && deltas.length < sizes.length; r++) deltas.push(d);
      }
    }
    t.sizes = sizes; t.offsets = offsets; t.perChunk = perChunk; t.deltas = deltas;
    if (!t.duration) t.duration = deltas.reduce(function (a, b3) { return a + b3; }, 0);
    // blocos com o intervalo de bytes no arquivo
    t.chunks = []; var si = 0;
    for (var ci = 0; ci < offsets.length; ci++) {
      var len = 0;
      for (var m = 0; m < perChunk[ci]; m++) len += sizes[si + m] || 0;
      t.chunks.push({ track: t, index: ci, offset: offsets[ci], size: len, first: si, count: perChunk[ci] });
      si += perChunk[ci];
    }
    return t;
  }

  // Encontra a configuração AAC (esds) dentro da descrição de áudio
  function findEsds(u8, stsd) {
    if (!stsd) return null;
    var start = stsd.start + stsd.hdr + 8, end = stsd.start + stsd.size;
    if (start + 8 > end) return null;
    var entryType = type4(u8, start + 4);
    for (var p = start + 8; p + 4 <= end; p++) {
      if (u8[p] === 0x65 && u8[p + 1] === 0x73 && u8[p + 2] === 0x64 && u8[p + 3] === 0x73) { // 'esds'
        var size = u32(u8, p - 4);
        if (size < 12 || p - 4 + size > end) continue;
        var info = parseEsds(u8, p - 4 + 12, p - 4 + size);
        if (info) { info.entryType = entryType; return info; }
      }
    }
    return { entryType: entryType };
  }
  function descLen(u8, p) { var len = 0, i = 0, b; do { b = u8[p + i]; len = (len << 7) | (b & 0x7f); i++; } while (b & 0x80 && i < 4); return { len: len, bytes: i }; }
  function parseEsds(u8, p, end) {
    if (u8[p] !== 0x03) return null;
    var l = descLen(u8, p + 1); p += 1 + l.bytes;
    var flags = u8[p + 2]; p += 3;
    if (flags & 0x80) p += 2;
    if (flags & 0x40) p += 1 + u8[p];
    if (flags & 0x20) p += 2;
    if (p >= end || u8[p] !== 0x04) return null;
    var l2 = descLen(u8, p + 1), q = p + 1 + l2.bytes;
    return { objectType: u8[q], maxPos: q + 5, avgPos: q + 9, maxBitrate: u32(u8, q + 5), avgBitrate: u32(u8, q + 9) };
  }

  // ------------------------------------------------------------ escrita
  function box(type, parts) {
    var len = 8; parts.forEach(function (x) { len += x.length; });
    var out = new Uint8Array(len), dv = new DataView(out.buffer);
    dv.setUint32(0, len); for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    var p = 8; parts.forEach(function (x) { out.set(x, p); p += x.length; });
    return out;
  }
  function bytes(n) { return new Uint8Array(n); }
  function be(values, widths) {
    var len = widths.reduce(function (a, b) { return a + b; }, 0), out = new Uint8Array(len), dv = new DataView(out.buffer), p = 0;
    values.forEach(function (v, i) {
      var w = widths[i];
      if (w === 1) dv.setUint8(p, v); else if (w === 2) dv.setUint16(p, v); else if (w === 4) dv.setUint32(p, v >>> 0);
      else if (w === 8) { dv.setUint32(p, Math.floor(v / 0x100000000)); dv.setUint32(p + 4, v % 0x100000000); }
      p += w;
    });
    return out;
  }
  function str(s) { var out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

  function stszBox(sizes) {
    var body = new Uint8Array(12 + sizes.length * 4), dv = new DataView(body.buffer);
    dv.setUint32(8, sizes.length);
    sizes.forEach(function (s, i) { dv.setUint32(12 + i * 4, s); });
    return box('stsz', [body]);
  }
  function offsetsBox(offsets, wide) {
    var w = wide ? 8 : 4, body = new Uint8Array(8 + offsets.length * w), dv = new DataView(body.buffer);
    dv.setUint32(4, offsets.length);
    offsets.forEach(function (o, i) {
      if (wide) { dv.setUint32(8 + i * 8, Math.floor(o / 0x100000000)); dv.setUint32(12 + i * 8, o % 0x100000000); }
      else dv.setUint32(8 + i * 4, o);
    });
    return box(wide ? 'co64' : 'stco', [body]);
  }

  // Monta uma faixa AAC silenciosa completa (trak)
  function silentTrak(trackId, movieTimescale, movieDuration, frames, chunkFrames, frameBytes, bitrate) {
    var mediaDuration = frames * 1024;
    var tkhd = box('tkhd', [be([0, 3], [1, 3]), bytes(8), be([trackId, 0, movieDuration], [4, 4, 4]), bytes(8), be([0, 0, 0x0100, 0], [2, 2, 2, 2]),
      be([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000], [4, 4, 4, 4, 4, 4, 4, 4, 4]), be([0, 0], [4, 4])]);
    var mdhd = box('mdhd', [bytes(4), bytes(8), be([SILENT_RATE, mediaDuration, 0x55c4, 0], [4, 4, 2, 2])]);
    var hdlr = box('hdlr', [bytes(4), bytes(4), str('soun'), bytes(12), str('SoundHandler'), bytes(1)]);
    var smhd = box('smhd', [bytes(4), bytes(4)]);
    var dinf = box('dinf', [box('dref', [bytes(4), be([1], [4]), box('url ', [be([0, 1], [1, 3])])])]);
    var dsi = SILENT_CONFIG;
    var dec = [0x04, 13 + 2 + dsi.length, 0x40, 0x15, 0, 0x18, 0].concat(Array.from(be([bitrate, bitrate], [4, 4])), [0x05, dsi.length], dsi);
    var es = [0x03, 3 + dec.length + 3, 0, 0, 0].concat(dec, [0x06, 1, 0x02]);
    var esds = box('esds', [bytes(4), new Uint8Array(es)]);
    var mp4a = box('mp4a', [bytes(6), be([1], [2]), bytes(8), be([2, 16, 0, 0, SILENT_RATE * 65536], [2, 2, 2, 2, 4]), esds]);
    var stsd = box('stsd', [bytes(4), be([1], [4]), mp4a]);
    var stts = box('stts', [bytes(4), be([1, frames, 1024], [4, 4, 4])]);
    var chunks = Math.ceil(frames / chunkFrames), last = frames - (chunks - 1) * chunkFrames;
    var stscEntries = last === chunkFrames || chunks === 1 ? [[1, chunks === 1 ? frames : chunkFrames]] : [[1, chunkFrames], [chunks, last]];
    var stscBody = [bytes(4), be([stscEntries.length], [4])];
    stscEntries.forEach(function (e) { stscBody.push(be([e[0], e[1], 1], [4, 4, 4])); });
    var stsc = box('stsc', stscBody);
    var sizes = []; for (var i = 0; i < frames; i++) sizes.push(frameBytes);
    return {
      chunks: chunks, chunkFrames: chunkFrames, frames: frames, sizes: sizes,
      build: function (offsets, wide) {
        var stbl = box('stbl', [stsd, stts, stsc, stszBox(sizes), offsetsBox(offsets, wide)]);
        return box('trak', [tkhd, box('mdia', [mdhd, hdlr, box('minf', [smhd, dinf, stbl])])]);
      },
    };
  }

  // ------------------------------------------------------------ principal
  // options: { targetKbps: 128, addSilent: true }
  async function fix(file, options) {
    options = options || {};
    var target = Math.max(64, options.targetKbps || 128) * 1000;
    var top = await scanTop(file);
    var moovBox = top.find(function (b) { return b.type === 'moov'; });
    if (!moovBox) fail('Não encontrei o índice do vídeo (moov). O arquivo pode estar incompleto.');
    if (top.some(function (b) { return b.type === 'moof'; })) fail('Este vídeo está em formato fragmentado, que esta ferramenta ainda não ajusta. Exporte de novo como MP4 comum.');
    if (moovBox.size > 200 * 1024 * 1024) fail('O índice deste vídeo é grande demais.');
    var u8 = await readBytes(file, moovBox.start, moovBox.start + moovBox.size);
    var moov = parse(u8, 0, u8.length)[0];
    var mvhd = child(moov, 'mvhd');
    if (!mvhd) fail('O índice do vídeo está incompleto (sem mvhd).');
    var mv = mvhd.start + mvhd.hdr, mvVersion = u8[mv];
    var movieTimescale = mvVersion === 1 ? u32(u8, mv + 20) : u32(u8, mv + 12);
    var movieDuration = mvVersion === 1 ? u64(u8, mv + 24) : u32(u8, mv + 16);
    var nextIdPos = mvhd.start + mvhd.size - 4;

    var tracks = moov.children.filter(function (c) { return c.type === 'trak'; }).map(function (t) { return readTrack(u8, t, file.size); }).filter(Boolean);
    var audio = tracks.filter(function (t) { return t.handler === 'soun' && t.sizes && t.sizes.length; });
    var report = { tracks: [], addedSilent: false, changed: false };

    // Decide o que fazer com cada faixa de áudio
    audio.forEach(function (t) {
      var seconds = t.duration / (t.timescale || 1);
      if (!t.timescale) fail('O índice do áudio está corrompido.');
      var total = t.sizes.reduce(function (a, b) { return a + b; }, 0);
      var before = seconds > 0 ? total * 8 / seconds : 0;
      var esds = findEsds(u8, t.stsd);
      var codec = esds && esds.entryType;
      if (esds && esds.entryType === 'mp4a' && (esds.objectType === 0x6B || esds.objectType === 0x69)) codec = 'MP3';
      else if (codec === 'ac-3' || codec === 'ec-3') codec = 'Dolby ' + codec.toUpperCase();
      else if (codec === 'Opus') codec = 'Opus';
      var info = { before: before, after: before, codec: codec };
      report.tracks.push(info);
      if (!esds || esds.entryType !== 'mp4a' || esds.objectType !== 0x40) {
        info.unsupported = true;
        return;
      }
      if (before >= target) return;
      t.esds = esds;
      var newSizes = t.sizes.map(function (s, i) {
        var d = t.deltas[i] || t.deltas[t.deltas.length - 1] || 1024;
        var need = Math.ceil(target / 8 * d / t.timescale) + 1;
        return s < need ? need : s;
      });
      t.newSizes = newSizes;
      var newTotal = newSizes.reduce(function (a, b) { return a + b; }, 0);
      info.after = newTotal * 8 / seconds;
      report.changed = true;
    });
    if (audio.length && report.tracks.every(function (x) { return x.unsupported; })) {
      fail('O áudio deste vídeo não está em AAC (' + (report.tracks[0].codec || 'formato desconhecido') + '). Exporte o vídeo de novo com áudio AAC.');
    }

    // Sem áudio: cria uma faixa silenciosa
    var silent = null;
    if (!audio.length && options.addSilent !== false) {
      var seconds = movieDuration / (movieTimescale || 1);
      if (!seconds) {
        var v = tracks.find(function (t) { return t.handler === 'vide'; });
        seconds = v ? v.duration / (v.timescale || 1) : 0;
        if (!movieDuration && movieTimescale) movieDuration = Math.round(seconds * movieTimescale);
      }
      if (!seconds || seconds > 6 * 3600) fail('Não consegui descobrir a duração do vídeo para criar o áudio.');
      var frames = Math.ceil(seconds * SILENT_RATE / 1024);
      var frameBytes = Math.ceil(target / 8 * 1024 / SILENT_RATE) + 1;
      var nextId = u32(u8, nextIdPos);
      if (!nextId || nextId === 0xFFFFFFFF) nextId = tracks.length + 1;
      silent = silentTrak(nextId, movieTimescale, movieDuration, frames, 43, frameBytes, target);
      silent.trackId = nextId;
      report.addedSilent = true; report.changed = true;
      report.tracks.push({ before: 0, after: frameBytes * 8 * SILENT_RATE / 1024, silent: true });
    }
    if (!report.changed) { report.output = file; report.outputSize = file.size; return report; }

    // Ordem original dos blocos de todas as faixas (mantém o entrelaçamento)
    var all = [];
    tracks.forEach(function (t) { (t.chunks || []).forEach(function (c) { all.push(c); }); });
    all.sort(function (a, b) { return a.offset - b.offset || 0; });
    all.forEach(function (c) {
      if (c.offset + c.size > file.size) fail('O vídeo está incompleto: faltam dados no fim do arquivo.');
      if (c.track.newSizes) {
        var n = 0; for (var i = 0; i < c.count; i++) n += c.track.newSizes[c.first + i];
        c.newSize = n;
      } else c.newSize = c.size;
    });
    var dataSize = all.reduce(function (s, c) { return s + c.newSize; }, 0);
    if (silent) dataSize += silent.sizes.reduce(function (a, b) { return a + b; }, 0);

    var ftyp = top.find(function (b) { return b.type === 'ftyp'; });
    var ftypBytes = ftyp ? await readBytes(file, ftyp.start, ftyp.start + ftyp.size) : new Uint8Array(0);

    // Monta o moov; primeiro com posições zeradas, para saber o tamanho
    function buildMoov(wide, newOffsets, silentOffsets) {
      function serialize(node) {
        if (node.type === 'stco' || node.type === 'co64') return offsetsBox(newOffsets.get(node) || [], wide);
        if ((node.type === 'stsz' || node.type === 'stz2') && node.newSizes) return stszBox(node.newSizes);
        if (node.type === 'stsd' && node.esds) {
          var copy = u8.slice(node.start, node.start + node.size), dv = new DataView(copy.buffer);
          dv.setUint32(node.esds.maxPos - node.start, Math.max(node.esds.maxBitrate, target));
          dv.setUint32(node.esds.avgPos - node.start, target);
          return copy;
        }
        if (node.type === 'mvhd' && silent) {
          var m = u8.slice(node.start, node.start + node.size);
          new DataView(m.buffer).setUint32(m.length - 4, silent.trackId + 1);
          return m;
        }
        if (!node.children) return u8.subarray(node.start, node.start + node.size);
        var parts = node.children.map(serialize);
        if (node === moov && silent) parts.push(silent.build(silentOffsets, wide));
        return box(node.type, parts);
      }
      return serialize(moov);
    }
    // marca os nós que mudam
    var offsetNodes = new Map();
    tracks.forEach(function (t) {
      if (!t.chunks) return;
      var node = child(t.stbl, 'stco') || child(t.stbl, 'co64');
      offsetNodes.set(node, t);
      if (t.newSizes) { (child(t.stbl, 'stsz') || child(t.stbl, 'stz2')).newSizes = t.newSizes; if (t.stsd) t.stsd.esds = t.esds; }
    });
    function offsetMap(fill) {
      var map = new Map();
      offsetNodes.forEach(function (t, node) { map.set(node, t.chunks.map(function (c) { return fill ? c.newOffset : 0; })); });
      return map;
    }
    var zeroSilent = silent ? new Array(silent.chunks).fill(0) : [];
    var wide = false;
    var moovLen = buildMoov(false, offsetMap(false), zeroSilent).length;
    var bigData = dataSize + 16 > 0xFFFFFFFF;
    var mdatHdr = bigData ? 16 : 8;
    if (ftypBytes.length + moovLen + mdatHdr + dataSize > 0xFFFFFFFF) { wide = true; moovLen = buildMoov(true, offsetMap(false), zeroSilent).length; }
    var pos = ftypBytes.length + moovLen + mdatHdr;
    all.forEach(function (c) { c.newOffset = pos; pos += c.newSize; });
    var silentOffsets = [];
    if (silent) for (var sc = 0; sc < silent.chunks; sc++) {
      silentOffsets.push(pos);
      var cnt = Math.min(silent.chunkFrames, silent.frames - sc * silent.chunkFrames);
      pos += cnt * silent.sizes[0];
    }
    var moovOut = buildMoov(wide, offsetMap(true), silentOffsets);
    if (moovOut.length !== moovLen) fail('Erro interno ao montar o índice do vídeo.');

    // Dados: copia cada bloco; nos de áudio, acrescenta o preenchimento a cada quadro
    var parts = [ftypBytes, moovOut];
    var mdatHead = bigData ? be([1, 0x6d646174, dataSize + 16], [4, 4, 8]) : be([dataSize + 8, 0x6d646174], [4, 4]);
    parts.push(mdatHead);
    var zeros = new Uint8Array(4096);
    function pad(n) { while (n > 0) { var k = Math.min(n, zeros.length); parts.push(zeros.subarray(0, k)); n -= k; } }
    all.forEach(function (c) {
      if (!c.track.newSizes) { parts.push(file.slice(c.offset, c.offset + c.size)); return; }
      var p = c.offset;
      for (var i = 0; i < c.count; i++) {
        var s = c.track.sizes[c.first + i], ns = c.track.newSizes[c.first + i];
        parts.push(file.slice(p, p + s)); pad(ns - s); p += s;
      }
    });
    if (silent) {
      var frame = new Uint8Array(silent.sizes[0]); frame.set(SILENT_FRAME, 0);
      for (var f = 0; f < silent.frames; f++) parts.push(frame);
    }
    var out = new Blob(parts, { type: file.type || 'video/mp4' });
    if (out.size !== pos) fail('Erro interno: o tamanho do arquivo final não confere.');
    report.output = out; report.outputSize = out.size;
    return report;
  }

  var api = { fix: fix, AudioFixError: AudioFixError, SUPPORTED: SUPPORTED, _scanTop: scanTop };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AjustaAudio = api;
})(typeof self !== 'undefined' ? self : this);
