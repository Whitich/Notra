(() => {
  'use strict';
  const enabled = new URLSearchParams(window.location.search).has('mock') || window.location.hash.includes('mock');
  if (!enabled) return;

  const now = Date.now();
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  const strip = (html) => {
    const node = document.createElement('div');
    node.innerHTML = String(html || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre)>/gi, '$& ');
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const words = (text) => {
    const clean = String(text || '').trim();
    return clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  };
  const excerpt = (html) => strip(html).replace(/\s+/g, ' ').trim().slice(0, 160);

  const groups = [
    { id: 'grp_work', name: 'Work', color: 'blue', icon: 'briefcase', created_at: iso(30000), updated_at: iso(3000) },
    { id: 'grp_ideas', name: 'Ideas', color: 'amber', icon: 'bulb', created_at: iso(28000), updated_at: iso(2000) },
    { id: 'grp_journal', name: 'Journal', color: 'teal', icon: 'book', created_at: iso(26000), updated_at: iso(1000) }
  ];

  let notes = [
    {
      id: 'note_welcome',
      title: 'Welcome to Notra',
      content: `<p>Notra is a quiet place for everything you want to remember. Write, sketch, connect ideas, and keep it all on your own computer.</p><h2>A few things to try</h2><ul class="checklist"><li data-checked="true"><span class="chk" contenteditable="false"></span><span class="chk-text">Create a note and give it a title</span></li><li data-checked="false"><span class="chk" contenteditable="false"></span><span class="chk-text">Add a drawing with the pen button</span></li><li data-checked="false"><span class="chk" contenteditable="false"></span><span class="chk-text">Organize notes into notebooks and tags</span></li></ul><blockquote>Small notes, kept close, become a map of how you think.</blockquote><p>Press <code>Ctrl + K</code> at any time to jump to a note or run a command.</p>`,
      group_id: 'grp_ideas',
      tags: ['welcome', 'getting-started'],
      color: 'amber',
      pinned: true,
      favorite: true,
      archived: false,
      trashed: false,
      created_at: iso(8000),
      updated_at: iso(18)
    },
    {
      id: 'note_product',
      title: 'Spring product roadmap',
      content: `<h2>Q2 priorities</h2><p>The focus this quarter is making the first five minutes feel effortless.</p><ul><li>Simplify onboarding and sample content</li><li>Ship faster search and keyboard navigation</li><li>Improve export and backup confidence</li></ul><h3>Open questions</h3><p>What should a brand-new notebook contain? Where do templates fit without adding clutter?</p><table><tbody><tr><th>Area</th><th>Owner</th><th>Status</th></tr><tr><td>Onboarding</td><td>Mina</td><td>In progress</td></tr><tr><td>Search</td><td>Leo</td><td>Review</td></tr></tbody></table>`,
      group_id: 'grp_work',
      tags: ['product', 'planning'],
      color: 'blue',
      pinned: true,
      favorite: false,
      archived: false,
      trashed: false,
      created_at: iso(4200),
      updated_at: iso(82)
    },
    {
      id: 'note_reading',
      title: 'Reading list',
      content: `<p>Books and essays to return to when the noise settles.</p><ol><li><strong>The Creative Act</strong> — Rick Rubin</li><li><strong>Ways of Seeing</strong> — John Berger</li><li><strong>A Pattern Language</strong> — Christopher Alexander</li></ol><p><em>Add a line when something stays with you.</em></p>`,
      group_id: 'grp_journal',
      tags: ['books', 'personal'],
      color: 'violet',
      pinned: false,
      favorite: true,
      archived: false,
      trashed: false,
      created_at: iso(6100),
      updated_at: iso(180)
    },
    {
      id: 'note_sketch',
      title: 'Sketchbook study',
      content: `<p>Morning pages and loose thumbnails. The goal is volume, not polish.</p><p>Warm-up: ten small boxes, five lines each, no erasing.</p>`,
      group_id: 'grp_ideas',
      tags: ['drawing', 'practice'],
      color: 'rose',
      pinned: false,
      favorite: false,
      archived: false,
      trashed: false,
      created_at: iso(2500),
      updated_at: iso(340)
    },
    {
      id: 'note_meeting',
      title: 'Weekly sync notes',
      content: `<h3>Decisions</h3><ul><li>Keep the desktop layout three-column.</li><li>Move version history into the status bar.</li></ul><p>Next check-in: Thursday at 10:00.</p>`,
      group_id: 'grp_work',
      tags: ['meetings', 'product'],
      color: 'default',
      pinned: false,
      favorite: false,
      archived: false,
      trashed: false,
      created_at: iso(1200),
      updated_at: iso(700)
    },
    {
      id: 'note_archive',
      title: 'Old launch checklist',
      content: `<p>Archived notes stay out of the way but remain searchable when you need them.</p>`,
      group_id: 'grp_work',
      tags: ['archive'],
      color: 'slate',
      pinned: false,
      favorite: false,
      archived: true,
      trashed: false,
      created_at: iso(18000),
      updated_at: iso(12000)
    },
    {
      id: 'note_trash',
      title: 'Scratch note',
      content: `<p>Nothing important here.</p>`,
      group_id: null,
      tags: [],
      color: 'default',
      pinned: false,
      favorite: false,
      archived: false,
      trashed: true,
      created_at: iso(9000),
      updated_at: iso(9000)
    }
  ].map((note) => ({
    ...note,
    archived_at: note.archived ? note.updated_at : null,
    trashed_at: note.trashed ? note.updated_at : null
  }));

  let revisions = {};
  const seedRevision = (note) => {
    revisions[note.id] = [
      {
        id: 2,
        note_id: note.id,
        title: note.title,
        content: note.content,
        word_count: words(strip(note.content)),
        excerpt: excerpt(note.content),
        created_at: iso(240)
      },
      {
        id: 1,
        note_id: note.id,
        title: note.title,
        content: `<p>${excerpt(note.content) || 'First draft'}</p>`,
        word_count: 4,
        excerpt: excerpt(note.content),
        created_at: iso(1440)
      }
    ];
  };
  notes.filter((note) => !note.trashed).slice(0, 3).forEach(seedRevision);

  let settings = {
    language: 'en',
    theme: 'dark',
    accent: 'amber',
    sort: 'updated_desc',
    font_size: 17,
    font_family: 'sans',
    spellcheck: true,
    show_word_count: true,
    compact_list: false,
    default_view: 'all',
    version: '1.0.0'
  };

  const groupFor = (note) => groups.find((group) => group.id === note.group_id) || null;
  const hydrate = (note) => {
    const plain = note.content || '';
    return {
      ...note,
      group: groupFor(note),
      word_count: words(strip(plain)),
      excerpt: excerpt(plain)
    };
  };
  const noteById = (id) => notes.find((note) => note.id === id);

  const meta = () => ({
    groups: groups.map((group) => ({
      ...group,
      note_count: notes.filter((note) => note.group_id === group.id && !note.trashed && !note.archived).length
    })),
    tags: Array.from(notes.reduce((map, note) => {
      if (note.trashed) return map;
      (note.tags || []).forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1));
      return map;
    }, new Map())).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    counts: {
      all: notes.filter((note) => !note.trashed && !note.archived).length,
      favorites: notes.filter((note) => !note.trashed && !note.archived && note.favorite).length,
      archive: notes.filter((note) => !note.trashed && note.archived).length,
      trash: notes.filter((note) => note.trashed).length
    },
    revisions: Object.values(revisions).reduce((sum, list) => sum + list.length, 0),
    data_dir: 'C:\\Users\\Mock\\AppData\\Roaming\\Notra'
  });

  const matchesView = (note, view, groupId, tag, query) => {
    if (view === 'trash') {
      if (!note.trashed) return false;
    } else {
      if (note.trashed) return false;
      if (view === 'archive' && !note.archived) return false;
      if (view !== 'archive' && note.archived) return false;
      if (view === 'favorites' && !note.favorite) return false;
      if (view === 'group' && note.group_id !== groupId) return false;
      if (view === 'tag' && !(note.tags || []).some((item) => item.toLowerCase() === String(tag || '').toLowerCase())) return false;
    }
    if (query) {
      const haystack = `${note.title} ${strip(note.content)} ${(note.tags || []).join(' ')}`.toLowerCase();
      if (!haystack.includes(String(query).toLowerCase())) return false;
    }
    return true;
  };

  const sortNotes = (list, sort) => {
    const sorted = list.slice().sort((a, b) => {
      if (sort === 'created_desc') return String(b.created_at).localeCompare(String(a.created_at));
      if (sort === 'title_asc') return String(a.title || 'Untitled').localeCompare(String(b.title || 'Untitled'));
      if (sort === 'words_desc') return words(strip(b.content)) - words(strip(a.content));
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });
    return sorted.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  };

  const saveRevision = (note) => {
    if (!revisions[note.id]) revisions[note.id] = [];
    const nextId = (revisions[note.id][0]?.id || 0) + 1;
    revisions[note.id].unshift({
      id: nextId,
      note_id: note.id,
      title: note.title,
      content: note.content,
      word_count: words(strip(note.content)),
      excerpt: excerpt(note.content),
      created_at: new Date().toISOString()
    });
    revisions[note.id] = revisions[note.id].slice(0, 50);
  };

  const stats = () => ({
    ...meta().counts,
    groups: groups.length,
    tags: meta().tags.length,
    words: notes.filter((note) => !note.trashed).reduce((sum, note) => sum + words(strip(note.content)), 0),
    notes: notes.filter((note) => !note.trashed).length,
    revisions: meta().revisions,
    recent_notes: notes.filter((note) => !note.trashed && now - new Date(note.created_at).getTime() < 7 * 86400000).length,
    favorites: notes.filter((note) => !note.trashed && note.favorite).length,
    storage_bytes: 248000,
    data_dir: 'C:\\Users\\Mock\\AppData\\Roaming\\Notra',
    last_backup: 'C:\\Users\\Mock\\AppData\\Roaming\\Notra\\backups\\notra-2026-10-22.json'
  });

  const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  window.NotraMock = {
    async bootstrap() {
      return {
        app: { name: 'Notra', version: '1.0.0' },
        settings: { ...settings },
        meta: meta(),
        default_notes: sortNotes(notes.filter((note) => matchesView(note, settings.default_view, null, null, '')), settings.sort).map(hydrate)
      };
    },
    async get_meta() {
      return meta();
    },
    async list_notes(view = 'all', groupId = null, tag = null, query = '', sort = 'updated_desc') {
      return sortNotes(notes.filter((note) => matchesView(note, view, groupId, tag, query)), sort).map(hydrate);
    },
    async get_note(id) {
      const note = noteById(id);
      return note ? hydrate(note) : null;
    },
    async create_note(title = '', content = '', groupId = null, tags = [], color = 'default') {
      const note = {
        id: uid('note'),
        title,
        content,
        group_id: groupId,
        tags: Array.isArray(tags) ? tags : [],
        color,
        pinned: false,
        favorite: false,
        archived: false,
        trashed: false,
        archived_at: null,
        trashed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      notes.unshift(note);
      revisions[note.id] = [];
      return hydrate(note);
    },
    async save_note(id, title, content) {
      const note = noteById(id);
      if (!note) return null;
      note.title = title;
      note.content = content;
      note.updated_at = new Date().toISOString();
      saveRevision(note);
      return hydrate(note);
    },
    async patch_note(id, patch = {}) {
      const note = noteById(id);
      if (!note) return null;
      if ('group_id' in patch) note.group_id = patch.group_id || null;
      if ('pinned' in patch) note.pinned = Boolean(patch.pinned);
      if ('favorite' in patch) note.favorite = Boolean(patch.favorite);
      if ('archived' in patch) {
        note.archived = Boolean(patch.archived);
        note.archived_at = note.archived ? new Date().toISOString() : null;
      }
      if ('trashed' in patch) {
        note.trashed = Boolean(patch.trashed);
        note.trashed_at = note.trashed ? new Date().toISOString() : null;
      }
      if ('color' in patch) note.color = patch.color;
      if ('tags' in patch) note.tags = Array.isArray(patch.tags) ? patch.tags : [];
      if ('title' in patch) note.title = patch.title;
      note.updated_at = new Date().toISOString();
      return hydrate(note);
    },
    async bulk_patch(ids, patch = {}) {
      const updated = [];
      (ids || []).forEach((id) => {
        const note = noteById(id);
        if (!note) return;
        if ('group_id' in patch) note.group_id = patch.group_id || null;
        if ('favorite' in patch) note.favorite = Boolean(patch.favorite);
        if ('archived' in patch) {
          note.archived = Boolean(patch.archived);
          note.archived_at = note.archived ? new Date().toISOString() : null;
        }
        note.updated_at = new Date().toISOString();
        updated.push(hydrate(note));
      });
      return updated;
    },
    async trash_notes(ids) {
      (ids || []).forEach((id) => {
        const note = noteById(id);
        if (note) {
          note.trashed = true;
          note.trashed_at = new Date().toISOString();
        }
      });
      return ids;
    },
    async restore_notes(ids) {
      (ids || []).forEach((id) => {
        const note = noteById(id);
        if (note) {
          note.trashed = false;
          note.trashed_at = null;
        }
      });
      return ids;
    },
    async delete_notes(ids) {
      notes = notes.filter((note) => !(ids || []).includes(note.id));
      return ids;
    },
    async empty_trash() {
      const count = notes.filter((note) => note.trashed).length;
      notes = notes.filter((note) => !note.trashed);
      return count;
    },
    async duplicate_note(id) {
      const note = noteById(id);
      if (!note) return null;
      const copy = {
        ...note,
        id: uid('note'),
        title: `${note.title || 'Untitled'} copy`,
        pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      notes.unshift(copy);
      revisions[copy.id] = [];
      return hydrate(copy);
    },
    async create_group(name, color = 'amber', icon = 'book') {
      const group = { id: uid('grp'), name, color, icon, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      groups.push(group);
      return group;
    },
    async update_group(id, patch = {}) {
      const group = groups.find((item) => item.id === id);
      if (!group) return null;
      Object.assign(group, patch, { updated_at: new Date().toISOString() });
      return group;
    },
    async delete_group(id, mode = 'keep_notes') {
      const index = groups.findIndex((group) => group.id === id);
      if (index >= 0) groups.splice(index, 1);
      notes.forEach((note) => {
        if (note.group_id !== id) return;
        note.group_id = null;
        if (mode === 'delete_notes') {
          note.trashed = true;
          note.trashed_at = new Date().toISOString();
        }
      });
      return true;
    },
    async get_revisions(noteId) {
      return (revisions[noteId] || []).slice();
    },
    async restore_revision(noteId, revisionId) {
      const note = noteById(noteId);
      const revision = (revisions[noteId] || []).find((item) => Number(item.id) === Number(revisionId));
      if (!note || !revision) return null;
      saveRevision(note);
      note.title = revision.title;
      note.content = revision.content;
      note.updated_at = new Date().toISOString();
      return hydrate(note);
    },
    async get_settings() {
      return { ...settings };
    },
    async save_settings(patch = {}) {
      settings = { ...settings, ...patch };
      return { ...settings };
    },
    async get_stats() {
      return stats();
    },
    async pick_images() {
      return [{ name: 'mock-sketch.png', mime: 'image/png', data_url: samplePng, size: 68 }];
    },
    async save_export(filename) {
      return `C:\\Users\\Mock\\Desktop\\${filename}`;
    },
    async export_backup() {
      return 'C:\\Users\\Mock\\Desktop\\notra-backup.json';
    },
    async import_backup() {
      return { notes: 0, groups: 0 };
    },
    async open_data_dir() {
      return true;
    },
    async open_external() {
      return true;
    },
    async set_titlebar_theme() {
      return true;
    },
    async set_fullscreen() {
      return true;
    }
  };
})();
