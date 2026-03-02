// SPDX-License-Identifier: MIT
'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { getApiEndpoint } from '@/lib/config';

interface EscalationPromptProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  userRole: string;
  conversationSummary: string;
}

/** Simple email validation: non-empty local part, @, non-empty domain with dot. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Two-step escalation confirmation dialog.
 * Step 1: Confirm escalation and provide contact email.
 * Step 2: Success confirmation message.
 * Requirements: 5.1 (offer escalation option), 5.3 (display confirmation after recorded).
 */
export default function EscalationPrompt({
  isOpen,
  onClose,
  sessionId,
  userRole,
  conversationSummary,
}: EscalationPromptProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);
  const lastFocusableRef = useRef<HTMLButtonElement>(null);

  // Focus the email input when the modal opens
  useEffect(() => {
    if (isOpen) {
      firstFocusableRef.current?.focus();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus trap within the modal
  const handleTabTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements || focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const resetForm = () => {
    setEmail('');
    setError('');
    setIsSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(getApiEndpoint('/escalations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          summary: conversationSummary,
          user_role: userRole,
          contact_email: email.trim(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'Something went wrong. Please try again.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // Use default error message
        }
        setError(errorMessage);
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError('Network error. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="escalation-title"
        onKeyDown={handleTabTrap}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        {isSuccess ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 id="escalation-title" className="text-lg font-semibold text-gray-800">
              Request submitted
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Your request has been submitted. A support team member will follow up.
            </p>
            <button
              ref={lastFocusableRef}
              type="button"
              onClick={handleClose}
              className="mt-6 min-h-[44px] w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2
              id="escalation-title"
              className="text-lg font-semibold text-gray-800"
            >
              Connect with support
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Would you like to connect with a support team member? Provide your email and we&apos;ll follow up.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="escalation-email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <input
                  ref={firstFocusableRef}
                  id="escalation-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[44px] w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Submitting…' : 'Confirm'}
                </button>
                <button
                  ref={lastFocusableRef}
                  type="button"
                  onClick={handleClose}
                  className="min-h-[44px] w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
