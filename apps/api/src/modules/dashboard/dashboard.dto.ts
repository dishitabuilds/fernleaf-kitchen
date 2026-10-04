import { IsOptional, IsString, Matches } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}
