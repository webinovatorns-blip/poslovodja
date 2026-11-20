import { routes } from "@/config/navigation";

import { authMessages } from "./messages";

/**
 * Response for /auth/callback when Supabase Auth didn't answer in time.
 *
 * It's served IN PLACE (no redirect) on purpose: "Pokušaj ponovo" is a link
 * to the current URL (`href=""`), so the browser simply repeats the callback
 * with the same one-time code. The code is never written into the page, a
 * link or a log, and `Referrer-Policy: no-referrer` keeps the URL from
 * leaking onward. A route handler can't render the React app shell, so this
 * is a small self-contained page using the app's colors.
 */
export function callbackUnavailableResponse(): Response {
  const html = `<!doctype html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Prijava trenutno nije dostupna | Poslovođa</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 1rem; background: oklch(0.985 0.003 250); color: oklch(0.21 0.03 262);
    font-family: ui-sans-serif, system-ui, sans-serif; }
  main { width: 100%; max-width: 28rem; }
  .card { border: 1px solid oklch(0.91 0.01 255); border-radius: 0.75rem; background: #fff;
    padding: 2.5rem 1.5rem; text-align: center; }
  h1 { font-size: 1.125rem; margin: 0 0 0.5rem; }
  p { margin: 0 0 1.5rem; color: oklch(0.5 0.025 260); line-height: 1.5; }
  .actions { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
  .primary { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem;
    padding: 0 1.25rem; border-radius: 0.625rem; background: oklch(0.32 0.09 262); color: #fff;
    font-weight: 600; text-decoration: none; }
  .secondary { color: oklch(0.32 0.09 262); font-size: 0.875rem; min-height: 2.5rem;
    display: inline-flex; align-items: center; }
</style>
</head>
<body>
<main>
  <div class="card" role="alert">
    <h1>Prijava trenutno nije dostupna</h1>
    <p>${authMessages.callbackUnavailable}</p>
    <div class="actions">
      <a class="primary" href="">Pokušaj ponovo</a>
      <a class="secondary" href="${routes.login}">Nazad na prijavu</a>
    </div>
  </div>
</main>
</body>
</html>
`;

  return new Response(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Retry-After": "5",
    },
  });
}
