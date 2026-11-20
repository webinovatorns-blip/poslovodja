import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routes } from "@/config/navigation";

export const metadata: Metadata = { title: "Registracija" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Registracija</h1>
        </CardTitle>
        <CardDescription>Napravite nalog za svoju firmu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="rounded-md bg-muted p-4 text-muted-foreground">
          Registracija će uskoro biti dostupna.
        </p>
        <p className="text-muted-foreground">
          Već imate nalog?{" "}
          <Link href={routes.login} className="font-medium text-primary hover:underline">
            Prijavite se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
