from __future__ import annotations

import socket

import pytest

from run_app import _find_available_port


def test_find_available_port_returns_preferred_when_free():
    port = _find_available_port("127.0.0.1", 18000, max_tries=3)

    assert port == 18000


def test_find_available_port_skips_ports_in_use():
    holder = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    holder.bind(("127.0.0.1", 18010))
    holder.listen(1)

    try:
        port = _find_available_port("127.0.0.1", 18010, max_tries=3)
    finally:
        holder.close()

    assert port == 18011


def test_find_available_port_raises_when_range_is_full():
    holders = []
    for port in (18020, 18021):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", port))
        sock.listen(1)
        holders.append(sock)

    try:
        with pytest.raises(RuntimeError):
            _find_available_port("127.0.0.1", 18020, max_tries=2)
    finally:
        for sock in holders:
            sock.close()
