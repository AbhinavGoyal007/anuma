export function ResetPasswordForm() {
  return (
    <form action="/auth/reset-password" className="auth-form" method="post">
      <label className="form-field">
        <span>New password</span>
        <input autoComplete="new-password" minLength={8} name="password" required type="password" />
      </label>
      <label className="form-field">
        <span>Confirm new password</span>
        <input
          autoComplete="new-password"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </label>
      <button className="button button-primary auth-submit" type="submit">
        Set new password
      </button>
    </form>
  );
}
