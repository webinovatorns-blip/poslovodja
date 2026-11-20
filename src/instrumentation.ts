/**
 * Runs once when the Next.js server starts.
 * In development, reports missing or misconfigured environment variables by
 * NAME (never value) so problems are visible before a Supabase call fails.
 * It only warns: pages that don't use Supabase keep working without config.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportEnvProblems } = await import("@/lib/env-report");
  reportEnvProblems();
}
