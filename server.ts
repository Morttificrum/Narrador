import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
const PORT = 3000;

// BUG CORRIGIDO: no dev (tsx, roda como ESM) __dirname não existe nativamente, então
// precisa calcular via import.meta.url. Mas no build de produção (esbuild empacota
// pra CommonJS), import.meta.url vira undefined — e o CJS já fornece __dirname nativo
// de graça. Este bloco detecta qual dos dois contextos está rodando e usa o certo,
// sem quebrar em nenhum dos dois.
declare const __dirname: string | undefined;
const currentDir: string = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(new URL(import.meta.url).pathname);

// --- BYOK ("Bring Your Own Key") ---
// Cada usuário cola a própria chave numa tela de configurações no navegador (guardada
// em localStorage, nunca no servidor). O front manda ela no header a cada chamada.
// Isso é o que faz o custo de cada geração de voz/música cair na CONTA DO USUÁRIO,
// não na sua — o servidor nunca guarda nem paga por chave de ninguém.
// Se não vier chave nenhuma no header, cai no .env do servidor como plano B (útil só
// pra você mesmo testar localmente, sem precisar preencher a tela toda hora).
function getKey(req: express.Request, header: string, envVar: string): string | undefined {
  const fromHeader = req.header(header);
  return fromHeader && fromHeader.trim() ? fromHeader.trim() : process.env[envVar];
}

// Rota pro frontend saber quais chaves JÁ existem no servidor (.env), só pra mostrar
// "configurado pelo administrador" em vez de pedir de novo — nunca devolve a chave em si.
app.get('/api/config-status', (_req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    azure: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    aimlapi: !!process.env.AIMLAPI_KEY,
  });
});

// --- Cálculo de ritmo baseado no tempo disponível do bloco ---
// Ideia: em vez de gerar o áudio no ritmo normal e acelerar DEPOIS (o que distorce e
// tem limite), calculamos o ritmo necessário ANTES e já pedimos pra voz falar nesse
// ritmo. Resultado natural, sem "efeito esquilo".
// Referência: português falado natural fica em torno de 14-15 caracteres/segundo.
const NORMAL_CHARS_PER_SEC = 14.5;

function calcPaceRatio(text: string, targetDurationSec?: number): number {
  if (!targetDurationSec || targetDurationSec <= 0) return 1;
  const neededCharsPerSec = text.length / targetDurationSec;
  return neededCharsPerSec / NORMAL_CHARS_PER_SEC;
}

// Traduz a razão de ritmo em instrução de linguagem natural pro Gemini (ele não aceita
// um número de velocidade direto — é controlado descrevendo o estilo em português).
function paceRatioToGeminiInstruction(ratio: number): string {
  if (ratio <= 1.1) return 'em ritmo normal de conversa, sem pressa';
  if (ratio <= 1.4) return 'num ritmo um pouco mais rápido que o normal, mas sem soar apressado';
  if (ratio <= 1.8) return 'num ritmo rápido e ágil, mantendo cada palavra clara e compreensível';
  return 'no ritmo mais rápido possível que ainda soe natural e compreensível, sem cortar palavras';
}

// Traduz a mesma razão pra uma taxa percentual de SSML (Azure aceita valor exato, então
// aqui podemos ser mais precisos que a instrução em texto do Gemini).
function paceRatioToSsmlRate(ratio: number): string {
  const clamped = Math.max(0.8, Math.min(2.2, ratio));
  const percent = Math.round((clamped - 1) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

// Servir arquivos estáticos da pasta dist
// BUG CORRIGIDO: o build empacota o servidor (dist/server.cjs) na MESMA pasta onde o
// vite coloca o frontend (index.html, assets/) — são irmãos dentro de dist/, não
// aninhados. Por isso currentDir (pasta de onde o server roda) já É a pasta certa,
// sem precisar (e sem poder) acrescentar 'dist' de novo.
app.use(express.static(currentDir));

// Rota de API simples de teste para verificar se o servidor está ativo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Proxy de TTS para áudio de narração real integrado ao AudioContext
import { GoogleGenAI } from "@google/genai";

// Cache de clientes Gemini por chave (cada usuário pode ter uma chave diferente,
// então não dá mais pra ter um único cliente global fixo como antes).
const geminiClientCache = new Map<string, any>();
function getGeminiClient(apiKey: string) {
  if (!geminiClientCache.has(apiKey)) {
    geminiClientCache.set(apiKey, new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    }));
  }
  return geminiClientCache.get(apiKey);
}

app.get('/api/tts', async (req, res) => {
  try {
    const text = req.query.text as string;
    const voiceName = (req.query.voice || 'Zephyr') as string; // Zephyr, Kore, Puck, Fenrir, Charon
    const emotion = (req.query.emotion || 'Profissional') as string; // Animado, Profissional, Calmo, Dramático
    const targetDuration = req.query.targetDuration ? parseFloat(req.query.targetDuration as string) : undefined;
    const geminiKey = getKey(req, 'X-Gemini-Key', 'GEMINI_API_KEY');

    if (!text) {
      return res.status(400).send('Text is required');
    }
    if (!geminiKey) {
      return res.status(400).send('Chave da Gemini não configurada. Cole sua chave em Configurações.');
    }

    const paceRatio = calcPaceRatio(text, targetDuration);
    const paceInstruction = paceRatioToGeminiInstruction(paceRatio);

    const ai = getGeminiClient(geminiKey);
    try {
      console.log(`[TTS] Gerando áudio via Gemini TTS: Voz=${voiceName}, Tom=${emotion}, Ritmo=${paceInstruction}, Texto="${text.substring(0, 40)}..."`);

      // Prompt personalizado para injetar tom, emoção e ritmo
      const promptText = `Gere a fala em português do Brasil com a seguinte atitude/tom: "${emotion}", falando ${paceInstruction}.
O texto contém marcações especiais de pausas:
- "//" representa uma pausa breve (equivalente a uma vírgula ou respiração de pausa curta).
- "///" representa uma pausa longa (equivalente a um ponto final ou mudança de parágrafo).

Por favor, faça a narração de forma contínua e natural, incorporando essas pausas no tempo certo do áudio gerado.

Texto para narrar:
${text}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/wav';

      if (base64Audio) {
        const buffer = Buffer.from(base64Audio, 'base64');
        res.setHeader('Content-Type', mimeType);
        return res.send(buffer);
      }
      console.warn("[TTS] Gemini retornou resposta sem áudio, recorrendo ao Translate...");
    } catch (geminiError: any) {
      console.error("[TTS] Erro ao chamar o Gemini TTS:", geminiError.message || geminiError);
      console.log("[TTS] Recorrendo ao Google Translate como fallback...");
    }

    // Fallback para Google Translate (sempre grátis, sem chave nenhuma)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch TTS: ${response.statusText}`);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err: any) {
    console.error("[TTS Error]", err);
    res.status(500).send(err.message);
  }
});

// --- Azure AI Speech (Neural TTS) — vozes gratuitas de alta qualidade ---
// Plano grátis da Azure: 500.000 caracteres/mês, vozes Neural (a mesma tecnologia
// das vozes "naturais" do Windows). Precisa de conta na Azure + criar um recurso
// "Speech" pra pegar a chave e a região (ex: 'brazilsouth').
// Diferente do Gemini, aqui dá pra controlar o ritmo com precisão exata via SSML,
// em vez de só pedir "fale mais rápido" em linguagem natural.
const AZURE_VOICES: Record<string, string> = {
  'Francisca': 'pt-BR-FranciscaNeural', // feminina, padrão, muito natural
  'Antonio': 'pt-BR-AntonioNeural',     // masculina, padrão
  'Brenda': 'pt-BR-BrendaNeural',       // feminina, jovem
  'Donato': 'pt-BR-DonatoNeural',       // masculina, grave
  'Elza': 'pt-BR-ElzaNeural',           // feminina, calorosa
  'Humberto': 'pt-BR-HumbertoNeural',   // masculina, formal/institucional
  'Manuela': 'pt-BR-ManuelaNeural',     // feminina, expressiva
  'Valerio': 'pt-BR-ValerioNeural',     // masculina, jovem
};

app.get('/api/tts-azure', async (req, res) => {
  try {
    const key = getKey(req, 'X-Azure-Key', 'AZURE_SPEECH_KEY');
    const region = getKey(req, 'X-Azure-Region', 'AZURE_SPEECH_REGION');
    if (!key || !region) {
      return res.status(400).send('Chave/região da Azure não configuradas. Preencha em Configurações.');
    }

    const text = req.query.text as string;
    if (!text) return res.status(400).send('Text is required');

    const voiceKey = (req.query.voice as string) || 'Francisca';
    const azureVoiceName = AZURE_VOICES[voiceKey] || AZURE_VOICES['Francisca'];
    const targetDuration = req.query.targetDuration ? parseFloat(req.query.targetDuration as string) : undefined;

    const paceRatio = calcPaceRatio(text, targetDuration);
    const ssmlRate = paceRatioToSsmlRate(paceRatio);

    // Marcações "//" e "///" viram pausas de verdade via <break> do SSML
    const escapedText = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\/\/\//g, '<break time="500ms"/>')
      .replace(/\/\//g, '<break time="250ms"/>');

    const ssml = `<speak version="1.0" xml:lang="pt-BR">
  <voice name="${azureVoiceName}">
    <prosody rate="${ssmlRate}">${escapedText}</prosody>
  </voice>
</speak>`;

    console.log(`[TTS Azure] Voz=${voiceKey} (${azureVoiceName}), Ritmo=${ssmlRate}, Texto="${text.substring(0, 40)}..."`);

    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'narrador-cd360',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS Azure] Erro:', response.status, errorText);
      return res.status(response.status).send(`Erro na Azure: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('[TTS Azure Error]', err);
    res.status(500).send(err.message);
  }
});

// Lista de vozes Azure disponíveis, pro frontend montar o seletor
app.get('/api/tts-azure/voices', (_req, res) => {
  res.json(Object.keys(AZURE_VOICES).map(key => ({ key, name: AZURE_VOICES[key] })));
});

// --- Música com IA de verdade (Stable Audio, via AIMLAPI) ---
// Modelo BYOK também: cada usuário usa a própria chave da AIMLAPI (30 créditos
// grátis pra testar, depois pay-as-you-go a partir de $0.08/geração).
// Fluxo em 2 passos: (1) pede a geração, recebe um generation_id; (2) fica
// perguntando (polling) até a música ficar pronta, depois baixa e devolve o áudio.
app.post('/api/music/generate', async (req, res) => {
  try {
    const key = getKey(req, 'X-Aimlapi-Key', 'AIMLAPI_KEY');
    if (!key) {
      return res.status(400).json({ error: 'Chave da AIMLAPI não configurada. Preencha em Configurações.' });
    }

    const { prompt, durationSec } = req.body as { prompt?: string; durationSec?: number };
    if (!prompt) return res.status(400).json({ error: 'prompt é obrigatório' });
    const seconds = Math.max(5, Math.min(90, durationSec || 30));

    console.log(`[Música IA] Gerando: "${prompt}" (${seconds}s)...`);

    const startRes = await fetch('https://api.aimlapi.com/v2/generate/audio', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'stable-audio', prompt, seconds_total: seconds }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error('[Música IA] Erro ao iniciar geração:', startRes.status, errText);
      return res.status(startRes.status).json({ error: `Erro ao iniciar geração: ${errText}` });
    }

    const startData = await startRes.json();
    const generationId = startData.id || startData.generation_id;
    if (!generationId) {
      return res.status(500).json({ error: 'AIMLAPI não devolveu um ID de geração.' });
    }

    // Polling: pergunta a cada 3s se já terminou, até no máximo ~2 minutos
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 3000));

      const pollRes = await fetch(`https://api.aimlapi.com/v2/generate/audio?generation_id=${generationId}`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'completed' && pollData.audio_file?.url) {
        console.log(`[Música IA] Pronta após ${attempt + 1} tentativa(s): ${pollData.audio_file.url}`);
        // Baixa o áudio de verdade e devolve pro navegador (evita problema de CORS
        // se o navegador tentasse buscar direto da URL da AIMLAPI)
        const audioRes = await fetch(pollData.audio_file.url);
        const arrayBuffer = await audioRes.arrayBuffer();
        res.setHeader('Content-Type', 'audio/wav');
        return res.send(Buffer.from(arrayBuffer));
      }

      if (pollData.status === 'error') {
        console.error('[Música IA] Erro na geração:', pollData.error);
        return res.status(500).json({ error: pollData.error?.message || 'Erro ao gerar música' });
      }
      // status "queued" ou "generating" → continua esperando
    }

    return res.status(504).json({ error: 'A geração demorou demais (mais de 2 minutos). Tente um prompt mais simples ou duração menor.' });
  } catch (err: any) {
    console.error('[Música IA Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Qualquer outra solicitação cai no index.html do SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(currentDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
