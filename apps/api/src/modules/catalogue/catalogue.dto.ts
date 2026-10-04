import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

// Omitted PATCH fields keep their old value; explicit null is valid only on nullable fields.
export const OptionalValue = () => ValidateIf((_object: unknown, value: unknown) => value !== undefined);

export class CatalogueQuery {
  @OptionalValue() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @OptionalValue() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 25;
  @OptionalValue() @IsString() @MaxLength(100) q?: string;
  @OptionalValue() @IsIn(['true', 'false']) active?: string;
  @OptionalValue() @IsUUID() categoryId?: string;
}

export class DishInput {
  @OptionalValue() @IsString() @MinLength(1) @MaxLength(60) sku?: string;
  @OptionalValue() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @OptionalValue() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(1000) imageUrl?: string | null;
  @OptionalValue() @IsIn(['HOT', 'COLD', 'AMBIENT']) temperature?: 'HOT' | 'COLD' | 'AMBIENT';
  @OptionalValue() @IsInt() @Min(0) @Max(2_147_483_647) costMinor?: number;
  @IsOptional() @IsUUID() stationId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(100000) minQuantity?: number | null;
  @OptionalValue() @IsBoolean() active?: boolean;
  @OptionalValue() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) allergenIds?: string[];
  @OptionalValue() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) dietaryTagIds?: string[];
}

export class OptionInput {
  @OptionalValue() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @OptionalValue() @IsString() @MaxLength(2000) description?: string;
  @OptionalValue() @IsInt() @Min(0) @Max(2_147_483_647) costMinor?: number;
  @OptionalValue() @IsBoolean() active?: boolean;
  @OptionalValue() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) allergenIds?: string[];
  @OptionalValue() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) dietaryTagIds?: string[];
}

export class CategoryInput {
  @OptionalValue() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @OptionalValue() @IsBoolean() active?: boolean;
  @OptionalValue() @IsBoolean() secret?: boolean;
  @OptionalValue() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}

export class MenuItemInput {
  @OptionalValue() @IsUUID() categoryId?: string;
  @OptionalValue() @IsUUID() dishId?: string;
  @OptionalValue() @IsBoolean() active?: boolean;
  @OptionalValue() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}

export class PortionSurchargeInput {
  @IsUUID() optionId!: string;
  @IsUUID() portionSizeId!: string;
  @IsInt() @Min(0) @Max(100_000_000) surchargeMinor!: number;
}

export class GroupInput {
  @OptionalValue() @IsUUID() id?: string;
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsBoolean() required!: boolean;
  @IsInt() @Min(0) @Max(100000) sortOrder!: number;
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) optionIds!: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsUUID('4', { each: true }) portionSizeIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => PortionSurchargeInput) portionSurcharges?: PortionSurchargeInput[];
}

export class GroupsInput {
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => GroupInput) groups!: GroupInput[];
}
