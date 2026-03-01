import { describe, expect, it, vi } from "vitest";

const gatewayClientState = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  simulateConnectError: null as string | null,
}));

class MockGatewayClient {
  private readonly opts: Record<string, unknown>;

  constructor(opts: Record<string, unknown>) {
    this.opts = opts;
    gatewayClientState.options = opts;
  }

  start(): void {
    if (gatewayClientState.simulateConnectError) {
      // Simulate a connect error (e.g. ECONNREFUSED)
      const onConnectError = this.opts.onConnectError;
      if (typeof onConnectError === "function") {
        onConnectError(new Error(gatewayClientState.simulateConnectError));
      }
      return;
    }
    void Promise.resolve()
      .then(async () => {
        const onHelloOk = this.opts.onHelloOk;
        if (typeof onHelloOk === "function") {
          await onHelloOk();
        }
      })
      .catch(() => {});
  }

  stop(): void {}

  async request(method: string): Promise<unknown> {
    if (method === "system-presence") {
      return [];
    }
    return {};
  }
}

vi.mock("./client.js", () => ({
  GatewayClient: MockGatewayClient,
}));

const { probeGateway } = await import("./probe.js");

describe("probeGateway", () => {
  it("connects with operator.read scope", async () => {
    gatewayClientState.simulateConnectError = null;
    const result = await probeGateway({
      url: "ws://127.0.0.1:18789",
      auth: { token: "secret" },
      timeoutMs: 1_000,
    });

    expect(gatewayClientState.options?.scopes).toEqual(["operator.read"]);
    expect(result.ok).toBe(true);
  });

  it("returns 'not running' for ECONNREFUSED errors", async () => {
    gatewayClientState.simulateConnectError = "connect ECONNREFUSED 127.0.0.1:18789";
    const result = await probeGateway({
      url: "ws://127.0.0.1:18789",
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not running");
  });

  it("returns full error for non-ECONNREFUSED connect errors", async () => {
    gatewayClientState.simulateConnectError = "connect ETIMEDOUT 10.0.0.1:18789";
    const result = await probeGateway({
      url: "ws://127.0.0.1:18789",
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("connect failed:");
    expect(result.error).toContain("ETIMEDOUT");
  });
});
