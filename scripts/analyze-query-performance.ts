/**
 * 데이터베이스 쿼리 성능 분석 스크립트
 *
 * 사용법:
 * npx ts-node scripts/analyze-query-performance.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
  ],
});

interface QueryLog {
  query: string;
  params: string;
  duration: number;
}

const queryLogs: QueryLog[] = [];

// Prisma 쿼리 로깅
(prisma as any).$on('query', (e: any) => {
  queryLogs.push({
    query: e.query,
    params: e.params,
    duration: e.duration,
  });
});

/**
 * 쿼리 실행 및 성능 측정
 */
async function measureQueryPerformance() {
  console.log('=== 데이터베이스 쿼리 성능 분석 ===\n');

  // 1. getCurrentAlerts() 성능 측정
  console.log('1. getCurrentAlerts() - 현재 특보 조회');
  queryLogs.length = 0;
  const start1 = Date.now();

  const currentAlerts = await prisma.weatherAlert.findMany({
    where: {
      command: { not: '6' },
    },
    orderBy: {
      announcedAt: 'desc',
    },
  });

  const duration1 = Date.now() - start1;
  console.log(`   결과: ${currentAlerts.length}건`);
  console.log(`   소요시간: ${duration1}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  // 2. getCurrentAlerts() with filters - 지역 필터링
  console.log('2. getCurrentAlerts() - 지역 필터링');
  queryLogs.length = 0;
  const start2 = Date.now();

  const filteredAlerts = await prisma.weatherAlert.findMany({
    where: {
      regionId: 'L1100000',
      command: { not: '6' },
    },
    orderBy: {
      announcedAt: 'desc',
    },
  });

  const duration2 = Date.now() - start2;
  console.log(`   결과: ${filteredAlerts.length}건`);
  console.log(`   소요시간: ${duration2}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  // 3. getCurrentAlerts() with multiple filters
  console.log('3. getCurrentAlerts() - 복합 필터링 (upperRegion + warningType)');
  queryLogs.length = 0;
  const start3 = Date.now();

  const multiFilteredAlerts = await prisma.weatherAlert.findMany({
    where: {
      upperRegion: '서울특별시',
      warningType: 'W',
      command: { not: '6' },
    },
    orderBy: {
      announcedAt: 'desc',
    },
  });

  const duration3 = Date.now() - start3;
  console.log(`   결과: ${multiFilteredAlerts.length}건`);
  console.log(`   소요시간: ${duration3}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  // 4. getAlertHistory() - 기간별 이력 조회
  console.log('4. getAlertHistory() - 기간별 이력 (최근 7일)');
  queryLogs.length = 0;
  const start4 = Date.now();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const histories = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  const duration4 = Date.now() - start4;
  console.log(`   결과: ${histories.length}건`);
  console.log(`   소요시간: ${duration4}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  // 5. getAlertHistory() with filters
  console.log('5. getAlertHistory() - 필터링 (지역 + 변동 유형)');
  queryLogs.length = 0;
  const start5 = Date.now();

  const filteredHistories = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      regionId: 'L1100000',
      changeType: 'NEW',
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  const duration5 = Date.now() - start5;
  console.log(`   결과: ${filteredHistories.length}건`);
  console.log(`   소요시간: ${duration5}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  // 6. getAlertStatistics() - 지역별 통계
  console.log('6. getAlertStatistics() - 지역별 통계 (최근 30일)');
  queryLogs.length = 0;
  const start6 = Date.now();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stats = await prisma.alertHistory.groupBy({
    by: ['upperRegion'],
    where: {
      timestamp: {
        gte: thirtyDaysAgo,
        lte: endDate,
      },
    },
    _count: {
      id: true,
    },
  });

  const duration6 = Date.now() - start6;
  console.log(`   결과: ${stats.length}개 지역`);
  console.log(`   소요시간: ${duration6}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  // 7. getAlertStatistics() - 특보 종류별 통계
  console.log('7. getAlertStatistics() - 특보 종류별 통계 (최근 30일)');
  queryLogs.length = 0;
  const start7 = Date.now();

  const statsByType = await prisma.alertHistory.groupBy({
    by: ['warningType'],
    where: {
      timestamp: {
        gte: thirtyDaysAgo,
        lte: endDate,
      },
    },
    _count: {
      id: true,
    },
  });

  const duration7 = Date.now() - start7;
  console.log(`   결과: ${statsByType.length}개 특보 종류`);
  console.log(`   소요시간: ${duration7}ms`);
  console.log(`   쿼리 수: ${queryLogs.length}개`);
  if (queryLogs.length > 0) {
    console.log(`   Prisma 쿼리 시간: ${queryLogs[0].duration}ms\n`);
  }

  console.log('=== 성능 분석 완료 ===\n');

  // 요약
  console.log('=== 요약 ===');
  console.log(`현재 특보 조회: ${duration1}ms`);
  console.log(`지역 필터링: ${duration2}ms`);
  console.log(`복합 필터링: ${duration3}ms`);
  console.log(`이력 조회 (7일): ${duration4}ms`);
  console.log(`이력 필터링: ${duration5}ms`);
  console.log(`지역별 통계: ${duration6}ms`);
  console.log(`특보별 통계: ${duration7}ms`);
}

/**
 * PostgreSQL EXPLAIN ANALYZE 실행
 */
async function explainQueries() {
  console.log('\n\n=== PostgreSQL EXPLAIN ANALYZE ===\n');

  // 1. weather_alerts 테이블 전체 조회 (command != '6')
  console.log('1. Weather Alerts - 현재 특보 조회');
  const explain1 = await prisma.$queryRaw<any[]>`
    EXPLAIN ANALYZE
    SELECT * FROM weather_alerts
    WHERE command != '6'
    ORDER BY "announcedAt" DESC;
  `;
  console.log(explain1.map(row => row['QUERY PLAN']).join('\n'));
  console.log('\n');

  // 2. weather_alerts 테이블 - upperRegion 인덱스 사용
  console.log('2. Weather Alerts - upperRegion 필터링');
  const explain2 = await prisma.$queryRaw<any[]>`
    EXPLAIN ANALYZE
    SELECT * FROM weather_alerts
    WHERE "upperRegion" = '서울특별시'
      AND command != '6'
    ORDER BY "announcedAt" DESC;
  `;
  console.log(explain2.map(row => row['QUERY PLAN']).join('\n'));
  console.log('\n');

  // 3. alert_histories 테이블 - 기간별 조회
  console.log('3. Alert Histories - 기간별 조회');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const explain3 = await prisma.$queryRaw<any[]>`
    EXPLAIN ANALYZE
    SELECT * FROM alert_histories
    WHERE timestamp >= ${sevenDaysAgo}
      AND timestamp <= NOW()
    ORDER BY timestamp DESC;
  `;
  console.log(explain3.map(row => row['QUERY PLAN']).join('\n'));
  console.log('\n');

  // 4. alert_histories 테이블 - GROUP BY 쿼리
  console.log('4. Alert Histories - 지역별 GROUP BY');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const explain4 = await prisma.$queryRaw<any[]>`
    EXPLAIN ANALYZE
    SELECT "upperRegion", COUNT(id) as count
    FROM alert_histories
    WHERE timestamp >= ${thirtyDaysAgo}
      AND timestamp <= NOW()
    GROUP BY "upperRegion";
  `;
  console.log(explain4.map(row => row['QUERY PLAN']).join('\n'));
  console.log('\n');

  console.log('=== EXPLAIN ANALYZE 완료 ===');
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    // 성능 측정
    await measureQueryPerformance();

    // EXPLAIN ANALYZE
    await explainQueries();

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
