"""
Main Pipeline Orchestrator

Runs the full pipeline:
1. Fetch data (from Sleeper API or demo data)
2. Transform raw data into clean structure
3. Run analysis (waiver edge, matchup, optimal lineup, trends)
4. Generate dashboard data JSON
5. Save snapshot

Usage:
    python -m src.main                    # Uses demo mode by default
    python -m src.main --live             # Live API mode (requires league ID)
    python -m src.main --demo             # Explicitly use demo data
"""

import argparse
import json
import sys
from pathlib import Path

from src.config import config
from src.pipeline.fetch import fetch_all, fetch_demo, save_raw_snapshot
from src.pipeline.transform import transform
from src.pipeline.analyze import analyze


def run_pipeline(use_demo: bool = None) -> dict:
    """
    Run the complete data pipeline.

    Args:
        use_demo: If True, uses demo data. If None, uses config.demo_mode.

    Returns:
        The final dashboard data dictionary.
    """
    use_demo = use_demo if use_demo is not None else config.demo_mode

    print("=" * 60)
    print("  Fantasy Football Analytics Pipeline")
    print("=" * 60)

    # Ensure directories exist
    config.ensure_dirs()
    print("\n[1/4] Fetching data...")

    if use_demo:
        print("  Mode: DEMO (using local fixture data)")
        raw_data = fetch_demo()
    else:
        if not config.league_id:
            print("  ERROR: No league ID configured. Set SLEEPER_LEAGUE_ID env var.")
            print("  Falling back to demo mode.")
            raw_data = fetch_demo()
        else:
            print(f"  Mode: LIVE (League ID: {config.league_id})")
            raw_data = fetch_all()

    print("\n[2/4] Transforming data...")
    clean_data = transform(raw_data)
    print(f"  My team: {clean_data['my_team']['manager']['display_name']}")
    print(f"  Standings: {len(clean_data['standings'])} teams")
    print(f"  Available players: {len(clean_data['available_players'])}")

    print("\n[3/4] Running analysis...")
    analysis_results = analyze(clean_data)
    print(f"  Waiver recommendations: {len(analysis_results['waiver_edge'])}")
    print(f"  Matchup available: {analysis_results['matchup_analysis']['available']}")
    print(f"  Optimal lineup improvement: +{analysis_results['optimal_lineup'].get('improvement', 0)}")
    print(f"  Insights generated: {len(analysis_results['insights'])}")

    print("\n[4/4] Generating dashboard data...")
    dashboard_data = _build_dashboard_output(clean_data, analysis_results)

    # Write to docs/data.json for the dashboard
    output_path = config.get_output_path()
    with open(output_path, "w") as f:
        json.dump(dashboard_data, f, indent=2)
    print(f"  Dashboard data written to: {output_path}")

    # Save snapshot of raw data
    if not use_demo:
        try:
            save_raw_snapshot(raw_data)
        except Exception as e:
            print(f"  Snapshot failed: {e}")

    print("\n" + "=" * 60)
    print("  Pipeline complete!")
    print("=" * 60)

    return dashboard_data


def _build_dashboard_output(clean_data: dict, analysis: dict) -> dict:
    """Build the final JSON structure consumed by the dashboard."""
    return {
        "meta": {
            **clean_data["meta"],
            "generated_at": clean_data["meta"]["fetched_at"],
            "pipeline_version": "1.0.0",
        },
        "league": clean_data["league"],
        "my_team": clean_data["my_team"],
        "opponent": clean_data["opponent"],
        "standings": clean_data["standings"],
        "analysis": analysis,
        "scoring_settings": clean_data.get("scoring_settings", {}),
    }


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Fantasy Football Analytics Pipeline")
    parser.add_argument("--demo", action="store_true", help="Use demo data")
    parser.add_argument("--live", action="store_true", help="Use live Sleeper API data")
    args = parser.parse_args()

    use_demo = None
    if args.demo:
        use_demo = True
    elif args.live:
        use_demo = False

    run_pipeline(use_demo=use_demo)


if __name__ == "__main__":
    main()
