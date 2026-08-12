import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { error } = await searchParams;

  return (
    <div className="auth-card">
      <div>
        <p className="eyebrow">Account recovery</p>
        <h2>Choose a new password</h2>
        <p className="auth-copy">Set a new password for your confirmed ANUMA account.</p>
      </div>
      {error ? (
        <p className="auth-message auth-message-error" role="alert">
          {error}
        </p>
      ) : null}
      <ResetPasswordForm />
      <p className="auth-switch">
        Need a new link? <Link href="/forgot-password">Request another reset</Link>.
      </p>
    </div>
  );
}
