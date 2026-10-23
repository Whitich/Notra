from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REPO = "Whitich/Notra"
RELEASES_API = f"https://api.github.com/repos/{REPO}/releases/latest"
ASSET_NAME = re.compile(r"^Notra-Setup(?:-\d+\.\d+\.\d+)?\.exe$", re.IGNORECASE)
VERSION_PATTERN = re.compile(r"^[vV]?(\d+)\.(\d+)\.(\d+)")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
MAX_UPDATE_BYTES = 250 * 1024 * 1024
UPDATE_DIR = Path(tempfile.gettempdir()) / "Notra" / "Updates"
USER_AGENT = "Notra-Updater"


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = VERSION_PATTERN.match(str(value or "").strip())
    if not match:
        return None
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def is_newer(latest: str, current: str) -> bool:
    latest_version = parse_version(latest)
    current_version = parse_version(current)
    if latest_version is None or current_version is None:
        return False
    return latest_version > current_version


def _api_request(url: str, timeout: int = 15) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def _select_asset(assets: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = [
        asset
        for asset in assets
        if isinstance(asset, dict)
        and ASSET_NAME.match(str(asset.get("name") or ""))
        and str(asset.get("browser_download_url") or "").startswith(
            f"https://github.com/{REPO}/releases/download/"
        )
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda asset: str(asset.get("name") or "").lower() != "notra-setup.exe")
    return candidates[0]


def check_for_update(current_version: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(_api_request(RELEASES_API), timeout=15) as response:
            raw = response.read(1024 * 1024)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            # No published release yet: that is not an error, just nothing to install.
            return {
                "ok": True,
                "current": current_version,
                "latest": current_version,
                "available": False,
                "release_url": f"https://github.com/{REPO}/releases",
                "published_at": "",
                "notes": "",
                "asset": None,
            }
        if exc.code in (403, 429):
            return {"ok": False, "error": "update_rate_limited", "status": exc.code}
        return {"ok": False, "error": "update_network", "status": exc.code}
    except (urllib.error.URLError, TimeoutError, OSError):
        return {"ok": False, "error": "update_network"}

    try:
        release = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"ok": False, "error": "update_invalid_response"}

    if not isinstance(release, dict):
        return {"ok": False, "error": "update_invalid_response"}

    latest = str(release.get("tag_name") or "").strip()
    if parse_version(latest) is None:
        return {"ok": False, "error": "update_invalid_response"}

    info: dict[str, Any] = {
        "ok": True,
        "current": current_version,
        "latest": latest,
        "available": is_newer(latest, current_version),
        "release_url": str(release.get("html_url") or ""),
        "published_at": str(release.get("published_at") or ""),
        "notes": str(release.get("body") or "")[:6000],
        "asset": None,
    }
    if not info["available"]:
        return info

    asset = _select_asset(release.get("assets") if isinstance(release.get("assets"), list) else [])
    if asset is None:
        return {"ok": False, "error": "update_asset_missing", "latest": latest}

    digest_value = str(asset.get("digest") or "").strip().lower()
    digest = digest_value.removeprefix("sha256:")
    if not digest_value.startswith("sha256:") or not SHA256_PATTERN.match(digest):
        return {"ok": False, "error": "update_digest_missing", "latest": latest}

    size = int(asset.get("size") or 0)
    if size <= 0 or size > MAX_UPDATE_BYTES:
        return {"ok": False, "error": "update_asset_invalid", "latest": latest}

    info["asset"] = {
        "name": str(asset.get("name") or ""),
        "url": str(asset.get("browser_download_url") or ""),
        "size": size,
        "digest": f"sha256:{digest}",
    }
    return info


def _is_allowed_download(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    path = parsed.path
    if host == "github.com":
        return path.startswith(f"/{REPO}/releases/download/")
    if host == "api.github.com":
        return path.startswith(f"/repos/{REPO}/releases/assets/")
    return False


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    except OSError:
        pass


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_update(
    url: str,
    name: str,
    size: int,
    digest: str,
) -> dict[str, Any]:
    if not _is_allowed_download(url):
        return {"ok": False, "error": "update_invalid_url"}

    filename = Path(str(name or "")).name
    if not ASSET_NAME.match(filename):
        return {"ok": False, "error": "update_invalid_asset"}

    expected_size = int(size or 0)
    if expected_size <= 0 or expected_size > MAX_UPDATE_BYTES:
        return {"ok": False, "error": "update_asset_invalid"}

    expected_digest = str(digest or "").strip().lower().removeprefix("sha256:")
    if not SHA256_PATTERN.match(expected_digest):
        return {"ok": False, "error": "update_digest_missing"}

    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    target = UPDATE_DIR / filename

    if target.is_file():
        if target.stat().st_size == expected_size and _hash_file(target) == expected_digest:
            return {"ok": True, "path": str(target), "cached": True}
        _remove(target)

    part = target.with_name(f"{target.name}.part")
    _remove(part)
    digest_hash = hashlib.sha256()
    downloaded = 0

    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": USER_AGENT}),
            timeout=60,
        ) as response, part.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                downloaded += len(chunk)
                if downloaded > MAX_UPDATE_BYTES or downloaded > expected_size:
                    raise ValueError("update_size_mismatch")
                digest_hash.update(chunk)
                handle.write(chunk)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        _remove(part)
        return {"ok": False, "error": "update_download_failed"}

    if downloaded != expected_size:
        _remove(part)
        return {"ok": False, "error": "update_size_mismatch"}

    if digest_hash.hexdigest() != expected_digest:
        _remove(part)
        return {"ok": False, "error": "update_digest_mismatch"}

    try:
        os.replace(part, target)
    except OSError:
        _remove(part)
        return {"ok": False, "error": "update_download_failed"}

    return {"ok": True, "path": str(target), "cached": False}


def launch_installer(path: str) -> dict[str, Any]:
    installer = Path(str(path or ""))
    try:
        installer = installer.resolve(strict=True)
        update_dir = UPDATE_DIR.resolve(strict=True)
    except (OSError, RuntimeError):
        return {"ok": False, "error": "update_installer_missing"}

    if installer.parent != update_dir or not ASSET_NAME.match(installer.name):
        return {"ok": False, "error": "update_installer_invalid"}

    try:
        creation_flags = (
            getattr(subprocess, "DETACHED_PROCESS", 0)
            | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        )
        log_path = UPDATE_DIR.parent / "update.log"
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            log_path = None
        args = [
            str(installer),
            "/VERYSILENT",
            "/SUPPRESSMSGBOXES",
            "/NORESTART",
            "/CLOSEAPPLICATIONS",
            "/FORCECLOSEAPPLICATIONS",
        ]
        if log_path is not None:
            args.append(f"/LOG={log_path}")
        subprocess.Popen(
            args,
            close_fds=True,
            creationflags=creation_flags,
        )
    except OSError:
        return {"ok": False, "error": "update_install_failed"}

    return {"ok": True, "started": True}
