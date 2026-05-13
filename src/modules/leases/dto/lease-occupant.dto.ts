import { ApiProperty } from '@nestjs/swagger';
import { LeaseOccupant } from '@prisma/client';

export class LeaseOccupantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  leaseId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: Date;
}

export const toLeaseOccupantDto = (
  occupant: LeaseOccupant,
): LeaseOccupantDto => ({
  id: occupant.id,
  leaseId: occupant.leaseId,
  name: occupant.name,
  createdAt: occupant.createdAt,
});
