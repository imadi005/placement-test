import { IsString, MinLength } from "class-validator";

export class LoginDto {
  // Accepts either a roll number (students) or an email (staff/admin) — the
  // AuthService resolves whichever was entered against the right table.
  @IsString()
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
