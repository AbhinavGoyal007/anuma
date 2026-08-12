export function ForgotPasswordForm() {
  return (
    <form action="/auth/forgot-password" className="auth-form" method="post">
      <label className="form-field">
        <span>Email address</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <button className="button button-primary auth-submit" type="submit">
        Send reset link
      </button>
    </form>
  );
}
