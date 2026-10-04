import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { DROP_STATUSES, PREP_STATUSES } from '@fernleaf/contracts';
import type { DropStatus, PrepStatus } from '@fernleaf/contracts';
import { CustomAddressDto } from '../orders/orders.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class OperationalActionDto {
  @IsInt() @Min(1) version!: number;
  @IsUUID() actionId!: string;
}
export class ForceCompleteDto extends OperationalActionDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class AssignDriverDto extends OperationalActionDto {
  @IsUUID() driverId!: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason?: string;
}
export class DeliverDropDto extends OperationalActionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsString() @MaxLength(3_000_000) photoDataUrl?: string;
}
export class CorrectDropDto extends ForceCompleteDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => CustomAddressDto) address?: CustomAddressDto;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) deliveryDate?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) deliveryTime?: string;
}
export class OperationalPageDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 50;
}
export class OperationalDatePageDto extends OperationalPageDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}
export class KitchenQueryDto extends OperationalDatePageDto {
  @IsOptional() @IsUUID() stationId?: string;
  @IsOptional() @IsIn(PREP_STATUSES) status?: PrepStatus;
}
export class DropQueryDto extends OperationalDatePageDto {
  @IsOptional() @IsIn(DROP_STATUSES) status?: DropStatus;
}
export class DriverQueryDto extends OperationalPageDto {
  @IsOptional() @IsIn(DROP_STATUSES) status?: DropStatus;
}
