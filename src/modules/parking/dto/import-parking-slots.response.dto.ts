import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportParkingSlotsErrorDto {
  @ApiProperty({ description: '1-based CSV row number (including header row)' })
  row!: number;

  @ApiPropertyOptional()
  field?: string;

  @ApiProperty()
  message!: string;
}

export class ImportParkingSlotsSummaryDto {
  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  validRows!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;
}

export class ImportParkingSlotsResponseDto {
  @ApiProperty()
  dryRun!: boolean;

  @ApiProperty()
  mode!: string;

  @ApiProperty({ type: ImportParkingSlotsSummaryDto })
  summary!: ImportParkingSlotsSummaryDto;

  @ApiProperty({ type: [ImportParkingSlotsErrorDto] })
  errors!: ImportParkingSlotsErrorDto[];

  @ApiPropertyOptional({
    description: 'IDs created/updated (only when dryRun=false)',
    type: [String],
  })
  slotIds?: string[];
}
