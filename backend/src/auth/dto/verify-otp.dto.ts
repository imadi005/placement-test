import { IsString, Length } from "class-validator";

export class VerifyOtpDto {
  // Same roll-number-or-email identifier as login/forgot-password.
  @IsString()
  identifier!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}
