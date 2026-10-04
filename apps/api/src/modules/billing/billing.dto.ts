import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const int = ({ value }: { value: unknown }) => typeof value === 'string' ? parseInt(value, 10) : value;

export class InvoiceQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @Transform(int) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Transform(int) @IsInt() @Min(1) pageSize: number = 25;
}

export class CreateInvoiceDto {
  @IsUUID() companyId!: string;
  @IsArray() @IsUUID(undefined, { each: true }) orderIds!: string[];
  @IsNotEmpty() @IsString() @MaxLength(100) actionId!: string;
}

export class PayInvoiceDto {
  @IsInt() @Min(1) amountMinor!: number;
  @IsNotEmpty() @IsString() @MaxLength(100) actionId!: string;
}

export class CreateCreditDto {
  @IsUUID() orderId!: string;
  @IsInt() @Min(1) amountMinor!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
  @IsNotEmpty() @IsString() @MaxLength(100) actionId!: string;
}
