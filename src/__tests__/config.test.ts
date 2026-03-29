import { describe, it, expect } from "vitest";
import { migrateConfig, deriveInstanceName } from "../config.js";

describe("config migration", () => {
  it("migrates old {url, token} to new schema", () => {
    const oldConfig = { url: "https://kuma.example.com", token: "abc123" };
    const result = migrateConfig(oldConfig as Record<string, unknown>);
    expect(result.instances["kuma-example-com"]).toEqual({
      url: "https://kuma.example.com",
      token: "abc123",
    });
    expect(result.active).toEqual({ type: "instance", name: "kuma-example-com" });
  });

  it("is idempotent — already-migrated config unchanged", () => {
    const newConfig = {
      instances: { prod: { url: "https://kuma.example.com", token: "abc" } },
      clusters: {},
      active: { type: "instance" as const, name: "prod" },
    };
    const result = migrateConfig(newConfig as unknown as Record<string, unknown>);
    expect(result.instances).toEqual(newConfig.instances);
    expect(result.active).toEqual(newConfig.active);
  });

  it("handles empty config", () => {
    const result = migrateConfig({});
    expect(result.instances).toEqual({});
    expect(result.clusters).toEqual({});
    expect(result.active).toBeNull();
  });

  it("derives hostname correctly", () => {
    expect(deriveInstanceName("https://kuma.prod.example.com")).toBe("kuma-prod-example-com");
    expect(deriveInstanceName("https://192.168.1.1:3001")).toBe("192-168-1-1-3001");
    expect(deriveInstanceName("http://localhost:3001")).toBe("localhost-3001");
  });
});
