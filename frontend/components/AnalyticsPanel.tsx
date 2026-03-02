// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiEndpoint } from '@/lib/config';

interface AnalyticsPanelProps {
  token: string;
}

interface UsageMetrics {
  total_conversations: number;
  active_sessions: number;
  average_session_duration: number;
}

interface SentimentBucket {
  time_bucket: string;
  average_sentiment: number;
}

type Period = '7d' | '30d' | '90d';

const PERIODS: Period[] = ['7d', '30d', '90d'];

async function fetchWithTimeout(
  url: string,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  // If an external signal is provided, abort our controller when it fires
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export default function AnalyticsPanel({ token }: AnalyticsPanelProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('7d');
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [sentiment, setSentiment] = useState<SentimentBucket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Auto-fetch on mount
  useEffect(() => {
    fetchAnalytics(period);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback(
    async (selectedPeriod: Period) => {
      setIsLoading(true);
      setError(null);
      setHasFetched(true);

      const controller = new AbortController();

      try {
        const [metricsRes, sentimentRes] = await Promise.all([
          fetchWithTimeout(
            getApiEndpoint(`/admin/analytics?period=${selectedPeriod}`),
            token,
            controller.signal,
          ),
          fetchWithTimeout(
            getApiEndpoint(`/admin/analytics/sentiment?period=${selectedPeriod}`),
            token,
            controller.signal,
          ),
        ]);

        const metricsJson = await metricsRes.json();
        // Backend returns {total_conversations, active_sessions, average_session_duration_seconds, ...}
        const metricsData: UsageMetrics = {
          total_conversations: metricsJson.total_conversations ?? 0,
          active_sessions: metricsJson.active_sessions ?? 0,
          average_session_duration: metricsJson.average_session_duration_seconds ?? metricsJson.average_session_duration ?? 0,
        };

        const sentimentJson = await sentimentRes.json();
        // Backend returns {"period": "7d", "trend": [{date, average_sentiment, message_count}, ...]}
        const rawTrend = Array.isArray(sentimentJson) ? sentimentJson : (sentimentJson.trend ?? []);
        const sentimentData: SentimentBucket[] = rawTrend.map((b: Record<string, unknown>) => ({
          time_bucket: (b.date as string) ?? (b.time_bucket as string) ?? '',
          average_sentiment: (b.average_sentiment as number) ?? 0,
        }));

        setMetrics(metricsData);
        setSentiment(sentimentData);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setError(t('errors.timeout'));
        } else {
          setError(t('errors.network'));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [token, t],
  );

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    fetchAnalytics(newPeriod);
  };

  /** Format seconds into a human-readable duration string. */
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  /** Map a sentiment value (-1..1) to a bar height percentage (0..100). */
  const sentimentToHeight = (value: number): number =>
    Math.max(4, Math.round(((value + 1) / 2) * 100));

  /** Map a sentiment value to a Tailwind color class. */
  const sentimentColor = (value: number): string => {
    if (value >= 0.3) return 'bg-green-500';
    if (value >= -0.3) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {t('admin.analyticsPanel.title')}
        </h2>
        <div className="flex gap-1" role="group" aria-label={t('admin.analyticsPanel.periodLabel')}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePeriodChange(p)}
              aria-pressed={period === p}
              className={`min-h-[44px] min-w-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t(`admin.analyticsPanel.period.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status" aria-label={t('admin.analyticsPanel.loading')}>
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
              aria-hidden="true"
            />
            <p className="text-sm text-gray-500">{t('admin.analyticsPanel.loading')}</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => fetchAnalytics(period)}
            className="mt-3 min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
          >
            {t('admin.analyticsPanel.retry')}
          </button>
        </div>
      )}

      {/* Prompt to load data */}
      {!hasFetched && !isLoading && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">{t('admin.analyticsPanel.selectPeriod')}</p>
        </div>
      )}

      {/* Data display */}
      {hasFetched && !isLoading && !error && metrics && (
        <>
          {/* Usage metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label={t('admin.analyticsPanel.usageMetrics')}>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">{t('admin.analyticsPanel.totalConversations')}</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{metrics.total_conversations}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">{t('admin.analyticsPanel.activeSessions')}</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{metrics.active_sessions}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">{t('admin.analyticsPanel.avgDuration')}</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">
                {formatDuration(metrics.average_session_duration)}
              </p>
            </div>
          </div>

          {/* Sentiment trend chart */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              {t('admin.analyticsPanel.sentimentTrend')}
            </h3>
            {sentiment.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {t('admin.analyticsPanel.noSentimentData')}
              </p>
            ) : (
              <div
                className="flex items-end gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"
                role="img"
                aria-label={t('admin.analyticsPanel.sentimentChartLabel')}
                style={{ minHeight: 160 }}
              >
                {sentiment.map((bucket, idx) => (
                  <div
                    key={idx}
                    className="flex flex-1 flex-col items-center gap-1"
                    style={{ minWidth: 28 }}
                  >
                    <span className="text-[10px] text-gray-500">
                      {bucket.average_sentiment.toFixed(2)}
                    </span>
                    <div
                      className={`w-full max-w-[24px] rounded-t ${sentimentColor(bucket.average_sentiment)} transition-all`}
                      style={{ height: `${sentimentToHeight(bucket.average_sentiment)}px` }}
                      title={`${bucket.time_bucket}: ${bucket.average_sentiment.toFixed(2)}`}
                    />
                    <span className="max-w-[48px] truncate text-[10px] text-gray-400">
                      {bucket.time_bucket}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
