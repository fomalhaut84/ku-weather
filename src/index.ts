import { WeatherService } from './services/weatherService';
import { SlackService } from './services/slackService';
import { logger } from './utils/logger';
import { config } from './config';

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
    const slackService = new SlackService(config.slackWebhookUrl);
    
    await startMonitoring(weatherService, slackService);
    
  } catch (error) {
    logger.error('애플리케이션 시작 중 오류 발생:', error);
    process.exit(1);
  }
}

async function startMonitoring(weatherService: WeatherService, slackService: SlackService) {
  logger.info(`기상특보 모니터링 서비스 시작`);
  logger.info(`모니터링 간격: ${config.checkIntervalMinutes}분`);
  logger.info(`대상 지역: ${config.targetRegionIds.length}개 지역`);
  logger.info(`특보 유형: ${config.warningTypes.length > 0 ? config.warningTypes.join(', ') : '전체'}`);
  
  // 특보구역 데이터 로드
  logger.info('특보구역 데이터 초기화 중...');
  const regionLoadStart = Date.now();
  await weatherService.fetchRegionData();
  const regionLoadDuration = Date.now() - regionLoadStart;
  logger.info(`특보구역 데이터 로드 완료 (${regionLoadDuration}ms 소요)`);
  
  const checkWeather = async () => {
    try {
      logger.debug('기상특보 변동 확인 중...');
      const changes = await weatherService.checkForAlertChanges(config.targetRegionIds, config.warningTypes, config.subcd);
      
      if (changes.length > 0) {
        // 변동 유형별 통계 계산
        const changeStats = changes.reduce((stats, change) => {
          stats[change.type] = (stats[change.type] || 0) + 1;
          return stats;
        }, {} as Record<string, number>);
        
        const statsText = Object.entries(changeStats)
          .map(([type, count]) => {
            const typeNames = {
              'NEW': '신규',
              'RESOLVED': '해제',
              'LEVEL_UP': '상향',
              'LEVEL_DOWN': '하향',
              'TIME_EXTENDED': '연장',
              'MODIFIED': '변경'
            };
            return `${typeNames[type as keyof typeof typeNames]}: ${count}건`;
          })
          .join(', ');
        
        logger.info(`특보 변동 감지: ${changes.length}개 항목 발견 (${statsText})`);
        
        // 콘솔에 변동 내역 출력
        console.log('\n=== 기상특보 변동 내역 ===');
        console.log(`📊 변동 통계: ${statsText}`);
        console.log('');
        
        changes.forEach((change, index) => {
          const typeEmoji = {
            'NEW': '🆕',
            'RESOLVED': '✅', 
            'LEVEL_UP': '⬆️',
            'LEVEL_DOWN': '⬇️',
            'TIME_EXTENDED': '⏰',
            'MODIFIED': '🔄'
          };
          
          console.log(`[${index + 1}] ${typeEmoji[change.type]} ${change.description}`);
          
          if (change.current) {
            console.log(`    📍 지역: ${change.current.regionName} (${change.current.regionId})`);
            console.log(`    ⚠️  종류: ${getWarningTypeName(change.current.warningType)} (${change.current.warningType})`);
            console.log(`    📊 수준: ${getWarningLevel(change.current.level)} (${change.current.level})`);
            console.log(`    📢 명령: ${getWarningCommand(change.current.command)} (${change.current.command})`);
            console.log(`    🕐 발표: ${formatDateTime(change.current.announcedAt)}`);
            console.log(`    ⏰ 발효: ${formatDateTime(change.current.effectiveAt)}`);
          }
          
          // 이전 상태 정보 표시 (해제, 수준 변화, 시간 연장 시)
          if (change.previous) {
            if (change.type === 'RESOLVED') {
              console.log(`    📋 이전: ${getWarningTypeName(change.previous.warningType)} ${getWarningLevel(change.previous.level)}`);
            } else if (change.type === 'LEVEL_UP' || change.type === 'LEVEL_DOWN') {
              console.log(`    📈 수준: ${getWarningLevel(change.previous.level)} → ${getWarningLevel(change.current!.level)}`);
            } else if (change.type === 'TIME_EXTENDED') {
              console.log(`    ⏳ 시간: ${formatDateTime(change.previous.effectiveAt)} → ${formatDateTime(change.current!.effectiveAt)}`);
            }
          }
          
          console.log('');
        });
        console.log('=========================\n');
        
        // Slack 알림 전송
        try {
          const startTime = Date.now();
          await slackService.sendAlertChanges(changes);
          const duration = Date.now() - startTime;
          logger.info(`Slack 알림 전송 완료: ${changes.length}개 항목, ${duration}ms 소요`);
        } catch (error) {
          logger.error(`Slack 알림 전송 실패 (${changes.length}개 항목):`, error);
        }
      } else {
        logger.debug('기상특보 변동 감지: 변동 사항 없음 - 정상 상태 유지');
      }
    } catch (error) {
      logger.error('기상특보 모니터링 중 예외 발생:', error);
      // 에러 발생 시 잠시 대기 후 재시도를 위해 다음 주기까지 대기
      logger.info('다음 모니터링 주기에서 재시도합니다...');
    }
  };
  
  // 초기 실행
  logger.info('초기 특보 상태 확인 시작...');
  await checkWeather();
  
  // 주기적 모니터링 시작
  const intervalId = setInterval(checkWeather, config.checkIntervalMinutes * 60 * 1000);
  logger.info(`기상특보 모니터링이 성공적으로 시작되었습니다 (${config.checkIntervalMinutes}분 간격)`);
  logger.info('모니터링을 중단하려면 Ctrl+C를 누르세요');
  
  // Graceful shutdown 처리
  process.on('SIGINT', () => {
    logger.info('기상특보 모니터링 중단 요청 수신...');
    clearInterval(intervalId);
    logger.info('모니터링이 안전하게 종료되었습니다');
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}