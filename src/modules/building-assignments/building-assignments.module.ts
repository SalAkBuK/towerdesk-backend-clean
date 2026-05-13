import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { BuildingAccessModule } from '../../common/building-access/building-access.module';
import { BuildingAssignmentsController } from './building-assignments.controller';
import { BuildingAssignmentsService } from './building-assignments.service';

@Module({
  imports: [AccessControlModule, BuildingAccessModule],
  controllers: [BuildingAssignmentsController],
  providers: [BuildingAssignmentsService],
})
export class BuildingAssignmentsModule {}
