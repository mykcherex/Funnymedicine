import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Settings,
  Key,
  Cpu,
  Layers,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Sliders,
  ShieldCheck,
  Server,
  Zap,
  Sparkles,
  Globe,
  Bot,
  Check,
  ExternalLink,
} from 'lucide-react';
import { ApiMode, ApiSettings, ConnectionStatus } from '../types';
import { SUPPORTED_MODELS, TIER_LIMITS, THIRD_PARTY_PROVIDERS, normalizeThirdPartyUrl } from '../constants/models';
import { verifyApiConnection } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ApiSettings;
  onSaveSettings: (newSettings: ApiSettings) => void;
  connectionStatus: ConnectionStatus;
  onUpdateConnectionStatus: (status: ConnectionStatus) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  connectionStatus,
  onUpdateConnectionStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'model' | 'api' | 'quota' | 'prompt'>('model');
  const [localSettings, setLocalSettings] = useState<ApiSettings>(settings);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showThirdPartyKey, setShowThirdPartyKey] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  // When API settings or selected model changes, automatically test/refresh connection
  const triggerAutoRefresh = (updated: ApiSettings) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    onUpdateConnectionStatus({ status: 'checking', message: 'Testing connection to selected model...' });
    setIsVerifying(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await verifyApiConnection(updated);
        onUpdateConnectionStatus(result);
      } catch (err: any) {
        onUpdateConnectionStatus({
          status: 'error',
          error: err?.message || 'Connection verification failed',
        });
      } finally {
        setIsVerifying(false);
      }
    }, 700); // 700ms debounce
  };

  const handleUpdate = (patch: Partial<ApiSettings>, shouldAutoRefresh: boolean = false) => {
    const updated = { ...localSettings, ...patch };
    setLocalSettings(updated);
    onSaveSettings(updated);

    if (shouldAutoRefresh) {
      triggerAutoRefresh(updated);
    }
  };

  const handleManualTestConnection = async () => {
    setIsVerifying(true);
    onUpdateConnectionStatus({ status: 'checking', message: 'Testing connection...' });
    try {
      const result = await verifyApiConnection(localSettings);
      onUpdateConnectionStatus(result);
      if (result.model && result.model !== localSettings.selectedModel) {
        setLocalSettings((prev) => ({ ...prev, selectedModel: result.model! }));
      }
    } catch (err: any) {
      onUpdateConnectionStatus({
        status: 'error',
        error: err?.message || 'Manual verification failed',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Model &amp; API Key Settings
              </h2>
              <p className="text-xs text-slate-400">
                Switch Gemini versions, configure custom API keys, and auto-refresh connection
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Auto-Refresh Connection Status Strip */}
        <div className="px-6 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Model Connection:</span>
            {isVerifying || connectionStatus.status === 'checking' ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Refreshing connection...
              </span>
            ) : connectionStatus.status === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Connected to {localSettings.selectedModel} ({connectionStatus.latencyMs || 120}ms)
              </span>
            ) : connectionStatus.status === 'error' ? (
              <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium truncate max-w-[360px]" title={connectionStatus.error}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {connectionStatus.error?.includes('Quota') || connectionStatus.error?.includes('quota')
                  ? 'Quota Limit Reached: Try Gemini 3.1 Flash Lite'
                  : connectionStatus.error || 'Connection Failed'}
              </span>
            ) : (
              <span className="text-slate-500">Idle</span>
            )}
          </div>

          <button
            onClick={handleManualTestConnection}
            disabled={isVerifying}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[11px] font-medium text-slate-300 hover:text-white rounded-md transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 flex gap-2 text-xs">
          <button
            onClick={() => setActiveTab('model')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'model'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Gemini Models
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'api'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            API Integration
          </button>
          <button
            onClick={() => setActiveTab('quota')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'quota'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Quota &amp; Budget
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'prompt'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Parameters &amp; Prompt
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: MODEL SETTINGS */}
          {activeTab === 'model' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    All Available Gemini Models ({SUPPORTED_MODELS.length})
                  </label>
                  <span className="text-[11px] text-slate-400">
                    🟢 Free Tier Models Available Without Paid Billing
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {SUPPORTED_MODELS.map((model) => {
                    const isSelected = localSettings.selectedModel === model.id;
                    return (
                      <div
                        key={model.id}
                        onClick={() => handleUpdate({ selectedModel: model.id }, true)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-950/50 border-indigo-500 shadow-md shadow-indigo-500/15 ring-1 ring-indigo-500/40'
                            : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">
                              {model.name}
                            </span>

                            {/* Free vs Paid Indicator */}
                            {model.isFree ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                FREE TIER
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                PAID KEY REQUIRED
                              </span>
                            )}

                            {model.isDefault && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                Default
                              </span>
                            )}

                            {model.supportsChat ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-500/30">
                                💬 Multi-turn Chat
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-950/40 text-amber-300/90 border border-amber-500/30">
                                ⚠️ Audio/Media Only
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/60">
                            {model.isFree ? (
                              <span className="text-emerald-400 font-semibold">Free Quota Included</span>
                            ) : (
                              <span className="text-amber-300 font-medium">${model.inputCostPer1M}/1M in • ${model.outputCostPer1M}/1M out</span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 mb-2 leading-relaxed">
                          {model.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                          <span className="text-indigo-300 font-mono">ID: {model.id}</span>
                          <span>•</span>
                          <span>Category: <strong className="text-slate-300">{model.category || 'General'}</strong></span>
                          <span>•</span>
                          <span>Context: {model.contextWindow}</span>
                          <span>•</span>
                          <span>Vision Multimodal: {model.supportsVision ? '✓ Yes' : '✕ No'}</span>
                          <span>•</span>
                          <span>Chat: <strong className={model.supportsChat ? 'text-emerald-300' : 'text-amber-300'}>{model.supportsChat ? '✓ Multi-turn' : 'Auto-routes to Flash Lite'}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Model ID Override */}
              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Or enter any custom Gemini model identifier:
                </label>
                <input
                  type="text"
                  placeholder="e.g. gemini-3.8-flash or custom-model-alias"
                  value={localSettings.selectedModel}
                  onChange={(e) => handleUpdate({ selectedModel: e.target.value }, true)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* TAB 2: API KEY & INTEGRATION */}
          {activeTab === 'api' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  API Key Authentication Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => handleUpdate({ mode: 'system' }, true)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      localSettings.mode === 'system'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-md shadow-indigo-500/10'
                        : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <Server className="w-3.5 h-3.5 text-indigo-400" />
                      Server Default Key
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Uses attached AI Studio secret environment
                    </p>
                  </button>

                  <button
                    onClick={() => handleUpdate({ mode: 'custom_gemini' }, true)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      localSettings.mode === 'custom_gemini'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-md shadow-indigo-500/10'
                        : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <Key className="w-3.5 h-3.5 text-indigo-400" />
                      Custom Gemini Key
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Use your own personal Google AI Studio key
                    </p>
                  </button>

                  <button
                    onClick={() => handleUpdate({ mode: 'third_party' }, true)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      localSettings.mode === 'third_party'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/50 shadow-md shadow-indigo-500/10'
                        : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <Globe className="w-3.5 h-3.5 text-indigo-400" />
                      Third-Party AI Service
                    </div>
                    <p className="text-[11px] text-slate-400">
                      OpenRouter, Groq, DeepSeek, OpenAI, etc.
                    </p>
                  </button>
                </div>
              </div>

              {/* Mode 1: Server Default */}
              {localSettings.mode === 'system' && (
                <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    AI Studio Secure Runtime Connected
                  </div>
                  <p className="text-xs text-slate-300">
                    Requests are authenticated through the server proxy using your configured AI Studio secrets. No API keys are exposed to the browser.
                  </p>
                </div>
              )}

              {/* Mode 2: Custom Gemini Key */}
              {localSettings.mode === 'custom_gemini' && (
                <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
                  <label className="block text-xs font-semibold text-slate-300">
                    Your Google AI Studio API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      placeholder="AIzaSy..."
                      value={localSettings.geminiApiKey}
                      onChange={(e) => handleUpdate({ geminiApiKey: e.target.value }, true)}
                      className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 py-2.5 pl-3 pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Key is securely stored in your local browser storage and relayed to the server proxy for model invocation. The connection automatically refreshes when you modify this key.
                  </p>
                </div>
              )}

              {/* Mode 3: Third-Party AI Service Provider & Model Selector Section */}
              {localSettings.mode === 'third_party' && (
                <div className="p-4 bg-slate-950/80 border border-indigo-500/50 rounded-2xl space-y-5 shadow-xl">
                  
                  {/* Step 1: Provider Presets */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-indigo-400" />
                        1. Select Third-Party AI Service Provider
                      </label>
                      <span className="text-[10px] text-indigo-300 font-mono">
                        1-Click Auto Configuration
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {THIRD_PARTY_PROVIDERS.map((provider) => {
                        const isSelected =
                          normalizeThirdPartyUrl(localSettings.thirdPartyEndpoint) ===
                          normalizeThirdPartyUrl(provider.baseUrl) ||
                          (provider.id === 'custom' &&
                            !THIRD_PARTY_PROVIDERS.slice(0, 5).some(
                              (p) =>
                                normalizeThirdPartyUrl(localSettings.thirdPartyEndpoint) ===
                                normalizeThirdPartyUrl(p.baseUrl)
                            ));

                        return (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              const newEndpoint = provider.baseUrl || localSettings.thirdPartyEndpoint;
                              const defaultModel = provider.popularModels[0]?.id || localSettings.selectedModel;
                              handleUpdate(
                                {
                                  mode: 'third_party',
                                  thirdPartyEndpoint: newEndpoint,
                                  selectedModel: defaultModel,
                                },
                                true
                              );
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all relative ${
                              isSelected
                                ? 'bg-indigo-900/60 border-indigo-400 text-white ring-1 ring-indigo-400/50 shadow-md'
                                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold text-xs mb-1">
                              <span>{provider.name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                              {provider.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Popular Models for Selected Provider */}
                  {(() => {
                    const matchedProvider = THIRD_PARTY_PROVIDERS.find(
                      (p) =>
                        normalizeThirdPartyUrl(localSettings.thirdPartyEndpoint) ===
                        normalizeThirdPartyUrl(p.baseUrl)
                    ) || THIRD_PARTY_PROVIDERS[0];

                    return (
                      <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                        <label className="block text-xs font-bold text-slate-300">
                          2. Select Model for {matchedProvider.name}
                        </label>

                        <div className="flex flex-wrap gap-1.5">
                          {matchedProvider.popularModels.map((m) => {
                            const isModelActive = localSettings.selectedModel === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleUpdate({ selectedModel: m.id }, true)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 ${
                                  isModelActive
                                    ? 'bg-indigo-600 text-white font-bold shadow-sm ring-1 ring-indigo-300/50'
                                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                                }`}
                                title={m.description}
                              >
                                {isModelActive && <Check className="w-3 h-3 text-emerald-300" />}
                                <span>{m.name}</span>
                                <span className="text-[10px] opacity-75 font-normal">({m.id})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 3: API Key & Custom Base URL Configuration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        3. Third-Party API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showThirdPartyKey ? 'text' : 'password'}
                          placeholder="e.g. sk-or-v1-..."
                          value={localSettings.thirdPartyApiKey}
                          onChange={(e) => handleUpdate({ thirdPartyApiKey: e.target.value }, true)}
                          className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 py-2 pl-3 pr-9 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowThirdPartyKey(!showThirdPartyKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {showThirdPartyKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Relayed securely through backend proxy to your external AI service.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        4. API Base URL (Endpoint)
                      </label>
                      <input
                        type="text"
                        placeholder="https://openrouter.ai/api/v1"
                        value={localSettings.thirdPartyEndpoint}
                        onChange={(e) => handleUpdate({ thirdPartyEndpoint: e.target.value }, true)}
                        className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                      {localSettings.thirdPartyEndpoint && (
                        <p className="text-[10px] text-indigo-300 mt-1 font-mono truncate">
                          Target: {normalizeThirdPartyUrl(localSettings.thirdPartyEndpoint)}/chat/completions
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 4: Custom Model ID Override */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      5. Active Model Identifier
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. openai/gpt-4o-mini or deepseek/deepseek-r1"
                      value={localSettings.selectedModel}
                      onChange={(e) => handleUpdate({ selectedModel: e.target.value }, true)}
                      className="w-full bg-slate-900 border border-slate-700 text-xs text-white py-2 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold"
                    />
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 3: QUOTA & BUDGET */}
          {activeTab === 'quota' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Select Rate Quota Tier
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['free', 'pay_as_you_go', 'custom'] as const).map((tierKey) => {
                    const tier = TIER_LIMITS[tierKey];
                    const isSelected = localSettings.quotaTier === tierKey;
                    return (
                      <div
                        key={tierKey}
                        onClick={() => handleUpdate({ quotaTier: tierKey })}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-950/40 text-white'
                            : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs mb-1 text-slate-200">{tier.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {tier.rpm} RPM • {(tier.tpm / 1000000).toFixed(1)}M TPM • {tier.rpd.toLocaleString()} RPD
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Token Budget Limit
                  </label>
                  <input
                    type="number"
                    value={localSettings.customTokenBudget}
                    onChange={(e) => handleUpdate({ customTokenBudget: parseInt(e.target.value) || 100000 })}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">e.g. 500,000 tokens</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Estimated Spend Budget ($)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={localSettings.customCostBudget}
                    onChange={(e) => handleUpdate({ customCostBudget: parseFloat(e.target.value) || 1.0 })}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 py-2 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">e.g. $5.00 limit</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PARAMETERS & PROMPT */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              {/* General Default Prompt for Every Message / Share */}
              <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    General Prompt (Default for Every Message & One-Touch Share)
                  </label>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                    Auto-Applied
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={localSettings.generalPrompt || ''}
                  onChange={(e) => handleUpdate({ generalPrompt: e.target.value })}
                  placeholder="e.g. Analyze this document page in thorough detail. Extract all key metrics, summarize the main points, highlight tables, and identify critical insights."
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-100 p-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans placeholder:text-slate-500"
                />
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  💡 This prompt is automatically used when you click the <strong>One-Touch Share Point Button</strong> in the document reader, sending the document snapshot to Gemini in one tap without needing to touch the chat screen again. It is also used as the default inquiry template.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Temperature ({localSettings.temperature})
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {localSettings.temperature <= 0.3 ? 'Deterministic / Precise' : localSettings.temperature <= 0.8 ? 'Balanced' : 'Creative'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={localSettings.temperature}
                  onChange={(e) => handleUpdate({ temperature: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  System Instructions
                </label>
                <textarea
                  rows={4}
                  value={localSettings.systemPrompt}
                  onChange={(e) => handleUpdate({ systemPrompt: e.target.value })}
                  placeholder="Enter system prompt for Gemini..."
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
                />
                <span className="text-[10px] text-slate-500">
                  Defines the behavior, persona, and citation standards for document analysis.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Settings automatically saved to browser storage</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
