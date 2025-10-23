import { WeatherService } from './services/weatherService';
import { logger } from './utils/logger';
import { config } from './config';
import { NotificationFactory } from './services/notifications/NotificationFactory';
import { MultiplatformNotificationService } from './services/notifications/MultiplatformNotificationService';
import { HttpServer } from './server';

// UTF-8 출력 설정
process.stdout.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');

function getWarningTypeName(warningCode: string): string {
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

function getWarningLevel(levelCode: string): string {
  const levels: Record<string, string> = {
    '1': '예비',
    '2': '주의보',
    '3': '경보'
  };
  return levels[levelCode.trim()] || levelCode;
}

function getWarningCommand(cmdCode: string): string {
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

function formatDateTime(dateTimeStr: string): string {
  try {
    // YYYYMMDDHHMM 형태를 YYYY-MM-DD HH:MM 형태로 변환
    if (dateTimeStr.length === 12) {
      const year = dateTimeStr.substring(0, 4);
      const month = dateTimeStr.substring(4, 6);
      const day = dateTimeStr.substring(6, 8);
      const hour = dateTimeStr.substring(8, 10);
      const minute = dateTimeStr.substring(10, 12);
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }
    return dateTimeStr;
  } catch {
    return dateTimeStr;
  }
}

async function main() {
  try {
    logger.info('기상특보 모니터링 시작');

    const weatherService = new WeatherService(config.weatherApiKey);

    // 새로운 다중 플랫폼 알림 서비스 초기화
    const notificationService = NotificationFactory.createMultiplatformService(config.notificationConfig);

    // 설정 유효성 검사
    const validation = NotificationFactory.validateConfig(config.notificationConfig);
    if (!validation.valid) {
      logger.error('알림 설정 검증 실패:', validation.errors);
      throw new Error('알림 설정이 올바르지 않습니다');
    }

    // HTTP 서버 초기화 및 시작 (선택적)
    if (config.serverEnabled) {
      const httpServer = new HttpServer({
        port: config.serverPort,
        environment: config.environment,
        corsOrigin: config.corsOrigin,
        telegramWebhookSecret: config.telegramWebhookSecret
      });

      // 서비스 인스턴스 주입
      httpServer.setServices(notificationService, weatherService);

      // 서버 시작 (백그라운드)
      await httpServer.start();
    } else {
      logger.info('HTTP 서버가 비활성화되어 있습니다 (SERVER_ENABLED=false)');
    }

    // 기상특보 모니터링 시작 (백그라운드)
    await startMonitoring(weatherService, notificationService);

  } catch (error) {
    logger.error('애플리케이션 시작 중 오류 발생:', error);
    process.exit(1);
  }
}

async function startMonitoring(weatherService: WeatherService, notificationService: MultiplatformNotificationService) {
  logger.info(`${config.checkIntervalMinutes}분 간격으로 기상특보 모니터링 시작`);
  
  // 특보구역 데이터 로드
  logger.info('특보구역 데이터 로드 중...');
  await weatherService.fetchRegionData();
  
  // 알림 서비스 건강 상태 확인
  logger.info('알림 서비스 건강 상태 확인 중...');
  const healthStatus = await notificationService.healthCheck();
  const healthyPlatforms = Object.entries(healthStatus).filter(([_, healthy]) => healthy);
  const unhealthyPlatforms = Object.entries(healthStatus).filter(([_, healthy]) => !healthy);
  
  if (unhealthyPlatforms.length === 0) {
    logger.info(`모든 알림 플랫폼이 정상 상태입니다: ${healthyPlatforms.map(([platform]) => platform).join(', ')}`);
  } else {
    logger.warn(`일부 알림 플랫폼이 비정상 상태입니다. 정상: ${healthyPlatforms.map(([platform]) => platform).join(', ')}, 비정상: ${unhealthyPlatforms.map(([platform]) => platform).join(', ')}`);
  }
  
  const checkWeather = async () => {
    try {
      logger.debug('기상특보 변동 확인 중...');
      const changes = await weatherService.checkForAlertChanges(config.targetRegionIds, config.warningTypes, config.subcd);
      
      if (changes.length > 0) {
        logger.info(`${changes.length}개의 특보 변동사항 발견`);
        
        // 콘솔에 변동 내역 출력
        console.log('\n=== 기상특보 변동 내역 ===');
        changes.forEach((change, index) => {
          const typeEmoji = {
            'NEW': '🆕',
            'RESOLVED': '✅', 
            'LEVEL_UP': '⬆️',
            'LEVEL_DOWN': '⬇️',
            'TIME_EXTENDED': '⏰',
            'MODIFIED': '🔄'
          };
          
          console.log(`\n[${index + 1}] ${typeEmoji[change.type]} ${change.description}`);
          
          if (change.current) {
            console.log(`📍 지역: ${change.current.regionName} (${change.current.regionId})`);
            console.log(`⚠️  종류: ${getWarningTypeName(change.current.warningType)} (${change.current.warningType})`);
            console.log(`📊 수준: ${getWarningLevel(change.current.level)} (${change.current.level})`);
            console.log(`📢 명령: ${getWarningCommand(change.current.command)} (${change.current.command})`);
            console.log(`🕐 발표: ${formatDateTime(change.current.announcedAt)}`);
            console.log(`⏰ 발효: ${formatDateTime(change.current.effectiveAt)}`);
          }
          
          if (change.previous && (change.type === 'RESOLVED' || change.type === 'LEVEL_UP' || change.type === 'LEVEL_DOWN')) {
            console.log(`📋 이전: ${getWarningTypeName(change.previous.warningType)} ${getWarningLevel(change.previous.level)}`);
          }
        });
        console.log('\n=========================\n');
        
        // 다중 플랫폼 알림 전송
        try {
          const results = await notificationService.sendAlertChanges(changes);
          const successCount = results.filter(r => r.success).length;
          const failCount = results.length - successCount;
          
          if (failCount === 0) {
            logger.info(`${changes.length}개 변동사항 알림 전송 완료 (${successCount}개 플랫폼 성공)`);
          } else {
            logger.warn(`${changes.length}개 변동사항 알림 전송 완료 (성공: ${successCount}, 실패: ${failCount})`);
            
            // 실패한 플랫폼 로그 출력
            results.filter(r => !r.success).forEach(result => {
              logger.error(`${result.platform} 전송 실패: ${result.error}`);
            });
          }
        } catch (error) {
          logger.error('알림 전송 실패:', error);
        }
      } else {
        logger.debug('기상특보 변동 없음');
      }
    } catch (error) {
      logger.error('기상특보 변동 확인 중 오류:', error);
    }
  };
  
  await checkWeather();
  
  setInterval(checkWeather, config.checkIntervalMinutes * 60 * 1000);
  logger.info('애플리케이션이 성공적으로 시작되었습니다');
}

if (require.main === module) {
  main();
}