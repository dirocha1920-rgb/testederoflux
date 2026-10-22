/* Ferramenta: Imagem para vídeo (5 a 30 segundos, feed ou story). Usa image-video.js. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h, IU = window.ImageUtils, IV = window.ImagemVideo;
  var DURATIONS = [5, 10, 15, 20, 25, 30];

  DF.register({
    id: 'imagem-video', group: 'vídeo', label: 'Imagem para vídeo', icon: 'film',
    title: ['Imagem para', 'vídeo.'],
    lead: 'Transforma fotos em vídeos MP4 de 5 a 30 segundos, em feed ou story, com áudio silencioso pronto para anúncios.',
    mount: function (body, ctx) {
      var images = [], jobs = [], seconds = 10, effect = 'parada', fmt = { format: DF.FORMATS[0], fit: 'cover' };
      var notice = DF.noticeBox();
      var canvas = h('canvas', { 'aria-label': 'Prévia do vídeo' });
      var empty = h('div', { class: 'tool-preview-empty', text: 'Escolha uma ou mais imagens para ver a prévia' });
      var preview = h('div', { class: 'tool-preview' }, empty, canvas);
      var previewInfo = h('p', { class: 'palco-note iv-preview-info' });
      canvas.hidden = true;

      var drop = DF.dropZone({ accept: 'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp', multiple: true, title: 'Imagens', pickLabel: 'escolher', hint: 'JPG, PNG ou WebP · várias de uma vez', small: true, onFiles: addImages });
      var chosen = h('ul', { class: 'iv-chosen' });
      var format = DF.formatControls('iv', function (v) { fmt = v; restartPreview(); });
      var pills = DURATIONS.map(function (s) {
        var b = h('button', { type: 'button', class: 'bv-pill', 'aria-pressed': String(s === seconds), text: s + 's' });
        b.addEventListener('click', function () { seconds = s; paintPills(); restartPreview(); });
        b.dataset.s = s;
        return b;
      });
      function paintPills() { pills.forEach(function (b) { var on = Number(b.dataset.s) === seconds; b.classList.toggle('bv-pill-on', on); b.setAttribute('aria-pressed', String(on)); }); }
      var effectSel = h('select', { class: 'palco-select', id: 'iv-efeito' },
        h('option', { value: 'parada', text: 'Imagem parada' }),
        h('option', { value: 'zoom-in', text: 'Zoom lento (aproximando)' }),
        h('option', { value: 'zoom-out', text: 'Zoom lento (afastando)' }));
      effectSel.addEventListener('change', function () { effect = effectSel.value; restartPreview(); });
      var go = h('button', { type: 'button', class: 'button button-primary button-wide', text: 'Gerar vídeo', disabled: true });
      var speedNote = h('small', { class: 'palco-note', text: '' });

      var list = h('div');
      var clearBtn = h('button', { class: 'text-button', type: 'button', text: 'Limpar a lista', hidden: true });
      var zip = DF.zipButton({
        getFiles: function () { return jobs.filter(function (j) { return j.result; }).slice().reverse().map(function (j) { return { name: j.name, blob: j.result.blob }; }); },
        zipName: function () { return 'imagens-em-video_' + DF.stamp() + '.zip'; },
        onDone: function () { jobs.forEach(function (j) { if (j.result) j.downloaded = true; }); report(); },
        onError: function () { notice.set('Não foi possível montar o zip neste navegador. Baixe os vídeos um por um.'); },
      });

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'tool-grid tool-grid-wide' },
        h('div', { class: 'iv-stage' }, preview, previewInfo),
        h('aside', { class: 'tool-panel' },
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Imagens' }), drop.el, chosen),
          format.el,
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Duração' }), h('div', { class: 'bv-pills iv-pills' }, pills)),
          h('label', { class: 'palco-group', for: 'iv-efeito' }, h('span', { class: 'palco-label', text: 'Efeito' }), effectSel),
          h('div', { class: 'palco-group' }, go, speedNote))));
      body.appendChild(h('section', { class: 'queue-section iv-results' },
        h('div', { class: 'section-heading' },
          h('div', null, h('div', { class: 'panel-kicker', text: 'resultados' }), h('h2', { text: 'Vídeos gerados' })),
          h('div', { class: 'queue-actions' }, clearBtn, zip.el)),
        list));
      paintPills();
      IV.supportsFast().then(function (fast) {
        speedNote.textContent = fast
          ? 'MP4 (H.264) a 30 fps, com áudio AAC silencioso de 128 kbps. Leva poucos segundos por vídeo.'
          : 'Neste navegador o vídeo é gravado em tempo real (um vídeo de 10s leva 10s) e sai sem a faixa de áudio. Para MP4 rápido com áudio, use o Chrome ou o Edge.';
      });

      // ---------------------------------------------- imagens escolhidas
      function addImages(files) {
        notice.set('');
        files.reduce(function (p, file) {
          return p.then(function () {
            return IU.load(file).then(function (loaded) { images.push({ file: file, img: loaded.img, url: loaded.url }); }, function (e) { notice.set(file.name + ': ' + e.message); });
          });
        }, Promise.resolve()).then(function () { renderChosen(); restartPreview(); });
      }
      function renderChosen() {
        chosen.textContent = '';
        images.forEach(function (im, i) {
          chosen.appendChild(h('li', { class: 'iv-chip' },
            h('img', { src: im.url, alt: '' }), h('span', { text: im.file.name, title: im.file.name }),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + im.file.name, onclick: function () { URL.revokeObjectURL(im.url); images.splice(i, 1); renderChosen(); restartPreview(); } }, DF.svg('trash'))));
        });
        go.disabled = !images.length;
        go.textContent = images.length > 1 ? 'Gerar ' + images.length + ' vídeos' : 'Gerar vídeo';
        drop.setTitle(images.length ? images.length + (images.length > 1 ? ' imagens' : ' imagem') : 'Imagens');
      }

      // ---------------------------------------------- prévia animada
      var raf = 0, t0 = 0;
      function restartPreview() {
        cancelAnimationFrame(raf);
        if (!images.length) { canvas.hidden = true; empty.hidden = false; previewInfo.textContent = ''; return; }
        var img = images[0].img, size = IV.outputSize(img, fmt.format.w ? fmt.format : null);
        var s = Math.min(1, 720 / Math.max(size.w, size.h));
        canvas.width = Math.round(size.w * s); canvas.height = Math.round(size.h * s);
        canvas.hidden = false; empty.hidden = true;
        previewInfo.textContent = 'Prévia de ' + images[0].file.name + ' · sai em ' + size.w + '×' + size.h + ', ' + seconds + ' segundos';
        var c = canvas.getContext('2d');
        t0 = performance.now();
        (function loop() {
          var t = ((performance.now() - t0) / (seconds * 1000)) % 1;
          if (canvas.offsetParent || effect === 'parada') IV.drawFrame(c, img, canvas.width, canvas.height, fmt.fit, effect, t);
          if (effect !== 'parada') raf = requestAnimationFrame(loop);
        })();
      }

      // ---------------------------------------------- gerar
      function report() {
        var busy = jobs.some(function (j) { return !j.result && !j.error; });
        ctx.setActivity({ active: busy, unsaved: busy || jobs.some(function (j) { return j.result && !j.downloaded; }) });
      }
      go.addEventListener('click', async function () {
        if (!images.length) return;
        var batch = images.slice(), options = { seconds: seconds, format: fmt.format.w ? fmt.format : null, fit: fmt.fit, effect: effect };
        go.disabled = true; format.setDisabled(true);
        batch.forEach(function (im) {
          jobs.unshift({ image: im, options: options, progress: 0, name: DF.stem(im.file.name) + '-' + options.seconds + 's.mp4' });
        });
        render();
        var mine = jobs.slice(0, batch.length).reverse();
        for (var i = 0; i < mine.length; i++) {
          var job = mine[i];
          try {
            job.result = await IV.make(job.image.img, Object.assign({}, job.options, { onProgress: function (p) { job.progress = p; updateBar(job); } }));
            job.name = DF.stem(job.image.file.name) + '-' + job.options.seconds + 's' + job.result.ext;
            job.url = URL.createObjectURL(job.result.blob);
          } catch (error) {
            job.error = (error && error.name === 'ImageVideoError') || (error && error.name === 'AudioFixError') ? error.message : 'Não foi possível gerar este vídeo neste navegador.';
            if (window.console) console.error(error);
          }
          render();
        }
        go.disabled = !images.length; format.setDisabled(false);
      });

      function updateBar(job) { if (job.bar) job.bar.style.width = Math.round(job.progress * 100) + '%'; }
      function removeJob(job) { if (job.url) URL.revokeObjectURL(job.url); jobs = jobs.filter(function (j) { return j !== job; }); render(); }
      clearBtn.addEventListener('click', function () { jobs.filter(function (j) { return j.result || j.error; }).forEach(removeJob); });

      function render() {
        list.textContent = '';
        var done = jobs.filter(function (j) { return j.result; }).length;
        clearBtn.hidden = !jobs.some(function (j) { return j.result || j.error; });
        zip.update(done);
        report();
        if (!jobs.length) {
          list.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-number', text: '00' }),
            h('div', null, h('h3', { text: 'Nada por aqui ainda' }), h('p', { text: 'Os vídeos gerados aparecem aqui.' }))));
          return;
        }
        var wrap = h('div', { class: 'jobs-list' });
        jobs.forEach(function (job) {
          var status = job.result ? 'completed' : job.error ? 'failed' : 'processing';
          var label = job.result ? 'pronto' : job.error ? 'não concluído' : 'gerando';
          var r = job.result;
          var el = h('article', { class: 'job-card' + (job.error ? ' job-card-failed' : '') },
            h('div', { class: 'job-card-main job-card-main-thumb' },
              h('div', { class: 'job-select-wrap' }, h('img', { class: 'img-thumb', src: job.image.url, alt: '' })),
              h('div', { class: 'job-identity' }, h('strong', { text: job.name, title: job.name }),
                h('span', { class: 'job-meta', text: r ? r.width + '×' + r.height + ' · ' + job.options.seconds + 's · ' + DF.formatBytes(r.blob.size) : job.options.seconds + ' segundos' })),
              h('span', { class: 'status-pill status-' + status }, h('span', { class: 'status-dot' }), label),
              h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + job.name + ' da lista', disabled: !job.result && !job.error, onclick: function () { removeJob(job); } }, DF.svg('trash'))));
          if (!job.result && !job.error) {
            job.bar = h('span'); updateBar(job);
            el.appendChild(h('div', { class: 'progress-track' }, job.bar));
          }
          if (job.error) el.appendChild(h('p', { class: 'job-error', text: job.error }));
          if (r) {
            el.appendChild(h('div', { class: 'job-success', role: 'status' },
              h('span', { class: 'success-mark', 'aria-hidden': 'true' }, DF.svg('check')),
              h('span', { class: 'job-success-copy', text: r.fast ? 'Vídeo MP4 pronto, com áudio de 128 kbps.' : 'Vídeo pronto (gravado em tempo real, sem áudio).' }),
              h('a', { class: 'button button-secondary job-download', href: job.url, download: job.name, onclick: function () { job.downloaded = true; report(); } }, DF.svg('download'), ' Baixar vídeo')));
          }
          wrap.appendChild(el);
        });
        list.appendChild(wrap);
      }
      render();
    },
  });
})();
