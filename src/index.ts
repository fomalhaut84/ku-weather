import { WeatherService } from './services/weatherService';
import { SlackService } from './services/slackService';
import { logger } from './utils/logger';
import { config } from './config';

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

function getWorkStatus(cntCode: string): string {
  const statuses: Record<string, string> = {
    '4': '통보완료'
  };
  return statuses[cntCode.trim()] || cntCode;
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
  logger.info(`${config.checkIntervalMinutes}분 간격으로 기상특보 모니터링 시작`);
  
  // 특보구역 데이터 로드
  logger.info('특보구역 데이터 로드 중...');
  await weatherService.fetchRegionData();
  
  const checkWeather = async () => {
    try {
      logger.debug('기상특보 확인 중...');
      const alerts = await weatherService.getWeatherAlerts(config.targetRegionIds, config.warningTypes, config.subcd);
      
      if (alerts.length > 0) {
        logger.info(`${alerts.length}개의 기상특보 발견`);
        
        // 콘솔에 특보 내용 출력
        console.log('\n=== 기상특보 상세 내용 ===');
        alerts.forEach((alert, index) => {
          console.log(`\n[${index + 1}] ${getWarningTypeName(alert.WRN)} ${getWarningLevel(alert.LVL)} ${getWarningCommand(alert.CMD)}`);
          console.log(`📍 지역: ${alert.REG_NAME} (${alert.REG_ID})`);
          console.log(`⚠️  종류: ${getWarningTypeName(alert.WRN)} (${alert.WRN})`);
          console.log(`📊 수준: ${getWarningLevel(alert.LVL)} (${alert.LVL})`);
          console.log(`📢 명령: ${getWarningCommand(alert.CMD)} (${alert.CMD})`);
          console.log(`🕐 발표: ${formatDateTime(alert.TM_FC)}`);
          console.log(`⏰ 발효: ${formatDateTime(alert.TM_EF)}`);
          console.log(`📝 입력: ${formatDateTime(alert.TM_IN)}`);
          console.log(`🏢 관서: ${alert.STN}`);
          console.log(`🌀 태풍등급: ${alert.GRD}`);
          console.log(`✅ 상태: ${getWorkStatus(alert.CNT)} (${alert.CNT})`);
          console.log(`📤 발송: ${alert.RPT}`);
        });
        console.log('\n=========================\n');
        
        // Slack 전송 비활성화
        // await slackService.sendWeatherAlert(alerts);
      } else {
        logger.debug('활성 기상특보 없음');
      }
    } catch (error) {
      logger.error('기상특보 확인 중 오류:', error);
    }
  };
  
  await checkWeather();
  
  setInterval(checkWeather, config.checkIntervalMinutes * 60 * 1000);
  logger.info('애플리케이션이 성공적으로 시작되었습니다');
}

if (require.main === module) {
  main();
}