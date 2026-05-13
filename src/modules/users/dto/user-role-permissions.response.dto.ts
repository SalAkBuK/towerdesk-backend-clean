import { ApiProperty } from '@nestjs/swagger';

export class UserRolePermissionsRoleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false })
  description?: string | null;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class UserRolePermissionsResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: [UserRolePermissionsRoleDto] })
  roles!: UserRolePermissionsRoleDto[];
}
