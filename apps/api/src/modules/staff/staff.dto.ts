import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ROLES } from '@fernleaf/contracts';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;
const int = ({ value }: { value: unknown }) => typeof value === 'string' ? Number(value) : value;

export class StaffQueryDto {
  @IsOptional() @Transform(int) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Transform(int) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}

export class CreateStaffDto {
  @Transform(lower) @IsEmail() @MaxLength(254) email!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) displayName!: string;
  @IsString() @MinLength(8) @MaxLength(100) password!: string;
  @IsIn([...ROLES]) role!: string;
}

export class UpdateStaffDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) displayName?: string;
  @IsOptional() @IsIn([...ROLES]) role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) password?: string;
}
