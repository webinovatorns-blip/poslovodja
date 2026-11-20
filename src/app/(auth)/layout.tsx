import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <Logo className="mb-8" />
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
