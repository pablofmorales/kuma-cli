#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import { readFileSync as readFileSync4 } from "fs";
import { join as join3, dirname as dirname3 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/commands/login.ts
import enquirer from "enquirer";

// src/client.ts
import { io } from "socket.io-client";
var KumaClient = class {
  constructor(url) {
    // Kuma pushes heartbeatList, uptime, and statusPageList events immediately
    // on connect / after auth, so we buffer them for later use.
    this.heartbeatCache = {};
    this.uptimeCache = {};
    // BUG-02 fix: buffer statusPageList pushed by Kuma during afterLogin
    this.statusPageCache = null;
    // Buffer notificationList pushed by Kuma during afterLogin
    this.notificationCache = null;
    this.url = url;
    this.socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 1e4
    });
    this.socket.on(
      "heartbeatList",
      (monitorId, data) => {
        if (Array.isArray(data) && data.length > 0) {
          this.heartbeatCache[monitorId] = data[data.length - 1];
        }
      }
    );
    this.socket.on(
      "uptime",
      (monitorId, period, value) => {
        this.uptimeCache[`${monitorId}_${period}`] = value;
      }
    );
    this.socket.on("statusPageList", (data) => {
      this.statusPageCache = data;
    });
    this.socket.on("notificationList", (data) => {
      this.notificationCache = Array.isArray(data) ? data : [];
    });
  }
  /**
   * Wait for a server-pushed event (not a callback response).
   * Used for events the server pushes after authentication (monitorList, etc.).
   */
  waitFor(event, timeoutMs = 1e4) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);
      this.socket.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }
  async connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Connection timeout \u2014 is Kuma running?"));
      }, 1e4);
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
  async login(username, password) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Login timeout")),
        1e4
      );
      this.socket.emit(
        "login",
        { username, password },
        (result) => {
          clearTimeout(timer);
          resolve(result);
        }
      );
    });
  }
  // BUG-01 fix: loginByToken also uses callback pattern
  async loginByToken(token) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Login timeout")),
        1e4
      );
      this.socket.emit("loginByToken", token, (result) => {
        clearTimeout(timer);
        resolve(result.ok);
      });
    });
  }
  async getMonitorList() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("getMonitorList timeout")),
        1e4
      );
      this.socket.once("monitorList", (data) => {
        clearTimeout(timer);
        for (const [idStr, monitor] of Object.entries(data)) {
          const id = Number(idStr);
          const hb = this.heartbeatCache[id];
          if (hb) monitor.heartbeat = hb;
          const up24 = this.uptimeCache[`${id}_24`];
          if (up24 !== void 0) monitor.uptime = up24;
        }
        resolve(data);
      });
      this.socket.emit("getMonitorList");
    });
  }
  // BUG-01 fix: addMonitor uses callback, not a separate event
  // BUG-03 fix: include required fields accepted_statuscodes, maxretries, retryInterval
  async addMonitor(monitor) {
    const autoToken = monitor.type === "push" && !monitor.pushToken ? Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("") : void 0;
    const payload = {
      accepted_statuscodes_json: JSON.stringify(["200-299"]),
      maxretries: 1,
      retryInterval: 60,
      conditions: [],
      rabbitmqNodes: [],
      kafkaProducerBrokers: [],
      kafkaProducerSaslOptions: { mechanism: "none" },
      ...autoToken ? { pushToken: autoToken } : {},
      ...monitor
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Add monitor timeout")),
        1e4
      );
      this.socket.emit(
        "add",
        payload,
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to add monitor"));
            return;
          }
          resolve({
            id: result.monitorID,
            // Return the token we generated so the caller has it immediately
            pushToken: payload.pushToken
          });
        }
      );
    });
  }
  // BUG-01 fix: editMonitor uses callback pattern (consistent with all other mutations)
  // BUG-04 fix: check result.ok and throw on failure
  async editMonitor(id, monitor) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Edit monitor timeout")),
        1e4
      );
      this.socket.emit(
        "editMonitor",
        { ...monitor, id },
        (result) => {
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
  async deleteMonitor(id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Delete monitor timeout")),
        1e4
      );
      this.socket.emit(
        "deleteMonitor",
        id,
        (result) => {
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
  async pauseMonitor(id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Pause monitor timeout")),
        1e4
      );
      this.socket.emit(
        "pauseMonitor",
        id,
        (result) => {
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
  async resumeMonitor(id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Resume monitor timeout")),
        1e4
      );
      this.socket.emit(
        "resumeMonitor",
        id,
        (result) => {
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
  // BUG-01 fix: use the correct server event "getMonitorBeats" with a callback.
  // The old code emitted "getHeartbeatList" (which doesn't exist) and tried to
  // waitFor a "heartbeatList" push event — causing a timeout every time.
  // The correct API: socket.emit("getMonitorBeats", monitorID, periodHours, cb)
  // cb receives { ok: boolean, data: Heartbeat[] }
  async getHeartbeatList(monitorId, periodHours = 24) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("getMonitorBeats timeout")),
        15e3
      );
      this.socket.emit(
        "getMonitorBeats",
        monitorId,
        periodHours,
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to fetch heartbeats"));
            return;
          }
          resolve(result.data ?? []);
        }
      );
    });
  }
  // BUG-02 fix: statusPageList is pushed by Kuma automatically during afterLogin,
  // not as a response to any explicit emit. The old code registered a waitFor
  // listener *after* the push had already fired, causing a guaranteed timeout.
  // Fix: buffer the push in the constructor and return the cache here.
  // If the cache is still null after auth (e.g. no status pages exist), fall back
  // to a short waitFor so we don't hang forever.
  async getStatusPageList() {
    if (this.statusPageCache !== null) {
      return this.statusPageCache;
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({});
      }, 5e3);
      this.socket.once("statusPageList", (data) => {
        clearTimeout(timer);
        this.statusPageCache = data;
        resolve(data);
      });
    });
  }
  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------
  /** Get all tags defined in Kuma. Callback-based event. */
  async getTags() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("getTags timeout")), 1e4);
      this.socket.emit(
        "getTags",
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to fetch tags"));
            return;
          }
          resolve(result.tags ?? []);
        }
      );
    });
  }
  /**
   * Add a tag to a monitor.
   * socket.emit("addMonitorTag", tagID, monitorID, value, callback)
   * value is a user-defined label string (can be empty "").
   */
  async addMonitorTag(tagId, monitorId, value = "") {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("addMonitorTag timeout")), 1e4);
      this.socket.emit(
        "addMonitorTag",
        tagId,
        monitorId,
        value,
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to add tag to monitor"));
            return;
          }
          resolve();
        }
      );
    });
  }
  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------
  /**
   * Return the notification list pushed by Kuma after login.
   * Falls back to a short waitFor if the push hasn't arrived yet.
   */
  async getNotificationList() {
    if (this.notificationCache !== null) {
      return this.notificationCache;
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), 5e3);
      this.socket.once("notificationList", (data) => {
        clearTimeout(timer);
        const list = Array.isArray(data) ? data : [];
        this.notificationCache = list;
        resolve(list);
      });
    });
  }
  /**
   * Create a new notification channel, or update one if id is provided.
   * Returns the id of the created/updated notification.
   *
   * Server event: addNotification(notification, id|null, callback)
   * callback: { ok: boolean, id?: number, msg?: string }
   */
  async addNotification(payload, id = null) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("addNotification timeout")),
        1e4
      );
      this.socket.emit(
        "addNotification",
        payload,
        id,
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to create notification"));
            return;
          }
          resolve(result.id);
        }
      );
    });
  }
  /**
   * Delete a notification channel by id.
   */
  async deleteNotification(id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("deleteNotification timeout")),
        1e4
      );
      this.socket.emit(
        "deleteNotification",
        id,
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to delete notification"));
            return;
          }
          resolve();
        }
      );
    });
  }
  /**
   * Assign a notification to a monitor.
   * Uses addMonitorTag-style approach: sends the notificationIDList via
   * the `editMonitor` event with the full monitor object + updated notificationIDList.
   * `notificationIDList` is { [notifId]: true } — Kuma's internal format.
   */
  async setMonitorNotification(monitorId, notificationId, enabled, monitorMap) {
    const existing = monitorMap[String(monitorId)];
    if (!existing) {
      throw new Error(`Monitor ${monitorId} not found`);
    }
    const notifIdList = {};
    notifIdList[String(notificationId)] = enabled;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("setMonitorNotification timeout")),
        1e4
      );
      this.socket.emit(
        "editMonitor",
        { ...existing, id: monitorId, notificationIDList: notifIdList },
        (result) => {
          clearTimeout(timer);
          if (!result.ok) {
            reject(new Error(result.msg ?? "Failed to update monitor notification"));
            return;
          }
          resolve();
        }
      );
    });
  }
  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------
  /**
   * Pause all monitors matching a filter function.
   * Returns a list of { id, name, ok, error? } results.
   */
  async bulkPause(filter) {
    const monitorMap = await this.getMonitorList();
    const targets = Object.values(monitorMap).filter(filter);
    const results = [];
    for (const m of targets) {
      try {
        await this.pauseMonitor(m.id);
        results.push({ id: m.id, name: m.name, ok: true });
      } catch (e) {
        results.push({ id: m.id, name: m.name, ok: false, error: e.message });
      }
    }
    return results;
  }
  /**
   * Resume all monitors matching a filter function.
   * Returns a list of { id, name, ok, error? } results.
   */
  async bulkResume(filter) {
    const monitorMap = await this.getMonitorList();
    const targets = Object.values(monitorMap).filter(filter);
    const results = [];
    for (const m of targets) {
      try {
        await this.resumeMonitor(m.id);
        results.push({ id: m.id, name: m.name, ok: true });
      } catch (e) {
        results.push({ id: m.id, name: m.name, ok: false, error: e.message });
      }
    }
    return results;
  }
  // ---------------------------------------------------------------------------
  // TUI real-time event subscriptions
  // ---------------------------------------------------------------------------
  /** Enable auto-reconnection (used by TUI dashboard for long-lived connections). */
  enableReconnection() {
    this.socket.io.opts.reconnection = true;
    this.socket.io.opts.reconnectionAttempts = Infinity;
    this.socket.io.opts.reconnectionDelay = 1e3;
    this.socket.io.opts.reconnectionDelayMax = 3e4;
  }
  /** Subscribe to individual heartbeat push events. Returns unsubscribe function. */
  onHeartbeat(callback) {
    const handler = (data) => {
      const hb = { id: 0, monitorID: data.monitorID, status: data.status, time: data.time, msg: data.msg, ping: data.ping };
      this.heartbeatCache[data.monitorID] = hb;
      callback(data.monitorID, hb);
    };
    this.socket.on("heartbeat", handler);
    return () => {
      this.socket.off("heartbeat", handler);
    };
  }
  /** Subscribe to uptime percentage push events. Returns unsubscribe function. */
  onUptime(callback) {
    const handler = (monitorId, period, value) => {
      this.uptimeCache[`${monitorId}_${period}`] = value;
      callback(monitorId, period, value);
    };
    this.socket.on("uptime", handler);
    return () => {
      this.socket.off("uptime", handler);
    };
  }
  /** Subscribe to disconnect events. Returns unsubscribe function. */
  onDisconnect(callback) {
    this.socket.on("disconnect", callback);
    return () => {
      this.socket.off("disconnect", callback);
    };
  }
  /** Subscribe to reconnect events. Returns unsubscribe function. */
  onReconnect(callback) {
    this.socket.io.on("reconnect", callback);
    return () => {
      this.socket.io.off("reconnect", callback);
    };
  }
  disconnect() {
    this.socket.disconnect();
  }
};
async function createAuthenticatedClient(url, token) {
  const client = new KumaClient(url);
  await client.connect();
  const ok = await client.loginByToken(token);
  if (!ok) {
    client.disconnect();
    throw new Error("Session expired. Run `kuma login` again.");
  }
  return client;
}

// src/config.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
function getConfigDir() {
  const platform = process.platform;
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "kuma-cli");
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "kuma-cli");
}
function getConfigFilePath() {
  return path.join(getConfigDir(), "config.json");
}
function getOldConfigFilePath() {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Preferences", "kuma-cli-nodejs", "config.json");
  }
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "kuma-cli-nodejs", "config.json");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "kuma-cli-nodejs", "config.json");
}
function migrateConfigPath(oldContent, newContent) {
  if (newContent !== null) {
    try {
      return { source: "new", data: JSON.parse(newContent) };
    } catch {
    }
  }
  if (oldContent !== null) {
    try {
      return { source: "old", data: JSON.parse(oldContent) };
    } catch {
    }
  }
  return { source: "none", data: null };
}
function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
function writeConfigFile(data) {
  const filePath = getConfigFilePath();
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 448 });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 384
  });
}
function deriveInstanceName(url) {
  try {
    const parsed = new URL(url);
    let name = parsed.hostname;
    if (parsed.port) {
      name += `-${parsed.port}`;
    }
    return name.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  } catch {
    return url.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
}
function migrateConfig(raw) {
  if (raw.instances && typeof raw.instances === "object") {
    const instances = raw.instances;
    if (Object.keys(instances).length > 0) {
      return raw;
    }
    if (raw.url && raw.token) {
    } else {
      return raw;
    }
  }
  const legacy = raw;
  if (legacy.url && legacy.token) {
    const name = deriveInstanceName(legacy.url);
    return {
      instances: {
        [name]: { url: legacy.url, token: legacy.token }
      },
      clusters: {},
      active: { type: "instance", name }
    };
  }
  return { instances: {}, clusters: {}, active: null };
}
function loadConfig() {
  const newPath = getConfigFilePath();
  const oldPath = getOldConfigFilePath();
  const { source, data } = migrateConfigPath(readFileOrNull(oldPath), readFileOrNull(newPath));
  if (source === "none" || data === null) {
    return { instances: {}, clusters: {}, active: null };
  }
  const migrated = migrateConfig(data);
  if (source === "old" || !data.instances) {
    writeConfigFile(migrated);
  }
  return migrated;
}
function saveFullConfig(config) {
  writeConfigFile(config);
}
function getAllInstances() {
  return loadConfig().instances;
}
function getInstanceConfig(name) {
  const config = loadConfig();
  return config.instances[name] ?? null;
}
function saveInstanceConfig(name, instance) {
  const config = loadConfig();
  config.instances[name] = instance;
  saveFullConfig(config);
}
function removeInstanceConfig(name) {
  const config = loadConfig();
  if (!config.instances[name]) return false;
  delete config.instances[name];
  if (config.active?.type === "instance" && config.active.name === name) {
    config.active = null;
  }
  saveFullConfig(config);
  return true;
}
function clearInstanceToken(name) {
  const config = loadConfig();
  if (!config.instances[name]) return false;
  config.instances[name].token = "";
  saveFullConfig(config);
  return true;
}
function getInstanceCluster(name) {
  const config = loadConfig();
  for (const [clusterName, cluster] of Object.entries(config.clusters)) {
    if (cluster.instances.includes(name)) return clusterName;
  }
  return null;
}
function getAllClusters() {
  return loadConfig().clusters;
}
function getClusterConfig(name) {
  const config = loadConfig();
  return config.clusters[name] ?? null;
}
function saveClusterConfig(name, cluster) {
  const config = loadConfig();
  config.clusters[name] = cluster;
  saveFullConfig(config);
}
function removeClusterConfig(name) {
  const config = loadConfig();
  if (!config.clusters[name]) return false;
  delete config.clusters[name];
  if (config.active?.type === "cluster" && config.active.name === name) {
    config.active = null;
  }
  saveFullConfig(config);
  return true;
}
function getActiveContext() {
  return loadConfig().active;
}
function setActiveContext(ctx) {
  const config = loadConfig();
  config.active = ctx;
  saveFullConfig(config);
}
function getConfig() {
  const config = loadConfig();
  const active = config.active;
  if (active) {
    if (active.type === "instance") {
      const inst = config.instances[active.name];
      if (inst && inst.token) return inst;
      return null;
    }
    if (active.type === "cluster") {
      const cluster = config.clusters[active.name];
      if (cluster) {
        const inst = config.instances[cluster.primary];
        if (inst && inst.token) return inst;
        return null;
      }
    }
  }
  const names = Object.keys(config.instances);
  if (names.length === 1) {
    const inst = config.instances[names[0]];
    if (inst && inst.token) return inst;
    return null;
  }
  return null;
}
function saveConfig(instanceConfig, alias) {
  const name = alias ?? deriveInstanceName(instanceConfig.url);
  saveInstanceConfig(name, instanceConfig);
  setActiveContext({ type: "instance", name });
  return name;
}
function clearConfig() {
  const filePath = getConfigFilePath();
  try {
    fs.unlinkSync(filePath);
  } catch {
  }
}
function getConfigPath() {
  return getConfigFilePath();
}

// src/utils/output.ts
import chalk from "chalk";
import Table from "cli-table3";
var STATUS_LABELS = {
  0: chalk.red("\u25CF DOWN"),
  1: chalk.green("\u25CF UP"),
  2: chalk.yellow("\u25CF PENDING"),
  3: chalk.gray("\u25CF MAINTENANCE")
};
function statusLabel(status) {
  return STATUS_LABELS[status] ?? chalk.gray("\u25CF UNKNOWN");
}
function createTable(head) {
  return new Table({
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
    chars: {
      top: "\u2500",
      "top-mid": "\u252C",
      "top-left": "\u256D",
      "top-right": "\u256E",
      bottom: "\u2500",
      "bottom-mid": "\u2534",
      "bottom-left": "\u2570",
      "bottom-right": "\u256F",
      left: "\u2502",
      "left-mid": "\u251C",
      mid: "\u2500",
      "mid-mid": "\u253C",
      right: "\u2502",
      "right-mid": "\u2524",
      middle: "\u2502"
    }
  });
}
function success(msg) {
  console.log(chalk.green("\u2705 " + msg));
}
function error(msg) {
  console.error(chalk.red("\u274C " + msg));
}
function warn(msg) {
  console.warn(chalk.yellow("\u26A0\uFE0F  " + msg));
}
function info(msg) {
  console.log(chalk.blue("\u2139\uFE0F  " + msg));
}
function formatUptime(uptime) {
  if (uptime === void 0 || uptime === null) return chalk.gray("\u2014");
  const pct = (uptime * 100).toFixed(1);
  const n = parseFloat(pct);
  if (n >= 99) return chalk.green(`${pct}%`);
  if (n >= 95) return chalk.yellow(`${pct}%`);
  return chalk.red(`${pct}%`);
}
function formatPing(ping) {
  if (!ping) return chalk.gray("\u2014");
  if (ping < 200) return chalk.green(`${ping}ms`);
  if (ping < 500) return chalk.yellow(`${ping}ms`);
  return chalk.red(`${ping}ms`);
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}
function isJsonMode(opts) {
  if (opts?.json) return true;
  const env = process.env["KUMA_JSON"];
  return env === "1" || env === "true" || env === "yes";
}
function jsonOut(data, exitCode = 0) {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
  process.exit(exitCode);
}
function jsonError(message, code = 1) {
  console.log(JSON.stringify({ ok: false, error: message, code }, null, 2));
  process.exit(code);
}

// src/utils/errors.ts
var EXIT_CODES = {
  SUCCESS: 0,
  GENERAL: 1,
  CONNECTION: 2,
  NOT_FOUND: 3,
  AUTH: 4
};
function exitCodeFor(err) {
  if (!(err instanceof Error)) return EXIT_CODES.GENERAL;
  const msg = err.message.toLowerCase();
  if (msg.includes("connection") || msg.includes("timeout") || msg.includes("refused")) {
    return EXIT_CODES.CONNECTION;
  }
  if (msg.includes("not found") || msg.includes("not exist")) {
    return EXIT_CODES.NOT_FOUND;
  }
  if (msg.includes("auth") || msg.includes("session expired") || msg.includes("login")) {
    return EXIT_CODES.AUTH;
  }
  return EXIT_CODES.GENERAL;
}
function handleError(err, opts) {
  const message = err instanceof Error ? err.message : String(err);
  const code = exitCodeFor(err);
  if (isJsonMode(opts)) {
    jsonError(message, code);
  }
  error(message);
  process.exit(code);
}

// src/commands/login.ts
import chalk2 from "chalk";
var { prompt } = enquirer;
function loginCommand(program2) {
  program2.command("login <url>").description(
    "Authenticate with an Uptime Kuma instance and save the session token locally"
  ).option("--json", "Output as JSON ({ ok, data })").option("--as <alias>", "Save this instance under a custom alias (default: derived from hostname)").addHelpText(
    "after",
    `
${chalk2.dim("Examples:")}
  ${chalk2.cyan("kuma login https://kuma.example.com")}
  ${chalk2.cyan("  Saves as 'kuma-example-com' (auto-derived from hostname)")}

  ${chalk2.cyan("kuma login https://kuma.example.com --as my-server")}
  ${chalk2.cyan("  Saves as 'my-server' (custom alias you choose)")}

${chalk2.dim("Multi-instance workflow:")}
  ${chalk2.cyan("kuma login https://kuma1.example.com --as server1")}
  ${chalk2.cyan("kuma login https://kuma2.example.com --as server2")}
  ${chalk2.cyan("kuma instances list")}     ${chalk2.dim("# See all saved instances")}
  ${chalk2.cyan("kuma use server1")}        ${chalk2.dim("# Switch active instance")}

${chalk2.dim("Notes:")}
  The --as alias is how you reference this instance in other commands
  (e.g. --instance server1, or when creating clusters).
  Credentials are never stored \u2014 only the session token is saved.
  Token location: run ${chalk2.cyan("kuma status")} to see the config path.
`
  ).action(async (url, opts) => {
    const json = isJsonMode(opts);
    try {
      const normalizedUrl = url.replace(/\/$/, "");
      if (!normalizedUrl.startsWith("https://")) {
        if (json) {
          console.log(JSON.stringify({
            warning: "Connecting over HTTP. Credentials will be transmitted in cleartext. Use HTTPS in production."
          }));
        } else {
          console.warn(chalk2.yellow(
            "\u26A0\uFE0F  Warning: connecting over HTTP. Your credentials will be sent in cleartext.\n   Use https:// in production environments."
          ));
        }
      }
      const answers = await prompt([
        {
          type: "input",
          name: "username",
          message: "Username:"
        },
        {
          type: "password",
          name: "password",
          message: "Password:"
        }
      ]);
      const { username, password } = answers;
      const client = new KumaClient(normalizedUrl);
      await client.connect();
      const result = await client.login(username, password);
      client.disconnect();
      if (!result.ok || !result.token) {
        const msg = result.msg ?? "Login failed";
        if (json) {
          jsonOut({ error: msg });
        }
        error(msg);
        process.exit(1);
      }
      const instanceName = saveConfig({ url: normalizedUrl, token: result.token }, opts.as);
      if (json) {
        jsonOut({ url: normalizedUrl, username, instanceName });
      }
      success(`Logged in to ${normalizedUrl} as "${instanceName}"`);
    } catch (err) {
      handleError(err, opts);
    }
  });
}

// src/commands/logout.ts
import chalk3 from "chalk";
function logoutCommand(program2) {
  program2.command("logout").description("Clear the saved session token (you will need to run login again)").option("--json", "Output as JSON ({ ok, data })").option("--all", "Logout from all instances and clear all config").addHelpText(
    "after",
    `
${chalk3.dim("Examples:")}
  ${chalk3.cyan("kuma logout")}
  ${chalk3.cyan("kuma logout --json")}
`
  ).action((opts) => {
    const json = isJsonMode(opts);
    if (opts.all) {
      clearConfig();
      if (json) {
        jsonOut({ loggedOut: true, all: true });
      }
      success("Logged out from all instances.");
      return;
    }
    const active = getActiveContext();
    let instanceName = null;
    if (active?.type === "instance") {
      const inst = getInstanceConfig(active.name);
      if (inst) instanceName = active.name;
    } else if (active?.type === "cluster") {
    }
    if (!instanceName) {
      const all = getAllInstances();
      const names = Object.keys(all);
      if (names.length === 1) {
        instanceName = names[0];
      }
    }
    if (!instanceName) {
      if (json) {
        jsonOut({ loggedOut: false, reason: "No active instance" });
      }
      error("No active instance. Use --all to logout from all, or: kuma use <name>");
      return;
    }
    clearInstanceToken(instanceName);
    if (json) {
      jsonOut({ loggedOut: true, instanceName });
    }
    success(`Logged out from "${instanceName}". Run \`kuma login <url>\` to authenticate again.`);
  });
}

// src/commands/monitors.ts
import enquirer2 from "enquirer";

// src/instance-manager.ts
function resolveInstanceName(flags) {
  if (flags.instance) {
    const inst = getInstanceConfig(flags.instance);
    if (!inst) throw new Error(`Instance '${flags.instance}' not found. Run: kuma instances list`);
    return flags.instance;
  }
  if (flags.cluster) {
    const cluster = getClusterConfig(flags.cluster);
    if (!cluster) throw new Error(`Cluster '${flags.cluster}' not found. Run: kuma cluster list`);
    return cluster.primary;
  }
  const active = getActiveContext();
  if (active) {
    if (active.type === "instance") {
      const inst = getInstanceConfig(active.name);
      if (inst) return active.name;
    }
    if (active.type === "cluster") {
      const cluster = getClusterConfig(active.name);
      if (cluster) return cluster.primary;
    }
  }
  const all = getAllInstances();
  const names = Object.keys(all);
  if (names.length === 1) return names[0];
  if (names.length === 0) throw new Error("No instances configured. Run: kuma login <url>");
  throw new Error(`No active instance. Multiple instances found: ${names.join(", ")}. Run: kuma use <name>`);
}
async function resolveClient(flags) {
  const name = resolveInstanceName(flags);
  const config = getInstanceConfig(name);
  if (!config) throw new Error(`Instance '${name}' not found.`);
  const client = await createAuthenticatedClient(config.url, config.token);
  return { client, instanceName: name };
}

// src/commands/monitors.ts
import chalk4 from "chalk";
var { prompt: prompt2 } = enquirer2;
function collect(val, prev) {
  return [...prev, val];
}
function collectInt(val, prev) {
  return [...prev, parseInt(val, 10)];
}
var MONITOR_TYPES = [
  "http",
  "tcp",
  "ping",
  "dns",
  "push",
  "steam",
  "mqtt",
  "sqlserver",
  "postgres",
  "mysql",
  "mongodb",
  "radius",
  "redis",
  "group"
];
function monitorsCommand(program2) {
  const monitors = program2.command("monitors").description("Create, view, update, pause, resume, and delete monitors").addHelpText(
    "after",
    `
${chalk4.dim("Subcommands:")}
  ${chalk4.cyan("monitors list")}          List all monitors with status and uptime
  ${chalk4.cyan("monitors add")}           Add a new monitor (interactive or via flags)
  ${chalk4.cyan("monitors update <id>")}   Update name, URL, or interval of a monitor
  ${chalk4.cyan("monitors delete <id>")}   Permanently delete a monitor
  ${chalk4.cyan("monitors pause <id>")}    Pause checks for a monitor
  ${chalk4.cyan("monitors resume <id>")}   Resume checks for a paused monitor

${chalk4.dim("Run")} ${chalk4.cyan("kuma monitors <subcommand> --help")} ${chalk4.dim("for per-command examples.")}
`
  );
  monitors.command("list").description("List all monitors with live status, uptime, and ping").option("--json", "Output as JSON ({ ok, data })").option(
    "--status <status>",
    "Filter to a specific status: up, down, pending, maintenance"
  ).option("--tag <tag>", "Filter to monitors that have this tag name").option("--has-notification", "Filter to monitors that have at least one notification configured").option("--without-notification", "Filter to monitors that have no notifications configured").option("--search <query>", "Filter by monitor name or URL/hostname (case-insensitive)").option("--uptime-below <percent>", "Filter to monitors with 24h uptime below this percentage (e.g. 99.9)").option("--include-notifications", "Include notification channels in the JSON output").option("--instance <name>", "Target a specific instance").option("--cluster <name>", "Show a unified view across all instances in a named cluster").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors list")}                        List all monitors
  ${chalk4.cyan("kuma monitors list --status down")}          Show only DOWN monitors
  ${chalk4.cyan("kuma monitors list --tag production")}       Filter by tag
  ${chalk4.cyan("kuma monitors list --without-notification")} Audit monitors missing alerts
  ${chalk4.cyan("kuma monitors list --uptime-below 99.0")}    Find SLA-breaching monitors
  ${chalk4.cyan("kuma monitors list --json | jq '.data[].name'")}
`
  ).action(
    async (opts) => {
      if (opts.cluster) {
        const clusterConfig = getClusterConfig(opts.cluster);
        if (!clusterConfig) {
          if (isJsonMode(opts)) return jsonError(`Cluster '${opts.cluster}' not found.`);
          error(`Cluster '${opts.cluster}' not found.`);
          process.exit(1);
        }
        const allMonitors = [];
        const results = await Promise.allSettled(
          clusterConfig.instances.map(async (instanceName) => {
            const instConfig = getInstanceConfig(instanceName);
            if (!instConfig) return [];
            try {
              const client = await createAuthenticatedClient(instConfig.url, instConfig.token);
              const monitorMap = await client.getMonitorList();
              const monitors2 = Object.values(monitorMap);
              client.disconnect();
              return monitors2.filter((m) => !m.name.startsWith("[cluster] ")).map((m) => ({ ...m, _instance: instanceName }));
            } catch {
              return [];
            }
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled") allMonitors.push(...r.value);
        }
        const STATUS_PRIORITY2 = { 0: 0, 3: 1, 2: 2, 1: 3 };
        const deduped = /* @__PURE__ */ new Map();
        for (const m of allMonitors) {
          const key = `${m.name}|${m.type}|${m.url ?? m.hostname ?? ""}`;
          const existing = deduped.get(key);
          if (!existing) {
            deduped.set(key, m);
          } else {
            const existingPri = STATUS_PRIORITY2[existing.heartbeat?.status ?? 2] ?? 2;
            const newPri = STATUS_PRIORITY2[m.heartbeat?.status ?? 2] ?? 2;
            if (newPri < existingPri) deduped.set(key, m);
          }
        }
        const clusterMonitors = Array.from(deduped.values());
        if (isJsonMode(opts)) {
          return jsonOut({ cluster: opts.cluster, monitors: clusterMonitors });
        }
        if (clusterMonitors.length === 0) {
          info(`Cluster '${opts.cluster}' -- unified view (0 monitors)`);
          console.log("No monitors found.");
          return;
        }
        const table = createTable([
          "ID",
          "Name",
          "Type",
          "URL / Host",
          "Status",
          "Uptime 24h",
          "Ping"
        ]);
        for (const m of clusterMonitors) {
          const target = m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "\u2014");
          const status = m.heartbeat ? statusLabel(m.heartbeat.status) : m.active ? statusLabel(2) : "\u23F8 Paused";
          table.push([
            String(m.id),
            m.name,
            m.type,
            target,
            status,
            formatUptime(m.uptime),
            formatPing(m.heartbeat?.ping)
          ]);
        }
        info(`Cluster '${opts.cluster}' \u2014 unified view (${clusterMonitors.length} monitors, worst-status-wins)
`);
        console.log(table.toString());
        console.log(`
${clusterMonitors.length} monitor(s) total`);
        return;
      }
      const json = isJsonMode(opts);
      if (opts.hasNotification && opts.withoutNotification) {
        handleError(new Error("Cannot use both --has-notification and --without-notification"), opts);
      }
      const uptimeThreshold = opts.uptimeBelow ? parseFloat(opts.uptimeBelow) : void 0;
      if (uptimeThreshold !== void 0 && isNaN(uptimeThreshold)) {
        handleError(new Error(`Invalid uptime threshold: ${opts.uptimeBelow}`), opts);
      }
      const STATUS_MAP2 = {
        down: 0,
        up: 1,
        pending: 2,
        maintenance: 3
      };
      try {
        const { client } = await resolveClient(opts);
        const monitorMap = await client.getMonitorList();
        client.disconnect();
        let list = Object.values(monitorMap);
        if (opts.status) {
          const statusKey = opts.status.toLowerCase();
          if (!(statusKey in STATUS_MAP2)) {
            if (json) {
              jsonOut({ error: `Invalid status "${opts.status}". Valid values: up, down, pending, maintenance` });
            }
            error(
              `Invalid status "${opts.status}". Valid values: up, down, pending, maintenance`
            );
            process.exit(1);
          }
          const statusNum = STATUS_MAP2[statusKey];
          list = list.filter((m) => {
            if (m.heartbeat) return m.heartbeat.status === statusNum;
            if (statusNum === 2) return m.active && !m.heartbeat;
            return false;
          });
        }
        if (opts.tag) {
          const tagName = opts.tag.toLowerCase();
          list = list.filter(
            (m) => Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
          );
        }
        if (opts.hasNotification || opts.withoutNotification) {
          list = list.filter((m) => {
            const hasAny = m.notificationIDList ? Object.values(m.notificationIDList).some((enabled) => enabled) : false;
            return opts.hasNotification ? hasAny : !hasAny;
          });
        }
        if (opts.search) {
          const query = opts.search.toLowerCase();
          list = list.filter((m) => {
            const target = m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "");
            return m.name.toLowerCase().includes(query) || target.toLowerCase().includes(query);
          });
        }
        if (uptimeThreshold !== void 0) {
          list = list.filter((m) => {
            if (m.uptime === void 0 || m.uptime === null) return false;
            const pct = m.uptime * 100;
            return pct < uptimeThreshold;
          });
        }
        if (json) {
          if (opts.includeNotifications) {
            jsonOut(list);
          } else {
            const strippedList = list.map((m) => {
              const { notificationIDList, ...rest } = m;
              return rest;
            });
            jsonOut(strippedList);
          }
        }
        if (list.length === 0) {
          console.log("No monitors found matching the given filters.");
          return;
        }
        const table = createTable([
          "ID",
          "Name",
          "Type",
          "URL / Host",
          "Status",
          "Uptime 24h",
          "Ping"
        ]);
        list.forEach((m) => {
          const target = m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "\u2014");
          const status = m.heartbeat ? statusLabel(m.heartbeat.status) : m.active ? statusLabel(2) : "\u23F8 Paused";
          table.push([
            String(m.id),
            m.name,
            m.type,
            target,
            status,
            formatUptime(m.uptime),
            formatPing(m.heartbeat?.ping)
          ]);
        });
        console.log(table.toString());
        console.log(`
${list.length} monitor(s) total`);
      } catch (err) {
        handleError(err, opts);
      }
    }
  );
  monitors.command("add").description("Add a new monitor \u2014 runs interactively if flags are omitted").option("--name <name>", "Display name for the monitor").option("--type <type>", "Monitor type: http, tcp, ping, dns, push, steam, ...").option("--url <url>", "URL (http), hostname:port (tcp), or hostname (ping/dns)").option("--interval <seconds>", "How often to check, in seconds (default: 60)", "60").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").option("--parent <id>", "Add as a child monitor under an existing group monitor (ID)").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors add")}                                          Interactive mode
  ${chalk4.cyan('kuma monitors add --name "My API" --type http --url https://api.example.com')}
  ${chalk4.cyan('kuma monitors add --name "DB" --type tcp --url db.host:5432 --interval 30')}
  ${chalk4.cyan('kuma monitors add --name "Ping" --type ping --url 8.8.8.8 --json')}
`
  ).action(
    async (opts) => {
      const json = isJsonMode(opts);
      try {
        const answers = await prompt2([
          ...!opts.name ? [{ type: "input", name: "name", message: "Monitor name:" }] : [],
          ...!opts.type ? [
            {
              type: "select",
              name: "type",
              message: "Monitor type:",
              choices: MONITOR_TYPES
            }
          ] : []
        ]);
        const name = opts.name ?? answers.name;
        const type = opts.type ?? answers.type;
        let url = opts.url;
        if (!url && type !== "group") {
          const urlAnswer = await prompt2([
            {
              type: "input",
              name: "url",
              message: "URL or hostname:"
            }
          ]);
          url = urlAnswer.url;
        }
        const interval = parseInt(opts.interval ?? "60", 10);
        const { client } = await resolveClient(opts);
        const result = await client.addMonitor({
          name,
          type,
          url,
          interval,
          parent: opts.parent ? parseInt(opts.parent, 10) : void 0
        });
        client.disconnect();
        if (json) {
          jsonOut({ id: result.id, name, type, url, interval });
        }
        success(`Monitor "${name}" created (ID: ${result.id})`);
      } catch (err) {
        handleError(err, opts);
      }
    }
  );
  monitors.command("create").description("Create a monitor non-interactively \u2014 designed for CI/CD pipelines").requiredOption("--name <name>", "Monitor display name").requiredOption("--type <type>", "Monitor type: http, tcp, ping, dns, push, ...").option("--url <url>", "URL or hostname to monitor").option("--interval <seconds>", "Check interval in seconds (default: 60)", "60").option("--tag <tag>", "Assign a tag by name (repeatable \u2014 must already exist in Kuma)", collect, []).option("--notification-id <id>", "Assign a notification channel by ID (repeatable)", collectInt, []).option("--json", "Output as JSON ({ ok, data }) \u2014 prints monitor ID and pushToken to stdout").option("--instance <name>", "Target a specific instance").option("--parent <id>", "Create as a child monitor under an existing group monitor (ID)").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan('kuma monitors create --type http --name "habitu.ar" --url https://habitu.ar')}
  ${chalk4.cyan('kuma monitors create --type http --name "My API" --url https://api.example.com --tag Production --tag BlackAsteroid')}
  ${chalk4.cyan(`kuma monitors create --type push --name "GH Runner" --json | jq '.data.pushToken'`)}
  ${chalk4.cyan('kuma monitors create --type tcp --name "DB" --url db.host:5432 --interval 30 --notification-id 1')}

${chalk4.dim("Full pipeline (deploy \u2192 monitor \u2192 heartbeat):")}
  ${chalk4.cyan('RESULT=$(kuma monitors create --type push --name "runner" --json)')}
  ${chalk4.cyan("PUSH_TOKEN=$(echo $RESULT | jq -r '.data.pushToken')")}
  ${chalk4.cyan('kuma heartbeat send $PUSH_TOKEN --msg "Alive"')}
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    const interval = parseInt(opts.interval ?? "60", 10);
    if (["http", "keyword", "tcp", "ping", "dns"].includes(opts.type) && !opts.url) {
      handleError(new Error(`--url is required for monitor type "${opts.type}"`), opts);
    }
    try {
      const { client, instanceName } = await resolveClient(opts);
      const result = await client.addMonitor({
        name: opts.name,
        type: opts.type,
        url: opts.url,
        interval,
        parent: opts.parent ? parseInt(opts.parent, 10) : void 0
      });
      const monitorId = result.id;
      let pushToken = result.pushToken ?? null;
      const tagWarnings = [];
      if (opts.tag.length > 0) {
        const allTags = await client.getTags();
        const tagMap = new Map(allTags.map((t) => [t.name.toLowerCase(), t]));
        for (const tagName of opts.tag) {
          const found = tagMap.get(tagName.toLowerCase());
          if (!found) {
            const warn3 = `Tag "${tagName}" not found \u2014 skipping. Create it in the Kuma UI first.`;
            tagWarnings.push(warn3);
            if (!json) {
              console.warn(chalk4.yellow(`\u26A0\uFE0F  ${warn3}`));
            }
            continue;
          }
          await client.addMonitorTag(found.id, monitorId);
        }
      }
      if (opts.notificationId.length > 0) {
        const monitorMap = await client.getMonitorList();
        for (const notifId of opts.notificationId) {
          await client.setMonitorNotification(monitorId, notifId, true, monitorMap);
        }
      }
      client.disconnect();
      if (json) {
        const data = {
          id: monitorId,
          name: opts.name,
          type: opts.type,
          url: opts.url ?? null,
          interval
        };
        if (pushToken) data.pushToken = pushToken;
        if (tagWarnings.length > 0) data.warnings = tagWarnings;
        jsonOut(data, tagWarnings.length > 0 ? 1 : 0);
      }
      success(`Monitor "${opts.name}" created (ID: ${monitorId})`);
      if (pushToken) {
        const instanceUrl = getInstanceConfig(instanceName)?.url ?? "";
        console.log(`   Push token: ${chalk4.cyan(pushToken)}`);
        console.log(`   Push URL:   ${chalk4.dim(`${instanceUrl}/api/push/${pushToken}`)}`);
      }
      if (opts.tag.length > 0) {
        const applied = opts.tag.filter((t) => !tagWarnings.some((w) => w.includes(t)));
        if (applied.length > 0) console.log(`   Tags: ${applied.join(", ")}`);
      }
      if (tagWarnings.length > 0) {
        process.exit(1);
      }
    } catch (err) {
      handleError(err, opts);
    }
  });
  monitors.command("update <id>").description("Update the name, URL, interval, or active state of a monitor").option("--name <name>", "Set a new display name").option("--url <url>", "Set a new URL or hostname").option("--interval <seconds>", "Set a new check interval (seconds)").option("--active", "Resume the monitor (mark as active)").option("--no-active", "Pause the monitor (mark as inactive)").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan('kuma monitors update 42 --name "Prod API"')}
  ${chalk4.cyan("kuma monitors update 42 --url https://new-url.com --interval 30")}
  ${chalk4.cyan("kuma monitors update 42 --no-active")}          Pause the monitor
  ${chalk4.cyan("kuma monitors update 42 --active")}             Resume the monitor
  ${chalk4.cyan('kuma monitors update 42 --name "New" --json')}
`
  ).action(
    async (id, opts) => {
      const json = isJsonMode(opts);
      const monitorId = parseInt(id, 10);
      if (isNaN(monitorId)) {
        handleError(new Error(`Invalid monitor ID: ${id}`), opts);
      }
      const hasPatch = opts.name !== void 0 || opts.url !== void 0 || opts.interval !== void 0 || opts.active !== void 0;
      if (!hasPatch) {
        handleError(
          new Error("No fields to update. Use --name, --url, --interval, --active, or --no-active."),
          opts
        );
      }
      try {
        const { client } = await resolveClient(opts);
        const monitorMap = await client.getMonitorList();
        const existing = monitorMap[String(monitorId)];
        if (!existing) {
          client.disconnect();
          const ids = Object.keys(monitorMap).join(", ");
          handleError(
            new Error(`Monitor ${monitorId} not found. Available IDs: ${ids || "none"}`),
            opts
          );
        }
        const changes = [];
        const hasFieldChanges = opts.name !== void 0 || opts.url !== void 0 || opts.interval !== void 0;
        if (hasFieldChanges) {
          const updated = { ...existing };
          if (opts.name !== void 0) {
            updated.name = opts.name;
            changes.push(`name \u2192 "${opts.name}"`);
          }
          if (opts.url !== void 0) {
            updated.url = opts.url;
            changes.push(`url \u2192 "${opts.url}"`);
          }
          if (opts.interval !== void 0) {
            updated.interval = parseInt(opts.interval, 10);
            changes.push(`interval \u2192 ${opts.interval}s`);
          }
          await client.editMonitor(monitorId, updated);
        }
        if (opts.active !== void 0) {
          if (opts.active) {
            await client.resumeMonitor(monitorId);
            changes.push("activated");
          } else {
            await client.pauseMonitor(monitorId);
            changes.push("deactivated");
          }
        }
        client.disconnect();
        if (json) {
          jsonOut({ id: monitorId, changes });
        }
        success(`Monitor ${monitorId} updated (${changes.join(", ")})`);
      } catch (err) {
        handleError(err, opts);
      }
    }
  );
  monitors.command("delete <id>").description("Permanently delete a monitor and all its history").option("--force", "Skip the confirmation prompt").option("--json", "Output as JSON ({ ok, data }) \u2014 skips confirmation prompt").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors delete 42")}              Prompt for confirmation first
  ${chalk4.cyan("kuma monitors delete 42 --force")}      Delete without prompting
  ${chalk4.cyan("kuma monitors delete 42 --json")}       Non-interactive JSON output

${chalk4.dim("Note:")} This action is irreversible. All heartbeat history is deleted.
`
  ).action(async (id, opts) => {
    const json = isJsonMode(opts);
    try {
      if (!opts.force && !json) {
        const { confirm } = await prompt2({
          type: "confirm",
          name: "confirm",
          message: `Delete monitor ${id}?`,
          initial: false
        });
        if (!confirm) {
          console.log("Aborted.");
          return;
        }
      }
      const { client } = await resolveClient(opts);
      await client.deleteMonitor(parseInt(id, 10));
      client.disconnect();
      if (json) {
        jsonOut({ id: parseInt(id, 10), deleted: true });
      }
      success(`Monitor ${id} deleted`);
    } catch (err) {
      handleError(err, opts);
    }
  });
  monitors.command("pause <id>").description("Pause a monitor \u2014 stops checks without deleting it").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors pause 42")}
  ${chalk4.cyan("kuma monitors pause 42 --json")}
`
  ).action(async (id, opts) => {
    const json = isJsonMode(opts);
    try {
      const { client } = await resolveClient(opts);
      await client.pauseMonitor(parseInt(id, 10));
      client.disconnect();
      if (json) {
        jsonOut({ id: parseInt(id, 10), paused: true });
      }
      success(`Monitor ${id} paused`);
    } catch (err) {
      handleError(err, opts);
    }
  });
  monitors.command("resume <id>").description("Resume checks for a paused monitor").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors resume 42")}
  ${chalk4.cyan("kuma monitors resume 42 --json")}
`
  ).action(async (id, opts) => {
    const json = isJsonMode(opts);
    try {
      const { client } = await resolveClient(opts);
      await client.resumeMonitor(parseInt(id, 10));
      client.disconnect();
      if (json) {
        jsonOut({ id: parseInt(id, 10), resumed: true });
      }
      success(`Monitor ${id} resumed`);
    } catch (err) {
      handleError(err, opts);
    }
  });
  monitors.command("bulk-pause").description("Pause all monitors matching a tag or status filter").option("--tag <tag>", "Pause all monitors with this tag").option("--status <status>", "Pause all monitors with this status: up, down, pending, maintenance").option("--dry-run", "Preview which monitors would be paused without pausing them").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors bulk-pause --tag Production")}              Pause all Production monitors
  ${chalk4.cyan("kuma monitors bulk-pause --tag Production --dry-run")}    Preview without pausing
  ${chalk4.cyan("kuma monitors bulk-pause --tag Production --json")}       Machine-readable results

${chalk4.dim("CI/CD usage:")}
  ${chalk4.cyan("kuma monitors bulk-pause --tag Production && ./deploy.sh && kuma monitors bulk-resume --tag Production")}
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    if (!opts.tag && !opts.status) {
      handleError(new Error("At least one of --tag or --status is required"), opts);
    }
    const STATUS_MAP2 = { down: 0, up: 1, pending: 2, maintenance: 3 };
    try {
      const { client } = await resolveClient(opts);
      const monitorMap = await client.getMonitorList();
      const all = Object.values(monitorMap);
      let targets = all;
      if (opts.tag) {
        const tagName = opts.tag.toLowerCase();
        targets = targets.filter(
          (m) => Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
        );
      }
      if (opts.status) {
        const statusNum = STATUS_MAP2[opts.status.toLowerCase()];
        if (statusNum === void 0) {
          client.disconnect();
          handleError(new Error(`Invalid status "${opts.status}". Valid: up, down, pending, maintenance`), opts);
        }
        targets = targets.filter((m) => m.heartbeat?.status === statusNum);
      }
      if (targets.length === 0) {
        client.disconnect();
        if (json) jsonOut({ affected: 0, results: [] });
        console.log("No monitors matched the given filters.");
        return;
      }
      if (opts.dryRun) {
        client.disconnect();
        const preview = targets.map((m) => ({ id: m.id, name: m.name }));
        if (json) jsonOut({ dryRun: true, affected: targets.length, monitors: preview });
        console.log(chalk4.yellow(`Dry run \u2014 would pause ${targets.length} monitor(s):`));
        preview.forEach((m) => console.log(`  ${chalk4.dim(String(m.id).padStart(4))} ${m.name}`));
        return;
      }
      const results = await client.bulkPause((m) => targets.some((t) => t.id === m.id));
      client.disconnect();
      const failed = results.filter((r) => !r.ok);
      if (json) {
        jsonOut({ affected: results.length, failed: failed.length, results });
      }
      console.log(`Paused ${results.length - failed.length}/${results.length} monitor(s)`);
      if (failed.length > 0) {
        failed.forEach((r) => error(`  Monitor ${r.id} (${r.name}): ${r.error}`));
        process.exit(1);
      }
    } catch (err) {
      handleError(err, opts);
    }
  });
  monitors.command("bulk-resume").description("Resume all monitors matching a tag or status filter").option("--tag <tag>", "Resume all monitors with this tag").option("--status <status>", "Resume all monitors with this status: up, down, pending, maintenance").option("--dry-run", "Preview which monitors would be resumed without resuming them").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors bulk-resume --tag Production")}
  ${chalk4.cyan("kuma monitors bulk-resume --tag Production --dry-run")}
  ${chalk4.cyan("kuma monitors bulk-resume --tag Production --json")}
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    if (!opts.tag && !opts.status) {
      handleError(new Error("At least one of --tag or --status is required"), opts);
    }
    const STATUS_MAP2 = { down: 0, up: 1, pending: 2, maintenance: 3 };
    try {
      const { client } = await resolveClient(opts);
      const monitorMap = await client.getMonitorList();
      const all = Object.values(monitorMap);
      let targets = all;
      if (opts.tag) {
        const tagName = opts.tag.toLowerCase();
        targets = targets.filter(
          (m) => Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
        );
      }
      if (opts.status) {
        const statusNum = STATUS_MAP2[opts.status.toLowerCase()];
        if (statusNum === void 0) {
          client.disconnect();
          handleError(new Error(`Invalid status "${opts.status}". Valid: up, down, pending, maintenance`), opts);
        }
        targets = targets.filter((m) => m.heartbeat?.status === statusNum);
      }
      if (targets.length === 0) {
        client.disconnect();
        if (json) jsonOut({ affected: 0, results: [] });
        console.log("No monitors matched the given filters.");
        return;
      }
      if (opts.dryRun) {
        client.disconnect();
        const preview = targets.map((m) => ({ id: m.id, name: m.name }));
        if (json) jsonOut({ dryRun: true, affected: targets.length, monitors: preview });
        console.log(chalk4.yellow(`Dry run \u2014 would resume ${targets.length} monitor(s):`));
        preview.forEach((m) => console.log(`  ${chalk4.dim(String(m.id).padStart(4))} ${m.name}`));
        return;
      }
      const results = await client.bulkResume((m) => targets.some((t) => t.id === m.id));
      client.disconnect();
      const failed = results.filter((r) => !r.ok);
      if (json) {
        jsonOut({ affected: results.length, failed: failed.length, results });
      }
      console.log(`Resumed ${results.length - failed.length}/${results.length} monitor(s)`);
      if (failed.length > 0) {
        failed.forEach((r) => error(`  Monitor ${r.id} (${r.name}): ${r.error}`));
        process.exit(1);
      }
    } catch (err) {
      handleError(err, opts);
    }
  });
  monitors.command("set-notification <id>").description("Assign or remove a notification channel from a monitor").requiredOption("--notification-id <nid>", "ID of the notification channel to assign").option("--remove", "Remove the notification instead of assigning it").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk4.dim("Examples:")}
  ${chalk4.cyan("kuma monitors set-notification 42 --notification-id 3")}
  ${chalk4.cyan("kuma monitors set-notification 42 --notification-id 3 --remove")}
  ${chalk4.cyan("kuma monitors set-notification 42 --notification-id 3 --json")}

${chalk4.dim("Bulk assign via pipe:")}
  ${chalk4.cyan("kuma monitors list --tag Production --json | jq '.data[].id' | xargs -I{} kuma monitors set-notification {} --notification-id 3")}
`
  ).action(async (id, opts) => {
    const json = isJsonMode(opts);
    const monitorId = parseInt(id, 10);
    const notifId = parseInt(opts.notificationId, 10);
    if (isNaN(monitorId)) {
      handleError(new Error(`Invalid monitor ID: ${id}`), opts);
    }
    if (isNaN(notifId)) {
      handleError(new Error(`Invalid notification ID: ${opts.notificationId}`), opts);
    }
    try {
      const { client } = await resolveClient(opts);
      const monitorMap = await client.getMonitorList();
      await client.setMonitorNotification(
        monitorId,
        notifId,
        !opts.remove,
        monitorMap
      );
      client.disconnect();
      const action = opts.remove ? "removed from" : "assigned to";
      if (json) {
        jsonOut({ monitorId, notificationId: notifId, action: opts.remove ? "removed" : "assigned" });
      }
      success(`Notification ${notifId} ${action} monitor ${monitorId}`);
    } catch (err) {
      handleError(err, opts);
    }
  });
}

// src/commands/heartbeat.ts
import chalk5 from "chalk";
function heartbeatCommand(program2) {
  const hb = program2.command("heartbeat").description("View heartbeat history or send push heartbeats to monitors").addHelpText(
    "after",
    `
${chalk5.dim("Subcommands:")}
  ${chalk5.cyan("heartbeat view <monitor-id>")}      View recent heartbeats for a monitor
  ${chalk5.cyan("heartbeat send <push-token>")}      Send a push heartbeat (for scripts / GitHub Actions)

${chalk5.dim("Run")} ${chalk5.cyan("kuma heartbeat <subcommand> --help")} ${chalk5.dim("for examples.")}
`
  );
  hb.command("view <monitor-id>").description("View recent heartbeats (check results) for a monitor").option("--limit <n>", "Maximum number of heartbeats to display (default: 20)", "20").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk5.dim("Examples:")}
  ${chalk5.cyan("kuma heartbeat view 42")}
  ${chalk5.cyan("kuma heartbeat view 42 --limit 50")}
  ${chalk5.cyan("kuma heartbeat view 42 --json")}
  ${chalk5.cyan("kuma heartbeat view 42 --json | jq '.data[] | select(.status == 0)'")}
`
  ).action(async (monitorId, opts) => {
    const json = isJsonMode(opts);
    const parsedMonitorId = parseInt(monitorId, 10);
    if (isNaN(parsedMonitorId) || parsedMonitorId <= 0) {
      handleError(new Error(`Invalid monitor ID: "${monitorId}". Must be a positive integer.`), opts);
    }
    try {
      const { client } = await resolveClient(opts);
      const heartbeats = await client.getHeartbeatList(parsedMonitorId);
      client.disconnect();
      const limit = parseInt(opts.limit ?? "20", 10);
      const recent = heartbeats.slice(-limit).reverse();
      if (json) {
        jsonOut(recent);
      }
      if (recent.length === 0) {
        console.log("No heartbeats found.");
        return;
      }
      const table = createTable(["Time", "Status", "Ping", "Message"]);
      recent.forEach((hb2) => {
        table.push([
          formatDate(hb2.time),
          statusLabel(hb2.status),
          formatPing(hb2.ping),
          hb2.msg ?? "\u2014"
        ]);
      });
      console.log(table.toString());
      console.log(`
Showing last ${recent.length} heartbeat(s)`);
    } catch (err) {
      handleError(err, opts);
    }
  });
  hb.command("send <push-token>").description("Send a push heartbeat to a Kuma push monitor (for scripts and GitHub Actions)").option("--status <status>", "Heartbeat status: up, down, maintenance (default: up)").option("--msg <message>", "Optional status message").option("--ping <ms>", "Optional response time in milliseconds").option("--url <url>", "Kuma base URL (defaults to saved login URL)").option("--instance <name>", "Target a specific instance").option("--json", "Output as JSON ({ ok, data })").addHelpText(
    "after",
    `
${chalk5.dim("Examples:")}
  ${chalk5.cyan("kuma heartbeat send abc123")}
  ${chalk5.cyan('kuma heartbeat send abc123 --status down --msg "Job failed"')}
  ${chalk5.cyan('kuma heartbeat send abc123 --msg "Deploy complete" --ping 42')}
  ${chalk5.cyan("kuma heartbeat send abc123 --json")}

${chalk5.dim("GitHub Actions usage:")}
  ${chalk5.cyan("- name: Heartbeat")}
  ${chalk5.cyan("  if: always()")}
  ${chalk5.cyan("  run: kuma heartbeat send ${{ secrets.RUNNER_PUSH_TOKEN }} --status ${{ job.status == 'success' && 'up' || 'down' }}")}

${chalk5.dim("Finding your push token:")}
  Create a "Push" monitor in Kuma UI. The push URL is:
  https://kuma.example.com/api/push/<token>
  Use only the <token> part.

  Or get it from CLI: kuma monitors create --type push --name "my-runner" --json | jq '.data.pushToken'
`
  ).action(async (pushToken, opts) => {
    const json = isJsonMode(opts);
    if (!/^[a-zA-Z0-9_-]+$/.test(pushToken)) {
      const msg = `Invalid push token format. Tokens must contain only alphanumeric characters, hyphens, and underscores.`;
      if (json) jsonError(msg, EXIT_CODES.GENERAL);
      console.error(chalk5.red(`\u274C ${msg}`));
      process.exit(EXIT_CODES.GENERAL);
    }
    const VALID_STATUSES = ["up", "down", "maintenance"];
    const statusKey = (opts.status ?? "up").toLowerCase();
    if (!VALID_STATUSES.includes(statusKey)) {
      const msg = `Invalid status "${opts.status}". Valid: up, down, maintenance`;
      if (json) jsonError(msg, EXIT_CODES.GENERAL);
      console.error(chalk5.red(`\u274C ${msg}`));
      process.exit(EXIT_CODES.GENERAL);
    }
    let baseUrl = opts.url;
    if (!baseUrl) {
      if (opts.instance) {
        const inst = getInstanceConfig(opts.instance);
        if (!inst) {
          const msg = `Instance "${opts.instance}" not found. Run: kuma instance list`;
          if (json) jsonError(msg, EXIT_CODES.AUTH);
          console.error(chalk5.red(`\u274C ${msg}`));
          process.exit(EXIT_CODES.AUTH);
        }
        baseUrl = inst.url;
      } else {
        const config = getConfig();
        if (!config) {
          const msg = "No --url specified and not logged in. Run: kuma login <url> or pass --url";
          if (json) jsonError(msg, EXIT_CODES.AUTH);
          console.error(chalk5.red(`\u274C ${msg}`));
          process.exit(EXIT_CODES.AUTH);
        }
        baseUrl = config.url;
      }
    }
    const pushUrl = new URL(`${baseUrl.replace(/\/$/, "")}/api/push/${pushToken}`);
    pushUrl.searchParams.set("status", statusKey);
    if (opts.msg) pushUrl.searchParams.set("msg", opts.msg);
    if (opts.ping) pushUrl.searchParams.set("ping", opts.ping);
    try {
      const res = await fetch(pushUrl.toString(), {
        signal: AbortSignal.timeout(1e4)
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const msg = `Push failed (HTTP ${res.status}): ${body || res.statusText}`;
        if (json) jsonError(msg, EXIT_CODES.GENERAL);
        console.error(chalk5.red(`\u274C ${msg}`));
        process.exit(EXIT_CODES.GENERAL);
      }
      const data = await res.json().catch(() => ({ ok: true }));
      if (data.ok === false) {
        const msg = data.msg ?? "Kuma rejected the push heartbeat";
        if (json) jsonError(msg, EXIT_CODES.GENERAL);
        console.error(chalk5.red(`\u274C ${msg}`));
        process.exit(EXIT_CODES.GENERAL);
      }
      if (json) {
        jsonOut({ pushToken, status: statusKey, msg: opts.msg ?? null });
      }
      success(`Push heartbeat sent (${statusKey}${opts.msg ? ` \u2014 ${opts.msg}` : ""})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (json) jsonError(msg, EXIT_CODES.CONNECTION);
      console.error(chalk5.red(`\u274C ${msg}`));
      process.exit(EXIT_CODES.CONNECTION);
    }
  });
}

// src/commands/status-pages.ts
import chalk6 from "chalk";
function statusPagesCommand(program2) {
  const sp = program2.command("status-pages").description("View and manage public-facing status pages").addHelpText(
    "after",
    `
${chalk6.dim("Subcommands:")}
  ${chalk6.cyan("status-pages list")}   List all status pages with their slugs and publish state

${chalk6.dim("Run")} ${chalk6.cyan("kuma status-pages <subcommand> --help")} ${chalk6.dim("for examples.")}
`
  );
  sp.command("list").description("List all status pages with title, slug, and published state").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk6.dim("Examples:")}
  ${chalk6.cyan("kuma status-pages list")}
  ${chalk6.cyan("kuma status-pages list --json")}
  ${chalk6.cyan("kuma status-pages list --json | jq '.data[] | select(.published) | .slug'")}
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    try {
      const { client, instanceName } = await resolveClient(opts);
      const instanceUrl = getInstanceConfig(instanceName)?.url ?? "";
      const pages = await client.getStatusPageList();
      client.disconnect();
      const list = Object.values(pages);
      if (json) {
        jsonOut(list);
      }
      if (list.length === 0) {
        console.log("No status pages found.");
        return;
      }
      const table = createTable(["ID", "Title", "Slug", "Published", "URL"]);
      list.forEach((page) => {
        const url = `${instanceUrl}/status/${page.slug}`;
        table.push([
          String(page.id),
          page.title,
          page.slug,
          page.published ? chalk6.green("Yes") : chalk6.gray("No"),
          url
        ]);
      });
      console.log(table.toString());
    } catch (err) {
      handleError(err, opts);
    }
  });
}

// src/commands/upgrade.ts
import { execSync } from "child_process";
import { readFileSync as readFileSync2 } from "fs";
import { join as join2, dirname as dirname2 } from "path";
import { fileURLToPath } from "url";
import chalk7 from "chalk";
function readCurrentVersion() {
  const __dirname2 = dirname2(fileURLToPath(import.meta.url));
  try {
    const pkgPath = join2(__dirname2, "..", "package.json");
    const raw = readFileSync2(pkgPath, "utf8");
    const pkg2 = JSON.parse(raw);
    if (pkg2.version) return pkg2.version;
  } catch {
  }
  try {
    const pkgPath = join2(__dirname2, "package.json");
    const raw = readFileSync2(pkgPath, "utf8");
    const pkg2 = JSON.parse(raw);
    if (pkg2.version) return pkg2.version;
  } catch {
  }
  return "unknown";
}
async function fetchLatestRelease() {
  try {
    const res = await fetch(
      "https://api.github.com/repos/pablofmorales/kuma-cli/releases/latest",
      {
        headers: {
          "User-Agent": "kuma-cli-upgrade",
          Accept: "application/vnd.github+json"
        },
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
function compareSemver(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }
  return 0;
}
function upgradeCommand(program2) {
  program2.command("upgrade").description(
    "Update kuma-cli to the latest version from GitHub"
  ).option("--json", "Output as JSON ({ ok, data })").addHelpText(
    "after",
    `
${chalk7.dim("Examples:")}
  ${chalk7.cyan("kuma upgrade")}              Check for updates and upgrade if available
  ${chalk7.cyan("kuma upgrade --json")}       Machine-readable upgrade result
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    const current = readCurrentVersion();
    if (!json) {
      console.log(`Current version: ${chalk7.cyan(`v${current}`)}`);
      process.stdout.write("Checking for latest release\u2026 ");
    }
    const release = await fetchLatestRelease();
    if (!release) {
      if (!json) console.log(chalk7.red("failed"));
      const msg = "Could not reach GitHub. Check your internet connection and try again.";
      if (json) jsonError(msg, 2);
      console.error(chalk7.red(`
\u274C ${msg}`));
      process.exit(2);
    }
    const latest = release.tag_name.replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+$/.test(latest)) {
      const msg = `Security alert: Invalid version tag received from GitHub ("${latest}"). Upgrade aborted.`;
      if (json) jsonError(msg, 3);
      console.error(chalk7.red(`
\u274C ${msg}`));
      process.exit(3);
    }
    if (!json) console.log(chalk7.green("done"));
    if (compareSemver(current, latest) >= 0) {
      if (json) {
        jsonOut({ current, latest, upgraded: false, reason: "Already up to date" });
      }
      console.log(
        `Latest version: ${chalk7.cyan(`v${latest}`)}
` + chalk7.green("\u2705 Already up to date \u2014 nothing to do.")
      );
      return;
    }
    if (!json) {
      console.log(`Latest version:  ${chalk7.cyan(`v${latest}`)}`);
      console.log(
        `
${chalk7.bold(`Upgrading kuma-cli`)} ${chalk7.dim(`v${current}`)} \u2192 ${chalk7.green(`v${latest}`)}\u2026`
      );
    }
    try {
      execSync(`npm install -g @blackasteroid/kuma-cli@${latest}`, {
        stdio: json ? "pipe" : "inherit"
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isPermission = raw.toLowerCase().includes("permission") || raw.toLowerCase().includes("eacces") || raw.toLowerCase().includes("eperm");
      if (json) {
        jsonError(
          isPermission ? "Permission denied. Try running with elevated permissions (sudo)." : `Upgrade failed: ${raw}`,
          isPermission ? 4 : 1
        );
      }
      if (isPermission) {
        console.error(
          chalk7.red("\n\u274C Permission denied.") + " Try running with elevated permissions:\n" + chalk7.cyan("   sudo kuma upgrade")
        );
      } else {
        console.error(chalk7.red(`
\u274C Upgrade failed: ${raw}`));
      }
      process.exit(isPermission ? 4 : 1);
    }
    if (json) {
      jsonOut({ current, latest, upgraded: true });
    }
    console.log(
      chalk7.green(`
\u2705 kuma-cli upgraded to v${latest} successfully!`)
    );
  });
}

// src/commands/notifications.ts
import chalk8 from "chalk";
import * as fs2 from "fs";
function resolveSecret(value) {
  if (value === void 0) return void 0;
  if (value.startsWith("$")) {
    const varName = value.slice(1);
    const resolved = process.env[varName];
    if (!resolved) {
      return void 0;
    }
    return resolved;
  }
  if (value === "-") {
    try {
      const buf = Buffer.alloc(4096);
      const n = fs2.readSync(0, buf, 0, buf.length, null);
      return buf.toString("utf8", 0, n).trim();
    } catch {
      return void 0;
    }
  }
  return value;
}
function notificationsCommand(program2) {
  const notifications = program2.command("notifications").description("Manage notification channels (Discord, Telegram, webhook, ...)").addHelpText(
    "after",
    `
${chalk8.dim("Subcommands:")}
  ${chalk8.cyan("notifications list")}                     List all notification channels
  ${chalk8.cyan("notifications create --type discord ...")} Create a new notification channel
  ${chalk8.cyan("notifications delete <id>")}              Delete a notification channel

${chalk8.dim("Run")} ${chalk8.cyan("kuma notifications <subcommand> --help")} ${chalk8.dim("for examples.")}
`
  );
  notifications.command("list").description("List all configured notification channels with their IDs and types").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk8.dim("Examples:")}
  ${chalk8.cyan("kuma notifications list")}
  ${chalk8.cyan("kuma notifications list --json")}
  ${chalk8.cyan("kuma notifications list --json | jq '.data[] | {id, name}'")}
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    try {
      const { client } = await resolveClient(opts);
      const list = await client.getNotificationList();
      client.disconnect();
      if (json) {
        const enriched = list.map((n) => {
          try {
            const parsed = JSON.parse(n.config);
            return { ...n, config: parsed };
          } catch {
            return n;
          }
        });
        jsonOut(enriched);
      }
      if (list.length === 0) {
        console.log("No notification channels configured.");
        return;
      }
      const table = createTable(["ID", "Name", "Type", "Default", "Active"]);
      list.forEach((n) => {
        let type = "\u2014";
        try {
          const parsed = JSON.parse(n.config);
          type = parsed.type ?? "\u2014";
        } catch {
        }
        table.push([
          String(n.id),
          n.name,
          type,
          n.isDefault ? chalk8.green("Yes") : chalk8.gray("No"),
          n.active ? chalk8.green("Yes") : chalk8.red("No")
        ]);
      });
      console.log(table.toString());
      console.log(`
${list.length} notification channel(s)`);
    } catch (err) {
      handleError(err, opts);
    }
  });
  notifications.command("create").description("Create a new notification channel").requiredOption("--type <type>", "Notification type: discord, telegram, slack, webhook, ...").requiredOption("--name <name>", "Friendly name for this notification channel").option("--discord-webhook <url|$VAR>", "Discord webhook URL \u2014 pass value or env var name like '$DISCORD_WEBHOOK'").option("--discord-username <name>", "Discord bot display name (optional)").option("--telegram-token <token|$VAR>", "Telegram bot token \u2014 pass value or env var name like '$TELEGRAM_TOKEN'").option("--telegram-chat-id <id>", "Telegram chat ID (required for --type telegram)").option("--slack-webhook <url|$VAR>", "Slack webhook URL \u2014 pass value or env var name like '$SLACK_WEBHOOK'").option("--webhook-url <url|$VAR>", "Webhook URL \u2014 pass value or env var name like '$WEBHOOK_URL'").option("--webhook-content-type <type>", "Webhook content type (default: application/json)", "application/json").option("--default", "Enable this notification by default on all new monitors").option("--apply-existing", "Apply this notification to all existing monitors immediately").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk8.dim("Examples:")}
  ${chalk8.cyan(`kuma notifications create --type discord --name "Alerts" --discord-webhook '$DISCORD_WEBHOOK'`)}
  ${chalk8.cyan(`kuma notifications create --type telegram --name "TG" --telegram-token '$TELEGRAM_TOKEN' --telegram-chat-id -100...`)}
  ${chalk8.cyan(`kuma notifications create --type webhook --name "My Hook" --webhook-url '$WEBHOOK_URL'`)}
  ${chalk8.cyan(`kuma notifications create --type discord --name "Default" --discord-webhook '$DISCORD_WEBHOOK' --default --apply-existing`)}

${chalk8.dim("\u26A0\uFE0F  Security: never pass secrets as literal flag values \u2014 use env vars:")}
  ${chalk8.cyan("export DISCORD_WEBHOOK=https://discord.com/api/webhooks/...")}
  ${chalk8.cyan(`kuma notifications create --type discord --name "Alerts" --discord-webhook '\\$DISCORD_WEBHOOK'`)}

${chalk8.dim("Supported types:")}
  discord, telegram, slack, webhook, gotify, ntfy, pushover, matrix, mattermost, teams ...
  (full list at https://uptime.kuma.pet/docs)
`
  ).action(async (opts) => {
    const json = isJsonMode(opts);
    const payload = {
      name: opts.name,
      type: opts.type,
      isDefault: opts.default ?? false,
      active: true,
      applyExisting: opts.applyExisting ?? false
    };
    const discordWebhook = resolveSecret(opts.discordWebhook);
    const telegramToken = resolveSecret(opts.telegramToken);
    const slackWebhook = resolveSecret(opts.slackWebhook);
    const webhookUrl = resolveSecret(opts.webhookUrl);
    switch (opts.type.toLowerCase()) {
      case "discord":
        if (!discordWebhook) {
          handleError(new Error("--discord-webhook is required for --type discord (pass value or '$ENV_VAR_NAME')"), opts);
        }
        payload.discordWebhookUrl = discordWebhook;
        if (opts.discordUsername) payload.discordUsername = opts.discordUsername;
        break;
      case "telegram":
        if (!telegramToken || !opts.telegramChatId) {
          handleError(new Error("--telegram-token and --telegram-chat-id are required for --type telegram"), opts);
        }
        payload.telegramBotToken = telegramToken;
        payload.telegramChatID = opts.telegramChatId;
        break;
      case "slack":
        if (!slackWebhook) {
          handleError(new Error("--slack-webhook is required for --type slack (pass value or '$ENV_VAR_NAME')"), opts);
        }
        payload.slackwebhookURL = slackWebhook;
        break;
      case "webhook":
        if (!webhookUrl) {
          handleError(new Error("--webhook-url is required for --type webhook (pass value or '$ENV_VAR_NAME')"), opts);
        }
        payload.webhookURL = webhookUrl;
        payload.webhookContentType = opts.webhookContentType ?? "application/json";
        break;
      default:
        if (!json) {
          console.log(chalk8.yellow(
            `\u26A0\uFE0F  Type "${opts.type}" may require additional fields not exposed as flags.
   The notification will be created but may need manual config in the UI.`
          ));
        }
    }
    try {
      const { client } = await resolveClient(opts);
      const id = await client.addNotification(payload);
      client.disconnect();
      if (json) {
        jsonOut({ id, name: opts.name, type: opts.type });
      }
      success(`Notification "${opts.name}" created (ID: ${id})`);
    } catch (err) {
      handleError(err, opts);
    }
  });
  notifications.command("delete <id>").description("Permanently delete a notification channel").option("--force", "Skip the confirmation prompt").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").addHelpText(
    "after",
    `
${chalk8.dim("Examples:")}
  ${chalk8.cyan("kuma notifications delete 3")}
  ${chalk8.cyan("kuma notifications delete 3 --force")}
  ${chalk8.cyan("kuma notifications delete 3 --json")}
`
  ).action(async (id, opts) => {
    const json = isJsonMode(opts);
    const notifId = parseInt(id, 10);
    if (isNaN(notifId) || notifId <= 0) {
      handleError(new Error(`Invalid notification ID: "${id}". Must be a positive integer.`), opts);
    }
    if (!opts.force && !json) {
      const enquirer3 = await import("enquirer");
      const { prompt: prompt3 } = enquirer3.default;
      const { confirm } = await prompt3({
        type: "confirm",
        name: "confirm",
        message: `Delete notification ${id}?`,
        initial: false
      });
      if (!confirm) {
        console.log("Aborted.");
        return;
      }
    }
    try {
      const { client } = await resolveClient(opts);
      await client.deleteNotification(notifId);
      client.disconnect();
      if (json) {
        jsonOut({ id: notifId, deleted: true });
      }
      success(`Notification ${id} deleted`);
    } catch (err) {
      handleError(err, opts);
    }
  });
}

// src/commands/config.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "fs";
import yaml from "js-yaml";
import chalk9 from "chalk";
var FORBIDDEN_NOTIFICATION_FIELDS = /* @__PURE__ */ new Set([
  "__proto__",
  "constructor",
  "prototype",
  // Kuma internal columns that shouldn't be overridden via config blob
  "id",
  "user_id"
]);
function configCommand(program2) {
  const cfg = program2.command("config").description("Export and import Kuma configuration");
  cfg.command("export").description("Export monitors and notifications to a file").option("--tag <tag>", "Export only monitors with this tag").option("--output <file>", "Output file path (JSON or YAML) or '-' for stdout", "-").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").action(async (opts) => {
    const json = isJsonMode(opts);
    try {
      const { client } = await resolveClient(opts);
      const monitorMap = await client.getMonitorList();
      const allMonitors = Object.values(monitorMap);
      const allNotifications = await client.getNotificationList();
      client.disconnect();
      let targetMonitors = allMonitors;
      if (opts.tag) {
        const tagName = opts.tag.toLowerCase();
        targetMonitors = targetMonitors.filter(
          (m) => Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
        );
      }
      const exportedMonitors = targetMonitors.map((m) => {
        const { id, heartbeat, uptime, active, pushToken, ...rest } = m;
        return { ...rest };
      });
      const usedNotifs = /* @__PURE__ */ new Set();
      targetMonitors.forEach((m) => {
        if (m.notificationIDList) {
          Object.entries(m.notificationIDList).forEach(([nid, enabled]) => {
            if (enabled) usedNotifs.add(nid);
          });
        }
      });
      const exportedNotifications = allNotifications.filter((n) => !opts.tag || usedNotifs.has(String(n.id))).map((n) => {
        const { id, active, ...rest } = n;
        let parsedConfig = {};
        try {
          parsedConfig = JSON.parse(n.config);
        } catch {
        }
        const cleanConfig = Object.fromEntries(
          Object.entries(parsedConfig).map(([k, v]) => {
            const lower = k.toLowerCase();
            if (lower.includes("token") || lower.includes("password") || lower.includes("webhook") || lower.includes("secret")) {
              return [k, "********"];
            }
            return [k, v];
          })
        );
        return { ...rest, config: JSON.stringify(cleanConfig) };
      });
      const exportData = {
        version: "1",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        monitors: exportedMonitors,
        notifications: exportedNotifications
      };
      if (json && opts.output === "-") {
        jsonOut(exportData);
      }
      let outputStr = "";
      if (opts.output.endsWith(".yaml") || opts.output.endsWith(".yml")) {
        outputStr = yaml.dump(exportData);
      } else {
        outputStr = JSON.stringify(exportData, null, 2);
      }
      if (opts.output === "-") {
        console.log(outputStr);
      } else {
        writeFileSync2(opts.output, outputStr, "utf8");
        if (!json) success(`Configuration exported to ${opts.output}`);
      }
    } catch (err) {
      handleError(err, opts);
    }
  });
  cfg.command("import <file>").description("Import monitors and notifications from an export file").option("--on-conflict <action>", "What to do if monitor exists by name: skip, update", "skip").option("--dry-run", "Preview what would be created/updated without saving").option("--json", "Output as JSON ({ ok, data })").option("--instance <name>", "Target a specific instance").action(async (file, opts) => {
    const json = isJsonMode(opts);
    try {
      const raw = readFileSync3(file, "utf8");
      let data;
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
      } else {
        data = JSON.parse(raw);
      }
      if (data.version !== "1" || !Array.isArray(data.monitors)) {
        throw new Error("Invalid export file format");
      }
      const { client } = await resolveClient(opts);
      const existingMonitors = Object.values(await client.getMonitorList());
      const existingMap = new Map(existingMonitors.map((m) => [m.name, m]));
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      for (const m of data.monitors) {
        const existing = existingMap.get(m.name);
        if (existing) {
          if (opts.onConflict === "update") {
            updatedCount++;
            if (!opts.dryRun) {
              const { tags, notificationIDList, ...patch } = m;
              await client.editMonitor(existing.id, patch);
            }
          } else {
            skippedCount++;
          }
        } else {
          createdCount++;
          if (!opts.dryRun) {
            const { tags, notificationIDList, ...payload } = m;
            await client.addMonitor(payload);
          }
        }
      }
      const existingNotifications = await client.getNotificationList();
      const existingNotifMap = new Map(existingNotifications.map((n) => [n.name, n]));
      let createdNotifCount = 0;
      let updatedNotifCount = 0;
      let skippedNotifCount = 0;
      for (const n of data.notifications || []) {
        const existing = existingNotifMap.get(n.name);
        if (existing) {
          if (opts.onConflict === "update") {
            updatedNotifCount++;
            if (!opts.dryRun) {
              let parsedConfig = {};
              try {
                parsedConfig = JSON.parse(n.config);
              } catch {
              }
              const safeConfig = {};
              for (const [k, v] of Object.entries(parsedConfig)) {
                if (FORBIDDEN_NOTIFICATION_FIELDS.has(k) || k.startsWith("__")) {
                  if (!json) console.warn(chalk9.yellow(`\u26A0\uFE0F  Ignored forbidden notification field: ${k}`));
                } else {
                  safeConfig[k] = v;
                }
              }
              await client.addNotification({ ...safeConfig, name: n.name, type: safeConfig.type || n.type }, existing.id);
            }
          } else {
            skippedNotifCount++;
          }
        } else {
          createdNotifCount++;
          if (!opts.dryRun) {
            let parsedConfig = {};
            try {
              parsedConfig = JSON.parse(n.config);
            } catch {
            }
            const safeConfig = {};
            for (const [k, v] of Object.entries(parsedConfig)) {
              if (FORBIDDEN_NOTIFICATION_FIELDS.has(k) || k.startsWith("__")) {
                if (!json) console.warn(chalk9.yellow(`\u26A0\uFE0F  Ignored forbidden notification field: ${k}`));
              } else {
                safeConfig[k] = v;
              }
            }
            await client.addNotification({ ...safeConfig, name: n.name, type: safeConfig.type || n.type });
          }
        }
      }
      client.disconnect();
      if (json) {
        jsonOut({
          dryRun: !!opts.dryRun,
          monitors: { created: createdCount, updated: updatedCount, skipped: skippedCount },
          notifications: { created: createdNotifCount, updated: updatedNotifCount, skipped: skippedNotifCount }
        });
      }
      if (opts.dryRun) {
        console.log(chalk9.yellow("Dry run summary:"));
      } else {
        success("Import complete:");
      }
      console.log(chalk9.bold("\nMonitors:"));
      console.log(`  Created: ${createdCount}`);
      console.log(`  Updated: ${updatedCount}`);
      console.log(`  Skipped: ${skippedCount}`);
      console.log(chalk9.bold("\nNotifications:"));
      console.log(`  Created: ${createdNotifCount}`);
      console.log(`  Updated: ${updatedNotifCount}`);
      console.log(`  Skipped: ${skippedNotifCount}`);
    } catch (err) {
      handleError(err, opts);
    }
  });
}

// src/commands/instances.ts
function instancesCommand(program2) {
  const instances = program2.command("instances").description("Manage saved Uptime Kuma instances (added via kuma login --as <alias>)");
  instances.command("list").description("List all saved instances and their aliases").option("--json", "Output as JSON").action((opts) => {
    const all = getAllInstances();
    const active = getActiveContext();
    const names = Object.keys(all);
    if (names.length === 0) {
      if (isJsonMode(opts)) return jsonOut({ instances: [] });
      warn("No instances configured. Run: kuma login <url>");
      return;
    }
    if (isJsonMode(opts)) {
      const data = names.map((name) => ({
        name,
        url: all[name].url,
        active: active?.type === "instance" && active.name === name,
        token: all[name].token.slice(0, 4) + "..." + all[name].token.slice(-4)
      }));
      return jsonOut({ instances: data });
    }
    const table = createTable(["", "Name", "URL", "Token"]);
    for (const name of names) {
      const isActive = active?.type === "instance" && active.name === name;
      table.push([
        isActive ? "\u2192" : "",
        name,
        all[name].url,
        all[name].token.slice(0, 4) + "..." + all[name].token.slice(-4)
      ]);
    }
    console.log(table.toString());
  });
  instances.command("remove <name>").description("Remove a saved instance by its alias").option("--force", "Skip confirmation").option("--json", "Output as JSON").action(async (name, opts) => {
    const clusterName = getInstanceCluster(name);
    if (clusterName) {
      const msg = `Instance '${name}' belongs to cluster '${clusterName}'. Remove it from the cluster first.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    if (!opts.force && !isJsonMode(opts)) {
      const enquirer3 = await import("enquirer");
      const { prompt: prompt3 } = enquirer3.default;
      const { confirm } = await prompt3({
        type: "confirm",
        name: "confirm",
        message: `Remove instance '${name}'?`,
        initial: false
      });
      if (!confirm) return;
    }
    const removed = removeInstanceConfig(name);
    if (!removed) {
      const msg = `Instance '${name}' not found.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    if (isJsonMode(opts)) return jsonOut({ removed: name });
    success(`Removed instance '${name}'`);
  });
}

// src/commands/use.ts
import chalk10 from "chalk";
function useCommand(program2) {
  program2.command("use [name]").description("Switch the active instance or cluster (affects all subsequent commands)").option("--cluster <name>", "Set a cluster as active context (commands default to its primary instance)").option("--json", "Output as JSON").addHelpText(
    "after",
    `
${chalk10.dim("Arguments:")}
  ${chalk10.cyan("[name]")}  The alias of an instance (as set with ${chalk10.cyan("kuma login --as <alias>")})

${chalk10.dim("Examples:")}
  ${chalk10.cyan("kuma use server1")}                  ${chalk10.dim("# Switch to instance 'server1'")}
  ${chalk10.cyan("kuma use --cluster my-cluster")}     ${chalk10.dim("# Switch to cluster (uses its primary)")}
  ${chalk10.cyan("kuma instances list")}               ${chalk10.dim("# See available instance aliases")}
  ${chalk10.cyan("kuma cluster list")}                 ${chalk10.dim("# See available cluster names")}

${chalk10.dim("Once active, all commands target that instance unless overridden with --instance or --cluster.")}
`
  ).action((name, opts) => {
    if (opts.cluster) {
      const cluster = getClusterConfig(opts.cluster);
      if (!cluster) {
        const all = Object.keys(getAllClusters());
        const msg = all.length ? `Cluster '${opts.cluster}' not found. Available: ${all.join(", ")}` : `Cluster '${opts.cluster}' not found. No clusters configured.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }
      setActiveContext({ type: "cluster", name: opts.cluster });
      if (isJsonMode(opts)) return jsonOut({ active: { type: "cluster", name: opts.cluster, primary: cluster.primary } });
      success(`Active context: cluster '${opts.cluster}' (primary: ${cluster.primary})`);
      return;
    }
    if (!name) {
      const msg = "Specify an instance name. Run: kuma instances list";
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    const inst = getInstanceConfig(name);
    if (!inst) {
      const all = Object.keys(getAllInstances());
      const msg = all.length ? `Instance '${name}' not found. Available: ${all.join(", ")}` : `Instance '${name}' not found. No instances configured.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    setActiveContext({ type: "instance", name });
    if (isJsonMode(opts)) return jsonOut({ active: { type: "instance", name } });
    success(`Active instance: '${name}' (${inst.url})`);
  });
}

// src/commands/cluster.ts
import chalk11 from "chalk";
function clusterCommand(program2) {
  const cluster = program2.command("cluster").description("Manage clusters of Uptime Kuma instances for high availability");
  cluster.command("create <name>").description("Create a cluster from existing instances").requiredOption("--instances <names>", "Comma-separated instance aliases (from kuma login --as)").requiredOption("--primary <name>", "Instance alias to use as the primary (source of truth)").option("--json", "Output as JSON").addHelpText(
    "after",
    `
${chalk11.dim("Arguments:")}
  ${chalk11.cyan("<name>")}  Any label you choose for this cluster (e.g. "ha-group", "prod-backup")

${chalk11.dim("How it works:")}
  1. First, login to each Uptime Kuma server and give it an alias:
     ${chalk11.cyan("kuma login https://kuma1.example.com --as server1")}
     ${chalk11.cyan("kuma login https://kuma2.example.com --as server2")}

  2. Then create a cluster using those aliases:
     ${chalk11.cyan("kuma cluster create my-cluster --instances server1,server2 --primary server1")}

  3. Sync the primary's monitors to all secondaries:
     ${chalk11.cyan("kuma cluster sync my-cluster")}

${chalk11.dim("The --primary is the source of truth \u2014 its monitors and notifications")}
${chalk11.dim("will be replicated to the other instances during sync.")}
`
  ).action((name, opts) => {
    const instanceNames = opts.instances.split(",").map((s) => s.trim());
    for (const inst of instanceNames) {
      if (!getInstanceConfig(inst)) {
        const msg = `Instance '${inst}' not found. Run: kuma instances list`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }
    }
    if (!instanceNames.includes(opts.primary)) {
      const msg = `Primary '${opts.primary}' must be one of: ${instanceNames.join(", ")}`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    if (instanceNames.length < 2) {
      const msg = "A cluster requires at least 2 instances.";
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    if (getClusterConfig(name)) {
      const msg = `Cluster '${name}' already exists. Remove it first: kuma cluster remove ${name}`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    saveClusterConfig(name, { instances: instanceNames, primary: opts.primary });
    if (isJsonMode(opts)) return jsonOut({ cluster: name, instances: instanceNames, primary: opts.primary });
    success(`Cluster '${name}' created with instances: ${instanceNames.join(", ")} (primary: ${opts.primary})`);
  });
  cluster.command("list").description("List all clusters").option("--json", "Output as JSON").action((opts) => {
    const all = getAllClusters();
    const names = Object.keys(all);
    if (names.length === 0) {
      if (isJsonMode(opts)) return jsonOut({ clusters: [] });
      warn("No clusters configured. Run: kuma cluster create <name> --instances a,b --primary a");
      return;
    }
    if (isJsonMode(opts)) {
      return jsonOut({ clusters: names.map((n) => ({ name: n, ...all[n] })) });
    }
    const table = createTable(["Name", "Instances", "Primary"]);
    for (const n of names) {
      table.push([n, all[n].instances.join(", "), all[n].primary]);
    }
    console.log(table.toString());
  });
  cluster.command("remove <name>").description("Remove a cluster definition (does not delete instances or health monitors)").option("--force", "Skip confirmation").option("--json", "Output as JSON").action(async (name, opts) => {
    if (!getClusterConfig(name)) {
      const msg = `Cluster '${name}' not found.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    if (!opts.force && !isJsonMode(opts)) {
      const enquirer3 = await import("enquirer");
      const { prompt: prompt3 } = enquirer3.default;
      const { confirm } = await prompt3({
        type: "confirm",
        name: "confirm",
        message: `Remove cluster '${name}'? (instances and health monitors will not be deleted)`,
        initial: false
      });
      if (!confirm) return;
    }
    removeClusterConfig(name);
    if (isJsonMode(opts)) return jsonOut({ removed: name });
    success(`Removed cluster '${name}'`);
  });
  cluster.command("info <name>").description("Show cluster details with live instance status").option("--json", "Output as JSON").action(async (name, opts) => {
    const clusterConfig = getClusterConfig(name);
    if (!clusterConfig) {
      const msg = `Cluster '${name}' not found.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    if (!isJsonMode(opts)) info(`Cluster: ${name}
`);
    const results = await Promise.allSettled(
      clusterConfig.instances.map(async (instanceName) => {
        const config = getInstanceConfig(instanceName);
        if (!config) return { instanceName, reachable: false, error: "Not configured", monitors: 0, healthMonitors: [] };
        try {
          const client = await createAuthenticatedClient(config.url, config.token);
          const monitorMap = await client.getMonitorList();
          const monitors = Object.values(monitorMap);
          const healthMonitors = monitors.filter((m) => m.name.startsWith("[cluster] "));
          client.disconnect();
          return {
            instanceName,
            reachable: true,
            monitors: monitors.length - healthMonitors.length,
            healthMonitors: healthMonitors.map((m) => ({ name: m.name, status: m.heartbeat?.status }))
          };
        } catch (err) {
          return {
            instanceName,
            reachable: false,
            error: err instanceof Error ? err.message : String(err),
            monitors: 0,
            healthMonitors: []
          };
        }
      })
    );
    const instanceData = results.map(
      (r) => r.status === "fulfilled" ? r.value : { instanceName: "unknown", reachable: false, error: "Connection failed", monitors: 0, healthMonitors: [] }
    );
    if (isJsonMode(opts)) return jsonOut({ cluster: name, primary: clusterConfig.primary, instances: instanceData });
    const table = createTable(["", "Instance", "URL", "Reachable", "Monitors", "Health Monitors"]);
    for (const inst of instanceData) {
      const config = getInstanceConfig(inst.instanceName);
      const isPrimary = inst.instanceName === clusterConfig.primary;
      const healthStr = inst.healthMonitors.length ? inst.healthMonitors.map((h) => `${h.name}: ${statusLabel(h.status ?? 2)}`).join(", ") : isPrimary ? "\u2014" : "none";
      table.push([
        isPrimary ? "\u2192" : "",
        inst.instanceName,
        config?.url ?? "N/A",
        inst.reachable ? "yes" : `no (${inst.error ?? "unknown"})`,
        String(inst.monitors),
        healthStr
      ]);
    }
    console.log(table.toString());
  });
  cluster.command("sync <name>").description("Sync monitors and notifications from the primary instance to all secondaries").option("--dry-run", "Show what would be synced without making changes").option("--json", "Output as JSON").addHelpText(
    "after",
    `
${chalk11.dim("Arguments:")}
  ${chalk11.cyan("<name>")}  The cluster name (as created with ${chalk11.cyan("kuma cluster create")})

${chalk11.dim("What gets synced:")}
  1. ${chalk11.bold("Monitors")} from the primary are replicated to each secondary.
     Existing monitors (matched by name + type + URL) are skipped.
  2. ${chalk11.bold("Health monitors")} are created so each instance checks the others.
  3. ${chalk11.bold("Notifications")} are copied to secondaries but ${chalk11.yellow("kept disabled")}
     to avoid duplicate alerts. The primary owns active notifications.

${chalk11.dim("Examples:")}
  ${chalk11.cyan("kuma cluster sync my-cluster --dry-run")}   ${chalk11.dim("# Preview without changes")}
  ${chalk11.cyan("kuma cluster sync my-cluster")}             ${chalk11.dim("# Run the actual sync")}

${chalk11.dim("Sync is idempotent \u2014 safe to run multiple times.")}
`
  ).action(async (name, opts) => {
    const clusterConfig = getClusterConfig(name);
    if (!clusterConfig) {
      const msg = `Cluster '${name}' not found.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    const primaryConfig = getInstanceConfig(clusterConfig.primary);
    if (!primaryConfig) {
      const msg = `Primary instance '${clusterConfig.primary}' not configured.`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    let primaryClient;
    try {
      primaryClient = await createAuthenticatedClient(primaryConfig.url, primaryConfig.token);
    } catch (err) {
      const msg = `Cannot connect to primary '${clusterConfig.primary}': ${err instanceof Error ? err.message : err}`;
      if (isJsonMode(opts)) return jsonError(msg);
      error(msg);
      process.exit(1);
    }
    const secondaries = clusterConfig.instances.filter((i) => i !== clusterConfig.primary);
    const secClients = {};
    for (const secName of secondaries) {
      const secConfig = getInstanceConfig(secName);
      if (!secConfig) {
        if (!isJsonMode(opts)) warn(`Skipping '${secName}': not configured`);
        continue;
      }
      try {
        secClients[secName] = await createAuthenticatedClient(secConfig.url, secConfig.token);
      } catch (err) {
        if (!isJsonMode(opts)) warn(`Skipping '${secName}': ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }
    try {
      const primaryMonitorMap = await primaryClient.getMonitorList();
      const primaryMonitors = Object.values(primaryMonitorMap);
      const monitorsToSync = primaryMonitors.filter(
        (m) => !m.name.startsWith("[cluster] ")
      );
      if (!isJsonMode(opts)) {
        info(`Syncing cluster '${name}' (primary: ${clusterConfig.primary})`);
        info(`Monitors to sync: ${monitorsToSync.length}`);
      }
      const syncResults = {};
      for (const secName of secondaries) {
        if (!secClients[secName]) {
          syncResults[secName] = { created: 0, skipped: 0, failed: monitorsToSync.length };
          continue;
        }
        const secClient = secClients[secName];
        const secMonitorMap = await secClient.getMonitorList();
        const secMonitors = Object.values(secMonitorMap);
        let created = 0, skipped = 0, failed = 0;
        for (const monitor of monitorsToSync) {
          const exists = secMonitors.some(
            (m) => m.name === monitor.name && m.type === monitor.type && (m.url === monitor.url || m.hostname === monitor.hostname)
          );
          if (exists) {
            skipped++;
            continue;
          }
          if (opts.dryRun) {
            created++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would create: ${monitor.name} (${monitor.type})`);
            continue;
          }
          try {
            const { id, heartbeat, uptime, active, tags, notificationIDList, ...monitorData } = monitor;
            await secClient.addMonitor(monitorData);
            created++;
          } catch (err) {
            failed++;
            if (!isJsonMode(opts)) warn(`  Failed to create '${monitor.name}' on ${secName}: ${err instanceof Error ? err.message : err}`);
          }
        }
        syncResults[secName] = { created, skipped, failed };
      }
      let healthCreated = 0, healthSkipped = 0;
      for (const instanceName of clusterConfig.instances) {
        const client = instanceName === clusterConfig.primary ? primaryClient : secClients[instanceName];
        if (!client) continue;
        const monitorMap = await client.getMonitorList();
        const monitors = Object.values(monitorMap);
        const otherInstances = clusterConfig.instances.filter((i) => i !== instanceName);
        for (const otherName of otherInstances) {
          const otherConfig = getInstanceConfig(otherName);
          if (!otherConfig) continue;
          const exists = monitors.some((m) => m.url === otherConfig.url || m.url === otherConfig.url + "/");
          if (exists) {
            healthSkipped++;
            continue;
          }
          if (opts.dryRun) {
            healthCreated++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would create health monitor: ${instanceName} -> ${otherName}`);
            continue;
          }
          try {
            await client.addMonitor({
              name: `[cluster] ${otherName}`,
              type: "http",
              url: otherConfig.url,
              interval: 60
            });
            healthCreated++;
          } catch (err) {
            if (!isJsonMode(opts)) warn(`  Failed to create health monitor on ${instanceName} -> ${otherName}: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
      const primaryNotifications = await primaryClient.getNotificationList();
      let notifSynced = 0, notifSkipped = 0;
      for (const secName of secondaries) {
        const secClient = secClients[secName];
        if (!secClient) continue;
        const secNotifications = await secClient.getNotificationList();
        for (const notif of primaryNotifications) {
          const exists = secNotifications.some((n) => n.name === notif.name);
          if (exists) {
            notifSkipped++;
            continue;
          }
          if (opts.dryRun) {
            notifSynced++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would sync notification: ${notif.name} (disabled)`);
            continue;
          }
          try {
            const config = typeof notif.config === "string" ? JSON.parse(notif.config) : notif.config;
            await secClient.addNotification({
              ...config,
              name: notif.name,
              active: false,
              isDefault: false
            });
            notifSynced++;
          } catch (err) {
            if (!isJsonMode(opts)) warn(`  Failed to sync notification '${notif.name}' to ${secName}: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
      if (isJsonMode(opts)) {
        return jsonOut({
          cluster: name,
          dryRun: opts.dryRun ?? false,
          monitors: syncResults,
          health: { created: healthCreated, skipped: healthSkipped },
          notifications: { synced: notifSynced, skipped: notifSkipped }
        });
      }
      console.log("");
      for (const [secName, result] of Object.entries(syncResults)) {
        info(`${clusterConfig.primary} \u2192 ${secName}: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`);
      }
      info(`Health monitors: ${healthCreated} created, ${healthSkipped} skipped`);
      info(`Notifications: ${notifSynced} synced (disabled on secondaries), ${notifSkipped} skipped`);
      if (opts.dryRun) warn("Dry run \u2014 no changes were made.");
      else success("Sync complete.");
    } finally {
      primaryClient.disconnect();
      for (const client of Object.values(secClients)) {
        client.disconnect();
      }
    }
  });
}

// src/tui/render.tsx
import { render } from "ink";

// src/tui/app.tsx
import { useState as useState10, useCallback as useCallback5, useEffect as useEffect4 } from "react";
import { Box as Box13, Text as Text14, useApp, useInput as useInput7 } from "ink";

// src/tui/components/header.tsx
import { Box, Text } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var LOGO = [
  " _  ___   _ __  __    _      ___ _    ___ ",
  "| |/ / | | |  \\/  |  /_\\    / __| |  |_ _|",
  "| ' <| |_| | |\\/| | / _ \\  | (__| |__ | | ",
  "|_|\\_\\\\___/|_|  |_|/_/ \\_\\  \\___|____|___|"
];
var STATUS_NAMES = {
  0: "DOWN",
  1: "UP",
  2: "PENDING",
  3: "MAINTENANCE"
};
function Header({
  instanceName,
  connected,
  monitors,
  searchQuery,
  statusFilter,
  filteredCount
}) {
  const total = monitors.length;
  const up = monitors.filter((m) => m.status === 1).length;
  const down = monitors.filter((m) => m.status === 0).length;
  const pending = monitors.filter((m) => m.status === 2).length;
  const maint = monitors.filter((m) => m.status === 3).length;
  const hasFilters = searchQuery !== void 0 && searchQuery !== "" || statusFilter !== void 0 && statusFilter !== null;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: LOGO.map((line, i) => /* @__PURE__ */ jsx(Text, { color: "#db2777", bold: true, children: line }, i)) }),
    /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: instanceName }),
      /* @__PURE__ */ jsx(Text, { children: " " }),
      connected ? /* @__PURE__ */ jsx(Text, { color: "green", children: "[connected]" }) : /* @__PURE__ */ jsx(Text, { color: "red", children: "[disconnected]" })
    ] }),
    /* @__PURE__ */ jsx(Box, { children: hasFilters && filteredCount !== void 0 ? /* @__PURE__ */ jsxs(Text, { children: [
      filteredCount,
      " of ",
      total,
      " monitors (filtered)"
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(Text, { children: [
        total,
        " monitors: "
      ] }),
      /* @__PURE__ */ jsxs(Text, { color: "green", children: [
        up,
        " up"
      ] }),
      /* @__PURE__ */ jsx(Text, { children: ", " }),
      /* @__PURE__ */ jsxs(Text, { color: "red", children: [
        down,
        " down"
      ] }),
      pending > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { children: ", " }),
        /* @__PURE__ */ jsxs(Text, { color: "yellow", children: [
          pending,
          " pending"
        ] })
      ] }),
      maint > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { children: ", " }),
        /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
          maint,
          " maintenance"
        ] })
      ] })
    ] }) }),
    hasFilters && /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Active filters: " }),
      searchQuery && /* @__PURE__ */ jsxs(Text, { color: "yellow", children: [
        'search="',
        searchQuery,
        '" '
      ] }),
      statusFilter !== null && statusFilter !== void 0 && /* @__PURE__ */ jsxs(Text, { color: "yellow", children: [
        "status=",
        STATUS_NAMES[statusFilter] ?? "UNKNOWN"
      ] })
    ] })
  ] });
}

// src/tui/components/footer.tsx
import { Box as Box2, Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Footer({ view, mode, selectedStatus }) {
  if (view === "detail") {
    return /* @__PURE__ */ jsx2(Box2, { marginTop: 1, children: /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "Esc=back  r=refresh  i=instances  c=clusters  q=quit" }) });
  }
  if (mode === "search") {
    return /* @__PURE__ */ jsx2(Box2, { marginTop: 1, children: /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "Enter=confirm  Esc=clear and close" }) });
  }
  if (mode === "filter-menu") {
    return /* @__PURE__ */ jsx2(Box2, { marginTop: 1, children: /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "j/k=navigate  Enter=select  Esc=cancel" }) });
  }
  const isPaused = selectedStatus === 3;
  return /* @__PURE__ */ jsx2(Box2, { marginTop: 1, children: /* @__PURE__ */ jsxs2(Text2, { dimColor: true, children: [
    "q=quit  j/k=navigate  Enter=detail  r=refresh  /=search  f=filter",
    isPaused ? "  u=resume" : "  p=pause",
    "  d=delete  i=instances  c=clusters  h=help  Esc=clear"
  ] }) });
}

// src/tui/components/monitor-table.tsx
import { useState, useEffect } from "react";
import { Box as Box3, Text as Text4 } from "ink";

// src/tui/components/status-badge.tsx
import { Text as Text3 } from "ink";
import { jsx as jsx3 } from "react/jsx-runtime";
var STATUS_MAP = {
  0: { label: "DOWN", color: "red" },
  1: { label: "UP", color: "green" },
  2: { label: "PENDING", color: "yellow" },
  3: { label: "MAINT", color: "gray" }
};
function StatusBadge({ status }) {
  const info2 = STATUS_MAP[status] ?? { label: "UNKNOWN", color: "gray" };
  return /* @__PURE__ */ jsx3(Text3, { color: info2.color, children: "\u25CF " + info2.label });
}

// src/tui/components/monitor-table.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}
function pad(str, width) {
  const truncated = truncate(str, width);
  return truncated + " ".repeat(Math.max(0, width - truncated.length));
}
var COL_STATUS = 11;
var COL_NAME = 30;
var COL_TYPE = 8;
var COL_URL = 30;
var COL_UPTIME = 9;
var COL_PING = 9;
var COL_CHECKED = 12;
var CHROME_LINES = 12;
function MonitorTable({
  monitors,
  selectedIndex,
  loadingMonitorId,
  changedMonitorIds
}) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const termRows = process.stdout.rows ?? 40;
  const termWidth = process.stdout.columns ?? 120;
  const maxVisible = Math.max(1, termRows - CHROME_LINES);
  useEffect(() => {
    setScrollOffset((prev) => {
      if (selectedIndex < prev) return selectedIndex;
      if (selectedIndex >= prev + maxVisible) return selectedIndex - maxVisible + 1;
      return prev;
    });
  }, [selectedIndex, maxVisible]);
  if (monitors.length === 0) {
    return /* @__PURE__ */ jsx4(Box3, { children: /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No monitors match the current filters." }) });
  }
  const showUrl = termWidth >= 90;
  const showPing = termWidth >= 75;
  const showChecked = termWidth >= 100;
  const visibleMonitors = monitors.slice(scrollOffset, scrollOffset + maxVisible);
  const hasScrollUp = scrollOffset > 0;
  const hasScrollDown = scrollOffset + maxVisible < monitors.length;
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx4(Box3, { children: /* @__PURE__ */ jsxs3(Text4, { bold: true, dimColor: true, children: [
      pad("STATUS", COL_STATUS),
      pad("NAME", COL_NAME),
      pad("TYPE", COL_TYPE),
      showUrl ? pad("URL", COL_URL) : "",
      pad("UPTIME", COL_UPTIME),
      showPing ? pad("PING", COL_PING) : "",
      showChecked ? pad("CHECKED", COL_CHECKED) : ""
    ] }) }),
    hasScrollUp && /* @__PURE__ */ jsxs3(Text4, { dimColor: true, children: [
      "  ",
      "\u25B2",
      " ",
      scrollOffset,
      " more above"
    ] }),
    visibleMonitors.map((m, vi) => {
      const i = vi + scrollOffset;
      const isSelected = i === selectedIndex;
      const isLoading = loadingMonitorId === m.id;
      const isChanged = changedMonitorIds?.has(m.id) ?? false;
      const indent = "  ".repeat(m.depth);
      const displayName = indent + m.name;
      const uptimeNum = parseFloat(m.uptime);
      let uptimeColor2;
      if (!isNaN(uptimeNum)) {
        if (uptimeNum >= 99) uptimeColor2 = "green";
        else if (uptimeNum >= 95) uptimeColor2 = "yellow";
        else uptimeColor2 = "red";
      }
      const pingNum = parseInt(m.ping, 10);
      let pingColor;
      if (!isNaN(pingNum)) {
        if (pingNum < 200) pingColor = "green";
        else if (pingNum < 500) pingColor = "yellow";
        else pingColor = "red";
      }
      return /* @__PURE__ */ jsx4(Box3, { children: /* @__PURE__ */ jsxs3(Text4, { inverse: isSelected, bold: isChanged, color: isChanged ? "yellow" : void 0, children: [
        /* @__PURE__ */ jsx4(StatusBadge, { status: m.status }),
        "  ",
        isLoading ? /* @__PURE__ */ jsx4(Text4, { color: "yellow", children: pad("[...]", COL_NAME) }) : /* @__PURE__ */ jsx4(Text4, { children: pad(displayName, COL_NAME) }),
        /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: pad(m.type, COL_TYPE) }),
        showUrl && /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: pad(m.url, COL_URL) }),
        /* @__PURE__ */ jsx4(Text4, { color: uptimeColor2, children: pad(m.uptime, COL_UPTIME) }),
        showPing && /* @__PURE__ */ jsx4(Text4, { color: pingColor, children: pad(m.ping, COL_PING) }),
        showChecked && /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: pad(m.lastChecked, COL_CHECKED) })
      ] }) }, m.id);
    }),
    hasScrollDown && /* @__PURE__ */ jsxs3(Text4, { dimColor: true, children: [
      "  ",
      "\u25BC",
      " ",
      monitors.length - scrollOffset - maxVisible,
      " more below"
    ] })
  ] });
}

// src/tui/components/monitor-detail.tsx
import { Box as Box4, Text as Text5 } from "ink";
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function formatTime(timeStr) {
  try {
    const d = new Date(timeStr);
    return d.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return timeStr;
  }
}
function statusText(status) {
  if (status === 1) return { label: "UP", color: "green" };
  if (status === 0) return { label: "DOWN", color: "red" };
  if (status === 2) return { label: "PENDING", color: "yellow" };
  if (status === 3) return { label: "MAINT", color: "gray" };
  return { label: "UNKNOWN", color: "gray" };
}
function uptimeColor(pct) {
  if (pct >= 99) return "green";
  if (pct >= 95) return "yellow";
  return "red";
}
function MonitorDetail({ monitor, heartbeats, loading, error: error4 }) {
  const recentBeats = heartbeats.slice(-20);
  const totalBeats = heartbeats.length;
  const upBeats = heartbeats.filter((h) => h.status === 1).length;
  const uptimePct = totalBeats > 0 ? upBeats / totalBeats * 100 : 0;
  const pingsWithValues = heartbeats.filter((h) => h.ping != null && h.ping > 0);
  const avgPing = pingsWithValues.length > 0 ? Math.round(pingsWithValues.reduce((sum, h) => sum + (h.ping ?? 0), 0) / pingsWithValues.length) : null;
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx5(Box4, { marginBottom: 1, children: /* @__PURE__ */ jsx5(Text5, { bold: true, color: "cyan", children: "Monitor Detail" }) }),
    /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx5(Box4, { width: 16, children: /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Name:" }) }),
        /* @__PURE__ */ jsx5(Text5, { children: monitor.name })
      ] }),
      /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx5(Box4, { width: 16, children: /* @__PURE__ */ jsx5(Text5, { bold: true, children: "ID:" }) }),
        /* @__PURE__ */ jsx5(Text5, { children: String(monitor.id) })
      ] }),
      /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx5(Box4, { width: 16, children: /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Type:" }) }),
        /* @__PURE__ */ jsx5(Text5, { children: monitor.type })
      ] }),
      monitor.url ? /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx5(Box4, { width: 16, children: /* @__PURE__ */ jsx5(Text5, { bold: true, children: "URL:" }) }),
        /* @__PURE__ */ jsx5(Text5, { children: monitor.url })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs4(Box4, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx5(Box4, { width: 16, children: /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Status:" }) }),
      /* @__PURE__ */ jsx5(StatusBadge, { status: monitor.status })
    ] }),
    /* @__PURE__ */ jsxs4(Box4, { marginBottom: 1, gap: 4, children: [
      /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Uptime: " }),
        /* @__PURE__ */ jsxs4(Text5, { color: uptimeColor(uptimePct), children: [
          uptimePct.toFixed(1),
          "%"
        ] }),
        /* @__PURE__ */ jsxs4(Text5, { dimColor: true, children: [
          " (",
          upBeats,
          "/",
          totalBeats,
          " beats)"
        ] })
      ] }),
      /* @__PURE__ */ jsxs4(Box4, { children: [
        /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Avg Response: " }),
        avgPing != null ? /* @__PURE__ */ jsxs4(Text5, { color: avgPing < 200 ? "green" : avgPing < 500 ? "yellow" : "red", children: [
          avgPing,
          "ms"
        ] }) : /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "--" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Recent Heartbeats" }),
      loading ? /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "Loading heartbeats..." }) : error4 ? /* @__PURE__ */ jsxs4(Text5, { color: "red", children: [
        "Error: ",
        error4
      ] }) : recentBeats.length === 0 ? /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "No heartbeat data available" }) : /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", marginTop: 0, children: [
        /* @__PURE__ */ jsxs4(Box4, { children: [
          /* @__PURE__ */ jsx5(Box4, { width: 14, children: /* @__PURE__ */ jsx5(Text5, { bold: true, dimColor: true, children: "Time" }) }),
          /* @__PURE__ */ jsx5(Box4, { width: 12, children: /* @__PURE__ */ jsx5(Text5, { bold: true, dimColor: true, children: "Status" }) }),
          /* @__PURE__ */ jsx5(Box4, { width: 12, children: /* @__PURE__ */ jsx5(Text5, { bold: true, dimColor: true, children: "Response" }) }),
          /* @__PURE__ */ jsx5(Box4, { width: 40, children: /* @__PURE__ */ jsx5(Text5, { bold: true, dimColor: true, children: "Message" }) })
        ] }),
        [...recentBeats].reverse().map((hb) => {
          const st = statusText(hb.status);
          return /* @__PURE__ */ jsxs4(Box4, { children: [
            /* @__PURE__ */ jsx5(Box4, { width: 14, children: /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: formatTime(hb.time) }) }),
            /* @__PURE__ */ jsx5(Box4, { width: 12, children: /* @__PURE__ */ jsx5(Text5, { color: st.color, children: st.label }) }),
            /* @__PURE__ */ jsx5(Box4, { width: 12, children: hb.ping != null ? /* @__PURE__ */ jsxs4(Text5, { children: [
              hb.ping,
              "ms"
            ] }) : /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "--" }) }),
            /* @__PURE__ */ jsx5(Box4, { width: 40, children: /* @__PURE__ */ jsx5(Text5, { dimColor: true, wrap: "truncate", children: hb.msg ?? "" }) })
          ] }, hb.id);
        })
      ] })
    ] })
  ] });
}

// src/tui/components/confirm-dialog.tsx
import { Box as Box5, Text as Text6, useInput } from "ink";
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function ConfirmDialog({
  message,
  onConfirm,
  onCancel
}) {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onConfirm();
      return;
    }
    if (input === "n" || input === "N" || key.escape) {
      onCancel();
      return;
    }
  });
  return /* @__PURE__ */ jsxs5(Box5, { marginTop: 1, flexDirection: "column", children: [
    /* @__PURE__ */ jsx6(Box5, { children: /* @__PURE__ */ jsx6(Text6, { color: "yellow", bold: true, children: message }) }),
    /* @__PURE__ */ jsxs5(Box5, { children: [
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Press " }),
      /* @__PURE__ */ jsx6(Text6, { color: "green", bold: true, children: "y" }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: " to confirm, " }),
      /* @__PURE__ */ jsx6(Text6, { color: "red", bold: true, children: "n" }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: " or Esc to cancel" })
    ] })
  ] });
}

// src/tui/components/toast.tsx
import { Box as Box6, Text as Text7 } from "ink";
import { jsx as jsx7 } from "react/jsx-runtime";
function Toast({
  message,
  color = "green"
}) {
  return /* @__PURE__ */ jsx7(Box6, { marginTop: 1, children: /* @__PURE__ */ jsx7(Text7, { color, bold: true, children: message }) });
}

// src/tui/components/search-input.tsx
import { Box as Box7, Text as Text8 } from "ink";
import TextInput from "ink-text-input";
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
function SearchInput({
  value,
  onChange
}) {
  return /* @__PURE__ */ jsxs6(Box7, { children: [
    /* @__PURE__ */ jsx8(Text8, { bold: true, color: "yellow", children: "/" }),
    /* @__PURE__ */ jsx8(Text8, { children: " " }),
    /* @__PURE__ */ jsx8(TextInput, { value, onChange, placeholder: "type to filter by name..." })
  ] });
}

// src/tui/components/filter-menu.tsx
import { useState as useState2 } from "react";
import { Box as Box8, Text as Text9, useInput as useInput2 } from "ink";
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var FILTER_OPTIONS = [
  { label: "ALL", value: null, color: "white" },
  { label: "UP", value: 1, color: "green" },
  { label: "DOWN", value: 0, color: "red" },
  { label: "PENDING", value: 2, color: "yellow" },
  { label: "MAINTENANCE", value: 3, color: "gray" }
];
function FilterMenu({
  onSelect,
  onCancel,
  currentFilter
}) {
  const initialIndex = FILTER_OPTIONS.findIndex(
    (o) => o.value === currentFilter
  );
  const [selectedIndex, setSelectedIndex] = useState2(
    initialIndex >= 0 ? initialIndex : 0
  );
  useInput2((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSelect(FILTER_OPTIONS[selectedIndex].value);
      return;
    }
    if (input === "k" || key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === "j" || key.downArrow) {
      setSelectedIndex(
        (prev) => Math.min(FILTER_OPTIONS.length - 1, prev + 1)
      );
      return;
    }
  });
  return /* @__PURE__ */ jsxs7(Box8, { flexDirection: "column", borderStyle: "single", borderColor: "yellow", paddingX: 1, children: [
    /* @__PURE__ */ jsx9(Text9, { bold: true, color: "yellow", children: "Filter by status:" }),
    FILTER_OPTIONS.map((option, index) => {
      const isSelected = index === selectedIndex;
      const isCurrent = option.value === currentFilter;
      return /* @__PURE__ */ jsxs7(Box8, { children: [
        /* @__PURE__ */ jsx9(Text9, { children: isSelected ? "> " : "  " }),
        /* @__PURE__ */ jsx9(Text9, { color: option.color, bold: isSelected, children: option.label }),
        isCurrent && /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: " (current)" })
      ] }, option.label);
    }),
    /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "j/k=navigate Enter=select Esc=cancel" })
  ] });
}

// src/tui/components/instance-switcher.tsx
import { useState as useState3 } from "react";
import { Box as Box9, Text as Text10, useInput as useInput3 } from "ink";
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function InstanceSwitcher({
  instances,
  currentInstance,
  onSelect,
  onCancel
}) {
  const names = Object.keys(instances).sort();
  const [selectedIndex, setSelectedIndex] = useState3(() => {
    const idx = names.indexOf(currentInstance);
    return idx >= 0 ? idx : 0;
  });
  useInput3((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (names.length > 0) onSelect(names[selectedIndex]);
      return;
    }
    if (input === "k" || key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === "j" || key.downArrow) {
      setSelectedIndex((prev) => Math.min(names.length - 1, prev + 1));
      return;
    }
  });
  if (names.length === 0) {
    return /* @__PURE__ */ jsxs8(Box9, { flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      /* @__PURE__ */ jsx10(Text10, { bold: true, color: "cyan", children: "Switch Instance" }),
      /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
        "No instances configured. Run: kuma login ",
        "<url>"
      ] }),
      /* @__PURE__ */ jsx10(Box9, { marginTop: 1, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "Esc=cancel" }) })
    ] });
  }
  return /* @__PURE__ */ jsxs8(Box9, { flexDirection: "column", paddingX: 1, paddingY: 1, children: [
    /* @__PURE__ */ jsx10(Text10, { bold: true, color: "cyan", children: "Switch Instance" }),
    /* @__PURE__ */ jsx10(Box9, { flexDirection: "column", marginTop: 1, children: names.map((name, idx) => {
      const inst = instances[name];
      const isSelected = idx === selectedIndex;
      const isCurrent = name === currentInstance;
      return /* @__PURE__ */ jsxs8(Box9, { children: [
        /* @__PURE__ */ jsxs8(Text10, { color: isSelected ? "cyan" : void 0, bold: isSelected, children: [
          isSelected ? "> " : "  ",
          name
        ] }),
        /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
          " ",
          inst.url
        ] }),
        isCurrent && /* @__PURE__ */ jsx10(Text10, { color: "green", children: " (active)" })
      ] }, name);
    }) }),
    /* @__PURE__ */ jsx10(Box9, { marginTop: 1, children: /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "j/k=navigate  Enter=select  Esc=cancel" }) })
  ] });
}

// src/tui/components/cluster-switcher.tsx
import { useState as useState4 } from "react";
import { Box as Box10, Text as Text11, useInput as useInput4 } from "ink";
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
function ClusterSwitcher({
  clusters,
  currentCluster,
  onSelect,
  onCancel
}) {
  const names = Object.keys(clusters).sort();
  const [selectedIndex, setSelectedIndex] = useState4(() => {
    if (!currentCluster) return 0;
    const idx = names.indexOf(currentCluster);
    return idx >= 0 ? idx : 0;
  });
  useInput4((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (names.length > 0) onSelect(names[selectedIndex]);
      return;
    }
    if (input === "k" || key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === "j" || key.downArrow) {
      setSelectedIndex((prev) => Math.min(names.length - 1, prev + 1));
      return;
    }
  });
  if (names.length === 0) {
    return /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      /* @__PURE__ */ jsx11(Text11, { bold: true, color: "cyan", children: "Switch Cluster" }),
      /* @__PURE__ */ jsxs9(Text11, { dimColor: true, children: [
        "No clusters configured. Run: kuma cluster create ",
        "<name>"
      ] }),
      /* @__PURE__ */ jsx11(Box10, { marginTop: 1, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Esc=cancel" }) })
    ] });
  }
  return /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", paddingX: 1, paddingY: 1, children: [
    /* @__PURE__ */ jsx11(Text11, { bold: true, color: "cyan", children: "Switch Cluster" }),
    /* @__PURE__ */ jsx11(Box10, { flexDirection: "column", marginTop: 1, children: names.map((name, idx) => {
      const cluster = clusters[name];
      const isSelected = idx === selectedIndex;
      const isCurrent = name === currentCluster;
      return /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", children: [
        /* @__PURE__ */ jsxs9(Box10, { children: [
          /* @__PURE__ */ jsxs9(Text11, { color: isSelected ? "cyan" : void 0, bold: isSelected, children: [
            isSelected ? "> " : "  ",
            name
          ] }),
          isCurrent && /* @__PURE__ */ jsx11(Text11, { color: "green", children: " (active)" })
        ] }),
        /* @__PURE__ */ jsx11(Box10, { marginLeft: 4, children: /* @__PURE__ */ jsxs9(Text11, { dimColor: true, children: [
          "primary: ",
          cluster.primary,
          " | instances: ",
          cluster.instances.join(", ")
        ] }) })
      ] }, name);
    }) }),
    /* @__PURE__ */ jsx11(Box10, { marginTop: 1, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "j/k=navigate  Enter=select  Esc=cancel" }) })
  ] });
}

// src/tui/components/login-screen.tsx
import { useState as useState5 } from "react";
import { Box as Box11, Text as Text12, useInput as useInput5 } from "ink";
import TextInput2 from "ink-text-input";
import { jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";
var FIELDS = ["url", "username", "password"];
function LoginScreen({
  onLogin,
  error: error4,
  loading
}) {
  const [url, setUrl] = useState5("");
  const [username, setUsername] = useState5("");
  const [password, setPassword] = useState5("");
  const [activeField, setActiveField] = useState5("url");
  useInput5((_input, key) => {
    if (loading) return;
    if (key.return) {
      const idx = FIELDS.indexOf(activeField);
      if (idx < FIELDS.length - 1) {
        setActiveField(FIELDS[idx + 1]);
      } else {
        if (url && username && password) {
          onLogin(url.replace(/\/$/, ""), username, password);
        }
      }
      return;
    }
    if (key.tab) {
      const idx = FIELDS.indexOf(activeField);
      setActiveField(FIELDS[(idx + 1) % FIELDS.length]);
      return;
    }
  });
  const maskedPassword = "*".repeat(password.length);
  const LOGO2 = [
    " _  ___   _ __  __    _      ___ _    ___ ",
    "| |/ / | | |  \\/  |  /_\\    / __| |  |_ _|",
    "| ' <| |_| | |\\/| | / _ \\  | (__| |__ | | ",
    "|_|\\_\\\\___/|_|  |_|/_/ \\_\\  \\___|____|___|"
  ];
  return /* @__PURE__ */ jsxs10(Box11, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx12(Box11, { flexDirection: "column", children: LOGO2.map((line, i) => /* @__PURE__ */ jsx12(Text12, { color: "#db2777", bold: true, children: line }, i)) }),
    /* @__PURE__ */ jsx12(Box11, { marginTop: 1, marginBottom: 1, flexDirection: "column", children: /* @__PURE__ */ jsx12(Text12, { dimColor: true, children: "No instances configured. Log in to get started." }) }),
    /* @__PURE__ */ jsxs10(Box11, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs10(Box11, { children: [
        /* @__PURE__ */ jsx12(Box11, { width: 12, children: /* @__PURE__ */ jsx12(Text12, { bold: true, color: activeField === "url" ? "cyan" : void 0, children: "URL:" }) }),
        activeField === "url" ? /* @__PURE__ */ jsx12(
          TextInput2,
          {
            value: url,
            onChange: setUrl,
            placeholder: "https://kuma.example.com"
          }
        ) : /* @__PURE__ */ jsx12(Text12, { children: url || /* @__PURE__ */ jsx12(Text12, { dimColor: true, children: "https://kuma.example.com" }) })
      ] }),
      /* @__PURE__ */ jsxs10(Box11, { children: [
        /* @__PURE__ */ jsx12(Box11, { width: 12, children: /* @__PURE__ */ jsx12(Text12, { bold: true, color: activeField === "username" ? "cyan" : void 0, children: "Username:" }) }),
        activeField === "username" ? /* @__PURE__ */ jsx12(
          TextInput2,
          {
            value: username,
            onChange: setUsername,
            placeholder: "admin"
          }
        ) : /* @__PURE__ */ jsx12(Text12, { children: username || /* @__PURE__ */ jsx12(Text12, { dimColor: true, children: "admin" }) })
      ] }),
      /* @__PURE__ */ jsxs10(Box11, { children: [
        /* @__PURE__ */ jsx12(Box11, { width: 12, children: /* @__PURE__ */ jsx12(Text12, { bold: true, color: activeField === "password" ? "cyan" : void 0, children: "Password:" }) }),
        activeField === "password" ? /* @__PURE__ */ jsx12(
          TextInput2,
          {
            value: password,
            onChange: setPassword,
            placeholder: "********",
            mask: "*"
          }
        ) : /* @__PURE__ */ jsx12(Text12, { children: maskedPassword || /* @__PURE__ */ jsx12(Text12, { dimColor: true, children: "********" }) })
      ] })
    ] }),
    !url.startsWith("https://") && url.length > 0 && /* @__PURE__ */ jsx12(Box11, { marginBottom: 1, children: /* @__PURE__ */ jsx12(Text12, { color: "yellow", children: "Warning: connecting over HTTP. Credentials will be sent in cleartext." }) }),
    error4 && /* @__PURE__ */ jsx12(Box11, { marginBottom: 1, children: /* @__PURE__ */ jsx12(Text12, { color: "red", children: error4 }) }),
    loading ? /* @__PURE__ */ jsx12(Text12, { color: "yellow", children: "Connecting..." }) : /* @__PURE__ */ jsx12(Text12, { dimColor: true, children: "Enter=next field/submit  Tab=switch field  Fill all fields to connect" })
  ] });
}

// src/tui/components/help-screen.tsx
import { Box as Box12, Text as Text13, useInput as useInput6 } from "ink";
import { jsx as jsx13, jsxs as jsxs11 } from "react/jsx-runtime";
function HelpScreen({ onClose }) {
  useInput6((_input, key) => {
    if (key.escape || _input === "h" || _input === "q") {
      onClose();
    }
  });
  const LOGO2 = [
    " _  ___   _ __  __    _      ___ _    ___ ",
    "| |/ / | | |  \\/  |  /_\\    / __| |  |_ _|",
    "| ' <| |_| | |\\/| | / _ \\  | (__| |__ | | ",
    "|_|\\_\\\\___/|_|  |_|/_/ \\_\\  \\___|____|___|"
  ];
  return /* @__PURE__ */ jsxs11(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx13(Box12, { flexDirection: "column", children: LOGO2.map((line, i) => /* @__PURE__ */ jsx13(Text13, { color: "#db2777", bold: true, children: line }, i)) }),
    /* @__PURE__ */ jsx13(Box12, { marginTop: 1, children: /* @__PURE__ */ jsx13(Text13, { dimColor: true, children: "Run these from your terminal (outside the dashboard)" }) }),
    /* @__PURE__ */ jsxs11(Box12, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: "Authentication" }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma login ",
          "<url>"
        ] }),
        "              Authenticate with an instance"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma logout" }),
        "                    Clear saved session"
      ] })
    ] }),
    /* @__PURE__ */ jsxs11(Box12, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: "Monitors" }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma monitors list" }),
        "             List all monitors"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma monitors add" }),
        "              Add a monitor interactively"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma monitors create" }),
        "           Create a monitor (non-interactive)"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma monitors pause ",
          "<id>"
        ] }),
        "       Pause a monitor"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma monitors resume ",
          "<id>"
        ] }),
        "      Resume a monitor"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma monitors delete ",
          "<id>"
        ] }),
        "      Delete a monitor"
      ] })
    ] }),
    /* @__PURE__ */ jsxs11(Box12, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: "Other" }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma heartbeat view ",
          "<id>"
        ] }),
        "       View heartbeat history"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma notifications list" }),
        "        List notification channels"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma status-pages list" }),
        "         List status pages"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma config export" }),
        "             Export monitors to YAML/JSON"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma config import ",
          "<file>"
        ] }),
        "      Import monitors from file"
      ] })
    ] }),
    /* @__PURE__ */ jsxs11(Box12, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: "Multi-Instance" }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "kuma instances list" }),
        "            List saved instances"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma use ",
          "<name>"
        ] }),
        "               Switch active instance"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma cluster create ",
          "<name>"
        ] }),
        "     Create a cluster"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsxs11(Text13, { color: "cyan", children: [
          "kuma cluster sync ",
          "<name>"
        ] }),
        "       Sync cluster monitors"
      ] })
    ] }),
    /* @__PURE__ */ jsxs11(Box12, { marginTop: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: "Dashboard Shortcuts" }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "q" }),
        "=quit  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "j/k" }),
        "=navigate  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "Enter" }),
        "=detail  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "Esc" }),
        "=back"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "r" }),
        "=refresh  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "/" }),
        "=search  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "f" }),
        "=filter  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "p" }),
        "=pause  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "u" }),
        "=resume"
      ] }),
      /* @__PURE__ */ jsxs11(Text13, { children: [
        "  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "d" }),
        "=delete  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "i" }),
        "=instances  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "c" }),
        "=clusters  ",
        /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "h" }),
        "=this help"
      ] })
    ] }),
    /* @__PURE__ */ jsx13(Box12, { marginTop: 1, children: /* @__PURE__ */ jsx13(Text13, { dimColor: true, children: "Press h, Esc, or q to close" }) })
  ] });
}

// src/tui/hooks/use-monitors.ts
import { useState as useState6, useEffect as useEffect2, useCallback, useRef } from "react";
var STATUS_PRIORITY = {
  0: 0,
  // DOWN first
  2: 1,
  // PENDING
  1: 2,
  // UP
  3: 3
  // MAINTENANCE
};
function getStatusPriority(status) {
  return STATUS_PRIORITY[status] ?? 99;
}
function formatUptime2(uptime) {
  if (uptime === void 0 || uptime === null) return "--";
  return (uptime * 100).toFixed(1) + "%";
}
function formatPing2(ping) {
  if (!ping) return "--";
  return ping + "ms";
}
function formatDate2(dateStr) {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleTimeString();
}
function buildRows(monitorMap) {
  const monitors = Object.values(monitorMap);
  const parentIds = /* @__PURE__ */ new Set();
  const childrenByParent = /* @__PURE__ */ new Map();
  for (const m of monitors) {
    if (m.type === "group") {
      parentIds.add(m.id);
    }
    if (m.parent) {
      const siblings = childrenByParent.get(m.parent) ?? [];
      siblings.push(m);
      childrenByParent.set(m.parent, siblings);
    }
  }
  const topLevel = monitors.filter((m) => !m.parent);
  topLevel.sort((a, b) => {
    const aStatus = a.heartbeat?.status ?? (a.active ? 2 : 3);
    const bStatus = b.heartbeat?.status ?? (b.active ? 2 : 3);
    const sp = getStatusPriority(aStatus) - getStatusPriority(bStatus);
    if (sp !== 0) return sp;
    return a.name.localeCompare(b.name);
  });
  const rows = [];
  function toRow(m, depth) {
    const status = m.heartbeat?.status ?? (m.active ? 2 : 3);
    return {
      id: m.id,
      name: m.name,
      type: m.type,
      url: m.url ?? m.hostname ?? "",
      status,
      uptime: formatUptime2(m.uptime),
      ping: formatPing2(m.heartbeat?.ping),
      lastChecked: formatDate2(m.heartbeat?.time),
      parent: m.parent ?? void 0,
      depth
    };
  }
  for (const m of topLevel) {
    rows.push(toRow(m, 0));
    const children = childrenByParent.get(m.id);
    if (children) {
      children.sort((a, b) => {
        const aStatus = a.heartbeat?.status ?? (a.active ? 2 : 3);
        const bStatus = b.heartbeat?.status ?? (b.active ? 2 : 3);
        const sp = getStatusPriority(aStatus) - getStatusPriority(bStatus);
        if (sp !== 0) return sp;
        return a.name.localeCompare(b.name);
      });
      for (const child of children) {
        rows.push(toRow(child, 1));
      }
    }
  }
  return rows;
}
function useMonitors(client, refreshInterval) {
  const [monitors, setMonitors] = useState6([]);
  const [loading, setLoading] = useState6(true);
  const [error4, setError] = useState6(null);
  const [connected, setConnected] = useState6(true);
  const [changedMonitorIds, setChangedMonitorIds] = useState6(/* @__PURE__ */ new Set());
  const flashTimers = useRef(/* @__PURE__ */ new Map());
  const fetchMonitors = useCallback(async () => {
    try {
      const monitorMap = await client.getMonitorList();
      const rows = buildRows(monitorMap);
      setMonitors(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect2(() => {
    const unsubHeartbeat = client.onHeartbeat((monitorId, hb) => {
      setMonitors((prev) => {
        const idx = prev.findIndex((m) => m.id === monitorId);
        if (idx === -1) return prev;
        const old = prev[idx];
        const statusChanged = old.status !== hb.status;
        const updated = {
          ...old,
          status: hb.status,
          ping: hb.ping != null ? hb.ping + "ms" : old.ping,
          lastChecked: hb.time ? new Date(hb.time).toLocaleTimeString() : old.lastChecked
        };
        const next = [...prev];
        next[idx] = updated;
        if (statusChanged) {
          setChangedMonitorIds((s) => new Set(s).add(monitorId));
          const existing = flashTimers.current.get(monitorId);
          if (existing) clearTimeout(existing);
          flashTimers.current.set(
            monitorId,
            setTimeout(() => {
              setChangedMonitorIds((s) => {
                const ns = new Set(s);
                ns.delete(monitorId);
                return ns;
              });
              flashTimers.current.delete(monitorId);
            }, 2e3)
          );
        }
        return next;
      });
    });
    const unsubUptime = client.onUptime((monitorId, period, value) => {
      if (period !== "24") return;
      setMonitors((prev) => {
        const idx = prev.findIndex((m) => m.id === monitorId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], uptime: (value * 100).toFixed(1) + "%" };
        return next;
      });
    });
    const unsubDisconnect = client.onDisconnect(() => {
      setConnected(false);
    });
    const unsubReconnect = client.onReconnect(() => {
      setConnected(true);
      fetchMonitors();
    });
    return () => {
      unsubHeartbeat();
      unsubUptime();
      unsubDisconnect();
      unsubReconnect();
      for (const timer of flashTimers.current.values()) {
        clearTimeout(timer);
      }
      flashTimers.current.clear();
    };
  }, [client, fetchMonitors]);
  useEffect2(() => {
    fetchMonitors();
    const timer = setInterval(fetchMonitors, Math.max(refreshInterval, 60) * 1e3);
    return () => clearInterval(timer);
  }, [fetchMonitors, refreshInterval]);
  return { monitors, loading, error: error4, connected, changedMonitorIds, refresh: fetchMonitors };
}

// src/tui/hooks/use-heartbeats.ts
import { useState as useState7, useEffect as useEffect3, useCallback as useCallback2 } from "react";
function useHeartbeats(client, monitorId) {
  const [heartbeats, setHeartbeats] = useState7([]);
  const [loading, setLoading] = useState7(false);
  const [error4, setError] = useState7(null);
  const fetchBeats = useCallback2(async () => {
    if (monitorId === null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await client.getHeartbeatList(monitorId, 24);
      setHeartbeats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHeartbeats([]);
    } finally {
      setLoading(false);
    }
  }, [client, monitorId]);
  const refresh = useCallback2(() => {
    void fetchBeats();
  }, [fetchBeats]);
  useEffect3(() => {
    void fetchBeats();
  }, [fetchBeats]);
  return { heartbeats, loading, error: error4, refresh };
}

// src/tui/hooks/use-filter.ts
import { useState as useState8, useCallback as useCallback3, useMemo } from "react";
function useFilter(monitors) {
  const [searchQuery, setSearchQuery] = useState8("");
  const [statusFilter, setStatusFilter] = useState8(null);
  const [mode, setMode] = useState8("normal");
  const clearFilters = useCallback3(() => {
    setSearchQuery("");
    setStatusFilter(null);
    setMode("normal");
  }, []);
  const hasActiveFilters = searchQuery !== "" || statusFilter !== null;
  const filteredMonitors = useMemo(() => {
    let result = monitors;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) => m.name.toLowerCase().includes(query) || m.url.toLowerCase().includes(query)
      );
    }
    if (statusFilter !== null) {
      result = result.filter((m) => m.status === statusFilter);
    }
    return result;
  }, [monitors, searchQuery, statusFilter]);
  return {
    filteredMonitors,
    searchQuery,
    statusFilter,
    mode,
    setMode,
    setSearchQuery,
    setStatusFilter,
    clearFilters,
    hasActiveFilters
  };
}

// src/tui/hooks/use-toast.ts
import { useState as useState9, useCallback as useCallback4, useRef as useRef2 } from "react";
function useToast() {
  const [toastMessage, setToastMessage] = useState9(null);
  const [toastColor, setToastColor] = useState9("green");
  const timerRef = useRef2(null);
  const showToast = useCallback4(
    (message, color = "green", durationMs = 2500) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setToastMessage(message);
      setToastColor(color);
      timerRef.current = setTimeout(() => {
        setToastMessage(null);
        timerRef.current = null;
      }, durationMs);
    },
    []
  );
  return { toastMessage, toastColor, showToast };
}

// src/tui/app.tsx
import { jsx as jsx14, jsxs as jsxs12 } from "react/jsx-runtime";
function App({
  client: initialClient,
  instanceName: initialInstanceName,
  clusterName: initialClusterName,
  refreshInterval
}) {
  const { exit } = useApp();
  const [activeClient, setActiveClient] = useState10(initialClient ?? null);
  const [activeInstanceName, setActiveInstanceName] = useState10(initialInstanceName ?? "");
  const [activeClusterName, setActiveClusterName] = useState10(
    initialClusterName ?? null
  );
  const [overlay, setOverlay] = useState10("none");
  const [connecting, setConnecting] = useState10(false);
  const [loginError, setLoginError] = useState10(null);
  const [loginLoading, setLoginLoading] = useState10(false);
  const handleLogin = useCallback5(async (url, username, password) => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const client = new KumaClient(url);
      await client.connect();
      const result = await client.login(username, password);
      if (!result.ok || !result.token) {
        client.disconnect();
        setLoginError(result.msg ?? "Login failed");
        return;
      }
      const instanceName = saveConfig({ url, token: result.token });
      client.disconnect();
      const authClient = await createAuthenticatedClient(url, result.token);
      authClient.enableReconnection();
      setActiveClient(authClient);
      setActiveInstanceName(instanceName);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoginLoading(false);
    }
  }, []);
  if (!activeClient) {
    return /* @__PURE__ */ jsx14(LoginScreen, { onLogin: handleLogin, error: loginError, loading: loginLoading });
  }
  return /* @__PURE__ */ jsx14(
    Dashboard,
    {
      client: activeClient,
      instanceName: activeInstanceName,
      clusterName: activeClusterName,
      refreshInterval,
      exit,
      setActiveClient,
      setActiveInstanceName,
      setActiveClusterName,
      overlay,
      setOverlay,
      connecting,
      setConnecting
    }
  );
}
function Dashboard({
  client: activeClient,
  instanceName: activeInstanceName,
  clusterName: activeClusterName,
  refreshInterval,
  exit,
  setActiveClient,
  setActiveInstanceName,
  setActiveClusterName,
  overlay,
  setOverlay,
  connecting,
  setConnecting
}) {
  const { monitors, loading, error: error4, connected, changedMonitorIds, refresh } = useMonitors(
    activeClient,
    refreshInterval
  );
  const {
    filteredMonitors,
    searchQuery,
    statusFilter,
    mode,
    setMode,
    setSearchQuery,
    setStatusFilter,
    clearFilters,
    hasActiveFilters
  } = useFilter(monitors);
  const [selectedIndex, setSelectedIndex] = useState10(0);
  const [view, setView] = useState10("list");
  const [selectedMonitorId, setSelectedMonitorId] = useState10(null);
  const [pendingAction, setPendingAction] = useState10(null);
  const [loadingMonitorId, setLoadingMonitorId] = useState10(null);
  const { toastMessage, toastColor, showToast } = useToast();
  const { heartbeats, loading: hbLoading, error: hbError, refresh: hbRefresh } = useHeartbeats(
    activeClient,
    view === "detail" ? selectedMonitorId : null
  );
  const selectedMonitor = filteredMonitors.length > 0 ? filteredMonitors[selectedIndex] : null;
  const displayName = activeClusterName ? `${activeClusterName}/${activeInstanceName}` : activeInstanceName;
  const switchToInstance = useCallback5(
    async (name) => {
      if (name === activeInstanceName && !activeClusterName) {
        setOverlay("none");
        return;
      }
      const instConfig = getInstanceConfig(name);
      if (!instConfig) {
        showToast(`Instance '${name}' not found`, "red");
        setOverlay("none");
        return;
      }
      setConnecting(true);
      setOverlay("none");
      try {
        const newClient = await createAuthenticatedClient(instConfig.url, instConfig.token);
        newClient.enableReconnection();
        activeClient.disconnect();
        setActiveClient(newClient);
        setActiveInstanceName(name);
        setActiveClusterName(null);
        setSelectedIndex(0);
        setView("list");
        setSelectedMonitorId(null);
        clearFilters();
        showToast(`Switched to ${name}`, "green");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Failed: ${msg}`, "red", 4e3);
      } finally {
        setConnecting(false);
      }
    },
    [activeClient, activeInstanceName, activeClusterName, showToast, clearFilters]
  );
  const switchToCluster = useCallback5(
    async (name) => {
      if (name === activeClusterName) {
        setOverlay("none");
        return;
      }
      const cluster = getClusterConfig(name);
      if (!cluster) {
        showToast(`Cluster '${name}' not found`, "red");
        setOverlay("none");
        return;
      }
      const primaryConfig = getInstanceConfig(cluster.primary);
      if (!primaryConfig) {
        showToast(`Primary instance '${cluster.primary}' not found`, "red");
        setOverlay("none");
        return;
      }
      setConnecting(true);
      setOverlay("none");
      try {
        const newClient = await createAuthenticatedClient(primaryConfig.url, primaryConfig.token);
        newClient.enableReconnection();
        activeClient.disconnect();
        setActiveClient(newClient);
        setActiveInstanceName(cluster.primary);
        setActiveClusterName(name);
        setSelectedIndex(0);
        setView("list");
        setSelectedMonitorId(null);
        clearFilters();
        showToast(`Switched to cluster ${name} (${cluster.primary})`, "green");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Failed: ${msg}`, "red", 4e3);
      } finally {
        setConnecting(false);
      }
    },
    [activeClient, activeClusterName, showToast, clearFilters]
  );
  const executeAction = useCallback5(
    async (action) => {
      setLoadingMonitorId(action.monitorId);
      try {
        if (action.type === "pause") {
          await activeClient.pauseMonitor(action.monitorId);
          showToast(`Monitor "${action.monitorName}" paused`, "green");
        } else if (action.type === "delete") {
          await activeClient.deleteMonitor(action.monitorId);
          showToast(`Monitor "${action.monitorName}" deleted`, "green");
        }
        refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Error: ${msg}`, "red", 4e3);
      } finally {
        setLoadingMonitorId(null);
      }
    },
    [activeClient, refresh, showToast]
  );
  const handleConfirm = useCallback5(() => {
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      executeAction(action);
    }
  }, [pendingAction, executeAction]);
  const handleCancel = useCallback5(() => {
    setPendingAction(null);
  }, []);
  useInput7((input, key) => {
    if (connecting) return;
    if (overlay !== "none") return;
    if (pendingAction) return;
    if (loadingMonitorId !== null) return;
    if (input === "q" && mode === "normal") {
      activeClient.disconnect();
      exit();
      return;
    }
    if (input === "i" && mode === "normal") {
      setOverlay("instance-switcher");
      return;
    }
    if (input === "c" && mode === "normal") {
      setOverlay("cluster-switcher");
      return;
    }
    if (input === "h" && mode === "normal") {
      setOverlay("help");
      return;
    }
    if (view === "detail") {
      if (key.escape || key.backspace || key.delete) {
        setView("list");
        setSelectedMonitorId(null);
        return;
      }
      if (input === "r") {
        hbRefresh();
        return;
      }
      return;
    }
    if (mode === "search") {
      if (key.escape) {
        setSearchQuery("");
        setMode("normal");
        return;
      }
      if (key.return) {
        setMode("normal");
        return;
      }
      return;
    }
    if (mode === "filter-menu") return;
    if (input === "r") {
      refresh();
      return;
    }
    if (input === "/") {
      setMode("search");
      return;
    }
    if (input === "f") {
      setMode("filter-menu");
      return;
    }
    if (key.escape) {
      if (hasActiveFilters) {
        clearFilters();
        setSelectedIndex(0);
      }
      return;
    }
    if (input === "k" || key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === "j" || key.downArrow) {
      setSelectedIndex((prev) => Math.min(filteredMonitors.length - 1, prev + 1));
      return;
    }
    if (key.return && selectedMonitor) {
      setSelectedMonitorId(selectedMonitor.id);
      setView("detail");
      return;
    }
    if (input === "p" && selectedMonitor && selectedMonitor.status !== 3) {
      setPendingAction({ type: "pause", monitorId: selectedMonitor.id, monitorName: selectedMonitor.name });
      return;
    }
    if (input === "u" && selectedMonitor && selectedMonitor.status === 3) {
      setLoadingMonitorId(selectedMonitor.id);
      activeClient.resumeMonitor(selectedMonitor.id).then(() => {
        showToast(`Monitor "${selectedMonitor.name}" resumed`, "green");
        refresh();
      }).catch((err) => {
        showToast(`Error: ${err.message}`, "red", 4e3);
      }).finally(() => {
        setLoadingMonitorId(null);
      });
      return;
    }
    if (input === "d" && selectedMonitor) {
      setPendingAction({ type: "delete", monitorId: selectedMonitor.id, monitorName: selectedMonitor.name });
      return;
    }
  });
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filteredMonitors.length - 1));
  useEffect4(() => {
    if (clampedIndex !== selectedIndex) {
      setSelectedIndex(clampedIndex);
    }
  }, [clampedIndex, selectedIndex]);
  if (overlay === "instance-switcher") {
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected, monitors }),
      /* @__PURE__ */ jsx14(
        InstanceSwitcher,
        {
          instances: getAllInstances(),
          currentInstance: activeInstanceName,
          onSelect: (name) => void switchToInstance(name),
          onCancel: () => setOverlay("none")
        }
      )
    ] });
  }
  if (overlay === "cluster-switcher") {
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected, monitors }),
      /* @__PURE__ */ jsx14(
        ClusterSwitcher,
        {
          clusters: getAllClusters(),
          currentCluster: activeClusterName,
          onSelect: (name) => void switchToCluster(name),
          onCancel: () => setOverlay("none")
        }
      )
    ] });
  }
  if (overlay === "help") {
    return /* @__PURE__ */ jsx14(HelpScreen, { onClose: () => setOverlay("none") });
  }
  if (connecting) {
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected: false, monitors: [] }),
      /* @__PURE__ */ jsx14(Text14, { color: "yellow", children: "Connecting..." })
    ] });
  }
  if (loading && monitors.length === 0) {
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected, monitors: [] }),
      /* @__PURE__ */ jsx14(Text14, { color: "yellow", children: "Loading monitors..." })
    ] });
  }
  if (error4 && monitors.length === 0) {
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected, monitors: [] }),
      /* @__PURE__ */ jsxs12(Text14, { color: "red", children: [
        "Error: ",
        error4
      ] }),
      /* @__PURE__ */ jsx14(Text14, { dimColor: true, children: "Press r to retry, q to quit" })
    ] });
  }
  if (monitors.length === 0) {
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected, monitors: [] }),
      /* @__PURE__ */ jsx14(Text14, { dimColor: true, children: "No monitors found." }),
      /* @__PURE__ */ jsx14(Footer, { view: "list", mode })
    ] });
  }
  if (view === "detail") {
    const detailMonitor = monitors.find((m) => m.id === selectedMonitorId);
    if (!detailMonitor) {
      setView("list");
      return /* @__PURE__ */ jsx14(Text14, { children: "Monitor not found" });
    }
    return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Header, { instanceName: displayName, connected, monitors }),
      /* @__PURE__ */ jsx14(
        MonitorDetail,
        {
          monitor: detailMonitor,
          heartbeats,
          loading: hbLoading,
          error: hbError
        }
      ),
      toastMessage && /* @__PURE__ */ jsx14(Toast, { message: toastMessage, color: toastColor }),
      /* @__PURE__ */ jsx14(Footer, { view: "detail", mode: "normal" })
    ] });
  }
  return /* @__PURE__ */ jsxs12(Box13, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx14(
      Header,
      {
        instanceName: displayName,
        connected,
        monitors,
        searchQuery,
        statusFilter,
        filteredCount: hasActiveFilters ? filteredMonitors.length : void 0
      }
    ),
    mode === "search" && /* @__PURE__ */ jsx14(SearchInput, { value: searchQuery, onChange: setSearchQuery }),
    mode === "filter-menu" && /* @__PURE__ */ jsx14(
      FilterMenu,
      {
        currentFilter: statusFilter,
        onSelect: (status) => {
          setStatusFilter(status);
          setMode("normal");
          setSelectedIndex(0);
        },
        onCancel: () => setMode("normal")
      }
    ),
    /* @__PURE__ */ jsx14(
      MonitorTable,
      {
        monitors: filteredMonitors,
        selectedIndex: clampedIndex,
        loadingMonitorId,
        changedMonitorIds
      }
    ),
    pendingAction && /* @__PURE__ */ jsx14(
      ConfirmDialog,
      {
        message: pendingAction.type === "pause" ? `Pause "${pendingAction.monitorName}"?` : `Delete "${pendingAction.monitorName}"? This cannot be undone.`,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      }
    ),
    toastMessage && !pendingAction && /* @__PURE__ */ jsx14(Toast, { message: toastMessage, color: toastColor }),
    !pendingAction && /* @__PURE__ */ jsx14(Footer, { view: "list", mode, selectedStatus: selectedMonitor?.status })
  ] });
}

// src/tui/render.tsx
import { jsx as jsx15 } from "react/jsx-runtime";
async function renderDashboard(opts) {
  process.stdout.write("\x1B[?1049h");
  process.stdout.write("\x1B[H\x1B[2J");
  const restoreScreen = () => {
    process.stdout.write("\x1B[?1049l");
  };
  process.on("exit", restoreScreen);
  process.on("SIGINT", () => {
    restoreScreen();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    restoreScreen();
    process.exit(0);
  });
  const { waitUntilExit } = render(
    /* @__PURE__ */ jsx15(
      App,
      {
        client: opts.client,
        instanceName: opts.instanceName,
        clusterName: opts.clusterName,
        refreshInterval: opts.refreshInterval
      }
    )
  );
  await waitUntilExit();
  restoreScreen();
}

// src/commands/dashboard.ts
async function launchDashboard(opts) {
  try {
    const refreshInterval = Math.max(5, parseInt(opts.refresh, 10) || 30);
    let client = null;
    let instanceName = "";
    try {
      const resolved = await resolveClient({
        instance: opts.instance,
        cluster: opts.cluster
      });
      client = resolved.client;
      instanceName = resolved.instanceName;
      client.enableReconnection();
    } catch {
    }
    await renderDashboard({
      client,
      instanceName: instanceName || void 0,
      clusterName: opts.cluster ?? null,
      refreshInterval
    });
    client?.disconnect();
    process.exit(0);
  } catch (err) {
    handleError(err);
  }
}

// src/index.ts
import chalk12 from "chalk";
var __dirname = dirname3(fileURLToPath2(import.meta.url));
var pkg = JSON.parse(readFileSync4(join3(__dirname, "..", "package.json"), "utf8"));
var program = new Command();
program.name("kuma").description("Manage Uptime Kuma monitors, heartbeats, and status pages from your terminal.").version(pkg.version || "1.6.0").addHelpText(
  "beforeAll",
  `
${chalk12.bold.cyan("Uptime Kuma CLI")} \u2014 terminal control for your monitoring stack

`
).addHelpText(
  "after",
  `
${chalk12.bold("Quick Start:")}
  ${chalk12.cyan("kuma login https://kuma.example.com")}   Authenticate (saves session)
  ${chalk12.cyan("kuma monitors list")}                    List all monitors + status
  ${chalk12.cyan('kuma monitors add --name "My API" --type http --url https://api.example.com')}
  ${chalk12.cyan("kuma heartbeat view 42")}                View recent heartbeats for monitor 42
  ${chalk12.cyan("kuma logout")}                           Clear saved session

${chalk12.bold("JSON / scripting mode:")}
  ${chalk12.cyan("kuma monitors list --json")}             Output as ${chalk12.dim("{ ok, data }")} for piping
  ${chalk12.cyan("KUMA_JSON=1 kuma monitors list")}        Activate JSON mode globally via env var
  ${chalk12.cyan("kuma monitors list --json | jq '.data[].name'")}

${chalk12.bold("Exit codes:")}
  ${chalk12.yellow("0")}  Success
  ${chalk12.yellow("1")}  General error
  ${chalk12.yellow("2")}  Connection / network error
  ${chalk12.yellow("3")}  Not found
  ${chalk12.yellow("4")}  Auth error (session expired \u2014 run ${chalk12.cyan("kuma login")} again)

${chalk12.bold("Multi-Instance:")}
  ${chalk12.cyan("kuma login https://kuma1.example.com --as server1")}   Save as named instance
  ${chalk12.cyan("kuma login https://kuma2.example.com --as server2")}   Save another instance
  ${chalk12.cyan("kuma instances list")}                                 List all saved instances
  ${chalk12.cyan("kuma use server1")}                                    Switch active instance

${chalk12.bold("Clusters:")}
  ${chalk12.dim("# Create a cluster (name is any label, --instances are login aliases)")}
  ${chalk12.cyan("kuma cluster create my-cluster --instances server1,server2 --primary server1")}
  ${chalk12.cyan("kuma cluster sync my-cluster")}              Sync monitors across cluster
  ${chalk12.cyan("kuma cluster info my-cluster")}              Show cluster details
  ${chalk12.cyan("kuma monitors list --cluster my-cluster")}   Unified view across cluster
  ${chalk12.cyan("kuma monitors list --instance server2")}     Target a specific instance

${chalk12.dim("Config stored at:")} ${chalk12.yellow(getConfigPath())}
`
);
program.command("status").description("Show the current connection config and login state").option("--json", "Output as JSON ({ ok, data })").addHelpText(
  "after",
  `
${chalk12.dim("Examples:")}
  ${chalk12.cyan("kuma status")}              Check if you are logged in
  ${chalk12.cyan("kuma status --json")}       Machine-readable login state
`
).action((opts) => {
  const json = isJsonMode(opts);
  const active = getActiveContext();
  const instances = getAllInstances();
  const clusters = getAllClusters();
  const instanceCount = Object.keys(instances).length;
  const clusterCount = Object.keys(clusters).length;
  const configPath = getConfigPath();
  if (json) {
    const config = getConfig();
    return jsonOut({
      loggedIn: !!config,
      active: active ?? void 0,
      url: config?.url,
      instanceCount,
      clusterCount,
      configPath
    });
  }
  if (!active && instanceCount === 0) {
    console.log(chalk12.yellow("Not logged in. Run: kuma login <url>"));
    return;
  }
  if (active?.type === "instance") {
    const inst = getInstanceConfig(active.name);
    if (inst) {
      console.log(chalk12.green(`Active: ${active.name}`) + ` (${chalk12.cyan(inst.url)})`);
      const clusterName = getInstanceCluster(active.name);
      if (clusterName) {
        console.log(`         Member of cluster: ${chalk12.magenta(clusterName)}`);
      }
    } else {
      console.log(chalk12.yellow(`Active instance '${active.name}' not found in config.`));
    }
  } else if (active?.type === "cluster") {
    const cluster = clusters[active.name];
    if (cluster) {
      const primaryInst = getInstanceConfig(cluster.primary);
      const primaryUrl = primaryInst ? ` (${chalk12.cyan(primaryInst.url)})` : "";
      console.log(chalk12.green(`Active: cluster '${active.name}'`) + ` primary: ${cluster.primary}${primaryUrl}`);
    } else {
      console.log(chalk12.yellow(`Active cluster '${active.name}' not found in config.`));
    }
  } else if (instanceCount === 1) {
    const name = Object.keys(instances)[0];
    const inst = instances[name];
    console.log(chalk12.green(`Active: ${name}`) + ` (${chalk12.cyan(inst.url)})`);
  } else {
    console.log(chalk12.yellow("No active context set. Run: kuma use <instance>"));
  }
  console.log();
  console.log(`Instances: ${chalk12.bold(String(instanceCount))}`);
  console.log(`Clusters:  ${chalk12.bold(String(clusterCount))}`);
  console.log(`Config:    ${chalk12.dim(configPath)}`);
});
loginCommand(program);
logoutCommand(program);
monitorsCommand(program);
heartbeatCommand(program);
statusPagesCommand(program);
upgradeCommand(program);
notificationsCommand(program);
configCommand(program);
instancesCommand(program);
useCommand(program);
clusterCommand(program);
var args = process.argv.slice(2);
var hasSubcommand = args.length > 0 && !args[0].startsWith("-");
if (!hasSubcommand && !args.includes("-h") && !args.includes("--help") && !args.includes("-V") && !args.includes("--version")) {
  launchDashboard({
    instance: void 0,
    cluster: void 0,
    refresh: "30"
  });
} else {
  program.parse(process.argv);
}
