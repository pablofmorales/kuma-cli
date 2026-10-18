import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { KumaClient, createAuthenticatedClient, buildBasicAuthHeaders } from "../client.js";
import {
  getAllInstances,
  getAllClusters,
  getInstanceConfig,
  getClusterConfig,
  saveConfig,
} from "../config.js";
import { Header } from "./components/header.js";
import { Footer } from "./components/footer.js";
import { MonitorTable } from "./components/monitor-table.js";
import { MonitorDetail } from "./components/monitor-detail.js";
import { ConfirmDialog } from "./components/confirm-dialog.js";
import { Toast } from "./components/toast.js";
import { SearchInput } from "./components/search-input.js";
import { FilterMenu } from "./components/filter-menu.js";
import { InstanceSwitcher } from "./components/instance-switcher.js";
import { ClusterSwitcher } from "./components/cluster-switcher.js";
import { LoginScreen } from "./components/login-screen.js";
import { HelpScreen } from "./components/help-screen.js";
import { useMonitors } from "./hooks/use-monitors.js";
import { useHeartbeats } from "./hooks/use-heartbeats.js";
import { useFilter } from "./hooks/use-filter.js";
import { useToast } from "./hooks/use-toast.js";

export interface AppProps {
  client?: KumaClient | null;
  instanceName?: string;
  clusterName?: string | null;
  refreshInterval: number;
}

type PendingAction = {
  type: "pause" | "delete";
  monitorId: number;
  monitorName: string;
};

type OverlayMode = "none" | "instance-switcher" | "cluster-switcher" | "help";

export function App({
  client: initialClient,
  instanceName: initialInstanceName,
  clusterName: initialClusterName,
  refreshInterval,
}: AppProps): React.ReactElement {
  const { exit } = useApp();

  // Stateful client for instance/cluster switching
  const [activeClient, setActiveClient] = useState<KumaClient | null>(initialClient ?? null);
  const [activeInstanceName, setActiveInstanceName] = useState(initialInstanceName ?? "");
  const [activeClusterName, setActiveClusterName] = useState<string | null>(
    initialClusterName ?? null
  );
  const [overlay, setOverlay] = useState<OverlayMode>("none");
  const [connecting, setConnecting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Login handler for when no instance is configured
  const handleLogin = useCallback(async (url: string, username: string, password: string) => {
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
      // Now create an authenticated client with the token
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

  // Show login screen if no client
  if (!activeClient) {
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading} />;
  }

  // From here on, activeClient is guaranteed non-null
  return <Dashboard
    client={activeClient}
    instanceName={activeInstanceName}
    clusterName={activeClusterName}
    refreshInterval={refreshInterval}
    exit={exit}
    setActiveClient={setActiveClient}
    setActiveInstanceName={setActiveInstanceName}
    setActiveClusterName={setActiveClusterName}
    overlay={overlay}
    setOverlay={setOverlay}
    connecting={connecting}
    setConnecting={setConnecting}
  />;
}

interface DashboardProps {
  client: KumaClient;
  instanceName: string;
  clusterName: string | null;
  refreshInterval: number;
  exit: () => void;
  setActiveClient: (c: KumaClient | null) => void;
  setActiveInstanceName: (n: string) => void;
  setActiveClusterName: (n: string | null) => void;
  overlay: OverlayMode;
  setOverlay: (o: OverlayMode) => void;
  connecting: boolean;
  setConnecting: (c: boolean) => void;
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
  setConnecting,
}: DashboardProps): React.ReactElement {
  const { monitors, loading, error, connected, changedMonitorIds, refresh } = useMonitors(
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
    hasActiveFilters,
  } = useFilter(monitors);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [loadingMonitorId, setLoadingMonitorId] = useState<number | null>(null);
  const { toastMessage, toastColor, showToast } = useToast();

  const { heartbeats, loading: hbLoading, error: hbError, refresh: hbRefresh } = useHeartbeats(
    activeClient,
    view === "detail" ? selectedMonitorId : null
  );

  const selectedMonitor = filteredMonitors.length > 0 ? filteredMonitors[selectedIndex] : null;
  const displayName = activeClusterName
    ? `${activeClusterName}/${activeInstanceName}`
    : activeInstanceName;

  // --- Instance/Cluster switching ---

  const switchToInstance = useCallback(
    async (name: string) => {
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
        const newClient = await createAuthenticatedClient(instConfig.url, instConfig.token, buildBasicAuthHeaders(instConfig.basicAuthUser, instConfig.basicAuthPass));
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
        showToast(`Failed: ${msg}`, "red", 4000);
      } finally {
        setConnecting(false);
      }
    },
    [activeClient, activeInstanceName, activeClusterName, showToast, clearFilters]
  );

  const switchToCluster = useCallback(
    async (name: string) => {
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
        const newClient = await createAuthenticatedClient(primaryConfig.url, primaryConfig.token, buildBasicAuthHeaders(primaryConfig.basicAuthUser, primaryConfig.basicAuthPass));
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
        showToast(`Failed: ${msg}`, "red", 4000);
      } finally {
        setConnecting(false);
      }
    },
    [activeClient, activeClusterName, showToast, clearFilters]
  );

  // --- Monitor actions ---

  const executeAction = useCallback(
    async (action: PendingAction) => {
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
        showToast(`Error: ${msg}`, "red", 4000);
      } finally {
        setLoadingMonitorId(null);
      }
    },
    [activeClient, refresh, showToast]
  );

  const handleConfirm = useCallback(() => {
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      executeAction(action);
    }
  }, [pendingAction, executeAction]);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  // --- Keyboard input ---

  useInput((input, key) => {
    // Block input while connecting or overlay is open
    if (connecting) return;
    if (overlay !== "none") return;
    // Confirm dialog takes full control
    if (pendingAction) return;
    // Don't process while action is loading
    if (loadingMonitorId !== null) return;

    // Quit from any view (only in normal mode)
    if (input === "q" && mode === "normal") {
      activeClient.disconnect();
      exit();
      return;
    }

    // Instance/cluster switching and help (available from any view)
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

    // Detail view controls
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

    // Search mode: only Escape and Enter
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

    // Filter menu: handled by component
    if (mode === "filter-menu") return;

    // Normal list view controls
    if (input === "r") { refresh(); return; }
    if (input === "/") { setMode("search"); return; }
    if (input === "f") { setMode("filter-menu"); return; }

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

    // Enter: open detail view
    if (key.return && selectedMonitor) {
      setSelectedMonitorId(selectedMonitor.id);
      setView("detail");
      return;
    }

    // Pause
    if (input === "p" && selectedMonitor && selectedMonitor.status !== 3) {
      setPendingAction({ type: "pause", monitorId: selectedMonitor.id, monitorName: selectedMonitor.name });
      return;
    }

    // Resume
    if (input === "u" && selectedMonitor && selectedMonitor.status === 3) {
      setLoadingMonitorId(selectedMonitor.id);
      activeClient
        .resumeMonitor(selectedMonitor.id)
        .then(() => { showToast(`Monitor "${selectedMonitor.name}" resumed`, "green"); refresh(); })
        .catch((err: Error) => { showToast(`Error: ${err.message}`, "red", 4000); })
        .finally(() => { setLoadingMonitorId(null); });
      return;
    }

    // Delete
    if (input === "d" && selectedMonitor) {
      setPendingAction({ type: "delete", monitorId: selectedMonitor.id, monitorName: selectedMonitor.name });
      return;
    }
  });

  // Clamp selectedIndex
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filteredMonitors.length - 1));
  useEffect(() => {
    if (clampedIndex !== selectedIndex) {
      setSelectedIndex(clampedIndex);
    }
  }, [clampedIndex, selectedIndex]);

  // --- Overlays ---

  if (overlay === "instance-switcher") {
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={connected} monitors={monitors} />
        <InstanceSwitcher
          instances={getAllInstances()}
          currentInstance={activeInstanceName}
          onSelect={(name) => void switchToInstance(name)}
          onCancel={() => setOverlay("none")}
        />
      </Box>
    );
  }

  if (overlay === "cluster-switcher") {
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={connected} monitors={monitors} />
        <ClusterSwitcher
          clusters={getAllClusters()}
          currentCluster={activeClusterName}
          onSelect={(name) => void switchToCluster(name)}
          onCancel={() => setOverlay("none")}
        />
      </Box>
    );
  }

  if (overlay === "help") {
    return <HelpScreen onClose={() => setOverlay("none")} />;
  }

  // Connecting state
  if (connecting) {
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={false} monitors={[]} />
        <Text color="yellow">Connecting...</Text>
      </Box>
    );
  }

  // Loading state
  if (loading && monitors.length === 0) {
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={connected} monitors={[]} />
        <Text color="yellow">Loading monitors...</Text>
      </Box>
    );
  }

  // Error state
  if (error && monitors.length === 0) {
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={connected} monitors={[]} />
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press r to retry, q to quit</Text>
      </Box>
    );
  }

  // Empty state
  if (monitors.length === 0) {
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={connected} monitors={[]} />
        <Text dimColor>No monitors found.</Text>
        <Footer view="list" mode={mode} />
      </Box>
    );
  }

  // Detail view
  if (view === "detail") {
    const detailMonitor = monitors.find((m) => m.id === selectedMonitorId);
    if (!detailMonitor) {
      setView("list");
      return <Text>Monitor not found</Text>;
    }
    return (
      <Box flexDirection="column">
        <Header instanceName={displayName} connected={connected} monitors={monitors} />
        <MonitorDetail
          monitor={detailMonitor}
          heartbeats={heartbeats}
          loading={hbLoading}
          error={hbError}
        />
        {toastMessage && <Toast message={toastMessage} color={toastColor} />}
        <Footer view="detail" mode="normal" />
      </Box>
    );
  }

  // List view
  return (
    <Box flexDirection="column">
      <Header
        instanceName={displayName}
        connected={connected}
        monitors={monitors}
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        filteredCount={hasActiveFilters ? filteredMonitors.length : undefined}
      />

      {mode === "search" && (
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
      )}

      {mode === "filter-menu" && (
        <FilterMenu
          currentFilter={statusFilter}
          onSelect={(status) => { setStatusFilter(status); setMode("normal"); setSelectedIndex(0); }}
          onCancel={() => setMode("normal")}
        />
      )}

      <MonitorTable
        monitors={filteredMonitors}
        selectedIndex={clampedIndex}
        loadingMonitorId={loadingMonitorId}
        changedMonitorIds={changedMonitorIds}
      />

      {pendingAction && (
        <ConfirmDialog
          message={
            pendingAction.type === "pause"
              ? `Pause "${pendingAction.monitorName}"?`
              : `Delete "${pendingAction.monitorName}"? This cannot be undone.`
          }
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {toastMessage && !pendingAction && (
        <Toast message={toastMessage} color={toastColor} />
      )}

      {!pendingAction && <Footer view="list" mode={mode} selectedStatus={selectedMonitor?.status} />}
    </Box>
  );
}
