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
});