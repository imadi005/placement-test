import { IsString } from "class-validator";

export class ForgotPasswordDto {
  // Roll number (students) or email (staff/admin) — same resolution as login.
  @IsString()
  identifier!: string;
}
