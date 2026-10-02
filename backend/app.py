import os
import time
from collections import defaultdict
from typing import Any

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "https://michaelwhitney-analytics.github.io",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            ]
        }
    },
)

SLEEPER_API_BASE = "https://api.sleeper.app/v1"
CACHE_TTL_SECONDS = 300
cache: dict[str, tuple[float, dict[str, Any]]] = {}


class UpstreamError(RuntimeError):
    pass


def sleeper_get(path: str) -> Any:
    response = requests.get(
        f"{SLEEPER_API_BASE}{path}",
        timeout=15,
        headers={"Accept": "application/json"},
    )

    if response.status_code == 404:
        return None

    if response.status_code == 429:
        raise UpstreamError(
            "Sleeper is temporarily rate-limiting requests. Please wait and try again."
        )

    if not response.ok:
        raise UpstreamError(
            f"Sleeper data is temporarily unavailable (HTTP {response.status_code})."
        )

    return response.json()


def numeric(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def record_for_roster(roster: dict[str, Any]) -> dict[str, Any]:
    settings = roster.get("settings") or {}

    wins = int(numeric(settings.get("wins")))
    losses = int(numeric(settings.get("losses")))
    ties = int(numeric(settings.get("ties")))

    points_for = (
        numeric(settings.get("fpts"))
        + numeric(settings.get("fpts_decimal")) / 100
    )

    points_against = (
        numeric(settings.get("fpts_against"))
        + numeric(settings.get("fpts_against_decimal")) / 100
    )

    return {
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "points_for": points_for,
        "points_against": points_against,
    }


def record_label(record: dict[str, Any]) -> str:
    label = f"{record['wins']}-{record['losses']}"

    if record["ties"] > 0:
        label += f"-{record['ties']}"

    return label


def manager_name(user: dict[str, Any] | None) -> str:
    if not user:
        return "Unknown manager"

    metadata = user.get("metadata") or {}

    return (
        metadata.get("team_name")
        or user.get("display_name")
        or user.get("username")
        or "Unknown manager"
    )


def current_week(league: dict[str, Any]) -> int:
    settings = league.get("settings") or {}

    try:
        week = int(settings.get("leg") or 1)
    except (TypeError, ValueError):
        week = 1

    return max(week, 1)


def build_standings(
    rosters: list[dict[str, Any]],
    users_by_id: dict[str, dict[str, Any]],
    scores_by_roster: dict[int, float],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for roster in rosters:
        record = record_for_roster(roster)
        roster_id = int(roster["roster_id"])
        games = record["wins"] + record["losses"] + record["ties"]

        win_pct = (
            (record["wins"] + 0.5 * record["ties"]) / games
            if games
            else 0
        )

        rows.append(
            {
                "roster_id": roster_id,
                "manager": manager_name(
                    users_by_id.get(str(roster.get("owner_id")))
                ),
                "record": record_label(record),
                "win_pct": round(win_pct, 4),
                "points_for": round(record["points_for"], 2),
                "points_against": round(record["points_against"], 2),
                "current_week_score": round(
                    scores_by_roster.get(roster_id, 0.0),
                    2,
                ),
            }
        )

    return sorted(
        rows,
        key=lambda row: (
            row["win_pct"],
            row["points_for"],
        ),
        reverse=True,
    )


def dashboard_payload(
    league: dict[str, Any],
    users: list[dict[str, Any]],
    rosters: list[dict[str, Any]],
    matchups: list[dict[str, Any]],
    my_roster_id: int,
) -> dict[str, Any]:
    users_by_id = {
        str(user["user_id"]): user
        for user in users
        if user.get("user_id") is not None
    }

    rosters_by_id = {
        int(roster["roster_id"]): roster
        for roster in rosters
        if roster.get("roster_id") is not None
    }

    if my_roster_id not in rosters_by_id:
        raise ValueError("That roster does not belong to this league.")

    scores_by_roster = {
        int(matchup["roster_id"]): numeric(matchup.get("points"))
        for matchup in matchups
        if matchup.get("roster_id") is not None
    }

    my_roster = rosters_by_id[my_roster_id]
    my_record = record_for_roster(my_roster)

    my_matchup = next(
        (
            matchup
            for matchup in matchups
            if int(matchup.get("roster_id", -1)) == my_roster_id
        ),
        None,
    )

    opponent_roster_id = None
    opponent_score = 0.0

    if my_matchup and my_matchup.get("matchup_id") is not None:
        opponent_matchup = next(
            (
                matchup
                for matchup in matchups
                if matchup.get("matchup_id") == my_matchup.get("matchup_id")
                and int(matchup.get("roster_id", -1)) != my_roster_id
            ),
            None,
        )

        if opponent_matchup:
            opponent_roster_id = int(opponent_matchup["roster_id"])
            opponent_score = numeric(opponent_matchup.get("points"))

    opponent_roster = rosters_by_id.get(opponent_roster_id)
    opponent_record = (
        record_for_roster(opponent_roster)
        if opponent_roster
        else None
    )

    my_score = scores_by_roster.get(my_roster_id, 0.0)
    total_live_score = my_score + opponent_score
    score_share = (
        round((my_score / total_live_score) * 100)
        if total_live_score > 0
        else 50
    )

    starters = (
        my_matchup.get("starters", [])
        if my_matchup
        else []
    )

    roster_players = [
        player_id
        for player_id in my_roster.get("players", [])
        if player_id
    ]

    bench = [
        player_id
        for player_id in roster_players
        if player_id not in starters
    ]

    standings = build_standings(
        rosters,
        users_by_id,
        scores_by_roster,
    )

    my_rank = next(
        (
            index + 1
            for index, row in enumerate(standings)
            if row["roster_id"] == my_roster_id
        ),
        None,
    )

    return {
        "meta": {
            "source": "live_sleeper",
            "season": str(league.get("season") or ""),
            "week": current_week(league),
            "generated_at": int(time.time()),
        },
        "league": {
            "league_id": str(league.get("league_id")),
            "name": league.get("name") or "Sleeper League",
            "total_rosters": league.get("total_rosters") or len(rosters),
            "roster_positions": league.get("roster_positions") or [],
        },
        "my_team": {
            "roster_id": my_roster_id,
            "manager": manager_name(
                users_by_id.get(str(my_roster.get("owner_id")))
            ),
            "record": my_record,
            "current_week_score": round(my_score, 2),
            "starter_ids": starters,
            "bench_player_ids": bench,
        },
        "matchup": {
            "available": opponent_roster is not None,
            "my_score": round(my_score, 2),
            "opponent_score": round(opponent_score, 2),
            "score_share_percent": score_share,
            "score_difference": round(my_score - opponent_score, 2),
            "opponent": (
                {
                    "roster_id": opponent_roster_id,
                    "manager": manager_name(
                        users_by_id.get(
                            str(opponent_roster.get("owner_id"))
                        )
                    ),
                    "record": opponent_record,
                }
                if opponent_roster and opponent_record
                else None
            ),
        },
        "standings": standings,
        "summary": {
            "league_rank": my_rank,
            "team_count": len(rosters),
            "analytics_status": (
                "League, roster, standings, and matchup data are live. "
                "Projection-driven analysis will be added next."
            ),
        },
    }


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@app.get("/api/dashboard")
def get_dashboard():
    league_id = (request.args.get("league_id") or "").strip()
    roster_id_text = (request.args.get("roster_id") or "").strip()

    if not league_id.isdigit():
        return jsonify(
            {"error": "league_id must be a numeric Sleeper league ID."}
        ), 400

    if not roster_id_text.isdigit():
        return jsonify(
            {"error": "roster_id must be a numeric roster ID."}
        ), 400

    roster_id = int(roster_id_text)
    cache_key = f"{league_id}:{roster_id}"

    cached = cache.get(cache_key)

    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return jsonify(cached[1]), 200

    try:
        league = sleeper_get(f"/league/{league_id}")
        users = sleeper_get(f"/league/{league_id}/users")
        rosters = sleeper_get(f"/league/{league_id}/rosters")

        if not league:
            return jsonify({"error": "Sleeper league was not found."}), 404

        if not isinstance(users, list) or not isinstance(rosters, list):
            raise UpstreamError("Sleeper returned incomplete league data.")

        week = current_week(league)

        try:
            matchups = sleeper_get(
                f"/league/{league_id}/matchups/{week}"
            )
        except UpstreamError:
            matchups = []

        if not isinstance(matchups, list):
            matchups = []

        payload = dashboard_payload(
            league=league,
            users=users,
            rosters=rosters,
            matchups=matchups,
            my_roster_id=roster_id,
        )

        cache[cache_key] = (time.time(), payload)

        return jsonify(payload), 200

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    except UpstreamError as error:
        return jsonify({"error": str(error)}), 503

    except requests.RequestException:
        return jsonify(
            {"error": "Unable to contact Sleeper right now. Please try again."}
        ), 503


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)