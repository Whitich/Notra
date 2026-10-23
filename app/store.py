from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

APP_VERSION = "1.1.0"
APP_NAME = "Notra"

DEFAULT_SETTINGS: dict[str, Any] = {
    "language": "en",
    "theme": "system",
    "accent": "amber",
    "sort": "updated_desc",
    "font_size": 17,
    "font_family": "sans",
    "spellcheck": True,
    "show_word_count": True,
    "compact_list": False,
    "default_view": "all",
    "window_width": 1460,
    "window_height": 940,
    "window_maximized": False,
}

COLORS = {"default", "amber", "rose", "teal", "violet", "blue", "green", "slate"}
GROUP_ICONS = {"book", "briefcase", "bulb", "heart", "folder", "target", "code", "music"}

BLOCK_TAGS = {
    "p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "tr", "td", "th", "section", "article", "hr",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in BLOCK_TAGS:
            self.parts.append("\n")
        elif tag == "img":
            alt = dict(attrs).get("alt")
            if alt:
                self.parts.append(f" {alt} ")

    def handle_endtag(self, tag: str) -> None:
        if tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def html_to_text(value: str) -> str:
    if not value:
        return ""
    parser = _TextExtractor()
    try:
        parser.feed(value)
        parser.close()
        text = "".join(parser.parts)
    except Exception:
        text = re.sub(r"<[^>]+>", " ", value)
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r"[^\W_]+(?:['’][^\W_]+)?", text, re.UNICODE))


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def normalize_tag(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())[:42]


def make_excerpt(text: str, query: str = "", length: int = 180) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return ""
    if query:
        haystack = text.casefold()
        needles = [t.casefold() for t in re.findall(r"\w+", query, re.UNICODE) if t]
        position = -1
        for needle in needles:
            position = haystack.find(needle)
            if position >= 0:
                break
        if position > 60:
            start = max(0, position - 55)
            chunk = text[start:start + length]
            return ("… " if start else "") + chunk + (" …" if start + length < len(text) else "")
    chunk = text[:length]
    return chunk + (" …" if len(text) > length else "")


SEED_WELCOME_EN = """
<p class="callout">A calm place for your notes, ideas and sketches. Everything stays on this device.</p>
<h2>What you can do</h2>
<ul>
<li><strong>Write and format</strong> — headings, checklists, quotes, code and tables.</li>
<li><strong>Sketch</strong> — open the drawing studio and drop the result straight into your note.</li>
<li><strong>Add images</strong> — paste from the clipboard, drag and drop, or use the image button.</li>
<li><strong>Stay organized</strong> — notebooks, tags, favorites, pinning and instant search.</li>
</ul>
<h2>Useful shortcuts</h2>
<table>
<thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td><code>Ctrl + N</code></td><td>Create a new note</td></tr>
<tr><td><code>Ctrl + K</code></td><td>Open the command palette</td></tr>
<tr><td><code>Ctrl + F</code></td><td>Search your notes</td></tr>
<tr><td><code>Ctrl + Shift + D</code></td><td>Open the drawing studio</td></tr>
<tr><td><code>Ctrl + Shift + F</code></td><td>Toggle focus mode</td></tr>
</tbody>
</table>
<blockquote>Tip: switch to Turkish anytime from <strong>Settings → Language</strong>.</blockquote>
"""

SEED_WELCOME_TR = """
<p class="callout">Notlarınız, fikirleriniz ve çizimleriniz için sakin bir alan. Her şey bu cihazda kalır.</p>
<h2>Neler yapabilirsiniz?</h2>
<ul>
<li><strong>Yazın ve biçimlendirin</strong> — başlıklar, kontrol listeleri, alıntılar, kod ve tablolar.</li>
<li><strong>Çizin</strong> — çizim stüdyosunu açın ve sonucu doğrudan notunuza ekleyin.</li>
<li><strong>Görsel ekleyin</strong> — panodan yapıştırın, sürükleyip bırakın veya görsel düğmesini kullanın.</li>
<li><strong>Düzenli kalın</strong> — defterler, etiketler, favoriler, sabitleme ve anında arama.</li>
</ul>
<h2>Kullanışlı kısayollar</h2>
<table>
<thead><tr><th>Kısayol</th><th>İşlem</th></tr></thead>
<tbody>
<tr><td><code>Ctrl + N</code></td><td>Yeni not oluştur</td></tr>
<tr><td><code>Ctrl + K</code></td><td>Komut paletini aç</td></tr>
<tr><td><code>Ctrl + F</code></td><td>Notlarda ara</td></tr>
<tr><td><code>Ctrl + Shift + D</code></td><td>Çizim stüdyosunu aç</td></tr>
<tr><td><code>Ctrl + Shift + F</code></td><td>Odak modunu aç/kapat</td></tr>
</tbody>
</table>
<blockquote>İpucu: Dilerseniz <strong>Ayarlar → Dil</strong> bölümünden arayüz dilini değiştirebilirsiniz.</blockquote>
"""

SEED_FORMATTING = """
<p>This note shows a few of the blocks you can create. Select text and use the toolbar, or use the shortcuts you already know.</p>
<h2>Headings</h2>
<h3>Third level heading</h3>
<p>Normal text can be <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, <s>struck through</s> or <mark>highlighted</mark>.</p>
<h2>Checklist</h2>
<ul class="checklist">
<li data-checked="true"><span class="chk" contenteditable="false"></span><span class="chk-text">Create your first notebook</span></li>
<li data-checked="true"><span class="chk" contenteditable="false"></span><span class="chk-text">Try the drawing studio</span></li>
<li data-checked="false"><span class="chk" contenteditable="false"></span><span class="chk-text">Write down an idea worth keeping</span></li>
</ul>
<h2>Quote and code</h2>
<blockquote>Small notes, collected often, become a second brain.</blockquote>
<pre><code>print("Hello from Notra")</code></pre>
<h2>Table</h2>
<table>
<thead><tr><th>Feature</th><th>Where</th></tr></thead>
<tbody>
<tr><td>Notebooks</td><td>Left sidebar</td></tr>
<tr><td>Tags</td><td>Below the note title</td></tr>
<tr><td>Drawing</td><td>Toolbar pencil button</td></tr>
</tbody>
</table>
<p class="muted">Delete this note whenever you are ready.</p>
"""


class Store:
    def __init__(self, data_dir: str | Path, seed: bool = True) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir = self.data_dir / "backups"
        self.backup_dir.mkdir(exist_ok=True)
        self.db_path = self.data_dir / "notra.db"
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False, timeout=15)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.execute("PRAGMA temp_store=MEMORY")
            self._create_schema()
            if seed:
                self._seed_if_needed()
            self.auto_backup()

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.commit()
                self._conn.close()
            except Exception:
                pass

    def _create_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'amber',
                icon TEXT NOT NULL DEFAULT 'book',
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                plain_text TEXT NOT NULL DEFAULT '',
                group_id TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                color TEXT NOT NULL DEFAULT 'default',
                pinned INTEGER NOT NULL DEFAULT 0,
                favorite INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                trashed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                trashed_at TEXT,
                word_count INTEGER NOT NULL DEFAULT 0,
                char_count INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_notes_group ON notes(group_id);
            CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_notes_flags ON notes(trashed, archived, favorite, pinned);
            CREATE INDEX IF NOT EXISTS idx_groups_sort ON groups(sort, created_at);

            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                note_id UNINDEXED,
                title,
                plain_text,
                tags,
                tokenize='unicode61 remove_diacritics 2'
            );

            CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                plain_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_revisions_note ON revisions(note_id, id DESC);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        self._conn.commit()

    def _seed_if_needed(self) -> None:
        seeded = self._conn.execute("SELECT value FROM meta WHERE key='seeded'").fetchone()
        if seeded:
            return
        if self._conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] > 0:
            self._conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('seeded', '1')")
            self._conn.commit()
            return
        now = utcnow()
        group_id = str(uuid.uuid4())
        self._conn.execute(
            "INSERT INTO groups(id, name, color, icon, sort, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
            (group_id, "Getting started", "amber", "book", 0, now, now),
        )
        self._insert_note(
            {
                "title": "Welcome to Notra",
                "content": SEED_WELCOME_EN,
                "group_id": group_id,
                "tags": ["welcome", "guide"],
                "pinned": 1,
                "favorite": 1,
                "created_at": now,
                "updated_at": now,
            }
        )
        self._insert_note(
            {
                "title": "Hoş geldiniz",
                "content": SEED_WELCOME_TR,
                "group_id": group_id,
                "tags": ["welcome", "türkçe"],
                "created_at": now,
                "updated_at": now,
            }
        )
        self._insert_note(
            {
                "title": "Formatting & shortcuts",
                "content": SEED_FORMATTING,
                "group_id": group_id,
                "tags": ["guide"],
                "created_at": now,
                "updated_at": now,
            }
        )
        self._conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('seeded', '1')")
        self._conn.commit()

    def _insert_note(self, data: dict[str, Any]) -> str:
        note_id = data.get("id") or str(uuid.uuid4())
        title = str(data.get("title", ""))[:500]
        content = str(data.get("content", ""))
        plain_text = data.get("plain_text")
        if plain_text is None:
            plain_text = html_to_text(content)
        plain_text = str(plain_text)[:200000]
        tags = self._clean_tags(data.get("tags") or [])
        now = utcnow()
        created_at = data.get("created_at") or now
        updated_at = data.get("updated_at") or now
        group_id = data.get("group_id")
        if group_id and not self._conn.execute("SELECT 1 FROM groups WHERE id=?", (group_id,)).fetchone():
            group_id = None
        color = data.get("color", "default")
        if color not in COLORS:
            color = "default"
        self._conn.execute(
            """
            INSERT INTO notes(id, title, content, plain_text, group_id, tags, color, pinned,
                              favorite, archived, trashed, created_at, updated_at, trashed_at,
                              word_count, char_count)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                note_id,
                title,
                content,
                plain_text,
                group_id,
                json.dumps(tags, ensure_ascii=False),
                color,
                1 if data.get("pinned") else 0,
                1 if data.get("favorite") else 0,
                1 if data.get("archived") else 0,
                1 if data.get("trashed") else 0,
                created_at,
                updated_at,
                data.get("trashed_at"),
                count_words(plain_text),
                len(plain_text),
            ),
        )
        self._sync_fts(note_id)
        return note_id

    @staticmethod
    def _clean_tags(tags: Any) -> list[str]:
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = []
        if not isinstance(tags, (list, tuple, set)):
            return []
        result: list[str] = []
        seen: set[str] = set()
        for item in tags:
            tag = normalize_tag(str(item))
            key = tag.casefold()
            if tag and key not in seen:
                seen.add(key)
                result.append(tag)
        return result[:40]

    def _sync_fts(self, note_id: str) -> None:
        self._conn.execute("DELETE FROM notes_fts WHERE note_id=?", (note_id,))
        row = self._conn.execute(
            "SELECT title, plain_text, tags FROM notes WHERE id=?", (note_id,)
        ).fetchone()
        if row:
            tags_text = " ".join(json.loads(row["tags"] or "[]"))
            self._conn.execute(
                "INSERT INTO notes_fts(note_id, title, plain_text, tags) VALUES(?,?,?,?)",
                (note_id, row["title"], row["plain_text"], tags_text),
            )

    def _note_from_row(self, row: sqlite3.Row, include_content: bool = False, query: str = "") -> dict[str, Any]:
        try:
            tags = json.loads(row["tags"] or "[]")
        except Exception:
            tags = []
        item: dict[str, Any] = {
            "id": row["id"],
            "title": row["title"],
            "group_id": row["group_id"],
            "tags": tags,
            "color": row["color"],
            "pinned": bool(row["pinned"]),
            "favorite": bool(row["favorite"]),
            "archived": bool(row["archived"]),
            "trashed": bool(row["trashed"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "trashed_at": row["trashed_at"],
            "word_count": row["word_count"],
            "char_count": row["char_count"],
            "excerpt": make_excerpt(row["plain_text"], query),
        }
        if include_content:
            item["content"] = row["content"]
            item["plain_text"] = row["plain_text"]
            item["revision_count"] = self._conn.execute(
                "SELECT COUNT(*) FROM revisions WHERE note_id=?", (row["id"],)
            ).fetchone()[0]
        return item

    def _note_row(self, note_id: str) -> sqlite3.Row | None:
        return self._conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()

    def _fts_query(self, query: str) -> str:
        tokens = [t for t in re.findall(r"[^\W_]+", query, re.UNICODE) if len(t) > 0]
        return " AND ".join('"' + token.replace('"', '""') + '"*' for token in tokens)

    def list_notes(
        self,
        view: str = "all",
        group_id: str | None = None,
        tag: str | None = None,
        query: str = "",
        sort: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            query = (query or "").strip()
            sort = sort or self.settings().get("sort", "updated_desc")
            where: list[str] = []
            params: list[Any] = []
            if view == "trash":
                where.append("n.trashed=1")
            elif view == "archive":
                where.append("n.trashed=0 AND n.archived=1")
            elif view == "favorites":
                where.append("n.trashed=0 AND n.archived=0 AND n.favorite=1")
            elif view == "group":
                where.append("n.trashed=0 AND n.archived=0 AND n.group_id=?")
                params.append(group_id)
            elif view == "tag":
                where.append(
                    "n.trashed=0 AND n.archived=0 AND EXISTS (SELECT 1 FROM json_each(n.tags) j WHERE lower(j.value)=lower(?))"
                )
                params.append(tag or "")
            else:
                where.append("n.trashed=0 AND n.archived=0")
            if query:
                match = self._fts_query(query)
                use_fts = False
                if match:
                    try:
                        self._conn.execute("SELECT 1 FROM notes_fts WHERE notes_fts MATCH ? LIMIT 1", (match,))
                        use_fts = True
                    except sqlite3.OperationalError:
                        use_fts = False
                if use_fts:
                    where.append("n.id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?)")
                    params.append(match)
                else:
                    like = f"%{query}%"
                    where.append("(n.title LIKE ? OR n.plain_text LIKE ? OR n.tags LIKE ?)")
                    params.extend([like, like, like])
            order = {
                "updated_desc": "n.updated_at DESC",
                "created_desc": "n.created_at DESC",
                "title_asc": "lower(n.title) ASC, n.updated_at DESC",
                "words_desc": "n.word_count DESC, n.updated_at DESC",
            }.get(sort, "n.updated_at DESC")
            if view == "trash":
                order = "n.trashed_at DESC, n.updated_at DESC"
            sql = (
                "SELECT n.* FROM notes n WHERE " + " AND ".join(where) +
                f" ORDER BY n.pinned DESC, {order} LIMIT 2000"
            )
            rows = self._conn.execute(sql, params).fetchall()
            return [self._note_from_row(row, query=query) for row in rows]

    def get_note(self, note_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._note_row(note_id)
            if not row:
                return None
            item = self._note_from_row(row, include_content=True)
            group = None
            if row["group_id"]:
                grow = self._conn.execute("SELECT * FROM groups WHERE id=?", (row["group_id"],)).fetchone()
                if grow:
                    group = dict(grow)
            item["group"] = group
            return item

    def create_note(
        self,
        title: str = "",
        content: str = "",
        group_id: str | None = None,
        tags: list[str] | None = None,
        color: str = "default",
    ) -> dict[str, Any]:
        with self._lock:
            note_id = self._insert_note(
                {
                    "title": title,
                    "content": content,
                    "group_id": group_id,
                    "tags": tags or [],
                    "color": color,
                }
            )
            self._conn.commit()
            return self.get_note(note_id) or {}

    def save_note(self, note_id: str, title: str, content: str, plain_text: str | None = None) -> dict[str, Any]:
        with self._lock:
            row = self._note_row(note_id)
            if not row:
                return self.create_note(title=title, content=content)
            title = str(title or "")[:500]
            content = str(content or "")
            plain_text = html_to_text(content) if plain_text is None else str(plain_text)
            plain_text = plain_text[:200000]
            changed = title != row["title"] or content != row["content"]
            now = utcnow()
            if changed:
                last = self._conn.execute(
                    "SELECT created_at FROM revisions WHERE note_id=? ORDER BY id DESC LIMIT 1",
                    (note_id,),
                ).fetchone()
                last_time = parse_time(last["created_at"]) if last else None
                current_time = parse_time(now)
                if current_time and (not last_time or (current_time - last_time).total_seconds() >= 120):
                    self._conn.execute(
                        "INSERT INTO revisions(note_id, title, content, plain_text, created_at) VALUES(?,?,?,?,?)",
                        (note_id, row["title"], row["content"], row["plain_text"], now),
                    )
                    self._conn.execute(
                        """
                        DELETE FROM revisions WHERE note_id=? AND id NOT IN (
                            SELECT id FROM revisions WHERE note_id=? ORDER BY id DESC LIMIT 40
                        )
                        """,
                        (note_id, note_id),
                    )
            self._conn.execute(
                "UPDATE notes SET title=?, content=?, plain_text=?, updated_at=?, word_count=?, char_count=? WHERE id=?",
                (title, content, plain_text, now, count_words(plain_text), len(plain_text), note_id),
            )
            self._sync_fts(note_id)
            self._conn.commit()
            return self.get_note(note_id) or {}

    def patch_note(self, note_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            row = self._note_row(note_id)
            if not row:
                return None
            fields: list[str] = []
            params: list[Any] = []
            if "title" in patch:
                fields.append("title=?")
                params.append(str(patch["title"] or "")[:500])
            if "tags" in patch:
                fields.append("tags=?")
                params.append(json.dumps(self._clean_tags(patch["tags"]), ensure_ascii=False))
            if "group_id" in patch:
                group_id = patch["group_id"]
                if group_id and not self._conn.execute("SELECT 1 FROM groups WHERE id=?", (group_id,)).fetchone():
                    group_id = None
                fields.append("group_id=?")
                params.append(group_id)
            if "color" in patch:
                color = patch["color"]
                fields.append("color=?")
                params.append(color if color in COLORS else "default")
            for key in ("pinned", "favorite", "archived", "trashed"):
                if key in patch:
                    fields.append(f"{key}=?")
                    params.append(1 if patch[key] else 0)
            if "trashed" in patch:
                fields.append("trashed_at=?")
                params.append(utcnow() if patch["trashed"] else None)
            if not fields:
                return self.get_note(note_id)
            fields.append("updated_at=?")
            params.append(utcnow())
            params.append(note_id)
            self._conn.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id=?", params)
            self._sync_fts(note_id)
            self._conn.commit()
            return self.get_note(note_id)

    def bulk_patch(self, note_ids: list[str], patch: dict[str, Any]) -> list[dict[str, Any]]:
        with self._lock:
            result = []
            for note_id in note_ids or []:
                item = self.patch_note(note_id, patch)
                if item:
                    result.append(item)
            return result

    def trash_notes(self, note_ids: list[str]) -> list[str]:
        with self._lock:
            now = utcnow()
            ids = list(dict.fromkeys(note_ids or []))
            for note_id in ids:
                self._conn.execute(
                    "UPDATE notes SET trashed=1, trashed_at=?, updated_at=? WHERE id=?",
                    (now, now, note_id),
                )
            self._conn.commit()
            return ids

    def restore_notes(self, note_ids: list[str]) -> list[str]:
        with self._lock:
            now = utcnow()
            ids = list(dict.fromkeys(note_ids or []))
            for note_id in ids:
                self._conn.execute(
                    "UPDATE notes SET trashed=0, trashed_at=NULL, updated_at=? WHERE id=?",
                    (now, note_id),
                )
            self._conn.commit()
            return ids

    def delete_notes(self, note_ids: list[str]) -> list[str]:
        with self._lock:
            ids = list(dict.fromkeys(note_ids or []))
            for note_id in ids:
                self._conn.execute("DELETE FROM notes_fts WHERE note_id=?", (note_id,))
                self._conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
            self._conn.commit()
            return ids

    def empty_trash(self) -> int:
        with self._lock:
            rows = self._conn.execute("SELECT id FROM notes WHERE trashed=1").fetchall()
            self.delete_notes([row["id"] for row in rows])
            return len(rows)

    def duplicate_note(self, note_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._note_row(note_id)
            if not row:
                return None
            tags = json.loads(row["tags"] or "[]")
            title = row["title"] or "Untitled"
            note_id_new = self._insert_note(
                {
                    "title": f"{title} (copy)",
                    "content": row["content"],
                    "plain_text": row["plain_text"],
                    "group_id": row["group_id"],
                    "tags": tags,
                    "color": row["color"],
                    "favorite": row["favorite"],
                }
            )
            self._conn.commit()
            return self.get_note(note_id_new)

    def create_group(self, name: str, color: str = "amber", icon: str = "book") -> dict[str, Any]:
        with self._lock:
            name = re.sub(r"\s+", " ", str(name or "").strip())[:60]
            if not name:
                raise ValueError("group_name_required")
            existing = self._conn.execute("SELECT 1 FROM groups WHERE lower(name)=lower(?)", (name,)).fetchone()
            if existing:
                raise ValueError("group_exists")
            now = utcnow()
            sort = self._conn.execute("SELECT COALESCE(MAX(sort), -1) + 1 FROM groups").fetchone()[0]
            group_id = str(uuid.uuid4())
            self._conn.execute(
                "INSERT INTO groups(id, name, color, icon, sort, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
                (group_id, name, color if color in COLORS else "amber", icon if icon in GROUP_ICONS else "book", sort, now, now),
            )
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM groups WHERE id=?", (group_id,)).fetchone())

    def update_group(self, group_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM groups WHERE id=?", (group_id,)).fetchone()
            if not row:
                return None
            fields: list[str] = []
            params: list[Any] = []
            if "name" in patch:
                name = re.sub(r"\s+", " ", str(patch["name"] or "").strip())[:60]
                if not name:
                    raise ValueError("group_name_required")
                duplicate = self._conn.execute(
                    "SELECT 1 FROM groups WHERE lower(name)=lower(?) AND id<>?", (name, group_id)
                ).fetchone()
                if duplicate:
                    raise ValueError("group_exists")
                fields.append("name=?")
                params.append(name)
            if "color" in patch:
                fields.append("color=?")
                params.append(patch["color"] if patch["color"] in COLORS else "amber")
            if "icon" in patch:
                fields.append("icon=?")
                params.append(patch["icon"] if patch["icon"] in GROUP_ICONS else "book")
            if not fields:
                return dict(row)
            fields.append("updated_at=?")
            params.append(utcnow())
            params.append(group_id)
            self._conn.execute(f"UPDATE groups SET {', '.join(fields)} WHERE id=?", params)
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM groups WHERE id=?", (group_id,)).fetchone())

    def delete_group(self, group_id: str, mode: str = "keep_notes") -> bool:
        with self._lock:
            if not self._conn.execute("SELECT 1 FROM groups WHERE id=?", (group_id,)).fetchone():
                return False
            if mode == "delete_notes":
                now = utcnow()
                self._conn.execute(
                    "UPDATE notes SET trashed=1, trashed_at=?, updated_at=? WHERE group_id=? AND trashed=0",
                    (now, now, group_id),
                )
            self._conn.execute("UPDATE notes SET group_id=NULL WHERE group_id=?", (group_id,))
            self._conn.execute("DELETE FROM groups WHERE id=?", (group_id,))
            self._conn.commit()
            return True

    def reorder_groups(self, group_ids: list[str]) -> None:
        with self._lock:
            for index, group_id in enumerate(group_ids or []):
                self._conn.execute("UPDATE groups SET sort=? WHERE id=?", (index, group_id))
            self._conn.commit()

    def rename_tag(self, old: str, new: str) -> int:
        with self._lock:
            old = normalize_tag(old)
            new = normalize_tag(new)
            if not old or not new:
                raise ValueError("tag_required")
            rows = self._conn.execute("SELECT id, tags FROM notes").fetchall()
            changed = 0
            for row in rows:
                try:
                    tags = json.loads(row["tags"] or "[]")
                except Exception:
                    tags = []
                updated: list[str] = []
                touched = False
                for tag in tags:
                    if str(tag).casefold() == old.casefold():
                        touched = True
                        if new.casefold() not in {t.casefold() for t in updated}:
                            updated.append(new)
                    else:
                        updated.append(tag)
                if touched:
                    self._conn.execute(
                        "UPDATE notes SET tags=?, updated_at=? WHERE id=?",
                        (json.dumps(updated, ensure_ascii=False), utcnow(), row["id"]),
                    )
                    self._sync_fts(row["id"])
                    changed += 1
            self._conn.commit()
            return changed

    def delete_tag(self, tag: str) -> int:
        with self._lock:
            tag = normalize_tag(tag)
            rows = self._conn.execute("SELECT id, tags FROM notes").fetchall()
            changed = 0
            for row in rows:
                try:
                    tags = json.loads(row["tags"] or "[]")
                except Exception:
                    tags = []
                updated = [t for t in tags if str(t).casefold() != tag.casefold()]
                if len(updated) != len(tags):
                    self._conn.execute(
                        "UPDATE notes SET tags=?, updated_at=? WHERE id=?",
                        (json.dumps(updated, ensure_ascii=False), utcnow(), row["id"]),
                    )
                    self._sync_fts(row["id"])
                    changed += 1
            self._conn.commit()
            return changed

    def groups(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT g.*, COALESCE(SUM(CASE WHEN n.trashed=0 AND n.archived=0 THEN 1 ELSE 0 END), 0) AS note_count
                FROM groups g LEFT JOIN notes n ON n.group_id=g.id
                GROUP BY g.id ORDER BY g.sort, g.created_at
                """
            ).fetchall()
            return [dict(row) for row in rows]

    def tags(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT tags FROM notes WHERE trashed=0 AND archived=0").fetchall()
            counts: dict[str, int] = {}
            display: dict[str, str] = {}
            for row in rows:
                try:
                    tags = json.loads(row["tags"] or "[]")
                except Exception:
                    tags = []
                for tag in tags:
                    key = str(tag).casefold()
                    if not key:
                        continue
                    counts[key] = counts.get(key, 0) + 1
                    display.setdefault(key, str(tag))
            return [
                {"name": display[key], "count": count}
                for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
            ]

    def counts(self) -> dict[str, int]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT
                    SUM(CASE WHEN trashed=0 AND archived=0 THEN 1 ELSE 0 END) AS all_notes,
                    SUM(CASE WHEN trashed=0 AND archived=0 AND favorite=1 THEN 1 ELSE 0 END) AS favorites,
                    SUM(CASE WHEN trashed=0 AND archived=1 THEN 1 ELSE 0 END) AS archived,
                    SUM(CASE WHEN trashed=1 THEN 1 ELSE 0 END) AS trash,
                    SUM(CASE WHEN trashed=0 AND archived=0 AND pinned=1 THEN 1 ELSE 0 END) AS pinned,
                    SUM(CASE WHEN trashed=0 THEN word_count ELSE 0 END) AS words
                FROM notes
                """
            ).fetchone()
            return {
                "all": int(row["all_notes"] or 0),
                "favorites": int(row["favorites"] or 0),
                "archive": int(row["archived"] or 0),
                "trash": int(row["trash"] or 0),
                "pinned": int(row["pinned"] or 0),
                "words": int(row["words"] or 0),
            }

    def meta(self) -> dict[str, Any]:
        with self._lock:
            groups = self.groups()
            tags = self.tags()
            counts = self.counts()
            revisions = self._conn.execute("SELECT COUNT(*) FROM revisions").fetchone()[0]
            return {
                "groups": groups,
                "tags": tags,
                "counts": counts,
                "revisions": revisions,
                "data_dir": str(self.data_dir),
            }

    def settings(self) -> dict[str, Any]:
        with self._lock:
            result = dict(DEFAULT_SETTINGS)
            rows = self._conn.execute("SELECT key, value FROM settings").fetchall()
            for row in rows:
                if row["key"] not in DEFAULT_SETTINGS:
                    continue
                try:
                    result[row["key"]] = json.loads(row["value"])
                except Exception:
                    result[row["key"]] = row["value"]
            return self._validate_settings(result)

    @staticmethod
    def _validate_settings(value: dict[str, Any]) -> dict[str, Any]:
        result = dict(DEFAULT_SETTINGS)
        result.update(value or {})
        if result.get("language") not in {"en", "tr"}:
            result["language"] = "en"
        if result.get("theme") not in {"system", "light", "dark"}:
            result["theme"] = "system"
        if result.get("accent") not in {"amber", "teal", "violet", "rose", "blue", "green"}:
            result["accent"] = "amber"
        if result.get("sort") not in {"updated_desc", "created_desc", "title_asc", "words_desc"}:
            result["sort"] = "updated_desc"
        try:
            result["font_size"] = min(24, max(13, int(result.get("font_size", 17))))
        except Exception:
            result["font_size"] = 17
        if result.get("font_family") not in {"sans", "serif", "mono"}:
            result["font_family"] = "sans"
        for key in ("spellcheck", "show_word_count", "compact_list", "window_maximized"):
            result[key] = bool(result.get(key))
        if result.get("default_view") not in {"all", "favorites", "archive"}:
            result["default_view"] = "all"
        try:
            result["window_width"] = min(4000, max(900, int(result.get("window_width", 1460))))
        except Exception:
            result["window_width"] = 1460
        try:
            result["window_height"] = min(3000, max(600, int(result.get("window_height", 940))))
        except Exception:
            result["window_height"] = 940
        return result

    def save_settings(self, patch: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self.settings()
            current.update(patch or {})
            current = self._validate_settings(current)
            for key, value in current.items():
                self._conn.execute(
                    "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                    (key, json.dumps(value, ensure_ascii=False)),
                )
            self._conn.commit()
            return current

    def revisions(self, note_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, note_id, title, content, plain_text, created_at FROM revisions WHERE note_id=? ORDER BY id DESC LIMIT 40",
                (note_id,),
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "note_id": row["note_id"],
                    "title": row["title"],
                    "content": row["content"],
                    "created_at": row["created_at"],
                    "word_count": count_words(row["plain_text"]),
                    "excerpt": make_excerpt(row["plain_text"], length=140),
                }
                for row in rows
            ]

    def restore_revision(self, note_id: str, revision_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._note_row(note_id)
            rev = self._conn.execute(
                "SELECT * FROM revisions WHERE id=? AND note_id=?", (revision_id, note_id)
            ).fetchone()
            if not row or not rev:
                return None
            now = utcnow()
            self._conn.execute(
                "INSERT INTO revisions(note_id, title, content, plain_text, created_at) VALUES(?,?,?,?,?)",
                (note_id, row["title"], row["content"], row["plain_text"], now),
            )
            self._conn.execute(
                "UPDATE notes SET title=?, content=?, plain_text=?, updated_at=?, word_count=?, char_count=? WHERE id=?",
                (
                    rev["title"], rev["content"], rev["plain_text"], now,
                    count_words(rev["plain_text"]), len(rev["plain_text"]), note_id,
                ),
            )
            self._sync_fts(note_id)
            self._conn.commit()
            return self.get_note(note_id)

    def export_payload(self) -> dict[str, Any]:
        with self._lock:
            groups = [dict(row) for row in self._conn.execute("SELECT * FROM groups ORDER BY sort, created_at").fetchall()]
            notes = []
            for row in self._conn.execute("SELECT * FROM notes ORDER BY created_at").fetchall():
                item = self._note_from_row(row, include_content=True)
                notes.append(item)
            return {
                "app": APP_NAME,
                "version": APP_VERSION,
                "exported_at": utcnow(),
                "settings": self.settings(),
                "groups": groups,
                "notes": notes,
            }

    def import_payload(self, payload: dict[str, Any], mode: str = "merge") -> dict[str, int]:
        with self._lock:
            if not isinstance(payload, dict) or not isinstance(payload.get("notes"), list):
                raise ValueError("invalid_backup")
            backup_path = None
            if mode == "replace":
                backup_path = self._export_file_backup()
                self._conn.execute("DELETE FROM revisions")
                self._conn.execute("DELETE FROM notes_fts")
                self._conn.execute("DELETE FROM notes")
                self._conn.execute("DELETE FROM groups")
            group_map: dict[str, str] = {}
            group_count = 0
            for group in payload.get("groups") or []:
                if not isinstance(group, dict):
                    continue
                name = re.sub(r"\s+", " ", str(group.get("name") or "").strip())[:60]
                if not name:
                    continue
                existing = None if mode == "replace" else self._conn.execute(
                    "SELECT id FROM groups WHERE lower(name)=lower(?)", (name,)
                ).fetchone()
                if existing:
                    new_id = existing["id"]
                else:
                    new_id = str(uuid.uuid4())
                    now = utcnow()
                    self._conn.execute(
                        "INSERT INTO groups(id, name, color, icon, sort, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
                        (
                            new_id, name,
                            group.get("color") if group.get("color") in COLORS else "amber",
                            group.get("icon") if group.get("icon") in GROUP_ICONS else "book",
                            int(group.get("sort") or group_count), now, now,
                        ),
                    )
                    group_count += 1
                old_id = str(group.get("id") or "")
                if old_id:
                    group_map[old_id] = new_id
            note_count = 0
            for note in payload.get("notes") or []:
                if not isinstance(note, dict):
                    continue
                group_id = group_map.get(str(note.get("group_id") or ""))
                self._insert_note(
                    {
                        "title": note.get("title") or "",
                        "content": note.get("content") or "",
                        "plain_text": note.get("plain_text") or html_to_text(note.get("content") or ""),
                        "group_id": group_id,
                        "tags": note.get("tags") or [],
                        "color": note.get("color") or "default",
                        "favorite": note.get("favorite"),
                        "archived": note.get("archived"),
                        "trashed": note.get("trashed"),
                        "created_at": note.get("created_at"),
                        "updated_at": note.get("updated_at"),
                        "trashed_at": note.get("trashed_at"),
                    }
                )
                note_count += 1
            if "settings" in payload and isinstance(payload["settings"], dict):
                self.save_settings(payload["settings"])
            self._conn.commit()
            return {"groups": group_count, "notes": note_count, "backup": backup_path or ""}

    def _export_file_backup(self) -> str:
        path = self.backup_dir / f"before-import-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
        try:
            dest = sqlite3.connect(str(path))
            self._conn.backup(dest)
            dest.close()
            return str(path)
        except Exception:
            return ""

    def auto_backup(self) -> str:
        with self._lock:
            try:
                stamp = datetime.now().strftime("%Y-%m-%d")
                target = self.backup_dir / f"notra-{stamp}.db"
                if target.exists():
                    return str(target)
                dest = sqlite3.connect(str(target))
                self._conn.backup(dest)
                dest.close()
                backups = sorted(self.backup_dir.glob("notra-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
                for old in backups[14:]:
                    try:
                        old.unlink()
                    except Exception:
                        pass
                return str(target)
            except Exception:
                return ""

    def stats(self) -> dict[str, Any]:
        with self._lock:
            counts = self.counts()
            size = 0
            for suffix in ("", "-wal", "-shm"):
                path = Path(str(self.db_path) + suffix)
                if path.exists():
                    size += path.stat().st_size
            backups = sorted(self.backup_dir.glob("notra-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(timespec="seconds")
            recent = self._conn.execute(
                "SELECT COUNT(*) FROM notes WHERE created_at>=? AND trashed=0", (week_ago,)
            ).fetchone()[0]
            words = self._conn.execute(
                "SELECT COALESCE(SUM(word_count), 0) FROM notes WHERE trashed=0"
            ).fetchone()[0]
            return {
                **counts,
                "notes": counts["all"],
                "words": int(words or 0),
                "groups": len(self.groups()),
                "tags": len(self.tags()),
                "revisions": self._conn.execute("SELECT COUNT(*) FROM revisions").fetchone()[0],
                "storage_bytes": size,
                "recent_notes": recent,
                "last_backup": str(backups[0]) if backups else "",
                "db_path": str(self.db_path),
                "data_dir": str(self.data_dir),
            }

    def app_info(self) -> dict[str, Any]:
        return {
            "name": APP_NAME,
            "version": APP_VERSION,
            "data_dir": str(self.data_dir),
            "db_path": str(self.db_path),
        }
