import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  request.headers.delete("x-tttracker-project-list");
  if (request.nextUrl.pathname === "/workspace/projects") request.headers.set("x-tttracker-project-list", "true");
  request.headers.delete("x-tttracker-project-id");
  request.headers.delete("x-tttracker-organisation-id");
  const match = request.nextUrl.pathname.match(/^\/workspace\/projects\/([0-9a-f-]{36})(?:\/|$)/i);
  if (match) {
    request.headers.set("x-tttracker-project-id", match[1]);

  }
  const organisation = request.nextUrl.searchParams.get("organisation");
  if (organisation) request.headers.set("x-tttracker-organisation-id", organisation);
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
