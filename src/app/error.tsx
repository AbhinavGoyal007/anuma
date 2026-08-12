"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="error-page">
        <main className="error-card">
          <p className="eyebrow">ANUMA</p>
          <h1>Something interrupted this view.</h1>
          <p>
            Please try again. If the issue persists, use the correlation details in the server logs.
          </p>
          <button className="button button-primary" onClick={reset} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
