// SPDX-License-Identifier: MIT
'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '@/hooks/useStreamingChat';

interface MessageBubbleProps {
  message: Message;
  onFeedback?: (messageId: string, rating: 'positive' | 'negative') => void;
}

export default function MessageBubble({ message, onFeedback }: MessageBubbleProps) {
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
          <>
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>

            {/* Streaming cursor */}
            {message.isStreaming && (
              <span
                className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom"
                aria-hidden="true"
              />
            )}

            {/* Citations */}
            {!message.isStreaming &&
              message.citations &&
              message.citations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">Sources:</p>
                  <ul className="space-y-1">
                    {message.citations.map((citation, idx) => (
                      <li key={idx} className="text-xs text-gray-500">
                        <span className="font-medium">[{idx + 1}]</span>{' '}
                        <span>{citation.document}</span>
                        {citation.section && (
                          <span className="text-gray-400"> — {citation.section}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Feedback buttons — only when not streaming */}
            {!message.isStreaming && onFeedback && (
              <FeedbackButtons messageId={message.id} onFeedback={onFeedback} />
            )}
          </>
        )}
      </div>
    </div>
  );
}


/** Thumbs up / thumbs down feedback controls for assistant messages. */
function FeedbackButtons({
  messageId,
  onFeedback,
}: {
  messageId: string;
  onFeedback: (messageId: string, rating: 'positive' | 'negative') => void;
}) {
  const [selected, setSelected] = useState<'positive' | 'negative' | null>(null);

  const handleClick = (rating: 'positive' | 'negative') => {
    if (selected) return; // already rated
    setSelected(rating);
    onFeedback(messageId, rating);
  };

  return (
    <div className="mt-2 flex gap-1" role="group" aria-label="Rate this response">
      <button
        type="button"
        onClick={() => handleClick('positive')}
        disabled={selected !== null}
        aria-label="Thumbs up"
        aria-pressed={selected === 'positive'}
        className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          selected === 'positive'
            ? 'bg-green-100 text-green-600'
            : selected !== null
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => handleClick('negative')}
        disabled={selected !== null}
        aria-label="Thumbs down"
        aria-pressed={selected === 'negative'}
        className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          selected === 'negative'
            ? 'bg-red-100 text-red-600'
            : selected !== null
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M17 14V2" />
          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>
    </div>
  );
}
