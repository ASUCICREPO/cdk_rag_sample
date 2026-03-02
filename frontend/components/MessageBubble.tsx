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

            {/* Citations as clickable source cards */}
            {!message.isStreaming &&
              message.citations &&
              message.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-2">Sources</p>
                  <div className="grid gap-2">
                    {message.citations.map((citation, idx) => {
                      const displayName = decodeURIComponent(citation.document)
                        .replace(/\.pdf$/i, '')
                        .replace(/_/g, ' ');
                      return (
                        <a
                          key={idx}
                          href={citation.section}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Source ${idx + 1}: ${displayName}`}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors group"
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-100 text-blue-600 shrink-0 group-hover:bg-blue-200 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                              <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-800 truncate group-hover:text-blue-700 transition-colors">
                              {displayName}
                            </p>
                            <p className="text-[10px] text-gray-400">PDF Document</p>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" aria-hidden="true">
                            <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                          </svg>
                        </a>
                      );
                    })}
                  </div>
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
