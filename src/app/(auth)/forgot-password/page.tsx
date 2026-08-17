import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { error, message } = await searchParams;

  return (
    <div className="auth-card">
      <div>
        <p className="eyebrow">Account recovery</p>
        <h2>Reset your password</h2>
        <p className="auth-copy">
          Enter your account email and we will send you a secure reset link.
        </p>
      </div>
      {error ? (
        <p className="auth-message auth-message-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="auth-message" role="status">
          {message}
        </p>
      ) : null}
      <ForgotPasswordForm />
      <p className="auth-switch">
        Remembered your password? <Link href="/sign-in">Return to sign in</Link>.
      </p>
    </div>
  );
}
