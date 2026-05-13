import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { UnitsModule } from '../units/units.module';
import { ParkingController } from './parking.controller';
import { ParkingRepo } from './parking.repo';
import { ParkingService } from './parking.service';
import { ResidentParkingController } from './resident-parking.controller';

@Module({
  imports: [PrismaModule, AccessControlModule, BuildingsModule, UnitsModule],
  controllers: [ParkingController, ResidentParkingController],
  providers: [ParkingRepo, ParkingService],
})
export class ParkingModule {}
