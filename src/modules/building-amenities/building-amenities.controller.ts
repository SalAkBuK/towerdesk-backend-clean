import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateBuildingAmenityDto } from './dto/create-building-amenity.dto';
import { UpdateBuildingAmenityDto } from './dto/update-building-amenity.dto';
import {
  BuildingAmenityResponseDto,
  toBuildingAmenityResponse,
} from './dto/building-amenity.response.dto';
import { BuildingAmenitiesService } from './building-amenities.service';

@ApiTags('building-amenities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/amenities')
export class BuildingAmenitiesController {
  constructor(
    private readonly buildingAmenitiesService: BuildingAmenitiesService,
  ) {}

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('buildings.read')
  @ApiOkResponse({ type: [BuildingAmenityResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    const amenities = await this.buildingAmenitiesService.list(
      user,
      buildingId,
    );
    return amenities.map(toBuildingAmenityResponse);
  }

  @Post()
  @BuildingWriteAccess(true)
  @RequirePermissions('buildings.write')
  @ApiOkResponse({ type: BuildingAmenityResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateBuildingAmenityDto,
  ) {
    const amenity = await this.buildingAmenitiesService.create(
      user,
      buildingId,
      dto,
    );
    return toBuildingAmenityResponse(amenity);
  }

  @Patch(':amenityId')
  @BuildingWriteAccess(true)
  @RequirePermissions('buildings.write')
  @ApiOkResponse({ type: BuildingAmenityResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('amenityId') amenityId: string,
    @Body() dto: UpdateBuildingAmenityDto,
  ) {
    const amenity = await this.buildingAmenitiesService.update(
      user,
      buildingId,
      amenityId,
      dto,
    );
    return toBuildingAmenityResponse(amenity);
  }
}
