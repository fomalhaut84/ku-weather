import { WEATHER_WARNING_TYPES, WeatherWarningType } from '../../types/weather';

describe('Weather Types', () => {
  describe('WEATHER_WARNING_TYPES constant', () => {
    it('should contain all weather warning type mappings', () => {
      expect(WEATHER_WARNING_TYPES).toEqual({
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
        F: '안개'
      });
    });

    it('should have correct Korean names for each warning type', () => {
      expect(WEATHER_WARNING_TYPES.W).toBe('강풍');
      expect(WEATHER_WARNING_TYPES.R).toBe('호우');
      expect(WEATHER_WARNING_TYPES.C).toBe('한파');
      expect(WEATHER_WARNING_TYPES.D).toBe('건조');
      expect(WEATHER_WARNING_TYPES.O).toBe('해일');
      expect(WEATHER_WARNING_TYPES.N).toBe('지진해일');
      expect(WEATHER_WARNING_TYPES.V).toBe('풍랑');
      expect(WEATHER_WARNING_TYPES.T).toBe('태풍');
      expect(WEATHER_WARNING_TYPES.S).toBe('대설');
      expect(WEATHER_WARNING_TYPES.Y).toBe('황사');
      expect(WEATHER_WARNING_TYPES.H).toBe('폭염');
      expect(WEATHER_WARNING_TYPES.F).toBe('안개');
    });

    it('should contain exactly 12 warning types', () => {
      const keys = Object.keys(WEATHER_WARNING_TYPES);
      expect(keys).toHaveLength(12);
    });

    it('should have all single character keys', () => {
      const keys = Object.keys(WEATHER_WARNING_TYPES);
      keys.forEach(key => {
        expect(key).toHaveLength(1);
      });
    });

    it('should have all string values', () => {
      const values = Object.values(WEATHER_WARNING_TYPES);
      values.forEach(value => {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });

    it('should be accessible as WeatherWarningType keys', () => {
      const testKey: WeatherWarningType = 'H';
      expect(WEATHER_WARNING_TYPES[testKey]).toBe('폭염');
      
      const testKey2: WeatherWarningType = 'R';
      expect(WEATHER_WARNING_TYPES[testKey2]).toBe('호우');
    });

    it('should contain all expected warning type codes', () => {
      const expectedCodes: WeatherWarningType[] = ['W', 'R', 'C', 'D', 'O', 'N', 'V', 'T', 'S', 'Y', 'H', 'F'];
      const actualCodes = Object.keys(WEATHER_WARNING_TYPES) as WeatherWarningType[];
      
      expectedCodes.forEach(code => {
        expect(actualCodes).toContain(code);
      });
      
      expect(actualCodes).toHaveLength(expectedCodes.length);
    });
  });
});