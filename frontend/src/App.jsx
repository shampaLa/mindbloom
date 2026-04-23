import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  configuredContractId,
  configuredNetworkPassphrase,
  connectWallet,
  discoverWalletState,
  formatDate,
  formatMinutes,
  getContractExplorerLink,
  getExplorerLink,
  getNetworkLabel,
  hasContractConfig,
  logSession,
  parseError,
  readContractActivity,
  readDashboard,
  readRecentSessions,
  saveProfile,
  shortAddress,
  updateWeeklyGoal
} from "./lib/mindBloom";

const emptyWallet = {
  account: "",
  network: "",
  networkPassphrase: "",
  rpcUrl: "",
  isConnecting: false,
  error: ""
};

const emptyTx = {
  status: "idle",
  message: "",
  hash: ""
};

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function Panel({ eyebrow, title, body, children, tone = "bloom" }) {
  return (
    <section className={`panel panel-${tone}`}>
      <div className="panel-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {body ? <p className="panel-body">{body}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, note, loading = false }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <div className={loading ? "skeleton skeleton-metric" : "metric-value"}>
        {loading ? "" : value}
      </div>
      <p className="metric-note">{loading ? <span className="skeleton skeleton-note" /> : note}</p>
    </article>
  );
}

function ActivitySkeleton() {
  return (
    <div className="session-list">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="session-card session-skeleton" key={index}>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-note" />
          <span className="skeleton skeleton-badge" />
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ activities, loading, walletAccount }) {
  if (loading) {
    return <ActivitySkeleton />;
  }

  if (!activities?.length) {
    return (
      <p className="empty-state">
        Waiting for recent contract events. The public wellness feed comes alive as soon as fresh
        Soroban writes land.
      </p>
    );
  }

  return (
    <div className="activity-feed">
      {activities.map((activity) => {
        const ownActivity = walletAccount && activity.mindfulUser === walletAccount;

        return (
          <article
            className={`activity-card activity-${activity.accent}${ownActivity ? " activity-own" : ""}`}
            key={activity.id}
          >
            <div className="activity-topline">
              <span className="activity-badge">{activity.badge}</span>
              <span className="activity-user">
                {ownActivity ? "Your wallet" : shortAddress(activity.mindfulUser)}
              </span>
            </div>
            <h3>{activity.title}</h3>
            <p>{activity.detail}</p>
            <div className="activity-meta">
              <span>{formatDate(activity.timestamp)}</span>
              {activity.explorerLink ? (
                <a href={activity.explorerLink} target="_blank" rel="noreferrer">
                  View tx
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [wallet, setWallet] = useState(emptyWallet);
  const [txState, setTxState] = useState(emptyTx);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    weeklyGoalMinutes: "240"
  });
  const [goalForm, setGoalForm] = useState("300");
  const [sessionForm, setSessionForm] = useState({
    practiceType: "",
    minutesSpent: "20"
  });

  useEffect(() => {
    let isMounted = true;
    let watcher = null;

    async function syncWallet() {
      try {
        const nextState = await discoverWalletState();
        if (!isMounted) {
          return;
        }

        setWallet((current) => ({
          ...current,
          ...nextState,
          isConnecting: false,
          error: ""
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setWallet((current) => ({
          ...current,
          isConnecting: false,
          error: parseError(error)
        }));
      }
    }

    async function startWatcher() {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const { WatchWalletChanges } = await import("@stellar/freighter-api");
        if (!isMounted) {
          return;
        }

        watcher = new WatchWalletChanges(3000);
        watcher.watch(() => {
          setTxState(emptyTx);
          syncWallet();
        });
      } catch {
        watcher = null;
      }
    }

    syncWallet();
    startWatcher();

    return () => {
      isMounted = false;
      watcher?.stop?.();
    };
  }, []);

  const wrongNetwork =
    Boolean(wallet.networkPassphrase) && wallet.networkPassphrase !== configuredNetworkPassphrase;
  const readyForReads = Boolean(wallet.account) && hasContractConfig() && !wrongNetwork;
  const readyForWrites = Boolean(wallet.account) && hasContractConfig() && !wrongNetwork;
  const contractExplorerLink = getContractExplorerLink();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", wallet.account, wallet.networkPassphrase],
    queryFn: () => readDashboard(wallet.account),
    enabled: readyForReads
  });

  const sessionsQuery = useQuery({
    queryKey: [
      "sessions",
      wallet.account,
      wallet.networkPassphrase,
      dashboardQuery.data?.sessionCount || 0
    ],
    queryFn: () => readRecentSessions(wallet.account, 5),
    enabled: readyForReads && Boolean(dashboardQuery.data)
  });

  const activityQuery = useQuery({
    queryKey: ["activity", configuredContractId],
    queryFn: () => readContractActivity(8),
    enabled: hasContractConfig(),
    staleTime: 10_000,
    refetchInterval: 15_000
  });

  useEffect(() => {
    if (!dashboardQuery.data) {
      return;
    }

    setGoalForm(String(dashboardQuery.data.weeklyGoalMinutes));
    setProfileForm((current) => ({
      displayName: current.displayName || dashboardQuery.data.displayName,
      weeklyGoalMinutes: current.weeklyGoalMinutes || String(dashboardQuery.data.weeklyGoalMinutes)
    }));
  }, [dashboardQuery.data]);

  const dashboard = dashboardQuery.data;
  const weeklyProgress = useMemo(() => {
    if (!dashboard?.weeklyGoalMinutes) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((dashboard.minutesThisWeek / dashboard.weeklyGoalMinutes) * 100)
    );
  }, [dashboard]);

  const activitySummary = useMemo(() => {
    const activities = activityQuery.data || [];
    const mindfulUsers = new Set(
      activities.map((activity) => activity.mindfulUser).filter(Boolean)
    );

    return {
      eventCount: activities.length,
      mindfulUserCount: mindfulUsers.size,
      goalReachedCount: activities.filter((activity) => activity.kind === "weekly_goal_reached")
        .length,
      sessionCount: activities.filter((activity) => activity.kind === "session_logged").length
    };
  }, [activityQuery.data]);

  const queryError = activityQuery.error || dashboardQuery.error || sessionsQuery.error;
  const txExplorerLink = getExplorerLink(wallet.networkPassphrase, txState.hash);

  async function runLedgerAction(action, pendingMessage, successMessage) {
    if (!wallet.account) {
      throw new Error("Connect Freighter before sending a transaction.");
    }

    if (wrongNetwork) {
      throw new Error(`Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`);
    }

    setTxState({
      status: "pending",
      message: pendingMessage,
      hash: ""
    });

    try {
      const result = await action();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["sessions", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] })
      ]);

      setTxState({
        status: "success",
        message: successMessage,
        hash: result.hash
      });
    } catch (error) {
      const message = parseError(error);
      setTxState({
        status: "error",
        message,
        hash: ""
      });
      throw error;
    }
  }

  const saveProfileMutation = useMutation({
    mutationFn: ({ displayName, weeklyGoalMinutes }) =>
      runLedgerAction(
        () => saveProfile(wallet.account, displayName, weeklyGoalMinutes),
        "Composing your wellness profile on Stellar...",
        "Wellness profile saved on Soroban."
      )
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ weeklyGoalMinutes }) =>
      runLedgerAction(
        () => updateWeeklyGoal(wallet.account, weeklyGoalMinutes),
        "Updating your weekly mindfulness goal...",
        "Weekly wellness goal updated."
      )
  });

  const logSessionMutation = useMutation({
    mutationFn: ({ practiceType, minutesSpent }) =>
      runLedgerAction(
        () => logSession(wallet.account, practiceType, minutesSpent),
        "Writing your mindfulness session to Stellar...",
        "Mindfulness session logged."
      )
  });

  const anyMutationPending =
    saveProfileMutation.isPending || updateGoalMutation.isPending || logSessionMutation.isPending;

  async function handleConnectWallet() {
    setWallet((current) => ({
      ...current,
      isConnecting: true,
      error: ""
    }));

    try {
      const nextState = await connectWallet();
      setWallet({
        ...emptyWallet,
        ...nextState,
        isConnecting: false
      });
    } catch (error) {
      setWallet((current) => ({
        ...current,
        isConnecting: false,
        error: parseError(error)
      }));
    }
  }

  function handleProfileSubmit(event) {
    event.preventDefault();

    const displayName = profileForm.displayName.trim();
    const weeklyGoalMinutes = Number(profileForm.weeklyGoalMinutes);

    if (!displayName) {
      setTxState({
        status: "error",
        message: "Add a profile name before saving your wellness profile.",
        hash: ""
      });
      return;
    }

    if (Number.isNaN(weeklyGoalMinutes) || weeklyGoalMinutes < 30 || weeklyGoalMinutes > 5000) {
      setTxState({
        status: "error",
        message: "Weekly mindfulness goals must stay between 30 and 5000 minutes.",
        hash: ""
      });
      return;
    }

    saveProfileMutation.mutate({
      displayName,
      weeklyGoalMinutes
    });
  }

  function handleGoalSubmit(event) {
    event.preventDefault();

    const weeklyGoalMinutes = Number(goalForm);
    if (Number.isNaN(weeklyGoalMinutes) || weeklyGoalMinutes < 30 || weeklyGoalMinutes > 5000) {
      setTxState({
        status: "error",
        message: "Choose a weekly wellness goal between 30 and 5000 minutes.",
        hash: ""
      });
      return;
    }

    updateGoalMutation.mutate({
      weeklyGoalMinutes
    });
  }

  function handleSessionSubmit(event) {
    event.preventDefault();

    const practiceType = sessionForm.practiceType.trim();
    const minutesSpent = Number(sessionForm.minutesSpent);

    if (!practiceType) {
      setTxState({
        status: "error",
        message: "Add a session type so your mindfulness journal stays meaningful.",
        hash: ""
      });
      return;
    }

    if (Number.isNaN(minutesSpent) || minutesSpent < 5 || minutesSpent > 480) {
      setTxState({
        status: "error",
        message: "Mindfulness sessions must be between 5 and 480 minutes.",
        hash: ""
      });
      return;
    }

    logSessionMutation.mutate({
      practiceType,
      minutesSpent
    });
  }

  const liveStatusMessage =
    wallet.error ||
    (wrongNetwork
      ? `Connected to ${getNetworkLabel(wallet.networkPassphrase)}. Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`
      : txState.message ||
        (queryError
          ? parseError(queryError)
          : hasContractConfig()
            ? "Ready to read and write mindfulness sessions on Stellar."
            : "Deploy the MindBloom contract and export the frontend config before using the app."));

  return (
    <div className="app-shell">
      <div className="glow glow-one" />
      <div className="glow glow-two" />
      <div className="glow glow-three" />

      <header className="hero">
        <div className="hero-main">
          <div className="brand-row">
            <BrandMark />
            <div>
              <p className="kicker">On-chain mindfulness tracker</p>
              <h1>MindBloom</h1>
            </div>
          </div>

          <p className="lead">
            Log meditation, breathing, and reflection sessions on Stellar with a wallet-backed
            wellness profile, a calm streak that grows across mindful days, and a public contract
            pulse that keeps the product useful even before you connect.
          </p>

          <div className="hero-actions">
            <button
              className="button button-primary"
              onClick={handleConnectWallet}
              disabled={wallet.isConnecting}
            >
              {wallet.isConnecting
                ? "Connecting..."
                : wallet.account
                  ? "Wallet Connected"
                  : "Connect Freighter"}
            </button>
            <div className="hero-badges">
              <span className="pill">Soroban powered</span>
              <span className="pill">Calm streaks</span>
              <span className="pill">Live wellness pulse</span>
            </div>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-side-top">
            <div>
              <p className="side-label">Profile</p>
              <strong>{wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}</strong>
            </div>
            <div>
              <p className="side-label">Network</p>
              <strong>
                {wallet.networkPassphrase
                  ? getNetworkLabel(wallet.networkPassphrase)
                  : "Awaiting Freighter"}
              </strong>
            </div>
          </div>

          <div className="hero-side-stat">
            <span>Contract</span>
            {contractExplorerLink ? (
              <a className="contract-link" href={contractExplorerLink} target="_blank" rel="noreferrer">
                {shortAddress(configuredContractId)}
              </a>
            ) : (
              <strong>Not deployed</strong>
            )}
          </div>

          <div className="progress-shell">
            <div className="progress-labels">
              <span>Weekly wellness goal</span>
              <span>{dashboard ? `${weeklyProgress}%` : "0%"}</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${weeklyProgress}%` }} />
            </div>
          </div>

          <div className="hero-pulse">
            <div>
              <p className="side-label">Contract pulse</p>
              <strong>{activitySummary.eventCount} recent events</strong>
            </div>
            <div>
              <p className="side-label">Mindful wallets</p>
              <strong>{activitySummary.mindfulUserCount || 0}</strong>
            </div>
          </div>

          <p className="hero-note">
            Auto-refresh keeps the public feed warm while wallet-backed writes update your
            wellness profile, your calm streak, and your recent sessions after each confirmed
            transaction.
          </p>
        </div>
      </header>

      <section className="status-banner">
        <div>
          <p className="status-label">Live status</p>
          <p className="status-copy">{liveStatusMessage}</p>
        </div>
        {txExplorerLink ? (
          <a className="status-link" href={txExplorerLink} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : null}
      </section>

      <section className="panel-grid panel-grid-activity">
        <Panel
          eyebrow="Public contract feed"
          title="Live Soroban activity"
          body="Recent events stream directly from the deployed contract on Stellar Testnet and refresh automatically every 15 seconds."
          tone="still"
        >
          <div className="activity-summary">
            <span className="pill pill-soft">{activitySummary.sessionCount} sessions logged</span>
            <span className="pill pill-soft">{activitySummary.goalReachedCount} weekly goals met</span>
            <span className="pill pill-soft">{activitySummary.mindfulUserCount} mindful wallets</span>
            {contractExplorerLink ? (
              <a className="status-link" href={contractExplorerLink} target="_blank" rel="noreferrer">
                View contract
              </a>
            ) : null}
          </div>
          <ActivityFeed
            activities={activityQuery.data}
            loading={activityQuery.isLoading}
            walletAccount={wallet.account}
          />
        </Panel>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Mindful minutes"
          value={dashboard ? formatMinutes(dashboard.totalMinutes) : "0m"}
          note={
            dashboard ? `${dashboard.sessionCount} chain-recorded sessions` : "Starts after your first session"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="This week"
          value={dashboard ? formatMinutes(dashboard.minutesThisWeek) : "0m"}
          note={
            dashboard
              ? `${Math.max(dashboard.weeklyGoalMinutes - dashboard.minutesThisWeek, 0)} minutes left to goal`
              : "Set your weekly mindfulness goal"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="Calm streak"
          value={
            dashboard
              ? `${dashboard.currentStreak} day${dashboard.currentStreak === 1 ? "" : "s"}`
              : "0 days"
          }
          note={
            dashboard
              ? dashboard.goalReachedThisWeek
                ? "Weekly intention already met"
                : "Log today to keep the streak alive"
              : "Consecutive mindful days"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="Profile name"
          value={dashboard?.displayName || "No profile"}
          note={wallet.account ? shortAddress(wallet.account) : "Connect to personalize"}
          loading={dashboardQuery.isLoading}
        />
      </section>

      {!hasContractConfig() ? (
        <Panel
          eyebrow="Deployment flow"
          title="Deploy MindBloom and wire the live app"
          body="Build the Rust contract, deploy it with Stellar CLI, and export the new contract ID so the frontend can read and write against its own on-chain wellness ledger."
          tone="grounded"
        >
          <div className="code-stack">
            <code>stellar keys generate alice --network testnet --fund</code>
            <code>npm run contract:build</code>
            <code>npm run contract:deploy</code>
            <code>npm run export:frontend</code>
          </div>
        </Panel>
      ) : null}

      <section className="panel-grid">
        <Panel
          eyebrow="Wellness profile"
          title="Create or refresh your mindful identity"
          body="Save a public display name and the number of mindfulness minutes you want to reach each week."
          tone="bloom"
        >
          <form className="form-grid" onSubmit={handleProfileSubmit}>
            <label>
              <span>Display name</span>
              <input
                type="text"
                placeholder="Still Harbor"
                value={profileForm.displayName}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Weekly goal (minutes)</span>
              <input
                type="number"
                min="30"
                max="5000"
                step="5"
                value={profileForm.weeklyGoalMinutes}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    weeklyGoalMinutes: event.target.value
                  }))
                }
              />
            </label>
            <button className="button button-primary" type="submit" disabled={anyMutationPending || !readyForWrites}>
              {saveProfileMutation.isPending ? "Saving..." : "Save profile"}
            </button>
          </form>
        </Panel>

        <Panel
          eyebrow="Goal tuning"
          title="Adjust your weekly wellness target"
          body="Retune your minutes whenever your season changes. Weekly progress still resets at the next on-chain week boundary."
          tone="still"
        >
          <form className="form-grid" onSubmit={handleGoalSubmit}>
            <label>
              <span>New weekly goal</span>
              <input
                type="number"
                min="30"
                max="5000"
                step="5"
                value={goalForm}
                onChange={(event) => setGoalForm(event.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              type="submit"
              disabled={anyMutationPending || !readyForWrites || !dashboard}
            >
              {updateGoalMutation.isPending ? "Updating..." : "Update goal"}
            </button>
          </form>
        </Panel>

        <Panel
          eyebrow="Session log"
          title="Record a mindful moment"
          body="Capture the practice type, the time you spent, and the calm streak impact. Your dashboard and the public event feed refresh after each confirmed Soroban write."
          tone="grounded"
        >
          <form className="form-grid" onSubmit={handleSessionSubmit}>
            <label>
              <span>Practice type</span>
              <input
                type="text"
                placeholder="Meditation, Breathing, Reflection"
                value={sessionForm.practiceType}
                onChange={(event) =>
                  setSessionForm((current) => ({ ...current, practiceType: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Minutes</span>
              <input
                type="number"
                min="5"
                max="480"
                step="5"
                value={sessionForm.minutesSpent}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    minutesSpent: event.target.value
                  }))
                }
              />
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={anyMutationPending || !readyForWrites || !dashboard}
            >
              {logSessionMutation.isPending ? "Logging..." : "Log session"}
            </button>
          </form>
        </Panel>
      </section>

      <section className="panel-grid panel-grid-bottom">
        <Panel
          eyebrow="Private session feed"
          title="Recent chain-confirmed sessions"
          body="The latest five mindfulness sessions are read directly from the deployed contract for the connected wallet."
          tone="grounded"
        >
          {sessionsQuery.isLoading ? (
            <ActivitySkeleton />
          ) : sessionsQuery.data?.length ? (
            <div className="session-list">
              {sessionsQuery.data.map((session) => (
                <article className="session-card" key={session.id}>
                  <div>
                    <h3>{session.practiceType}</h3>
                    <p>{formatDate(session.timestamp)}</p>
                  </div>
                  <div className="session-meta">
                    <span>{formatMinutes(session.minutesSpent)}</span>
                    <span>Calm streak {session.streakAfterLog}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {dashboard
                ? "Your private session feed will appear after the first mindful check-in."
                : "Connect Freighter and create a wellness profile to load your private dashboard."}
            </p>
          )}
        </Panel>

        <Panel
          eyebrow="Platform overview"
          title="How MindBloom works"
          body="MindBloom combines Freighter wallet access, Soroban contract writes, and a public event stream so the experience stays valuable before and after connection."
          tone="still"
        >
          <ul className="check-list">
            <li>Connect a Freighter wallet on Stellar Testnet</li>
            <li>Create a wellness profile and set a weekly mindfulness goal</li>
            <li>Log meditation, breathing, gratitude, body scan, or custom sessions on-chain</li>
            <li>Track mindful minutes, calm streaks, and goal achievements in a live public feed</li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}
