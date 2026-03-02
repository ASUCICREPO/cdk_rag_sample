// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiEndpoint } from '@/lib/config';

interface Escalation {
  escalation_id: string;
  session_id: string;
  summary: string;
  user_role: string;
  contact_email: string;
  status: 'pending' | 'resolved';
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

interface EscalationQueueProps {
  token: string;
}

type StatusFilter = 'pending' | 'resolved';

export default function EscalationQueue({ token }: EscalationQueueProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchEscalations = useCallback(async (status?: StatusFilter) => {
    const filterStatus = status ?? statusFilter;
    setIsLoading(true);
    setError(null);
    setHasFetched(true);

    const url = getApiEndpoint(`/admin/escalations?status=${filterStatus}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Backend returns {"escalations": [...], "count": N}
      const escalationList: Escalation[] = Array.isArray(data) ? data : (data.escalations ?? []);
      setEscalations(escalationList);
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? t('errors.timeout')
          : t('admin.escalationQueue.error');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, token, t]);

  const resolveEscalation = useCallback(async (escalationId: string) => {
    setResolvingId(escalationId);

    const url = getApiEndpoint(`/admin/escalations/${escalationId}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Refresh the list after resolving
      await fetchEscalations();
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? t('errors.timeout')
          : t('admin.escalationQueue.resolveError');
      setError(message);
    } finally {
      setResolvingId(null);
    }
  }, [token, t, fetchEscalations]);

  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status);
    fetchEscalations(status);
  };

  return (
    <div className="space-y-6">
      {/* Status filter + fetch */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="escalation-status-filter" className="block text-xs font-medium text-gray-600 mb-1">
            {t('admin.escalationQueue.statusLabel')}
          </label>
          <select
            id="escalation-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
            aria-label={t('admin.escalationQueue.statusLabel')}
            className="min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="pending">{t('admin.escalationQueue.pending')}</option>
            <option value="resolved">{t('admin.escalationQueue.resolved')}</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => fetchEscalations()}
          disabled={isLoading}
          aria-label={t('admin.escalationQueue.load')}
          className="min-h-[44px] rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('admin.escalationQueue.load')}
        </button>
      </div>

      {/* Results */}
      <div aria-live="polite">
        {isLoading && (
          <div className="flex items-center justify-center py-12" role="status">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />
            <span className="ml-3 text-sm text-gray-500">{t('admin.escalationQueue.loading')}</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center" role="alert">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => fetchEscalations()}
              className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              {t('admin.escalationQueue.retry')}
            </button>
          </div>
        )}

        {!isLoading && !error && hasFetched && escalations.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-500">{t('admin.escalationQueue.empty')}</p>
        )}

        {!isLoading && !error && escalations.length > 0 && (
          <ul
            className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white"
            role="list"
            aria-label={t('admin.escalations')}
          >
            {escalations.map((esc) => (
              <li key={esc.escalation_id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* ID + badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {esc.escalation_id.slice(0, 12)}…
                      </span>
                      <StatusBadge status={esc.status} />
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {esc.user_role}
                      </span>
                    </div>

                    {/* Summary */}
                    <p className="text-sm text-gray-700">{esc.summary}</p>

                    {/* Meta */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{esc.contact_email}</span>
                      <span>{new Date(esc.created_at).toLocaleString()}</span>
                      {esc.resolved_at && (
                        <span>
                          {t('admin.escalationQueue.resolvedAt')}: {new Date(esc.resolved_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resolve button — only for pending */}
                  {esc.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => resolveEscalation(esc.escalation_id)}
                      disabled={resolvingId === esc.escalation_id}
                      aria-label={`${t('admin.escalationQueue.resolve')} ${esc.escalation_id.slice(0, 8)}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {resolvingId === esc.escalation_id
                        ? t('admin.escalationQueue.resolving')
                        : t('admin.escalationQueue.resolve')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'resolved' }) {
  const color =
    status === 'pending'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-green-50 text-green-700';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  );
}
