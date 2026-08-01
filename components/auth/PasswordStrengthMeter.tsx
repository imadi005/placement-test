// Mirrors backend/src/auth/password.util.ts's PASSWORD_REGEX rule-by-rule —
// this is just live feedback, the backend DTO validation is what actually
// enforces it, so a mismatch here would only ever be a UX annoyance, never
// a security gap.
const SPECIAL_CHARS = /[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/;

interface Rule {
  label: string;
  test: (password: string) => boolean;
}

const RULES: Rule[] = [
  { label: "8-16 characters", test: (p) => p.length >= 8 && p.length <= 16 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /\d/.test(p) },
  { label: "One special character", test: (p) => SPECIAL_CHARS.test(p) },
];

export function passwordMeetsRules(password: string): boolean {
  return RULES.every((rule) => rule.test(password));
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const metCount = RULES.filter((rule) => rule.test(password)).length;
  const pct = (metCount / RULES.length) * 100;
  const barColor =
    metCount === RULES.length ? "bg-secondary" : metCount >= 3 ? "bg-tertiary" : "bg-error";

  return (
    <div className="animate-fade-in">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-body-sm transition-colors ${
                met ? "text-secondary" : "text-on-surface-variant"
              }`}
            >
              <span aria-hidden>{met ? "✓" : "○"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
