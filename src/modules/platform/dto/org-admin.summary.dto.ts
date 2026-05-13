import { ApiProperty } from '@nestjs/swagger';

export class OrgAdminSummaryDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  name?: string | null;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

type OrgAdminRecord = {
  id: string;
  email: string;
  name?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  orgId?: string | null;
  org: { id: string; name: string } | null;
};

export const toOrgAdminSummary = (
  user: OrgAdminRecord,
): OrgAdminSummaryDto => ({
  ...(user.org
    ? {
        userId: user.id,
        email: user.email,
        name: user.name ?? null,
        orgId: user.org.id,
        orgName: user.org.name,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    : (() => {
        throw new Error('Org not found');
      })()),
});
