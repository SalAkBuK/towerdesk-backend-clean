import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { OwnerPortfolioModule } from '../owner-portfolio/owner-portfolio.module';
import { NotificationsController } from './notifications.controller';
import { DevNotificationsController } from './dev-notifications.controller';
import { OwnerNotificationsController } from './owner-notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepo } from './notifications.repo';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationsListener } from './notifications.listener';
import { NotificationRecipientResolver } from './notification-recipient.resolver';
import { PushDevicesRepo } from './push-devices.repo';
import { PushDeliveryReceiptsRepo } from './push-delivery-receipts.repo';
import { PushNotificationsService } from './push-notifications.service';
import { QueueModule } from '../../infra/queue/queue.module';
import { PushDeliveryWorker } from './push-delivery.worker';
import { PushReceiptMonitorService } from './push-receipt-monitor.service';

@Module({
  imports: [PrismaModule, AuthModule, OwnerPortfolioModule, QueueModule],
  controllers: [
    NotificationsController,
    OwnerNotificationsController,
    DevNotificationsController,
  ],
  providers: [
    NotificationsService,
    NotificationsRepo,
    NotificationsGateway,
    NotificationsRealtimeService,
    NotificationsListener,
    NotificationRecipientResolver,
    PushDevicesRepo,
    PushDeliveryReceiptsRepo,
    PushNotificationsService,
    PushDeliveryWorker,
    PushReceiptMonitorService,
  ],
  exports: [
    NotificationsService,
    NotificationsRealtimeService,
    PushNotificationsService,
    NotificationsRepo,
    PushDeliveryReceiptsRepo,
  ],
})
export class NotificationsModule {}
