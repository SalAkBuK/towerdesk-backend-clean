import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryTaskKind } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';
import { EmailService } from '../../infra/email/email.service';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import {
  DELIVERY_JOB_NAMES,
  DELIVERY_QUEUE_NAMES,
  DELIVERY_RETRY_CONFIG,
  DeliveryTaskRecord,
  PasswordEmailDeliveryPayload,
} from '../../infra/queue/delivery-task.types';
import { QueueService } from '../../infra/queue/queue.service';
import { AuthRepo } from './auth.repo';
import { PasswordEmailContext, PasswordResetEmailPurpose } from './auth.types';

@Injectable()
export class AuthPasswordDeliveryService {
  private readonly logger = new Logger(AuthPasswordDeliveryService.name);

  constructor(
    private readonly authRepo: AuthRepo,
    private readonly emailService: EmailService,
    private readonly deliveryTasksRepo: DeliveryTasksRepo,
    private readonly queueService: QueueService,
  ) {}

  async enqueuePasswordResetEmail(input: {
    email: string;
    token: string;
    tokenHash: string;
    expiresAt: Date;
    purpose: PasswordResetEmailPurpose;
    context?: PasswordEmailContext;
    issuedByUserId?: string | null;
    orgId?: string | null;
    userId?: string | null;
  }) {
    return this.createAndDispatchTask({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: DELIVERY_QUEUE_NAMES.AUTH_EMAIL,
      jobName: DELIVERY_JOB_NAMES.AUTH_PASSWORD_EMAIL,
      orgId: input.orgId ?? null,
      userId: input.userId ?? null,
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: input.tokenHash,
      maxAttempts: DELIVERY_RETRY_CONFIG.EMAIL.attempts,
      payload: {
        email: input.email,
        token: input.token,
        expiresAt: input.expiresAt.toISOString(),
        purpose: input.purpose,
        context: input.context,
        issuedByUserId: input.issuedByUserId ?? null,
        residentInviteTokenHash:
          input.purpose === 'RESIDENT_INVITE' ? input.tokenHash : null,
      },
    });
  }

  async retryTask(task: DeliveryTaskRecord) {
    if (!task.userId) {
      throw new ConflictException(
        'Cannot retry auth delivery task without a user reference',
      );
    }

    const user = await this.authRepo.findById(task.userId);
    if (!user) {
      throw new NotFoundException('User not found for auth delivery task');
    }
    if (!user.isActive) {
      throw new ConflictException(
        'Cannot retry auth delivery task for an inactive user',
      );
    }

    const payload = task.payload as PasswordEmailDeliveryPayload;
    const nextToken = this.generatePasswordResetToken();
    const nextTokenHash = this.hashPasswordResetToken(nextToken);
    const nextExpiresAt = new Date(
      Date.now() + env.AUTH_PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await this.authRepo.createPasswordResetToken(
      user.id,
      nextTokenHash,
      nextExpiresAt,
      payload.purpose,
    );
    if (payload.purpose === 'RESIDENT_INVITE' && task.orgId) {
      await this.authRepo.createResidentInvite({
        orgId: task.orgId,
        userId: user.id,
        createdByUserId: payload.issuedByUserId ?? null,
        email: user.email,
        tokenHash: nextTokenHash,
        expiresAt: nextExpiresAt,
      });
    }

    return this.createAndDispatchTask({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: task.queueName,
      jobName: task.jobName,
      orgId: task.orgId,
      userId: task.userId,
      referenceType: task.referenceType,
      referenceId: nextTokenHash,
      maxAttempts: task.maxAttempts,
      payload: {
        ...payload,
        email: user.email,
        token: nextToken,
        expiresAt: nextExpiresAt.toISOString(),
        residentInviteTokenHash:
          payload.purpose === 'RESIDENT_INVITE' ? nextTokenHash : null,
      },
    });
  }

  private async createAndDispatchTask(input: {
    kind: DeliveryTaskKind;
    queueName: string;
    jobName: string;
    orgId?: string | null;
    userId?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    maxAttempts?: number;
    payload: PasswordEmailDeliveryPayload;
  }) {
    const task = await this.deliveryTasksRepo.create(input);
    await this.dispatchTask(
      task.id,
      task.queueName,
      task.jobName,
      task.maxAttempts,
    );
    return task;
  }

  private async dispatchTask(
    taskId: string,
    queueName: string,
    jobName: string,
    maxAttempts: number,
  ) {
    const queueOptions = {
      jobId: taskId,
      attempts: maxAttempts,
      backoff: {
        type: 'exponential' as const,
        delay: DELIVERY_RETRY_CONFIG.EMAIL.backoffMs,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    };

    try {
      const queued = await this.queueService.enqueue(
        queueName,
        jobName,
        { taskId },
        queueOptions,
      );
      if (queued) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Queue enqueue failed for auth delivery task ${taskId}: ${message}`,
      );
    }

    await this.processTask(taskId, false);
  }

  async processTask(taskId: string, allowThrow = true) {
    const task = await this.deliveryTasksRepo.findById(taskId);
    if (!task || task.kind !== DeliveryTaskKind.AUTH_PASSWORD_EMAIL) {
      return;
    }
    if (task.status === 'SUCCEEDED' || task.status === 'RETRIED') {
      return;
    }

    const processing = await this.deliveryTasksRepo.markProcessing(taskId);
    if (
      !processing ||
      processing.status === 'SUCCEEDED' ||
      processing.status === 'RETRIED'
    ) {
      return;
    }

    const payload = processing.payload as PasswordEmailDeliveryPayload;

    try {
      await this.sendPasswordResetEmail(
        payload.email,
        payload.token,
        new Date(payload.expiresAt),
        payload.purpose,
        payload.context,
      );
      await this.deliveryTasksRepo.markSucceeded(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const exhausted = processing.attemptCount >= processing.maxAttempts;

      if (exhausted) {
        await this.deliveryTasksRepo.markFailed(taskId, message);
      } else {
        await this.deliveryTasksRepo.markRetryScheduled(taskId, message);
      }

      if (exhausted && payload.residentInviteTokenHash) {
        await this.authRepo.markResidentInviteFailed(
          payload.residentInviteTokenHash,
          message,
        );
      }

      this.logger.error(
        `Password email delivery failed for task=${taskId} purpose=${payload.purpose}: ${message}`,
      );

      if (allowThrow) {
        throw error;
      }
    }
  }

  private buildPasswordResetUrl(
    token: string,
    purpose: PasswordResetEmailPurpose = 'PASSWORD_RESET',
  ) {
    const template = env.AUTH_PASSWORD_RESET_URL_TEMPLATE?.trim();
    if (!template) {
      return null;
    }

    const mode =
      purpose === 'RESIDENT_INVITE' ||
      purpose === 'OWNER_INVITE' ||
      purpose === 'PROVIDER_INVITE'
        ? 'invite'
        : 'reset';
    const encodedToken = encodeURIComponent(token);
    if (template.includes('{{token}}')) {
      return this.appendUrlParams(
        template.replaceAll('{{token}}', encodedToken),
        mode ? { mode } : undefined,
      );
    }
    if (template.includes('{token}')) {
      return this.appendUrlParams(
        template.replaceAll('{token}', encodedToken),
        mode ? { mode } : undefined,
      );
    }

    const separator = template.includes('?') ? '&' : '?';
    return this.appendUrlParams(
      `${template}${separator}token=${encodedToken}`,
      mode ? { mode } : undefined,
    );
  }

  private async sendPasswordResetEmail(
    email: string,
    token: string,
    expiresAt: Date,
    purpose: PasswordResetEmailPurpose = 'PASSWORD_RESET',
    context?: PasswordEmailContext,
  ) {
    const resetUrl = this.buildPasswordResetUrl(token, purpose);
    const ttlMinutes = env.AUTH_PASSWORD_RESET_TTL_MINUTES;

    const isResidentInvite = purpose === 'RESIDENT_INVITE';
    const isOwnerInvite = purpose === 'OWNER_INVITE';
    const isProviderInvite = purpose === 'PROVIDER_INVITE';
    const isInvite = isResidentInvite || isOwnerInvite || isProviderInvite;
    const subject = isInvite
      ? "You're invited to Towerdesk - set your password"
      : 'Reset your Towerdesk password';
    const instructions = resetUrl
      ? isInvite
        ? `Set your password using this link: ${resetUrl}`
        : `Reset your password using this link: ${resetUrl}`
      : isInvite
        ? `Use this token to set your password: ${token}`
        : `Use this token to reset your password: ${token}`;
    const inviteGreeting = context?.inviteeName
      ? `Hello ${context.inviteeName},`
      : 'Hello,';
    const inviterLine = context?.inviterName
      ? isOwnerInvite
        ? `${context.inviterName} granted you access to the Towerdesk owner portal.`
        : isProviderInvite
          ? `${context.inviterName} invited you to join the Towerdesk provider portal.`
          : `${context.inviterName} invited you to join Towerdesk.`
      : isOwnerInvite
        ? 'Your property management team granted you access to the Towerdesk owner portal.'
        : isProviderInvite
          ? 'Your property management team invited you to join the Towerdesk provider portal.'
          : 'Your property management team invited you to join Towerdesk.';
    const appLinks = this.getOnboardingAppLinks();
    const appDownloadText = this.buildOnboardingAppText(appLinks);
    const appDownloadHtml = this.buildOnboardingAppHtml(appLinks);
    const expirationLine = `This request expires at ${expiresAt.toISOString()} UTC (${ttlMinutes} minutes).`;

    const text = isResidentInvite
      ? [
          inviteGreeting,
          inviterLine,
          'Complete onboarding with these steps:',
          `1) ${instructions}`,
          `2) ${appDownloadText}`,
          '3) Sign in and submit your move-in request in the app.',
          expirationLine,
          'If you were not expecting this invite, contact your property management team.',
        ].join('\n\n')
      : isOwnerInvite
        ? [
            inviteGreeting,
            inviterLine,
            'Complete onboarding with these steps:',
            `1) ${instructions}`,
            '2) Sign in to Towerdesk and open your owner portfolio.',
            expirationLine,
            'If you were not expecting this invite, contact your property management team.',
          ].join('\n\n')
        : isProviderInvite
          ? [
              inviteGreeting,
              inviterLine,
              'Complete onboarding with these steps:',
              `1) ${instructions}`,
              '2) Sign in to Towerdesk and open the provider portal.',
              expirationLine,
              'If you were not expecting this invite, contact your property management team.',
            ].join('\n\n')
          : [
              'We received a request to reset your Towerdesk account password.',
              instructions,
              expirationLine,
              'If you did not request this, you can ignore this email.',
            ].join('\n\n');

    const html = isResidentInvite
      ? [
          `<p>${inviteGreeting}</p>`,
          `<p>${inviterLine}</p>`,
          '<p>Complete onboarding with these steps:</p>',
          '<ol>',
          resetUrl
            ? `<li><a href="${resetUrl}">Set your password</a></li>`
            : `<li>Use this token to set your password: <strong>${token}</strong></li>`,
          `<li>${appDownloadHtml}</li>`,
          '<li>Sign in and submit your move-in request in the app.</li>',
          '</ol>',
          `<p>${expirationLine}</p>`,
          '<p>If you were not expecting this invite, contact your property management team.</p>',
        ].join('')
      : isOwnerInvite
        ? [
            `<p>${inviteGreeting}</p>`,
            `<p>${inviterLine}</p>`,
            '<p>Complete onboarding with these steps:</p>',
            '<ol>',
            resetUrl
              ? `<li><a href="${resetUrl}">Set your password</a></li>`
              : `<li>Use this token to set your password: <strong>${token}</strong></li>`,
            '<li>Sign in to Towerdesk and open your owner portfolio.</li>',
            '</ol>',
            `<p>${expirationLine}</p>`,
            '<p>If you were not expecting this invite, contact your property management team.</p>',
          ].join('')
        : isProviderInvite
          ? [
              `<p>${inviteGreeting}</p>`,
              `<p>${inviterLine}</p>`,
              '<p>Complete onboarding with these steps:</p>',
              '<ol>',
              resetUrl
                ? `<li><a href="${resetUrl}">Set your password</a></li>`
                : `<li>Use this token to set your password: <strong>${token}</strong></li>`,
              '<li>Sign in to Towerdesk and open the provider portal.</li>',
              '</ol>',
              `<p>${expirationLine}</p>`,
              '<p>If you were not expecting this invite, contact your property management team.</p>',
            ].join('')
          : [
              '<p>We received a request to reset your Towerdesk account password.</p>',
              resetUrl
                ? `<p><a href="${resetUrl}">Reset your password</a></p>`
                : `<p>Use this token to reset your password: <strong>${token}</strong></p>`,
              `<p>${expirationLine}</p>`,
              '<p>If you did not request this, you can ignore this email.</p>',
            ].join('');

    await this.emailService.send({
      to: email,
      subject,
      text,
      html,
    });
  }

  private appendUrlParams(url: string, params?: Record<string, string>) {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }
    const hasQuery = url.includes('?');
    const qp = new URLSearchParams(params).toString();
    return `${url}${hasQuery ? '&' : '?'}${qp}`;
  }

  private getOnboardingAppLinks() {
    const iosUrl = env.MOBILE_APP_IOS_URL?.trim() || null;
    const androidUrl = env.MOBILE_APP_ANDROID_URL?.trim() || null;
    const deepLinkUrl = env.MOBILE_APP_DEEP_LINK_URL?.trim() || null;
    return { iosUrl, androidUrl, deepLinkUrl };
  }

  private buildOnboardingAppText(links: {
    iosUrl: string | null;
    androidUrl: string | null;
    deepLinkUrl: string | null;
  }) {
    const parts: string[] = [];
    if (links.deepLinkUrl) {
      parts.push(`Open app: ${links.deepLinkUrl}`);
    }
    if (links.iosUrl) {
      parts.push(`iOS App Store: ${links.iosUrl}`);
    }
    if (links.androidUrl) {
      parts.push(`Google Play: ${links.androidUrl}`);
    }
    if (parts.length === 0) {
      return 'Download the Towerdesk app from the App Store or Google Play.';
    }
    return `Download/open Towerdesk app (${parts.join(' | ')})`;
  }

  private buildOnboardingAppHtml(links: {
    iosUrl: string | null;
    androidUrl: string | null;
    deepLinkUrl: string | null;
  }) {
    const items: string[] = [];
    if (links.deepLinkUrl) {
      items.push(`<a href="${links.deepLinkUrl}">Open app</a>`);
    }
    if (links.iosUrl) {
      items.push(`<a href="${links.iosUrl}">iOS App Store</a>`);
    }
    if (links.androidUrl) {
      items.push(`<a href="${links.androidUrl}">Google Play</a>`);
    }
    if (items.length === 0) {
      return 'Download the Towerdesk app from the App Store or Google Play.';
    }
    return `Download/open Towerdesk app (${items.join(' | ')})`;
  }

  private generatePasswordResetToken() {
    return randomBytes(32).toString('hex');
  }

  private hashPasswordResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
