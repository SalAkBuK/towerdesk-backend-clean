import { z } from 'zod';

export const envSchema = z.object({
  APP_RUNTIME: z.enum(['api', 'worker']).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.coerce.number().int().positive(),
  JWT_REFRESH_TTL: z.coerce.number().int().positive(),
  PGOPTIONS: z.string().optional(),
  PRISMA_APPLY_SESSION_TIMEOUTS: z.string().optional(),
  HTTP_BODY_LIMIT: z.string().optional(),
  HTTP_REQUEST_LOGGING_ENABLED: z.string().optional(),
  HTTP_SLOW_REQUEST_THRESHOLD_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional(),
  THROTTLE_TTL: z.coerce.number().int().positive().optional(),
  THROTTLE_LIMIT: z.coerce.number().int().positive().optional(),
  THROTTLE_AUTH_TTL: z.coerce.number().int().positive().optional(),
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().optional(),
  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().optional(),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().optional(),
  REQUEST_METRICS_ENABLED: z.string().optional(),
  REQUEST_METRICS_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  REQUEST_METRICS_SAMPLE_SIZE: z.coerce.number().int().positive().optional(),
  MAINTENANCE_ESTIMATE_REMINDER_ENABLED: z.string().optional(),
  MAINTENANCE_ESTIMATE_REMINDER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  MAINTENANCE_ESTIMATE_DEFAULT_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  HTTP_SERVER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  HTTP_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  HTTP_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  SWAGGER_ENABLED: z.string().optional(),
  WS_CORS_ORIGINS: z.string().optional(),
  WS_LOG_CONNECTIONS: z.string().optional(),
  PUSH_PROVIDER: z.enum(['noop', 'expo']).optional(),
  PUSH_EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_LOG_DELIVERIES: z.string().optional(),
  PUSH_RECEIPTS_ENABLED: z.string().optional(),
  PUSH_RECEIPT_POLL_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  PUSH_RECEIPT_LOOKUP_DELAY_MS: z.coerce.number().int().positive().optional(),
  EMAIL_PROVIDER: z.enum(['noop', 'smtp']).optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_SMTP_SECURE: z.string().optional(),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  AUTH_PASSWORD_RESET_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  RESIDENT_INVITE_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  AUTH_PASSWORD_RESET_URL_TEMPLATE: z.string().optional(),
  MOBILE_APP_IOS_URL: z.string().optional(),
  MOBILE_APP_ANDROID_URL: z.string().optional(),
  MOBILE_APP_DEEP_LINK_URL: z.string().optional(),
  OWNER_IDENTIFIER_ENCRYPTION_KEY: z.string().optional(),
  OWNER_IDENTIFIER_HMAC_KEY: z.string().optional(),
  OWNER_RESOLUTION_TOKEN_SECRET: z.string().optional(),
  OWNER_RESOLUTION_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  AUTH_PUBLIC_REGISTER_ENABLED: z.string().optional(),
  QUEUE_ENABLED: z.string().optional(),
  QUEUE_HOST: z.string().optional(),
  QUEUE_PORT: z.coerce.number().int().optional(),
  QUEUE_PASSWORD: z.string().optional(),
  DELIVERY_TASK_RETENTION_ENABLED: z.string().optional(),
  DELIVERY_TASK_RETENTION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  DELIVERY_TASK_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  PLATFORM_API_KEY: z.string().optional(),
  PLATFORM_SUPERADMIN_EMAIL: z.string().optional(),
  PLATFORM_SUPERADMIN_PASSWORD: z.string().optional(),
});
