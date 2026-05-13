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
import { CreateLeaseAccessCardsDto } from './dto/create-lease-access-cards.dto';
import {
  LeaseAccessCardDto,
  toLeaseAccessCardDto,
} from './dto/lease-access-card.dto';
import { UpdateAccessItemStatusDto } from './dto/update-access-item-status.dto';
import { LeaseAccessCardsService } from './lease-access-cards.service';

@ApiTags('lease-access-cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/leases/:leaseId/access-cards')
export class LeaseAccessCardsController {
  constructor(
    private readonly leaseAccessCardsService: LeaseAccessCardsService,
  ) {}

  @Get()
  @RequirePermissions('leases.access_items.read')
  @ApiOkResponse({ type: [LeaseAccessCardDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ) {
    const cards = await this.leaseAccessCardsService.list(user, leaseId);
    return cards.map(toLeaseAccessCardDto);
  }

  @Post()
  @RequirePermissions('leases.access_items.write')
  @ApiOkResponse({ type: [LeaseAccessCardDto] })
  @HttpCode(HttpStatus.OK) // ✅ add this
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateLeaseAccessCardsDto,
  ) {
    const cards = await this.leaseAccessCardsService.create(user, leaseId, dto);
    return cards.map(toLeaseAccessCardDto);
  }

  @Patch(':cardId')
  @RequirePermissions('leases.access_items.write')
  @ApiOkResponse({ type: LeaseAccessCardDto })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateAccessItemStatusDto,
  ) {
    const card = await this.leaseAccessCardsService.updateStatus(
      user,
      leaseId,
      cardId,
      dto,
    );
    return toLeaseAccessCardDto(card);
  }

  @Delete(':cardId')
  @RequirePermissions('leases.access_items.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('cardId') cardId: string,
  ) {
    await this.leaseAccessCardsService.delete(user, leaseId, cardId);
  }
}
