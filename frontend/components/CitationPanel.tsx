// SPDX-License-Identifier: MIT
'use client';

import { useState } from 'react';
import type { Citation } from '@/hooks/useStreamingChat';

interface CitationPanelProps {
  citations: Citation[];
}

/**
 * Expandable panel that displays source citations as clickable cards.
 * Each card links to the S3 source document.
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
        <span>Sources ({citations.length})</span>
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
        <div className="px-3 pb-3 grid gap-2">
          {citations.map((citation, idx) => {
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
    </div>
  );
}
