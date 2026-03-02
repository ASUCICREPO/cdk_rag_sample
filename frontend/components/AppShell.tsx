// SPDX-License-Identifier: MIT
'use client';

import { useState, useEffect, useCallback } from 'react';
import { configureAmplify } from '@/lib/amplify-config';
import '@/lib/i18n';
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import ChatInterface from '@/components/ChatInterface';
import LanguageSelector from '@/components/LanguageSelector';
import LeadCaptureForm from '@/components/LeadCaptureForm';

type UserRole = 'instructor' | 'internal_staff' | 'learner';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isTokenExpired: boolean;
  username: string;
  userRole: UserRole;
  token: string;
}

const INITIAL_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  isTokenExpired: false,
  username: '',
  userRole: 'learner',
  token: '',
};

// ADR: Token refresh interval | Rationale: 10 min keeps tokens fresh before typical 60-min expiry | Alternative: on-demand only (rejected — risks mid-chat failures)
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export default function AppShell() {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_AUTH_STATE);
  const [showLeadCapture, setShowLeadCapture] = useState(false);

  // Initialize Amplify once on mount
  useEffect(() => {
    configureAmplify();
  }, []);

  /**
   * Fetch the current auth session, extract role and token.
   * On token expiry errors, sets isTokenExpired so the UI can prompt re-auth
   * while preserving conversation state (Req 9.6).
   */
  const refreshAuth = useCallback(async () => {
    try {
      await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      const accessToken = session.tokens?.accessToken?.toString() ?? '';
      const role =
        (idToken?.payload?.['custom:role'] as UserRole) || 'learner';
      const displayName =
        (idToken?.payload?.['preferred_username'] as string) ??
        (idToken?.payload?.['email'] as string) ??
        '';

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        isTokenExpired: false,
        username: displayName,
        userRole: role,
        token: accessToken,
      });
    } catch {
      // If we were previously authenticated, treat as token expiry
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: prev.isAuthenticated ? prev.isAuthenticated : false,
        isTokenExpired: prev.isAuthenticated,
        token: '',
      }));
    }
  }, []);

  // Check auth on mount and set up periodic token refresh
  useEffect(() => {
    refreshAuth();
    const interval = setInterval(refreshAuth, TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshAuth]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Best-effort sign out
    }
    setAuthState({ ...INITIAL_AUTH_STATE, isLoading: false });
  };

  const handleReAuth = async () => {
    setAuthState((prev) => ({
      ...prev,
      isTokenExpired: false,
      isAuthenticated: false,
    }));
  };

  // Loading state
  if (authState.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
            role="status"
            aria-label="Loading"
          />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  // Token expired — show re-auth prompt while preserving conversation
  if (authState.isTokenExpired) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
        <div
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg text-center"
          role="alert"
        >
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
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">
            Session expired
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Your session has expired. Please sign in again to continue. Your
            conversation will be preserved.
          </p>
          <button
            type="button"
            onClick={handleReAuth}
            className="mt-6 min-h-[44px] w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  // Not authenticated — show Amplify Authenticator with optional lead capture
  if (!authState.isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-gray-800">
          Learning Navigator
        </h1>
        <Authenticator>
          {({ user }) => {
            // Once Authenticator reports a user, refresh our auth state
            if (user) {
              refreshAuth();
            }
            return <></>;
          }}
        </Authenticator>
        <button
          type="button"
          onClick={() => setShowLeadCapture(true)}
          className="mt-6 text-sm text-blue-600 hover:text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        >
          Not a member? Get in touch
        </button>
        <LeadCaptureForm
          isOpen={showLeadCapture}
          onClose={() => setShowLeadCapture(false)}
        />
      </div>
    );
  }

  // Authenticated — render the main chat UI
  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-800">
          Learning Navigator
        </h1>
        <div className="flex items-center gap-3">
          <LanguageSelector />
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

      {/* Chat area */}
      <main className="flex-1 overflow-hidden">
        <ChatInterface
          userRole={authState.userRole}
          token={authState.token}
        />
      </main>
    </div>
  );
}
