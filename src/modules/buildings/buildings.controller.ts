import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BuildingReadAccess } from '../../common/decorators/building-access.decorator';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateBuildingDto } from './dto/create-building.dto';
import {
  BuildingResponseDto,
  toBuildingResponse,
} from './dto/building.response.dto';
import { BuildingsService } from './buildings.service';

@ApiTags('org-buildings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('org/buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('buildings.write')
  @ApiOkResponse({ type: BuildingResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBuildingDto,
  ) {
    const building = await this.buildingsService.create(user, dto);
    return toBuildingResponse(building);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('buildings.read')
  @ApiOkResponse({ type: [BuildingResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const buildings = await this.buildingsService.list(user);
    return buildings.map(toBuildingResponse);
  }

  @Get('assigned')
  @ApiOkResponse({ type: [BuildingResponseDto] })
  async listAssigned(@CurrentUser() user: AuthenticatedUser) {
    const buildings = await this.buildingsService.listAssigned(user);
    return buildings.map(toBuildingResponse);
  }

  @Get(':buildingId')
  @UseGuards(BuildingAccessGuard)
  @BuildingReadAccess()
  @RequirePermissions('buildings.read')
  @ApiOkResponse({ type: BuildingResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    const building = await this.buildingsService.getById(user, buildingId);
    return toBuildingResponse(building);
  }

  @Delete(':buildingId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('buildings.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    await this.buildingsService.delete(user, buildingId);
  }
}
