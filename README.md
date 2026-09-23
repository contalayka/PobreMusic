# PobreMusic ♬

Player de música online gratuito e biblioteca musical otimizada para o **Cloudflare Pages**.

## Como fazer o deploy no Cloudflare Pages

O projeto já possui toda a estrutura configurada:
- `wrangler.json` (configuração do projeto no Cloudflare Pages)
- `functions/api/` (Edge Functions sem custos do Cloudflare para busca e importação de playlists)
- `dist/` (build estático ultrarrápido com Vite)

### Método 1: Direto pelo painel do Cloudflare (Recomendado)
1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Selecione o repositório deste projeto.
3. Nas configurações de build:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Clique em **Save and Deploy**. As funções de `/functions` e os assets estáticos serão publicados automaticamente!

### Método 2: Pela linha de comando (Wrangler CLI)
1. Faça login na sua conta Cloudflare no seu terminal:
   ```bash
   npx wrangler login
   ```
2. Faça o build e envie para o Cloudflare Pages:
   ```bash
   npm run build
   npx wrangler pages deploy dist
   ```
