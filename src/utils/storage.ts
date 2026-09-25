import { ApiSettings, ChatMessage, RateQuotaStats, TokenUsageRecord } from '../types';
import { calculateCost, TIER_LIMITS } from '../constants/models';

const SETTINGS_KEY = 'docugemini_settings_v1';
const USAGE_KEY = 'docugemini_usage_records_v1';
const MESSAGES_KEY = 'docugemini_chat_messages_v1';

export const DEFAULT_SETTINGS: ApiSettings = {
  mode: 'system',
  geminiApiKey: '',
  thirdPartyApiKey: '',
  thirdPartyEndpoint: 'https://api.openai.com/v1',
  selectedModel: 'gemini-flash-lite-latest',
  temperature: 0.7,
  systemPrompt:
    'You are an elite document intelligence analyst and research expert. When provided with document page screenshots and extracted text, provide comprehensive, factual, structured, and insightful analysis. Point out key tables, data points, caveats, and summarize clearly. Format your answers with clear markdown headings, tables, bullet points, and citations referencing the document page.',
  generalPrompt:
    'Analyze this document page in thorough detail. Extract all key metrics, summarize the main points, highlight tables, and identify critical insights.',
  quotaTier: 'free',
  customTokenBudget: 500000,
  customCostBudget: 5.0,
};

export function getStoredSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to load settings from storage', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: ApiSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings to storage', e);
  }
}

export function getStoredUsageRecords(): TokenUsageRecord[] {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load usage records from storage', e);
  }
  return [];
}

export function addUsageRecord(record: TokenUsageRecord): TokenUsageRecord[] {
  try {
    const records = getStoredUsageRecords();
    const updated = [record, ...records].slice(0, 300); // keep last 300
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(updated));
    } catch {
      // Quota exceeded: trim older records aggressively to 50
      const trimmed = updated.slice(0, 50);
      localStorage.setItem(USAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    }
    return updated;
  } catch (e) {
    console.warn('Failed to save usage record', e);
    return [];
  }
}

export function clearStoredUsageRecords(): void {
  try {
    localStorage.removeItem(USAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear usage records', e);
  }
}

/**
 * Sanitize chat message objects for localStorage:
 * LocalStorage has a strict 5MB quota limit. Large base64 snapshot images (>10KB)
 * are excluded from localStorage (they are stored safely in IndexedDB and in-memory state).
 */
function sanitizeMessagesForLocalStorage(messages: ChatMessage[]): any[] {
  return messages.slice(-30).map((msg) => {
    let sanitizedAttachment = undefined;
    if (msg.attachment) {
      sanitizedAttachment = {
        pageNumber: msg.attachment.pageNumber,
        documentName: msg.attachment.documentName,
        extractedTextPreview: msg.attachment.extractedTextPreview,
        // Only preserve imageUrl if it is very small (< 4KB thumbnail); exclude heavy base64 payloads
        imageUrl:
          msg.attachment.imageUrl && msg.attachment.imageUrl.length < 4096
            ? msg.attachment.imageUrl
            : undefined,
      };
    }

    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      attachment: sanitizedAttachment,
      tokenUsage: msg.tokenUsage,
      latencyMs: msg.latencyMs,
      model: msg.model,
      cost: msg.cost,
      error: msg.error,
    };
  });
}

/**
 * Retrieve messages from localStorage with auto-cleanup of legacy bloated payloads.
 */
export function getStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (raw) {
      // If legacy payload is bloated (> 150KB), clean it up immediately
      if (raw.length > 150000) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = sanitizeMessagesForLocalStorage(parsed);
          try {
            localStorage.setItem(MESSAGES_KEY, JSON.stringify(sanitized));
          } catch {
            localStorage.removeItem(MESSAGES_KEY);
          }
          return sanitized;
        }
      }
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load chat messages from storage, resetting key', e);
    try {
      localStorage.removeItem(MESSAGES_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

/**
 * Save chat messages to localStorage with quota protection and fallback eviction.
 */
export function saveStoredMessages(messages: ChatMessage[]): void {
  try {
    const sanitized = sanitizeMessagesForLocalStorage(messages);
    const serialized = JSON.stringify(sanitized);

    try {
      localStorage.setItem(MESSAGES_KEY, serialized);
    } catch (quotaError) {
      console.warn('Storage quota exceeded on primary write, attempting graceful eviction');

      // Attempt 1: Strip all attachments and keep only the latest 15 messages
      try {
        const minimal = sanitized.slice(-15).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          model: m.model,
          latencyMs: m.latencyMs,
          cost: m.cost,
        }));
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(minimal));
        return;
      } catch {
        // Attempt 2: Trim usage records if needed
        try {
          const usageRecords = getStoredUsageRecords();
          if (usageRecords.length > 30) {
            localStorage.setItem(USAGE_KEY, JSON.stringify(usageRecords.slice(0, 30)));
          }
          // Attempt minimal save again
          const mini = sanitized.slice(-5).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }));
          localStorage.setItem(MESSAGES_KEY, JSON.stringify(mini));
          return;
        } catch {
          // Attempt 3: If still overflowing, clear the messages key so other storage survives
          localStorage.removeItem(MESSAGES_KEY);
        }
      }
    }
  } catch (e) {
    console.warn('Non-fatal warning while saving messages to localStorage:', e);
  }
}

export function clearStoredMessages(): void {
  try {
    localStorage.removeItem(MESSAGES_KEY);
  } catch (e) {
    console.warn('Failed to clear messages from localStorage', e);
  }
}

/**
 * Calculate rolling minute, daily, and cumulative quota metrics
 */
export function calculateRateQuotaStats(
  records: TokenUsageRecord[],
  tier: 'free' | 'pay_as_you_go' | 'custom' = 'free'
): RateQuotaStats {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayTimestamp = startOfToday.getTime();

  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

  let requestsThisMinute = 0;
  let tokensThisMinute = 0;
  let requestsToday = 0;
  let cumulativePromptTokens = 0;
  let cumulativeCandidateTokens = 0;
  let cumulativeTotalTokens = 0;
  let cumulativeCostUsd = 0;

  for (const r of records) {
    cumulativePromptTokens += r.promptTokens || 0;
    cumulativeCandidateTokens += r.candidateTokens || 0;
    cumulativeTotalTokens += r.totalTokens || 0;
    cumulativeCostUsd += r.costUsd || 0;

    if (r.timestamp >= oneMinuteAgo) {
      requestsThisMinute += 1;
      tokensThisMinute += r.totalTokens || 0;
    }

    if (r.timestamp >= todayTimestamp) {
      requestsToday += 1;
    }
  }

  return {
    requestsThisMinute,
    rpmLimit: limits.rpm,
    tokensThisMinute,
    tpmLimit: limits.tpm,
    requestsToday,
    rpdLimit: limits.rpd,
    cumulativePromptTokens,
    cumulativeCandidateTokens,
    cumulativeTotalTokens,
    cumulativeCostUsd,
    totalCalls: records.length,
  };
}
