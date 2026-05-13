import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsRepo } from './broadcasts.repo';
import { QueueModule } from '../../infra/queue/queue.module';
import { BroadcastDeliveryService } from './broadcast-delivery.service';
import { BroadcastDeliveryWorker } from './broadcast-delivery.worker';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BuildingAccessModule,
    AccessControlModule,
    QueueModule,
  ],
  controllers: [BroadcastsController],
  providers: [
    BroadcastsService,
    BroadcastsRepo,
    BroadcastDeliveryService,
    BroadcastDeliveryWorker,
  ],
  exports: [BroadcastsService, BroadcastDeliveryService],
})
export class BroadcastsModule {}
