import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { ListOwnersQueryDto } from './dto/list-owners.query.dto';
import { OwnerResponseDto, toOwnerResponse } from './dto/owner.response.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { OwnersService } from './owners.service';

@ApiTags('org-owners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  @RequirePermissions('owners.read')
  @ApiOkResponse({ type: [OwnerResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOwnersQueryDto,
  ) {
    const owners = await this.ownersService.list(user, query.search);
    return owners.map(toOwnerResponse);
  }

  @Post()
  @RequirePermissions('owners.write')
  @ApiOkResponse({ type: OwnerResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOwnerDto,
  ) {
    const owner = await this.ownersService.create(user, dto);
    return toOwnerResponse(owner);
  }

  @Patch(':ownerId')
  @RequirePermissions('owners.write')
  @ApiOkResponse({ type: OwnerResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Body() dto: UpdateOwnerDto,
  ) {
    const owner = await this.ownersService.update(user, ownerId, dto);
    return toOwnerResponse(owner);
  }
}
