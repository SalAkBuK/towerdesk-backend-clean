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
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { ListVisitorsQueryDto } from './dto/list-visitors.query.dto';
import {
  VisitorResponseDto,
  toVisitorResponse,
} from './dto/visitor.response.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { VisitorsService } from './visitors.service';

@ApiTags('building-visitors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/visitors')
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @BuildingWriteAccess(true)
  @RequirePermissions('visitors.create')
  @ApiOkResponse({ type: VisitorResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateVisitorDto,
  ) {
    const visitor = await this.visitorsService.create(user, buildingId, dto);
    return toVisitorResponse(visitor);
  }

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('visitors.read')
  @ApiOkResponse({ type: [VisitorResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListVisitorsQueryDto,
  ) {
    const visitors = await this.visitorsService.list(user, buildingId, query);
    return visitors.map(toVisitorResponse);
  }

  @Patch(':visitorId')
  @BuildingWriteAccess(true)
  @RequirePermissions('visitors.update')
  @ApiOkResponse({ type: VisitorResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('visitorId') visitorId: string,
    @Body() dto: UpdateVisitorDto,
  ) {
    const visitor = await this.visitorsService.update(
      user,
      buildingId,
      visitorId,
      dto,
    );
    return toVisitorResponse(visitor);
  }
}
