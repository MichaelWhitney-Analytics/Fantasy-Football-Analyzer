"""
Tests for the analysis engine (waiver edge, matchup analysis, lineup optimizer).

Run: python -m pytest tests/ -v
"""

import sys
from pathlib import Path

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.pipeline.analyze import (
    analyze_waiver_edge,
    analyze_matchup,
    optimize_lineup,
    analyze_trends,
    generate_insights,
    _get_comparable_positions,
    _get_drop_reason,
)
from tests.fixtures.sample_data import (
    get_sample_my_team,
    get_sample_available_players,
    get_sample_opponent,
    get_sample_trending,
)


# ── Waiver Edge Tests ────────────────────────────────────────────────────

class TestWaiverEdge:
    """Tests for the waiver wire edge analysis."""

    def test_returns_ranked_recommendations(self):
        """Waiver edge should return a ranked list of recommendations."""
        team = get_sample_my_team()
        available = get_sample_available_players()
        trending = get_sample_trending()

        results = analyze_waiver_edge(team, available, trending)

        assert len(results) > 0
        assert results[0]["rank"] == 1
        # Should be sorted by edge_value descending
        for i in range(len(results) - 1):
            assert results[i]["edge_value"] >= results[i + 1]["edge_value"]

    def test_each_recommendation_has_required_fields(self):
        """Each recommendation should have player, drop_suggestion, edge_value, and analysis."""
        team = get_sample_my_team()
        available = get_sample_available_players()
        trending = get_sample_trending()

        results = analyze_waiver_edge(team, available, trending)

        for rec in results:
            assert "player" in rec
            assert "name" in rec["player"]
            assert "position" in rec["player"]
            assert "projected_points" in rec["player"]
            assert "drop_suggestion" in rec
            assert "name" in rec["drop_suggestion"]
            assert "reason" in rec["drop_suggestion"]
            assert "edge_value" in rec
            assert "analysis" in rec
            assert "rank" in rec

    def test_edge_threshold_filtering(self):
        """Recommendations below the edge threshold should not appear."""
        from src.config import config
        team = get_sample_my_team()
        # Create available players with very low projections
        low_players = [
            {"player_id": "999", "name": "Scrub Player", "position": "RB", "team": "FA",
             "projected_points": 0.5, "season_points": 2.0, "recent_avg": 0.5,
             "recent_points": [0, 1, 0], "is_starter": False, "injury_status": None, "bye_week": None},
        ]
        trending = get_sample_trending()

        results = analyze_waiver_edge(team, low_players, trending)
        # A player with 0.5 projected points should not beat the edge threshold
        for rec in results:
            assert rec["edge_value"] >= config.waiver_edge_threshold

    def test_empty_team_returns_empty_list(self):
        """An empty team should return an empty recommendation list."""
        results = analyze_waiver_edge({}, get_sample_available_players(), get_sample_trending())
        assert results == []

    def test_trending_bonus_applied(self):
        """Players in the trending adds list should get a trend bonus."""
        team = get_sample_my_team()
        available = get_sample_available_players()
        trending = get_sample_trending()

        results = analyze_waiver_edge(team, available, trending)

        # At least one trending player should be flagged
        trending_found = any(rec["trending"] for rec in results)
        # If Joe Flacco (player_id 100) is in results and trending, it should be flagged
        for rec in results:
            if rec["player"]["name"] == "Joe Flacco":
                assert rec["trending"] is True


# ── Matchup Analysis Tests ────────────────────────────────────────────────

class TestMatchupAnalysis:
    """Tests for the matchup analysis module."""

    def test_matchup_with_opponent(self):
        """Matchup analysis should return position comparisons and win probability."""
        my_team = get_sample_my_team()
        opponent = get_sample_opponent()

        result = analyze_matchup(my_team, opponent)

        assert result["available"] is True
        assert "my_projected" in result
        assert "opp_projected" in result
        assert "win_probability" in result
        assert "position_comparison" in result
        assert 0 <= result["win_probability"] <= 100

    def test_matchup_without_opponent(self):
        """When no opponent is available, should return unavailable status."""
        my_team = get_sample_my_team()

        result = analyze_matchup(my_team, None)

        assert result["available"] is False
        assert "message" in result

    def test_win_probability_range(self):
        """Win probability should be between 0 and 100."""
        my_team = get_sample_my_team()
        opponent = get_sample_opponent()

        result = analyze_matchup(my_team, opponent)

        assert 0 <= result["win_probability"] <= 100

    def test_position_comparison_structure(self):
        """Each position comparison should have both teams' players and edge info."""
        my_team = get_sample_my_team()
        opponent = get_sample_opponent()

        result = analyze_matchup(my_team, opponent)

        for comp in result["position_comparison"]:
            assert "position" in comp
            assert "my_players" in comp
            assert "opp_players" in comp
            assert "my_projected" in comp
            assert "opp_projected" in comp
            assert "difference" in comp
            assert "advantage" in comp
            assert comp["advantage"] in ("mine", "opponent", "even")


# ── Lineup Optimizer Tests ────────────────────────────────────────────────

class TestLineupOptimizer:
    """Tests for the optimal lineup optimizer."""

    def test_returns_suggested_lineup(self):
        """Optimizer should return a suggested lineup with projected total."""
        my_team = get_sample_my_team()

        # Build full_roster from starters + bench
        my_team["full_roster"] = my_team["starters"] + my_team["bench"]

        result = optimize_lineup(my_team)

        assert result["available"] is True
        assert "suggested_lineup" in result
        assert "projected_total" in result
        assert len(result["suggested_lineup"]) > 0

    def test_optimal_lineup_is_higher_or_equal(self):
        """Optimal lineup should project >= current lineup points."""
        my_team = get_sample_my_team()
        my_team["full_roster"] = my_team["starters"] + my_team["bench"]

        result = optimize_lineup(my_team)

        assert result["projected_total"] >= result["current_total"] - 0.01

    def test_changes_listed(self):
        """If lineup changes are suggested, they should include reasoning."""
        my_team = get_sample_my_team()
        my_team["full_roster"] = my_team["starters"] + my_team["bench"]

        result = optimize_lineup(my_team)

        for change in result["changes"]:
            assert "player" in change
            assert "position" in change
            assert "replaces" in change
            assert "reason" in change
            assert "replaces" not in change or change["replaces"] != "N/A"


# ── Helper Function Tests ────────────────────────────────────────────────

class TestHelperFunctions:
    """Tests for utility functions in the analysis module."""

    def test_get_comparable_positions(self):
        """RB, WR, TE should return all three as comparable (FLEX-eligible)."""
        assert _get_comparable_positions("RB") == ["RB", "WR", "TE"]
        assert _get_comparable_positions("WR") == ["RB", "WR", "TE"]
        assert _get_comparable_positions("TE") == ["RB", "WR", "TE"]
        assert _get_comparable_positions("QB") == ["QB"]
        assert _get_comparable_positions("K") == ["K"]

    def test_get_drop_reason(self):
        """Drop reason should mention the point difference."""
        drop_player = {"name": "Bench Player", "position": "RB",
                      "projected_points": 5.0, "injury_status": None}
        add_player = {"name": "Free Agent", "position": "RB",
                     "projected_points": 15.0}

        reason = _get_drop_reason(drop_player, add_player)
        assert "10.0" in reason  # 15 - 5 = 10

    def test_get_drop_reason_with_injury(self):
        """Drop reason should mention injury if the drop player is injured."""
        drop_player = {"name": "Injured Player", "position": "RB",
                      "projected_points": 5.0, "injury_status": "Questionable"}
        add_player = {"name": "Free Agent", "position": "RB",
                     "projected_points": 15.0}

        reason = _get_drop_reason(drop_player, add_player)
        assert "Questionable" in reason or "injury" in reason.lower()


# ── Trends Analysis Tests ─────────────────────────────────────────────────

class TestTrendsAnalysis:
    """Tests for the player trends analysis."""

    def test_trends_returns_players(self):
        """Trends analysis should return player trend data."""
        my_team = get_sample_my_team()
        my_team["full_roster"] = my_team["starters"] + my_team["bench"]
        trending = get_sample_trending()

        result = analyze_trends(my_team, trending)

        assert "players" in result
        assert len(result["players"]) > 0

    def test_trend_labels(self):
        """Each player should have a trend label."""
        my_team = get_sample_my_team()
        my_team["full_roster"] = my_team["starters"] + my_team["bench"]
        trending = get_sample_trending()

        result = analyze_trends(my_team, trending)

        for player in result["players"]:
            assert player["trend"] in ("hot", "cold", "stable")
            assert "trend_label" in player


# ── Insights Tests ───────────────────────────────────────────────────────

class TestInsights:
    """Tests for the insights generation."""

    def test_insights_generated(self):
        """Insights should be generated from team data."""
        my_team = get_sample_my_team()
        opponent = get_sample_opponent()
        standings = [
            {"roster_id": 1, "manager": "Test Team", "record": "3-2", "wins": 3,
             "losses": 2, "ties": 0, "win_pct": 0.6, "points_for": 450.5,
             "points_against": 380.2, "projected_total": 132.0},
        ]
        league = {"name": "Test League", "week": 5, "season": "2026"}

        insights = generate_insights(my_team, opponent, [], standings, league)

        assert len(insights) > 0
        for insight in insights:
            assert "type" in insight
            assert "title" in insight
            assert "message" in insight
