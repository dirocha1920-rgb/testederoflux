/* Ferramenta: Sobrepor no vídeo (imagem por cima do vídeo, em formato de feed ou story). Usa video-studio.js. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h, VS = window.VideoStudio, IU = window.ImageUtils;

  DF.register({
    id: 'sobrepor-video', group: 'vídeo', label: 'Sobrepor no vídeo', icon: 'layers',
    title: ['Sobrepor no', 'vídeo.'],
    lead: 'Coloque uma imagem por cima do vídeo, escolhendo posição, opacidade e tamanho.',
    mount: function (body, ctx) {
      var settings = { opacity: 100 };
      var editor = null, recording = false;
      var mark = null;
      var canvas = h('canvas', { width: '1280', height: '720', 'aria-label': 'Prévia do vídeo com a sobreposição' });
      var stage, panel;
      var studio = new VS.Studio({
        canvas: canvas,
        draw: function (c, w, hh) {
          if (!mark) return;
          var r = DF.overlayRect(w, hh, mark, editor.value());
          c.globalAlpha = settings.opacity / 100;
          c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
          c.drawImage(mark.img, r.x, r.y, r.w, r.h);
        },
        onStatus: function (x) { panel.setStatus(x); },
        onInfo: function (list) { stage.setChips(list); },
        onTime: function (t) { stage.setTime(t); },
        onReady: function () { stage.setEnabled(true); updateReady(); },
        onUnready: function () { stage.setEnabled(false); panel.setReady(false); },
        onPlay: function (p) { stage.setPlaying(p); },
        onFps: function () { panel.setFps(); },
        onRecording: function (on) { recording = on; panel.setRecording(on); stage.setEnabled(!on); editor.setDisabled(on); },
        onProgress: function (pct) { panel.setProgress(pct); },
        onResult: function (r) { panel.setResult(r); },
        onFormat: function () { panel.refreshNote(); editor.layout(); },
      });
      stage = VS.stageUI(DF, studio, canvas);
      panel = VS.exportUI(DF, studio, { id: 'sobrepor-video', suffix: 'sobreposicao', onActivity: ctx.setActivity });
      VS.wire(DF, studio, stage, panel);
      editor = DF.overlayEditor({
        host: stage.stage, canvas: canvas,
        mark: function () { return mark; },
        frame: function () { var z = studio.size(); return { w: z.width, h: z.height }; },
        disabled: function () { return recording; },
        onChange: function (v) { syncSize(v); studio.refresh(); },
      });

      var notice = DF.noticeBox();
      var markDrop = DF.dropZone({ accept: 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp', title: 'Imagem de sobreposição', pickLabel: 'escolher', hint: 'PNG, JPG/JPEG ou WebP', small: true,
        onFiles: function (files) {
          var file = files[0];
          IU.load(file).then(function (loaded) {
            if (mark) URL.revokeObjectURL(mark.url);
            mark = loaded; markDrop.setTitle(file.name); notice.set(''); updateReady(); editor.markLoaded();
          }, function (error) { notice.set(error.message); });
        } });
      var opacityOut = h('output', { class: 'mono', text: '100%' });
      var sizeOut = h('output', { class: 'mono', text: '30%' });
      var opacity = h('input', { type: 'range', min: '10', max: '100', step: '5', value: '100', id: 'sobrepor-vid-opacidade' });
      var size = h('input', { type: 'range', min: '2', max: '500', step: '1', value: '30', id: 'sobrepor-vid-tamanho' });
      function syncSize(v) { var pct = Math.round(v.sw * 100); size.value = String(pct); sizeOut.textContent = pct + '%'; }
      opacity.addEventListener('input', function () { settings.opacity = Number(opacity.value); opacityOut.textContent = opacity.value + '%'; studio.refresh(); });
      size.addEventListener('input', function () { editor.setWidth(Number(size.value) / 100); });

      var format = DF.formatControls('sobrepor-vid', function (v) {
        studio.setFormat(v.format.w ? { w: v.format.w, h: v.format.h, fit: v.fit } : null);
      });
      var baseRecording = panel.setRecording;
      panel.setRecording = function (on) { baseRecording(on); format.setDisabled(on); };

      function updateReady() { panel.setReady(studio.hasVideo() && !!mark); }

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'palco tool-grid-wide' },
        stage.el,
        h('aside', { class: 'palco-panel' },
          panel.fileGroup,
          format.el,
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Sobreposição' }), markDrop.el),
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Posição e tamanho' }),
            h('small', { class: 'ov-tip', text: 'Arraste a imagem na prévia para mover. Puxe os cantos ou use a rodinha do mouse para mudar o tamanho. Pode passar das bordas: o que sair do quadro some.' }),
            editor.actions),
          h('label', { class: 'palco-group', for: 'sobrepor-vid-opacidade' }, h('span', { class: 'palco-label' }, 'Opacidade ', opacityOut), opacity),
          h('label', { class: 'palco-group', for: 'sobrepor-vid-tamanho' }, h('span', { class: 'palco-label' }, 'Tamanho (% da largura) ', sizeOut), size),
          panel.exportGroup)));
    },
  });
})();
