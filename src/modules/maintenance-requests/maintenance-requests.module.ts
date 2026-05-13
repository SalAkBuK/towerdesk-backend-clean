import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { ServiceProvidersModule } from '../service-providers/service-providers.module';
import { UnitsModule } from '../units/units.module';
import { MaintenanceRequestsRepo } from './maintenance-requests.repo';
import { MaintenanceRequestEstimateMonitorService } from './maintenance-request-estimate-monitor.service';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import { ResidentRequestsController } from './resident-requests.controller';
import { BuildingRequestsController } from './building-requests.controller';
import { ProviderRequestsController } from './provider-requests.controller';

@Module({
  imports: [
    PrismaModule,
    AccessControlModule,
    BuildingAccessModule,
    BuildingsModule,
    ServiceProvidersModule,
    UnitsModule,
  ],
  controllers: [
    ResidentRequestsController,
    BuildingRequestsController,
    ProviderRequestsController,
  ],
  providers: [
    MaintenanceRequestsRepo,
    MaintenanceRequestsService,
    MaintenanceRequestEstimateMonitorService,
  ],
})
export class MaintenanceRequestsModule {}
