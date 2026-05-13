import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user.response.dto';
import { ResidentProfileResponseDto } from './resident-profile.dto';

export class CreateOrgResidentResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiPropertyOptional({ type: ResidentProfileResponseDto, nullable: true })
  residentProfile?: ResidentProfileResponseDto | null;

  @ApiPropertyOptional()
  tempPassword?: string;

  @ApiPropertyOptional()
  inviteSent?: boolean;
}
