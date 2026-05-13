import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { LinkServiceProviderBuildingDto } from './dto/link-service-provider-building.dto';
import { ListServiceProvidersQueryDto } from './dto/list-service-providers.query.dto';
import {
  ServiceProviderResponseDto,
  toServiceProviderResponse,
} from './dto/service-provider.response.dto';
import { UpdateServiceProviderDto } from './dto/update-service-provider.dto';
import { ServiceProvidersService } from './service-providers.service';

@ApiTags('org-service-providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/service-providers')
export class ServiceProvidersController {
  constructor(
    private readonly serviceProvidersService: ServiceProvidersService,
  ) {}

  @Get()
  @RequirePermissions('service_providers.read')
  @ApiOkResponse({ type: [ServiceProviderResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListServiceProvidersQueryDto,
  ) {
    const providers = await this.serviceProvidersService.list(
      user,
      query.search,
    );
    return providers.map(toServiceProviderResponse);
  }

  @Get(':providerId')
  @RequirePermissions('service_providers.read')
  @ApiOkResponse({ type: ServiceProviderResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
  ) {
    const provider = await this.serviceProvidersService.getById(
      user,
      providerId,
    );
    return toServiceProviderResponse(provider);
  }

  @Post()
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateServiceProviderDto,
  ) {
    const provider = await this.serviceProvidersService.create(user, dto);
    return toServiceProviderResponse(provider);
  }

  @Patch(':providerId')
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: UpdateServiceProviderDto,
  ) {
    const provider = await this.serviceProvidersService.update(
      user,
      providerId,
      dto,
    );
    return toServiceProviderResponse(provider);
  }

  @Post(':providerId/buildings')
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderResponseDto })
  async linkBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: LinkServiceProviderBuildingDto,
  ) {
    const provider = await this.serviceProvidersService.linkBuilding(
      user,
      providerId,
      dto.buildingId,
    );
    return toServiceProviderResponse(provider);
  }

  @Delete(':providerId/buildings/:buildingId')
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderResponseDto })
  async unlinkBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Param('buildingId') buildingId: string,
  ) {
    const provider = await this.serviceProvidersService.unlinkBuilding(
      user,
      providerId,
      buildingId,
    );
    return toServiceProviderResponse(provider);
  }
}
