import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Paperclip,
  X,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Activity,
  Layers,
  FileText,
  AlertCircle,
  Clock,
  Coins,
  ChevronDown,
  CheckCircle2,
  Circle,
  FileDown,
  Download,
  CheckSquare,
  Smartphone,
  FolderDown,
  Globe,
} from 'lucide-react';
import {
  ApiSettings,
  ChatMessage,
  ConnectionStatus,
  DocumentPageSnapshot,
  RateQuotaStats,
} from '../types';
import { SUPPORTED_MODELS } from '../constants/models';
import { compileResponsesToPdf, formatResponsesForClipboard } from '../utils/pdfCompiler';

interface ChatSpaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, attachment: DocumentPageSnapshot | null) => Promise<void>;
  isGenerating: boolean;
  activeAttachment: DocumentPageSnapshot | null;
  onClearAttachment: () => void;
  onClearMessages: () => void;
  settings: ApiSettings;
  onOpenSettings: () => void;
  onOpenAnalytics: () => void;
  onOpenExport?: () => void;
  connectionStatus: ConnectionStatus;
  stats: RateQuotaStats;
}

export const ChatSpace: React.FC<ChatSpaceProps> = ({
  messages,
  onSendMessage,
  isGenerating,
  activeAttachment,
  onClearAttachment,
  onClearMessages,
  settings,
  onOpenSettings,
  onOpenAnalytics,
  onOpenExport,
  connectionStatus,
  stats,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);
  
  // Telegram-style AI response selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCompilingPdf, setIsCompilingPdf] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (!isSelectionMode) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGenerating, isSelectionMode]);

  // Show auto-dismissing toast notifications
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  // Adjust textarea height automatically
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if ((!text && !activeAttachment && !settings.generalPrompt) || isGenerating) return;

    // Use user text, or fallback to configured general prompt, or default query
    const promptToSend =
      text ||
      settings.generalPrompt ||
      (activeAttachment
        ? `Please analyze and summarize the attached document page (${activeAttachment.documentName} - Page ${activeAttachment.pageNumber}) in detail.`
        : 'Analyze document.');

    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await onSendMessage(promptToSend, activeAttachment);
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Copied response text to clipboard');
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Telegram-style AI Selection Handlers
  const toggleSelectMessage = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size > 0) {
        setIsSelectionMode(true);
      } else {
        setIsSelectionMode(false);
      }
      return next;
    });
  };

  const selectAllAiMessages = () => {
    const aiIds = messages
      .filter((m) => m.role === 'model' && !m.error)
      .map((m) => m.id);
    setSelectedIds(new Set(aiIds));
    setIsSelectionMode(true);
    showToast(`Selected all ${aiIds.length} AI responses`);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  // Copy all selected responses together (Telegram style)
  const handleCopySelectedTogether = () => {
    const selectedMsgs = messages.filter((m) => selectedIds.has(m.id));
    if (selectedMsgs.length === 0) return;

    const formatted = formatResponsesForClipboard(selectedMsgs);
    navigator.clipboard.writeText(formatted);
    showToast(`✓ Copied ${selectedMsgs.length} selected responses together!`);
  };

  // Compile selected AI responses to PDF locally and save directly to phone / device
  const handleCompileToPdf = (targetMsgs?: ChatMessage[]) => {
    const msgsToExport = targetMsgs || messages.filter((m) => selectedIds.has(m.id));
    if (msgsToExport.length === 0) {
      showToast('Please select at least one AI response to compile');
      return;
    }

    setIsCompilingPdf(true);
    try {
      const success = compileResponsesToPdf(msgsToExport, {
        title: 'DocuGemini — Compiled AI Responses',
        documentName: activeAttachment?.documentName,
      });

      if (success) {
        showToast(
          `📄 Compiled ${msgsToExport.length} response(s) to PDF & saved to phone!`
        );
      } else {
        showToast('Failed to compile PDF. Please check browser permissions.');
      }
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Error generating PDF file.');
    } finally {
      setIsCompilingPdf(false);
    }
  };

  const activeModelObj =
    SUPPORTED_MODELS.find((m) => m.id === settings.selectedModel);

  const displayModelName =
    settings.mode === 'third_party'
      ? settings.selectedModel
      : activeModelObj
      ? activeModelObj.name
      : settings.selectedModel;

  const aiMessagesCount = messages.filter((m) => m.role === 'model' && !m.error).length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-3.5 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium shadow-xl shadow-indigo-600/30 border border-indigo-400/40 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Chat Top Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20">
            {settings.mode === 'third_party' ? (
              <Globe className="w-4 h-4 text-indigo-200" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">
                {displayModelName}
              </span>

              {/* Mode indicator tag */}
              {settings.mode === 'third_party' ? (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shrink-0 flex items-center gap-1">
                  3RD-PARTY AI
                </span>
              ) : activeModelObj?.isFree ? (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                  FREE
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                  PAID
                </span>
              )}

              {/* Connection Pill */}
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition-colors"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connectionStatus.status === 'connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : connectionStatus.status === 'checking'
                      ? 'bg-amber-400 animate-spin'
                      : 'bg-rose-400'
                  }`}
                />
                <span className="text-slate-300 hidden sm:inline">
                  {connectionStatus.status === 'connected'
                    ? `${connectionStatus.latencyMs || 120}ms`
                    : connectionStatus.status === 'checking'
                    ? 'Connecting'
                    : 'Disconnected'}
                </span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              Multimodal Document Intelligence &amp; Reasoning
            </p>
          </div>
        </div>

        {/* Right Header Badges & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Telegram-style Select Mode Toggle (visible when there are AI messages) */}
          {aiMessagesCount > 0 && (
            <button
              onClick={() => {
                if (isSelectionMode) {
                  clearSelection();
                } else {
                  setIsSelectionMode(true);
                }
              }}
              title={isSelectionMode ? 'Exit Selection Mode' : 'Select AI Responses (Telegram Style)'}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                isSelectionMode
                  ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-200'
                  : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{isSelectionMode ? 'Cancel' : 'Select'}</span>
            </button>
          )}

          {/* Token Quota Pill */}
          <button
            onClick={onOpenAnalytics}
            title="Open Real-time Token Usage & Quota Dashboard"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-xs text-indigo-200 transition-all font-mono"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold">{stats.cumulativeTotalTokens.toLocaleString()}</span>
            <span className="text-[10px] text-indigo-300 hidden md:inline">tokens</span>
          </button>

          {/* Export Center Trigger */}
          {onOpenExport && (
            <button
              onClick={onOpenExport}
              title="Export Section: Download App ZIP (with APK), Standalone APK, or Documents"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 transition-colors text-xs font-medium"
            >
              <FolderDown className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden xl:inline">Export</span>
            </button>
          )}

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            title="Configure Models & API Keys"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Clear Messages */}
          {messages.length > 0 && (
            <button
              onClick={() => {
                clearSelection();
                onClearMessages();
              }}
              title="Clear Conversation"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 border border-slate-700/60 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Telegram-style Multi-Selection Action Bar (Appears when responses are selected) */}
      {selectedIds.size > 0 && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-500/40 px-3.5 py-2 flex items-center justify-between gap-2 shadow-lg animate-in slide-in-from-top-1 duration-150 shrink-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={clearSelection}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Cancel selection"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                {selectedIds.size}
              </span>
              <span className="text-xs font-semibold text-slate-200">
                {selectedIds.size === 1 ? 'response selected' : 'responses selected'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle Select All */}
            <button
              onClick={selectedIds.size === aiMessagesCount ? clearSelection : selectAllAiMessages}
              className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
            >
              {selectedIds.size === aiMessagesCount ? 'Deselect All' : 'Select All'}
            </button>

            {/* Telegram Copy All Together */}
            <button
              onClick={handleCopySelectedTogether}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
              title="Copy all selected responses together"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-400" />
              <span>Copy All</span>
            </button>

            {/* Very Small Button: Compile selected Gemini responses to a PDF and save to phone */}
            <button
              onClick={() => handleCompileToPdf()}
              disabled={isCompilingPdf}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 rounded-md border border-indigo-400/50 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              title="Compile selected Gemini responses to a PDF and save to phone (Client-side, 0 API calls)"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-200" />
              <span>{isCompilingPdf ? 'Compiling...' : 'Compile to PDF'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 shadow-lg">
              <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              DocuGemini Chat Space
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Click the <strong className="text-indigo-300">+</strong> button to open a PDF (up to 400 pages) or document, then tap the <strong className="text-indigo-300">point button ✨</strong> in the bottom right corner of the reader to share the page snapshot into Gemini AI.
            </p>

            <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 text-left space-y-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-200 text-[11px] uppercase tracking-wider">
                What you can do:
              </div>
              <div className="flex items-start gap-2 text-slate-400">
                <span className="text-indigo-400">✦</span>
                <span>Extract complex data tables and financial line-items into JSON or CSV.</span>
              </div>
              <div className="flex items-start gap-2 text-slate-400">
                <span className="text-indigo-400">✦</span>
                <span>Analyze visual architectural diagrams, charts, and workflow schemas.</span>
              </div>
              <div className="flex items-start gap-2 text-slate-400">
                <span className="text-indigo-400">✦</span>
                <span>Select AI responses (like Telegram) and compile them directly into a downloadable PDF for your phone with one tap.</span>
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isAi = msg.role === 'model';
            const isSelected = selectedIds.has(msg.id);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-start gap-2 max-w-[95%] md:max-w-[88%] group">
                  {/* Telegram-style Selection Checkbox for AI messages */}
                  {isAi && !msg.error && (
                    <button
                      onClick={() => toggleSelectMessage(msg.id)}
                      className={`mt-1.5 p-1 rounded-full transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'text-indigo-400 scale-110'
                          : isSelectionMode
                          ? 'text-slate-500 hover:text-slate-300'
                          : 'text-slate-600/40 hover:text-slate-400 opacity-60 group-hover:opacity-100'
                      }`}
                      title={isSelected ? 'Deselect response' : 'Select response (Telegram style)'}
                    >
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 fill-indigo-600 text-white drop-shadow" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {isAi && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    onClick={() => {
                      if (isSelectionMode && isAi && !msg.error) {
                        toggleSelectMessage(msg.id);
                      }
                    }}
                    className={`rounded-2xl p-3.5 text-xs leading-relaxed shadow-md transition-all ${
                      isSelectionMode && isAi && !msg.error ? 'cursor-pointer' : ''
                    } ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : msg.error
                        ? 'bg-rose-950/40 border border-rose-800 text-rose-200 rounded-tl-none'
                        : isSelected
                        ? 'bg-slate-900 border-2 border-indigo-500 ring-2 ring-indigo-500/20 text-slate-100 rounded-tl-none shadow-indigo-500/10'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    {/* Attached Document Snapshot Banner in User Message */}
                    {msg.attachment && (
                      <div className="mb-2.5 p-2 bg-black/25 rounded-xl border border-white/10 flex items-center gap-2.5">
                        {msg.attachment.imageUrl ? (
                          <img
                            src={msg.attachment.imageUrl}
                            alt="Document page snapshot"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewAttachmentUrl(msg.attachment?.imageUrl || null);
                            }}
                            className="w-12 h-16 object-cover rounded bg-white border border-white/20 cursor-pointer hover:scale-105 transition-transform shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-16 rounded bg-slate-800 border border-slate-700/80 flex flex-col items-center justify-center text-slate-400 shrink-0">
                            <FileText className="w-5 h-5 text-indigo-400 mb-1" />
                            <span className="text-[9px] font-mono text-slate-300">
                              {msg.attachment.pageNumber ? `p.${msg.attachment.pageNumber}` : 'Doc'}
                            </span>
                          </div>
                        )}
                        <div className="text-[11px] min-w-0">
                          <div className="font-semibold text-white truncate flex items-center gap-1.5">
                            {msg.attachment.isCropped && (
                              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-mono">
                                CROP
                              </span>
                            )}
                            <span className="truncate">{msg.attachment.documentName}</span>
                          </div>
                          <div className="text-white/70">
                            {msg.attachment.isCropped
                              ? `Cropped Selection (Page ${msg.attachment.pageNumber})`
                              : `Attached Page ${msg.attachment.pageNumber} Snapshot`}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message Content */}
                    <div className="whitespace-pre-wrap font-sans break-words space-y-2">
                      {msg.content}
                    </div>

                    {/* Footer on AI Responses */}
                    {isAi && (
                      <div
                        className="mt-3 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          {msg.tokenUsage && (
                            <span className="flex items-center gap-1 text-indigo-300">
                              <Coins className="w-3 h-3" />
                              {msg.tokenUsage.totalTokenCount} tok (In: {msg.tokenUsage.promptTokenCount}, Out: {msg.tokenUsage.candidatesTokenCount})
                            </span>
                          )}
                          {msg.latencyMs && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3" />
                              {(msg.latencyMs / 1000).toFixed(2)}s
                            </span>
                          )}
                          {msg.cost !== undefined && (
                            <span className="text-emerald-400">
                              ${msg.cost.toFixed(5)}
                            </span>
                          )}
                        </div>

                        {/* Action buttons on message */}
                        <div className="flex items-center gap-1.5 font-sans">
                          {/* Very Small Button: Compile this AI response to a PDF file & save to phone */}
                          <button
                            onClick={() => handleCompileToPdf([msg])}
                            title="Compile this Gemini response to a PDF and save to phone (Client-side, 0 API calls)"
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <FileDown className="w-2.5 h-2.5 text-indigo-400" />
                            <span>PDF</span>
                          </button>

                          {/* Copy button */}
                          <button
                            onClick={() => copyText(msg.id, msg.content)}
                            className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 flex items-center gap-1 transition-colors"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>

                          {/* Telegram Select button */}
                          <button
                            onClick={() => toggleSelectMessage(msg.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border-slate-700/60'
                            }`}
                            title="Select this message (Telegram style)"
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isGenerating && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 animate-pulse">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span>Analyzing multimodal context with {displayModelName}...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0 space-y-2">
        {/* Active Attachment Chip */}
        {activeAttachment && (
          <div className="flex items-center justify-between p-2 bg-indigo-950/40 border border-indigo-500/40 rounded-xl text-xs text-indigo-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={activeAttachment.imageUrl}
                alt="Document snapshot preview"
                className="w-8 h-10 object-cover rounded bg-white border border-indigo-400/30"
              />
              <div className="truncate">
                <span className="font-semibold text-white">
                  Attached: {activeAttachment.documentName} (Page {activeAttachment.pageNumber})
                </span>
                <span className="text-[11px] text-indigo-300 block">
                  High-res canvas snapshot + {activeAttachment.extractedText.length.toLocaleString()} characters attached to prompt
                </span>
              </div>
            </div>
            <button
              onClick={onClearAttachment}
              className="p-1 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-900/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="relative flex items-end gap-2 bg-slate-950 border border-slate-800 focus-within:border-indigo-500/80 rounded-xl p-2 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              activeAttachment
                ? `Ask about Page ${activeAttachment.pageNumber} or click Send to use general prompt...`
                : settings.generalPrompt
                ? `Enter message or leave empty to use General Prompt: "${settings.generalPrompt.slice(0, 40)}..."`
                : 'Ask Gemini about the document or click the point button on the left...'
            }
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 resize-none focus:outline-none max-h-36 py-1 px-1 leading-relaxed"
          />

          <button
            onClick={handleSubmit}
            disabled={(!inputText.trim() && !activeAttachment && !settings.generalPrompt) || isGenerating}
            title={!inputText.trim() && (activeAttachment || settings.generalPrompt) ? "Send with General Prompt" : "Send message"}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors shrink-0 shadow-md shadow-indigo-600/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>Telegram-style selection &amp; Instant PDF compilation</span>
        </div>
      </div>

      {/* Snapshot Preview Modal */}
      {previewAttachmentUrl && (
        <div
          onClick={() => setPreviewAttachmentUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="max-w-2xl max-h-[85vh] bg-slate-900 rounded-xl p-2 border border-slate-700 shadow-2xl">
            <img
              src={previewAttachmentUrl}
              alt="Snapshot enlarged"
              className="max-h-[80vh] w-auto rounded object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
