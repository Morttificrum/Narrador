import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir arquivos estáticos da pasta dist
app.use(express.static(path.join(__dirname, 'dist')));

// Rota de API simples de teste para verificar se o servidor está ativo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Proxy de TTS para áudio de narração real integrado ao AudioContext
import { GoogleGenAI } from "@google/genai";

let aiClient: any = null;
function getGeminiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

app.get('/api/tts', async (req, res) => {
  try {
    const text = req.query.text as string;
    const voiceName = (req.query.voice || 'Zephyr') as string; // Zephyr, Kore, Puck, Fenrir, Charon
    const emotion = (req.query.emotion || 'Profissional') as string; // Animado, Profissional, Calmo, Dramático

    if (!text) {
      return res.status(400).send('Text is required');
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        console.log(`[TTS] Gerando áudio via Gemini TTS: Voz=${voiceName}, Tom=${emotion}, Texto="${text.substring(0, 40)}..."`);
        
        // Prompt personalizado para injetar tom, emoção e ritmo
        const promptText = `Gere a fala em português do Brasil com a seguinte atitude/tom: "${emotion}".
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
    }

    // Fallback para Google Translate
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

// Qualquer outra solicitação cai no index.html do SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
