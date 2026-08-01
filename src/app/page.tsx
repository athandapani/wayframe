export default function Home() {
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
