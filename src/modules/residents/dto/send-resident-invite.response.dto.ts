import { ApiProperty } from '@nestjs/swagger';

export class SendResidentInviteResponseDto {
  @ApiProperty()
  success!: boolean;
}
