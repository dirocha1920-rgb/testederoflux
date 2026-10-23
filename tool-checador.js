/* Ferramenta: Checador de criativos (Meta Ads, TikTok Ads, Kwai Ads).
 * Usa media-probe.js (leitura do arquivo), creative-rules.js (regras), audio-fix.js,
 * cleaner.js e image-cleaner.js (correções). */
(function () {
  'use strict';
  var DF = window.DF, h = DF.h, R = window.CreativeRules, MP = window.MediaProbe;
  var LEVEL = { erro: 3, aviso: 2, info: 1, ok: 0 };
  var VERDICT = { 3: ['reprovado', 'Vai ser reprovado'], 2: ['atencao', 'Risco de reprovação'], 1: ['ok', 'Aprovado'], 0: ['ok', 'Aprovado'] };
  var LEVEL_LABEL = { erro: 'Erro', aviso: 'Atenção', info: 'Dica', ok: 'OK' };

  function worst(list) { return list.reduce(function (m, it) { return Math.max(m, LEVEL[it.level] || 0); }, 0); }

  DF.register({
    id: 'checador', group: 'anúncios', label: 'Checador de criativos', icon: 'shield',
    title: ['Checador de', 'criativos.'],
    lead: 'Confere vídeo, imagem e texto contra as regras do Meta Ads, TikTok Ads e Kwai Ads antes de subir. Aponta o que reprova e corrige o que dá para corrigir na hora.',
    mount: function (body, ctx) {
      var state = { platforms: { meta: 'vertical', tiktok: 'infeed', kwai: 'infeed' }, sector: 'geral' };
      var jobs = [], checked = {};
      var cfg = window.DF_CONFIG || {};
      var aiServer = String(cfg.servidorIA || cfg.baixarVideoServidor || '').trim().replace(/\/+$/, '');
      var ai = { config: null, ready: false, waking: null, code: '' };
      try { ai.code = localStorage.getItem('ck-ia-senha') || ''; } catch (e) { /* sem armazenamento */ }
      var aiCode = h('input', { class: 'bv-input ck-input', id: 'ck-ia-senha', type: 'password', autocomplete: 'off', value: ai.code });
      aiCode.addEventListener('input', function () { ai.code = aiCode.value.trim(); try { localStorage.setItem('ck-ia-senha', ai.code); } catch (e) { /* ok */ } });
      var aiBox = h('div', { class: 'ck-ai-box', hidden: true },
        h('label', { class: 'palco-group', for: 'ck-ia-senha' }, h('span', { class: 'palco-label', text: 'Senha da análise com IA' }), aiCode,
          h('small', { class: 'palco-note', text: 'Quem administra o site define essa senha no servidor. Fica salva neste navegador.' })));
      var notice = DF.noticeBox();

      // ---------------------------------------------- plataformas
      var platformCards = Object.keys(R.PLATFORMS).map(function (id) {
        var info = R.PLATFORMS[id];
        var toggle = h('input', { type: 'checkbox', checked: true, id: 'ck-' + id });
        var select = h('select', { class: 'palco-select', 'aria-label': 'Posicionamento ' + info.name }, Object.keys(info.placements).map(function (k) { return h('option', { value: k, text: info.placements[k] }); }));
        select.value = state.platforms[id];
        var card = h('div', { class: 'ck-platform ck-platform-on' },
          h('label', { class: 'ck-platform-head', for: 'ck-' + id }, toggle, h('strong', { text: info.name })), select);
        toggle.addEventListener('change', function () { state.platforms[id] = toggle.checked ? select.value : null; card.classList.toggle('ck-platform-on', toggle.checked); select.disabled = !toggle.checked; refresh(); });
        select.addEventListener('change', function () { state.platforms[id] = select.value; refresh(); });
        return card;
      });

      // ---------------------------------------------- texto
      var sector = h('select', { class: 'palco-select', id: 'ck-setor' }, R.SECTORS.map(function (s) { return h('option', { value: s[0], text: s[1] }); }));
      sector.addEventListener('change', function () { state.sector = sector.value; refresh(); });
      function field(id, label, rows, hint) {
        var input = rows ? h('textarea', { class: 'bv-text ck-text', id: id, rows: String(rows), spellcheck: 'true' }) : h('input', { class: 'bv-input ck-input', id: id, type: 'text' });
        var count = h('span', { class: 'ck-count mono', text: '0' });
        input.addEventListener('input', function () { count.textContent = String(Array.from(input.value).length); clearTimeout(input._t); input._t = setTimeout(refresh, 300); });
        return { input: input, el: h('label', { class: 'palco-group', for: id }, h('span', { class: 'palco-label' }, label, count), input, hint ? h('small', { class: 'palco-note', text: hint }) : null) };
      }
      var fPrimary = field('ck-primario', 'Texto principal / legenda', 3, 'Meta: até 125 recomendados · TikTok: até 100 (anúncio normal)');
      var fHeadline = field('ck-titulo', 'Título (Meta)', 0);
      var fDesc = field('ck-descricao', 'Descrição (Meta)', 0);
      var fName = field('ck-nome', 'Nome de exibição (TikTok)', 0);

      var drop = DF.dropZone({ accept: 'video/*,image/*,.mp4,.mov,.m4v,.3gp,.avi,.mpeg,.webm,.jpg,.jpeg,.png,.webp', multiple: true, title: 'Arraste os criativos para cá', pickLabel: 'escolha os arquivos', hint: 'Vídeos e imagens · vários de uma vez', onFiles: addFiles });

      var summary = h('div', { class: 'ck-summary', hidden: true });
      var textBox = h('section', { class: 'ck-section', hidden: true });
      var list = h('div', { class: 'ck-files' });
      var checklist = h('section', { class: 'ck-section' });
      var sources = h('section', { class: 'ck-section ck-sources' });

      body.appendChild(notice.el);
      body.appendChild(h('div', { class: 'ck-setup' },
        h('section', { class: 'ck-block' },
          h('div', { class: 'panel-kicker', text: '01 / onde vai anunciar' }),
          h('div', { class: 'ck-platforms' }, platformCards),
          h('label', { class: 'palco-group ck-sector', for: 'ck-setor' }, h('span', { class: 'palco-label', text: 'Tipo de produto' }), sector)),
        h('section', { class: 'ck-block' },
          h('div', { class: 'panel-kicker', text: '02 / criativos' }), drop.el, aiBox),
        h('section', { class: 'ck-block' },
          h('div', { class: 'panel-kicker', text: '03 / texto do anúncio (opcional)' }),
          h('div', { class: 'ck-fields' }, fPrimary.el, h('div', { class: 'ck-fields-col' }, fHeadline.el, fDesc.el, fName.el)))));
      body.appendChild(summary);
      body.appendChild(textBox);
      body.appendChild(list);
      body.appendChild(checklist);
      body.appendChild(sources);

      // ---------------------------------------------- arquivos
      function addFiles(files) {
        files.forEach(function (file) {
          var job = { file: file, stage: 'lendo', probe: null, analysis: {}, fixed: null };
          jobs.push(job);
          job.run = analyze(job);
        });
        render();
      }
      var queue = Promise.resolve();
      function analyze(job) {
        queue = queue.then(async function () {
          ctx.setActivity({ active: true, unsaved: false });
          try {
            job.probe = await MP.probe(job.file);
            render();
            if (job.probe.kind === 'video') {
              job.stage = 'analisando';
              render();
              var res = await Promise.all([
                MP.analyzeVideo(job.file, job.probe, function (pct) { job.progress = pct; updateProgress(job); }),
                job.probe.hasAudio !== false ? MP.analyzeAudio(job.file) : Promise.resolve(null),
              ]);
              job.analysis = res[0] || {};
              if (res[1]) { job.analysis.audioSilent = res[1].silent; job.analysis.audioPeakDb = res[1].peakDb; }
              if (job.analysis.thumb) job.thumb = job.analysis.thumb;
            } else if (job.probe.kind === 'image') {
              job.thumb = URL.createObjectURL(job.file);
            }
            job.probe.metadata = await findMetadata(job.file, job.probe);
            job.stage = 'pronto';
          } catch (e) {
            job.stage = 'erro'; job.error = 'Não consegui analisar este arquivo.';
            if (window.console) console.error(e);
          }
          ctx.setActivity({ active: jobs.some(function (j) { return j.stage === 'lendo' || j.stage === 'analisando'; }), unsaved: false });
          render();
        });
        return queue;
      }
      async function findMetadata(file, probe) {
        try {
          if (probe.kind === 'video' && ['mp4', 'mov', '3gp'].indexOf(probe.container) >= 0 && window.LimpadorMP4) {
            var r = await window.LimpadorMP4.clean(file);
            return r.found || [];
          }
          if (probe.kind === 'image' && ['jpg', 'png', 'webp'].indexOf(probe.container) >= 0 && window.LimpadorImagem) {
            var r2 = await window.LimpadorImagem.clean(file);
            return r2.found || [];
          }
        } catch (e) { /* sem metadados legíveis */ }
        return [];
      }

      // ---------------------------------------------- correções
      async function applyFix(job, kinds) {
        job.fixing = true; render();
        try {
          var blob = job.file, done = [];
          if (kinds.indexOf('audio') >= 0 && job.probe.kind === 'video') {
            var a = await window.AjustaAudio.fix(blob, { targetKbps: 128, addSilent: true });
            if (a.changed) { blob = new File([a.output], job.file.name, { type: job.file.type || 'video/mp4' }); done.push(a.addedSilent ? 'áudio silencioso de 128 kbps adicionado' : 'áudio levado a 128 kbps'); }
          }
          if (kinds.indexOf('metadata') >= 0) {
            var c = job.probe.kind === 'image' ? await window.LimpadorImagem.clean(blob) : await window.LimpadorMP4.clean(blob);
            blob = new File([c.blob], job.file.name, { type: job.file.type || '' }); done.push('metadados removidos');
          }
          var dot = job.file.name.lastIndexOf('.');
          var name = (dot > 0 ? job.file.name.slice(0, dot) : job.file.name) + '-corrigido' + (dot > 0 ? job.file.name.slice(dot).toLowerCase() : '.mp4');
          var fixedFile = new File([blob], name, { type: job.file.type || 'video/mp4' });
          var next = { file: fixedFile, stage: 'lendo', probe: null, analysis: {}, fixedFrom: job.file.name, fixNote: done.join(' · ') || 'nada precisou mudar' };
          jobs.splice(jobs.indexOf(job) + 1, 0, next);
          job.fixing = false;
          render();
          analyze(next);
        } catch (e) {
          job.fixing = false;
          notice.set('Não foi possível corrigir ' + job.file.name + ': ' + (e.message || 'erro desconhecido'));
          render();
        }
      }

      // ---------------------------------------------- avaliação
      function evaluate(job) {
        var out = {};
        Object.keys(state.platforms).forEach(function (pl) {
          if (!state.platforms[pl]) return;
          out[pl] = R.checkMedia(job.probe, job.analysis, pl, state.platforms[pl]);
        });
        return out;
      }
      function textFields() { return { primary: fPrimary.input.value, headline: fHeadline.input.value, description: fDesc.input.value, name: fName.input.value }; }
      function hasText() { var f = textFields(); return !!(f.primary.trim() || f.headline.trim() || f.description.trim() || f.name.trim()); }

      function refresh() { render(); }

      function issueList(items, withSnippet) {
        var order = items.slice().sort(function (a, b) { return LEVEL[b.level] - LEVEL[a.level]; });
        return h('ul', { class: 'ck-issues' }, order.map(function (it) {
          var src = it.source && R.SOURCES[it.source];
          return h('li', { class: 'ck-issue ck-' + it.level },
            h('span', { class: 'ck-tag mono', text: LEVEL_LABEL[it.level] }),
            h('div', { class: 'ck-issue-body' },
              h('p', { text: it.text }),
              withSnippet && it.snippet ? h('p', { class: 'ck-snippet mono', text: '"' + it.snippet + '"' }) : null,
              it.tip ? h('p', { class: 'ck-tip', text: '→ ' + it.tip }) : null,
              src ? h('a', { class: 'ck-source', href: src.url, target: '_blank', rel: 'noopener noreferrer', text: 'Fonte: ' + src.name }) : null));
        }));
      }
      function verdictBadge(level) {
        var v = VERDICT[level];
        return h('span', { class: 'ck-verdict ck-verdict-' + v[0] }, h('span', { class: 'ck-verdict-dot' }), v[1]);
      }
      function specChips(p) {
        var chips = [];
        if (p.width) chips.push(p.width + '×' + p.height + ' · ' + R.ratioName(p.width, p.height));
        if (p.duration) chips.push((Math.round(p.duration * 10) / 10).toString().replace('.', ',') + 's');
        if (p.fps) chips.push(Math.round(p.fps) + ' fps' + (p.vfr ? ' (variável)' : ''));
        if (p.videoCodec) chips.push(p.videoCodec.toUpperCase() + (p.videoBitrate ? ' ' + Math.round(p.videoBitrate / 1000) + ' kbps' : ''));
        if (p.kind === 'video') chips.push(p.hasAudio ? 'áudio ' + (p.audioCodec || '').toUpperCase() + (p.audioBitrate ? ' ' + Math.round(p.audioBitrate / 1000) + ' kbps' : '') : 'sem áudio');
        chips.push(p.container.toUpperCase() + ' · ' + DF.formatBytes(p.size));
        return h('div', { class: 'palco-chips' }, chips.map(function (c) { return h('span', { class: 'palco-chip mono', text: c }); }));
      }

      function updateProgress(job) { if (job.bar) job.bar.style.width = Math.round((job.progress || 0) * 100) + '%'; }

      function render() {
        var active = Object.keys(state.platforms).filter(function (k) { return state.platforms[k]; });
        if (!active.length) notice.set('Escolha pelo menos uma plataforma.'); else if (notice.el.textContent.indexOf('Escolha pelo menos') >= 0) notice.set('');

        // ---- texto
        var textResult = null;
        textBox.textContent = '';
        if (hasText() && active.length) {
          textResult = R.checkText(textFields(), state.sector, state.platforms);
          textBox.hidden = false;
          textBox.appendChild(h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: 'texto' }), h('h2', { text: 'Revisão do texto' }))));
          textBox.appendChild(h('div', { class: 'ck-grid' }, active.map(function (pl) {
            var items = textResult[pl];
            return h('div', { class: 'ck-col' },
              h('div', { class: 'ck-col-head' }, h('strong', { text: R.PLATFORMS[pl].name }), verdictBadge(worst(items))),
              items.length ? issueList(items, true) : h('p', { class: 'palco-note', text: 'Nenhum problema encontrado no texto.' }));
          })));
        } else if (state.sector !== 'geral' && active.length) {
          textResult = R.checkText({}, state.sector, state.platforms);
          if (active.some(function (pl) { return textResult[pl].length; })) {
            textBox.hidden = false;
            textBox.appendChild(h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: 'setor' }), h('h2', { text: 'Exigências do tipo de produto' }))));
            textBox.appendChild(h('div', { class: 'ck-grid' }, active.map(function (pl) {
              return h('div', { class: 'ck-col' }, h('div', { class: 'ck-col-head' }, h('strong', { text: R.PLATFORMS[pl].name })), issueList(textResult[pl], false));
            })));
          } else textBox.hidden = true;
        } else textBox.hidden = true;

        // ---- arquivos
        list.textContent = '';
        var counts = { reprovado: 0, atencao: 0, ok: 0 };
        jobs.forEach(function (job) {
          var card = h('article', { class: 'ck-file' });
          var head = h('div', { class: 'ck-file-head' },
            job.thumb ? h('img', { class: 'ck-thumb', src: job.thumb, alt: '' }) : h('span', { class: 'ck-thumb ck-thumb-empty' }, DF.svg(job.probe && job.probe.kind === 'image' ? 'image' : 'video')),
            h('div', { class: 'ck-file-id' },
              h('strong', { text: job.file.name, title: job.file.name }),
              job.fixedFrom ? h('span', { class: 'ck-fixed-note', text: 'Versão corrigida de ' + job.fixedFrom + ' · ' + job.fixNote }) : null,
              job.probe ? specChips(job.probe) : h('span', { class: 'palco-note', text: 'Lendo o arquivo…' })),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Tirar ' + job.file.name, onclick: function () { if (job.thumb && job.thumb.indexOf('blob:') === 0) URL.revokeObjectURL(job.thumb); if (job.url) URL.revokeObjectURL(job.url); jobs.splice(jobs.indexOf(job), 1); render(); } }, DF.svg('trash')));
          card.appendChild(head);
          if (job.stage === 'lendo' || job.stage === 'analisando') {
            job.bar = h('span'); updateProgress(job);
            card.appendChild(h('div', { class: 'ck-analyzing' }, h('span', { class: 'palco-note', text: job.stage === 'lendo' ? 'Lendo o arquivo…' : 'Analisando movimento, bordas, QR code e som…' }), h('div', { class: 'progress-track' }, job.bar)));
          } else if (job.stage === 'erro') {
            card.appendChild(h('p', { class: 'job-error', text: job.error }));
          } else {
            var res = evaluate(job), fixes = {};
            var levels = active.map(function (pl) { return worst(res[pl]); });
            var overall = Math.max.apply(null, levels.concat([0]));
            counts[VERDICT[overall][0]]++;
            card.classList.add('ck-file-' + VERDICT[overall][0]);
            card.appendChild(h('div', { class: 'ck-grid' }, active.map(function (pl) {
              res[pl].forEach(function (it) { if (it.fix) fixes[it.fix] = true; });
              return h('div', { class: 'ck-col' },
                h('div', { class: 'ck-col-head' }, h('strong', { text: R.PLATFORMS[pl].name + ' · ' + R.PLATFORMS[pl].placements[state.platforms[pl]] }), verdictBadge(worst(res[pl]))),
                issueList(res[pl], false));
            })));
            var fixKinds = Object.keys(fixes);
            var actions = h('div', { class: 'ck-actions' });
            if (job.fixedFrom) {
              if (!job.url) job.url = URL.createObjectURL(job.file);
              actions.appendChild(h('a', { class: 'button button-primary', href: job.url, download: job.file.name }, DF.svg('download'), ' Baixar versão corrigida'));
            }
            if (fixKinds.length && !job.fixedFrom) {
              if (fixes.audio) actions.appendChild(h('button', { type: 'button', class: 'button button-secondary', disabled: job.fixing, onclick: function () { applyFix(job, ['audio']); } }, 'Corrigir áudio'));
              if (fixes.metadata) actions.appendChild(h('button', { type: 'button', class: 'button button-secondary', disabled: job.fixing, onclick: function () { applyFix(job, ['metadata']); } }, 'Limpar metadados'));
              if (fixKinds.length > 1) actions.appendChild(h('button', { type: 'button', class: 'button button-primary', disabled: job.fixing, onclick: function () { applyFix(job, fixKinds); } }, 'Corrigir tudo'));
              if (job.fixing) actions.appendChild(h('span', { class: 'palco-note', text: 'Corrigindo…' }));
            }
            if (aiServer) {
              var aiBtnLabel = job.ai && job.ai.state === 'done' ? 'Analisar de novo com IA' : 'Analisar conteúdo com IA';
              actions.appendChild(h('button', { type: 'button', class: 'button button-secondary ck-ai-btn', disabled: !!(job.ai && job.ai.state === 'running') || (ai.config && !ai.config.enabled), onclick: function () { runAI(job); } }, DF.svg('sparkle'), ' ' + aiBtnLabel));
            }
            var manual = job.probe.kind === 'image' ? '' : needsManual(res);
            if (manual) actions.appendChild(h('p', { class: 'palco-note ck-manual-note', text: manual }));
            if (actions.childNodes.length) card.appendChild(actions);
            if (job.ai) card.appendChild(aiPanel(job));
          }
          list.appendChild(card);
        });
        if (!jobs.length) list.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-number', text: '00' }),
          h('div', null, h('h3', { text: 'Nenhum criativo ainda' }), h('p', { text: 'Arraste vídeos ou imagens para ver o que cada plataforma vai aprovar.' }))));

        // ---- resumo
        var total = jobs.filter(function (j) { return j.stage === 'pronto'; }).length;
        var textLevel = textResult ? Math.max.apply(null, active.map(function (pl) { return worst(textResult[pl] || []); }).concat([0])) : 0;
        if (total || (textResult && hasText())) {
          summary.hidden = false; summary.textContent = '';
          var parts = [];
          if (total) parts.push(h('span', null, h('b', { text: String(total) }), total === 1 ? ' criativo' : ' criativos'));
          if (counts.reprovado) parts.push(h('span', { class: 'ck-sum-bad' }, h('b', { text: String(counts.reprovado) }), ' vão ser reprovados'));
          if (counts.atencao) parts.push(h('span', { class: 'ck-sum-warn' }, h('b', { text: String(counts.atencao) }), ' com risco'));
          if (counts.ok) parts.push(h('span', { class: 'ck-sum-ok' }, h('b', { text: String(counts.ok) }), ' aprovados'));
          if (textResult && hasText()) parts.push(h('span', { class: textLevel >= 3 ? 'ck-sum-bad' : textLevel === 2 ? 'ck-sum-warn' : 'ck-sum-ok' }, 'texto: ' + VERDICT[textLevel][1].toLowerCase()));
          parts.forEach(function (p) { summary.appendChild(p); });
        } else summary.hidden = true;

        // ---- checklist manual
        checklist.textContent = '';
        if (active.length) {
          checklist.appendChild(h('div', { class: 'section-heading' }, h('div', null, h('div', { class: 'panel-kicker', text: 'revisão humana' }), h('h2', { text: 'Confira no olho antes de subir' }))));
          checklist.appendChild(h('p', { class: 'palco-note', text: 'Estes pontos dependem de olhar o conteúdo e a página de destino; nenhuma ferramenta confere sozinha com segurança.' }));
          checklist.appendChild(h('div', { class: 'ck-grid' }, active.map(function (pl) {
            return h('div', { class: 'ck-col' }, h('div', { class: 'ck-col-head' }, h('strong', { text: R.PLATFORMS[pl].name })),
              h('ul', { class: 'ck-checks' }, R.CHECKLIST[pl].map(function (item, i) {
                var id = 'ck-chk-' + pl + '-' + i;
                var box = h('input', { type: 'checkbox', id: id, checked: !!checked[id] });
                box.addEventListener('change', function () { checked[id] = box.checked; });
                return h('li', null, box, h('label', { for: id, text: item[0] }));
              })));
          })));
        }

        // ---- fontes
        sources.textContent = '';
        sources.appendChild(h('details', null, h('summary', { text: 'Fontes e data das regras (conferidas em ' + R.CHECKED + ')' }),
          h('ul', null, Object.keys(R.SOURCES).map(function (k) { var s = R.SOURCES[k]; return h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name })); })),
          h('p', { class: 'palco-note', text: 'As plataformas mudam as regras com frequência e a revisão final é sempre delas. O Kwai não publica as especificações num endereço público estável; os números usados são os divulgados pelo próprio Kwai para anunciantes (inclusive o mínimo de 64 kbps de áudio, o mesmo do erro do Gerenciador).' })));
      }

      // ---------------------------------------------- análise com IA
      function timeoutFetch(url, options, ms) {
        var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms);
        return fetch(url, Object.assign({ signal: c.signal }, options || {})).finally(function () { clearTimeout(t); });
      }
      function loadAIConfig() {
        if (!aiServer) return Promise.resolve(null);
        return timeoutFetch(aiServer + '/api/review/config', { cache: 'no-store' }, 100000).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
          ai.config = c; ai.ready = !!c;
          aiBox.hidden = !(c && c.enabled && c.requires_code);
          return c;
        }).catch(function () { return null; });
      }
      function specsText(p) {
        var parts = [];
        if (p.width) parts.push(p.width + 'x' + p.height);
        if (p.duration) parts.push(Math.round(p.duration) + 's');
        if (p.videoCodec) parts.push(p.videoCodec);
        if (p.kind === 'video') parts.push(p.hasAudio ? 'áudio ' + (p.audioCodec || '') + ' ' + Math.round((p.audioBitrate || 0) / 1000) + 'kbps' : 'sem áudio');
        return parts.join(', ');
      }
      async function runAI(job) {
        job.ai = { state: 'running', phase: 'Ligando o servidor… (no plano grátis pode levar até 1 minuto)' };
        render();
        try {
          var c = ai.config || await loadAIConfig();
          if (!c) throw new Error('Não consegui falar com o servidor da IA. Tente de novo em instantes.');
          if (!c.enabled) throw new Error('A análise com IA ainda não foi ligada no servidor (falta a chave do Gemini). Veja o guia.');
          if (c.requires_code && !ai.code) { aiBox.hidden = false; throw new Error('Digite a senha da análise com IA (campo acima dos criativos).'); }
          if (job.file.size > c.max_mb * 1048576) throw new Error('Arquivo grande demais para a IA (máximo ' + c.max_mb + ' MB).');
          job.ai.phase = 'Enviando o criativo e a IA está assistindo… (costuma levar de 20 a 90 segundos)';
          render();
          var form = new FormData();
          form.append('file', job.file, job.file.name);
          form.append('platforms', JSON.stringify(state.platforms));
          form.append('texts', JSON.stringify(textFields()));
          form.append('sector', (R.SECTORS.find(function (x) { return x[0] === state.sector; }) || ['', ''])[1]);
          form.append('specs', specsText(job.probe));
          form.append('code', ai.code || '');
          var res = await timeoutFetch(aiServer + '/api/review', { method: 'POST', body: form }, 420000);
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok) throw new Error(data.detail || 'A análise falhou (código ' + res.status + ').');
          if (ai.config && typeof data.restantes === 'number') ai.config.remaining = data.restantes;
          job.ai = { state: 'done', report: data, when: new Date(), platforms: Object.assign({}, state.platforms) };
        } catch (e) {
          job.ai = { state: 'error', error: e.name === 'AbortError' ? 'A análise demorou demais. Tente de novo.' : (e.name === 'TypeError' ? 'Sem conexão com o servidor da IA.' : e.message) };
        }
        render();
      }
      var AI_VERDICT = { reprovado: ['reprovado', 'Vai ser reprovado'], risco: ['atencao', 'Risco de reprovação'], aprovado: ['ok', 'Aprovado'] };
      var AI_LEVEL = { erro: 'erro', aviso: 'aviso', dica: 'info' };
      function aiPanel(job) {
        var a = job.ai;
        var panel = h('section', { class: 'ck-ai' }, h('div', { class: 'ck-ai-head' }, DF.svg('sparkle'), h('strong', { text: 'Análise de conteúdo com IA' }), h('span', { class: 'ck-ai-beta mono', text: 'beta' })));
        if (a.state === 'running') {
          panel.appendChild(h('div', { class: 'bv-loading' }, h('span', { class: 'bv-spinner' }), h('span', { text: a.phase })));
          return panel;
        }
        if (a.state === 'error') { panel.appendChild(h('p', { class: 'job-error', text: a.error })); return panel; }
        var r = a.report;
        if (r.resumo) panel.appendChild(h('p', { class: 'ck-ai-summary', text: r.resumo }));
        panel.appendChild(h('div', { class: 'ck-grid' }, (r.plataformas || []).map(function (pl) {
          var v = AI_VERDICT[pl.veredito] || AI_VERDICT.risco;
          var items = (pl.problemas || []).slice().sort(function (x, y) { return LEVEL[AI_LEVEL[y.gravidade]] - LEVEL[AI_LEVEL[x.gravidade]]; });
          return h('div', { class: 'ck-col' },
            h('div', { class: 'ck-col-head' }, h('strong', { text: (R.PLATFORMS[pl.plataforma] || { name: pl.plataforma }).name }),
              h('span', { class: 'ck-verdict ck-verdict-' + v[0] }, h('span', { class: 'ck-verdict-dot' }), v[1])),
            items.length ? h('ul', { class: 'ck-issues' }, items.map(function (it) {
              var lvl = AI_LEVEL[it.gravidade] || 'aviso';
              return h('li', { class: 'ck-issue ck-' + lvl },
                h('span', { class: 'ck-tag mono', text: LEVEL_LABEL[lvl] }),
                h('div', { class: 'ck-issue-body' },
                  h('p', null, it.momento ? h('span', { class: 'ck-time mono', text: it.momento }) : null, it.onde ? h('span', { class: 'ck-where mono', text: it.onde }) : null, it.o_que),
                  it.regra ? h('p', { class: 'ck-tip', text: 'Regra: ' + it.regra }) : null,
                  it.como_corrigir ? h('p', { class: 'ck-tip', text: '→ ' + it.como_corrigir }) : null));
            })) : h('p', { class: 'palco-note', text: 'A IA não encontrou problemas de conteúdo.' }));
        })));
        if (r.sugestao_legenda) {
          var copy = h('button', { type: 'button', class: 'text-button', text: 'copiar' });
          copy.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(r.sugestao_legenda).then(function () { copy.textContent = 'copiado'; }, function () {}); });
          panel.appendChild(h('div', { class: 'ck-ai-caption' }, h('span', { class: 'palco-label', text: 'Sugestão de texto' }), h('p', { text: r.sugestao_legenda }), copy));
        }
        var extra = [];
        if (r.transcricao) extra.push(h('div', null, h('span', { class: 'palco-label', text: 'O que é falado' }), h('p', { text: r.transcricao })));
        if (r.texto_na_tela && r.texto_na_tela.length) extra.push(h('div', null, h('span', { class: 'palco-label', text: 'Texto na tela' }), h('ul', null, r.texto_na_tela.map(function (t) { return h('li', { text: t }); }))));
        if (extra.length) panel.appendChild(h('details', { class: 'ck-ai-details' }, h('summary', { text: 'Ver o que a IA ouviu e leu' }), extra));
        panel.appendChild(h('p', { class: 'palco-note', text: 'Feita às ' + a.when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' com o texto e as plataformas daquele momento' + (r.modelo ? ' · modelo ' + r.modelo : '') + (typeof r.restantes === 'number' ? ' · restam ' + r.restantes + ' análises hoje' : '') + '. A IA ajuda, mas pode errar: a decisão final é da plataforma.' }));
        return panel;
      }

      function needsManual(res) {
        var notes = [];
        Object.keys(res).forEach(function (pl) {
          res[pl].forEach(function (it) {
            if (it.level !== 'erro' || it.fix) return;
            if (/Proporção|Resolução|Largura/.test(it.text)) notes.push('formato');
            if (/Duração/.test(it.text)) notes.push('duração');
            if (/parada|movimento/.test(it.text)) notes.push('movimento');
            if (/mudo|AAC/.test(it.text)) notes.push('som');
          });
        });
        var uniq = notes.filter(function (v, i) { return notes.indexOf(v) === i; });
        if (!uniq.length) return '';
        var tips = { formato: 'formato/tamanho (use "Sobrepor no vídeo" ou "Imagem para vídeo" para sair em 9:16, 4:5 ou 1:1)', 'duração': 'duração (corte no seu editor)', movimento: 'movimento (acrescente cenas, pessoa falando ou zoom)', som: 'som (coloque narração ou música licenciada e exporte com áudio AAC)' };
        return 'Corrija no editor: ' + uniq.map(function (u) { return tips[u]; }).join('; ') + '.';
      }

      render();
      if (aiServer) loadAIConfig().then(function () { render(); });
    },
  });
})();
