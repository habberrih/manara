import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrgRole } from '../../../prisma/generated/enums';

export class InviteMemberDto {
  @ApiProperty({
    description: 'User identifier that should be added to the organization',
    example: 'ddeb9fad-5d6a-46b8-b73f-7d29e5c50703',
  })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Role to assign to the invited member. Defaults to MEMBER.',
    enum: OrgRole,
    example: OrgRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
}
