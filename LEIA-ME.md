# Rádio BR

Web app (PWA) para ouvir rádios brasileiras no iPhone — feito para usar no carro.

## O que tem
- 15 rádios populares de SP/RJ já prontas (Jovem Pan, CBN, BandNews, Antena 1, Transamérica, Mix, Kiss, Alpha, Nativa, 89 FM, Globo, Band FM).
- Busca de qualquer rádio do Brasil (pela Radio Browser) e estrela para salvar em **Minhas rádios**.
- Toca com a tela bloqueada; nome da rádio na tela de bloqueio.
- Botões ⏮ ⏭ do volante/Bluetooth trocam de rádio.
- Se o sinal cair (túnel, área sem 4G), reconecta sozinho.

## 1. Publicar (precisa de HTTPS) — escolha um

### Opção A: GitHub Pages (grátis, link fixo)
1. Crie uma conta em github.com (se ainda não tiver).
2. **New repository** → nome `radio-br` → **Public** → Create.
3. Clique em **uploading an existing file** e arraste estes arquivos e a pasta `icons`:
   `index.html`, `styles.css`, `app.js`, `stations.js`, `sw.js`, `manifest.webmanifest`, `icons/`.
   → **Commit changes**.
4. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
5. Em 1–2 minutos o app fica em `https://SEU-USUARIO.github.io/radio-br/`.

### Opção B: Netlify (arrastar e soltar)
1. Entre em app.netlify.com/drop (precisa criar conta para o link não expirar).
2. Arraste a pasta inteira do projeto. Ele gera um link `https://....netlify.app`.

## 2. Instalar no iPhone
1. Abra o link no **Safari** (tem que ser o Safari).
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → Adicionar.
3. Abra pelo ícone "Rádio BR". Na primeira vez, toque numa rádio — o iPhone exige um toque para começar a tocar.

## Dicas
- No carro: conecte o Bluetooth/cabo, abra o app, toque na rádio. Pode bloquear a tela.
- Para remover uma rádio de "Minhas rádios": **Editar** → ✕.
- Consumo de dados: cerca de 1 MB por minuto (~60 MB por hora).
- Não aparece como app próprio no CarPlay (isso só com app nativo da App Store), mas o áudio toca normal e aparece em "Tocando Agora".

## Editar a lista de rádios
As rádios fixas ficam em `stations.js`. Cada uma tem nome, cidade, sigla, cor e o link do stream (precisa ser `https://`).
Depois de mudar, suba o arquivo de novo no GitHub/Netlify.
