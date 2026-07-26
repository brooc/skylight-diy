export type GoogleBrokerReturn = {
  version: 1;
  completionState?: string;
  envelope?: unknown;
  error?: string;
  message?: string;
};

export function decodeGoogleBrokerReturn(
  hash: string,
): GoogleBrokerReturn | null {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  const encoded = parameters.get("daymark-google-oauth");
  if (!encoded) return null;
  try {
    const base64 = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(window.atob(base64), (character) =>
      character.charCodeAt(0),
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as GoogleBrokerReturn;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}
