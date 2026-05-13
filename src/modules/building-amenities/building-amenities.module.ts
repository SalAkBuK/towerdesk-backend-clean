import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { BuildingAmenitiesController } from './building-amenities.controller';
import { BuildingAmenitiesRepo } from './building-amenities.repo';
import { BuildingAmenitiesService } from './building-amenities.service';

@Module({
  imports: [PrismaModule, BuildingsModule, BuildingAccessModule],
  controllers: [BuildingAmenitiesController],
  providers: [BuildingAmenitiesRepo, BuildingAmenitiesService],
})
export class BuildingAmenitiesModule {}
