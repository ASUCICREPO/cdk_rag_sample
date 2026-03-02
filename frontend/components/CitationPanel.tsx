// SPDX-License-Identifier: MIT
'use client';

import { useState } from 'react';
import type { Citation } from '@/hooks/useStreamingChat';

interface CitationPanelProps {
  citations: Citation[];
}

/**
 * Expandable panel that displays source citations with document name and section.
 * Provides a richer citation experience than the inline citations in MessageBubble.
 */
export default function CitationPanel({ citations }: CitationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls="citation-panel-content"
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors"
      >
        <span>
          Sources ({citations.length})
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <div
        id="citation-panel-content"
        role="region"
        aria-label="Citation details"
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <ul className="px-3 pb-3 space-y-2">
          {citations.map((citation, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs"
            >
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded bg-blue-100 text-blue-700 font-semibold shrink-0">
                {idx + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {citation.document}
                </p>
                {citation.section && (
                  <p className="text-gray-500 truncate">
                    {citation.section}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
