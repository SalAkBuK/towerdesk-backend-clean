import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnerPortfolioGuard } from '../../common/guards/owner-portfolio.guard';
import { UpdateUserProfileDto } from '../users/dto/update-user-profile.dto';
import {
  OwnerAccessibleProfileResponseDto,
  OwnerAccountProfileResponseDto,
  OwnerMeResponseDto,
} from './dto/owner-me.response.dto';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { OwnerProfileService } from './owner-profile.service';

@ApiTags('owner-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerPortfolioGuard)
@Controller('owner')
export class OwnerProfileController {
  constructor(private readonly ownerProfileService: OwnerProfileService) {}

  @Get('me')
  @ApiOkResponse({ type: OwnerMeResponseDto })
  getMe(@CurrentUser('sub') userId: string) {
    return this.ownerProfileService.getMe(userId);
  }

  @Patch('me/profile')
  @ApiOkResponse({ type: OwnerAccountProfileResponseDto })
  updateAccountProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.ownerProfileService.updateAccountProfile(userId, dto);
  }

  @Patch('profiles/:ownerId')
  @ApiOkResponse({ type: OwnerAccessibleProfileResponseDto })
  updateOwnerProfile(
    @CurrentUser('sub') userId: string,
    @Param('ownerId') ownerId: string,
    @Body() dto: UpdateOwnerProfileDto,
  ) {
    return this.ownerProfileService.updateOwnerProfile(userId, ownerId, dto);
  }
}
