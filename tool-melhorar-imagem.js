/* Ferramenta: Melhorar imagem (amplia 2×, 3× ou 4× com nitidez). */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h, IU = window.ImageUtils;

  DF.register({
    id: 'melhorar-imagem', group: 'imagem', label: 'Melhorar imagem', icon: 'sparkle',
    title: ['Melhorar', 'imagem.'],
    lead: 'Aumenta a resolução da foto com ampliação de alta qualidade e a mesma nitidez usada no servidor do Deroflux. Bom para fotos pequenas que vão ser usadas maiores. Não é IA: não inventa detalhes. A foto sai sem metadados.',
    mount: function (body, ctx) {
      var notice = DF.noticeBox();
      var source = null, file = null, scale = 2, busy = false, resultLink = null, saved = true;
      var info = h('p', { class: 'palco-note', text: 'Nenhuma foto escolhida.' });
      var drop = DF.dropZone({ accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', title: 'Arraste a foto para cá', hint: 'JPG, PNG ou WebP', onFiles: function (f) { choose(f[0]); } });
      var scales = h('div', { class: 'scale-options', role: 'radiogroup', 'aria-label': 'Escala' });
      [2, 3, 4].forEach(function (n) {
        var input = h('input', { type: 'radio', name: 'melhorar-escala', value: String(n), checked: n === 2 ? true : null });
        var label = h('label', { class: 'profile-card' + (n === 2 ? ' profile-card-selected' : '') }, input,
          h('span', { class: 'profile-card-top' }, h('strong', { text: n + '×' })), h('span', { class: 'scale-size', text: '' }));
        input.addEventListener('change', function () {
          scale = n;
          Array.prototype.forEach.call(scales.children, function (c) { c.classList.remove('profile-card-selected'); });
          label.classList.add('profile-card-selected');
          updateSizes();
        });
        scales.appendChild(label);
      });
      var go = h('button', { type: 'button', class: 'button button-primary', disabled: true }, 'Melhorar imagem ', DF.svg('sparkle'));
      var barFill = h('span'); barFill.style.width = '0%';
      var progress = h('div', { class: 'upload-progress', hidden: true }, h('div', null, h('span', { text: 'aplicando nitidez' }), h('span', { class: 'mono', text: '' })), h('div', { class: 'progress-track' }, barFill));
      var result = h('section', { class: 'queue-section', hidden: true });

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'upload-column' },
        h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: '01 / foto' }), h('h2', { text: 'Escolha a foto' }))),
        drop.el, info,
        h('fieldset', { class: 'profile-fieldset' }, h('legend', { text: 'Quanto ampliar' }), scales),
        h('div', { class: 'upload-footer' }, go),
        progress));
      body.appendChild(result);

      function updateSizes() {
        Array.prototype.forEach.call(scales.children, function (label, i) {
          var n = i + 2, span = label.querySelector('.scale-size');
          if (!source) { span.textContent = 'escolha uma foto'; label.classList.remove('profile-card-disabled'); return; }
          var w = source.width * n, hh = source.height * n, mp = w * hh / 1e6;
          span.textContent = w + '×' + hh + ' (' + mp.toFixed(1).replace('.', ',') + ' MP)' + (w * hh > IU.MAX_PIXELS ? ' · grande demais' : '');
        });
        go.disabled = busy || !source || source.width * scale * source.height * scale > IU.MAX_PIXELS;
      }

      function choose(f) {
        if (busy || !f) return;
        notice.set('');
        IU.load(f).then(function (loaded) {
          if (source) URL.revokeObjectURL(source.url);
          source = loaded; file = f;
          drop.setTitle(f.name);
          info.textContent = f.name + ' · ' + loaded.width + '×' + loaded.height + ' · ' + DF.formatBytes(f.size);
          result.hidden = true;
          updateSizes();
        }, function (error) { notice.set(error.message); });
      }

      go.addEventListener('click', function () {
        if (!source || busy) return;
        busy = true; go.disabled = true; drop.setDisabled(true);
        ctx.setActivity({ active: true, unsaved: true });
        progress.hidden = false; barFill.style.width = '0%';
        var w = source.width * scale, hh = source.height * scale;
        var started = Date.now();
        var out;
        try {
          out = IU.makeCanvas(w, hh);
          out.ctx.imageSmoothingEnabled = true;
          out.ctx.imageSmoothingQuality = 'high';
          out.ctx.drawImage(source.img, 0, 0, w, hh);
        } catch (error) { finish(error); return; }
        IU.unsharp(out.ctx, w, hh, function (pct) { barFill.style.width = pct + '%'; progress.querySelector('.mono').textContent = pct + '%'; })
          .then(function () { return IU.encode(out.canvas, IU.kindOf(file)); })
          .then(function (encoded) { showResult(encoded, w, hh, (Date.now() - started) / 1000); finish(); })
          .catch(finish);
      });

      function finish(error) {
        busy = false; drop.setDisabled(false); progress.hidden = true;
        updateSizes();
        if (error) { notice.set(error.message || 'Não foi possível melhorar esta imagem.'); ctx.setActivity({ active: false, unsaved: false }); }
      }

      function cropCanvas(img, sx, sy, sw, sh, dw, dh, smooth) {
        var c = IU.makeCanvas(dw, dh);
        c.ctx.imageSmoothingEnabled = smooth;
        c.ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
        return c.canvas;
      }

      function showResult(encoded, w, hh, seconds) {
        if (resultLink) resultLink._revoke();
        saved = false;
        ctx.setActivity({ active: false, unsaved: true });
        resultLink = DF.downloadLink(encoded.blob, DF.stem(file.name) + '-' + scale + 'x' + encoded.ext, 'Baixar imagem melhorada', function () { saved = true; ctx.setActivity({ active: false, unsaved: false }); });
        // Comparação: o mesmo pedaço do centro, antes (só ampliado) e depois
        var preview = new Image();
        preview.src = resultLink.href;
        var size = Math.min(160, source.width, source.height);
        var sx = Math.round((source.width - size) / 2), sy = Math.round((source.height - size) / 2);
        var before = cropCanvas(source.img, sx, sy, size, size, size * scale, size * scale, false);
        result.textContent = '';
        result.appendChild(h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: '02 / resultado' }), h('h2', { text: 'Imagem melhorada' })),
          h('span', { class: 'section-note mono', text: w + '×' + hh + ' · ' + DF.formatBytes(encoded.blob.size) + ' · ' + seconds.toFixed(1).replace('.', ',') + ' s' })));
        var after = h('div', { class: 'tool-preview zoom-view' });
        preview.onload = function () {
          after.appendChild(cropCanvas(preview, sx * scale, sy * scale, size * scale, size * scale, size * scale, size * scale, false));
        };
        result.appendChild(h('div', { class: 'compare' },
          h('figure', null, h('div', { class: 'tool-preview zoom-view' }, before), h('figcaption', { text: 'antes (só esticada)' })),
          h('figure', null, after, h('figcaption', { text: 'depois (ampliada + nitidez)' }))));
        result.appendChild(h('div', { class: 'upload-footer' }, resultLink));
        result.hidden = false;
      }

      updateSizes();
    },
  });
})();
