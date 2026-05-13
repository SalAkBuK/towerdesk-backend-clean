import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateRequestCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  message!: string;
}
