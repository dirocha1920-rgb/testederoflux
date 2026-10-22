/*
 * Limpador de metadados de MP4/MOV que roda no navegador (sem servidor).
 *
 * Como funciona: o arquivo MP4/MOV é uma sequência de "caixas" (boxes). Os dados
 * de imagem e som ficam na caixa "mdat"; o índice fica na "moov". Os metadados
 * pessoais ficam em caixas próprias (udta, meta, uuid/XMP) e em faixas extras de
 * metadados (localização do iPhone, GPS da GoPro, timecode). Este código:
 *   1. reescreve a "moov" sem essas caixas e faixas, e zera as datas internas;
 *   2. apaga (zera) os bytes das faixas removidas dentro da "mdat";
 *   3. corrige os endereços (stco/co64) se a "moov" mudou de tamanho antes da mídia;
 *   4. NÃO recodifica: imagem e som saem idênticos, bit a bit.
 * A "mdat" nunca é carregada inteira na memória: o resultado é montado com
 * fatias do arquivo original (Blob.slice), então funciona com arquivos grandes.
 */
(function (root) {
  'use strict';

  class CleanError extends Error {}
  const fail = (message) => { throw new CleanError(message); };

  // Caixas que agrupam outras caixas e que precisamos percorrer
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex']);
  // Caixas removidas onde aparecerem dentro da moov (metadados e sobras)
  const DROP_INSIDE = new Set(['udta', 'meta', 'uuid', 'free', 'skip', 'wide', 'XMP_', 'Xtra', 'cprt']);
  // Faixas removidas inteiras (pelo tipo de handler)
  const DROP_HANDLERS = { meta: 'Faixa de metadados (localização/sensores)', tmcd: 'Faixa de horário (timecode)', camm: 'Faixa de sensores da câmera' };
  // Caixas de topo que seguem para o arquivo limpo
  const KEEP_TOP = new Set(['ftyp', 'moov', 'mdat']);

  const LABELS = {
    '©xyz': 'Localização (GPS)', loci: 'Localização (GPS)', '©mak': 'Fabricante', '©mod': 'Modelo do aparelho',
    '©day': 'Data de gravação', '©nam': 'Título', '©ART': 'Autor', '©aut': 'Autor', '©cmt': 'Comentário',
    '©des': 'Descrição', '©too': 'Programa usado', '©swr': 'Programa usado', '©enc': 'Programa usado',
    '©fmt': 'Formato de origem', '©inf': 'Informações', '©req': 'Requisitos', '©src': 'Origem',
    '©prd': 'Produtor', '©cpy': 'Direitos autorais', cprt: 'Direitos autorais', XMP_: 'Metadados XMP',
    Xtra: 'Metadados do Windows', desc: 'Descrição', titl: 'Título', auth: 'Autor', albm: 'Álbum',
    yrrc: 'Ano', kywd: 'Palavras-chave', manu: 'Fabricante', modl: 'Modelo do aparelho', smta: 'Metadados Samsung',
    'com.apple.quicktime.location.ISO6709': 'Localização (GPS)',
    'com.apple.quicktime.location.accuracy.horizontal': 'Precisão da localização',
    'com.apple.quicktime.make': 'Fabricante', 'com.apple.quicktime.model': 'Modelo do aparelho',
    'com.apple.quicktime.software': 'Versão do sistema', 'com.apple.quicktime.creationdate': 'Data de gravação',
    'com.apple.quicktime.content.identifier': 'Identificador do conteúdo', 'com.apple.quicktime.author': 'Autor',
    'com.apple.quicktime.title': 'Título', 'com.apple.quicktime.description': 'Descrição',
    'com.apple.quicktime.comment': 'Comentário', 'com.android.version': 'Versão do Android',
    'com.android.capture.fps': 'Taxa de captura', 'com.android.manufacturer': 'Fabricante', 'com.android.model': 'Modelo do aparelho',
    // Nomes simples (gravados por programas como FFmpeg, CapCut, editores)
    title: 'Título', artist: 'Autor', author: 'Autor', comment: 'Comentário', description: 'Descrição',
    location: 'Localização (GPS)', 'location-eng': 'Localização (GPS)', creation_time: 'Data de gravação', date: 'Data de gravação',
    make: 'Fabricante', model: 'Modelo do aparelho', encoder: 'Programa usado', copyright: 'Direitos autorais',
    album: 'Álbum', genre: 'Gênero', keywords: 'Palavras-chave', software: 'Programa usado',
  };
  const SENSITIVE_VALUE = new Set(['Localização (GPS)', 'Modelo do aparelho', 'Fabricante', 'Data de gravação', 'Versão do sistema', 'Versão do Android']);

  // ------------------------------------------------------------------ leitura
  const fourcc = (u8, off) => String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
  const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  async function readBytes(blob, start, end) {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }

  async function scanTop(file) {
    const boxes = [];
    let pos = 0;
    const length = file.size;
    while (pos < length) {
      if (length - pos < 8) {
        // Alguns programas deixam bytes soltos no fim; se forem zeros, ignora.
        const tail = await readBytes(file, pos, length);
        if (tail.every((b) => b === 0)) break;
        fail('O arquivo termina no meio de uma estrutura (parece incompleto ou corrompido).');
      }
      const head = await readBytes(file, pos, Math.min(pos + 16, length));
      const dv = view(head);
      let size = dv.getUint32(0);
      const type = fourcc(head, 4);
      let header = 8;
      if (size === 1) {
        if (head.length < 16) fail('Estrutura do arquivo inválida.');
        size = Number(dv.getBigUint64(8));
        header = 16;
      } else if (size === 0) {
        size = length - pos;
      }
      if (size < header || pos + size > length) fail('Estrutura do arquivo inválida (parece incompleto ou corrompido).');
      boxes.push({ type, start: pos, size, header });
      pos += size;
    }
    return boxes;
  }

  function parseChildren(u8, start, end, lenient) {
    const out = [];
    const dv = view(u8);
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p);
      const type = fourcc(u8, p + 4);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) { if (lenient) break; fail('Estrutura interna inválida.'); }
        size = Number(dv.getBigUint64(p + 8));
        header = 16;
      } else if (size === 0) {
        if (type === '\0\0\0\0' && lenient) break; // terminador do QuickTime
        size = end - p;
      }
      if (size < header || p + size > end) { if (lenient) break; fail('Estrutura interna do vídeo inválida.'); }
      const node = { type, start: p, size, header };
      if (CONTAINERS.has(type)) node.children = parseChildren(u8, p + header, p + size, lenient);
      out.push(node);
      p += size;
    }
    return out;
  }

  const child = (node, type) => (node.children || []).find((c) => c.type === type);
  const children = (node, type) => (node.children || []).filter((c) => c.type === type);

  function handlerOf(u8, trak) {
    const mdia = child(trak, 'mdia');
    const hdlr = mdia && child(mdia, 'hdlr');
    if (!hdlr || hdlr.size < hdlr.header + 12) return '';
    return fourcc(u8, hdlr.start + hdlr.header + 8);
  }

  function trackId(u8, trak) {
    const tkhd = child(trak, 'tkhd');
    if (!tkhd) return -1;
    const base = tkhd.start + tkhd.header;
    const version = u8[base];
    return view(u8).getUint32(base + 4 + (version === 1 ? 16 : 8));
  }

  // ---------------------------------------------------- relatório (o que havia)
  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('latin1').decode(bytes); }
  }

  function cleanValue(text) {
    // eslint-disable-next-line no-control-regex
    const value = text.replace(/[\u0000-\u001f]/g, '').trim();
    return value.length > 80 ? value.slice(0, 80) + '…' : value;
  }

  function describeUdta(u8, node, found) {
    for (const item of parseChildren(u8, node.start + node.header, node.start + node.size, true)) {
      if (item.type === 'meta') { describeMeta(u8, item, found); continue; }
      const label = LABELS[item.type] || (item.type.charCodeAt(0) === 0xa9 ? 'Metadado de texto (' + item.type.slice(1) + ')' : null);
      if (!label) { found.push({ label: 'Dados extras (' + item.type.replace(/[^\x20-\x7e©]/g, '?') + ')' }); continue; }
      let value = '';
      // Texto do QuickTime: [tamanho 2][idioma 2][texto]
      const body = u8.subarray(item.start + item.header, item.start + item.size);
      if (item.type.charCodeAt(0) === 0xa9 && body.length > 4) {
        const len = view(body).getUint16(0);
        if (len > 0 && len + 4 <= body.length) value = cleanValue(decodeText(body.subarray(4, 4 + len)));
      }
      found.push({ label, value: SENSITIVE_VALUE.has(label) ? value : '' });
    }
  }

  function describeMeta(u8, node, found) {
    // "meta" pode ter (ISO) ou não ter (QuickTime) 4 bytes de versão antes das filhas.
    let start = node.start + node.header;
    const firstType = fourcc(u8, start + 4);
    if (!/^[a-zA-Z©]{4}$/.test(firstType) || view(u8).getUint32(start) === 0) start += 4;
    const kids = parseChildren(u8, start, node.start + node.size, true);
    const keysBox = kids.find((k) => k.type === 'keys');
    const ilst = kids.find((k) => k.type === 'ilst');
    const keyNames = [];
    if (keysBox) {
      const dv = view(u8);
      let p = keysBox.start + keysBox.header + 8; // versão/flags + quantidade
      const end = keysBox.start + keysBox.size;
      while (p + 8 <= end) {
        const size = dv.getUint32(p);
        if (size < 8 || p + size > end) break;
        keyNames.push(new TextDecoder('latin1').decode(u8.subarray(p + 8, p + size)));
        p += size;
      }
    }
    if (ilst) {
      for (const item of parseChildren(u8, ilst.start + ilst.header, ilst.start + ilst.size, true)) {
        const index = view(u8).getUint32(item.start + 4);
        const name = keyNames.length && index >= 1 && index <= keyNames.length ? keyNames[index - 1] : item.type;
        const label = LABELS[name] || (name.charCodeAt(0) === 0xa9 ? 'Metadado de texto (' + name.slice(1) + ')' : 'Metadado (' + name + ')');
        let value = '';
        const data = parseChildren(u8, item.start + item.header, item.start + item.size, true).find((d) => d.type === 'data');
        if (data && data.size > data.header + 8) {
          const kind = view(u8).getUint32(data.start + data.header) & 0xffffff;
          if (kind === 1) value = cleanValue(decodeText(u8.subarray(data.start + data.header + 8, data.start + data.size)));
        }
        found.push({ label, value: SENSITIVE_VALUE.has(label) ? value : '' });
      }
    } else if (keyNames.length) {
      keyNames.forEach((name) => found.push({ label: LABELS[name] || 'Metadado (' + name + ')' }));
    }
  }

  function hasNonZeroTimes(u8, node) {
    const base = node.start + node.header;
    const version = u8[base];
    const span = version === 1 ? 16 : 8;
    for (let i = base + 4; i < base + 4 + span; i++) if (u8[i] !== 0) return true;
    return false;
  }

  // ---------------------------------------------- faixas removidas: onde estão
  // A quantidade de entradas precisa caber na caixa (protege contra arquivos corrompidos).
  function checkCount(box, count, entryBytes, prefix) {
    if (box.header + prefix + count * entryBytes > box.size) fail('O índice deste vídeo está corrompido.');
  }

  function readOffsets(u8, box) {
    const dv = view(u8);
    const base = box.start + box.header;
    const count = dv.getUint32(base + 4);
    const wide = box.type === 'co64';
    checkCount(box, count, wide ? 8 : 4, 8);
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = wide ? Number(dv.getBigUint64(base + 8 + i * 8)) : dv.getUint32(base + 8 + i * 4);
    return out;
  }

  function sampleSizes(u8, stbl) {
    const dv = view(u8);
    const stsz = child(stbl, 'stsz');
    if (stsz) {
      const base = stsz.start + stsz.header;
      const fixed = dv.getUint32(base + 4);
      const count = dv.getUint32(base + 8);
      if (count > 50000000) fail('O índice deste vídeo está corrompido.');
      if (fixed) return new Array(count).fill(fixed);
      checkCount(stsz, count, 4, 12);
      return Array.from({ length: count }, (_, i) => dv.getUint32(base + 12 + i * 4));
    }
    const stz2 = child(stbl, 'stz2');
    if (stz2) {
      const base = stz2.start + stz2.header;
      const field = u8[base + 7];
      const count = dv.getUint32(base + 8);
      checkCount(stz2, Math.ceil(count * (field === 16 ? 2 : field === 8 ? 1 : 0.5)), 1, 12);
      const sizes = new Array(count);
      for (let i = 0; i < count; i++) {
        if (field === 16) sizes[i] = dv.getUint16(base + 12 + i * 2);
        else if (field === 8) sizes[i] = u8[base + 12 + i];
        else sizes[i] = (u8[base + 12 + (i >> 1)] >> ((i & 1) ? 0 : 4)) & 0xf;
      }
      return sizes;
    }
    return null;
  }

  function chunkRanges(u8, trak) {
    const stbl = child(child(child(trak, 'mdia') || {}, 'minf') || {}, 'stbl');
    if (!stbl) return null;
    const offsetBox = child(stbl, 'stco') || child(stbl, 'co64');
    const stsc = child(stbl, 'stsc');
    const sizes = sampleSizes(u8, stbl);
    if (!offsetBox || !stsc || !sizes) return null;
    const offsets = readOffsets(u8, offsetBox);
    const dv = view(u8);
    const base = stsc.start + stsc.header;
    const entries = [];
    const stscCount = dv.getUint32(base + 4);
    checkCount(stsc, stscCount, 12, 8);
    for (let i = 0; i < stscCount; i++) {
      entries.push({ first: dv.getUint32(base + 8 + i * 12), perChunk: dv.getUint32(base + 12 + i * 12) });
    }
    const ranges = [];
    let sample = 0;
    let entry = 0;
    for (let c = 1; c <= offsets.length; c++) {
      while (entry + 1 < entries.length && entries[entry + 1].first <= c) entry++;
      const perChunk = entries.length ? entries[entry].perChunk : 0;
      let length = 0;
      for (let s = 0; s < perChunk && sample < sizes.length; s++) length += sizes[sample++];
      if (length > 0) ranges.push([offsets[c - 1], offsets[c - 1] + length]);
    }
    return ranges;
  }

  // ---------------------------------------------------------- reescrita
  function writeBox(type, parts) {
    const bodyLength = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(8 + bodyLength);
    view(out).setUint32(0, 8 + bodyLength);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    let p = 8;
    for (const part of parts) { out.set(part, p); p += part.length; }
    return out;
  }

  const VIDEO_ENTRIES = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'mp4v', 'av01', 'vp09', 'apcn', 'apch', 'apcs', 'apco', 'ap4h', 'ap4x', 'jpeg', 'mjpa', 'mjpb', 'dvh1', 'dvhe', 's263', 'h263']);
  const AUDIO_ENTRIES = new Set(['mp4a', 'lpcm', 'sowt', 'twos', 'ac-3', 'ec-3', 'alac', 'Opus', 'fLaC', 'samr', 'sawb', 'ulaw', 'alaw', 'ima4', 'in24', 'in32', 'fl32', 'fl64']);

  // Apaga "fornecedor" e "nome do compressor" de cada formato (ex.: "appl", "Core Media Video").
  function scrubSampleEntries(bytes, header) {
    const dv = view(bytes);
    let p = header + 8; // versão/flags + quantidade
    while (p + 8 <= bytes.length) {
      const size = dv.getUint32(p);
      if (size < 8 || p + size > bytes.length) break;
      const type = fourcc(bytes, p + 4);
      if (VIDEO_ENTRIES.has(type) && size >= 82) { bytes.fill(0, p + 20, p + 24); bytes.fill(0, p + 50, p + 82); }
      else if (AUDIO_ENTRIES.has(type) && size >= 28) bytes.fill(0, p + 20, p + 24);
      p += size;
    }
  }

  // Apaga o nome do handler (ex.: "Core Media Video"), mantendo o tamanho da caixa.
  function scrubHandlerName(bytes, header) {
    if (bytes.length > header + 24) bytes.fill(0, header + 24);
  }

  function zeroTimes(bytes, header) {
    const version = bytes[header];
    bytes.fill(0, header + 4, header + 4 + (version === 1 ? 16 : 8));
  }

  function trefPointsTo(u8, tref, removedIds) {
    for (const ref of parseChildren(u8, tref.start + tref.header, tref.start + tref.size, true)) {
      for (let p = ref.start + ref.header; p + 4 <= ref.start + ref.size; p += 4) {
        if (removedIds.has(view(u8).getUint32(p))) return true;
      }
    }
    return false;
  }

  function serialize(u8, node, ctx) {
    if (!node.children) {
      const bytes = u8.slice(node.start, node.start + node.size);
      if (node.type === 'mvhd' || node.type === 'tkhd' || node.type === 'mdhd') zeroTimes(bytes, node.header);
      else if (node.type === 'stsd') scrubSampleEntries(bytes, node.header);
      else if (node.type === 'hdlr') scrubHandlerName(bytes, node.header);
      return bytes;
    }
    const parts = [];
    for (const c of node.children) {
      if (DROP_INSIDE.has(c.type)) continue;
      if (c.type === 'trak' && ctx.removedTraks.has(c)) continue;
      if (c.type === 'tref' && ctx.removedIds.size && trefPointsTo(u8, c, ctx.removedIds)) continue;
      parts.push(serialize(u8, c, ctx));
    }
    return writeBox(node.type, parts);
  }

  function patchOffsets(moovBytes, mapOffset) {
    const tree = parseChildren(moovBytes, 0, moovBytes.length, false)[0];
    const dv = view(moovBytes);
    for (const trak of children(tree, 'trak')) {
      const stbl = child(child(child(trak, 'mdia') || {}, 'minf') || {}, 'stbl');
      if (!stbl) continue;
      const box = child(stbl, 'stco') || child(stbl, 'co64');
      if (!box) continue;
      const base = box.start + box.header;
      const count = dv.getUint32(base + 4);
      checkCount(box, count, box.type === 'co64' ? 8 : 4, 8);
      for (let i = 0; i < count; i++) {
        if (box.type === 'co64') {
          const at = base + 8 + i * 8;
          dv.setBigUint64(at, BigInt(mapOffset(Number(dv.getBigUint64(at)))));
        } else {
          const at = base + 8 + i * 4;
          const next = mapOffset(dv.getUint32(at));
          if (next > 0xffffffff) fail('Endereço grande demais para este formato.');
          dv.setUint32(at, next);
        }
      }
    }
  }

  function mergeRanges(ranges) {
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  }

  // ------------------------------------------------------------------ API
  const SUPPORTED = /\.(mp4|mov|m4v|3gp|3g2|qt)$/i;

  async function clean(file, options) {
    const onProgress = (options && options.onProgress) || (() => {});
    if (!SUPPORTED.test(file.name || '')) {
      if (/\.(webm|mkv)$/i.test(file.name || '')) fail('WebM e MKV ainda não são aceitos nesta versão. Use MP4 ou MOV (o formato dos celulares).');
      fail('Formato não aceito. Use MP4, MOV, M4V ou 3GP.');
    }
    onProgress('lendo');
    const top = await scanTop(file);
    if (top.some((b) => b.type === 'moof' || b.type === 'mfra' || b.type === 'sidx')) {
      fail('Este vídeo está em formato fragmentado (comum em gravações de tela/streaming), que esta versão ainda não limpa.');
    }
    const moovs = top.filter((b) => b.type === 'moov');
    const mdats = top.filter((b) => b.type === 'mdat');
    if (moovs.length !== 1 || !mdats.length) fail('Não parece ser um vídeo MP4/MOV válido.');
    const moovBox = moovs[0];
    if (moovBox.size > 256 * 1024 * 1024) fail('O índice deste vídeo é grande demais para limpar no navegador.');

    const u8 = await readBytes(file, moovBox.start, moovBox.start + moovBox.size);
    const moov = parseChildren(u8, 0, u8.length, false)[0];

    // 1) O que existe de metadado
    const found = [];
    const walk = (node) => {
      for (const c of node.children || []) {
        if (c.type === 'udta') describeUdta(u8, c, found);
        else if (c.type === 'meta') describeMeta(u8, c, found);
        else if (c.type === 'uuid') found.push({ label: 'Metadados extras (XMP/uuid)' });
        else if (c.type === 'XMP_') found.push({ label: 'Metadados XMP' });
        else if (c.children) walk(c);
      }
    };
    walk(moov);
    for (const b of top) {
      if (b.type === 'uuid') found.push({ label: 'Metadados extras (XMP/uuid)' });
      else if (b.type === 'udta' || b.type === 'meta') found.push({ label: 'Metadados no início do arquivo' });
    }
    const timeBoxes = [];
    const collectTimes = (node) => (node.children || []).forEach((c) => {
      if (c.type === 'mvhd' || c.type === 'tkhd' || c.type === 'mdhd') timeBoxes.push(c);
      else if (c.children && c.type !== 'udta') collectTimes(c);
    });
    collectTimes(moov);
    if (timeBoxes.some((b) => hasNonZeroTimes(u8, b))) found.push({ label: 'Datas de criação internas' });

    // 2) Faixas a remover (localização/sensores/timecode)
    const ctx = { removedTraks: new Set(), removedIds: new Set() };
    const zeroRanges = [];
    let partialWipe = false;
    for (const trak of children(moov, 'trak')) {
      const handler = handlerOf(u8, trak);
      if (!DROP_HANDLERS[handler]) continue;
      ctx.removedTraks.add(trak);
      ctx.removedIds.add(trackId(u8, trak));
      found.push({ label: DROP_HANDLERS[handler] });
      try {
        const ranges = chunkRanges(u8, trak);
        if (ranges) zeroRanges.push(...ranges); else partialWipe = true;
      } catch { partialWipe = true; }
    }
    const remainingTracks = children(moov, 'trak').filter((t) => !ctx.removedTraks.has(t));
    if (!remainingTracks.some((t) => ['vide', 'soun'].includes(handlerOf(u8, t)))) fail('Não encontrei imagem nem som neste arquivo.');

    // 3) Nova moov e nova posição de cada caixa
    onProgress('limpando');
    const newMoov = serialize(u8, moov, ctx);
    const layout = [];
    let cursor = 0;
    for (const b of top) {
      if (!KEEP_TOP.has(b.type)) continue;
      const size = b.type === 'moov' ? newMoov.length : b.size;
      layout.push({ box: b, newStart: cursor });
      cursor += size;
    }
    const mapOffset = (old) => {
      for (const { box, newStart } of layout) {
        if (box.type === 'mdat' && old >= box.start + box.header && old <= box.start + box.size) return old + (newStart - box.start);
      }
      return fail('Os dados deste vídeo estão num lugar inesperado do arquivo; esta versão não consegue limpá-lo com segurança.');
    };
    patchOffsets(newMoov, mapOffset);

    // 4) Monta o arquivo limpo: fatias do original + nova moov + zeros nas faixas removidas
    const wipe = mergeRanges(zeroRanges);
    const parts = [];
    for (const { box } of layout) {
      if (box.type === 'moov') { parts.push(newMoov); continue; }
      if (box.type !== 'mdat') { parts.push(file.slice(box.start, box.start + box.size)); continue; }
      let p = box.start;
      const end = box.start + box.size;
      for (const [a, b] of wipe) {
        if (b <= p || a >= end) continue;
        const from = Math.max(a, p);
        const to = Math.min(b, end);
        if (from > p) parts.push(file.slice(p, from));
        parts.push(new Uint8Array(to - from));
        p = to;
      }
      if (p < end) parts.push(file.slice(p, end));
    }
    const type = /\.mov$|\.qt$/i.test(file.name) ? 'video/quicktime' : 'video/mp4';
    const output = new Blob(parts, { type });

    // 5) Conferência: relê o arquivo limpo e procura metadados de novo
    onProgress('conferindo');
    const check = await inspect(output);

    // Junta itens repetidos (ex.: Fabricante em dois lugares)
    const unique = [];
    for (const item of found) {
      const same = unique.find((u) => u.label === item.label);
      if (!same) unique.push({ label: item.label, value: item.value || '' });
      else if (!same.value && item.value) same.value = item.value;
    }
    return {
      blob: output,
      found: unique,
      residual: check.found,
      wipedBytes: wipe.reduce((sum, [a, b]) => sum + (b - a), 0),
      partialWipe,
      originalSize: file.size,
      cleanSize: output.size,
    };
  }

  // Lista os metadados de um arquivo (usado para conferir o resultado)
  async function inspect(blob) {
    const top = await scanTop(blob);
    const moovBox = top.find((b) => b.type === 'moov');
    if (!moovBox) fail('O arquivo limpo ficou sem índice (moov).');
    const u8 = await readBytes(blob, moovBox.start, moovBox.start + moovBox.size);
    const moov = parseChildren(u8, 0, u8.length, false)[0];
    const found = [];
    const walk = (node) => (node.children || []).forEach((c) => {
      if (DROP_INSIDE.has(c.type) && c.type !== 'free' && c.type !== 'skip') found.push({ label: c.type });
      if (c.type === 'trak' && DROP_HANDLERS[handlerOf(u8, c)]) found.push({ label: 'faixa ' + handlerOf(u8, c) });
      if ((c.type === 'mvhd' || c.type === 'tkhd' || c.type === 'mdhd') && hasNonZeroTimes(u8, c)) found.push({ label: 'data em ' + c.type });
      if (c.children) walk(c);
    });
    walk(moov);
    top.forEach((b) => { if (!KEEP_TOP.has(b.type)) found.push({ label: 'caixa ' + b.type }); });
    return { found };
  }

  const api = { clean, inspect, CleanError, SUPPORTED };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LimpadorMP4 = api;
})(typeof self !== 'undefined' ? self : this);
