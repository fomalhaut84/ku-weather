/**
 * 메시지 포맷팅 공통 유틸리티
 * Slack, Telegram 등 다중 플랫폼에서 일관된 메시지 포맷을 제공합니다.
 */

import { logger } from './logger';

/**
 * 특보 종류 코드를 한글 이름으로 변환합니다.
 */
export function getWarningTypeName(warningCode: string): string {
  const warningTypes: Record<string, string> = {
    'W': '강풍',
    'R': '호우',
    'C': '한파',
    'D': '건조',
    'O': '해일',
    'N': '지진해일',
    'V': '풍랑',
    'T': '태풍',
    'S': '대설',
    'Y': '황사',
    'H': '폭염',
    'F': '안개'
  };
  return warningTypes[warningCode.trim()] || warningCode;
}

/**
 * 특보 종류별 이모지를 반환합니다.
 */
export function getWarningTypeEmoji(warningCode: string): string {
  const warningTypeName = getWarningTypeName(warningCode);
  const emojiMap: Record<string, string> = {
    '강풍': '💨',
    '호우': '🌧️',
    '한파': '🥶',
    '건조': '🏜️',
    '해일': '🌊',
    '지진해일': '🌊',
    '풍랑': '🌊',
    '태풍': '🌀',
    '대설': '❄️',
    '황사': '🌫️',
    '폭염': '🔥',
    '안개': '🌫️'
  };
  return emojiMap[warningTypeName] || '⚠️';
}

/**
 * 특보 수준 코드를 한글 이름으로 변환합니다.
 */
export function getWarningLevelName(levelCode: string): string {
  const levels: Record<string, string> = {
    '1': '예비',
    '2': '주의보',
    '3': '경보'
  };
  return levels[levelCode.trim()] || levelCode;
}

/**
 * 특보 수준별 이모지를 반환합니다.
 */
export function getWarningLevelEmoji(levelCode: string): string {
  const emojiMap: Record<string, string> = {
    '1': '🟡', // 예비 - 노란색
    '2': '🟠', // 주의보 - 주황색
    '3': '🔴'  // 경보 - 빨간색
  };
  return emojiMap[levelCode.trim()] || '⚠️';
}

/**
 * 특보 명령 코드를 한글 이름으로 변환합니다.
 */
export function getWarningCommandName(cmdCode: string): string {
  const commands: Record<string, string> = {
    '1': '발표',
    '2': '대치',
    '3': '해제',
    '4': '대치해제(자동)',
    '5': '연장',
    '6': '변경',
    '7': '변경해제'
  };
  return commands[cmdCode.trim()] || cmdCode;
}

/**
 * 날짜/시각 문자열을 YYYY-MM-DD HH:MM 형식으로 변환합니다.
 * Slack과 Telegram에서 일관된 날짜 표시를 위해 사용됩니다.
 *
 * @param dateTimeStr - YYYYMMDDHHMM 형식 또는 ISO 형식의 날짜 문자열
 * @returns YYYY-MM-DD HH:MM 형식의 문자열
 */
export function formatDateTime(dateTimeStr: string): string {
  try {
    // YYYYMMDDHHMM 형태를 YYYY-MM-DD HH:MM 형태로 변환 (기상청 API 형식)
    if (dateTimeStr.length === 12 && /^\d{12}$/.test(dateTimeStr)) {
      const year = dateTimeStr.substring(0, 4);
      const month = dateTimeStr.substring(4, 6);
      const day = dateTimeStr.substring(6, 8);
      const hour = dateTimeStr.substring(8, 10);
      const minute = dateTimeStr.substring(10, 12);
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    // ISO 형식이나 다른 형식 처리
    const date = new Date(dateTimeStr);
    if (!isNaN(date.getTime())) {
      // 한국 시간대(KST)로 명시적 변환
      const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const year = kstDate.getFullYear();
      const month = String(kstDate.getMonth() + 1).padStart(2, '0');
      const day = String(kstDate.getDate()).padStart(2, '0');
      const hour = String(kstDate.getHours()).padStart(2, '0');
      const minute = String(kstDate.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    // 변환할 수 없는 경우 원본 반환
    return dateTimeStr;
  } catch (error) {
    logger.error('Date formatting error:', error);
    return dateTimeStr;
  }
}

/**
 * 지역명으로 다음 날씨 검색 URL을 생성합니다.
 * 모바일 환경에서의 한글 URL 인코딩 문제를 해결하기 위해 지역명을 단순화합니다.
 */
export function generateWeatherSearchUrl(regionName: string): string {
  // 지역명을 검색 친화적으로 단순화
  const simplifiedRegion = simplifyRegionName(regionName);
  // 한글 공백은 + 기호로 대체하여 URL 인코딩 최소화
  const searchQuery = `${simplifiedRegion} 날씨`.replace(/\s+/g, '+');
  return `https://search.daum.net/search?w=tot&q=${searchQuery}`;
}

/**
 * 지역명을 검색에 최적화된 형태로 단순화합니다.
 */
export function simplifyRegionName(regionName: string): string {
  // 특보구역명의 복잡한 지역명을 단순화
  const regionMappings: Record<string, string> = {
    // 서울 지역
    '서울강북': '서울 강북구',
    '서울강남': '서울 강남구',
    '서울강서': '서울 강서구',
    '서울강동': '서울 강동구',
    '서울종로': '서울 종로구',
    '서울중구': '서울 중구',
    '서울용산': '서울 용산구',
    '서울성동': '서울 성동구',
    '서울광진': '서울 광진구',
    '서울동대문': '서울 동대문구',
    '서울중랑': '서울 중랑구',
    '서울성북': '서울 성북구',
    '서울도봉': '서울 도봉구',
    '서울노원': '서울 노원구',
    '서울은평': '서울 은평구',
    '서울서대문': '서울 서대문구',
    '서울마포': '서울 마포구',
    '서울양천': '서울 양천구',
    '서울구로': '서울 구로구',
    '서울금천': '서울 금천구',
    '서울영등포': '서울 영등포구',
    '서울동작': '서울 동작구',
    '서울관악': '서울 관악구',
    '서울서초': '서울 서초구',
    '서울송파': '서울 송파구',

    // 제주 지역 (가장 문제가 되는 긴 지역명)
    '제주도북부중산간': '제주',
    '제주도남부중산간': '제주',
    '제주도북부': '제주',
    '제주도남부': '제주',
    '제주도서부': '제주',
    '제주도동부': '제주',
    '제주북부중산간': '제주',
    '제주남부중산간': '제주',
    '제주북부': '제주',
    '제주남부': '제주',
    '제주서부': '제주',
    '제주동부': '제주',

    // 기타 복잡한 지역명들
    '인천강화': '인천 강화',
    '인천옹진': '인천 옹진',
    '경기동두천': '동두천',
    '경기과천': '과천',
    '경기구리': '구리',
    '경기남양주': '남양주',
    '경기오산': '오산',
    '경기시흥': '시흥',
    '경기군포': '군포',
    '경기의왕': '의왕',
    '경기하남': '하남',

    // 해상 지역들 (간소화)
    '서해북부먼바다': '서해',
    '서해중부먼바다': '서해',
    '서해남부먼바다': '서해',
    '남해동부먼바다': '남해',
    '남해서부먼바다': '남해',
    '동해북부먼바다': '동해',
    '동해중부먼바다': '동해',
    '동해남부먼바다': '동해',
    '제주도먼바다': '제주 바다'
  };

  // 매핑된 지역명이 있으면 사용, 없으면 원본에서 불필요한 접미사 제거
  if (regionMappings[regionName]) {
    return regionMappings[regionName];
  }

  // 기본적인 정리: 특별시, 광역시, 도 등의 접미사 처리
  let simplified = regionName
    .replace(/특별시$/, '')
    .replace(/광역시$/, '')
    .replace(/특별자치시$/, '')
    .replace(/특별자치도$/, '')
    .replace(/도$/, '')
    .replace(/시$/, '')
    .replace(/군$/, '')
    .replace(/구$/, '');

  // 너무 긴 지역명은 앞 2-3글자만 사용
  if (simplified.length > 4) {
    simplified = simplified.substring(0, 3);
  }

  return simplified || regionName;
}
