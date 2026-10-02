/* ═══════════════════════════════════════════════════════════════════════
   FF PIPELINE — Dashboard JavaScript
   Loads data.json and renders all dashboard sections
   ═══════════════════════════════════════════════════════════════════════ */

// ── Theme Toggle ────────────────────────────────────────────────────────
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  if (toggle) {
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
      toggle.innerHTML = theme === 'dark'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    });
  }
})();

// ── Data Loading ───────────────────────────────────────────────────────
let dashboardData = null;
let trendChart = null;

async function loadDashboardData() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error('Failed to load data');
    dashboardData = await response.json();
    renderDashboard();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    document.getElementById('loading').innerHTML =
      '<p style="color: var(--color-error);">Failed to load dashboard data. Run the pipeline to generate data.json.</p>';
  }
}

// ── Main Render ─────────────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  const data = dashboardData;
  const meta = data.meta;
  const myTeam = data.my_team;
  const league = data.league;

  // Nav week
  document.getElementById('navWeek').textContent = `Week ${meta.week} · ${meta.season}`;

  // Footer
  document.getElementById('footerMeta').textContent =
    `Last updated: ${new Date(meta.generated_at).toLocaleString()} · Pipeline v${meta.pipeline_version}`;

  // Team subtitle
  if (myTeam) {
    document.getElementById('teamNameSubtitle').textContent =
      `${myTeam.manager.display_name} · ${myTeam.record.wins}-${myTeam.record.losses}`;
  }

  // Render sections
  renderInsights(data.analysis.insights);
  renderKPIs(data);
  renderRoster(myTeam);
  renderMatchup(data.analysis.matchup_analysis);
  renderWaiver(data.analysis.waiver_edge);
  renderOptimalLineup(data.analysis.optimal_lineup);
  renderTrends(data.analysis.player_trends, myTeam);
  renderStandings(data.standings, myTeam);

  // Initialize Lucide icons
  if (window.lucide) lucide.createIcons();
}

// ── Insights Banner ─────────────────────────────────────────────────────
function renderInsights(insights) {
  const container = document.getElementById('insightsBanner');
  if (!insights || insights.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = insights.map(insight => {
    const iconMap = {
      'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      'trending-down': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
      'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      'award': '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
      'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    };

    return `
      <div class="insight-card ${insight.type}">
        <div class="insight-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${iconMap[insight.icon] || ''}
          </svg>
        </div>
        <div class="insight-content">
          <div class="insight-title">${insight.title}</div>
          <div class="insight-message">${insight.message}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── KPI Cards ──────────────────────────────────────────────────────────
function renderKPIs(data) {
  const container = document.getElementById('kpiRow');
  const myTeam = data.my_team;
  const analysis = data.analysis;

  const kpis = [];

  // Projected Points
  kpis.push({
    label: 'Projected Points',
    value: myTeam ? myTeam.projected_total.toFixed(1) : '--',
    delta: analysis.optimal_lineup.improvement > 0
      ? `+${analysis.optimal_lineup.improvement.toFixed(1)} optimal available` : 'At optimal',
    deltaClass: analysis.optimal_lineup.improvement > 0 ? 'positive' : 'neutral',
  });

  // Win Probability
  if (analysis.matchup_analysis.available) {
    kpis.push({
      label: 'Win Probability',
      value: `${analysis.matchup_analysis.win_probability}%`,
      delta: analysis.matchup_analysis.point_spread > 0
        ? `+${analysis.matchup_analysis.point_spread.toFixed(1)} spread` : `${analysis.matchup_analysis.point_spread.toFixed(1)} spread`,
      deltaClass: analysis.matchup_analysis.point_spread > 0 ? 'positive' : 'negative',
    });
  }

  // Waiver Edge
  const topWaiver = analysis.waiver_edge[0];
  kpis.push({
    label: 'Top Waiver Edge',
    value: topWaiver ? `+${topWaiver.edge_value.toFixed(1)}` : 'None',
    delta: topWaiver ? topWaiver.player.name : 'No recommendations',
    deltaClass: topWaiver ? 'positive' : 'neutral',
  });

  // Standings
  const myRank = data.standings.findIndex(s => s.roster_id === myTeam?.roster_id) + 1;
  kpis.push({
    label: 'League Rank',
    value: myRank ? `#${myRank}` : '--',
    delta: myRank && myRank <= 4 ? 'Playoff position' : myRank && myRank <= 6 ? 'Bubble' : 'Outside playoffs',
    deltaClass: myRank && myRank <= 4 ? 'positive' : myRank && myRank <= 6 ? 'neutral' : 'negative',
  });

  // Record
  if (myTeam) {
    kpis.push({
      label: 'Team Record',
      value: `${myTeam.record.wins}-${myTeam.record.losses}`,
      delta: `${(myTeam.record.wins / (myTeam.record.wins + myTeam.record.losses || 1) * 100).toFixed(0)}% win rate`,
      deltaClass: 'neutral',
    });
  }

  container.innerHTML = kpis.map(kpi => `
    <div class="kpi-card">
      <div class="kpi-label">${kpi.label}</div>
      <div class="kpi-value">${kpi.value}</div>
      <div class="kpi-delta ${kpi.deltaClass}">${kpi.delta}</div>
    </div>
  `).join('');
}

// ── Roster Grid ────────────────────────────────────────────────────────
function renderRoster(myTeam) {
  const container = document.getElementById('rosterGrid');
  if (!myTeam) {
    container.innerHTML = '<div class="no-data">No roster data available.</div>';
    return;
  }

  const roster = [...myTeam.starters, ...myTeam.bench];
  container.innerHTML = roster.map(player => {
    const isStarter = player.is_starter;
    const injuryTag = player.injury_status && player.injury_status !== 'Active'
      ? `<div class="injury-tag">${player.injury_status}</div>` : '';
    const byeTag = player.bye_week
      ? `<div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:2px;">Bye: ${player.bye_week}</div>` : '';

    return `
      <div class="player-card ${isStarter ? 'starter' : ''} ${player.injury_status ? 'injured' : ''}">
        <div class="player-header">
          <div>
            <div class="player-name">${player.name}</div>
            <div class="player-meta">${player.team} · ${player.position}</div>
          </div>
          <span class="player-badge badge-${player.position}">${player.position}</span>
        </div>
        <div class="player-proj">${player.projected_points.toFixed(1)}</div>
        <div class="player-proj-label">${isStarter ? 'Starter Proj' : 'Bench Proj'}</div>
        ${injuryTag}
        ${byeTag}
      </div>
    `;
  }).join('');
}

// ── Matchup Analysis ────────────────────────────────────────────────────
function renderMatchup(matchup) {
  const container = document.getElementById('matchupContent');

  if (!matchup.available) {
    container.innerHTML = `
      <div class="no-data">
        <svg class="no-data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <p>${matchup.message || 'No matchup data available for this week.'}</p>
      </div>
    `;
    return;
  }

  const myTeam = dashboardData.my_team;
  const myName = myTeam.manager.display_name;
  const myRecord = `${myTeam.record.wins}-${myTeam.record.losses}`;
  const oppName = matchup.opponent_name;
  const oppRec = matchup.opponent_record;
  const oppRecord = oppRec ? `${oppRec.wins}-${oppRec.losses}` : '--';

  // Win probability bar
  const winProb = matchup.win_probability;
  const winColor = winProb >= 50 ? 'var(--color-success)' : 'var(--color-warning)';

  container.innerHTML = `
    <div class="matchup-overview">
      <div class="matchup-team">
        <div class="matchup-team-name">${myName}</div>
        <div class="matchup-team-record">${myRecord}</div>
        <div class="matchup-proj" style="color: var(--color-primary);">${matchup.my_projected}</div>
      </div>
      <div class="matchup-vs">VS</div>
      <div class="matchup-team">
        <div class="matchup-team-name">${oppName}</div>
        <div class="matchup-team-record">${oppRecord}</div>
        <div class="matchup-proj" style="color: var(--color-text-muted);">${matchup.opp_projected}</div>
      </div>
    </div>

    <div class="win-prob-bar">
      <div class="win-prob-label">
        <span>Win Probability</span>
        <span style="color: ${winColor}">${winProb}%</span>
      </div>
      <div class="win-prob-track">
        <div class="win-prob-fill" style="width: ${winProb}%; background: ${winColor};"></div>
      </div>
    </div>

    <div style="margin-top: var(--space-6);">
      <table class="position-comparison-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>${myName}</th>
            <th>${oppName}</th>
            <th>Edge</th>
          </tr>
        </thead>
        <tbody>
          ${matchup.position_comparison.map(pos => {
            const myPlayers = pos.my_players.map(p => `${p.name} (${p.projected.toFixed(1)})`).join(', ');
            const oppPlayers = pos.opp_players.map(p => `${p.name} (${p.projected.toFixed(1)})`).join(', ');
            const edgeClass = pos.advantage === 'mine' ? 'edge-positive' :
                              pos.advantage === 'opponent' ? 'edge-negative' : 'edge-neutral';
            const edgeText = pos.difference > 0 ? `+${pos.difference.toFixed(1)}` : pos.difference.toFixed(1);
            return `
              <tr>
                <td><span class="player-badge badge-${pos.position}">${pos.position}</span></td>
                <td>${myPlayers}</td>
                <td>${oppPlayers}</td>
                <td class="${edgeClass}">${edgeText} <span style="font-weight:400;color:var(--color-text-faint);">(${pos.edge_label})</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Waiver Wire Edge ───────────────────────────────────────────────────
function renderWaiver(recommendations) {
  const container = document.getElementById('waiverContent');

  if (!recommendations || recommendations.length === 0) {
    container.innerHTML = `
      <div class="no-data">
        <svg class="no-data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <p>No waiver recommendations above the edge threshold this week.</p>
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
        ${recommendations.map(rec => `
          <tr>
            <td><span class="waiver-rank ${rec.rank <= 3 ? 'top-3' : ''}">${rec.rank}</span></td>
            <td><strong>${rec.player.name}</strong> ${rec.trending ? '<span style="color:var(--color-gold);font-size:var(--text-xs);">🔥</span>' : ''}<br><span style="font-size:var(--text-xs);color:var(--color-text-muted);">${rec.player.team}</span></td>
            <td><span class="player-badge badge-${rec.player.position}">${rec.player.position}</span></td>
            <td class="tabular">${rec.player.projected_points.toFixed(1)}</td>
            <td class="edge-value">+${rec.edge_value.toFixed(1)}</td>
            <td><span style="font-size:var(--text-sm);">${rec.drop_suggestion.name}</span><br><span class="drop-suggestion">${rec.drop_suggestion.reason}</span></td>
            <td class="col-analysis"><div class="waiver-analysis">${rec.analysis}</div></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Optimal Lineup ─────────────────────────────────────────────────────
function renderOptimalLineup(optimal) {
  const container = document.getElementById('lineupContent');

  if (!optimal.available) {
    container.innerHTML = `<div class="no-data">${optimal.message || 'No lineup data available.'}</div>`;
    return;
  }

  const myTeam = dashboardData.my_team;
  const currentStarters = myTeam.starters;
  const suggestedLineup = optimal.suggested_lineup;
  const improvement = optimal.improvement;

  // Map current starters by slot
  const currentBySlot = {};
  const positions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
  currentStarters.forEach((player, i) => {
    const slot = positions[i] || 'BN';
    currentBySlot[slot] = currentBySlot[slot] || [];
    currentBySlot[slot].push(player);
  });

  // Map suggested by slot
  const suggestedBySlot = {};
  suggestedLineup.forEach(player => {
    const slot = player.suggested_slot || player.position;
    suggestedBySlot[slot] = suggestedBySlot[slot] || [];
    suggestedBySlot[slot].push(player);
  });

  const allSlots = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

  container.innerHTML = `
    <div class="lineup-improvement">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--color-primary);"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      <span style="font-size:var(--text-sm);">Optimal lineup projects</span>
      <span class="lineup-improvement-value">${optimal.projected_total}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">points (${improvement >= 0 ? '+' : ''}${improvement} vs current ${optimal.current_total})</span>
    </div>

    <div class="lineup-comparison">
      <div class="lineup-column">
        <div class="lineup-column-header">
          <span class="lineup-column-title">Current Lineup</span>
          <span class="lineup-total">${optimal.current_total}</span>
        </div>
        ${currentStarters.map((player, i) => `
          <div class="lineup-slot">
            <span class="lineup-slot-label">${positions[i] || player.position}</span>
            <span class="lineup-player">${player.name}</span>
            <span class="lineup-points">${player.projected_points.toFixed(1)}</span>
          </div>
        `).join('')}
      </div>

      <div class="lineup-column">
        <div class="lineup-column-header">
          <span class="lineup-column-title">Optimal Lineup</span>
          <span class="lineup-total optimal">${optimal.projected_total}</span>
        </div>
        ${suggestedLineup.map(player => `
          <div class="lineup-slot">
            <span class="lineup-slot-label">${player.suggested_slot || player.position}</span>
            <span class="lineup-player">${player.name}</span>
            <span class="lineup-points">${player.projected_points.toFixed(1)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    ${optimal.changes.length > 0 ? `
      <div style="margin-top: var(--space-4);">
        <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-3);">Suggested Changes</h3>
        ${optimal.changes.map(change => `
          <div class="lineup-change">
            <strong>${change.player}</strong> (${change.position}) &rarr; Start
            (replaces ${change.replaces})
            <br><span style="color:var(--color-text-muted);font-size:var(--text-xs);">${change.reason}</span>
          </div>
        `).join('')}
      </div>
    ` : '<p style="color:var(--color-text-muted);font-size:var(--text-sm);">Your current lineup is already optimal.</p>'}
  `;
}

// ── Player Trends ──────────────────────────────────────────────────────
function renderTrends(trends, myTeam) {
  // Trend chart
  const chartContainer = document.getElementById('trendChartContainer');
  if (trends.players && trends.players.length > 0) {
    renderTrendChart(trends.players);
  } else {
    chartContainer.innerHTML = '<div class="no-data">No trend data available.</div>';
  }

  // Trending activity
  const trendingContainer = document.getElementById('trendingActivity');
  if (trends.trending_adds && trends.trending_adds.length > 0) {
    trendingContainer.innerHTML = `
      <div class="trending-list">
        <div class="trending-list-title">🔥 Trending Adds</div>
        ${trends.trending_adds.slice(0, 8).map(item => `
          <div class="trending-item">
            <span>${item.name || 'Unknown'} <span style="color:var(--color-text-muted);font-size:var(--text-xs);">${item.position || ''} · ${item.team || ''}</span></span>
            <span class="trending-count">${item.count}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    trendingContainer.innerHTML = '<div class="no-data">No trending data.</div>';
  }

  // Trends table
  const tableContainer = document.getElementById('trendsTable');
  if (trends.players && trends.players.length > 0) {
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
          ${trends.players.map(player => {
            const trendClass = player.trend === 'hot' ? 'trend-hot' :
                               player.trend === 'cold' ? 'trend-cold' : 'trend-stable';
            const trendIcon = player.trend === 'hot' ? '↑' : player.trend === 'cold' ? '↓' : '→';
            return `
              <tr>
                <td><strong>${player.name}</strong>${player.is_starter ? ' <span style="color:var(--color-primary);font-size:var(--text-xs);">START</span>' : ''}</td>
                <td><span class="player-badge badge-${player.position}">${player.position}</span></td>
                <td>${player.team}</td>
                <td class="tabular">${player.projected_points.toFixed(1)}</td>
                <td class="tabular">${player.season_points.toFixed(1)}</td>
                <td class="tabular">${player.recent_avg.toFixed(1)}</td>
                <td><span class="trend-badge ${trendClass}">${trendIcon} ${player.trend_label}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    tableContainer.innerHTML = '<div class="no-data">No player trend data available.</div>';
  }
}

function renderTrendChart(players) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  // Show top 8 starters by projected points
  const week = dashboardData.meta.week || 1;
  const topPlayers = players
    .filter(p => p.is_starter)
    .slice(0, 8)
    .map(p => ({
      name: p.name,
      projected: p.projected_points,
      season: p.season_points / week, // Convert cumulative to per-game average
      recent: p.recent_avg,
    }));

  if (topPlayers.length === 0) return;

  const css = getComputedStyle(document.documentElement);
  const textColor = css.getPropertyValue('--color-text-muted').trim();
  const gridColor = css.getPropertyValue('--color-divider').trim();
  const primaryColor = css.getPropertyValue('--color-primary').trim();
  const goldColor = css.getPropertyValue('--color-gold').trim();
  const blueColor = css.getPropertyValue('--color-info').trim();

  Chart.defaults.font.family = 'Satoshi, Inter, sans-serif';
  Chart.defaults.color = textColor;

  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topPlayers.map(p => p.name),
      datasets: [
        {
          label: 'Projected',
          data: topPlayers.map(p => p.projected),
          backgroundColor: primaryColor + 'cc',
          borderColor: primaryColor,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Season Avg',
          data: topPlayers.map(p => p.season),
          backgroundColor: blueColor + 'cc',
          borderColor: blueColor,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Recent Avg',
          data: topPlayers.map(p => p.recent),
          backgroundColor: goldColor + 'cc',
          borderColor: goldColor,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 12 }, padding: 16 },
        },
        tooltip: {
          backgroundColor: css.getPropertyValue('--color-surface-2').trim(),
          titleColor: css.getPropertyValue('--color-text').trim(),
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 30 },
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          ticks: { font: { size: 11 } },
          beginAtZero: true,
        },
      },
      animation: { duration: 600, easing: 'easeOutQuart' },
    },
  });
}

// ── Standings Table ────────────────────────────────────────────────────
function renderStandings(standings, myTeam) {
  const container = document.getElementById('standingsTable');
  if (!standings || standings.length === 0) {
    container.innerHTML = '<div class="no-data">No standings data available.</div>';
    return;
  }

  const myRosterId = myTeam?.roster_id;
  const totalTeams = standings.length;
  const playoffCutoff = 6; // Top 6 make playoffs

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
            <th>Proj Total</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((team, i) => {
            const isMyTeam = team.roster_id === myRosterId;
            const isPlayoff = i < playoffCutoff;
            return `
              <tr class="${isMyTeam ? 'my-team-row' : ''}">
                <td class="rank-cell ${isPlayoff ? 'playoff' : ''}">${i + 1}</td>
                <td><strong>${team.manager}</strong></td>
                <td class="tabular">${team.record}</td>
                <td class="tabular">${team.win_pct > 0 ? (team.win_pct * 100).toFixed(0) + '%' : '--'}</td>
                <td class="tabular">${team.points_for.toFixed(1)}</td>
                <td class="tabular">${team.points_against.toFixed(1)}</td>
                <td class="tabular">${team.projected_total.toFixed(1)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2);">
      Top ${playoffCutoff} teams qualify for playoffs. Rows highlighted in your team's color.
    </p>
  `;
}

// ── Initialize ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadDashboardData);
