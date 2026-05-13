import { Global, Module } from '@nestjs/common';
import { BuildingScopeResolverService } from '../../common/building-access/building-scope-resolver.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AccessControlRepo } from './access-control.repo';
import { AccessControlService } from './access-control.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { RolesLegacyController } from './roles-legacy.controller';
import { RolesService } from './roles.service';
import { UserAccessController } from './user-access.controller';
import { UserAccessService } from './user-access.service';
import { UserAccessProjectionService } from './user-access-projection.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [
    PermissionsController,
    RolesController,
    RolesLegacyController,
    UserAccessController,
  ],
  providers: [
    AccessControlRepo,
    AccessControlService,
    PermissionsService,
    RolesService,
    UserAccessService,
    UserAccessProjectionService,
    BuildingScopeResolverService,
    PermissionsGuard,
  ],
  exports: [
    AccessControlRepo,
    AccessControlService,
    UserAccessProjectionService,
    BuildingScopeResolverService,
    PermissionsGuard,
  ],
})
export class AccessControlModule {}
