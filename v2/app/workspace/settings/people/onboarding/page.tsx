import { redirect } from "next/navigation";

export default async function OnboardingSettings({ searchParams }: { searchParams: Promise<{ organisation?: string }> }) {
  const query = await searchParams;
  redirect(`/workspace/settings/people/onboarding/templates?organisation=${encodeURIComponent(query.organisation ?? "")}`);
}
