/*
 * Limpador de metadados de imagens (JPG, PNG, WebP) no navegador, SEM recodificar.
 *
 * JPG:  remove EXIF (GPS, câmera, datas, miniatura), XMP, IPTC/Photoshop, comentários,
 *       imagens extras (MPF: HDR/profundidade do iPhone) e dados após o fim da imagem.
 *       Mantém o perfil de cor (ICC) e os dados da imagem como estão.
 * PNG:  remove tEXt/zTXt/iTXt (inclui XMP), eXIf e tIME; mantém cor, transparência etc.
 * WebP: remove os blocos EXIF e XMP e ajusta o cabeçalho.
 * Se a foto tinha "girar ao exibir" (orientação EXIF), grava um EXIF mínimo só com
 * essa informação, para a foto não aparecer deitada. Nada pessoal fica nele.
 */
(function (root) {
  'use strict';

  class ImageCleanError extends Error {}
  const fail = (message) => { throw new ImageCleanError(message); };
  const latin1 = new TextDecoder('latin1');

  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return latin1.decode(bytes); }
  }
  const tidy = (text) => {
    // eslint-disable-next-line no-control-regex
    const t = String(text).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 80 ? t.slice(0, 80) + '…' : t;
  };
  const startsWith = (u8, at, text) => {
    for (let i = 0; i < text.length; i++) if (u8[at + i] !== text.charCodeAt(i)) return false;
    return true;
  };

  // ------------------------------------------------------------- EXIF (leitura)
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  const IFD0_TAGS = {
    0x010f: 'Fabricante da câmera', 0x0110: 'Modelo da câmera', 0x0131: 'Programa usado', 0x0132: 'Data de modificação',
    0x013b: 'Autor', 0x8298: 'Direitos autorais', 0x010e: 'Descrição', 0x9c9b: 'Título', 0x9c9c: 'Comentário', 0x9c9d: 'Autor', 0x9c9e: 'Palavras-chave',
  };
  const EXIF_TAGS = {
    0x9003: 'Data da foto', 0x9004: 'Data da foto', 0xa430: 'Nome do dono da câmera', 0xa431: 'Número de série da câmera',
    0xa433: 'Fabricante da lente', 0xa434: 'Modelo da lente', 0x9286: 'Comentário', 0xa420: 'Identificador único da foto',
    0x927c: 'Dados do fabricante (MakerNote)', 0x9010: 'Fuso horário', 0x9011: 'Fuso horário',
  };
  const SHOW_VALUE = new Set(['Fabricante da câmera', 'Modelo da câmera', 'Data da foto', 'Programa usado', 'Modelo da lente', 'Autor', 'Nome do dono da câmera', 'Número de série da câmera', 'Comentário']);

  function readExif(tiff) {
    // tiff: bytes começando no cabeçalho TIFF ("II*\0" ou "MM\0*")
    const found = [];
    let orientation = 1;
    const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    if (tiff.length < 8) return { found: [{ label: 'Dados EXIF' }], orientation };
    const little = tiff[0] === 0x49;
    if (!little && tiff[0] !== 0x4d) return { found: [{ label: 'Dados EXIF' }], orientation };
    const u16 = (o) => dv.getUint16(o, little);
    const u32 = (o) => dv.getUint32(o, little);
    const seen = new Set();

    function entries(offset) {
      if (!offset || offset + 2 > tiff.length || seen.has(offset)) return [];
      seen.add(offset);
      const count = Math.min(u16(offset), 1000);
      const list = [];
      for (let i = 0; i < count; i++) {
        const at = offset + 2 + i * 12;
        if (at + 12 > tiff.length) break;
        const type = u16(at + 2);
        const n = u32(at + 4);
        const size = (TYPE_SIZE[type] || 1) * n;
        const valueAt = size <= 4 ? at + 8 : u32(at + 8);
        list.push({ tag: u16(at), type, n, valueAt, size, ok: valueAt + size <= tiff.length });
      }
      const nextAt = offset + 2 + count * 12;
      list.next = nextAt + 4 <= tiff.length ? u32(nextAt) : 0;
      return list;
    }
    const ascii = (e) => (e.ok ? tidy(latin1.decode(tiff.subarray(e.valueAt, e.valueAt + Math.min(e.size, 200)))) : '');
    const ucs2 = (e) => (e.ok ? tidy(new TextDecoder('utf-16le').decode(tiff.subarray(e.valueAt, e.valueAt + Math.min(e.size, 400)))) : '');
    const rational = (at) => { const d = u32(at + 4); return d ? u32(at) / d : 0; };
    const valueOf = (e) => (e.type === 2 ? ascii(e) : e.type === 1 && e.tag >= 0x9c9b ? ucs2(e) : e.type === 7 && e.tag === 0x9286 && e.ok ? tidy(latin1.decode(tiff.subarray(e.valueAt + 8, e.valueAt + Math.min(e.size, 200)))) : '');

    const ifd0 = entries(u32(4));
    let exifPtr = 0, gpsPtr = 0;
    for (const e of ifd0) {
      if (e.tag === 0x0112 && e.type === 3) orientation = u16(e.valueAt) || 1;
      else if (e.tag === 0x8769) exifPtr = u32(e.valueAt);
      else if (e.tag === 0x8825) gpsPtr = u32(e.valueAt);
      else if (IFD0_TAGS[e.tag]) found.push({ label: IFD0_TAGS[e.tag], value: SHOW_VALUE.has(IFD0_TAGS[e.tag]) ? valueOf(e) : '' });
    }
    if (ifd0.next) found.push({ label: 'Miniatura escondida' });
    for (const e of entries(exifPtr)) {
      if (EXIF_TAGS[e.tag]) found.push({ label: EXIF_TAGS[e.tag], value: SHOW_VALUE.has(EXIF_TAGS[e.tag]) ? valueOf(e) : '' });
    }
    if (gpsPtr) {
      const gps = {};
      for (const e of entries(gpsPtr)) gps[e.tag] = e;
      let value = '';
      try {
        const coord = (e) => (e && e.ok && e.type === 5 && e.n >= 3 ? rational(e.valueAt) + rational(e.valueAt + 8) / 60 + rational(e.valueAt + 16) / 3600 : null);
        let lat = coord(gps[2]); let lon = coord(gps[4]);
        if (lat !== null && lon !== null) {
          if (gps[1] && ascii(gps[1]).startsWith('S')) lat = -lat;
          if (gps[3] && ascii(gps[3]).startsWith('W')) lon = -lon;
          value = lat.toFixed(5) + ', ' + lon.toFixed(5);
        }
      } catch { value = ''; }
      found.push({ label: 'Localização (GPS)', value });
    }
    return { found, orientation };
  }

  // EXIF mínimo: só a orientação (cabeçalho TIFF big-endian, 1 entrada)
  function orientationTiff(orientation) {
    const t = new Uint8Array(26);
    const dv = new DataView(t.buffer);
    t.set([0x4d, 0x4d, 0x00, 0x2a]);
    dv.setUint32(4, 8);
    dv.setUint16(8, 1);
    dv.setUint16(10, 0x0112); dv.setUint16(12, 3); dv.setUint32(14, 1); dv.setUint16(18, orientation);
    dv.setUint32(22, 0);
    return t;
  }

  // ------------------------------------------------------------------ JPEG
  const APP_NAMES = { 0xe1: 'APP1', 0xe2: 'APP2', 0xed: 'APP13', 0xec: 'APP12', 0xee: 'APP14' };

  function parseJpeg(u8) {
    if (u8[0] !== 0xff || u8[1] !== 0xd8) fail('Este arquivo não é um JPG válido.');
    const segments = [];
    let pos = 2;
    let eoi = -1;
    while (pos < u8.length) {
      if (u8[pos] !== 0xff) fail('A estrutura deste JPG está corrompida.');
      const marker = u8[pos + 1];
      if (marker === 0xff) { pos++; continue; }
      if (marker === 0xd9) { eoi = pos + 2; break; }
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xd8) { pos += 2; continue; }
      if (pos + 4 > u8.length) fail('Este JPG parece incompleto.');
      const length = (u8[pos + 2] << 8) | u8[pos + 3];
      if (length < 2 || pos + 2 + length > u8.length) fail('A estrutura deste JPG está corrompida.');
      let end = pos + 2 + length;
      if (marker === 0xda) {
        // Dados da imagem: vão até o próximo marcador de verdade
        let p = end;
        while (p + 1 < u8.length && !(u8[p] === 0xff && u8[p + 1] !== 0x00 && !(u8[p + 1] >= 0xd0 && u8[p + 1] <= 0xd7))) p++;
        end = p + 1 < u8.length ? p : u8.length;
      }
      segments.push({ marker, start: pos, end, dataStart: pos + 4, dataEnd: pos + 2 + length });
      pos = end;
    }
    if (!segments.some((s) => s.marker === 0xda)) fail('Este JPG não tem imagem (parece incompleto).');
    return { segments, eoi, trailing: eoi > 0 ? u8.length - eoi : 0 };
  }

  function describeJpeg(u8, parsed) {
    const found = [];
    let orientation = 1;
    let mpf = false;
    for (const s of parsed.segments) {
      const m = s.marker;
      if (m === 0xe1 && startsWith(u8, s.dataStart, 'Exif\0')) {
        const r = readExif(u8.subarray(s.dataStart + 6, s.dataEnd));
        found.push(...r.found);
        if (r.orientation > 1) orientation = r.orientation;
      } else if (m === 0xe1 && startsWith(u8, s.dataStart, 'http://ns.adobe.com/xap/1.0/')) found.push({ label: 'Metadados XMP' });
      else if (m === 0xe1 && startsWith(u8, s.dataStart, 'http://ns.adobe.com/xmp/extension/')) found.push({ label: 'Metadados XMP' });
      else if (m === 0xe1) found.push({ label: 'Dados extras (APP1)' });
      else if (m === 0xe2 && startsWith(u8, s.dataStart, 'MPF\0')) { mpf = true; found.push({ label: 'Imagens extras (HDR/profundidade)' }); }
      else if (m === 0xe2 && startsWith(u8, s.dataStart, 'ICC_PROFILE\0')) { /* perfil de cor: fica */ }
      else if (m === 0xe2) found.push({ label: 'Dados extras (APP2)' });
      else if (m === 0xed) found.push({ label: 'IPTC / Photoshop (autor, legenda, local)' });
      else if (m === 0xec) found.push({ label: 'Metadados do Photoshop' });
      else if (m === 0xe0 && startsWith(u8, s.dataStart, 'JFXX')) found.push({ label: 'Miniatura escondida' });
      else if (m === 0xe0 && !startsWith(u8, s.dataStart, 'JFIF\0')) found.push({ label: 'Dados extras (APP0)' });
      else if (m === 0xee && !startsWith(u8, s.dataStart, 'Adobe')) found.push({ label: 'Dados extras (APP14)' });
      else if (m >= 0xe3 && m <= 0xef && m !== 0xee && m !== 0xec && m !== 0xed) found.push({ label: 'Dados extras (APP' + (m - 0xe0) + ')' });
      else if (m === 0xfe) found.push({ label: 'Comentário', value: tidy(decodeText(u8.subarray(s.dataStart, s.dataEnd))) });
    }
    if (parsed.trailing > 32 && !mpf) found.push({ label: 'Dados escondidos depois da imagem' });
    else if (parsed.trailing > 32 && mpf) { /* as imagens extras já foram listadas */ }
    return { found, orientation };
  }

  function keepJpegSegment(u8, s) {
    const m = s.marker;
    if (m === 0xe0) return startsWith(u8, s.dataStart, 'JFIF\0');
    if (m === 0xe2) return startsWith(u8, s.dataStart, 'ICC_PROFILE\0');
    if (m === 0xee) return startsWith(u8, s.dataStart, 'Adobe');
    if (m >= 0xe1 && m <= 0xef) return false;
    if (m === 0xfe) return false;
    return true;
  }

  function cleanJpeg(u8) {
    const parsed = parseJpeg(u8);
    const info = describeJpeg(u8, parsed);
    const parts = [new Uint8Array([0xff, 0xd8])];
    const kept = parsed.segments.filter((s) => keepJpegSegment(u8, s));
    let inserted = info.orientation <= 1;
    const insertOrientation = () => {
      const tiff = orientationTiff(info.orientation);
      const length = 2 + 6 + tiff.length;
      const seg = new Uint8Array(2 + length);
      seg.set([0xff, 0xe1, length >> 8, length & 0xff]);
      seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
      seg.set(tiff, 10);
      parts.push(seg);
      inserted = true;
    };
    for (const s of kept) {
      if (!inserted && s.marker !== 0xe0) insertOrientation();
      parts.push(u8.subarray(s.start, s.end));
    }
    if (!inserted) insertOrientation();
    parts.push(new Uint8Array([0xff, 0xd9]));
    return { parts, info, mime: 'image/jpeg' };
  }

  // ------------------------------------------------------------------- PNG
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', 'hIST', 'sPLT', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLi']);
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function parsePng(u8) {
    if (!PNG_SIGNATURE.every((b, i) => u8[i] === b)) fail('Este arquivo não é um PNG válido.');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const chunks = [];
    let pos = 8;
    while (pos + 12 <= u8.length) {
      const length = dv.getUint32(pos);
      const type = latin1.decode(u8.subarray(pos + 4, pos + 8));
      const end = pos + 12 + length;
      if (end > u8.length) fail('Este PNG parece incompleto.');
      chunks.push({ type, start: pos, end, dataStart: pos + 8, dataEnd: pos + 8 + length });
      pos = end;
      if (type === 'IEND') break;
    }
    if (!chunks.length || chunks[0].type !== 'IHDR' || !chunks.some((c) => c.type === 'IDAT')) fail('Este PNG está corrompido.');
    return chunks;
  }

  function describePng(u8, chunks) {
    const found = [];
    let orientation = 1;
    for (const c of chunks) {
      if (c.type === 'tEXt' || c.type === 'zTXt' || c.type === 'iTXt') {
        const data = u8.subarray(c.dataStart, c.dataEnd);
        const zero = data.indexOf(0);
        const key = latin1.decode(data.subarray(0, zero > 0 ? zero : Math.min(data.length, 40)));
        if (key === 'XML:com.adobe.xmp') found.push({ label: 'Metadados XMP' });
        else {
          const value = c.type === 'tEXt' && zero > 0 ? tidy(latin1.decode(data.subarray(zero + 1))) : '';
          const labels = { Author: 'Autor', Software: 'Programa usado', 'Creation Time': 'Data de criação', Comment: 'Comentário', Description: 'Descrição', Title: 'Título', Copyright: 'Direitos autorais', Source: 'Origem' };
          found.push({ label: labels[key] || 'Texto (' + tidy(key) + ')', value: labels[key] === 'Programa usado' || labels[key] === 'Autor' ? value : '' });
        }
      } else if (c.type === 'eXIf') {
        const r = readExif(u8.subarray(c.dataStart, c.dataEnd));
        found.push(...r.found);
        if (r.orientation > 1) orientation = r.orientation;
      } else if (c.type === 'tIME') found.push({ label: 'Data de modificação' });
      else if (!PNG_KEEP.has(c.type) && c.type[0] === c.type[0].toLowerCase()) found.push({ label: 'Dados extras (' + tidy(c.type) + ')' });
    }
    return { found, orientation };
  }

  function cleanPng(u8) {
    const chunks = parsePng(u8);
    const info = describePng(u8, chunks);
    const parts = [u8.subarray(0, 8)];
    for (const c of chunks) {
      const critical = c.type[0] === c.type[0].toUpperCase();
      if (PNG_KEEP.has(c.type) || (critical && c.type !== 'eXIf')) {
        if (c.type === 'IDAT' && info.orientation > 1 && !parts.orientationDone) {
          parts.push(pngChunk('eXIf', orientationTiff(info.orientation)));
          parts.orientationDone = true;
        }
        parts.push(u8.subarray(c.start, c.end));
      }
    }
    return { parts, info, mime: 'image/png' };
  }

  // ------------------------------------------------------------------ WebP
  function parseWebp(u8) {
    if (!startsWith(u8, 0, 'RIFF') || !startsWith(u8, 8, 'WEBP')) fail('Este arquivo não é um WebP válido.');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const riffEnd = Math.min(u8.length, 8 + dv.getUint32(4, true));
    const chunks = [];
    let pos = 12;
    while (pos + 8 <= riffEnd) {
      const type = latin1.decode(u8.subarray(pos, pos + 4));
      const size = dv.getUint32(pos + 4, true);
      const end = pos + 8 + size + (size & 1);
      if (pos + 8 + size > u8.length) fail('Este WebP parece incompleto.');
      chunks.push({ type, start: pos, end: Math.min(end, u8.length), dataStart: pos + 8, dataEnd: pos + 8 + size });
      pos = end;
    }
    if (!chunks.some((c) => c.type === 'VP8 ' || c.type === 'VP8L' || c.type === 'ANIM')) fail('Este WebP está corrompido.');
    return chunks;
  }

  function cleanWebp(u8) {
    const chunks = parseWebp(u8);
    const found = [];
    let orientation = 1;
    for (const c of chunks) {
      if (c.type === 'EXIF') {
        let tiff = u8.subarray(c.dataStart, c.dataEnd);
        if (startsWith(tiff, 0, 'Exif\0\0')) tiff = tiff.subarray(6);
        const r = readExif(tiff);
        found.push(...r.found);
        if (r.orientation > 1) orientation = r.orientation;
      } else if (c.type === 'XMP ') found.push({ label: 'Metadados XMP' });
    }
    const parts = [];
    for (const c of chunks) {
      if (c.type === 'EXIF' || c.type === 'XMP ') continue;
      if (c.type === 'VP8X') {
        const copy = u8.slice(c.start, c.end);
        copy[8] &= ~0x0c; // apaga as marcas "tem EXIF" e "tem XMP"
        if (orientation > 1) copy[8] |= 0x08;
        parts.push(copy);
        continue;
      }
      parts.push(u8.subarray(c.start, c.end));
    }
    if (orientation > 1 && chunks.some((c) => c.type === 'VP8X')) {
      const tiff = orientationTiff(orientation);
      const chunk = new Uint8Array(8 + tiff.length + (tiff.length & 1));
      chunk.set([0x45, 0x58, 0x49, 0x46]);
      new DataView(chunk.buffer).setUint32(4, tiff.length, true);
      chunk.set(tiff, 8);
      parts.push(chunk);
    }
    const body = parts.reduce((n, p) => n + p.length, 0);
    const header = new Uint8Array(12);
    header.set([0x52, 0x49, 0x46, 0x46]);
    new DataView(header.buffer).setUint32(4, 4 + body, true);
    header.set([0x57, 0x45, 0x42, 0x50], 8);
    return { parts: [header, ...parts], info: { found, orientation }, mime: 'image/webp' };
  }

  // ------------------------------------------------------------------- API
  function detect(u8) {
    if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpeg';
    if (PNG_SIGNATURE.every((b, i) => u8[i] === b)) return 'png';
    if (startsWith(u8, 0, 'RIFF') && startsWith(u8, 8, 'WEBP')) return 'webp';
    if (startsWith(u8, 4, 'ftyp') && /^(heic|heix|mif1|msf1|hevc|avif)/.test(latin1.decode(u8.subarray(8, 12)))) return 'heic';
    return '';
  }

  function uniq(found) {
    const out = [];
    for (const item of found) {
      const same = out.find((o) => o.label === item.label);
      if (!same) out.push({ label: item.label, value: item.value || '' });
      else if (!same.value && item.value) same.value = item.value;
    }
    return out;
  }

  async function clean(file) {
    if (file.size > 200 * 1024 * 1024) fail('Imagem grande demais (máximo 200 MB).');
    const u8 = new Uint8Array(await file.arrayBuffer());
    const kind = detect(u8);
    if (kind === 'heic') fail('Fotos HEIC/AVIF do iPhone ainda não são aceitas. No iPhone, compartilhe a foto como JPG, ou use Ajustes › Câmera › Formatos › Mais compatível.');
    if (!kind) fail('Formato não aceito. Use JPG, PNG ou WebP.');
    const result = kind === 'jpeg' ? cleanJpeg(u8) : kind === 'png' ? cleanPng(u8) : cleanWebp(u8);
    const blob = new Blob(result.parts, { type: result.mime });
    // Conferência: lê o resultado de novo; só a orientação pode ter ficado
    const check = await inspect(blob);
    return { blob, kind, found: uniq(result.info.found), residual: check.found, orientation: result.info.orientation, originalSize: file.size, cleanSize: blob.size };
  }

  async function inspect(blob) {
    const u8 = new Uint8Array(await blob.arrayBuffer());
    const kind = detect(u8);
    if (kind === 'jpeg') return describeJpeg(u8, parseJpeg(u8));
    if (kind === 'png') return describePng(u8, parsePng(u8));
    if (kind === 'webp') {
      const found = [];
      for (const c of parseWebp(u8)) {
        if (c.type === 'XMP ') found.push({ label: 'Metadados XMP' });
        if (c.type === 'EXIF') { let t = u8.subarray(c.dataStart, c.dataEnd); if (startsWith(t, 0, 'Exif\0\0')) t = t.subarray(6); found.push(...readExif(t).found); }
      }
      return { found };
    }
    return { found: [{ label: 'formato desconhecido' }] };
  }

  const api = { clean, inspect, ImageCleanError, SUPPORTED: /\.(jpe?g|png|webp)$/i };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LimpadorImagem = api;
})(typeof self !== 'undefined' ? self : this);
