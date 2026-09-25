"""Runs the backend under coverage for the combined-coverage gate (ZARAILINK_COVERAGE=1, see conftest.py).

`coverage run -m uvicorn` loses its data on Windows: uvicorn does not handle CTRL_BREAK there, so the process
dies without coverage's exit hook running. Here the server is driven directly and a shutdown signal (SIGTERM,
or SIGBREAK on Windows) asks it to stop, so coverage stops and saves before the process exits.
"""

from __future__ import annotations

import os
import signal
import sys

import coverage
import uvicorn


def main(port: int) -> None:
    sys.path.insert(0, os.getcwd())  # the backend root, where the `app` package lives
    cov = coverage.Coverage()  # settings come from pyproject.toml
    cov.start()
    server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=port))

    def stop(_signum: int, _frame: object) -> None:
        server.should_exit = True

    for name in ("SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), stop)
    try:
        server.run()
    finally:
        cov.stop()
        cov.save()


if __name__ == "__main__":
    main(int(sys.argv[1]))
