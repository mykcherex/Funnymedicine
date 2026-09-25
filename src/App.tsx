/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DocumentReader } from './components/DocumentReader';
import { ChatSpace } from './components/ChatSpace';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import {
  ApiSettings,
  ChatMessage,
  ConnectionStatus,
  DocumentPageSnapshot,
  RateQuotaStats,
  TokenUsageRecord,
} from './types';
import {
  addUsageRecord,
  calculateRateQuotaStats,
  clearStoredUsageRecords,
  clearStoredMessages,
  getStoredMessages,
  getStoredSettings,
  getStoredUsageRecords,
  saveStoredMessages,
  saveStoredSettings,
} from './utils/storage';
import {
  clearMessagesFromIdb,
  loadMessagesFromIdb,
  saveMessagesToIdb,
} from './utils/indexedDb';
import { sendGeminiPrompt, verifyApiConnection } from './services/geminiService';
import { Activity, Sliders, Split, Sparkles, FileText, Bot, ChevronDown, FolderDown, Globe } from 'lucide-react';
import { SUPPORTED_MODELS, THIRD_PARTY_PROVIDERS } from './constants/models';

export default function App() {
  const [settings, setSettings] = useState<ApiSettings>(getStoredSettings());
  const [records, setRecords] = useState<TokenUsageRecord[]>(getStoredUsageRecords());
  const [messages, setMessages] = useState<ChatMessage[]>(getStoredMessages());
  const [activeAttachment, setActiveAttachment] = useState<DocumentPageSnapshot | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [splitRatio, setSplitRatio] = useState<number>(50); // percentage for left half
  const [mobileTab, setMobileTab] = useState<'doc' | 'split' | 'chat'>('split');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'checking',
    message: 'Testing connection to active model...',
  });

  // Calculate live rate quota stats
  const stats: RateQuotaStats = calculateRateQuotaStats(records, settings.quotaTier);

  // Initial connection test on startup - automatically sets to a working model if rate-limited
  useEffect(() => {
    let isCancelled = false;
    const checkInitialConnection = async () => {
      try {
        const result = await verifyApiConnection(settings);
        if (!isCancelled) {
          setConnectionStatus(result);
          // If model was automatically switched to a working model, persist it in settings
          if (result.model && result.model !== settings.selectedModel) {
            const updated = { ...settings, selectedModel: result.model };
            setSettings(updated);
            saveStoredSettings(updated);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setConnectionStatus({
            status: 'error',
            error: err?.message || 'Failed to verify model connection',
          });
        }
      }
    };
    checkInitialConnection();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Load rich messages from IndexedDB if available
  useEffect(() => {
    let isCancelled = false;
    loadMessagesFromIdb()
      .then((idbMessages) => {
        if (!isCancelled && idbMessages && idbMessages.length > 0) {
          setMessages(idbMessages);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, []);

  // Sync messages to storage: IndexedDB for high-capacity persistence, localStorage with quota protection for fast sync
  useEffect(() => {
    saveStoredMessages(messages);
    saveMessagesToIdb(messages).catch(() => {});
  }, [messages]);

  // Handle sharing document screen directly into the Gemini prompt with one-touch instant send
  const handleShareToPrompt = (
    snapshot: DocumentPageSnapshot,
    initialQuery?: string
  ) => {
    setActiveAttachment(snapshot);

    // On mobile, automatically navigate to chat or split so the user sees the incoming response
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (mobileTab === 'doc') {
        setMobileTab('chat');
      }
    }

    // One-touch execution: automatically send immediately with general prompt or query
    const defaultCropPrompt = `Analyze the content strictly within this cropped selection from ${snapshot.documentName} (Page ${snapshot.pageNumber}). Extract all visible data, tables, or text and explain its significance.`;
    const defaultPagePrompt =
      settings.generalPrompt ||
      `Please analyze and inspect the attached document page (${snapshot.documentName} - Page ${snapshot.pageNumber}) in detail. Summarize key findings, figures, and structural points.`;

    const promptToSend =
      initialQuery || (snapshot.isCropped ? defaultCropPrompt : defaultPagePrompt);

    handleSendMessage(promptToSend, snapshot);
  };

  // Dispatch prompt to Gemini API
  const handleSendMessage = async (
    promptText: string,
    attachment: DocumentPageSnapshot | null
  ) => {
    if (isGenerating) return;

    const userMessageId = `msg-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
      attachment: attachment
        ? {
            pageNumber: attachment.pageNumber,
            documentName: attachment.documentName,
            imageUrl: attachment.imageUrl,
            extractedTextPreview: attachment.extractedText.slice(0, 150),
            isCropped: attachment.isCropped,
          }
        : undefined,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setActiveAttachment(null); // Clear active attachment once dispatched
    setIsGenerating(true);

    try {
      // Format chat history for context, strictly excluding errors and empty turns
      const historyPayload = messages
        .filter((m) => !m.error && m.content && m.content.trim().length > 0)
        .map((m) => ({
          role: m.role as 'user' | 'model',
          content: m.content,
        }));

      const result = await sendGeminiPrompt(
        promptText,
        historyPayload,
        attachment,
        settings
      );

      // Model reply message
      const modelMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'model',
        content: result.text,
        timestamp: Date.now(),
        tokenUsage: result.usageMetadata,
        latencyMs: result.latencyMs,
        model: result.model,
        cost: result.costUsd,
      };

      setMessages((prev) => [...prev, modelMsg]);

      // Record token usage for telemetry & quota dashboard
      const usageRecord: TokenUsageRecord = {
        id: `rec-${Date.now()}`,
        timestamp: Date.now(),
        model: result.model,
        promptTokens: result.usageMetadata.promptTokenCount,
        candidateTokens: result.usageMetadata.candidatesTokenCount,
        totalTokens: result.usageMetadata.totalTokenCount,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        documentName: attachment?.documentName,
        pageNumber: attachment?.pageNumber,
      };

      const updatedRecords = addUsageRecord(usageRecord);
      setRecords(updatedRecords);

      // Also ensure connection status reflects success and automatically sync to the working model
      setConnectionStatus({
        status: 'connected',
        latencyMs: result.latencyMs,
        model: result.model,
      });

      if (result.model && result.model !== settings.selectedModel) {
        const updated = { ...settings, selectedModel: result.model };
        setSettings(updated);
        saveStoredSettings(updated);
      }
    } catch (err: any) {
      console.error('Gemini prompt dispatch error:', err);
      const rawError = err?.message || 'Unknown network or API error';
      let friendlyError = rawError;

      if (rawError.includes('Multiturn chat is not enabled')) {
        friendlyError = `Multiturn chat is not enabled for model "${settings.selectedModel}". This is a specialized single-purpose audio/TTS engine. Active model has been automatically switched to Gemini Flash Lite (Latest).`;
        const updated = { ...settings, selectedModel: 'gemini-flash-lite-latest' };
        setSettings(updated);
        saveStoredSettings(updated);
      }

      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'model',
        content: `Error generating response: ${friendlyError}. Please verify your API Key and active model in Settings.`,
        timestamp: Date.now(),
        error: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSettings = (newSettings: ApiSettings) => {
    setSettings(newSettings);
    saveStoredSettings(newSettings);
  };

  const handleClearRecords = () => {
    clearStoredUsageRecords();
    setRecords([]);
  };

  const handleClearMessages = () => {
    setMessages([]);
    clearStoredMessages();
    clearMessagesFromIdb();
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Global Navigation Bar */}
      <header className="h-12 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 select-none z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight">
              DocuGemini
            </span>
          </div>
          <span className="hidden md:inline px-2 py-0.5 bg-slate-800 rounded text-[10px] font-medium text-slate-400 border border-slate-700">
            Document Reader &amp; Multimodal AI
          </span>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2">
          {/* Real-time Token Analytics Quick Pill */}
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/80 hover:border-indigo-500/50 text-xs text-slate-200 transition-colors font-mono"
            title="View Real-Time Token Quota & Analytics Dashboard"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold text-white">
              {stats.cumulativeTotalTokens.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              tokens • ${stats.cumulativeCostUsd.toFixed(4)}
            </span>
          </button>

          {/* Active Mode Indicator & Quick Model Selector Dropdown */}
          <div className="relative hidden sm:flex items-center gap-1.5">
            {settings.mode === 'third_party' ? (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-500/50 rounded-lg text-xs font-semibold shadow-sm transition-all"
                title="Third-Party AI Service is active. Click to open Third-Party Settings."
              >
                <Globe className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span className="font-bold text-white max-w-[150px] truncate">
                  {settings.selectedModel}
                </span>
                <span className="px-1 py-0.2 rounded bg-indigo-800/80 text-[9px] text-indigo-100 font-mono">
                  3rd-Party
                </span>
              </button>
            ) : (
              <div className="relative">
                <select
                  value={settings.selectedModel}
                  onChange={(e) => {
                    const newModel = e.target.value;
                    const updated = { ...settings, selectedModel: newModel };
                    setSettings(updated);
                    saveStoredSettings(updated);
                    setConnectionStatus({ status: 'checking', message: `Connecting to ${newModel}...` });
                    verifyApiConnection(updated)
                      .then((res) => setConnectionStatus(res))
                      .catch((err) =>
                        setConnectionStatus({
                          status: 'error',
                          error: err?.message || 'Connection failed',
                        })
                      );
                  }}
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 py-1 pl-7 pr-6 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[210px] truncate"
                  title="Quickly switch between all available Gemini models"
                >
                  <optgroup label="Google Gemini Models">
                    {SUPPORTED_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.isFree ? '🟢 [FREE] ' : '🔒 [PAID] '} {m.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <Bot className="w-3.5 h-3.5 text-violet-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Settings Trigger */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Configure Models, API Keys & Quota"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile View Switcher Tab Bar */}
      <div className="md:hidden flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0 gap-2">
        <div className="flex bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/70 flex-1 text-xs">
          <button
            onClick={() => setMobileTab('doc')}
            className={`flex-1 py-1 px-2 rounded-md flex items-center justify-center gap-1.5 transition-all ${
              mobileTab === 'doc'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Doc</span>
          </button>
          <button
            onClick={() => setMobileTab('split')}
            className={`flex-1 py-1 px-2 rounded-md flex items-center justify-center gap-1.5 transition-all ${
              mobileTab === 'split'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Split className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex-1 py-1 px-2 rounded-md flex items-center justify-center gap-1.5 transition-all ${
              mobileTab === 'chat'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Chat</span>
            {messages.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            )}
          </button>
        </div>
      </div>

      {/* Main Two-Part Split Screen Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Half: Document / PDF Reading Part */}
        <div
          className={`overflow-hidden transition-all duration-75 ${
            mobileTab === 'chat' ? 'hidden md:block' : ''
          } ${
            mobileTab === 'doc' ? 'h-full md:h-full' : 'h-1/2 md:h-full'
          }`}
          style={{ width: `${typeof window !== 'undefined' && window.innerWidth >= 768 ? splitRatio : 100}%` }}
        >
          <DocumentReader
            onShareToPrompt={handleShareToPrompt}
            activeAttachedPage={activeAttachment?.pageNumber ?? null}
          />
        </div>

        {/* Desktop Split Divider */}
        <div className="hidden md:flex w-1 bg-slate-800 hover:bg-indigo-600 transition-colors cursor-col-resize items-center justify-center shrink-0 group">
          <div className="w-4 h-8 rounded-full bg-slate-800 border border-slate-700 group-hover:bg-indigo-600 group-hover:border-indigo-400 flex items-center justify-center text-[10px] text-slate-400 group-hover:text-white shadow">
            ⋮
          </div>
        </div>

        {/* Right Half: Gemini Chat Space */}
        <div
          className={`flex-1 overflow-hidden ${
            mobileTab === 'doc' ? 'hidden md:block' : ''
          } ${
            mobileTab === 'chat' ? 'h-full md:h-full' : 'h-1/2 md:h-full'
          }`}
          style={{ width: `${typeof window !== 'undefined' && window.innerWidth >= 768 ? 100 - splitRatio : 100}%` }}
        >
          <ChatSpace
            messages={messages}
            onSendMessage={handleSendMessage}
            isGenerating={isGenerating}
            activeAttachment={activeAttachment}
            onClearAttachment={() => setActiveAttachment(null)}
            onClearMessages={handleClearMessages}
            settings={settings}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAnalytics={() => setIsAnalyticsOpen(true)}
            onOpenExport={() => setIsExportOpen(true)}
            connectionStatus={connectionStatus}
            stats={stats}
          />
        </div>
      </div>

      {/* Export & App Download Center Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        messages={messages}
        stats={stats}
        records={records}
      />

      {/* Real-time Token Usage & Quota Analytics Dashboard Modal */}
      <AnalyticsDashboard
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        stats={stats}
        records={records}
        settings={settings}
        onClearRecords={handleClearRecords}
        onOpenExport={() => {
          setIsAnalyticsOpen(false);
          setIsExportOpen(true);
        }}
        onOpenSettings={() => {
          setIsAnalyticsOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* Model & API Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        connectionStatus={connectionStatus}
        onUpdateConnectionStatus={setConnectionStatus}
      />
    </div>
  );
}
