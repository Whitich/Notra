from __future__ import annotations

import base64
import ctypes
import functools
import json
import logging
import mimetypes
import os
import threading
from pathlib import Path
from typing import Any, Callable

import webview

from . import updater
from .store import APP_NAME, APP_VERSION, Store

logger = logging.getLogger("notra.api")


def api_method(func: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(func)
    def wrapper(self: "Api", *args: Any, **kwargs: Any) -> Any:
        try:
            return func(self, *args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.exception("API error in %s", func.__name__)
            return {"ok": False, "error": str(exc), "method": func.__name__}

    return wrapper


class Api:
    def __init__(self, store: Store) -> None:
        self._store = store
        self._window: webview.Window | None = None
        self._fullscreen = False
        self._fullscreen_bounds: tuple[int, int, int, int] | None = None
        self._fullscreen_was_maximized = False

    @api_method
    def bootstrap(self) -> dict[str, Any]:
        settings = self._store.settings()
        return {
            "app": self._store.app_info(),
            "settings": settings,
            "meta": self._store.meta(),
            "default_notes": self._store.list_notes(
                view=settings.get("default_view", "all"),
                sort=settings.get("sort"),
            ),
        }

    @api_method
    def get_meta(self) -> dict[str, Any]:
        return self._store.meta()

    @api_method
    def list_notes(
        self,
        view: str = "all",
        group_id: str | None = None,
        tag: str | None = None,
        query: str = "",
        sort: str | None = None,
    ) -> list[dict[str, Any]]:
        return self._store.list_notes(view=view, group_id=group_id, tag=tag, query=query, sort=sort)

    @api_method
    def get_note(self, note_id: str) -> dict[str, Any] | None:
        return self._store.get_note(note_id)

    @api_method
    def create_note(
        self,
        title: str = "",
        content: str = "",
        group_id: str | None = None,
        tags: list[str] | None = None,
        color: str = "default",
    ) -> dict[str, Any]:
        return self._store.create_note(title=title, content=content, group_id=group_id, tags=tags, color=color)

    @api_method
    def save_note(self, note_id: str, title: str, content: str, plain_text: str | None = None) -> dict[str, Any]:
        return self._store.save_note(note_id=note_id, title=title, content=content, plain_text=plain_text)

    @api_method
    def patch_note(self, note_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        return self._store.patch_note(note_id, patch)

    @api_method
    def bulk_patch(self, note_ids: list[str], patch: dict[str, Any]) -> list[dict[str, Any]]:
        return self._store.bulk_patch(note_ids, patch)

    @api_method
    def trash_notes(self, note_ids: list[str]) -> list[str]:
        return self._store.trash_notes(note_ids)

    @api_method
    def restore_notes(self, note_ids: list[str]) -> list[str]:
        return self._store.restore_notes(note_ids)

    @api_method
    def delete_notes(self, note_ids: list[str]) -> list[str]:
        return self._store.delete_notes(note_ids)

    @api_method
    def empty_trash(self) -> int:
        return self._store.empty_trash()

    @api_method
    def duplicate_note(self, note_id: str) -> dict[str, Any] | None:
        return self._store.duplicate_note(note_id)

    @api_method
    def create_group(self, name: str, color: str = "amber", icon: str = "book") -> dict[str, Any]:
        return self._store.create_group(name, color, icon)

    @api_method
    def update_group(self, group_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        return self._store.update_group(group_id, patch)

    @api_method
    def delete_group(self, group_id: str, mode: str = "keep_notes") -> bool:
        return self._store.delete_group(group_id, mode)

    @api_method
    def reorder_groups(self, group_ids: list[str]) -> bool:
        self._store.reorder_groups(group_ids)
        return True

    @api_method
    def rename_tag(self, old: str, new: str) -> int:
        return self._store.rename_tag(old, new)

    @api_method
    def delete_tag(self, tag: str) -> int:
        return self._store.delete_tag(tag)

    @api_method
    def get_revisions(self, note_id: str) -> list[dict[str, Any]]:
        return self._store.revisions(note_id)

    @api_method
    def restore_revision(self, note_id: str, revision_id: int) -> dict[str, Any] | None:
        return self._store.restore_revision(note_id, revision_id)

    @api_method
    def get_settings(self) -> dict[str, Any]:
        return self._store.settings()

    @api_method
    def save_settings(self, patch: dict[str, Any]) -> dict[str, Any]:
        return self._store.save_settings(patch)

    @api_method
    def get_stats(self) -> dict[str, Any]:
        return self._store.stats()

    @api_method
    def pick_images(self) -> list[dict[str, Any]]:
        if not self._window:
            return []
        files = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=(
                "Images (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp)",
                "All files (*.*)",
            ),
        )
        if not files:
            return []
        results: list[dict[str, Any]] = []
        for file_path in files:
            path = Path(file_path)
            try:
                if path.stat().st_size > 30 * 1024 * 1024:
                    continue
                data = path.read_bytes()
                mime = mimetypes.guess_type(path.name)[0] or "image/png"
                results.append(
                    {
                        "name": path.name,
                        "mime": mime,
                        "data_url": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}",
                        "size": len(data),
                    }
                )
            except Exception:
                logger.exception("Could not read image %s", file_path)
        return results

    @api_method
    def save_export(
        self,
        filename: str,
        content: str,
        kind: str = "text",
        is_base64: bool = False,
    ) -> str | None:
        if not self._window:
            return None
        file_types = {
            "html": ("HTML document (*.html)",),
            "markdown": ("Markdown (*.md)",),
            "text": ("Text file (*.txt)",),
            "json": ("JSON backup (*.json)",),
            "png": ("PNG image (*.png)",),
        }.get(kind, ("All files (*.*)",))
        target = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=filename,
            file_types=file_types,
        )
        if not target:
            return None
        path = target[0] if isinstance(target, (list, tuple)) else target
        data = base64.b64decode(content) if is_base64 else content.encode("utf-8")
        Path(path).write_bytes(data)
        return str(path)

    @api_method
    def export_backup(self) -> str | None:
        if not self._window:
            return None
        payload = self._store.export_payload()
        target = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=f"notra-backup-{payload['exported_at'][:10]}.json",
            file_types=("Notra backup (*.json)",),
        )
        if not target:
            return None
        path = target[0] if isinstance(target, (list, tuple)) else target
        Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(path)

    @api_method
    def import_backup(self, mode: str = "merge") -> dict[str, Any] | None:
        if not self._window:
            return None
        files = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("Notra backup (*.json)", "All files (*.*)"),
        )
        if not files:
            return None
        path = files[0]
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        result = self._store.import_payload(payload, mode=mode)
        result["path"] = str(path)
        return result

    @api_method
    def open_data_dir(self) -> bool:
        os.startfile(str(self._store.data_dir))  # type: ignore[attr-defined]
        return True

    @api_method
    def open_external(self, url: str) -> bool:
        if not isinstance(url, str):
            return False
        lowered = url.strip().lower()
        if lowered.startswith(("http://", "https://", "mailto:")):
            os.startfile(url)  # type: ignore[attr-defined]
            return True
        return False

    @api_method
    def set_titlebar_theme(self, dark: bool) -> bool:
        return apply_titlebar_theme(self._window, bool(dark))

    @api_method
    def set_fullscreen(self, fullscreen: bool = True) -> bool:
        if not self._window:
            return False
        wanted = bool(fullscreen)
        if wanted != self._fullscreen:
            if wanted:
                self._fullscreen_bounds = (
                    self._window.x,
                    self._window.y,
                    self._window.width,
                    self._window.height,
                )
                native = getattr(self._window, "native", None)
                self._fullscreen_was_maximized = str(getattr(native, "WindowState", "")) == "Maximized"
                self._window.toggle_fullscreen()
            else:
                self._window.toggle_fullscreen()
                if self._fullscreen_bounds:
                    x, y, width, height = self._fullscreen_bounds
                    self._window.move(x, y)
                    self._window.resize(width, height)
                    if self._fullscreen_was_maximized:
                        self._window.maximize()
                    self._fullscreen_bounds = None
            self._fullscreen = wanted
        return self._fullscreen

    @api_method
    def save_window_state(self, width: int, height: int, maximized: bool) -> bool:
        self._store.save_settings(
            {
                "window_width": width,
                "window_height": height,
                "window_maximized": bool(maximized),
            }
        )
        return True

    @api_method
    def reveal_db(self) -> bool:
        os.startfile(str(self._store.db_path))  # type: ignore[attr-defined]
        return True

    @api_method
    def check_for_update(self) -> dict[str, Any]:
        return updater.check_for_update(APP_VERSION)

    @api_method
    def download_update(
        self,
        url: str,
        name: str,
        size: int,
        digest: str,
    ) -> dict[str, Any]:
        return updater.download_update(url, name, size, digest)

    @api_method
    def install_update(self, path: str) -> dict[str, Any]:
        result = updater.launch_installer(path)
        if not result.get("ok"):
            return result
        try:
            self._store.auto_backup()
        except Exception:
            logger.exception("Pre-update backup failed")
        timer = threading.Timer(1.8, self._close_for_update)
        timer.daemon = True
        timer.start()
        return result

    def _close_for_update(self) -> None:
        if not self._window:
            return
        try:
            self._window.destroy()
        except Exception:
            logger.exception("Could not close Notra for update")

    @api_method
    def app_info(self) -> dict[str, Any]:
        return {**self._store.app_info(), "name": APP_NAME, "version": APP_VERSION}


def apply_titlebar_theme(window: webview.Window | None, dark: bool) -> bool:
    if not window or os.name != "nt":
        return False
    try:
        native = getattr(window, "native", None)
        if native is None:
            return False
        handle = int(native.Handle.ToInt32())
        dwm = ctypes.windll.dwmapi
        value = ctypes.c_int(1 if dark else 0)
        dwm.DwmSetWindowAttribute(handle, 20, ctypes.byref(value), ctypes.sizeof(value))
        border = ctypes.c_int(2 if dark else 1)
        dwm.DwmSetWindowAttribute(handle, 38, ctypes.byref(border), ctypes.sizeof(border))
        caption = 0x1A1514 if dark else 0xF0F5F7
        text = 0xEDE9E8 if dark else 0x292726
        caption_value = ctypes.c_int(caption)
        text_value = ctypes.c_int(text)
        dwm.DwmSetWindowAttribute(handle, 35, ctypes.byref(caption_value), ctypes.sizeof(caption_value))
        dwm.DwmSetWindowAttribute(handle, 36, ctypes.byref(text_value), ctypes.sizeof(text_value))
        return True
    except Exception:
        logger.debug("Could not apply titlebar theme", exc_info=True)
        return False
