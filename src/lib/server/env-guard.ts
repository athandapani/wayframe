// Server-only environment guard (Archer delta B-stream — "backend
// foundation") — consolidates the pattern src/lib/smartsheet/client.ts's
// tokenOrThrow() already established for ANTHROPIC_API_KEY/
// SMARTSHEET_API_TOKEN alike: a missing var throws a message naming *which*
// variable is absent, never the value of any configured one. Both existing
// API routes (extract, correct, smartsheet) already fail closed with a
// typed JSON error via their own try/catch — this doesn't change that
// behavior, it just gives every server module one shared way to ask
// "is X configured" instead of each hand-rolling its own check.
export function hasEnv(name: string): boolean {
  return !!process.env[name];
}

/** Throws a typed error naming the missing variable — never echoes a configured value. Callers already run inside a try/catch that turns this into a graceful JSON error response. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}
