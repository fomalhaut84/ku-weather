describe('Logger', () => {
  let consoleSpy: any = {};
  const originalEnv = process.env;

  beforeEach(() => {
    // 각 테스트마다 콘솔 스파이 초기화
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation()
    };

    jest.resetModules(); // 모듈 캐시 초기화
  });

  afterEach(() => {
    // 각 테스트 후 스파이 복원
    Object.values(consoleSpy).forEach((spy: any) => spy.mockRestore());
    process.env = originalEnv;
  });

  describe('Logger functionality', () => {
    it('should format and log info messages correctly', () => {
      const { logger } = require('../../utils/logger');
      
      logger.info('테스트 메시지');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: 테스트 메시지/)
      );
    });

    it('should format and log error messages correctly', () => {
      const { logger } = require('../../utils/logger');
      
      logger.error('에러 메시지');
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR: 에러 메시지/)
      );
    });

    it('should format and log warn messages correctly', () => {
      const { logger } = require('../../utils/logger');
      
      logger.warn('경고 메시지');
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] WARN: 경고 메시지/)
      );
    });

    it('should log debug messages in development environment', () => {
      process.env.NODE_ENV = 'development';
      const { logger } = require('../../utils/logger');
      
      logger.debug('디버그 메시지');
      
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] DEBUG: 디버그 메시지/)
      );
    });

    it('should log debug messages when DEBUG=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEBUG = 'true';
      const { logger } = require('../../utils/logger');
      
      logger.debug('디버그 메시지');
      
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] DEBUG: 디버그 메시지/)
      );
    });

    it('should not log debug messages in production without DEBUG flag', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEBUG = 'false';
      const { logger } = require('../../utils/logger');
      
      logger.debug('디버그 메시지');
      
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should format messages with additional arguments correctly', () => {
      const { logger } = require('../../utils/logger');
      
      logger.info('메시지', '추가인자', 123);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: 메시지 추가인자 123/)
      );
    });

    it('should stringify object arguments', () => {
      const { logger } = require('../../utils/logger');
      const testObj = { key: 'value', number: 42 };
      
      logger.info('객체 테스트', testObj);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('객체 테스트 {\n  "key": "value",\n  "number": 42\n}')
      );
    });

    it('should handle multiple object arguments', () => {
      const { logger } = require('../../utils/logger');
      const obj1 = { a: 1 };
      const obj2 = { b: 2 };
      
      logger.error('다중 객체', obj1, obj2);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('다중 객체 {\n  "a": 1\n} {\n  "b": 2\n}')
      );
    });

    it('should handle mixed argument types', () => {
      const { logger } = require('../../utils/logger');
      
      logger.warn('혼합 인자', 'string', 123, { obj: true }, null, undefined);
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('혼합 인자 string 123 {\n  "obj": true\n} null undefined')
      );
    });

    it('should handle empty additional arguments', () => {
      const { logger } = require('../../utils/logger');
      
      logger.info('메시지만');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: 메시지만$/)
      );
    });
  });

  describe('formatMessage private method behavior', () => {
    it('should create timestamps in ISO format', () => {
      const { logger } = require('../../utils/logger');
      
      logger.info('타임스탬프 테스트');
      
      const call = consoleSpy.log.mock.calls[0][0];
      const timestampMatch = call.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
      expect(timestampMatch).toBeTruthy();
      
      // 타임스탬프가 유효한 ISO 날짜인지 확인
      const timestamp = timestampMatch[1];
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should uppercase log levels', () => {
      process.env.NODE_ENV = 'development'; // DEBUG 메시지가 출력되도록 설정
      const { logger } = require('../../utils/logger');
      
      logger.info('테스트');
      logger.error('테스트');
      logger.warn('테스트');
      logger.debug('테스트');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('INFO:'));
      expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('ERROR:'));
      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('WARN:'));
      expect(consoleSpy.debug).toHaveBeenCalledWith(expect.stringContaining('DEBUG:'));
    });
  });
});