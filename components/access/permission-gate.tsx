"use client";

import { Loader2 } from "lucide-react";
import { useAccess } from "@/components/access/access-provider";

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { loading, can } = useAccess();

  if (loading) {
    return (
      <div className="flex min-h-32 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
