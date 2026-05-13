import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CreateResidentVisitorDto } from './dto/create-resident-visitor.dto';
import { ListResidentVisitorsQueryDto } from './dto/list-resident-visitors.query.dto';
import { UpdateResidentVisitorDto } from './dto/update-resident-visitor.dto';
import {
  VisitorResponseDto,
  toVisitorResponse,
} from './dto/visitor.response.dto';
import { VisitorsService } from './visitors.service';

@ApiTags('resident-visitors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('resident/visitors')
export class ResidentVisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @RequirePermissions('resident.visitors.create')
  @ApiOkResponse({ type: VisitorResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateResidentVisitorDto,
  ) {
    const visitor = await this.visitorsService.createResident(user, dto);
    return toVisitorResponse(visitor);
  }

  @Get()
  @RequirePermissions('resident.visitors.read')
  @ApiOkResponse({ type: [VisitorResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListResidentVisitorsQueryDto,
  ) {
    const visitors = await this.visitorsService.listResident(user, query);
    return visitors.map(toVisitorResponse);
  }

  @Get(':visitorId')
  @RequirePermissions('resident.visitors.read')
  @ApiOkResponse({ type: VisitorResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId') visitorId: string,
  ) {
    const visitor = await this.visitorsService.getResident(user, visitorId);
    return toVisitorResponse(visitor);
  }

  @Patch(':visitorId')
  @RequirePermissions('resident.visitors.update')
  @ApiOkResponse({ type: VisitorResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId') visitorId: string,
    @Body() dto: UpdateResidentVisitorDto,
  ) {
    const visitor = await this.visitorsService.updateResident(
      user,
      visitorId,
      dto,
    );
    return toVisitorResponse(visitor);
  }

  @Post(':visitorId/cancel')
  @HttpCode(200)
  @RequirePermissions('resident.visitors.cancel')
  @ApiOkResponse({ type: VisitorResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitorId') visitorId: string,
  ) {
    const visitor = await this.visitorsService.cancelResident(user, visitorId);
    return toVisitorResponse(visitor);
  }
}
