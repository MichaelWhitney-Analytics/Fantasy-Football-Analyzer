"""
Sleeper API Client

A lightweight wrapper around the Sleeper public API (https://docs.sleeper.app).
The API is read-only, free, and requires no authentication — just a league ID.

Rate limit: Stay under 1000 calls/minute to avoid IP blocks.
All endpoints return JSON.
"""

import json
import time
import urllib.request
import urllib.error
from pathlib import Path

from src.config import config


class SleeperAPIError(Exception):
    """Raised when the Sleeper API returns an error or invalid response."""
    pass


class SleeperClient:
    """Client for the Sleeper Fantasy Football public API."""

    def __init__(self, base_url: str = None, timeout: int = None):
        self.base_url = base_url or config.base_url
        self.timeout = timeout or config.request_timeout
        self._call_count = 0
        self._last_call_time = 0
        self._players_cache: dict = None
        self._players_cache_path = config.data_dir / "player_cache.json"

    # ── Low-level HTTP ────────────────────────────────────────────────────

    def _get(self, endpoint: str) -> dict | list:
        """
        Make a GET request to the Sleeper API.

        Args:
            endpoint: API path relative to base_url (e.g., '/user/username')

        Returns:
            Parsed JSON response (dict or list)

        Raises:
            SleeperAPIError: On HTTP errors or invalid JSON
        """
        url = f"{self.base_url}{endpoint}"

        # Simple rate limiting: ensure at least 67ms between calls (900/min)
        elapsed = time.time() - self._last_call_time
        if elapsed < 0.067:
            time.sleep(0.067 - elapsed)

        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "FantasyFootballPipeline/1.0",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
                self._call_count += 1
                self._last_call_time = time.time()
                return data
        except urllib.error.HTTPError as e:
            raise SleeperAPIError(f"HTTP {e.code}: {e.reason} for {endpoint}")
        except urllib.error.URLError as e:
            raise SleeperAPIError(f"URL Error: {e.reason} for {endpoint}")
        except json.JSONDecodeError:
            raise SleeperAPIError(f"Invalid JSON response from {endpoint}")

    # ── User & League Endpoints ──────────────────────────────────────────

    def get_user(self, username: str) -> dict:
        """
        Get user info by username.

        GET /v1/user/<username>
        Returns: { user_id, username, display_name, avatar, ... }
        """
        return self._get(f"/user/{username}")

    def get_user_leagues(self, user_id: str, season: str = None) -> list:
        """
        Get all leagues for a user in a given season.

        GET /v1/user/<user_id>/leagues/nfl/<season>
        Returns: List of league objects
        """
        season = season or config.season
        return self._get(f"/user/{user_id}/leagues/nfl/{season}")

    def get_league(self, league_id: str = None) -> dict:
        """
        Get league settings and metadata.

        GET /v1/league/<league_id>
        Returns: League settings including scoring, roster positions, etc.
        """
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}")

    def get_rosters(self, league_id: str = None) -> list:
        """
        Get all rosters in a league.

        GET /v1/league/<league_id>/rosters
        Returns: List of roster objects with players, starters, wins/losses
        """
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}/rosters")

    def get_league_users(self, league_id: str = None) -> list:
        """
        Get all users/managers in a league.

        GET /v1/league/<league_id>/users
        Returns: List of user objects with display_name, avatar, etc.
        """
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}/users")

    def get_matchups(self, week: int, league_id: str = None) -> list:
        """
        Get matchups for a specific week.

        GET /v1/league/<league_id>/matchups/<week>
        Returns: List of matchup objects with roster_id, starters, points
        """
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}/matchups/{week}")

    def get_transactions(self, round: int, league_id: str = None) -> list:
        """
        Get transactions (waivers, trades, free agent adds) for a given round.

        GET /v1/league/<league_id>/transactions/<round>
        Returns: List of transaction objects
        """
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}/transactions/{round}")

    def get_traded_picks(self, league_id: str = None) -> list:
        """
        Get all traded picks in a league.

        GET /v1/league/<league_id>/traded_picks
        """
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}/traded_picks")

    def get_winners_bracket(self, league_id: str = None) -> list:
        """Get the playoff winners bracket."""
        league_id = league_id or config.league_id
        return self._get(f"/league/{league_id}/winners_bracket")

    # ── NFL State & Players ──────────────────────────────────────────────

    def get_nfl_state(self) -> dict:
        """
        Get current NFL season state.

        GET /v1/state/nfl
        Returns: { season, week, season_type, ... }
        """
        return self._get("/state/nfl")

    def get_all_players(self, use_cache: bool = True) -> dict:
        """
        Get the full NFL player database (~5MB).

        GET /v1/players/nfl
        Returns: Dict of player_id -> player info

        This response is large (~5MB) and changes infrequently.
        When use_cache=True, caches to disk and reuses on subsequent calls.
        """
        if use_cache and self._players_cache is not None:
            return self._players_cache

        if use_cache and self._players_cache_path.exists():
            with open(self._players_cache_path, "r") as f:
                self._players_cache = json.load(f)
                return self._players_cache

        players = self._get("/players/nfl")

        if use_cache:
            self._players_cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._players_cache_path, "w") as f:
                json.dump(players, f)
            self._players_cache = players

        return players

    def get_trending_players(self, trend_type: str = "add",
                              lookback_hours: int = 24, limit: int = 25) -> list:
        """
        Get trending players by add or drop activity.

        GET /v1/players/nfl/trending/<add|drop>?lookback_hours=<hours>&limit=<limit>
        Returns: List of { player_id, count } sorted by popularity
        """
        if trend_type not in ("add", "drop"):
            raise ValueError("trend_type must be 'add' or 'drop'")
        return self._get(
            f"/players/nfl/trending/{trend_type}"
            f"?lookback_hours={lookback_hours}&limit={limit}"
        )

    # ── Utility ──────────────────────────────────────────────────────────

    def get_call_count(self) -> int:
        """Return the total number of API calls made this session."""
        return self._call_count

    def clear_cache(self):
        """Clear the in-memory player cache (disk cache is preserved)."""
        self._players_cache = None
