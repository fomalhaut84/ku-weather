'use client';

import { useState, type ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export default function Card({
  title,
  children,
  className = '',
  collapsible = false,
  defaultOpen = true,
}: CardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`.trim()}>
      {title && (
        <h3
          className={`text-lg font-semibold mb-4 ${collapsible ? 'cursor-pointer select-none flex items-center justify-between' : ''}`}
          onClick={collapsible ? () => setOpen(prev => !prev) : undefined}
        >
          <span>{title}</span>
          {collapsible && (
            <svg
              className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </h3>
      )}
      {(!collapsible || open) && children}
    </div>
  );
}
