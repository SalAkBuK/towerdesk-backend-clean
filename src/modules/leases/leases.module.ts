import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { UnitsModule } from '../units/units.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeasesController } from './leases.controller';
import { LeasesRepo } from './leases.repo';
import { LeasesService } from './leases.service';
import { LeaseDocumentsController } from './lease-documents.controller';
import { LeaseDocumentsRepo } from './lease-documents.repo';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeaseAccessCardsController } from './lease-access-cards.controller';
import { LeaseAccessCardsRepo } from './lease-access-cards.repo';
import { LeaseAccessCardsService } from './lease-access-cards.service';
import { LeaseParkingStickersController } from './lease-parking-stickers.controller';
import { LeaseParkingStickersRepo } from './lease-parking-stickers.repo';
import { LeaseParkingStickersService } from './lease-parking-stickers.service';
import { LeaseOccupantsController } from './lease-occupants.controller';
import { LeaseOccupantsService } from './lease-occupants.service';
import { LeaseOccupantsRepo } from './lease-occupants.repo';
import { LeaseLifecycleController } from './lease-lifecycle.controller';
import { LeaseLifecycleService } from './lease-lifecycle.service';
import { ResidentProfilesRepo } from '../residents/resident-profiles.repo';
import { ParkingRepo } from '../parking/parking.repo';
import { LeaseHistoryRepo } from './lease-history.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { ResidentLeaseController } from './resident-lease.controller';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ResidentContractController } from './resident-contract.controller';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    BuildingsModule,
    UnitsModule,
    BuildingAccessModule,
    AccessControlModule,
    NotificationsModule,
  ],
  controllers: [
    LeasesController,
    LeaseDocumentsController,
    LeaseAccessCardsController,
    LeaseParkingStickersController,
    LeaseOccupantsController,
    LeaseLifecycleController,
    ResidentLeaseController,
    ContractsController,
    ResidentContractController,
  ],
  providers: [
    LeasesRepo,
    LeasesService,
    LeaseDocumentsRepo,
    LeaseDocumentsService,
    LeaseAccessCardsRepo,
    LeaseAccessCardsService,
    LeaseParkingStickersRepo,
    LeaseParkingStickersService,
    LeaseOccupantsRepo,
    LeaseOccupantsService,
    LeaseHistoryRepo,
    LeaseActivityRepo,
    LeaseLifecycleService,
    ContractsService,
    ResidentProfilesRepo,
    ParkingRepo,
  ],
})
export class LeasesModule {}
