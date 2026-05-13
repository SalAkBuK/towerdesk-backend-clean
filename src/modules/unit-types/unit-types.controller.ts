import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import {
  UnitTypeResponseDto,
  toUnitTypeResponse,
} from './dto/unit-type.response.dto';
import { UnitTypesService } from './unit-types.service';

@ApiTags('org-unit-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/unit-types')
export class UnitTypesController {
  constructor(private readonly unitTypesService: UnitTypesService) {}

  @Get()
  @RequirePermissions('unitTypes.read')
  @ApiOkResponse({ type: [UnitTypeResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const unitTypes = await this.unitTypesService.listActive(user);
    return unitTypes.map(toUnitTypeResponse);
  }

  @Post()
  @RequirePermissions('unitTypes.write')
  @ApiOkResponse({ type: UnitTypeResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUnitTypeDto,
  ) {
    const unitType = await this.unitTypesService.create(user, dto);
    return toUnitTypeResponse(unitType);
  }
}
