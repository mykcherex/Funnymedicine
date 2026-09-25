import { ApiSettings, ConnectionStatus, DocumentPageSnapshot } from '../types';
import { calculateCost, isModelChatCapable } from '../constants/models';

export interface GenerateResult {
  text: string;
  model: string;
  latencyMs: number;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  costUsd: number;
}

export async function fetchServerConfig(): Promise<{
  serverHasDefaultKey: boolean;
  defaultModel: string;
  supportedModels: any[];
}> {
  try {
    const res = await fetch('/api/gemini/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    return await res.json();
  } catch (e) {
    console.warn('Config fetch fallback:', e);
    return {
      serverHasDefaultKey: true,
      defaultModel: 'gemini-flash-lite-latest',
      supportedModels: [],
    };
  }
}

export async function verifyApiConnection(
  settings: ApiSettings
): Promise<ConnectionStatus> {
  const startTime = Date.now();
  try {
    const payload: any = {
      model: settings.selectedModel || 'gemini-flash-lite-latest',
    };

    if (settings.mode === 'custom_gemini' && settings.geminiApiKey) {
      payload.apiKey = settings.geminiApiKey;
    } else if (settings.mode === 'third_party') {
      payload.apiKey = settings.thirdPartyApiKey;
      payload.customEndpoint = settings.thirdPartyEndpoint;
    }

    const res = await fetch('/api/gemini/verify-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text().catch(() => '');
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      return {
        status: 'error',
        lastChecked: Date.now(),
        latencyMs: Date.now() - startTime,
        model: settings.selectedModel,
        error: `Server endpoint returned non-JSON response (Status ${res.status}): ${responseText.slice(0, 100)}`,
      };
    }

    const roundTrip = Date.now() - startTime;

    if (res.ok && data.valid) {
      return {
        status: 'connected',
        lastChecked: Date.now(),
        latencyMs: data.latencyMs || roundTrip,
        model: data.model || settings.selectedModel,
        originalModel: data.originalModel,
        autoSwitched: data.autoSwitched,
        message: data.message || `Connected to ${data.model || settings.selectedModel} (${data.latencyMs || roundTrip}ms)`,
      };
    } else {
      return {
        status: 'error',
        lastChecked: Date.now(),
        latencyMs: roundTrip,
        model: settings.selectedModel,
        error: data.error || 'Connection failed. Please check the API key and selected model in Settings.',
      };
    }
  } catch (err: any) {
    return {
      status: 'error',
      lastChecked: Date.now(),
      latencyMs: Date.now() - startTime,
      model: settings.selectedModel,
      error: err?.message || 'Network error verifying model connection.',
    };
  }
}

export async function sendGeminiPrompt(
  prompt: string,
  history: Array<{ role: 'user' | 'model'; content: string }>,
  attachment: DocumentPageSnapshot | null,
  settings: ApiSettings
): Promise<GenerateResult> {
  // Format message sequence with strictly alternating roles (user -> model -> user -> model -> user)
  const formattedMessages: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }>;
  }> = [];

  // Add prior history with strict alternating roles
  let lastRole: 'user' | 'model' | null = null;
  for (const h of history.slice(-6)) {
    if (!h.content || h.content.trim().length === 0) continue;
    if (h.role !== lastRole) {
      formattedMessages.push({
        role: h.role,
        parts: [{ text: h.content.trim() }],
      });
      lastRole = h.role;
    }
  }

  // The active prompt MUST be a 'user' turn.
  // If the last added message was a 'user' turn, pop it so the active user turn follows a model turn.
  if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === 'user') {
    formattedMessages.pop();
  }

  // Active prompt parts
  const currentParts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }> = [];

  // If page snapshot attached, attach the base64 image and extracted text
  if (attachment) {
    // Clean base64 string (strip data:image/png;base64,)
    let cleanBase64 = attachment.imageUrl;
    let mimeType = 'image/png';
    if (cleanBase64.includes(',')) {
      const split = cleanBase64.split(',');
      const meta = split[0];
      cleanBase64 = split[1];
      const match = meta.match(/:(.*?);/);
      if (match) mimeType = match[1];
    }

    currentParts.push({
      inlineData: {
        mimeType,
        data: cleanBase64,
      },
    });

    let contextPrefix: string;
    if (attachment.isCropped) {
      contextPrefix = `[CROPPED DOCUMENT ATTACHMENT: "${attachment.documentName}" - PAGE ${attachment.pageNumber}]\nCRITICAL INSTRUCTION: The attached image is a user-selected CROPPED REGION of page ${attachment.pageNumber}. You MUST inspect and answer based ONLY on the visual content, diagrams, tables, formulas, and text directly visible INSIDE this cropped image. Do not reference or assume content from outside this crop.\n\nUser Question/Instruction:\n`;
    } else {
      contextPrefix = `[DOCUMENT CONTEXT ATTACHMENT: "${attachment.documentName}" - PAGE ${attachment.pageNumber}]\nExtracted Document Text:\n"""\n${attachment.extractedText.slice(0, 8000)}\n"""\n\nUser Question/Instruction:\n`;
    }

    currentParts.push({
      text: `${contextPrefix}${prompt}`,
    });
  } else {
    currentParts.push({
      text: prompt,
    });
  }

  formattedMessages.push({
    role: 'user',
    parts: currentParts,
  });

  // Verify chosen model can chat for Gemini mode, or preserve third-party model
  const effectiveModel =
    settings.mode === 'third_party'
      ? (settings.selectedModel || 'openai/gpt-4o-mini')
      : isModelChatCapable(settings.selectedModel)
      ? settings.selectedModel
      : 'gemini-flash-lite-latest';

  const payload: any = {
    model: effectiveModel,
    messages: formattedMessages,
    systemInstruction: settings.systemPrompt,
    temperature: settings.temperature,
  };

  if (settings.mode === 'custom_gemini' && settings.geminiApiKey) {
    payload.apiKey = settings.geminiApiKey;
  } else if (settings.mode === 'third_party') {
    payload.apiKey = settings.thirdPartyApiKey;
    payload.customEndpoint = settings.thirdPartyEndpoint;
  }

  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Server returned non-JSON response (Status ${res.status}): ${responseText.slice(0, 150)}`
    );
  }

  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate response from model.');
  }

  const usageMetadata = data.usageMetadata || {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  };

  const costUsd = calculateCost(
    data.model || settings.selectedModel,
    usageMetadata.promptTokenCount,
    usageMetadata.candidatesTokenCount
  );

  return {
    text: data.text || '',
    model: data.model || settings.selectedModel,
    latencyMs: data.latencyMs || 0,
    usageMetadata,
    costUsd,
  };
}
