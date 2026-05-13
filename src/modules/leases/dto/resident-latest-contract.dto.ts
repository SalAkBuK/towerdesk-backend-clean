import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoveRequestStatus } from '@prisma/client';
import { ContractResponseDto } from './contract.dto';

export class ResidentLatestContractResponseDto {
  @ApiPropertyOptional({ type: ContractResponseDto, nullable: true })
  contract!: ContractResponseDto | null;

  @ApiProperty()
  canRequestMoveIn!: boolean;

  @ApiProperty()
  canRequestMoveOut!: boolean;

  @ApiPropertyOptional({ enum: MoveRequestStatus, nullable: true })
  latestMoveInRequestStatus!: MoveRequestStatus | null;

  @ApiPropertyOptional({ enum: MoveRequestStatus, nullable: true })
  latestMoveOutRequestStatus!: MoveRequestStatus | null;
}
