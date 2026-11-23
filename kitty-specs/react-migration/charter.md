# Mission Charter — React Frontend Migration

**Mission slug:** `react-migration`
**Owner:** AOI engineering
**Status:** in progress

## Why
The legacy Streamlit UI (`aoi_system_updated/app.py`) limits the inspection station to a single-process app that pops a native OpenCV window for camera capture. It is hard to style, accessibility-poor, and not containerizable. Replacing the UI removes those constraints without touching the proven detection / reporting / persistence logic.

## Success criteria
1. Operator can complete a full inspection session from a web browser: pick operator + inspector, capture wires (button or Spacebar), see live OK / NOT OK counts, stop the session.
2. The session writes exactly the same rows to `detection_results.xlsx` and the same entries to `daily_test_log.json` that the legacy app produced (one entry per cable — the v2.1 invariant).
3. Daily PDF report generates and emails with identical layout (Innotech header, Pass/Fail color cells).
4. The 20:00 daily auto-send fires without the UI being open.
5. `docker compose --profile dev up` brings the full stack on a clean machine with Docker installed.

## Non-goals
- Authentication beyond the existing admin-password header gate.
- Migrating JSON / XLSX persistence to a database.
- Mobile layouts; the target is a desktop browser at the station.
- Multi-tenant / multi-line support.
- CI/CD pipelines.

## Stakeholders
- Operators on the inspection line (primary users).
- QA / supervisors (receive the daily PDF).
- Maintainers (deploy + tune `COLOR_RANGES`).

## Out-of-scope artifacts
The mission ends when verification §7 of `/.claude/plans/run-the-code-in-wobbly-sparrow.md` passes. Anything beyond — image-storage policy, fleet provisioning, telemetry — is a follow-up mission.
