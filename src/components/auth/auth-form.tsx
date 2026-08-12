type AuthFormProps = { mode: "sign-in" | "sign-up" };

export function AuthForm({ mode }: AuthFormProps) {
  const label = mode === "sign-in" ? "Sign in" : "Create account";
  const action = mode === "sign-in" ? "/auth/sign-in" : "/auth/sign-up";

  return (
    <form action={action} className="auth-form" method="post">
      <label className="form-field">
        <span>Email address</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label className="form-field">
        <span>Password</span>
        <input
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>
      <button className="button button-primary auth-submit" type="submit">
        {label}
      </button>
    </form>
  );
}
