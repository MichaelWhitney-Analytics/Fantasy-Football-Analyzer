"""
Configuration module for the Fantasy Football Pipeline.

All settings can be overridden via environment variables, making it
easy to run locally (with a .env file) or in CI (GitHub Actions secrets).
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    """Pipeline configuration loaded from environment variables."""

    # ── Sleeper API Settings ──────────────────────────────────────────────
    sleeper_username: str = os.getenv("SLEEPER_USERNAME", "")
    league_id: str = os.getenv("SLEEPER_LEAGUE_ID", "")
    season: str = os.getenv("NFL_SEASON", "2026")

    # ── Scoring & Roster ──────────────────────────────────────────────────
    scoring_type: str = os.getenv("SCORING_TYPE", "ppr")  # ppr, half, standard
    # Default roster positions for a standard Sleeper league
    roster_positions: list = field(default_factory=lambda: [
        "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF",
        "BN", "BN", "BN", "BN", "BN", "BN",
    ])

    # ── Paths ──────────────────────────────────────────────────────────────
    project_root: Path = Path(__file__).resolve().parent.parent
    data_dir: Path = project_root / "data"
    docs_dir: Path = project_root / "docs"
    snapshots_dir: Path = data_dir / "snapshots"
    demo_data_path: Path = data_dir / "demo" / "league_data.json"

    # ── API Settings ──────────────────────────────────────────────────────
    base_url: str = "https://api.sleeper.app/v1"
    rate_limit_calls: int = 900  # Stay under 1000/min per Sleeper docs
    request_timeout: int = 30    # Seconds

    # ── Dashboard Settings ─────────────────────────────────────────────────
    # When True, uses demo data instead of live API calls
    demo_mode: bool = os.getenv("DEMO_MODE", "true").lower() == "true"
    # When True, sanitizes player/team names for public display
    sanitize_output: bool = os.getenv("SANITIZE_OUTPUT", "true").lower() == "true"

    # ── Analysis Settings ──────────────────────────────────────────────────
    # Weight for recent form (last 3 weeks) vs season average in projections
    recent_form_weight: float = 0.35
    season_avg_weight: float = 0.65
    # Minimum projected point improvement to recommend a waiver add
    waiver_edge_threshold: float = 1.5

    def get_output_path(self) -> Path:
        """Return the path for the dashboard data output."""
        return self.docs_dir / "data.json"

    def ensure_dirs(self):
        """Create all required directories if they don't exist."""
        for path in [self.data_dir, self.docs_dir, self.snapshots_dir,
                     self.docs_dir / "assets"]:
            Path(path).mkdir(parents=True, exist_ok=True)


# Singleton instance
config = Config()
