import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDefined, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { REFERENCE_KINDS } from '@fernleaf/contracts';
import type { ReferenceKind } from '@fernleaf/contracts';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const email = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class AddressPatchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) label?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(250) line1?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(250) line2?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) region?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(30) postalCode?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) country?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class OwnerDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @Transform(email) @IsEmail() @MaxLength(254) email!: string;
}
export class CompanyPatchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) billingName?: string;
  @IsOptional() @Transform(email) @IsEmail() @MaxLength(254) billingEmail?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) billingAddress?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) billingContactName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) @MaxLength(253, { each: true }) domains?: string[];
  @IsOptional() @IsUUID() priceTierId?: string | null;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) deliveryTime?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) deliveryMinutes?: number;
  @IsOptional() @IsUUID() packagingId?: string | null;
  @IsOptional() @IsUUID() defaultDriverId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) driverInstructions?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) workingDays?: number[];
  @IsOptional() @IsArray() @ArrayMaxSize(366) @ArrayUnique() @IsString({ each: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true }) holidays?: string[];
  @IsOptional() @IsUUID() ownerEmployeeId?: string;
  @IsOptional() @IsUUID() defaultAddressId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsUUID(undefined, { each: true }) hiddenCategoryIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ArrayUnique() @IsUUID(undefined, { each: true }) hiddenMenuItemIds?: string[];
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class CompanyCreateDto extends CompanyPatchDto {
  @IsDefined() @IsObject() @ValidateNested() @Type(() => OwnerDto) owner!: OwnerDto;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => AddressPatchDto) address!: AddressPatchDto;
}
export class EmployeePatchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @Transform(email) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() canChooseAddress?: boolean;
  @IsOptional() @IsBoolean() canChangeTime?: boolean;
  @IsOptional() @IsBoolean() canChangePackaging?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) allergenIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) dietaryTagIds?: string[];
}
export class EmployeeCreateDto extends EmployeePatchDto {
  @IsUUID() companyId!: string;
}
export class TransferDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() replacementOwnerId?: string;
}
export class ListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsUUID() companyId?: string;
}
export class ReferenceListDto {
  @IsOptional() @IsIn(REFERENCE_KINDS) kind?: ReferenceKind;
}
export class ReferencePatchDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(253) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}
export class ReferenceCreateDto extends ReferencePatchDto {
  @IsIn(REFERENCE_KINDS) kind!: ReferenceKind;
}
