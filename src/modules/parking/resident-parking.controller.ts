import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import {
  ParkingAllocationResponseDto,
  toParkingAllocationResponse,
} from './dto/parking-allocation.response.dto';
import { ParkingService } from './parking.service';

@ApiTags('resident-parking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('resident/parking')
export class ResidentParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Get('active-allocation')
  @ApiOkResponse({ type: ParkingAllocationResponseDto })
  async getActiveAllocation(@CurrentUser() user: AuthenticatedUser) {
    const allocation =
      await this.parkingService.getActiveAllocationForResident(user);
    return allocation ? toParkingAllocationResponse(allocation) : null;
  }
}
