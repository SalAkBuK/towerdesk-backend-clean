import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { UnitOwnershipService } from './unit-ownership.service';

@Module({
  imports: [PrismaModule],
  providers: [UnitOwnershipService],
  exports: [UnitOwnershipService],
})
export class UnitOwnershipsModule {}
