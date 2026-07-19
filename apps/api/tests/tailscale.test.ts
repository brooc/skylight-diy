import { describe, expect, it } from "vitest";
import { parseTailscaleStatus } from "../src/routes/tailscale";

describe("Tailscale status", () => {
  it("exposes the login URL while the node needs authentication", () => {
    expect(
      parseTailscaleStatus({
        BackendState: "NeedsLogin",
        AuthURL: "https://login.tailscale.com/a/example",
        Self: { HostName: "daymark", DNSName: "", Online: false }
      })
    ).toEqual({
      available: true,
      state: "NeedsLogin",
      authUrl: "https://login.tailscale.com/a/example",
      hostname: "daymark",
      dnsName: null,
      httpsUrl: null,
      online: false
    });
  });

  it("returns the private HTTPS origin after authentication", () => {
    expect(
      parseTailscaleStatus({
        BackendState: "Running",
        AuthURL: "",
        Self: {
          HostName: "daymark",
          DNSName: "daymark.example.ts.net.",
          Online: true
        }
      })
    ).toMatchObject({
      state: "Running",
      authUrl: null,
      dnsName: "daymark.example.ts.net",
      httpsUrl: "https://daymark.example.ts.net",
      online: true
    });
  });

  it("does not expose an unexpected authentication URL", () => {
    expect(
      parseTailscaleStatus({
        BackendState: "NeedsLogin",
        AuthURL: "https://example.com/not-tailscale"
      }).authUrl
    ).toBeNull();
  });
});
