import Link from "next/link";
import type { ReactNode } from "react";

import { EvidenceExplainer } from "@/components/auth/evidence-explainer";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="auth-layout">
      <header className="auth-brandbar">
        <Link className="wordmark" href="/sign-in">
          ANUMA
        </Link>
        <p>Frontline Interaction Intelligence</p>
      </header>
      <section className="auth-composition">
        <div className="auth-message-block">
          <p className="eyebrow">Frontline interaction intelligence</p>
          <h1>Every customer conversation holds a business signal.</h1>
          <p>
            ANUMA turns frontline interactions into structured, evidence-backed intelligence —
            revealing what customers need, what happened in the interaction, and what happens next.
          </p>
          <EvidenceExplainer />
        </div>
        <section className="auth-panel">{children}</section>
      </section>
    </main>
  );
}
