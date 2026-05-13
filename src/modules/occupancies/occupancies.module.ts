import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { UnitsModule } from '../units/units.module';
import { UsersModule } from '../users/users.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { OccupanciesController } from './occupancies.controller';
import { OccupanciesRepo } from './occupancies.repo';
import { OccupanciesService } from './occupancies.service';

@Module({
  imports: [
    PrismaModule,
    BuildingsModule,
    UnitsModule,
    UsersModule,
    BuildingAccessModule,
  ],
  controllers: [OccupanciesController],
  providers: [OccupanciesRepo, OccupanciesService],
})
export class OccupanciesModule {}
