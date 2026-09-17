import { describe, it, expect, vi } from "vitest";

const emit = vi.fn();

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({ on: vi.fn(), once: vi.fn(), emit })),
}));

import { KumaClient } from "../client.js";

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
