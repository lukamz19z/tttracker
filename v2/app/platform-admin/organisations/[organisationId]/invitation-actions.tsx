"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  invitationId: string;
  disabled?: boolean;
};

export default function InvitationActions({
  invitationId,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/platform/invitations/${encodeURIComponent(invitationId)}/resend`,
        {
          method: "POST",
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not resend invitation.");
      }

      setMessage("Sent");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Send failed",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      {message ? (
        <span
          style={{
            color:
              message === "Sent"
                ? "#86efac"
                : "#fecaca",
            fontSize: 12,
          }}
        >
          {message}
        </span>
      ) : null}

      <button
        type="button"
        className="tt-button"
        disabled={disabled || sending}
        onClick={() => void resend()}
      >
        {sending ? "Sending..." : "Resend"}
      </button>
    </div>
  );
}
