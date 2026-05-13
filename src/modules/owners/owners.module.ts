import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PartiesModule } from '../parties/parties.module';
import { OwnerAccessGrantsController } from './owner-access-grants.controller';
import { OwnerAccessGrantService } from './owner-access-grant.service';
import { OwnerPartyResolutionController } from './owner-party-resolution.controller';
import { OwnerProvisioningService } from './owner-provisioning.service';
import { OwnersController } from './owners.controller';
import { OwnersRepo } from './owners.repo';
import { OwnersService } from './owners.service';

@Module({
  imports: [
    PrismaModule,
    AccessControlModule,
    AuthModule,
    PartiesModule,
    NotificationsModule,
  ],
  controllers: [
    OwnersController,
    OwnerPartyResolutionController,
    OwnerAccessGrantsController,
  ],
  providers: [
    OwnersRepo,
    OwnersService,
    OwnerProvisioningService,
    OwnerAccessGrantService,
  ],
})
export class OwnersModule {}
