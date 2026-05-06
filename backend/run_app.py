from __future__ import annotations

import os
import socket
import threading
import time
import webbrowser

def _find_available_port(host: str, preferred_port: int, max_tries: int = 20) -> int:
    for port in range(preferred_port, preferred_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as candidate:
            candidate.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                candidate.bind((host, port))
            except OSError:
                continue
        return port
    raise RuntimeError(f"无法在 {preferred_port}-{preferred_port + max_tries - 1} 范围内找到可用端口")


def _open_browser_when_ready(url: str, delay_seconds: float = 1.5) -> None:
    time.sleep(delay_seconds)
    webbrowser.open(url)


def main() -> None:
    import uvicorn

    from app.main import app

    host = os.getenv("APP_HOST", "127.0.0.1")
    preferred_port = int(os.getenv("APP_PORT", "8000"))
    port = _find_available_port(host, preferred_port)
    url = f"http://{host}:{port}"

    threading.Thread(target=_open_browser_when_ready, args=(url,), daemon=True).start()
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
