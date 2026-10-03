import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import type { LoginRequest } from '@fernleaf/contracts';

export class LoginDto implements LoginRequest {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'Enter a valid staff email address.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(8, 128, { message: 'Password must contain between 8 and 128 characters.' })
  password!: string;
}
