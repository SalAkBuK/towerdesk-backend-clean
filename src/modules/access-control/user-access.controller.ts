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
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import {
  AccessAssignmentResponseDto,
  CreateAccessAssignmentDto,
} from './dto/access-assignment.dto';
import {
  EffectivePermissionsRequestDto,
  EffectivePermissionsResponseDto,
} from './dto/effective-permissions.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import { UserPermissionsResponseDto } from './dto/user-permissions.response.dto';
import { UserAccessService } from './user-access.service';

@ApiTags('access-control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('users')
export class UserAccessController {
  constructor(private readonly userAccessService: UserAccessService) {}

  @Get(':userId/access-assignments')
  @RequirePermissions('users.read')
  @ApiOkResponse({ type: [AccessAssignmentResponseDto] })
  listAccessAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.userAccessService.listAccessAssignments(
      userId,
      user.orgId as string,
    );
  }

  @Post(':userId/access-assignments')
  @RequirePermissions('users.write')
  @ApiOkResponse({ type: AccessAssignmentResponseDto })
  createAccessAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: CreateAccessAssignmentDto,
  ) {
    return this.userAccessService.createAccessAssignment(
      userId,
      user.orgId as string,
      dto,
    );
  }

  @Delete(':userId/access-assignments/:assignmentId')
  @RequirePermissions('users.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccessAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    await this.userAccessService.deleteAccessAssignment(
      userId,
      user.orgId as string,
      assignmentId,
    );
  }

  @Post(':userId/permissions')
  @RequirePermissions('users.write')
  @ApiOkResponse({ type: UserPermissionsResponseDto })
  async setPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    await this.userAccessService.setPermissionOverrides(
      userId,
      dto.overrides,
      user.orgId as string,
    );
    const effectivePermissions =
      await this.userAccessService.getEffectivePermissions(
        userId,
        user.orgId as string,
      );
    return {
      userId,
      overrides: dto.overrides,
      effectivePermissions,
    };
  }

  @Get(':userId/permissions')
  @RequirePermissions('users.write')
  @ApiOkResponse({ type: UserPermissionsResponseDto })
  async getPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    const [overrides, effectivePermissions] = await Promise.all([
      this.userAccessService.getPermissionOverrides(
        userId,
        user.orgId as string,
      ),
      this.userAccessService.getEffectivePermissions(
        userId,
        user.orgId as string,
      ),
    ]);
    return {
      userId,
      overrides,
      effectivePermissions,
    };
  }

  @Post('effective-permissions')
  @RequirePermissions('users.write')
  @ApiOkResponse({ type: EffectivePermissionsResponseDto })
  async getEffectivePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EffectivePermissionsRequestDto,
  ) {
    const users = await this.userAccessService.getEffectivePermissionsForUsers(
      dto.userIds,
      user.orgId as string,
    );
    return { users };
  }
}
