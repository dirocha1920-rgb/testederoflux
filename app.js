/* Interface do limpador no navegador. A limpeza fica em cleaner.js. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var jobs = [];
  var queue = Promise.resolve();
  var nextId = 1;
  var STAGES = { esperando: 'na fila', lendo: 'lendo o arquivo', limpando: 'removendo metadados', conferindo: 'conferindo o resultado', pronto: 'pronto', erro: 'não concluído' };

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function svg(path) {
    var ns = 'http://www.w3.org/2000/svg';
    var el = document.createElementNS(ns, 'svg');
    [['class', 'icon'], ['viewBox', '0 0 24 24'], ['aria-hidden', 'true'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'], ['stroke-linecap', 'square']]
      .forEach(function (a) { el.setAttribute(a[0], a[1]); });
    var p = document.createElementNS(ns, 'path'); p.setAttribute('d', path); el.appendChild(p);
    return el;
  }
  var ICON = { check: 'm5 12 4 4L19 6', download: 'M12 4v11m-4-4 4 4 4-4M5 20h14', trash: 'M4 7h16M10 11v5m4-5v5M6 7l1 13h10l1-13M9 7l1-3h4l1 3' };

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'], i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? String(v) : v.toFixed(v < 10 ? 1 : 0)).replace('.', ',') + ' ' + units[i];
  }

  function cleanName(name) {
    var dot = name.lastIndexOf('.');
    return (dot > 0 ? name.slice(0, dot) : name) + '-limpo' + (dot > 0 ? name.slice(dot).toLowerCase() : '.mp4');
  }

  function notice(text) { $('notice-text').textContent = text || ''; $('notice').hidden = !text; }

  // Confere se o navegador consegue abrir o vídeo limpo
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

  // ------------------------------------------------------------ fila
  function addFiles(list) {
    if (!window.LimpadorMP4) { notice('A página não carregou direito. Recarregue e tente de novo.'); return; }
    var rejected = [];
    Array.prototype.forEach.call(list, function (file) {
      if (!file.size) return;
      if (!LimpadorMP4.SUPPORTED.test(file.name)) { rejected.push(file.name); return; }
      var job = { id: nextId++, file: file, stage: 'esperando', result: null, error: null, url: null, playable: null, confirming: false };
      jobs.unshift(job);
      queue = queue.then(function () { return run(job); });
    });
    notice(rejected.length ? 'Não adicionados (formato não aceito; use MP4, MOV, M4V ou 3GP): ' + rejected.join(', ') + '.' : '');
    render();
  }

  function run(job) {
    if (job.removed) return Promise.resolve();
    job.stage = 'lendo'; render();
    return LimpadorMP4.clean(job.file, { onProgress: function (stage) { job.stage = stage; render(); } })
      .then(function (result) {
        job.result = result;
        job.url = URL.createObjectURL(result.blob);
        job.stage = 'conferindo'; render();
        return playbackCheck(job.url).then(function (playable) { job.playable = playable; job.stage = 'pronto'; render(); });
      })
      .catch(function (error) {
        job.stage = 'erro';
        job.error = error && error.name !== 'Error' && !(error instanceof LimpadorMP4.CleanError)
          ? 'Não foi possível limpar este arquivo. Ele pode estar corrompido ou usar um formato que esta versão ainda não entende.'
          : (error && error.message) || 'Não foi possível limpar este arquivo.';
        render();
      });
  }

  function removeJob(job) {
    job.removed = true;
    if (job.url) URL.revokeObjectURL(job.url);
    jobs = jobs.filter(function (j) { return j !== job; });
    render();
  }

  // ------------------------------------------------------------ tela
  function render() {
    var box = $('jobs'); box.textContent = '';
    $('clear').hidden = !jobs.some(function (j) { return j.stage === 'pronto' || j.stage === 'erro'; });
    if (!jobs.length) {
      box.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-number', text: '00' }),
        h('div', null, h('h3', { text: 'Nada por aqui ainda' }), h('p', { text: 'Os vídeos limpos aparecem aqui.' }))));
      return;
    }
    var list = h('div', { class: 'jobs-list' });
    jobs.forEach(function (job) { list.appendChild(card(job)); });
    box.appendChild(list);
  }

  function card(job) {
    var r = job.result;
    var status = job.stage === 'pronto' ? 'completed' : job.stage === 'erro' ? 'failed' : job.stage === 'esperando' ? 'queued' : 'processing';
    var meta = formatBytes(job.file.size) + (r ? ' → ' + formatBytes(r.cleanSize) : '');
    var el = h('article', { class: 'job-card' + (job.stage === 'erro' ? ' job-card-failed' : '') },
      h('div', { class: 'job-card-main' },
        h('div', { class: 'job-select-wrap' }, h('span', { class: 'job-bullet', 'aria-hidden': 'true' })),
        h('div', { class: 'job-identity' }, h('strong', { text: job.file.name, title: job.file.name }), h('span', { class: 'job-meta', text: meta })),
        h('span', { class: 'status-pill status-' + status }, h('span', { class: 'status-dot' }), STAGES[job.stage]),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + job.file.name + ' da lista', onclick: function () { removeJob(job); } }, svg(ICON.trash))));
    if (job.stage !== 'pronto' && job.stage !== 'erro') {
      var bar = h('span'); bar.style.width = ({ esperando: 0, lendo: 25, limpando: 60, conferindo: 90 })[job.stage] + '%';
      el.appendChild(h('div', { class: 'progress-track' }, bar));
    }
    if (job.error) el.appendChild(h('p', { class: 'job-error', text: job.error }));
    if (r) {
      if (r.found.length) {
        el.appendChild(h('div', { class: 'found-title', text: 'encontrado e removido' }));
        var ul = h('ul', { class: 'found-list' });
        r.found.forEach(function (item) {
          ul.appendChild(h('li', null, h('b', { text: item.label }), item.value ? h('span', { text: ' · ' + item.value }) : null));
        });
        el.appendChild(ul);
      } else {
        el.appendChild(h('div', { class: 'found-title', text: 'nenhum metadado pessoal encontrado neste arquivo' }));
      }
      var checks = h('ul', { class: 'check-list' });
      checks.appendChild(h('li', { text: r.residual.length ? 'Atenção: a conferência ainda achou ' + r.residual.length + ' item(ns).' : 'Conferido: nenhum metadado sobrou no arquivo limpo.' }));
      if (r.residual.length) checks.lastChild.className = 'check-warn';
      checks.appendChild(h('li', { text: 'Imagem e som intactos (sem recodificação).' }));
      if (r.wipedBytes) checks.appendChild(h('li', { text: 'Dados das faixas removidas apagados do arquivo.' }));
      if (job.playable === true) checks.appendChild(h('li', { text: 'O vídeo limpo abre normalmente.' }));
      else if (job.playable !== null) checks.appendChild(h('li', { class: 'check-warn', text: 'Este navegador não conseguiu pré-visualizar o vídeo (comum com HEVC em alguns computadores). A limpeza foi feita do mesmo jeito.' }));
      el.appendChild(checks);
    }
    if (job.stage === 'pronto') {
      el.appendChild(h('div', { class: 'job-success', role: 'status' },
        h('span', { class: 'success-mark', 'aria-hidden': 'true' }, svg(ICON.check)),
        h('span', { class: 'job-success-copy', text: r.residual.length ? 'Limpeza concluída com avisos.' : 'Metadados limpos com sucesso!' }),
        h('a', { class: 'button button-secondary job-download', href: job.url, download: cleanName(job.file.name), onclick: function () { job.downloaded = true; } }, svg(ICON.download), ' Baixar vídeo')));
    }
    return el;
  }

  // ------------------------------------------------------------ eventos
  var drop = $('drop');
  $('pick').addEventListener('click', function (e) { e.stopPropagation(); $('file-input').click(); });
  drop.addEventListener('click', function () { $('file-input').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file-input').click(); } });
  $('file-input').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('upload-zone-dragging'); }); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('upload-zone-dragging'); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('upload-zone-dragging'); addFiles(e.dataTransfer.files); });
  $('notice-close').addEventListener('click', function () { notice(''); });
  $('clear').addEventListener('click', function () {
    jobs.filter(function (j) { return j.stage === 'pronto' || j.stage === 'erro'; }).forEach(removeJob);
  });
  // Evita perder vídeos limpos ainda não baixados
  window.addEventListener('beforeunload', function (e) {
    if (jobs.some(function (j) { return j.stage !== 'erro' && !j.downloaded; })) { e.preventDefault(); e.returnValue = ''; }
  });

  render();
})();
