"""
Test fixtures for the analysis engine.
Contains sample league data for unit testing waiver edge, matchup, and lineup analysis.
"""

import json
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    """Load a JSON fixture file from the fixtures directory."""
    path = FIXTURES_DIR / f"{name}.json"
    with open(path, "r") as f:
        return json.load(f)


def get_sample_my_team() -> dict:
    """Return a sample team for testing."""
    return {
        "roster_id": 1,
        "manager": {"display_name": "Test Team", "avatar_id": None},
        "record": {"wins": 3, "losses": 2, "ties": 0},
        "points_for": 450.5,
        "points_against": 380.2,
        "player_ids": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
        "starters": [
            {"player_id": "1", "name": "Josh Allen", "position": "QB", "team": "BUF",
             "projected_points": 22.5, "season_points": 95.0, "recent_avg": 24.0,
             "recent_points": [20, 25, 27], "is_starter": True, "injury_status": None, "bye_week": 12},
            {"player_id": "2", "name": "Christian McCaffrey", "position": "RB", "team": "SF",
             "projected_points": 18.0, "season_points": 80.0, "recent_avg": 19.0,
             "recent_points": [17, 20, 20], "is_starter": True, "injury_status": None, "bye_week": 9},
            {"player_id": "3", "name": "Breece Hall", "position": "RB", "team": "NYJ",
             "projected_points": 15.0, "season_points": 65.0, "recent_avg": 14.0,
             "recent_points": [12, 15, 15], "is_starter": True, "injury_status": None, "bye_week": 12},
            {"player_id": "4", "name": "CeeDee Lamb", "position": "WR", "team": "DAL",
             "projected_points": 16.5, "season_points": 70.0, "recent_avg": 17.0,
             "recent_points": [15, 18, 18], "is_starter": True, "injury_status": None, "bye_week": 7},
            {"player_id": "5", "name": "Justin Jefferson", "position": "WR", "team": "MIN",
             "projected_points": 17.0, "season_points": 75.0, "recent_avg": 18.0,
             "recent_points": [16, 19, 19], "is_starter": True, "injury_status": None, "bye_week": 6},
            {"player_id": "6", "name": "Travis Kelce", "position": "TE", "team": "KC",
             "projected_points": 12.0, "season_points": 50.0, "recent_avg": 11.0,
             "recent_points": [10, 12, 11], "is_starter": True, "injury_status": None, "bye_week": 10},
            {"player_id": "7", "name": "Davante Adams", "position": "WR", "team": "LV",
             "projected_points": 14.0, "season_points": 60.0, "recent_avg": 13.0,
             "recent_points": [12, 14, 13], "is_starter": True, "injury_status": None, "bye_week": 10},
            {"player_id": "8", "name": "Harrison Butker", "position": "K", "team": "KC",
             "projected_points": 9.0, "season_points": 40.0, "recent_avg": 8.5,
             "recent_points": [7, 9, 9], "is_starter": True, "injury_status": None, "bye_week": 10},
            {"player_id": "9", "name": "49ers", "position": "DEF", "team": "SF",
             "projected_points": 8.0, "season_points": 35.0, "recent_avg": 7.5,
             "recent_points": [6, 8, 8], "is_starter": True, "injury_status": None, "bye_week": 9},
        ],
        "bench": [
            {"player_id": "10", "name": "Baker Mayfield", "position": "QB", "team": "TB",
             "projected_points": 15.0, "season_points": 60.0, "recent_avg": 14.0,
             "recent_points": [12, 15, 15], "is_starter": False, "injury_status": None, "bye_week": 11},
            {"player_id": "11", "name": "Jaylen Warren", "position": "RB", "team": "PIT",
             "projected_points": 8.0, "season_points": 30.0, "recent_avg": 7.0,
             "recent_points": [6, 8, 7], "is_starter": False, "injury_status": None, "bye_week": 9},
            {"player_id": "12", "name": "Khalil Shakir", "position": "WR", "team": "BUF",
             "projected_points": 6.0, "season_points": 25.0, "recent_avg": 5.5,
             "recent_points": [4, 6, 6], "is_starter": False, "injury_status": None, "bye_week": 12},
            {"player_id": "13", "name": "Cole Kmet", "position": "TE", "team": "CHI",
             "projected_points": 5.0, "season_points": 20.0, "recent_avg": 4.5,
             "recent_points": [3, 5, 5], "is_starter": False, "injury_status": None, "bye_week": 7},
            {"player_id": "14", "name": "Deebo Samuel", "position": "WR", "team": "SF",
             "projected_points": 7.0, "season_points": 28.0, "recent_avg": 6.5,
             "recent_points": [5, 7, 7], "is_starter": False, "injury_status": "Questionable", "bye_week": 9},
        ],
        "full_roster": [],  # Will be built from starters + bench
        "projected_total": 132.0,
    }


def get_sample_available_players() -> list:
    """Return sample available free agents for testing."""
    return [
        {"player_id": "100", "name": "Joe Flacco", "position": "QB", "team": "IND",
         "projected_points": 18.0, "season_points": 45.0, "recent_avg": 17.0,
         "recent_points": [15, 18, 18], "is_starter": False, "injury_status": None, "bye_week": 14},
        {"player_id": "101", "name": "Antonio Gibson", "position": "RB", "team": "NE",
         "projected_points": 12.0, "season_points": 40.0, "recent_avg": 11.0,
         "recent_points": [9, 12, 12], "is_starter": False, "injury_status": None, "bye_week": 14},
        {"player_id": "102", "name": "Romeo Doubs", "position": "WR", "team": "GB",
         "projected_points": 11.0, "season_points": 35.0, "recent_avg": 10.0,
         "recent_points": [8, 11, 11], "is_starter": False, "injury_status": None, "bye_week": 10},
        {"player_id": "103", "name": "Chig Okonkwo", "position": "TE", "team": "TEN",
         "projected_points": 8.0, "season_points": 25.0, "recent_avg": 7.5,
         "recent_points": [6, 8, 8], "is_starter": False, "injury_status": None, "bye_week": 5},
        {"player_id": "104", "name": "Tyler Lacy", "position": "K", "team": "JAX",
         "projected_points": 8.0, "season_points": 30.0, "recent_avg": 7.5,
         "recent_points": [6, 8, 8], "is_starter": False, "injury_status": None, "bye_week": None},
    ]


def get_sample_opponent() -> dict:
    """Return a sample opponent team for matchup testing."""
    return {
        "roster_id": 2,
        "manager": {"display_name": "Rival Team", "avatar_id": None},
        "record": {"wins": 4, "losses": 1, "ties": 0},
        "points_for": 480.0,
        "points_against": 350.0,
        "starters": [
            {"player_id": "20", "name": "Patrick Mahomes", "position": "QB", "team": "KC",
             "projected_points": 20.0, "season_points": 90.0, "recent_avg": 21.0,
             "recent_points": [18, 22, 23], "is_starter": True, "injury_status": None, "bye_week": 10},
            {"player_id": "21", "name": "Saquon Barkley", "position": "RB", "team": "PHI",
             "projected_points": 17.0, "season_points": 75.0, "recent_avg": 16.0,
             "recent_points": [14, 17, 17], "is_starter": True, "injury_status": None, "bye_week": 5},
            {"player_id": "22", "name": "Bijan Robinson", "position": "RB", "team": "ATL",
             "projected_points": 14.0, "season_points": 60.0, "recent_avg": 13.0,
             "recent_points": [11, 14, 14], "is_starter": True, "injury_status": None, "bye_week": 12},
            {"player_id": "23", "name": "Tyreek Hill", "position": "WR", "team": "MIA",
             "projected_points": 15.0, "season_points": 68.0, "recent_avg": 16.0,
             "recent_points": [14, 17, 17], "is_starter": True, "injury_status": None, "bye_week": 6},
            {"player_id": "24", "name": "Ja'Marr Chase", "position": "WR", "team": "CIN",
             "projected_points": 16.0, "season_points": 72.0, "recent_avg": 15.0,
             "recent_points": [13, 16, 16], "is_starter": True, "injury_status": None, "bye_week": 12},
            {"player_id": "25", "name": "Sam LaPorta", "position": "TE", "team": "DET",
             "projected_points": 10.0, "season_points": 42.0, "recent_avg": 9.0,
             "recent_points": [8, 10, 9], "is_starter": True, "injury_status": None, "bye_week": 5},
            {"player_id": "26", "name": "Puka Nacua", "position": "WR", "team": "LAR",
             "projected_points": 13.0, "season_points": 55.0, "recent_avg": 12.0,
             "recent_points": [10, 13, 13], "is_starter": True, "injury_status": None, "bye_week": 6},
            {"player_id": "27", "name": "Justin Tucker", "position": "K", "team": "BAL",
             "projected_points": 8.5, "season_points": 38.0, "recent_avg": 8.0,
             "recent_points": [7, 9, 8], "is_starter": True, "injury_status": None, "bye_week": 14},
            {"player_id": "28", "name": "Ravens", "position": "DEF", "team": "BAL",
             "projected_points": 7.0, "season_points": 32.0, "recent_avg": 6.5,
             "recent_points": [5, 7, 7], "is_starter": True, "injury_status": None, "bye_week": 14},
        ],
        "bench": [],
        "full_roster": [],
        "projected_total": 121.5,
    }


def get_sample_trending() -> dict:
    """Return sample trending data for testing."""
    return {
        "adds": [
            {"player_id": "100", "name": "Joe Flacco", "position": "QB", "team": "IND", "count": 450},
            {"player_id": "101", "name": "Antonio Gibson", "position": "RB", "team": "NE", "count": 320},
        ],
        "drops": [
            {"player_id": "200", "name": "Deshaun Watson", "position": "QB", "team": "CLE", "count": 280},
        ],
    }
