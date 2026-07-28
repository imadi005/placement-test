import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Placement Test Portal",
  description: "Weekly placement assessments for KJU students",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
