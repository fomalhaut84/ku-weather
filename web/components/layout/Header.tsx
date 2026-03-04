'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: '특보 현황' },
  { href: '/settings', label: '구독 설정' },
  { href: '/monitoring', label: '알림 모니터링' },
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="text-lg font-bold text-slate-800 hover:text-blue-600 transition-colors">
            🌦️ 기상특보
          </Link>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label }) => {
              const isActive = pathname === href || pathname?.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
