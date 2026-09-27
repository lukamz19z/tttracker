import { NextResponse } from "next/server";

import {
  platformErrorResponse,
  requirePlatformAdmin,
} from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requirePlatformAdmin();

    const supabase = createSupabaseAdmin();

    const { data: versions, error: versionsError } =
      await supabase
        .from("v2_subscription_plan_versions")
        .select(`
          id,
          plan_id,
          version,
          status,
          v2_subscription_plans (
            plan_key,
            name,
            description,
            status,
            sort_order
          )
        `)
        .eq("status", "active");

    if (versionsError) {
      return NextResponse.json(
        { error: versionsError.message },
        { status: 500 },
      );
    }

    const planVersionIds = (versions ?? []).map(
      (row) => row.id,
    );

    const entitlementCounts = new Map<string, number>();

    if (planVersionIds.length > 0) {
      const { data: entitlements, error: entitlementError } =
        await supabase
          .from("v2_subscription_plan_entitlements")
          .select("plan_version_id")
          .in("plan_version_id", planVersionIds);

      if (entitlementError) {
        return NextResponse.json(
          { error: entitlementError.message },
          { status: 500 },
        );
      }

      for (const entitlement of entitlements ?? []) {
        entitlementCounts.set(
          entitlement.plan_version_id,
          (entitlementCounts.get(
            entitlement.plan_version_id,
          ) ?? 0) + 1,
        );
      }
    }

    const plans = (versions ?? [])
      .map((row) => {
        const plan = Array.isArray(
          row.v2_subscription_plans,
        )
          ? row.v2_subscription_plans[0]
          : row.v2_subscription_plans;

        return {
          planId: row.plan_id,
          planKey: plan?.plan_key ?? "",
          planName: plan?.name ?? "",
          planVersionId: row.id,
          version: row.version,
          description: plan?.description ?? null,
          entitlementCount:
            entitlementCounts.get(row.id) ?? 0,
          sortOrder: plan?.sort_order ?? 999,
          planStatus: plan?.status ?? "archived",
        };
      })
      .filter(
        (plan) =>
          plan.planKey && plan.planStatus === "active",
      )
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.version - b.version,
      )
      .map(({ sortOrder: _sortOrder, planStatus: _planStatus, ...plan }) => plan);

    return NextResponse.json({ plans });
  } catch (error) {
    const mapped = platformErrorResponse(error);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
    });
  }
}
