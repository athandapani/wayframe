import { Resend } from "resend";
import { requireEnv } from "@/lib/server/env-guard";

// wayframe#t37's email-invite delivery. `from` defaults to Resend's own
// sandbox sender (works with no verified domain, so this is real delivery
// from day one, not a stub) — once there's a real verified sending domain,
// set RESEND_FROM_EMAIL to override it. Deliberately no template engine or
// styling beyond a one-liner + link: the invite email itself isn't part of
// this ticket's design surface.
const DEFAULT_FROM = "Wayframe <onboarding@resend.dev>";

/**
 * Sends the invite email. Throws (doesn't swallow) if `requireEnv` finds no
 * RESEND_API_KEY configured, or if Resend's own `emails.send` call returns a
 * truthy `error` field (Resend's SDK reports delivery failures this way
 * rather than by throwing) — the caller (the invites route) is responsible
 * for catching this and deciding not to fail the whole request over it,
 * since the invite row itself must stay durable regardless of whether the
 * email actually went out.
 */
export async function sendInviteEmail(to: string, inviteUrl: string, role: "editor" | "viewer"): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  const roleLabel = role === "editor" ? "edit" : "view";
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "You've been invited to a Wayframe Roadmap",
    html: `<p>You've been invited to ${roleLabel} a Wayframe Roadmap.</p><p><a href="${inviteUrl}">Open the Roadmap</a></p>`,
  });

  if (error) {
    throw new Error(`Resend failed to send invite email: ${error.message ?? String(error)}`);
  }
}
