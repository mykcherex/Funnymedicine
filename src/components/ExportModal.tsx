/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Download,
  Package,
  Smartphone,
  FileText,
  CheckCircle2,
  HelpCircle,
  FileDown,
  Database,
  ExternalLink,
  X,
  Sparkles,
  ArrowDownToLine,
  FolderArchive,
  Info,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ChatMessage, RateQuotaStats, TokenUsageRecord } from '../types';
import { compileResponsesToPdf } from '../utils/pdfCompiler';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  stats: RateQuotaStats;
  records: TokenUsageRecord[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  messages,
  stats,
  records,
}) => {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [isCompilingPdf, setIsCompilingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(true);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Download Master ZIP with APK inside
  const handleDownloadZip = () => {
    setDownloadingZip(true);
    showToast('Starting download of DocuGemini ZIP package (with APK inside)...');
    
    // Create download link to server endpoint and static fallback
    const link = document.createElement('a');
    link.href = '/api/export/package-zip';
    link.download = 'DocuGemini-v1.0.0-package.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadingZip(false);
      showToast('✓ ZIP package downloaded! APK is inside at the root of the archive.');
    }, 1500);
  };

  // 2. Download Standalone APK
  const handleDownloadApk = () => {
    setDownloadingApk(true);
    showToast('Starting direct APK download (DocuGemini-v1.0.0-release.apk)...');

    const link = document.createElement('a');
    link.href = '/api/export/apk';
    link.download = 'DocuGemini-v1.0.0-release.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadingApk(false);
      showToast('✓ APK downloaded! Open in Files on your phone to install.');
    }, 1500);
  };

  // 3. Compile AI Responses to PDF
  const handleCompilePdf = () => {
    const aiMsgs = messages.filter((m) => m.role === 'model' && !m.error);
    if (aiMsgs.length === 0) {
      showToast('No AI responses to export yet. Ask Gemini a question first!');
      return;
    }

    setIsCompilingPdf(true);
    try {
      const ok = compileResponsesToPdf(aiMsgs, {
        title: 'DocuGemini — Compiled AI Responses',
      });
      if (ok) {
        showToast(`✓ Compiled ${aiMsgs.length} AI response(s) to PDF!`);
      } else {
        showToast('Could not compile PDF. Please check permissions.');
      }
    } catch (err) {
      console.error(err);
      showToast('Error generating PDF.');
    } finally {
      setIsCompilingPdf(false);
    }
  };

  // 4. Export conversation as Markdown
  const handleExportMarkdown = () => {
    if (messages.length === 0) {
      showToast('Conversation is empty.');
      return;
    }

    let md = `# DocuGemini Chat Export\n\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    messages.forEach((m, idx) => {
      const roleName = m.role === 'user' ? 'User' : 'Gemini AI';
      md += `### ${idx + 1}. ${roleName} (${new Date(m.timestamp).toLocaleTimeString()})\n\n`;
      if (m.attachment) {
        md += `> 📎 **Attachment:** ${m.attachment.documentName} (Page ${m.attachment.pageNumber || 1})${
          m.attachment.isCropped ? ' [Cropped Selection]' : ''
        }\n\n`;
      }
      md += `${m.content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DocuGemini-Chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Markdown chat history downloaded!');
  };

  // 5. Export Token Usage Analytics as CSV
  const handleExportAnalyticsCsv = () => {
    if (records.length === 0) {
      showToast('No usage records to export yet.');
      return;
    }

    const headers = ['Timestamp', 'Model', 'Prompt Tokens', 'Candidate Tokens', 'Total Tokens', 'Latency (ms)', 'Cost (USD)', 'Document'];
    const rows = records.map((r) => [
      new Date(r.timestamp).toISOString(),
      r.model,
      r.promptTokens,
      r.candidateTokens,
      r.totalTokens,
      r.latencyMs,
      r.costUsd.toFixed(6),
      `"${r.documentName || 'N/A'}"`,
    ]);
    const content = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `docugemini_analytics_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Token usage analytics exported to CSV!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Toast Alert */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-semibold shadow-xl shadow-indigo-600/30 border border-indigo-400/40 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Export &amp; App Download Center
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  v1.0.0 Ready
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Download the complete ZIP package with APK, standalone Android APK, or compiled document assets
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Featured Primary Box: Master ZIP containing the APK */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-indigo-500/60 bg-gradient-to-b from-indigo-950/50 via-slate-900 to-slate-900 p-5 shadow-xl shadow-indigo-950/40">
            <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-[11px] font-bold text-white rounded-bl-xl shadow flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-200" />
              RECOMMENDED FOR USERS &amp; DEVS
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 shadow-md">
                  <FolderArchive className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      DocuGemini Complete Package (.ZIP)
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                      INCLUDES APK
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    The master ZIP contains the <strong>ready-to-install Android APK (<code className="text-indigo-300">DocuGemini-v1.0.0-release.apk</code>)</strong> at the root of the archive, plus complete Android Studio project code and offline web assets.
                  </p>
                  
                  {/* Package Contents Pills */}
                  <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-slate-300 font-mono">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1 text-emerald-400">
                      ✓ DocuGemini-v1.0.0-release.apk (Root)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1 text-indigo-300">
                      ✓ INSTALL_APK_GUIDE.md
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1 text-violet-300">
                      ✓ android/ (Full Android Studio Source)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1 text-slate-300">
                      ✓ web/ (Offline Bundle)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 border border-indigo-400/40 flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer"
              >
                <ArrowDownToLine className={`w-4 h-4 ${downloadingZip ? 'animate-bounce' : ''}`} />
                <span>{downloadingZip ? 'Downloading...' : 'Download ZIP Package'}</span>
                <span className="text-xs opacity-80 font-normal">~(1.6 MB)</span>
              </button>
            </div>
          </div>

          {/* Second Option: Direct Standalone APK Download */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 hover:border-slate-700 transition-colors">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">
                      Standalone Android APK (<code className="text-emerald-300 text-xs">.apk</code>)
                    </h4>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Direct Mobile Install
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Download only the <code>DocuGemini-v1.0.0-release.apk</code> directly to your Android device without needing a ZIP extraction tool.
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadApk}
                disabled={downloadingApk}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 border border-emerald-400/30 flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer"
              >
                <Download className={`w-3.5 h-3.5 ${downloadingApk ? 'animate-bounce' : ''}`} />
                <span>{downloadingApk ? 'Downloading...' : 'Download APK Only'}</span>
                <span className="text-[11px] opacity-80 font-normal">~(528 KB)</span>
              </button>
            </div>
          </div>

          {/* Android Installation Instructions Accordion */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <button
              onClick={() => setShowInstallGuide(!showInstallGuide)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">
                  How to Install the APK on Your Android Phone (4 Quick Steps)
                </span>
              </div>
              {showInstallGuide ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showInstallGuide && (
              <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 space-y-3 text-xs text-slate-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/60">
                    <div className="flex items-center gap-2 font-bold text-white mb-1">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">1</span>
                      <span>Download or Extract APK</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Download the APK directly or extract <code>DocuGemini-v1.0.0-release.apk</code> from the downloaded ZIP archive onto your phone.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/60">
                    <div className="flex items-center gap-2 font-bold text-white mb-1">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">2</span>
                      <span>Open in Phone Downloads</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Open the phone's <strong>Files</strong> or <strong>Downloads</strong> app and tap on the downloaded <code>.apk</code> file.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/60">
                    <div className="flex items-center gap-2 font-bold text-white mb-1">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">3</span>
                      <span>Allow Unknown Apps</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      If Android prompts <em>"For security, your phone is not allowed to install unknown apps"</em>, tap <strong>Settings</strong> and switch <strong>Allow from this source</strong> to ON.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/60">
                    <div className="flex items-center gap-2 font-bold text-white mb-1">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">4</span>
                      <span>Tap Install &amp; Enjoy!</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Tap <strong>Install</strong>. Once completed, tap <strong>Open</strong> to launch DocuGemini with full offline document reading, continuous scroll, and crop intelligence!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Additional Exports (PDF, Markdown, Analytics CSV) */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Document &amp; Chat Data Exports
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Compile to PDF */}
              <div className="p-3.5 bg-slate-800/70 border border-slate-700/70 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs mb-1">
                    <FileDown className="w-4 h-4" />
                    <span>Compiled PDF</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    Compile AI responses into a multi-page formatted PDF ready to read or print on mobile.
                  </p>
                </div>
                <button
                  onClick={handleCompilePdf}
                  disabled={isCompilingPdf}
                  className="w-full py-1.5 px-3 bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isCompilingPdf ? 'Compiling...' : 'Compile to PDF'}</span>
                </button>
              </div>

              {/* Chat History Markdown */}
              <div className="p-3.5 bg-slate-800/70 border border-slate-700/70 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-violet-400 font-semibold text-xs mb-1">
                    <FileText className="w-4 h-4" />
                    <span>Chat Markdown</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    Export full conversation with cropped image notes to clean markdown (.md) format.
                  </p>
                </div>
                <button
                  onClick={handleExportMarkdown}
                  className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-650 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export .MD</span>
                </button>
              </div>

              {/* Analytics CSV */}
              <div className="p-3.5 bg-slate-800/70 border border-slate-700/70 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                    <Database className="w-4 h-4" />
                    <span>Usage Telemetry</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    Export token consumption, model latencies, and estimated costs to CSV spreadsheet.
                  </p>
                </div>
                <button
                  onClick={handleExportAnalyticsCsv}
                  className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-650 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            <span>DocuGemini Mobile builds run securely on Android 7.0+ (API 24+)</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
