export function securityReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/workspace";
  try {
    const url = new URL(value, "https://tttracker.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://tttracker.invalid" ||
      decoded.startsWith("//") ||
      /[\\\r\n]/.test(decoded) ||
      /^\/(security-check|login|api)(?:\/|$)/i.test(decoded)
    )
      return "/workspace";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/workspace";
  }
}

export function maskedSecurityEmail(email: string | null): string {
  if (!email) return "your registered email";
  const [local, domain] = email.split("@");
  return domain ? `${local.slice(0, 2)}***@${domain}` : "your registered email";
}
