// PROTOTYPE wiring — throwaway, wayframe#23. Dev-only: `next dev` shows the
// entry-page input-surface prototype (?variant=a|b|c) in place of the
// splash below; `next build`/production and the vitest run (NODE_ENV=test)
// are untouched.
import { EntryInputPrototype } from "./_prototype-entry-input";

export default function Home() {
  if (process.env.NODE_ENV === "development") {
    return <EntryInputPrototype />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Wayframe
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        A generic, point-at-any-program roadmap visualization tool. Pre-implementation scaffold —
        the roadmap UI lands next.
      </p>
    </div>
  );
}
