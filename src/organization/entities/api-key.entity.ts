import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ description: 'API key identifier' })
  id!: string;

  @ApiProperty({ description: 'Human readable key name' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the key was last used',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastUsedAt?: Date | null;

  @ApiProperty({
    description: 'Creation timestamp',
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;

  constructor(partial: Partial<ApiKeyResponseDto>) {
    Object.assign(this, partial);
  }
}

export class ApiKeyWithSecretResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    description:
      'Plaintext API key. Shown once immediately after creation. Store it securely.',
  })
  secret!: string;

  constructor(partial: Partial<ApiKeyWithSecretResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
