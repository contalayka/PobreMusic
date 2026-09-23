# PobreMusic ♬

Player de música online gratuito e biblioteca musical otimizada para o **Cloudflare Pages**.

## Fontes de áudio

O resolvedor de áudio tenta as fontes nesta ordem:

1. **Audius** — busca e streaming via API oficial.
2. **Jamendo** — fallback para faixas disponíveis no catálogo Jamendo, usando o endpoint oficial de stream.

A integração do Jamendo usa somente a API de leitura e respeita o campo `audiodownload_allowed`. O **Client ID não é um segredo**, mas deve ser configurado como variável do ambiente do Cloudflare.

### Configurar Jamendo

Crie um aplicativo no portal de desenvolvedores do Jamendo e adicione a variável:

`JAMENDO_CLIENT_ID`

No Cloudflare Pages: **Settings → Environment variables → Production/Preview**.

Para desenvolvimento local, crie um arquivo `.dev.vars` (não faça commit dele):

```
JAMENDO_CLIENT_ID=seu_client_id
```

O PobreMusic continua funcionando sem essa variável; nesse caso, o fallback Jamendo simplesmente é ignorado.

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
4. Configure `JAMENDO_CLIENT_ID` nas variáveis de ambiente.
5. Clique em **Save and Deploy**.

### Método 2: Pela linha de comando (Wrangler CLI)
1. Faça login na sua conta Cloudflare no seu terminal:
   ```bash
   npx wrangler login
   ```
2. Configure `JAMENDO_CLIENT_ID` no ambiente do Pages.
3. Faça o build e envie para o Cloudflare Pages:
   ```bash
   npm run build
   npx wrangler pages deploy dist
   ```
