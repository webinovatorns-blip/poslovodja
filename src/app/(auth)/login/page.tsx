import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { LoadingState } from "@/components/shared/loading-state";

export const metadata: Metadata = { title: "Prijava" };

export default function LoginPage() {
  return (
    <AuthCard title="Prijava" description="Prijavite se na svoj nalog.">
      {/* LoginForm reads ?next= and ?error= (request-time data). */}
      <Suspense fallback={<LoadingState rows={2} />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
