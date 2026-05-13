import { ApiProperty } from '@nestjs/swagger';
import { UserPermissionOverrideDto } from './set-user-permissions.dto';

export class UserPermissionsResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: [UserPermissionOverrideDto] })
  overrides!: UserPermissionOverrideDto[];

  @ApiProperty({ type: [String] })
  effectivePermissions!: string[];
}
