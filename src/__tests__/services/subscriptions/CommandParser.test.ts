import { CommonCommandParser, REGION_MAPPINGS, WARNING_TYPE_MAPPINGS } from '../../../services/subscriptions/CommandParser';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('CommonCommandParser', () => {
  let parser: CommonCommandParser;

  beforeEach(() => {
    parser = new CommonCommandParser();
  });

  describe('parseCommand', () => {
    it('should parse subscribe command with args', () => {
      const result = parser.parseCommand('subscribe seoul heat', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
      expect(result!.args).toEqual(['seoul', 'heat']);
      expect(result!.platform).toBe('slack');
      expect(result!.userId).toBe('user1');
    });

    it('should parse Korean commands', () => {
      const result = parser.parseCommand('구독 서울', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
    });

    it('should parse abbreviated commands', () => {
      const result = parser.parseCommand('sub seoul', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
    });

    it('should parse unsubscribe command', () => {
      const result = parser.parseCommand('unsub', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('unsubscribe');
    });

    it('should parse list command', () => {
      const result = parser.parseCommand('목록', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('list');
    });

    it('should parse settings command', () => {
      const result = parser.parseCommand('설정', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('settings');
    });

    it('should parse quiet command', () => {
      const result = parser.parseCommand('quiet 22:00 08:00', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('quiet');
      expect(result!.args).toEqual(['22:00', '08:00']);
    });

    it('should parse status command', () => {
      const result = parser.parseCommand('상태', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('status');
    });

    it('should parse help with ?', () => {
      const result = parser.parseCommand('?', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('help');
    });

    it('should return null for empty message', () => {
      expect(parser.parseCommand('', 'slack', 'user1')).toBeNull();
    });

    it('should return null for unknown command', () => {
      expect(parser.parseCommand('xyz', 'slack', 'user1')).toBeNull();
    });

    it('should handle extra whitespace', () => {
      const result = parser.parseCommand('  subscribe   seoul  ', 'slack', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
      expect(result!.args).toEqual(['seoul']);
    });

    it('should strip telegram prefix', () => {
      const result = parser.parseCommand('/subscribe seoul', 'telegram', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
    });

    it('should strip discord prefix', () => {
      const result = parser.parseCommand('!weather subscribe seoul', 'discord', 'user1');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('subscribe');
    });

    it('should preserve rawMessage', () => {
      const raw = 'SUBSCRIBE Seoul Heat';
      const result = parser.parseCommand(raw, 'slack', 'user1');
      expect(result!.rawMessage).toBe(raw);
    });
  });

  describe('validateCommand', () => {
    it('should require at least 1 arg for subscribe', () => {
      expect(parser.validateCommand({
        command: 'subscribe', platform: 'slack', userId: 'u1', args: []
      })).toBe(false);

      expect(parser.validateCommand({
        command: 'subscribe', platform: 'slack', userId: 'u1', args: ['seoul']
      })).toBe(true);
    });

    it('should accept unsubscribe without args', () => {
      expect(parser.validateCommand({
        command: 'unsubscribe', platform: 'slack', userId: 'u1', args: []
      })).toBe(true);
    });

    it('should require 2 valid time args for quiet', () => {
      expect(parser.validateCommand({
        command: 'quiet', platform: 'slack', userId: 'u1', args: ['22:00', '08:00']
      })).toBe(true);

      expect(parser.validateCommand({
        command: 'quiet', platform: 'slack', userId: 'u1', args: ['22:00']
      })).toBe(false);

      expect(parser.validateCommand({
        command: 'quiet', platform: 'slack', userId: 'u1', args: ['25:00', '08:00']
      })).toBe(false);
    });

    it('should accept list/settings/status/help without args', () => {
      for (const cmd of ['list', 'settings', 'status', 'help'] as const) {
        expect(parser.validateCommand({
          command: cmd, platform: 'slack', userId: 'u1', args: []
        })).toBe(true);
      }
    });
  });

  describe('suggestCommands', () => {
    it('should suggest commands starting with prefix', () => {
      expect(parser.suggestCommands('sub')).toEqual(['subscribe']);
      expect(parser.suggestCommands('un')).toEqual(['unsubscribe']);
      expect(parser.suggestCommands('s')).toContain('subscribe');
      expect(parser.suggestCommands('s')).toContain('settings');
      expect(parser.suggestCommands('s')).toContain('status');
    });

    it('should return all commands for empty prefix', () => {
      expect(parser.suggestCommands('')).toHaveLength(7);
    });
  });

  describe('parseRegion', () => {
    it('should parse English region names', () => {
      expect(parser.parseRegion('seoul')).toEqual({ code: 'L1100000', name: '서울특별시' });
      expect(parser.parseRegion('busan')).toEqual({ code: 'L1150000', name: '부산광역시' });
      expect(parser.parseRegion('jeju')).toEqual({ code: 'L1090000', name: '제주특별자치도' });
    });

    it('should parse Korean region names', () => {
      expect(parser.parseRegion('서울')).toEqual({ code: 'L1100000', name: '서울특별시' });
      expect(parser.parseRegion('부산')).toEqual({ code: 'L1150000', name: '부산광역시' });
    });

    it('should parse nationwide', () => {
      const result = parser.parseRegion('all');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('');
      expect(result!.name).toBe('전국');
    });

    it('should be case-insensitive', () => {
      expect(parser.parseRegion('Seoul')).toEqual({ code: 'L1100000', name: '서울특별시' });
      expect(parser.parseRegion('BUSAN')).toEqual({ code: 'L1150000', name: '부산광역시' });
    });

    it('should return null for unknown region', () => {
      expect(parser.parseRegion('mars')).toBeNull();
    });
  });

  describe('parseWarningType', () => {
    it('should parse English warning names', () => {
      expect(parser.parseWarningType('heat')).toEqual({ code: 'H', name: '폭염' });
      expect(parser.parseWarningType('rain')).toEqual({ code: 'R', name: '호우' });
      expect(parser.parseWarningType('typhoon')).toEqual({ code: 'T', name: '태풍' });
    });

    it('should parse Korean warning names', () => {
      expect(parser.parseWarningType('폭염')).toEqual({ code: 'H', name: '폭염' });
      expect(parser.parseWarningType('호우')).toEqual({ code: 'R', name: '호우' });
    });

    it('should parse single-letter codes', () => {
      expect(parser.parseWarningType('H')).toEqual({ code: 'H', name: '폭염' });
      expect(parser.parseWarningType('R')).toEqual({ code: 'R', name: '호우' });
    });

    it('should parse all type', () => {
      const result = parser.parseWarningType('all');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('');
    });

    it('should return null for unknown type', () => {
      expect(parser.parseWarningType('earthquake')).toBeNull();
    });
  });

  describe('parseWarningLevel', () => {
    it('should parse numeric levels', () => {
      expect(parser.parseWarningLevel('1')).toBe('1');
      expect(parser.parseWarningLevel('2')).toBe('2');
      expect(parser.parseWarningLevel('3')).toBe('3');
    });

    it('should parse English level names', () => {
      expect(parser.parseWarningLevel('preliminary')).toBe('1');
      expect(parser.parseWarningLevel('advisory')).toBe('2');
      expect(parser.parseWarningLevel('warning')).toBe('3');
    });

    it('should parse Korean level names', () => {
      expect(parser.parseWarningLevel('예비')).toBe('1');
      expect(parser.parseWarningLevel('주의보')).toBe('2');
      expect(parser.parseWarningLevel('경보')).toBe('3');
    });

    it('should return null for unknown level', () => {
      expect(parser.parseWarningLevel('extreme')).toBeNull();
    });
  });

  describe('validateTimeFormat', () => {
    it('should accept valid HH:MM formats', () => {
      expect(parser.validateTimeFormat('00:00')).toBe(true);
      expect(parser.validateTimeFormat('23:59')).toBe(true);
      expect(parser.validateTimeFormat('8:30')).toBe(true);
      expect(parser.validateTimeFormat('12:00')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(parser.validateTimeFormat('25:00')).toBe(false);
      expect(parser.validateTimeFormat('12:60')).toBe(false);
      expect(parser.validateTimeFormat('abc')).toBe(false);
      expect(parser.validateTimeFormat('')).toBe(false);
      expect(parser.validateTimeFormat('12')).toBe(false);
    });
  });

  describe('formatSubscriptionSummary', () => {
    it('should format subscription with regions and warnings', () => {
      const summary = parser.formatSubscriptionSummary({
        id: '1', platform: 'slack', userId: 'u1',
        targetRegions: ['L1100000'],
        warningTypes: ['H'],
        enabled: true, createdAt: new Date(), updatedAt: new Date()
      });
      expect(summary).toContain('서울특별시');
      expect(summary).toContain('폭염');
    });

    it('should show 전국 when no regions', () => {
      const summary = parser.formatSubscriptionSummary({
        id: '1', platform: 'slack', userId: 'u1',
        targetRegions: [],
        warningTypes: [],
        enabled: true, createdAt: new Date(), updatedAt: new Date()
      });
      expect(summary).toContain('전국');
      expect(summary).toContain('전체');
    });

    it('should show quiet hours when set', () => {
      const summary = parser.formatSubscriptionSummary({
        id: '1', platform: 'slack', userId: 'u1',
        targetRegions: [], warningTypes: [],
        enabled: true, createdAt: new Date(), updatedAt: new Date(),
        preferences: { quietHours: { start: '22:00', end: '08:00' } }
      });
      expect(summary).toContain('22:00');
      expect(summary).toContain('08:00');
    });

    it('should show min level when set', () => {
      const summary = parser.formatSubscriptionSummary({
        id: '1', platform: 'slack', userId: 'u1',
        targetRegions: [], warningTypes: [],
        enabled: true, createdAt: new Date(), updatedAt: new Date(),
        preferences: { minLevel: '2' }
      });
      expect(summary).toContain('주의보');
    });
  });

  describe('generateHelpMessage', () => {
    it('should include command prefix for telegram', () => {
      const help = parser.generateHelpMessage('telegram');
      expect(help).toContain('/subscribe');
    });

    it('should include command prefix for discord', () => {
      const help = parser.generateHelpMessage('discord');
      expect(help).toContain('!weather subscribe');
    });

    it('should not include prefix for slack', () => {
      const help = parser.generateHelpMessage('slack');
      expect(help).toContain('subscribe');
      expect(help).not.toContain('/subscribe');
    });
  });

  describe('REGION_MAPPINGS', () => {
    it('should have all major regions', () => {
      expect(REGION_MAPPINGS).toHaveProperty('seoul');
      expect(REGION_MAPPINGS).toHaveProperty('busan');
      expect(REGION_MAPPINGS).toHaveProperty('jeju');
      expect(REGION_MAPPINGS).toHaveProperty('nationwide');
    });

    it('should have valid region codes', () => {
      for (const [key, mapping] of Object.entries(REGION_MAPPINGS)) {
        if (key !== 'nationwide') {
          expect(mapping.code).toMatch(/^L\d{7}$/);
        }
        expect(mapping.name).toBeTruthy();
        expect(mapping.aliases.length).toBeGreaterThan(0);
      }
    });
  });

  describe('WARNING_TYPE_MAPPINGS', () => {
    it('should have all warning types', () => {
      expect(WARNING_TYPE_MAPPINGS).toHaveProperty('heat');
      expect(WARNING_TYPE_MAPPINGS).toHaveProperty('rain');
      expect(WARNING_TYPE_MAPPINGS).toHaveProperty('typhoon');
      expect(WARNING_TYPE_MAPPINGS).toHaveProperty('all');
    });

    it('should have single-letter codes', () => {
      for (const [key, mapping] of Object.entries(WARNING_TYPE_MAPPINGS)) {
        if (key !== 'all') {
          expect(mapping.code).toMatch(/^[A-Z]$/);
        }
      }
    });
  });
});
