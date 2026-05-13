import { ApiProperty } from '@nestjs/swagger';
import { AccessItemStatus, LeaseParkingSticker } from '@prisma/client';

export class LeaseParkingStickerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  leaseId!: string;

  @ApiProperty()
  stickerNumber!: string;

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

export const toLeaseParkingStickerDto = (
  sticker: LeaseParkingSticker,
): LeaseParkingStickerDto => ({
  id: sticker.id,
  leaseId: sticker.leaseId,
  stickerNumber: sticker.stickerNumber,
  status: sticker.status,
  issuedAt: sticker.issuedAt,
  returnedAt: sticker.returnedAt ?? null,
  createdAt: sticker.createdAt,
  updatedAt: sticker.updatedAt,
});
