import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateParkingSlotDto } from './dto/create-parking-slot.dto';
import { ListParkingSlotsQueryDto } from './dto/list-parking-slots.query.dto';
import {
  ParkingSlotResponseDto,
  toParkingSlotResponse,
} from './dto/parking-slot.response.dto';
import { UpdateParkingSlotDto } from './dto/update-parking-slot.dto';
import { ParkingService } from './parking.service';
import { AllocateParkingSlotsDto } from './dto/allocate-parking-slots.dto';
import {
  ParkingAllocationResponseDto,
  toParkingAllocationResponse,
} from './dto/parking-allocation.response.dto';
import { EndParkingAllocationDto } from './dto/end-parking-allocation.dto';
import { ListParkingAllocationsQueryDto } from './dto/list-parking-allocations.query.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import {
  VehicleResponseDto,
  toVehicleResponse,
} from './dto/vehicle.response.dto';
import { ImportParkingSlotsQueryDto } from './dto/import-parking-slots.query.dto';
import { ImportParkingSlotsResponseDto } from './dto/import-parking-slots.response.dto';

@ApiTags('parking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org')
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Post('buildings/:buildingId/parking-slots/import')
  @RequirePermissions('parkingSlots.create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ImportParkingSlotsResponseDto })
  async importSlotsCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @UploadedFile()
    file:
      | { buffer: Buffer; originalname?: string; mimetype?: string }
      | undefined,
    @Query() query: ImportParkingSlotsQueryDto,
  ) {
    return this.parkingService.importSlotsCsv(user, buildingId, file, query);
  }

  @Post('buildings/:buildingId/parking-slots')
  @RequirePermissions('parkingSlots.create')
  @ApiOkResponse({ type: ParkingSlotResponseDto })
  async createSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateParkingSlotDto,
  ) {
    const slot = await this.parkingService.createSlot(user, buildingId, dto);
    return toParkingSlotResponse(slot);
  }

  @Get('buildings/:buildingId/parking-slots')
  @RequirePermissions('parkingSlots.read')
  @ApiOkResponse({ type: [ParkingSlotResponseDto] })
  async listSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListParkingSlotsQueryDto,
  ) {
    const slots = await this.parkingService.listSlots(user, buildingId, query);
    return slots.map(toParkingSlotResponse);
  }

  @Patch('parking-slots/:slotId')
  @RequirePermissions('parkingSlots.update')
  @ApiOkResponse({ type: ParkingSlotResponseDto })
  async updateSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slotId') slotId: string,
    @Body() dto: UpdateParkingSlotDto,
  ) {
    const slot = await this.parkingService.updateSlot(user, slotId, dto);
    return toParkingSlotResponse(slot);
  }

  @Post('buildings/:buildingId/parking-allocations')
  @RequirePermissions('parkingAllocations.create')
  @ApiOkResponse({ type: [ParkingAllocationResponseDto] })
  async allocate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: AllocateParkingSlotsDto,
  ) {
    const allocations = await this.parkingService.allocate(
      user,
      buildingId,
      dto,
    );
    return allocations.map(toParkingAllocationResponse);
  }

  @Post('parking-allocations/:allocationId/end')
  @RequirePermissions('parkingAllocations.end')
  @ApiOkResponse({ type: ParkingAllocationResponseDto })
  async endAllocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('allocationId') allocationId: string,
    @Body() dto: EndParkingAllocationDto,
  ) {
    const allocation = await this.parkingService.endAllocation(
      user,
      allocationId,
      dto,
    );
    return toParkingAllocationResponse(allocation);
  }

  @Post('occupancies/:occupancyId/parking-allocations/end-all')
  @RequirePermissions('parkingAllocations.end')
  @ApiOkResponse({ schema: { example: { ended: 2 } } })
  async endAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('occupancyId') occupancyId: string,
    @Body() dto: EndParkingAllocationDto,
  ) {
    return this.parkingService.endAllForOccupancy(user, occupancyId, dto);
  }

  @Post('units/:unitId/parking-allocations/end-all')
  @RequirePermissions('parkingAllocations.end')
  @ApiOkResponse({ schema: { example: { ended: 2 } } })
  async endAllForUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('unitId') unitId: string,
    @Body() dto: EndParkingAllocationDto,
  ) {
    return this.parkingService.endAllForUnit(user, unitId, dto);
  }

  @Get('occupancies/:occupancyId/parking-allocations')
  @RequirePermissions('parkingAllocations.read')
  @ApiOkResponse({ type: [ParkingAllocationResponseDto] })
  async listAllocations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('occupancyId') occupancyId: string,
    @Query() query: ListParkingAllocationsQueryDto,
  ) {
    const allocations = await this.parkingService.listAllocations(
      user,
      occupancyId,
      query,
    );
    return allocations.map(toParkingAllocationResponse);
  }

  @Get('units/:unitId/parking-allocations')
  @RequirePermissions('parkingAllocations.read')
  @ApiOkResponse({ type: [ParkingAllocationResponseDto] })
  async listUnitAllocations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('unitId') unitId: string,
    @Query() query: ListParkingAllocationsQueryDto,
  ) {
    const allocations = await this.parkingService.listAllocationsForUnit(
      user,
      unitId,
      query,
    );
    return allocations.map(toParkingAllocationResponse);
  }

  @Post('occupancies/:occupancyId/vehicles')
  @RequirePermissions('vehicles.create')
  @ApiOkResponse({ type: VehicleResponseDto })
  async createVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('occupancyId') occupancyId: string,
    @Body() dto: CreateVehicleDto,
  ) {
    const vehicle = await this.parkingService.createVehicle(
      user,
      occupancyId,
      dto,
    );
    return toVehicleResponse(vehicle);
  }

  @Get('occupancies/:occupancyId/vehicles')
  @RequirePermissions('vehicles.read')
  @ApiOkResponse({ type: [VehicleResponseDto] })
  async listVehicles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('occupancyId') occupancyId: string,
  ) {
    const vehicles = await this.parkingService.listVehicles(user, occupancyId);
    return vehicles.map(toVehicleResponse);
  }

  @Patch('vehicles/:vehicleId')
  @RequirePermissions('vehicles.update')
  @ApiOkResponse({ type: VehicleResponseDto })
  async updateVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    const vehicle = await this.parkingService.updateVehicle(
      user,
      vehicleId,
      dto,
    );
    return toVehicleResponse(vehicle);
  }

  @Delete('vehicles/:vehicleId')
  @RequirePermissions('vehicles.delete')
  @ApiOkResponse()
  async deleteVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ) {
    await this.parkingService.deleteVehicle(user, vehicleId);
    return { success: true };
  }
}
