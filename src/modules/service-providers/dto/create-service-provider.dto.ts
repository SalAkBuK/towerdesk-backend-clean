import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateServiceProviderDto {
  @ApiProperty({ example: 'RapidFix Technical Services' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'Plumbing' })
  @IsOptional()
  @IsString()
  serviceCategory?: string;

  @ApiPropertyOptional({ example: 'Nadia Khan' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ example: 'ops@rapidfix.test' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+971500000000' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Initial building links for the current org',
  })
  @IsOptional()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  buildingIds?: string[];

  @ApiPropertyOptional({
    example: 'admin@rapidfix.test',
    description: 'Optional initial provider-admin invite email',
  })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;
}
