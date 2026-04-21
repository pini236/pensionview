import { google } from "googleapis";
import { gmail_v1 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedOAuth2Client } from "@/lib/google-auth";

// Production trigger sender — Surense's no-reply address.
const SENDER_EMAIL = "no-reply@surense.com";
const SUBJECT_PATTERN = "דוח מצב ביטוח ופנסיה";

// Optional comma-separated list of additional senders that may trigger the
// import flow. Used for end-to-end testing without spoofing: forward a real
// Surense email to yourself, set this env var to your own address, and the
// webhook treats the forwarded message the same as the original.
//
// TODO(multi-agency): when we onboard a second insurance provider, replace
// this env-driven test hook with a per-household trigger registry that pairs
// each sender with its own URL pattern + download contract + body parser.
// Until then, only forwarded Surense emails work — the body parsing below
// still hardcodes Surense's URL and greeting format.
const ADDITIONAL_SENDERS = (process.env.GMAIL_TRIGGER_TEST_SENDERS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isTriggerSender(from: string): boolean {
  const lower = from.toLowerCase();
  if (lower.includes(SENDER_EMAIL)) return true;
  return ADDITIONAL_SENDERS.some((s) => lower.includes(s));
}

export async function setupGmailWatch(profileId: string) {
  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: profile } = await admin.from("profiles")
    .select("id, google_access_token, google_refresh_token, google_token_expiry")
    .eq("id", profileId)
    .single();

  if (!profile?.google_access_token) throw new Error("No Google token");

  const oauth2Client = getAuthedOAuth2Client(
    {
      id: profile.id as string,
      google_access_token: profile.google_access_token as string,
      google_refresh_token: (profile.google_refresh_token as string | null) ?? null,
      google_token_expiry: (profile.google_token_expiry as string | null) ?? null,
    },
    admin,
    key
  );

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.GOOGLE_PUBSUB_TOPIC!,
      labelIds: ["INBOX"],
    },
  });

  return response.data;
}

interface DiscoveredReport {
  profileId: string;
  downloadUrl: string;
  reportDate: string;
}

// Strip ILIKE wildcards (`%`, `_`) and the escape char (`\`) from
// untrusted input. The recipient name is parsed from the email body so
// without sanitizing, a crafted greeting could match arbitrary profiles in
// the household (e.g. `%` matches everything → wrong-profile assignment,
// or worse, a deliberate match against an admin's profile).
//
// TODO: replace ILIKE with a stable `email_recipient_token` column so we
// can do exact lookups instead of fuzzy substring matching.
function sanitizeIlikeTerm(input: string): string {
  return input.replace(/[\\%_]/g, "").trim();
}

export async function processGmailNotification(_historyId: string, profileEmail: string): Promise<DiscoveredReport[]> {
  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: profile } = await admin.from("profiles")
    .select("id, google_access_token, google_refresh_token, google_token_expiry")
    .eq("email", profileEmail)
    .single();

  if (!profile?.google_access_token) return [];

  const oauth2Client = getAuthedOAuth2Client(
    {
      id: profile.id as string,
      google_access_token: profile.google_access_token as string,
      google_refresh_token: (profile.google_refresh_token as string | null) ?? null,
      google_token_expiry: (profile.google_token_expiry as string | null) ?? null,
    },
    admin,
    key
  );

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // We deliberately ignore the historyId from the Pub/Sub notification.
  // gmail.users.history.list({ startHistoryId }) returns records strictly
  // AFTER the given historyId, but the notification's historyId IS the
  // latest event — so listing returns zero. Using it correctly would
  // require persisting a per-profile last-seen historyId. Scanning recent
  // INBOX directly is simpler and idempotent: the (profile_id, report_date)
  // unique index plus ignoreDuplicates makes re-processing a no-op. The
  // 1-day window catches anything missed during outages without
  // re-scanning forever.
  const list = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    q: "newer_than:1d",
    maxResults: 20,
  });

  const reports: DiscoveredReport[] = [];
  const messageIds = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);

  for (const msgId of messageIds) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msgId,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";

    if (!isTriggerSender(from) || !subject.includes(SUBJECT_PATTERN)) continue;

    const body = extractBody(full.data.payload);
    const surenseLink = body?.match(/https:\/\/u\.surense\.com\/\S+/)?.[0];
    // Capture the FULL name on the greeting line, not just the last word.
    // Surense's greeting is on its own line in the format "{first} {last} שלום"
    // (sometimes with a trailing comma). A simpler `(\S+)\s+שלום` matches
    // only the last token (= surname), which then matches multiple
    // household members via ilike and silently drops the import — single()
    // returns no row when there are 2+ matches.
    const recipientMatch = body?.match(/^(.+?)[,.\s]+שלום/m);
    const rawRecipientName = recipientMatch?.[1];

    if (!surenseLink || !rawRecipientName) continue;

    const recipientName = sanitizeIlikeTerm(rawRecipientName);
    if (!recipientName) continue; // entirely wildcard chars — refuse to match

    // Resolve the short URL to get the API endpoint
    const resolved = await fetch(surenseLink, { redirect: "manual" });
    const apiUrl = resolved.headers.get("location") || surenseLink;

    // Match recipient to a profile.
    // Filter `deleted_at is null` so archived family members don't soak up
    // incoming reports.
    // TODO: when supporting multiple households, also filter by household_id
    // (today the auth user's household is the only one — `profile` above is
    // already that household's self anchor).
    // TODO (defense in depth): after the PDF page-1 extract step, compare
    // the extracted `client_name` against `recipientName`; if they don't
    // match, mark the report `failed` with error "recipient mismatch".
    const { data: matchedProfile } = await admin.from("profiles")
      .select("id")
      .ilike("name", `%${recipientName}%`)
      .is("deleted_at", null)
      .single();

    if (matchedProfile) {
      // Extract report date from subject (DD/MM/YYYY -> YYYY-MM-DD)
      const dateMatch = subject.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const reportDate = dateMatch
        ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
        : new Date().toISOString().slice(0, 10);

      reports.push({
        profileId: matchedProfile.id,
        downloadUrl: apiUrl,
        reportDate,
      });
    }
  }

  return reports;
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!payload) return null;
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  return null;
}
