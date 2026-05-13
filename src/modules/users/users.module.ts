import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepo } from './users.repo';
import { OrgUsersProvisionController } from './org-users-provision.controller';
import { OrgUsersProvisionService } from './org-users-provision.service';
import { OrgUsersController } from './org-users.controller';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { OrgUserLifecycleService } from './org-user-lifecycle.service';

@Module({
  imports: [PrismaModule, StorageModule, AccessControlModule, AuthModule],
  controllers: [
    UsersController,
    OrgUsersProvisionController,
    OrgUsersController,
  ],
  providers: [
    UsersService,
    OrgUsersProvisionService,
    OrgUserLifecycleService,
    UsersRepo,
    JwtAuthGuard,
  ],
  exports: [UsersService, UsersRepo, OrgUserLifecycleService],
})
export class UsersModule {}
