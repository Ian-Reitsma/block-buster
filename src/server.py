"""First-party server launcher.

Uses The Block dashboard server (HTTP + WS) built on the in-house
`HTTPServer`/`WebSocketServer` stacks. No FastAPI/Uvicorn or Solana
dependencies remain in this entrypoint.
"""

import logging

from the_block.dashboard_server import start_dashboard_server


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    start_dashboard_server()


if __name__ == "__main__":
    main()
