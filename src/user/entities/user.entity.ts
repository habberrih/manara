import { Exclude } from 'class-transformer';

export class UserResponseDto {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  @Exclude()
  password?: string;

  @Exclude()
  refreshToken?: string | null;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
