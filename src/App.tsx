import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  VolumeX, 
  Download, 
  Music, 
  Sparkles, 
  Radio, 
  Clock, 
  Activity, 
  CheckCircle,
  RotateCcw,
  FileText,
  Sliders,
  Megaphone,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

const DEFAULT_SCRIPT_MD = `# Pacote de áudio — Vídeo "Divulgação" (CD360)
Duração total: **108s** (1min48s). Envie este documento pra uma IA de voz/música.

## 1. Roteiro com marcação de locução
Legenda: \`//\` = pausa curta · \`///\` = pausa longa · **negrito** = ênfase · \`‹lento›...‹/lento›\` = reduzir velocidade

**[0:00–0:06] Abertura**
iFood, WhatsApp, PDV, cardápio digital... // tudo em **um só lugar**. /// Conheça o Controle Delivery 360.

**[0:06–0:14] Problema**
Se você toca um restaurante sozinho, sabe a dor: // pedido aqui, mensagem ali, caixa em outro canto — /// e **nada conversa** entre si.

**[0:14–0:28] Dashboard**
No CD360, tudo isso vira **um painel só**. // Você vê a receita do dia, os pedidos em **tempo real**, de onde eles vêm — iFood, WhatsApp ou balcão — /// sem abrir três telas diferentes.

**[0:28–0:40] Assistente de IA**
E tem um assistente de inteligência artificial cuidando dos números pra você: // ele analisa sua loja o tempo todo /// e avisa quando algo importante acontece, como um pico de pedidos.

**[0:40–0:54] PDV / código de barras**
No PDV, o leitor de código de barras faz o trabalho pesado: // escaneou, o produto já cai no carrinho. /// Rápido pro seu time, **sem erro** na hora de vender.

**[0:54–1:06] Venda por peso**
Vende por peso? // ‹lento›O sistema lê direto da balança‹/lento› — quilo, grama ou litro — /// e calcula o preço certo na hora, sem calculadora, sem gambiarra.

**[1:06–1:17] Avaliação QR Code**
Depois da venda, o cliente avalia com um QR Code — // sem baixar app, sem criar login — /// e pode ganhar um cupom automático de volta.

**[1:17–1:27] Perfil Gerente**
E com o perfil Gerente, sua equipe toca o dia a dia sozinha. // Você não precisa estar **sempre por perto** /// pra tudo continuar rodando.

**[1:27–1:39] Franqueadora**
Tem mais de uma loja? // O painel de franqueadora mostra todas as unidades juntas, com ranking por loja e por região, /// pra você decidir com dados.

**[1:39–1:48] CTA final**
Bora colocar seu delivery pra rodar **sozinho**? // Teste o Controle Delivery 360 grátis por **14 dias**. /// Sem cartão, sem fidelidade.`;

interface ScriptBlock {
  id: string;
  timeRange: string;
  startSec: number;
  endSec: number;
  title: string;
  text: string;
}

interface SoundEffect {
  id: string;
  time: number;
  timeStr: string;
  name: string;
  desc: string;
}

const DEFAULT_EFFECTS: SoundEffect[] = [
  { id: 'whoosh1', time: 6, timeStr: '0:06', name: 'Whoosh transição', desc: 'whoosh curto de corte para o Problema' },
  { id: 'whoosh2', time: 14, timeStr: '0:14', name: 'Painel abrindo', desc: 'whoosh + clique de carregamento do dashboard' },
  { id: 'ia_tap', time: 31, timeStr: '0:31', name: 'Notificação IA', desc: 'tap suave indicando recomendação da inteligência artificial' },
  { id: 'beep1', time: 43, timeStr: '0:43', name: 'Leitor Código 1', desc: 'bipe agudo clássico de scanner de código de barras' },
  { id: 'beep2', time: 47, timeStr: '0:47', name: 'Leitor Código 2', desc: 'bipe agudo clássico de scanner de código de barras' },
  { id: 'rating', time: 109, timeStr: '1:09', name: 'Avaliação Estrela', desc: 'cinco dings crescentes + som festivo de cupom ganho' },
  { id: 'whoosh_cta', time: 139, timeStr: '1:39', name: 'Whoosh de CTA', desc: 'swoosh de encerramento focado na chamada' },
];

export default function App() {
  // --- Chaves de API do próprio usuário (BYOK) ---
  // Guardadas só no navegador de quem está usando, nunca no servidor. Cada pessoa usa
  // a própria conta da Gemini/Azure/AIMLAPI — o consumo (e o custo) cai pra ela, não
  // pra quem distribui o app.
  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const stored = localStorage.getItem('narrador_api_keys');
      return stored ? JSON.parse(stored) : { gemini: '', azureKey: '', azureRegion: '', aimlapi: '' };
    } catch {
      return { gemini: '', azureKey: '', azureRegion: '', aimlapi: '' };
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [serverConfigured, setServerConfigured] = useState({ gemini: false, azure: false, aimlapi: false });

  useEffect(() => {
    localStorage.setItem('narrador_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    fetch('/api/config-status').then(r => r.json()).then(setServerConfigured).catch(() => {});
  }, []);

  // Monta os headers de autenticação BYOK pra mandar em toda chamada de TTS/música
  const authHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (apiKeys.gemini) h['X-Gemini-Key'] = apiKeys.gemini;
    if (apiKeys.azureKey) h['X-Azure-Key'] = apiKeys.azureKey;
    if (apiKeys.azureRegion) h['X-Azure-Region'] = apiKeys.azureRegion;
    if (apiKeys.aimlapi) h['X-Aimlapi-Key'] = apiKeys.aimlapi;
    return h;
  };

  const [scriptMd, setScriptMd] = useState(DEFAULT_SCRIPT_MD);
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [effects] = useState<SoundEffect[]>(DEFAULT_EFFECTS);
  
  // Player
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(108);

  // Refs de estado para evitar stale closures em callbacks assíncronos do AudioContext
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  // Mixer de Volumes
  const [voiceVolume, setVoiceVolume] = useState(85);
  const [musicVolume, setMusicVolume] = useState(40);
  const [musicGenre, setMusicGenre] = useState('corporate');

  // --- Música de fundo com IA de verdade (Stable Audio) ---
  // Complementa o sintetizador procedural: em vez de sempre criar o beat na hora,
  // dá pra gerar uma faixa real com IA a partir de uma descrição, uma vez, e usar
  // ela em loop como música de fundo.
  const [musicSource, setMusicSource] = useState<'synth' | 'ai'>('synth');
  const [aiMusicPrompt, setAiMusicPrompt] = useState('música corporativa animada, upbeat, synth pop, sem vocal, ótima para vídeo de marketing');
  const [aiMusicDuration, setAiMusicDuration] = useState(30);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [aiMusicError, setAiMusicError] = useState('');
  const aiMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const aiMusicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [aiMusicUrl, setAiMusicUrl] = useState<string | null>(null);

  const generateAiMusic = async () => {
    setIsGeneratingMusic(true);
    setAiMusicError('');
    try {
      const res = await fetch('/api/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ prompt: aiMusicPrompt, durationSec: aiMusicDuration }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errData.error || `Erro ${res.status}`);
      }
      const blob = await res.blob();
      if (aiMusicUrl) URL.revokeObjectURL(aiMusicUrl);
      const url = URL.createObjectURL(blob);
      setAiMusicUrl(url);
      setMusicSource('ai');
    } catch (err: any) {
      console.error('[Música IA] Erro:', err);
      setAiMusicError(err.message || 'Erro ao gerar música');
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  // Conecta/toca a música de IA (em loop) através do mesmo canal de mixagem da música
  const playAiMusicLoop = () => {
    if (!aiMusicUrl || !audioCtxRef.current || !musicGainNode.current) return;
    if (!aiMusicAudioRef.current) {
      const audio = new Audio();
      audio.loop = true;
      audio.crossOrigin = 'anonymous';
      aiMusicAudioRef.current = audio;
      const source = audioCtxRef.current.createMediaElementSource(audio);
      source.connect(musicGainNode.current);
      aiMusicSourceRef.current = source;
    }
    const audio = aiMusicAudioRef.current;
    if (audio.src !== aiMusicUrl) audio.src = aiMusicUrl;
    audio.currentTime = 0;
    audio.play().catch(err => console.warn('Erro ao tocar música IA:', err));
  };

  const stopAiMusicLoop = () => {
    aiMusicAudioRef.current?.pause();
  };
  const [sfxVolume, setSfxVolume] = useState(70);
  const [masterVolume, setMasterVolume] = useState(90);
  const [isMuted, setIsMuted] = useState(false);
  const [autoDucking, setAutoDucking] = useState(true);
  
  const musicGenreRef = useRef('corporate');
  useEffect(() => {
    musicGenreRef.current = musicGenre;
  }, [musicGenre]);
  
  // Locução (SpeechSynthesis)
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceRate, setVoiceRate] = useState(1.10);
  const [voicePitch, setVoicePitch] = useState(1.0);
  const [autoTimeFit, setAutoTimeFit] = useState(true);
  const [shortPauseDuration, setShortPauseDuration] = useState(250);
  const [longPauseDuration, setLongPauseDuration] = useState(600);
  
  // Locução Premium Gemini TTS
  const [geminiVoice, setGeminiVoice] = useState('Zephyr');
  const [geminiEmotion, setGeminiEmotion] = useState('Profissional');

  // Provedor de voz: Gemini (pago, com estilo/emoção) ou Azure (grátis, 500k
  // caracteres/mês, controle de ritmo exato). Não incluímos a voz nativa do navegador
  // aqui — ela fala direto pro alto-falante do sistema, sem gerar um arquivo de áudio
  // capturável, então não entra no mesmo cano de mixagem/gravação que os outros dois.
  const [voiceProvider, setVoiceProvider] = useState<'gemini' | 'azure'>('gemini');
  const [azureVoice, setAzureVoice] = useState('Francisca');
  const AZURE_VOICE_OPTIONS = ['Francisca', 'Antonio', 'Brenda', 'Donato', 'Elza', 'Humberto', 'Manuela', 'Valerio'];
  
  // Estado de Gravação do Mix
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordedBlobs, setRecordedBlobs] = useState<Blob[]>([]);
  
  // VU meters virtuais
  const [voiceVU, setVoiceVU] = useState(0);
  const [musicVU, setMusicVU] = useState(0);
  const [sfxVU, setSfxVU] = useState(0);
  const [masterVU, setMasterVU] = useState(0);

  // Audio Graph Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  // Gain Nodes
  const voiceGainNode = useRef<GainNode | null>(null);
  const musicGainNode = useRef<GainNode | null>(null);
  const sfxGainNode = useRef<GainNode | null>(null);
  const masterGainNode = useRef<GainNode | null>(null);
  
  // Analysers
  const voiceAnalyser = useRef<AnalyserNode | null>(null);
  const musicAnalyser = useRef<AnalyserNode | null>(null);
  const sfxAnalyser = useRef<AnalyserNode | null>(null);
  const masterAnalyser = useRef<AnalyserNode | null>(null);

  // Timers & Sequencers
  const playTimerRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const lastSecTriggeredRef = useRef<number>(-1);
  const synthIntervalRef = useRef<number | null>(null);
  const musicStepIndex = useRef<number>(0);
  const isMusicPlaying = useRef<boolean>(false);
  
  // Fila de Locução
  const speakingBlockIdRef = useRef<string | null>(null);
  const blockQueueRef = useRef<string[]>([]);
  const spokenBlocksRef = useRef<Set<string>>(new Set());
  const isCurrentlySpeakingRef = useRef<boolean>(false);

  // Parse do Markdown inicial
  useEffect(() => {
    parseMarkdown(scriptMd);
  }, [scriptMd]);

  // Carregar vozes do navegador
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      const ptVoices = voices.filter(v => v.lang.startsWith('pt'));
      setAvailableVoices(ptVoices);
      
      const defaultBr = ptVoices.find(v => v.lang === 'pt-BR' && v.name.includes('Google')) ||
                        ptVoices.find(v => v.lang === 'pt-BR') ||
                        ptVoices[0] || null;
      setSelectedVoice(defaultBr);
    };
    
    loadVoices();
    if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      stopPlayback();
    };
  }, []);

  // Sincronizar volumes do mixer com o grafo de áudio
  useEffect(() => {
    const calcVol = (v: number) => isMuted ? 0 : (v / 100);
    if (voiceGainNode.current) voiceGainNode.current.gain.value = calcVol(voiceVolume);
  }, [voiceVolume, isMuted]);

  useEffect(() => {
    const calcVol = (v: number) => isMuted ? 0 : (v / 100);
    if (musicGainNode.current) musicGainNode.current.gain.value = calcVol(musicVolume);
  }, [musicVolume, isMuted]);

  useEffect(() => {
    const calcVol = (v: number) => isMuted ? 0 : (v / 100);
    if (sfxGainNode.current) sfxGainNode.current.gain.value = calcVol(sfxVolume);
  }, [sfxVolume, isMuted]);

  useEffect(() => {
    const calcVol = (v: number) => isMuted ? 0 : (v / 100);
    if (masterGainNode.current) masterGainNode.current.gain.value = calcVol(masterVolume);
  }, [masterVolume, isMuted]);

  // Conversão de MD para blocos estruturados de tempo
  const parseMarkdown = (md: string) => {
    const lines = md.split('\n');
    const parsed: ScriptBlock[] = [];
    let current: Partial<ScriptBlock> = {};
    const regex = /\*\*\[(\d+):(\d+)[–-–](\d+):(\d+)\]\s*(.*?)\*\*/;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const match = trimmed.match(regex);
      if (match) {
        if (current.id) {
          parsed.push(current as ScriptBlock);
        }
        const sMin = parseInt(match[1]);
        const sSec = parseInt(match[2]);
        const eMin = parseInt(match[3]);
        const eSec = parseInt(match[4]);
        const startSec = sMin * 60 + sSec;
        const endSec = eMin * 60 + eSec;

        current = {
          id: `b_${startSec}_${endSec}`,
          timeRange: `${match[1]}:${match[2].padStart(2, '0')}–${match[3]}:${match[4].padStart(2, '0')}`,
          startSec,
          endSec,
          title: match[5],
          text: ''
        };
      } else if (current.id) {
        if (!trimmed.startsWith('#') && !trimmed.startsWith('Legenda:') && !trimmed.startsWith('|')) {
          current.text = (current.text ? current.text + '\n' : '') + trimmed;
        }
      }
    });

    if (current.id) {
      parsed.push(current as ScriptBlock);
    }

    if (parsed.length > 0) {
      setBlocks(parsed);
      setTotalDuration(parsed[parsed.length - 1].endSec);
    }
  };

  // Inicializar grafo de áudio com Web Audio API
  const initAudioEngine = () => {
    if (audioCtxRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    voiceGainNode.current = ctx.createGain();
    musicGainNode.current = ctx.createGain();
    sfxGainNode.current = ctx.createGain();
    masterGainNode.current = ctx.createGain();

    const calcVol = (v: number) => isMuted ? 0 : (v / 100);
    voiceGainNode.current.gain.value = calcVol(voiceVolume);
    musicGainNode.current.gain.value = calcVol(musicVolume);
    sfxGainNode.current.gain.value = calcVol(sfxVolume);
    masterGainNode.current.gain.value = calcVol(masterVolume);

    voiceAnalyser.current = ctx.createAnalyser();
    musicAnalyser.current = ctx.createAnalyser();
    sfxAnalyser.current = ctx.createAnalyser();
    masterAnalyser.current = ctx.createAnalyser();

    voiceAnalyser.current.fftSize = 32;
    musicAnalyser.current.fftSize = 32;
    sfxAnalyser.current.fftSize = 32;
    masterAnalyser.current.fftSize = 32;

    voiceGainNode.current.connect(voiceAnalyser.current);
    voiceAnalyser.current.connect(masterGainNode.current);

    musicGainNode.current.connect(musicAnalyser.current);
    musicAnalyser.current.connect(masterGainNode.current);

    sfxGainNode.current.connect(sfxAnalyser.current);
    sfxAnalyser.current.connect(masterGainNode.current);

    masterGainNode.current.connect(masterAnalyser.current);
    masterAnalyser.current.connect(ctx.destination);

    // Canal dedicado para capturar gravação
    mediaDestRef.current = ctx.createMediaStreamDestination();
    masterGainNode.current.connect(mediaDestRef.current);

    // Iniciar animação dos VU meters
    startVUMeterLoop();
  };

  const startVUMeterLoop = () => {
    const updateVUs = () => {
      if (!audioCtxRef.current) return;
      const getAverage = (analyser: AnalyserNode | null) => {
        if (!analyser) return 0;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const sum = data.reduce((a, b) => a + b, 0);
        return Math.min(100, Math.round((sum / data.length / 255) * 100 * 1.5));
      };

      setVoiceVU(getAverage(voiceAnalyser.current));
      setMusicVU(getAverage(musicAnalyser.current));
      setSfxVU(getAverage(sfxAnalyser.current));
      setMasterVU(getAverage(masterAnalyser.current));
      
      requestAnimationFrame(updateVUs);
    };
    requestAnimationFrame(updateVUs);
  };

  // --- SÍNTESE EM TEMPO REAL DE MÚSICA INTELIGENTE DIVERSIFICADA ---
  const getBpmForGenre = (genre: string) => {
    switch (genre) {
      case 'retail': return 124;
      case 'institutional': return 80;
      case 'epic': return 132;
      default: return 110; // corporate
    }
  };

  const synthMusicStep = (time: number, step: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isMusicPlaying.current) return;

    const genre = musicGenreRef.current;
    const bpm = getBpmForGenre(genre);
    const stepDur = 60 / bpm / 4;
    const bar = Math.floor(step / 16) % 8;
    const innerStep = step % 16;

    let freqs: number[] = [];

    if (genre === 'retail') {
      // Varejo / Electro Upbeat (Am -> F -> C -> G)
      if (bar === 0 || bar === 1) freqs = [110.00, 130.81, 164.81, 220.00]; // Am
      else if (bar === 2 || bar === 3) freqs = [87.31, 130.81, 174.61, 261.63]; // F
      else if (bar === 4 || bar === 5) freqs = [130.81, 164.81, 196.00, 261.63]; // C
      else freqs = [98.00, 146.83, 196.00, 293.66]; // G

      // 1. Heavy House Kick (tempos 1, 2, 3, 4)
      if (innerStep % 4 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(musicGainNode.current!);
        osc.frequency.setValueAtTime(120, time);
        osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);
        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
        osc.start(time);
        osc.stop(time + 0.15);
      }

      // 2. Open Hi-Hat (contra-tempo aberto)
      if (innerStep % 4 === 2) {
        const bufSize = ctx.sampleRate * 0.08;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const source = ctx.createBufferSource();
        source.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000, time);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.07, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(musicGainNode.current!);
        source.start(time);
        source.stop(time + 0.08);
      }

      // 3. Synth Bassline agressivo
      if (innerStep % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freqs[0] * 0.5, time); // Sub oitava

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, time);
        filter.frequency.exponentialRampToValueAtTime(150, time + 0.15);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(musicGainNode.current!);

        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

        osc.start(time);
        osc.stop(time + 0.18);
      }

      // 4. Square Wave Plucks alegres (Arpejo rápido)
      if (innerStep % 2 === 1 && Math.random() > 0.3) {
        const freq = freqs[innerStep % freqs.length] * 2.0;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lp = ctx.createBiquadFilter();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1200, time);

        osc.connect(gain);
        gain.connect(lp);
        lp.connect(musicGainNode.current!);

        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.12);
      }

    } else if (genre === 'institutional') {
      // Institucional / Elegante (Dmaj7 -> Bm7 -> Gmaj7 -> A6)
      if (bar === 0 || bar === 1) freqs = [146.83, 185.00, 220.00, 277.18]; // Dmaj7
      else if (bar === 2 || bar === 3) freqs = [123.47, 146.83, 185.00, 220.00]; // Bm7
      else if (bar === 4 || bar === 5) freqs = [98.00, 116.54, 146.83, 196.00]; // Gmaj7
      else freqs = [110.00, 138.59, 164.81, 220.00]; // A6

      // 1. Pulso de bumbo super suave (apenas tempo 1)
      if (innerStep === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(musicGainNode.current!);
        osc.frequency.setValueAtTime(90, time);
        osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
        osc.start(time);
        osc.stop(time + 0.15);
      }

      // 2. Slow Sine wave arpeggio (Melodia de piano suave)
      if (innerStep % 4 === 0) {
        const freq = freqs[Math.floor(innerStep / 4) % freqs.length] * 2.0;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        osc.connect(gain);
        gain.connect(musicGainNode.current!);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.12, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);

        osc.start(time);
        osc.stop(time + 0.9);
      }

      // 3. Lush triangle background pad (Longas notas estendidas)
      if (innerStep === 0) {
        freqs.slice(0, 3).forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const lp = ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, time);

          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(220, time);

          osc.connect(lp);
          lp.connect(gain);
          gain.connect(musicGainNode.current!);

          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.07, time + 0.6);
          gain.gain.setValueAtTime(0.07, time + stepDur * 12);
          gain.gain.linearRampToValueAtTime(0, time + stepDur * 16);

          osc.start(time);
          osc.stop(time + stepDur * 16 + 0.1);
        });
      }

    } else if (genre === 'epic') {
      // Urgência Cinematográfica / Black Friday (Dm -> Bb -> Gm -> A)
      if (bar === 0 || bar === 1) freqs = [146.83, 174.61, 220.00, 293.66]; // Dm
      else if (bar === 2 || bar === 3) freqs = [116.54, 146.83, 174.61, 233.08]; // Bb
      else if (bar === 4 || bar === 5) freqs = [98.00, 116.54, 146.83, 196.00]; // Gm
      else freqs = [110.00, 138.59, 164.81, 220.00]; // A

      // 1. Heavy Orchestral Tom Hit (Impacto épico)
      if (innerStep === 0 || innerStep === 8) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(musicGainNode.current!);
        osc.frequency.setValueAtTime(140, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
        gain.gain.setValueAtTime(0.85, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
        osc.start(time);
        osc.stop(time + 0.2);

        // Adiciona um pouco de ruído para simular o baque
        const bufSize = ctx.sampleRate * 0.05;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(300, time);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(musicGainNode.current!);
        noise.start(time);
        noise.stop(time + 0.05);
      }

      // 2. Fast Tension Plucks (16th notes - Sawtooth com decay curto)
      if (innerStep % 2 === 0) {
        const pIdx = [0, 2, 1, 3][(innerStep / 2) % 4];
        const freq = freqs[pIdx] * 2.0;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, time);
        filter.frequency.exponentialRampToValueAtTime(200, time + 0.08);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(musicGainNode.current!);

        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.12);
      }

      // 3. Swelling tension pad
      if (innerStep === 0) {
        freqs.slice(0, 3).forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, time);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(300, time);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(musicGainNode.current!);

          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.05, time + stepDur * 8);
          gain.gain.linearRampToValueAtTime(0, time + stepDur * 16);

          osc.start(time);
          osc.stop(time + stepDur * 16 + 0.1);
        });
      }

    } else {
      // CORPORATE TECH (Padrão 110 BPM)
      if (bar === 0 || bar === 1) freqs = [130.81, 164.81, 196.00, 246.94]; // Cmaj7
      else if (bar === 2 || bar === 3) freqs = [110.00, 130.81, 164.81, 196.00]; // Am7
      else if (bar === 4 || bar === 5) freqs = [87.31, 130.81, 174.61, 220.00]; // Fmaj7
      else freqs = [98.00, 146.83, 196.00, 246.94]; // G6

      // 1. Bumbo Suave
      if (innerStep === 0 || innerStep === 8) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(musicGainNode.current!);
        osc.frequency.setValueAtTime(110, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);
        gain.gain.setValueAtTime(0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        osc.start(time);
        osc.stop(time + 0.13);
      }

      // 2. Shaker / Chimbal (contra-tempos)
      if (innerStep % 4 === 2) {
        const bufSize = ctx.sampleRate * 0.04;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const source = ctx.createBufferSource();
        source.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(8000, time);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(musicGainNode.current!);
        source.start(time);
        source.stop(time + 0.04);
      }

      // 3. Arpejo de Piano Digital Senoidal
      const pattern = [0, 2, 1, 3, 2, 0, 3, 1];
      if (innerStep % 2 === 0 && Math.random() > 0.2) {
        const idx = pattern[(innerStep / 2) % pattern.length] % freqs.length;
        const freq = freqs[idx] * 2.0;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1500, time);

        osc.connect(gain);
        gain.connect(lp);
        lp.connect(musicGainNode.current!);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

        osc.start(time);
        osc.stop(time + 0.4);
      }

      // 4. Pad harmônico de fundo
      if (innerStep === 0) {
        freqs.slice(0, 3).forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, time);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(280, time);

          osc.connect(gain);
          gain.connect(filter);
          filter.connect(musicGainNode.current!);

          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.05, time + 0.5);
          gain.gain.setValueAtTime(0.05, time + stepDur * 12);
          gain.gain.linearRampToValueAtTime(0, time + stepDur * 16);

          osc.start(time);
          osc.stop(time + stepDur * 16 + 0.1);
        });
      }
    }
  };

  const startMusicSynth = () => {
    if (!audioCtxRef.current || isMusicPlaying.current) return;
    isMusicPlaying.current = true;
    musicStepIndex.current = 0;

    const initialBpm = getBpmForGenre(musicGenreRef.current);
    const stepDur = 60 / initialBpm / 4;
    let nextStepTime = audioCtxRef.current.currentTime;

    const schedule = () => {
      const ctx = audioCtxRef.current;
      if (!ctx || !isMusicPlaying.current) return;

      const currentBpm = getBpmForGenre(musicGenreRef.current);
      const currentStepDur = 60 / currentBpm / 4;

      while (nextStepTime < ctx.currentTime + 0.1) {
        synthMusicStep(nextStepTime, musicStepIndex.current);
        nextStepTime += currentStepDur;
        musicStepIndex.current++;
      }
      synthIntervalRef.current = window.setTimeout(schedule, 25);
    };
    schedule();
  };

  const stopMusicSynth = () => {
    isMusicPlaying.current = false;
    if (synthIntervalRef.current) {
      clearTimeout(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
  };

  // --- CONTROLE DE DUCKING AUTOMÁTICO ---
  const applyDucking = (duck: boolean) => {
    if (!autoDucking || !musicGainNode.current || !audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    const target = duck ? (musicVolume / 100) * 0.18 : (musicVolume / 100);

    musicGainNode.current.gain.cancelScheduledValues(now);
    musicGainNode.current.gain.linearRampToValueAtTime(target, now + (duck ? 0.2 : 0.6));
  };

  // --- DISPARO DE EFEITOS SONOROS (SFX) ---
  const playSFX = (id: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    setSfxVU(75);
    setTimeout(() => setSfxVU(0), 150);

    switch (id) {
      case 'whoosh1':
      case 'whoosh2':
      case 'whoosh_cta': {
        const dur = id === 'whoosh_cta' ? 0.9 : 0.5;
        const bufSize = ctx.sampleRate * dur;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        const gain = ctx.createGain();

        src.connect(lp);
        lp.connect(gain);
        gain.connect(sfxGainNode.current!);

        lp.frequency.setValueAtTime(100, now);
        lp.frequency.exponentialRampToValueAtTime(id === 'whoosh_cta' ? 2600 : 1800, now + dur * 0.4);
        lp.frequency.exponentialRampToValueAtTime(80, now + dur);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + dur * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        src.start(now);
        src.stop(now + dur + 0.1);
        break;
      }
      case 'ia_tap': {
        [440, 554, 659].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const st = now + idx * 0.05;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0, st);
          gain.gain.linearRampToValueAtTime(0.2, st + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.4);

          osc.connect(gain);
          gain.connect(sfxGainNode.current!);
          osc.start(st);
          osc.stop(st + 0.5);
        });
        break;
      }
      case 'beep1':
      case 'beep2': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2850, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(sfxGainNode.current!);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }
      case 'rating': {
        for (let i = 0; i < 5; i++) {
          const ct = now + i * 0.12;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523 + i * 130, ct);
          gain.gain.setValueAtTime(0.12, ct);
          gain.gain.exponentialRampToValueAtTime(0.001, ct + 0.04);

          osc.connect(gain);
          gain.connect(sfxGainNode.current!);
          osc.start(ct);
          osc.stop(ct + 0.05);
        }
        
        // Sino final de cupom
        const bt = now + 5 * 0.12;
        [1500, 2000].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, bt);
          gain.gain.setValueAtTime(idx === 0 ? 0.3 : 0.15, bt);
          gain.gain.exponentialRampToValueAtTime(0.001, bt + 0.8);

          osc.connect(gain);
          gain.connect(sfxGainNode.current!);
          osc.start(bt);
          osc.stop(bt + 0.9);
        });
        break;
      }
    }
  };

  // --- LOCUÇÃO DO BLOCO DE TEXTO VIA API REAL (COMPATÍVEL COM GRAVAÇÃO) ---
  const speakBlock = async (block: ScriptBlock) => {
    if (!audioCtxRef.current) return;

    speakingBlockIdRef.current = block.id;
    isCurrentlySpeakingRef.current = true;
    applyDucking(true);

    // Limpar negritos para falar de forma limpa, mantendo '//' e '///' para a inteligência de pausas
    const textToSpeak = block.text
      .replace(/‹lento›/g, '')
      .replace(/‹\/lento›/g, '')
      .replace(/\*\*/g, '');

    const blockDuration = block.endSec - block.startSec;

    // Inicializar áudio se não existir
    if (!activeAudioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      activeAudioRef.current = audio;
      
      if (audioCtxRef.current && voiceGainNode.current) {
        const source = audioCtxRef.current.createMediaElementSource(audio);
        source.connect(voiceGainNode.current);
        activeAudioSourceRef.current = source;
      }
    }

    const audio = activeAudioRef.current;

    // BUG CORRIGIDO: audio.src = url faz uma requisição simples, sem conseguir levar
    // cabeçalhos (a chave de API do usuário). Agora buscamos com fetch() + headers,
    // e transformamos a resposta num blob local pro <audio> tocar.
    const endpoint = voiceProvider === 'azure'
      ? `/api/tts-azure?text=${encodeURIComponent(textToSpeak)}&voice=${azureVoice}&targetDuration=${blockDuration}`
      : `/api/tts?text=${encodeURIComponent(textToSpeak)}&voice=${geminiVoice}&emotion=${encodeURIComponent(geminiEmotion)}&targetDuration=${blockDuration}`;

    const finishAndAdvance = () => {
      setVoiceVU(0);
      spokenBlocksRef.current.add(block.id);
      applyDucking(false);
      isCurrentlySpeakingRef.current = false;
      blockQueueRef.current = blockQueueRef.current.filter(id => id !== block.id);
      if (blockQueueRef.current.length > 0) {
        const nextBlock = blocks.find(b => b.id === blockQueueRef.current[0]);
        if (nextBlock) speakBlock(nextBlock);
      }
    };

    let ttsResponse: Response;
    try {
      ttsResponse = await fetch(endpoint, { headers: authHeaders() });
    } catch (err) {
      console.error("Erro de rede ao buscar TTS:", err);
      finishAndAdvance();
      return;
    }

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text().catch(() => 'Erro desconhecido');
      console.error(`Erro no TTS (${ttsResponse.status}):`, errText);
      finishAndAdvance();
      return;
    }

    const blob = await ttsResponse.blob();
    const objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;

    // Quando o áudio carregar, ajustamos a velocidade em tempo real para caber no tempo do bloco
    audio.onloadedmetadata = () => {
      if (autoTimeFit) {
        const idealRealRate = audio.duration / Math.max(1, blockDuration);
        // Limitamos entre 0.9x e 2.5x para garantir que fique compreensível e natural
        const finalRate = Math.max(0.9, Math.min(2.5, idealRealRate));
        audio.playbackRate = finalRate;
        console.log(`[TTS Auto-Fit] Bloco="${block.title}": Áudio real de ${audio.duration.toFixed(2)}s ajustado para ${finalRate.toFixed(2)}x para caber em ${blockDuration}s`);
      } else {
        audio.playbackRate = voiceRate;
      }
    };

    // VU Meter visual durante a reprodução
    const interval = setInterval(() => {
      if (!audio.paused && isPlayingRef.current && !isPausedRef.current) {
        setVoiceVU(Math.floor(Math.random() * 50) + 45);
      } else {
        setVoiceVU(0);
        clearInterval(interval);
      }
    }, 100);

    audio.onended = () => {
      clearInterval(interval);
      URL.revokeObjectURL(objectUrl);
      finishAndAdvance();
    };

    audio.onerror = (e) => {
      console.error("Erro no TTS audio element:", e);
      clearInterval(interval);
      URL.revokeObjectURL(objectUrl);
      finishAndAdvance();
    };

    audio.play().catch(err => {
      console.warn("Erro ao dar play no áudio:", err);
      finishAndAdvance();
    });
  };

  // --- CONTROLES GERAIS DO PLAYER ---
  const startPlayback = () => {
    if (isPlayingRef.current && !isPausedRef.current) return;

    initAudioEngine();
    
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    isPlayingRef.current = true;
    isPausedRef.current = false;
    setIsPlaying(true);
    setIsPaused(false);
    if (musicSource === 'ai') playAiMusicLoop(); else startMusicSynth();

    playStartTimeRef.current = Date.now() - accumulatedTimeRef.current * 1000;

    if (isRecording) {
      startRecording();
    }

    const tick = () => {
      const elapsed = (Date.now() - playStartTimeRef.current) / 1000;
      if (elapsed >= totalDuration) {
        setCurrentTime(totalDuration);
        stopPlayback();
        return;
      }

      setCurrentTime(elapsed);
      const currentSec = Math.floor(elapsed);

      if (currentSec !== lastSecTriggeredRef.current) {
        lastSecTriggeredRef.current = currentSec;

        // Efeitos sonoros automáticos
        const activeSfxs = effects.filter(e => e.time === currentSec);
        activeSfxs.forEach(e => playSFX(e.id));

        // Blocos de narração automáticos
        const targetBlock = blocks.find(b => currentSec >= b.startSec && currentSec < b.endSec);
        if (targetBlock && !spokenBlocksRef.current.has(targetBlock.id)) {
          if (speakingBlockIdRef.current !== targetBlock.id && !blockQueueRef.current.includes(targetBlock.id)) {
            blockQueueRef.current.push(targetBlock.id);
            if (!isCurrentlySpeakingRef.current) {
              speakBlock(targetBlock);
            }
          }
        }
      }

      playTimerRef.current = requestAnimationFrame(tick);
    };

    playTimerRef.current = requestAnimationFrame(tick);
  };

  const pausePlayback = () => {
    if (!isPlayingRef.current) return;
    isPlayingRef.current = false;
    isPausedRef.current = true;
    setIsPaused(true);
    accumulatedTimeRef.current = currentTime;

    if (playTimerRef.current) {
      cancelAnimationFrame(playTimerRef.current);
      playTimerRef.current = null;
    }

    if (musicSource === 'ai') stopAiMusicLoop(); else stopMusicSynth();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
    }
    applyDucking(false);
    setIsPlaying(false);
  };

  const stopPlayback = () => {
    isPlayingRef.current = false;
    isPausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
    accumulatedTimeRef.current = 0;
    lastSecTriggeredRef.current = -1;

    if (playTimerRef.current) {
      cancelAnimationFrame(playTimerRef.current);
      playTimerRef.current = null;
    }

    if (musicSource === 'ai') stopAiMusicLoop(); else stopMusicSynth();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
    }
    applyDucking(false);

    speakingBlockIdRef.current = null;
    isCurrentlySpeakingRef.current = false;
    blockQueueRef.current = [];
    spokenBlocksRef.current.clear();

    if (isRecording) {
      stopRecording();
    }
  };

  // --- GRAVAÇÃO MASTER DE AUDIO (Web Audio Stream) ---
  const startRecording = () => {
    if (!mediaDestRef.current) return;
    const chunks: Blob[] = [];
    setRecordedBlobs([]);
    setAudioUrl(null);

    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      mimeType = 'audio/ogg';
    }

    try {
      const rec = new MediaRecorder(mediaDestRef.current.stream, { mimeType });
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = () => {
        const finalBlob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(finalBlob);
        setAudioUrl(url);
        setIsRecording(false);
      };

      rec.start();
    } catch (err) {
      console.error("Falha ao gravar áudio:", err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleRecordingOption = () => {
    if (isPlayingRef.current) {
      stopPlayback();
    }
    const nextRec = !isRecording;
    setIsRecording(nextRec);
    if (nextRec) {
      setTimeout(() => {
        startPlayback();
      }, 150);
    }
  };

  const formatSecs = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentBlock = blocks.find(b => currentTime >= b.startSec && currentTime < b.endSec);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-orange-500 selection:text-white pb-16">
      
      {/* HEADER */}
      <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-md">
              <Radio className="h-5 w-5 text-neutral-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-wider text-orange-500 uppercase">Estúdio de Áudio</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                Narrador de Roteiro MD <span className="text-neutral-500 text-sm font-normal">/ Controle Delivery 360</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">Voz pt-BR:</span>
              <select
                value={selectedVoice?.name || ''}
                onChange={(e) => {
                  const voice = availableVoices.find(v => v.name === e.target.value);
                  if (voice) setSelectedVoice(voice);
                }}
                className="bg-neutral-950 text-neutral-200 text-xs py-0.5 px-2 border border-neutral-800 rounded outline-none focus:border-orange-500 cursor-pointer max-w-[180px]"
              >
                {availableVoices.length > 0 ? (
                  availableVoices.map(v => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))
                ) : (
                  <option value="">Voz padrão brasileira</option>
                )}
              </select>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded-xl border border-neutral-800 text-xs text-neutral-300 font-semibold transition-colors"
            >
              ⚙️ Configurações
            </button>
          </div>
        </div>
      </header>

      {/* MODAL DE CONFIGURAÇÕES — chaves de API do próprio usuário (BYOK) */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">⚙️ Configurações</h2>
            <p className="text-xs text-neutral-500 mb-4">
              Suas chaves ficam salvas só neste navegador — nunca são enviadas pra nenhum outro lugar além da própria API do provedor. O consumo (e o custo) é sempre da sua conta.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                  Gemini API Key
                  {serverConfigured.gemini && <span className="text-[9px] bg-emerald-900 text-emerald-400 px-1.5 py-0.5 rounded">já configurada no servidor</span>}
                </label>
                <input
                  type="password"
                  value={apiKeys.gemini}
                  onChange={e => setApiKeys((prev: any) => ({ ...prev, gemini: e.target.value }))}
                  placeholder={serverConfigured.gemini ? '(opcional — usa a do servidor se vazio)' : 'Cole sua chave da Gemini'}
                  className="mt-1 w-full bg-neutral-950 text-xs text-neutral-200 p-2.5 rounded-lg border border-neutral-800 focus:outline-none focus:border-orange-500"
                />
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-orange-400 hover:underline">Pegar chave grátis →</a>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                  Azure Speech Key
                  {serverConfigured.azure && <span className="text-[9px] bg-emerald-900 text-emerald-400 px-1.5 py-0.5 rounded">já configurada no servidor</span>}
                </label>
                <input
                  type="password"
                  value={apiKeys.azureKey}
                  onChange={e => setApiKeys((prev: any) => ({ ...prev, azureKey: e.target.value }))}
                  placeholder={serverConfigured.azure ? '(opcional — usa a do servidor se vazio)' : 'Cole sua chave da Azure'}
                  className="mt-1 w-full bg-neutral-950 text-xs text-neutral-200 p-2.5 rounded-lg border border-neutral-800 focus:outline-none focus:border-orange-500"
                />
                <input
                  type="text"
                  value={apiKeys.azureRegion}
                  onChange={e => setApiKeys((prev: any) => ({ ...prev, azureRegion: e.target.value }))}
                  placeholder="Região (ex: brazilsouth)"
                  className="mt-1.5 w-full bg-neutral-950 text-xs text-neutral-200 p-2.5 rounded-lg border border-neutral-800 focus:outline-none focus:border-orange-500"
                />
                <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="text-[10px] text-orange-400 hover:underline">500 mil caracteres grátis/mês →</a>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                  AIMLAPI Key (música com IA)
                  {serverConfigured.aimlapi && <span className="text-[9px] bg-emerald-900 text-emerald-400 px-1.5 py-0.5 rounded">já configurada no servidor</span>}
                </label>
                <input
                  type="password"
                  value={apiKeys.aimlapi}
                  onChange={e => setApiKeys((prev: any) => ({ ...prev, aimlapi: e.target.value }))}
                  placeholder={serverConfigured.aimlapi ? '(opcional — usa a do servidor se vazio)' : 'Cole sua chave da AIMLAPI'}
                  className="mt-1 w-full bg-neutral-950 text-xs text-neutral-200 p-2.5 rounded-lg border border-neutral-800 focus:outline-none focus:border-orange-500"
                />
                <a href="https://aimlapi.com" target="_blank" rel="noreferrer" className="text-[10px] text-orange-400 hover:underline">30 créditos grátis pra testar →</a>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="mt-5 w-full bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold text-sm py-2.5 rounded-lg"
            >
              Salvar e Fechar
            </button>
          </div>
        </div>
      )}

      {/* PAINEL PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLUNA ESQUERDA: Teleprompter & MD */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* TELEPROMPTER */}
          <div className="bg-neutral-900 border border-neutral-800/80 rounded-2xl flex flex-col overflow-hidden shadow-lg">
            <div className="px-5 py-4 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-white">Teleprompter Inteligente</h2>
              </div>
              <span className="text-xs text-neutral-400 bg-neutral-950 px-2.5 py-1 rounded-md border border-neutral-800 font-mono">
                Cenas: {blocks.length}
              </span>
            </div>

            <div className="p-6 overflow-y-auto max-h-[550px] space-y-6 scrollbar-thin scrollbar-thumb-neutral-800">
              {blocks.map((block) => {
                const isActive = currentBlock?.id === block.id;
                const isSpoken = spokenBlocksRef.current.has(block.id);

                return (
                  <div
                    key={block.id}
                    className={`transition-all duration-300 p-4 rounded-xl border ${
                      isActive 
                        ? 'bg-neutral-800/40 border-orange-500 shadow-md ring-1 ring-orange-500/20' 
                        : isSpoken 
                        ? 'bg-neutral-900/40 border-neutral-800/60 opacity-60' 
                        : 'bg-neutral-950/20 border-neutral-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                          isActive ? 'bg-orange-500 text-neutral-950 font-bold' : 'bg-neutral-800 text-neutral-400'
                        }`}>
                          {block.timeRange}
                        </span>
                        <h3 className={`text-xs font-bold ${isActive ? 'text-orange-400' : 'text-neutral-300'}`}>
                          {block.title}
                        </h3>
                      </div>
                      
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded-full border border-orange-900/60 animate-pulse">
                          <Activity className="h-2.5 w-2.5" /> NO AR
                        </span>
                      )}
                      {isSpoken && !isActive && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-950/20 px-2 py-0.5 rounded-full border border-emerald-900/40">
                          <CheckCircle className="h-2.5 w-2.5" /> Concluído
                        </span>
                      )}
                    </div>

                    <p className={`text-sm leading-relaxed whitespace-pre-line ${isActive ? 'text-white font-medium text-base' : 'text-neutral-400'}`}>
                      {block.text.split('//').map((part, pIdx, arr) => {
                        const isLast = pIdx === arr.length - 1;
                        return (
                          <span key={pIdx}>
                            {part.split(' ').map((word, wIdx) => {
                              if (word.startsWith('**') && word.endsWith('**')) {
                                return <strong key={wIdx} className="text-orange-400">{word.replace(/\*\*/g, '')} </strong>;
                              }
                              return word + ' ';
                            })}
                            {!isLast && (
                              <span className="inline-block text-orange-500/60 font-mono text-xs mx-1 bg-orange-950/10 px-1 rounded border border-orange-900/20 font-bold" title="Pausa Curta (0.5s)">
                                //
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EDITOR DE TEXTO ROTEIRO MD */}
          <div className="bg-neutral-900 border border-neutral-800/80 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Editor de Roteiro MD</h3>
              <button
                onClick={() => setScriptMd(DEFAULT_SCRIPT_MD)}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Restaurar Padrão
              </button>
            </div>
            <textarea
              value={scriptMd}
              onChange={(e) => setScriptMd(e.target.value)}
              placeholder="Cole seu roteiro Markdown com tempos aqui..."
              rows={8}
              className="bg-neutral-950 text-xs font-mono text-neutral-300 p-3 rounded-xl border border-neutral-800 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-y"
            />
          </div>
        </section>

        {/* COLUNA DIREITA: Mesa de som & Download */}
        <section className="lg:col-span-5 flex flex-col gap-6">

          {/* PLAYER CONTROL */}
          <div className="bg-neutral-900 border border-neutral-800/80 rounded-2xl p-6 shadow-lg flex flex-col gap-5">
            <div className="bg-neutral-950 rounded-xl p-5 border border-neutral-800/60 flex flex-col gap-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-medium tracking-wider flex items-center gap-1.5 uppercase">
                  <Clock className="h-3.5 w-3.5 text-orange-500" /> Progresso da Gravação
                </span>
                {isRecording && (
                  <span className="flex items-center gap-1 bg-red-950/40 text-red-400 border border-red-900/60 px-2 py-0.5 rounded text-[9px] font-bold animate-pulse">
                    GRAVANDO MIX
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-4xl font-mono font-bold text-white">
                  {formatSecs(currentTime)}
                </span>
                <span className="text-xs text-neutral-500 font-mono">
                  Total: {formatSecs(totalDuration)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-neutral-900 h-2 rounded-full relative overflow-hidden border border-neutral-800/60">
                {effects.map((e) => {
                  const pct = (e.time / totalDuration) * 100;
                  return (
                    <div 
                      key={e.id}
                      className="absolute h-full w-0.5 bg-amber-500/50 z-10"
                      style={{ left: `${pct}%` }}
                      title={`Efeito: ${e.name}`}
                    />
                  );
                })}
                <div 
                  className="bg-gradient-to-r from-orange-500 to-amber-500 h-full rounded-full transition-all duration-100 ease-linear"
                  style={{ width: `${(currentTime / totalDuration) * 100}%` }}
                />
              </div>
            </div>

            {/* NOVO: EXPLICATIVO E BOTÃO DE GERAÇÃO AUTOMÁTICA EM 1 CLIQUE */}
            <div className="bg-gradient-to-br from-neutral-950 to-neutral-900 p-4 rounded-xl border border-orange-500/30 flex flex-col gap-3">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-orange-400 animate-pulse" />
                  Geração de Áudio 100% Automática
                </h4>
                <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                  Como a voz e a música são geradas em tempo real pelo seu navegador, o aplicativo precisa tocar e gravar essa mixagem do início ao fim para transformá-la em um arquivo pronto.
                </p>
                <p className="text-[11px] text-orange-400/80 mt-1 font-semibold">
                  Clique no botão abaixo para dar Play, gravar a trilha e a narração juntas automaticamente do início ao fim!
                </p>
              </div>
              <button
                onClick={() => {
                  stopPlayback();
                  setIsRecording(true);
                  setTimeout(() => {
                    startPlayback();
                  }, 200);
                }}
                className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-neutral-950 font-extrabold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-xs tracking-wider uppercase active:scale-[0.98]"
              >
                <Radio className="h-4 w-4 text-neutral-950 animate-pulse" />
                Gerar e Baixar Áudio Completo (Automático)
              </button>
            </div>

            {/* BOTOES DO PLAYER */}
            <div className="grid grid-cols-3 gap-3">
              {isPlaying ? (
                <button
                  onClick={pausePlayback}
                  className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-3 rounded-xl transition-all border border-neutral-700"
                >
                  <Pause className="h-4 w-4" /> Pausar
                </button>
              ) : (
                <button
                  onClick={startPlayback}
                  className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-all shadow-md"
                >
                  <Play className="h-4 w-4 text-neutral-950 stroke-[3]" /> Iniciar
                </button>
              )}

              <button
                onClick={stopPlayback}
                className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium py-3 rounded-xl transition-all border border-neutral-800"
              >
                <Square className="h-4 w-4" /> Parar
              </button>

              <button
                onClick={toggleRecordingOption}
                className={`flex items-center justify-center gap-2 font-bold py-3 rounded-xl transition-all ${
                  isRecording 
                    ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-800'
                }`}
              >
                <Megaphone className="h-4 w-4" /> {isRecording ? 'Gravando...' : 'Gravar Áudio'}
              </button>
            </div>

            {/* DOWNLOAD DE ÁUDIO GRAVADO */}
            {audioUrl && (
              <div className="bg-emerald-950/20 border border-emerald-900/60 p-4 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Áudio Gravado com Sucesso!
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">Pronto para o vídeo</span>
                </div>
                <audio src={audioUrl} controls className="w-full h-8" />
                <a
                  href={audioUrl}
                  download="audio-narracao-cd360.webm"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <Download className="h-4 w-4 text-neutral-950" /> Baixar Áudio (.WEBM)
                </a>
              </div>
            )}
          </div>

          {/* MESA DE SOM - MIXER */}
          <div className="bg-neutral-900 border border-neutral-800/80 rounded-2xl p-6 flex flex-col gap-6 shadow-lg">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sliders className="h-4 w-4 text-orange-500" /> Mesa de Mixagem Estúdio
            </h2>

            <div className="flex flex-col gap-5">
              {/* Canal Voz */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-semibold text-white flex items-center gap-1">🎤 Locução</span>
                  <span>{voiceVolume}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="0" max="100" value={voiceVolume}
                    onChange={(e) => setVoiceVolume(parseInt(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  {/* VU Meter de Voz */}
                  <div className="w-16 h-2.5 bg-neutral-950 rounded overflow-hidden flex gap-0.5 p-0.5">
                    <div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${Math.min(70, voiceVU)}%` }} />
                    <div className="h-full bg-amber-500 transition-all duration-75" style={{ width: `${Math.max(0, Math.min(20, voiceVU - 70)) * 5}%` }} />
                    <div className="h-full bg-red-500 transition-all duration-75" style={{ width: `${Math.max(0, voiceVU - 90) * 10}%` }} />
                  </div>
                </div>
              </div>

              {/* Canal Música */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-semibold text-white flex items-center gap-1">🎵 Trilha Sonora Inteligente</span>
                  <span>{musicVolume}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="0" max="100" value={musicVolume}
                    onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  {/* VU Meter de Música */}
                  <div className="w-16 h-2.5 bg-neutral-950 rounded overflow-hidden flex gap-0.5 p-0.5">
                    <div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${Math.min(70, isPlaying ? musicVolume * 0.7 + (Math.sin(currentTime * 10) * 5) : 0)}%` }} />
                    <div className="h-full bg-amber-500 transition-all duration-75" style={{ width: `${Math.max(0, isPlaying ? musicVolume * 0.9 : 0)}%` }} />
                  </div>
                </div>
                {/* Seleção de Gênero para Marketing */}
                <div className="flex flex-col gap-1.5 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                  <label className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Estilo de Trilha para Vídeo/Ramo</label>
                  <select
                    value={musicGenre}
                    onChange={(e) => setMusicGenre(e.target.value)}
                    className="bg-neutral-900 text-xs text-neutral-300 p-1.5 rounded-lg border border-neutral-800 focus:outline-none focus:border-orange-500 w-full cursor-pointer"
                  >
                    <option value="corporate">💼 Corporate Tech (SaaS, Tecnologia, Geral)</option>
                    <option value="retail">⚡ Varejo Moderno / Electro (Promoção, Vendas, Rápido)</option>
                    <option value="institutional">🏥 Institucional / Elegante (Imóveis, Clínicas, Luxo)</option>
                    <option value="epic">🎬 Épico / Urgência (Black Friday, Lançamento, Impacto)</option>
                  </select>
                </div>

                {/* Música com IA de verdade (Stable Audio) */}
                <div className="flex flex-col gap-2 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">🤖 Música com IA (Stable Audio)</label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setMusicSource('synth')}
                        className={`text-[9px] font-bold px-2 py-1 rounded ${musicSource === 'synth' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                      >
                        Sintetizador
                      </button>
                      <button
                        onClick={() => setMusicSource('ai')}
                        disabled={!aiMusicUrl}
                        className={`text-[9px] font-bold px-2 py-1 rounded disabled:opacity-40 ${musicSource === 'ai' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                      >
                        Gerada por IA
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={aiMusicPrompt}
                    onChange={(e) => setAiMusicPrompt(e.target.value)}
                    rows={2}
                    placeholder="Descreva a música: gênero, instrumentos, clima..."
                    className="bg-neutral-900 text-xs text-neutral-300 p-2 rounded-lg border border-neutral-800 focus:outline-none focus:border-orange-500 w-full resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-neutral-500 whitespace-nowrap">Duração:</label>
                    <input
                      type="number" min={5} max={90} value={aiMusicDuration}
                      onChange={(e) => setAiMusicDuration(parseInt(e.target.value) || 30)}
                      className="bg-neutral-900 text-xs text-neutral-300 p-1.5 rounded-lg border border-neutral-800 w-16 focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-[10px] text-neutral-500">segundos</span>
                    <button
                      onClick={generateAiMusic}
                      disabled={isGeneratingMusic}
                      className="ml-auto text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white disabled:opacity-50"
                    >
                      {isGeneratingMusic ? '⏳ Gerando... (pode levar ~1 min)' : '🎵 Gerar Música'}
                    </button>
                  </div>
                  {aiMusicError && <p className="text-[10px] text-red-400">{aiMusicError}</p>}
                  {aiMusicUrl && !aiMusicError && (
                    <p className="text-[10px] text-emerald-400">✓ Música gerada! Selecione "Gerada por IA" acima pra usar na trilha.</p>
                  )}
                  <p className="text-[9px] text-neutral-600">Usa a chave da AIMLAPI configurada em ⚙️ Configurações. Cada geração consome créditos da sua conta.</p>
                </div>
              </div>

              {/* Canal Efeitos */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-semibold text-white flex items-center gap-1">⚡ Efeitos Sonoros (SFX)</span>
                  <span>{sfxVolume}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="0" max="100" value={sfxVolume}
                    onChange={(e) => setSfxVolume(parseInt(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  {/* VU Meter de SFX */}
                  <div className="w-16 h-2.5 bg-neutral-950 rounded overflow-hidden flex gap-0.5 p-0.5">
                    <div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${sfxVU}%` }} />
                  </div>
                </div>
              </div>

              {/* Provedor de Voz */}
              <div className="border-t border-neutral-800 pt-4 flex flex-col gap-3">
                <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  🔊 Provedor de Voz
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setVoiceProvider('gemini')}
                    className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${voiceProvider === 'gemini' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-neutral-950 border-neutral-800 text-neutral-400'}`}
                  >
                    Gemini
                  </button>
                  <button
                    onClick={() => setVoiceProvider('azure')}
                    className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${voiceProvider === 'azure' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-neutral-950 border-neutral-800 text-neutral-400'}`}
                  >
                    Azure (grátis)
                  </button>
                </div>
                {voiceProvider === 'azure' && (
                  <p className="text-[10px] text-neutral-500">Vozes Neural da Microsoft — 500 mil caracteres grátis por mês. Precisa configurar AZURE_SPEECH_KEY e AZURE_SPEECH_REGION no .env.local.</p>
                )}
              </div>

              {/* Personalidade & Tom da Voz (Gemini AI) */}
              {voiceProvider === 'gemini' && (
              <div className="border-t border-neutral-800 pt-4 flex flex-col gap-3">
                <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  🎤 Voz & Tom da Narração (Gemini AI)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Locutor(a)</label>
                    <select
                      value={geminiVoice}
                      onChange={(e) => setGeminiVoice(e.target.value)}
                      className="bg-neutral-950 text-xs text-neutral-300 p-2.5 rounded-xl border border-neutral-800 focus:outline-none focus:border-orange-500 w-full cursor-pointer"
                    >
                      <option value="Zephyr">Zephyr (Neutro & Moderno)</option>
                      <option value="Kore">Kore (Expressivo & Quente)</option>
                      <option value="Puck">Puck (Alegre & Dinâmico)</option>
                      <option value="Fenrir">Fenrir (Forte & Profundo)</option>
                      <option value="Charon">Charon (Sábio & Calmo)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Atitude & Emoção</label>
                    <select
                      value={geminiEmotion}
                      onChange={(e) => setGeminiEmotion(e.target.value)}
                      className="bg-neutral-950 text-xs text-neutral-300 p-2.5 rounded-xl border border-neutral-800 focus:outline-none focus:border-orange-500 w-full cursor-pointer"
                    >
                      <option value="Profissional">Profissional / Sóbrio</option>
                      <option value="Extremamente rápido, animado, sem pausas">Rápido & Comercial</option>
                      <option value="Conversacional amigável, natural">Conversa Natural</option>
                      <option value="Sussurrado, calmo, meditativo">Suave & Calmo</option>
                      <option value="Sério, urgente e informativo">Urgente & Sério</option>
                      <option value="Entusiasmado, muito feliz, empolgante">Super Empolgado!</option>
                    </select>
                  </div>
                </div>
              </div>
              )}

              {/* Voz Azure Neural */}
              {voiceProvider === 'azure' && (
              <div className="border-t border-neutral-800 pt-4 flex flex-col gap-3">
                <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  🎤 Voz (Azure Neural)
                </span>
                <select
                  value={azureVoice}
                  onChange={(e) => setAzureVoice(e.target.value)}
                  className="bg-neutral-950 text-xs text-neutral-300 p-2.5 rounded-xl border border-neutral-800 focus:outline-none focus:border-orange-500 w-full cursor-pointer"
                >
                  {AZURE_VOICE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              )}

              {/* Ajustes Finos de Voz */}
              <div className="border-t border-neutral-800 pt-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                    ⚙️ Sincronização & Tempo da Voz
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-orange-400 font-mono font-bold">Auto-Ajuste ao Vídeo</span>
                    <button
                      onClick={() => setAutoTimeFit(!autoTimeFit)}
                      className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ${
                        autoTimeFit ? 'bg-orange-500' : 'bg-neutral-800'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 bg-neutral-950 rounded-full transition-transform duration-200 ${
                        autoTimeFit ? 'translate-x-3.5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                {autoTimeFit ? (
                  <div className="bg-orange-950/20 border border-orange-900/40 p-3 rounded-xl flex flex-col gap-1.5 text-xs">
                    <p className="text-orange-400 font-semibold flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-orange-400 animate-pulse" />
                      Sincronia Automática Ativada!
                    </p>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      O app calcula o tamanho do texto de cada trecho e acelera/desacelera a voz dinamicamente para que ela caiba perfeitamente no tempo correto do seu vídeo.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span>Velocidade Manual</span>
                        <span className="font-mono text-orange-400">{voiceRate.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range" min="0.7" max="2.3" step="0.05" value={voiceRate}
                        onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                        className="accent-orange-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span>Tom (Pitch)</span>
                        <span className="font-mono text-orange-400">{voicePitch.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range" min="0.8" max="1.3" step="0.05" value={voicePitch}
                        onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                        className="accent-orange-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Ajuste de Pausas */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Pausa Curta (//)</span>
                      <span className="font-mono text-orange-400">{shortPauseDuration}ms</span>
                    </div>
                    <input
                      type="range" min="100" max="800" step="50" value={shortPauseDuration}
                      onChange={(e) => setShortPauseDuration(parseInt(e.target.value))}
                      className="accent-orange-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Pausa Longa (///)</span>
                      <span className="font-mono text-orange-400">{longPauseDuration}ms</span>
                    </div>
                    <input
                      type="range" min="200" max="1500" step="50" value={longPauseDuration}
                      onChange={(e) => setLongPauseDuration(parseInt(e.target.value))}
                      className="accent-orange-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Controle Master */}
              <div className="border-t border-neutral-800 pt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-orange-500 flex items-center gap-1">🎛️ Volume Geral (Master)</span>
                  <span className="text-white">{masterVolume}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 bg-neutral-950 rounded border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <input
                    type="range" min="0" max="100" value={masterVolume}
                    onChange={(e) => setMasterVolume(parseInt(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Opções de Mixagem inteligente */}
              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/60 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Auto-Ducking de Fundo</h4>
                  <p className="text-[10px] text-neutral-500">Abaixa a música automaticamente durante a locução</p>
                </div>
                <button
                  onClick={() => setAutoDucking(!autoDucking)}
                  className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 ${
                    autoDucking ? 'bg-orange-500' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`w-4 h-4 bg-neutral-950 rounded-full transition-transform duration-200 ${
                    autoDucking ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* PALETA DE EFEITOS (DISPARO MANUAL) */}
          <div className="bg-neutral-900 border border-neutral-800/80 rounded-2xl p-5 flex flex-col gap-3 shadow-lg">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Disparo de Efeitos (SFX)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => playSFX('whoosh1')}
                className="bg-neutral-950 border border-neutral-800/80 hover:border-orange-500/50 py-2 px-3 text-xs text-neutral-300 hover:text-white rounded-xl transition-all text-left flex flex-col"
              >
                <span className="font-semibold text-orange-400">⚡ Transição</span>
                <span className="text-[10px] text-neutral-500">Whoosh rápido de corte</span>
              </button>
              <button
                onClick={() => playSFX('ia_tap')}
                className="bg-neutral-950 border border-neutral-800/80 hover:border-orange-500/50 py-2 px-3 text-xs text-neutral-300 hover:text-white rounded-xl transition-all text-left flex flex-col"
              >
                <span className="font-semibold text-orange-400">🤖 Alerta IA</span>
                <span className="text-[10px] text-neutral-500">Notificação tecnológica</span>
              </button>
              <button
                onClick={() => playSFX('beep1')}
                className="bg-neutral-950 border border-neutral-800/80 hover:border-orange-500/50 py-2 px-3 text-xs text-neutral-300 hover:text-white rounded-xl transition-all text-left flex flex-col"
              >
                <span className="font-semibold text-orange-400">🏷️ Bipe Scanner</span>
                <span className="text-[10px] text-neutral-500">Scanner de código de barras</span>
              </button>
              <button
                onClick={() => playSFX('rating')}
                className="bg-neutral-950 border border-neutral-800/80 hover:border-orange-500/50 py-2 px-3 text-xs text-neutral-300 hover:text-white rounded-xl transition-all text-left flex flex-col"
              >
                <span className="font-semibold text-orange-400">⭐ Ganho Cupom</span>
                <span className="text-[10px] text-neutral-500">Sinos festivos e avaliação</span>
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
