// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiEndpoint } from '@/lib/config';

interface FeedbackAnalyticsProps {
  token: string;
}

interface FeedbackData {
  period: string;
  positive_count: number;
  negative_count: number;
  total_count: number;
  ratio: number;
  trend: TrendBucket[];
}

interface TrendBucket {
  date: string;
  positive: number;
  negative: number;
  ratio: number;
}

type Period = '7d' | '30d' | '90d';

const PERIODS: Period[] = ['7d', '30d', '90d'];

export default function FeedbackAnalytics({ token }: FeedbackAnalyticsProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<FeedbackData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Auto-fetch on mount
  useEffect(() => {
    fetchFeedback(period);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeedback = useCallback(
    async (selectedPeriod: Period) => {
      setIsLoading(true);
      setError(null);
      setHasFetched(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      try {
        const res = await fetch(
          getApiEndpoint(`/admin/feedback?period=${selectedPeriod}`),
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json: FeedbackData = await res.json();
        setData(json);
      } catch (err) {
        clearTimeout(timeoutId);
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
    fetchFeedback(newPeriod);
  };

  const ratioPercent = data ? Math.round(data.ratio * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {t('admin.feedbackAnalytics.title')}
        </h2>
        <div
          className="flex gap-1"
          role="group"
          aria-label={t('admin.feedbackAnalytics.periodLabel')}
        >
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
              {t(`admin.feedbackAnalytics.period.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div
          className="flex items-center justify-center py-12"
          role="status"
          aria-label={t('admin.feedbackAnalytics.loading')}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
              aria-hidden="true"
            />
            <p className="text-sm text-gray-500">
              {t('admin.feedbackAnalytics.loading')}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-center"
          role="alert"
        >
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => fetchFeedback(period)}
            className="mt-3 min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
          >
            {t('admin.feedbackAnalytics.retry')}
          </button>
        </div>
      )}

      {/* Prompt to select period */}
      {!hasFetched && !isLoading && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">
            {t('admin.feedbackAnalytics.selectPeriod')}
          </p>
        </div>
      )}

      {/* Data display */}
      {hasFetched && !isLoading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                {t('admin.feedbackAnalytics.positiveCount')}
              </p>
              <p className="mt-1 text-2xl font-bold text-green-600">
                {data.positive_count}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                {t('admin.feedbackAnalytics.negativeCount')}
              </p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {data.negative_count}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                {t('admin.feedbackAnalytics.totalCount')}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-800">
                {data.total_count}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                {t('admin.feedbackAnalytics.positiveRatio')}
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-600">
                {ratioPercent}%
              </p>
            </div>
          </div>

          {/* Ratio bar */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              {t('admin.feedbackAnalytics.ratioBar')}
            </h3>
            <div
              className="flex h-6 w-full overflow-hidden rounded-full bg-gray-200"
              role="img"
              aria-label={t('admin.feedbackAnalytics.ratioBarLabel', {
                positive: ratioPercent,
                negative: 100 - ratioPercent,
              })}
            >
              {data.total_count > 0 && (
                <>
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${ratioPercent}%` }}
                    title={`${t('admin.feedbackAnalytics.positiveCount')}: ${data.positive_count}`}
                  />
                  <div
                    className="bg-red-400 transition-all"
                    style={{ width: `${100 - ratioPercent}%` }}
                    title={`${t('admin.feedbackAnalytics.negativeCount')}: ${data.negative_count}`}
                  />
                </>
              )}
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>
                {t('admin.feedbackAnalytics.positiveLabel')} {ratioPercent}%
              </span>
              <span>
                {t('admin.feedbackAnalytics.negativeLabel')} {100 - ratioPercent}%
              </span>
            </div>
          </div>

          {/* Daily trend */}
          {data.trend.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                {t('admin.feedbackAnalytics.dailyTrend')}
              </h3>
              <div
                className="flex items-end gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4"
                role="img"
                aria-label={t('admin.feedbackAnalytics.trendChartLabel')}
                style={{ minHeight: 140 }}
              >
                {data.trend.map((bucket, idx) => {
                  const total = bucket.positive + bucket.negative;
                  const barHeight = Math.max(8, Math.min(100, total * 4));
                  const posHeight =
                    total > 0
                      ? Math.round((bucket.positive / total) * barHeight)
                      : 0;
                  const negHeight = barHeight - posHeight;

                  return (
                    <div
                      key={idx}
                      className="flex flex-1 flex-col items-center gap-1"
                      style={{ minWidth: 32 }}
                    >
                      <span className="text-[10px] text-gray-500">{total}</span>
                      <div className="flex w-full max-w-[24px] flex-col">
                        <div
                          className="w-full rounded-t bg-green-500"
                          style={{ height: `${posHeight}px` }}
                          title={`${bucket.date}: ${bucket.positive} ${t('admin.feedbackAnalytics.positiveLabel')}`}
                        />
                        <div
                          className="w-full rounded-b bg-red-400"
                          style={{ height: `${negHeight}px` }}
                          title={`${bucket.date}: ${bucket.negative} ${t('admin.feedbackAnalytics.negativeLabel')}`}
                        />
                      </div>
                      <span className="max-w-[48px] truncate text-[10px] text-gray-400">
                        {bucket.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
