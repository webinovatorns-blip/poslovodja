"use server";

import { redirect } from "next/navigation";

import { routes } from "@/config/navigation";
import { fieldErrorsOf, type ActionResult } from "@/lib/auth/action-result";
import { isUuid } from "@/lib/auth/active-organization";
import { setActiveOrganizationCookie } from "@/lib/auth/cookies";
import { organizationErrorMessage } from "@/lib/auth/errors";
import { authMessages } from "@/lib/auth/messages";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { listActiveMemberships, requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onboardingSchema, type OnboardingInput } from "@/lib/validations/onboarding";

/**
 * Onboarding: creates the organization through the controlled RPC
 * create_organization_with_details() (atomic, idempotent, caller = owner).
 * There is no direct INSERT anywhere in the app.
 */
export async function createOrganizationAction(
  input: OnboardingInput,
): Promise<ActionResult> {
  await requireUser();

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const values = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: organizationId, error } = await supabase.rpc(
    "create_organization_with_details",
    {
      p_idempotency_key: values.idempotencyKey,
      p_name: values.name,
      p_business_type: values.businessType,
      p_country_code: values.countryCode,
      p_currency: values.currency,
      p_timezone: values.timezone,
      p_phone: values.phone,
      p_email: values.email,
      p_tax_id: values.taxId,
      p_registration_number: values.registrationNumber,
      p_address: values.address,
      p_city: values.city,
      p_postal_code: values.postalCode,
    },
  );

  if (error || !isUuid(organizationId)) {
    return { ok: false, message: organizationErrorMessage(error) };
  }

  await setActiveOrganizationCookie(organizationId);
  redirect(routes.dashboard);
}

/**
 * Switches the active organization. The id is verified against the user's
 * ACTIVE memberships (loaded through RLS) before it's stored; the cookie
 * remains a preference that every request re-validates.
 */
export async function switchOrganizationAction(
  organizationId: string,
  next?: string,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!isUuid(organizationId)) {
    return { ok: false, message: authMessages.organizationAccessDenied };
  }

  const supabase = await createSupabaseServerClient();
  const result = await listActiveMemberships(supabase, user.id);
  if (!result.ok) {
    // Unknown, not denied: don't claim the user has no access.
    return { ok: false, message: authMessages.membershipsUnavailable };
  }
  const membership = result.memberships.find(
    (item) => item.organizationId === organizationId.toLowerCase(),
  );
  if (!membership) {
    return { ok: false, message: authMessages.organizationAccessDenied };
  }

  await setActiveOrganizationCookie(membership.organizationId);
  redirect(safeRedirectPath(next, routes.dashboard));
}
