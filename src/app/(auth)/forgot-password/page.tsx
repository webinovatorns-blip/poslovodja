import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = { title: "Zaboravljena lozinka" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Zaboravljena lozinka"
      description="Unesite e-mail adresu naloga. Poslaćemo vam link za promenu lozinke."
    >
      <Suspense fallback={<LoadingState rows={1} />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
