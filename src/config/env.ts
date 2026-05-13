import { config } from 'dotenv';
import { resolve } from 'path';
import { envSchema } from './env.schema';

config({ path: resolve(process.cwd(), '.env') });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment variables',
    parsed.error.flatten().fieldErrors,
  );
  throw new Error('Invalid environment variables');
}

export const env = {
  ...parsed.data,
  APP_RUNTIME:
    parsed.data.APP_RUNTIME ??
    (process.argv[1]?.toLowerCase().includes('worker') ? 'worker' : 'api'),
  QUEUE_ENABLED: parsed.data.QUEUE_ENABLED === 'true',
  EMAIL_PROVIDER: parsed.data.EMAIL_PROVIDER ?? 'noop',
  EMAIL_SMTP_SECURE: parsed.data.EMAIL_SMTP_SECURE === 'true',
  AUTH_PASSWORD_RESET_TTL_MINUTES:
    parsed.data.AUTH_PASSWORD_RESET_TTL_MINUTES ?? 30,
  AUTH_PUBLIC_REGISTER_ENABLED:
    parsed.data.AUTH_PUBLIC_REGISTER_ENABLED !== undefined
      ? parsed.data.AUTH_PUBLIC_REGISTER_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'production',
  OWNER_IDENTIFIER_ENCRYPTION_KEY:
    parsed.data.OWNER_IDENTIFIER_ENCRYPTION_KEY ??
    `${parsed.data.JWT_ACCESS_SECRET}:${parsed.data.JWT_REFRESH_SECRET}:owner-encryption`,
  OWNER_IDENTIFIER_HMAC_KEY:
    parsed.data.OWNER_IDENTIFIER_HMAC_KEY ??
    `${parsed.data.JWT_ACCESS_SECRET}:owner-hmac`,
  OWNER_RESOLUTION_TOKEN_SECRET:
    parsed.data.OWNER_RESOLUTION_TOKEN_SECRET ?? parsed.data.JWT_ACCESS_SECRET,
  OWNER_RESOLUTION_TOKEN_TTL_SECONDS:
    parsed.data.OWNER_RESOLUTION_TOKEN_TTL_SECONDS ?? 600,
  REQUEST_METRICS_ENABLED:
    parsed.data.REQUEST_METRICS_ENABLED !== undefined
      ? parsed.data.REQUEST_METRICS_ENABLED === 'true'
      : false,
  MAINTENANCE_ESTIMATE_REMINDER_ENABLED:
    parsed.data.MAINTENANCE_ESTIMATE_REMINDER_ENABLED !== undefined
      ? parsed.data.MAINTENANCE_ESTIMATE_REMINDER_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'test',
  MAINTENANCE_ESTIMATE_REMINDER_INTERVAL_MS:
    parsed.data.MAINTENANCE_ESTIMATE_REMINDER_INTERVAL_MS ?? 15 * 60 * 1000,
  MAINTENANCE_ESTIMATE_DEFAULT_TTL_HOURS:
    parsed.data.MAINTENANCE_ESTIMATE_DEFAULT_TTL_HOURS ?? 24,
  PRISMA_APPLY_SESSION_TIMEOUTS:
    parsed.data.PRISMA_APPLY_SESSION_TIMEOUTS === 'true',
  HTTP_REQUEST_LOGGING_ENABLED:
    parsed.data.HTTP_REQUEST_LOGGING_ENABLED !== undefined
      ? parsed.data.HTTP_REQUEST_LOGGING_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'production',
  HTTP_SLOW_REQUEST_THRESHOLD_MS:
    parsed.data.HTTP_SLOW_REQUEST_THRESHOLD_MS ?? 1000,
  WS_LOG_CONNECTIONS:
    parsed.data.WS_LOG_CONNECTIONS !== undefined
      ? parsed.data.WS_LOG_CONNECTIONS === 'true'
      : parsed.data.NODE_ENV !== 'production',
  SWAGGER_ENABLED:
    parsed.data.SWAGGER_ENABLED !== undefined
      ? parsed.data.SWAGGER_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'production',
  PUSH_PROVIDER: parsed.data.PUSH_PROVIDER ?? 'noop',
  PUSH_LOG_DELIVERIES:
    parsed.data.PUSH_LOG_DELIVERIES !== undefined
      ? parsed.data.PUSH_LOG_DELIVERIES === 'true'
      : parsed.data.NODE_ENV !== 'production',
  PUSH_RECEIPTS_ENABLED:
    parsed.data.PUSH_RECEIPTS_ENABLED !== undefined
      ? parsed.data.PUSH_RECEIPTS_ENABLED === 'true'
      : parsed.data.PUSH_PROVIDER === 'expo',
  PUSH_RECEIPT_POLL_INTERVAL_MS:
    parsed.data.PUSH_RECEIPT_POLL_INTERVAL_MS ?? 5 * 60 * 1000,
  PUSH_RECEIPT_LOOKUP_DELAY_MS:
    parsed.data.PUSH_RECEIPT_LOOKUP_DELAY_MS ?? 15 * 60 * 1000,
  DELIVERY_TASK_RETENTION_ENABLED:
    parsed.data.DELIVERY_TASK_RETENTION_ENABLED !== undefined
      ? parsed.data.DELIVERY_TASK_RETENTION_ENABLED === 'true'
      : parsed.data.NODE_ENV === 'production',
  DELIVERY_TASK_RETENTION_INTERVAL_MS:
    parsed.data.DELIVERY_TASK_RETENTION_INTERVAL_MS ?? 60 * 60 * 1000,
  DELIVERY_TASK_RETENTION_DAYS: parsed.data.DELIVERY_TASK_RETENTION_DAYS ?? 30,
};

export type Env = typeof env;
