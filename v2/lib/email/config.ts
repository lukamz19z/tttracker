import "server-only";

function required(name: string, value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(`Missing required email configuration: ${name}`);
  }

  return value.trim();
}

export function getEmailConfig() {
  const appUrl = required(
    "NEXT_PUBLIC_APP_URL",
    process.env.NEXT_PUBLIC_APP_URL,
  );

  return {
    appUrl,
    brandName:
      process.env.TTTRACKER_EMAIL_BRAND_NAME?.trim() ||
      "TTTracker",
    ownerName:
      process.env.TTTRACKER_EMAIL_OWNER_NAME?.trim() ||
      "LMZ Contracting",
    fromName:
      process.env.TTTRACKER_EMAIL_FROM_NAME?.trim() ||
      "TTTracker",
    fromAddress: required(
      "TTTRACKER_EMAIL_FROM_ADDRESS",
      process.env.TTTRACKER_EMAIL_FROM_ADDRESS,
    ),
    replyTo:
      process.env.TTTRACKER_EMAIL_REPLY_TO?.trim() ||
      undefined,
    supportEmail:
      process.env.TTTRACKER_SUPPORT_EMAIL?.trim() ||
      process.env.TTTRACKER_EMAIL_REPLY_TO?.trim() ||
      undefined,
  };
}

export function getEmailFrom() {
  const config = getEmailConfig();
  return `${config.fromName} <${config.fromAddress}>`;
}
