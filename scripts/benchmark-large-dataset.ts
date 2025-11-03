/**
 * 대량 데이터 벤치마크 스크립트
 *
 * 10,000건의 더미 데이터를 생성하고 성능을 테스트합니다.
 *
 * 사용법:
 * npx ts-node scripts/benchmark-large-dataset.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BenchmarkResult {
  operation: string;
  recordCount: number;
  duration: number;
  avgDuration: number;
}

const results: BenchmarkResult[] = [];

/**
 * 더미 데이터 생성
 */
async function generateDummyData(count: number) {
  console.log(`\n=== ${count}건의 더미 데이터 생성 ===\n`);

  const regions = [
    'L1100000', 'L1200000', 'L1300000', 'L1400000',
    'L2100000', 'L2200000', 'L2300000', 'L2400000',
  ];

  const warningTypes = ['W', 'R', 'C', 'H', 'S', 'V', 'T'];
  const levels = ['1', '2', '3'];
  const changeTypes = ['NEW', 'RESOLVED', 'LEVEL_UP', 'LEVEL_DOWN', 'TIME_EXTENDED', 'MODIFIED'];
  const upperRegions = [
    '서울특별시', '경기도', '강원도', '충청남도',
    '전라남도', '경상남도', '제주도'
  ];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 90); // 90일 전부터 시작

  const histories = [];

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseDate.getTime() + i * 60 * 60 * 1000); // 1시간 간격

    histories.push({
      regionId: regions[i % regions.length],
      regionName: `지역${i % regions.length}`,
      upperRegion: upperRegions[i % upperRegions.length],
      warningType: warningTypes[i % warningTypes.length],
      warningLevel: levels[i % levels.length],
      changeType: changeTypes[i % changeTypes.length],
      previousData: i % 2 === 0 ? { level: '1' } : null,
      currentData: { level: levels[i % levels.length] },
      timestamp,
    });
  }

  console.log(`${count}건의 더미 데이터 생성 완료`);

  // 배치 삽입
  console.log('데이터베이스에 삽입 중...');
  const startInsert = Date.now();

  // 1000건씩 배치 처리
  const batchSize = 1000;
  for (let i = 0; i < histories.length; i += batchSize) {
    const batch = histories.slice(i, i + batchSize);
    await prisma.alertHistory.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`  ${Math.min(i + batchSize, histories.length)}/${histories.length} 삽입 완료`);
  }

  const insertDuration = Date.now() - startInsert;
  console.log(`\n삽입 완료: ${insertDuration}ms (평균 ${(insertDuration / count).toFixed(2)}ms/건)\n`);

  results.push({
    operation: 'Batch Insert',
    recordCount: count,
    duration: insertDuration,
    avgDuration: insertDuration / count,
  });
}

/**
 * 쿼리 성능 벤치마크
 */
async function benchmarkQueries() {
  console.log('=== 쿼리 성능 벤치마크 ===\n');

  const endDate = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. 기간별 조회 (7일)
  console.log('1. 기간별 조회 (최근 7일)');
  const start1 = Date.now();
  const result1 = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: sevenDaysAgo,
        lte: endDate,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  const duration1 = Date.now() - start1;
  console.log(`   결과: ${result1.length}건, 소요시간: ${duration1}ms\n`);
  results.push({
    operation: 'History Query (7 days)',
    recordCount: result1.length,
    duration: duration1,
    avgDuration: duration1 / result1.length,
  });

  // 2. 기간별 조회 with 필터 (30일)
  console.log('2. 기간별 + 필터 조회 (최근 30일, 특정 지역)');
  const start2 = Date.now();
  const result2 = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: thirtyDaysAgo,
        lte: endDate,
      },
      regionId: 'L1100000',
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  const duration2 = Date.now() - start2;
  console.log(`   결과: ${result2.length}건, 소요시간: ${duration2}ms\n`);
  results.push({
    operation: 'History Query with Filter (30 days)',
    recordCount: result2.length,
    duration: duration2,
    avgDuration: result2.length > 0 ? duration2 / result2.length : 0,
  });

  // 3. 복합 필터 (30일 + warningType + changeType)
  console.log('3. 복합 필터 조회');
  const start3 = Date.now();
  const result3 = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: thirtyDaysAgo,
        lte: endDate,
      },
      warningType: 'W',
      changeType: 'NEW',
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  const duration3 = Date.now() - start3;
  console.log(`   결과: ${result3.length}건, 소요시간: ${duration3}ms\n`);
  results.push({
    operation: 'Complex Filter Query',
    recordCount: result3.length,
    duration: duration3,
    avgDuration: result3.length > 0 ? duration3 / result3.length : 0,
  });

  // 4. GROUP BY 통계 (30일)
  console.log('4. GROUP BY 통계 (지역별)');
  const start4 = Date.now();
  const result4 = await prisma.alertHistory.groupBy({
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
  const duration4 = Date.now() - start4;
  console.log(`   결과: ${result4.length}개 지역, 소요시간: ${duration4}ms\n`);
  results.push({
    operation: 'GROUP BY Statistics (region)',
    recordCount: result4.length,
    duration: duration4,
    avgDuration: duration4 / result4.length,
  });

  // 5. GROUP BY 통계 (특보 종류별)
  console.log('5. GROUP BY 통계 (특보 종류별)');
  const start5 = Date.now();
  const result5 = await prisma.alertHistory.groupBy({
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
  const duration5 = Date.now() - start5;
  console.log(`   결과: ${result5.length}개 종류, 소요시간: ${duration5}ms\n`);
  results.push({
    operation: 'GROUP BY Statistics (type)',
    recordCount: result5.length,
    duration: duration5,
    avgDuration: duration5 / result5.length,
  });

  // 6. 페이지네이션 테스트 (LIMIT/OFFSET)
  console.log('6. 페이지네이션 테스트 (LIMIT 100)');
  const start6 = Date.now();
  const result6 = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: thirtyDaysAgo,
        lte: endDate,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
    take: 100,
    skip: 0,
  });
  const duration6 = Date.now() - start6;
  console.log(`   결과: ${result6.length}건, 소요시간: ${duration6}ms\n`);
  results.push({
    operation: 'Pagination (LIMIT 100)',
    recordCount: result6.length,
    duration: duration6,
    avgDuration: duration6 / result6.length,
  });

  // 7. 깊은 페이지네이션 (OFFSET 5000)
  console.log('7. 깊은 페이지네이션 (OFFSET 5000, LIMIT 100)');
  const start7 = Date.now();
  const result7 = await prisma.alertHistory.findMany({
    where: {
      timestamp: {
        gte: thirtyDaysAgo,
        lte: endDate,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
    take: 100,
    skip: 5000,
  });
  const duration7 = Date.now() - start7;
  console.log(`   결과: ${result7.length}건, 소요시간: ${duration7}ms\n`);
  results.push({
    operation: 'Deep Pagination (OFFSET 5000)',
    recordCount: result7.length,
    duration: duration7,
    avgDuration: result7.length > 0 ? duration7 / result7.length : 0,
  });
}

/**
 * 결과 출력
 */
function printResults() {
  console.log('\n=== 벤치마크 결과 요약 ===\n');
  console.log('Operation                           | Records | Total (ms) | Avg (ms/record)');
  console.log('----------------------------------- | ------- | ---------- | ---------------');

  results.forEach(result => {
    const operation = result.operation.padEnd(35);
    const records = result.recordCount.toString().padStart(7);
    const total = result.duration.toFixed(2).padStart(10);
    const avg = result.avgDuration.toFixed(4).padStart(15);
    console.log(`${operation} | ${records} | ${total} | ${avg}`);
  });

  console.log('\n=== 성능 평가 ===\n');

  // 기준: 100ms 이하는 Good, 500ms 이하는 Acceptable, 그 이상은 Needs Improvement
  results.forEach(result => {
    let status = '🟢 Good';
    if (result.duration > 500) {
      status = '🔴 Needs Improvement';
    } else if (result.duration > 100) {
      status = '🟡 Acceptable';
    }
    console.log(`${status} - ${result.operation}: ${result.duration.toFixed(2)}ms`);
  });
}

/**
 * 클린업 (테스트 데이터 삭제)
 */
async function cleanup() {
  console.log('\n\n=== 테스트 데이터 정리 중 ===\n');

  const start = Date.now();
  const deleted = await prisma.alertHistory.deleteMany({
    where: {
      regionName: {
        startsWith: '지역',
      },
    },
  });
  const duration = Date.now() - start;

  console.log(`${deleted.count}건의 테스트 데이터 삭제 완료 (${duration}ms)\n`);
}

/**
 * 메인 실행
 */
async function main() {
  try {
    console.log('=== 대량 데이터 벤치마크 시작 ===\n');
    console.log(`실행 시각: ${new Date().toISOString()}\n`);

    // 1. 더미 데이터 생성 (10,000건)
    await generateDummyData(10000);

    // 2. 쿼리 성능 벤치마크
    await benchmarkQueries();

    // 3. 결과 출력
    printResults();

    // 4. 테스트 데이터 정리
    await cleanup();

    console.log('=== 벤치마크 완료 ===\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
