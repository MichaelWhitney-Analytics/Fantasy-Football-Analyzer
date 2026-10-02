"""
Transform Module — Cleans and structures raw API data.

Converts raw Sleeper API responses into a clean, normalized data structure
that the analysis engine and dashboard can consume.

Key transformations:
- Map player IDs to names, positions, teams
- Enrich rosters with player details
- Structure matchups with both teams' full lineups
- Identify available free agents (all players minus rostered)
- Compute season-to-date fantasy points
- Calculate recent form (last 3 weeks)
"""

from src.config import config


def transform(raw_data: dict) -> dict:
    """
    Transform raw API data into a clean, normalized structure.

    Args:
        raw_data: Output from fetch.fetch_all() or fetch.fetch_demo()

    Returns:
        Cleaned data dict with:
            - meta: Pipeline metadata
            - my_team: Enriched roster for the user's team
            - opponent: Enriched roster for the current week's opponent
            - standings: League standings with records and points
            - available_players: Free agents with projections
            - trending: Add/drop trending data with player names
            - all_rosters: All rosters enriched with player details
    """
    meta = raw_data["meta"]
    league = raw_data["league"]
    rosters = raw_data["rosters"]
    users = raw_data["users"]
    matchups = raw_data["matchups"]
    players_db = raw_data["players"]
    trending_adds = raw_data.get("trending_adds", [])
    trending_drops = raw_data.get("trending_drops", [])

    # Build user lookup: roster_id -> manager display name
    roster_to_user = {}
    user_lookup = {}
    for user in users:
        user_lookup[user["user_id"]] = user
    for roster in rosters:
        owner_id = roster.get("owner_id")
        if owner_id and owner_id in user_lookup:
            roster_to_user[roster["roster_id"]] = {
                "display_name": user_lookup[owner_id].get("display_name", "Unknown"),
                "avatar_id": user_lookup[owner_id].get("avatar"),
            }

    # Enrich all rosters with player details
    all_rosters_enriched = []
    for roster in rosters:
        enriched = _enrich_roster(roster, players_db, roster_to_user)
        all_rosters_enriched.append(enriched)

    # Find the user's roster (first roster or by matching username)
    my_roster = all_rosters_enriched[0] if all_rosters_enriched else None
    if config.sleeper_username:
        for r in all_rosters_enriched:
            manager = r.get("manager", {}).get("display_name", "")
            if manager.lower() == config.sleeper_username.lower():
                my_roster = r
                break

    # Determine opponent from matchups
    opponent_roster = None
    if matchups and my_roster:
        opponent_roster = _find_opponent(matchups, my_roster["roster_id"],
                                         all_rosters_enriched, players_db, roster_to_user)

    # Compute standings
    standings = _compute_standings(all_rosters_enriched)

    # Compute available free agents
    rostered_player_ids = set()
    for roster in all_rosters_enriched:
        rostered_player_ids.update(roster.get("player_ids", []))

    available_players = _compute_available_players(players_db, rostered_player_ids)

    # Enrich trending data with player names
    trending = _enrich_trending(trending_adds, trending_drops, players_db)

    # League settings
    scoring_settings = league.get("scoring_settings", {})
    roster_positions = league.get("roster_positions", config.roster_positions)

    return {
        "meta": meta,
        "league": {
            "name": league.get("name", "Demo League"),
            "season": meta.get("season"),
            "week": meta.get("week"),
            "scoring_type": config.scoring_type,
            "roster_positions": roster_positions,
            "total_rosters": league.get("total_rosters", len(rosters)),
            "scoring_settings": _simplify_scoring(scoring_settings),
        },
        "my_team": my_roster,
        "opponent": opponent_roster,
        "standings": standings,
        "available_players": available_players[:200],  # Top 200 by projected points
        "trending": trending,
        "all_rosters": all_rosters_enriched,
        "scoring_settings": _simplify_scoring(scoring_settings),
    }


def _enrich_roster(roster: dict, players_db: dict, roster_to_user: dict) -> dict:
    """Enrich a roster object with player details and manager info."""
    player_ids = roster.get("players", [])
    starter_ids = roster.get("starters", [])
    bench_ids = [pid for pid in player_ids if pid not in starter_ids]

    starters = []
    for pid in starter_ids:
        player = players_db.get(pid, {})
        starters.append(_build_player_detail(pid, player, is_starter=True))

    bench = []
    for pid in bench_ids:
        player = players_db.get(pid, {})
        bench.append(_build_player_detail(pid, player, is_starter=False))

    manager = roster_to_user.get(roster["roster_id"], {
        "display_name": f"Team {roster['roster_id']}",
        "avatar_id": None,
    })

    wins = roster.get("wins", 0)
    losses = roster.get("losses", 0)
    ties = roster.get("ties", 0)
    points_for = roster.get("fpts", 0)
    points_against = roster.get("fpts_decimal", 0)  # Approximation

    return {
        "roster_id": roster.get("roster_id"),
        "manager": manager,
        "record": {"wins": wins, "losses": losses, "ties": ties},
        "points_for": round(points_for, 2) if points_for else 0,
        "points_against": round(points_against, 2) if points_against else 0,
        "player_ids": player_ids,
        "starters": starters,
        "bench": bench,
        "full_roster": starters + bench,
        "projected_total": round(sum(s["projected_points"] for s in starters), 2),
    }


def _build_player_detail(player_id: str, player: dict, is_starter: bool) -> dict:
    """Build a clean player detail object from raw API data."""
    # Projected points: use projected_pts if available, otherwise estimate from stats
    projected = player.get("projected_pts", 0) or _estimate_projection(player)
    season_points = player.get("stats", {}).get("pts_ppr", 0) or 0
    recent_points = player.get("recent_points", []) or []
    recent_avg = sum(recent_points) / len(recent_points) if recent_points else projected

    return {
        "player_id": player_id,
        "name": player.get("full_name", player.get("search_full_name", "Unknown")),
        "first_name": player.get("first_name", ""),
        "last_name": player.get("last_name", ""),
        "position": player.get("position", "UNK"),
        "team": player.get("team", "FA"),
        "age": player.get("age"),
        "years_exp": player.get("years_exp"),
        "injury_status": player.get("injury_status"),
        "injury_body_part": player.get("injury_body_part"),
        "injury_notes": player.get("injury_notes", ""),
        "bye_week": _get_bye_week(player.get("team")),
        "projected_points": round(projected, 2),
        "season_points": round(season_points, 2),
        "recent_avg": round(recent_avg, 2),
        "recent_points": recent_points,
        "is_starter": is_starter,
        "avatar_id": player.get("avatar_id"),
    }


def _estimate_projection(player: dict) -> float:
    """Estimate projected points when official projections aren't available."""
    stats = player.get("stats", {})
    season_pts = stats.get("pts_ppr", 0) or 0
    # Simple heuristic: use season average as baseline
    return season_pts


def _get_bye_week(team: str) -> int | None:
    """Get the bye week for an NFL team. Returns None for unknown teams."""
    bye_weeks = {
        "ATL": 12, "BUF": 12, "CHI": 12, "CIN": 12, "DAL": 12,
        "DEN": 11, "DET": 11, "GB": 11, "JAX": 11, "KC": 11,
        "NO": 11, "NYJ": 11, "ARI": 10, "CAR": 10, "CLE": 10,
        "HOU": 10, "IND": 10, "MIA": 10, "MIN": 10, "NE": 10,
        "PHI": 10, "PIT": 10, "SF": 9, "SEA": 9, "TB": 9,
        "WAS": 9, "BAL": 9, "LV": 9, "LAC": 9, "NYG": 9,
        "TEN": 9, "RAM": 9,
    }
    return bye_weeks.get(team)


def _find_opponent(matchups: list, my_roster_id: int,
                   all_rosters: list, players_db: dict, roster_to_user: dict) -> dict | None:
    """Find the opponent's roster from the current week's matchups."""
    my_matchup = None
    for matchup in matchups:
        if matchup.get("roster_id") == my_roster_id:
            my_matchup = matchup
            break

    if not my_matchup:
        return None

    # Find the matching matchup (same matchup_id, different roster_id)
    matchup_id = my_matchup.get("matchup_id")
    for matchup in matchups:
        if (matchup.get("matchup_id") == matchup_id and
                matchup.get("roster_id") != my_roster_id):
            opponent_roster_id = matchup.get("roster_id")
            for roster in all_rosters:
                if roster["roster_id"] == opponent_roster_id:
                    return roster
    return None


def _compute_standings(rosters: list) -> list:
    """Compute league standings sorted by record and points."""
    standings = []
    for roster in rosters:
        wins = roster["record"]["wins"]
        losses = roster["record"]["losses"]
        ties = roster["record"]["ties"]
        win_pct = wins / (wins + losses + ties) if (wins + losses + ties) > 0 else 0
        standings.append({
            "roster_id": roster["roster_id"],
            "manager": roster["manager"]["display_name"],
            "record": f"{wins}-{losses}" + (f"-{ties}" if ties > 0 else ""),
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "win_pct": round(win_pct, 3),
            "points_for": roster["points_for"],
            "points_against": roster["points_against"],
            "projected_total": roster["projected_total"],
        })

    # Sort by wins (desc), then points_for (desc)
    standings.sort(key=lambda x: (-x["wins"], -x["points_for"]))
    return standings


def _compute_available_players(players_db: dict, rostered_ids: set) -> list:
    """Compute available free agents (all players minus rostered)."""
    available = []
    for pid, player in players_db.items():
        if pid in rostered_ids:
            continue
        if not player.get("position") or player["position"] not in ("QB", "RB", "WR", "TE", "K", "DEF"):
            continue

        projected = player.get("projected_pts", 0) or _estimate_projection(player)
        if projected <= 0 and player.get("position") not in ("DEF", "K"):
            continue

        detail = _build_player_detail(pid, player, is_starter=False)
        available.append(detail)

    # Sort by projected points descending
    available.sort(key=lambda x: x["projected_points"], reverse=True)
    return available


def _enrich_trending(adds: list, drops: list, players_db: dict) -> dict:
    """Enrich trending add/drop data with player names."""
    def enrich(trend_list):
        result = []
        for item in trend_list:
            pid = str(item.get("player_id", ""))
            player = players_db.get(pid, {})
            result.append({
                "player_id": pid,
                "name": player.get("full_name", "Unknown"),
                "position": player.get("position", ""),
                "team": player.get("team", ""),
                "count": item.get("count", 0),
            })
        return result

    return {
        "adds": enrich(adds),
        "drops": enrich(drops),
    }


def _simplify_scoring(scoring_settings: dict) -> dict:
    """Extract the most relevant scoring settings for display."""
    if not scoring_settings:
        return {}
    return {
        key: value for key, value in scoring_settings.items()
        if key in ("pass_td", "pass_int", "pass_yd", "rush_td", "rush_yd",
                     "rec", "rec_td", "rec_yd", "fg_miss", "fgm_0_19", "fgm_20_29",
                     "fgm_30_39", "fgm_40_49", "fgm_50p", "xpm", "def_td", "def_int",
                     "def_sack", "def_ff", "def_st_ff", "def_kr_td", "def_pr_td",
                     "bonus_pass_yd_300", "bonus_pass_yd_400",
                     "bonus_rush_yd_100", "bonus_rush_yd_200",
                     "bonus_rec_yd_100", "bonus_rec_yd_200")
    }
