import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_MINOR } from '../../domain/money';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const int = ({ value }: { value: unknown }) => typeof value === 'string' ? Number(value) : value;

export class InvoiceQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @Transform(int) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Transform(int) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}

export class CreateInvoiceDto {
  @IsUUID() companyId!: string;
  @IsArray() @ArrayMaxSize(1000) @IsUUID(undefined, { each: true }) orderIds!: string[];
  @IsNotEmpty() @IsString() @MaxLength(100) actionId!: string;
}

export class PayInvoiceDto {
  @IsInt() @Min(0) @Max(MAX_MINOR) amountMinor!: number;
  @IsNotEmpty() @IsString() @MaxLength(100) actionId!: string;
}

export class CreateCreditDto {
  @IsUUID() orderId!: string;
  @IsInt() @Min(1) @Max(MAX_MINOR) amountMinor!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
  @IsNotEmpty() @IsString() @MaxLength(100) actionId!: string;
}
