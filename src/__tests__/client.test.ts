import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// Hoist mock factories before any imports
const { mockEmit, mockOn, mockOnce, mockDisconnect, mockIo } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockOn: vi.fn(),
  mockOnce: vi.fn(),
  mockDisconnect: vi.fn(),
  mockIo: vi.fn(),
}));

// Mock socket.io-client — io() returns our mock socket
vi.mock("socket.io-client", () => ({
  io: mockIo,
}));

import { KumaClient } from "../client.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Return a minimal socket stub
  mockIo.mockReturnValue({
    on: mockOn,
    once: mockOnce,
    emit: mockEmit,
    disconnect: mockDisconnect,
    io: { opts: { reconnection: false } },
  });
});

describe("KumaClient.addMonitor", () => {
  it("sends accepted_statuscodes as an array, not a string", () => {
    const client = new KumaClient("http://dummy:3000");

    // Call addMonitor (it will try to connect, but the mock socket won't actually connect)
    // The method returns a promise that times out after 10s, so we catch the rejection.
    // We're only testing the synchronous part: payload construction before emit.
    client.addMonitor({
      name: "test",
      type: "http",
      url: "http://example.com",
      interval: 60,
    });

    // Verify the "add" event was emitted with the correct payload
    expect(mockEmit).toHaveBeenCalled();
    const emitCall = mockEmit.mock.calls.find((call: unknown[]) => call[0] === "add");
    expect(emitCall).toBeDefined();
    const payload: Record<string, unknown> = emitCall![1] as Record<string, unknown>;

    // accepted_statuscodes must be an array
    expect(Array.isArray(payload.accepted_statuscodes)).toBe(true);

    // Must contain expected status range
    expect(payload.accepted_statuscodes).toContain("200-299");

    // Must NOT use the DB column name (pre-stringified form)
    expect(payload).not.toHaveProperty("accepted_statuscodes_json");
  });
});
