import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ANUMA | Frontline Interaction Intelligence",
    template: "%s | ANUMA",
  },
  description: "Evidence-backed intelligence for high-value frontline customer interactions.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
