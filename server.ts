import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Static downloads directory for direct browser links
const downloadsDir = path.resolve(__dirname, 'public', 'downloads');
app.use('/downloads', express.static(downloadsDir));

// API endpoint to get info about available export packages
app.get('/api/export/info', (_req: Request, res: Response) => {
  const apkPath = path.join(downloadsDir, 'DocuGemini-v1.0.0-release.apk');
  const zipPath = path.join(downloadsDir, 'DocuGemini-v1.0.0-package.zip');

  const apkExists = fs.existsSync(apkPath);
  const zipExists = fs.existsSync(zipPath);

  return res.json({
    version: '1.0.0',
    packageName: 'com.docugemini.app',
    apk: {
      filename: 'DocuGemini-v1.0.0-release.apk',
      available: apkExists,
      sizeBytes: apkExists ? fs.statSync(apkPath).size : 0,
      downloadUrl: '/api/export/apk',
    },
    zip: {
      filename: 'DocuGemini-v1.0.0-package.zip',
      available: zipExists,
      sizeBytes: zipExists ? fs.statSync(zipPath).size : 0,
      downloadUrl: '/api/export/package-zip',
      includesApk: true,
      description: 'Complete ZIP package containing the ready-to-install Android APK, full Android Studio project, offline web assets, and installation guide.',
    },
  });
});

// API endpoint to download the master ZIP package (which contains the APK inside it)
app.get('/api/export/package-zip', (_req: Request, res: Response) => {
  const zipPath = path.join(downloadsDir, 'DocuGemini-v1.0.0-package.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'Package ZIP not found. Please build package first.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="DocuGemini-v1.0.0-package.zip"');
  return res.sendFile(zipPath);
});

// API endpoint to download the standalone APK
app.get('/api/export/apk', (_req: Request, res: Response) => {
  const apkPath = path.join(downloadsDir, 'DocuGemini-v1.0.0-release.apk');
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: 'APK file not found. Please build package first.' });
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="DocuGemini-v1.0.0-release.apk"');
  return res.sendFile(apkPath);
});

interface GenerateRequestBody {
  model?: string;
  messages: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }>;
  }>;
  systemInstruction?: string;
  temperature?: number;
  thinkingLevel?: string;
  apiKey?: string;
  customEndpoint?: string;
}

// Healthy candidates for multimodal & document processing, sorted by highest availability / lowest rate-limit sensitivity
const HEALTHY_VISION_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];

// Models that are specialized for audio, TTS, live bidirectional WebSocket, or image generation
// and DO NOT support multi-turn generateContent document conversation.
const NON_CHAT_MODELS = new Set([
  'gemini-3.5-transcribe',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking',
  'gemini-3.5-transcribe-live',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
]);

// Helper to instantiate client
function getGenAIClient(customKey?: string) {
  const keyToUse =
    customKey && customKey.trim().length > 0
      ? customKey.trim()
      : process.env.GEMINI_API_KEY;

  if (!keyToUse) {
    throw new Error(
      'No API key available. Please provide a Gemini API key or set GEMINI_API_KEY in server secrets.'
    );
  }

  return {
    ai: new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
    apiKey: keyToUse,
  };
}

// Format clean error message from GenAI or API errors
function formatApiError(err: any): {
  message: string;
  isQuotaExceeded: boolean;
  isMultiturnNotEnabled: boolean;
  isLiveOnly: boolean;
  retryAfterSeconds?: number;
} {
  const rawMsg = err?.message || '';
  let isQuota = false;
  let isMultiturn = false;
  let isLiveOnly = false;
  let retrySec: number | undefined;

  // Check Multiturn chat error
  if (
    rawMsg.includes('Multiturn chat is not enabled') ||
    rawMsg.includes('not enabled for this model')
  ) {
    isMultiturn = true;
  }

  // Check Live API WebSocket constraint
  if (
    rawMsg.includes('only supports real-time bidirectional streaming') ||
    rawMsg.includes('bidiGenerateContent')
  ) {
    isLiveOnly = true;
  }

  // Check HTTP 429 or RESOURCE_EXHAUSTED or 503 UNAVAILABLE
  if (
    rawMsg.includes('429') ||
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('Quota exceeded') ||
    rawMsg.includes('503') ||
    rawMsg.includes('UNAVAILABLE') ||
    rawMsg.includes('high demand') ||
    err?.status === 429 ||
    err?.status === 'RESOURCE_EXHAUSTED' ||
    err?.status === 503
  ) {
    isQuota = true;
    const retryMatch =
      rawMsg.match(/retry in ([0-9.]+)s/i) ||
      rawMsg.match(/retryDelay":"([0-9]+)s"/i);
    if (retryMatch && retryMatch[1]) {
      retrySec = Math.ceil(parseFloat(retryMatch[1]));
    }
  }

  let cleanMsg = rawMsg;
  try {
    const jsonMatch = rawMsg.match(/\{.*\}$/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) {
        cleanMsg = parsed.error.message;
      }
    }
  } catch {
    // keep rawMsg
  }

  return {
    message: cleanMsg,
    isQuotaExceeded: isQuota,
    isMultiturnNotEnabled: isMultiturn,
    isLiveOnly,
    retryAfterSeconds: retrySec,
  };
}

// 1. Get configuration and supported models
app.get('/api/gemini/config', (_req: Request, res: Response) => {
  const hasServerKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0
  );
  res.json({
    serverHasDefaultKey: hasServerKey,
    defaultModel: 'gemini-flash-lite-latest',
    supportedModels: [
      {
        id: 'gemini-flash-lite-latest',
        name: 'Gemini Flash Lite (Latest)',
        description: 'Recommended default: Ultra-low latency, generous free tier rate limits, and superior document vision.',
        isDefault: true,
        isFree: true,
        inputCostPer1M: 0.0375,
        outputCostPer1M: 0.15,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'General & Multimodal',
      },
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite',
        description: 'Highly responsive multimodal model with high throughput and document parsing.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.0375,
        outputCostPer1M: 0.15,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'General & Multimodal',
      },
      {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        description: 'Advanced reasoning model with deep multimodal and table analysis.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'General & Multimodal',
      },
      {
        id: 'gemini-3.1-flash-lite',
        name: 'Gemini 3.1 Flash Lite',
        description: 'High-speed model for document reasoning and page extraction.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.0375,
        outputCostPer1M: 0.15,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'General & Multimodal',
      },
      {
        id: 'gemini-flash-latest',
        name: 'Gemini Flash Latest',
        description: 'Always points to the latest stable production release of the Gemini Flash family.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'General & Multimodal',
      },
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        description: 'Ultra-fast multimodal model with deep document reasoning.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'General & Multimodal',
      },
      {
        id: 'gemini-3.5-transcribe',
        name: 'Gemini 3.5 Transcribe',
        description: 'Specialized model for audio transcription and speech-to-text.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.05,
        outputCostPer1M: 0.20,
        contextWindow: '1M tokens',
        supportsVision: false,
        supportsChat: false,
        category: 'Audio & Speech',
      },
      {
        id: 'gemini-3.8-flash-lite-tts',
        name: 'Gemini 3.8 Flash Lite TTS',
        description: 'General text-to-speech for reading documents aloud.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.05,
        outputCostPer1M: 0.20,
        contextWindow: '1M tokens',
        supportsVision: false,
        supportsChat: false,
        category: 'Audio & Speech',
      },
      {
        id: 'gemini-3.8-flash-tts',
        name: 'Gemini 3.8 Flash TTS',
        description: 'Expressive speech and dialogue synthesis.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30,
        contextWindow: '1M tokens',
        supportsVision: false,
        supportsChat: false,
        category: 'Audio & Speech',
      },
      {
        id: 'gemini-3.8-live',
        name: 'Gemini 3.8 Live',
        description: 'Low-latency real-time bidirectional streaming for conversational voice and video.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.10,
        outputCostPer1M: 0.40,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: false,
        category: 'Realtime Live',
      },
      {
        id: 'gemini-3.8-live-extended-thinking',
        name: 'Gemini 3.8 Live Extended Thinking',
        description: 'Real-time live model with extended reasoning for multi-step tasks.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.60,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: false,
        category: 'Realtime Live',
      },
      {
        id: 'gemini-3.5-transcribe-live',
        name: 'Gemini 3.5 Transcribe Live',
        description: 'Live real-time stream speech translation and continuous audio transcription.',
        isDefault: false,
        isFree: true,
        inputCostPer1M: 0.075,
        outputCostPer1M: 0.30,
        contextWindow: '1M tokens',
        supportsVision: false,
        supportsChat: false,
        category: 'Realtime Live',
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        description: 'Flagship reasoning model for complex STEM, deep analysis, and intricate tables.',
        isDefault: false,
        isFree: false,
        inputCostPer1M: 1.25,
        outputCostPer1M: 5.00,
        contextWindow: '2M tokens',
        supportsVision: true,
        supportsChat: true,
        category: 'Reasoning & STEM',
      },
      {
        id: 'gemini-3.1-flash-image',
        name: 'Gemini 3.1 Flash Image (Nano Banana 2)',
        description: 'High-quality image generation up to 4K resolution.',
        isDefault: false,
        isFree: false,
        inputCostPer1M: 0.20,
        outputCostPer1M: 0.80,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: false,
        category: 'Image & Media',
      },
      {
        id: 'gemini-3.1-flash-lite-image',
        name: 'Gemini 3.1 Flash Lite Image (Nano Banana)',
        description: 'Fast, cost-efficient image generation and visual editing model.',
        isDefault: false,
        isFree: false,
        inputCostPer1M: 0.10,
        outputCostPer1M: 0.40,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: false,
        category: 'Image & Media',
      },
      {
        id: 'gemini-3-pro-image',
        name: 'Gemini 3 Pro Image (Nano Banana Pro)',
        description: 'Flagship studio-grade image synthesis.',
        isDefault: false,
        isFree: false,
        inputCostPer1M: 0.50,
        outputCostPer1M: 2.00,
        contextWindow: '1M tokens',
        supportsVision: true,
        supportsChat: false,
        category: 'Image & Media',
      },
    ],
  });
});

function normalizeThirdPartyEndpoint(endpoint: string): string {
  let url = endpoint ? endpoint.trim() : '';
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, '');

  if (url === 'https://openrouter.ai' || url === 'http://openrouter.ai') {
    return 'https://openrouter.ai/api/v1';
  }
  if (url === 'https://api.groq.com' || url === 'http://api.groq.com') {
    return 'https://api.groq.com/openai/v1';
  }
  if (url === 'https://api.deepseek.com' || url === 'http://api.deepseek.com') {
    return 'https://api.deepseek.com/v1';
  }
  if (url === 'https://api.together.xyz' || url === 'http://api.together.xyz') {
    return 'https://api.together.xyz/v1';
  }
  if (url === 'https://api.openai.com' || url === 'http://api.openai.com') {
    return 'https://api.openai.com/v1';
  }

  return url;
}

// 2. Verify API key and find an active, working model automatically
app.post('/api/gemini/verify-key', async (req: Request, res: Response) => {
  const { apiKey, model = 'gemini-flash-lite-latest', customEndpoint } = req.body;
  const startTime = Date.now();

  try {
    // If third-party custom endpoint is specified
    if (customEndpoint && customEndpoint.trim().length > 0) {
      const url = normalizeThirdPartyEndpoint(customEndpoint);
      const trimmedKey = apiKey ? apiKey.trim() : '';

      if (!trimmedKey) {
        return res.status(400).json({
          valid: false,
          error: 'An API key is required when using a third-party custom endpoint. Please enter your API key in Settings.',
        });
      }

      const testUrl = url.endsWith('/') ? `${url}models` : `${url}/models`;
      let testRes: globalThis.Response;
      try {
        testRes = await fetch(testUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aistudio.google.com',
            'X-Title': 'DocuGemini',
          },
        });
      } catch (fetchErr: any) {
        return res.status(400).json({
          valid: false,
          error: `Failed to reach endpoint (${url}): ${fetchErr?.message || 'Network error'}`,
        });
      }

      const latencyMs = Date.now() - startTime;
      const rawText = await testRes.text().catch(() => '');

      if (testRes.ok) {
        return res.json({
          valid: true,
          model,
          latencyMs,
          message: 'Third-party endpoint connection verified successfully.',
          provider: 'custom',
        });
      } else {
        let cleanErr = rawText.slice(0, 150);
        try {
          const parsed = JSON.parse(rawText);
          if (parsed?.error?.message) cleanErr = parsed.error.message;
          else if (parsed?.error) cleanErr = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
        } catch {
          if (rawText.includes('<!DOCTYPE') || rawText.includes('<html')) {
            cleanErr = `Endpoint returned non-JSON HTML page (Status ${testRes.status})`;
          }
        }
        return res.status(400).json({
          valid: false,
          latencyMs,
          error: `Endpoint status ${testRes.status}: ${cleanErr}`,
        });
      }
    }

    // Google GenAI validation
    const { ai } = getGenAIClient(apiKey);

    // List of models to test in priority order starting with requested model, then healthy vision models
    const isNonChat = NON_CHAT_MODELS.has(model);
    const modelsToProbe = isNonChat
      ? [...HEALTHY_VISION_MODELS]
      : [model, ...HEALTHY_VISION_MODELS.filter((m) => m !== model)];

    let workingModel: string | null = null;
    let workingResponseText = 'OK';
    let switchedNotice: string | null = null;
    let lastQuotaError: any = null;

    for (const probeModel of modelsToProbe) {
      try {
        const testResponse = await ai.models.generateContent({
          model: probeModel,
          contents: 'Ping',
          config: {
            maxOutputTokens: 5,
            temperature: 0.1,
          },
        });
        workingModel = probeModel;
        workingResponseText = testResponse.text?.trim() || 'OK';
        if (probeModel !== model) {
          if (isNonChat) {
            switchedNotice = `API Key verified. Auto-selected ${probeModel} for Document Chat because ${model} is a specialized audio/media model.`;
          } else {
            switchedNotice = `Automatically switched to ${probeModel} because ${model} was temporarily rate-limited.`;
          }
        }
        break;
      } catch (probeErr: any) {
        const errInfo = formatApiError(probeErr);
        if (errInfo.isQuotaExceeded || errInfo.isMultiturnNotEnabled || errInfo.isLiveOnly) {
          lastQuotaError = errInfo;
          console.warn(`Probe on ${probeModel} limited or non-chat: ${errInfo.message}`);
          // Continue to next probe model
          continue;
        } else {
          // If it's an authentication error (e.g. invalid key), fail fast
          throw probeErr;
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    // If a working model was found
    if (workingModel) {
      return res.json({
        valid: true,
        model: workingModel,
        originalModel: model,
        autoSwitched: workingModel !== model,
        latencyMs,
        responseSample: workingResponseText,
        rateLimitTier: 'Active',
        message:
          switchedNotice ||
          `Successfully connected to ${workingModel} in ${latencyMs}ms.`,
        provider: 'google',
      });
    }

    // If all models hit quota, the API key is verified as authentic by Google
    return res.json({
      valid: true,
      model: 'gemini-flash-lite-latest',
      originalModel: model,
      latencyMs,
      rateLimitTier: 'Free Tier Cooldown',
      message: `API Key verified. Quota window is cooling down (${lastQuotaError?.retryAfterSeconds ? `resets in ${lastQuotaError.retryAfterSeconds}s` : 'please wait a moment'}). Auto-set to Gemini Flash Lite (Latest).`,
      provider: 'google',
      quotaExceeded: true,
      retryAfterSeconds: lastQuotaError?.retryAfterSeconds || 10,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errInfo = formatApiError(err);
    console.error('API Key verification error:', errInfo.message);

    if (errInfo.isQuotaExceeded) {
      return res.json({
        valid: true,
        model: 'gemini-flash-lite-latest',
        latencyMs,
        rateLimitTier: 'Rate Limited',
        message: `API Key is valid. Temporary quota reached for ${model}. Auto-set to Gemini Flash Lite (Latest).`,
        provider: 'google',
        quotaExceeded: true,
        retryAfterSeconds: errInfo.retryAfterSeconds,
      });
    }

    return res.status(400).json({
      valid: false,
      latencyMs,
      error:
        errInfo.message ||
        'Failed to authenticate with Gemini API. Check your key and network.',
    });
  }
});

// 3. Generate response with token usage metadata and auto-switching to working models
app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const {
    model = 'gemini-flash-lite-latest',
    messages,
    systemInstruction,
    temperature = 0.7,
    apiKey,
    customEndpoint,
  }: GenerateRequestBody = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  try {
    // If third-party custom endpoint
    if (customEndpoint && customEndpoint.trim().length > 0) {
      const endpoint = normalizeThirdPartyEndpoint(customEndpoint);
      const trimmedKey = apiKey ? apiKey.trim() : '';

      if (!trimmedKey) {
        return res.status(400).json({
          error: 'An API key is required when using a third-party custom endpoint. Please enter your API key in Settings.',
        });
      }

      const apiUrl = endpoint.includes('/chat/completions')
        ? endpoint
        : `${endpoint}/chat/completions`;

      const openAiMessages = messages.map((m) => {
        let content: any = '';
        const textParts = m.parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join('\n');
        const imageParts = m.parts.filter((p) => p.inlineData);

        if (imageParts.length > 0) {
          content = [
            { type: 'text', text: textParts || 'Inspect attached document' },
            ...imageParts.map((img) => ({
              type: 'image_url',
              image_url: {
                url: `data:${img.inlineData?.mimeType};base64,${img.inlineData?.data}`,
              },
            })),
          ];
        } else {
          content = textParts;
        }

        return {
          role: m.role === 'model' ? 'assistant' : 'user',
          content,
        };
      });

      if (systemInstruction && systemInstruction.trim().length > 0) {
        openAiMessages.unshift({
          role: 'system' as any,
          content: systemInstruction.trim(),
        });
      }

      let thirdPartyRes: globalThis.Response;
      try {
        thirdPartyRes = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${trimmedKey}`,
            'HTTP-Referer': 'https://aistudio.google.com',
            'X-Title': 'DocuGemini',
          },
          body: JSON.stringify({
            model,
            messages: openAiMessages,
            temperature,
            max_tokens: 4096,
          }),
        });
      } catch (fetchErr: any) {
        return res.status(502).json({
          error: `Failed to connect to third-party endpoint: ${fetchErr?.message || 'Network unreachable'}`,
        });
      }

      const rawText = await thirdPartyRes.text().catch(() => '');
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        const snippet = rawText.includes('<!DOCTYPE') || rawText.includes('<html')
          ? 'HTML error page returned by proxy'
          : rawText.slice(0, 150);
        return res.status(502).json({
          error: `Third-party endpoint returned non-JSON response (Status ${thirdPartyRes.status}): ${snippet}`,
        });
      }

      if (!thirdPartyRes.ok) {
        const cleanMsg = data?.error?.message || data?.error || rawText.slice(0, 200);
        return res.status(thirdPartyRes.status || 400).json({
          error: `Endpoint error (${thirdPartyRes.status}): ${cleanMsg}`,
        });
      }

      const latencyMs = Date.now() - startTime;
      const textOutput = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};

      return res.json({
        text: textOutput,
        model,
        latencyMs,
        usageMetadata: {
          promptTokenCount: usage.prompt_tokens || 0,
          candidatesTokenCount: usage.completion_tokens || 0,
          totalTokenCount: usage.total_tokens || 0,
        },
      });
    }

    // Official @google/genai SDK flow
    const { ai } = getGenAIClient(apiKey);

    const formattedContents = messages.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: msg.parts.map((part) => {
        if (part.inlineData) {
          return {
            inlineData: {
              mimeType: part.inlineData.mimeType,
              data: part.inlineData.data,
            },
          };
        }
        return {
          text: part.text || '',
        };
      }),
    }));

    const config: any = {
      temperature,
    };

    if (systemInstruction && systemInstruction.trim().length > 0) {
      config.systemInstruction = systemInstruction.trim();
    }

    // Execution with automated fallback cascade to working models
    const isRequestedNonChat = NON_CHAT_MODELS.has(model);
    const executionModels = isRequestedNonChat
      ? [...HEALTHY_VISION_MODELS]
      : [model, ...HEALTHY_VISION_MODELS.filter((m) => m !== model)];

    let activeModelToRun = isRequestedNonChat ? HEALTHY_VISION_MODELS[0] : model;
    let response: any = null;
    let fallbackNotice: string | null = null;
    let lastError: any = null;

    for (const targetModel of executionModels) {
      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: formattedContents as any,
          config,
        });
        activeModelToRun = targetModel;
        if (targetModel !== model) {
          if (isRequestedNonChat) {
            fallbackNotice = `(Auto-switched from ${model} to ${targetModel}: ${model} is a specialized audio/media model and does not support multi-turn document conversation.)`;
          } else {
            fallbackNotice = `(Automatically completed using ${targetModel} because ${model} was temporarily rate-limited or unavailable)`;
          }
        }
        break;
      } catch (err: any) {
        const errInfo = formatApiError(err);
        lastError = errInfo;
        if (errInfo.isQuotaExceeded || errInfo.isMultiturnNotEnabled || errInfo.isLiveOnly) {
          console.warn(`Model ${targetModel} cannot complete chat request (${errInfo.message}). Trying next working model...`);
          continue;
        } else {
          // If non-retryable error (e.g. invalid API key), throw immediately
          throw err;
        }
      }
    }

    if (!response) {
      if (lastError?.isMultiturnNotEnabled) {
        return res.status(400).json({
          error: `Multiturn chat is not enabled for '${model}'. This model is specialized for audio, speech, or media. Please switch to a Document Vision model such as Gemini 3.1 Flash Lite or Gemini 3.8 Flash in Settings.`,
        });
      }
      const waitTime = lastError?.retryAfterSeconds
        ? ` Please wait ${lastError.retryAfterSeconds} seconds before sending another message.`
        : ' Please wait a few moments for your quota window to reset.';
      return res.status(429).json({
        error: `All free tier models are temporarily cooling down.${waitTime}`,
        retryAfterSeconds: lastError?.retryAfterSeconds || 10,
        isQuotaExceeded: true,
      });
    }

    const latencyMs = Date.now() - startTime;
    let textOutput = response.text || '';
    if (fallbackNotice) {
      textOutput = `${textOutput}\n\n> *ℹ️ ${fallbackNotice}*`;
    }

    const usage = response.usageMetadata || {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    return res.json({
      text: textOutput,
      model: activeModelToRun,
      originalModel: model,
      autoSwitched: activeModelToRun !== model,
      latencyMs,
      usageMetadata: {
        promptTokenCount: usage.promptTokenCount || 0,
        candidatesTokenCount: usage.candidatesTokenCount || 0,
        totalTokenCount: usage.totalTokenCount || 0,
      },
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errInfo = formatApiError(err);
    console.error('Error generating content:', errInfo.message);

    const statusCode = errInfo.isQuotaExceeded ? 429 : 400;
    return res.status(statusCode).json({
      error: errInfo.message || 'Error occurred while generating AI response.',
      isQuotaExceeded: errInfo.isQuotaExceeded,
      retryAfterSeconds: errInfo.retryAfterSeconds,
      latencyMs,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DocuGemini Server listening on port ${PORT}`);
  });
}

startServer();
