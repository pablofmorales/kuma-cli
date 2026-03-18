import { io, Socket } from "socket.io-client";

export interface LoginResult {
  ok: boolean;
  token?: string;
  msg?: string;
}

export interface MonitorTag {
  id: number;
  name: string;
  color: string;
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
  tags?: MonitorTag[];
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
  // Kuma pushes heartbeatList and uptime events immediately on connect (before
  // getMonitorList is called), so we buffer them for later use.
  private heartbeatCache: Record<number, Heartbeat> = {};
  private uptimeCache: Record<string, number> = {};

  constructor(url: string) {
    this.url = url;
    this.socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
    });

    // Buffer heartbeatList events from the moment the socket is created
    this.socket.on(
      "heartbeatList",
      (monitorId: number, data: Heartbeat[]) => {
        if (Array.isArray(data) && data.length > 0) {
          this.heartbeatCache[monitorId] = data[data.length - 1];
        }
      }
    );

    // Buffer uptime events (24h period used for the list view)
    this.socket.on(
      "uptime",
      (monitorId: number, period: string, value: number) => {
        this.uptimeCache[`${monitorId}_${period}`] = value;
      }
    );
  }

  /**
   * Wait for a server-pushed event (not a callback response).
   * Used for events the server pushes after authentication (monitorList, etc.).
   */
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

  // BUG-01 fix: use Socket.IO acknowledgement callbacks instead of waitFor()
  async login(username: string, password: string): Promise<LoginResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Login timeout")),
        10000
      );
      this.socket.emit(
        "login",
        { username, password },
        (result: LoginResult) => {
          clearTimeout(timer);
          resolve(result);
        }
      );
    });
  }

  // BUG-01 fix: loginByToken also uses callback pattern
  async loginByToken(token: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Login timeout")),
        10000
      );
      this.socket.emit("loginByToken", token, (result: { ok: boolean }) => {
        clearTimeout(timer);
        resolve(result.ok);
      });
    });
  }

  async getMonitorList(): Promise<Record<string, Monitor>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("getMonitorList timeout")),
        10000
      );

      // Register monitorList listener BEFORE emitting the request.
      // The server responds via a "monitorList" push event (not a callback ack).
      this.socket.once("monitorList", (data: Record<string, Monitor>) => {
        clearTimeout(timer);
        // Merge buffered heartbeat + uptime data (captured since connect)
        for (const [idStr, monitor] of Object.entries(data)) {
          const id = Number(idStr);
          const hb = this.heartbeatCache[id];
          if (hb) monitor.heartbeat = hb;
          const up24 = this.uptimeCache[`${id}_24`];
          if (up24 !== undefined) monitor.uptime = up24;
        }
        resolve(data);
      });

      this.socket.emit("getMonitorList");
    });
  }

  // BUG-01 fix: addMonitor uses callback, not a separate event
  // BUG-03 fix: include required fields accepted_statuscodes, maxretries, retryInterval
  async addMonitor(monitor: Partial<Monitor>): Promise<{ id: number }> {
    const payload = {
      accepted_statuscodes: ["200-299"],
      maxretries: 1,
      retryInterval: 60,
      ...monitor,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Add monitor timeout")),
        10000
      );
      this.socket.emit(
        "add",
        payload,
        (result: { ok: boolean; monitorID?: number; msg?: string }) => {
          clearTimeout(timer);
          // BUG-04 pattern: check result.ok
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to add monitor"));
            return;
          }
          resolve({ id: result.monitorID! });
        }
      );
    });
  }

  // BUG-01 fix: editMonitor uses callback pattern (consistent with all other mutations)
  // BUG-04 fix: check result.ok and throw on failure
  async editMonitor(id: number, monitor: Partial<Monitor>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Edit monitor timeout")),
        10000
      );
      this.socket.emit(
        "editMonitor",
        { ...monitor, id },
        (result: { ok: boolean; msg?: string }) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Operation failed"));
            return;
          }
          resolve();
        }
      );
    });
  }

  // BUG-01 fix: deleteMonitor uses callback
  // BUG-04 fix: check result.ok and throw on failure
  async deleteMonitor(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Delete monitor timeout")),
        10000
      );
      this.socket.emit(
        "deleteMonitor",
        id,
        (result: { ok: boolean; msg?: string }) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Operation failed"));
            return;
          }
          resolve();
        }
      );
    });
  }

  // BUG-01 fix: pauseMonitor uses callback
  // BUG-04 fix: check result.ok and throw on failure
  async pauseMonitor(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Pause monitor timeout")),
        10000
      );
      this.socket.emit(
        "pauseMonitor",
        id,
        (result: { ok: boolean; msg?: string }) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Operation failed"));
            return;
          }
          resolve();
        }
      );
    });
  }

  // BUG-01 fix: resumeMonitor uses callback
  // BUG-04 fix: check result.ok and throw on failure
  async resumeMonitor(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Resume monitor timeout")),
        10000
      );
      this.socket.emit(
        "resumeMonitor",
        id,
        (result: { ok: boolean; msg?: string }) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Operation failed"));
            return;
          }
          resolve();
        }
      );
    });
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
