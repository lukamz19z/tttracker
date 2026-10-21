"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RetryIntegrationStatus() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="tt-button-secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Checking..." : "Retry"}</button>;
}
