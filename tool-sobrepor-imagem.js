/* Ferramenta: Sobrepor na imagem (imagem por cima da foto, em formato de feed ou story). */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h, IU = window.ImageUtils;

  // Desenha a sobreposição; scale = 1 na imagem final, menor na prévia.
  // O que passar das bordas é cortado pelo próprio quadro.
  function drawOverlay(ctx, W, H, mark, place, opacity, scale) {
    if (!mark) return;
    var r = DF.overlayRect(W, H, mark, place), k = scale || 1;
    ctx.save();
    ctx.globalAlpha = opacity / 100;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mark.img, r.x * k, r.y * k, r.w * k, r.h * k);
    ctx.restore();
  }

  DF.register({
    id: 'sobrepor-imagem', group: 'imagem', label: 'Sobrepor na imagem', icon: 'layers',
    title: ['Sobrepor na', 'imagem.'],
    lead: 'Coloque uma imagem por cima da foto, escolhendo posição, opacidade e tamanho.',
    mount: function (body, ctx) {
      var notice = DF.noticeBox();
      var base = null, baseFile = null, mark = null, resultLink = null;
      var settings = { opacity: 100 };
      var canvas = h('canvas', { 'aria-label': 'Prévia da imagem com a sobreposição' });
      var empty = h('div', { class: 'tool-preview-empty', text: 'Escolha a foto e a sobreposição para ver a prévia' });
      var preview = h('div', { class: 'tool-preview' }, empty, canvas);
      canvas.hidden = true;

      var baseDrop = DF.dropZone({ accept: 'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp', title: 'Foto (base)', pickLabel: 'escolher', hint: 'JPG, PNG ou WebP', small: true, onFiles: function (f) { pick(f[0], 'base'); } });
      var markDrop = DF.dropZone({ accept: 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp', title: 'Sobreposição', pickLabel: 'escolher', hint: 'PNG, JPG/JPEG ou WebP', small: true, onFiles: function (f) { pick(f[0], 'mark'); } });
      var opacityOut = h('output', { class: 'mono', text: '100%' });
      var sizeOut = h('output', { class: 'mono', text: '30%' });
      var opacity = h('input', { type: 'range', min: '10', max: '100', step: '5', value: '100', id: 'sobrepor-img-opacidade' });
      var size = h('input', { type: 'range', min: '2', max: '500', step: '1', value: '30', id: 'sobrepor-img-tamanho' });
      var busy = false;
      var editor = DF.overlayEditor({
        host: preview, canvas: canvas,
        mark: function () { return base ? mark : null; },
        frame: function () { return outSize(); },
        disabled: function () { return busy; },
        onChange: function (v) { var pct = Math.round(v.sw * 100); size.value = String(pct); sizeOut.textContent = pct + '%'; resultBox.hidden = true; draw(); },
      });
      var fmt = { format: DF.FORMATS[0], fit: 'cover' };
      var format = DF.formatControls('sobrepor-img', function (v) { fmt = v; resultBox.hidden = true; draw(); editor.layout(); });
      var go = h('button', { type: 'button', class: 'button button-primary button-wide', text: 'Gerar imagem', disabled: true });
      var resultBox = h('div', { class: 'palco-result', hidden: true });

      opacity.addEventListener('input', function () { settings.opacity = Number(opacity.value); opacityOut.textContent = opacity.value + '%'; draw(); });
      size.addEventListener('input', function () { editor.setWidth(Number(size.value) / 100); });

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'tool-grid tool-grid-wide' },
        preview,
        h('aside', { class: 'tool-panel' },
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Foto' }), baseDrop.el),
          format.el,
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Sobreposição' }), markDrop.el),
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Posição e tamanho' }),
            h('small', { class: 'ov-tip', text: 'Arraste a imagem na prévia para mover. Puxe os cantos ou use a rodinha do mouse para mudar o tamanho. Pode passar das bordas: o que sair do quadro some.' }),
            editor.actions),
          h('label', { class: 'palco-group', for: 'sobrepor-img-opacidade' }, h('span', { class: 'palco-label' }, 'Opacidade ', opacityOut), opacity),
          h('label', { class: 'palco-group', for: 'sobrepor-img-tamanho' }, h('span', { class: 'palco-label' }, 'Tamanho (% da largura) ', sizeOut), size),
          h('div', { class: 'palco-group' }, go, resultBox))));

      function pick(file, which) {
        if (!file) return;
        notice.set('');
        IU.load(file).then(function (loaded) {
          if (which === 'base') { if (base) URL.revokeObjectURL(base.url); base = loaded; baseFile = file; baseDrop.setTitle(file.name); }
          else { if (mark) URL.revokeObjectURL(mark.url); mark = loaded; markDrop.setTitle(file.name); }
          resultBox.hidden = true;
          draw();
          if (base && mark) editor.markLoaded(); else editor.layout();
        }, function (error) { notice.set(error.message); });
      }

      // Tamanho final: o da foto ou o do formato escolhido (feed/story)
      function outSize() { return fmt.format.w ? { w: fmt.format.w, h: fmt.format.h } : { w: base.width, h: base.height }; }
      function drawBase(c, w, hh) {
        if (!fmt.format.w) { c.drawImage(base.img, 0, 0, w, hh); return; }
        var r = DF.fitRect(base.width, base.height, w, hh, fmt.fit);
        c.fillStyle = '#000'; c.fillRect(0, 0, w, hh);
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(base.img, r.x, r.y, r.w, r.h);
      }

      function draw() {
        go.disabled = !(base && mark);
        if (!base) return;
        // Prévia reduzida (rápida); a imagem final é gerada no tamanho original
        var out = outSize();
        var scale = Math.min(1, 1400 / Math.max(out.w, out.h));
        var w = Math.round(out.w * scale), hh = Math.round(out.h * scale);
        canvas.width = w; canvas.height = hh;
        var c = canvas.getContext('2d');
        c.imageSmoothingQuality = 'high';
        drawBase(c, w, hh);
        drawOverlay(c, out.w, out.h, mark, editor.value(), settings.opacity, scale);
        canvas.hidden = false; empty.hidden = true;
      }

      go.addEventListener('click', function () {
        if (!base || !mark) return;
        go.disabled = true; go.textContent = 'Gerando…'; busy = true; editor.setDisabled(true);
        ctx.setActivity({ active: true, unsaved: true });
        var out;
        try {
          if (base.width * base.height > IU.MAX_PIXELS) throw new Error('A foto é grande demais (máximo ~50 MP).');
          var dim = outSize();
          out = IU.makeCanvas(dim.w, dim.h);
          drawBase(out.ctx, dim.w, dim.h);
          drawOverlay(out.ctx, dim.w, dim.h, mark, editor.value(), settings.opacity, 1);
        } catch (error) { done(error); return; }
        IU.encode(out.canvas, IU.kindOf(baseFile)).then(function (encoded) {
          if (resultLink) resultLink._revoke();
          resultLink = DF.downloadLink(encoded.blob, DF.stem(baseFile.name) + '-sobreposicao' + encoded.ext, 'Baixar imagem', function () { ctx.setActivity({ active: false, unsaved: false }); });
          resultBox.textContent = '';
          resultBox.appendChild(h('small', { class: 'palco-note', text: out.canvas.width + '×' + out.canvas.height + ' · ' + DF.formatBytes(encoded.blob.size) + ' · sem metadados' }));
          resultBox.appendChild(resultLink);
          resultBox.hidden = false;
          done(null, true);
        }).catch(done);
      });

      function done(error, ok) {
        go.textContent = 'Gerar imagem'; busy = false; editor.setDisabled(false);
        go.disabled = !(base && mark);
        if (error) notice.set(error.message || 'Não foi possível gerar a imagem.');
        ctx.setActivity({ active: false, unsaved: !!ok });
      }
    },
  });
})();
