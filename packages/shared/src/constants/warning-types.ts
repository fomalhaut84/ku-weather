/**
 * 특보 종류 관련 상수
 */

import type { WeatherWarningType } from '../types/weather';

/** 특보 종류별 한글 이름 */
export const WARNING_TYPE_NAMES: Readonly<Record<WeatherWarningType, string>> = {
  W: '강풍',
  R: '호우',
  C: '한파',
  D: '건조',
  O: '해일',
  N: '지진해일',
  V: '풍랑',
  T: '태풍',
  S: '대설',
  Y: '황사',
  H: '폭염',
  F: '안개',
};

/** 특보 종류별 이모지 */
export const WARNING_TYPE_EMOJI: Readonly<Record<WeatherWarningType, string>> = {
  W: '💨',
  R: '🌧️',
  C: '🥶',
  D: '🔥',
  O: '🌊',
  N: '🌊',
  V: '🌊',
  T: '🌀',
  S: '❄️',
  Y: '🟡',
  H: '☀️',
  F: '🌫️',
};

/** 특보 종류 코드를 한글 이름으로 변환 */
export function getWarningTypeName(code: string | null | undefined): string {
  const normalized = typeof code === 'string' ? code.trim() : '';
  return WARNING_TYPE_NAMES[normalized as WeatherWarningType] ?? normalized;
}

/** 특보 종류 코드를 이모지로 변환 */
export function getWarningTypeEmoji(code: string | null | undefined): string {
  const normalized = typeof code === 'string' ? code.trim() : '';
  return WARNING_TYPE_EMOJI[normalized as WeatherWarningType] ?? '⚠️';
}
