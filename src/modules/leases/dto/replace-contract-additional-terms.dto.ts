import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ReplaceContractAdditionalTermsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  terms!: string[];
}
