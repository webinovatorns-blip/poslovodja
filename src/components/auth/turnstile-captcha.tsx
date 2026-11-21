"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileCaptchaProps = {
  siteKey: string;
  onTokenChange: (token: string | undefined) => void;
  resetKey: unknown;
};

/**
 * Cloudflare Turnstile loaded directly from Cloudflare's documented script.
 * The response token is short-lived and is sent only to the matching
 * Supabase Auth call. It is never logged or persisted by the app.
 */
export function TurnstileCaptcha({
  siteKey,
  onTokenChange,
  resetKey,
}: TurnstileCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const clearToken = useCallback(() => onTokenChangeRef.current(undefined), []);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "auto",
      callback: (token) => onTokenChangeRef.current(token),
      "expired-callback": clearToken,
      "error-callback": clearToken,
    });
  }, [clearToken, siteKey]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [renderWidget]);

  useEffect(() => {
    if (resetKey === null || !widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    clearToken();
  }, [clearToken, resetKey]);

  return (
    <div className="space-y-2">
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} className="min-h-16 overflow-hidden" />
      <p className="text-xs text-muted-foreground">
        Bezbednosna provera štiti obrazac od automatskih prijava.
      </p>
    </div>
  );
}
