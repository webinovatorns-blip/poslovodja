import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Registracija" };

export default function RegisterPage() {
  return (
    <AuthCard title="Registracija" description="Napravite nalog za svoju firmu.">
      <RegisterForm />
    </AuthCard>
  );
}
