import { ApiProperty } from '@nestjs/swagger';
import { Permission } from '@prisma/client';

export class PermissionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false })
  description?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toPermissionResponse = (
  permission: Permission,
): PermissionResponseDto => ({
  id: permission.id,
  key: permission.key,
  name: permission.name,
  description: permission.description,
  createdAt: permission.createdAt,
  updatedAt: permission.updatedAt,
});
