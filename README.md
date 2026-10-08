FF Pipeline — Automated Fantasy Football Analytics
A fantasy football analytics application that combines a scheduled Python data pipeline, a Flask API hosted on Render, and a responsive dashboard hosted on GitHub Pages.

Connect a public Sleeper NFL league by username, select your team, and explore player projections, lineup optimization, waiver candidates, trending adds, and league standings. No Sleeper password is requested.



Current Features
Public league discovery by Sleeper username and season, followed by league and team selection.

Player-name, NFL-team, position, injury-status, and starter/bench enrichment.

Weekly projected-point estimates using returned player statistics and the selected league's scoring weights.

Optimal-lineup comparisons using the selected league's actual starter slots, including multiple WR and FLEX slots.

Waiver recommendations ranked by positive estimated upgrades over eligible same-position bench players.

Zero-point and missing-projection exclusions for waiver comparisons, plus IR/reserve, taxi, and unavailable-player exclusions.

A top-five trending-adds chart and top-ten activity list with a shared position filter.

Comma-formatted add counts, such as 608,706, and rostered/unrostered indicators.

A roster-performance table showing weekly projections, season estimates, recent played-week averages, and trend labels.

Live matchup scores and standings returned through the Render API.

Scheduled Python refreshes, fixture-based tests, and GitHub Pages deployment through GitHub Actions.

Dashboard Preview
Team Overview


The overview displays current-week live score, current matchup score edge, estimated bench upgrade, league rank, and team record. Player cards show names, NFL teams, natural positions, assigned starter slots or bench status, projected estimates, opponents where available, and injury tags.

Live scores and projected estimates are different values: player-card estimates are not the team's current live score.

Matchup Analysis


The current live dashboard displays your selected team's matchup opponent, both records, current scores, and current score share.

Current score share is not a modeled win probability. Position-by-position projected matchup analysis is not yet connected in this live view; the dashboard currently displays a placeholder for that feature.

Waiver Wire Edge


Unrostered players are ranked by estimated projected-point improvement over the lowest-projected eligible bench player sharing a fantasy position.

The live calculation excludes drop candidates who:

Have projections at or below zero, or missing projections.

Appear in the selected roster's IR/reserve or taxi lists.

Are marked IR, Out, Doubtful, or Suspended.

Pickup candidates must have positive projections, avoid those unavailable statuses, and be eligible for at least one supported starter slot in the selected league.

The live calculation is:

text
bench_upgrade = candidate_projected_estimate - comparable_bench_projected_estimate
Positive results are ranked and the top 15 are displayed. Recommendations can be fewer than 15. Very small positive upgrades may round to +0.0 in the one-decimal display.

These are same-position bench-value comparisons, not guaranteed starting-lineup improvements or rest-of-season rankings. Popularity and bye-coverage bonuses are not added to the current live waiver calculation. “Unrostered” does not guarantee immediate pickup eligibility: waiver processing, roster limits, and league rules still apply.

Optimal Lineup


The live optimizer uses dynamic programming to assign distinct eligible players to the selected league's actual starter slots, maximizing the sum of available projected estimates.

For example, the pictured league uses one QB, two RBs, three WRs, one TE, two FLEX slots, one kicker, and one defense. The comparison shows current players, suggested players, estimates, total projected points, and estimated improvement.

Supported slot types are QB, RB, WR, TE, K, DEF, FLEX, SUPER_FLEX, REC_FLEX, and WRRB_FLEX. The implementation supports up to 16 starter slots and reports unsupported or unfillable lineups rather than claiming a complete result.

Players marked IR, Out, Doubtful, or Suspended are excluded from optimizer eligibility. A missing projection is not replaced with an invented estimate. Missing projections can prevent a complete lineup recommendation.

This is a pregame comparison. It does not enforce game-time lineup locks, perform transactions, or change your lineup in Sleeper. Explicit IR/reserve exclusions currently apply to waiver drop comparisons; optimizer eligibility uses player status and projection availability.

Player Trends — Trending Adds


A horizontal bar chart shows the five most-added players in the returned Sleeper feed over the last 24 hours. The adjacent list shows up to ten players, with comma-formatted counts and selected-league roster availability.

Both panels default to all positions. Shared position buttons filter and rerank both panels together. The chart measures add counts, not historical fantasy points, and includes both rostered and unrostered players.

The dashboard requests up to 1,000 trending records. Position-specific rankings are based on the records actually returned by the source; a position may have fewer than ten entries.

Player Trends — Roster Performance


The roster table includes weekly projected estimates, season estimated points, and an average over available player records in the preceding three weeks. Missing weekly records are excluded from the average rather than treated as zero.

Trend labels compare this recent average with estimated season points divided by the returned games-played count:

Above season average: more than 15% higher.

Below season average: more than 15% lower.

Near season average: within that range.

Insufficient history: the comparison cannot be calculated.

The trending-position filter affects the add-count chart and activity list, not this roster table.

League Standings


Standings show records, win percentages, points for, points against, and current-week scores. The selected team is highlighted.

The screenshot's team names are fictional replacements for privacy. The numeric values and visual layout are preserved from the supplied screenshot; this is not a wholly synthetic league dataset.

The current frontend marks the top six teams as playoff-position rows, or all teams if there are fewer than six. This display does not yet derive the cutoff from the league's playoff settings. Standings are ordered by win percentage, then points for, and may differ from custom league tiebreakers.

Architecture
The project currently has two distinct execution paths.

Interactive Live Dashboard
text
Visitor selects username, season, league, and team
                        |
                        v
                GitHub Pages frontend
                  /                \
                 v                  v
          Render Flask API     Direct Sleeper requests
          League/roster data    Player directory
          Standings            Projections and statistics
          Matchup scores       Trending adds
                  \                /
                   v              v
                 Browser-side analytics
                 and Chart.js rendering
The Flask backend serves /api/dashboard?league_id=...&roster_id=.... The browser enriches roster information and calculates the current live lineup, waiver, and performance views.

The frontend also preloads docs/data.json as demo data, but the current connection-first interface does not automatically render that file as the interactive live dashboard. Running the Python pipeline alone is therefore not equivalent to refreshing a visitor's selected league.

Scheduled Python Pipeline and Deployment
text
GitHub Actions
    -> generate demo fixtures
    -> src.main: fetch -> transform -> analyze
    -> write docs/data.json
    -> run Python tests
    -> commit generated data
    -> publish docs to gh-pages
The Python analysis implementation and the newer browser-side live implementation are separate. The Python tests do not establish coverage of the browser-side analytics.

Project Structure
text
Fantasy-Football-Analyzer/
├── .github/workflows/refresh.yml  # Scheduled/manual refresh and Pages deployment
├── backend/
│   ├── app.py                    # Flask league, standings, and matchup API
│   ├── requirements.txt          # Backend dependencies
│   └── Procfile
├── src/
│   ├── config.py                 # Python pipeline configuration
│   ├── main.py                   # Python pipeline orchestrator
│   ├── api/sleeper_client.py      # Python Sleeper client
│   ├── pipeline/
│   │   ├── fetch.py
│   │   ├── transform.py
│   │   └── analyze.py
│   └── dashboard/generate_demo.py
├── data/
│   ├── demo/league_data.json
│   └── snapshots/                # Generated when applicable
├── docs/
│   ├── index.html
│   ├── data.json                 # Scheduled pipeline output
│   └── assets/
│       ├── styles.css
│       └── app.js                # Interactive dashboard and live analytics
├── tests/
│   ├── test_analyze.py
│   └── fixtures/sample_data.py
├── screenshots/
│   ├── team-overview.jpg
│   ├── matchup-analysis.jpg
│   ├── waiver-wire-edge.jpg
│   ├── optimal-lineup.jpg
│   ├── player-trends.jpg
│   ├── player-trends2.jpg
│   └── dashboard-standings.png
├── requirements.txt
├── .env.example
└── README.md
Quick Start
Preview the Interactive Dashboard
Clone or download the repository:

bash
git clone https://github.com/MichaelWhitney-Analytics/Fantasy-Football-Analyzer.git
cd Fantasy-Football-Analyzer
Serve the frontend from the project root:

bash
python -m http.server 8000 --directory docs
Open http://localhost:8000. Leave the server running, enter your Sleeper username, select the season and league, and choose your team. Internet access is required for the current live experience.

The frontend is configured to use the hosted Render API. Previewing locally does not start a local Flask server. A local Python server does not automatically open your browser.

Run the Separate Python Pipeline
bash
pip install -r requirements.txt
python -m src.dashboard.generate_demo
python -m src.main --demo
These commands generate fixture data and write pipeline analysis to docs/data.json.

For live Python pipeline execution, copy .env.example to .env, configure SLEEPER_USERNAME, SLEEPER_LEAGUE_ID, and the appropriate season, then run:

bash
python -m src.main --live
Do not commit .env or credentials. The Python pipeline's projection heuristics and analysis logic should not be confused with the browser-side live calculations documented above.

Render Configuration
The current backend service uses:

text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
The current frontend API URL is configured in docs/assets/app.js. Backend CORS configuration includes the project's GitHub Pages origin and local previews on port 8000.

GitHub Actions and Pages
The current workflow supports manual dispatch and these UTC schedules:

text
Tuesday:  15:00 UTC
Thursday: 15:00 UTC
Sunday:   15:00 UTC
These are fixed UTC schedules, not fixed local-time schedules. Thursday's run is not an after-Thursday-Night-Football refresh.

The workflow generates demo fixtures, runs live Python mode if SLEEPER_LEAGUE_ID is configured as an Actions secret, otherwise runs demo mode, executes tests, commits generated JSON, and publishes docs to gh-pages.

Configure GitHub Pages to publish from the gh-pages branch. After updating website files on main, run “Fantasy Football Data Refresh” manually from Actions if you want immediate deployment; the supplied workflow has no push trigger.

Do not change the workflow to --live merely to activate its secret-based switch: that conditional is already implemented.

Interactive league analytics are requested when a visitor connects a league. The schedule refreshes the separate Python output and deploys website assets; it is not the sole refresh mechanism for the live dashboard.

Data Sources and Scoring Methodology
The live interface uses public Sleeper league, roster, matchup, player-directory, and trending-add requests. It also retrieves separate selected-season projection and statistical feeds:

text
/v1/user/<username>
/v1/user/<user_id>/leagues/nfl/<season>
/v1/league/<league_id>
/v1/league/<league_id>/users
/v1/league/<league_id>/rosters
/v1/league/<league_id>/matchups/<week>
/v1/players/nfl
/v1/players/nfl/trending/add?lookback_hours=24&limit=1000

/projections/nfl/<season>/<week>?season_type=regular
/stats/nfl/<season>?season_type=regular
/stats/nfl/<season>/<week>?season_type=regular
Player projection and statistical feeds can contain multiple records per player. The browser selects one per player, preferring Rotowire for projections and Sportradar for statistics; within equal provider priority, the newer timestamp wins.

Projected and historical estimated points use an additive calculation:

text
estimated_points = sum(returned_stat_value * matching_league_scoring_weight)
Missing statistic keys contribute zero. Missing player records remain unavailable. The dashboard reports configured nonzero scoring keys absent from the loaded data.

These estimates are not guaranteed to match official Sleeper fantasy totals. Nonlinear bonuses, scoring tiers, unsupported key mappings, and aggregate projection behavior can produce differences. The displayed methodology notice preserves that distinction.

Projection/statistics feed availability and schema are external dependencies. The implementation displays request failures and unavailable results, but does not guarantee those feeds' long-term stability.

Testing
Run the existing fixture-based Python tests:

bash
pip install -r requirements.txt
python -m pytest tests/ -v
These cover the Python analysis engine. Browser-side changes also require manual verification of league selection, projection availability, waiver exclusions, lineup slot coverage, chart/list filtering, and source failures.

Tech Stack
Component	Technology
Component	Technology
Scheduled pipeline	Python
Backend	Flask, Flask-CORS, Gunicorn, requests
Hosting	Render API and GitHub Pages frontend
Automation	GitHub Actions
Frontend	HTML, CSS, JavaScript, Tailwind CSS
Charting	Chart.js
Icons and fonts	Lucide; Cabinet Grotesk and Satoshi via Fontshare
Tests	pytest with fixtures
Data exchange	JSON
Current Limitations and Next Steps
Connect projected position-by-position matchup analysis; current score share is not win probability.

Validate scoring parity against official league totals, including bonuses and tiers.

Derive playoff cutoffs and tiebreakers from actual league settings.

Add browser-side automated tests.

Consolidate appended frontend patches and duplicate data requests.

Move shared feed caching and analytics into a coordinated backend/pipeline architecture.

Add game-time lineup-lock awareness and explicit optimizer handling of reserve/taxi eligibility.

The application reads public data and provides comparisons. It does not submit waiver claims, execute trades, or change Sleeper lineups.