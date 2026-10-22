# Ferramentas Deroflux

Site estático com menu lateral. Quase tudo roda **no navegador**: os arquivos não são enviados para servidor nenhum.
A exceção é o "Baixar vídeo", que usa o servidor do Render.

| Ferramenta | Arquivo | Como funciona |
|---|---|---|
| Limpar vídeo | `tool-limpar-video.js` + `cleaner.js` | Remove metadados de MP4/MOV sem recodificar. Baixa todos em .zip |
| Sobrepor no vídeo | `tool-sobrepor-video.js` + `video-studio.js` | Imagem por cima do vídeo (arrastar/redimensionar), feed ou story |
| Filtro de Vídeo | `tool-palco.js` + `video-studio.js` | Tela de cor por cima do vídeo |
| Baixar vídeo | `tool-baixar-video.js` + `config.js` | Instagram/TikTok. Usa o servidor do Render (endereço em `config.js`) |
| Ajustar áudio | `tool-ajustar-audio.js` + `audio-fix.js` | Leva o áudio AAC a 128 kbps (erro de bitrate do Kwai) sem recodificar |
| Limpar imagem | `tool-limpar-imagem.js` + `image-cleaner.js` | Remove EXIF/XMP/IPTC de JPG/PNG/WebP sem recodificar. Baixa todas em .zip |
| Melhorar imagem | `tool-melhorar-imagem.js` + `image-utils.js` | Amplia 2×/3×/4× com nitidez |
| Sobrepor na imagem | `tool-sobrepor-imagem.js` + `image-utils.js` | Imagem por cima da foto (arrastar/redimensionar), feed ou story |

`core.js` monta o menu e as funções comuns (zip, editor de sobreposição, formatos).
`vercel.json` traz os cabeçalhos de segurança. Se o servidor do "Baixar vídeo" sair do
Render para um domínio próprio, acrescente esse domínio em `connect-src` no `index.html`
e no `vercel.json`.

Publicação: GitHub + Vercel (Framework Preset "Other", sem build).
