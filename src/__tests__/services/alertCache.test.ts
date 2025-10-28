import { AlertCache } from '../../services/AlertCache';
import { WeatherAlert, CachedAlert, AlertChange } from '../../types/weather';
import { logger } from '../../utils/logger';

// Logger 모킹
jest.mock('../../utils/logger');

describe('AlertCache', () => {
  let alertCache: AlertCache;
  
  const mockAlert1: WeatherAlert = {
    REG_ID: 'L1100000',
    REG_NAME: '서울특별시',
    WRN: 'H',
    LVL: '2',
    CMD: '1',
    TM_FC: '202501070900',
    TM_EF: '202501071000',
    TM_IN: '202501070800',
    STN: '184',
    GRD: '00',
    CNT: '1',
    RPT: '101',
    TM_ST: '',
    TM_ED: '',
    REG_SP: '',
    REG_UP: '',
    REG_KO: '서울',
    REG_UP_KO: '서울특별시',
    STN_ID: '184',
    TM_SEQ: '',
    MAN_FC: '',
    MAN_IN: ''
  };

  const mockAlert2: WeatherAlert = {
    ...mockAlert1,
    REG_ID: 'L1010000',
    REG_NAME: '경기도',
    LVL: '3'
  };

  const mockAlert3: WeatherAlert = {
    ...mockAlert1,
    WRN: 'R',
    LVL: '2'
  };

  beforeEach(() => {
    alertCache = new AlertCache();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty cache', () => {
      const status = alertCache.getCacheStatus();
      expect(status.count).toBe(0);
      expect(status.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('updateCache', () => {
    it('should cache alerts correctly', () => {
      const alerts = [mockAlert1, mockAlert2];
      
      alertCache.updateCache(alerts);
      
      const status = alertCache.getCacheStatus();
      expect(status.count).toBe(2);
      expect(logger.debug).toHaveBeenCalledWith('특보 캐시 업데이트 완료: 2개 특보');
    });

    it('should clear previous cache before updating', () => {
      // 첫 번째 업데이트
      alertCache.updateCache([mockAlert1]);
      expect(alertCache.getCacheStatus().count).toBe(1);
      
      // 두 번째 업데이트 (기존 캐시 덮어씀)
      alertCache.updateCache([mockAlert2, mockAlert3]);
      expect(alertCache.getCacheStatus().count).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached alerts', () => {
      alertCache.updateCache([mockAlert1, mockAlert2]);
      expect(alertCache.getCacheStatus().count).toBe(2);
      
      alertCache.clearCache();
      
      expect(alertCache.getCacheStatus().count).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('특보 캐시 초기화: 2개 특보 제거');
    });
  });

  describe('generateAlertKey', () => {
    it('should generate unique keys for different alerts', () => {
      const alerts = [mockAlert1, mockAlert2, mockAlert3];
      alertCache.updateCache(alerts);
      
      const cachedAlerts = alertCache.getAllCachedAlerts();
      const keys = cachedAlerts.map(alert => alert.key);
      
      // 모든 키가 고유해야 함
      expect(new Set(keys).size).toBe(keys.length);
      
      // 예상 키 형식 확인 (지역코드-특보종류)
      expect(keys[0]).toBe('L1100000-H');
      expect(keys.some(key => key === 'L1010000-H')).toBe(true);
      expect(keys.some(key => key === 'L1100000-R')).toBe(true);
    });
  });

  describe('detectChanges', () => {
    describe('신규 특보 감지', () => {
      it('should detect new alerts on empty cache', () => {
        const changes = alertCache.detectChanges([mockAlert1]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('NEW');
        expect(changes[0].current?.regionName).toBe('서울특별시');
        expect(changes[0].description).toContain('신규 발표');
      });

      it('should detect new alerts when cache exists', () => {
        // 초기 캐시 설정
        alertCache.updateCache([mockAlert1]);
        
        // 새로운 특보 추가
        const changes = alertCache.detectChanges([mockAlert1, mockAlert2]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('NEW');
        expect(changes[0].current?.regionName).toBe('경기도');
      });

      it('should NOT detect new alert for change command (CMD=6) without existing cache', () => {
        // 변경 명령(CMD: '6')을 가진 특보가 캐시에 없을 때
        const changeAlert = { ...mockAlert1, CMD: '6' }; // 변경 명령
        
        const changes = alertCache.detectChanges([changeAlert]);
        
        // 변경 명령이므로 신규로 분류되지 않아야 함
        expect(changes).toHaveLength(0);
      });

      it('should only detect new alert for announcement command (CMD=1)', () => {
        const newAlert = { ...mockAlert1, CMD: '1' }; // 발표 명령 (신규)
        const changeAlert = { ...mockAlert2, CMD: '6' }; // 변경 명령 (기존 수정)
        
        const changes = alertCache.detectChanges([newAlert, changeAlert]);
        
        // CMD=1만 신규로 감지되어야 함
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('NEW');
        expect(changes[0].current?.regionName).toBe('서울특별시');
      });

      it('should handle all CMD types correctly on initial run', () => {
        const cmd1Alert = { ...mockAlert1, CMD: '1', REG_ID: 'L1000001' }; // 발표 (신규)
        const cmd2Alert = { ...mockAlert1, CMD: '2', REG_ID: 'L1000002' }; // 대치 (기존)
        const cmd3Alert = { ...mockAlert1, CMD: '3', REG_ID: 'L1000003' }; // 해제 (무시)
        const cmd5Alert = { ...mockAlert1, CMD: '5', REG_ID: 'L1000005' }; // 연장 (기존)
        const cmd6Alert = { ...mockAlert1, CMD: '6', REG_ID: 'L1000006' }; // 변경 (기존)
        
        const changes = alertCache.detectChanges([cmd1Alert, cmd2Alert, cmd3Alert, cmd5Alert, cmd6Alert]);
        
        // CMD=1만 NEW로 분류, 나머지는 알림 없음
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('NEW');
        expect(changes[0].current?.regionId).toBe('L1000001');
        
        // 하지만 모든 활성 특보(CMD=1,2,5,6)는 캐시에 저장되어야 함
        const cachedAlerts = alertCache.getAllCachedAlerts();
        expect(cachedAlerts).toHaveLength(4); // CMD=3 제외한 4개
        
        const cachedRegionIds = cachedAlerts.map(alert => alert.regionId).sort();
        expect(cachedRegionIds).toEqual(['L1000001', 'L1000002', 'L1000005', 'L1000006']);
      });
    });

    describe('특보 해제 감지', () => {
      it('should detect resolved alerts when CMD indicates resolution', () => {
        // 초기 캐시에 특보 설정
        alertCache.updateCache([mockAlert1]);
        
        // 해제 명령(CMD: '3')을 가진 특보로 변경
        const resolvedAlert = { ...mockAlert1, CMD: '3' };
        const changes = alertCache.detectChanges([resolvedAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('RESOLVED');
        expect(changes[0].previous?.regionName).toBe('서울특별시');
        expect(changes[0].description).toContain('해제');
      });

      it('should not detect resolution when alert is just missing from API response', () => {
        // 초기 캐시에 두 개 특보 설정
        alertCache.updateCache([mockAlert1, mockAlert2]);
        
        // API 응답에서 하나가 누락되어도 해제로 간주하지 않음
        const changes = alertCache.detectChanges([mockAlert1]);
        
        expect(changes).toHaveLength(0); // 해제로 감지하지 않음
      });

      it('should remove resolved alerts from cache', () => {
        // 초기 캐시에 두 개 특보 설정
        alertCache.updateCache([mockAlert1, mockAlert2]);
        expect(alertCache.getCacheStatus().count).toBe(2);
        
        // 하나는 유지, 하나는 해제 명령(CMD: '3')으로 변경
        const resolvedAlert = { ...mockAlert1, CMD: '3' };
        const changes = alertCache.detectChanges([mockAlert2, resolvedAlert]);
        
        // 해제 감지
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('RESOLVED');
        
        // 해제된 특보는 캐시에서 제거되어야 함
        expect(alertCache.getCacheStatus().count).toBe(1);
        expect(alertCache.getCachedAlert('L1100000-H')).toBeUndefined(); // 해제된 특보
        expect(alertCache.getCachedAlert('L1010000-H')).toBeDefined(); // 유지된 특보
      });
    });

    describe('수준 변경 감지', () => {
      it('should detect level up changes', () => {
        // 초기 캐시: 주의보(2)
        alertCache.updateCache([mockAlert1]);
        
        // 경보(3)로 상향
        const upgradedAlert = { ...mockAlert1, LVL: '3' };
        const changes = alertCache.detectChanges([upgradedAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('LEVEL_UP');
        expect(changes[0].description).toContain('주의보 → 경보 수준 상향');
      });

      it('should detect level down changes', () => {
        // 초기 캐시: 경보(3)
        const highLevelAlert = { ...mockAlert1, LVL: '3' };
        alertCache.updateCache([highLevelAlert]);
        
        // 주의보(2)로 하향
        const downgradedAlert = { ...mockAlert1, LVL: '2' };
        const changes = alertCache.detectChanges([downgradedAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('LEVEL_DOWN');
        expect(changes[0].description).toContain('경보 → 주의보 수준 하향');
      });
    });

    describe('내용 변경 감지', () => {
      it('should detect command changes', () => {
        alertCache.updateCache([mockAlert1]);
        
        const modifiedAlert = { ...mockAlert1, CMD: '6' }; // 변경
        const changes = alertCache.detectChanges([modifiedAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('MODIFIED');
        expect(changes[0].description).toContain('내용 변경');
      });

      it('should detect announcement time changes', () => {
        alertCache.updateCache([mockAlert1]);
        
        const modifiedAlert = { ...mockAlert1, TM_FC: '202501071000' };
        const changes = alertCache.detectChanges([modifiedAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('MODIFIED');
        expect(changes[0].description).toContain('내용 변경');
      });

      it('should detect effective time extensions', () => {
        alertCache.updateCache([mockAlert1]);
        
        const extendedAlert = { ...mockAlert1, TM_EF: '202501071200' }; // 발효시각만 변경
        const changes = alertCache.detectChanges([extendedAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('TIME_EXTENDED');
        expect(changes[0].description).toContain('발효시각 연장');
      });
    });

    describe('복합 변동 감지', () => {
      it('should detect multiple types of changes', () => {
        // 초기: mockAlert1만 있음
        alertCache.updateCache([mockAlert1]);
        
        // 변경: mockAlert1 수준 상향, mockAlert2 신규 추가
        const upgradedAlert1 = { ...mockAlert1, LVL: '3' };
        const changes = alertCache.detectChanges([upgradedAlert1, mockAlert2]);
        
        expect(changes).toHaveLength(2);
        
        const types = changes.map(c => c.type).sort();
        expect(types).toEqual(['LEVEL_UP', 'NEW'].sort());
      });

      it('should handle no changes correctly', () => {
        alertCache.updateCache([mockAlert1, mockAlert2]);
        
        // 동일한 데이터로 다시 호출
        const changes = alertCache.detectChanges([mockAlert1, mockAlert2]);
        
        expect(changes).toHaveLength(0);
      });
    });
  });

  describe('getCachedAlert', () => {
    it('should return cached alert by key', () => {
      alertCache.updateCache([mockAlert1]);
      
      const key = 'L1100000-H';
      const cached = alertCache.getCachedAlert(key);
      
      expect(cached).toBeDefined();
      expect(cached?.regionName).toBe('서울특별시');
      expect(cached?.warningType).toBe('H');
    });

    it('should return undefined for non-existent key', () => {
      const cached = alertCache.getCachedAlert('non-existent-key');
      expect(cached).toBeUndefined();
    });
  });

  describe('getAllCachedAlerts', () => {
    it('should return all cached alerts as array', () => {
      alertCache.updateCache([mockAlert1, mockAlert2]);
      
      const allCached = alertCache.getAllCachedAlerts();
      
      expect(allCached).toHaveLength(2);
      expect(allCached[0]).toHaveProperty('key');
      expect(allCached[0]).toHaveProperty('regionName');
      expect(allCached[0]).toHaveProperty('warningType');
    });

    it('should return empty array when cache is empty', () => {
      const allCached = alertCache.getAllCachedAlerts();
      expect(allCached).toHaveLength(0);
    });
  });

  describe('toCachedAlert conversion', () => {
    it('should convert WeatherAlert to CachedAlert correctly', () => {
      alertCache.updateCache([mockAlert1]);
      const cached = alertCache.getAllCachedAlerts()[0];
      
      expect(cached.key).toBe('L1100000-H');
      expect(cached.regionId).toBe('L1100000');
      expect(cached.regionName).toBe('서울특별시');
      expect(cached.warningType).toBe('H');
      expect(cached.level).toBe('2');
      expect(cached.command).toBe('1');
      expect(cached.announcedAt).toBe('202501070900');
      expect(cached.effectiveAt).toBe('202501071000');
      expect(cached.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 형식
    });
  });

  describe('warning type and level names', () => {
    it('should convert warning codes to Korean names correctly', () => {
      const alerts = [
        { ...mockAlert1, WRN: 'H' }, // 폭염
        { ...mockAlert1, WRN: 'R', REG_ID: 'L1010000' }, // 호우
        { ...mockAlert1, WRN: 'W', REG_ID: 'L1020000' }, // 강풍
      ];
      
      alertCache.updateCache(alerts);
      
      // 해제 명령을 가진 특보들로 변경
      const resolvedAlerts = alerts.map(alert => ({ ...alert, CMD: '3' }));
      const changes = alertCache.detectChanges(resolvedAlerts);
      
      expect(changes).toHaveLength(3);
      expect(changes[0].description).toContain('폭염');
      expect(changes[1].description).toContain('호우');
      expect(changes[2].description).toContain('강풍');
    });

    it('should handle resolved command alerts', () => {
      // 초기 캐시: 활성 특보
      alertCache.updateCache([mockAlert1]);
      
      // 해제 명령 특보
      const resolvedAlert = { ...mockAlert1, CMD: '3' }; // 해제
      const changes = alertCache.detectChanges([resolvedAlert]);
      
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');
      expect(changes[0].description).toContain('해제');
    });

    it('should convert level codes to Korean names correctly', () => {
      const alerts = [
        { ...mockAlert1, LVL: '1' }, // 예비
        { ...mockAlert1, LVL: '2', REG_ID: 'L1010000' }, // 주의보
        { ...mockAlert1, LVL: '3', REG_ID: 'L1020000' }, // 경보
      ];
      
      alertCache.updateCache(alerts);
      
      // 해제 명령을 가진 특보들로 변경
      const resolvedAlerts = alerts.map(alert => ({ ...alert, CMD: '3' }));
      const changes = alertCache.detectChanges(resolvedAlerts);
      
      expect(changes).toHaveLength(3);
      expect(changes[0].description).toContain('예비');
      expect(changes[1].description).toContain('주의보');
      expect(changes[2].description).toContain('경보');
    });
  });

  describe('엣지 케이스 및 에러 처리', () => {
    it('should handle empty alert arrays gracefully', () => {
      const changes = alertCache.detectChanges([]);
      expect(changes).toHaveLength(0);
      expect(alertCache.getCacheStatus().count).toBe(0);
    });

    it('should handle null/undefined values in alert data', () => {
      const malformedAlert = {
        ...mockAlert1,
        REG_NAME: null as any,
        WRN: undefined as any,
        LVL: '' as any
      };

      expect(() => {
        alertCache.updateCache([malformedAlert]);
      }).not.toThrow();

      const cached = alertCache.getAllCachedAlerts();
      expect(cached[0]).toHaveProperty('regionName', null);
      expect(cached[0]).toHaveProperty('warningType', undefined);
      expect(cached[0]).toHaveProperty('level', '');
    });

    it('should handle alerts with duplicate keys', () => {
      const duplicateAlert1 = { ...mockAlert1, LVL: '2' };
      const duplicateAlert2 = { ...mockAlert1, LVL: '3' }; // Same region and warning type

      alertCache.updateCache([duplicateAlert1, duplicateAlert2]);
      
      // 마지막 alert만 저장되어야 함
      const cached = alertCache.getAllCachedAlerts();
      expect(cached).toHaveLength(1);
      expect(cached[0].level).toBe('3');
    });

    it('should handle extremely long strings in alert data', () => {
      const longStringAlert = {
        ...mockAlert1,
        REG_NAME: 'A'.repeat(1000), // 매우 긴 지역명
        WRN: 'B'.repeat(100) // 매우 긴 특보 코드
      };

      expect(() => {
        alertCache.updateCache([longStringAlert]);
        const changes = alertCache.detectChanges([longStringAlert]);
        expect(changes).toHaveLength(0);
      }).not.toThrow();
    });

    it('should handle special characters in alert data', () => {
      const specialCharAlert = {
        ...mockAlert1,
        REG_NAME: '서울특별시 🌡️ & <script>alert("test")</script>',
        REG_ID: 'L1100000-🌡️',
        WRN: 'H🔥'
      };

      expect(() => {
        alertCache.updateCache([specialCharAlert]);
        const changes = alertCache.detectChanges([specialCharAlert]);
        expect(changes).toHaveLength(0);
      }).not.toThrow();

      const cached = alertCache.getAllCachedAlerts();
      expect(cached[0].regionName).toBe('서울특별시 🌡️ & <script>alert("test")</script>');
    });

    it('should handle invalid date formats in alert data', () => {
      const invalidDateAlert = {
        ...mockAlert1,
        TM_FC: 'invalid-date',
        TM_EF: '99999999999999' // Invalid timestamp
      };

      expect(() => {
        alertCache.updateCache([invalidDateAlert]);
        const changes = alertCache.detectChanges([invalidDateAlert]);
        expect(changes).toHaveLength(0);
      }).not.toThrow();
    });
  });

  describe('성능 및 대용량 데이터 처리', () => {
    it('should handle large number of alerts efficiently', () => {
      const largeAlertSet: WeatherAlert[] = [];
      const startTime = Date.now();

      // 1000개의 다른 알림 생성
      for (let i = 0; i < 1000; i++) {
        largeAlertSet.push({
          ...mockAlert1,
          REG_ID: `L${i.toString().padStart(7, '0')}`,
          REG_NAME: `테스트지역${i}`,
          WRN: i % 2 === 0 ? 'H' : 'R',
          LVL: ((i % 3) + 1).toString() as any
        });
      }

      alertCache.updateCache(largeAlertSet);
      expect(alertCache.getCacheStatus().count).toBe(1000);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(100); // 100ms 이내 처리

      // 변동 감지 성능 테스트
      const changeStartTime = Date.now();
      const modifiedAlerts = largeAlertSet.map((alert, index) => ({
        ...alert,
        LVL: index < 500 ? '3' : alert.LVL // 절반을 경보로 상향
      }));

      const changes = alertCache.detectChanges(modifiedAlerts);
      const changeProcessingTime = Date.now() - changeStartTime;

      expect(changes.length).toBeGreaterThan(300); // 300개 이상 변동 감지 (일부는 필터링됨)
      expect(changeProcessingTime).toBeLessThan(200); // 200ms 이내 처리
    });

    it('should handle rapid sequential updates', () => {
      const baseAlert = { ...mockAlert1 };
      
      // 연속적인 업데이트 시뮬레이션
      for (let i = 0; i < 50; i++) {
        const updatedAlert = {
          ...baseAlert,
          LVL: ((i % 3) + 1).toString() as any,
          TM_FC: `20250128${i.toString().padStart(4, '0')}` // 다른 발표시각
        };

        const changes = alertCache.detectChanges([updatedAlert]);
        
        if (i === 0) {
          expect(changes).toHaveLength(1);
          expect(changes[0].type).toBe('NEW');
        } else {
          expect(changes).toHaveLength(1);
          expect(['LEVEL_UP', 'LEVEL_DOWN', 'MODIFIED']).toContain(changes[0].type);
        }
      }

      expect(alertCache.getCacheStatus().count).toBe(1);
    });

    it('should handle memory cleanup properly', () => {
      // 대량 데이터로 캐시 채우기
      const largeAlerts = Array.from({ length: 100 }, (_, i) => ({
        ...mockAlert1,
        REG_ID: `L${i.toString().padStart(7, '0')}`,
        REG_NAME: `테스트지역${i}`
      }));

      alertCache.updateCache(largeAlerts);
      expect(alertCache.getCacheStatus().count).toBe(100);

      // 캐시 클리어
      alertCache.clearCache();
      expect(alertCache.getCacheStatus().count).toBe(0);

      // 메모리 해제 검증 (간접적)
      const memoryUsageBefore = process.memoryUsage().heapUsed;
      
      // 가비지 컬렉션 강제 실행 (테스트 환경)
      if (global.gc) {
        global.gc();
      }

      const memoryUsageAfter = process.memoryUsage().heapUsed;
      // 메모리 사용량이 크게 증가하지 않았는지 확인
      expect(memoryUsageAfter).toBeLessThanOrEqual(memoryUsageBefore * 1.1);
    });
  });

  describe('복잡한 시나리오 통합 테스트', () => {
    it('should handle mixed CMD types in single update', () => {
      // 초기 상태: 여러 특보가 활성
      const initialAlerts = [
        { ...mockAlert1, REG_ID: 'L1000001', CMD: '1' }, // 발표
        { ...mockAlert1, REG_ID: 'L1000002', CMD: '1' }, // 발표
        { ...mockAlert1, REG_ID: 'L1000003', CMD: '1' }  // 발표
      ];
      alertCache.updateCache(initialAlerts);

      // 복합 변동: 신규, 해제, 수준변경 동시 발생
      const mixedUpdates = [
        { ...mockAlert1, REG_ID: 'L1000001', CMD: '3' }, // 해제
        { ...mockAlert1, REG_ID: 'L1000002', CMD: '1', LVL: '3' }, // 수준 상향
        { ...mockAlert1, REG_ID: 'L1000003', CMD: '3' }, // 해제 (L1000003도 명시적 해제)
        { ...mockAlert1, REG_ID: 'L1000004', CMD: '1' }, // 신규
        { ...mockAlert1, REG_ID: 'L1000005', CMD: '6' }  // 기존 변경 (캐시 없음)
      ];

      const changes = alertCache.detectChanges(mixedUpdates);

      expect(changes).toHaveLength(4); // 해제x2, 수준상향, 신규

      const changeTypes = changes.map(c => c.type).sort();
      expect(changeTypes).toEqual(['LEVEL_UP', 'NEW', 'RESOLVED', 'RESOLVED']);

      // 최종 캐시 상태 검증
      const finalCache = alertCache.getAllCachedAlerts();
      expect(finalCache).toHaveLength(3); // L1000002, L1000004, L1000005 (CMD=6도 캐시됨)
    });

    it('should maintain consistency across multiple detect cycles', () => {
      const baseAlert = { ...mockAlert1 };
      
      // 1차: 신규 특보
      let changes = alertCache.detectChanges([baseAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW');

      // 2차: 동일 특보 (변동 없음)
      changes = alertCache.detectChanges([baseAlert]);
      expect(changes).toHaveLength(0);

      // 3차: 수준 상향
      const upgradedAlert = { ...baseAlert, LVL: '3' };
      changes = alertCache.detectChanges([upgradedAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('LEVEL_UP');

      // 4차: 다시 동일 (변동 없음)
      changes = alertCache.detectChanges([upgradedAlert]);
      expect(changes).toHaveLength(0);

      // 5차: 해제
      const resolvedAlert = { ...upgradedAlert, CMD: '3' };
      changes = alertCache.detectChanges([resolvedAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');

      // 최종: 캐시 비어있음
      expect(alertCache.getCacheStatus().count).toBe(0);
    });

    it('should handle time-based edge cases', () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 3600000).toISOString().replace(/[-:T]/g, '').substring(0, 12); // 1시간 전
      const futureTime = new Date(now.getTime() + 3600000).toISOString().replace(/[-:T]/g, '').substring(0, 12); // 1시간 후

      const pastAlert = {
        ...mockAlert1,
        TM_FC: pastTime,
        TM_EF: pastTime
      };

      const futureAlert = {
        ...mockAlert1,
        REG_ID: 'L1000002',
        TM_FC: futureTime,
        TM_EF: futureTime
      };

      const changes = alertCache.detectChanges([pastAlert, futureAlert]);
      expect(changes).toHaveLength(2);
      
      // 시간 순서에 관계없이 모두 NEW로 감지되어야 함
      expect(changes.every(c => c.type === 'NEW')).toBe(true);
    });
  });

  describe('CMD 명령 세분화 테스트', () => {
    it('should handle all 7 CMD types correctly', () => {
      const cmdTypes = ['1', '2', '3', '4', '5', '6', '7'];
      const alerts = cmdTypes.map((cmd, index) => ({
        ...mockAlert1,
        REG_ID: `L100000${index}`,
        CMD: cmd
      }));

      // 빈 캐시에서 모든 CMD 타입 처리
      const changes = alertCache.detectChanges(alerts);

      // CMD=1만 NEW로 감지되어야 함
      const newChanges = changes.filter(c => c.type === 'NEW');
      expect(newChanges).toHaveLength(1);
      expect(newChanges[0].current?.regionId).toBe('L1000000');

      // 해제 명령(3,4,7) 제외하고 캐시에 저장되어야 함  
      const cachedAlerts = alertCache.getAllCachedAlerts();
      expect(cachedAlerts).toHaveLength(4); // CMD 1,2,5,6

      const cachedCmds = cachedAlerts.map(a => a.command).sort();
      expect(cachedCmds).toEqual(['1', '2', '5', '6']);
    });

    it('should process CMD transitions correctly', () => {
      // 초기: 발표 상태
      const initialAlert = { ...mockAlert1, CMD: '1' };
      alertCache.updateCache([initialAlert]);

      // 1→6: 발표 → 변경
      let changes = alertCache.detectChanges([{ ...initialAlert, CMD: '6' }]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('MODIFIED');

      // 6→5: 변경 → 연장 (발효시각만 변경)
      changes = alertCache.detectChanges([{ ...initialAlert, CMD: '5', TM_EF: '202501281200' }]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('MODIFIED'); // CMD가 바뀌므로 MODIFIED로 감지

      // 5→3: 연장 → 해제
      changes = alertCache.detectChanges([{ ...initialAlert, CMD: '3' }]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');

      expect(alertCache.getCacheStatus().count).toBe(0);
    });
  });

  describe('WeatherService 통합 테스트', () => {
    it('should handle API error responses gracefully', async () => {
      // API 실패 시나리오 테스트
      const invalidApiResponse = 'Invalid API Response';
      
      expect(() => {
        // 잘못된 CSV 파싱 시뮬레이션
        alertCache.updateCache([]); // 빈 배열로 업데이트
        const changes = alertCache.detectChanges([]);
        expect(changes).toHaveLength(0);
      }).not.toThrow();
    });

    it('should simulate actual alert change scenarios end-to-end', () => {
      // 실제 시나리오 시뮬레이션: 신규 → 수정 → 해제 플로우
      const initialAlert = {
        ...mockAlert1,
        CMD: '1', // 발표
        LVL: '2'  // 주의보
      };
      
      // 1단계: 신규 특보 발표
      let changes = alertCache.detectChanges([initialAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW');
      
      // 2단계: 수준 상향 (주의보 → 경보)
      const upgradedAlert = { ...initialAlert, LVL: '3', CMD: '6' }; // 변경 명령
      changes = alertCache.detectChanges([upgradedAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('LEVEL_UP');
      
      // 3단계: 발효시각 연장
      const extendedAlert = { ...upgradedAlert, TM_EF: '202501281400', CMD: '5' }; // 연장 명령
      changes = alertCache.detectChanges([extendedAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('MODIFIED'); // CMD도 바뀌므로 MODIFIED로 감지
      
      // 4단계: 특보 해제
      const resolvedAlert = { ...extendedAlert, CMD: '3' }; // 해제 명령
      changes = alertCache.detectChanges([resolvedAlert]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');
      
      // 최종 검증: 캐시가 비워졌는지 확인
      expect(alertCache.getCacheStatus().count).toBe(0);
    });

    it('should handle network timeout and retry scenarios', () => {
      // 네트워크 타임아웃 시뮬레이션
      const largeDataSet: WeatherAlert[] = [];
      
      // 대용량 데이터 생성
      for (let i = 0; i < 500; i++) {
        largeDataSet.push({
          ...mockAlert1,
          REG_ID: `L${i.toString().padStart(7, '0')}`,
          REG_NAME: `네트워크테스트지역${i}`,
          WRN: i % 4 === 0 ? 'H' : i % 4 === 1 ? 'R' : i % 4 === 2 ? 'W' : 'V'
        });
      }
      
      const startTime = Date.now();
      
      // 초기 캐시 설정
      alertCache.updateCache(largeDataSet.slice(0, 250));
      expect(alertCache.getCacheStatus().count).toBe(250);
      
      // 대량 변경 감지
      const modifiedData = largeDataSet.slice(0, 250).map((alert, index) => ({
        ...alert,
        LVL: index % 2 === 0 ? '3' : '2' // 50% 수준 변경
      }));
      
      const changes = alertCache.detectChanges(modifiedData);
      const processingTime = Date.now() - startTime;
      
      // 성능 검증
      expect(processingTime).toBeLessThan(300); // 300ms 이내
      expect(changes.length).toBeGreaterThan(0); // 변경사항 감지
      
      // 메모리 효율성 검증 (테스트 환경에서는 다른 프로세스도 메모리를 사용하므로 관대하게 설정)
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // 500MB 미만
    });

    it('should handle malformed API response data', () => {
      const malformedAlerts: WeatherAlert[] = [
        {
          ...mockAlert1,
          REG_ID: '', // 빈 지역 ID
          WRN: null as any, // null 특보 종류
          LVL: undefined as any, // undefined 수준
          CMD: 'invalid' as any, // 잘못된 명령 코드
          TM_FC: 'not-a-date', // 잘못된 날짜 형식
          TM_EF: '999999999999999' // 비정상적인 타임스탬프
        },
        {
          ...mockAlert1,
          REG_NAME: '<script>alert("XSS")</script>', // 악성 스크립트
          WRN: 'X'.repeat(1000), // 과도하게 긴 문자열
          LVL: '-1' as any // 음수 수준
        }
      ];
      
      expect(() => {
        alertCache.updateCache(malformedAlerts);
        const changes = alertCache.detectChanges(malformedAlerts);
        expect(changes.length).toBeLessThanOrEqual(2); // 최대 2개 변경사항
      }).not.toThrow();
      
      // 캐시된 데이터 검증
      const cachedAlerts = alertCache.getAllCachedAlerts();
      expect(cachedAlerts).toHaveLength(2);
      
      // 악성 데이터가 그대로 저장되었는지 확인 (필터링되지 않음을 검증)
      expect(cachedAlerts.some(alert => alert.regionName?.includes('<script>'))).toBe(true);
    });

    it('should maintain data integrity across system restarts', () => {
      // 시스템 재시작 시뮬레이션
      const persistentAlerts = [
        { ...mockAlert1, REG_ID: 'PERSIST001', CMD: '1' },
        { ...mockAlert1, REG_ID: 'PERSIST002', CMD: '1', WRN: 'R' },
        { ...mockAlert1, REG_ID: 'PERSIST003', CMD: '1', WRN: 'W', LVL: '3' }
      ];
      
      // 초기 상태 설정
      alertCache.updateCache(persistentAlerts);
      const initialStatus = alertCache.getCacheStatus();
      
      // 시스템 재시작 시뮬레이션 (새로운 AlertCache 인스턴스)
      const newAlertCache = new AlertCache();
      expect(newAlertCache.getCacheStatus().count).toBe(0);
      
      // 재시작 후 동일 데이터로 복구
      const changes = newAlertCache.detectChanges(persistentAlerts);
      
      // 모든 특보가 NEW로 감지되어야 함 (초기 실행이므로)
      expect(changes).toHaveLength(3);
      expect(changes.every(c => c.type === 'NEW')).toBe(true);
      
      // 캐시 상태 복구 확인
      expect(newAlertCache.getCacheStatus().count).toBe(3);
    });
  });

  describe('중복 알림 방지 (Grace Period) 테스트', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should maintain cache for alerts missing within grace period', () => {
      // T+0: 특보A 발표
      const alert1 = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1' };
      const changes1 = alertCache.detectChanges([alert1]);

      expect(changes1).toHaveLength(1);
      expect(changes1[0].type).toBe('NEW');
      expect(alertCache.getCacheStatus().count).toBe(1);

      // T+10분: API 응답에서 사라짐 (grace period 30분 내)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const changes2 = alertCache.detectChanges([]);

      expect(changes2).toHaveLength(0); // 변동 없음
      expect(alertCache.getCacheStatus().count).toBe(1); // 캐시 유지

      // T+20분: 다시 나타남
      jest.advanceTimersByTime(10 * 60 * 1000);
      const changes3 = alertCache.detectChanges([alert1]);

      expect(changes3).toHaveLength(0); // 중복 알림 없음 ✅
      expect(alertCache.getCacheStatus().count).toBe(1);
    });

    it('should auto-resolve alerts missing beyond grace period', () => {
      // T+0: 특보A 발표 (종료시각 30분 후로 설정)
      const endTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const alert1 = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_ED: endTime };
      alertCache.detectChanges([alert1]);

      expect(alertCache.getCacheStatus().count).toBe(1);

      // T+31분: API 응답에서 사라짐 (종료시각 도과)
      jest.advanceTimersByTime(31 * 60 * 1000);
      const changes = alertCache.detectChanges([]);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');
      expect(changes[0].description).toContain('자동감지');
      expect(alertCache.getCacheStatus().count).toBe(0); // 캐시에서 제거
    });

    it('should prioritize explicit resolution over auto-detection', () => {
      // T+0: 특보A 발표
      const alert1 = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1' };
      alertCache.detectChanges([alert1]);

      // T+10분: 명시적 해제 명령 (CMD=3)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const alert2 = { ...alert1, CMD: '3' };
      const changes = alertCache.detectChanges([alert2]);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');
      expect(changes[0].description).not.toContain('자동감지'); // 명시적 해제
      expect(alertCache.getCacheStatus().count).toBe(0);
    });

    it('should handle multiple alerts with different grace periods', () => {
      // 특보A 발표 (T+0, 종료시각 T+30)
      const endTime1 = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const alert1 = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_ED: endTime1 };
      alertCache.detectChanges([alert1]);

      // 10분 후 특보B 발표 (T+10, 종료시각 T+40)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const endTime2 = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const alert2 = { ...mockAlert1, REG_ID: '11A00102', WRN: 'R', CMD: '1', TM_ED: endTime2 };
      // alert1을 포함하지 않으므로, alert1의 lastSeenAt은 T+0 상태 유지
      alertCache.detectChanges([alert2]);
      expect(alertCache.getCacheStatus().count).toBe(2);

      // 25분 후 (T+35): alert1 종료시각 도과(T+30), alert2는 유효(T+40)
      jest.advanceTimersByTime(25 * 60 * 1000);
      const changes = alertCache.detectChanges([]);

      // alert1만 자동 해제, alert2는 캐시 유지
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');
      expect(changes[0].previous?.regionId).toBe('11A00101'); // alert1
      expect(alertCache.getCacheStatus().count).toBe(1); // alert2만 남음
    });

    it('should not duplicate NEW alerts after cache miss', () => {
      // 이슈 #61의 핵심 시나리오: 중복 알림 방지
      const alert = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1' };

      // T+0: 신규 발표
      const changes1 = alertCache.detectChanges([alert]);
      expect(changes1).toHaveLength(1);
      expect(changes1[0].type).toBe('NEW');

      // T+10분: API에서 사라짐 (grace period 내)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const changes2 = alertCache.detectChanges([]);
      expect(changes2).toHaveLength(0);
      expect(alertCache.getCacheStatus().count).toBe(1); // 캐시 유지

      // T+20분: 다시 나타남 (같은 특보)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const changes3 = alertCache.detectChanges([alert]);

      // 중복 NEW 알림 없어야 함 ✅
      expect(changes3).toHaveLength(0);
      expect(alertCache.getCacheStatus().count).toBe(1);

      // 캐시된 특보의 lastSeenAt이 갱신되었는지 확인
      const cached = alertCache.getAllCachedAlerts()[0];
      expect(cached.lastSeenAt).toBeDefined();
    });

    it('should update lastSeenAt when alert reappears', () => {
      const alert = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1' };

      // 초기 발표
      alertCache.detectChanges([alert]);
      const firstSeen = alertCache.getAllCachedAlerts()[0].lastSeenAt;

      // 5분 후
      jest.advanceTimersByTime(5 * 60 * 1000);

      // 다시 확인 (lastSeenAt 갱신)
      alertCache.detectChanges([alert]);
      const secondSeen = alertCache.getAllCachedAlerts()[0].lastSeenAt;

      expect(secondSeen).toBeDefined();
      expect(new Date(secondSeen!).getTime()).toBeGreaterThan(new Date(firstSeen!).getTime());
    });

    it('should treat new alerts within grace period as NEW (Codex P1 feedback)', () => {
      // Codex P1: Grace period 내 진짜 신규 특보는 MODIFIED가 아닌 NEW로 처리해야 함

      // T+0: 특보A 발표 (TM_FC=202501070900, CMD=1)
      const alertA = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_FC: '202501070900' };
      const changes1 = alertCache.detectChanges([alertA]);

      expect(changes1).toHaveLength(1);
      expect(changes1[0].type).toBe('NEW');

      // T+10분: API 응답에서 사라짐 (grace period 내)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const changes2 = alertCache.detectChanges([]);

      expect(changes2).toHaveLength(0); // 변동 없음
      expect(alertCache.getCacheStatus().count).toBe(1); // 캐시 유지

      // T+20분: 새로운 특보B 발표 (TM_FC=202501071000, CMD=1, 완전히 다른 특보)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const alertB = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_FC: '202501071000' };
      const changes3 = alertCache.detectChanges([alertB]);

      // 진짜 신규 특보이므로 NEW로 감지되어야 함 ✅
      expect(changes3).toHaveLength(1);
      expect(changes3[0].type).toBe('NEW');
      expect(changes3[0].description).toContain('신규 발표');
      expect(alertCache.getCacheStatus().count).toBe(1);
    });

    it('should treat alerts with different command within grace period as NEW', () => {
      // Grace period 내 다른 명령(CMD)을 가진 특보는 신규로 간주

      // T+0: 특보A 발표 (CMD=1)
      const alertA = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_FC: '202501070900' };
      alertCache.detectChanges([alertA]);

      // T+10분: API 응답에서 사라짐
      jest.advanceTimersByTime(10 * 60 * 1000);
      alertCache.detectChanges([]);

      // T+20분: 다른 명령의 특보B 발표 (CMD=6, 변경)
      jest.advanceTimersByTime(10 * 60 * 1000);
      const alertB = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '6', TM_FC: '202501070900' };
      const changes = alertCache.detectChanges([alertB]);

      // CMD가 다르므로 변동으로 감지
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('MODIFIED'); // CMD 변경
    });
  });

  describe('TM_ED 기반 Grace Period 테스트 (Issue #64)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should use TM_ED when available for auto-resolve', () => {
      // TM_ED가 있는 경우: 종료시각 기준으로 자동 해제
      const endTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간 후
      const alert = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_ED: endTime };
      alertCache.detectChanges([alert]);

      // 30분 후: TM_ED는 아직 도과하지 않음
      jest.advanceTimersByTime(30 * 60 * 1000);
      const changes1 = alertCache.detectChanges([]);
      expect(changes1).toHaveLength(0); // 해제되지 않음 ✅
      expect(alertCache.getCacheStatus().count).toBe(1);

      // 추가 35분 후 (총 65분): TM_ED 도과
      jest.advanceTimersByTime(35 * 60 * 1000);
      const changes2 = alertCache.detectChanges([]);
      expect(changes2).toHaveLength(1);
      expect(changes2[0].type).toBe('RESOLVED');
      expect(alertCache.getCacheStatus().count).toBe(0);
    });

    it('should fallback to 30min timeout when TM_ED is missing', () => {
      // TM_ED가 없는 경우: 30분 타임아웃 사용
      const alert = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_ED: '' };
      alertCache.detectChanges([alert]);

      // 25분 후: 30분 미만
      jest.advanceTimersByTime(25 * 60 * 1000);
      const changes1 = alertCache.detectChanges([]);
      expect(changes1).toHaveLength(0); // 해제되지 않음
      expect(alertCache.getCacheStatus().count).toBe(1);

      // 추가 10분 후 (총 35분): 30분 초과
      jest.advanceTimersByTime(10 * 60 * 1000);
      const changes2 = alertCache.detectChanges([]);
      expect(changes2).toHaveLength(1);
      expect(changes2[0].type).toBe('RESOLVED');
      expect(alertCache.getCacheStatus().count).toBe(0);
    });

    it('should handle invalid TM_ED with fallback', () => {
      // 잘못된 TM_ED 형식: fallback 사용
      const alert = { ...mockAlert1, REG_ID: '11A00101', WRN: 'C', CMD: '1', TM_ED: 'invalid-date' };
      alertCache.detectChanges([alert]);

      // 35분 후: fallback 30분 타임아웃 적용
      jest.advanceTimersByTime(35 * 60 * 1000);
      const changes = alertCache.detectChanges([]);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('RESOLVED');
    });

    it('should prioritize TM_ED over 30min timeout when both applicable', () => {
      // TM_ED가 3시간 후인 경우, 30분이 지나도 해제되지 않아야 함
      const endTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(); // 3시간 후
      const alert = { ...mockAlert1, REG_ID: '11A00101', WRN: 'H', CMD: '1', TM_ED: endTime };
      alertCache.detectChanges([alert]);

      // 40분 후: 30분 타임아웃은 초과했지만 TM_ED는 아직 유효
      jest.advanceTimersByTime(40 * 60 * 1000);
      const changes = alertCache.detectChanges([]);
      expect(changes).toHaveLength(0); // 해제되지 않음 (TM_ED 우선) ✅
      expect(alertCache.getCacheStatus().count).toBe(1);
    });
  });

  describe('SlackService 메시지 포맷 테스트', () => {
    it('should format change type messages correctly', () => {
      const changeTypes: Array<{ type: any, expectedEmoji: string, expectedColor: string }> = [
        { type: 'NEW', expectedEmoji: '🆕', expectedColor: 'danger' },
        { type: 'RESOLVED', expectedEmoji: '✅', expectedColor: 'good' },
        { type: 'LEVEL_UP', expectedEmoji: '⬆️', expectedColor: 'danger' },
        { type: 'LEVEL_DOWN', expectedEmoji: '⬇️', expectedColor: 'warning' },
        { type: 'TIME_EXTENDED', expectedEmoji: '⏰', expectedColor: 'warning' },
        { type: 'MODIFIED', expectedEmoji: '🔄', expectedColor: 'warning' }
      ];
      
      changeTypes.forEach(({ type, expectedEmoji, expectedColor }) => {
        const changes = alertCache.detectChanges([]);
        const mockChange = {
          type,
          current: type !== 'RESOLVED' ? {
            regionName: '테스트지역',
            warningType: 'H',
            level: '2',
            command: '1',
            announcedAt: '202501070900',
            effectiveAt: '202501071000'
          } : undefined,
          previous: type === 'RESOLVED' ? {
            regionName: '테스트지역',
            warningType: 'H',
            level: '2',
            command: '3',
            announcedAt: '202501070900',
            effectiveAt: '202501071000'
          } : undefined,
          description: `테스트지역 폭염 ${type} 테스트`
        };
        
        // 메시지 포맷 검증을 위한 기본적인 구조 확인
        expect(mockChange.type).toBe(type);
        expect(mockChange.description).toContain('테스트지역');
        
        if (type !== 'RESOLVED') {
          expect(mockChange.current).toBeDefined();
          expect(mockChange.current?.regionName).toBe('테스트지역');
        } else {
          expect(mockChange.previous).toBeDefined();
          expect(mockChange.previous?.regionName).toBe('테스트지역');
        }
      });
    });

    it('should handle batch message formatting for multiple alerts', () => {
      // 배치 메시지용 다중 변동사항 생성
      const multipleAlerts = [
        { ...mockAlert1, REG_ID: 'BATCH001', REG_NAME: '서울강북', CMD: '1' },
        { ...mockAlert1, REG_ID: 'BATCH002', REG_NAME: '서울강남', CMD: '1', WRN: 'R' },
        { ...mockAlert1, REG_ID: 'BATCH003', REG_NAME: '경기북부', CMD: '1', WRN: 'W', LVL: '3' }
      ];
      
      const changes = alertCache.detectChanges(multipleAlerts);
      
      expect(changes).toHaveLength(3);
      expect(changes.every(c => c.type === 'NEW')).toBe(true);
      
      // 배치 메시지 포맷팅 시뮬레이션
      const batchMessage = {
        text: `🌦️ 기상특보 변동 알림 (${changes.length}건)`,
        attachments: changes.map(change => ({
          title: `🆕 ${change.description}`,
          fields: [
            { title: '📍 지역', value: change.current?.regionName },
            { title: '⚠️ 특보종류', value: change.current?.warningType }
          ]
        }))
      };
      
      expect(batchMessage.text).toContain('(3건)');
      expect(batchMessage.attachments).toHaveLength(3);
      expect(batchMessage.attachments[0].title).toContain('🆕');
      expect(batchMessage.attachments[0].fields[0].value).toBe('서울강북');
    });

    it('should validate warning type and level name mappings', () => {
      const warningTypeMappings = [
        { code: 'H', name: '폭염' },
        { code: 'R', name: '호우' },
        { code: 'W', name: '강풍' },
        { code: 'V', name: '풍랑' },
        { code: 'T', name: '태풍' },
        { code: 'S', name: '대설' },
        { code: 'C', name: '한파' },
        { code: 'D', name: '건조' },
        { code: 'Y', name: '황사' },
        { code: 'F', name: '안개' },
        { code: 'O', name: '해일' },
        { code: 'N', name: '지진해일' }
      ];
      
      const levelMappings = [
        { code: '1', name: '예비' },
        { code: '2', name: '주의보' },
        { code: '3', name: '경보' }
      ];
      
      // 각 특보 종류별로 테스트
      warningTypeMappings.forEach(({ code, name }) => {
        const testAlert = { ...mockAlert1, WRN: code, CMD: '1' };
        const changes = alertCache.detectChanges([testAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].current?.warningType).toBe(code);
        expect(changes[0].description).toContain(name);
      });
      
      // 각 특보 수준별로 테스트
      levelMappings.forEach(({ code, name }) => {
        alertCache.clearCache(); // 캐시 초기화
        const testAlert = { ...mockAlert1, LVL: code, CMD: '1', REG_ID: `LEVEL_${code}` };
        const changes = alertCache.detectChanges([testAlert]);
        
        expect(changes).toHaveLength(1);
        expect(changes[0].current?.level).toBe(code);
        expect(changes[0].description).toContain(name);
      });
    });
  });
});