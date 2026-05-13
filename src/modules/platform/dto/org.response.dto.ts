import { ApiProperty } from '@nestjs/swagger';
import { Org } from '@prisma/client';

export class OrgResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toOrgResponse = (org: Org): OrgResponseDto => ({
  id: org.id,
  name: org.name,
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
});
