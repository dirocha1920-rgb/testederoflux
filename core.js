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

  // Grade 3×3 de posição (igual à do Deroflux)
  var POSITIONS = [['top-left', '↖'], ['top', '↑'], ['top-right', '↗'], ['left', '←'], ['center', '•'], ['right', '→'], ['bottom-left', '↙'], ['bottom', '↓'], ['bottom-right', '↘']];
  var POSITION_NAMES = { 'top-left': 'superior esquerdo', top: 'topo', 'top-right': 'superior direito', left: 'esquerda', center: 'centro', right: 'direita', 'bottom-left': 'inferior esquerdo', bottom: 'base', 'bottom-right': 'inferior direito' };
  function positionGrid(value, onChange) {
    var grid = h('div', { class: 'overlay-grid', role: 'group', 'aria-label': 'Posição' });
    POSITIONS.forEach(function (p) {
      var b = h('button', { type: 'button', class: 'overlay-pos', 'aria-label': POSITION_NAMES[p[0]], 'aria-pressed': String(p[0] === value), text: p[1] });
      if (p[0] === value) b.classList.add('overlay-pos-on');
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('overlay-pos-on'); c.setAttribute('aria-pressed', 'false'); });
        b.classList.add('overlay-pos-on'); b.setAttribute('aria-pressed', 'true');
        onChange(p[0]);
      });
      grid.appendChild(b);
    });
    return grid;
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
    downloadLink: downloadLink, positionGrid: positionGrid, anchor: anchor, register: register,
    FORMATS: FORMATS, fitRect: fitRect, formatControls: formatControls,
    current: function () { return current; },
  };
  document.addEventListener('DOMContentLoaded', start);
})();
