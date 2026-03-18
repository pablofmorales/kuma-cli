import Conf from "conf";

interface KumaConfig {
  url: string;
  token: string;
}

const conf = new Conf<KumaConfig>({
  projectName: "kuma-cli",
  schema: {
    url: { type: "string" },
    token: { type: "string" },
  },
});

export function getConfig(): KumaConfig | null {
  const url = conf.get("url");
  const token = conf.get("token");
  if (!url || !token) return null;
  return { url, token };
}

export function saveConfig(config: KumaConfig): void {
  conf.set("url", config.url);
  conf.set("token", config.token);
}

export function clearConfig(): void {
  conf.clear();
}

export function getConfigPath(): string {
  return conf.path;
}
