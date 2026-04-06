import { z } from 'zod/v4';

/** boolean 환경변수 헬퍼: 문자열 'true'/'false' → boolean */
const booleanEnv = (defaultValue: string = 'false') =>
  z.string().default(defaultValue).transform(v => v === 'true');

/** comma-separated 환경변수 헬퍼: "a,b,c" → ["a","b","c"] */
const csvEnv = () =>
  z.string().default('').transform(s => s.split(',').filter(Boolean));

/**
 * 환경변수 검증 스키마 (Zod v4)
 * 앱 시작 시 환경변수의 타입 안전성을 보장
 */
export const envSchema = z.object({
  // 기상청 API
  WEATHER_API_KEY: z.string().min(1, 'WEATHER_API_KEY 환경변수가 설정되지 않았습니다'),

  // Slack
  SLACK_WEBHOOK_URL: z.url('SLACK_WEBHOOK_URL은 유효한 URL이어야 합니다'),
  SLACK_BATCH_MODE: booleanEnv('true'),

  // 모니터링 설정
  TARGET_REGION_IDS: csvEnv(),
  WARNING_TYPES: csvEnv(),
  SUBCD: z.string().optional(),
  CHECK_INTERVAL_MINUTES: z.coerce.number().positive('CHECK_INTERVAL_MINUTES는 양수여야 합니다').default(30),

  // 환경
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ENVIRONMENT: z.string().default('development'),
  DEBUG: booleanEnv('false'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_ENABLED: booleanEnv('false'),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // HTTP 서버
  PORT: z.coerce.number().default(3000),
  SERVER_ENABLED: booleanEnv('true'),
  CORS_ORIGIN: z.string().optional(),

  // 웹 대시보드
  WEB_DASHBOARD_URL: z.string().default('https://weather.starryjeju.net'),

  // 데이터베이스
  DATABASE_URL: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * 환경변수를 파싱하고 검증
 * 실패 시 상세 에러 메시지와 함께 예외 발생
 */
export function parseEnv(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`환경변수 검증 실패:\n${errors}`);
  }

  return result.data;
}
