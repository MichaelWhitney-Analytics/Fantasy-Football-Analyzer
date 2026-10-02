"""
Fetch Module — Pulls all data from the Sleeper API.

Orchestrates the full data collection process:
1. Resolve NFL state (current week, season)
2. Get league settings, rosters, users, matchups
3. Get all NFL players (cached)
4. Get trending adds/drops
5. Get recent transactions

All raw data is returned as a dictionary for the transform module.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from src.config import config
from src.api.sleeper_client import SleeperClient


def fetch_all(client: SleeperClient = None) -> dict:
    """
    Fetch all required data from the Sleeper API.

    Args:
        client: SleeperClient instance (created if not provided)

    Returns:
        dict with keys:
            - meta: { fetched_at, season, week, season_type, league_id }
            - league: League settings object
            - rosters: List of roster objects
            - users: List of user/manager objects
            - matchups: List of matchup objects for current week
            - players: Dict of player_id -> player info
            - trending_adds: List of trending add objects
            - trending_drops: List of trending drop objects
            - transactions: List of recent transactions
    """
    client = client or SleeperClient()

    # 1. NFL State — determine current week and season
    nfl_state = client.get_nfl_state()
    current_week = nfl_state.get("week", 1)
    season = nfl_state.get("season", config.season)
    season_type = nfl_state.get("season_type", "regular")

    print(f"  NFL State: Season {season}, Week {current_week} ({season_type})")

    # 1b. Resolve user ID from username (for team selection)
    user_id = None
    if config.sleeper_username:
        try:
            user = client.get_user(config.sleeper_username)
            user_id = user.get("user_id")
            print(f"  User: {user.get('display_name', config.sleeper_username)} ({user_id})")
        except Exception as e:
            print(f"  User resolution failed: {e}")

    # 2. League data
    league = client.get_league()
    league_id = league.get("league_id", config.league_id)

    print(f"  League: {league.get('name', 'Unknown')} ({league_id})")

    # 3. Rosters — all teams' rosters
    rosters = client.get_rosters()
    print(f"  Rosters: {len(rosters)} teams")

    # 4. Users — manager info (display names, avatars)
    users = client.get_league_users()
    print(f"  Managers: {len(users)}")

    # 5. Matchups for current week
    matchups = client.get_matchups(current_week) if season_type == "regular" else []
    print(f"  Matchups (Week {current_week}): {len(matchups)}")

    # 6. All NFL players (cached)
    players = client.get_all_players()
    print(f"  Players: {len(players)} total")

    # 7. Trending adds and drops
    trending_adds = client.get_trending_players("add", lookback_hours=24, limit=25)
    trending_drops = client.get_trending_players("drop", lookback_hours=24, limit=25)
    print(f"  Trending: {len(trending_adds)} adds, {len(trending_drops)} drops")

    # 8. Recent transactions (current week)
    transactions = []
    if season_type == "regular":
        try:
            transactions = client.get_transactions(current_week)
            print(f"  Transactions (Week {current_week}): {len(transactions)}")
        except Exception as e:
            print(f"  Transactions: Skipped ({e})")

    print(f"  Total API calls: {client.get_call_count()}")

    return {
        "meta": {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "season": season,
            "week": current_week,
            "season_type": season_type,
            "league_id": league_id,
            "league_name": league.get("name", ""),
            "api_calls": client.get_call_count(),
            "user_id": user_id,
        },
        "league": league,
        "rosters": rosters,
        "users": users,
        "matchups": matchups,
        "players": players,
        "trending_adds": trending_adds,
        "trending_drops": trending_drops,
        "transactions": transactions,
    }


def fetch_demo() -> dict:
    """
    Load demo data from a local JSON file for development/testing.

    This allows the dashboard to render without making live API calls,
    which is essential for:
    - Local development without a league ID
    - CI/CD pipeline testing
    - Public demo deployment for recruiters
    """
    demo_path = config.demo_data_path
    if not demo_path.exists():
        raise FileNotFoundError(
            f"Demo data not found at {demo_path}. "
            "Run 'python -m src.dashboard.generate_demo' to create it."
        )

    with open(demo_path, "r") as f:
        data = json.load(f)

    print(f"  Loaded demo data from {demo_path}")
    print(f"  Season {data['meta']['season']}, Week {data['meta']['week']}")
    print(f"  {len(data['rosters'])} teams, {len(data['players'])} players")

    return data


def save_raw_snapshot(data: dict):
    """Save a timestamped snapshot of the raw API response for historical analysis."""
    snapshots_dir = config.snapshots_dir
    snapshots_dir.mkdir(parents=True, exist_ok=True)

    timestamp = data["meta"]["fetched_at"].replace(":", "-").replace(".", "-")
    snapshot_path = snapshots_dir / f"snapshot_{timestamp}.json"

    with open(snapshot_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"  Snapshot saved: {snapshot_path}")
    return snapshot_path
