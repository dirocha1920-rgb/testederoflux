/* Núcleo do site de ferramentas: menu lateral, troca de ferramenta, funções comuns.
 * Cada ferramenta se registra com DF.register({...}) num arquivo tool-*.js. */
(function () {
  'use strict';

  var tools = [];
  var mounted = {};
  var activity = {};
  var current = null;

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  var ICON = {
    check: 'm5 12 4 4L19 6',
    download: 'M12 4v11m-4-4 4 4 4-4M5 20h14',
    trash: 'M4 7h16M10 11v5m4-5v5M6 7l1 13h10l1-13M9 7l1-3h4l1 3',
    upload: 'M12 16V4m-4 4 4-4 4 4M5 20h14',
    video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
    image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
    sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
    layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5',
    stage: 'M3 5h18v11H3zM8 20h8M12 16v4',
    play: 'M7 5v14l12-7z',
    pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
    audio: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2',
  };

  function svg(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var el = document.createElementNS(ns, 'svg');
    [['class', 'icon'], ['viewBox', '0 0 24 24'], ['aria-hidden', 'true'], ['fill', 'none'], ['stroke', 'currentColor'],
      ['stroke-width', '1.8'], ['stroke-linecap', 'square'], ['stroke-linejoin', 'miter']].forEach(function (a) { el.setAttribute(a[0], a[1]); });
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICON[name] || name);
    if (name === 'play' || name === 'pause') { el.setAttribute('fill', 'currentColor'); el.setAttribute('stroke', 'none'); }
    el.appendChild(p);
    return el;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'], i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? String(v) : v.toFixed(v < 10 ? 1 : 0)).replace('.', ',') + ' ' + units[i];
  }

  function stem(name) { var dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(0, dot) : name; }
  function ext(name) { var dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(dot).toLowerCase() : ''; }

  // Aviso vermelho dentro de um painel
  function noticeBox() {
    var text = h('span');
    var box = h('div', { class: 'notice notice-error panel-notice', role: 'alert', hidden: true }, text,
      h('button', { class: 'notice-close', type: 'button', 'aria-label': 'Fechar aviso', text: '×', onclick: function () { set(''); } }));
    function set(message) { text.textContent = message || ''; box.hidden = !message; }
    return { el: box, set: set };
  }

  // Área de "arraste ou escolha" no estilo do Deroflux
  function dropZone(options) {
    var input = h('input', { type: 'file', accept: options.accept, hidden: true, multiple: options.multiple ? true : null });
    var title = h('strong', { text: options.title || 'Arraste o arquivo para cá' });
    var pick = h('button', { type: 'button', class: 'inline-button', text: options.pickLabel || 'escolha o arquivo' });
    var zone = h('div', { class: 'upload-zone' + (options.small ? ' upload-zone-small' : ''), role: 'button', tabindex: '0', 'aria-label': options.title || 'Escolher arquivo' },
      input,
      h('div', { class: 'upload-icon' }, svg('upload')),
      h('div', null, title, h('span', null, 'ou ', pick)),
      h('small', { text: options.hint || '' }));
    var disabled = false;
    var open = function () { if (!disabled) input.click(); };
    pick.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    zone.addEventListener('click', open);
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files); // cópia: limpar o campo esvazia a lista original
      input.value = '';
      if (files.length) options.onFiles(files);
    });
    ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); if (!disabled) zone.classList.add('upload-zone-dragging'); }); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('upload-zone-dragging'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('upload-zone-dragging'); if (!disabled && e.dataTransfer.files.length) options.onFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
    return {
      el: zone,
      setTitle: function (t) { title.textContent = t; },
      setDisabled: function (d) { disabled = d; zone.classList.toggle('upload-zone-disabled', d); },
    };
  }

  // Botão de baixar a partir de um Blob
  function downloadLink(blob, filename, label, onClick) {
    var url = URL.createObjectURL(blob);
    var a = h('a', { class: 'button button-primary button-wide', href: url, download: filename, onclick: onClick }, svg('download'), ' ' + (label || 'Baixar'));
    a._revoke = function () { URL.revokeObjectURL(url); };
    return a;
  }

  // ------------------------------------------------------------ editor da sobreposição
  // A sobreposição é guardada como centro (cx, cy, fração do quadro) e largura (sw, fração da
  // largura do quadro). Pode passar das bordas: o que ficar fora do quadro simplesmente some.
  function overlayRect(W, H, mark, s) {
    var w = s.sw * W, hh = w * mark.height / mark.width;
    return { x: s.cx * W - w / 2, y: s.cy * H - hh / 2, w: w, h: hh };
  }

  // Caixa por cima da prévia: arrastar move, os cantos mudam o tamanho, a rodinha do mouse também.
  // o = { host, canvas, mark(), frame() -> {w,h}, disabled(), onChange(s) }
  function overlayEditor(o) {
    var MIN = 0.02, MAX = 5;
    var s = { cx: 0.5, cy: 0.5, sw: 0.3 }, placed = false, drag = null;
    var box = h('div', { class: 'ov-box', tabindex: '0', hidden: true,
      'aria-label': 'Sobreposição. Arraste para mover; puxe os cantos ou use a rodinha do mouse para mudar o tamanho. No teclado: setas movem, + e - mudam o tamanho.' },
      ['nw', 'ne', 'sw', 'se'].map(function (c) { return h('span', { class: 'ov-handle ov-' + c, 'data-corner': c }); }));
    o.host.classList.add('ov-host');
    o.host.appendChild(box);

    var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
    var off = function () { return !o.mark() || (o.disabled && o.disabled()); };

    function layout() {
      var m = o.mark();
      var cr = o.canvas.getBoundingClientRect();
      if (!m || o.canvas.hidden || !cr.width) { box.hidden = true; o.host.classList.remove('ov-ready'); return; }
      var hr = o.host.getBoundingClientRect(), F = o.frame(), k = cr.width / F.w, r = overlayRect(F.w, F.h, m, s);
      box.hidden = false;
      box.style.left = (cr.left - hr.left - o.host.clientLeft + r.x * k) + 'px';
      box.style.top = (cr.top - hr.top - o.host.clientTop + r.y * k) + 'px';
      box.style.width = (r.w * k) + 'px';
      box.style.height = (r.h * k) + 'px';
      box.classList.toggle('ov-locked', !!(o.disabled && o.disabled()));
      o.host.classList.add('ov-ready');
    }
    function changed() { placed = true; layout(); o.onChange(s); }

    function toFrame(e) {
      var F = o.frame(), cr = o.canvas.getBoundingClientRect();
      return { x: (e.clientX - cr.left) / cr.width * F.w, y: (e.clientY - cr.top) / cr.height * F.h };
    }
    function begin(e, corner) {
      var F = o.frame();
      drag = { corner: corner, p0: toFrame(e), s0: { cx: s.cx, cy: s.cy, sw: s.sw }, r0: overlayRect(F.w, F.h, o.mark(), s) };
      box.classList.add('ov-active');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }
    function move(e) {
      if (!drag || !o.mark()) return;
      e.preventDefault();
      var F = o.frame(), p = toFrame(e), m = o.mark();
      if (!drag.corner) {
        s.cx = clamp(drag.s0.cx + (p.x - drag.p0.x) / F.w, 0, 1);
        s.cy = clamp(drag.s0.cy + (p.y - drag.p0.y) / F.h, 0, 1);
      } else {
        // o canto oposto fica parado; mantém a proporção da imagem
        var r = drag.r0, c = drag.corner, aspect = m.width / m.height;
        var ax = c.indexOf('w') >= 0 ? r.x + r.w : r.x, ay = c.indexOf('n') >= 0 ? r.y + r.h : r.y;
        var w = Math.max(Math.abs(p.x - ax), Math.abs(p.y - ay) * aspect);
        w = clamp(w, MIN * F.w, MAX * F.w);
        var hh = w / aspect;
        var x = c.indexOf('w') >= 0 ? ax - w : ax, y = c.indexOf('n') >= 0 ? ay - hh : ay;
        s.sw = w / F.w; s.cx = (x + w / 2) / F.w; s.cy = (y + hh / 2) / F.h;
      }
      changed();
    }
    function end() {
      drag = null; box.classList.remove('ov-active');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    }

    box.addEventListener('pointerdown', function (e) {
      if (off() || e.button > 0) return;
      e.preventDefault(); box.focus({ preventScroll: true });
      begin(e, e.target.getAttribute('data-corner'));
    });
    // clicar fora da caixa (com o mouse) leva a sobreposição até ali e já começa a arrastar
    o.canvas.addEventListener('pointerdown', function (e) {
      if (off() || e.button > 0 || e.pointerType === 'touch') return;
      e.preventDefault();
      var F = o.frame(), p = toFrame(e);
      s.cx = clamp(p.x / F.w, 0, 1); s.cy = clamp(p.y / F.h, 0, 1);
      changed(); box.focus({ preventScroll: true });
      begin(e, null);
    });
    var wheel = function (e) {
      if (off()) return;
      e.preventDefault();
      s.sw = clamp(s.sw * (e.deltaY < 0 ? 1.06 : 1 / 1.06), MIN, MAX);
      changed();
    };
    box.addEventListener('wheel', wheel, { passive: false });
    o.canvas.addEventListener('wheel', wheel, { passive: false });
    box.addEventListener('keydown', function (e) {
      if (off()) return;
      var step = e.shiftKey ? 0.05 : 0.01, used = true;
      if (e.key === 'ArrowLeft') s.cx = clamp(s.cx - step, 0, 1);
      else if (e.key === 'ArrowRight') s.cx = clamp(s.cx + step, 0, 1);
      else if (e.key === 'ArrowUp') s.cy = clamp(s.cy - step, 0, 1);
      else if (e.key === 'ArrowDown') s.cy = clamp(s.cy + step, 0, 1);
      else if (e.key === '+' || e.key === '=') s.sw = clamp(s.sw * 1.05, MIN, MAX);
      else if (e.key === '-' || e.key === '_') s.sw = clamp(s.sw / 1.05, MIN, MAX);
      else used = false;
      if (used) { e.preventDefault(); changed(); }
    });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(o.canvas);
    window.addEventListener('resize', layout);

    function preset(name) {
      var m = o.mark(); if (!m) return;
      var F = o.frame(), ratio = (F.h / F.w) * (m.width / m.height);
      if (name === 'centro') { s.cx = 0.5; s.cy = 0.5; }
      else if (name === 'largura') { s.sw = 1; s.cx = 0.5; }
      else if (name === 'cobrir') { s.sw = Math.max(1, ratio); s.cx = 0.5; s.cy = 0.5; }
      else if (name === 'inteira') { s.sw = Math.min(1, ratio); s.cx = 0.5; s.cy = 0.5; }
      else { // padrão: canto inferior direito, 30% da largura, margem de 3%
        var mw = F.w * 0.3, mh = mw * m.height / m.width, at = anchor(F.w, F.h, mw, mh, 'bottom-right');
        s.sw = 0.3; s.cx = (at.x + mw / 2) / F.w; s.cy = (at.y + mh / 2) / F.h;
      }
      changed();
    }
    var actions = h('div', { class: 'ov-actions' }, [['centro', 'Centralizar'], ['largura', 'Encher a largura'], ['cobrir', 'Cobrir a tela'], ['inteira', 'Caber inteira'], ['padrao', 'Voltar ao padrão']].map(function (p) {
      var b = h('button', { type: 'button', class: 'ov-action', text: p[1] });
      b.addEventListener('click', function () { preset(p[0]); });
      return b;
    }));

    return {
      value: function () { return s; },
      actions: actions,
      layout: layout,
      setWidth: function (sw) { s.sw = clamp(sw, MIN, MAX); changed(); },
      markLoaded: function () { if (!placed) preset('padrao'); else changed(); },
      setDisabled: function (d) {
        Array.prototype.forEach.call(actions.children, function (b) { b.disabled = d; });
        layout();
      },
    };
  }

  // Calcula onde desenhar a sobreposição (mesma regra do servidor: margem de 3% da largura, mínimo 8 px)
  function anchor(baseW, baseH, w, h2, position) {
    var margin = Math.max(8, Math.floor(baseW * 0.03));
    var x = position.indexOf('left') >= 0 ? margin : position.indexOf('right') >= 0 ? baseW - w - margin : Math.round((baseW - w) / 2);
    var y = position.indexOf('top') === 0 ? margin : position.indexOf('bottom') === 0 ? baseH - h2 - margin : Math.round((baseH - h2) / 2);
    return { x: x, y: y };
  }

  // Formatos de saída para redes sociais
  var FORMATS = [
    { id: 'original', label: 'Original (mesmo tamanho)' },
    { id: 'feed-4x5', label: 'Feed retrato 4:5 · 1080×1350', w: 1080, h: 1350 },
    { id: 'feed-1x1', label: 'Feed quadrado 1:1 · 1080×1080', w: 1080, h: 1080 },
    { id: 'story', label: 'Story / Reels 9:16 · 1080×1920', w: 1080, h: 1920 },
  ];

  // Onde desenhar a imagem/vídeo dentro do formato: "preencher" corta as bordas,
  // "inteiro" mostra tudo com fundo preto em volta.
  function fitRect(srcW, srcH, dstW, dstH, fit) {
    var scale = fit === 'contain' ? Math.min(dstW / srcW, dstH / srcH) : Math.max(dstW / srcW, dstH / srcH);
    var w = Math.round(srcW * scale), hh = Math.round(srcH * scale);
    return { x: Math.round((dstW - w) / 2), y: Math.round((dstH - hh) / 2), w: w, h: hh };
  }

  // Dois seletores: formato e ajuste. Chama onChange({ format, fit }).
  function formatControls(idPrefix, onChange) {
    var value = { format: FORMATS[0], fit: 'cover' };
    var formatSelect = h('select', { class: 'palco-select', id: idPrefix + '-formato' }, FORMATS.map(function (f) { return h('option', { value: f.id, text: f.label }); }));
    var fitSelect = h('select', { class: 'palco-select', id: idPrefix + '-ajuste' },
      h('option', { value: 'cover', text: 'Preencher a tela (corta as bordas)' }),
      h('option', { value: 'contain', text: 'Mostrar inteiro (fundo preto em volta)' }));
    var fitGroup = h('label', { class: 'palco-group', for: idPrefix + '-ajuste', hidden: true }, h('span', { class: 'palco-label', text: 'Ajuste' }), fitSelect);
    var emit = function () { fitGroup.hidden = value.format.id === 'original'; onChange(value); };
    formatSelect.addEventListener('change', function () { value.format = FORMATS.find(function (f) { return f.id === formatSelect.value; }); emit(); });
    fitSelect.addEventListener('change', function () { value.fit = fitSelect.value; emit(); });
    return {
      el: h('div', { class: 'palco-stack' },
        h('label', { class: 'palco-group', for: idPrefix + '-formato' }, h('span', { class: 'palco-label', text: 'Formato' }), formatSelect),
        fitGroup),
      value: function () { return value; },
      setDisabled: function (d) { formatSelect.disabled = d; fitSelect.disabled = d; },
    };
  }

  // ------------------------------------------------------------ zip (sem compressão)
  // Vídeos e fotos já são comprimidos, então o zip só "embala": rápido e sem perda.
  // Os arquivos não são copiados para a memória; só são lidos aos pedaços para o CRC.
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crcUpdate(crc, bytes) {
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return crc;
  }
  function readChunk(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (ok, fail) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = fail; r.readAsArrayBuffer(blob); });
  }
  async function crc32(blob, onBytes) {
    var crc = 0xFFFFFFFF, CHUNK = 8 * 1024 * 1024;
    for (var pos = 0; pos < blob.size; pos += CHUNK) {
      crc = crcUpdate(crc, new Uint8Array(await readChunk(blob.slice(pos, pos + CHUNK))));
      onBytes(Math.min(CHUNK, blob.size - pos));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  // Evita nomes repetidos dentro do zip: "video.mp4", "video (2).mp4"…
  function uniqueNames(names) {
    var seen = {};
    return names.map(function (name) {
      var key = name.toLowerCase();
      if (!seen[key]) { seen[key] = 1; return name; }
      var n = ++seen[key], dot = name.lastIndexOf('.');
      var out = dot > 0 ? name.slice(0, dot) + ' (' + n + ')' + name.slice(dot) : name + ' (' + n + ')';
      seen[out.toLowerCase()] = 1;
      return out;
    });
  }
  // entries: [{ name, blob }]; onProgress(0..1)
  async function makeZip(entries, onProgress) {
    var enc = new TextEncoder();
    var names = uniqueNames(entries.map(function (e) { return e.name; }));
    var total = entries.reduce(function (s, e) { return s + e.blob.size; }, 0), done = 0;
    var big = total + entries.length * 1024 >= 0xFFFFFFFF; // passa de 4 GB: usa ZIP64
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0, centralSize = 0;
    var u64 = function (view, at, v) { view.setUint32(at, v % 0x100000000, true); view.setUint32(at + 4, Math.floor(v / 0x100000000), true); };
    for (var i = 0; i < entries.length; i++) {
      var blob = entries[i].blob, name = enc.encode(names[i]), size = blob.size;
      var crc = await crc32(blob, function (n) { done += n; if (onProgress) onProgress(total ? done / total : 1); });
      var version = big ? 45 : 20;
      var local = new DataView(new ArrayBuffer(30 + name.length + (big ? 20 : 0)));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, version, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, big ? 0xFFFFFFFF : size, true); local.setUint32(22, big ? 0xFFFFFFFF : size, true);
      local.setUint16(26, name.length, true); local.setUint16(28, big ? 20 : 0, true);
      new Uint8Array(local.buffer).set(name, 30);
      if (big) { var lx = 30 + name.length; local.setUint16(lx, 1, true); local.setUint16(lx + 2, 16, true); u64(local, lx + 4, size); u64(local, lx + 12, size); }
      var cen = new DataView(new ArrayBuffer(46 + name.length + (big ? 28 : 0)));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, version, true); cen.setUint16(6, version, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true); cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, big ? 0xFFFFFFFF : size, true); cen.setUint32(24, big ? 0xFFFFFFFF : size, true);
      cen.setUint16(28, name.length, true); cen.setUint16(30, big ? 28 : 0, true);
      cen.setUint32(42, big ? 0xFFFFFFFF : offset, true);
      new Uint8Array(cen.buffer).set(name, 46);
      if (big) { var cx = 46 + name.length; cen.setUint16(cx, 1, true); cen.setUint16(cx + 2, 24, true); u64(cen, cx + 4, size); u64(cen, cx + 12, size); u64(cen, cx + 20, offset); }
      parts.push(local.buffer, blob);
      central.push(cen.buffer);
      offset += local.byteLength + size;
      centralSize += cen.byteLength;
    }
    var tail = [];
    if (big) {
      var z = new DataView(new ArrayBuffer(56 + 20));
      z.setUint32(0, 0x06064b50, true); u64(z, 4, 44); z.setUint16(12, 45, true); z.setUint16(14, 45, true);
      u64(z, 24, entries.length); u64(z, 32, entries.length); u64(z, 40, centralSize); u64(z, 48, offset);
      z.setUint32(56, 0x07064b50, true); u64(z, 64, offset + centralSize); z.setUint32(72, 1, true);
      tail.push(z.buffer);
    }
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, big ? 0xFFFF : entries.length, true); end.setUint16(10, big ? 0xFFFF : entries.length, true);
    end.setUint32(12, big ? 0xFFFFFFFF : centralSize, true); end.setUint32(16, big ? 0xFFFFFFFF : offset, true);
    tail.push(end.buffer);
    return new Blob(parts.concat(central, tail), { type: 'application/zip' });
  }

  // Botão "Baixar todos (.zip)". getFiles() devolve [{ name, blob }] dos arquivos prontos.
  function zipButton(options) {
    var label = h('span', { text: 'Baixar todos (.zip)' });
    var btn = h('button', { type: 'button', class: 'button button-primary zip-all', hidden: true }, svg('download'), label);
    var working = false;
    btn.addEventListener('click', async function () {
      var files = options.getFiles();
      if (working || !files.length) return;
      working = true; btn.disabled = true;
      try {
        var blob = await makeZip(files, function (p) { label.textContent = 'Preparando o zip… ' + Math.round(p * 100) + '%'; });
        var url = URL.createObjectURL(blob);
        var a = h('a', { href: url, download: options.zipName(), hidden: true });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
        if (options.onDone) options.onDone(files);
      } catch (error) {
        if (options.onError) options.onError(error);
      } finally {
        working = false; btn.disabled = false; label.textContent = 'Baixar todos (.zip)';
      }
    });
    return { el: btn, update: function (count) { btn.hidden = count < 2; if (!working) label.textContent = 'Baixar todos (.zip) · ' + count; } };
  }
  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  // ------------------------------------------------------------ menu e telas
  function register(tool) { tools.push(tool); }

  function setActivity(id, state) {
    activity[id] = state;
    var link = document.querySelector('[data-tool-link="' + id + '"]');
    if (link) {
      var dot = link.querySelector('.tool-dot');
      if (state.active && !dot) link.appendChild(h('span', { class: 'tool-dot', 'aria-label': 'em andamento' }));
      if (!state.active && dot) dot.remove();
    }
  }

  function show(id) {
    var tool = tools.find(function (t) { return t.id === id; }) || tools[0];
    current = tool.id;
    document.querySelectorAll('[data-tool-link]').forEach(function (a) {
      var on = a.getAttribute('data-tool-link') === tool.id;
      a.classList.toggle('tool-link-on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      // No celular o menu vira uma barra que rola de lado: mostra a ferramenta aberta
      var nav = a.parentNode;
      if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, a.offsetLeft - nav.offsetLeft - 16);
    });
    var workspace = document.getElementById('panes');
    if (!mounted[tool.id]) {
      var pane = h('section', { class: 'tool-pane', 'data-pane': tool.id });
      pane.appendChild(h('header', { class: 'workspace-header' },
        h('div', null,
          h('div', { class: 'eyebrow' }, 'ferramentas ', h('span', { class: 'header-slash', text: '/' }), ' ' + tool.group),
          h('h1', null, tool.title[0] + ' ', h('em', { text: tool.title[1] })),
          tool.lead ? h('p', { class: 'tool-lead', text: tool.lead }) : null)));
      var body = h('div', { class: 'work-area' });
      pane.appendChild(body);
      workspace.appendChild(pane);
      mounted[tool.id] = pane;
      try {
        tool.mount(body, {
          setActivity: function (state) { setActivity(tool.id, state); },
        });
      } catch (error) {
        body.appendChild(h('div', { class: 'notice notice-error', text: 'Esta ferramenta não carregou neste navegador. Tente o Chrome, Edge, Firefox ou Safari atualizados.' }));
        if (window.console) console.error(error);
      }
    }
    Object.keys(mounted).forEach(function (k) { mounted[k].hidden = k !== tool.id; });
    document.title = tool.label + ' — Deroflux';
    window.scrollTo(0, 0);
  }

  function start() {
    var nav = document.getElementById('tool-nav');
    var group = null;
    tools.forEach(function (tool) {
      if (tool.group !== group) { group = tool.group; nav.appendChild(h('div', { class: 'tool-nav-group', text: group })); }
      nav.appendChild(h('a', { class: 'tool-link', href: '#' + tool.id, 'data-tool-link': tool.id }, svg(tool.icon), h('span', { class: 'tool-link-label', text: tool.label })));
    });
    var route = function () { show((location.hash || '').slice(1)); };
    window.addEventListener('hashchange', route);
    route();
    // Pergunta antes de fechar se algum trabalho se perderia
    window.addEventListener('beforeunload', function (e) {
      var unsaved = Object.keys(activity).some(function (k) { return activity[k] && activity[k].unsaved; });
      if (unsaved) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  window.DF = {
    h: h, svg: svg, formatBytes: formatBytes, stem: stem, ext: ext, noticeBox: noticeBox, dropZone: dropZone,
    downloadLink: downloadLink, overlayRect: overlayRect, overlayEditor: overlayEditor, anchor: anchor, register: register,
    FORMATS: FORMATS, fitRect: fitRect, formatControls: formatControls, makeZip: makeZip, zipButton: zipButton, stamp: stamp,
    current: function () { return current; },
  };
  document.addEventListener('DOMContentLoaded', start);
})();
