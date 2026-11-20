"use client";

import { ErrorState } from "@/components/shared/error-state";
import { isAuthUnavailableError, isMembershipsUnavailableError } from "@/lib/auth/errors";
import { authMessages } from "@/lib/auth/messages";

/**
 * Root error boundary. Catches errors thrown by route-group layouts and
 * pages, notably the app-area guard (src/app/(app)/layout.tsx) and the
 * onboarding gates, which throw MembershipsUnavailableError when the user's
 * memberships can't be read (including a Supabase request timeout), and the
 * DAL, which throws AuthUnavailableError when Supabase Auth can't be
 * reached. Only fixed messages are shown; `error.message`
 * is never rendered. "Pokušaj ponovo" re-runs the failed server render.
 */
export default function RootError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const membershipsUnavailable = isMembershipsUnavailableError(error);
  const authUnavailable = isAuthUnavailableError(error);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <ErrorState
        className="w-full"
        title={
          membershipsUnavailable || authUnavailable
            ? "Podaci trenutno nisu dostupni"
            : undefined
        }
        description={
          membershipsUnavailable
            ? authMessages.organizationsUnavailable
            : authUnavailable
              ? authMessages.authUnavailable
              : undefined
        }
        onRetry={() => retry()}
      />
    </main>
  );
}
