import Link from "next/link";

export default function NotFound() {
  return (
    <main className="error-page">
      <section className="error-card">
        <p className="eyebrow">ANUMA</p>
        <h1>This page is not available.</h1>
        <p>Return to your ANUMA workspace to continue.</p>
        <Link className="button button-primary" href="/conversations">
          Go to Conversations
        </Link>
      </section>
    </main>
  );
}
