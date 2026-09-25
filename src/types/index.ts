export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
  isFree?: boolean; // Whether available on Gemini Free Tier without paid billing
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: string;
  supportsVision: boolean;
  supportsChat?: boolean; // Whether this model supports multi-turn conversational chat
  recommendedFor: string;
  category?: 'General & Multimodal' | 'Reasoning & STEM' | 'Image & Media' | 'Audio & Speech' | 'Realtime Live';
}

export type ApiMode = 'system' | 'custom_gemini' | 'third_party';

export interface ApiSettings {
  mode: ApiMode;
  geminiApiKey: string;
  thirdPartyApiKey: string;
  thirdPartyEndpoint: string;
  selectedModel: string;
  temperature: number;
  systemPrompt: string;
  generalPrompt: string; // Global default prompt automatically appended or used when sharing/sending
  quotaTier: 'free' | 'pay_as_you_go' | 'custom';
  customTokenBudget: number;
  customCostBudget: number;
}

export interface ConnectionStatus {
  status: 'idle' | 'checking' | 'connected' | 'error';
  lastChecked?: number;
  latencyMs?: number;
  message?: string;
  model?: string;
  originalModel?: string;
  autoSwitched?: boolean;
  error?: string;
}

export interface DocumentPageSnapshot {
  pageNumber: number;
  imageUrl: string; // Base64 Data URL
  extractedText: string;
  documentName: string;
  width: number;
  height: number;
  timestamp: number;
  isCropped?: boolean;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: 'pdf' | 'text' | 'sample';
  fileSize: string;
  totalPages: number;
  dataUrl?: string; // For PDF
  rawText?: string; // For text/markdown
  pagesText?: string[]; // Array of text per page
  previewDescription?: string;
  naturalWidth?: number; // Unscaled base width
  naturalHeight?: number; // Unscaled base height
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  attachment?: {
    pageNumber?: number;
    documentName: string;
    imageUrl?: string;
    extractedTextPreview?: string;
    isCropped?: boolean;
  };
  tokenUsage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  latencyMs?: number;
  model?: string;
  cost?: number;
  error?: boolean;
}

export interface TokenUsageRecord {
  id: string;
  timestamp: number;
  model: string;
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd: number;
  documentName?: string;
  pageNumber?: number;
}

export interface RateQuotaStats {
  requestsThisMinute: number;
  rpmLimit: number;
  tokensThisMinute: number;
  tpmLimit: number;
  requestsToday: number;
  rpdLimit: number;
  cumulativePromptTokens: number;
  cumulativeCandidateTokens: number;
  cumulativeTotalTokens: number;
  cumulativeCostUsd: number;
  totalCalls: number;
}
