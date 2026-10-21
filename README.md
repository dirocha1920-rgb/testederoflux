# Limpador de metadados de vídeo (Deroflux)

Site estático que remove metadados de vídeos MP4/MOV **no navegador**: o vídeo
não é enviado para nenhum servidor.

- `index.html`, `style.css`, `app.js`: página e interface (tema Deroflux).
- `cleaner.js`: lê a estrutura do MP4/MOV e reescreve o arquivo sem metadados
  (udta, meta, XMP/uuid), sem as faixas de localização/sensores/timecode (com os
  bytes delas zerados) e com as datas internas zeradas. Corrige os endereços da
  mídia quando o índice vem antes dos dados. Não recodifica: imagem e som saem
  idênticos, bit a bit. Depois relê o resultado para conferir.
- `vercel.json`: cabeçalhos de segurança na Vercel.

Publicação: GitHub + Vercel (Framework Preset "Other", sem build) ou GitHub Pages.
