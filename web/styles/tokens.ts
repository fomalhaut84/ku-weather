/** Circuit Breaker 상태별 스타일 */
export const cbStateStyles: Record<string, { bg: string; text: string; label: string }> = {
  CLOSED: { bg: 'bg-green-100', text: 'text-green-800', label: '정상' },
  HALF_OPEN: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '반개방' },
  OPEN: { bg: 'bg-red-100', text: 'text-red-800', label: '차단' },
};

/** Chart.js 공통 8색 팔레트 (배경색, alpha 0.8) */
export const chartPalette = {
  backgrounds: [
    'rgba(59, 130, 246, 0.8)',   // 파란색
    'rgba(16, 185, 129, 0.8)',   // 초록색
    'rgba(245, 158, 11, 0.8)',   // 노란색
    'rgba(239, 68, 68, 0.8)',    // 빨간색
    'rgba(168, 85, 247, 0.8)',   // 보라색
    'rgba(236, 72, 153, 0.8)',   // 분홍색
    'rgba(14, 165, 233, 0.8)',   // 하늘색
    'rgba(34, 197, 94, 0.8)',    // 연두색
  ],
  borders: [
    'rgba(59, 130, 246, 1)',
    'rgba(16, 185, 129, 1)',
    'rgba(245, 158, 11, 1)',
    'rgba(239, 68, 68, 1)',
    'rgba(168, 85, 247, 1)',
    'rgba(236, 72, 153, 1)',
    'rgba(14, 165, 233, 1)',
    'rgba(34, 197, 94, 1)',
  ],
} as const;
