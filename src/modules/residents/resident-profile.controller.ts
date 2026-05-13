import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ResidentsService } from './residents.service';
import {
  ResidentProfileResponseDto,
  toResidentProfileResponse,
} from './dto/resident-profile.dto';
import { UpsertResidentProfileDto } from './dto/upsert-resident-profile.dto';
import {
  ResidentMeResponseDto,
  toResidentMeResponse,
} from './dto/resident-me.response.dto';
import { ResidentProfilesService } from './resident-profiles.service';
import { ResidentAvatarUploadResponseDto } from './dto/resident-avatar-upload.dto';

@ApiTags('resident-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('resident')
export class ResidentProfileController {
  constructor(
    private readonly residentsService: ResidentsService,
    private readonly residentProfilesService: ResidentProfilesService,
  ) {}

  @Get('me')
  @RequirePermissions('resident.profile.read')
  @ApiOkResponse({ type: ResidentMeResponseDto })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.residentsService.getCurrentResidentProfile(user);
    return toResidentMeResponse(profile.user, profile.occupancy);
  }

  @Put('me/profile')
  @RequirePermissions('resident.profile.write')
  @ApiOkResponse({ type: ResidentProfileResponseDto })
  async upsertMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertResidentProfileDto,
  ) {
    const profile = await this.residentProfilesService.upsertMyProfile(
      user,
      dto,
    );
    return toResidentProfileResponse(profile);
  }

  @Post('me/avatar')
  @HttpCode(200)
  @RequirePermissions('resident.profile.write')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ResidentAvatarUploadResponseDto })
  uploadMyAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size?: number;
        }
      | undefined,
  ): Promise<ResidentAvatarUploadResponseDto> {
    return this.residentProfilesService.uploadMyAvatar(user, file);
  }
}
