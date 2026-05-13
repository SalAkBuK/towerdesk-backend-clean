import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportUnitsErrorDto {
  @ApiProperty({ description: '1-based CSV row number (including header row)' })
  row!: number;

  @ApiPropertyOptional()
  field?: string;

  @ApiProperty()
  message!: string;
}

export class ImportUnitsSummaryDto {
  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  validRows!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;
}

export class ImportUnitsResponseDto {
  @ApiProperty()
  dryRun!: boolean;

  @ApiProperty()
  mode!: string;

  @ApiProperty({ type: ImportUnitsSummaryDto })
  summary!: ImportUnitsSummaryDto;

  @ApiProperty({ type: [ImportUnitsErrorDto] })
  errors!: ImportUnitsErrorDto[];

  @ApiPropertyOptional({
    description: 'IDs created/updated (only when dryRun=false)',
    type: [String],
  })
  unitIds?: string[];
}
