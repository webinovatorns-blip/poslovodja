import { AppShell } from "@/components/layout/app-shell";
import { placeholderSession } from "@/config/site";

// TODO(auth phase): load the session and company here and redirect
// unauthenticated users to /login. Until then the shell shows placeholders.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      companyName={placeholderSession.companyName}
      userName={placeholderSession.userName}
      userEmail={placeholderSession.userEmail || undefined}
    >
      {children}
    </AppShell>
  );
}
