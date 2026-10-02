/* ═══════════════════════════════════════════════════════════════════════
   FF PIPELINE — Dashboard JavaScript
   - Loads local data.json demo data
   - Lets visitors load public Sleeper NFL league data by username
   - Does not collect, store, or transmit Sleeper credentials
   ════════════════════════════════════════════════════════════════════════ */

"use strict";

/* ── Shared state ────────────────────────────────────────────────────── */

let dashboardData = null;
let trendChart = null;

const SLEEPER_API_BASE = "https://api.sleeper.app/v1";

const sleeperState = {
  username: "",
  user: null,
  season: "",
  leagues: [],
  selectedLeague: null,
  users: [],
  rosters: [],
  matchups: [],
  myRosterId: null
};

/* ── Theme Toggle ────────────────────────────────────────────────────── */

(function initializeThemeToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  const root = document.documentElement;

  let theme = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

  root.setAttribute("data-theme", theme);

  if (!toggle) {
    return;
  }

  toggle.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", theme);

    toggle.setAttribute(
      "aria-label",
      "Switch to " + (theme === "dark" ? "light" : "dark") + " mode"
    );

    toggle.innerHTML = theme === "dark"
      ? `
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      `
      : `
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      `;
  });
})();

/* ── Small utilities ────────────────────────────────────────────────── */

function getElement(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, digits = 1) {
  return asNumber(value, 0).toFixed(digits);
}

function getWeekFromLeague(league) {
  const week = asNumber(league?.settings?.leg, 0);
  return week > 0 ? week : 1;
}

function getManagerDisplayName(user) {
  if (!user) {
    return "Unknown manager";
  }

  return (
    user.metadata?.team_name ||
    user.display_name ||
    user.username ||
    "Unknown manager"
  );
}

function getRosterRecord(roster) {
  const settings = roster?.settings || {};

  return {
    wins: asNumber(settings.wins),
    losses: asNumber(settings.losses),
    ties: asNumber(settings.ties),
    pointsFor: asNumber(settings.fpts) + asNumber(settings.fpts_decimal) / 100,
    pointsAgainst:
      asNumber(settings.fpts_against) +
      asNumber(settings.fpts_against_decimal) / 100
  };
}

function recordLabel(record) {
  const base = `${record.wins}-${record.losses}`;
  return record.ties > 0 ? `${base}-${record.ties}` : base;
}

function scoreForMatchup(matchup) {
  return asNumber(matchup?.points, 0);
}

function normalizePositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return "FLEX";
  }

  if (positions.includes("QB")) {
    return "QB";
  }

  if (positions.includes("RB")) {
    return "RB";
  }

  if (positions.includes("WR")) {
    return "WR";
  }

  if (positions.includes("TE")) {
    return "TE";
  }

  if (positions.includes("K")) {
    return "K";
  }

  if (positions.includes("DEF")) {
    return "DEF";
  }

  return positions[0] || "FLEX";
}

function playerNameFromId(playerId) {
  if (!playerId) {
    return "Unknown player";
  }

  return `Player ${playerId}`;
}

/* ── Sleeper fetch helpers ───────────────────────────────────────────── */

async function sleeperFetchJson(path, fallbackMessage) {
  const response = await fetch(`${SLEEPER_API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(fallbackMessage);
  }

  return response.json();
}

function setSleeperStatus(message, isError = false) {
  const status = getElement("sleeper-connect-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setConnectButtonLoading(isLoading) {
  const button = getElement("sleeper-connect-button");
  const text = button?.querySelector(".league-connect__button-text");
  const spinner = button?.querySelector(".league-connect__button-spinner");

  if (!button) {
    return;
  }

  button.disabled = isLoading;

  if (text) {
    text.textContent = isLoading
      ? "Finding leagues…"
      : "Find my leagues";
  }

  if (spinner) {
    spinner.hidden = !isLoading;
  }
}

function resetLeaguePicker() {
  const picker = getElement("sleeper-league-picker");
  const leagueSelect = getElement("sleeper-league-select");

  if (!picker || !leagueSelect) {
    return;
  }

  leagueSelect.replaceChildren(
    new Option("Choose one of your leagues", "")
  );

  picker.hidden = true;
}

function removeTeamPicker() {
  const existingPicker = getElement("sleeper-team-picker");

  if (existingPicker) {
    existingPicker.remove();
  }
}

function showConnectPage() {
  const connectPage = getElement("connect");
  const dashboard = getElement("dashboard");
  const loading = getElement("loading");

  if (connectPage) {
    connectPage.style.display = "block";
  }

  if (dashboard) {
    dashboard.style.display = "none";
  }

  if (loading) {
    loading.style.display = "none";
  }
}

function showDashboardPage() {
  const connectPage = getElement("connect");
  const dashboard = getElement("dashboard");
  const loading = getElement("loading");

  if (connectPage) {
    connectPage.style.display = "none";
  }

  if (loading) {
    loading.style.display = "none";
  }

  if (dashboard) {
    dashboard.style.display = "block";
  }
}

/* ── Sleeper connection flow ─────────────────────────────────────────── */

function initializeSleeperConnection() {
  const form = getElement("sleeper-connect-form");
  const usernameInput = getElement("sleeper-username");
  const seasonInput = getElement("sleeper-season");
  const leagueSelect = getElement("sleeper-league-select");
  const loadLeagueButton = getElement("sleeper-load-league");

  if (!form || !usernameInput || !seasonInput || !leagueSelect || !loadLeagueButton) {
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const season = seasonInput.value;

    if (!username) {
      setSleeperStatus("Enter your Sleeper username first.", true);
      usernameInput.focus();
      return;
    }

    removeTeamPicker();
    resetLeaguePicker();
    setConnectButtonLoading(true);

    try {
      setSleeperStatus(`Looking up @${username}…`);

      const user = await sleeperFetchJson(
        `/user/${encodeURIComponent(username)}`,
        "That Sleeper username could not be found."
      );

      if (!user?.user_id) {
        throw new Error("That Sleeper username could not be found.");
      }

      sleeperState.username = username;
      sleeperState.user = user;
      sleeperState.season = season;

      setSleeperStatus(
        `Finding ${season} NFL leagues for @${user.display_name || username}…`
      );

      const leagues = await sleeperFetchJson(
        `/user/${encodeURIComponent(user.user_id)}/leagues/nfl/${encodeURIComponent(season)}`,
        "Unable to load leagues for that Sleeper account."
      );

      if (!Array.isArray(leagues) || leagues.length === 0) {
        setSleeperStatus(
          `No NFL leagues were found for @${username} in ${season}.`,
          true
        );
        return;
      }

      sleeperState.leagues = leagues;

      for (const league of leagues) {
        const leagueName = league.name || `League ${league.league_id}`;
        const rosterCount = asNumber(league.total_rosters, 0);

        leagueSelect.append(
          new Option(
            rosterCount > 0
              ? `${leagueName} · ${rosterCount} teams`
              : leagueName,
            league.league_id
          )
        );
      }

      getElement("sleeper-league-picker").hidden = false;

      setSleeperStatus(
        `Found ${leagues.length} league${leagues.length === 1 ? "" : "s"}. Choose the league you want to analyze.`
      );
    } catch (error) {
      console.error("Sleeper username lookup failed:", error);

      setSleeperStatus(
        error.message || "Unable to connect to Sleeper right now.",
        true
      );
    } finally {
      setConnectButtonLoading(false);
    }
  });

  loadLeagueButton.addEventListener("click", async () => {
    const leagueId = leagueSelect.value;

    if (!leagueId) {
      setSleeperStatus("Choose a league before loading data.", true);
      return;
    }

    loadLeagueButton.disabled = true;
    loadLeagueButton.textContent = "Loading league…";
    removeTeamPicker();

    try {
      setSleeperStatus("Loading league details, managers, and rosters…");

      const [league, users, rosters] = await Promise.all([
        sleeperFetchJson(
          `/league/${encodeURIComponent(leagueId)}`,
          "Unable to load league details."
        ),
        sleeperFetchJson(
          `/league/${encodeURIComponent(leagueId)}/users`,
          "Unable to load league members."
        ),
        sleeperFetchJson(
          `/league/${encodeURIComponent(leagueId)}/rosters`,
          "Unable to load league rosters."
        )
      ]);

      if (!league || !Array.isArray(users) || !Array.isArray(rosters)) {
        throw new Error("Sleeper returned incomplete league data.");
      }

      sleeperState.selectedLeague = league;
      sleeperState.users = users;
      sleeperState.rosters = rosters;

      showTeamPicker();
    } catch (error) {
      console.error("Sleeper league loading failed:", error);

      setSleeperStatus(
        error.message || "Unable to load that league right now.",
        true
      );
    } finally {
      loadLeagueButton.disabled = false;
      loadLeagueButton.textContent = "Load league data";
    }
  });
}

function showTeamPicker() {
  const connectCard = document.querySelector(".league-connect-card");

  if (!connectCard) {
    return;
  }

  removeTeamPicker();

  const userById = new Map(
    sleeperState.users.map(user => [String(user.user_id), user])
  );

  const sortedRosters = [...sleeperState.rosters].sort((left, right) => {
    const leftManager = getManagerDisplayName(
      userById.get(String(left.owner_id))
    );

    const rightManager = getManagerDisplayName(
      userById.get(String(right.owner_id))
    );

    return leftManager.localeCompare(rightManager);
  });

  const teamPicker = document.createElement("div");
  teamPicker.id = "sleeper-team-picker";
  teamPicker.className = "league-picker";

  const label = document.createElement("label");
  label.htmlFor = "sleeper-team-select";
  label.textContent = "Which team is yours?";

  const select = document.createElement("select");
  select.id = "sleeper-team-select";

  select.append(
    new Option("Choose your manager / team", "")
  );

  for (const roster of sortedRosters) {
    const manager = userById.get(String(roster.owner_id));
    const managerName = getManagerDisplayName(manager);
    const record = getRosterRecord(roster);

    select.append(
      new Option(
        `${managerName} · ${recordLabel(record)}`,
        String(roster.roster_id)
      )
    );
  }

  label.append(select);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "league-connect__button league-picker__button";
  button.textContent = "Open my dashboard";

  button.addEventListener("click", async () => {
    const rosterId = Number(select.value);

    if (!Number.isFinite(rosterId) || rosterId <= 0) {
      setSleeperStatus("Choose your team before opening the dashboard.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Preparing dashboard…";

    try {
      sleeperState.myRosterId = rosterId;

      setSleeperStatus(
        "Loading current matchup data and preparing your dashboard…"
      );

      await loadLiveSleeperDashboard();
    } catch (error) {
      console.error("Sleeper dashboard preparation failed:", error);

      setSleeperStatus(
        error.message || "Unable to prepare the dashboard for that league.",
        true
      );

      button.disabled = false;
      button.textContent = "Open my dashboard";
    }
  });

  teamPicker.append(label, button);
  connectCard.append(teamPicker);

  setSleeperStatus(
    `Loaded ${sleeperState.selectedLeague.name || "the selected league"}. Choose your team to personalize the dashboard.`
  );
}

/* ── Convert Sleeper live data to this dashboard's shape ─────────────── */

async function loadLiveSleeperDashboard() {
  const league = sleeperState.selectedLeague;
  const rosters = sleeperState.rosters;
  const users = sleeperState.users;
  const myRosterId = sleeperState.myRosterId;

  if (!league || !Array.isArray(rosters) || !Array.isArray(users) || !myRosterId) {
    throw new Error("League data is incomplete. Please select the league again.");
  }

  const week = getWeekFromLeague(league);
  const season = String(league.season || sleeperState.season || "");

  let currentWeekMatchups = [];

  try {
    const matchups = await sleeperFetchJson(
      `/league/${encodeURIComponent(league.league_id)}/matchups/${encodeURIComponent(week)}`,
      "Unable to load current matchup data."
    );

    currentWeekMatchups = Array.isArray(matchups) ? matchups : [];
  } catch (error) {
    console.warn("Current matchup data unavailable:", error);
    currentWeekMatchups = [];
  }

  sleeperState.matchups = currentWeekMatchups;

  dashboardData = createLiveDashboardData({
    league,
    users,
    rosters,
    matchups: currentWeekMatchups,
    myRosterId,
    season,
    week
  });

  renderDashboard();
  showDashboardPage();

  window.setTimeout(() => {
    const overview = getElement("overview");

    if (overview) {
      overview.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, 100);
}

function createLiveDashboardData({
  league,
  users,
  rosters,
  matchups,
  myRosterId,
  season,
  week
}) {
  const userById = new Map(
    users.map(user => [String(user.user_id), user])
  );

  const matchupByRosterId = new Map(
    matchups.map(matchup => [Number(matchup.roster_id), matchup])
  );

  const playerData = league?.metadata?.players || {};

  const getLivePlayer = (playerId, isStarter) => {
    const player = playerData[playerId] || {};

    return {
      id: playerId,
      name:
        player.full_name ||
        player.name ||
        playerNameFromId(playerId),
      team: player.team || "NFL",
      position: normalizePositions(player.fantasy_positions),
      projected_points: 0,
      season_points: 0,
      recent_avg: 0,
      trend: "stable",
      trend_label: "Live data pending",
      injury_status: player.injury_status || "",
      bye_week: "",
      is_starter: Boolean(isStarter)
    };
  };

  const buildTeam = roster => {
    const manager = userById.get(String(roster.owner_id));
    const record = getRosterRecord(roster);
    const matchup = matchupByRosterId.get(Number(roster.roster_id));

    const starterIds = Array.isArray(matchup?.starters)
      ? matchup.starters.filter(Boolean)
      : [];

    const playerIds = Array.isArray(roster.players)
      ? roster.players.filter(Boolean)
      : [];

    const benchIds = playerIds.filter(
      playerId => !starterIds.includes(playerId)
    );

    const starters = starterIds.map(playerId =>
      getLivePlayer(playerId, true)
    );

    const bench = benchIds.map(playerId =>
      getLivePlayer(playerId, false)
    );

    return {
      roster_id: Number(roster.roster_id),
      manager: {
        display_name: getManagerDisplayName(manager)
      },
      record,
      starters,
      bench,
      projected_total: scoreForMatchup(matchup),
      scored_total: scoreForMatchup(matchup)
    };
  };

  const allTeams = rosters.map(buildTeam);

  const myTeam = allTeams.find(
    team => team.roster_id === Number(myRosterId)
  ) || null;

  const standings = [...allTeams]
    .sort((left, right) => {
      if (right.record.wins !== left.record.wins) {
        return right.record.wins - left.record.wins;
      }

      if (right.record.ties !== left.record.ties) {
        return right.record.ties - left.record.ties;
      }

      return right.record.pointsFor - left.record.pointsFor;
    })
    .map(team => {
      const gamesPlayed =
        team.record.wins + team.record.losses + team.record.ties;

      return {
        roster_id: team.roster_id,
        manager: team.manager.display_name,
        record: recordLabel(team.record),
        win_pct: gamesPlayed > 0
          ? (team.record.wins + team.record.ties * 0.5) / gamesPlayed
          : 0,
        points_for: team.record.pointsFor,
        points_against: team.record.pointsAgainst,
        projected_total: team.scored_total
      };
    });

  const matchupAnalysis = buildLiveMatchupAnalysis({
    myTeam,
    teams: allTeams,
    matchups
  });

  const rosterPlayers = myTeam
    ? [...myTeam.starters, ...myTeam.bench]
    : [];

  const insights = [
    {
      type: "info",
      icon: "target",
      title: league.name || "Sleeper league connected",
      message:
        "Live public league identity, standings, and roster assignments are loaded from Sleeper."
    },
    {
      type: "info",
      icon: "alert-circle",
      title: "Analytics availability",
      message:
        "Projected points, waiver recommendations, player trends, and automated optimal-lineup analysis require your pipeline’s player-stat and projection inputs."
    }
  ];

  return {
    meta: {
      season,
      week,
      generated_at: new Date().toISOString(),
      pipeline_version: "live-sleeper"
    },
    league: {
      league_id: league.league_id,
      name: league.name || "Sleeper League",
      total_rosters: league.total_rosters || rosters.length,
      scoring_settings: league.scoring_settings || {},
      roster_positions: league.roster_positions || []
    },
    my_team: myTeam,
    standings,
    analysis: {
      insights,
      matchup_analysis: matchupAnalysis,
      waiver_edge: [],
      optimal_lineup: {
        available: false,
        message:
          "Optimal lineup recommendations require projection data from the analytics pipeline.",
        current_total: myTeam ? myTeam.scored_total : 0,
        projected_total: myTeam ? myTeam.scored_total : 0,
        improvement: 0,
        suggested_lineup: [],
        changes: []
      },
      player_trends: {
        players: rosterPlayers,
        trending_adds: []
      }
    }
  };
}

function buildLiveMatchupAnalysis({ myTeam, teams, matchups }) {
  if (!myTeam || !Array.isArray(matchups) || matchups.length === 0) {
    return {
      available: false,
      message:
        "Current matchup scores are not available for this league week."
    };
  }

  const myMatchup = matchups.find(
    matchup => Number(matchup.roster_id) === Number(myTeam.roster_id)
  );

  if (!myMatchup || !myMatchup.matchup_id) {
    return {
      available: false,
      message:
        "Your team does not have a scheduled head-to-head matchup for the current week."
    };
  }

  const opponentMatchup = matchups.find(
    matchup =>
      Number(matchup.matchup_id) === Number(myMatchup.matchup_id) &&
      Number(matchup.roster_id) !== Number(myTeam.roster_id)
  );

  if (!opponentMatchup) {
    return {
      available: false,
      message:
        "Opponent matchup data is not currently available."
    };
  }

  const opponent = teams.find(
    team => Number(team.roster_id) === Number(opponentMatchup.roster_id)
  );

  if (!opponent) {
    return {
      available: false,
      message:
        "Opponent roster data is not currently available."
    };
  }

  const myScore = scoreForMatchup(myMatchup);
  const opponentScore = scoreForMatchup(opponentMatchup);
  const totalScore = myScore + opponentScore;

  const simpleWinProbability = totalScore > 0
    ? Math.round((myScore / totalScore) * 100)
    : 50;

  const spread = myScore - opponentScore;

  return {
    available: true,
    opponent_name: opponent.manager.display_name,
    opponent_record: opponent.record,
    my_projected: myScore.toFixed(1),
    opp_projected: opponentScore.toFixed(1),
    win_probability: simpleWinProbability,
    point_spread: spread,
    position_comparison: []
  };
}

/* ── Local demo data loading ─────────────────────────────────────────── */

async function loadDashboardData() {
  const connectPage = getElement("connect");
  const loading = getElement("loading");

  /*
    The user-facing landing state is the Sleeper connection page.
    We still load data.json in the background as a working demo/fallback.
  */
  if (connectPage) {
    connectPage.style.display = "block";
  }

  if (loading) {
    loading.style.display = "none";
  }

  try {
    const response = await fetch("data.json");

    if (!response.ok) {
      throw new Error("Failed to load data");
    }

    const localData = await response.json();

    /*
      Keep the local data ready in memory. It is intentionally not rendered
      until a live Sleeper league is selected, so visitors see their own data.
    */
    window.ffPipelineDemoData = localData;
  } catch (error) {
    console.warn("Demo data was not loaded:", error);
  }
}

/* ── Main dashboard render ───────────────────────────────────────────── */

function renderDashboard() {
  const data = dashboardData;

  if (!data) {
    return;
  }

  const loading = getElement("loading");
  const dashboard = getElement("dashboard");

  if (loading) {
    loading.style.display = "none";
  }

  if (dashboard) {
    dashboard.style.display = "block";
  }

  const meta = data.meta || {};
  const myTeam = data.my_team;
  const league = data.league || {};

  const navWeek = getElement("navWeek");

  if (navWeek) {
    navWeek.textContent = `Week ${meta.week || "--"} · ${meta.season || "--"}`;
  }

  const footerMeta = getElement("footerMeta");

  if (footerMeta) {
    const generatedAt = meta.generated_at
      ? new Date(meta.generated_at).toLocaleString()
      : "Unknown";

    const sourceText = meta.pipeline_version === "live-sleeper"
      ? "Live public Sleeper league data"
      : `Pipeline v${meta.pipeline_version || "--"}`;

    footerMeta.textContent =
      `Last updated: ${generatedAt} · ${sourceText}`;
  }

  const teamSubtitle = getElement("teamNameSubtitle");

  if (teamSubtitle) {
    teamSubtitle.textContent = myTeam
      ? `${myTeam.manager.display_name} · ${recordLabel(myTeam.record)}`
      : league.name || "";
  }

  renderInsights(data.analysis?.insights || []);
  renderKPIs(data);
  renderRoster(myTeam);
  renderMatchup(data.analysis?.matchup_analysis || {});
  renderWaiver(data.analysis?.waiver_edge || []);
  renderOptimalLineup(data.analysis?.optimal_lineup || {});
  renderTrends(
    data.analysis?.player_trends || {
      players: [],
      trending_adds: []
    },
    myTeam
  );
  renderStandings(data.standings || [], myTeam);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/* ── Insights Banner ────────────────────────────────────────────────── */

function renderInsights(insights) {
  const container = getElement("insightsBanner");

  if (!container) {
    return;
  }

  if (!insights || insights.length === 0) {
    container.innerHTML = "";
    return;
  }

  const iconMap = {
    "trending-up":
      '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    "trending-down":
      '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    "alert-triangle":
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    award:
      '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    "alert-circle":
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
  };

  container.innerHTML = insights.map(insight => `
    <div class="insight-card ${escapeHtml(insight.type || "info")}">
      <div class="insight-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          ${iconMap[insight.icon] || ""}
        </svg>
      </div>

      <div class="insight-content">
        <div class="insight-title">${escapeHtml(insight.title)}</div>
        <div class="insight-message">${escapeHtml(insight.message)}</div>
      </div>
    </div>
  `).join("");
}

/* ── KPI Cards ───────────────────────────────────────────────────────── */

function renderKPIs(data) {
  const container = getElement("kpiRow");

  if (!container) {
    return;
  }

  const myTeam = data.my_team;
  const analysis = data.analysis || {};
  const optimal = analysis.optimal_lineup || {};
  const matchup = analysis.matchup_analysis || {};
  const waiverEdge = analysis.waiver_edge || [];
  const standings = data.standings || [];

  const kpis = [];

  kpis.push({
    label: "Current Week Score",
    value: myTeam ? formatNumber(myTeam.scored_total) : "--",
    delta: myTeam
      ? "Live score reported by Sleeper"
      : "Choose your team",
    deltaClass: "neutral"
  });

  if (matchup.available) {
    const spread = asNumber(matchup.point_spread);
    const sign = spread > 0 ? "+" : "";

    kpis.push({
      label: "Matchup Score Edge",
      value: `${sign}${formatNumber(spread)}`,
      delta: `${matchup.opponent_name || "Opponent"} · current matchup`,
      deltaClass: spread > 0
        ? "positive"
        : spread < 0
          ? "negative"
          : "neutral"
    });
  }

  const topWaiver = waiverEdge[0];

  kpis.push({
    label: "Top Waiver Edge",
    value: topWaiver ? `+${formatNumber(topWaiver.edge_value)}` : "Pending",
    delta: topWaiver
      ? topWaiver.player.name
      : "Requires pipeline projections",
    deltaClass: topWaiver ? "positive" : "neutral"
  });

  const myRank = standings.findIndex(
    team => Number(team.roster_id) === Number(myTeam?.roster_id)
  ) + 1;

  kpis.push({
    label: "League Rank",
    value: myRank ? `#${myRank}` : "--",
    delta: myRank && myRank <= 6
      ? "Playoff position"
      : myRank
        ? "Outside playoff position"
        : "Choose your team",
    deltaClass: myRank && myRank <= 6
      ? "positive"
      : myRank
        ? "negative"
        : "neutral"
  });

  if (myTeam) {
    const record = myTeam.record;
    const games =
      asNumber(record.wins) +
      asNumber(record.losses) +
      asNumber(record.ties);

    const winRate = games > 0
      ? (
          (
            asNumber(record.wins) +
            asNumber(record.ties) * 0.5
          ) / games * 100
        ).toFixed(0)
      : "0";

    kpis.push({
      label: "Team Record",
      value: recordLabel(record),
      delta: `${winRate}% win rate`,
      deltaClass: "neutral"
    });
  }

  container.innerHTML = kpis.map(kpi => `
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(kpi.label)}</div>
      <div class="kpi-value">${escapeHtml(kpi.value)}</div>
      <div class="kpi-delta ${escapeHtml(kpi.deltaClass)}">
        ${escapeHtml(kpi.delta)}
      </div>
    </div>
  `).join("");
}

/* ── Roster Grid ────────────────────────────────────────────────────── */

function renderRoster(myTeam) {
  const container = getElement("rosterGrid");

  if (!container) {
    return;
  }

  if (!myTeam) {
    container.innerHTML =
      '<div class="no-data">No roster data available.</div>';
    return;
  }

  const roster = [
    ...(myTeam.starters || []),
    ...(myTeam.bench || [])
  ];

  if (roster.length === 0) {
    container.innerHTML = `
      <div class="no-data">
        Sleeper roster assignments are unavailable for the current matchup week.
      </div>
    `;
    return;
  }

  container.innerHTML = roster.map(player => {
    const isStarter = Boolean(player.is_starter);

    const injuryTag =
      player.injury_status &&
      player.injury_status !== "Active"
        ? `<div class="injury-tag">${escapeHtml(player.injury_status)}</div>`
        : "";

    const byeTag = player.bye_week
      ? `
        <div
          style="
            font-size:var(--text-xs);
            color:var(--color-text-faint);
            margin-top:2px;
          "
        >
          Bye: ${escapeHtml(player.bye_week)}
        </div>
      `
      : "";

    const scoreDisplay = isStarter
      ? "Starter"
      : "Bench";

    return `
      <div
        class="player-card ${isStarter ? "starter" : ""} ${
          player.injury_status ? "injured" : ""
        }"
      >
        <div class="player-header">
          <div>
            <div class="player-name">${escapeHtml(player.name)}</div>
            <div class="player-meta">
              ${escapeHtml(player.team)} · ${escapeHtml(player.position)}
            </div>
          </div>

          <span class="player-badge badge-${escapeHtml(player.position)}">
            ${escapeHtml(player.position)}
          </span>
        </div>

        <div class="player-proj">
          ${player.projected_points > 0
            ? formatNumber(player.projected_points)
            : "--"}
        </div>

        <div class="player-proj-label">
          ${scoreDisplay} ${player.projected_points > 0 ? "Proj" : "Assignment"}
        </div>

        ${injuryTag}
        ${byeTag}
      </div>
    `;
  }).join("");
}

/* ── Matchup Analysis ───────────────────────────────────────────────── */

function renderMatchup(matchup) {
  const container = getElement("matchupContent");

  if (!container) {
    return;
  }

  if (!matchup.available) {
    container.innerHTML = `
      <div class="no-data">
        <svg
          class="no-data-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>

        <p>
          ${escapeHtml(
            matchup.message || "No matchup data available for this week."
          )}
        </p>
      </div>
    `;
    return;
  }

  const myTeam = dashboardData?.my_team;

  const myName = myTeam?.manager?.display_name || "Your team";
  const myRecord = myTeam ? recordLabel(myTeam.record) : "--";

  const opponentName = matchup.opponent_name || "Opponent";
  const opponentRecord = matchup.opponent_record
    ? recordLabel(matchup.opponent_record)
    : "--";

  const winProbability = Math.max(
    0,
    Math.min(100, asNumber(matchup.win_probability, 50))
  );

  const winColor = winProbability >= 50
    ? "var(--color-success)"
    : "var(--color-warning)";

  const comparison = Array.isArray(matchup.position_comparison)
    ? matchup.position_comparison
    : [];

  const comparisonHtml = comparison.length > 0
    ? `
      <div style="margin-top: var(--space-6);">
        <table class="position-comparison-table">
          <thead>
            <tr>
              <th>Position</th>
              <th>${escapeHtml(myName)}</th>
              <th>${escapeHtml(opponentName)}</th>
              <th>Edge</th>
            </tr>
          </thead>

          <tbody>
            ${comparison.map(position => {
              const myPlayers = (position.my_players || [])
                .map(player =>
                  `${escapeHtml(player.name)} (${formatNumber(player.projected)})`
                )
                .join(", ");

              const opponentPlayers = (position.opp_players || [])
                .map(player =>
                  `${escapeHtml(player.name)} (${formatNumber(player.projected)})`
                )
                .join(", ");

              const edgeClass = position.advantage === "mine"
                ? "edge-positive"
                : position.advantage === "opponent"
                  ? "edge-negative"
                  : "edge-neutral";

              const difference = asNumber(position.difference);
              const edgeText = difference > 0
                ? `+${formatNumber(difference)}`
                : formatNumber(difference);

              return `
                <tr>
                  <td>
                    <span class="player-badge badge-${escapeHtml(position.position)}">
                      ${escapeHtml(position.position)}
                    </span>
                  </td>

                  <td>${myPlayers || "--"}</td>
                  <td>${opponentPlayers || "--"}</td>

                  <td class="${edgeClass}">
                    ${edgeText}
                    <span
                      style="
                        font-weight:400;
                        color:var(--color-text-faint);
                      "
                    >
                      (${escapeHtml(position.edge_label || "Even")})
                    </span>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `
    : `
      <p
        style="
          margin-top:var(--space-5);
          color:var(--color-text-muted);
          font-size:var(--text-sm);
        "
      >
        Position-level projection analysis requires player projections from the analytics pipeline.
      </p>
    `;

  container.innerHTML = `
    <div class="matchup-overview">
      <div class="matchup-team">
        <div class="matchup-team-name">${escapeHtml(myName)}</div>
        <div class="matchup-team-record">${escapeHtml(myRecord)}</div>
        <div class="matchup-proj" style="color: var(--color-primary);">
          ${escapeHtml(matchup.my_projected)}
        </div>
      </div>

      <div class="matchup-vs">VS</div>

      <div class="matchup-team">
        <div class="matchup-team-name">${escapeHtml(opponentName)}</div>
        <div class="matchup-team-record">${escapeHtml(opponentRecord)}</div>
        <div class="matchup-proj" style="color: var(--color-text-muted);">
          ${escapeHtml(matchup.opp_projected)}
        </div>
      </div>
    </div>

    <div class="win-prob-bar">
      <div class="win-prob-label">
        <span>Current score share</span>
        <span style="color: ${winColor}">
          ${winProbability}%
        </span>
      </div>

      <div class="win-prob-track">
        <div
          class="win-prob-fill"
          style="width: ${winProbability}%; background: ${winColor};"
        ></div>
      </div>
    </div>

    ${comparisonHtml}
  `;
}

/* ── Waiver Wire Edge ───────────────────────────────────────────────── */

function renderWaiver(recommendations) {
  const container = getElement("waiverContent");

  if (!container) {
    return;
  }

  if (!recommendations || recommendations.length === 0) {
    container.innerHTML = `
      <div class="no-data">
        <svg
          class="no-data-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>

        <p>
          Waiver recommendations require the pipeline's player projections and waiver availability inputs.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="waiver-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Pos</th>
          <th>Proj Pts</th>
          <th>Edge</th>
          <th>Drop</th>
          <th class="col-analysis">Analysis</th>
        </tr>
      </thead>

      <tbody>
        ${recommendations.map(recommendation => `
          <tr>
            <td>
              <span
                class="waiver-rank ${
                  recommendation.rank <= 3 ? "top-3" : ""
                }"
              >
                ${escapeHtml(recommendation.rank)}
              </span>
            </td>

            <td>
              <strong>${escapeHtml(recommendation.player.name)}</strong>
              ${
                recommendation.trending
                  ? '<span style="color:var(--color-gold);font-size:var(--text-xs);">🔥</span>'
                  : ""
              }
              <br>
              <span
                style="
                  font-size:var(--text-xs);
                  color:var(--color-text-muted);
                "
              >
                ${escapeHtml(recommendation.player.team)}
              </span>
            </td>

            <td>
              <span
                class="player-badge badge-${escapeHtml(
                  recommendation.player.position
                )}"
              >
                ${escapeHtml(recommendation.player.position)}
              </span>
            </td>

            <td class="tabular">
              ${formatNumber(recommendation.player.projected_points)}
            </td>

            <td class="edge-value">
              +${formatNumber(recommendation.edge_value)}
            </td>

            <td>
              <span style="font-size:var(--text-sm);">
                ${escapeHtml(recommendation.drop_suggestion.name)}
              </span>
              <br>
              <span class="drop-suggestion">
                ${escapeHtml(recommendation.drop_suggestion.reason)}
              </span>
            </td>

            <td class="col-analysis">
              <div class="waiver-analysis">
                ${escapeHtml(recommendation.analysis)}
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ── Optimal Lineup ─────────────────────────────────────────────────── */

function renderOptimalLineup(optimal) {
  const container = getElement("lineupContent");

  if (!container) {
    return;
  }

  if (!optimal.available) {
    container.innerHTML = `
      <div class="no-data">
        ${escapeHtml(
          optimal.message || "No lineup data available."
        )}
      </div>
    `;
    return;
  }

  const myTeam = dashboardData?.my_team;

  const currentStarters = myTeam?.starters || [];
  const suggestedLineup = optimal.suggested_lineup || [];
  const improvement = asNumber(optimal.improvement);

  const positions = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];

  container.innerHTML = `
    <div class="lineup-improvement">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        style="color:var(--color-primary);"
        aria-hidden="true"
      >
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </svg>

      <span style="font-size:var(--text-sm);">
        Optimal lineup projects
      </span>

      <span class="lineup-improvement-value">
        ${escapeHtml(optimal.projected_total)}
      </span>

      <span
        style="
          font-size:var(--text-sm);
          color:var(--color-text-muted);
        "
      >
        points (${improvement >= 0 ? "+" : ""}${improvement} vs current ${
          optimal.current_total
        })
      </span>
    </div>

    <div class="lineup-comparison">
      <div class="lineup-column">
        <div class="lineup-column-header">
          <span class="lineup-column-title">Current Lineup</span>
          <span class="lineup-total">
            ${escapeHtml(optimal.current_total)}
          </span>
        </div>

        ${currentStarters.map((player, index) => `
          <div class="lineup-slot">
            <span class="lineup-slot-label">
              ${escapeHtml(positions[index] || player.position)}
            </span>

            <span class="lineup-player">
              ${escapeHtml(player.name)}
            </span>

            <span class="lineup-points">
              ${formatNumber(player.projected_points)}
            </span>
          </div>
        `).join("")}
      </div>

      <div class="lineup-column">
        <div class="lineup-column-header">
          <span class="lineup-column-title">Optimal Lineup</span>
          <span class="lineup-total optimal">
            ${escapeHtml(optimal.projected_total)}
          </span>
        </div>

        ${suggestedLineup.map(player => `
          <div class="lineup-slot">
            <span class="lineup-slot-label">
              ${escapeHtml(player.suggested_slot || player.position)}
            </span>

            <span class="lineup-player">
              ${escapeHtml(player.name)}
            </span>

            <span class="lineup-points">
              ${formatNumber(player.projected_points)}
            </span>
          </div>
        `).join("")}
      </div>
    </div>

    ${
      optimal.changes?.length > 0
        ? `
          <div style="margin-top: var(--space-4);">
            <h3
              style="
                font-size:var(--text-sm);
                font-weight:600;
                color:var(--color-text-muted);
                text-transform:uppercase;
                letter-spacing:0.05em;
                margin-bottom:var(--space-3);
              "
            >
              Suggested Changes
            </h3>

            ${optimal.changes.map(change => `
              <div class="lineup-change">
                <strong>${escapeHtml(change.player)}</strong>
                (${escapeHtml(change.position)}) &rarr; Start
                (replaces ${escapeHtml(change.replaces)})
                <br>
                <span
                  style="
                    color:var(--color-text-muted);
                    font-size:var(--text-xs);
                  "
                >
                  ${escapeHtml(change.reason)}
                </span>
              </div>
            `).join("")}
          </div>
        `
        : `
          <p
            style="
              color:var(--color-text-muted);
              font-size:var(--text-sm);
            "
          >
            Your current lineup is already optimal.
          </p>
        `
    }
  `;
}

/* ── Player Trends ──────────────────────────────────────────────────── */

function renderTrends(trends, myTeam) {
  const chartContainer = getElement("trendChartContainer");
  const trendingContainer = getElement("trendingActivity");
  const tableContainer = getElement("trendsTable");

  const players = trends?.players || [];
  const trendingAdds = trends?.trending_adds || [];

  if (players.length > 0) {
    renderTrendChart(players);
  } else if (chartContainer) {
    chartContainer.innerHTML =
      '<div class="no-data">No trend data available.</div>';
  }

  if (trendingContainer) {
    if (trendingAdds.length > 0) {
      trendingContainer.innerHTML = `
        <div class="trending-list">
          <div class="trending-list-title">🔥 Trending Adds</div>

          ${trendingAdds.slice(0, 8).map(item => `
            <div class="trending-item">
              <span>
                ${escapeHtml(item.name || "Unknown")}
                <span
                  style="
                    color:var(--color-text-muted);
                    font-size:var(--text-xs);
                  "
                >
                  ${escapeHtml(item.position || "")} ·
                  ${escapeHtml(item.team || "")}
                </span>
              </span>

              <span class="trending-count">
                ${escapeHtml(item.count)}
              </span>
            </div>
          `).join("")}
        </div>
      `;
    } else {
      trendingContainer.innerHTML = `
        <div class="no-data">
          Player-trend and add/drop activity require pipeline inputs.
        </div>
      `;
    }
  }

  if (!tableContainer) {
    return;
  }

  if (players.length === 0) {
    tableContainer.innerHTML =
      '<div class="no-data">No player trend data available.</div>';
    return;
  }

  tableContainer.innerHTML = `
    <table class="trends-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Pos</th>
          <th>Team</th>
          <th>Proj</th>
          <th>Season</th>
          <th>Recent Avg</th>
          <th>Trend</th>
        </tr>
      </thead>

      <tbody>
        ${players.map(player => {
          const trendClass = player.trend === "hot"
            ? "trend-hot"
            : player.trend === "cold"
              ? "trend-cold"
              : "trend-stable";

          const trendIcon = player.trend === "hot"
            ? "↑"
            : player.trend === "cold"
              ? "↓"
              : "→";

          return `
            <tr>
              <td>
                <strong>${escapeHtml(player.name)}</strong>
                ${
                  player.is_starter
                    ? `
                      <span
                        style="
                          color:var(--color-primary);
                          font-size:var(--text-xs);
                        "
                      >
                        START
                      </span>
                    `
                    : ""
                }
              </td>

              <td>
                <span
                  class="player-badge badge-${escapeHtml(player.position)}"
                >
                  ${escapeHtml(player.position)}
                </span>
              </td>

              <td>${escapeHtml(player.team)}</td>

              <td class="tabular">
                ${
                  player.projected_points > 0
                    ? formatNumber(player.projected_points)
                    : "--"
                }
              </td>

              <td class="tabular">
                ${
                  player.season_points > 0
                    ? formatNumber(player.season_points)
                    : "--"
                }
              </td>

              <td class="tabular">
                ${
                  player.recent_avg > 0
                    ? formatNumber(player.recent_avg)
                    : "--"
                }
              </td>

              <td>
                <span class="trend-badge ${trendClass}">
                  ${trendIcon} ${escapeHtml(player.trend_label || "Live")}
                </span>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderTrendChart(players) {
  const canvas = getElement("trendChart");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  if (trendChart) {
    trendChart.destroy();
  }

  const week = asNumber(dashboardData?.meta?.week, 1);

  const topPlayers = players
    .filter(player => player.is_starter)
    .slice(0, 8)
    .map(player => ({
      name: player.name,
      projected: asNumber(player.projected_points),
      season: asNumber(player.season_points) / Math.max(week, 1),
      recent: asNumber(player.recent_avg)
    }));

  if (topPlayers.length === 0) {
    const chartContainer = getElement("trendChartContainer");

    if (chartContainer) {
      chartContainer.innerHTML = `
        <div class="no-data">
          Player projection and trend history require pipeline inputs.
        </div>
      `;
    }

    return;
  }

  const css = getComputedStyle(document.documentElement);

  const textColor = css.getPropertyValue("--color-text-muted").trim();
  const gridColor = css.getPropertyValue("--color-divider").trim();
  const primaryColor = css.getPropertyValue("--color-primary").trim();
  const goldColor = css.getPropertyValue("--color-gold").trim();
  const blueColor = css.getPropertyValue("--color-info").trim();

  Chart.defaults.font.family = "Satoshi, Inter, sans-serif";
  Chart.defaults.color = textColor;

  trendChart = new Chart(context, {
    type: "bar",
    data: {
      labels: topPlayers.map(player => player.name),
      datasets: [
        {
          label: "Projected",
          data: topPlayers.map(player => player.projected),
          backgroundColor: primaryColor + "cc",
          borderColor: primaryColor,
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: "Season Avg",
          data: topPlayers.map(player => player.season),
          backgroundColor: blueColor + "cc",
          borderColor: blueColor,
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: "Recent Avg",
          data: topPlayers.map(player => player.recent),
          backgroundColor: goldColor + "cc",
          borderColor: goldColor,
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: {
              size: 12
            },
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: css.getPropertyValue("--color-surface-2").trim(),
          titleColor: css.getPropertyValue("--color-text").trim(),
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              size: 11
            },
            maxRotation: 45,
            minRotation: 30
          }
        },
        y: {
          grid: {
            color: gridColor,
            drawBorder: false
          },
          ticks: {
            font: {
              size: 11
            }
          },
          beginAtZero: true
        }
      },
      animation: {
        duration: 600,
        easing: "easeOutQuart"
      }
    }
  });
}

/* ── Standings Table ────────────────────────────────────────────────── */

function renderStandings(standings, myTeam) {
  const container = getElement("standingsTable");

  if (!container) {
    return;
  }

  if (!standings || standings.length === 0) {
    container.innerHTML =
      '<div class="no-data">No standings data available.</div>';
    return;
  }

  const myRosterId = myTeam?.roster_id;
  const playoffCutoff = Math.min(6, standings.length);

  container.innerHTML = `
    <div class="standings-table-wrapper">
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Record</th>
            <th>Win %</th>
            <th>Points For</th>
            <th>Points Against</th>
            <th>Current Score</th>
          </tr>
        </thead>

        <tbody>
          ${standings.map((team, index) => {
            const isMyTeam =
              Number(team.roster_id) === Number(myRosterId);

            const isPlayoff = index < playoffCutoff;

            return `
              <tr class="${isMyTeam ? "my-team-row" : ""}">
                <td class="rank-cell ${isPlayoff ? "playoff" : ""}">
                  ${index + 1}
                </td>

                <td>
                  <strong>${escapeHtml(team.manager)}</strong>
                </td>

                <td class="tabular">
                  ${escapeHtml(team.record)}
                </td>

                <td class="tabular">
                  ${
                    team.win_pct > 0
                      ? `${(team.win_pct * 100).toFixed(0)}%`
                      : "--"
                  }
                </td>

                <td class="tabular">
                  ${formatNumber(team.points_for)}
                </td>

                <td class="tabular">
                  ${formatNumber(team.points_against)}
                </td>

                <td class="tabular">
                  ${formatNumber(team.projected_total)}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>

    <p
      style="
        font-size:var(--text-xs);
        color:var(--color-text-faint);
        margin-top:var(--space-2);
      "
    >
      Top ${playoffCutoff} teams are shown in playoff position. Your selected
      team is highlighted.
    </p>
  `;
}

/* ── Initialize ─────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  initializeSleeperConnection();
  loadDashboardData();
});