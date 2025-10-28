import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus, OrgRole } from '@prisma/client';

export class MembershipResponseDto {
  @ApiProperty({ description: 'Associated user identifier' })
  userId!: string;

  @ApiProperty({ description: 'Organization identifier' })
  organizationId!: string;

  @ApiProperty({ enum: OrgRole, description: 'Role granted to the member' })
  role!: OrgRole;

  @ApiProperty({
    enum: MembershipStatus,
    description: 'Invitation status for the membership',
  })
  status!: MembershipStatus;

  @ApiProperty({ description: 'Membership creation timestamp (ISO string)' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp (ISO string)' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description: 'Soft-delete timestamp when the membership is revoked',
  })
  deletedAt?: Date | null;

  constructor(partial: Partial<MembershipResponseDto>) {
    Object.assign(this, partial);
  }
}
