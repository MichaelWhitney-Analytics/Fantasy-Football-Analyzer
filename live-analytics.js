// FF_LIVE_ANALYTICS_PATCH_V1
(function installLiveAnalytics() {
  const originalLoad = loadLiveSleeperDashboard;
  const originalKPIs = renderKPIs;
  let sequence = 0;
  const responseCache = new Map();
  const eligibility = {
    QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
    FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"],
    REC_FLEX: ["WR", "TE"], WRRB_FLEX: ["WR", "RB"]
  };
  const number = v => v === null || v === undefined || v === "" ? null :
    Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = v => number(v) === null ? "--" : Number(v).toFixed(1);
  const rounded = v => Math.round(v * 100) / 100;
  const escape = escapeHtml;

  async function json(url) {
    if (!responseCache.has(url)) {
      responseCache.set(url, (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
          const response = await fetch(url, {signal: controller.signal});
          if (!response.ok) throw new Error(`Data request failed: HTTP ${response.status}`);
          return await response.json();
        } finally { clearTimeout(timer); }
      })().catch(error => { responseCache.delete(url); throw error; }));
    }
    return responseCache.get(url);
  }

  function records(rows, season, week, category) {
    if (!Array.isArray(rows)) throw new Error(`${category} source did not return an array.`);
    const output = new Map();
    const preferred = category === "proj" ? "rotowire" : "sportradar";
    for (const row of rows) {
      if (String(row.season) !== String(season) || row.season_type !== "regular" ||
          row.category !== category || !row.player_id) continue;
      if (week === null ? row.week !== null && row.week !== undefined : Number(row.week) !== week) continue;
      const id = String(row.player_id);
      const old = output.get(id);
      const priority = row.company === preferred ? 1 : 0;
      const oldPriority = old?.company === preferred ? 1 : 0;
      if (!old || priority > oldPriority || (priority === oldPriority &&
          Number(row.updated_at || row.last_modified || 0) > Number(old.updated_at || old.last_modified || 0))) {
        output.set(id, row);
      }
    }
    return output;
  }

  function points(row, scoring) {
    if (!row || !row.stats || typeof row.stats !== "object") return null;
    let result = 0;
    for (const [key, multiplier] of Object.entries(scoring)) {
      const weight = number(multiplier);
      if (weight !== null) result += (number(row.stats[key]) ?? 0) * weight;
    }
    return rounded(result);
  }

  function player(id, directory, projections, seasonStats, history, scoring, starter, slot) {
    id = String(id);
    const projection = projections.get(id);
    const info = directory[id] || projection?.player || seasonStats.get(id)?.player || {};
    const values = history.map(h => ({week: h.week, points: points(h.rows.get(id), scoring)}));
    const played = values.filter(v => v.points !== null);
    const seasonal = seasonStats.get(id);
    const total = points(seasonal, scoring);
    const games = number(seasonal?.stats?.gp);
    const avg = played.length ? rounded(played.reduce((s,v) => s + v.points, 0) / played.length) : null;
    const baseline = games && total !== null ? total / games : null;
    const ratio = baseline !== null && baseline !== 0 && avg !== null ? (avg-baseline)/Math.abs(baseline) : null;
    const position = info.position || info.fantasy_positions?.[0] || "UNKNOWN";
    return {
      id, player_id: id,
      name: info.full_name || [info.first_name,info.last_name].filter(Boolean).join(" ") ||
        (position === "DEF" ? `${info.team || id} D/ST` : `Unresolved player (${id})`),
      team: info.team || projection?.team || "FA", position,
      fantasy_positions: info.fantasy_positions?.length ? info.fantasy_positions : [position],
      projected_points: points(projection, scoring),
      season_points: total, recent_avg: avg, history: values,
      injury_status: info.injury_status || "", is_starter: starter, slot,
      opponent: projection?.opponent || "", projection_provider: projection?.company || "",
      trend: ratio === null ? "stable" : ratio > .15 ? "hot" : ratio < -.15 ? "cold" : "stable",
      trend_label: ratio === null ? "Insufficient history" : ratio > .15 ? "Above season average" :
        ratio < -.15 ? "Below season average" : "Near season average"
    };
  }

  function allowed(p, slot) {
    return number(p.projected_points) !== null && !["IR","Out","Doubtful","Suspended"].includes(p.injury_status) &&
      eligibility[slot]?.some(pos => p.fantasy_positions.includes(pos));
  }

  function optimize(roster, slots) {
    if (slots.some(slot => !eligibility[slot])) return {available: false, message: "Unsupported lineup slot: " + slots.filter(s => !eligibility[s]).join(", ")};
    if (slots.length > 16) return {available: false, message: "This optimizer supports at most 16 starter slots."};
    const size = 1 << slots.length;
    let dp = new Array(size).fill(null);
    dp[0] = {total: 0, assignments: []};
    for (const p of roster) {
      const next = dp.slice();
      for (let mask = 0; mask < size; mask++) {
        if (!dp[mask]) continue;
        for (let i = 0; i < slots.length; i++) {
          if ((mask & (1 << i)) || !allowed(p,slots[i])) continue;
          const target = mask | (1 << i);
          const total = dp[mask].total + p.projected_points;
          if (!next[target] || total > next[target].total) {
            next[target] = {total, assignments: [...dp[mask].assignments, {p,index:i}]};
          }
        }
      }
      dp = next;
    }
    const best = dp[size-1];
    if (!best) return {available: false, message: "Cannot fill every league slot with eligible players having usable projections. Check injuries, missing projections, and roster coverage."};
    return {available:true, projected_total:rounded(best.total), suggested_lineup:best.assignments.sort((a,b)=>a.index-b.index).map(a=>({...a.p,suggested_slot:slots[a.index]}))};
  }

  function table(headers, rows, cls="trends-table") {
    return `<table class="${cls}"><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }
  const cell = v => `<td>${escape(v)}</td>`;

  renderRoster = function(team) {
    const container = getElement("rosterGrid"); if (!container) return;
    container.innerHTML = [...(team?.starters || []),...(team?.bench || [])].map(p=>`
      <div class="player-card ${p.is_starter ? "starter" : ""}">
        <div class="player-header"><div><div class="player-name">${escape(p.name)}</div>
        <div class="player-meta">${escape(p.team)} / ${escape(p.position)}${p.opponent ? " vs " + escape(p.opponent) : ""}</div></div>
        <span class="player-badge badge-${escape(p.position)}">${escape(p.slot || p.position)}</span></div>
        <div class="player-proj">${fmt(p.projected_points)}</div>
        <div class="player-proj-label">${p.is_starter ? "Starter" : "Bench"} / Estimated points</div>
        ${p.injury_status ? `<div class="injury-tag">${escape(p.injury_status)}</div>` : ""}
      </div>`).join("");
  };

  renderOptimalLineup = function(optimal) {
    const container = getElement("lineupContent"); if (!container) return;
    if (!optimal.available) {container.textContent = optimal.message || "Lineup analytics unavailable.";return;}
    const current = dashboardData.my_team.starters;
    container.innerHTML = `<div class="lineup-improvement">Estimated optimal: ${fmt(optimal.projected_total)} points / Current projected: ${fmt(optimal.current_total)} / Improvement: ${fmt(optimal.improvement)}</div>` +
      table(["Slot","Current player","Current estimate","Suggested player","Suggested estimate"],optimal.suggested_lineup.map((p,i)=>`<tr>${cell(p.suggested_slot)}${cell(current[i]?.name || "Empty")}${cell(fmt(current[i]?.projected_points))}${cell(p.name)}${cell(fmt(p.projected_points))}</tr>`)) +
      `<p class="no-data">Pregame projection comparison only. This version does not enforce game-time lineup locks or execute changes in Sleeper.</p>`;
  };

  renderWaiver = function(recommendations) {
    const container = getElement("waiverContent"); if (!container) return;
    if (!recommendations?.length) {container.textContent = dashboardData.analysis.waiver_status || "No positive projected bench upgrade found among evaluated candidates.";return;}
    container.innerHTML = `<p>Unrostered candidates ranked by estimated bench-point upgrade. Availability does not imply an immediate pickup; waiver rules and roster limits still apply.</p>` +
      table(["#","Player","Position","Estimate","Drop candidate","Bench upgrade"],recommendations.map(r=>`<tr>${cell(r.rank)}${cell(r.player.name + " / " + r.player.team)}${cell(r.player.position)}${cell(fmt(r.player.projected_points))}${cell(r.drop_suggestion.name)}${cell("+"+fmt(r.edge_value))}</tr>`),"waiver-table");
  };

  renderTrendChart = function(players) {
    const container = getElement("trendChartContainer"); if (!container) return;
    if (trendChart) {trendChart.destroy();trendChart=null;}
    const history = dashboardData.analysis.history_weeks || [];
    if (!history.length || typeof Chart === "undefined") {container.textContent="No previous-week history is available, or Chart.js failed to load.";return;}
    container.innerHTML='<canvas id="trendChart"></canvas>';
    const top = players.filter(p=>p.history?.some(h=>h.points!==null)).sort((a,b)=>(b.season_points??0)-(a.season_points??0)).slice(0,5);
    if (!top.length) {container.textContent="No historical records matched this roster.";return;}
    const colors=["#00a887","#4589ff","#eea600","#b06aff","#e15b64"];
    trendChart = new Chart(getElement("trendChart"), {type:"line",data:{labels:history.map(w=>`Week ${w}`),datasets:top.map((p,i)=>({label:p.name,data:history.map(w=>p.history.find(h=>h.week===w)?.points??null),borderColor:colors[i],backgroundColor:colors[i],spanGaps:false,tension:.2}))},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:"Recent weekly estimated fantasy points (up to five roster players)"}},scales:{y:{title:{display:true,text:"Points"}}}}});
  };

  renderTrends = function(trends) {
    const players=trends?.players || [];
    renderTrendChart(players);
    const activity=getElement("trendingActivity");
    if(activity) activity.innerHTML="<div class='trending-list-title'>Sleeper trending adds - last 24 hours</div>" + (trends?.trending_adds || []).slice(0,8).map(p=>`<div class="trending-item"><span>${escape(p.name)} / ${escape(p.position)} / ${escape(p.team)}<div>${p.available_in_league ? "Unrostered" : "Rostered"} in selected league</div></span><span class="trending-count">${escape(p.count)}</span></div>`).join("");
    const container=getElement("trendsTable");
    if(container) container.innerHTML=table(["Player","Position","Projected estimate","Season estimate","Recent played-week average","Trend"],players.map(p=>`<tr>${cell(p.name)}${cell(p.position)}${cell(fmt(p.projected_points))}${cell(fmt(p.season_points))}${cell(fmt(p.recent_avg))}${cell(p.trend_label)}</tr>`));
  };

  renderKPIs = function(data) {
    originalKPIs(data);
    const container=getElement("kpiRow");
    if(!container) return;
    for(const card of container.querySelectorAll(".kpi-card")) {
      if(card.querySelector(".kpi-label")?.textContent === "Top Waiver Edge") {
        card.querySelector(".kpi-label").textContent="Estimated Bench Upgrade";
        if(data.analysis?.analytics_loaded && !data.analysis.waiver_edge?.length) {
          card.querySelector(".kpi-value").textContent="None";
          card.querySelector(".kpi-delta").textContent=data.analysis.waiver_status || "No positive upgrade found";
        }
      }
    }
  };

  loadLiveSleeperDashboard = async function() {
    const currentSequence=++sequence;
    await originalLoad();
    const data=dashboardData;
    const league=sleeperState.selectedLeague;
    const scoring=league?.scoring_settings;
    const season=String(data.meta.season);
    const week=Number(data.meta.week);
    const slots=(league?.roster_positions || []).filter(s=>!["BN","IR"].includes(s));
    for(const id of ["waiverContent","lineupContent","trendChartContainer"]) {
      const el=getElement(id);if(el) el.textContent="Loading projections and historical statistics...";
    }
    try {
      if(!scoring || !Object.keys(scoring).length) throw new Error("League scoring settings are missing; cannot calculate meaningful points.");
      if(!Number.isInteger(week) || week<1) throw new Error("Invalid selected league week.");
      const weeks=[];for(let w=Math.max(1,week-3);w<week;w++) weeks.push(w);
      const base="https://api.sleeper.com";
      const [directory,projectionRows,seasonRows,...weeklyRows]=await Promise.all([
        json("https://api.sleeper.app/v1/players/nfl"),
        json(`${base}/projections/nfl/${season}/${week}?season_type=regular`),
        json(`${base}/stats/nfl/${season}?season_type=regular`),
        ...weeks.map(w=>json(`${base}/stats/nfl/${season}/${w}?season_type=regular`))
      ]);
      if(currentSequence!==sequence || dashboardData!==data) return;
      const projections=records(projectionRows,season,week,"proj");
      const seasonStats=records(seasonRows,season,null,"stat");
      if(!projections.size) throw new Error("No projections match this season and week.");
      const history=weeks.map((w,i)=>({week:w,rows:records(weeklyRows[i],season,w,"stat")}));
      const make=(id,start=false,slot="BN")=>player(id,directory,projections,seasonStats,history,scoring,start,slot);
      const originalStarters=data.my_team.starters || [];
      const starters=originalStarters.map((p,i)=>make(p.player_id || p.id,true,slots[i] || "UNKNOWN"));
      const starterIds=new Set(starters.map(p=>p.id));
      const selected=sleeperState.rosters.find(r=>Number(r.roster_id)===Number(sleeperState.myRosterId));
      const bench=(selected?.players || []).map(String).filter(id=>!starterIds.has(id)).map(id=>make(id));
      const roster=[...starters,...bench];
      const currentTotal=starters.length===slots.length && starters.every(p=>p.projected_points!==null) ? rounded(starters.reduce((s,p)=>s+p.projected_points,0)) : null;
      const optimized=optimize(roster,slots);
      optimized.current_total=currentTotal;
      optimized.improvement=optimized.available && currentTotal!==null ? rounded(optimized.projected_total-currentTotal) : null;
      const rostered=new Set(sleeperState.rosters.flatMap(r=>(r.players || []).map(String)));
      const candidates=[...projections.keys()].filter(id=>!rostered.has(id)).map(id=>make(id)).filter(p=>slots.some(s=>allowed(p,s))).sort((a,b)=>b.projected_points-a.projected_points);
      const recommendations=[];
      for(const candidate of candidates) {
        const comparable=bench.filter(p=>p.projected_points!==null && p.fantasy_positions.some(pos=>candidate.fantasy_positions.includes(pos)));
        if(!comparable.length) continue;
        const drop=comparable.reduce((a,b)=>a.projected_points<=b.projected_points?a:b);
        const edge=rounded(candidate.projected_points-drop.projected_points);
        if(edge<=0) continue;
        recommendations.push({player:candidate,drop_suggestion:{name:drop.name},edge_value:edge});
      }
      recommendations.sort((a,b)=>b.edge_value-a.edge_value);
      data.my_team.starters=starters;data.my_team.bench=bench;data.my_team.projected_total=currentTotal;
      data.analysis.optimal_lineup=optimized;
      data.analysis.waiver_edge=recommendations.slice(0,15).map((r,i)=>({...r,rank:i+1}));
      data.analysis.waiver_status=bench.some(p=>p.projected_points!==null) ? "No positive same-position bench upgrade found." : "Bench projections are unavailable; no defensible drop comparison can be calculated.";
      const existingTrending=data.analysis.player_trends?.trending_adds || [];
      data.analysis.player_trends={players:roster,trending_adds:existingTrending};
      data.analysis.history_weeks=weeks;
      data.analysis.analytics_loaded=true;
      const keys=new Set([...projections.values(),...seasonStats.values(),...history.flatMap(h=>[...h.rows.values()])].flatMap(r=>Object.keys(r.stats || {})));
      const unmatched=Object.entries(scoring).filter(([k,v])=>Number(v)!==0 && !keys.has(k)).map(([k])=>k);
      data.analysis.insights=[...(data.analysis.insights || []).filter(x=>x.title!=="Live data status"),{
        type:"info",icon:"alert-circle",title:"Projection and scoring methodology",
        message:`Selected-week per-player records; Rotowire projections preferred, Sportradar statistics preferred. Points are additive league-weighted estimates, not guaranteed official Sleeper scores. Missing stat keys count as zero. Nonlinear bonuses, tiered scoring, and aggregate projections can differ from official scoring. ${unmatched.length ? "Configured keys absent from these responses: "+unmatched.join(", ")+". " : ""}Lineup comparisons do not enforce game-time locks. Recent averages exclude missing weekly records.`
      }];
      console.info("Analytics source summary",{season,week,uniqueProjectionPlayers:projections.size,uniqueSeasonPlayers:seasonStats.size,slots,missingRosterProjections:roster.filter(p=>p.projected_points===null).map(p=>p.name),unmatchedScoringKeys:unmatched});
      renderDashboard();
    } catch(error) {
      console.error("Live analytics failed:",error);
      if(currentSequence!==sequence || dashboardData!==data) return;
      for(const id of ["waiverContent","lineupContent","trendChartContainer"]) {
        const el=getElement(id);if(el) el.textContent="Analytics unavailable: "+error.message;
      }
    }
  };
})();
