import { ModelConfig } from '../types';

export const SUPPORTED_MODELS: ModelConfig[] = [
  // 1. FREE TIER MODELS (Available with free Google AI Studio tier)
  {
    id: 'gemini-flash-lite-latest',
    name: 'Gemini Flash Lite (Latest)',
    description: 'Active production release of Gemini Flash Lite. Optimal uptime, high rate limits, and sub-second multi-turn document vision.',
    isDefault: true,
    isFree: true,
    inputCostPer1M: 0.0375,
    outputCostPer1M: 0.15,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'General & Multimodal',
    recommendedFor: 'Document Q&A, rapid page scanning, multi-turn chat, entity extraction.',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    description: 'Highly responsive multimodal model with excellent speed and document visual parsing.',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.0375,
    outputCostPer1M: 0.15,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'General & Multimodal',
    recommendedFor: 'High throughput page inspection and rapid answers.',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'High-capability multimodal reasoning model with hybrid reasoning control.',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'General & Multimodal',
    recommendedFor: 'Complex document understanding, table analysis, cross-page synthesis.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    description: 'Ultra-low latency, generous rate limits, cost-free on standard tier. Highly recommended for multi-turn document intelligence and continuous page inspection.',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.0375,
    outputCostPer1M: 0.15,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'General & Multimodal',
    recommendedFor: 'Document Q&A, rapid page scanning, multi-turn chat, entity extraction.',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    description: 'Next-gen flagship multimodal model. Ultra-fast, deep document reasoning, diagram comprehension, and multi-turn conversation.',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'General & Multimodal',
    recommendedFor: 'Document summaries, rapid Q&A, diagram inspection, page synthesis.',
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    description: 'Always points to the latest stable production release of the Gemini Flash model family with full multi-turn conversational support.',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'General & Multimodal',
    recommendedFor: 'Reliable general-purpose document chat and multi-page evaluation.',
  },
  {
    id: 'gemini-3.5-transcribe',
    name: 'Gemini 3.5 Transcribe',
    description: 'Specialized single-purpose model for audio transcription and speech-to-text. (Note: Does not support multi-turn document chat; chat requests automatically route to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.20,
    contextWindow: '1M tokens',
    supportsVision: false,
    supportsChat: false,
    category: 'Audio & Speech',
    recommendedFor: 'Transcribing recorded audio, webinar notes, lecture summaries.',
  },
  {
    id: 'gemini-3.8-flash-lite-tts',
    name: 'Gemini 3.8 Flash Lite TTS',
    description: 'Specialized single-purpose text-to-speech engine for reading documents aloud. (Note: Does not support multi-turn document chat; chat requests automatically route to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.20,
    contextWindow: '1M tokens',
    supportsVision: false,
    supportsChat: false,
    category: 'Audio & Speech',
    recommendedFor: 'Reading aloud contracts, document narration, voice synthesis.',
  },
  {
    id: 'gemini-3.8-flash-tts',
    name: 'Gemini 3.8 Flash TTS',
    description: 'Expressive voice design model for character personas and audio podcasts. (Note: Does not support multi-turn document chat; chat requests automatically route to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    contextWindow: '1M tokens',
    supportsVision: false,
    supportsChat: false,
    category: 'Audio & Speech',
    recommendedFor: 'Podcast script reading, human-like voice synthesis, dialogue.',
  },
  {
    id: 'gemini-3.8-live',
    name: 'Gemini 3.8 Live',
    description: 'Low-latency real-time bidirectional streaming model (requires WebSocket Live API). (Note: Document chat automatically routes to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: false,
    category: 'Realtime Live',
    recommendedFor: 'Live interactive Q&A sessions, hands-free voice guidance.',
  },
  {
    id: 'gemini-3.8-live-extended-thinking',
    name: 'Gemini 3.8 Live Extended Thinking',
    description: 'Real-time live model coupled with extended reasoning (requires WebSocket Live API). (Note: Document chat automatically routes to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: false,
    category: 'Realtime Live',
    recommendedFor: 'Deep step-by-step vocal explanations, live tutoring.',
  },
  {
    id: 'gemini-3.5-transcribe-live',
    name: 'Gemini 3.5 Transcribe Live',
    description: 'Live real-time stream speech translation and continuous audio transcription via WebSocket. (Note: Chat routes to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: true,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    contextWindow: '1M tokens',
    supportsVision: false,
    supportsChat: false,
    category: 'Realtime Live',
    recommendedFor: 'Real-time translation, live closed-captioning of calls.',
  },

  // 2. PAID / ADVANCED MODELS (Require Paid AI Studio Tier / Billing Enabled)
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    description: 'Google’s flagship model for complex reasoning, multi-step math, deep financial audits, and multi-turn technical breakdown.',
    isDefault: false,
    isFree: false,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00,
    contextWindow: '2M tokens',
    supportsVision: true,
    supportsChat: true,
    category: 'Reasoning & STEM',
    recommendedFor: 'In-depth financial auditing, legal contract breakdown, complex math formulas.',
  },
  {
    id: 'gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image (Nano Banana 2)',
    description: 'Specialized visual image generation model supporting up to 4K resolutions. (Note: Does not support multi-turn document chat; chat routes to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: false,
    inputCostPer1M: 0.20,
    outputCostPer1M: 0.80,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: false,
    category: 'Image & Media',
    recommendedFor: 'Generating high-res visual diagrams, charts, and image enhancements.',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Gemini 3.1 Flash Lite Image (Nano Banana)',
    description: 'Fast image generation model for rapid graphic prototyping. (Note: Does not support multi-turn document chat; chat routes to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: false,
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: false,
    category: 'Image & Media',
    recommendedFor: 'Quick visual previews, thumbnail illustration generation.',
  },
  {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro Image (Nano Banana Pro)',
    description: 'Flagship studio-grade image synthesis model. (Note: Does not support multi-turn document chat; chat routes to Gemini 3.1 Flash Lite).',
    isDefault: false,
    isFree: false,
    inputCostPer1M: 0.50,
    outputCostPer1M: 2.00,
    contextWindow: '1M tokens',
    supportsVision: true,
    supportsChat: false,
    category: 'Image & Media',
    recommendedFor: 'Commercial asset generation, complex technical diagrams with readable typography.',
  },
];

export interface ThirdPartyModelPreset {
  id: string;
  name: string;
  description: string;
}

export interface ThirdPartyProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  description: string;
  popularModels: ThirdPartyModelPreset[];
}

export const THIRD_PARTY_PROVIDERS: ThirdPartyProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter AI',
    baseUrl: 'https://openrouter.ai/api/v1',
    description: 'Unified API for 200+ top models (GPT-4o, Claude 3.5, Llama 3.3, DeepSeek R1).',
    popularModels: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast, highly intelligent OpenAI model on OpenRouter' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Top-tier document reasoning and vision by Anthropic' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Meta open-weights flagship instruct model' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', description: 'Chain-of-thought reasoning model by DeepSeek' },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (OpenRouter)', description: 'Fast Google Flash model routed via OpenRouter' },
      { id: 'mistralai/mistral-large-2411', name: 'Mistral Large 2411', description: 'Flagship multilingual reasoning by Mistral' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    baseUrl: 'https://api.groq.com/openai/v1',
    description: 'Ultra-fast LPU inference engine running Llama 3.3 and DeepSeek at 500+ tok/s.',
    popularModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', description: 'Full 70B Llama model running on Groq LPUs' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', description: 'Sub-100ms ultra-fast response speed' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (32k)', description: 'High context Mixture-of-Experts model' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', description: 'DeepSeek R1 reasoning distilled into Llama 70B' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Direct',
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'Official direct DeepSeek platform API for DeepSeek V3 and DeepSeek R1.',
    popularModels: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', description: 'Official general conversational flagship' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', description: 'Official chain-of-thought DeepSeek reasoning engine' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI Platform',
    baseUrl: 'https://api.openai.com/v1',
    description: 'Direct connection to official OpenAI API keys and endpoints.',
    popularModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'High-speed cost-effective multimodal OpenAI model' },
      { id: 'gpt-4o', name: 'GPT-4o Flagship', description: 'Flagship OpenAI multimodal intelligence model' },
      { id: 'o3-mini', name: 'OpenAI o3-mini', description: 'High reasoning efficiency model' },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    description: 'Fast open-source model platform hosting Llama 3.3, Qwen, and DeepSeek.',
    popularModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', description: 'Optimized Meta Llama 3.3 on Together' },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', description: 'Full DeepSeek R1 on Together AI' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', description: 'Alibaba Qwen flagship open model' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Endpoint',
    baseUrl: '',
    description: 'Any OpenAI-compatible server URL (Ollama, LM Studio, LocalAI, vLLM, custom proxy).',
    popularModels: [
      { id: 'gpt-3.5-turbo', name: 'Custom Model ID', description: 'Type any model name configured on your server' },
    ],
  },
];

export function normalizeThirdPartyUrl(rawUrl: string): string {
  let url = rawUrl ? rawUrl.trim() : '';
  if (!url) return '';
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, '');

  // Specific domain corrections if the user entered raw domain without API path
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

export const CHAT_CAPABLE_MODELS = SUPPORTED_MODELS.filter((m) => m.supportsChat);

export function isModelChatCapable(modelId: string): boolean {
  const found = SUPPORTED_MODELS.find((m) => m.id === modelId);
  return found ? Boolean(found.supportsChat) : true;
}

export const TIER_LIMITS = {
  free: {
    name: 'Gemini Free Tier',
    rpm: 15,
    tpm: 1_000_000,
    rpd: 1_500,
  },
  pay_as_you_go: {
    name: 'Pay-as-you-go Tier',
    rpm: 1_000,
    tpm: 4_000_000,
    rpd: 50_000,
  },
  custom: {
    name: 'Custom Budget Plan',
    rpm: 30,
    tpm: 2_000_000,
    rpd: 5_000,
  },
};

export function calculateCost(modelId: string, promptTokens: number, candidateTokens: number): number {
  const model = SUPPORTED_MODELS.find(m => m.id === modelId) || SUPPORTED_MODELS[0];
  const promptCost = (promptTokens / 1_000_000) * model.inputCostPer1M;
  const candidateCost = (candidateTokens / 1_000_000) * model.outputCostPer1M;
  return promptCost + candidateCost;
}
