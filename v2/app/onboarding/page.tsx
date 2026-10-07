import { Suspense } from "react";
import SetupAccountClient from "./setup-account-client";

export default function OnboardingPage() {
  const supportEmail =
    process.env.TTTRACKER_SUPPORT_EMAIL?.trim() ||
    process.env.TTTRACKER_EMAIL_REPLY_TO?.trim() ||
    null;
  return (
    <Suspense fallback={<p>Preparing account setup...</p>}>
      <SetupAccountClient supportEmail={supportEmail} />
    </Suspense>
  );
}
