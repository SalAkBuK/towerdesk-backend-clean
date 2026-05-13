import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { UnitTypesController } from './unit-types.controller';
import { UnitTypesRepo } from './unit-types.repo';
import { UnitTypesService } from './unit-types.service';

@Module({
  imports: [PrismaModule, AccessControlModule],
  controllers: [UnitTypesController],
  providers: [UnitTypesRepo, UnitTypesService],
})
export class UnitTypesModule {}
