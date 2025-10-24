import {
  formatDateTime,
  getWarningTypeName,
  getWarningTypeEmoji,
  getWarningLevelName,
  getWarningLevelEmoji,
  getWarningCommandName,
  generateWeatherSearchUrl,
  simplifyRegionName
} from '../../utils/messageFormatter';

describe('messageFormatter', () => {
  describe('getWarningTypeName', () => {
    it('should return correct Korean name for warning codes', () => {
      expect(getWarningTypeName('H')).toBe('폭염');
      expect(getWarningTypeName('R')).toBe('호우');
      expect(getWarningTypeName('V')).toBe('풍랑');
      expect(getWarningTypeName('W')).toBe('강풍');
      expect(getWarningTypeName('T')).toBe('태풍');
      expect(getWarningTypeName('C')).toBe('한파');
      expect(getWarningTypeName('D')).toBe('건조');
      expect(getWarningTypeName('O')).toBe('해일');
      expect(getWarningTypeName('N')).toBe('지진해일');
      expect(getWarningTypeName('S')).toBe('대설');
      expect(getWarningTypeName('Y')).toBe('황사');
      expect(getWarningTypeName('F')).toBe('안개');
    });

    it('should return original code for unknown warning codes', () => {
      expect(getWarningTypeName('X')).toBe('X');
      expect(getWarningTypeName('Z')).toBe('Z');
    });

    it('should handle trimmed codes', () => {
      expect(getWarningTypeName(' H ')).toBe('폭염');
      expect(getWarningTypeName(' R ')).toBe('호우');
    });
  });

  describe('getWarningTypeEmoji', () => {
    it('should return correct emoji for warning types', () => {
      expect(getWarningTypeEmoji('H')).toBe('🔥'); // 폭염
      expect(getWarningTypeEmoji('R')).toBe('🌧️'); // 호우
      expect(getWarningTypeEmoji('W')).toBe('💨'); // 강풍
      expect(getWarningTypeEmoji('C')).toBe('🥶'); // 한파
      expect(getWarningTypeEmoji('S')).toBe('❄️'); // 대설
      expect(getWarningTypeEmoji('T')).toBe('🌀'); // 태풍
    });

    it('should return default emoji for unknown codes', () => {
      expect(getWarningTypeEmoji('X')).toBe('⚠️');
    });
  });

  describe('getWarningLevelName', () => {
    it('should return correct Korean name for level codes', () => {
      expect(getWarningLevelName('1')).toBe('예비');
      expect(getWarningLevelName('2')).toBe('주의보');
      expect(getWarningLevelName('3')).toBe('경보');
    });

    it('should return original code for unknown level codes', () => {
      expect(getWarningLevelName('9')).toBe('9');
      expect(getWarningLevelName('0')).toBe('0');
    });

    it('should handle trimmed codes', () => {
      expect(getWarningLevelName(' 2 ')).toBe('주의보');
      expect(getWarningLevelName(' 3 ')).toBe('경보');
    });
  });

  describe('getWarningLevelEmoji', () => {
    it('should return correct emoji for level codes', () => {
      expect(getWarningLevelEmoji('1')).toBe('🟡'); // 예비
      expect(getWarningLevelEmoji('2')).toBe('🟠'); // 주의보
      expect(getWarningLevelEmoji('3')).toBe('🔴'); // 경보
    });

    it('should return default emoji for unknown codes', () => {
      expect(getWarningLevelEmoji('9')).toBe('⚠️');
    });

    it('should handle trimmed codes', () => {
      expect(getWarningLevelEmoji(' 2 ')).toBe('🟠');
    });
  });

  describe('getWarningCommandName', () => {
    it('should return correct Korean name for command codes', () => {
      expect(getWarningCommandName('1')).toBe('발표');
      expect(getWarningCommandName('2')).toBe('대치');
      expect(getWarningCommandName('3')).toBe('해제');
      expect(getWarningCommandName('4')).toBe('대치해제(자동)');
      expect(getWarningCommandName('5')).toBe('연장');
      expect(getWarningCommandName('6')).toBe('변경');
      expect(getWarningCommandName('7')).toBe('변경해제');
    });

    it('should return original code for unknown command codes', () => {
      expect(getWarningCommandName('9')).toBe('9');
    });

    it('should handle trimmed codes', () => {
      expect(getWarningCommandName(' 1 ')).toBe('발표');
    });
  });

  describe('formatDateTime', () => {
    it('should format 12-digit date string correctly (KMA format)', () => {
      const result = formatDateTime('202508011530');
      expect(result).toBe('2025-08-01 15:30');
    });

    it('should format another 12-digit date correctly', () => {
      const result = formatDateTime('202012312359');
      expect(result).toBe('2020-12-31 23:59');
    });

    it('should format ISO date string correctly', () => {
      const result = formatDateTime('2025-08-01T15:30:00');
      expect(result).toBe('2025-08-01 15:30');
    });

    it('should return original string for invalid dates', () => {
      const result = formatDateTime('invalid-date');
      expect(result).toBe('invalid-date');
    });

    it('should handle non-numeric 12-character strings', () => {
      const result = formatDateTime('abcd12345678');
      expect(result).toBe('abcd12345678');
    });

    it('should handle empty string', () => {
      const result = formatDateTime('');
      expect(result).toBe('');
    });
  });

  describe('simplifyRegionName', () => {
    it('should simplify special administrative region names', () => {
      expect(simplifyRegionName('서울특별시')).toBe('서울');
      expect(simplifyRegionName('부산광역시')).toBe('부산');
      expect(simplifyRegionName('제주특별자치도')).toBe('제주');
    });

    it('should handle Seoul district mappings', () => {
      expect(simplifyRegionName('서울강북')).toBe('서울 강북구');
      expect(simplifyRegionName('서울강남')).toBe('서울 강남구');
      expect(simplifyRegionName('서울강서')).toBe('서울 강서구');
    });

    it('should handle Jeju complex region names', () => {
      expect(simplifyRegionName('제주도북부중산간')).toBe('제주');
      expect(simplifyRegionName('제주도남부중산간')).toBe('제주');
      expect(simplifyRegionName('제주북부')).toBe('제주');
    });

    it('should handle sea area names', () => {
      expect(simplifyRegionName('서해북부먼바다')).toBe('서해');
      expect(simplifyRegionName('남해동부먼바다')).toBe('남해');
      expect(simplifyRegionName('동해중부먼바다')).toBe('동해');
      expect(simplifyRegionName('제주도먼바다')).toBe('제주 바다');
    });

    it('should truncate very long region names', () => {
      const veryLongRegion = '매우긴지역명테스트';
      const result = simplifyRegionName(veryLongRegion);
      expect(result).toBe('매우긴');
    });

    it('should return original name for unmapped short names', () => {
      const shortName = '서울';
      const result = simplifyRegionName(shortName);
      expect(result).toBe('서울');
    });
  });

  describe('generateWeatherSearchUrl', () => {
    it('should generate correct URL for simplified region names', () => {
      const longRegionName = '제주도북부중산간';
      const url = generateWeatherSearchUrl(longRegionName);
      expect(url).toBe('https://search.daum.net/search?w=tot&q=제주+날씨');
    });

    it('should handle Seoul district names correctly', () => {
      const seoulRegion = '서울강북';
      const url = generateWeatherSearchUrl(seoulRegion);
      expect(url).toBe('https://search.daum.net/search?w=tot&q=서울+강북구+날씨');
    });

    it('should simplify sea area names', () => {
      const seaArea = '서해북부먼바다';
      const url = generateWeatherSearchUrl(seaArea);
      expect(url).toBe('https://search.daum.net/search?w=tot&q=서해+날씨');
    });

    it('should handle normal region names', () => {
      const normalRegion = '서울특별시';
      const url = generateWeatherSearchUrl(normalRegion);
      expect(url).toBe('https://search.daum.net/search?w=tot&q=서울+날씨');
    });

    it('should use + symbol for spaces to avoid URL encoding', () => {
      const regionWithSpaceMapping = '서울강북';
      const url = generateWeatherSearchUrl(regionWithSpaceMapping);
      expect(url).toContain('+');
      expect(url).not.toContain('%20');
    });
  });
});
