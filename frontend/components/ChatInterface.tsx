// SPDX-License-Identifier: MIT
'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStreamingChat, Message, Citation } from '@/hooks/useStreamingChat';
import { useLanguage } from '@/contexts/LanguageContext';

/** Role-based suggested prompts shown on the welcome screen. */
const SUGGESTED_PROMPTS: Record<string, string[]> = {
  instructor: [
    'How do I manage my upcoming MHFA courses?',
    'What are the invoicing guidelines for instructors?',
    'Where can I find the Instructor Policy Handbook?',
  ],
  internal_staff: [
    'Show me recent conversation analytics.',
    'What are the current operational guidelines?',
    'How do I access admin guidance for training support?',
  ],
  learner: [
    'What is Mental Health First Aid training?',
    'How do I get my MHFA certification?',
    'Where can I find additional MHFA resources?',
  ],
};

interface ChatInterfaceProps {
  userRole: 'instructor' | 'internal_staff' | 'learner';
  token: string;
}

export default function ChatInterface({ userRole, token }: ChatInterfaceProps) {
  const { messages, isLoading, isStreaming, sendMessage } =
    useStreamingChat();
  const { language } = useLanguage();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const [lastAnnouncedId, setLastAnnouncedId] = useState<string | null>(null);

  const prompts = SUGGESTED_PROMPTS[userRole] ?? SUGGESTED_PROMPTS.learner;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Derive the latest completed assistant message id for the effect dependency
  const latestCompletedAssistantId =
    [...messages].reverse().find((m) => m.role === 'assistant' && !m.isStreaming)
      ?.id ?? null;

  // Announce new completed assistant messages to screen readers
  useEffect(() => {
    if (!latestCompletedAssistantId) return;
    if (latestCompletedAssistantId === lastAnnouncedId) return;

    const msg = messages.find((m) => m.id === latestCompletedAssistantId);
    if (msg) {
      setLastAnnouncedId(latestCompletedAssistantId);
      setAnnouncement(
        `New response: ${msg.content.substring(0, 300)}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCompletedAssistantId]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed, language, token);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt, language, token);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full max-h-[100dvh] bg-white">
      {/* ARIA live region for screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {announcement}
      </div>

      {/* Message list area */}
      <div
        role="log"
        aria-label="Chat messages"
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {!hasMessages ? (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">
              Welcome to Learning Navigator
            </h2>
            <p className="text-gray-500 mb-8 max-w-md">
              Ask me anything about MHFA training, resources, and support.
            </p>
            <div className="grid gap-3 w-full max-w-lg">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  aria-label={`Suggested prompt: ${prompt}`}
                  className="min-h-[44px] px-4 py-3 text-left text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <>
            {messages.map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-start gap-3" aria-label="Loading response">
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1.5" role="status" aria-label="Generating response">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message…"
            aria-label="Message input"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px] max-h-40 overflow-y-auto"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders a single message row with role-based alignment and styling. */
function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      role="article"
      aria-label={`${isUser ? 'Your' : 'Assistant'} message`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-800 rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-1">Sources:</p>
            <ul className="space-y-1">
              {message.citations.map((citation, idx) => (
                <CitationItem key={idx} citation={citation} index={idx} />
              ))}
            </ul>
          </div>
        )}

        {/* Streaming cursor */}
        {!isUser && message.isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/** Renders a single citation reference. */
function CitationItem({ citation, index }: { citation: Citation; index: number }) {
  return (
    <li className="text-xs text-gray-500">
      <span className="font-medium">[{index + 1}]</span>{' '}
      <span>{citation.document}</span>
      {citation.section && (
        <span className="text-gray-400"> — {citation.section}</span>
      )}
    </li>
  );
}
