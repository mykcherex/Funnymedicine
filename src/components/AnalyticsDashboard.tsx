import React, { useState } from 'react';
import {
  X,
  Activity,
  DollarSign,
  Cpu,
  Clock,
  TrendingUp,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Zap,
  BarChart3,
  Package,
} from 'lucide-react';
import { ApiSettings, RateQuotaStats, TokenUsageRecord } from '../types';
import { TIER_LIMITS } from '../constants/models';

interface AnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  stats: RateQuotaStats;
  records: TokenUsageRecord[];
  settings: ApiSettings;
  onClearRecords: () => void;
  onOpenSettings: () => void;
  onOpenExport?: () => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  isOpen,
  onClose,
  stats,
  records,
  settings,
  onClearRecords,
  onOpenSettings,
  onOpenExport,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'history'>('overview');

  if (!isOpen) return null;

  const currentTier = TIER_LIMITS[settings.quotaTier] || TIER_LIMITS.free;

  // Rate calculations
  const rpmPercent = Math.min(100, Math.round((stats.requestsThisMinute / stats.rpmLimit) * 100));
  const tpmPercent = Math.min(100, Math.round((stats.tokensThisMinute / stats.tpmLimit) * 100));
  const rpdPercent = Math.min(100, Math.round((stats.requestsToday / stats.rpdLimit) * 100));
  const remainingRpd = Math.max(0, stats.rpdLimit - stats.requestsToday);
  const remainingTpm = Math.max(0, stats.tpmLimit - stats.tokensThisMinute);

  // Custom budget calculations
  const budgetTokensPercent = Math.min(
    100,
    Math.round((stats.cumulativeTotalTokens / (settings.customTokenBudget || 500000)) * 100)
  );
  const budgetCostPercent = Math.min(
    100,
    Math.round((stats.cumulativeCostUsd / (settings.customCostBudget || 5.0)) * 100)
  );

  // Average latency
  const avgLatency =
    records.length > 0
      ? (records.reduce((acc, r) => acc + (r.latencyMs || 0), 0) / records.length / 1000).toFixed(2)
      : '0.00';

  // Export records as CSV or JSON
  const exportData = (format: 'json' | 'csv') => {
    let content = '';
    let mimeType = 'text/plain';
    let filename = `docugemini_analytics_${Date.now()}`;

    if (format === 'json') {
      content = JSON.stringify({ stats, records }, null, 2);
      mimeType = 'application/json';
      filename += '.json';
    } else {
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
      content = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      mimeType = 'text/csv';
      filename += '.csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Recent 12 calls for trend graph
  const recentRecords = [...records].reverse().slice(-12);
  const maxTotalTokens = Math.max(...recentRecords.map((r) => r.totalTokens), 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Real-Time Token Usage &amp; Quota Analytics
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentTier.name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Live telemetry of prompt consumption, latency trends, and estimated costs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenExport && (
              <button
                onClick={onOpenExport}
                title="Open Export Center to download App Package ZIP (includes APK) or Standalone APK"
                className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border border-indigo-400/50 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Package className="w-3.5 h-3.5 text-indigo-200" />
                <span>Export APK/ZIP</span>
              </button>
            )}
            <button
              onClick={() => exportData('csv')}
              title="Export as CSV"
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium rounded-lg text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Overview &amp; Remaining Quota
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'trends'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Visual Trends &amp; Latency
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Call History ({records.length})
            </button>
          </div>

          {records.length > 0 && (
            <button
              onClick={onClearRecords}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Stats
            </button>
          )}
        </div>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Total Tokens Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Cumulative Tokens</span>
                <Cpu className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white font-mono">
                  {stats.cumulativeTotalTokens.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>In: {stats.cumulativePromptTokens.toLocaleString()}</span>
                  <span>Out: {stats.cumulativeCandidateTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Total Estimated Cost Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Total Estimated Cost</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  ${stats.cumulativeCostUsd.toFixed(5)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Sub-cent precision tracking
                </div>
              </div>
            </div>

            {/* Daily Quota Left */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Remaining Daily Requests</span>
                <CheckCircle className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-cyan-300 font-mono">
                  {remainingRpd.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  of {stats.rpdLimit.toLocaleString()} RPD limit
                </div>
              </div>
            </div>

            {/* Avg Response Latency */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Avg Latency</span>
                <Clock className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-violet-300 font-mono">
                  {avgLatency}s
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Across {records.length} API executions
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'overview' && (
            <>
              {/* Remaining Quota & Rate Limit Gauges */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Active Rate Limits &amp; Rolling Quota Gauges
                  </h3>
                  <button
                    onClick={onOpenSettings}
                    className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
                  >
                    Adjust Tier / Custom Budget
                  </button>
                </div>

                {/* Gauge 1: Requests Per Minute (RPM) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      Requests in Current Minute (RPM)
                    </span>
                    <span className="font-mono text-slate-300">
                      {stats.requestsThisMinute} / {stats.rpmLimit} RPM ({rpmPercent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        rpmPercent > 80 ? 'bg-rose-500' : rpmPercent > 50 ? 'bg-amber-500' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.max(4, rpmPercent)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Rolling 60-second window</span>
                    <span>{Math.max(0, stats.rpmLimit - stats.requestsThisMinute)} RPM remaining</span>
                  </div>
                </div>

                {/* Gauge 2: Tokens Per Minute (TPM) */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      Tokens in Current Minute (TPM)
                    </span>
                    <span className="font-mono text-slate-300">
                      {stats.tokensThisMinute.toLocaleString()} / {stats.tpmLimit.toLocaleString()} TPM ({tpmPercent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        tpmPercent > 80 ? 'bg-rose-500' : tpmPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(4, tpmPercent)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>1,000,000 token limit per minute</span>
                    <span>{remainingTpm.toLocaleString()} tokens left this minute</span>
                  </div>
                </div>

                {/* Gauge 3: Requests Per Day (RPD) */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      Daily Invocations (RPD)
                    </span>
                    <span className="font-mono text-slate-300">
                      {stats.requestsToday} / {stats.rpdLimit} RPD ({rpdPercent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                    <div
                      className={`h-full rounded-full bg-cyan-500 transition-all duration-300`}
                      style={{ width: `${Math.max(3, rpdPercent)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Resets at midnight UTC</span>
                    <span>{(100 - rpdPercent).toFixed(1)}% of daily allowance intact</span>
                  </div>
                </div>
              </div>

              {/* User Custom Token & Cost Budget Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-200">User Token Budget Target</span>
                    <span className="font-mono text-indigo-300">
                      {stats.cumulativeTotalTokens.toLocaleString()} / {(settings.customTokenBudget || 500000).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${budgetTokensPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {budgetTokensPercent < 80 ? '✓ Safe: Usage within user allocated budget' : '⚠️ Warning: Approaching custom budget limit'}
                  </p>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-200">Spend Budget Target</span>
                    <span className="font-mono text-emerald-300">
                      ${stats.cumulativeCostUsd.toFixed(4)} / ${(settings.customCostBudget || 5.0).toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${budgetCostPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Estimated using official Gemini 3.8 Flash &amp; 3.1 Pro token pricing
                  </p>
                </div>
              </div>
            </>
          )}

          {activeTab === 'trends' && (
            <div className="space-y-6">
              {/* Token Usage Trend Graph */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    Token Consumption Trend (Last 12 Calls)
                  </h3>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-indigo-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Prompt Tokens
                    </span>
                    <span className="flex items-center gap-1 text-emerald-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Output Tokens
                    </span>
                  </div>
                </div>

                {recentRecords.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No API calls logged yet. Share a document page to see real-time trends.
                  </div>
                ) : (
                  <div className="h-48 flex items-end gap-2 pt-6 pb-2 px-2 border-b border-slate-700/60">
                    {recentRecords.map((r, i) => {
                      const promptH = Math.round((r.promptTokens / maxTotalTokens) * 100);
                      const candH = Math.round((r.candidateTokens / maxTotalTokens) * 100);
                      return (
                        <div key={r.id || i} className="flex-1 flex flex-col items-center gap-1 group relative">
                          {/* Tooltip */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 bg-slate-900 border border-slate-700 text-[10px] p-1.5 rounded shadow-lg whitespace-nowrap z-20 pointer-events-none">
                            <div className="font-bold text-white">{r.totalTokens} tokens</div>
                            <div className="text-slate-400">{r.latencyMs}ms • ${(r.costUsd || 0).toFixed(5)}</div>
                          </div>

                          <div className="w-full max-w-[28px] flex flex-col-reverse rounded-t overflow-hidden bg-slate-900/60 h-36">
                            <div
                              className="w-full bg-indigo-500"
                              style={{ height: `${Math.max(4, promptH)}%` }}
                            />
                            <div
                              className="w-full bg-emerald-500"
                              style={{ height: `${Math.max(2, candH)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono">
                            #{i + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pricing Rate Card Reference */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-300 mb-2">
                  Official Gemini API Rate Schedule (USD per 1,000,000 Tokens)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800">
                    <div className="font-semibold text-indigo-300">Gemini 3.8 Flash</div>
                    <div className="text-slate-400 mt-1">Prompt: $0.075 / 1M</div>
                    <div className="text-slate-400">Candidate: $0.30 / 1M</div>
                  </div>
                  <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800">
                    <div className="font-semibold text-violet-300">Gemini 3.1 Pro Preview</div>
                    <div className="text-slate-400 mt-1">Prompt: $1.25 / 1M</div>
                    <div className="text-slate-400">Candidate: $5.00 / 1M</div>
                  </div>
                  <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800">
                    <div className="font-semibold text-cyan-300">Gemini 3.1 Flash Lite</div>
                    <div className="text-slate-400 mt-1">Prompt: $0.0375 / 1M</div>
                    <div className="text-slate-400">Candidate: $0.15 / 1M</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Prompt</th>
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3">Latency</th>
                      <th className="py-2.5 px-3">Cost ($)</th>
                      <th className="py-2.5 px-3">Document Page</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                          No requests recorded yet.
                        </td>
                      </tr>
                    ) : (
                      records.slice(0, 50).map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-[11px] text-slate-400 font-sans whitespace-nowrap">
                            {new Date(r.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 font-sans text-indigo-300 text-[11px]">
                            {r.model}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {r.promptTokens.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-emerald-300">
                            {r.candidateTokens.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-bold text-white">
                            {r.totalTokens.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-violet-300">
                            {r.latencyMs}ms
                          </td>
                          <td className="py-2 px-3 text-emerald-400">
                            ${r.costUsd.toFixed(5)}
                          </td>
                          <td className="py-2 px-3 text-slate-400 font-sans truncate max-w-[120px]">
                            {r.documentName ? `${r.documentName} (p.${r.pageNumber})` : 'Chat Prompt'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Real-time usage analytics computed on verified Google GenAI token output</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
