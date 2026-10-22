/* Ferramenta: Ajustar áudio (bitrate mínimo exigido pelo Kwai e outras plataformas). Usa audio-fix.js. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h;
  var STAGES = { esperando: 'na fila', ajustando: 'ajustando', pronto: 'pronto', ok: 'já estava ok', erro: 'não concluído' };

  function kbps(bps) { return Math.round(bps / 1000) + ' kbps'; }

  DF.register({
    id: 'ajustar-audio', group: 'vídeo', label: 'Ajustar áudio', icon: 'audio',
    title: ['Ajustar', 'áudio.'],
    lead: 'Corrige o erro "Audio bitrate should be no less than 64kbps" do Kwai em vários vídeos de uma vez. A imagem e o som continuam idênticos.',
    mount: function (body, ctx) {
      var jobs = [], queue = Promise.resolve();
      var notice = DF.noticeBox();
      var list = h('div');
      var target = h('select', { class: 'palco-select', id: 'audio-alvo' },
        h('option', { value: '128', text: '128 kbps (recomendado)', selected: true }),
        h('option', { value: '96', text: '96 kbps' }),
        h('option', { value: '192', text: '192 kbps' }));
      var silent = h('input', { type: 'checkbox', checked: true });
      var clearBtn = h('button', { class: 'text-button', type: 'button', text: 'Limpar a lista', hidden: true });
      function outName(job) {
        var dot = job.file.name.lastIndexOf('.');
        return (dot > 0 ? job.file.name.slice(0, dot) : job.file.name) + '-audio' + (dot > 0 ? job.file.name.slice(dot).toLowerCase() : '.mp4');
      }
      function ready(j) { return j.stage === 'pronto' || j.stage === 'ok'; }
      var zip = DF.zipButton({
        getFiles: function () { return jobs.filter(ready).slice().reverse().map(function (j) { return { name: outName(j), blob: j.result.output }; }); },
        zipName: function () { return 'videos-audio-ajustado_' + DF.stamp() + '.zip'; },
        onDone: function () { jobs.forEach(function (j) { if (ready(j)) j.downloaded = true; }); report(); },
        onError: function () { notice.set('Não foi possível montar o zip neste navegador. Baixe os vídeos um por um.'); },
      });
      var drop = DF.dropZone({
        accept: 'video/mp4,video/quicktime,.mp4,.mov,.m4v', multiple: true,
        title: 'Arraste os vídeos para cá', pickLabel: 'escolha os arquivos',
        hint: 'MP4, MOV ou M4V · vários de uma vez',
        onFiles: addFiles,
      });

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'upload-column' },
        h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: '01 / vídeos' }), h('h2', { text: 'Escolha os vídeos' }))),
        drop.el,
        h('div', { class: 'audio-options' },
          h('label', { class: 'palco-group', for: 'audio-alvo' }, h('span', { class: 'palco-label', text: 'Bitrate do áudio' }), target),
          h('label', { class: 'palco-check' }, silent, ' Vídeo sem som: adicionar áudio silencioso'))));
      body.appendChild(h('section', { class: 'queue-section' },
        h('div', { class: 'section-heading' },
          h('div', null, h('div', { class: 'panel-kicker', text: '02 / resultados' }), h('h2', { text: 'Vídeos ajustados' })),
          h('div', { class: 'queue-actions' }, clearBtn, zip.el)),
        list));
      clearBtn.addEventListener('click', function () { jobs.filter(function (j) { return ready(j) || j.stage === 'erro'; }).forEach(removeJob); });

      function report() {
        var busy = jobs.some(function (j) { return j.stage === 'esperando' || j.stage === 'ajustando'; });
        ctx.setActivity({ active: busy, unsaved: busy || jobs.some(function (j) { return j.stage === 'pronto' && !j.downloaded; }) });
      }

      function addFiles(files) {
        var rejected = [];
        files.forEach(function (file) {
          if (!file.size) return;
          if (!AjustaAudio.SUPPORTED.test(file.name) && !/^video\/(mp4|quicktime)$/.test(file.type)) { rejected.push(file.name); return; }
          var job = { file: file, stage: 'esperando', options: { targetKbps: Number(target.value), addSilent: silent.checked } };
          jobs.unshift(job);
          queue = queue.then(function () { return run(job); });
        });
        notice.set(rejected.length ? 'Não adicionados (use MP4, MOV ou M4V): ' + rejected.join(', ') + '.' : '');
        render();
      }

      function run(job) {
        if (job.removed) return Promise.resolve();
        job.stage = 'ajustando'; render();
        return AjustaAudio.fix(job.file, job.options).then(function (result) {
          job.result = result;
          job.url = URL.createObjectURL(result.output);
          job.stage = result.changed ? 'pronto' : 'ok';
          render();
        }).catch(function (error) {
          job.stage = 'erro';
          job.error = error instanceof AjustaAudio.AudioFixError ? error.message : 'Não foi possível ajustar este vídeo. Ele pode estar corrompido.';
          render();
        });
      }

      function removeJob(job) {
        job.removed = true;
        if (job.url) URL.revokeObjectURL(job.url);
        jobs = jobs.filter(function (j) { return j !== job; });
        render();
      }

      function summary(r) {
        var t = r.tracks.filter(function (x) { return !x.unsupported; });
        if (r.addedSilent) return 'Vídeo sem som: áudio silencioso adicionado a ' + kbps(t[0].after) + '.';
        if (!r.changed) return 'O áudio já estava em ' + kbps(t[0] ? t[0].before : 0) + '. Nada precisou mudar.';
        return 'Áudio: ' + t.map(function (x) { return kbps(x.before) + ' → ' + kbps(x.after); }).join(', ') + '.';
      }

      function render() {
        list.textContent = '';
        clearBtn.hidden = !jobs.some(function (j) { return ready(j) || j.stage === 'erro'; });
        zip.update(jobs.filter(ready).length);
        report();
        if (!jobs.length) {
          list.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-number', text: '00' }),
            h('div', null, h('h3', { text: 'Nada por aqui ainda' }), h('p', { text: 'Os vídeos ajustados aparecem aqui.' }))));
          return;
        }
        var wrap = h('div', { class: 'jobs-list' });
        jobs.forEach(function (job) { wrap.appendChild(card(job)); });
        list.appendChild(wrap);
      }

      function card(job) {
        var r = job.result;
        var status = ready(job) ? 'completed' : job.stage === 'erro' ? 'failed' : job.stage === 'esperando' ? 'queued' : 'processing';
        var el = h('article', { class: 'job-card' + (job.stage === 'erro' ? ' job-card-failed' : '') },
          h('div', { class: 'job-card-main' },
            h('div', { class: 'job-select-wrap' }, h('span', { class: 'job-bullet', 'aria-hidden': 'true' })),
            h('div', { class: 'job-identity' }, h('strong', { text: job.file.name, title: job.file.name }),
              h('span', { class: 'job-meta', text: DF.formatBytes(job.file.size) + (r ? ' → ' + DF.formatBytes(r.outputSize) : '') })),
            h('span', { class: 'status-pill status-' + status }, h('span', { class: 'status-dot' }), STAGES[job.stage]),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + job.file.name + ' da lista', onclick: function () { removeJob(job); } }, DF.svg('trash'))));
        if (job.stage === 'ajustando') {
          var bar = h('span'); bar.style.width = '60%';
          el.appendChild(h('div', { class: 'progress-track' }, bar));
        }
        if (job.error) el.appendChild(h('p', { class: 'job-error', text: job.error }));
        if (ready(job)) {
          el.appendChild(h('div', { class: 'job-success', role: 'status' },
            h('span', { class: 'success-mark', 'aria-hidden': 'true' }, DF.svg('check')),
            h('span', { class: 'job-success-copy', text: summary(r) }),
            h('a', { class: 'button button-secondary job-download', href: job.url, download: outName(job), onclick: function () { job.downloaded = true; report(); } }, DF.svg('download'), ' Baixar vídeo')));
        }
        return el;
      }

      render();
    },
  });
})();
