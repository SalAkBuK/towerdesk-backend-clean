import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleResponseDto } from './dto/role.response.dto';
import { UpdateRoleTemplateDto } from './dto/update-role-template.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('roles')
export class RolesLegacyController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles.read')
  @ApiOkResponse({ type: [RoleResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.list(user.orgId as string);
  }

  @Post()
  @RequirePermissions('roles.write')
  @ApiOkResponse({ type: RoleResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user.sub, user.orgId as string, dto);
  }

  @Get(':roleId')
  @RequirePermissions('roles.read')
  @ApiOkResponse({ type: RoleResponseDto })
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.getById(user.orgId as string, roleId);
  }

  @Patch(':roleId')
  @RequirePermissions('roles.write')
  @ApiOkResponse({ type: RoleResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleTemplateDto,
  ) {
    return this.rolesService.update(
      user.sub,
      user.orgId as string,
      roleId,
      dto,
    );
  }

  @Delete(':roleId')
  @RequirePermissions('roles.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    await this.rolesService.delete(user.sub, user.orgId as string, roleId);
  }
}
