"use client";

import { useEffect, useRef } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Last-resort boundary: a calm, accessible message instead of a blank page. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // The digest lets an operator find the server log entry; the message is never shown.
    console.error(JSON.stringify({ level: "error", event: "render_failed", digest: error.digest }));
    headingRef.current?.focus();
  }, [error]);

  return (
    <main className="container" role="alert">
      <h1 ref={headingRef} tabIndex={-1}>
        Something went wrong
      </h1>
      <p>We couldn&apos;t show this page. Your information was not saved or shared.</p>
      <button type="button" className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
