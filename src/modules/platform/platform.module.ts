import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { PlatformOrgsController } from './platform-orgs.controller';
import { PlatformOrgAdminsController } from './platform-org-admins.controller';
import { PlatformOrgsService } from './platform-orgs.service';
import { PlatformDeliveryTasksController } from './platform-delivery-tasks.controller';
import { PlatformDeliveryTasksService } from './platform-delivery-tasks.service';
import { QueueModule } from '../../infra/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    AccessControlModule,
    QueueModule,
    AuthModule,
    NotificationsModule,
    BroadcastsModule,
  ],
  controllers: [
    PlatformOrgsController,
    PlatformOrgAdminsController,
    PlatformDeliveryTasksController,
  ],
  providers: [
    PlatformOrgsService,
    PlatformDeliveryTasksService,
    PlatformAuthGuard,
  ],
})
export class PlatformModule {}
