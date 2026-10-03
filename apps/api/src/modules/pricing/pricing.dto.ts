import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { CatalogueQuery, OptionalValue } from '../catalogue/catalogue.dto';

export class TierInput {
  @OptionalValue() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @OptionalValue() @IsIn(['MANUAL', 'COST', 'REFERENCE']) rule?: 'MANUAL' | 'COST' | 'REFERENCE';
  @OptionalValue() @IsInt() @Min(0) @Max(1_000_000) numerator?: number;
  @OptionalValue() @IsInt() @Min(1) @Max(1_000_000) denominator?: number;
  @IsOptional() @IsUUID() referenceTierId?: string | null;
  @OptionalValue() @IsBoolean() active?: boolean;
}
export class MatrixQuery extends CatalogueQuery {
  @IsOptional() @IsIn(['true', 'false']) missing?: string;
  @IsOptional() @IsIn(['DISH', 'OPTION']) kind?: 'DISH' | 'OPTION';
}
export class MatrixEntryInput {
  @IsIn(['DISH', 'OPTION']) kind!: 'DISH' | 'OPTION';
  @IsUUID() itemId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(2_147_483_647) amountMinor!: number | null;
}
export class MatrixInput {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => MatrixEntryInput) entries!: MatrixEntryInput[];
}
