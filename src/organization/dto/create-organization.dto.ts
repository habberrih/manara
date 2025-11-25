import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Plan } from '../../../prisma/generated/enums';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Display name for the organization',
    minLength: 2,
    maxLength: 120,
    example: 'Acme Inc.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional slug (unique). If omitted, derived from the name.',
    pattern: SLUG_REGEX.source,
    example: 'acme-inc',
  })
  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX, {
    message: 'Slug must be lowercase alphanumeric with hyphens (e.g. acme-inc)',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Plan to assign on creation. Defaults to FREE.',
    enum: Plan,
    example: Plan.FREE,
  })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;
}
