import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  orgContractOrderValues,
  orgContractStatusValues,
  OrgContractOrder,
  OrgContractStatusFilter,
} from './list-org-contracts.query.dto';

export class ListResidentContractsQueryDto {
  @ApiPropertyOptional({
    enum: orgContractStatusValues,
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  @IsIn(orgContractStatusValues)
  status?: OrgContractStatusFilter;

  @ApiPropertyOptional({ enum: orgContractOrderValues, default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(orgContractOrderValues)
  order?: OrgContractOrder;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100)', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
