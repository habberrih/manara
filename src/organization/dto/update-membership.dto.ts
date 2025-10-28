import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMembershipDto {
  @ApiProperty({
    description: 'New role to assign to the member',
    enum: OrgRole,
    example: OrgRole.ADMIN,
  })
  @IsEnum(OrgRole)
  role!: OrgRole;
}
