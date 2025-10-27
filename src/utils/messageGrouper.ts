/**
 * 메시지 그루핑 유틸리티
 * 특보 변동사항을 수준/종류/상위지역별로 그루핑합니다.
 */

import { AlertChange, AlertChangeType, CachedAlert } from '../types/weather';

/**
 * 그루핑된 알림 데이터 구조
 */
export interface GroupedAlert {
  /** 특보 수준: "1" (예비), "2" (주의보), "3" (경보) */
  level: string;
  /** 특보 종류: "W" (강풍), "R" (호우), "C" (한파), etc. */
  warningType: string;
  /** 변동 유형: "NEW", "RESOLVED", "LEVEL_UP", etc. */
  changeType: AlertChangeType;
  /** 상위지역별 지역명 맵: upperRegion -> [regionNames] */
  regions: Map<string, string[]>;
  /** 대표 알림 (메시지 포맷팅용) */
  representativeAlert: CachedAlert;
}

/**
 * 특보 변동사항들을 그루핑합니다.
 *
 * 그루핑 우선순위:
 * 1. 수준별 (level): 3 (경보) > 2 (주의보) > 1 (예비)
 * 2. 특보 종류별 (warningType): W, R, C, D, O, N, V, T, S, Y, H, F
 * 3. 변동 유형별 (changeType): NEW, RESOLVED, LEVEL_UP, etc.
 * 4. 상위지역별 (upperRegion): 경기도, 강원도, 충청남도, etc.
 *
 * @param changes 특보 변동사항 배열
 * @returns 그루핑된 알림 배열
 */
export function groupAlertChanges(changes: AlertChange[]): GroupedAlert[] {
  // 그룹키 생성: level-warningType-changeType
  const groupMap = new Map<string, GroupedAlert>();

  for (const change of changes) {
    // current 또는 previous에서 알림 정보 가져오기
    const alert = change.current || change.previous;
    if (!alert) continue;

    // 그룹키 생성
    const groupKey = `${alert.level}-${alert.warningType}-${change.type}`;

    // 기존 그룹이 있으면 가져오고, 없으면 새로 생성
    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        level: alert.level,
        warningType: alert.warningType,
        changeType: change.type,
        regions: new Map<string, string[]>(),
        representativeAlert: alert
      };
      groupMap.set(groupKey, group);
    }

    // 상위지역별로 지역명 추가
    const upperRegion = alert.upperRegion || '기타';  // upperRegion이 없으면 "기타"로 분류
    const regionList = group.regions.get(upperRegion) || [];

    // 중복 체크 후 추가
    if (!regionList.includes(alert.regionName)) {
      regionList.push(alert.regionName);
      group.regions.set(upperRegion, regionList);
    }
  }

  // Map을 배열로 변환하고 정렬
  const groupedAlerts = Array.from(groupMap.values());

  // 정렬: 1) 수준 내림차순 (경보 > 주의보 > 예비), 2) 특보 종류 알파벳순
  groupedAlerts.sort((a, b) => {
    // 1순위: 수준 (내림차순)
    const levelDiff = parseInt(b.level) - parseInt(a.level);
    if (levelDiff !== 0) return levelDiff;

    // 2순위: 특보 종류 (알파벳순)
    return a.warningType.localeCompare(b.warningType);
  });

  return groupedAlerts;
}

/**
 * 수준 코드를 한글 이름으로 변환합니다.
 * @param levelCode 수준 코드 ("1", "2", "3")
 * @returns 한글 수준 이름
 */
export function getLevelName(levelCode: string): string {
  const levels: Record<string, string> = {
    '1': '예비특보',
    '2': '주의보',
    '3': '경보'
  };
  return levels[levelCode] || levelCode;
}

/**
 * 수준별 이모지를 반환합니다.
 * @param levelCode 수준 코드 ("1", "2", "3")
 * @returns 이모지
 */
export function getLevelEmoji(levelCode: string): string {
  const emojis: Record<string, string> = {
    '1': '🟡',  // 예비 - 노란색
    '2': '🟠',  // 주의보 - 주황색
    '3': '🔴'   // 경보 - 빨간색
  };
  return emojis[levelCode] || '⚠️';
}
