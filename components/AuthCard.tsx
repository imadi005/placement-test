import { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

// Shared shell for the four unauthenticated/forced-step screens (login,
// forgot/reset password, forced first-change) — same branding header,
// centered card, and entrance animation everywhere so they read as one
// consistent flow instead of four separately-styled pages.
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm animate-fade-in-up shadow-soft-ink-lg">
        <div className="mb-8 text-center">
          <p className="text-label-caps text-primary">Placement Test Portal</p>
          <h1 className="mt-3 font-serif text-headline-md text-on-surface">{title}</h1>
          {subtitle && <p className="mt-1 text-body-sm text-on-surface-variant">{subtitle}</p>}
        </div>

        {children}

        {footer}
      </Card>
    </main>
  );
}
