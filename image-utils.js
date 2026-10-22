/* Funções de imagem compartilhadas (abrir, ampliar, nitidez, salvar). */
(function (root) {
  'use strict';

  var MAX_PIXELS = 50000000; // mesmo teto do servidor (~50 MP)

  // Abre a imagem já na orientação certa (o navegador aplica a rotação do EXIF)
  function load(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, width: img.naturalWidth, height: img.naturalHeight, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir esta imagem. Use JPG, PNG ou WebP.')); };
      img.src = url;
    });
  }

  function kindOf(file) {
    var name = (file.name || '').toLowerCase();
    if (/\.png$/.test(name) || file.type === 'image/png') return { mime: 'image/png', ext: '.png' };
    if (/\.webp$/.test(name) || file.type === 'image/webp') return { mime: 'image/webp', ext: '.webp' };
    return { mime: 'image/jpeg', ext: '.jpg' };
  }

  // Salva o canvas no formato pedido (JPG/WebP com qualidade 95, como o servidor).
  // Se o navegador não gerar WebP (Safari antigo), cai para PNG.
  function encode(canvas, kind) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('A imagem ficou grande demais para este aparelho. Tente uma escala menor.')); return; }
        var ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
        resolve({ blob: blob, ext: ext });
      }, kind.mime, kind.mime === 'image/png' ? undefined : 0.95);
    });
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (!ctx) throw new Error('A imagem ficou grande demais para este aparelho. Tente uma escala menor.');
    return { canvas: c, ctx: ctx };
  }

  // Nitidez igual à do servidor: UnsharpMask(radius=1.4, percent=90, threshold=2).
  // Feita em faixas para não estourar a memória em imagens grandes.
  function gaussianKernel(sigma) {
    var r = Math.ceil(sigma * 3), k = [], sum = 0;
    for (var i = -r; i <= r; i++) { var v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    return k.map(function (v) { return v / sum; });
  }

  function unsharp(ctx, width, height, onProgress) {
    var kernel = gaussianKernel(1.4), r = (kernel.length - 1) / 2;
    var amount = 0.9, threshold = 2;
    var STRIP = 192;
    var y0 = 0;
    return new Promise(function (resolve, reject) {
      function step() {
        try {
          if (y0 >= height) { resolve(); return; }
          var top = Math.max(0, y0 - r), bottom = Math.min(height, y0 + STRIP + r);
          var rows = bottom - top;
          var data = ctx.getImageData(0, top, width, rows);
          var src = data.data;
          var tmp = new Float32Array(width * rows * 3);
          var x, y, c, i, acc, xx, yy;
          // horizontal
          for (y = 0; y < rows; y++) {
            for (x = 0; x < width; x++) {
              for (c = 0; c < 3; c++) {
                acc = 0;
                for (i = -r; i <= r; i++) { xx = x + i; if (xx < 0) xx = 0; else if (xx >= width) xx = width - 1; acc += src[(y * width + xx) * 4 + c] * kernel[i + r]; }
                tmp[(y * width + x) * 3 + c] = acc;
              }
            }
          }
          // vertical + máscara (só nas linhas desta faixa)
          var start = y0 - top, end = Math.min(rows, start + STRIP);
          var out = ctx.createImageData(width, end - start);
          var dst = out.data;
          for (y = start; y < end; y++) {
            for (x = 0; x < width; x++) {
              var o = (y * width + x) * 4, d = ((y - start) * width + x) * 4;
              for (c = 0; c < 3; c++) {
                acc = 0;
                for (i = -r; i <= r; i++) { yy = y + i; if (yy < 0) yy = 0; else if (yy >= rows) yy = rows - 1; acc += tmp[(yy * width + x) * 3 + c] * kernel[i + r]; }
                var orig = src[o + c], diff = orig - acc;
                var v = Math.abs(diff) >= threshold ? orig + diff * amount : orig;
                dst[d + c] = v < 0 ? 0 : v > 255 ? 255 : v;
              }
              dst[d + 3] = src[o + 3];
            }
          }
          ctx.putImageData(out, 0, y0);
          y0 += STRIP;
          if (onProgress) onProgress(Math.min(100, Math.round(y0 / height * 100)));
          setTimeout(step, 0);
        } catch (error) { reject(error); }
      }
      step();
    });
  }

  root.ImageUtils = { load: load, kindOf: kindOf, encode: encode, makeCanvas: makeCanvas, unsharp: unsharp, MAX_PIXELS: MAX_PIXELS };
})(typeof self !== 'undefined' ? self : this);
