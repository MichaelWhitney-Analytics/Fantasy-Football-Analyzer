// FF_WAIVER_TRENDS_ADJUSTMENTS_V1
(function installWaiverTrendsAdjustments() {
  const originalLoad = loadLiveSleeperDashboard;
  const originalRenderTrends = renderTrends;
  const originalRenderWaiver = renderWaiver;
  let positionFilter = "ALL";
  let sequence = 0;
  const countText = value => Number(value || 0).toLocaleString("en-US");
  const eligiblePositions = {QB:["QB"],RB:["RB"],WR:["WR"],TE:["TE"],K:["K"],DEF:["DEF"],FLEX:["RB","WR","TE"],SUPER_FLEX:["QB","RB","WR","TE"],REC_FLEX:["WR","TE"],WRRB_FLEX:["WR","RB"]};
  function positive(p) {return p && p.projected_points !== null && p.projected_points !== undefined && Number.isFinite(Number(p.projected_points)) && Number(p.projected_points)>0;}
  function positions(p) {return p.fantasy_positions?.length ? p.fantasy_positions : [p.position];}
  function filtered(trends) {
    return [...(trends?.trending_adds || [])].filter(p=>positionFilter==="ALL" || positions(p).includes(positionFilter))
      .sort((a,b)=>Number(b.count)-Number(a.count) || String(a.name).localeCompare(String(b.name)));
  }
  async function get(url) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    try {const response=await fetch(url,{signal:controller.signal});if(!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);return await response.json();}
    finally {clearTimeout(timer);}
  }
  function projectionMap(rows,season,week) {
    if(!Array.isArray(rows)) throw new Error("Projection response is not an array.");
    const map=new Map();
    for(const row of rows) {
      if(String(row.season)!==season || Number(row.week)!==week || row.category!=="proj" || row.season_type!=="regular" || !row.player_id) continue;
      const id=String(row.player_id), old=map.get(id);
      const priority=row.company==="rotowire"?1:0, oldPriority=old?.company==="rotowire"?1:0;
      if(!old || priority>oldPriority || (priority===oldPriority && Number(row.updated_at || row.last_modified || 0)>Number(old.updated_at || old.last_modified || 0))) map.set(id,row);
    }
    return map;
  }
  function detail(id,directory,row,scoring) {
    id=String(id);const info=directory[id] || row?.player || {};
    let estimate=null;
    if(row?.stats) estimate=Math.round(Object.entries(scoring).reduce((sum,[key,weight])=>sum+(Number(row.stats[key])||0)*(Number(weight)||0),0)*100)/100;
    const position=info.position || info.fantasy_positions?.[0] || "UNKNOWN";
    return {id,player_id:id,name:info.full_name || [info.first_name,info.last_name].filter(Boolean).join(" ") || (position==="DEF"?`${info.team || id} D/ST`:`Unresolved player (${id})`),team:info.team || row?.team || "FA",position,fantasy_positions:info.fantasy_positions?.length?info.fantasy_positions:[position],projected_points:estimate,injury_status:info.injury_status || ""};
  }

  renderWaiver=function(recs) {
    originalRenderWaiver(recs);
    const el=getElement("waiverContent");
    if(el && dashboardData?.analysis?.waiver_adjusted) {
      const note=document.createElement("p");
      note.textContent="Drop comparisons exclude zero/missing projections, IR/reserve and taxi players, and players marked IR, Out, Doubtful or Suspended. Candidates must have positive projections. Rankings remain same-position bench upgrades, not guaranteed starting-lineup gains.";
      note.style.cssText="font-size:12px;color:var(--color-text-muted);margin-top:12px;";el.append(note);
    }
  };

  renderTrendChart=function() {
    const container=getElement("trendChartContainer");if(!container)return;
    if(trendChart){trendChart.destroy();trendChart=null;}
    const top=filtered(dashboardData?.analysis?.player_trends).slice(0,5);
    if(typeof Chart==="undefined"){container.textContent="Chart.js failed to load.";return;}
    if(!top.length){container.textContent="No trending adds returned for this position.";return;}
    container.innerHTML='<canvas id="trendChart"></canvas>';
    trendChart=new Chart(getElement("trendChart"),{type:"bar",data:{labels:top.map(p=>p.name),datasets:[{label:"Adds in last 24 hours",data:top.map(p=>Number(p.count)||0),backgroundColor:["#00a887","#4589ff","#eea600","#b06aff","#e15b64"],borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:"y",plugins:{legend:{display:false},title:{display:true,text:`Top 5 trending adds / ${positionFilter==="ALL"?"All positions":positionFilter} / Last 24 hours`},tooltip:{callbacks:{label:c=>`${countText(c.parsed.x)} adds`}}},scales:{x:{beginAtZero:true,title:{display:true,text:"Add count"},ticks:{callback:value=>countText(value)}}}}});
  };

  renderTrends=function(trends) {
    originalRenderTrends(trends);
    const container=getElement("trendChartContainer");
    let controls=getElement("ff-trending-position-controls");
    if(!controls && container){
      controls=document.createElement("div");controls.id="ff-trending-position-controls";
      controls.style.cssText="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 20px;";
      const grid=container.closest(".trends-grid") || container;grid.parentNode.insertBefore(controls,grid);
    }
    if(controls){
      controls.replaceChildren();const label=document.createElement("span");label.textContent="Filter trending adds:";controls.append(label);
      const primary=["QB","RB","WR","TE","K","DEF"];
      const extras=[...new Set((trends?.trending_adds || []).flatMap(positions))].filter(p=>p && !primary.includes(p)).sort();
      for(const pos of ["ALL",...primary,...extras]){
        const button=document.createElement("button");button.type="button";button.textContent=pos==="ALL"?"All positions":pos;
        button.setAttribute("aria-pressed",String(positionFilter===pos));
        button.style.cssText="padding:7px 12px;border-radius:6px;border:1px solid var(--color-primary);cursor:pointer;"+(positionFilter===pos?"background:var(--color-primary);color:white;":"background:transparent;color:var(--color-text);");
        button.addEventListener("click",()=>{positionFilter=pos;renderTrends(trends);});controls.append(button);
      }
    }
    const activity=getElement("trendingActivity");const top=filtered(trends).slice(0,10);
    if(activity)activity.innerHTML=`<div class="trending-list-title">Top 10 trending adds / ${escapeHtml(positionFilter==="ALL"?"All positions":positionFilter)} / Last 24 hours</div>`+top.map(p=>`<div class="trending-item"><span>${escapeHtml(p.name)} / ${escapeHtml(p.position)} / ${escapeHtml(p.team)}<div>${p.available_in_league?"Unrostered":"Rostered"} in selected league</div></span><span class="trending-count">${countText(p.count)}</span></div>`).join("")+(top.length?"":"<p>No matching trending players returned for this position.</p>");
    const subtitle=getElement("trends")?.querySelector(".section-subtitle");if(subtitle)subtitle.textContent="Trending adds and roster performance";
  };

  loadLiveSleeperDashboard=async function(){
    const current=++sequence;positionFilter="ALL";
    await originalLoad();const data=dashboardData;
    const season=String(data?.meta?.season), week=Number(data?.meta?.week);
    const league=sleeperState.selectedLeague, scoring=league?.scoring_settings;
    try{
      if(!scoring || !Object.keys(scoring).length)throw new Error("League scoring settings unavailable.");
      const [directory,rows,adds]=await Promise.all([
        get("https://api.sleeper.app/v1/players/nfl"),
        get(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`),
        get("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=1000")
      ]);
      if(current!==sequence || dashboardData!==data)return;
      if(!Array.isArray(adds))throw new Error("Trending response is not an array.");
      const projections=projectionMap(rows,season,week);
      if(!projections.size)throw new Error("No usable selected-week projection records returned.");
      const selected=sleeperState.rosters.find(r=>Number(r.roster_id)===Number(sleeperState.myRosterId));
      const excluded=new Set([...(selected?.reserve || []),...(selected?.taxi || [])].map(String));
      const validDrop=p=>positive(p) && !excluded.has(String(p.player_id || p.id)) && !["IR","Out","Doubtful","Suspended"].includes(p.injury_status);
      const bench=data.my_team.bench || [];
      const usableBench=bench.filter(validDrop);
      const rostered=new Set(sleeperState.rosters.flatMap(r=>(r.players || []).map(String)));
      const slots=(league.roster_positions || []).filter(s=>!["BN","IR"].includes(s));
      const recs=[];
      for(const [id,row] of projections){
        if(rostered.has(id))continue;
        const candidate=detail(id,directory,row,scoring);
        if(!positive(candidate) || ["IR","Out","Doubtful","Suspended"].includes(candidate.injury_status) || !slots.some(s=>eligiblePositions[s]?.some(pos=>positions(candidate).includes(pos))))continue;
        const comparable=usableBench.filter(p=>positions(p).some(pos=>positions(candidate).includes(pos)));
        if(!comparable.length)continue;
        const drop=comparable.reduce((a,b)=>Number(a.projected_points)<=Number(b.projected_points)?a:b);
        const edge=Math.round((candidate.projected_points-Number(drop.projected_points))*100)/100;
        if(edge>0)recs.push({player:candidate,drop_suggestion:{name:drop.name},edge_value:edge});
      }
      recs.sort((a,b)=>b.edge_value-a.edge_value || a.player.name.localeCompare(b.player.name));
      data.analysis.waiver_edge=recs.slice(0,15).map((r,i)=>({...r,rank:i+1}));
      data.analysis.waiver_adjusted=true;
      data.analysis.waiver_status=usableBench.length?"No positive same-position upgrade over eligible positive-projection bench players.":"No eligible bench players projected above zero are available for a drop comparison.";
      const unique=new Map();for(const row of adds){if(!row.player_id)continue;const id=String(row.player_id),old=unique.get(id);if(!old || Number(row.count)>Number(old.count))unique.set(id,row);}
      data.analysis.player_trends.trending_adds=[...unique.values()].map(row=>({...detail(row.player_id,directory,projections.get(String(row.player_id)),scoring),count:Number(row.count)||0,available_in_league:!rostered.has(String(row.player_id))})).sort((a,b)=>b.count-a.count);
      renderWaiver(data.analysis.waiver_edge);renderKPIs(data);renderTrends(data.analysis.player_trends);
      console.info("Waiver and trending adjustments",{eligibleDropPlayers:usableBench.map(p=>({name:p.name,projection:p.projected_points})),excludedDropPlayers:bench.filter(p=>!validDrop(p)).map(p=>({name:p.name,projection:p.projected_points,reserve:excluded.has(String(p.player_id || p.id)),injury:p.injury_status})),trendingPlayersReturned:unique.size});
    }catch(error){
      console.error("Waiver/trending adjustments failed:",error);
      if(current===sequence && dashboardData===data){
        const waiver=getElement("waiverContent");if(waiver)waiver.textContent="Adjusted waiver calculation unavailable: "+error.message;
        const activity=getElement("trendingActivity");if(activity){const note=document.createElement("p");note.textContent="Expanded trending feed failed to load; any displayed entries are from the earlier limited feed. "+error.message;activity.prepend(note);}
      }
    }
  };
})();
