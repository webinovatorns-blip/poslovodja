import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { LoadingState } from "@/components/shared/loading-state";
import { routes } from "@/config/navigation";
import { authMessages } from "@/lib/auth/messages";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova lozinka" };

/** The recovery link (via /auth/callback) creates a session; without one the link was invalid. */
async function ResetPasswordGate() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="space-y-4">
        <FormAlert variant="error">{authMessages.resetLinkInvalid}</FormAlert>
        <p className="text-center text-sm">
          <Link
            href={routes.forgotPassword}
            className="font-medium text-primary hover:underline"
          >
            Zatraži novi link
          </Link>
        </p>
      </div>
    );
  }

  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Nova lozinka" description="Izaberite novu lozinku za svoj nalog.">
      <Suspense fallback={<LoadingState rows={2} />}>
        <ResetPasswordGate />
      </Suspense>
    </AuthCard>
  );
}
