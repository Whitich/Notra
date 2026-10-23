from __future__ import annotations

import ctypes
import logging
import os
import sys
import traceback
from pathlib import Path

import webview

from .api import Api, apply_titlebar_theme
from .store import APP_NAME, Store


def resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def data_dir() -> Path:
    override = os.environ.get("NOTRA_DATA_DIR")
    if override:
        return Path(override)
    base = os.environ.get("APPDATA") or str(Path.home())
    return Path(base) / APP_NAME


def setup_logging(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(directory / "notra.log"),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        encoding="utf-8",
    )
    logging.getLogger().addHandler(logging.StreamHandler())


def show_error(message: str) -> None:
    try:
        ctypes.windll.user32.MessageBoxW(None, message, "Notra", 0x10)
    except Exception:
        pass


def acquire_single_instance() -> tuple[bool, object]:
    if os.name != "nt":
        return True, None
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.CreateMutexW(None, False, "Local\\NotraNotesApp-9D52A54A")
        if kernel32.GetLastError() == 183:
            return False, handle
        return True, handle
    except Exception:
        return True, None


def screen_size() -> tuple[int, int]:
    try:
        return (
            ctypes.windll.user32.GetSystemMetrics(0),
            ctypes.windll.user32.GetSystemMetrics(1),
        )
    except Exception:
        return (1920, 1080)


def main() -> None:
    directory = data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    setup_logging(directory)

    if os.name == "nt":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Notra.Notes.1")
        except Exception:
            pass

    ok, mutex = acquire_single_instance()
    if not ok:
        show_error("Notra is already running.\n\nNotra zaten çalışıyor.")
        return

    store = Store(directory)
    api = Api(store)
    assets = resource_dir() / "assets"
    ui = resource_dir() / "ui"
    icon = assets / "icon.ico"
    settings = store.settings()

    screen_w, screen_h = screen_size()
    width = min(int(settings.get("window_width", 1460)), max(980, screen_w - 70))
    height = min(int(settings.get("window_height", 940)), max(620, screen_h - 90))
    x = max(0, (screen_w - width) // 2)
    y = max(0, (screen_h - height) // 2 - 18)

    webview.settings["SHOW_DEFAULT_MENUS"] = False
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    webview.settings["ALLOW_FILE_URLS"] = True

    window = webview.create_window(
        "Notra",
        url=str(ui / "index.html"),
        js_api=api,
        width=width,
        height=height,
        x=x,
        y=y,
        min_size=(1000, 640),
        background_color="#111217",
        text_select=True,
        hidden=True,
        maximized=bool(settings.get("window_maximized")),
    )
    api._window = window

    def on_loaded() -> None:
        try:
            window.show()
            is_dark = settings.get("theme") == "dark"
            if settings.get("theme") == "system":
                try:
                    import winreg

                    key = winreg.OpenKey(
                        winreg.HKEY_CURRENT_USER,
                        r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                    )
                    is_dark = bool(winreg.QueryValueEx(key, "AppsUseLightTheme")[0] == 0)
                except Exception:
                    is_dark = True
            apply_titlebar_theme(window, is_dark)
        except Exception:
            logging.exception("on_loaded failed")

    def on_closing() -> None:
        try:
            native = getattr(window, "native", None)
            maximized = False
            width_value = window.width
            height_value = window.height
            if native is not None:
                try:
                    maximized = int(native.WindowState) == 2
                except Exception:
                    pass
                if maximized:
                    try:
                        bounds = native.RestoreBounds
                        width_value = int(bounds.Width)
                        height_value = int(bounds.Height)
                    except Exception:
                        pass
            store.save_settings(
                {
                    "window_width": max(900, width_value),
                    "window_height": max(620, height_value),
                    "window_maximized": maximized,
                }
            )
        except Exception:
            logging.exception("Could not save window state")

    def on_closed() -> None:
        try:
            store.close()
        except Exception:
            pass

    window.events.loaded += on_loaded
    window.events.closing += on_closing
    window.events.closed += on_closed

    try:
        webview.start(
            icon=str(icon),
            debug=bool(os.environ.get("NOTRA_DEBUG")),
            private_mode=False,
            storage_path=str(directory / "webview"),
        )
    except Exception:
        logging.exception("Fatal error")
        show_error("Notra could not start.\n\n" + traceback.format_exc(limit=3))
        raise


if __name__ == "__main__":
    main()
