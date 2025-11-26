import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrgRole } from '../../../prisma/generated/enums';

export class UpdateMembershipDto {
  @ApiProperty({
    description: 'New role to assign to the member',
    enum: OrgRole,
    example: OrgRole.ADMIN,
  })
  @IsEnum(OrgRole)
  role!: OrgRole;
}
