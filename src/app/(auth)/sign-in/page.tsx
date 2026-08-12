import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";

type SignInPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error, message } = await searchParams;

  return (
    <div className="auth-card">
      <div>
        <p className="eyebrow">Account access</p>
        <h2>Sign in to ANUMA</h2>
        <p className="auth-copy">Sign in to continue to your organization.</p>
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
      <AuthForm mode="sign-in" />
      <p className="auth-switch">
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
      <p className="auth-switch">
        New to ANUMA? <Link href="/sign-up">Create an account</Link>.
      </p>
    </div>
  );
}
