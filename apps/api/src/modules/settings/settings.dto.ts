import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
export class SettingsUpdateDto {
  @IsInt() @Min(1) version!: number;
  @IsUUID() defaultPriceTierId!: string;
  @IsArray() @ArrayMaxSize(7) @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) workingDays!: number[];
  @IsArray() @ArrayMaxSize(366) @ArrayUnique() @IsString({ each: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true }) holidays!: string[];
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) cutoffTime!: string;
  @IsInt() @Min(0) @Max(30) cutoffWorkingDays!: number;
  @IsInt() @Min(0) @Max(1440) riskThresholdMinutes!: number;
}
export class CutoffPreviewDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) deliveryDate!: string;
  @IsOptional() @IsUUID() companyId?: string;
}
