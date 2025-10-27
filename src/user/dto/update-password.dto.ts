import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'currentPa$$123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'newStrongerPa$$456', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
