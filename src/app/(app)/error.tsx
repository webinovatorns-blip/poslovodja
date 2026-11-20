"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState onRetry={() => retry()} />;
}
