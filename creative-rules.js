/*
 * Regras do Checador de criativos (Meta Ads, TikTok Ads e Kwai Ads, foco no Brasil).
 * Pesquisa feita em outubro de 2026. Cada regra aponta para a fonte.
 * Níveis: 'erro' (reprova ou não sobe), 'aviso' (risco de reprovação/entrega ruim),
 * 'info' (boa prática), 'ok'.
 */
(function (root) {
  'use strict';

  var CHECKED = 'outubro de 2026';

  var SOURCES = {
    ttSpecs: { name: 'TikTok · Especificações de vídeo (atualizado jun/2026)', url: 'https://ads.tiktok.com/help/article/video-ads-specifications?lang=en' },
    ttFormat: { name: 'TikTok · Política "Ad Format and Functionality" (abr/2026)', url: 'https://ads.tiktok.com/help/article/tiktok-ads-policy-ad-format-and-functionality' },
    ttMisleading: { name: 'TikTok · Conteúdo enganoso e falso (abr/2026)', url: 'https://ads.tiktok.com/help/article/tiktok-ads-policy-misleading-and-false-content' },
    ttWeight: { name: 'TikTok · Controle de peso e imagem corporal (jun/2026)', url: 'https://ads.tiktok.com/help/article/tiktok-ads-policy-weight-management' },
    ttGambling: { name: 'TikTok · Jogos e apostas (out/2026)', url: 'https://ads.tiktok.com/help/article/tiktok-ads-policy-gambling-and-games' },
    ttPolitics: { name: 'TikTok · Política, governo e eleições', url: 'https://ads.tiktok.com/help/article/tiktok-ads-policy-politics-government-and-elections' },
    ttLanguage: { name: 'TikTok · Idioma do anúncio (ago/2026)', url: 'https://ads.tiktok.com/help/article/ad-review-checklist-ad-language' },
    ttTextLimits: { name: 'TikTok · Limites de texto (compilado AdNabu 2026)', url: 'https://blog.adnabu.com/tiktok/tiktok-ad-specs/' },
    metaSpecs: { name: 'Meta · Especificações por posicionamento (conferido em ago/2026, Solid Labs)', url: 'https://www.solidlabs.com/ad-specs/meta' },
    metaSpecs2: { name: 'Meta · Tamanhos, textos e zonas seguras (out/2026, Biddyco)', url: 'https://www.biddyco.com/blog-posts/meta-ad-specs' },
    metaStandards: { name: 'Meta · Padrões de Publicidade', url: 'https://transparency.meta.com/policies/ad-standards/' },
    metaHealth: { name: 'Meta · Revisão da política de saúde e bem-estar (22/jul/2026)', url: 'https://www.auditsocials.com/blog/meta-health-wellness-ad-policy-rewrite-july-2026' },
    metaAttrs: { name: 'Meta · Atributos pessoais e alegações enganosas (2026)', url: 'https://www.auditsocials.com/blog/meta-ad-misleading-claims-personal-attributes-prohibited-content-policy-2026' },
    metaElections: { name: 'Meta · Eleições 2026 no Brasil (anúncios políticos suspensos desde 30/set/2026)', url: 'https://about.fb.com/br/news/2026/06/nosso-trabalho-para-as-eleicoes-de-2026-no-brasil/' },
    kwaiSpecs: { name: 'Kwai · Especificações de vídeo para anúncios (In-Feed)', url: 'https://vidquickly.blogspot.com/2024/10/kwai-video-specifications-for-ads.html' },
    kwaiPolicy: { name: 'Kwai · Políticas de anúncios', url: 'https://www.kwai.com/business/legal/1' },
    kwaiPolitics: { name: 'Kwai · Proibição de anúncios políticos (Brasil)', url: 'https://desinformante.com.br/kwai-anuncios-politicos/' },
    betsBR: { name: 'Brasil · Portaria SPA/MF nº 1.964/2026 e Interministerial nº 73/2026 (apostas)', url: 'https://igamingbusiness.com/br/marketing-afiliados/regulacao-de-marketing/brasil-endurece-regras-para-publicidade-das-bets-e-exige-alerta-de-riscos-de-dependencia-perda-de-dinheiro-e-que-aposta-nao-e-investimento/' },
    bets1231: { name: 'Brasil · Portaria SPA/MF nº 1.231/2024 (publicidade de apostas)', url: 'https://www.gov.br/fazenda/pt-br/assuntos/noticias/2024/agosto/nova-portaria-da-fazenda-estabelece-que-operadores-de-apostas-poderao-ser-responsabilizados-por-publicidade-abusiva' },
    cdc: { name: 'Brasil · Código de Defesa do Consumidor, art. 37 (publicidade enganosa)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm' },
  };

  // ------------------------------------------------------------ plataformas
  var PLATFORMS = {
    meta: { name: 'Meta Ads', placements: { feed: 'Feed (Facebook e Instagram)', vertical: 'Stories e Reels' } },
    tiktok: { name: 'TikTok Ads', placements: { infeed: 'In-Feed (anúncio normal)', spark: 'Spark Ads (post impulsionado)' } },
    kwai: { name: 'Kwai Ads', placements: { infeed: 'In-Feed' } },
  };

  function near(a, b, tol) { return Math.abs(a - b) / b <= (tol || 0.02); }
  function ratioName(w, h) {
    var r = w / h;
    var known = [[9 / 16, '9:16'], [4 / 5, '4:5'], [1, '1:1'], [16 / 9, '16:9'], [1.91, '1.91:1'], [2 / 3, '2:3'], [3 / 4, '3:4'], [4 / 3, '4:3']];
    for (var i = 0; i < known.length; i++) if (near(r, known[i][0], 0.02)) return known[i][1];
    return r.toFixed(2) + ':1';
  }
  function kbps(b) { return Math.round(b / 1000) + ' kbps'; }
  function mb(b) { return (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function secs(s) { return s >= 60 ? Math.floor(s / 60) + 'min' + (Math.round(s % 60) ? ' ' + Math.round(s % 60) + 's' : '') : (Math.round(s * 10) / 10).toString().replace('.', ',') + 's'; }

  // ------------------------------------------------------------ arquivo (técnico + visual)
  // p = resultado do media-probe; a = análise visual/sonora (pode ter campos nulos)
  function checkMedia(p, a, platform, placement) {
    var out = [];
    function add(level, text, source, fix) { out.push({ level: level, text: text, source: source, fix: fix || null }); }
    a = a || {};
    var w = p.width, hgt = p.height, shortSide = Math.min(w || 0, hgt || 0);

    if (p.kind === 'image') return checkImage(p, platform, placement, add), out;
    if (!p.parseOk && !w) { add('erro', 'Não consegui ler este vídeo. Ele pode estar corrompido ou num formato que o navegador não abre.', null); return out; }

    // ---------- TikTok
    if (platform === 'tiktok') {
      var spark = placement === 'spark';
      var okTypes = spark ? ['mp4', 'mov'] : ['mp4', 'mov', 'mpeg', '3gp', 'avi'];
      if (okTypes.indexOf(p.container) < 0) add('erro', 'Formato .' + p.ext + ' não aceito. ' + (spark ? 'Spark Ads aceita MP4 e MOV.' : 'Aceitos: MP4, MOV, MPEG, 3GP e AVI.'), 'ttSpecs');
      if (!spark) {
        var r = w / hgt, vert = near(r, 9 / 16), hor = near(r, 16 / 9), sq = near(r, 1);
        if (!(vert || hor || sq)) add('erro', 'Proporção ' + ratioName(w, hgt) + ' não é aceita. Use 9:16 (recomendado), 1:1 ou 16:9.', 'ttSpecs');
        else if (vert && (w < 540 || hgt < 960)) add('erro', 'Resolução ' + w + '×' + hgt + ' abaixo do mínimo para 9:16 (540×960).', 'ttSpecs');
        else if (hor && (w < 960 || hgt < 540)) add('erro', 'Resolução ' + w + '×' + hgt + ' abaixo do mínimo para 16:9 (960×540).', 'ttSpecs');
        else if (sq && w < 640) add('erro', 'Resolução ' + w + '×' + hgt + ' abaixo do mínimo para 1:1 (640×640).', 'ttSpecs');
        else if (!vert) add('aviso', 'Proporção ' + ratioName(w, hgt) + ' é aceita, mas o TikTok recomenda 9:16 (tela cheia).', 'ttSpecs');
        else add('ok', 'Proporção 9:16 e resolução ' + w + '×' + hgt + '.', 'ttSpecs');
        if (p.size > 500 * 1048576) add('erro', 'Arquivo de ' + mb(p.size) + ' passa do limite de 500 MB.', 'ttSpecs');
        if (p.videoBitrate && p.videoBitrate < 516000) add('erro', 'Bitrate do vídeo ' + kbps(p.videoBitrate) + ' abaixo do mínimo de 516 kbps.', 'ttSpecs');
      }
      if (p.duration) {
        if (p.duration < 5) add('erro', 'Duração de ' + secs(p.duration) + ': a política de formato pede no mínimo 5 segundos.', 'ttFormat');
        else if (!spark && p.duration > 600) add('erro', 'Duração de ' + secs(p.duration) + ' passa do máximo de 10 minutos.', 'ttSpecs');
        else if (p.duration > 60) add('aviso', 'Duração de ' + secs(p.duration) + '. O Gerenciador aceita até 10 min, mas a política de formato (abr/2026) fala em 5 a 60 segundos. Prefira até 60s.', 'ttFormat');
        else add('ok', 'Duração de ' + secs(p.duration) + ' (5 a 60s).', 'ttFormat');
      }
      if (!p.hasAudio) add('erro', 'O vídeo não tem áudio. O TikTok exige anúncio com som.', 'ttFormat', 'audio');
      else if (a.audioSilent) add('erro', 'O áudio está mudo. O TikTok exige som (e de boa qualidade); uma faixa silenciosa costuma ser reprovada.', 'ttFormat');
      else if (a.audioSilent === false) add('ok', 'Tem áudio com som.', 'ttFormat');
      if (a.staticRatio != null) {
        if (a.staticRatio > 0.5) add('erro', 'Imagem parada em cerca de ' + Math.round(a.staticRatio * 100) + '% do vídeo. O TikTok não permite que imagem estática ocupe mais de 50% do vídeo (anúncio precisa ter movimento).', 'ttFormat');
        else if (a.staticRatio > 0.3) add('aviso', 'Partes paradas em cerca de ' + Math.round(a.staticRatio * 100) + '% do vídeo. Acima de 50% o TikTok reprova.', 'ttFormat');
        else add('ok', 'O vídeo tem movimento.', 'ttFormat');
      }
      if (a.qr) add('erro', 'Encontrei um QR code no vídeo. O TikTok não permite QR codes em anúncios.', 'ttFormat');
      if (a.blackBars) add('aviso', 'Faixas pretas nas bordas (' + (a.blackBars === 'letterbox' ? 'em cima e embaixo' : 'nas laterais') + '). Prefira vídeo em tela cheia, sem bordas.', 'ttSpecs');
    }

    // ---------- Kwai
    if (platform === 'kwai') {
      if (p.container !== 'mp4' && p.container !== 'mov') add('erro', 'Formato .' + p.ext + ' não aceito. O Kwai pede MP4.', 'kwaiSpecs');
      else if (p.container === 'mov') add('aviso', 'Arquivo MOV. O Kwai especifica MP4; se der erro no upload, exporte como MP4.', 'kwaiSpecs');
      if (p.videoCodec && ['h264', 'hevc', 'mpeg4'].indexOf(p.videoCodec) < 0) add('erro', 'Codec de vídeo ' + p.videoCodec.toUpperCase() + ' não aceito. Use H.264 (ou HEVC).', 'kwaiSpecs');
      var rk = w / hgt;
      if (!near(rk, 9 / 16, 0.03)) add('aviso', 'Proporção ' + ratioName(w, hgt) + '. O Kwai In-Feed é 9:16 (vertical, tela cheia).', 'kwaiSpecs');
      if (shortSide && shortSide < 500) add('erro', 'Resolução ' + w + '×' + hgt + ' abaixo do mínimo (500p).', 'kwaiSpecs');
      else if (shortSide && shortSide < 720) add('aviso', 'Resolução ' + w + '×' + hgt + '. O recomendado é 720p ou mais (ex.: 720×1280).', 'kwaiSpecs');
      else if (near(rk, 9 / 16, 0.03)) add('ok', 'Vertical 9:16 em ' + w + '×' + hgt + '.', 'kwaiSpecs');
      if (p.duration) {
        if (p.duration < 5) add('erro', 'Duração de ' + secs(p.duration) + ': o mínimo é 5 segundos.', 'kwaiSpecs');
        else if (p.duration > 600) add('erro', 'Duração de ' + secs(p.duration) + ': o máximo é 10 minutos.', 'kwaiSpecs');
        else if (p.duration < 15 || p.duration > 60) add('info', 'Duração de ' + secs(p.duration) + ' é aceita; entre 15 e 60 segundos costuma performar melhor.', 'kwaiSpecs');
        else add('ok', 'Duração de ' + secs(p.duration) + '.', 'kwaiSpecs');
      }
      if (p.size > 100 * 1048576) add('erro', 'Arquivo de ' + mb(p.size) + ' passa do limite de 100 MB.', 'kwaiSpecs');
      if (p.videoBitrate && p.videoBitrate < 516000) add('erro', 'Bitrate do vídeo ' + kbps(p.videoBitrate) + ' abaixo do mínimo de 516 kbps.', 'kwaiSpecs');
      if (p.fps && p.fps < 20) add('erro', 'Taxa de quadros de ' + p.fps.toFixed(0) + ' fps abaixo do mínimo de 20 fps.', 'kwaiSpecs');
      if (!p.hasAudio) add('erro', 'O vídeo não tem áudio. O Kwai In-Feed exige som (AAC, 64 kbps ou mais).', 'kwaiSpecs', 'audio');
      else if (p.audioCodec && p.audioCodec !== 'aac') add('erro', 'Áudio em ' + p.audioCodec.toUpperCase() + '. O Kwai pede AAC. Exporte o vídeo de novo com áudio AAC.', 'kwaiSpecs');
      else if (p.audioBitrate && p.audioBitrate < 64000) add('erro', 'Áudio a ' + kbps(p.audioBitrate) + ': o Kwai exige no mínimo 64 kbps ("Audio bitrate should be no less than 64kbps").', 'kwaiSpecs', 'audio');
      else if (p.audioBitrate) add('ok', 'Áudio AAC a ' + kbps(p.audioBitrate) + '.', 'kwaiSpecs');
      if (a.audioSilent) add('aviso', 'O áudio está mudo. O Kwai pede anúncio com som; vídeo sem som tende a performar pior.', 'kwaiSpecs');
      if (a.staticRatio != null && a.staticRatio > 0.6) add('aviso', 'Vídeo quase todo parado. No Kwai, criativo com movimento e pessoa falando costuma converter muito melhor.', 'kwaiSpecs');
      if (a.blackBars) add('aviso', 'Faixas pretas nas bordas. Use vídeo em tela cheia 9:16.', 'kwaiSpecs');
    }

    // ---------- Meta
    if (platform === 'meta') {
      var vertical = placement === 'vertical';
      if (['mp4', 'mov'].indexOf(p.container) < 0) add('erro', 'Formato .' + p.ext + ' não recomendado pela Meta. Use MP4 ou MOV.', 'metaSpecs');
      if (p.size > 4 * 1073741824) add('erro', 'Arquivo de ' + mb(p.size) + ' passa do limite de 4 GB.', 'metaSpecs');
      if (p.videoCodec && p.videoCodec !== 'h264') add('aviso', 'Codec ' + p.videoCodec.toUpperCase() + '. A Meta recomenda H.264; outros codecs podem falhar no processamento.', 'metaSpecs');
      if (p.vfr) add('aviso', 'Taxa de quadros variável. A Meta pede taxa de quadros fixa (comum em vídeos gravados no celular; reexporte no editor).', 'metaSpecs');
      if (p.fps && p.fps > 61) add('aviso', 'Vídeo a ' + Math.round(p.fps) + ' fps. O máximo indicado é 60 fps.', 'metaSpecs');
      var rm = w / hgt;
      if (vertical) {
        if (near(rm, 9 / 16, 0.02)) add('ok', 'Vertical 9:16 em ' + w + '×' + hgt + '.', 'metaSpecs');
        else if (rm <= 1.91 && rm >= 9 / 16 * 0.98) add('aviso', 'Proporção ' + ratioName(w, hgt) + '. Em Stories e Reels o ideal é 9:16; outras proporções ganham bordas ou cortes.', 'metaSpecs');
        else add('erro', 'Proporção ' + ratioName(w, hgt) + ' fora do intervalo aceito (de 1.91:1 a 9:16).', 'metaSpecs');
        if (w && w < 250) add('erro', 'Largura de ' + w + ' px abaixo do mínimo (250 px).', 'metaSpecs');
        else if (w && w < 500 && p.duration >= 30) add('erro', 'Largura de ' + w + ' px: Reels de 30s ou mais pedem no mínimo 500 px.', 'metaSpecs');
        else if (w && w < 1080) add('aviso', 'Largura de ' + w + ' px. Recomendado 1080×1920 ou mais (a Meta indica 1440×2560).', 'metaSpecs2');
        if (p.duration) {
          if (p.duration < 1) add('erro', 'Duração abaixo de 1 segundo.', 'metaSpecs');
          else if (p.duration > 900) add('erro', 'Duração de ' + secs(p.duration) + ': Reels do Instagram aceita até 15 minutos.', 'metaSpecs');
          else if (p.duration > 120) add('aviso', 'Duração de ' + secs(p.duration) + '. Em Stories o Facebook limita entre 2 e 3 min (as fontes da Meta divergem) e corta em cartões; prefira até 60s.', 'metaSpecs');
          else add('ok', 'Duração de ' + secs(p.duration) + '.', 'metaSpecs');
        }
      } else {
        if (near(rm, 4 / 5, 0.02) || near(rm, 1, 0.02)) add('ok', 'Proporção ' + ratioName(w, hgt) + ' (ideal para Feed).', 'metaSpecs');
        else if (rm < 4 / 5) add('aviso', 'Proporção ' + ratioName(w, hgt) + '. No Feed, vídeos mais altos que 4:5 são cortados. Recomendado 4:5 ou 1:1.', 'metaSpecs');
        else if (rm <= 1.91) add('aviso', 'Proporção ' + ratioName(w, hgt) + ' é aceita, mas no celular 4:5 ou 1:1 ocupa mais espaço.', 'metaSpecs');
        else add('erro', 'Proporção ' + ratioName(w, hgt) + ' mais larga que 1.91:1.', 'metaSpecs');
        if (w && w < 120) add('erro', 'Largura de ' + w + ' px abaixo do mínimo (120 px).', 'metaSpecs');
        else if (w && w < 1080) add('aviso', 'Largura de ' + w + ' px. Recomendado 1080 px ou mais (a Meta indica 1440×1800 para 4:5).', 'metaSpecs2');
        if (p.duration) {
          if (p.duration < 1) add('erro', 'Duração abaixo de 1 segundo.', 'metaSpecs');
          else if (p.duration > 3600) add('aviso', 'Duração de ' + secs(p.duration) + ': o Feed do Instagram aceita até 60 min (Facebook até 241 min).', 'metaSpecs');
          else add('ok', 'Duração de ' + secs(p.duration) + '.', 'metaSpecs');
        }
      }
      if (!p.hasAudio) add('aviso', 'Sem áudio. A Meta aceita, mas recomenda áudio AAC estéreo de 128 kbps ou mais; Reels sem som perde alcance.', 'metaSpecs', 'audio');
      else if (p.audioCodec && p.audioCodec !== 'aac') add('aviso', 'Áudio em ' + p.audioCodec.toUpperCase() + '. A Meta recomenda AAC.', 'metaSpecs');
      else if (p.audioBitrate && p.audioBitrate < 128000) add('aviso', 'Áudio a ' + kbps(p.audioBitrate) + '. A Meta recomenda 128 kbps ou mais.', 'metaSpecs', 'audio');
      else if (p.audioChannels === 1) add('info', 'Áudio mono. A Meta recomenda estéreo.', 'metaSpecs');
      else if (p.audioBitrate) add('ok', 'Áudio AAC a ' + kbps(p.audioBitrate) + '.', 'metaSpecs');
      if (a.blackBars && vertical) add('aviso', 'Faixas pretas nas bordas. Em Stories e Reels use tela cheia 9:16.', 'metaSpecs');
    }

    // ---------- comum
    if (p.fragmented) add('aviso', 'Vídeo em MP4 fragmentado (comum em gravações de tela e alguns apps). Algumas plataformas recusam; reexporte como MP4 comum.', null);
    var sens = (p.metadata || []).filter(function (m) { return /GPS|Localiza|aparelho|Fabricante|Modelo|C[aâ]mera|s[eé]rie|Autor|Dono|Propriet|Samsung|Android|Identificador/i.test(m.label); });
    if (sens.length) add('aviso', 'O arquivo carrega metadados pessoais (' + sens.slice(0, 3).map(function (m) { return m.label; }).join(', ') + '). Não reprova, mas expõe aparelho/localização e mostra que o vídeo é reaproveitado.', null, 'metadata');
    else if (p.metadata && p.metadata.length) add('info', 'Tem metadados técnicos (' + p.metadata.slice(0, 2).map(function (m) { return m.label; }).join(', ') + '). Pode limpar se quiser.', null, 'metadata');
    if (false) add('aviso', 'O arquivo carrega metadados (' + p.metadata.slice(0, 3).map(function (m) { return m.label; }).join(', ') + (p.metadata.length > 3 ? '…' : '') + '). Não reprova, mas expõe aparelho/localização e mostra que o vídeo é reaproveitado.', null, 'metadata');
    return out;
  }

  function checkImage(p, platform, placement, add) {
    var w = p.width, hgt = p.height, r = w / hgt;
    if (platform === 'tiktok') { add('erro', 'O TikTok In-Feed é só vídeo. Imagem entra apenas em carrossel. Se for transformar em vídeo, lembre: imagem parada em mais de 50% do vídeo é proibida.', 'ttFormat'); return; }
    if (platform === 'kwai') { add('erro', 'O Kwai In-Feed é só vídeo (MP4 9:16 com som).', 'kwaiSpecs'); return; }
    if (['jpg', 'png'].indexOf(p.container) < 0) add('erro', 'Formato .' + p.ext + ': a Meta pede JPG ou PNG.', 'metaSpecs2');
    if (p.size > 30 * 1048576) add('erro', 'Imagem de ' + mb(p.size) + ' passa do limite de 30 MB.', 'metaSpecs2');
    if (placement === 'vertical') {
      if (near(r, 9 / 16)) add('ok', 'Vertical 9:16 em ' + w + '×' + hgt + '.', 'metaSpecs2');
      else add('aviso', 'Proporção ' + ratioName(w, hgt) + '. Em Stories e Reels o ideal é 9:16 (1440×2560).', 'metaSpecs2');
    } else {
      if (near(r, 4 / 5) || near(r, 1)) add('ok', 'Proporção ' + ratioName(w, hgt) + ' (ideal para Feed).', 'metaSpecs2');
      else add('aviso', 'Proporção ' + ratioName(w, hgt) + '. No Feed o recomendado é 4:5 (1440×1800) ou 1:1.', 'metaSpecs2');
    }
    if (w < 1080) add('aviso', 'Largura de ' + w + ' px. Recomendado 1080 px ou mais.', 'metaSpecs2');
    if (p.metadata && p.metadata.length) add(p.metadata.some(function (m) { return /GPS|Localiza|aparelho|Modelo|C[aâ]mera/i.test(m.label); }) ? 'aviso' : 'info', 'A imagem carrega metadados (' + p.metadata.slice(0, 3).map(function (m) { return m.label; }).join(', ') + ').', null, 'metadata');
  }

  // ------------------------------------------------------------ texto do anúncio
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // Cada regra: re (sobre o texto sem acentos, minúsculo), níveis por plataforma, mensagem, dica
  var SENSITIVE = '(diabet\\w*|obes\\w*|gord[oa]s?|acima do peso|sobrepeso|depress\\w*|ansiedade|ansios[oa]|insonia|calvici\\w*|careca|impoten\\w*|disfuncao eretil|endividad[oa]|divida\\w*|nome sujo|negativad[oa]|score baixo|cancer|hiv|herpes|psoriase|autis\\w*|tdah|artrite|hemorroida\\w*|varizes|celulite|estrias|acne|espinhas|menopausa|infertil\\w*|gravida|desempregad[oa]|solteir[oa]|divorciad[oa]|idos[oa]|aposentad[oa]|gay|lesbica|evangelic[oa]|catolic[oa])';
  var TEXT_RULES = [
    // ---- atributos pessoais (Meta)
    { id: 'attr', re: new RegExp('\\b(voce|vc|tu)\\b[^.!?\\n]{0,40}\\b(e|esta|ta|tem|sofre( de| com)?|vive com|anda|ficou|se sente)\\b[^.!?\\n]{0,30}\\b' + SENSITIVE), meta: 'erro', tiktok: 'aviso', kwai: 'aviso', src: 'metaAttrs',
      msg: 'Afirma ou insinua uma característica pessoal de quem está vendo (saúde, peso, dívida, idade, religião etc.).', tip: 'Fale do tema, não da pessoa: em vez de "Você tem diabetes?", use "Dicas para quem quer controlar a glicose".' },
    { id: 'attr2', re: new RegExp('\\b(seu|sua|seus|suas|teu|tua)\\b\\s+(\\w+\\s+){0,2}' + SENSITIVE), meta: 'erro', tiktok: 'aviso', kwai: 'aviso', src: 'metaAttrs',
      msg: 'Usa "seu/sua" junto de uma condição pessoal sensível ("sua dívida", "seu diabetes").', tip: 'Troque por uma forma neutra: "dívidas", "controle do diabetes".' },
    { id: 'attrq', re: new RegExp('^\\s*(cansad[oa] de|sofre com|sofrendo com|tem vergonha d)[^.!?\\n]{0,40}' + SENSITIVE), meta: 'aviso', tiktok: 'aviso', kwai: 'info', src: 'metaAttrs',
      msg: 'Pergunta de abertura sobre um problema pessoal. A Meta ampliou em 2026 a detecção desse tipo de frase.', tip: 'Descreva a solução em vez de apontar o problema de quem lê.' },
    // ---- promessas e absolutos
    { id: 'guarantee', re: /\b(garantid[oa]s?|garantimos|garantia de resultado|resultado garantido|100% (garantid|eficaz|efetivo|seguro|natural e eficaz)|sem risco|risco zero)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'ttMisleading',
      msg: 'Promessa de resultado garantido. Todas as plataformas reprovam e o CDC (art. 37) considera enganosa se não for verdade.', tip: 'Use "pode ajudar", "muitos clientes relatam", e cite condições.' },
    { id: 'absolute', re: /\b(o melhor do (brasil|mundo|mercado)|n[ou]mero 1|n[ºo°]\s?1|o unico (que|do)|unico no mundo|melhor que (todos|qualquer)|nunca mais|para sempre|de uma vez por todas)\b/, meta: 'aviso', tiktok: 'erro', kwai: 'aviso', src: 'ttMisleading',
      msg: 'Termo absoluto ("o melhor", "número 1", "único", "nunca mais"). O TikTok proíbe absolutos sem comprovação.', tip: 'Tire o superlativo ou mostre a fonte da comparação.' },
    { id: 'instant', re: /\b(resultados?|efeito|emagre\w*|seca\w*|alivio|ganh\w*|clare\w*|cresc\w*|some|desaparec\w*|perde\w*)\b[^.!?\n]{0,30}\b(imediat\w*|instantane\w*|na hora|em segundos|da noite para o dia|em \d+ dias?|em (um|uma|dois|tres|sete) (dias?|semanas?))\b|\b(imediat\w*|instantane\w*|em \d+ dias?|da noite para o dia)\b[^.!?\n]{0,30}\b(resultados?|emagre\w*|seca\w*|alivio|clare\w*|cresc\w*)\b/, meta: 'aviso', tiktok: 'aviso', kwai: 'aviso', src: 'ttMisleading',
      msg: 'Promete efeito imediato ou em prazo curto ("na hora", "em 7 dias"). O TikTok cita "Get slim legs right away" como proibido; a Meta proíbe prazo sem ressalva em saúde.', tip: 'Remova o prazo ou acrescente "resultados variam de pessoa para pessoa".' },
    { id: 'miracle', re: /\b(milagr\w*|segredo (que|dos|das)|que (os medicos|a industria|ninguem) (nao )?(quer|querem) que voce saiba|truque (simples|caseiro)|formula secreta)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaAttrs',
      msg: 'Linguagem sensacionalista ("milagre", "segredo que os médicos escondem").', tip: 'Explique o benefício real do produto, sem mistério.' },
    { id: 'proven', re: /\b(clinicamente|cientificamente|comprovado pela ciencia|aprovado pela anvisa|testado por dermatologistas|dermatologicamente testado|recomendado por medicos)\b/, meta: 'aviso', tiktok: 'aviso', kwai: 'aviso', src: 'ttMisleading',
      msg: 'Alegação técnica ("clinicamente comprovado", "aprovado pela Anvisa"). O TikTok pede documento comprovando na revisão.', tip: 'Só use se tiver o estudo/registro; deixe o número do registro na página de destino.' },
    // ---- saúde
    { id: 'cure', re: /\b(cura|curar|curou|cure|elimina|eliminar|acaba com|acabar com|reverte|reverter)\b[^.!?\n]{0,30}\b(diabet\w*|herpes|tireoide|hipotireoidismo|psoriase|cancer|autis\w*|alzheimer|parkinson|ela\b|esclerose|hiv|aids|ebola)/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaHealth',
      msg: 'Promete curar doença incurável. Proibido na Meta (lista de jul/2026), no TikTok e no Kwai.', tip: 'Fale em bem-estar ou apoio ("ajuda na rotina de quem cuida da glicose"), nunca em cura.' },
    { id: 'curegen', re: /\b(cura|curar|cure)\b/, meta: 'aviso', tiktok: 'aviso', kwai: 'aviso', src: 'metaAttrs',
      msg: 'Usa a palavra "cura". Em saúde, isso costuma ser reprovado e pode violar regras da Anvisa.', tip: 'Prefira "alívio", "conforto", "apoio".' },
    { id: 'drugs', re: /\b(ozempic|mounjaro|wegovy|saxenda|semaglutida|tirzepatida|sibutramina|tadalafila|sildenafila|viagra|minoxidil|isotretinoina|roacutan|anabolizante\w*|hormonio do crescimento|remedio controlado|tarja (preta|vermelha)|sem receita)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaAttrs',
      msg: 'Menciona medicamento de receita ou substância controlada. Propaganda ao público é proibida no Brasil e exige autorização prévia nas plataformas.', tip: 'Não anuncie medicamento de prescrição; para clínicas, fale do serviço e da consulta.' },
    // ---- peso e corpo
    { id: 'weightnum', re: /\b(perca|perder|perdeu|elimine|eliminar|secar|seque|emagreca|emagrecer|emagreceu)\b[^.!?\n]{0,25}\b\d+\s?(kg|kilos?|quilos?|cm|numeros?|manequins?)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'ttWeight',
      msg: 'Promete perda de peso em número ("perca 10 kg"). TikTok proíbe resultado irreal e a Meta proíbe resultado específico sem ressalva.', tip: 'Tire o número; fale de hábitos e lembre que resultados variam. Público só 18+.' },
    { id: 'weighteasy', re: /\b(emagre\w*|perder peso|secar|queimar gordura|derreter gordura|barriga chapada)\b[^.!?\n]{0,40}\b(sem (dieta|academia|exercicio|esforco|sacrificio|passar fome)|so (tomando|usando|com)|dormindo|facil|rapido)\b|\bsem (dieta|academia|exercicio)s?\b[^.!?\n]{0,40}\b(emagre\w*|perder peso|secar|queimar gordura)/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'ttWeight',
      msg: 'Diz que emagrecer é fácil ou que o produto sozinho resolve, sem dieta/exercício. Proibido no TikTok; a Meta proíbe "resultado só com o produto".', tip: 'Apresente o produto como parte de uma rotina saudável.' },
    { id: 'weightany', re: /\b(emagre\w*|perder peso|perda de peso|queimar gordura|queima de gordura|seca barriga|ganhar massa|ganho de massa|engordar)\b/, meta: 'aviso', tiktok: 'aviso', kwai: 'aviso', src: 'metaHealth',
      msg: 'Anúncio de peso/emagrecimento ou ganho de massa. Na Meta e no TikTok o público deve ser 18+ e a linguagem, de vida saudável.', tip: 'Configure idade mínima 18 anos e evite promessas.' },
    { id: 'body', re: /\b(corpo (perfeito|ideal|dos sonhos)|pneuzinh\w*|barriga (horrivel|feia|nojenta)|gordura localizada|flacid\w* (horrivel|feia)|vergonha do (seu |teu )?corpo|fique (magra|magro|gostosa|gostoso)|feia|feio|horrorosa)\b/, meta: 'erro', tiktok: 'erro', kwai: 'aviso', src: 'ttWeight',
      msg: 'Linguagem que envergonha o corpo ou sugere um "corpo ideal". Proibido no TikTok; a Meta proíbe dizer que alguém é inferior pela aparência.', tip: 'Fale de bem-estar e autoestima sem comparar corpos.' },
    { id: 'beforeafter', re: /\b(antes e depois|antes x depois|antes\/depois|before (and|&) after)\b/, meta: 'aviso', tiktok: 'erro', kwai: 'aviso', src: 'ttMisleading',
      msg: '"Antes e depois". O TikTok proíbe comparações que distorcem resultado; na Meta (desde jul/2026) só é reprovado junto de alegação proibida.', tip: 'No TikTok, troque por depoimento sem comparação lado a lado.' },
    // ---- dinheiro
    { id: 'money', re: /\b(ganhe|ganhar|fature|faturar|lucre|lucrar|renda de)\b[^.!?\n]{0,25}\b(r\$\s?\d|\d+\s?(mil|reais)|por dia|por semana|por mes|todo dia|trabalhando de casa)/, skip: /(desconto|cashback|cupom|frete|brinde|off\b)/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'ttMisleading',
      msg: 'Promessa de ganho financeiro ("ganhe R$ 500 por dia"). As três plataformas reprovam; o TikTok cita "Get money in 10 seconds".', tip: 'Fale do que a pessoa aprende ou do serviço, sem valores prometidos.' },
    { id: 'easymoney', re: /\b(dinheiro facil|renda (extra )?garantida|renda passiva|fique rico|ficar rico|enriquecer|independencia financeira em|lucro garantido|rendimento garantido|dobre seu dinheiro|retorno garantido|pix na hora|saque imediato)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaAttrs',
      msg: 'Promessa de dinheiro fácil ou retorno garantido.', tip: 'Remova a promessa; em serviços financeiros mostre riscos e condições.' },
    { id: 'crypto', re: /\b(cripto\w*|bitcoin|btc|usdt|token|nft|forex|day ?trade|opcoes binarias|trader)\b/, meta: 'aviso', tiktok: 'aviso', kwai: 'aviso', src: 'metaAttrs',
      msg: 'Tema de cripto/investimento. É restrito: exige autorização prévia e empresa licenciada; opções binárias costumam ser proibidas.', tip: 'Confirme a elegibilidade antes de subir e nunca prometa retorno.' },
    { id: 'credit', re: /\b(emprestimo|credito (facil|aprovado|na hora)|limpe seu nome|limpar o nome|consignado|sem consulta (ao )?(spc|serasa)|cartao aprovado)\b/, meta: 'aviso', tiktok: 'aviso', kwai: 'aviso', src: 'metaAttrs',
      msg: 'Oferta de crédito/empréstimo. Serviço financeiro restrito (autorização e transparência de taxas); "aprovação garantida" é proibido.', tip: 'Mostre condições e custo total; nada de "aprovado na hora sem consulta".' },
    // ---- apostas
    { id: 'betwin', re: /\b(aposta\w*|bet\b|bets\b|cassino|casino|slot\w*|tigrinho|fortune tiger|roleta|odds|rodadas gratis|giros gratis|bonus de deposito)\b[^\n]{0,80}\b(ganh\w*|lucr\w*|renda|garantid\w*|facil|investimento|forrar|faturar)\b|\b(ganh\w*|lucr\w*|renda|facil)\b[^\n]{0,40}\b(aposta\w*|bet\b|cassino|tigrinho)/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'betsBR',
      msg: 'Liga aposta a ganho, renda ou facilidade. A Portaria Interministerial nº 73/2026 proíbe sugerir ganho fácil ou aposta como fonte de renda.', tip: 'Nunca associe aposta a dinheiro, investimento ou sucesso.' },
    // ---- outros proibidos
    { id: 'vape', re: /\b(vape|vaper|pod descartavel|cigarro eletronico|ignite|elfbar|narguile|essencia de narguile|tabaco|cigarros?)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaAttrs',
      msg: 'Tabaco ou cigarro eletrônico. Proibido nas três plataformas (e o vape é proibido no Brasil pela Anvisa).', tip: 'Esse produto não pode ser anunciado.' },
    { id: 'replica', re: /\b(replica|primeira linha|aaa\+?|similar (a|ao) original|inspirad[oa] n[oa] original|falsificad[oa])\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaAttrs',
      msg: 'Indica produto falsificado/réplica. Proibido em todas as plataformas.', tip: 'Venda só produto original ou de marca própria.' },
    { id: 'weapons', re: /\b(arma de fogo|pistola|revolver|municao|espingarda|airsoft|arma branca|soco ingles|taser|spray de pimenta)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaAttrs',
      msg: 'Armas, munição ou itens de defesa pessoal. Proibido ou muito restrito.', tip: 'Esse produto não pode ser anunciado.' },
    { id: 'adult', re: /\b(sexo|sexual|porn\w*|nude\w*|nudes|xxx|onlyfans|acompanhante\w*|garota de programa|vibrador|estimulante sexual|libido|tesao|excitante)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaHealth',
      msg: 'Conteúdo adulto ou produto para desejo sexual. Proibido (a Meta mantém a proibição em jul/2026).', tip: 'Esse tema não pode ser anunciado.' },
    { id: 'politics', re: /\b(vote em|vote no|vote na|eleicao|eleicoes|eleitoral|candidat[oa]s? a|deputad[oa]|senador\w*|vereador\w*|prefeit[oa]|governador\w*|presidente da republica|partido politico|psol|lula|bolsonaro|tarcisio|ciro gomes|marina silva)\b/, meta: 'erro', tiktok: 'erro', kwai: 'erro', src: 'metaElections',
      msg: 'Tema político/eleitoral. TikTok e Kwai proíbem anúncio político, e a Meta suspendeu todos os anúncios sobre política, eleições e temas sociais no Brasil desde 30/09/2026.', tip: 'Remova a referência política ou não anuncie esse conteúdo agora.' },
    // ---- interface falsa e pressão
    { id: 'fakeui', re: /\b(arraste para cima|deslize para cima|swipe up|toque duas vezes|clique no play|clique no x)\b/, meta: 'aviso', tiktok: 'erro', kwai: 'aviso', src: 'ttFormat',
      msg: 'Pede um gesto que o anúncio não suporta ("arraste para cima"). O TikTok proíbe texto/gesto de função que não existe.', tip: 'Use o botão de ação (CTA) da plataforma: "Saiba mais", "Comprar".' },
    { id: 'urgency', re: /\b(so hoje|somente hoje|ultimas? (unidades|vagas|horas)|acaba (hoje|em \d+)|corre que|ultima chance|vai acabar|oferta relampago)\b/, meta: 'info', tiktok: 'info', kwai: 'info', src: 'cdc',
      msg: 'Urgência/escassez. É permitido, mas precisa ser verdade (contadores falsos são reprovados na Meta e são publicidade enganosa pelo CDC).', tip: 'Garanta que a oferta realmente termina no prazo dito.' },
    { id: 'price', re: /\b(de r\$\s?\d[\d.,]*\s*(por|pra|para)\s*r\$|\d{1,2}% (off|de desconto)|desconto de \d)/, meta: 'info', tiktok: 'aviso', kwai: 'info', src: 'ttMisleading',
      msg: 'Preço ou desconto no texto. O TikTok reprova quando o valor não bate com a página de destino.', tip: 'Confira se o mesmo preço e desconto aparecem na página.' },
  ];

  var BET_WARNINGS = ['ministerio da fazenda adverte: apostar pode causar dependencia', 'ministerio da fazenda adverte: apostar faz voce perder dinheiro', 'ministerio da fazenda adverte: aposta nao e investimento'];

  // fields: { primary, headline, description, name }; sector: id; platforms: { meta, tiktok, kwai } (placement)
  function checkText(fields, sector, platforms) {
    var result = { meta: [], tiktok: [], kwai: [] };
    var all = [fields.primary, fields.headline, fields.description].filter(Boolean).join('\n');
    var n = norm(all);
    function add(pl, level, text, source, tip, snippet) { if (platforms[pl]) result[pl].push({ level: level, text: text, source: source, tip: tip || '', snippet: snippet || '' }); }
    function each(fn) { ['meta', 'tiktok', 'kwai'].forEach(function (pl) { if (platforms[pl]) fn(pl); }); }

    // limites de tamanho
    var prim = (fields.primary || '').trim(), head = (fields.headline || '').trim(), desc = (fields.description || '').trim(), name = (fields.name || '').trim();
    var len = function (s) { return Array.from(s).length; };
    if (platforms.tiktok) {
      if (prim) {
        if (platforms.tiktok === 'infeed' && len(prim) > 100) add('tiktok', 'erro', 'Texto com ' + len(prim) + ' caracteres. No anúncio normal o limite é 100 (conta espaços e emojis).', 'ttTextLimits');
        else if (platforms.tiktok === 'spark' && len(prim) > 150) add('tiktok', 'aviso', 'Legenda com ' + len(prim) + ' caracteres. Só as primeiras linhas aparecem (até 4 linhas).', 'ttTextLimits');
        else add('tiktok', 'ok', 'Texto com ' + len(prim) + ' caracteres (dentro do limite).', 'ttTextLimits');
        if (platforms.tiktok === 'infeed' && /(https?:\/\/|www\.|\.com\b|\.com\.br\b)/i.test(prim)) add('tiktok', 'aviso', 'Tem link no texto. No anúncio normal links, @ e # não funcionam; use o campo de URL.', 'ttSpecs');
        if (platforms.tiktok === 'infeed' && /(^|\s)[@#]\w/.test(prim)) add('tiktok', 'info', '@ e # não ficam clicáveis no anúncio normal.', 'ttSpecs');
      }
      if (name) {
        if (len(name) > 20) add('tiktok', 'erro', 'Nome de exibição com ' + len(name) + ' caracteres. O limite é 20.', 'ttSpecs');
        if (/\p{Extended_Pictographic}/u.test(name)) add('tiktok', 'aviso', 'Nome de exibição com emoji. O TikTok não aceita emoji no nome da marca.', 'ttTextLimits');
      }
    }
    if (platforms.meta) {
      if (prim) {
        if (len(prim) > 125) add('meta', 'info', 'Texto principal com ' + len(prim) + ' caracteres. Passa de 125 e aparece "Ver mais" (no Reels só cerca de 40 caracteres ficam visíveis).', 'metaSpecs2');
        else add('meta', 'ok', 'Texto principal com ' + len(prim) + ' caracteres.', 'metaSpecs2');
      }
      if (head && len(head) > 40) add('meta', 'info', 'Título com ' + len(head) + ' caracteres. O recomendado é até 40 (no Feed do Facebook cerca de 27 aparecem).', 'metaSpecs2');
      if (desc && len(desc) > 30) add('meta', 'info', 'Descrição com ' + len(desc) + ' caracteres. O recomendado é até 25–30.', 'metaSpecs2');
    }
    if (platforms.kwai && prim && len(prim) > 100) add('kwai', 'info', 'Texto com ' + len(prim) + ' caracteres. O Kwai não publica limite oficial; textos curtos (até ~100) leem melhor no feed.', 'kwaiSpecs');

    // qualidade da escrita (TikTok reprova; nas outras é aviso)
    if (all.trim()) {
      var letters = all.replace(/[^A-Za-zÀ-ÿ]/g, '');
      var upper = all.replace(/[^A-ZÀ-Þ]/g, '');
      var capsWords = (all.match(/\b[A-ZÀ-Þ]{4,}\b/g) || []).filter(function (wd) { return ['PROMO', 'FRETE', 'GRÁTIS', 'GRATIS', 'PIX', 'LGPD'].indexOf(wd) < 0; });
      if (letters.length >= 12 && upper.length / letters.length > 0.5) each(function (pl) { add(pl, pl === 'tiktok' ? 'erro' : 'aviso', 'Texto quase todo em MAIÚSCULAS. O TikTok proíbe uso excessivo de caixa alta; nas outras parece spam.', 'ttFormat', 'Escreva normalmente e destaque no máximo uma palavra.'); });
      else if (capsWords.length >= 3) each(function (pl) { add(pl, pl === 'tiktok' ? 'aviso' : 'info', 'Várias palavras em MAIÚSCULAS (' + capsWords.slice(0, 3).join(', ') + ').', 'ttFormat', 'Use caixa alta com moderação.'); });
      if (/([!?])\1{1,}|[!?]{3,}/.test(all)) each(function (pl) { add(pl, pl === 'tiktok' ? 'erro' : 'aviso', 'Pontuação repetida ("!!!", "??"). O TikTok proíbe pontuação excessiva.', 'ttFormat', 'Use um ponto de exclamação só.'); });
      if (/[a-zà-ÿ][@$€£%*#][a-zà-ÿ]|[a-zà-ÿ]\d[a-zà-ÿ]/i.test(all.replace(/\S+@\S+\.\S+/g, ''))) each(function (pl) { add(pl, pl === 'tiktok' ? 'erro' : 'aviso', 'Símbolos ou números no meio das palavras (ex.: "gr@tis", "$aúde", "c4ro"). O TikTok proíbe.', 'ttFormat', 'Escreva as palavras corretamente.'); });
      if (/([a-zà-ÿ])\1\1/i.test(all.replace(/\b(www|kkk+|rsrs+|hahah\w*)\b/gi, ''))) each(function (pl) { add(pl, pl === 'tiktok' ? 'aviso' : 'info', 'Letras repetidas ("muuuito", "fressh"). O TikTok reprova erros de digitação e escrita informal exagerada.', 'ttFormat', 'Revise a ortografia.'); });
      if (/ {3,}/.test(all)) each(function (pl) { add(pl, pl === 'tiktok' ? 'aviso' : 'info', 'Espaços em excesso entre palavras.', 'ttFormat', 'Deixe só um espaço.'); });
      var emojis = (all.match(/\p{Extended_Pictographic}/gu) || []).length;
      if (emojis > 5) each(function (pl) { add(pl, 'info', emojis + ' emojis no texto. Use poucos; em excesso parece spam e pode aparecer diferente em cada celular.', 'ttTextLimits'); });
    }

    // regras de conteúdo
    TEXT_RULES.forEach(function (rule) {
      var m = n.match(rule.re);
      if (!m) return;
      if (rule.skip && rule.skip.test(n.slice(m.index, m.index + m[0].length + 25))) return;
      var snippet = m[0].trim().slice(0, 80);
      each(function (pl) { if (rule[pl]) add(pl, rule[pl], rule.msg, rule.src, rule.tip, snippet); });
    });

    // setor: exigências específicas
    var betsText = /\b(aposta\w*|bet\b|bets\b|cassino|casino|slot\w*|tigrinho|odds|rodadas gratis)\b/.test(n);
    if (sector === 'apostas' || betsText) {
      var hasWarning = BET_WARNINGS.some(function (w) { return n.indexOf(w) >= 0; });
      var has18 = /(\+18|18\+|maiores de 18|menores de 18|proibido para menores)/.test(n);
      each(function (pl) {
        add(pl, hasWarning ? 'ok' : 'erro', hasWarning ? 'Tem a advertência obrigatória do Ministério da Fazenda.' : 'Falta a advertência obrigatória (desde 17/07/2026): "Ministério da Fazenda adverte: Apostar pode causar dependência" (ou "...faz você perder dinheiro" / "Aposta não é investimento"), ocupando pelo menos 10% da peça.', 'betsBR', 'A frase precisa estar também no vídeo/imagem, legível e na horizontal.');
        add(pl, has18 ? 'ok' : 'erro', has18 ? 'Indica proibição para menores de 18.' : 'Falta indicar que é proibido para menores de 18 anos ("18+").', 'bets1231');
        add(pl, 'aviso', 'Só operadoras autorizadas pela SPA/MF podem anunciar no Brasil, e cada plataforma exige certificação própria para apostas.', pl === 'tiktok' ? 'ttGambling' : 'betsBR');
      });
    }
    if (sector === 'saude' || sector === 'emagrecimento') each(function (pl) { add(pl, 'aviso', 'Saúde/suplementos/emagrecimento: público mínimo 18 anos, nada de cura ou prazo, e alegações só as permitidas pela Anvisa (suplemento não é remédio).', pl === 'tiktok' ? 'ttWeight' : 'metaHealth'); });
    if (sector === 'financas') each(function (pl) { add(pl, 'aviso', 'Serviço financeiro: exige empresa regulamentada e, em geral, autorização prévia da plataforma. Mostre riscos e custos.', 'metaAttrs'); });
    if (sector === 'politica') each(function (pl) { add(pl, 'erro', pl === 'meta' ? 'A Meta suspendeu anúncios de política, eleições e temas sociais no Brasil desde 30/09/2026.' : (pl === 'tiktok' ? 'O TikTok não permite anúncios políticos.' : 'O Kwai não permite anúncios políticos no Brasil.'), pl === 'meta' ? 'metaElections' : (pl === 'tiktok' ? 'ttPolitics' : 'kwaiPolitics')); });
    if (sector === 'emprego' || sector === 'imoveis') each(function (pl) { if (pl === 'meta') add(pl, 'info', 'Emprego/imóveis/crédito são "categorias especiais" da Meta (EUA/Canadá principalmente); no Brasil confira se a campanha pede a declaração.', 'metaAttrs'); });

    // remove repetidos (mesma mensagem)
    Object.keys(result).forEach(function (pl) {
      var seen = {};
      result[pl] = result[pl].filter(function (it) { var k = it.level + it.text; if (seen[k]) return false; seen[k] = 1; return true; });
    });
    return result;
  }

  // ------------------------------------------------------------ o que precisa ver no olho
  var CHECKLIST = {
    meta: [
      ['Zonas seguras (Stories/Reels): nada importante nos 14% de cima, 35% de baixo e 6% das laterais.', 'metaSpecs2'],
      ['Música com direito de uso (prefira a biblioteca de sons da Meta).', 'metaSpecs'],
      ['A página de destino mostra o mesmo produto, preço e condições do anúncio.', 'metaAttrs'],
      ['Nada de imagem que aponte condição da pessoa (ex.: gordura pinçada no corpo, comparação humilhante).', 'metaHealth'],
      ['Depoimentos reais e representativos; nada de notícia falsa ou "matéria" fake.', 'metaAttrs'],
    ],
    tiktok: [
      ['Zona segura do In-Feed: nada importante nos 160 px de cima, 440 px de baixo e 80 px laterais (em 1080×1920).', 'ttTextLimits'],
      ['Conteúdo feito ou alterado por IA de forma realista (voz, rosto, cena) precisa do selo de IA.', 'ttMisleading'],
      ['Sem botões falsos (play, fechar) ou gestos que não funcionam.', 'ttMisleading'],
      ['Sem antes-e-depois que distorça resultado e sem rosto/voz de famoso sem autorização.', 'ttMisleading'],
      ['Fala e legendas em português, iguais ao idioma da página de destino.', 'ttLanguage'],
      ['A página de destino funciona no celular e mostra o mesmo produto, preço e desconto.', 'ttFormat'],
      ['Áudio limpo e compreensível (não abafado).', 'ttFormat'],
    ],
    kwai: [
      ['Vídeo vertical em tela cheia, com som e em português.', 'kwaiSpecs'],
      ['Sem conteúdo político, adulto ou promessas absolutas (cura, ganho garantido).', 'kwaiPolicy'],
      ['Nome da marca igual ao do cadastro, ao da página e ao que aparece no vídeo.', 'kwaiPolicy'],
      ['Sem marca d\'água de outra rede (TikTok, Reels) e sem música sem licença.', 'kwaiPolicy'],
      ['Página de destino no ar, em português e com o mesmo produto do vídeo.', 'kwaiPolicy'],
    ],
  };

  var SECTORS = [
    ['geral', 'Produto ou serviço comum'],
    ['saude', 'Saúde, suplementos, estética'],
    ['emagrecimento', 'Emagrecimento ou ganho de massa'],
    ['financas', 'Finanças, crédito, investimentos, cripto'],
    ['apostas', 'Apostas / bets / cassino'],
    ['infoproduto', 'Curso, mentoria, infoproduto'],
    ['emprego', 'Vagas de emprego'],
    ['imoveis', 'Imóveis'],
    ['politica', 'Política ou causas sociais'],
  ];

  root.CreativeRules = { SOURCES: SOURCES, PLATFORMS: PLATFORMS, SECTORS: SECTORS, CHECKLIST: CHECKLIST, CHECKED: CHECKED, checkMedia: checkMedia, checkText: checkText, ratioName: ratioName, _norm: norm };
})(typeof self !== 'undefined' ? self : this);
