import { ApiProperty } from '@nestjs/swagger';
import { AccessItemStatus, LeaseAccessCard } from '@prisma/client';

export class LeaseAccessCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  leaseId!: string;

  @ApiProperty()
  cardNumber!: string;

  @ApiProperty({ enum: AccessItemStatus })
  status!: AccessItemStatus;

  @ApiProperty()
  issuedAt!: Date;

  @ApiProperty({ required: false })
  returnedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toLeaseAccessCardDto = (
  card: LeaseAccessCard,
): LeaseAccessCardDto => ({
  id: card.id,
  leaseId: card.leaseId,
  cardNumber: card.cardNumber,
  status: card.status,
  issuedAt: card.issuedAt,
  returnedAt: card.returnedAt ?? null,
  createdAt: card.createdAt,
  updatedAt: card.updatedAt,
});
