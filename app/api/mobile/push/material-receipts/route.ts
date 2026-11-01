import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);
    const { data: rows, error } = await service
      .from("material_push_delivery_attempts")
      .select("id,expo_ticket_id,expo_token_hash,push_payload,retry_count,source_event_id,event_type,user_id")
      .eq("user_id", identity.userId)
      .eq("delivery_status", "ticket_accepted")
      .not("expo_ticket_id", "is", null)
      .limit(100);
    if (error) throw new Error(`Material push receipt lookup failed: ${error.message}`);
    if (!rows?.length) return NextResponse.json({ checked: 0, delivered: 0, retryable: 0 });

    const ticketIds = rows.map((row) => row.expo_ticket_id).filter(Boolean);
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: ticketIds }),
    });
    const result = await response.json().catch(() => null) as {
      data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>;
      errors?: Array<{ message?: string }>;
    } | null;
    if (!response.ok || !result?.data) {
      console.warn("Material Expo receipts temporarily unavailable", { status: response.status, message: result?.errors?.[0]?.message });
      return NextResponse.json({ checked: 0, delivered: 0, retryable: 0, deferred: true });
    }

    let delivered = 0;
    let retryable = 0;
    for (const row of rows) {
      const receipt = row.expo_ticket_id ? result.data[row.expo_ticket_id] : undefined;
      if (!receipt) continue; // Expo receipts can take time to appear.
      if (receipt.status === "ok") {
        const { error: updateError } = await service.from("material_push_delivery_attempts")
          .update({ delivery_status: "delivered", receipt_checked_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
        if (updateError) console.error("Could not save material push receipt", { sourceEventId: row.source_event_id, error: updateError.message });
        else delivered++;
        continue;
      }
      const reason = receipt.details?.error || receipt.message || "Expo receipt reported a delivery failure.";
      if (receipt.details?.error === "DeviceNotRegistered") {
        const { data: tokens } = await service.from("user_push_tokens").select("expo_push_token").eq("user_id", identity.userId).eq("active", true);
        const staleToken = tokens?.find((token) => createHash("sha256").update(token.expo_push_token).digest("hex") === row.expo_token_hash);
        if (staleToken) await service.from("user_push_tokens").update({ active: false }).eq("user_id", identity.userId).eq("expo_push_token", staleToken.expo_push_token);
      }
      if (receipt.details?.error !== "DeviceNotRegistered" && (row.retry_count || 0) < 2 && row.push_payload) {
        const { data: tokens } = await service.from("user_push_tokens").select("expo_push_token").eq("user_id", identity.userId).eq("active", true);
        const retryToken = tokens?.find((token) => createHash("sha256").update(token.expo_push_token).digest("hex") === row.expo_token_hash);
        if (retryToken) {
          const retryResponse = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ to: retryToken.expo_push_token, ...row.push_payload }),
          });
          const retryResult = await retryResponse.json().catch(() => null) as { data?: { id?: string; status?: string; message?: string; details?: { error?: string } } } | null;
          const retryTicket = retryResult?.data;
          if (retryResponse.ok && retryTicket?.status === "ok" && retryTicket.id) {
            const { error: retrySaveError } = await service.from("material_push_delivery_attempts").update({
              delivery_status: "ticket_accepted", expo_ticket_id: retryTicket.id,
              retry_count: (row.retry_count || 0) + 1, attempted_at: new Date().toISOString(),
              receipt_checked_at: null, last_error: reason,
            }).eq("id", row.id);
            if (retrySaveError) console.error("Could not save retried material push ticket", { sourceEventId: row.source_event_id, error: retrySaveError.message });
            else { console.info("Material push retry accepted by Expo", { sourceEventId: row.source_event_id, eventType: row.event_type, retry: (row.retry_count || 0) + 1 }); retryable++; continue; }
          }
        }
      }
      // Releasing this channel claim permits a later canonical retry while the
      // separately deduplicated Notification Centre row remains untouched.
      const { error: deleteError } = await service.from("material_push_delivery_attempts").delete().eq("id", row.id);
      if (deleteError) console.error("Could not release failed material push claim", { sourceEventId: row.source_event_id, error: deleteError.message });
      console.warn("Material Expo receipt reported failure", { sourceEventId: row.source_event_id, eventType: row.event_type, reason });
      retryable++;
    }
    return NextResponse.json({ checked: rows.length, delivered, retryable });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
