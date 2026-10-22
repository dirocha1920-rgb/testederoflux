/* Ferramenta: Filtro de Vídeo (tela de cor por cima do vídeo). Usa video-studio.js. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h, VS = window.VideoStudio;
  var STORAGE_KEY = 'palco-filtro';
  var BLENDS = [['source-over', 'Normal (cobre por cima)'], ['multiply', 'Multiplicar (escurece)'], ['overlay', 'Sobrepor (mais contraste)'], ['screen', 'Clarear'], ['color', 'Cor (tinge sem escurecer)']];

  function readSaved() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ color: s.color, which: s.which, opacity: s.opacity, blend: s.blend })); } catch (e) { /* sem armazenamento */ } }

  DF.register({
    id: 'palco-filtro', group: 'vídeo', label: 'Filtro de Vídeo', icon: 'stage',
    title: ['Filtro de', 'Vídeo.'],
    lead: 'Coloque uma tela verde, preta ou de qualquer cor por cima do vídeo, ajuste a opacidade até ficar do jeito certo e exporte o vídeo pronto. Tudo acontece no seu navegador.',
    mount: function (body, ctx) {
      var s = { color: '#00b140', which: 'green', custom: '#ff2d55', opacity: 0.4, blend: 'source-over', useRange: false, start: 0, end: 5 };
      var saved = readSaved();
      if (/^(green|black|custom)$/.test(saved.which)) s.which = saved.which;
      if (/^#[0-9a-f]{6}$/i.test(saved.color || '')) { s.color = saved.color; if (s.which === 'custom') s.custom = saved.color; }
      if (typeof saved.opacity === 'number' && saved.opacity >= 0 && saved.opacity <= 1) s.opacity = saved.opacity;
      if (BLENDS.some(function (b) { return b[0] === saved.blend; })) s.blend = saved.blend;

      var canvas = h('canvas', { width: '1280', height: '720', 'aria-label': 'Prévia do vídeo com filtro' });
      var studio, stage, panel;
      studio = new VS.Studio({
        canvas: canvas,
        draw: function (c, w, hh, t) {
          if (s.opacity <= 0) return;
          if (t >= 0 && s.useRange && (t < s.start || t > s.end)) return;
          c.globalAlpha = s.opacity; c.globalCompositeOperation = s.blend; c.fillStyle = s.color; c.fillRect(0, 0, w, hh);
        },
        onStatus: function (x) { panel.setStatus(x); },
        onInfo: function (list) { stage.setChips(list); },
        onTime: function (t) { stage.setTime(t); },
        onReady: function (r) { stage.setEnabled(true); panel.setReady(true); markNow.forEach(function (b) { b.disabled = false; }); if (!s.useRange) { s.end = +r.duration.toFixed(1); endInput.value = String(s.end); } },
        onUnready: function () { stage.setEnabled(false); panel.setReady(false); },
        onPlay: function (p) { stage.setPlaying(p); },
        onFps: function () { panel.setFps(); },
        onRecording: function (on) { panel.setRecording(on); stage.setEnabled(!on); },
        onProgress: function (pct) { panel.setProgress(pct); },
        onResult: function (r) { panel.setResult(r); },
      });
      stage = VS.stageUI(DF, studio, canvas);
      panel = VS.exportUI(DF, studio, { id: 'palco', suffix: 'filtro', onActivity: ctx.setActivity });
      VS.wire(DF, studio, stage, panel);

      // Cores
      var swatches = h('div', { class: 'palco-swatches', role: 'group', 'aria-label': 'Cor da tela' });
      var custom = h('input', { type: 'color', value: s.custom, 'aria-label': 'Cor personalizada' });
      var swGreen = h('button', { type: 'button', class: 'palco-swatch' }, h('i', { class: 'sw-green' }), 'Verde');
      var swBlack = h('button', { type: 'button', class: 'palco-swatch' }, h('i', { class: 'sw-black' }), 'Preta');
      var swCustom = h('label', { class: 'palco-swatch' }, custom, 'Outra');
      swatches.appendChild(swGreen); swatches.appendChild(swBlack); swatches.appendChild(swCustom);
      function setColor(which, color) {
        s.which = which; s.color = color; save(s);
        [[swGreen, 'green'], [swBlack, 'black'], [swCustom, 'custom']].forEach(function (p) {
          p[0].classList.toggle('palco-swatch-on', p[1] === which);
          p[0].setAttribute('aria-pressed', String(p[1] === which));
        });
        studio.refresh();
      }
      swGreen.addEventListener('click', function () { setColor('green', '#00b140'); });
      swBlack.addEventListener('click', function () { setColor('black', '#000000'); });
      custom.addEventListener('input', function () { s.custom = custom.value; setColor('custom', custom.value); });
      custom.addEventListener('click', function () { setColor('custom', custom.value); });

      var opOut = h('output', { class: 'mono', text: Math.round(s.opacity * 100) + '%' });
      var op = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(s.opacity * 100)), id: 'palco-opacity' });
      op.addEventListener('input', function () { s.opacity = Number(op.value) / 100; opOut.textContent = op.value + '%'; save(s); studio.refresh(); });

      var blend = h('select', { class: 'palco-select', id: 'palco-blend' }, BLENDS.map(function (b) { return h('option', { value: b[0], text: b[1] }); }));
      blend.value = s.blend;
      blend.addEventListener('change', function () { s.blend = blend.value; save(s); studio.refresh(); });

      var startInput = h('input', { type: 'number', min: '0', step: '0.1', value: '0', id: 'palco-start' });
      var endInput = h('input', { type: 'number', min: '0', step: '0.1', value: '5', id: 'palco-end' });
      var markNow = [h('button', { type: 'button', class: 'text-button', text: 'Usar agora', disabled: true }), h('button', { type: 'button', class: 'text-button', text: 'Usar agora', disabled: true })];
      var rangeRow = h('div', { class: 'palco-range', hidden: true },
        h('div', null, h('label', { for: 'palco-start', text: 'Início (s)' }), startInput, markNow[0]),
        h('div', null, h('label', { for: 'palco-end', text: 'Fim (s)' }), endInput, markNow[1]));
      var useRange = h('input', { type: 'checkbox' });
      useRange.addEventListener('change', function () { s.useRange = useRange.checked; rangeRow.hidden = !s.useRange; studio.refresh(); });
      startInput.addEventListener('input', function () { s.start = parseFloat(startInput.value) || 0; studio.refresh(); });
      endInput.addEventListener('input', function () { s.end = parseFloat(endInput.value) || 0; studio.refresh(); });
      markNow[0].addEventListener('click', function () { s.start = +studio.currentTime().toFixed(1); startInput.value = String(s.start); });
      markNow[1].addEventListener('click', function () { s.end = +studio.currentTime().toFixed(1); endInput.value = String(s.end); });

      body.appendChild(h('div', { class: 'palco tool-grid-wide' },
        stage.el,
        h('aside', { class: 'palco-panel' },
          panel.fileGroup,
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Cor da tela' }), swatches),
          h('label', { class: 'palco-group', for: 'palco-opacity' }, h('span', { class: 'palco-label' }, 'Opacidade ', opOut), op),
          h('label', { class: 'palco-group', for: 'palco-blend' }, h('span', { class: 'palco-label', text: 'Mistura' }), blend),
          h('div', { class: 'palco-group' }, h('label', { class: 'palco-check' }, useRange, ' Só em um trecho do vídeo'), rangeRow),
          panel.exportGroup)));
      setColor(s.which, s.color);
    },
  });
})();
