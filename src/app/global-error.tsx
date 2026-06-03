"use client";

/**
 * Required client error boundary — avoids Turbopack RSC manifest glitches on crashes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col items-center justify-center gap-4 bg-black text-white p-6 font-sans">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-neutral-400 max-w-md text-center">
          {error.message || "The app hit an unexpected error."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
