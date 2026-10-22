/*
 * Motor de vídeo no navegador (usado pelo Filtro de Vídeo e pelo Sobrepor no vídeo).
 * Desenha cada quadro do vídeo num canvas, deixa a ferramenta pintar por cima
 * (cor, sobreposição...) e exporta com MediaRecorder, mantendo resolução, fps e áudio.
 * A exportação acontece em tempo real: leva o tempo do vídeo.
 */
(function (root) {
  'use strict';

  var VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|ogv|ogg|3gp|3g2|avi|wmv|flv|ts|mts|m2ts)$/i;
  var BPP = { max: 0.30, high: 0.15, light: 0.07 };
  var MIME_OPTIONS = [
    'video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1.4D0033,mp4a.40.2',
    'video/mp4;codecs=avc1.42E033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a',
    'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  var HINT = 'Dica: converta para MP4 (H.264) no HandBrake ou no CapCut. No iPhone, use Ajustes › Câmera › Formatos › Mais compatível.';

  function fmtTime(t) {
    t = t || 0;
    var m = Math.floor(t / 60), s = (t % 60).toFixed(1);
    return m + ':' + (s.length < 4 ? '0' + s : s);
  }
  function isVideo(file) { return !!file && (String(file.type).indexOf('video') === 0 || VIDEO_EXT.test(file.name)); }
  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    for (var i = 0; i < MIME_OPTIONS.length; i++) if (MediaRecorder.isTypeSupported(MIME_OPTIONS[i])) return MIME_OPTIONS[i];
    return '';
  }

  function Studio(options) {
    var self = this;
    var canvas = options.canvas;
    var ctx = canvas.getContext('2d');
    var video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    var state = { format: null, hasVideo: false, recording: false, fps: 0, srcUrl: null, resultUrl: null, baseName: 'video', srcSize: 0, cancel: false, rec: null };
    var audio = { ctx: null, dest: null };
    var emit = function (name, value) { if (options[name]) options[name](value); };
    var status = function (text, error) { emit('onStatus', { text: text, error: !!error }); };

    function drawDemo(ms) {
      var w = canvas.width, h = canvas.height, x = w / 2 + Math.sin(ms / 1400) * w * 0.18;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < w; i += 48) { ctx.fillStyle = i % 96 ? '#2a2a2a' : '#333333'; ctx.fillRect(i, 0, 48, h * 0.72); }
      ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, h * 0.72, w, h * 0.28);
      var glow = ctx.createRadialGradient(x, h * 0.75, 10, x, h * 0.75, h * 0.6);
      glow.addColorStop(0, 'rgba(245,245,245,.8)'); glow.addColorStop(1, 'rgba(245,245,245,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#080808'; ctx.lineWidth = h * 0.012; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, h * 0.86); ctx.lineTo(x, h * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - h * 0.07, h * 0.86); ctx.lineTo(x + h * 0.07, h * 0.86); ctx.stroke();
      ctx.fillStyle = '#080808'; ctx.beginPath(); ctx.ellipse(x, h * 0.39, h * 0.025, h * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(245,245,245,.9)'; ctx.font = '700 ' + Math.round(Math.min(h * 0.04, w * 0.034)) + 'px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
      ctx.fillText('EXEMPLO · CARREGUE SEU VÍDEO', w / 2, h * 0.14);
    }

    // Tamanho do quadro final: o do vídeo ou o do formato escolhido (feed/story)
    function applySize() {
      var w = state.format ? state.format.w : (state.hasVideo ? video.videoWidth : 1280);
      var hh = state.format ? state.format.h : (state.hasVideo ? video.videoHeight : 720);
      if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    }

    function paint(t) {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (state.format) {
        var r = window.DF.fitRect(video.videoWidth, video.videoHeight, canvas.width, canvas.height, state.format.fit);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, r.x, r.y, r.w, r.h);
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      ctx.save(); options.draw(ctx, canvas.width, canvas.height, t); ctx.restore();
    }

    var raf = 0;
    function frame(ms) {
      if (!state.hasVideo) { drawDemo(ms); ctx.save(); options.draw(ctx, canvas.width, canvas.height, -1); ctx.restore(); }
      else if (!state.recording) paint(video.currentTime);
      if (state.hasVideo && video.duration) {
        emit('onTime', { current: video.currentTime, duration: video.duration, fraction: video.currentTime / video.duration, label: fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration), recording: state.recording });
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function describe(detected) {
      var w = video.videoWidth, h = video.videoHeight;
      var gcd = function (a, b) { return b ? gcd(b, a % b) : a; };
      var g = gcd(w, h);
      var ratio = w / g > 50 ? (w / h).toFixed(2) + ':1' : (w / g) + ':' + (h / g);
      var list = [w + '×' + h, h > w ? 'vertical' : h === w ? 'quadrado' : 'horizontal', ratio, fmtTime(video.duration), (state.srcSize / 1048576).toFixed(1) + ' MB'];
      if (detected) list.push(detected + ' fps');
      emit('onInfo', list);
    }

    // Descobre os quadros por segundo reais tocando alguns quadros sem som
    function detectFps() {
      var srcUrl = state.srcUrl;
      var probe = document.createElement('video');
      if (!srcUrl || !probe.requestVideoFrameCallback) return;
      probe.muted = true; probe.playsInline = true; probe.src = srcUrl;
      var times = [];
      var step = function (now, meta) {
        times.push(meta.mediaTime);
        if (times.length < 25) { probe.requestVideoFrameCallback(step); return; }
        probe.pause(); probe.removeAttribute('src'); probe.load();
        if (state.srcUrl !== srcUrl) return;
        var d = [];
        for (var i = 1; i < times.length; i++) { var x = times[i] - times[i - 1]; if (x > 0) d.push(x); }
        d.sort(function (a, b) { return a - b; });
        var med = d[Math.floor(d.length / 2)];
        if (!med) return;
        var raw = 1 / med;
        var best = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120].reduce(function (a, b) { return Math.abs(b - raw) < Math.abs(a - raw) ? b : a; });
        state.fps = Math.abs(best - raw) < 1.5 ? best : Math.round(raw);
        describe(state.fps);
        emit('onFps', state.fps);
      };
      probe.requestVideoFrameCallback(step);
      var played = probe.play();
      if (played && played.catch) played.catch(function () {});
    }

    video.addEventListener('loadedmetadata', function () {
      if (!video.videoWidth) { status('O navegador abriu o arquivo mas não encontrou imagem. O formato deste vídeo não é suportado.', true); emit('onInfo', [HINT]); return; }
      state.hasVideo = true;
      applySize();
      emit('onReady', { width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      describe(0); detectFps();
      status('Pronto. Ajuste as opções e clique em Exportar.');
      video.currentTime = 0.001;
    });
    video.addEventListener('error', function () {
      if (!state.srcUrl) return;
      status('Seu navegador não consegue abrir este vídeo (formatos como AVI, WMV e FLV, ou HEVC em alguns computadores). Tente no Chrome ou Edge, ou converta para MP4.', true);
      emit('onInfo', [HINT]);
    });
    video.addEventListener('play', function () { emit('onPlay', true); });
    video.addEventListener('pause', function () { emit('onPlay', false); });
    video.addEventListener('timeupdate', function () {
      if (state.recording && video.duration) emit('onProgress', Math.min(100, video.currentTime / video.duration * 100));
    });
    video.addEventListener('ended', function () {
      if (state.recording && state.rec && state.rec.state !== 'inactive') setTimeout(function () { state.rec.stop(); }, 150);
    });
    document.addEventListener('visibilitychange', function () {
      if (state.recording && document.hidden) status('Volte para esta aba: o navegador pode pular quadros quando ela fica em segundo plano.', true);
    });

    function ensureAudio() {
      if (audio.ctx) { audio.ctx.resume(); return; }
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        var actx = new AudioCtx({ latencyHint: 'playback' });
        var src = actx.createMediaElementSource(video);
        var dest = actx.createMediaStreamDestination();
        src.connect(dest); src.connect(actx.destination);
        audio.ctx = actx; audio.dest = dest;
      } catch (e) { audio.ctx = null; audio.dest = null; }
    }

    self.load = function (file) {
      if (state.recording) return false;
      if (!isVideo(file)) { status('Esse arquivo não parece ser um vídeo.', true); return false; }
      video.pause(); emit('onPlay', false);
      if (state.srcUrl) URL.revokeObjectURL(state.srcUrl);
      state.srcUrl = URL.createObjectURL(file);
      state.baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
      state.srcSize = file.size; state.fps = 0; state.hasVideo = false;
      emit('onUnready');
      status('Abrindo o vídeo…');
      video.src = state.srcUrl;
      return true;
    };
    self.togglePlay = function () {
      if (!state.hasVideo || state.recording) return;
      ensureAudio();
      if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } else video.pause();
    };
    self.seek = function (fraction) { if (!state.recording && video.duration) video.currentTime = fraction * video.duration; };
    self.currentTime = function () { return video.currentTime; };
    self.size = function () { return { width: canvas.width, height: canvas.height }; };
    // formato: null = original; ou { w, h, fit: 'cover' | 'contain' }
    self.setFormat = function (format) {
      if (state.recording) return;
      state.format = format;
      applySize();
      self.refresh();
      emit('onFormat', self.size());
    };
    self.fps = function () { return state.fps; };
    self.hasVideo = function () { return state.hasVideo; };
    self.recording = function () { return state.recording; };
    self.bitrate = function (quality) {
      return Math.round(Math.min(120e6, Math.max(4e6, canvas.width * canvas.height * (state.fps || 30) * BPP[quality || 'high'])));
    };
    self.refresh = function () { if (state.hasVideo && !state.recording && video.paused) paint(video.currentTime); };

    self.cancel = function () { if (state.recording) { state.cancel = true; if (state.rec) state.rec.stop(); } };

    self.exportVideo = function (quality, suffix) {
      if (state.recording || !state.hasVideo) return;
      if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') { status('Seu navegador não permite exportar vídeo. Use Chrome, Edge ou Firefox atualizados.', true); return; }
      ensureAudio();
      var rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
      // Com requestVideoFrameCallback, cada quadro do original vira exatamente um quadro no arquivo final
      var stream = rvfc ? canvas.captureStream(0) : canvas.captureStream(state.fps || 30);
      var track = stream.getVideoTracks()[0];
      if (audio.dest) audio.dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      var mime = pickMime();
      var opts = { videoBitsPerSecond: self.bitrate(quality), audioBitsPerSecond: 320000 };
      if (mime) opts.mimeType = mime;
      var rec;
      try { rec = new MediaRecorder(stream, opts); } catch (e) { status('Não foi possível iniciar a gravação neste navegador.', true); return; }
      var chunks = [];
      state.rec = rec; state.cancel = false;
      rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        state.recording = false; video.pause();
        emit('onRecording', false);
        if (state.cancel) { status('Exportação cancelada.'); return; }
        var type = (rec.mimeType || mime || 'video/webm').split(';')[0];
        var blob = new Blob(chunks, { type: type });
        var extension = type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
        emit('onResult', { blob: blob, name: state.baseName + '-' + (suffix || 'editado') + '.' + extension, width: canvas.width, height: canvas.height });
        status('Pronto: ' + canvas.width + '×' + canvas.height + ', ' + (blob.size / 1048576).toFixed(1) + ' MB em ' + extension.toUpperCase() + '.');
      };

      state.recording = true; video.pause();
      emit('onRecording', true); emit('onProgress', 0);
      status('Gravando… mantenha esta aba aberta e na frente até terminar.');
      video.currentTime = 0;
      video.addEventListener('seeked', function startRecording() {
        paint(0);
        if (rvfc) {
          var onFrame = function (now, meta) {
            if (!state.recording) return;
            paint(meta.mediaTime);
            if (track && track.requestFrame) track.requestFrame();
            video.requestVideoFrameCallback(onFrame);
          };
          video.requestVideoFrameCallback(onFrame);
        } else {
          var loop = function () { if (!state.recording) return; paint(video.currentTime); requestAnimationFrame(loop); };
          requestAnimationFrame(loop);
        }
        rec.start(1000);
        var p = video.play();
        if (p && p.catch) p.catch(function () { state.cancel = true; rec.stop(); status('O navegador bloqueou a reprodução. Clique em Exportar de novo.', true); });
      }, { once: true });
    };
  }

  // Monta a parte comum da tela: palco (canvas), controles de reprodução e informações
  function stageUI(DF, studio, canvas) {
    var h = DF.h;
    var playBtn = h('button', { type: 'button', class: 'icon-button palco-play', 'aria-label': 'Reproduzir', disabled: true }, DF.svg('play'));
    var seek = h('input', { type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Posição do vídeo', disabled: true });
    var time = h('span', { class: 'mono palco-time', text: '0:00.0 / 0:00.0' });
    var chips = h('div', { class: 'palco-chips' }, h('span', { class: 'palco-chip mono', text: 'Exemplo 1280×720 · horizontal' }));
    var drop = h('div', { class: 'palco-drop', hidden: true, text: 'Solte o vídeo aqui' });
    var stage = h('div', { class: 'palco-stage' }, canvas, drop);
    playBtn.addEventListener('click', function () { studio.togglePlay(); });
    seek.addEventListener('input', function () { studio.seek(Number(seek.value) / 1000); });
    return {
      el: h('section', { class: 'palco-stage-column' }, stage, h('div', { class: 'palco-transport' }, playBtn, seek, time), chips),
      stage: stage, drop: drop,
      setPlaying: function (playing) { playBtn.textContent = ''; playBtn.appendChild(DF.svg(playing ? 'pause' : 'play')); playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir'); },
      setEnabled: function (on) { playBtn.disabled = !on; seek.disabled = !on; },
      setTime: function (t) { if (!t.recording) seek.value = String(Math.round(t.fraction * 1000)); time.textContent = t.label; },
      setChips: function (list) { chips.textContent = ''; list.forEach(function (c) { chips.appendChild(h('span', { class: 'palco-chip mono', text: c })); }); },
    };
  }

  // Parte comum do painel: escolher vídeo, qualidade, exportar e resultado
  function exportUI(DF, studio, options) {
    var h = DF.h;
    var input = h('input', { type: 'file', accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.ogv,.3gp,.avi,.wmv,.flv', hidden: true });
    var pick = h('button', { type: 'button', class: 'button button-secondary', text: 'Escolher vídeo…' });
    var fname = h('span', { class: 'palco-file', text: 'Nenhum vídeo ainda. Você também pode arrastar o arquivo para o palco.' });
    var quality = h('select', { class: 'palco-select', id: options.id + '-quality' },
      h('option', { value: 'max', text: 'Máxima (arquivo maior, igual ao original)' }),
      h('option', { value: 'high', text: 'Alta (recomendada para redes sociais)', selected: true }),
      h('option', { value: 'light', text: 'Leve (arquivo menor)' }));
    var qNote = h('small', { class: 'palco-note', text: 'A resolução, o formato da tela e os quadros por segundo do original são mantidos.' });
    var exportBtn = h('button', { type: 'button', class: 'button button-primary button-wide palco-export', text: 'Exportar vídeo', disabled: true });
    var barFill = h('span'); barFill.style.width = '0%';
    var bar = h('div', { class: 'progress-track', hidden: true, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, barFill);
    var statusEl = h('p', { class: 'palco-status', role: 'status', text: 'Carregue um vídeo para exportar. A exportação acontece no seu navegador e leva o tempo do vídeo.' });
    var result = h('div', { class: 'palco-result', hidden: true });
    var resultUrl = null;
    var saved = true;

    pick.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () { var f = input.files[0]; if (f && studio.load(f)) fname.textContent = f.name; input.value = ''; });
    exportBtn.addEventListener('click', function () {
      if (studio.recording()) studio.cancel(); else studio.exportVideo(quality.value, options.suffix);
    });
    var updateNote = function () {
      if (!studio.hasVideo()) return;
      var s = studio.size(), fps = studio.fps();
      qNote.textContent = 'Sai em ' + s.width + '×' + s.height + (fps ? ' a ' + fps + ' fps' : '') + '. Vídeo a ~' + (studio.bitrate(quality.value) / 1e6).toFixed(0) + ' Mbps, áudio a 320 kbps.';
    };
    quality.addEventListener('change', updateNote);

    return {
      fileGroup: h('div', { class: 'palco-group' }, h('span', { class: 'palco-label', text: 'Vídeo' }), input, pick, fname,
        h('small', { class: 'palco-note', text: 'MP4, MOV (iPhone), M4V, WebM, MKV e 3GP. Vertical ou horizontal.' })),
      exportGroup: h('div', { class: 'palco-stack' },
        h('label', { class: 'palco-group', for: options.id + '-quality' }, h('span', { class: 'palco-label', text: 'Qualidade da exportação' }), quality, qNote),
        h('div', { class: 'palco-group' }, exportBtn, bar, statusEl, result)),
      onFileDropped: function (f) { if (f && studio.load(f)) fname.textContent = f.name; },
      setStatus: function (s) { statusEl.textContent = s.text; statusEl.classList.toggle('field-error', s.error); },
      setReady: function (ready) { exportBtn.disabled = !ready; if (ready) updateNote(); pick.disabled = false; },
      setFps: updateNote,
      refreshNote: updateNote,
      setRecording: function (on) {
        exportBtn.textContent = on ? 'Cancelar exportação' : 'Exportar vídeo';
        bar.hidden = !on; quality.disabled = on; pick.disabled = on;
        if (on) { result.hidden = true; saved = true; }
        options.onActivity({ active: on, unsaved: on || !saved });
      },
      setProgress: function (pct) { barFill.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(Math.round(pct))); },
      setResult: function (r) {
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(r.blob);
        saved = false;
        result.textContent = '';
        var preview = h('video', { src: resultUrl, controls: true, playsinline: true });
        var link = h('a', { class: 'button button-primary button-wide', href: resultUrl, download: r.name }, DF.svg('download'), ' Baixar vídeo');
        link.addEventListener('click', function () { saved = true; options.onActivity({ active: false, unsaved: false }); });
        result.appendChild(preview); result.appendChild(link);
        result.appendChild(h('small', { class: 'palco-note', text: 'Se o download não começar, abra o menu do vídeo acima e escolha salvar.' }));
        result.hidden = false;
        options.onActivity({ active: false, unsaved: true });
      },
    };
  }

  // Liga o canvas arrastável ao estúdio e às duas partes de tela
  function wire(DF, studio, stage, panel) {
    ['dragenter', 'dragover'].forEach(function (t) {
      stage.stage.addEventListener(t, function (e) { e.preventDefault(); if (!studio.recording()) stage.drop.hidden = false; });
    });
    stage.stage.addEventListener('dragleave', function () { stage.drop.hidden = true; });
    stage.stage.addEventListener('drop', function (e) { e.preventDefault(); stage.drop.hidden = true; panel.onFileDropped(e.dataTransfer.files[0]); });
  }

  root.VideoStudio = { Studio: Studio, stageUI: stageUI, exportUI: exportUI, wire: wire, isVideo: isVideo };
})(typeof self !== 'undefined' ? self : this);
