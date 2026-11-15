"""Fetch new CDSCO lists into the database, and nothing else.

CDSCO's portal does not answer requests from some cloud hosts (it silently drops
connections from Render, for example). This job runs somewhere CDSCO does accept,
such as GitHub Actions, and stores the raw rows. The server's daily run then cleans
them, scores them and emails pharmacies, because cleaning picks up every row that
has not been processed yet, wherever it came from.

Run:  python -m pipeline.fetch_job
Exits with an error when the portal cannot be reached, so the failure is visible.
"""
import json, sys
from . import fetch


def main() -> int:
    report = fetch.run(None)
    print(json.dumps(report, indent=1, default=str))
    if not str(report.get("portal", "")).startswith("ok"):
        print("CDSCO portal could not be reached from this machine.", file=sys.stderr)
        return 1
    print(f"Stored {report.get('new_from_portal', 0)} new rows from the CDSCO portal.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
