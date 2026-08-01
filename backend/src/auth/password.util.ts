// Shared between ResetPasswordDto and ChangePasswordDto so both password-set
// entry points (email-link reset and OTP-verified first login) enforce the
// exact same rule — the frontend strength meter mirrors this list for live
// feedback, but this is the actual enforcement point.
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]).{8,16}$/;

export const PASSWORD_RULES_MESSAGE =
  "Password must be 8-16 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";
