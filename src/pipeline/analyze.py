"""
Analyze Module — The Intelligence Layer

Computes actionable insights from transformed fantasy football data:

1. Waiver Wire Edge Analysis
   - Identifies the best available free agents
   - Compares each candidate against your weakest bench player at the same position
   - Calculates the projected point improvement (the "edge")
   - Factors in bye week coverage, injury status, and trending activity

2. Matchup Analysis
   - Compares your projected starting lineup vs your opponent's
   - Identifies positional advantages and disadvantages
   - Calculates win probability based on projected points

3. Optimal Lineup Optimizer
   - Maximizes projected points within roster slot constraints
   - Accounts for bye weeks, injuries, and matchup strength
   - Suggests lineup changes with reasoning

4. Player Trends & Insights
   - Week-over-week performance deltas
   - Hot/cold streak detection
   - Trending add/drop intelligence
"""

from src.config import config


def analyze(clean_data: dict) -> dict:
    """
    Run all analysis modules on the cleaned data.

    Args:
        clean_data: Output from transform.transform()

    Returns:
        dict with analysis results:
            - waiver_edge: Ranked free agent recommendations
            - matchup_analysis: Position-by-position comparison
            - optimal_lineup: Suggested starting lineup
            - player_trends: Performance trends for your roster
            - insights: Human-readable summary insights
    """
    my_team = clean_data.get("my_team", {})
    opponent = clean_data.get("opponent")
    available_players = clean_data.get("available_players", [])
    trending = clean_data.get("trending", {})
    standings = clean_data.get("standings", [])
    league = clean_data.get("league", {})

    # Run each analysis module
    waiver_edge = analyze_waiver_edge(my_team, available_players, trending)
    matchup_analysis = analyze_matchup(my_team, opponent)
    optimal_lineup = optimize_lineup(my_team)
    player_trends = analyze_trends(my_team, trending)
    insights = generate_insights(my_team, opponent, waiver_edge, standings, league)

    return {
        "waiver_edge": waiver_edge,
        "matchup_analysis": matchup_analysis,
        "optimal_lineup": optimal_lineup,
        "player_trends": player_trends,
        "insights": insights,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 1. WAIVER WIRE EDGE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════

def analyze_waiver_edge(my_team: dict, available_players: list, trending: dict) -> list:
    """
    Calculate the waiver wire "edge" for each available free agent.

    Edge = Free Agent Projected Points - Weakest Bench Player Points (same position)

    Returns a ranked list of recommendations with drop suggestions.
    """
    if not my_team:
        return []

    bench = my_team.get("bench", [])
    if not bench:
        return []

    # Group bench players by position
    bench_by_position = {}
    for player in bench:
        pos = player["position"]
        if pos not in bench_by_position:
            bench_by_position[pos] = []
        bench_by_position[pos].append(player)

    # Find weakest bench player per position
    weakest_by_position = {}
    for pos, players in bench_by_position.items():
        weakest = min(players, key=lambda p: p["projected_points"])
        weakest_by_position[pos] = weakest

    # Also track weakest bench player overall
    weakest_bench_overall = min(bench, key=lambda p: p["projected_points"]) if bench else None

    # Trending player IDs for bonus scoring
    trending_add_ids = {str(t["player_id"]) for t in trending.get("adds", [])}

    recommendations = []
    for fa in available_players[:100]:  # Analyze top 100 available players
        fa_pos = fa["position"]

        # Find comparable bench player at the same position
        # For FLEX-eligible positions (RB, WR, TE), compare across all skill positions
        comparable_positions = _get_comparable_positions(fa_pos)
        comparable_bench = []
        for pos in comparable_positions:
            if pos in weakest_by_position:
                comparable_bench.append(weakest_by_position[pos])

        if not comparable_bench:
            # No comparable bench player — edge is just the FA's projected points
            comparison_player = weakest_bench_overall
        else:
            comparison_player = min(comparable_bench, key=lambda p: p["projected_points"])

        if not comparison_player:
            continue

        # Calculate base edge
        edge = fa["projected_points"] - comparison_player["projected_points"]

        # Apply modifiers
        trend_bonus = 0
        if fa["player_id"] in trending_add_ids:
            trend_bonus = 0.5  # Small bonus for trending players

        # Bye week coverage bonus
        bye_bonus = 0
        my_starters = my_team.get("starters", [])
        for starter in my_starters:
            if (starter["position"] == fa_pos and
                    starter.get("bye_week") == fa.get("bye_week")):
                bye_bonus = 0  # No bonus if same bye week
            elif starter["position"] == fa_pos and starter.get("bye_week"):
                # Bonus if this FA covers a different bye week than current starter
                if fa.get("bye_week") and fa["bye_week"] != starter["bye_week"]:
                    bye_bonus = max(bye_bonus, 0.3)

        # Injury penalty for the FA
        injury_penalty = 0
        if fa.get("injury_status") and fa["injury_status"] not in ("Active", "Healthy"):
            injury_penalty = 1.0

        adjusted_edge = edge + trend_bonus + bye_bonus - injury_penalty

        if adjusted_edge < config.waiver_edge_threshold:
            continue

        recommendation = {
            "rank": 0,  # Assigned after sorting
            "player": {
                "name": fa["name"],
                "position": fa_pos,
                "team": fa["team"],
                "projected_points": fa["projected_points"],
                "season_points": fa.get("season_points", 0),
                "recent_avg": fa.get("recent_avg", 0),
                "injury_status": fa.get("injury_status"),
                "bye_week": fa.get("bye_week"),
            },
            "drop_suggestion": {
                "name": comparison_player["name"],
                "position": comparison_player["position"],
                "projected_points": comparison_player["projected_points"],
                "reason": _get_drop_reason(comparison_player, fa),
            },
            "edge_value": round(adjusted_edge, 2),
            "raw_edge": round(edge, 2),
            "trending": fa["player_id"] in trending_add_ids,
            "analysis": _generate_waiver_analysis(fa, comparison_player, adjusted_edge),
        }
        recommendations.append(recommendation)

    # Sort by adjusted edge value (descending)
    recommendations.sort(key=lambda x: x["edge_value"], reverse=True)

    # Assign ranks
    for i, rec in enumerate(recommendations, 1):
        rec["rank"] = i

    return recommendations[:15]  # Top 15 recommendations


def _get_comparable_positions(position: str) -> list:
    """Get positions that are comparable for waiver edge analysis."""
    if position in ("RB", "WR", "TE"):
        return ["RB", "WR", "TE"]  # FLEX-eligible positions
    return [position]


def _get_drop_reason(drop_player: dict, add_player: dict) -> str:
    """Generate a human-readable reason for dropping a player."""
    reasons = []
    if drop_player["projected_points"] < add_player["projected_points"]:
        diff = add_player["projected_points"] - drop_player["projected_points"]
        reasons.append(f"+{diff:.1f} pts/wk upgrade")
    if drop_player.get("injury_status") and drop_player["injury_status"] not in ("Active", "Healthy"):
        reasons.append(f"{drop_player['injury_status']} injury")
    if not reasons:
        reasons.append("Lower projected value")
    return "; ".join(reasons)


def _generate_waiver_analysis(fa: dict, drop_player: dict, edge: float) -> str:
    """Generate a detailed analysis string for a waiver recommendation."""
    parts = []
    parts.append(
        f"Adding {fa['name']} ({fa['position']}, {fa['team']}) over "
        f"{drop_player['name']} yields a +{edge:.1f} projected point edge per week."
    )
    if fa.get("injury_status") and fa["injury_status"] not in ("Active", "Healthy"):
        parts.append(f"Note: {fa['name']} is currently {fa['injury_status']}.")
    if fa.get("bye_week"):
        parts.append(f"Bye week: {fa['bye_week']}.")
    return " ".join(parts)


# ═══════════════════════════════════════════════════════════════════════════
# 2. MATCHUP ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════

def analyze_matchup(my_team: dict, opponent: dict | None) -> dict:
    """
    Analyze the current week's matchup position-by-position.

    Returns projected scores, positional edges, and win probability.
    """
    if not my_team:
        return {"available": False, "message": "No team data available"}

    if not opponent:
        return {
            "available": False,
            "message": "No matchup data available. This may be an off week or playoffs.",
            "my_projected": my_team.get("projected_total", 0),
        }

    my_starters = my_team.get("starters", [])
    opp_starters = opponent.get("starters", [])

    # Map starters by position for comparison
    my_by_pos = _group_by_position(my_starters)
    opp_by_pos = _group_by_position(opp_starters)

    # Compare position by position
    position_comparison = []
    all_positions = sorted(set(list(my_by_pos.keys()) + list(opp_by_pos.keys())))

    for pos in all_positions:
        my_players = my_by_pos.get(pos, [])
        opp_players = opp_by_pos.get(pos, [])

        my_proj = sum(p["projected_points"] for p in my_players)
        opp_proj = sum(p["projected_points"] for p in opp_players)

        diff = my_proj - opp_proj
        if diff > 2:
            advantage = "mine"
            edge_label = "Advantage"
        elif diff < -2:
            advantage = "opponent"
            edge_label = "Disadvantage"
        else:
            advantage = "even"
            edge_label = "Even"

        position_comparison.append({
            "position": pos,
            "my_players": [{"name": p["name"], "team": p["team"],
                            "projected": p["projected_points"]} for p in my_players],
            "opp_players": [{"name": p["name"], "team": p["team"],
                             "projected": p["projected_points"]} for p in opp_players],
            "my_projected": round(my_proj, 2),
            "opp_projected": round(opp_proj, 2),
            "difference": round(diff, 2),
            "advantage": advantage,
            "edge_label": edge_label,
        })

    # Calculate overall projections and win probability
    my_total = sum(s["projected_points"] for s in my_starters)
    opp_total = sum(s["projected_points"] for s in opp_starters)

    # Simple win probability based on projected point difference
    # Using a logistic function centered at 0
    import math
    diff = my_total - opp_total
    win_prob = 1 / (1 + math.exp(-diff / 5))  # Sigmoid with 5-point spread

    return {
        "available": True,
        "my_projected": round(my_total, 2),
        "opp_projected": round(opp_total, 2),
        "point_spread": round(diff, 2),
        "win_probability": round(win_prob * 100, 1),
        "opponent_name": opponent.get("manager", {}).get("display_name", "Unknown"),
        "opponent_record": opponent.get("record", {}),
        "position_comparison": position_comparison,
        "my_record": my_team.get("record", {}),
    }


def _group_by_position(players: list) -> dict:
    """Group players by position, handling FLEX as a separate group."""
    grouped = {}
    for player in players:
        pos = player["position"]
        # For FLEX slot, use "FLEX" as the key
        # Since Sleeper doesn't label FLEX separately, we check if there are
        # already 2 RBs/WRs and this is the third
        if pos not in grouped:
            grouped[pos] = []
        grouped[pos].append(player)
    return grouped


# ═══════════════════════════════════════════════════════════════════════════
# 3. OPTIMAL LINEUP OPTIMIZER
# ═══════════════════════════════════════════════════════════════════════════

def optimize_lineup(my_team: dict) -> dict:
    """
    Optimize the starting lineup to maximize projected points.

    Uses a greedy approach:
    1. For each required position, select the player with the highest projection
    2. Handle FLEX by picking the best remaining RB/WR/TE
    3. Account for bye weeks and injuries
    """
    if not my_team:
        return {"available": False, "message": "No team data available"}

    full_roster = my_team.get("full_roster", [])
    current_starters = my_team.get("starters", [])
    roster_positions = config.roster_positions

    # Filter out players on bye or injured
    eligible = []
    for player in full_roster:
        if player.get("injury_status") and player["injury_status"] in ("IR", "Out", "Doubtful"):
            eligible.append({**player, "eligible": False, "reason": f"{player['injury_status']}"})
        elif player.get("bye_week") == my_team.get("current_week"):
            eligible.append({**player, "eligible": False, "reason": "Bye week"})
        else:
            eligible.append({**player, "eligible": True, "reason": None})

    # Assign positions greedily
    assigned = []
    used_ids = set()

    # Standard positions first (QB, K, DEF, TE)
    for pos in ["QB", "TE", "K", "DEF"]:
        best = _find_best_for_position(eligible, pos, used_ids)
        if best:
            assigned.append({**best, "suggested_slot": pos})
            used_ids.add(best["player_id"])

    # RBs (need 2)
    for _ in range(2):
        best = _find_best_for_position(eligible, "RB", used_ids)
        if best:
            assigned.append({**best, "suggested_slot": "RB"})
            used_ids.add(best["player_id"])

    # WRs (need 2)
    for _ in range(2):
        best = _find_best_for_position(eligible, "WR", used_ids)
        if best:
            assigned.append({**best, "suggested_slot": "WR"})
            used_ids.add(best["player_id"])

    # FLEX (best remaining RB/WR/TE)
    flex_candidates = [p for p in eligible if p["eligible"] and
                       p["position"] in ("RB", "WR", "TE") and p["player_id"] not in used_ids]
    if flex_candidates:
        best_flex = max(flex_candidates, key=lambda p: p["projected_points"])
        assigned.append({**best_flex, "suggested_slot": "FLEX"})
        used_ids.add(best_flex["player_id"])

    # Calculate projected total
    projected_total = round(sum(p["projected_points"] for p in assigned), 2)

    # Compare with current lineup
    current_total = my_team.get("projected_total", 0)
    improvement = round(projected_total - current_total, 2)

    # Identify changes
    current_ids = {s["player_id"] for s in current_starters}
    suggested_ids = {p["player_id"] for p in assigned}
    changes = []

    for player in assigned:
        if player["player_id"] not in current_ids:
            # This is a new starter — find who they're replacing
            # Look for a current starter at the same slot who is not in the suggested lineup
            slot = player.get("suggested_slot", player["position"])
            old_starter = None
            for s in current_starters:
                if s["player_id"] not in suggested_ids:
                    # Match by position or slot
                    if s["position"] == player["position"]:
                        old_starter = s
                        break
                    elif slot == "FLEX" and s["position"] in ("RB", "WR", "TE"):
                        old_starter = s
                        break
            # If still no match, find any current starter not in suggested lineup
            if not old_starter:
                old_starter = next((s for s in current_starters
                                    if s["player_id"] not in suggested_ids), None)
            changes.append({
                "type": "bench_to_start",
                "player": player["name"],
                "position": player["position"],
                "replaces": old_starter["name"] if old_starter else "current starter",
                "reason": f"Higher projection ({player['projected_points']} vs "
                          f"{old_starter['projected_points'] if old_starter else 0})",
            })

    return {
        "available": True,
        "suggested_lineup": [{
            "name": p["name"],
            "position": p["position"],
            "team": p["team"],
            "projected_points": p["projected_points"],
            "suggested_slot": p["suggested_slot"],
            "injury_status": p.get("injury_status"),
        } for p in assigned],
        "projected_total": projected_total,
        "current_total": current_total,
        "improvement": improvement,
        "changes": changes,
        "message": (
            f"Optimal lineup projects {projected_total} points "
            f"({'+' if improvement >= 0 else ''}{improvement} vs current lineup)"
        ),
    }


def _find_best_for_position(eligible: list, position: str, used_ids: set) -> dict | None:
    """Find the best eligible player for a given position."""
    candidates = [
        p for p in eligible
        if p["eligible"] and p["position"] == position and p["player_id"] not in used_ids
    ]
    if not candidates:
        # Fall back to ineligible players if no one is eligible
        candidates = [
            p for p in eligible
            if p["position"] == position and p["player_id"] not in used_ids
        ]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p["projected_points"])


# ═══════════════════════════════════════════════════════════════════════════
# 4. PLAYER TRENDS & INSIGHTS
# ═══════════════════════════════════════════════════════════════════════════

def analyze_trends(my_team: dict, trending: dict) -> dict:
    """Analyze performance trends for players on the user's roster."""
    roster = my_team.get("full_roster", [])

    player_trends = []
    for player in roster:
        recent = player.get("recent_points", [])
        season_avg = player.get("season_points", 0) / max(
            my_team.get("meta", {}).get("week", 1), 1
        ) if my_team.get("season_points") else 0

        # Determine trend direction
        if len(recent) >= 2:
            recent_avg = sum(recent[-3:]) / len(recent[-3:])
            if recent_avg > season_avg * 1.15:
                trend = "hot"
                trend_label = "Trending Up"
            elif recent_avg < season_avg * 0.85:
                trend = "cold"
                trend_label = "Trending Down"
            else:
                trend = "stable"
                trend_label = "Stable"
        else:
            trend = "stable"
            trend_label = "Insufficient Data"

        player_trends.append({
            "name": player["name"],
            "position": player["position"],
            "team": player["team"],
            "projected_points": player["projected_points"],
            "season_points": player.get("season_points", 0),
            "recent_avg": player.get("recent_avg", 0),
            "trend": trend,
            "trend_label": trend_label,
            "is_starter": player.get("is_starter", False),
            "injury_status": player.get("injury_status"),
        })

    # Sort starters first, then by projected points
    player_trends.sort(key=lambda x: (not x["is_starter"], -x["projected_points"]))

    return {
        "players": player_trends,
        "trending_adds": trending.get("adds", [])[:10],
        "trending_drops": trending.get("drops", [])[:10],
    }


# ═══════════════════════════════════════════════════════════════════════════
# 5. INSIGHTS SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

def generate_insights(my_team: dict, opponent: dict | None,
                       waiver_edge: list, standings: list, league: dict) -> list:
    """Generate human-readable summary insights for the dashboard."""
    insights = []

    # Matchup insight
    if opponent:
        my_proj = my_team.get("projected_total", 0)
        opp_proj = opponent.get("projected_total", 0)
        if my_proj > opp_proj:
            insights.append({
                "type": "positive",
                "icon": "trending-up",
                "title": "Favorable Matchup",
                "message": f"You're projected to win by {my_proj - opp_proj:.1f} points "
                          f"against {opponent['manager']['display_name']}.",
            })
        else:
            insights.append({
                "type": "warning",
                "icon": "alert-triangle",
                "title": "Tough Matchup",
                "message": f"You're projected to lose by {opp_proj - my_proj:.1f} points. "
                          f"Consider lineup adjustments or waiver moves.",
            })

    # Waiver insight
    if waiver_edge:
        top_rec = waiver_edge[0]
        insights.append({
            "type": "info",
            "icon": "target",
            "title": "Top Waiver Target",
            "message": f"Add {top_rec['player']['name']} ({top_rec['player']['position']}) "
                      f"for a +{top_rec['edge_value']:.1f} edge. "
                      f"Drop {top_rec['drop_suggestion']['name']}.",
        })

    # Standings insight
    if standings and my_team:
        my_rank = next((i + 1 for i, s in enumerate(standings)
                        if s["roster_id"] == my_team["roster_id"]), None)
        if my_rank:
            if my_rank <= 4:
                insights.append({
                    "type": "positive",
                    "icon": "award",
                    "title": "Playoff Position",
                    "message": f"You're ranked #{my_rank} — in playoff position.",
                })
            elif my_rank <= 6:
                insights.append({
                    "type": "warning",
                    "icon": "alert-circle",
                    "title": "Bubble Team",
                    "message": f"You're ranked #{my_rank} — on the playoff bubble.",
                })
            else:
                insights.append({
                    "type": "negative",
                    "icon": "trending-down",
                    "title": "Needs Improvement",
                    "message": f"You're ranked #{my_rank} — waiver moves and lineup "
                              f"optimization could help climb the standings.",
                })

    # Lineup optimization insight
    # (Handled in the optimal_lineup section)

    return insights
