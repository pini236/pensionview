import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";

export function getGoogleOAuth2Client() {
  return new google.auth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });
}

export function getGoogleAuthUrl(): string {
  const client = getGoogleOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

export async function getGoogleTokens(code: string) {
  const client = getGoogleOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function refreshGoogleToken(refreshToken: string) {
  const client = getGoogleOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return credentials;
}

export interface ProfileWithGoogleAuth {
  id: string;
  google_access_token: string;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
}

/**
 * Builds an authenticated OAuth2 client for a profile and wires up automatic
 * refresh-token persistence. Any token refresh that googleapis triggers during
 * an API call is captured via the 'tokens' event and persisted back to the
 * profile row (encrypted).
 *
 * Pass the SAME admin client used by the caller — keeps connection pool tidy
 * and avoids creating ad-hoc clients inside the event handler.
 */
export function getAuthedOAuth2Client(
  profile: ProfileWithGoogleAuth,
  admin: ReturnType<typeof createAdminClient>,
  encryptionKey: string
): OAuth2Client {
  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decrypt(profile.google_access_token, encryptionKey),
    refresh_token: profile.google_refresh_token
      ? decrypt(profile.google_refresh_token, encryptionKey)
      : undefined,
    expiry_date: profile.google_token_expiry
      ? new Date(profile.google_token_expiry).getTime()
      : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    // googleapis-node emits new access_tokens after refresh. Persist back
    // to the profile so the next pipeline run starts with a fresh token.
    // refresh_token is only included on the FIRST exchange, not on refreshes —
    // don't overwrite it with undefined.
    if (!tokens.access_token) return;

    const update: Record<string, string | null> = {
      google_access_token: encrypt(tokens.access_token, encryptionKey),
    };
    if (tokens.expiry_date) {
      update.google_token_expiry = new Date(tokens.expiry_date).toISOString();
    }

    // Fire-and-forget — we cannot await inside the event listener and we
    // don't want a refresh-persist failure to block the API call that
    // triggered the refresh. Errors are logged for observability.
    admin
      .from("profiles")
      .update(update)
      .eq("id", profile.id)
      .then((res) => {
        if (res.error) {
          console.error("Failed to persist refreshed Google token:", res.error);
        }
      });
  });

  return oauth2Client;
}
