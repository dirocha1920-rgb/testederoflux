/* Ferramenta: Limpar vídeo (metadados de MP4/MOV, sem recodificar). Usa cleaner.js. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h;
  var STAGES = { esperando: 'na fila', lendo: 'lendo o arquivo', limpando: 'removendo metadados', conferindo: 'conferindo o resultado', pronto: 'pronto', erro: 'não concluído' };

  function playbackCheck(url) {
    return new Promise(function (resolve) {
      var video = document.createElement('video');
      var done = function (ok) { clearTimeout(timer); video.removeAttribute('src'); video.load(); resolve(ok); };
      var timer = setTimeout(function () { done(null); }, 10000);
      video.muted = true; video.preload = 'auto';
      video.onloadeddata = function () { done(true); };
      video.onerror = function () { done(false); };
      video.src = url;
    });
  }

  DF.register({
    id: 'limpar-video', group: 'vídeo', label: 'Limpar vídeo', icon: 'video',
    title: ['Limpar', 'vídeo.'],
    mount: function (body, ctx) {
      var jobs = [];
      var queue = Promise.resolve();
      var nextId = 1;
      var notice = DF.noticeBox();
      var list = h('div');
      var clearBtn = h('button', { class: 'text-button', type: 'button', text: 'Limpar a lista', hidden: true });
      function cleanName(job) {
        var dot = job.file.name.lastIndexOf('.');
        return (dot > 0 ? job.file.name.slice(0, dot) : job.file.name) + '-limpo' + (dot > 0 ? job.file.name.slice(dot).toLowerCase() : '.mp4');
      }
      var zip = DF.zipButton({
        getFiles: function () { return jobs.filter(function (j) { return j.stage === 'pronto'; }).slice().reverse().map(function (j) { return { name: cleanName(j), blob: j.result.blob }; }); },
        zipName: function () { return 'videos-limpos_' + DF.stamp() + '.zip'; },
        onDone: function () { jobs.forEach(function (j) { if (j.stage === 'pronto') j.downloaded = true; }); report(); },
        onError: function () { notice.set('Não foi possível montar o zip neste navegador. Baixe os vídeos um por um.'); },
      });
      var drop = DF.dropZone({
        accept: 'video/mp4,video/quicktime,video/3gpp,.mp4,.mov,.m4v,.3gp,.3g2', multiple: true,
        title: 'Arraste os vídeos para cá', pickLabel: 'escolha os arquivos', hint: 'MP4, MOV, M4V ou 3GP (os formatos dos celulares)',
        onFiles: addFiles,
      });

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'upload-column' },
        h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: '01 / vídeos' }), h('h2', { text: 'Escolha os vídeos' }))),
        drop.el));
      body.appendChild(h('section', { class: 'queue-section' },
        h('div', { class: 'section-heading' },
          h('div', null, h('div', { class: 'panel-kicker', text: '02 / resultados' }), h('h2', { text: 'Vídeos limpos' })),
          h('div', { class: 'queue-actions' }, clearBtn, zip.el)),
        list));

      clearBtn.addEventListener('click', function () {
        jobs.filter(function (j) { return j.stage === 'pronto' || j.stage === 'erro'; }).forEach(removeJob);
      });

      function report() {
        var busy = jobs.some(function (j) { return j.stage !== 'pronto' && j.stage !== 'erro'; });
        var unsaved = busy || jobs.some(function (j) { return j.stage === 'pronto' && !j.downloaded; });
        ctx.setActivity({ active: busy, unsaved: unsaved });
      }

      function addFiles(files) {
        var rejected = [];
        Array.prototype.forEach.call(files, function (file) {
          if (!file.size) return;
          if (!LimpadorMP4.SUPPORTED.test(file.name)) { rejected.push(file.name); return; }
          var job = { file: file, id: nextId++, stage: 'esperando', result: null, error: null, url: null, playable: null };
          jobs.unshift(job);
          queue = queue.then(function () { return run(job); });
        });
        notice.set(rejected.length ? 'Não adicionados (formato não aceito; use MP4, MOV, M4V ou 3GP): ' + rejected.join(', ') + '.' : '');
        render();
      }

      function run(job) {
        if (job.removed) return Promise.resolve();
        job.stage = 'lendo'; render();
        return LimpadorMP4.clean(job.file, { onProgress: function (s) { job.stage = s; render(); } })
          .then(function (result) {
            job.result = result;
            job.url = URL.createObjectURL(result.blob);
            job.stage = 'conferindo'; render();
            return playbackCheck(job.url).then(function (playable) { job.playable = playable; job.stage = 'pronto'; render(); });
          })
          .catch(function (error) {
            job.stage = 'erro';
            job.error = error instanceof LimpadorMP4.CleanError ? error.message
              : 'Não foi possível limpar este arquivo. Ele pode estar corrompido ou usar um formato que esta versão ainda não entende.';
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
        zip.update(jobs.filter(function (j) { return j.stage === 'pronto'; }).length);
        report();
        if (!jobs.length) {
          list.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-number', text: '00' }),
            h('div', null, h('h3', { text: 'Nada por aqui ainda' }), h('p', { text: 'Os vídeos limpos aparecem aqui.' }))));
          return;
        }
        var wrap = h('div', { class: 'jobs-list' });
        jobs.forEach(function (job) { wrap.appendChild(card(job)); });
        list.appendChild(wrap);
      }

      function card(job) {
        var r = job.result;
        var status = job.stage === 'pronto' ? 'completed' : job.stage === 'erro' ? 'failed' : job.stage === 'esperando' ? 'queued' : 'processing';
        var el = h('article', { class: 'job-card' + (job.stage === 'erro' ? ' job-card-failed' : '') },
          h('div', { class: 'job-card-main' },
            h('div', { class: 'job-select-wrap' }, h('span', { class: 'job-bullet', 'aria-hidden': 'true' })),
            h('div', { class: 'job-identity' }, h('strong', { text: job.file.name, title: job.file.name }),
              h('span', { class: 'job-meta', text: DF.formatBytes(job.file.size) + (r ? ' → ' + DF.formatBytes(r.cleanSize) : '') })),
            h('span', { class: 'status-pill status-' + status }, h('span', { class: 'status-dot' }), STAGES[job.stage]),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + job.file.name + ' da lista', onclick: function () { removeJob(job); } }, DF.svg('trash'))));
        if (job.stage !== 'pronto' && job.stage !== 'erro') {
          var bar = h('span'); bar.style.width = ({ esperando: 0, lendo: 25, limpando: 60, conferindo: 90 })[job.stage] + '%';
          el.appendChild(h('div', { class: 'progress-track' }, bar));
        }
        if (job.error) el.appendChild(h('p', { class: 'job-error', text: job.error }));
        if (job.stage === 'pronto') {
          var name = cleanName(job);
          el.appendChild(h('div', { class: 'job-success', role: 'status' },
            h('span', { class: 'success-mark', 'aria-hidden': 'true' }, DF.svg('check')),
            h('span', { class: 'job-success-copy', text: r.residual.length ? 'Limpeza concluída com avisos.' : 'Metadados limpos com sucesso!' }),
            h('a', { class: 'button button-secondary job-download', href: job.url, download: name, onclick: function () { job.downloaded = true; report(); } }, DF.svg('download'), ' Baixar vídeo')));
        }
        return el;
      }

      render();
    },
  });
})();
