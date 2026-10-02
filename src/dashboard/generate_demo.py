"""
Demo Data Generator

Creates realistic fantasy football fixture data for the dashboard.
This allows the project to run and look great without a live Sleeper league.

Run: python -m src.dashboard.generate_demo
"""

import json
import random
from datetime import datetime, timezone
from pathlib import Path

from src.config import config

# ── Realistic NFL Player Names by Position ───────────────────────────────

QBS = [
    ("Josh Allen", "BUF"), ("Patrick Mahomes", "KC"), ("Lamar Jackson", "BAL"),
    ("Joe Burrow", "CIN"), ("Jalen Hurts", "PHI"), ("Dak Prescott", "DAL"),
    ("CJ Stroud", "HOU"), ("Jayden Daniels", "WAS"), ("Jordan Love", "GB"),
    ("Brock Purdy", "SF"), ("Matthew Stafford", "LAR"), ("Tua Tagovailoa", "MIA"),
    ("Kyler Murray", "ARI"), ("Baker Mayfield", "TB"), ("Geno Smith", "SEA"),
    ("Aaron Rodgers", "NYJ"), ("Derek Carr", "NO"), ("Trevor Lawrence", "JAX"),
]

RBS = [
    ("Christian McCaffrey", "SF"), ("Breece Hall", "NYJ"), ("Bijan Robinson", "ATL"),
    ("Jahmyr Gibbs", "DET"), ("Saquon Barkley", "PHI"), ("De'Von Achane", "MIA"),
    ("Jonathan Taylor", "IND"), ("Josh Jacobs", "GB"), ("Kyren Williams", "LAR"),
    ("Isiah Pacheco", "KC"), ("James Cook", "BUF"), ("Rachaad White", "TB"),
    ("D'Andre Swift", "CHI"), ("Aaron Jones", "MIN"), ("David Montgomery", "DET"),
    ("Jaylen Warren", "PIT"), ("Kenneth Walker III", "SEA"), ("Rhamondre Stevenson", "NE"),
    ("Joe Mixon", "HOU"), ("Travis Etienne", "JAX"), ("Alvin Kamara", "NO"),
    ("Najee Harris", "PIT"), ("Brian Robinson Jr.", "WAS"), ("Zamir White", "LV"),
    ("Chuba Hubbard", "CAR"), ("Tyjae Spears", "TEN"), ("Antonio Gibson", "NE"),
    ("Zack Moss", "DEN"), ("Raheem Mostert", "MIA"), ("Tony Pollard", "TEN"),
]

WRS = [
    ("CeeDee Lamb", "DAL"), ("Tyreek Hill", "MIA"), ("Justin Jefferson", "MIN"),
    ("Ja'Marr Chase", "CIN"), ("Cooper Kupp", "LAR"), ("Amon-Ra St. Brown", "DET"),
    ("Puka Nacua", "LAR"), ("Davante Adams", "LV"), ("Mike Evans", "TB"),
    ("Drake London", "ATL"), ("Stefon Diggs", "HOU"), ("Garrett Wilson", "NYJ"),
    ("Chris Olave", "NO"), ("Brandon Aiyuk", "SF"), ("Jaylen Waddle", "MIA"),
    ("Nico Collins", "HOU"), ("DJ Moore", "CHI"), ("Deebo Samuel", "SF"),
    ("Tee Higgins", "CIN"), ("Courtland Sutton", "DEN"), ("DK Metcalf", "SEA"),
    ("Christian Kirk", "JAX"), ("Jordan Addison", "MIN"), ("Zay Flowers", "BAL"),
    ("Marvin Harrison Jr.", "ARI"), ("Rome Odunze", "CHI"), ("Malik Nabers", "NYG"),
    ("Brian Thomas Jr.", "JAX"), ("Ladd McConkey", "LAC"), ("Xavier Worthy", "KC"),
    ("Tank Dell", "HOU"), ("Rashee Rice", "KC"), ("George Pickens", "PIT"),
    ("Khalil Shakir", "BUF"), ("Jaxon Smith-Njigba", "SEA"), ("Romeo Doubs", "GB"),
]

TES = [
    ("Travis Kelce", "KC"), ("Sam LaPorta", "DET"), ("Trey McBride", "ARI"),
    ("Mark Andrews", "BAL"), ("TJ Hockenson", "MIN"), ("Evan Engram", "JAX"),
    ("George Kittle", "SF"), ("Dalton Kincaid", "BUF"), ("Kyle Pitts", "ATL"),
    ("David Njoku", "CLE"), ("Brock Bowers", "LV"), ("Jake Ferguson", "DAL"),
    ("Taysom Hill", "NO"), ("Pat Freiermuth", "PIT"), ("Tyler Conklin", "NYJ"),
    ("Cole Kmet", "CHI"), ("Hunter Henry", "NE"), ("Chig Okonkwo", "TEN"),
]

KS = [
    ("Harrison Butker", "KC"), ("Brandon Aubrey", "DAL"), ("Younghoe Koo", "ATL"),
    ("Justin Tucker", "BAL"), ("Tyler Bass", "BUF"), ("Chris Boswell", "PIT"),
    ("Ka'imi Fairbairn", "HOU"), ("Blake Grupe", "NO"), ("Jason Myers", "SEA"),
    ("Cameron Dicker", "LAC"), ("Younghoe Koo", "ATL"), ("Tyler Lacy", "JAX"),
]

DEFS = [
    ("49ers", "SF"), ("Ravens", "BAL"), ("Browns", "CLE"), ("Cowboys", "DAL"),
    ("Jets", "NYJ"), ("Eagles", "PHI"), ("Steelers", "PIT"), ("Bills", "BUF"),
    ("Chiefs", "KC"), ("Packers", "GB"), ("Texans", "HOU"), ("Dolphins", "MIA"),
    ("Lions", "DET"), ("Seahawks", "SEA"), ("Bengals", "CIN"), ("Saints", "NO"),
]

TEAM_NAMES = [
    "Gridiron Goblins", "End Zone Enforcers", "Touchdown Titans",
    "Red Zone Raiders", "Hail Mary Heroes", "Blitz Brigade",
    "Pocket Passers", "Field Goal Phantoms", "Sack Attack",
    "Dynasty Dragons", "Comeback Kids", "Warriors of Winter",
]


def generate_demo_data() -> dict:
    """Generate a complete set of realistic demo fantasy football data."""
    random.seed(42)  # Reproducible for consistent demos

    season = config.season
    week = 5  # Mid-season for interesting data

    # Generate 12 teams with full rosters
    all_player_ids = []
    all_players = {}
    rostered_ids = set()

    # Assign players to teams
    teams = []
    player_counter = 1000

    # Shuffle player pools
    qbs = QBS[:]
    rbs = RBS[:]
    wrs = WRS[:]
    tes = TES[:]
    ks = KS[:]
    defs = DEFS[:]

    random.shuffle(qbs)
    random.shuffle(rbs)
    random.shuffle(wrs)
    random.shuffle(tes)
    random.shuffle(ks)
    random.shuffle(defs)

    for team_idx in range(12):
        team_name = TEAM_NAMES[team_idx]
        roster_id = team_idx + 1

        # Pick starters: QB, 2x RB, 2x WR, TE, FLEX, K, DEF
        team_qb = qbs[team_idx]
        team_rbs = [rbs[team_idx], rbs[team_idx + 12]]
        team_wrs = [wrs[team_idx], wrs[team_idx + 12]]
        team_te = tes[team_idx]
        team_flex = rbs[team_idx + 24] if team_idx < 6 else wrs[team_idx + 24]
        team_k = ks[team_idx]
        team_def = defs[team_idx]

        # Bench: 5 players (mix of positions)
        bench_qb = qbs[(team_idx + 1) % len(qbs)]
        bench_rbs = rbs[(team_idx + 1) % len(rbs)]
        bench_wrs = wrs[(team_idx + 1) % len(wrs)]
        bench_te = tes[(team_idx + 1) % len(tes)]
        bench_wr2 = wrs[(team_idx + 2) % len(wrs)]
        bench_players = [
            (*bench_qb, "QB"),
            (*bench_rbs, "RB"),
            (*bench_wrs, "WR"),
            (*bench_te, "TE"),
            (*bench_wr2, "WR"),
        ]

        # Generate player IDs and data
        starters_data = []
        bench_data = []
        all_team_player_ids = []

        # Process starters
        for name, team_abbr, pos, slot in [
            (*team_qb, "QB", "QB"),
            (*team_rbs[0], "RB", "RB1"),
            (*team_rbs[1], "RB", "RB2"),
            (*team_wrs[0], "WR", "WR1"),
            (*team_wrs[1], "WR", "WR2"),
            (*team_te, "TE", "TE"),
            (*team_flex, "FLEX", "FLEX"),
            (*team_k, "K", "K"),
            (*team_def, "DEF", "DEF"),
        ]:
            pid = str(player_counter)
            player_counter += 1
            all_team_player_ids.append(pid)
            rostered_ids.add(pid)

            proj = _generate_projection(pos)
            season_pts = _generate_season_points(pos, week, proj)
            recent_pts = _generate_recent_points(season_pts, week)

            player_obj = {
                "player_id": pid,
                "full_name": name,
                "first_name": name.split()[0] if " " in name else name,
                "last_name": name.split()[-1] if " " in name else "",
                "position": pos if pos != "FLEX" else (
                    "RB" if team_flex in RBS else "WR"
                ),
                "team": team_abbr,
                "age": random.randint(22, 34),
                "years_exp": random.randint(1, 12),
                "injury_status": random.choice([
                    None, None, None, None, None, None, None, None,
                    "Questionable", "Active", None, None
                ]),
                "projected_pts": proj,
                "stats": {"pts_ppr": season_pts},
                "recent_points": recent_pts,
            }
            all_players[pid] = player_obj

            detail = {
                "player_id": pid,
                "name": name,
                "position": player_obj["position"],
                "team": team_abbr,
                "projected_points": proj,
                "season_points": season_pts,
                "recent_avg": round(sum(recent_pts) / max(len(recent_pts), 1), 2),
                "recent_points": recent_pts,
                "is_starter": True,
                "injury_status": player_obj["injury_status"],
                "bye_week": _get_bye_week(team_abbr),
            }
            starters_data.append(detail)

        # Process bench
        for name, team_abbr, pos in bench_players:
            pid = str(player_counter)
            player_counter += 1
            all_team_player_ids.append(pid)
            rostered_ids.add(pid)

            proj = _generate_projection(pos) * 0.6  # Bench players score less
            season_pts = _generate_season_points(pos, week, proj)
            recent_pts = _generate_recent_points(season_pts, week)

            player_obj = {
                "player_id": pid,
                "full_name": name,
                "position": pos,
                "team": team_abbr,
                "age": random.randint(22, 34),
                "years_exp": random.randint(1, 12),
                "injury_status": random.choice([None, None, None, None, "Questionable"]),
                "projected_pts": proj,
                "stats": {"pts_ppr": season_pts},
                "recent_points": recent_pts,
            }
            all_players[pid] = player_obj

            detail = {
                "player_id": pid,
                "name": name,
                "position": pos,
                "team": team_abbr,
                "projected_points": round(proj, 2),
                "season_points": season_pts,
                "recent_avg": round(sum(recent_pts) / max(len(recent_pts), 1), 2),
                "recent_points": recent_pts,
                "is_starter": False,
                "injury_status": player_obj["injury_status"],
                "bye_week": _get_bye_week(team_abbr),
            }
            bench_data.append(detail)

        # Generate team record
        wins = random.randint(2, 5)
        losses = week - wins
        points_for = round(random.uniform(400, 700), 2)

        teams.append({
            "roster_id": roster_id,
            "manager": {"display_name": team_name, "avatar_id": None},
            "record": {"wins": wins, "losses": losses, "ties": 0},
            "points_for": points_for,
            "points_against": round(random.uniform(350, 650), 2),
            "player_ids": all_team_player_ids,
            "starters": starters_data,
            "bench": bench_data,
            "full_roster": starters_data + bench_data,
            "projected_total": round(sum(s["projected_points"] for s in starters_data), 2),
        })

    # Generate available free agents (players not on any roster)
    available = []
    fa_qbs = [p for p in qbs if p not in [(t["starters"][0]["name"], t["starters"][0]["team"]) for t in teams]]
    fa_rbs = [p for p in rbs if p not in [(s["name"], s["team"]) for t in teams for s in t["starters"] + t["bench"]]]
    fa_wrs = [p for p in wrs if p not in [(s["name"], s["team"]) for t in teams for s in t["starters"] + t["bench"]]]
    fa_tes = [p for p in tes if p not in [(s["name"], s["team"]) for t in teams for s in t["starters"] + t["bench"]]]

    for name, team_abbr in fa_qbs[:3] + fa_rbs[:15] + fa_wrs[:15] + fa_tes[:5]:
        pid = str(player_counter)
        player_counter += 1
        pos = "QB" if (name, team_abbr) in fa_qbs else "RB" if (name, team_abbr) in fa_rbs else "WR" if (name, team_abbr) in fa_wrs else "TE"
        proj = _generate_projection(pos) * random.uniform(0.3, 0.8)

        player_obj = {
            "player_id": pid,
            "full_name": name,
            "position": pos,
            "team": team_abbr,
            "age": random.randint(22, 32),
            "years_exp": random.randint(1, 8),
            "injury_status": random.choice([None, None, None, "Questionable"]),
            "projected_pts": round(proj, 2),
            "stats": {"pts_ppr": round(proj * week * 0.8, 2)},
            "recent_points": _generate_recent_points(round(proj * week * 0.8, 2), week),
        }
        all_players[pid] = player_obj

    # Generate trending data (deduplicated)
    all_player_ids = list(all_players.keys())
    random.shuffle(all_player_ids)
    trending_add_ids = all_player_ids[:25]
    trending_drop_ids = all_player_ids[25:50] if len(all_player_ids) >= 50 else all_player_ids[:25]
    trending_adds = [
        {"player_id": pid, "count": random.randint(100, 500)}
        for pid in trending_add_ids
    ]
    trending_drops = [
        {"player_id": pid, "count": random.randint(50, 300)}
        for pid in trending_drop_ids
    ]

    # Generate matchups for week 5
    # Team 1 vs Team 2, Team 3 vs Team 4, etc.
    matchups = []
    for i in range(0, 12, 2):
        matchups.append({
            "matchup_id": i // 2 + 1,
            "roster_id": i + 1,
            "starters": [p["player_id"] for p in teams[i]["starters"]],
            "points": round(random.uniform(80, 130), 2),
        })
        matchups.append({
            "matchup_id": i // 2 + 1,
            "roster_id": i + 2,
            "starters": [p["player_id"] for p in teams[i + 1]["starters"]],
            "points": round(random.uniform(80, 130), 2),
        })

    return {
        "meta": {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "season": season,
            "week": week,
            "season_type": "regular",
            "league_id": "demo-league-2026",
            "league_name": "Demo Fantasy League",
            "api_calls": 0,
        },
        "league": {
            "name": "Demo Fantasy League",
            "season": season,
            "week": week,
            "scoring_type": "ppr",
            "roster_positions": config.roster_positions,
            "total_rosters": 12,
            "scoring_settings": {"pass_td": 4, "pass_yd": 0.04, "pass_int": -2,
                                  "rush_td": 6, "rush_yd": 0.1, "rec": 0.5,
                                  "rec_td": 6, "rec_yd": 0.1},
        },
        "rosters": [
            {
                "roster_id": t["roster_id"],
                "owner_id": str(t["roster_id"]),
                "wins": t["record"]["wins"],
                "losses": t["record"]["losses"],
                "ties": t["record"]["ties"],
                "fpts": t["points_for"],
                "fpts_decimal": t["points_against"],
                "players": t["player_ids"],
                "starters": [s["player_id"] for s in t["starters"]],
            }
            for t in teams
        ],
        "users": [
            {"user_id": str(t["roster_id"]), "display_name": t["manager"]["display_name"], "avatar": None}
            for t in teams
        ],
        "matchups": matchups,
        "players": all_players,
        "trending_adds": trending_adds,
        "trending_drops": trending_drops,
        "transactions": [],
    }


def _generate_projection(position: str) -> float:
    """Generate a realistic projected point value for a position."""
    ranges = {
        "QB": (14, 28),
        "RB": (5, 22),
        "WR": (4, 20),
        "TE": (3, 14),
        "K": (5, 12),
        "DEF": (3, 12),
    }
    low, high = ranges.get(position, (5, 15))
    return round(random.uniform(low, high), 2)


def _generate_season_points(position: str, week: int, projection: float) -> float:
    """Generate season-to-date points based on position and current week."""
    # Season points should roughly equal weekly average * weeks played
    avg = projection * random.uniform(0.8, 1.2)
    return round(avg * week, 2)


def _generate_recent_points(season_points: float, week: int) -> list:
    """Generate recent weekly point totals (last 3 weeks)."""
    avg = season_points / max(week, 1)
    recent = []
    for _ in range(min(3, week)):
        variance = random.uniform(-5, 5)
        recent.append(round(max(0, avg + variance), 2))
    return recent


def _get_bye_week(team: str) -> int | None:
    """Get the bye week for an NFL team."""
    bye_weeks = {
        "ATL": 12, "BUF": 12, "CHI": 12, "CIN": 12, "DAL": 12,
        "DEN": 11, "DET": 11, "GB": 11, "JAX": 11, "KC": 11,
        "NO": 11, "NYJ": 11, "ARI": 10, "CAR": 10, "CLE": 10,
        "HOU": 10, "IND": 10, "MIA": 10, "MIN": 10, "NE": 10,
        "PHI": 10, "PIT": 10, "SF": 9, "SEA": 9, "TB": 9,
        "WAS": 9, "BAL": 9, "LV": 9, "LAC": 9, "NYG": 9,
        "TEN": 9, "LAR": 9,
    }
    return bye_weeks.get(team)


def save_demo_data():
    """Generate and save demo data to the configured path."""
    data = generate_demo_data()
    config.demo_data_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config.demo_data_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Demo data saved to: {config.demo_data_path}")
    print(f"  {len(data['rosters'])} teams, {len(data['players'])} players")
    return data


if __name__ == "__main__":
    save_demo_data()
