import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceProviderUserRole } from '@prisma/client';

class ProviderMeMembershipDto {
  @ApiProperty()
  providerId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  serviceCategory?: string | null;

  @ApiProperty({ enum: ServiceProviderUserRole })
  role!: ServiceProviderUserRole;

  @ApiProperty()
  membershipIsActive!: boolean;
}

export class ProviderMeResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;

  @ApiProperty({ type: [ProviderMeMembershipDto] })
  providers!: ProviderMeMembershipDto[];
}
