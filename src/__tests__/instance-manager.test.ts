import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveInstanceName, resolveClient } from "../instance-manager.js";

vi.mock("../config.js", () => ({
  getInstanceConfig: vi.fn(),
  getClusterConfig: vi.fn(),
  getActiveContext: vi.fn(),
  getAllInstances: vi.fn(),
}));

vi.mock("../client.js", async () => {
  const actual = await vi.importActual<typeof import("../client.js")>("../client.js");
  return { ...actual, createAuthenticatedClient: vi.fn() };
});

import { getInstanceConfig, getClusterConfig, getActiveContext, getAllInstances } from "../config.js";
import { createAuthenticatedClient, type KumaClient } from "../client.js";

const mockGetInstanceConfig = vi.mocked(getInstanceConfig);
const mockGetClusterConfig = vi.mocked(getClusterConfig);
const mockGetActiveContext = vi.mocked(getActiveContext);
const mockGetAllInstances = vi.mocked(getAllInstances);
const mockCreateAuthenticatedClient = vi.mocked(createAuthenticatedClient);

describe("resolveInstanceName", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns --instance flag when provided", () => {
    mockGetInstanceConfig.mockReturnValue({ url: "https://kuma.example.com", token: "abc" });
    expect(resolveInstanceName({ instance: "production" })).toBe("production");
  });

  it("throws if --instance references unknown instance", () => {
    mockGetInstanceConfig.mockReturnValue(null);
    expect(() => resolveInstanceName({ instance: "unknown" })).toThrow("not found");
  });

  it("returns cluster primary when --cluster provided", () => {
    mockGetClusterConfig.mockReturnValue({ instances: ["prod", "staging"], primary: "prod" });
    expect(resolveInstanceName({ cluster: "prod-ha" })).toBe("prod");
  });

  it("returns active instance from context", () => {
    mockGetActiveContext.mockReturnValue({ type: "instance", name: "staging" });
    mockGetInstanceConfig.mockReturnValue({ url: "https://staging.example.com", token: "def" });
    expect(resolveInstanceName({})).toBe("staging");
  });

  it("returns sole instance when only one exists", () => {
    mockGetActiveContext.mockReturnValue(null);
    mockGetAllInstances.mockReturnValue({ onlyone: { url: "https://kuma.example.com", token: "abc" } });
    expect(resolveInstanceName({})).toBe("onlyone");
  });

  it("throws when no context and multiple instances", () => {
    mockGetActiveContext.mockReturnValue(null);
    mockGetAllInstances.mockReturnValue({
      a: { url: "https://a.com", token: "1" },
      b: { url: "https://b.com", token: "2" },
    });
    expect(() => resolveInstanceName({})).toThrow("No active instance");
  });

  it("throws when no instances configured", () => {
    mockGetActiveContext.mockReturnValue(null);
    mockGetAllInstances.mockReturnValue({});
    expect(() => resolveInstanceName({})).toThrow("No instances configured");
  });
});

describe("resolveClient", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("passes the instance's stored basic-auth credentials as headers", async () => {
    mockGetInstanceConfig.mockReturnValue({
      url: "https://kuma.example.com",
      token: "tok123",
      basicAuthUser: "admin",
      basicAuthPass: "s3cret",
    });
    const fakeClient = { disconnect: vi.fn() } as unknown as KumaClient;
    mockCreateAuthenticatedClient.mockResolvedValue(fakeClient);

    const { client, instanceName } = await resolveClient({ instance: "prod" });

    const expected = Buffer.from("admin:s3cret").toString("base64");
    expect(mockCreateAuthenticatedClient).toHaveBeenCalledWith(
      "https://kuma.example.com",
      "tok123",
      { Authorization: `Basic ${expected}` }
    );
    expect(client).toBe(fakeClient);
    expect(instanceName).toBe("prod");
  });

  it("passes undefined headers when the instance has no basic-auth credentials", async () => {
    mockGetInstanceConfig.mockReturnValue({ url: "https://kuma.example.com", token: "tok123" });
    mockCreateAuthenticatedClient.mockResolvedValue({} as unknown as KumaClient);

    await resolveClient({ instance: "prod" });

    expect(mockCreateAuthenticatedClient).toHaveBeenCalledWith(
      "https://kuma.example.com",
      "tok123",
      undefined
    );
  });
});
