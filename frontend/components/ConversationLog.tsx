// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiEndpoint } from '@/lib/config';

/** A single message within a conversation session. */
interface ConversationMessage {
  message_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** A conversation session summary returned by the list endpoint. */
interface ConversationSession {
  session_id: string;
  user_role: string;
  language: string;
  timestamp: string;
  message_count: number;
  sentiment_score?: number;
}

/** Full session detail returned by the single-session endpoint. */
interface ConversationDetail {
  session_id: string;
  messages: ConversationMessage[];
}

interface Filters {
  start_date: string;
  end_date: string;
  role: string;
  language: string;
  sentiment: string;
}

interface ConversationLogProps {
  token: string;
}

const INITIAL_FILTERS: Filters = {
  start_date: '',
  end_date: '',
  role: '',
  language: '',
  sentiment: '',
};

const ROLE_OPTIONS = ['instructor', 'internal_staff', 'learner'] as const;
const LANGUAGE_OPTIONS = ['en', 'es'] as const;
const SENTIMENT_OPTIONS = ['positive', 'neutral', 'negative'] as const;

export default function ConversationLog({ token }: ConversationLogProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<ConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setHasFetched(true);

    const params = new URLSearchParams();
    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    if (filters.role) params.set('role', filters.role);
    if (filters.language) params.set('language', filters.language);
    if (filters.sentiment) params.set('sentiment', filters.sentiment);

    const qs = params.toString();
    const url = getApiEndpoint(`/admin/conversations${qs ? `?${qs}` : ''}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      // Backend returns {"conversations": [...], "count": N}
      const conversations: ConversationSession[] = Array.isArray(data) ? data : (data.conversations ?? []);
      setSessions(conversations);
      setExpandedSession(null);
      setSessionDetail(null);
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? t('errors.timeout')
          : t('admin.conversationLog.error');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [filters, token, t]);

  const fetchSessionDetail = useCallback(
    async (sessionId: string) => {
      if (expandedSession === sessionId) {
        setExpandedSession(null);
        setSessionDetail(null);
        return;
      }

      setExpandedSession(sessionId);
      setIsDetailLoading(true);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        const res = await fetch(
          getApiEndpoint(`/admin/conversations/${sessionId}`),
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ConversationDetail = await res.json();
        setSessionDetail(data);
      } catch {
        setSessionDetail(null);
      } finally {
        setIsDetailLoading(false);
      }
    },
    [expandedSession, token],
  );

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <fieldset className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <legend className="sr-only">{t('admin.conversationLog.apply')}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Start date */}
          <div>
            <label htmlFor="filter-start-date" className="block text-xs font-medium text-gray-600 mb-1">
              {t('admin.conversationLog.startDate')}
            </label>
            <input
              id="filter-start-date"
              type="date"
              value={filters.start_date}
              onChange={(e) => updateFilter('start_date', e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* End date */}
          <div>
            <label htmlFor="filter-end-date" className="block text-xs font-medium text-gray-600 mb-1">
              {t('admin.conversationLog.endDate')}
            </label>
            <input
              id="filter-end-date"
              type="date"
              value={filters.end_date}
              onChange={(e) => updateFilter('end_date', e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Role */}
          <div>
            <label htmlFor="filter-role" className="block text-xs font-medium text-gray-600 mb-1">
              {t('admin.conversationLog.role')}
            </label>
            <select
              id="filter-role"
              value={filters.role}
              onChange={(e) => updateFilter('role', e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('admin.conversationLog.allRoles')}</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <label htmlFor="filter-language" className="block text-xs font-medium text-gray-600 mb-1">
              {t('admin.conversationLog.language')}
            </label>
            <select
              id="filter-language"
              value={filters.language}
              onChange={(e) => updateFilter('language', e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('admin.conversationLog.allLanguages')}</option>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l} value={l}>{l.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Sentiment */}
          <div>
            <label htmlFor="filter-sentiment" className="block text-xs font-medium text-gray-600 mb-1">
              {t('admin.conversationLog.sentiment')}
            </label>
            <select
              id="filter-sentiment"
              value={filters.sentiment}
              onChange={(e) => updateFilter('sentiment', e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('admin.conversationLog.allSentiments')}</option>
              {SENTIMENT_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`admin.conversationLog.${s}`)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={fetchConversations}
            disabled={isLoading}
            aria-label={t('admin.conversationLog.apply')}
            className="min-h-[44px] rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('admin.conversationLog.apply')}
          </button>
          <button
            type="button"
            onClick={resetFilters}
            aria-label={t('admin.conversationLog.reset')}
            className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {t('admin.conversationLog.reset')}
          </button>
        </div>
      </fieldset>

      {/* Results */}
      <div aria-live="polite">
        {isLoading && (
          <div className="flex items-center justify-center py-12" role="status">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />
            <span className="ml-3 text-sm text-gray-500">{t('admin.conversationLog.loading')}</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center" role="alert">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={fetchConversations}
              className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              {t('admin.conversationLog.retry')}
            </button>
          </div>
        )}

        {!isLoading && !error && hasFetched && sessions.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-500">{t('admin.conversationLog.empty')}</p>
        )}

        {!isLoading && !error && sessions.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white" role="list" aria-label={t('admin.conversations')}>
            {sessions.map((session) => {
              const isExpanded = expandedSession === session.session_id;
              return (
                <li key={session.session_id}>
                  <button
                    type="button"
                    onClick={() => fetchSessionDetail(session.session_id)}
                    aria-expanded={isExpanded}
                    aria-controls={`detail-${session.session_id}`}
                    aria-label={`${t('admin.conversationLog.session')} ${session.session_id.slice(0, 8)}, ${session.message_count} ${t('admin.conversationLog.messages')}`}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 min-h-[44px] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {session.session_id.slice(0, 12)}…
                        </span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {session.user_role}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {session.language.toUpperCase()}
                        </span>
                        {session.sentiment_score != null && (
                          <SentimentBadge score={session.sentiment_score} />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {new Date(session.timestamp).toLocaleString()} · {session.message_count} {t('admin.conversationLog.messages')}
                      </p>
                    </div>
                    <svg
                      className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div id={`detail-${session.session_id}`} className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                      {isDetailLoading && (
                        <div className="flex items-center gap-2 py-4" role="status">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />
                          <span className="text-xs text-gray-500">{t('admin.conversationLog.loading')}</span>
                        </div>
                      )}

                      {!isDetailLoading && sessionDetail?.messages && (
                        <ol className="space-y-2" aria-label={`${t('admin.conversationLog.session')} ${session.session_id.slice(0, 8)} ${t('admin.conversationLog.messages')}`}>
                          {sessionDetail.messages.map((msg) => (
                            <li
                              key={msg.message_id}
                              className={`rounded-lg px-3 py-2 text-sm ${
                                msg.role === 'user'
                                  ? 'bg-blue-50 text-gray-800'
                                  : 'bg-white text-gray-700 border border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-gray-500">
                                  {msg.role === 'user'
                                    ? t('admin.conversationLog.userMessage')
                                    : t('admin.conversationLog.assistantMessage')}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            </li>
                          ))}
                        </ol>
                      )}

                      {!isDetailLoading && !sessionDetail?.messages?.length && (
                        <p className="py-4 text-center text-xs text-gray-400">{t('admin.conversationLog.empty')}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Small badge showing sentiment as a colored indicator. */
function SentimentBadge({ score }: { score: number }) {
  let color: string;
  let label: string;

  if (score > 0.2) {
    color = 'bg-green-50 text-green-700';
    label = 'positive';
  } else if (score < -0.2) {
    color = 'bg-red-50 text-red-700';
    label = 'negative';
  } else {
    color = 'bg-yellow-50 text-yellow-700';
    label = 'neutral';
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`} aria-label={`Sentiment: ${label}`}>
      {score.toFixed(2)}
    </span>
  );
}
