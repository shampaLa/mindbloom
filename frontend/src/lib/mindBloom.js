import { mindBloomConfig } from "./contract-config";

const networkLabels = {
  "Public Global Stellar Network ; September 2015": "Stellar Mainnet",
  "Test SDF Network ; September 2015": "Stellar Testnet",
  standalone: "Stellar Local"
};

let freighterApiPromise;
let stellarSdkPromise;

export const configuredContractId =
  import.meta.env.VITE_CONTRACT_ID || mindBloomConfig.fallbackContractId || "";
export const configuredNetworkPassphrase =
  import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ||
  "Test SDF Network ; September 2015";
export const configuredRpcUrl =
  import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

function normalizeDashboard(dashboard) {
  return {
    displayName: dashboard.display_name,
    weeklyGoalMinutes: Number(dashboard.weekly_goal_minutes),
    totalMinutes: Number(dashboard.total_minutes),
    minutesThisWeek: Number(dashboard.minutes_this_week),
    sessionCount: Number(dashboard.session_count),
    currentStreak: Number(dashboard.current_streak),
    createdAt: Number(dashboard.created_at),
    goalReachedThisWeek: Boolean(dashboard.goal_reached_this_week)
  };
}

function normalizeSession(index, session) {
  return {
    id: `${index}-${session.timestamp}`,
    practiceType: session.practice_type,
    minutesSpent: Number(session.minutes_spent),
    timestamp: Number(session.timestamp),
    streakAfterLog: Number(session.streak_after_log)
  };
}

function allowHttpRpc(url) {
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}

async function loadFreighterApi() {
  freighterApiPromise ||= import("@stellar/freighter-api");
  return freighterApiPromise;
}

async function loadStellarSdk() {
  stellarSdkPromise ||= import("@stellar/stellar-sdk");
  return stellarSdkPromise;
}

async function buildClient(account = "") {
  if (!hasContractConfig()) {
    throw new Error(
      "No contract ID is configured yet. Deploy the MindBloom contract, then run `npm run export:frontend`."
    );
  }

  const { contract: StellarContract } = await loadStellarSdk();
  return StellarContract.Client.from({
    contractId: configuredContractId,
    rpcUrl: configuredRpcUrl,
    networkPassphrase: configuredNetworkPassphrase,
    publicKey: account || undefined,
    signTransaction: async (...args) => {
      const { signTransaction } = await loadFreighterApi();
      return signTransaction(...args);
    }
  });
}

async function buildRpcServer() {
  const { rpc } = await loadStellarSdk();
  return new rpc.Server(configuredRpcUrl, {
    allowHttp: allowHttpRpc(configuredRpcUrl)
  });
}

async function getWalletSnapshot() {
  const { getAddress, getNetworkDetails } = await loadFreighterApi();
  const [addressResult, networkResult] = await Promise.all([getAddress(), getNetworkDetails()]);

  if (addressResult.error) {
    throw new Error(addressResult.error.message);
  }

  if (networkResult.error) {
    throw new Error(networkResult.error.message);
  }

  return {
    account: addressResult.address,
    network: networkResult.network,
    networkPassphrase: networkResult.networkPassphrase,
    rpcUrl: networkResult.sorobanRpcUrl || configuredRpcUrl
  };
}

function normalizeActivityEvent(event, scValToNative) {
  const [kindValue, mindfulUserValue = ""] = event.topic.map((topic) => scValToNative(topic));
  const payload = scValToNative(event.value) || {};
  const kind = String(kindValue || "activity");
  const mindfulUser =
    typeof mindfulUserValue === "string" ? mindfulUserValue : String(mindfulUserValue || "");
  const timestamp = event.ledgerClosedAt
    ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
    : 0;

  const common = {
    id: event.id,
    kind,
    mindfulUser,
    ledger: Number(event.ledger || 0),
    timestamp,
    txHash: event.txHash || "",
    explorerLink: getExplorerLink(configuredNetworkPassphrase, event.txHash || "")
  };

  if (kind === "profile_saved") {
    const weeklyGoalMinutes = Number(payload.weekly_goal_minutes || 0);
    return {
      ...common,
      title: "Profile saved",
      accent: "bloom",
      detail: `${payload.display_name} set a weekly intention of ${formatMinutes(weeklyGoalMinutes)}.`,
      badge: `Goal ${formatMinutes(weeklyGoalMinutes)}`
    };
  }

  if (kind === "weekly_goal_updated") {
    const weeklyGoalMinutes = Number(payload.weekly_goal_minutes || 0);
    return {
      ...common,
      title: "Weekly goal updated",
      accent: "still",
      detail: `${shortAddress(mindfulUser)} adjusted the weekly wellness goal to ${formatMinutes(weeklyGoalMinutes)}.`,
      badge: `Goal ${formatMinutes(weeklyGoalMinutes)}`
    };
  }

  if (kind === "weekly_goal_reached") {
    const minutesThisWeek = Number(payload.minutes_this_week || 0);
    const currentStreak = Number(payload.current_streak || 0);
    return {
      ...common,
      title: "Weekly goal reached",
      accent: "still",
      detail: `${shortAddress(mindfulUser)} met the weekly intention with ${formatMinutes(minutesThisWeek)}.`,
      badge: `Calm streak ${currentStreak} day${currentStreak === 1 ? "" : "s"}`
    };
  }

  if (kind === "session_logged") {
    const minutesSpent = Number(payload.minutes_spent || 0);
    const minutesThisWeek = Number(payload.minutes_this_week || 0);
    const currentStreak = Number(payload.current_streak || 0);
    return {
      ...common,
      title: `${payload.practice_type} session logged`,
      accent: "grounded",
      detail: `${shortAddress(mindfulUser)} added ${formatMinutes(minutesSpent)}. Weekly total is ${formatMinutes(minutesThisWeek)}.`,
      badge: `Calm streak ${currentStreak} day${currentStreak === 1 ? "" : "s"}`
    };
  }

  return {
    ...common,
    title: "Contract activity",
    accent: "bloom",
    detail: `${shortAddress(mindfulUser)} triggered ${kind.replaceAll("_", " ")}.`,
    badge: `Ledger ${event.ledger}`
  };
}

async function submitTransaction(assembledTx) {
  const sentTx = await assembledTx.signAndSend();
  return {
    hash: sentTx.sendTransactionResponse?.hash || sentTx.getTransactionResponse?.txHash || "",
    result: sentTx.result
  };
}

export function hasContractConfig() {
  return Boolean(configuredContractId);
}

export function getNetworkLabel(networkPassphrase) {
  return networkLabels[networkPassphrase] || "Custom Stellar Network";
}

export function getContractExplorerLink(
  networkPassphrase = configuredNetworkPassphrase,
  contractId = configuredContractId
) {
  if (!contractId) {
    return "";
  }

  if (networkPassphrase === "Test SDF Network ; September 2015") {
    return `https://lab.stellar.org/r/testnet/contract/${contractId}`;
  }

  if (networkPassphrase === "Public Global Stellar Network ; September 2015") {
    return `https://lab.stellar.org/r/mainnet/contract/${contractId}`;
  }

  return "";
}

export function shortAddress(value = "") {
  if (!value) {
    return "Not connected";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function formatMinutes(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  if (!remainder) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

export function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return "No mindful sessions logged yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(Number(unixSeconds) * 1000));
}

export function getExplorerLink(networkPassphrase, hash) {
  if (!hash) {
    return "";
  }

  if (networkPassphrase === "Test SDF Network ; September 2015") {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  }

  if (networkPassphrase === "Public Global Stellar Network ; September 2015") {
    return `https://stellar.expert/explorer/public/tx/${hash}`;
  }

  return "";
}

export function parseError(error) {
  const candidates = [
    error?.message,
    error?.error?.message,
    error?.response?.data?.detail,
    error?.toString?.()
  ].filter(Boolean);

  return candidates[0] || "Something unexpected happened.";
}

export async function discoverWalletState() {
  const { isConnected } = await loadFreighterApi();
  const connection = await isConnected();
  if (connection.error || !connection.isConnected) {
    return {
      account: "",
      network: "",
      networkPassphrase: "",
      rpcUrl: configuredRpcUrl
    };
  }

  return getWalletSnapshot();
}

export async function connectWallet() {
  const { setAllowed } = await loadFreighterApi();
  const permission = await setAllowed();
  if (permission.error) {
    throw new Error(permission.error.message);
  }

  if (!permission.isAllowed) {
    throw new Error("Freighter did not grant access to this app.");
  }

  return getWalletSnapshot();
}

export async function readDashboard(account) {
  const client = await buildClient();
  const hasProfileTx = await client.has_profile({ mindful_user: account });

  if (!hasProfileTx.result) {
    return null;
  }

  const dashboardTx = await client.get_dashboard({ mindful_user: account });
  return normalizeDashboard(dashboardTx.result);
}

export async function readRecentSessions(account, limit = 5) {
  const client = await buildClient();
  const countTx = await client.get_session_count({ mindful_user: account });
  const count = Number(countTx.result || 0);

  if (!count) {
    return [];
  }

  const indexes = Array.from({ length: Math.min(count, limit) }, (_, idx) => count - idx - 1);
  const sessionResults = await Promise.all(
    indexes.map(async (index) => {
      const sessionTx = await client.get_session({ mindful_user: account, index });
      return normalizeSession(index, sessionTx.result);
    })
  );

  return sessionResults;
}

export async function readContractActivity(limit = 8) {
  if (!hasContractConfig()) {
    return [];
  }

  const [{ scValToNative }, server] = await Promise.all([loadStellarSdk(), buildRpcServer()]);
  const latestLedger = await server.getLatestLedger();
  const response = await server.getEvents({
    startLedger: Math.max(Number(latestLedger.sequence || 0) - 20_000, 1),
    filters: [
      {
        type: "contract",
        contractIds: [configuredContractId]
      }
    ],
    limit: Math.min(Math.max(limit * 3, 18), 40)
  });

  return response.events
    .filter((event) => event.inSuccessfulContractCall)
    .map((event) => normalizeActivityEvent(event, scValToNative))
    .sort((left, right) => right.ledger - left.ledger)
    .slice(0, limit);
}

export async function saveProfile(account, displayName, weeklyGoalMinutes) {
  const client = await buildClient(account);
  const tx = await client.save_profile({
    mindful_user: account,
    display_name: displayName,
    weekly_goal_minutes: Number(weeklyGoalMinutes)
  });

  return submitTransaction(tx);
}

export async function updateWeeklyGoal(account, weeklyGoalMinutes) {
  const client = await buildClient(account);
  const tx = await client.update_weekly_goal({
    mindful_user: account,
    new_goal_minutes: Number(weeklyGoalMinutes)
  });

  return submitTransaction(tx);
}

export async function logSession(account, practiceType, minutesSpent) {
  const client = await buildClient(account);
  const tx = await client.log_session({
    mindful_user: account,
    practice_type: practiceType,
    minutes_spent: Number(minutesSpent)
  });

  return submitTransaction(tx);
}
