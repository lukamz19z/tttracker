
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    kind: string;
    id: string;
  }>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { kind: rawKind, id: rawId } =
    await context.params;

  const kind =
    rawKind === "invoice"
      ? "invoice"
      : rawKind === "expense"
        ? "expense"
        : null;

  const id = safeId(rawId);

  if (!kind || !id) {
    return new Response("Invalid TTTracker approval link.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const mobilePath =
    kind === "invoice"
      ? `approvals/invoices/${encodeURIComponent(id)}`
      : `approvals/expenses/${encodeURIComponent(id)}`;

  const fallbackPath =
    kind === "invoice"
      ? `/expenses/invoices?open=${encodeURIComponent(id)}`
      : `/expenses/claims?open=${encodeURIComponent(id)}`;

  const origin = new URL(request.url).origin;
  const fallbackUrl = `${origin}${fallbackPath}`;

  // TTTracker already declares `scheme: "tttracker"` in the Expo config.
  const deepLink = `tttracker://${mobilePath}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Open TTTracker</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;display:grid;min-height:100vh;place-items:center}
    main{width:min(92vw,440px);background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:28px;box-shadow:0 12px 36px rgba(15,23,42,.08)}
    h1{margin:0 0 8px;font-size:24px}p{color:#64748b;line-height:1.5}
    a{display:block;text-align:center;text-decoration:none;border-radius:12px;padding:13px 16px;font-weight:700;margin-top:12px}
    .app{background:#0f172a;color:#fff}.web{border:1px solid #cbd5e1;color:#334155}
  </style>
</head>
<body>
  <main>
    <h1>Opening TTTracker…</h1>
    <p>We’ll open this approval in the TTTracker app. If the app is unavailable, the website will open automatically.</p>
    <a class="app" href="${escapeHtml(deepLink)}">Open TTTracker app</a>
    <a class="web" href="${escapeHtml(fallbackUrl)}">Continue on website</a>
  </main>
  <script>
    (function () {
      var fallbackTimer = window.setTimeout(function () {
        window.location.replace(${JSON.stringify(fallbackUrl)});
      }, 1600);

      function cancelFallback() {
        if (document.hidden) {
          window.clearTimeout(fallbackTimer);
        }
      }

      document.addEventListener("visibilitychange", cancelFallback);
      window.location.href = ${JSON.stringify(deepLink)};
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
