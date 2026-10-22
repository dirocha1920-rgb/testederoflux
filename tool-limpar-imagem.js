/* Ferramenta: Limpar imagem (JPG/PNG/WebP sem recodificar). Usa image-cleaner.js. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h;
  var STAGES = { esperando: 'na fila', limpando: 'limpando', pronto: 'pronto', erro: 'não concluído' };

  function decodes(blob) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return createImageBitmap(blob).then(function (bmp) { var ok = bmp.width > 0; if (bmp.close) bmp.close(); return ok; }, function () { return false; });
  }

  DF.register({
    id: 'limpar-imagem', group: 'imagem', label: 'Limpar imagem', icon: 'image',
    title: ['Limpar', 'imagem.'],
    mount: function (body, ctx) {
      var jobs = [];
      var queue = Promise.resolve();
      var notice = DF.noticeBox();
      var list = h('div');
      var clearBtn = h('button', { class: 'text-button', type: 'button', text: 'Limpar a lista', hidden: true });
      var drop = DF.dropZone({
        accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', multiple: true,
        title: 'Arraste as fotos para cá', pickLabel: 'escolha os arquivos', hint: 'JPG, PNG ou WebP',
        onFiles: addFiles,
      });
      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'upload-column' },
        h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: '01 / fotos' }), h('h2', { text: 'Escolha as fotos' }))),
        drop.el));
      body.appendChild(h('section', { class: 'queue-section' },
        h('div', { class: 'section-heading' },
          h('div', null, h('div', { class: 'panel-kicker', text: '02 / resultados' }), h('h2', { text: 'Fotos limpas' })),
          h('div', { class: 'queue-actions' }, clearBtn)),
        list));
      clearBtn.addEventListener('click', function () { jobs.filter(function (j) { return j.stage === 'pronto' || j.stage === 'erro'; }).forEach(removeJob); });

      function report() {
        var busy = jobs.some(function (j) { return j.stage === 'esperando' || j.stage === 'limpando'; });
        ctx.setActivity({ active: busy, unsaved: busy || jobs.some(function (j) { return j.stage === 'pronto' && !j.downloaded; }) });
      }

      function addFiles(files) {
        var rejected = [];
        Array.prototype.forEach.call(files, function (file) {
          if (!file.size) return;
          if (!LimpadorImagem.SUPPORTED.test(file.name) && !/^image\/(jpeg|png|webp)$/.test(file.type)) { rejected.push(file.name); return; }
          var job = { file: file, stage: 'esperando' };
          jobs.unshift(job);
          queue = queue.then(function () { return run(job); });
        });
        notice.set(rejected.length ? 'Não adicionados (use JPG, PNG ou WebP): ' + rejected.join(', ') + '.' : '');
        render();
      }

      function run(job) {
        if (job.removed) return Promise.resolve();
        job.stage = 'limpando'; render();
        return LimpadorImagem.clean(job.file).then(function (result) {
          job.result = result;
          job.url = URL.createObjectURL(result.blob);
          return decodes(result.blob).then(function (ok) { job.decodes = ok; job.stage = 'pronto'; render(); });
        }).catch(function (error) {
          job.stage = 'erro';
          job.error = error instanceof LimpadorImagem.ImageCleanError ? error.message : 'Não foi possível limpar esta imagem. Ela pode estar corrompida.';
          render();
        });
      }

      function removeJob(job) {
        job.removed = true;
        if (job.url) URL.revokeObjectURL(job.url);
        jobs = jobs.filter(function (j) { return j !== job; });
        render();
      }

      function render() {
        list.textContent = '';
        clearBtn.hidden = !jobs.some(function (j) { return j.stage === 'pronto' || j.stage === 'erro'; });
        report();
        if (!jobs.length) {
          list.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-number', text: '00' }),
            h('div', null, h('h3', { text: 'Nada por aqui ainda' }), h('p', { text: 'As fotos limpas aparecem aqui.' }))));
          return;
        }
        var wrap = h('div', { class: 'jobs-list' });
        jobs.forEach(function (job) { wrap.appendChild(card(job)); });
        list.appendChild(wrap);
      }

      function card(job) {
        var r = job.result;
        var status = job.stage === 'pronto' ? 'completed' : job.stage === 'erro' ? 'failed' : job.stage === 'esperando' ? 'queued' : 'processing';
        var lead = job.url ? h('img', { class: 'img-thumb', src: job.url, alt: '' }) : h('span', { class: 'job-bullet', 'aria-hidden': 'true' });
        var el = h('article', { class: 'job-card' + (job.stage === 'erro' ? ' job-card-failed' : '') },
          h('div', { class: 'job-card-main job-card-main-thumb' },
            h('div', { class: 'job-select-wrap' }, lead),
            h('div', { class: 'job-identity' }, h('strong', { text: job.file.name, title: job.file.name }),
              h('span', { class: 'job-meta', text: DF.formatBytes(job.file.size) + (r ? ' → ' + DF.formatBytes(r.cleanSize) : '') })),
            h('span', { class: 'status-pill status-' + status }, h('span', { class: 'status-dot' }), STAGES[job.stage]),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + job.file.name + ' da lista', onclick: function () { removeJob(job); } }, DF.svg('trash'))));
        if (job.error) el.appendChild(h('p', { class: 'job-error', text: job.error }));
        if (job.stage === 'pronto') {
          el.appendChild(h('div', { class: 'job-success', role: 'status' },
            h('span', { class: 'success-mark', 'aria-hidden': 'true' }, DF.svg('check')),
            h('span', { class: 'job-success-copy', text: r.residual.length ? 'Limpeza concluída com avisos.' : 'Metadados limpos com sucesso!' }),
            h('a', { class: 'button button-secondary job-download', href: job.url, download: DF.stem(job.file.name) + '-limpa' + (DF.ext(job.file.name) || '.jpg'), onclick: function () { job.downloaded = true; report(); } }, DF.svg('download'), ' Baixar foto')));
        }
        return el;
      }
      render();
    },
  });
})();
