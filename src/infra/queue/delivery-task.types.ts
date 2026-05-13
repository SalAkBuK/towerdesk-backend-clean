import { DeliveryTaskKind, DeliveryTaskStatus, Prisma } from '@prisma/client';
import type {
  PasswordEmailContext,
  PasswordResetEmailPurpose,
} from '../../modules/auth/auth.types';

export const DELIVERY_QUEUE_NAMES = {
  AUTH_EMAIL: 'auth-deliveries',
  PUSH: 'push-deliveries',
  BROADCAST: 'broadcast-deliveries',
} as const;

export const DELIVERY_JOB_NAMES = {
  AUTH_PASSWORD_EMAIL: 'auth.password-email',
  PUSH_NOTIFICATION: 'notifications.push',
  BROADCAST_FANOUT: 'broadcasts.fanout',
} as const;

export const DELIVERY_RETRY_CONFIG = {
  EMAIL: { attempts: 5, backoffMs: 15_000 },
  PUSH: { attempts: 5, backoffMs: 10_000 },
  BROADCAST: { attempts: 5, backoffMs: 10_000 },
} as const;

export type PasswordEmailDeliveryPayload = {
  email: string;
  token: string;
  expiresAt: string;
  purpose: PasswordResetEmailPurpose;
  context?: PasswordEmailContext;
  issuedByUserId?: string | null;
  residentInviteTokenHash?: string | null;
};

export type PushNotificationDeliveryPayload = {
  orgId: string;
  userIds: string[];
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

export type BroadcastFanoutDeliveryPayload = {
  broadcastId: string;
  orgId: string;
  userIds: string[];
  title: string;
  body?: string | null;
  senderUserId: string;
  buildingIds: string[];
  metadata: Record<string, unknown>;
};

export type DeliveryTaskPayloadByKind = {
  [DeliveryTaskKind.AUTH_PASSWORD_EMAIL]: PasswordEmailDeliveryPayload;
  [DeliveryTaskKind.PUSH_NOTIFICATION]: PushNotificationDeliveryPayload;
  [DeliveryTaskKind.BROADCAST_FANOUT]: BroadcastFanoutDeliveryPayload;
};

export type DeliveryTaskPayload =
  DeliveryTaskPayloadByKind[keyof DeliveryTaskPayloadByKind];

export type DeliveryTaskRecord<
  TKind extends DeliveryTaskKind = DeliveryTaskKind,
> = {
  id: string;
  kind: TKind;
  status: DeliveryTaskStatus;
  queueName: string;
  jobName: string;
  orgId: string | null;
  userId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  payload: DeliveryTaskPayloadByKind[TKind];
  attemptCount: number;
  maxAttempts: number;
  queuedAt: Date;
  lastAttemptAt: Date | null;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  retriedAt: Date | null;
  replacedByTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeliveryTaskCreateInput<TKind extends DeliveryTaskKind> = {
  kind: TKind;
  queueName: string;
  jobName: string;
  orgId?: string | null;
  userId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  payload: DeliveryTaskPayloadByKind[TKind];
  maxAttempts?: number;
};

export const toJsonValue = (value: Record<string, unknown>) =>
  value as Prisma.InputJsonValue;
