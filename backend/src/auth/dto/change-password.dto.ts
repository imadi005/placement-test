import { IsString, Matches } from "class-validator";
import { PASSWORD_REGEX, PASSWORD_RULES_MESSAGE } from "../password.util";

export class ChangePasswordDto {
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULES_MESSAGE })
  newPassword!: string;
}
