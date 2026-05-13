import { PartialType } from '@nestjs/swagger';
import { RegisterPushDeviceDto } from './register-push-device.dto';

export class UpdatePushDeviceDto extends PartialType(RegisterPushDeviceDto) {}
