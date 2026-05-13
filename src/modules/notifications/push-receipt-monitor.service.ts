import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { env } from '../../config/env';
import { PushDevicesRepo } from './push-devices.repo';
import { PushDeliveryReceiptsRepo } from './push-delivery-receipts.repo';

type ExpoPushReceipt = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string } & Record<string, unknown>;
};

@Injectable()
export class PushReceiptMonitorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PushReceiptMonitorService.name);
  private readonly enabled =
    env.APP_RUNTIME === 'worker' &&
    env.PUSH_PROVIDER === 'expo' &&
    env.PUSH_RECEIPTS_ENABLED;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly pushDeliveryReceiptsRepo: PushDeliveryReceiptsRepo,
    private readonly pushDevicesRepo: PushDevicesRepo,
  ) {}

  onModuleInit() {
    if (!this.enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pollPendingReceipts().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.error(`Failed to poll Expo push receipts: ${message}`);
      });
    }, env.PUSH_RECEIPT_POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async pollPendingReceipts(now = new Date()) {
    const pending = await this.pushDeliveryReceiptsRepo.listPendingExpoReceipts(
      now,
      env.PUSH_RECEIPT_LOOKUP_DELAY_MS,
    );
    if (pending.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const chunk of this.chunk(
      pending.filter(
        (receipt): receipt is typeof receipt & { providerTicketId: string } =>
          Boolean(receipt.providerTicketId),
      ),
      1000,
    )) {
      const ids = chunk.map((receipt) => receipt.providerTicketId);
      const response = await fetch(
        'https://exp.host/--/api/v2/push/getReceipts',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(env.PUSH_EXPO_ACCESS_TOKEN
              ? { Authorization: `Bearer ${env.PUSH_EXPO_ACCESS_TOKEN}` }
              : {}),
          },
          body: JSON.stringify({ ids }),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Expo push receipt lookup failed with status=${response.status}`,
        );
        continue;
      }

      const payload = (await response.json()) as {
        data?: Record<string, ExpoPushReceipt>;
      };
      await this.pushDeliveryReceiptsRepo.markLookupAttempted(ids, now);

      const invalidDeviceIds: string[] = [];
      for (const [providerTicketId, receipt] of Object.entries(
        payload.data ?? {},
      )) {
        if (receipt.status === 'ok') {
          await this.pushDeliveryReceiptsRepo.markDelivered(providerTicketId, {
            providerReceiptId: providerTicketId,
            details: receipt.details ?? null,
            checkedAt: now,
          });
          processed += 1;
          continue;
        }

        const updated = await this.pushDeliveryReceiptsRepo.markErrored(
          providerTicketId,
          {
            providerReceiptId: providerTicketId,
            errorCode: receipt.details?.error ?? null,
            errorMessage: receipt.message ?? null,
            details: receipt.details ?? null,
            checkedAt: now,
          },
        );
        if (
          receipt.details?.error === 'DeviceNotRegistered' &&
          updated.pushDeviceId
        ) {
          invalidDeviceIds.push(updated.pushDeviceId);
        }
        processed += 1;
      }

      await this.pushDevicesRepo.deactivateByIds(invalidDeviceIds);
    }

    return processed;
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
