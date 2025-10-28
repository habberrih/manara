import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Friendly label for the API key (e.g. "Primary Backend Key")',
    minLength: 3,
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 80)
  name!: string;
}
