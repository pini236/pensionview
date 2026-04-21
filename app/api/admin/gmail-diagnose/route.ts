// =============================================================================
// PensionView — Gmail import diagnostic
//   GET /api/admin/gmail-diagnose
//
// Walks the caller's last 5 INBOX messages through the same filters that
// processGmailNotification applies, then returns a per-message breakdown of
// which filters passed/failed and what was parsed. Used to debug why
// forwarded test emails ack with 200 but never insert a row.
// =============================================================================

import { NextResponse } from "next/server";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedOAuth2Client } from "@/lib/google-auth";

const SENDER_EMAIL = "no-reply@surense.com";
const SUBJECT_PATTERN = "דוח מצב ביטוח ופנסיה";
const ADDITIONAL_SENDERS = (process.env.GMAIL_TRIGGER_TEST_SENDERS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isTriggerSender(from: string): boolean {
  const lower = from.toLowerCase();
  if (lower.includes(SENDER_EMAIL)) return true;
  return ADDITIONAL_SENDERS.some((s) => lower.includes(s));
}

function sanitizeIlikeTerm(input: string): string {
  return input.replace(/[\\%_]/g, "").trim();
}

interface BodyPart {
  mimeType: string;
  size: number;
  preview: string;
}

function collectBodyParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
  out: BodyPart[]
): void {
  if (!payload) return;
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    out.push({
      mimeType: payload.mimeType ?? "unknown",
      size: decoded.length,
      preview: decoded.slice(0, 400),
    });
  }
  if (payload.parts) {
    for (const part of payload.parts) collectBodyParts(part, out);
  }
}

function firstBody(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!payload) return null;
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = firstBody(part);
      if (result) return result;
    }
  }
  return null;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: self } = await admin
    .from("profiles")
    .select("id, email, google_access_token, google_refresh_token, google_token_expiry")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self?.google_access_token) {
    return NextResponse.json(
      { error: "No google token on self profile" },
      { status: 400 }
    );
  }

  const oauth2Client = getAuthedOAuth2Client(
    {
      id: self.id as string,
      google_access_token: self.google_access_token as string,
      google_refresh_token: (self.google_refresh_token as string | null) ?? null,
      google_token_expiry: (self.google_token_expiry as string | null) ?? null,
    },
    admin,
    key
  );

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Last 5 INBOX messages — typically includes any recent forwards.
  const list = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    maxResults: 5,
  });

  const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

  const breakdown = await Promise.all(
    ids.map(async (id) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      const headers = full.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";

      const passSender = isTriggerSender(from);
      const passSubject = subject.includes(SUBJECT_PATTERN);

      const allParts: BodyPart[] = [];
      collectBodyParts(full.data.payload, allParts);

      const body = firstBody(full.data.payload);
      const surenseLink = body?.match(/https:\/\/u\.surense\.com\/\S+/)?.[0] ?? null;
      // Mirror the regex in lib/gmail.ts so the diagnostic stays accurate.
      const recipientMatch = body?.match(/^(.+?)[,.\s]+שלום/m);
      const rawRecipientName = recipientMatch?.[1] ?? null;
      const cleanRecipientName = rawRecipientName
        ? sanitizeIlikeTerm(rawRecipientName)
        : null;

      let matchedProfileName: string | null = null;
      if (cleanRecipientName) {
        const { data: matched } = await admin
          .from("profiles")
          .select("id, name")
          .ilike("name", `%${cleanRecipientName}%`)
          .is("deleted_at", null)
          .maybeSingle();
        matchedProfileName = (matched?.name as string | null) ?? null;
      }

      return {
        id,
        from,
        subject,
        filters: {
          passSender,
          passSubject,
          hasBody: body !== null,
          bodyLength: body?.length ?? 0,
          surenseLink,
          rawRecipientName,
          cleanRecipientName,
          matchedProfileName,
        },
        wouldImport:
          passSender &&
          passSubject &&
          !!surenseLink &&
          !!cleanRecipientName &&
          !!matchedProfileName,
        bodyParts: allParts.map((p) => ({
          mimeType: p.mimeType,
          size: p.size,
          // Strip preview to first 200 chars for the response payload
          preview: p.preview.slice(0, 200),
        })),
      };
    })
  );

  return NextResponse.json(
    {
      ok: true,
      profileId: self.id,
      additionalSenders: ADDITIONAL_SENDERS,
      messages: breakdown,
    },
    { status: 200 }
  );
}
