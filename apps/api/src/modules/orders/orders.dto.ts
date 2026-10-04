import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ORDER_STATUSES } from '@fernleaf/contracts';
import type { OrderStatus } from '@fernleaf/contracts';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class SelectionDto {
  @IsUUID() groupId!: string;
  @IsUUID() optionId!: string;
  @IsOptional() @IsUUID() portionSizeId?: string;
}
export class CombinationDto {
  @IsInt() @Min(1) @Max(100000) quantity!: number;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SelectionDto) selections!: SelectionDto[];
}
export class LineDto {
  @IsUUID() menuItemId!: string;
  @IsInt() @Min(1) @Max(100000) quantity!: number;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CombinationDto) combinations!: CombinationDto[];
}
export class CustomAddressDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) label!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(250) line1!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(250) line2!: string | null;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) region!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(30) postalCode!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) country!: string;
}
export class OrderInputDto {
  @IsUUID() employeeId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) deliveryDate!: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineDto) lines!: LineDto[];
  @IsOptional() @IsUUID() addressId?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) deliveryTime?: string;
  @IsOptional() @IsUUID() packagingId?: string | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => CustomAddressDto) customAddress?: CustomAddressDto;
}
export class QuoteDto extends OrderInputDto {
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) overrideReason?: string;
}
export class CreateOrderDto extends OrderInputDto {
  @IsIn(['DRAFT', 'PLACED']) status!: 'DRAFT' | 'PLACED';
  @IsUUID() actionId!: string;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) acceptedQuote?: string;
}
export class UpdateOrderDto extends OrderInputDto {
  @IsInt() @Min(1) version!: number;
  @IsUUID() actionId!: string;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) acceptedQuote?: string;
}
export class PlaceOrderDto {
  @IsInt() @Min(1) version!: number;
  @IsUUID() actionId!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) acceptedQuote!: string;
}
export class ReasonDto {
  @IsInt() @Min(1) version!: number;
  @IsUUID() actionId!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class OverrideCreateDto extends OrderInputDto {
  @IsUUID() actionId!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) acceptedQuote!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class OverrideDto extends ReasonDto {
  @IsIn(['DELIVERY', 'CANCEL', 'REJECT', 'PLACE']) action!: 'DELIVERY' | 'CANCEL' | 'REJECT' | 'PLACE';
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) acceptedQuote?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) deliveryDate?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) deliveryTime?: string;
  @IsOptional() @IsUUID() addressId?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => CustomAddressDto) customAddress?: CustomAddressDto;
  @IsOptional() @IsUUID() packagingId?: string | null;
}
export class OrderQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsIn(ORDER_STATUSES) status?: OrderStatus;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(['true', 'false']) invoiced?: 'true' | 'false';
  @IsOptional() @IsIn(['true']) billable?: 'true';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) q?: string;
}
