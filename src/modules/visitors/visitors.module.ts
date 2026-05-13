import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { UnitsModule } from '../units/units.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { ResidentVisitorsController } from './resident-visitors.controller';
import { VisitorsController } from './visitors.controller';
import { VisitorsRepo } from './visitors.repo';
import { VisitorsService } from './visitors.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BuildingsModule,
    UnitsModule,
    BuildingAccessModule,
  ],
  controllers: [VisitorsController, ResidentVisitorsController],
  providers: [VisitorsRepo, VisitorsService],
})
export class VisitorsModule {}
