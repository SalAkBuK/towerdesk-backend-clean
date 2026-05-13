import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ProviderPortalService } from './provider-portal.service';
import { ProviderMeResponseDto } from './dto/provider-me.response.dto';
import {
  CreateProviderStaffResponseDto,
  ProviderStaffResponseDto,
  toCreateProviderStaffResponse,
  toProviderStaffResponse,
} from './dto/provider-staff.response.dto';
import {
  ProviderProfileResponseDto,
  toProviderProfileResponse,
} from './dto/provider-profile.response.dto';
import { UpdateServiceProviderDto } from './dto/update-service-provider.dto';
import { CreateProviderStaffDto } from './dto/create-provider-staff.dto';
import { UpdateProviderStaffDto } from './dto/update-provider-staff.dto';

@ApiTags('provider-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('provider')
export class ProviderPortalController {
  constructor(private readonly providerPortalService: ProviderPortalService) {}

  @Get('me')
  @ApiOkResponse({ type: ProviderMeResponseDto })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.providerPortalService.getMe(user);
  }

  @Get('profile')
  @ApiOkResponse({ type: ProviderProfileResponseDto })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const provider = await this.providerPortalService.getProfile(user);
    return toProviderProfileResponse(provider);
  }

  @Patch('profile')
  @ApiOkResponse({ type: ProviderProfileResponseDto })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateServiceProviderDto,
  ) {
    const provider = await this.providerPortalService.updateProfile(user, dto);
    return toProviderProfileResponse(provider);
  }

  @Get('staff')
  @ApiOkResponse({ type: [ProviderStaffResponseDto] })
  async listStaff(@CurrentUser() user: AuthenticatedUser) {
    const staff = await this.providerPortalService.listStaff(user);
    return staff.map(toProviderStaffResponse);
  }

  @Post('staff')
  @ApiOkResponse({ type: CreateProviderStaffResponseDto })
  async createStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProviderStaffDto,
  ) {
    const created = await this.providerPortalService.createStaff(user, dto);
    return toCreateProviderStaffResponse(created);
  }

  @Patch('staff/:userId')
  @ApiOkResponse({ type: ProviderStaffResponseDto })
  async updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateProviderStaffDto,
  ) {
    const staff = await this.providerPortalService.updateStaff(
      user,
      userId,
      dto,
    );
    return toProviderStaffResponse(staff);
  }
}
