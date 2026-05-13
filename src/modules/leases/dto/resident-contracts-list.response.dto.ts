import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractResponseDto } from './contract.dto';

export class ResidentContractsListResponseDto {
  @ApiProperty({ type: [ContractResponseDto] })
  items!: ContractResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string | null;
}
