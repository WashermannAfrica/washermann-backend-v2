import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM device registration token', example: 'fZ1c…:APA91b…' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  token: string;

  @ApiPropertyOptional({ enum: ['android', 'ios', 'web'], description: 'Device platform' })
  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}

export class RemoveDeviceTokenDto {
  @ApiProperty({ description: 'The FCM token to unregister (call on logout)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  token: string;
}
