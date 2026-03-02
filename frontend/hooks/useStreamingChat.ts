// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback, useRef } from 'react';
import { config } from '@/lib/config';

/** Source citation attached to an assistant response. */
export interface Citation {
  document: string;
  section: string;
}

/** A single chat message (user or assistant). */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming: boolean;
}

/** SSE event types emitted by the chat handler. */
export interface StreamEvent {
  type: 'text-delta' | 'citations' | 'finish' | 'error';
  content?: string;
  sources?: Citation[];
  message_id?: string;
  message?: string;
}

const SESSION_KEY = 'learning_navigator_session_id';
const MAX_INPUT_LENGTH = 10000;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Generate a session ID with minimum 33 characters.
 * Format: session_<timestamp_base36>_<random><random>
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2, 15);
  const random2 = Math.random().toString(36).substring(2, 15);
  let sessionId = `session_${timestamp}_${random1}${random2}`;
  while (sessionId.length < 33) {
    sessionId += Math.random().toString(36).substring(2, 3);
  }
  return sessionId;
}

/**
 * Retrieve or create a session ID stored in sessionStorage.
 */
function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return generateSessionId();
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Sanitize user input: trim whitespace, strip HTML tags, enforce max length.
 */
function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/<[^>]*>/g, '')
    .substring(0, MAX_INPUT_LENGTH);
}

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Custom hook for SSE streaming chat with session management.
 *
 * Manages the message list, session ID, loading/streaming states,
 * and handles the SSE event protocol from the chat Lambda Function URL.
 */
export function useStreamingChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (query: string, language: string, token: string) => {
      const sanitized = sanitizeInput(query);
      if (!sanitized) return;

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: sanitized,
        isStreaming: false,
      };

      const assistantMessageId = generateMessageId();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(config.chatFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: sanitized,
            session_id: sessionIdRef.current,
            language,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
          } catch {
            // Use default error message
          }
          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Lambda Function URL may wrap SSE chunks in JSON strings
          let chunk = decoder.decode(value, { stream: true });
          try {
            const unwrapped = JSON.parse(chunk);
            if (typeof unwrapped === 'string') chunk = unwrapped;
          } catch {
            // Not JSON-wrapped, use raw chunk
          }

          buffer += chunk;
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let eventData: string | null = null;

            for (const line of lines) {
              if (line.startsWith('data:')) {
                eventData = line.substring(5).trim();
              } else if (line.startsWith('data: ')) {
                eventData = line.substring(6);
              }
            }

            if (!eventData) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(eventData);
            } catch {
              continue;
            }

            switch (event.type) {
              case 'text-delta':
                setIsLoading(false);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + (event.content ?? '') }
                      : msg,
                  ),
                );
                break;

              case 'citations':
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, citations: event.sources ?? [] }
                      : msg,
                  ),
                );
                break;

              case 'finish':
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, isStreaming: false }
                      : msg,
                  ),
                );
                setIsStreaming(false);
                setIsLoading(false);
                break;

              case 'error':
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: event.message ?? 'An error occurred',
                          isStreaming: false,
                        }
                      : msg,
                  ),
                );
                setIsStreaming(false);
                setIsLoading(false);
                break;
            }
          }
        }

        // If stream ended without a finish event, mark complete
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId && msg.isStreaming
              ? { ...msg, isStreaming: false }
              : msg,
          ),
        );
        setIsStreaming(false);
        setIsLoading(false);
      } catch (error) {
        clearTimeout(timeoutId);

        let errorContent = 'An unexpected error occurred. Please try again.';
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            errorContent = 'Request timed out. Please try again.';
          } else if (error.message.includes('Failed to fetch')) {
            errorContent = 'Network error. Please check your connection.';
          } else {
            errorContent = error.message;
          }
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: errorContent, isStreaming: false }
              : msg,
          ),
        );
        setIsStreaming(false);
        setIsLoading(false);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    // Generate a new session for the next conversation
    const newSessionId = generateSessionId();
    sessionIdRef.current = newSessionId;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, newSessionId);
    }
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    clearMessages,
    sessionId: sessionIdRef.current,
  };
}
