import { describe, it, expect, vi } from "vitest";

const emit = vi.fn();

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({ on: vi.fn(), once: vi.fn(), emit })),
}));

import { io } from "socket.io-client";
import { KumaClient, buildBasicAuthHeaders } from "../client.js";

const ioMock = vi.mocked(io);

describe("KumaClient.addMonitor", () => {
  it("sends accepted_statuscodes as an array (Kuma's add handler calls .every on it)", async () => {
    emit.mockImplementation((_event, _payload, cb) => cb({ ok: true, monitorID: 42 }));
    const client = new KumaClient("https://kuma.example.com");

    const result = await client.addMonitor({ name: "X", type: "http", url: "https://example.com", interval: 60 });

    expect(result.id).toBe(42);
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe("add");
    expect(payload.accepted_statuscodes).toEqual(["200-299"]);
    expect(payload).not.toHaveProperty("accepted_statuscodes_json");
  });
});

describe("buildBasicAuthHeaders", () => {
  it("returns undefined when no user is provided", () => {
    expect(buildBasicAuthHeaders()).toBeUndefined();
    expect(buildBasicAuthHeaders(undefined, "secret")).toBeUndefined();
  });

  it("returns an Authorization header with base64-encoded user:pass", () => {
    const expected = Buffer.from("admin:s3cret").toString("base64");
    expect(buildBasicAuthHeaders("admin", "s3cret")).toEqual({
      Authorization: `Basic ${expected}`,
    });
  });

  it("encodes an empty password when only the user is provided", () => {
    const expected = Buffer.from("admin:").toString("base64");
    expect(buildBasicAuthHeaders("admin")).toEqual({
      Authorization: `Basic ${expected}`,
    });
  });
});

describe("KumaClient extraHeaders", () => {
  it("passes extraHeaders through to the socket.io handshake options", () => {
    const headers = { Authorization: "Basic dXNlcjpwYXNz" };
    new KumaClient("https://kuma.example.com", headers);
    expect(ioMock).toHaveBeenCalledWith(
      "https://kuma.example.com",
      expect.objectContaining({ extraHeaders: headers })
    );
  });
});
