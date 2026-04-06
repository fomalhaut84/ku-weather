/**
 * 특보 명령 관련 상수
 */

import type { WeatherCommandCode } from '../types/weather';

/** 특보 명령별 한글 이름 */
export const WARNING_COMMAND_NAMES: Readonly<Record<WeatherCommandCode, string>> = {
  '1': '발표',
  '2': '대치',
  '3': '해제',
  '4': '대치해제(자동)',
  '5': '연장',
  '6': '변경',
  '7': '변경해제',
};

/** 특보 명령 코드를 한글 이름으로 변환 */
export function getWarningCommandName(code: string): string {
  return WARNING_COMMAND_NAMES[code.trim() as WeatherCommandCode] ?? code;
}
