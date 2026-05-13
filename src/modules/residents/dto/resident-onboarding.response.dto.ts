import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResidentUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

export class ResidentOnboardingResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiProperty({ type: ResidentUnitDto })
  unit!: ResidentUnitDto;

  @ApiProperty()
  buildingId!: string;

  @ApiPropertyOptional()
  tempPassword?: string;

  @ApiPropertyOptional()
  inviteSent?: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;
}

export const toResidentOnboardingResponse = (
  payload: ResidentOnboardingResponseDto,
): ResidentOnboardingResponseDto => payload;
