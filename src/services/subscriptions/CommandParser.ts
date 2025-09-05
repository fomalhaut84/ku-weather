/**
 * 구독 명령어 파서 및 유틸리티
 * 
 * 각 플랫폼에서 사용할 수 있는 공통 명령어 파싱 로직
 */

import { logger } from '../../utils/logger';
import {
  BotCommandParser,
  SubscriptionCommandParams,
  SubscriptionCommand,
  RegionMapping,
  WarningTypeMapping
} from './interfaces';

/**
 * 지역 코드 매핑 (사용자 친화적 이름)
 */
export const REGION_MAPPINGS: RegionMapping = {
  // 수도권
  'seoul': { code: 'L1100000', name: '서울특별시', aliases: ['seoul', '서울', 'Seoul'] },
  'gyeonggi': { code: 'L1010000', name: '경기도', aliases: ['gyeonggi', '경기', 'Gyeonggi'] },
  'incheon': { code: 'L2300000', name: '인천광역시', aliases: ['incheon', '인천', 'Incheon'] },
  
  // 영남권
  'busan': { code: 'L2600000', name: '부산광역시', aliases: ['busan', '부산', 'Busan'] },
  'daegu': { code: 'L2700000', name: '대구광역시', aliases: ['daegu', '대구', 'Daegu'] },
  'ulsan': { code: 'L3100000', name: '울산광역시', aliases: ['ulsan', '울산', 'Ulsan'] },
  'gyeongnam': { code: 'L3000000', name: '경상남도', aliases: ['gyeongnam', '경남', 'Gyeongnam'] },
  'gyeongbuk': { code: 'L2900000', name: '경상북도', aliases: ['gyeongbuk', '경북', 'Gyeongbuk'] },
  
  // 호남권
  'gwangju': { code: 'L2400000', name: '광주광역시', aliases: ['gwangju', '광주', 'Gwangju'] },
  'jeonnam': { code: 'L4600000', name: '전라남도', aliases: ['jeonnam', '전남', 'Jeonnam'] },
  'jeonbuk': { code: 'L4500000', name: '전라북도', aliases: ['jeonbuk', '전북', 'Jeonbuk'] },
  
  // 충청권
  'daejeon': { code: 'L2500000', name: '대전광역시', aliases: ['daejeon', '대전', 'Daejeon'] },
  'sejong': { code: 'L3600000', name: '세종특별자치시', aliases: ['sejong', '세종', 'Sejong'] },
  'chungnam': { code: 'L4400000', name: '충청남도', aliases: ['chungnam', '충남', 'Chungnam'] },
  'chungbuk': { code: 'L4300000', name: '충청북도', aliases: ['chungbuk', '충북', 'Chungbuk'] },
  
  // 강원권
  'gangwon': { code: 'L4200000', name: '강원도', aliases: ['gangwon', '강원', 'Gangwon'] },
  
  // 제주권
  'jeju': { code: 'L5010000', name: '제주특별자치도', aliases: ['jeju', '제주', 'Jeju'] },
  
  // 특수 지역
  'nationwide': { code: '', name: '전국', aliases: ['all', 'nationwide', '전국', '전체'] }
};

/**
 * 특보 종류 매핑 (사용자 친화적 이름)
 */
export const WARNING_TYPE_MAPPINGS: WarningTypeMapping = {
  'heat': { code: 'H', name: '폭염', aliases: ['heat', 'hot', '폭염', 'H'] },
  'rain': { code: 'R', name: '호우', aliases: ['rain', 'heavy_rain', '호우', 'R'] },
  'wind': { code: 'W', name: '강풍', aliases: ['wind', 'strong_wind', '강풍', 'W'] },
  'cold': { code: 'C', name: '한파', aliases: ['cold', 'freeze', '한파', 'C'] },
  'snow': { code: 'S', name: '대설', aliases: ['snow', 'heavy_snow', '대설', 'S'] },
  'typhoon': { code: 'T', name: '태풍', aliases: ['typhoon', 'hurricane', '태풍', 'T'] },
  'dust': { code: 'Y', name: '황사', aliases: ['dust', 'yellow_dust', '황사', 'Y'] },
  'fog': { code: 'F', name: '안개', aliases: ['fog', 'mist', '안개', 'F'] },
  'dry': { code: 'D', name: '건조', aliases: ['dry', 'drought', '건조', 'D'] },
  'surge': { code: 'O', name: '해일', aliases: ['surge', 'storm_surge', '해일', 'O'] },
  'tsunami': { code: 'N', name: '지진해일', aliases: ['tsunami', '지진해일', 'N'] },
  'wave': { code: 'V', name: '풍랑', aliases: ['wave', 'rough_sea', '풍랑', 'V'] },
  'all': { code: '', name: '전체', aliases: ['all', 'everything', '전체', '모두'] }
};

/**
 * 공통 명령어 파서 구현
 */
export class CommonCommandParser implements BotCommandParser {
  
  /**
   * 메시지에서 구독 명령어 파싱
   */
  parseCommand(message: string, platform: string, userId: string): SubscriptionCommandParams | null {
    try {
      // 메시지 정규화 (앞뒤 공백 제거, 소문자 변환)
      const normalizedMessage = message.trim().toLowerCase();
      
      // 플랫폼별 명령어 접두사 제거
      const cleanMessage = this.removeCommandPrefix(normalizedMessage, platform);
      
      // 공백으로 분리
      const parts = cleanMessage.split(/\s+/).filter(part => part.length > 0);
      
      if (parts.length === 0) return null;
      
      // 첫 번째 부분이 명령어
      const commandStr = parts[0];
      const args = parts.slice(1);
      
      // 명령어 변환
      const command = this.parseCommandType(commandStr);
      if (!command) return null;
      
      return {
        command,
        platform,
        userId,
        args,
        rawMessage: message
      };

    } catch (error) {
      logger.warn(`명령어 파싱 실패: ${message}`, error);
      return null;
    }
  }

  /**
   * 명령어 유효성 검증
   */
  validateCommand(params: SubscriptionCommandParams): boolean {
    try {
      switch (params.command) {
        case 'subscribe':
          // 구독: 최소 1개 이상의 인자 필요 (지역)
          return params.args.length >= 1;
          
        case 'unsubscribe':
          // 구독 해제: 지역명 필요 (선택적)
          return true;
          
        case 'quiet':
          // 조용 시간: 시작시간, 종료시간 필요
          return params.args.length >= 2 && this.validateTimeFormat(params.args[0]) && this.validateTimeFormat(params.args[1]);
          
        case 'list':
        case 'settings':
        case 'status':
        case 'help':
          // 인자가 필요 없는 명령어들
          return true;
          
        default:
          return false;
      }
    } catch (error) {
      logger.warn('명령어 검증 실패:', error);
      return false;
    }
  }

  /**
   * 명령어 자동완성/제안
   */
  suggestCommands(partialCommand: string): string[] {
    const allCommands = ['subscribe', 'unsubscribe', 'list', 'settings', 'quiet', 'status', 'help'];
    const partial = partialCommand.toLowerCase();
    
    return allCommands.filter(cmd => cmd.startsWith(partial));
  }

  /**
   * 지역명을 지역 코드로 변환
   */
  parseRegion(regionName: string): { code: string; name: string } | null {
    const normalized = regionName.toLowerCase();
    
    for (const [key, mapping] of Object.entries(REGION_MAPPINGS)) {
      if (mapping.aliases.some(alias => alias.toLowerCase() === normalized)) {
        return { code: mapping.code, name: mapping.name };
      }
    }
    
    return null;
  }

  /**
   * 특보 종류를 특보 코드로 변환
   */
  parseWarningType(warningName: string): { code: string; name: string } | null {
    const normalized = warningName.toLowerCase();
    
    for (const [key, mapping] of Object.entries(WARNING_TYPE_MAPPINGS)) {
      if (mapping.aliases.some(alias => alias.toLowerCase() === normalized)) {
        return { code: mapping.code, name: mapping.name };
      }
    }
    
    return null;
  }

  /**
   * 특보 수준 파싱 (1: 예비특보, 2: 주의보, 3: 경보)
   */
  parseWarningLevel(levelStr: string): string | null {
    const normalized = levelStr.toLowerCase();
    
    const levelMappings: Record<string, string> = {
      '1': '1', 'preliminary': '1', '예비': '1', '예비특보': '1',
      '2': '2', 'advisory': '2', '주의보': '2', 'watch': '2',
      '3': '3', 'warning': '3', '경보': '3', 'alert': '3'
    };
    
    return levelMappings[normalized] || null;
  }

  /**
   * 시간 형식 검증 (HH:MM 형식)
   */
  validateTimeFormat(timeStr: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(timeStr);
  }

  /**
   * 구독 설정 요약 메시지 생성
   */
  formatSubscriptionSummary(subscription: any): string {
    const regions = subscription.targetRegions?.length > 0 
      ? subscription.targetRegions.map((code: string) => this.getRegionName(code)).join(', ')
      : '전국';
    
    const warnings = subscription.warningTypes?.length > 0
      ? subscription.warningTypes.map((code: string) => this.getWarningTypeName(code)).join(', ')
      : '전체';
    
    const quiet = subscription.preferences?.quietHours
      ? `조용시간: ${subscription.preferences.quietHours.start}~${subscription.preferences.quietHours.end}`
      : '조용시간 없음';
    
    const minLevel = subscription.preferences?.minLevel
      ? `최소수준: ${this.getLevelName(subscription.preferences.minLevel)}`
      : '모든 수준';

    return `📍 지역: ${regions}\n⚠️ 특보: ${warnings}\n🔇 ${quiet}\n📊 ${minLevel}`;
  }

  /**
   * 도움말 메시지 생성 (플랫폼별 커스터마이징 가능)
   */
  generateHelpMessage(platform: string): string {
    const prefix = this.getCommandPrefix(platform);
    
    return `🌦️ 기상특보 구독 도움말

📝 기본 명령어:
${prefix}subscribe <지역> [특보종류] - 구독 추가
${prefix}unsubscribe [지역] - 구독 해제
${prefix}list - 내 구독 현황
${prefix}quiet <시작시간> <종료시간> - 조용 시간 설정
${prefix}help - 이 도움말

🌍 지역: seoul, busan, jeju, all 등
⚠️ 특보: heat, rain, typhoon, all 등
⏰ 시간: HH:MM 형식 (예: 22:00)

예시:
${prefix}subscribe seoul heat - 서울 폭염 알림 구독
${prefix}quiet 22:00 08:00 - 밤 10시~아침 8시 조용
${prefix}unsubscribe seoul - 서울 모든 알림 해제`;
  }

  // Private helper methods

  private removeCommandPrefix(message: string, platform: string): string {
    const prefix = this.getCommandPrefix(platform);
    if (message.startsWith(prefix)) {
      return message.substring(prefix.length).trim();
    }
    return message;
  }

  private getCommandPrefix(platform: string): string {
    const prefixes: Record<string, string> = {
      'telegram': '/',
      'discord': '!weather ',
      'slack': '',
      'email': ''
    };
    
    return prefixes[platform] || '';
  }

  private parseCommandType(commandStr: string): SubscriptionCommand | null {
    const commandMappings: Record<string, SubscriptionCommand> = {
      // 구독 관련
      'subscribe': 'subscribe',
      'sub': 'subscribe',
      '구독': 'subscribe',
      
      // 구독 해제
      'unsubscribe': 'unsubscribe',
      'unsub': 'unsubscribe',
      '해제': 'unsubscribe',
      
      // 목록/설정 조회
      'list': 'list',
      'settings': 'settings',
      'mysettings': 'settings',
      '목록': 'list',
      '설정': 'settings',
      
      // 조용 시간
      'quiet': 'quiet',
      'silence': 'quiet',
      '조용': 'quiet',
      
      // 상태 확인
      'status': 'status',
      '상태': 'status',
      
      // 도움말
      'help': 'help',
      '도움말': 'help',
      '?': 'help'
    };
    
    return commandMappings[commandStr] || null;
  }

  private getRegionName(code: string): string {
    for (const mapping of Object.values(REGION_MAPPINGS)) {
      if (mapping.code === code) {
        return mapping.name;
      }
    }
    return code;
  }

  private getWarningTypeName(code: string): string {
    for (const mapping of Object.values(WARNING_TYPE_MAPPINGS)) {
      if (mapping.code === code) {
        return mapping.name;
      }
    }
    return code;
  }

  private getLevelName(level: string): string {
    const levelNames: Record<string, string> = {
      '1': '예비특보',
      '2': '주의보', 
      '3': '경보'
    };
    return levelNames[level] || level;
  }
}