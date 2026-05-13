import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { OwnerPortfolioModule } from '../owner-portfolio/owner-portfolio.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingRepo } from './messaging.repo';
import { ResidentMessagingController } from './resident-messaging.controller';
import { OwnerMessagingController } from './owner-messaging.controller';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BuildingAccessModule,
    AccessControlModule,
    OwnerPortfolioModule,
  ],
  controllers: [
    MessagingController,
    ResidentMessagingController,
    OwnerMessagingController,
  ],
  providers: [MessagingService, MessagingRepo],
  exports: [MessagingService],
})
export class MessagingModule {}
