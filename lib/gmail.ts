import { google } from "googleapis";
import { gmail_v1 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { getGoogleOAuth2Client } from "@/lib/google-auth";

const SENDER_EMAIL = "no-reply@surense.com";
const SUBJECT_PATTERN = "דוח מצב ביטוח ופנסיה";

export async function setupGmailWatch(profileId: string) {
  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: profile } = await admin.from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();

  if (!profile?.google_access_token) throw new Error("No Google token");

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decrypt(profile.google_access_token, key),
    refresh_token: profile.google_refresh_token ? decrypt(profile.google_refresh_token, key) : undefined,
  });

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

export async function processGmailNotification(historyId: string, profileEmail: string): Promise<DiscoveredReport[]> {
  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: profile } = await admin.from("profiles")
    .select("*")
    .eq("email", profileEmail)
    .single();

  if (!profile?.google_access_token) return [];

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decrypt(profile.google_access_token, key),
    refresh_token: profile.google_refresh_token ? decrypt(profile.google_refresh_token, key) : undefined,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId: historyId,
    historyTypes: ["messageAdded"],
  });

  const reports: DiscoveredReport[] = [];
  const messages = history.data.history?.flatMap((h) => h.messagesAdded || []) || [];

  for (const msg of messages) {
    if (!msg.message?.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.message.id,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";

    if (!from.includes(SENDER_EMAIL) || !subject.includes(SUBJECT_PATTERN)) continue;

    const body = extractBody(full.data.payload);
    const surenseLink = body?.match(/https:\/\/u\.surense\.com\/\S+/)?.[0];
    const recipientMatch = body?.match(/(\S+)\s+שלום/);
    const recipientName = recipientMatch?.[1];

    if (!surenseLink || !recipientName) continue;

    // Resolve the short URL to get the API endpoint
    const resolved = await fetch(surenseLink, { redirect: "manual" });
    const apiUrl = resolved.headers.get("location") || surenseLink;

    // Match recipient to a profile.
    // Filter `deleted_at is null` so archived family members don't soak up
    // incoming reports.
    // TODO: when supporting multiple households, also filter by household_id
    // (today the auth user's household is the only one — `profile` above is
    // already that household's self anchor).
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
