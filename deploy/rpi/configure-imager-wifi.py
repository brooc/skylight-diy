#!/usr/bin/env python3

"""Import Raspberry Pi Imager Wi-Fi settings into NetworkManager."""

from pathlib import Path
import subprocess
import sys

import yaml

NETWORK_CONFIG = Path("/boot/firmware/network-config")
CONNECTION_NAME = "daymark-imager-wifi"


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        check=check,
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def wifi_connection_exists() -> bool:
    result = subprocess.run(
        ["nmcli", "-t", "-f", "TYPE", "connection", "show"],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return any(line == "802-11-wireless" for line in result.stdout.splitlines())


def load_first_access_point() -> tuple[str, str | None, bool] | None:
    if not NETWORK_CONFIG.is_file():
        return None

    document = yaml.safe_load(NETWORK_CONFIG.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        return None
    network = document.get("network")
    if isinstance(network, dict):
        document = network
    wifis = document.get("wifis")
    if not isinstance(wifis, dict):
        return None

    for interface_config in wifis.values():
        if not isinstance(interface_config, dict):
            continue
        access_points = interface_config.get("access-points")
        if not isinstance(access_points, dict):
            continue
        for ssid, access_point in access_points.items():
            if not isinstance(ssid, str) or not ssid:
                continue
            options = access_point if isinstance(access_point, dict) else {}
            password = options.get("password")
            hidden = options.get("hidden") is True
            return ssid, password if isinstance(password, str) else None, hidden
    return None


def main() -> int:
    if wifi_connection_exists():
        print("A Wi-Fi connection already exists; preserving it.")
        return 0

    access_point = load_first_access_point()
    if access_point is None:
        print("No Raspberry Pi Imager Wi-Fi settings were found.")
        return 0

    ssid, password, hidden = access_point
    run(
        "nmcli",
        "connection",
        "add",
        "type",
        "wifi",
        "ifname",
        "wlan0",
        "con-name",
        CONNECTION_NAME,
        "ssid",
        ssid,
    )
    run(
        "nmcli",
        "connection",
        "modify",
        CONNECTION_NAME,
        "connection.autoconnect",
        "yes",
        "ipv4.method",
        "auto",
        "ipv6.method",
        "auto",
        "802-11-wireless.hidden",
        "yes" if hidden else "no",
    )
    if password:
        run(
            "nmcli",
            "connection",
            "modify",
            CONNECTION_NAME,
            "wifi-sec.key-mgmt",
            "wpa-psk",
            "wifi-sec.psk",
            password,
        )

    result = run(
        "nmcli",
        "--wait",
        "30",
        "connection",
        "up",
        CONNECTION_NAME,
        check=False,
    )
    if result.returncode == 0:
        print("Imported and activated Raspberry Pi Imager Wi-Fi settings.")
    else:
        print(
            "Imported Raspberry Pi Imager Wi-Fi settings; activation will retry automatically.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
