// SPDX-License-Identifier: MIT
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { configureAmplify } from '@/lib/amplify-config';
import '@/lib/i18n';
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import Link from 'next/link';
import ConversationLog from '@/components/ConversationLog';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import EscalationQueue from '@/components/EscalationQueue';
import FeedbackAnalytics from '@/components/FeedbackAnalytics';

type AdminTab = 'conversations' | 'analytics' | 'escalations' | 'feedback';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string;
  role: string;
  token: string;
}

const INITIAL_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  username: '',
  role: '',
  token: '',
};

const TABS: { key: AdminTab; labelKey: string }[] = [
  { key: 'conversations', labelKey: 'admin.conversations' },
  { key: 'analytics', labelKey: 'admin.analytics' },
  { key: 'escalations', labelKey: 'admin.escalations' },
  { key: 'feedback', labelKey: 'admin.feedback' },
];

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [authState, setAuthState] = useState<AuthState>(INITIAL_AUTH_STATE);
  const [activeTab, setActiveTab] = useState<AdminTab>('conversations');

  useEffect(() => {
    configureAmplify();
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      const accessToken = session.tokens?.accessToken?.toString() ?? '';
      const role = (idToken?.payload?.['custom:role'] as string) ?? '';
      const displayName =
        (idToken?.payload?.['preferred_username'] as string) ??
        (idToken?.payload?.['email'] as string) ??
        '';

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        username: displayName,
        role,
        token: accessToken,
      });
    } catch {
      setAuthState({
        ...INITIAL_AUTH_STATE,
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Best-effort sign out
    }
    setAuthState({ ...INITIAL_AUTH_STATE, isLoading: false });
  };

  // Loading state
  if (authState.isLoading) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-gray-50"
        role="status"
        aria-label="Loading admin dashboard"
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!authState.isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg text-center" role="alert">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Authentication required</h2>
          <p className="mt-2 text-sm text-gray-500">
            Please sign in to access the admin dashboard.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  // Access denied — authenticated but not internal_staff
  if (authState.role !== 'internal_staff') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg text-center" role="alert">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <svg
              className="h-6 w-6 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Access denied</h2>
          <p className="mt-2 text-sm text-gray-500">
            The admin dashboard is restricted to internal staff members.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Back to chat
          </Link>
        </div>
      </div>
    );
  }

  // Authenticated as internal_staff — render admin dashboard
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            aria-label="Back to chat"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-800">
            {t('admin.dashboardTitle')}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:inline">
            {authState.username}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.5 3.75a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5V15a.75.75 0 0 0-1.5 0v3.75a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5.25a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3V9a.75.75 0 0 0 1.5 0V5.25a1.5 1.5 0 0 1 1.5-1.5h6ZM5.78 8.47a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 0 0-1.06-1.06l-1.72 1.72V4.5a.75.75 0 0 0-1.5 0v5.69l-1.72-1.72Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="border-b border-gray-200 bg-white px-4 sm:px-6" aria-label="Admin dashboard tabs">
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[44px] whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {TABS.map((tab) => (
          <div
            key={tab.key}
            id={`panel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.key}`}
            hidden={activeTab !== tab.key}
          >
            {activeTab === tab.key && (
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                {tab.key === 'conversations' ? (
                  <ConversationLog token={authState.token} />
                ) : tab.key === 'analytics' ? (
                  <AnalyticsPanel token={authState.token} />
                ) : tab.key === 'escalations' ? (
                  <EscalationQueue token={authState.token} />
                ) : tab.key === 'feedback' ? (
                  <FeedbackAnalytics token={authState.token} />
                ) : (
                  <>
                    <h2 className="text-base font-semibold text-gray-800">
                      {t(tab.labelKey)}
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Content for {tab.key} will be rendered here.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
