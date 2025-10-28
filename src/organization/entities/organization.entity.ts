import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plan } from '@prisma/client';

export class OrganizationResponseDto {
  @ApiProperty({ description: 'Organization identifier' })
  id!: string;

  @ApiProperty({ description: 'Human friendly organization name' })
  name!: string;

  @ApiProperty({ description: 'URL-safe slug used in public contexts' })
  slug!: string;

  @ApiProperty({ enum: Plan, description: 'Active subscription plan' })
  plan!: Plan;

  @ApiProperty({ description: 'Creation timestamp (ISO string)' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp (ISO string)' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: 'Soft-delete timestamp when applicable' })
  deletedAt?: Date | null;

  constructor(partial: Partial<OrganizationResponseDto>) {
    Object.assign(this, partial);
  }
}
