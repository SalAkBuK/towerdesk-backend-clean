import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../../modules/access-control/access-control.module';
import { BuildingAccessService } from './building-access.service';
import { BuildingAccessGuard } from '../guards/building-access.guard';

@Module({
  imports: [PrismaModule, AccessControlModule],
  providers: [BuildingAccessService, BuildingAccessGuard],
  exports: [BuildingAccessService, BuildingAccessGuard],
})
export class BuildingAccessModule {}
