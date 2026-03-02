// SPDX-License-Identifier: MIT
'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { getApiEndpoint } from '@/lib/config';

interface LeadCaptureFormProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
}

const AREA_OPTIONS = [
  'Mental Health First Aid Training',
  'Instructor Certification',
  'Workplace Wellness',
  'Youth Mental Health',
  'Community Programs',
  'Other',
] as const;

/** Simple email validation: non-empty local part, @, non-empty domain with dot. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Modal form for capturing lead information from unauthenticated users.
 * Users can dismiss without restricting functionality (Req 6.4).
 */
export default function LeadCaptureForm({
  isOpen,
  onClose,
  sessionId,
}: LeadCaptureFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [areaOfInterest, setAreaOfInterest] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);
  const lastFocusableRef = useRef<HTMLButtonElement>(null);

  // Focus the first input when the modal opens
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
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap within the modal
  const handleTabTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, select, button, textarea, [tabindex]:not([tabindex="-1"])',
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
    setName('');
    setEmail('');
    setAreaOfInterest('');
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

    // Client-side validation
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!areaOfInterest) {
      setError('Please select an area of interest.');
      return;
    }

    setIsSubmitting(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(getApiEndpoint('/leads'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          area_of_interest: areaOfInterest,
          ...(sessionId ? { session_id: sessionId } : {}),
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
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-capture-title"
        onKeyDown={handleTabTrap}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        {isSuccess ? (
          /* Success state */
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
            <h2 id="lead-capture-title" className="text-lg font-semibold text-gray-800">
              Thank you!
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              We&apos;ve received your information and will be in touch soon.
            </p>
            <button
              ref={lastFocusableRef}
              type="button"
              onClick={handleClose}
              className="mt-6 min-h-[44px] w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Continue chatting
            </button>
          </div>
        ) : (
          /* Form state */
          <>
            <h2
              id="lead-capture-title"
              className="text-lg font-semibold text-gray-800"
            >
              Stay connected
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Share your details so we can follow up with resources tailored to your interests.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              {/* Name */}
              <div>
                <label
                  htmlFor="lead-name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Name
                </label>
                <input
                  ref={firstFocusableRef}
                  id="lead-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="lead-email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <input
                  id="lead-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Area of Interest */}
              <div>
                <label
                  htmlFor="lead-area"
                  className="block text-sm font-medium text-gray-700"
                >
                  Area of interest
                </label>
                <select
                  id="lead-area"
                  value={areaOfInterest}
                  onChange={(e) => setAreaOfInterest(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="" disabled>
                    Select an area
                  </option>
                  {AREA_OPTIONS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error display */}
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[44px] w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit'}
                </button>
                <button
                  ref={lastFocusableRef}
                  type="button"
                  onClick={handleClose}
                  className="min-h-[44px] w-full rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  No thanks
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
