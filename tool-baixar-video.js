/* Ferramenta: Baixar vídeo do Instagram e do TikTok.
 * A página roda aqui no site; quem baixa é o servidor (Render ou VPS), cujo endereço
 * fica em config.js ou é colado na própria página. */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h;
  var VALID = /^(https?:\/\/)?([a-z0-9-]+\.)*(instagram\.com|instagr\.am|tiktok\.com)\//i;
  var KEY_SERVER = 'bv-servidor', KEY_BATCH = 'bv-lote', KEY_HANDLE = 'bv-rede';
  var TERMINAL = { done: 1, cancelled: 1, failed: 1 };
  var ITEM_TEXT = { pending: 'Na fila', downloading: 'Baixando…', done: 'Pronto', skipped: 'Pulado', error: 'Erro' };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { /* sem armazenamento */ }
    return null;
  }
  function cleanServer(raw) {
    var v = String(raw || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { var u = new URL(v); return u.protocol + '//' + u.host; } catch (e) { return ''; }
  }
  function plat(p) { return p === 'tiktok' ? 'TikTok' : 'Instagram'; }
  function size(b) { return b ? DF.formatBytes(b) : ''; }
  function duration(s) { if (!s) return ''; s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function timeoutFetch(url, options, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, Object.assign({ signal: ctl.signal }, options || {})).finally(function () { clearTimeout(t); });
  }
  async function readError(res) {
    try { var j = await res.json(); if (j && j.detail) return j.detail; } catch (e) { /* sem corpo */ }
    if (res.status === 429) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    if (res.status >= 500) return 'O servidor teve um problema. Tente de novo em instantes.';
    return 'Algo deu errado (código ' + res.status + ').';
  }

  DF.register({
    id: 'baixar-video', group: 'vídeo', label: 'Baixar vídeo', icon: 'download',
    title: ['Baixar', 'vídeo.'],
    lead: 'Cole o link de um Reel ou de um TikTok e baixe na maior qualidade disponível, sem marca d\'água.',
    mount: function (body, ctx) {
      var configured = cleanServer((window.DF_CONFIG || {}).baixarVideoServidor);
      var api = configured || cleanServer(store(KEY_SERVER));
      var ready = false, waking = null;
      var busy = { single: false, batch: false };
      function activity() { ctx.setActivity({ active: busy.single || busy.batch, unsaved: busy.single || busy.batch }); }

      // ------------------------------------------------ servidor
      var serverDot = h('span', { class: 'bv-dot' });
      var serverText = h('span', { class: 'bv-server-text', text: 'Servidor não configurado' });
      var changeBtn = h('button', { type: 'button', class: 'text-button', text: 'trocar servidor', hidden: !!configured });
      var serverBar = h('div', { class: 'bv-server', role: 'status' }, serverDot, serverText, changeBtn);

      var setupInput = h('input', { class: 'bv-input', type: 'url', id: 'bv-servidor', placeholder: 'https://seu-servico.onrender.com', autocomplete: 'off', spellcheck: 'false' });
      var setupMsg = h('p', { class: 'bv-msg', hidden: true });
      var setup = h('form', { class: 'bv-setup', novalidate: true, hidden: true },
        h('label', { class: 'palco-label', for: 'bv-servidor', text: 'Endereço do servidor' }),
        h('p', { class: 'palco-note', text: 'Cole o link que o Render mostrou depois de criar o serviço. Ele fica salvo neste navegador. Para valer para todo mundo, coloque o endereço no arquivo config.js do site.' }),
        h('div', { class: 'bv-row' }, setupInput, h('button', { type: 'submit', class: 'button button-primary', text: 'Conectar' })),
        setupMsg);

      function setServer(state, text) {
        serverBar.className = 'bv-server bv-server-' + state;
        serverText.textContent = text;
      }
      function showSetup(message) {
        setup.hidden = false; tools.hidden = true;
        setupInput.value = api || '';
        msg(setupMsg, message || '', message ? 'error' : '');
      }
      changeBtn.addEventListener('click', function () { showSetup(''); setupInput.focus(); });
      setup.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = cleanServer(setupInput.value);
        if (!v) { msg(setupMsg, 'Cole um endereço válido, como https://seu-servico.onrender.com', 'error'); return; }
        api = v; store(KEY_SERVER, v); ready = false; waking = null;
        setup.hidden = true; tools.hidden = false;
        wake();
      });

      // O plano grátis do Render "dorme": o primeiro pedido acorda o servidor (até ~1 min)
      function wake() {
        if (!api) { setServer('off', 'Servidor não configurado'); showSetup(''); return Promise.resolve(false); }
        if (ready) return Promise.resolve(true);
        if (waking) return waking;
        setServer('waking', 'Ligando o servidor… no plano grátis isso pode levar até 1 minuto.');
        waking = timeoutFetch(api + '/health', { cache: 'no-store' }, 100000).then(function (res) {
          if (!res.ok) throw new Error('status ' + res.status);
          ready = true;
          setServer('on', 'Servidor pronto');
          loadConfig();
          return true;
        }).catch(function (error) {
          waking = null;
          if (error.name === 'AbortError') { setServer('off', 'O servidor não respondeu. Tente de novo em instantes.'); return false; }
          // Distingue "fora do ar" de "este site não foi liberado no servidor" (CORS)
          return timeoutFetch(api + '/health', { mode: 'no-cors', cache: 'no-store' }, 20000).then(function () {
            setServer('off', 'O servidor respondeu, mas não liberou este site.');
            showSetup('No painel do Render, em Environment, coloque ALLOWED_ORIGINS = ' + location.origin + ' e salve. Depois clique em Conectar de novo.');
            return false;
          }, function () {
            setServer('off', 'Não consegui falar com o servidor. Confira o endereço.');
            if (!configured) showSetup('Não consegui falar com ' + api + '. Confira se o endereço está certo e se o serviço está ativo no Render.');
            return false;
          });
        });
        return waking;
      }
      async function call(path, options) {
        if (!(await wake())) throw new Error('O servidor não está disponível agora.');
        return fetch(api + path, options);
      }

      function msg(el, text, kind) {
        el.textContent = text || '';
        el.className = 'bv-msg' + (kind ? ' bv-msg-' + kind : '');
        el.hidden = !text;
      }

      // ------------------------------------------------ abas
      var tabSingle = h('button', { type: 'button', class: 'bv-tab bv-tab-on', role: 'tab', 'aria-selected': 'true', text: 'Um vídeo' });
      var tabBatch = h('button', { type: 'button', class: 'bv-tab', role: 'tab', 'aria-selected': 'false', text: 'Vários vídeos' });
      function selectTab(batch) {
        tabSingle.classList.toggle('bv-tab-on', !batch); tabSingle.setAttribute('aria-selected', String(!batch));
        tabBatch.classList.toggle('bv-tab-on', batch); tabBatch.setAttribute('aria-selected', String(batch));
        singleView.hidden = batch; batchView.hidden = !batch;
      }
      tabSingle.addEventListener('click', function () { selectTab(false); });
      tabBatch.addEventListener('click', function () { selectTab(true); });

      // ------------------------------------------------ um vídeo
      var st = { url: '', controller: null };
      var input = h('input', { class: 'bv-input', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'Cole o link do Reel ou do TikTok', 'aria-label': 'Link do vídeo' });
      var pasteBtn = h('button', { type: 'button', class: 'button button-secondary', text: 'Colar', hidden: true });
      var findBtn = h('button', { type: 'submit', class: 'button button-primary', text: 'Buscar vídeo' });
      var singleMsg = h('p', { class: 'bv-msg', role: 'status', hidden: true });
      var form = h('form', { class: 'bv-form', novalidate: true }, h('div', { class: 'bv-row' }, input, pasteBtn, findBtn));

      var thumb = h('img', { class: 'bv-thumb', alt: '' });
      var who = h('strong', { class: 'bv-who' });
      var where = h('span', { class: 'bv-where' });
      var caption = h('p', { class: 'bv-caption' });
      var qList = h('div', { class: 'bv-qualities', role: 'radiogroup', 'aria-label': 'Qualidade' });
      var qNote = h('p', { class: 'palco-note', hidden: true });
      var fill = h('span', { class: 'bv-fill' });
      var dlLabel = h('span', { class: 'bv-dl-label', text: 'Baixar vídeo' });
      var dlBtn = h('button', { type: 'button', class: 'button button-primary bv-dl' }, fill, DF.svg('download'), dlLabel);
      var cancelBtn = h('button', { type: 'button', class: 'text-button', text: 'Cancelar', hidden: true });
      var result = h('article', { class: 'bv-result', hidden: true },
        h('div', { class: 'bv-thumb-wrap' }, thumb),
        h('div', { class: 'bv-info' },
          h('div', { class: 'bv-meta' }, who, where), caption,
          h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Qualidade' }), qList, qNote),
          h('div', { class: 'bv-actions' }, dlBtn, cancelBtn)));
      var loading = h('div', { class: 'bv-loading', hidden: true }, h('span', { class: 'bv-spinner' }), h('span', { text: 'Buscando o vídeo…' }));

      var singleView = h('section', { class: 'bv-view', role: 'tabpanel' }, form,
        h('p', { class: 'palco-note', text: 'Funciona com Reels, posts e vídeos públicos do Instagram e do TikTok.' }),
        singleMsg, loading, result);

      if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
        pasteBtn.hidden = false;
        pasteBtn.addEventListener('click', async function () {
          try { var t = (await navigator.clipboard.readText()).trim(); if (t) { input.value = t; if (VALID.test(t)) submit(); } } catch (e) { input.focus(); }
        });
      }
      input.addEventListener('paste', function () {
        setTimeout(function () { var v = input.value.trim(); if (VALID.test(v) && v !== st.url) submit(); }, 0);
      });
      function submit() { if (form.requestSubmit) form.requestSubmit(); else findBtn.click(); }

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var url = input.value.trim();
        if (busy.single) return;
        result.hidden = true;
        if (!url) { msg(singleMsg, 'Cole um link primeiro.', 'error'); input.focus(); return; }
        if (!VALID.test(url)) { msg(singleMsg, 'Esse link não é do Instagram nem do TikTok. Confira e cole de novo.', 'error'); return; }
        findBtn.disabled = true; findBtn.textContent = 'Buscando…';
        msg(singleMsg, '');
        loading.hidden = false;
        try {
          var res = await call('/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }) });
          if (!res.ok) throw new Error(await readError(res));
          var data = await res.json();
          st.url = url;
          render(data);
        } catch (err) {
          msg(singleMsg, err.name === 'TypeError' ? 'Sem conexão com o servidor. Verifique sua internet.' : err.message, 'error');
        } finally {
          loading.hidden = true;
          findBtn.disabled = false; findBtn.textContent = 'Buscar vídeo';
        }
      });

      function render(d) {
        if (d.thumbnail) { thumb.src = d.thumbnail; thumb.alt = 'Prévia do vídeo'; thumb.hidden = false; }
        else { thumb.removeAttribute('src'); thumb.hidden = true; }
        who.textContent = d.uploader ? '@' + String(d.uploader).replace(/^@/, '') : 'Vídeo';
        where.textContent = [plat(d.platform), duration(d.duration)].filter(Boolean).join(' · ');
        caption.textContent = d.title || ''; caption.hidden = !d.title;
        qList.textContent = '';
        d.options.forEach(function (o, i) {
          var id = 'bv-q-' + i;
          var extra = [];
          if (o.kind === 'audio') extra.push('MP3'); else if (o.codec) extra.push(o.codec);
          if (o.filesize) extra.push(size(o.filesize));
          var radio = h('input', { type: 'radio', name: 'bv-q', id: id, value: o.key, checked: i === 0 });
          radio.dataset.codec = o.codec || ''; radio.dataset.kind = o.kind;
          qList.appendChild(h('label', { class: 'bv-quality', for: id }, radio,
            h('span', { class: 'bv-quality-name', text: o.kind === 'audio' ? 'Só áudio' : (i === 0 ? o.label + ' · máxima' : o.label) }),
            extra.length ? h('small', { text: extra.join(' · ') }) : null));
        });
        updateNote();
        setDl('Baixar vídeo');
        result.hidden = false;
      }
      function selected() { return qList.querySelector('input:checked'); }
      function updateNote() {
        var s = selected(), codec = s ? s.dataset.codec : '';
        var hasH264 = Array.prototype.some.call(qList.querySelectorAll('input'), function (r) { return r.dataset.kind === 'video' && !r.dataset.codec; });
        qNote.hidden = !(s && s.dataset.kind === 'video' && codec);
        qNote.textContent = codec + ' tem ótima qualidade, mas pode não abrir em alguns PCs com Windows' + (hasH264 ? '. Se acontecer, baixe uma opção sem essa marca.' : '.');
        if (!busy.single) setDl(s && s.dataset.kind === 'audio' ? 'Baixar áudio' : 'Baixar vídeo');
      }
      qList.addEventListener('change', updateNote);
      function setDl(text, mode, pct) {
        dlLabel.textContent = text;
        dlBtn.classList.toggle('bv-dl-busy', !!mode);
        fill.style.width = mode === 'progress' ? Math.max(2, pct) + '%' : (mode === 'preparing' ? '100%' : '0');
        fill.classList.toggle('bv-fill-pulse', mode === 'preparing');
      }

      dlBtn.addEventListener('click', async function () {
        if (busy.single) return;
        var s = selected(), isAudio = s && s.dataset.kind === 'audio';
        var controller = new AbortController();
        st.controller = controller; busy.single = true; activity();
        msg(singleMsg, '');
        setDl(isAudio ? 'Preparando o áudio…' : 'Preparando o vídeo…', 'preparing');
        cancelBtn.hidden = false;
        try {
          var res = await call('/api/download?url=' + encodeURIComponent(st.url) + '&quality=' + encodeURIComponent(s ? s.value : ''), { signal: controller.signal });
          if (!res.ok) throw new Error(await readError(res));
          var total = parseInt(res.headers.get('Content-Length') || '0', 10), blob;
          if (res.body && res.body.getReader && total) {
            var reader = res.body.getReader(), chunks = [], got = 0;
            for (;;) {
              var step = await reader.read();
              if (step.done) break;
              chunks.push(step.value); got += step.value.length;
              var pct = Math.min(100, Math.round(got * 100 / total));
              setDl('Baixando ' + pct + '%', 'progress', pct);
            }
            blob = new Blob(chunks, { type: res.headers.get('Content-Type') || 'video/mp4' });
          } else {
            setDl('Baixando…', 'preparing');
            blob = await res.blob();
          }
          var cd = res.headers.get('Content-Disposition') || '';
          var m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
          var name = m ? decodeURIComponent(m[1]) : (isAudio ? 'audio.mp3' : 'video.mp4');
          var href = URL.createObjectURL(blob);
          var a = h('a', { href: href, download: name, hidden: true });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(href); }, 60000);
          setDl(isAudio ? 'Áudio baixado' : 'Vídeo baixado');
          msg(singleMsg, 'Pronto! ' + name + ' foi salvo (' + size(blob.size) + ').', 'ok');
        } catch (err) {
          setDl(isAudio ? 'Baixar áudio' : 'Baixar vídeo');
          if (err.name === 'AbortError') msg(singleMsg, 'Download cancelado.', 'info');
          else msg(singleMsg, err.name === 'TypeError' ? 'A conexão caiu durante o download. Tente de novo.' : err.message, 'error');
        } finally {
          cancelBtn.hidden = true; st.controller = null; busy.single = false; activity();
        }
      });
      cancelBtn.addEventListener('click', function () { if (st.controller) st.controller.abort(); });

      // ------------------------------------------------ vários vídeos
      var cfg = { max_per_profile: 25, ttl_minutes: 60, instagram_profiles: false };
      var bt = { jobId: null, timer: null, rows: {}, handle: store(KEY_HANDLE) || '', seq: 0 };
      var text = h('textarea', { class: 'bv-text', rows: '6', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Links e perfis, um por linha',
        placeholder: 'Um por linha:\nhttps://www.tiktok.com/@perfil\nhttps://www.instagram.com/perfil/\n@perfil\nhttps://www.instagram.com/reel/…' });
      var recognized = h('div', { class: 'bv-recognized', 'aria-live': 'polite' });
      var handleBtns = ['tiktok', 'instagram'].map(function (p) {
        var b = h('button', { type: 'button', class: 'bv-pill', 'aria-pressed': String(bt.handle === p), text: plat(p) });
        b.addEventListener('click', function () { bt.handle = p; store(KEY_HANDLE, p); paintHandle(); check(); });
        b.dataset.p = p;
        return b;
      });
      function paintHandle() { handleBtns.forEach(function (b) { var on = b.dataset.p === bt.handle; b.classList.toggle('bv-pill-on', on); b.setAttribute('aria-pressed', String(on)); }); }
      var handleBox = h('div', { class: 'palco-group', hidden: true }, h('span', { class: 'palco-label', text: 'Os @ sem link são de qual rede?' }), h('div', { class: 'bv-pills' }, handleBtns));
      var perProfile = h('select', { class: 'palco-select', id: 'bv-por-perfil' });
      var quality = h('select', { class: 'palco-select', id: 'bv-qualidade' },
        h('option', { value: 'max', text: 'Máxima disponível' }),
        h('option', { value: 'compat', text: 'Compatível com tudo (H.264)' }));
      var igNote = h('p', { class: 'palco-note', hidden: true });
      var startBtn = h('button', { type: 'submit', class: 'button button-primary button-wide', text: 'Baixar tudo' });
      var batchMsg = h('p', { class: 'bv-msg', role: 'status', hidden: true });
      var batchForm = h('form', { class: 'bv-batch-form', novalidate: true }, text, recognized, handleBox,
        h('div', { class: 'bv-options' },
          h('label', { class: 'palco-group', for: 'bv-por-perfil' }, h('span', { class: 'palco-label', text: 'Vídeos por perfil' }), perProfile),
          h('label', { class: 'palco-group', for: 'bv-qualidade' }, h('span', { class: 'palco-label', text: 'Qualidade' }), quality)),
        igNote, startBtn, batchMsg);

      var jobTitle = h('h3', { class: 'bv-job-title' });
      var jobSub = h('p', { class: 'palco-note' });
      var barFill = h('span');
      var bar = h('div', { class: 'progress-track bv-bar' }, barFill);
      var sourcesList = h('ul', { class: 'bv-sources' });
      var itemsList = h('ol', { class: 'bv-items' });
      var zipBtn = h('a', { class: 'button button-primary', hidden: true, href: '#' }, DF.svg('download'), h('span'));
      var cancelBatch = h('button', { type: 'button', class: 'button button-secondary', text: 'Cancelar lote' });
      var newBatch = h('button', { type: 'button', class: 'button button-secondary', text: 'Novo lote', hidden: true });
      var jobNote = h('p', { class: 'palco-note' });
      var jobView = h('section', { class: 'bv-job', hidden: true, 'aria-live': 'polite' },
        jobTitle, jobSub, bar, sourcesList, h('div', { class: 'bv-actions' }, zipBtn, cancelBatch, newBatch), itemsList, jobNote);
      var batchView = h('section', { class: 'bv-view', role: 'tabpanel', hidden: true }, batchForm, jobView);

      function fillPerProfile() {
        perProfile.textContent = '';
        [5, 10, 25, 50, 100].filter(function (n) { return n <= cfg.max_per_profile; }).forEach(function (n) {
          perProfile.appendChild(h('option', { value: n, text: 'Até ' + n, selected: n === 10 }));
        });
        if (!perProfile.options.length) perProfile.appendChild(h('option', { value: cfg.max_per_profile, text: 'Até ' + cfg.max_per_profile }));
      }
      function loadConfig() {
        fetch(api + '/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
          if (c && c.batch) { cfg = c.batch; fillPerProfile(); if (text.value.trim()) check(); }
        }).catch(function () { /* usa os padrões */ });
      }

      var debounce;
      text.addEventListener('input', function () { clearTimeout(debounce); debounce = setTimeout(check, 400); });
      async function check() {
        var seq = ++bt.seq, value = text.value.trim();
        if (!value) { recognized.textContent = ''; handleBox.hidden = true; igNote.hidden = true; return; }
        try {
          var res = await call('/api/batch/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value, handle_platform: bt.handle || null }) });
          if (seq !== bt.seq || !res.ok) return;
          renderCheck(await res.json());
        } catch (e) { /* valida de novo ao enviar */ }
      }
      function renderCheck(d) {
        recognized.textContent = '';
        var hasHandle = text.value.split(/[\s,;]+/).some(function (t) { return t && !/[\/:]/.test(t) && !/(instagram\.com|tiktok\.com|instagr\.am)/i.test(t); });
        handleBox.hidden = !(d.needs_platform || hasHandle);
        if (d.sources.length) {
          var profilesN = d.sources.filter(function (s) { return s.kind === 'profile'; }).length, linksN = d.sources.length - profilesN, parts = [];
          if (profilesN) parts.push(profilesN + (profilesN > 1 ? ' perfis' : ' perfil'));
          if (linksN) parts.push(linksN + (linksN > 1 ? ' links' : ' link'));
          recognized.appendChild(h('p', { class: 'bv-count', text: 'Reconhecido: ' + parts.join(' e ') }));
          recognized.appendChild(h('ul', { class: 'bv-chips' }, d.sources.slice(0, 30).map(function (s) {
            var what = s.kind === 'profile' ? (s.platform === 'instagram' ? 'Reels de ' + s.label : 'vídeos de ' + s.label) : s.label;
            return h('li', { class: 'bv-chip' }, h('b', { text: plat(s.platform) }), ' ' + what);
          })));
        }
        d.problems.filter(function (p) { return !/escolha se os @/.test(p); }).forEach(function (p) { recognized.appendChild(h('p', { class: 'bv-problem', text: p })); });
        var igProfile = d.sources.some(function (s) { return s.kind === 'profile' && s.platform === 'instagram'; });
        igNote.hidden = !igProfile;
        igNote.textContent = cfg.instagram_profiles
          ? 'Do Instagram, só os Reels do perfil são baixados (posts de foto e vídeos do feed ficam de fora).'
          : 'Perfis do Instagram precisam de login configurado no servidor (veja o guia). Links de Reels avulsos funcionam normalmente.';
        igNote.classList.toggle('field-error', !cfg.instagram_profiles);
      }

      batchForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!text.value.trim()) { msg(batchMsg, 'Cole pelo menos um link ou perfil.', 'error'); text.focus(); return; }
        startBtn.disabled = true; startBtn.textContent = 'Começando…';
        msg(batchMsg, '');
        try {
          var res = await call('/api/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.value, handle_platform: bt.handle || null, per_profile: parseInt(perProfile.value, 10), quality: quality.value }) });
          if (!res.ok) throw new Error(await readError(res));
          openJob((await res.json()).id);
        } catch (err) {
          msg(batchMsg, err.name === 'TypeError' ? 'Sem conexão com o servidor.' : err.message, 'error');
        } finally {
          startBtn.disabled = false; startBtn.textContent = 'Baixar tudo';
        }
      });

      function openJob(id) {
        bt.jobId = id; bt.rows = {};
        store(KEY_BATCH, id + '@' + api);
        itemsList.textContent = ''; sourcesList.textContent = '';
        batchForm.hidden = true; jobView.hidden = false;
        zipBtn.hidden = true; newBatch.hidden = true; cancelBatch.hidden = false;
        jobTitle.textContent = 'Preparando o lote…'; jobSub.textContent = '';
        barFill.style.width = '0'; bar.classList.add('bv-bar-wait');
        busy.batch = true; activity();
        poll();
      }
      async function poll() {
        clearTimeout(bt.timer);
        if (!bt.jobId) return;
        try {
          var res = await call('/api/batch/' + encodeURIComponent(bt.jobId), { cache: 'no-store' });
          if (res.status === 404) { resetBatch(await readError(res)); return; }
          if (!res.ok) throw new Error(await readError(res));
          var d = await res.json();
          renderJob(d);
          if (!TERMINAL[d.status]) bt.timer = setTimeout(poll, 1500);
          else { busy.batch = false; activity(); }
        } catch (e) {
          jobSub.textContent = 'Conexão instável, tentando de novo…';
          bt.timer = setTimeout(poll, 4000);
        }
      }
      function renderJob(d) {
        var c = d.counts, finished = c.done + c.skipped + c.error;
        var pct = c.total ? Math.round(finished * 100 / c.total) : 0, running = !TERMINAL[d.status];
        if (d.status === 'queued') { jobTitle.textContent = 'Na fila'; jobSub.textContent = d.queue_position ? 'Seu lote é o ' + d.queue_position + 'º da fila.' : ''; }
        else if (d.status === 'listing') { jobTitle.textContent = 'Procurando os vídeos…'; jobSub.textContent = c.total ? c.total + ' encontrados até agora' : 'Lendo os perfis.'; }
        else if (d.status === 'downloading') {
          jobTitle.textContent = 'Baixando ' + Math.min(finished + 1, c.total) + ' de ' + c.total;
          jobSub.textContent = c.done + ' prontos' + (d.total_size ? ', ' + size(d.total_size) : '') + '. Um de cada vez, com pausas, para a plataforma não bloquear.';
        } else if (d.status === 'done') {
          jobTitle.textContent = c.done + (c.done === 1 ? ' vídeo pronto' : ' vídeos prontos');
          var extra = [];
          if (c.skipped) extra.push(c.skipped + ' pulado' + (c.skipped > 1 ? 's' : ''));
          if (c.error) extra.push(c.error + ' com erro');
          jobSub.textContent = size(d.total_size) + (extra.length ? ' · ' + extra.join(', ') + ' (veja a lista)' : '');
        } else { jobTitle.textContent = d.status === 'cancelled' ? 'Lote cancelado' : 'O lote não foi concluído'; jobSub.textContent = d.message || ''; }

        bar.classList.toggle('bv-bar-wait', running && (d.status !== 'downloading' || !c.total));
        barFill.style.width = (d.status === 'done' ? 100 : pct) + '%';

        sourcesList.textContent = '';
        d.sources.forEach(function (s) {
          var txt;
          if (s.status === 'error') txt = s.message;
          else if (s.status === 'listing') txt = 'procurando…';
          else if (s.status === 'pending') txt = 'aguardando';
          else txt = s.kind === 'profile' ? s.found + (s.platform === 'instagram' ? (s.found === 1 ? ' Reel' : ' Reels') : (s.found === 1 ? ' vídeo' : ' vídeos')) : '1 vídeo';
          sourcesList.appendChild(h('li', { class: 'bv-source' + (s.status === 'error' ? ' bv-source-error' : '') }, h('b', { text: plat(s.platform) + ' ' + s.label }), h('span', { text: txt })));
        });

        d.items.forEach(function (it) {
          var row = bt.rows[it.index];
          if (!row) {
            row = { li: h('li', { class: 'bv-item' }), name: h('span', { class: 'bv-item-name' }), state: h('span', { class: 'bv-item-state' }),
              link: h('a', { class: 'text-button bv-item-dl', hidden: true }, DF.svg('download'), 'Baixar') };
            row.li.appendChild(row.name); row.li.appendChild(row.state); row.li.appendChild(row.link);
            itemsList.appendChild(row.li); bt.rows[it.index] = row;
          }
          row.name.textContent = it.title || it.url.replace(/^https?:\/\/(www\.)?/, '');
          row.name.title = it.url;
          var s = ITEM_TEXT[it.status] || it.status;
          if (it.status === 'done') s += ' · ' + size(it.size);
          if ((it.status === 'skipped' || it.status === 'error') && it.message) s = it.message;
          row.state.textContent = s;
          row.li.className = 'bv-item bv-item-' + it.status;
          if (it.status === 'done' && row.link.hidden) {
            row.link.href = api + '/api/batch/' + encodeURIComponent(d.id) + '/file/' + it.index;
            row.link.setAttribute('download', it.filename);
            row.link.setAttribute('aria-label', 'Baixar ' + it.filename);
            row.link.hidden = false;
          }
        });

        cancelBatch.hidden = !running; newBatch.hidden = running;
        if (c.done > 0 && !running) {
          zipBtn.hidden = false;
          zipBtn.href = api + '/api/batch/' + encodeURIComponent(d.id) + '/zip';
          zipBtn.setAttribute('download', '');
          zipBtn.lastChild.textContent = 'Baixar tudo em .zip (' + size(d.total_size) + ')';
        } else zipBtn.hidden = true;
        jobNote.textContent = TERMINAL[d.status] && c.done
          ? 'Os arquivos ficam disponíveis por ' + cfg.ttl_minutes + ' minutos. Você também pode baixar um por um na lista.'
          : (running ? 'Pode trocar de ferramenta ou recarregar a página: o lote continua no servidor.' : '');
      }
      cancelBatch.addEventListener('click', async function () {
        if (!bt.jobId) return;
        cancelBatch.disabled = true;
        try { await call('/api/batch/' + encodeURIComponent(bt.jobId) + '/cancel', { method: 'POST' }); } catch (e) { /* o próximo poll mostra */ }
        cancelBatch.disabled = false;
        poll();
      });
      function resetBatch(message) {
        clearTimeout(bt.timer);
        bt.jobId = null; store(KEY_BATCH, null);
        busy.batch = false; activity();
        jobView.hidden = true; batchForm.hidden = false;
        msg(batchMsg, message || '', message ? 'info' : '');
      }
      newBatch.addEventListener('click', function () { resetBatch(''); text.focus(); });

      // ------------------------------------------------ montagem
      var tools = h('div', { class: 'bv-tools' },
        h('div', { class: 'bv-tabs', role: 'tablist', 'aria-label': 'Modo' }, tabSingle, tabBatch),
        singleView, batchView,
        h('p', { class: 'bv-legal', text: 'Use para baixar vídeos seus ou com permissão de quem criou. Os arquivos passam pelo servidor só durante o download.' }));
      body.appendChild(h('div', { class: 'bv' }, serverBar, setup, tools));
      fillPerProfile(); paintHandle();

      // Retoma um lote que estava em andamento (mesmo servidor)
      var saved = String(store(KEY_BATCH) || '').split('@');
      if (saved[0] && saved[1] === api) { selectTab(true); openJob(saved[0]); }
      wake();
    },
  });
})();
