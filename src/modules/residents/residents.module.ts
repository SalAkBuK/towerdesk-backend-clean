import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { UnitsModule } from '../units/units.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { ResidentsController } from './residents.controller';
import { ResidentsService } from './residents.service';
import { ResidentProfileController } from './resident-profile.controller';
import { ResidentProfilesController } from './resident-profiles.controller';
import { ResidentProfilesService } from './resident-profiles.service';
import { ResidentProfilesRepo } from './resident-profiles.repo';
import { OrgResidentsController } from './org-residents.controller';
import { ResidentDirectoryController } from './resident-directory.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    BuildingsModule,
    UnitsModule,
    BuildingAccessModule,
    AccessControlModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [
    ResidentsController,
    ResidentProfileController,
    ResidentProfilesController,
    OrgResidentsController,
    ResidentDirectoryController,
  ],
  providers: [ResidentsService, ResidentProfilesService, ResidentProfilesRepo],
})
export class ResidentsModule {}
