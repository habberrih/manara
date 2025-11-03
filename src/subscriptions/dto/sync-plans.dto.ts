import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SyncPlansRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SyncPlansResponseDto {
  created!: number;
  updated!: number;
  deactivated!: number;
}
