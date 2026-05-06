from __future__ import annotations

import os
import threading
import time
import webbrowser

import uvicorn

from app.main import app


def _open_browser(url: str) -> None:
    time.sleep(1.2)
    webbrowser.open(url)


def main() -> None:
    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8000"))
    url = f"http://{host}:{port}"

    threading.Thread(target=_open_browser, args=(url,), daemon=True).start()
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
