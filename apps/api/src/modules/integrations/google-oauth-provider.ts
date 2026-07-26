import { env } from "../../env";

export type GoogleOauthMode = "broker" | "direct";

export function getGoogleOauthMode(): GoogleOauthMode | null {
  if (env.GOOGLE_OAUTH_BROKER_URL) {
    return "broker";
  }
  if (
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REDIRECT_URI
  ) {
    return "direct";
  }
  return null;
}

export function googleBrokerEndpoint(pathname: string): URL {
  if (!env.GOOGLE_OAUTH_BROKER_URL) {
    throw new Error("Google OAuth broker is not configured.");
  }
  return new URL(
    pathname,
    `${env.GOOGLE_OAUTH_BROKER_URL.replace(/\/$/, "")}/`,
  );
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<Response | null> {
  const mode = getGoogleOauthMode();
  if (mode === "broker") {
    return fetch(googleBrokerEndpoint("/v1/google/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  }
  if (mode === "direct") {
    return fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID as string,
        client_secret: env.GOOGLE_CLIENT_SECRET as string,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  }
  return null;
}
