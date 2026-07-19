import { describe, expect, it } from "vitest";
import { findServeEnableUrl, parseTailscaleStatus } from "../src/routes/tailscale";

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
      online: false,
      serveState: "pending",
      serveEnableUrl: null
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

  it("extracts only the Tailscale Serve approval URL", () => {
    expect(
      findServeEnableUrl(
        "To enable, visit:\nhttps://login.tailscale.com/f/serve?node=example123\n"
      )
    ).toBe("https://login.tailscale.com/f/serve?node=example123");
    expect(findServeEnableUrl("https://example.com/f/serve?node=unsafe")).toBeNull();
  });
});
