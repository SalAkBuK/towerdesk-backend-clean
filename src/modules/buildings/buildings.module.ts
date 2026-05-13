import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { BuildingsController } from './buildings.controller';
import { BuildingsRepo } from './buildings.repo';
import { BuildingsService } from './buildings.service';

@Module({
  imports: [PrismaModule, AccessControlModule, BuildingAccessModule],
  controllers: [BuildingsController],
  providers: [BuildingsRepo, BuildingsService],
  exports: [BuildingsRepo],
})
export class BuildingsModule {}
