import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceProviderUserRole } from '@prisma/client';

export class ProviderStaffResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiProperty({ enum: ServiceProviderUserRole })
  role!: ServiceProviderUserRole;

  @ApiProperty()
  membershipIsActive!: boolean;

  @ApiProperty()
  userIsActive!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CreateProviderStaffResponseDto extends ProviderStaffResponseDto {
  @ApiProperty()
  tempPassword!: string;
}

export const toProviderStaffResponse = (membership: {
  userId: string;
  role: ServiceProviderUserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name?: string | null;
    phone?: string | null;
    isActive: boolean;
    mustChangePassword: boolean;
  };
}): ProviderStaffResponseDto => ({
  userId: membership.userId,
  email: membership.user.email,
  name: membership.user.name ?? null,
  phone: membership.user.phone ?? null,
  role: membership.role,
  membershipIsActive: membership.isActive,
  userIsActive: membership.user.isActive,
  mustChangePassword: membership.user.mustChangePassword,
  createdAt: membership.createdAt,
  updatedAt: membership.updatedAt,
});

export const toCreateProviderStaffResponse = (input: {
  staff: {
    userId: string;
    role: ServiceProviderUserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      email: string;
      name?: string | null;
      phone?: string | null;
      isActive: boolean;
      mustChangePassword: boolean;
    };
  };
  tempPassword: string;
}): CreateProviderStaffResponseDto => ({
  ...toProviderStaffResponse(input.staff),
  tempPassword: input.tempPassword,
});
