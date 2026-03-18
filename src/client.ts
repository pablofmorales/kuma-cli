import { io, Socket } from "socket.io-client";

export interface LoginResult {
  ok: boolean;
  token?: string;
  msg?: string;
}

export interface Monitor {
  id: number;
  name: string;
  type: string;
  url?: string;
  hostname?: string;
  port?: number;
  interval: number;
  active: boolean;
  uptime?: number;
  heartbeat?: {
    status: number;
    time: string;
    msg?: string;
    ping?: number;
  };
}

export interface Heartbeat {
  id: number;
  monitorID: number;
  status: number;
  time: string;
  msg?: string;
  ping?: number;
  duration?: number;
}

export interface StatusPage {
  id: number;
  title: string;
  slug: string;
  published: boolean;
  description?: string;
}

export class KumaClient {
  private socket: Socket;
  private url: string;

  constructor(url: string) {
    this.url = url;
    this.socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
    });
  }

  private waitFor<T>(event: string, timeoutMs = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);

      this.socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Connection timeout — is Kuma running?"));
      }, 10000);

      this.socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });

      this.socket.once("connect_error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Connection failed: ${err.message}`));
      });
    });
  }

  async login(username: string, password: string): Promise<LoginResult> {
    this.socket.emit("login", { username, password });
    const result = await this.waitFor<{
      ok: boolean;
      token?: string;
      msg?: string;
    }>("loginResult");
    return result;
  }

  async loginByToken(token: string): Promise<boolean> {
    this.socket.emit("loginByToken", token);
    const result = await this.waitFor<{ ok: boolean }>("loginResult");
    return result.ok;
  }

  async getMonitorList(): Promise<Record<string, Monitor>> {
    this.socket.emit("getMonitorList");
    return this.waitFor<Record<string, Monitor>>("monitorList");
  }

  async addMonitor(monitor: Partial<Monitor>): Promise<{ id: number }> {
    this.socket.emit("add", monitor);
    return this.waitFor<{ monitorID: number }>("monitorID").then((r) => ({
      id: r.monitorID,
    }));
  }

  async deleteMonitor(id: number): Promise<void> {
    this.socket.emit("deleteMonitor", id);
    await this.waitFor("deleteMonitorResult");
  }

  async pauseMonitor(id: number): Promise<void> {
    this.socket.emit("pauseMonitor", id);
    await this.waitFor("pauseMonitorResult");
  }

  async resumeMonitor(id: number): Promise<void> {
    this.socket.emit("resumeMonitor", id);
    await this.waitFor("resumeMonitorResult");
  }

  async getHeartbeatList(
    monitorId: number,
    period?: number
  ): Promise<Heartbeat[]> {
    this.socket.emit("getHeartbeatList", monitorId, period ?? 24);
    const result = await this.waitFor<{
      data: Heartbeat[];
    }>("heartbeatList");
    return result.data ?? [];
  }

  async getStatusPageList(): Promise<Record<string, StatusPage>> {
    this.socket.emit("getStatusPageList");
    return this.waitFor<Record<string, StatusPage>>("statusPageList");
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

export async function createAuthenticatedClient(
  url: string,
  token: string
): Promise<KumaClient> {
  const client = new KumaClient(url);
  await client.connect();
  const ok = await client.loginByToken(token);
  if (!ok) {
    client.disconnect();
    throw new Error("Session expired. Run `kuma login` again.");
  }
  return client;
}
