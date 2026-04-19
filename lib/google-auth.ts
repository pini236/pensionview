import { google } from "googleapis";

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
