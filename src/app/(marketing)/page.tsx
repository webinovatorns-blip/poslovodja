import { ArrowRight, Briefcase, FileText, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/navigation";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — upravljanje poslovima za majstore` },
};

const features = [
  {
    icon: Users,
    title: "Klijenti",
    description: "Kontakti, adrese i istorija saradnje na jednom mestu.",
  },
  {
    icon: Briefcase,
    title: "Poslovi",
    description: "Pratite svaki posao od dogovora do naplate.",
  },
  {
    icon: FileText,
    title: "Ponude",
    description: "Brzo napravite i pošaljite ponudu klijentu.",
  },
  {
    icon: Wallet,
    title: "Zarada po poslu",
    description: "Troškovi, uplate i stvarna zarada za svaki posao.",
  },
];

export default function MarketingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-8">
          <Logo />
          <Button asChild variant="ghost">
            <Link href={routes.login}>Prijava</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-primary md:text-5xl">
              Vaš posao, pod kontrolom.
            </h1>
            <p className="text-lg text-muted-foreground">{siteConfig.description}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="highlight">
                <Link href={routes.register}>
                  Započnite besplatno
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={routes.login}>Već imam nalog</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t bg-card">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="space-y-2">
                <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground md:px-8">
          © {siteConfig.name}
        </div>
      </footer>
    </div>
  );
}
