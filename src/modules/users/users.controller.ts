import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user.response.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserAvatarUploadResponseDto } from './dto/user-avatar-upload.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOkResponse({ type: UserResponseDto })
  getMe(@CurrentUser('sub') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me/profile')
  @ApiOkResponse({ type: UserResponseDto })
  updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('me/avatar')
  @HttpCode(200)
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
  @ApiOkResponse({ type: UserAvatarUploadResponseDto })
  uploadMyAvatar(
    @CurrentUser()
    user:
      | {
          sub?: string;
        }
      | undefined,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size?: number;
        }
      | undefined,
  ): Promise<UserAvatarUploadResponseDto> {
    return this.usersService.uploadMyAvatar(user, file);
  }

  @Get(':id')
  @UseGuards(OrgScopeGuard)
  @RequirePermissions('users.read')
  @ApiOkResponse({ type: UserResponseDto })
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.findByIdInOrg(user, id);
  }
}
