/**
 * 특보 수준 관련 상수
 */

import type { WeatherWarningLevel } from '../types/weather';

/** 특보 수준별 한글 이름 */
export const WARNING_LEVEL_NAMES: Readonly<Record<WeatherWarningLevel, string>> = {
  '1': '예비특보',
  '2': '주의보',
  '3': '경보',
};

/** 특보 수준별 이모지 */
export const WARNING_LEVEL_EMOJI: Readonly<Record<WeatherWarningLevel, string>> = {
  '1': '🟡',
  '2': '🟠',
  '3': '🔴',
};

/** 특보 수준별 Tailwind CSS 색상 클래스 */
export const WARNING_LEVEL_COLORS: Readonly<Record<WeatherWarningLevel, string>> = {
  '1': 'bg-[#bfdbfe] border-blue-500 text-blue-900',
  '2': 'bg-[#fde047] border-yellow-600 text-yellow-900',
  '3': 'bg-[#dc2626] border-red-700 text-white',
};

/** 특보 수준 코드를 한글 이름으로 변환 */
export function getWarningLevelName(code: string): string {
  return WARNING_LEVEL_NAMES[code.trim() as WeatherWarningLevel] ?? code;
}

/** 특보 수준 코드를 이모지로 변환 */
export function getWarningLevelEmoji(code: string): string {
  return WARNING_LEVEL_EMOJI[code.trim() as WeatherWarningLevel] ?? '⚠️';
}
