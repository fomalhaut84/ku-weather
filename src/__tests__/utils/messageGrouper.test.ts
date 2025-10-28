/**
 * messageGrouper.ts 테스트
 */

import { groupAlertChanges, getLevelName, getLevelEmoji } from '../../utils/messageGrouper';
import { AlertChange, CachedAlert } from '../../types/weather';

describe('messageGrouper', () => {
  // 테스트용 mock 알림 데이터
  const createMockAlert = (overrides: Partial<CachedAlert>): CachedAlert => ({
    key: 'mock-key',
    regionId: 'L1000000',
    regionName: '테스트지역',
    upperRegion: '경기도',
    warningType: 'C',
    level: '2',
    command: '1',
    announcedAt: '202501280900',
    effectiveAt: '202501281000',
    lastUpdated: new Date().toISOString(),
    ...overrides
  });

  describe('groupAlertChanges', () => {
    it('should group alerts by level, warningType, and changeType', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C', regionName: '연천' }),
          description: '한파주의보 신규 발표'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C', regionName: '포천' }),
          description: '한파주의보 신규 발표'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].level).toBe('2');
      expect(grouped[0].warningType).toBe('C');
      expect(grouped[0].changeType).toBe('NEW');
    });

    it('should sort by level descending (경보 > 주의보 > 예비)', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ level: '1', warningType: 'W' }),  // 예비
          description: '강풍 예비특보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '3', warningType: 'H' }),  // 경보
          description: '폭염경보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C' }),  // 주의보
          description: '한파주의보'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(3);
      expect(grouped[0].level).toBe('3');  // 경보
      expect(grouped[1].level).toBe('2');  // 주의보
      expect(grouped[2].level).toBe('1');  // 예비
    });

    it('should sort by warningType within same level', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'R' }),  // 호우
          description: '호우주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C' }),  // 한파
          description: '한파주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'W' }),  // 강풍
          description: '강풍주의보'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(3);
      expect(grouped[0].warningType).toBe('C');  // 알파벳순
      expect(grouped[1].warningType).toBe('R');
      expect(grouped[2].warningType).toBe('W');
    });

    it('should group regions by upperRegion', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ upperRegion: '경기도', regionName: '연천' }),
          description: '한파주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ upperRegion: '경기도', regionName: '포천' }),
          description: '한파주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ upperRegion: '강원도', regionName: '철원' }),
          description: '한파주의보'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].regions.size).toBe(2);
      expect(grouped[0].regions.get('경기도')).toEqual(['연천', '포천']);
      expect(grouped[0].regions.get('강원도')).toEqual(['철원']);
    });

    it('should handle alerts without upperRegion (fallback to "기타")', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ upperRegion: undefined, regionName: '테스트지역' }),
          description: '한파주의보'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].regions.get('기타')).toEqual(['테스트지역']);
    });

    it('should not duplicate regionName within same upperRegion', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ upperRegion: '경기도', regionName: '연천' }),
          description: '한파주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ upperRegion: '경기도', regionName: '연천' }),  // 중복
          description: '한파주의보'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].regions.get('경기도')).toEqual(['연천']);  // 중복 제거
    });

    it('should handle different changeTypes separately', () => {
      const changes: AlertChange[] = [
        {
          type: 'NEW',
          current: createMockAlert({ regionName: '연천' }),
          description: '한파주의보 신규'
        },
        {
          type: 'RESOLVED',
          previous: createMockAlert({ regionName: '포천' }),
          description: '한파주의보 해제'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(2);
      expect(grouped.find(g => g.changeType === 'NEW')).toBeDefined();
      expect(grouped.find(g => g.changeType === 'RESOLVED')).toBeDefined();
    });

    it('should handle RESOLVED changes with previous alert', () => {
      const changes: AlertChange[] = [
        {
          type: 'RESOLVED',
          previous: createMockAlert({ upperRegion: '경기도', regionName: '연천' }),
          description: '한파주의보 해제'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].changeType).toBe('RESOLVED');
      expect(grouped[0].regions.get('경기도')).toEqual(['연천']);
    });

    it('should handle complex scenario with mixed levels, types, and regions', () => {
      const changes: AlertChange[] = [
        // 경보
        {
          type: 'NEW',
          current: createMockAlert({ level: '3', warningType: 'H', upperRegion: '서울특별시', regionName: '강남구' }),
          description: '폭염경보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '3', warningType: 'H', upperRegion: '서울특별시', regionName: '서초구' }),
          description: '폭염경보'
        },
        // 주의보
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C', upperRegion: '경기도', regionName: '연천' }),
          description: '한파주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C', upperRegion: '경기도', regionName: '포천' }),
          description: '한파주의보'
        },
        {
          type: 'NEW',
          current: createMockAlert({ level: '2', warningType: 'C', upperRegion: '강원도', regionName: '철원' }),
          description: '한파주의보'
        },
        // 예비
        {
          type: 'NEW',
          current: createMockAlert({ level: '1', warningType: 'W', upperRegion: '충청남도', regionName: '태안' }),
          description: '강풍 예비특보'
        }
      ];

      const grouped = groupAlertChanges(changes);

      expect(grouped).toHaveLength(3);

      // 1순위: 경보
      expect(grouped[0].level).toBe('3');
      expect(grouped[0].warningType).toBe('H');
      expect(grouped[0].regions.get('서울특별시')).toEqual(['강남구', '서초구']);

      // 2순위: 주의보
      expect(grouped[1].level).toBe('2');
      expect(grouped[1].warningType).toBe('C');
      expect(grouped[1].regions.get('경기도')).toEqual(['연천', '포천']);
      expect(grouped[1].regions.get('강원도')).toEqual(['철원']);

      // 3순위: 예비
      expect(grouped[2].level).toBe('1');
      expect(grouped[2].warningType).toBe('W');
      expect(grouped[2].regions.get('충청남도')).toEqual(['태안']);
    });
  });

  describe('getLevelName', () => {
    it('should return correct Korean name for level codes', () => {
      expect(getLevelName('1')).toBe('예비특보');
      expect(getLevelName('2')).toBe('주의보');
      expect(getLevelName('3')).toBe('경보');
    });

    it('should return original code for unknown levels', () => {
      expect(getLevelName('9')).toBe('9');
    });
  });

  describe('getLevelEmoji', () => {
    it('should return correct emoji for level codes', () => {
      expect(getLevelEmoji('1')).toBe('🟡');  // 예비
      expect(getLevelEmoji('2')).toBe('🟠');  // 주의보
      expect(getLevelEmoji('3')).toBe('🔴');  // 경보
    });

    it('should return default emoji for unknown levels', () => {
      expect(getLevelEmoji('9')).toBe('⚠️');
    });
  });
});
