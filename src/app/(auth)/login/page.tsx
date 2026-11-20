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

export const metadata: Metadata = { title: "Prijava" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Prijava</h1>
        </CardTitle>
        <CardDescription>Prijavite se na svoj nalog.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="rounded-md bg-muted p-4 text-muted-foreground">
          Prijava će uskoro biti dostupna.
        </p>
        <p className="text-muted-foreground">
          Nemate nalog?{" "}
          <Link
            href={routes.register}
            className="font-medium text-primary hover:underline"
          >
            Registrujte se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
