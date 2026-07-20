<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3b7786d6-e421-485c-8475-3c81c615a50e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
   (opcional: configure também `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` e
   `AIMLAPI_KEY` — veja `.env.example` pra instruções)

**Modelo BYOK:** quem for usar o app publicado não precisa das suas chaves — cada
pessoa cola a própria chave na tela de "⚙️ Configurações" dentro do app (fica salva
só no navegador dela). As chaves do `.env.local` são só um atalho pra você mesmo
testar sem preencher a tela toda hora.
3. Run the app:
   `npm run dev`
4. Abra **http://localhost:5173** no navegador (não a porta 3000 — essa é só a API)

## Build de produção

```
npm run build
npm start
```
Depois disso, o app inteiro (frontend + API) roda numa porta só: **http://localhost:3000**

