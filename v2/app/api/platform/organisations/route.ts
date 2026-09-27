import { NextRequest, NextResponse } from "next/server";

import {
  platformErrorResponse,
  requirePlatformAdmin,
} from "@/lib/platform/server";
import { sendOrganisationInvitation } from "@/lib/invitations/organisation-invite";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function firstRelation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    const supabase = createSupabaseAdmin();

    const { data: organisations, error } = await supabase
      .from("organisations")
      .select("id, code, name, legal_name, abn, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const result = await Promise.all(
      (organisations ?? []).map(async (organisation) => {
        const [
          { count: userCount },
          { count: projectCount },
          { data: subscription },
        ] = await Promise.all([
          supabase
            .from("organisation_users")
            .select("*", { count: "exact", head: true })
            .eq("organisation_id", organisation.id)
            .neq("status", "removed"),

          supabase
            .from("v2_projects")
            .select("*", { count: "exact", head: true })
            .eq("organisation_id", organisation.id)
            .neq("status", "archived"),

          supabase
            .from("v2_organisation_subscriptions")
            .select(`
              status,
              starts_at,
              v2_subscription_plan_versions (
                version,
                v2_subscription_plans (
                  plan_key,
                  name
                )
              )
            `)
            .eq("organisation_id", organisation.id)
            .in("status", ["trial", "active"])
            .order("starts_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const versionRow = firstRelation(
          subscription?.v2_subscription_plan_versions,
        );

        const planRow = versionRow
          ? firstRelation(versionRow.v2_subscription_plans)
          : null;

        return {
          id: organisation.id,
          code: organisation.code,
          name: organisation.name,
          legalName: organisation.legal_name,
          abn: organisation.abn,
          status: organisation.status,
          createdAt: organisation.created_at,
          userCount: userCount ?? 0,
          projectCount: projectCount ?? 0,
          planKey: planRow?.plan_key ?? null,
          planName: planRow?.name ?? null,
          planVersion: versionRow?.version ?? null,
          subscriptionStatus: subscription?.status ?? null,
        };
      }),
    );

    return NextResponse.json({ organisations: result });
  } catch (error) {
    const mapped = platformErrorResponse(error);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const platformAdmin = await requirePlatformAdmin([
      "owner",
      "admin",
    ]);

    const supabase = createSupabaseAdmin();
    const body = await request.json();

    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const legalName =
      String(body.legalName ?? "").trim() || null;
    const abn =
      String(body.abn ?? "").trim() || null;
    const initialAdminEmail = String(
      body.initialAdminEmail ?? "",
    )
      .trim()
      .toLowerCase();
    const planVersionId = String(
      body.planVersionId ?? "",
    ).trim();

    if (
      !code ||
      !name ||
      !initialAdminEmail ||
      !planVersionId
    ) {
      return NextResponse.json(
        {
          error:
            "code, name, initialAdminEmail and planVersionId are required.",
        },
        { status: 400 },
      );
    }

    const { data: planVersion, error: planError } =
      await supabase
        .from("v2_subscription_plan_versions")
        .select(`
          id,
          version,
          status,
          v2_subscription_plans (
            plan_key,
            name,
            status
          ),
          v2_subscription_plan_entitlements (
            enabled,
            value,
            v2_features (
              feature_key,
              feature_type,
              lifecycle_status
            )
          )
        `)
        .eq("id", planVersionId)
        .eq("status", "active")
        .maybeSingle();

    if (planError || !planVersion) {
      return NextResponse.json(
        {
          error:
            planError?.message ??
            "Selected subscription plan version is not active.",
        },
        { status: 400 },
      );
    }

    const selectedPlan = firstRelation(
      planVersion.v2_subscription_plans,
    );

    if (
      !selectedPlan ||
      selectedPlan.status !== "active"
    ) {
      return NextResponse.json(
        {
          error: "Selected subscription plan is not active.",
        },
        { status: 400 },
      );
    }

    const { data: organisation, error: organisationError } =
      await supabase
        .from("organisations")
        .insert({
          code,
          name,
          legal_name: legalName,
          abn,
          status: "active",
          created_by: platformAdmin.userId,
        })
        .select("id, code, name")
        .single();

    if (organisationError || !organisation) {
      return NextResponse.json(
        {
          error:
            organisationError?.message ??
            "Could not create organisation.",
        },
        { status: 400 },
      );
    }

    try {
      const { error: subscriptionError } = await supabase
        .from("v2_organisation_subscriptions")
        .insert({
          organisation_id: organisation.id,
          plan_version_id: planVersionId,
          status: "active",
          billing_cycle: "manual",
          starts_at: new Date().toISOString(),
          created_by: platformAdmin.userId,
        });

      if (subscriptionError) {
        throw subscriptionError;
      }

      const entitlementRows = Array.isArray(
        planVersion.v2_subscription_plan_entitlements,
      )
        ? planVersion.v2_subscription_plan_entitlements
        : [];

      const enabledModules = entitlementRows
        .filter((entitlement) => {
          const feature = firstRelation(
            entitlement.v2_features,
          );

          return (
            entitlement.enabled === true &&
            feature?.feature_type === "module" &&
            feature.lifecycle_status !== "disabled"
          );
        })
        .map((entitlement) => {
          const feature = firstRelation(
            entitlement.v2_features,
          );

          return feature?.feature_key ?? null;
        })
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        );

      if (enabledModules.length > 0) {
        const { error: moduleError } = await supabase
          .from("organisation_modules")
          .insert(
            enabledModules.map((moduleKey) => ({
              organisation_id: organisation.id,
              module_key: moduleKey,
              enabled: true,
              updated_by: platformAdmin.userId,
            })),
          );

        if (moduleError) {
          throw moduleError;
        }
      }

      const { data: invitation, error: invitationError } =
        await supabase
          .from("v2_organisation_invitations")
          .insert({
            organisation_id: organisation.id,
            email: initialAdminEmail,
            intended_role_code: "admin",
            invitation_type: "initial_admin",
            status: "pending",
            invited_by: platformAdmin.userId,
          })
          .select("id")
          .single();

      if (invitationError || !invitation) {
        throw (
          invitationError ??
          new Error("Could not create organisation invitation.")
        );
      }

      await sendOrganisationInvitation({
        invitationId: invitation.id,
        attemptedBy: platformAdmin.userId,
      });

      return NextResponse.json(
        {
          organisation,
          subscription: {
            planKey: selectedPlan.plan_key,
            planName: selectedPlan.name,
            version: planVersion.version,
          },
          invitationId: invitation.id,
        },
        { status: 201 },
      );
    } catch (setupError) {
      // We intentionally keep a failed invitation record when possible,
      // because its delivery history is useful for diagnosing/resending.
      // For failures before the invitation exists, remove the incomplete tenant.
      const message =
        setupError instanceof Error
          ? setupError.message
          : "Organisation setup failed.";

      return NextResponse.json(
        {
          error: message,
          organisationId: organisation.id,
          recoverable: true,
        },
        { status: 400 },
      );
    }
  } catch (error) {
    const mapped = platformErrorResponse(error);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
    });
  }
}
