import { describe, it, expect } from "vitest";
import { migrateConfig, deriveInstanceName, getConfigDir, migrateConfigPath } from "../config.js";
import * as os from "os";
import * as path from "path";

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

  it("migrates when instances is empty but legacy keys exist", () => {
    const config = { instances: {}, url: "https://kuma.example.com", token: "abc123" };
    const result = migrateConfig(config as Record<string, unknown>);
    expect(result.instances["kuma-example-com"]).toEqual({
      url: "https://kuma.example.com",
      token: "abc123",
    });
    expect(result.active).toEqual({ type: "instance", name: "kuma-example-com" });
  });

  it("derives hostname correctly", () => {
    expect(deriveInstanceName("https://kuma.prod.example.com")).toBe("kuma-prod-example-com");
    expect(deriveInstanceName("https://192.168.1.1:3001")).toBe("192-168-1-1-3001");
    expect(deriveInstanceName("http://localhost:3001")).toBe("localhost-3001");
  });
});

describe("config path", () => {
  it("respects XDG_CONFIG_HOME on non-Windows platforms", () => {
    if (process.platform === "win32") return;

    const originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/tmp/custom-config";
    try {
      const dir = getConfigDir();
      expect(dir).toBe(path.join("/tmp/custom-config", "kuma-cli"));
    } finally {
      process.env.XDG_CONFIG_HOME = originalXdg;
    }
  });

  it("returns default path if XDG_CONFIG_HOME is not set", () => {
    if (process.platform === "win32") return;

    const originalXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    try {
      const dir = getConfigDir();
      expect(dir).toBe(path.join(os.homedir(), ".config", "kuma-cli"));
    } finally {
      process.env.XDG_CONFIG_HOME = originalXdg;
    }
  });

  it("uses APPDATA on Windows", () => {
    if (process.platform !== "win32") return;

    const originalAppdata = process.env.APPDATA;
    process.env.APPDATA = "C:\\Users\\Test\\AppData\\Roaming";
    try {
      const dir = getConfigDir();
      expect(dir).toBe(path.join("C:\\Users\\Test\\AppData\\Roaming", "kuma-cli"));
    } finally {
      process.env.APPDATA = originalAppdata;
    }
  });
});

describe("config path migration", () => {
  it("returns old config data when old path exists and new path does not", () => {
    // migrateConfigPath is a pure function:
    //   (oldPath: string | null, newPath: string | null) => { source: "old" | "new" | "none", data: object | null }
    const oldData = { instances: { prod: { url: "https://kuma.example.com", token: "abc" } }, clusters: {}, active: null };
    const result = migrateConfigPath(JSON.stringify(oldData), null);
    expect(result.source).toBe("old");
    expect(result.data).toEqual(oldData);
  });

  it("returns new config data when new path exists", () => {
    const newData = { instances: { staging: { url: "https://staging.example.com", token: "def" } }, clusters: {}, active: null };
    const result = migrateConfigPath(null, JSON.stringify(newData));
    expect(result.source).toBe("new");
    expect(result.data).toEqual(newData);
  });

  it("prefers new path over old path", () => {
    const oldData = { instances: { old: { url: "https://old.example.com", token: "old" } }, clusters: {}, active: null };
    const newData = { instances: { new: { url: "https://new.example.com", token: "new" } }, clusters: {}, active: null };
    const result = migrateConfigPath(JSON.stringify(oldData), JSON.stringify(newData));
    expect(result.source).toBe("new");
    expect(result.data).toEqual(newData);
  });

  it("returns none when neither path has data", () => {
    const result = migrateConfigPath(null, null);
    expect(result.source).toBe("none");
    expect(result.data).toBeNull();
  });
});
