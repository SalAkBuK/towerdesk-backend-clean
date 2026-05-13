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
import { CreateLeaseParkingStickersDto } from './dto/create-lease-parking-stickers.dto';
import {
  LeaseParkingStickerDto,
  toLeaseParkingStickerDto,
} from './dto/lease-parking-sticker.dto';
import { UpdateAccessItemStatusDto } from './dto/update-access-item-status.dto';
import { LeaseParkingStickersService } from './lease-parking-stickers.service';

@ApiTags('lease-parking-stickers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/leases/:leaseId/parking-stickers')
export class LeaseParkingStickersController {
  constructor(
    private readonly leaseParkingStickersService: LeaseParkingStickersService,
  ) {}

  @Get()
  @RequirePermissions('leases.access_items.read')
  @ApiOkResponse({ type: [LeaseParkingStickerDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ) {
    const stickers = await this.leaseParkingStickersService.list(user, leaseId);
    return stickers.map(toLeaseParkingStickerDto);
  }

  @Post()
  @RequirePermissions('leases.access_items.write')
  @ApiOkResponse({ type: [LeaseParkingStickerDto] })
  @HttpCode(HttpStatus.OK)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateLeaseParkingStickersDto,
  ) {
    const stickers = await this.leaseParkingStickersService.create(
      user,
      leaseId,
      dto,
    );
    return stickers.map(toLeaseParkingStickerDto);
  }

  @Patch(':stickerId')
  @RequirePermissions('leases.access_items.write')
  @ApiOkResponse({ type: LeaseParkingStickerDto })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('stickerId') stickerId: string,
    @Body() dto: UpdateAccessItemStatusDto,
  ) {
    const sticker = await this.leaseParkingStickersService.updateStatus(
      user,
      leaseId,
      stickerId,
      dto,
    );
    return toLeaseParkingStickerDto(sticker);
  }

  @Delete(':stickerId')
  @RequirePermissions('leases.access_items.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('stickerId') stickerId: string,
  ) {
    await this.leaseParkingStickersService.delete(user, leaseId, stickerId);
  }
}
