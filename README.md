# Ferramentas Deroflux (no navegador)

Site estático com menu lateral e seis ferramentas que rodam **no navegador**:
nenhum arquivo é enviado para servidor.

| Ferramenta | Arquivo | Como funciona |
|---|---|---|
| Limpar vídeo | `tool-limpar-video.js` + `cleaner.js` | Remove metadados de MP4/MOV sem recodificar |
| Sobrepor no vídeo | `tool-sobrepor-video.js` + `video-studio.js` | Logo por cima do vídeo; exporta com MediaRecorder |
| Filtro de Vídeo | `tool-palco.js` + `video-studio.js` | Tela de cor por cima do vídeo; exporta com MediaRecorder |
| Limpar imagem | `tool-limpar-imagem.js` + `image-cleaner.js` | Remove EXIF/XMP/IPTC de JPG/PNG/WebP sem recodificar |
| Melhorar imagem | `tool-melhorar-imagem.js` + `image-utils.js` | Amplia 2×/3×/4× + nitidez (UnsharpMask 1,4 / 90% / 2, como o servidor) |
| Sobrepor na imagem | `tool-sobrepor-imagem.js` + `image-utils.js` | Logo por cima da foto (mesma regra de posição/margem do servidor) |

`core.js` monta o menu, troca de ferramenta (`#limpar-video`, `#palco-filtro`…),
mantém as ferramentas abertas em segundo plano e avisa antes de fechar se algo se
perderia. `vercel.json` traz os cabeçalhos de segurança.

Publicação: GitHub + Vercel (Framework Preset "Other", sem build) ou GitHub Pages.
