(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const SVG = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const DEFAULT_SETTINGS = {
    language: 'en',
    theme: 'system',
    accent: 'amber',
    sort: 'updated_desc',
    font_size: 17,
    font_family: 'sans',
    spellcheck: true,
    show_word_count: true,
    compact_list: false,
    default_view: 'all',
    window_width: 1460,
    window_height: 940,
    window_maximized: false
  };

  const COLORS = [
    ['default', '#8b93a3'],
    ['amber', '#e5a94b'],
    ['rose', '#e07a8d'],
    ['teal', '#53b8a7'],
    ['violet', '#9b8ce0'],
    ['blue', '#64a8e8'],
    ['green', '#7fbb6a'],
    ['slate', '#8b93a3']
  ];
  const COLOR_HEX = Object.fromEntries(COLORS);
  const GROUP_COLORS = ['amber', 'rose', 'teal', 'violet', 'blue', 'green', 'slate'];
  const GROUP_ICONS = ['book', 'briefcase', 'bulb', 'heart', 'folder', 'target', 'code', 'music'];
  const GROUP_ICON_FALLBACK = 'folder';
  const TEXT_COLORS = ['#e9eaee', '#e5a94b', '#e07a8d', '#53b8a7', '#9b8ce0', '#64a8e8', '#7fbb6a', '#8b93a3', '#1f2328', '#ffffff'];
  const HIGHLIGHT_COLORS = ['#e5a94b', '#e07a8d', '#53b8a7', '#9b8ce0', '#64a8e8', '#7fbb6a', '#f2d675', '#b9c6d8'];
  const SORTS = ['updated_desc', 'created_desc', 'title_asc', 'words_desc'];
  const SORT_LABELS = {
    updated_desc: 'list.sortUpdated',
    created_desc: 'list.sortCreated',
    title_asc: 'list.sortTitle',
    words_desc: 'list.sortWords'
  };
  const VIEW_TITLES = {
    all: 'nav.all',
    favorites: 'nav.favorites',
    archive: 'nav.archive',
    trash: 'nav.trash'
  };
  const EMPTY_KEYS = {
    all: ['list.emptyAllTitle', 'list.emptyAllBody'],
    favorites: ['list.emptyFavTitle', 'list.emptyFavBody'],
    archive: ['list.emptyArchiveTitle', 'list.emptyArchiveBody'],
    trash: ['list.emptyTrashTitle', 'list.emptyTrashBody'],
    group: ['list.emptyGroupTitle', 'list.emptyGroupBody'],
    tag: ['list.emptyTagTitle', 'list.emptyTagBody']
  };

  const state = {
    lang: 'en',
    settings: { ...DEFAULT_SETTINGS },
    meta: { groups: [], tags: [], counts: {}, revisions: 0, data_dir: '' },
    notes: [],
    view: 'all',
    groupId: null,
    tag: null,
    query: '',
    sort: 'updated_desc',
    note: null,
    selected: new Set(),
    dirty: false,
    saving: false,
    saveTimer: null,
    draftTimer: null,
    loadToken: 0,
    booted: false,
    bound: false,
    searchTimer: null,
    groupEditId: null,
    groupDraft: { color: 'amber', icon: 'book' },
    groupCreatedCallback: null,
    moveIds: [],
    moveTarget: undefined,
    moveInitialTarget: undefined,
    historyRevisions: [],
    historySelected: null,
    historyNoteId: null,
    paletteItems: [],
    paletteIndex: 0,
    paletteOpen: false,
    paletteQueryTimer: null,
    settingsTab: 'general',
    menuEl: null,
    modalStack: [],
    draftNotified: new Set(),
    dragNoteId: null,
    focusMode: false,
    fullscreen: false,
    renderedNoteId: null,
    tableCell: null,
    updateInfo: null,
    updateStage: 'idle',
    updateError: '',
    updateErrorPhase: '',
    draw: {
      setup: false,
      strokes: [],
      redo: [],
      current: null,
      tool: 'pen',
      color: '#1f2328',
      size: 6,
      dirty: false
    }
  };

  const I18N = window.I18N || { en: {}, tr: {} };
  const DEFAULT_TRANSLATIONS = I18N.en || {};

  function t(key, vars = {}) {
    const table = I18N[state.lang] || {};
    let value = table[key] ?? DEFAULT_TRANSLATIONS[key] ?? key;
    if (typeof value !== 'string') value = String(value);
    return value.replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? `{${name}}` : String(vars[name])));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function relativeTime(value) {
    const date = parseDate(value);
    if (!date) return '';
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) return t('time.justNow');
    if (seconds < 3600) return t('time.minutes', { n: Math.max(1, Math.round(seconds / 60)) });
    if (seconds < 86400) return t('time.hours', { n: Math.max(1, Math.round(seconds / 3600)) });
    const days = Math.floor(seconds / 86400);
    if (days === 1) return t('time.yesterday');
    if (days < 7) return t('time.days', { n: days });
    if (days < 35) return t('time.weeks', { n: Math.floor(days / 7) });
    try {
      return new Intl.DateTimeFormat(state.lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    } catch (_) {
      return date.toLocaleDateString();
    }
  }

  function formatDateTime(value) {
    const date = parseDate(value);
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat(state.lang === 'tr' ? 'tr-TR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
    } catch (_) {
      return date.toLocaleString();
    }
  }

  function formatHistoryDate(value) {
    const date = parseDate(value);
    if (!date) return { date: '', time: '' };
    try {
      return {
        date: new Intl.DateTimeFormat(state.lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date),
        time: new Intl.DateTimeFormat(state.lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(date)
      };
    } catch (_) {
      return { date: date.toLocaleDateString(), time: date.toLocaleTimeString() };
    }
  }

  function wordCount(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function groupById(id) {
    return (state.meta.groups || []).find((group) => group.id === id) || null;
  }

  function groupColor(name) {
    return COLOR_HEX[name] || '#8b93a3';
  }

  function groupIcon(name) {
    return GROUP_ICONS.includes(name) ? name : GROUP_ICON_FALLBACK;
  }

  function colorLabel(name) {
    const key = `common.color${String(name || 'default').charAt(0).toUpperCase()}${String(name || 'default').slice(1)}`;
    return t(key);
  }

  function noteTitle(title) {
    return String(title || '').trim() || t('editor.untitled');
  }

  function countLabel(count) {
    return count === 1 ? t('list.noteCountOne') : t('list.noteCount', { n: count });
  }

  function currentViewTitle() {
    if (state.view === 'group') return groupById(state.groupId)?.name || t('nav.notebooks');
    if (state.view === 'tag') return `#${state.tag || ''}`;
    return t(VIEW_TITLES[state.view] || 'nav.all');
  }

  let api = null;

  async function call(method, ...args) {
    if (!api || typeof api[method] !== 'function') {
      throw new Error(`Notra API is unavailable (${method})`);
    }
    const result = await api[method](...args);
    if (result && typeof result === 'object' && !Array.isArray(result) && result.ok === false) {
      const error = new Error(result.error || 'api_error');
      error.method = method;
      throw error;
    }
    return result;
  }

  async function initApi() {
    if (window.NotraMock) {
      api = window.NotraMock;
      return;
    }
    for (let i = 0; i < 120; i += 1) {
      if (window.pywebview && window.pywebview.api) {
        api = window.pywebview.api;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('api_timeout');
  }

  const ALLOWED_TAGS = new Set([
    'P', 'DIV', 'BR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'MARK',
    'BLOCKQUOTE', 'PRE', 'CODE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'IMG', 'A', 'FONT', 'SUB', 'SUP'
  ]);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG', 'MATH']);
  const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'class', 'style', 'data-checked', 'width', 'height', 'color']);
  const ALLOWED_CLASSES = new Set(['callout', 'muted', 'checklist', 'chk', 'chk-text', 'note-image', 'table-scroll']);
  const ALLOWED_STYLES = new Set([
    'color', 'background-color', 'text-align', 'font-family', 'font-size', 'font-weight',
    'font-style', 'text-decoration', 'text-decoration-line', 'width', 'height', 'max-width',
    'border-radius', 'margin-left', 'margin-right'
  ]);

  function safeUrl(value, allowDataImage = false) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(url)) return url;
    if (/^(https?:|mailto:|#)/i.test(url)) return url;
    return '';
  }

  function cleanStyle(value) {
    const parts = [];
    String(value || '').split(';').forEach((declaration) => {
      const index = declaration.indexOf(':');
      if (index < 1) return;
      const prop = declaration.slice(0, index).trim().toLowerCase();
      const val = declaration.slice(index + 1).trim();
      if (!ALLOWED_STYLES.has(prop) || !val) return;
      if (/url\s*\(|expression\s*\(|javascript:/i.test(val)) return;
      parts.push(`${prop}: ${val}`);
    });
    return parts.join('; ');
  }

  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
    const clean = (node) => {
      if (!node || node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
      }
      const tag = node.tagName;
      if (DROP_TAGS.has(tag)) {
        node.remove();
        return;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        const fragment = document.createDocumentFragment();
        while (node.firstChild) {
          const child = node.firstChild;
          clean(child);
          fragment.appendChild(child);
        }
        node.replaceWith(fragment);
        return;
      }
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_ATTRS.has(name)) {
          node.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href' || name === 'src') {
          const url = safeUrl(attr.value, name === 'src' && tag === 'IMG');
          if (!url) node.removeAttribute(attr.name);
          else node.setAttribute(attr.name, url);
        } else if (name === 'style') {
          const style = cleanStyle(attr.value);
          if (style) node.setAttribute('style', style);
          else node.removeAttribute('style');
        } else if (name === 'class') {
          const classes = String(attr.value || '').split(/\s+/).filter((item) => ALLOWED_CLASSES.has(item));
          if (classes.length) node.setAttribute('class', classes.join(' '));
          else node.removeAttribute('class');
        } else if (name === 'color') {
          if (!/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d%,.\s]+\))$/i.test(attr.value)) node.removeAttribute('color');
        } else if (name === 'width' || name === 'height') {
          if (!/^\d{1,4}(%|px)?$/.test(attr.value)) node.removeAttribute(attr.name);
        }
      }
      if (tag === 'A' && node.getAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('draggable', 'false');
      }
      Array.from(node.childNodes).forEach(clean);
    };
    Array.from(doc.body.childNodes).forEach(clean);
    return doc.body.innerHTML;
  }

  function actualTheme() {
    if (state.settings.theme === 'light' || state.settings.theme === 'dark') return state.settings.theme;
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function applyTranslations() {
    $$('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    $$('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
    });
    $$('[data-i18n-title]').forEach((node) => {
      const title = t(node.dataset.i18nTitle);
      node.setAttribute('title', title);
      node.setAttribute('aria-label', title);
    });
    const languageLabel = $('#language-label');
    const languageCode = $('#language-code');
    if (languageLabel) languageLabel.textContent = t(`language.${state.lang}`);
    if (languageCode) languageCode.textContent = state.lang.toUpperCase();
    const editorEmptyTitle = $('#editor-empty-title');
    const editorEmptyBody = $('#editor-empty-body');
    if (editorEmptyTitle) editorEmptyTitle.textContent = t('editor.emptyTitle');
    if (editorEmptyBody) editorEmptyBody.textContent = t('editor.emptyBody');
    const title = $('#note-title');
    if (title) title.placeholder = t('editor.titlePlaceholder');
    const body = $('#note-body');
    if (body) body.dataset.placeholder = t('editor.placeholder');
    document.title = state.note ? `${noteTitle(state.note.title)} â€” Notra` : 'Notra';
    syncSettingsControls();
    updateSortLabel();
    updateFullscreenButton();
    renderUpdatePanel();
  }

  function syncSettingsControls() {
    const settings = state.settings;
    $$('#language-segmented [data-set-language]').forEach((button) => {
      button.classList.toggle('active', button.dataset.setLanguage === state.lang);
    });
    $$('[data-set-theme]').forEach((button) => {
      button.classList.toggle('active', button.dataset.setTheme === settings.theme);
    });
    $$('#accent-swatches [data-set-accent]').forEach((button) => {
      button.classList.toggle('active', button.dataset.setAccent === settings.accent);
    });
    $$('#font-segmented [data-set-font]').forEach((button) => {
      button.classList.toggle('active', button.dataset.setFont === settings.font_family);
    });
    const defaultView = $('#setting-default-view');
    if (defaultView) defaultView.value = settings.default_view;
    const sort = $('#setting-sort');
    if (sort) sort.value = settings.sort;
    const compact = $('#setting-compact');
    if (compact) compact.checked = Boolean(settings.compact_list);
    const spellcheck = $('#setting-spellcheck');
    if (spellcheck) spellcheck.checked = Boolean(settings.spellcheck);
    const wordCountToggle = $('#setting-word-count');
    if (wordCountToggle) wordCountToggle.checked = Boolean(settings.show_word_count);
    const fontSize = $('#setting-font-size');
    if (fontSize) fontSize.value = settings.font_size;
    const fontSizeValue = $('#font-size-value');
    if (fontSizeValue) fontSizeValue.textContent = settings.font_size;
    const preview = $('#font-preview');
    if (preview) {
      preview.style.fontSize = `${settings.font_size}px`;
      preview.style.fontFamily = settings.font_family === 'serif' ? 'var(--font-serif)' : settings.font_family === 'mono' ? 'var(--font-mono)' : 'var(--font-sans)';
    }
    const info = $('#app-version');
    if (info) info.textContent = `v${settings.version || '1.1.3'}`;
  }

  function applySettings() {
    const settings = state.settings;
    state.lang = settings.language === 'tr' ? 'tr' : 'en';
    const theme = actualTheme();
    document.documentElement.lang = state.lang;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = settings.accent || 'amber';
    document.documentElement.dataset.font = settings.font_family || 'sans';
    document.documentElement.style.setProperty('--editor-size', `${clamp(Number(settings.font_size) || 17, 13, 24)}px`);
    document.body.classList.toggle('compact-list', Boolean(settings.compact_list));
    const title = $('#note-title');
    const body = $('#note-body');
    if (title) title.spellcheck = Boolean(settings.spellcheck);
    if (body) body.spellcheck = Boolean(settings.spellcheck);
    applyTranslations();
    if (state.booted) {
      renderSidebar();
      renderList();
      updateWordCountDisplay();
    }
    if (api) {
      call('set_titlebar_theme', theme === 'dark').catch(() => {});
    }
  }

  async function updateSettings(patch, options = {}) {
    state.settings = { ...state.settings, ...patch };
    applySettings();
    if (!api) return;
    try {
      const saved = await call('save_settings', patch);
      if (saved && typeof saved === 'object') {
        state.settings = { ...state.settings, ...saved };
      }
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function listArgs() {
    return {
      view: state.view,
      groupId: state.groupId,
      tag: state.tag,
      query: state.query,
      sort: state.sort
    };
  }

  async function refreshMeta() {
    try {
      const meta = await call('get_meta');
      if (meta && typeof meta === 'object') {
        state.meta = meta;
        renderSidebar();
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshNotes(options = {}) {
    try {
      const args = listArgs();
      const notes = await call('list_notes', args.view, args.groupId, args.tag, args.query, args.sort);
      state.notes = Array.isArray(notes) ? notes : [];
      const valid = new Set(state.notes.map((note) => note.id));
      state.selected.forEach((id) => {
        if (!valid.has(id)) state.selected.delete(id);
      });
      renderList();
      if (options.ensureVisible !== false) ensureCurrentVisible();
      return state.notes;
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
      return [];
    }
  }

  function setView(view, options = {}) {
    if (view === state.view && options.groupId === undefined && options.tag === undefined && !options.force) return;
    state.view = view;
    state.groupId = options.groupId ?? null;
    state.tag = options.tag ?? null;
    state.query = '';
    const search = $('#search-input');
    if (search) search.value = '';
    const clear = $('#search-clear');
    if (clear) clear.hidden = true;
    state.selected.clear();
    renderSelection();
    refreshNotes({ ensureVisible: false }).then(() => {
      renderSidebar();
      const first = state.notes[0];
      if (state.note && state.notes.some((note) => note.id === state.note.id)) {
        renderList();
      } else if (first) {
        openNote(first.id, { silent: true });
      } else {
        closeEditor();
      }
      const scroll = $('#list-scroll');
      if (scroll) scroll.scrollTop = 0;
    });
  }

  function renderSidebar() {
    const counts = state.meta.counts || {};
    $$('[data-count]').forEach((node) => {
      const key = node.dataset.count;
      const value = Number(counts[key === 'all' ? 'all' : key] || 0);
      node.textContent = value > 999 ? '999+' : String(value);
    });
    $$('#primary-nav .nav-item').forEach((button) => {
      const active = state.view === button.dataset.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    const groups = state.meta.groups || [];
    const groupList = $('#group-list');
    if (groupList) {
      groupList.innerHTML = groups.map((group) => {
        const active = state.view === 'group' && state.groupId === group.id;
        return `<div class="group-row${active ? ' active' : ''}" data-group-id="${escapeAttr(group.id)}" role="button" tabindex="0" aria-current="${active ? 'page' : 'false'}" style="--group-color:${groupColor(group.color)}">
          <span class="group-badge">${SVG(groupIcon(group.icon))}</span>
          <span class="side-label" title="${escapeAttr(group.name)}">${escapeHtml(group.name)}</span>
          <span class="count">${Number(group.note_count) || 0}</span>
          <button class="group-more" data-group-menu="${escapeAttr(group.id)}" title="${escapeAttr(t('group.edit'))}" aria-label="${escapeAttr(t('group.edit'))}">${SVG('more')}</button>
        </div>`;
      }).join('');
    }
    const groupEmpty = $('#group-empty');
    if (groupEmpty) groupEmpty.hidden = groups.length > 0;

    const tags = state.meta.tags || [];
    const tagList = $('#tag-list');
    if (tagList) {
      tagList.innerHTML = tags.map((tag) => {
        const active = state.view === 'tag' && String(state.tag || '').toLowerCase() === String(tag.name).toLowerCase();
        return `<button class="tag-row${active ? ' active' : ''}" data-tag="${escapeAttr(tag.name)}" title="#${escapeAttr(tag.name)}" aria-current="${active ? 'page' : 'false'}">
          <span class="hash">#</span>
          <span class="side-label">${escapeHtml(tag.name)}</span>
          <span class="count">${Number(tag.count) || 0}</span>
        </button>`;
      }).join('');
    }
    const tagEmpty = $('#tag-empty');
    if (tagEmpty) tagEmpty.hidden = tags.length > 0;
  }

  function updateSortLabel() {
    const label = $('#sort-label');
    if (label) label.textContent = t(SORT_LABELS[state.sort] || 'list.sortUpdated');
  }

  function updateListHeader() {
    const title = $('#view-title');
    const subtitle = $('#view-subtitle');
    const viewTitle = currentViewTitle();
    if (title) title.textContent = state.query ? `â€œ${state.query}â€` : viewTitle;
    if (subtitle) {
      if (state.query) subtitle.textContent = t('list.searchIn', { view: viewTitle });
      else {
        const words = state.notes.reduce((sum, note) => sum + (Number(note.word_count) || 0), 0);
        subtitle.textContent = `${countLabel(state.notes.length)} Â· ${words.toLocaleString(state.lang === 'tr' ? 'tr-TR' : 'en-US')} ${t('stats.words').toLocaleLowerCase(state.lang === 'tr' ? 'tr-TR' : 'en-US')}`;
      }
    }
    updateSortLabel();
    const emptyTrash = $('#empty-trash-btn');
    if (emptyTrash) emptyTrash.hidden = !(state.view === 'trash' && (state.meta.counts?.trash || 0) > 0);
  }

  function noteGroupChip(note) {
    if (!note.group_id) return '';
    const group = groupById(note.group_id);
    if (!group) return '';
    return `<span class="note-group-chip" style="--group-color:${groupColor(group.color)}">${SVG(groupIcon(group.icon))}<span>${escapeHtml(group.name)}</span></span>`;
  }

  function noteCardHtml(note) {
    const active = state.note?.id === note.id;
    const selected = state.selected.has(note.id);
    const color = COLOR_HEX[note.color] || 'transparent';
    const tags = Array.isArray(note.tags) ? note.tags : [];
    const pinned = note.pinned ? `<span title="${escapeAttr(t('list.pinned'))}">${SVG('pin')}</span>` : '';
    const favorite = note.favorite ? `<span class="fav" title="${escapeAttr(t('list.favorite'))}">${SVG('star')}</span>` : '';
    const inline = note.trashed
      ? `<button class="mini-btn" data-inline="restore" data-id="${escapeAttr(note.id)}" title="${escapeAttr(t('list.restore'))}" aria-label="${escapeAttr(t('list.restore'))}">${SVG('restore')}</button>
         <button class="mini-btn danger" data-inline="delete" data-id="${escapeAttr(note.id)}" title="${escapeAttr(t('list.deleteForever'))}" aria-label="${escapeAttr(t('list.deleteForever'))}">${SVG('trash')}</button>`
      : `<button class="mini-btn" data-inline="pin" data-id="${escapeAttr(note.id)}" title="${escapeAttr(note.pinned ? t('editor.unpin') : t('editor.pin'))}" aria-label="${escapeAttr(note.pinned ? t('editor.unpin') : t('editor.pin'))}">${SVG('pin')}</button>
         <button class="mini-btn" data-inline="favorite" data-id="${escapeAttr(note.id)}" title="${escapeAttr(note.favorite ? t('editor.unfavorite') : t('editor.favorite'))}" aria-label="${escapeAttr(note.favorite ? t('editor.unfavorite') : t('editor.favorite'))}">${SVG('star')}</button>
         <button class="mini-btn" data-inline="more" data-id="${escapeAttr(note.id)}" title="${escapeAttr(t('editor.more'))}" aria-label="${escapeAttr(t('editor.more'))}">${SVG('more')}</button>`;
    const excerpt = String(note.excerpt || '').trim() || t('editor.noContent');
    return `<article class="note-card${active ? ' active' : ''}${selected ? ' selected' : ''}${note.pinned ? ' pinned' : ''}" data-note-id="${escapeAttr(note.id)}" role="listitem" tabindex="0" draggable="true" aria-selected="${active}" style="--note-color:${color}">
      <div class="note-top">
        <span class="note-check" data-check="${escapeAttr(note.id)}" role="checkbox" aria-checked="${selected}" title="${escapeAttr(t('list.select'))}">${SVG('check')}</span>
        <span class="note-title">${escapeHtml(noteTitle(note.title))}</span>
        <span class="note-indicators">${pinned}${favorite}<span class="note-color-dot" data-color="${escapeAttr(note.color || 'default')}"></span></span>
      </div>
      <p class="note-excerpt">${escapeHtml(excerpt)}</p>
      <div class="note-bottom">
        ${noteGroupChip(note)}
        ${tags.length ? `<span class="note-date" title="${escapeAttr(tags.map((tag) => `#${tag}`).join(' '))}">#${escapeHtml(tags[0])}${tags.length > 1 ? ` +${tags.length - 1}` : ''}</span>` : ''}
        <span class="note-date">${escapeHtml(relativeTime(note.updated_at))}</span>
        <span class="note-actions-inline">${inline}</span>
      </div>
    </article>`;
  }

  function renderList() {
    updateListHeader();
    const list = $('#note-list');
    if (list) list.innerHTML = state.notes.map(noteCardHtml).join('');
    const empty = $('#list-empty');
    if (empty) empty.hidden = state.notes.length > 0;
    const emptyTitle = $('#list-empty-title');
    const emptyBody = $('#list-empty-body');
    const emptyAction = $('#list-empty-action');
    if (state.notes.length === 0) {
      let keys = EMPTY_KEYS[state.view] || EMPTY_KEYS.all;
      if (state.query) keys = ['list.noResultsTitle', 'list.noResultsBody'];
      if (emptyTitle) emptyTitle.textContent = t(keys[0]);
      if (emptyBody) emptyBody.textContent = t(keys[1]);
      if (emptyAction) {
        const canCreate = !state.query && ['all', 'group', 'tag'].includes(state.view);
        emptyAction.hidden = !canCreate;
        emptyAction.textContent = t('editor.newNote');
      }
    }
    const footer = $('#list-footer-text');
    if (footer) {
      const words = state.notes.reduce((sum, note) => sum + (Number(note.word_count) || 0), 0);
      footer.textContent = `${countLabel(state.notes.length)} Â· ${words.toLocaleString(state.lang === 'tr' ? 'tr-TR' : 'en-US')} ${t('stats.words').toLocaleLowerCase(state.lang === 'tr' ? 'tr-TR' : 'en-US')}`;
    }
    updateListHeader();
    renderSelection();
  }

  function renderSelection() {
    const ids = new Set(state.notes.map((note) => note.id));
    state.selected.forEach((id) => {
      if (!ids.has(id)) state.selected.delete(id);
    });
    const count = state.selected.size;
    const bulk = $('#bulk-bar');
    if (bulk) bulk.hidden = count === 0;
    const bulkCount = $('#bulk-count');
    if (bulkCount) bulkCount.textContent = t('list.selected', { n: count });
    const listToolbar = $('#list-toolbar');
    if (listToolbar) listToolbar.hidden = count > 0;
    $$('#note-list .note-card').forEach((card) => {
      const selected = state.selected.has(card.dataset.noteId);
      card.classList.toggle('selected', selected);
      const check = $('.note-check', card);
      if (check) check.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    const selectAll = $('#select-all-btn');
    if (selectAll) {
      const all = state.notes.length > 0 && state.selected.size === state.notes.length;
      selectAll.classList.toggle('active', all);
    }
  }

  function ensureCurrentVisible() {
    if (!state.note) return;
    if (state.notes.some((note) => note.id === state.note.id)) return;
    const first = state.notes[0];
    if (first) openNote(first.id, { silent: true });
    else closeEditor();
  }

  function resizeNoteTitle() {
    const title = $('#note-title');
    if (!title) return;
    title.style.height = 'auto';
    title.style.height = `${Math.max(title.scrollHeight, 40)}px`;
  }

  function setSaveStatus(kind) {
    const status = $('#save-status');
    const text = $('#save-status-text');
    const dot = status ? $('.status-dot', status) : null;
    const values = {
      saved: [t('editor.saved'), 'var(--success)'],
      saving: [t('editor.saving'), 'var(--accent)'],
      unsaved: [t('editor.unsaved'), 'var(--text-3)'],
      failed: [t('editor.saveFailed'), 'var(--danger)']
    };
    const [label, color] = values[kind] || values.saved;
    if (text) text.textContent = label;
    if (status) status.style.color = kind === 'saved' ? '' : color;
    if (dot) dot.style.background = color;
  }

  function updateWordCountDisplay() {
    if (!state.note) return;
    const body = $('#note-body');
    const text = body ? body.innerText : '';
    const words = body ? wordCount(text) : Number(state.note.word_count) || 0;
    const wordsText = words === 1 ? t('editor.word') : t('editor.words', { n: words });
    const minutes = Math.max(1, Math.ceil(words / 220));
    const read = t('editor.readTime', { n: minutes });
    const status = $('#word-count');
    if (status) {
      status.hidden = !state.settings.show_word_count;
      status.textContent = `${wordsText} Â· ${read}`;
    }
    const stats = $('#note-stats');
    if (stats) stats.textContent = `${wordsText} Â· ${read}`;
  }

  function updateEditorFlags() {
    if (!state.note) return;
    const pin = $('#pin-btn');
    const favorite = $('#favorite-btn');
    const archive = $('#archive-btn');
    if (pin) {
      pin.classList.toggle('active', Boolean(state.note.pinned));
      const label = t(state.note.pinned ? 'editor.unpin' : 'editor.pin');
      pin.title = label;
      pin.setAttribute('aria-label', label);
    }
    if (favorite) {
      favorite.classList.toggle('active', Boolean(state.note.favorite));
      const label = t(state.note.favorite ? 'editor.unfavorite' : 'editor.favorite');
      favorite.title = label;
      favorite.setAttribute('aria-label', label);
    }
    if (archive) {
      archive.classList.toggle('active', Boolean(state.note.archived));
      const label = t(state.note.archived ? 'editor.unarchive' : 'editor.archive');
      archive.title = label;
      archive.setAttribute('aria-label', label);
    }
  }

  function renderTags() {
    const holder = $('#note-tags');
    const add = $('#add-tag-btn');
    if (!holder || !state.note) return;
    const tags = Array.isArray(state.note.tags) ? state.note.tags : [];
    holder.innerHTML = tags.map((tag) => `<span class="tag-chip" data-tag-chip="${escapeAttr(tag)}">
      <span class="hash">#</span><span>${escapeHtml(tag)}</span>
      <button class="tag-remove" data-remove-tag="${escapeAttr(tag)}" title="${escapeAttr(t('common.remove'))}" aria-label="${escapeAttr(t('common.remove'))}">${SVG('close')}</button>
    </span>`).join('');
    if (add) add.disabled = Boolean(state.note.trashed);
  }

  function updateEditorMeta() {
    const note = state.note;
    if (!note) return;
    const title = $('#note-title');
    const body = $('#note-body');
    const noteChanged = state.renderedNoteId !== note.id;
    if (title && title.value !== (note.title || '') && (noteChanged || document.activeElement !== title)) {
      title.value = note.title || '';
    }
    if (body) {
      const nextContent = sanitizeHtml(note.content || '');
      if (noteChanged || sanitizeHtml(body.innerHTML) !== nextContent) {
        hideTableTools();
        body.innerHTML = nextContent;
      }
      state.renderedNoteId = note.id;
      body.classList.toggle('is-empty', !String(body.innerText || '').trim());
    }
    const updated = $('#note-updated');
    if (updated) updated.textContent = t('editor.updated', { time: formatDateTime(note.updated_at) });
    const groupButton = $('#note-group-btn');
    const group = note.group_id ? groupById(note.group_id) : null;
    if (groupButton) {
      groupButton.style.setProperty('--group-color', group ? groupColor(group.color) : 'transparent');
      groupButton.disabled = Boolean(note.trashed);
    }
    const groupName = $('#note-group-name');
    if (groupName) groupName.textContent = group ? group.name : t('editor.noNotebook');
    const groupDot = $('#note-group-dot');
    if (groupDot) groupDot.style.background = group ? groupColor(group.color) : 'var(--text-4)';
    const groupIconNode = $('#note-group-icon use');
    if (groupIconNode) groupIconNode.setAttribute('href', `#i-${groupIcon(group?.icon)}`);
    const colorDot = $('#note-color-dot');
    if (colorDot) colorDot.style.background = note.color && note.color !== 'default' ? COLOR_HEX[note.color] : 'var(--text-4)';
    const colorLabelNode = $('#color-label');
    if (colorLabelNode) colorLabelNode.textContent = colorLabel(note.color);
    const colorButton = $('#color-btn');
    if (colorButton) colorButton.disabled = Boolean(note.trashed);
    const trashBanner = $('#trash-banner');
    if (trashBanner) trashBanner.hidden = !note.trashed;
    renderTags();
    updateEditorFlags();
    updateWordCountDisplay();
    resizeNoteTitle();
    document.title = `${noteTitle(note.title)} â€” Notra`;
  }

  function setEditorEnabled(enabled) {
    const title = $('#note-title');
    const body = $('#note-body');
    if (title) title.readOnly = !enabled;
    if (body) body.contentEditable = enabled ? 'true' : 'false';
    $$('#editor-toolbar button, #editor-toolbar select').forEach((node) => {
      node.disabled = !enabled;
    });
    ['#pin-btn', '#favorite-btn', '#archive-btn', '#add-tag-btn', '#color-btn'].forEach((selector) => {
      const node = $(selector);
      if (node) node.disabled = !enabled;
    });
  }

  function updateLiveCounts() {
    const body = $('#note-body');
    if (!body) return;
    body.classList.toggle('is-empty', !String(body.innerText || '').trim());
    updateWordCountDisplay();
  }

  function draftKey(id) {
    return `notra.draft.${id}`;
  }

  function saveDraftNow() {
    if (!state.note || state.note.trashed || !state.dirty) return;
    const body = $('#note-body');
    const title = $('#note-title');
    if (!body || !title) return;
    const content = body.innerHTML;
    if (content.length > 3_500_000) return;
    try {
      localStorage.setItem(draftKey(state.note.id), JSON.stringify({
        title: title.value,
        content,
        savedAt: new Date().toISOString()
      }));
    } catch (_) {
      // Drafts are a convenience; never interrupt writing if storage is full.
    }
  }

  function scheduleDraft() {
    clearTimeout(state.draftTimer);
    state.draftTimer = setTimeout(saveDraftNow, 350);
  }

  function clearDraft(id) {
    try {
      localStorage.removeItem(draftKey(id));
    } catch (_) {}
    state.draftNotified.delete(id);
  }

  function maybeRecoverDraft(note) {
    if (!note || note.trashed || state.draftNotified.has(note.id)) return;
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(draftKey(note.id)) || 'null');
    } catch (_) {
      draft = null;
    }
    if (!draft || typeof draft.content !== 'string') return;
    const draftTime = parseDate(draft.savedAt);
    const noteTime = parseDate(note.updated_at);
    if (!draftTime || (noteTime && draftTime.getTime() <= noteTime.getTime() + 1200)) {
      clearDraft(note.id);
      return;
    }
    if ((draft.title || '') === (note.title || '') && draft.content === (note.content || '')) {
      clearDraft(note.id);
      return;
    }
    state.draftNotified.add(note.id);
    showToast(t('toast.draftRecovered'), 'info', {
      duration: 12000,
      actionLabel: t('editor.restore'),
      onAction: () => {
        if (!state.note || state.note.id !== note.id) return;
        const title = $('#note-title');
        const body = $('#note-body');
        if (title) title.value = draft.title || '';
        if (body) body.innerHTML = sanitizeHtml(draft.content);
        resizeNoteTitle();
        updateLiveCounts();
        markDirty();
        clearDraft(note.id);
      }
    });
  }

  function renderEditor(options = {}) {
    const note = state.note;
    if (!note) return;
    clearImageSelection();
    $('#editor-empty').hidden = true;
    $('#editor-shell').hidden = false;
    updateEditorMeta();
    setEditorEnabled(!note.trashed);
    state.dirty = false;
    setSaveStatus('saved');
    const scroll = $('#editor-scroll');
    if (scroll) scroll.scrollTop = 0;
    const status = $('#save-status-text');
    if (status && note.trashed) status.textContent = t('editor.saved');
    if (options.focus) {
      const title = $('#note-title');
      if (title) title.focus();
    }
    maybeRecoverDraft(note);
  }

  async function openNote(id, options = {}) {
    if (!id) {
      closeEditor();
      return;
    }
    if (state.dirty && state.note && state.note.id !== id) {
      await saveNow();
    }
    const token = ++state.loadToken;
    try {
      const note = await call('get_note', id);
      if (token !== state.loadToken) return;
      if (!note) {
        await refreshNotes();
        return;
      }
      state.note = note;
      state.dirty = false;
      clearTimeout(state.saveTimer);
      try {
        localStorage.setItem('notra.lastNote', id);
      } catch (_) {}
      renderEditor(options);
      renderList();
      if (options.focus) {
        const title = $('#note-title');
        if (title) setTimeout(() => title.focus(), 30);
      }
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function closeEditor() {
    state.note = null;
    state.dirty = false;
    state.renderedNoteId = null;
    hideTableTools();
    clearImageSelection();
    clearTimeout(state.saveTimer);
    $('#editor-shell').hidden = true;
    $('#editor-empty').hidden = false;
    const title = $('#note-title');
    const body = $('#note-body');
    if (title) title.value = '';
    if (body) body.innerHTML = '';
    document.title = 'Notra';
    renderList();
  }

  function markDirty() {
    if (!state.note || state.note.trashed) return;
    state.dirty = true;
    setSaveStatus('unsaved');
    updateLiveCounts();
    scheduleDraft();
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveNow(), 700);
  }

  async function saveNow(options = {}) {
    const note = state.note;
    if (!note || note.trashed) return;
    if (!state.dirty && !options.force) return;
    if (state.saving) {
      state.pendingSave = true;
      return;
    }
    const title = $('#note-title');
    const body = $('#note-body');
    if (!title || !body) return;
    const snapshotTitle = title.value;
    const snapshotContent = sanitizeHtml(body.innerHTML);
    state.saving = true;
    state.pendingSave = false;
    clearTimeout(state.saveTimer);
    setSaveStatus('saving');
    try {
      const saved = await call('save_note', note.id, snapshotTitle, snapshotContent);
      if (state.note && state.note.id === note.id && saved) {
        state.note = { ...state.note, ...saved };
        const currentTitle = $('#note-title')?.value ?? snapshotTitle;
        const currentContent = sanitizeHtml($('#note-body')?.innerHTML || '');
        const stillDirty = currentTitle !== snapshotTitle || currentContent !== snapshotContent;
        state.dirty = stillDirty;
        updateEditorMeta();
        if (stillDirty) {
          setSaveStatus('unsaved');
          scheduleDraft();
        } else {
          setSaveStatus('saved');
          clearDraft(note.id);
        }
        const updated = $('#note-updated');
        if (updated) updated.textContent = t('editor.updated', { time: formatDateTime(saved.updated_at) });
      }
      await refreshNotes({ ensureVisible: false });
      await refreshMeta();
      if (state.dirty) {
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(() => saveNow(), 500);
      }
    } catch (error) {
      console.error(error);
      setSaveStatus('failed');
      showToast(t('editor.saveFailed'), 'error');
    } finally {
      state.saving = false;
      if (state.pendingSave || state.dirty) {
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(() => saveNow(), 400);
      }
    }
  }

  async function applyNotePatch(noteId, patch, options = {}) {
    try {
      const updated = await call('patch_note', noteId, patch);
      if (state.note && state.note.id === noteId && updated) {
        state.note = { ...state.note, ...updated };
        updateEditorMeta();
        if ('trashed' in patch || 'archived' in patch) setEditorEnabled(!state.note.trashed);
      }
      if (options.refresh !== false) {
        await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
        ensureCurrentVisible();
      }
      return updated;
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
      return null;
    }
  }

  async function togglePin(noteId = state.note?.id) {
    if (!noteId) return;
    const note = noteId === state.note?.id ? state.note : state.notes.find((item) => item.id === noteId);
    if (!note) return;
    await applyNotePatch(noteId, { pinned: !note.pinned });
    if (state.note?.id === noteId) {
      showToast(t(state.note.pinned ? 'list.pinned' : 'editor.unpin'), 'success', { duration: 1800 });
    }
  }

  async function toggleFavorite(noteId = state.note?.id) {
    if (!noteId) return;
    const note = noteId === state.note?.id ? state.note : state.notes.find((item) => item.id === noteId);
    if (!note) return;
    await applyNotePatch(noteId, { favorite: !note.favorite });
    if (state.note?.id === noteId) {
      showToast(t(state.note.favorite ? 'editor.favorite' : 'editor.unfavorite'), 'success', { duration: 1800 });
    }
  }

  async function toggleArchive(noteId = state.note?.id) {
    if (!noteId) return;
    const note = noteId === state.note?.id ? state.note : state.notes.find((item) => item.id === noteId);
    if (!note) return;
    await applyNotePatch(noteId, { archived: !note.archived });
    showToast(t(note.archived ? 'editor.unarchivedToast' : 'editor.archivedToast'), 'success');
  }

  async function trashCurrent() {
    const note = state.note;
    if (!note || note.trashed) return;
    const confirmed = await showConfirm({
      title: t('editor.trashTitle'),
      body: t('editor.trashBody', { title: noteTitle(note.title) }),
      okLabel: t('editor.trash'),
      tone: 'danger'
    });
    if (!confirmed) return;
    if (state.dirty) await saveNow();
    try {
      await call('trash_notes', [note.id]);
      state.note = null;
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      showToast(t('editor.trashToast'), 'success', {
        actionLabel: t('editor.undo'),
        onAction: async () => {
          try {
            await call('restore_notes', [note.id]);
            await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
            showToast(t('editor.restoreToast'), 'success');
          } catch (error) {
            console.error(error);
          }
        }
      });
      ensureCurrentVisible();
      if (!state.notes.length) closeEditor();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function restoreCurrent() {
    const note = state.note;
    if (!note || !note.trashed) return;
    try {
      await call('restore_notes', [note.id]);
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      const fresh = await call('get_note', note.id);
      if (fresh) {
        state.note = fresh;
        renderEditor();
      }
      showToast(t('editor.restoreToast'), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function deleteForever(noteIds) {
    const ids = Array.isArray(noteIds) ? noteIds : [noteIds].filter(Boolean);
    if (!ids.length) return;
    const single = ids.length === 1 ? state.notes.find((note) => note.id === ids[0]) || state.note : null;
    const confirmed = await showConfirm({
      title: single ? t('editor.deleteTitle') : t('editor.bulkDeleteTitle', { n: ids.length }),
      body: single ? t('editor.deleteBody', { title: noteTitle(single.title) }) : t('editor.bulkDeleteBody'),
      okLabel: t('editor.deleteForever'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      await call('delete_notes', ids);
      if (state.note && ids.includes(state.note.id)) state.note = null;
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      showToast(ids.length === 1 ? t('editor.deletedToast') : t('list.deletedToast', { n: ids.length }), 'success');
      ensureCurrentVisible();
      if (!state.notes.length) closeEditor();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function duplicateCurrent() {
    const note = state.note;
    if (!note) return;
    if (state.dirty) await saveNow();
    try {
      const copy = await call('duplicate_note', note.id);
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      if (copy) await openNote(copy.id);
      showToast(t('editor.duplicatedToast'), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function setNoteColor(color) {
    if (!state.note || state.note.trashed) return;
    const updated = await applyNotePatch(state.note.id, { color });
    if (updated) showToast(colorLabel(color), 'success', { duration: 1400 });
  }

  async function updateTags(tags) {
    if (!state.note || state.note.trashed) return;
    const updated = await applyNotePatch(state.note.id, { tags });
    if (updated) {
      renderTags();
      updateTagSuggestions();
    }
  }

  async function addTag(value) {
    if (!state.note) return;
    const tag = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 42);
    if (!tag) return;
    const existing = state.note.tags || [];
    if (existing.some((item) => String(item).toLowerCase() === tag.toLowerCase())) {
      $('#tag-input').value = '';
      return;
    }
    await updateTags([...existing, tag]);
    const input = $('#tag-input');
    if (input) input.value = '';
    updateTagSuggestions();
  }

  async function removeTag(tag) {
    if (!state.note) return;
    await updateTags((state.note.tags || []).filter((item) => String(item).toLowerCase() !== String(tag).toLowerCase()));
  }

  function updateTagSuggestions() {
    if (!state.note) return;
    const holder = $('#tag-suggestions');
    const input = $('#tag-input');
    if (!holder) return;
    const current = new Set((state.note.tags || []).map((tag) => String(tag).toLowerCase()));
    const query = String(input?.value || '').trim().toLowerCase();
    const suggestions = (state.meta.tags || [])
      .filter((tag) => !current.has(String(tag.name).toLowerCase()))
      .filter((tag) => !query || String(tag.name).toLowerCase().includes(query))
      .slice(0, 30);
    holder.innerHTML = suggestions.map((tag) => `<button class="tag-suggestion" data-add-tag="${escapeAttr(tag.name)}">
      <span class="hash">#</span><span class="tag-name">${escapeHtml(tag.name)}</span><span class="tag-count">${Number(tag.count) || 0}</span>${SVG('check')}
    </button>`).join('');
    if (!suggestions.length) {
      holder.innerHTML = `<div class="side-empty">${escapeHtml(t('editor.tagsEmpty'))}</div>`;
    }
  }

  function openTagPopover() {
    if (!state.note || state.note.trashed) return;
    const popover = $('#tag-popover');
    const button = $('#add-tag-btn');
    if (!popover || !button) return;
    updateTagSuggestions();
    popover.hidden = false;
    const rect = button.getBoundingClientRect();
    const width = 300;
    const left = clamp(rect.left, 12, window.innerWidth - width - 12);
    let top = rect.bottom + 7;
    if (top + 280 > window.innerHeight) top = Math.max(12, rect.top - 280);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    const input = $('#tag-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 20);
    }
  }

  function closeTagPopover() {
    const popover = $('#tag-popover');
    if (popover) popover.hidden = true;
  }

  async function moveNotes(ids, target) {
    const noteIds = ids.filter(Boolean);
    if (!noteIds.length) return;
    try {
      await call('bulk_patch', noteIds, { group_id: target || null });
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      const group = target ? groupById(target) : null;
      showToast(group ? t('list.movedToast', { name: group.name }) : t('list.movedNoGroupToast'), 'success');
      ensureCurrentVisible();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  const modalCloseHooks = new WeakMap();

  function openModal(element, onClose = null) {
    if (!element) return;
    element.hidden = false;
    if (!state.modalStack.includes(element)) state.modalStack.push(element);
    if (onClose) modalCloseHooks.set(element, onClose);
  }

  function closeModal(element) {
    if (!element) return;
    element.hidden = true;
    state.modalStack = state.modalStack.filter((item) => item !== element);
    const hook = modalCloseHooks.get(element);
    modalCloseHooks.delete(element);
    if (hook) hook();
  }

  function closeMenu() {
    const menu = state.menuEl || $('#context-menu');
    if (menu) menu.hidden = true;
    state.menuEl = null;
  }

  function closeTopLayer() {
    if (state.menuEl) {
      closeMenu();
      return true;
    }
    const tagPopover = $('#tag-popover');
    if (tagPopover && !tagPopover.hidden) {
      closeTagPopover();
      return true;
    }
    const colorPopover = $('.color-popover');
    if (colorPopover) {
      colorPopover.remove();
      return true;
    }
    const open = state.modalStack.filter((item) => !item.hidden);
    if (open.length) {
      closeModal(open[open.length - 1]);
      return true;
    }
    if (state.paletteOpen) {
      closePalette();
      return true;
    }
    return false;
  }

  function showToast(message, type = 'success', options = {}) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check-circle';
    toast.innerHTML = `${SVG(icon)}<span class="toast-message"></span>`;
    $('.toast-message', toast).textContent = message;
    let timer = null;
    if (options.actionLabel && typeof options.onAction === 'function') {
      const action = document.createElement('button');
      action.className = 'toast-action';
      action.textContent = options.actionLabel;
      action.addEventListener('click', () => {
        clearTimeout(timer);
        removeToast(toast);
        options.onAction();
      });
      toast.appendChild(action);
    }
    stack.appendChild(toast);
    const duration = options.duration || (options.actionLabel ? 8000 : 3400);
    timer = setTimeout(() => removeToast(toast), duration);
  }

  function removeToast(toast) {
    if (!toast || !toast.isConnected) return;
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 210);
  }

  function showConfirm(options = {}) {
    const modal = $('#confirm-modal');
    if (!modal) return Promise.resolve(false);
    $('#confirm-title').textContent = options.title || t('dialog.confirm');
    $('#confirm-body').textContent = options.body || '';
    const ok = $('#confirm-ok');
    const cancel = $('#confirm-cancel');
    ok.textContent = options.okLabel || t('dialog.confirm');
    cancel.textContent = options.cancelLabel || t('dialog.cancel');
    ok.classList.toggle('danger', options.tone !== 'primary');
    ok.classList.toggle('primary', options.tone === 'primary');
    const icon = $('#confirm-icon');
    if (icon) icon.hidden = options.tone === 'primary';
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      openModal(modal, () => finish(false));
      ok.onclick = () => {
        finish(true);
        closeModal(modal);
      };
      cancel.onclick = () => {
        finish(false);
        closeModal(modal);
      };
      setTimeout(() => cancel.focus(), 30);
    });
  }

  function showPrompt(options = {}) {
    const modal = $('#prompt-modal');
    if (!modal) return Promise.resolve(null);
    $('#prompt-title').textContent = options.title || '';
    $('#prompt-body').textContent = options.body || '';
    const label = $('#prompt-label');
    label.textContent = options.label || '';
    label.hidden = !options.label;
    const input = $('#prompt-input');
    input.value = options.value || '';
    input.placeholder = options.placeholder || '';
    input.maxLength = options.maxLength || 500;
    const error = $('#prompt-error');
    error.hidden = true;
    error.textContent = '';
    const ok = $('#prompt-ok');
    const cancel = $('#prompt-cancel');
    ok.textContent = options.okLabel || t('common.save');
    cancel.textContent = options.cancelLabel || t('dialog.cancel');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const submit = () => {
        const value = input.value.trim();
        if (typeof options.validate === 'function') {
          const result = options.validate(value);
          if (result !== true) {
            error.textContent = result || t('dialog.errorBody');
            error.hidden = false;
            input.focus();
            return;
          }
        }
        if (!value && options.allowEmpty !== true) {
          error.textContent = options.requiredMessage || t('dialog.errorBody');
          error.hidden = false;
          input.focus();
          return;
        }
        finish(value);
        closeModal(modal);
      };
      openModal(modal, () => finish(null));
      ok.onclick = submit;
      cancel.onclick = () => {
        finish(null);
        closeModal(modal);
      };
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      };
      setTimeout(() => {
        input.focus();
        input.select();
      }, 30);
    });
  }

  function showChoice(options = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    const choices = options.options || [];
    modal.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
      <header class="modal-head"><div><h2></h2><p></p></div><button class="icon-btn" aria-label="${escapeAttr(t('dialog.close'))}">${SVG('close')}</button></header>
      <div class="modal-body"><div class="move-list"></div></div>
      <footer class="modal-foot"><span class="toolbar-spacer"></span><button class="btn choice-cancel">${escapeHtml(t('dialog.cancel'))}</button></footer>
    </div>`;
    $('h2', modal).textContent = options.title || '';
    $('.modal-head p', modal).textContent = options.body || '';
    const list = $('.move-list', modal);
    list.innerHTML = choices.map((choice, index) => `<button class="move-item" data-choice="${index}" style="min-height:52px">
      <span class="group-badge">${SVG(choice.icon || 'move')}</span>
      <span style="display:flex;flex-direction:column;gap:2px;min-width:0;text-align:left">
        <span style="font-size:12.3px;font-weight:600;color:var(--text)">${escapeHtml(choice.label || '')}</span>
        ${choice.description ? `<span style="font-size:10px;color:var(--text-4);line-height:1.4">${escapeHtml(choice.description)}</span>` : ''}
      </span>
      ${SVG('chevron-right', 'icon tiny')}
    </button>`).join('');
    document.body.appendChild(modal);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        modal.remove();
      };
      openModal(modal, () => finish(null));
      $('.choice-cancel', modal).onclick = () => {
        finish(null);
        closeModal(modal);
      };
      $('.modal-head .icon-btn', modal).onclick = () => {
        finish(null);
        closeModal(modal);
      };
      $$('.move-item', modal).forEach((button) => {
        button.onclick = () => {
          const choice = choices[Number(button.dataset.choice)];
          if (!choice) return;
          finish(choice.value);
          closeModal(modal);
        };
      });
      setTimeout(() => $('.move-item', modal)?.focus(), 30);
    });
  }

  function openMenu(items, x, y) {
    closeMenu();
    const menu = $('#context-menu');
    if (!menu) return;
    state.menuItems = items || [];
    menu.innerHTML = state.menuItems.map((item, index) => {
      if (item.type === 'sep') return '<div class="menu-sep"></div>';
      if (item.type === 'label') return `<div class="menu-label">${escapeHtml(item.label || '')}</div>`;
      if (item.type === 'swatches') {
        return `<div class="menu-label">${escapeHtml(item.label || '')}</div><div class="menu-swatches">${(item.colors || []).map((color) => {
          const value = Array.isArray(color) ? color[1] : color;
          const name = Array.isArray(color) ? color[0] : color;
          const active = String(item.active || '').toLowerCase() === String(name).toLowerCase() || String(item.active || '').toLowerCase() === String(value).toLowerCase();
          return `<button class="menu-swatch${active ? ' active' : ''}" data-menu-color="${index}:${escapeAttr(name)}" style="--swatch:${escapeAttr(value)}" title="${escapeAttr(name)}" aria-label="${escapeAttr(name)}"></button>`;
        }).join('')}</div>`;
      }
      return `<button class="menu-item${item.danger ? ' danger' : ''}" data-menu-index="${index}" ${item.disabled ? 'disabled' : ''}>${item.icon ? SVG(item.icon) : ''}<span>${escapeHtml(item.label || '')}</span>${item.hint ? `<span class="menu-hint">${escapeHtml(item.hint)}</span>` : ''}</button>`;
    }).join('');
    menu.hidden = false;
    state.menuEl = menu;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    $$('[data-menu-index]', menu).forEach((button) => {
      button.addEventListener('click', () => {
        const item = state.menuItems[Number(button.dataset.menuIndex)];
        closeMenu();
        if (item && typeof item.action === 'function') item.action();
      });
    });
    $$('[data-menu-color]', menu).forEach((button) => {
      button.addEventListener('click', () => {
        const [indexText, color] = button.dataset.menuColor.split(':');
        const item = state.menuItems[Number(indexText)];
        closeMenu();
        if (item && typeof item.onPick === 'function') item.onPick(color);
      });
    });
  }

  function openAnchoredMenu(items, anchor, align = 'right') {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 230;
    const x = align === 'right' ? rect.right - width : rect.left;
    openMenu(items, x, rect.bottom + 6);
  }

  function openColorMenu(anchor, current, onPick) {
    openAnchoredMenu([
      { type: 'label', label: t('editor.colorTitle') },
      { type: 'swatches', colors: COLORS, active: current, onPick }
    ], anchor);
  }

  function openTextColorMenu(anchor, colors, current, onPick) {
    openAnchoredMenu([
      { type: 'label', label: t('toolbar.textColor') },
      { type: 'swatches', colors: colors.map((value) => [value, value]), active: current, onPick }
    ], anchor);
  }

  function selectSettingsTab(tab) {
    state.settingsTab = tab;
    $$('.settings-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.settingsTab === tab);
    });
    $$('.settings-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.settingsPanel === tab);
    });
    if (tab === 'data') refreshDataPanel();
    if (tab === 'about') renderUpdatePanel();
  }

  function openSettings(tab = 'general') {
    const modal = $('#settings-modal');
    if (!modal) return;
    syncSettingsControls();
    selectSettingsTab(tab);
    openModal(modal);
  }

  async function refreshDataPanel() {
    try {
      const stats = await call('get_stats');
      const path = $('#data-path');
      if (path) {
        path.textContent = stats.data_dir || state.meta.data_dir || '';
        path.title = path.textContent;
      }
      const meta = $('#backup-meta');
      if (meta) {
        const backup = stats.last_backup ? String(stats.last_backup).split(/[\\/]/).pop() : t('stats.noBackup');
        meta.textContent = `${t('stats.storage')}: ${formatBytes(stats.storage_bytes)} Â· ${t('stats.lastBackup')}: ${backup}`;
      }
      const version = $('#about-version');
      if (version) version.textContent = `v${state.app?.version || '1.1.3'}`;
    } catch (error) {
      console.error(error);
    }
  }

  function updateInProgress() {
    return ['preparing', 'checking', 'downloading', 'installing', 'restarting'].includes(state.updateStage);
  }

  function updateErrorText() {
    const code = String(state.updateError || '');
    if (state.updateErrorPhase === 'save') return t('update.saveFailed');
    if (code === 'update_rate_limited') return t('update.rateLimited');
    if (code === 'update_asset_missing') return t('update.assetMissing');
    if (['update_digest_missing', 'update_asset_invalid', 'update_invalid_url', 'update_invalid_asset', 'update_digest_mismatch'].includes(code)) {
      return t('update.invalidUpdate');
    }
    if (code === 'update_size_mismatch' || code.startsWith('update_download')) return t('update.downloadFailed');
    if (code === 'update_installer_missing' || code === 'update_installer_invalid' || code === 'update_install_failed') {
      return t('update.installFailed');
    }
    if (code === 'update_network' || code === 'update_invalid_response') {
      return state.updateErrorPhase === 'download' ? t('update.downloadFailed') : t('update.checkFailed');
    }
    if (state.updateErrorPhase === 'download') return t('update.downloadFailed');
    if (state.updateErrorPhase === 'install') return t('update.installFailed');
    return t('update.checkFailed');
  }

  // GitHub release notes are Markdown written by a third party. Escape everything
  // first, then only inject the small set of tags built here.
  function renderReleaseNotes(markdown) {
    const raw = String(markdown || '')
      .replace(/\r\n?/g, '\n')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (!raw) return '';
    const text = raw.length > 8000 ? `${raw.slice(0, 8000)}â€¦` : raw;

    const stash = [];
    const keep = (html) => {
      stash.push(html);
      return `\u0000${stash.length - 1}\u0000`;
    };
    const inline = (value) => {
      let out = escapeHtml(value);
      out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, href) => keep(
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
      ));
      out = out.replace(/`([^`\n]+)`/g, (match, code) => keep(`<code>${code}</code>`));
      out = out.replace(/(https?:\/\/[^\s<)\u0000]+)/g, (match, url) => keep(
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      ));
      out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
      out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      out = out.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
      return out.replace(/\u0000(\d+)\u0000/g, (match, index) => stash[Number(index)] || '');
    };

    const blocks = [];
    let paragraph = [];
    let listTag = '';
    let listItems = [];
    let codeLines = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (listItems.length) {
        blocks.push(`<${listTag}>${listItems.map((item) => `<li>${inline(item)}</li>`).join('')}</${listTag}>`);
      }
      listItems = [];
      listTag = '';
    };
    const flushAll = () => {
      flushParagraph();
      flushList();
    };

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (codeLines) {
        if (/^```/.test(trimmed)) {
          blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          codeLines = null;
        } else {
          codeLines.push(line);
        }
        continue;
      }
      if (/^```/.test(trimmed)) {
        flushAll();
        codeLines = [];
        continue;
      }
      if (!trimmed) {
        flushAll();
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushAll();
        blocks.push('<hr>');
        continue;
      }
      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushAll();
        const level = Math.min(heading[1].length + 2, 5);
        blocks.push(`<h${level}>${inline(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
        continue;
      }
      if (/^>\s?/.test(trimmed)) {
        flushAll();
        blocks.push(`<blockquote>${inline(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
        continue;
      }
      const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        if (listTag && listTag !== 'ul') flushList();
        listTag = 'ul';
        listItems.push(bullet[1].replace(/^\[( |x|X)\]\s+/, (match, mark) => (String(mark).toLowerCase() === 'x' ? 'â˜‘ ' : 'â˜ ')));
        continue;
      }
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) {
        flushParagraph();
        if (listTag && listTag !== 'ol') flushList();
        listTag = 'ol';
        listItems.push(ordered[1]);
        continue;
      }
      if (listTag) flushList();
      paragraph.push(trimmed);
    }
    if (codeLines) blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    flushAll();
    return blocks.join('');
  }

  function renderUpdatePanel() {
    const button = $('#update-action');
    if (!button) return;
    const label = $('#update-action-label');
    const status = $('#update-status');
    const badge = $('#update-badge');
    const progress = $('#update-progress');
    const info = state.updateInfo;
    const available = Boolean(info?.available);
    const busy = updateInProgress();
    let labelText = t('update.checkButton');
    let statusText = t('update.idle');

    if (state.updateStage === 'checking') {
      labelText = t('update.checkingButton');
      statusText = t('update.checking');
    } else if (state.updateStage === 'preparing') {
      labelText = t('update.preparingButton');
      statusText = t('update.preparing');
    } else if (state.updateStage === 'downloading') {
      labelText = t('update.downloadingButton');
      statusText = t('update.downloading');
    } else if (state.updateStage === 'installing' || state.updateStage === 'restarting') {
      labelText = t('update.installingButton');
      statusText = state.updateStage === 'restarting' ? t('update.restarting') : t('update.installing');
    } else if (state.updateError) {
      statusText = updateErrorText();
      if (available) labelText = t('update.updateButton', { version: info.latest });
    } else if (info?.available) {
      labelText = t('update.updateButton', { version: info.latest });
      statusText = t('update.available', { version: info.latest });
    } else if (info) {
      statusText = t('update.upToDate', { version: info.current || state.app?.version || '' });
    }

    button.disabled = busy;
    button.classList.toggle('primary', available);
    if (label) label.textContent = labelText;
    if (status) status.textContent = statusText;
    if (badge) {
      badge.hidden = !(available && !busy);
      badge.textContent = t('update.badge');
      badge.title = t('update.badgeTitle');
    }
    if (progress) progress.hidden = state.updateStage !== 'downloading';

    const notesBox = $('#update-notes');
    const notesBody = $('#update-notes-body');
    const showNotes = Boolean(available && info && !busy);
    if (notesBox) notesBox.hidden = !showNotes;
    if (notesBody) {
      if (showNotes) {
        const html = renderReleaseNotes(info.notes);
        notesBody.innerHTML = html || `<p class="update-notes-empty">${escapeHtml(t('update.notesEmpty'))}</p>`;
      } else {
        notesBody.innerHTML = '';
      }
    }
    if (showNotes) {
      const notesTitle = $('#update-notes-title');
      if (notesTitle) notesTitle.textContent = t('update.notesTitle', { version: info.latest });
      const notesLink = $('#update-notes-link');
      if (notesLink) {
        const url = String(info.release_url || '');
        notesLink.hidden = !/^https:\/\//i.test(url);
        if (!notesLink.hidden) notesLink.href = url;
      }
    }

    const settingsButton = $('#settings-btn');
    if (settingsButton) {
      settingsButton.classList.toggle('has-update', available && !busy);
      if (available && !busy) settingsButton.title = t('update.badgeTitle');
      else settingsButton.removeAttribute('title');
    }
    const chip = $('#update-chip');
    if (chip) {
      chip.hidden = !(available && !busy);
      if (available) chip.title = t('update.updateButton', { version: info?.latest || '' });
      else chip.removeAttribute('title');
      const chipLabel = $('#update-chip-label');
      if (chipLabel) chipLabel.textContent = t('update.chipLabel');
    }
  }

  async function checkForUpdates(options = {}) {
    if (updateInProgress()) return null;
    state.updateStage = 'checking';
    state.updateError = '';
    state.updateErrorPhase = '';
    renderUpdatePanel();
    try {
      const info = await call('check_for_update');
      state.updateInfo = info;
      state.updateStage = 'idle';
      state.updateError = '';
      state.updateErrorPhase = '';
      renderUpdatePanel();
      return info;
    } catch (error) {
      console.error(error);
      state.updateStage = options.silent ? 'idle' : 'error';
      state.updateError = options.silent ? '' : (error?.message || 'update_network');
      state.updateErrorPhase = options.silent ? '' : 'check';
      renderUpdatePanel();
      return null;
    }
  }

  async function waitForSave() {
    for (let i = 0; i < 50 && state.saving; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (state.dirty && !state.saving) await saveNow();
    for (let i = 0; i < 50 && state.saving; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !state.saving && !state.dirty;
  }

  async function installUpdate() {
    const info = state.updateInfo;
    const asset = info?.asset;
    if (!info?.available || !asset?.url) return checkForUpdates();
    if (updateInProgress()) return;
    let phase = 'save';
    state.updateStage = 'preparing';
    state.updateError = '';
    state.updateErrorPhase = '';
    renderUpdatePanel();
    try {
      const saved = await waitForSave();
      if (!saved) throw new Error('update_save_failed');
      phase = 'download';
      state.updateStage = 'downloading';
      renderUpdatePanel();
      const downloaded = await call('download_update', asset.url, asset.name, asset.size, asset.digest);
      if (!downloaded?.path) throw new Error('update_download_failed');
      phase = 'install';
      state.updateStage = 'installing';
      renderUpdatePanel();
      const installed = await call('install_update', downloaded.path);
      if (!installed?.started) throw new Error('update_install_failed');
      state.updateStage = 'restarting';
      renderUpdatePanel();
    } catch (error) {
      console.error(error);
      state.updateStage = 'error';
      state.updateError = error?.message || 'update_install_failed';
      state.updateErrorPhase = phase;
      renderUpdatePanel();
    }
  }

  async function exportBackup() {
    try {
      const path = await call('export_backup');
      if (path) showToast(t('backup.exported'), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('toast.exportFailed'), 'error');
    }
  }

  async function importBackup() {
    const mode = await showChoice({
      title: t('backup.importTitle'),
      body: t('backup.importBody'),
      options: [
        { value: 'merge', label: t('backup.merge'), description: t('backup.mergeDesc'), icon: 'upload' },
        { value: 'replace', label: t('backup.replace'), description: t('backup.replaceDesc'), icon: 'restore' }
      ]
    });
    if (!mode) return;
    try {
      const result = await call('import_backup', mode);
      if (!result) return;
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      showToast(t('backup.imported', { notes: result.notes || 0, groups: result.groups || 0 }), 'success');
      if (state.note) {
        const fresh = await call('get_note', state.note.id);
        if (fresh) {
          state.note = fresh;
          renderEditor();
        } else {
          closeEditor();
        }
      }
      refreshDataPanel();
    } catch (error) {
      console.error(error);
      showToast(t('backup.importFailed'), 'error');
    }
  }

  async function openStats() {
    const modal = $('#stats-modal');
    if (!modal) return;
    const grid = $('#stats-grid');
    if (grid) grid.innerHTML = `<div class="history-empty">${SVG('history')}<p>${escapeHtml(t('dialog.loading'))}</p></div>`;
    openModal(modal);
    try {
      const stats = await call('get_stats');
      if (grid) {
        const cards = [
          ['stats.notes', Number(stats.notes || 0).toLocaleString()],
          ['stats.words', Number(stats.words || 0).toLocaleString()],
          ['stats.notebooks', Number(stats.groups || 0).toLocaleString()],
          ['stats.tags', Number(stats.tags || 0).toLocaleString()],
          ['stats.revisions', Number(stats.revisions || 0).toLocaleString()],
          ['stats.recent', Number(stats.recent_notes || 0).toLocaleString()],
          ['stats.storage', formatBytes(stats.storage_bytes)],
          ['stats.notes', Number(stats.favorites || 0).toLocaleString()],
          ['stats.lastBackup', stats.last_backup ? String(stats.last_backup).split(/[\\/]/).pop() : t('stats.noBackup'), true]
        ];
        grid.innerHTML = cards.map(([key, value, wide]) => `<div class="stat-card${wide ? ' wide' : ''}">
          <div class="stat-label">${escapeHtml(t(key))}</div>
          <div class="stat-value">${escapeHtml(String(value))}</div>
        </div>`).join('');
      }
    } catch (error) {
      console.error(error);
      if (grid) grid.innerHTML = `<div class="command-empty">${escapeHtml(t('error.title'))}</div>`;
    }
  }

  function renderGroupColors() {
    const holder = $('#group-colors');
    if (!holder) return;
    holder.innerHTML = GROUP_COLORS.map((color) => `<button class="group-color${state.groupDraft.color === color ? ' selected' : ''}" data-group-color="${color}" style="--swatch:${groupColor(color)}" title="${escapeAttr(colorLabel(color))}" aria-label="${escapeAttr(colorLabel(color))}"></button>`).join('');
  }

  function renderGroupIcons() {
    const holder = $('#group-icons');
    if (!holder) return;
    holder.innerHTML = GROUP_ICONS.map((icon) => `<button class="group-icon-btn${state.groupDraft.icon === icon ? ' selected' : ''}" data-group-icon="${icon}" title="${escapeAttr(icon)}" aria-label="${escapeAttr(icon)}">${SVG(icon)}</button>`).join('');
  }

  function openGroupModal(groupId = null) {
    const modal = $('#group-modal');
    if (!modal) return;
    const group = groupId ? groupById(groupId) : null;
    state.groupEditId = group ? group.id : null;
    state.groupDraft = {
      color: group?.color || 'amber',
      icon: group?.icon || 'book'
    };
    $('#group-modal-title').textContent = t(group ? 'group.edit' : 'group.new');
    const subtitle = $('#group-modal-subtitle');
    if (subtitle) subtitle.textContent = '';
    const input = $('#group-name');
    input.value = group?.name || '';
    input.placeholder = t('group.namePlaceholder');
    const error = $('#group-error');
    error.hidden = true;
    error.textContent = '';
    const del = $('#group-delete');
    if (del) del.hidden = !group;
    const save = $('#group-save');
    if (save) save.textContent = t(group ? 'group.save' : 'group.create');
    renderGroupColors();
    renderGroupIcons();
    openModal(modal);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  }

  async function saveGroup() {
    const nameInput = $('#group-name');
    const name = String(nameInput?.value || '').trim();
    const error = $('#group-error');
    if (!name) {
      error.textContent = t('group.nameRequired');
      error.hidden = false;
      nameInput.focus();
      return;
    }
    try {
      let group = null;
      if (state.groupEditId) {
        group = await call('update_group', state.groupEditId, { ...state.groupDraft, name });
      } else {
        group = await call('create_group', name, state.groupDraft.color, state.groupDraft.icon);
      }
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      closeModal($('#group-modal'));
      showToast(t(state.groupEditId ? 'group.updatedToast' : 'group.createdToast'), 'success');
      const callback = state.groupCreatedCallback;
      state.groupCreatedCallback = null;
      if (callback && group) callback(group);
      if (state.note && state.note.group_id === group?.id) {
        state.note.group = group;
        updateEditorMeta();
      }
      if (!state.groupEditId && !callback && group) {
        setView('group', { groupId: group.id });
      }
    } catch (errorObject) {
      console.error(errorObject);
      const message = String(errorObject.message || '');
      if (message.includes('group_exists')) error.textContent = t('group.exists');
      else if (message.includes('group_name_required')) error.textContent = t('group.nameRequired');
      else error.textContent = t('dialog.errorBody');
      error.hidden = false;
    }
  }

  async function deleteGroup(groupId) {
    const group = groupById(groupId);
    if (!group) return;
    closeModal($('#group-modal'));
    const mode = await showChoice({
      title: t('group.deleteTitle', { name: group.name }),
      body: t('group.deleteBody'),
      options: [
        { value: 'keep', label: t('group.keep'), description: t('group.keepDesc'), icon: 'note' },
        { value: 'trash', label: t('group.trashNotes'), description: t('group.trashNotesDesc'), icon: 'trash' }
      ]
    });
    if (!mode) return;
    try {
      await call('delete_group', group.id, mode === 'trash' ? 'delete_notes' : 'keep_notes');
      if (state.view === 'group' && state.groupId === group.id) {
        state.view = 'all';
        state.groupId = null;
      }
      if (state.note?.group_id === group.id) {
        state.note.group_id = null;
        state.note.group = null;
        updateEditorMeta();
      }
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      ensureCurrentVisible();
      showToast(t('group.deletedToast'), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function openGroupMenu(groupId, anchor) {
    const group = groupById(groupId);
    if (!group) return;
    openAnchoredMenu([
      { label: t('group.edit'), icon: 'edit', action: () => openGroupModal(group.id) },
      { label: t('editor.newNote'), icon: 'plus', action: () => newNote({ groupId: group.id }) },
      { type: 'sep' },
      { label: t('group.delete'), icon: 'trash', danger: true, action: () => deleteGroup(group.id) }
    ], anchor);
  }

  function renderMoveList() {
    const holder = $('#move-list');
    if (!holder) return;
    const groups = state.meta.groups || [];
    const selected = state.moveTarget;
    const options = [
      `<button class="move-item${selected === null ? ' selected' : ''}" data-move-target="none">
        <span class="group-badge">${SVG('note')}</span>
        <span class="side-label">${escapeHtml(t('editor.noNotebookOption'))}</span>
        ${SVG('check', 'icon check-mark')}
      </button>`,
      ...groups.map((group) => `<button class="move-item${selected === group.id ? ' selected' : ''}" data-move-target="${escapeAttr(group.id)}">
        <span class="group-badge" style="--group-color:${groupColor(group.color)}">${SVG(groupIcon(group.icon))}</span>
        <span class="side-label">${escapeHtml(group.name)}</span>
        <span class="move-count">${Number(group.note_count) || 0}</span>
        ${SVG('check', 'icon check-mark')}
      </button>`),
      `<button class="move-item" data-move-new="1" style="border-top:1px solid var(--border);border-radius:0;margin-top:4px">
        <span class="group-badge">${SVG('plus')}</span>
        <span class="side-label">${escapeHtml(t('editor.newNotebookOption'))}</span>
      </button>`
    ];
    holder.innerHTML = options.join('');
    const confirm = $('#move-confirm');
    if (confirm) confirm.disabled = selected === undefined;
    $$('[data-move-target]', holder).forEach((button) => {
      button.addEventListener('click', () => {
        state.moveTarget = button.dataset.moveTarget === 'none' ? null : button.dataset.moveTarget;
        renderMoveList();
      });
    });
    $('[data-move-new]', holder)?.addEventListener('click', () => {
      state.groupCreatedCallback = (group) => {
        state.moveTarget = group.id;
        renderMoveList();
      };
      openGroupModal();
    });
  }

  function openMove(ids, initialTarget = undefined) {
    const modal = $('#move-modal');
    if (!modal) return;
    state.moveIds = (ids || []).filter(Boolean);
    state.moveInitialTarget = initialTarget;
    state.moveTarget = initialTarget;
    const subtitle = $('#move-modal-subtitle');
    if (subtitle) subtitle.textContent = t('editor.moveBody', { count: state.moveIds.length });
    renderMoveList();
    openModal(modal);
  }

  async function confirmMove() {
    if (state.moveTarget === undefined) return;
    const ids = state.moveIds.slice();
    await moveNotes(ids, state.moveTarget);
    closeModal($('#move-modal'));
    if (state.note && ids.includes(state.note.id)) {
      const fresh = await call('get_note', state.note.id).catch(() => null);
      if (fresh) {
        state.note = fresh;
        updateEditorMeta();
      }
    }
  }

  function updateBindingBadge() {
    const badge = $('#binding-badge');
    if (!badge) return;
    badge.hidden = true;
  }

  function renderHistory() {
    const list = $('#history-list');
    const placeholder = $('#history-placeholder');
    const doc = $('#history-doc');
    const restore = $('#history-restore');
    if (!list) return;
    if (!state.historyRevisions.length) {
      list.innerHTML = `<div class="history-empty">${SVG('history')}<p>${escapeHtml(t('history.empty'))}</p><p>${escapeHtml(t('history.emptyBody'))}</p></div>`;
    } else {
      list.innerHTML = state.historyRevisions.map((revision) => {
        const parts = formatHistoryDate(revision.created_at);
        const active = state.historySelected === revision.id;
        return `<button class="history-item${active ? ' active' : ''}" data-revision="${revision.id}">
          <div class="history-date">${escapeHtml(parts.date)}</div>
          <div class="history-time">${escapeHtml(parts.time)} Â· ${escapeHtml(t('history.words', { n: revision.word_count || 0 }))}</div>
          <div class="history-excerpt">${escapeHtml(revision.excerpt || revision.title || t('editor.noContent'))}</div>
        </button>`;
      }).join('');
    }
    const selected = state.historyRevisions.find((revision) => revision.id === state.historySelected);
    if (placeholder) placeholder.hidden = Boolean(selected);
    if (doc) {
      doc.hidden = !selected;
      doc.innerHTML = selected ? `${selected.title ? `<h1>${escapeHtml(selected.title)}</h1>` : ''}${sanitizeHtml(selected.content || '')}` : '';
    }
    if (restore) restore.disabled = !selected;
  }

  async function openHistory() {
    const note = state.note;
    if (!note) return;
    if (state.dirty) await saveNow();
    const modal = $('#history-modal');
    if (!modal) return;
    state.historyNoteId = note.id;
    state.historySelected = null;
    state.historyRevisions = [];
    renderHistory();
    openModal(modal);
    try {
      const revisions = await call('get_revisions', note.id);
      state.historyRevisions = Array.isArray(revisions) ? revisions : [];
      renderHistory();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function restoreHistory() {
    if (!state.historySelected || !state.historyNoteId) return;
    const revision = state.historyRevisions.find((item) => item.id === state.historySelected);
    if (!revision) return;
    const confirmed = await showConfirm({
      title: t('history.restoreTitle'),
      body: t('history.restoreBody'),
      okLabel: t('history.restore'),
      tone: 'primary'
    });
    if (!confirmed) return;
    try {
      const restored = await call('restore_revision', state.historyNoteId, revision.id);
      if (restored) {
        state.note = restored;
        state.dirty = false;
        renderEditor();
      }
      closeModal($('#history-modal'));
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      showToast(t('history.restored'), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  const SHORTCUTS = [
    ['shortcuts.newNote', ['Ctrl', 'N']],
    ['shortcuts.search', ['Ctrl', 'F']],
    ['shortcuts.palette', ['Ctrl', 'K']],
    ['shortcuts.save', ['Ctrl', 'S']],
    ['shortcuts.draw', ['Ctrl', 'Shift', 'D']],
    ['shortcuts.focus', ['Ctrl', 'Shift', 'F']],
    ['shortcuts.fullscreen', ['F11']],
    ['shortcuts.settings', ['Ctrl', ',']],
    ['shortcuts.bold', ['Ctrl', 'B']],
    ['shortcuts.italic', ['Ctrl', 'I']],
    ['shortcuts.underline', ['Ctrl', 'U']],
    ['shortcuts.checklist', ['Ctrl', 'Shift', 'C']],
    ['shortcuts.print', ['Ctrl', 'P']],
    ['shortcuts.help', ['F1']],
    ['shortcuts.close', ['Esc']]
  ];

  function openShortcuts() {
    const grid = $('#shorts-grid');
    if (!grid) return;
    grid.innerHTML = SHORTCUTS.map(([key, keys], index) => `<div class="short-row" data-short-index="${index}">
      <span>${escapeHtml(t(key))}</span>
      <span class="short-keys">${keys.map((part) => `<kbd>${escapeHtml(part)}</kbd>`).join('')}</span>
    </div>`).join('');
    openModal($('#shortcuts-modal'));
  }

  const DRAW_COLORS = ['#1f2328', '#e5a94b', '#e07a8d', '#53b8a7', '#9b8ce0', '#64a8e8', '#f4f1e8', '#8b93a3'];

  function selectionInsideEditor() {
    const body = $('#note-body');
    const selection = window.getSelection();
    if (!body || !selection || !selection.rangeCount) return false;
    return body.contains(selection.anchorNode);
  }

  function saveEditorRange() {
    const selection = window.getSelection();
    if (!selectionInsideEditor()) return;
    state.savedRange = selection.getRangeAt(0).cloneRange();
  }

  function placeCaretAtEnd() {
    const body = $('#note-body');
    if (!body) return;
    const range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    state.savedRange = range.cloneRange();
  }

  function restoreEditorRange() {
    const body = $('#note-body');
    if (!body) return false;
    const selection = window.getSelection();
    if (state.savedRange && body.contains(state.savedRange.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(state.savedRange);
      return true;
    }
    placeCaretAtEnd();
    return false;
  }

  function afterEditorInput() {
    markDirty();
    updateLiveCounts();
    updateWordCountDisplay();
    saveEditorRange();
    refreshToolbarState();
  }

  function execEditor(command, value = null) {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    body.focus();
    restoreEditorRange();
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(command, false, value);
    } catch (error) {
      console.error(error);
    }
    afterEditorInput();
  }

  function insertHtmlAtSelection(html) {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    body.focus();
    restoreEditorRange();
    document.execCommand('insertHTML', false, html);
    afterEditorInput();
  }

  const IMAGE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const IMAGE_MIN_WIDTH = 60;

  function imageFrame() {
    let frame = $('#image-frame');
    if (frame) return frame;
    frame = document.createElement('div');
    frame.id = 'image-frame';
    frame.className = 'image-frame';
    frame.hidden = true;
    IMAGE_HANDLES.forEach((name) => {
      const handle = document.createElement('span');
      handle.className = `image-handle ${name}`;
      handle.dataset.handle = name;
      frame.appendChild(handle);
    });
    const badge = document.createElement('span');
    badge.className = 'image-size-badge';
    frame.appendChild(badge);
    const toolbar = document.createElement('div');
    toolbar.className = 'image-toolbar';
    toolbar.innerHTML = [
      `<button type="button" data-image-align="left" title="${escapeHtml(t('image.alignLeft'))}" aria-label="${escapeHtml(t('image.alignLeft'))}"><svg class="icon"><use href="#i-align-left"></use></svg></button>`,
      `<button type="button" data-image-align="center" title="${escapeHtml(t('image.alignCenter'))}" aria-label="${escapeHtml(t('image.alignCenter'))}"><svg class="icon"><use href="#i-align-center"></use></svg></button>`,
      `<button type="button" data-image-align="right" title="${escapeHtml(t('image.alignRight'))}" aria-label="${escapeHtml(t('image.alignRight'))}"><svg class="icon"><use href="#i-align-right"></use></svg></button>`,
      '<span class="image-toolbar-sep"></span>',
      `<button type="button" data-image-reset title="${escapeHtml(t('image.resetSize'))}" aria-label="${escapeHtml(t('image.resetSize'))}"><svg class="icon"><use href="#i-expand"></use></svg></button>`
    ].join('');
    frame.appendChild(toolbar);
    frame.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.image-toolbar')) {
        event.preventDefault();
        return;
      }
      const handle = event.target.closest('[data-handle]');
      if (handle) beginImageResize(event, handle.dataset.handle);
    });
    frame.addEventListener('click', (event) => {
      const align = event.target.closest('[data-image-align]');
      if (align) {
        event.preventDefault();
        applyImageAlignment(align.dataset.imageAlign);
        return;
      }
      if (event.target.closest('[data-image-reset]')) {
        event.preventDefault();
        resetImageSize();
      }
    });
    document.body.appendChild(frame);
    return frame;
  }

  function imageEditorWidth() {
    const body = $('#note-body');
    return Math.max(240, (body ? body.clientWidth : window.innerWidth) - 8);
  }

  function positionImageFrame() {
    const img = state.imageSelection;
    const frame = $('#image-frame');
    if (!img || !frame || frame.hidden) return;
    if (!img.isConnected) {
      clearImageSelection();
      return;
    }
    const rect = img.getBoundingClientRect();
    if (rect.width < 6 || rect.height < 6 || rect.bottom < 0 || rect.top > window.innerHeight) {
      frame.style.visibility = 'hidden';
      return;
    }
    frame.style.visibility = 'visible';
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
    frame.classList.toggle('toolbar-below', rect.top < 74);
  }

  function selectImage(img) {
    if (!img || !$('#note-body')?.contains(img)) return;
    const frame = imageFrame();
    state.imageSelection = img;
    frame.hidden = false;
    document.body.classList.add('image-selected');
    positionImageFrame();
  }

  function clearImageSelection() {
    if (!state.imageSelection) return;
    state.imageSelection = null;
    const frame = $('#image-frame');
    if (frame) {
      frame.hidden = true;
      frame.classList.remove('is-resizing', 'toolbar-below');
    }
    document.body.classList.remove('image-selected', 'image-resizing');
  }

  function beginImageResize(event, handle) {
    const img = state.imageSelection;
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = $('#image-frame');
    const rect = img.getBoundingClientRect();
    const ratio = rect.width > 0 ? rect.height / rect.width : 1;
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const maxWidth = imageEditorWidth();
    const badge = frame ? frame.querySelector('.image-size-badge') : null;
    document.body.classList.add('image-resizing');
    if (frame) frame.classList.add('is-resizing');
    if (badge) badge.textContent = `${Math.round(startWidth)} px`;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let delta;
      if (handle === 'e') delta = dx;
      else if (handle === 'w') delta = -dx;
      else if (handle === 'n') delta = -dy / (ratio || 1);
      else if (handle === 's') delta = dy / (ratio || 1);
      else {
        const horizontal = handle.includes('e') ? dx : -dx;
        const vertical = (handle.includes('s') ? dy : -dy) / (ratio || 1);
        delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
      }
      const width = clamp(startWidth + delta, IMAGE_MIN_WIDTH, maxWidth);
      img.style.width = `${Math.round(width)}px`;
      img.style.removeProperty('height');
      if (badge) badge.textContent = `${Math.round(width)} px`;
      positionImageFrame();
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      document.body.classList.remove('image-resizing');
      if (frame) frame.classList.remove('is-resizing');
      if (state.imageSelection === img) {
        markDirty();
        positionImageFrame();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function applyImageAlignment(align) {
    const img = state.imageSelection;
    if (!img) return;
    img.style.removeProperty('margin-left');
    img.style.removeProperty('margin-right');
    if (align === 'left') {
      img.style.marginLeft = '0';
      img.style.marginRight = 'auto';
    } else if (align === 'right') {
      img.style.marginLeft = 'auto';
      img.style.marginRight = '0';
    } else {
      img.style.marginLeft = 'auto';
      img.style.marginRight = 'auto';
    }
    markDirty();
    positionImageFrame();
  }

  function resetImageSize() {
    const img = state.imageSelection;
    if (!img) return;
    img.style.removeProperty('width');
    img.style.removeProperty('height');
    img.removeAttribute('width');
    img.removeAttribute('height');
    markDirty();
    positionImageFrame();
  }

  function applyBlockStyle(tag) {
    if (!tag) return;
    execEditor('formatBlock', `<${tag}>`);
    const select = $('#block-style');
    if (select) select.value = tag;
  }

  function refreshToolbarState() {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    const commands = {
      bold: '[data-cmd="bold"]',
      italic: '[data-cmd="italic"]',
      underline: '[data-cmd="underline"]',
      strikeThrough: '[data-cmd="strikeThrough"]',
      insertUnorderedList: '[data-cmd="insertUnorderedList"]',
      insertOrderedList: '[data-cmd="insertOrderedList"]',
      justifyLeft: '[data-cmd="justifyLeft"]',
      justifyCenter: '[data-cmd="justifyCenter"]',
      justifyRight: '[data-cmd="justifyRight"]',
      indent: '[data-cmd="indent"]',
      outdent: '[data-cmd="outdent"]'
    };
    Object.entries(commands).forEach(([command, selector]) => {
      const button = $(selector);
      if (!button) return;
      let active = false;
      try {
        active = document.queryCommandState(command);
      } catch (_) {
        active = false;
      }
      button.classList.toggle('active', active);
    });
    const checklistButton = $('#checklist-btn');
    if (checklistButton) {
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      checklistButton.classList.toggle('active', Boolean(element?.closest('ul.checklist')));
    }
    const blockSelect = $('#block-style');
    if (blockSelect) {
      try {
        const value = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
        const normalized = value === 'div' || value === '' ? 'p' : value;
        if (['p', 'h1', 'h2', 'h3', 'blockquote', 'pre'].includes(normalized)) blockSelect.value = normalized;
      } catch (_) {
        // ignore unsupported format queries
      }
    }
  }

  function toggleChecklist() {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    body.focus();
    restoreEditorRange();
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const existing = element?.closest('ul.checklist');
    if (existing) {
      existing.classList.remove('checklist');
      $$('li', existing).forEach((li) => {
        li.removeAttribute('data-checked');
        const check = $('.chk', li);
        if (check) check.remove();
        const text = $('.chk-text', li);
        if (text) {
          const fragment = document.createDocumentFragment();
          while (text.firstChild) fragment.appendChild(text.firstChild);
          text.replaceWith(fragment);
        }
      });
      afterEditorInput();
      return;
    }
    document.execCommand('insertUnorderedList', false, null);
    const updatedSelection = window.getSelection();
    const node = updatedSelection?.anchorNode;
    const updatedElement = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const list = updatedElement?.closest('ul, ol');
    if (!list) {
      afterEditorInput();
      return;
    }
    list.classList.remove('checklist');
    list.classList.add('checklist');
    $$('li', list).forEach((li) => {
      if (!$('.chk', li)) {
        const check = document.createElement('span');
        check.className = 'chk';
        check.setAttribute('contenteditable', 'false');
        li.insertBefore(check, li.firstChild);
      }
      if (!$('.chk-text', li)) {
        const text = document.createElement('span');
        text.className = 'chk-text';
        while (li.childNodes.length > 1) text.appendChild(li.childNodes[1]);
        li.appendChild(text);
      }
      li.setAttribute('data-checked', 'false');
    });
    afterEditorInput();
  }

  function toggleChecklistItem(check) {
    const item = check.closest('li');
    if (!item) return;
    const checked = item.getAttribute('data-checked') === 'true';
    item.setAttribute('data-checked', checked ? 'false' : 'true');
    markDirty();
  }

  function insertDivider() {
    insertHtmlAtSelection('<hr><p><br></p>');
  }

  function tableCellAtSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const anchor = selection.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const cell = element?.closest?.('td, th');
    const body = $('#note-body');
    if (!cell || !body || !body.contains(cell)) return null;
    return cell;
  }

  function placeCaretIn(element, atEnd = false) {
    const body = $('#note-body');
    if (!body || !element) return;
    body.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(!atEnd);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    saveEditorRange();
  }

  function hideTableTools() {
    const tools = $('#table-tools');
    if (tools) tools.hidden = true;
    if (state.tableCell) state.tableCell.classList.remove('table-active');
    state.tableCell = null;
  }

  function positionTableTools() {
    const tools = $('#table-tools');
    const table = state.tableCell?.closest('table');
    if (!tools || tools.hidden || !table) return;
    const rect = table.getBoundingClientRect();
    const toolbar = $('#editor-toolbar');
    const safeTop = (toolbar?.getBoundingClientRect().bottom || 50) + 8;
    const width = tools.offsetWidth || 360;
    const height = tools.offsetHeight || 38;
    let top = rect.top - height - 8;
    if (top < safeTop) top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      const above = rect.top - height - 8;
      top = above >= safeTop ? above : Math.max(safeTop, window.innerHeight - height - 8);
    }
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    tools.style.left = `${left}px`;
    tools.style.top = `${Math.max(8, top)}px`;
  }

  function updateTableToolButtons() {
    const cell = state.tableCell;
    const table = cell?.closest('table');
    if (!cell || !table || !table.isConnected) {
      hideTableTools();
      return;
    }
    const rows = table.rows.length;
    const columns = cell.parentElement?.cells.length || 0;
    $$('#table-tools [data-table-action]').forEach((button) => {
      if (button.dataset.tableAction === 'remove-row') button.disabled = rows <= 1;
      if (button.dataset.tableAction === 'remove-column') button.disabled = columns <= 1;
    });
  }

  function showTableTools(cell) {
    const tools = $('#table-tools');
    const body = $('#note-body');
    if (!tools || !cell || !cell.isConnected || !body || body.contentEditable !== 'true') {
      hideTableTools();
      return;
    }
    $$('#note-body .table-active').forEach((active) => active.classList.remove('table-active'));
    state.tableCell = cell;
    cell.classList.add('table-active');
    tools.hidden = false;
    updateTableToolButtons();
    positionTableTools();
  }

  function createTableRow(columnCount) {
    const row = document.createElement('tr');
    for (let index = 0; index < columnCount; index += 1) {
      const cell = document.createElement('td');
      cell.innerHTML = '<br>';
      row.appendChild(cell);
    }
    return row;
  }

  function addTableRow(cell) {
    const row = cell.parentElement;
    const newRow = createTableRow(Math.max(1, row.cells.length));
    row.after(newRow);
    return newRow.cells[Math.min(cell.cellIndex, newRow.cells.length - 1)];
  }

  function addTableColumn(cell) {
    const index = cell.cellIndex;
    const table = cell.closest('table');
    Array.from(table.rows).forEach((row) => {
      const source = row.cells[index];
      const newCell = document.createElement(source?.tagName === 'TH' ? 'th' : 'td');
      newCell.innerHTML = '<br>';
      if (source) source.after(newCell);
      else row.appendChild(newCell);
    });
    return cell.nextElementSibling || cell;
  }

  function removeTableRow(cell) {
    const row = cell.parentElement;
    const table = cell.closest('table');
    if (table.rows.length <= 1) {
      showToast(t('table.minRow'), 'info');
      return cell;
    }
    const index = cell.cellIndex;
    const targetRow = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    return targetRow?.cells[Math.min(index, targetRow.cells.length - 1)] || table.rows[0]?.cells[0] || null;
  }

  function removeTableColumn(cell) {
    const row = cell.parentElement;
    const table = cell.closest('table');
    if (row.cells.length <= 1) {
      showToast(t('table.minColumn'), 'info');
      return cell;
    }
    const index = cell.cellIndex;
    Array.from(table.rows).forEach((tableRow) => tableRow.cells[index]?.remove());
    return row.cells[Math.min(index, row.cells.length - 1)] || null;
  }

  function runTableAction(action) {
    const cell = state.tableCell;
    if (!cell || !cell.isConnected) return;
    const table = cell.closest('table');
    if (!table) return;
    if (action === 'delete') {
      const target = table.closest('.table-scroll') || table;
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<br>';
      target.replaceWith(paragraph);
      hideTableTools();
      placeCaretIn(paragraph, true);
      afterEditorInput();
      return;
    }
    let nextCell = cell;
    if (action === 'add-row') nextCell = addTableRow(cell);
    else if (action === 'add-column') nextCell = addTableColumn(cell);
    else if (action === 'remove-row') nextCell = removeTableRow(cell);
    else if (action === 'remove-column') nextCell = removeTableColumn(cell);
    if (nextCell && nextCell.isConnected) {
      placeCaretIn(nextCell);
      showTableTools(nextCell);
    } else {
      hideTableTools();
    }
    afterEditorInput();
  }

  function handleTableTab(event) {
    if (event.key !== 'Tab') return false;
    const cell = tableCellAtSelection();
    if (!cell) return false;
    event.preventDefault();
    const table = cell.closest('table');
    const rows = Array.from(table.rows);
    const rowIndex = rows.indexOf(cell.parentElement);
    let target = null;
    if (event.shiftKey) {
      if (cell.cellIndex > 0) target = cell.parentElement.cells[cell.cellIndex - 1];
      else if (rowIndex > 0) target = rows[rowIndex - 1].cells[rows[rowIndex - 1].cells.length - 1];
      else target = rows[rows.length - 1].cells[rows[rows.length - 1].cells.length - 1];
    } else if (cell.cellIndex < cell.parentElement.cells.length - 1) {
      target = cell.parentElement.cells[cell.cellIndex + 1];
    } else if (rowIndex < rows.length - 1) {
      target = rows[rowIndex + 1].cells[0];
    } else {
      const newRow = createTableRow(cell.parentElement.cells.length);
      cell.parentElement.after(newRow);
      target = newRow.cells[0];
      afterEditorInput();
    }
    if (target) {
      placeCaretIn(target);
      showTableTools(target);
    }
    return true;
  }

  function chooseTableSize() {
    const modal = $('#table-modal');
    if (!modal) return Promise.resolve(null);
    const rowsInput = $('#table-rows');
    const columnsInput = $('#table-columns');
    const headerInput = $('#table-header-row');
    const presets = $$('[data-table-preset]', modal);
    const insertButton = $('#table-insert-btn');
    rowsInput.value = '3';
    columnsInput.value = '3';
    headerInput.checked = true;
    const syncPresets = () => {
      const value = `${rowsInput.value},${columnsInput.value}`;
      presets.forEach((preset) => preset.classList.toggle('active', preset.dataset.tablePreset === value));
    };
    syncPresets();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const close = (value) => {
        finish(value);
        closeModal(modal);
      };
      const submit = () => {
        close({
          rows: Math.min(30, Math.max(1, Number.parseInt(rowsInput.value, 10) || 1)),
          columns: Math.min(30, Math.max(1, Number.parseInt(columnsInput.value, 10) || 1)),
          header: headerInput.checked
        });
      };
      presets.forEach((preset) => {
        preset.onclick = () => {
          const [rows, columns] = preset.dataset.tablePreset.split(',');
          rowsInput.value = rows;
          columnsInput.value = columns;
          syncPresets();
        };
      });
      $$('[data-close-table]', modal).forEach((button) => {
        button.onclick = () => close(null);
      });
      rowsInput.oninput = syncPresets;
      columnsInput.oninput = syncPresets;
      rowsInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      };
      columnsInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      };
      insertButton.onclick = submit;
      openModal(modal, () => finish(null));
      setTimeout(() => {
        rowsInput.focus();
        rowsInput.select();
      }, 30);
    });
  }

  async function insertTable() {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    saveEditorRange();
    const size = await chooseTableSize();
    if (!size) {
      body.focus();
      restoreEditorRange();
      return;
    }
    const bodyCell = '<td><br></td>';
    const headCell = '<th><br></th>';
    const rows = Array.from({ length: size.rows }, (_, rowIndex) => (
      `<tr>${(rowIndex === 0 && size.header ? headCell : bodyCell).repeat(size.columns)}</tr>`
    )).join('');
    insertHtmlAtSelection(`<div class="table-scroll table-new"><table><tbody>${rows}</tbody></table></div><p><br></p>`);
    const wrapper = body.querySelector('.table-new');
    const table = wrapper?.querySelector('table');
    if (wrapper) wrapper.classList.remove('table-new');
    const firstCell = table?.rows[0]?.cells[0];
    if (firstCell) {
      placeCaretIn(firstCell);
      showTableTools(firstCell);
    }
  }

  function insertInlineCode() {
    const selection = window.getSelection();
    const text = selection && selectionInsideEditor() ? selection.toString() : '';
    if (!text) {
      insertHtmlAtSelection('<code></code>');
      return;
    }
    insertHtmlAtSelection(`<code>${escapeHtml(text)}</code>`);
  }

  async function insertLink() {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    saveEditorRange();
    const selection = window.getSelection();
    const selectedText = selection && selectionInsideEditor() ? selection.toString().trim() : '';
    const url = await showPrompt({
      title: t('editor.linkTitle'),
      body: selectedText ? '' : t('toolbar.link'),
      label: t('editor.linkLabel'),
      placeholder: 'https://example.com',
      okLabel: t('common.save'),
      validate: (value) => {
        const normalized = /^[a-z]+:/i.test(value) ? value : `https://${value}`;
        return safeUrl(normalized) ? true : t('editor.linkInvalid');
      }
    });
    if (!url) {
      body.focus();
      restoreEditorRange();
      return;
    }
    const normalized = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
    if (selectedText) {
      execEditor('createLink', normalized);
    } else {
      insertHtmlAtSelection(`<a href="${escapeAttr(normalized)}">${escapeHtml(normalized)}</a>`);
    }
  }

  function clearFormatting() {
    execEditor('removeFormat');
    execEditor('formatBlock', '<p>');
  }

  function setTextColor(color) {
    state.textColor = color;
    const indicator = $('#text-color-indicator');
    if (indicator) indicator.style.background = color;
    execEditor('foreColor', color);
  }

  function setHighlightColor(color) {
    state.highlightColor = color;
    const indicator = $('#highlight-indicator');
    if (indicator) indicator.style.background = color;
    const body = $('#note-body');
    if (!body) return;
    body.focus();
    restoreEditorRange();
    try {
      if (!document.execCommand('hiliteColor', false, color)) {
        document.execCommand('backColor', false, color);
      }
    } catch (_) {
      document.execCommand('backColor', false, color);
    }
    afterEditorInput();
  }

  function openImagePreview(src) {
    const modal = $('#image-modal');
    const image = $('#image-preview');
    if (!modal || !image || !src) return;
    image.src = src;
    openModal(modal);
  }

  async function addImages() {
    const body = $('#note-body');
    if (!body || body.contentEditable !== 'true') return;
    saveEditorRange();
    try {
      const images = await call('pick_images');
      if (!Array.isArray(images) || !images.length) {
        body.focus();
        return;
      }
      const html = images.map((image) => `<p><img class="note-image" src="${escapeAttr(image.data_url)}" alt="${escapeAttr(image.name || '')}"></p>`).join('');
      insertHtmlAtSelection(html);
    } catch (error) {
      console.error(error);
      showToast(t('toast.imageFailed'), 'error');
    }
  }

  function friendlyFilename(title, extension) {
    const base = String(title || t('common.untitled'))
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Notra';
    return `${base}.${extension}`;
  }

  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, 'text/html');
    const normalize = (value) => value.replace(/\n{3,}/g, '\n\n').trim();
    const inline = (node) => Array.from(node.childNodes).map(walk).join('');
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName;
      if (tag === 'BR') return '\n';
      if (tag === 'STRONG' || tag === 'B') return `**${inline(node)}**`;
      if (tag === 'EM' || tag === 'I') return `*${inline(node)}*`;
      if (tag === 'U') return `<u>${inline(node)}</u>`;
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') return `~~${inline(node)}~~`;
      if (tag === 'MARK') return `==${inline(node)}==`;
      if (tag === 'CODE') return node.parentElement?.tagName === 'PRE' ? inline(node) : `\`${inline(node)}\``;
      if (tag === 'PRE') return `\n\n\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`;
      if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
        return `\n\n${'#'.repeat(Number(tag[1]))} ${inline(node)}\n\n`;
      }
      if (tag === 'BLOCKQUOTE') {
        return `\n\n${inline(node).trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
      }
      if (tag === 'UL' || tag === 'OL') {
        const items = Array.from(node.children).filter((child) => child.tagName === 'LI');
        return `\n\n${items.map((li, index) => {
          const prefix = tag === 'OL' ? `${index + 1}. ` : '- ';
          return `${prefix}${inline(li).trim().replace(/\n/g, '\n  ')}`;
        }).join('\n')}\n\n`;
      }
      if (tag === 'LI') return inline(node);
      if (tag === 'A') return `[${inline(node)}](${node.getAttribute('href') || ''})`;
      if (tag === 'IMG') return `![${node.getAttribute('alt') || 'image'}](${node.getAttribute('src') || ''})`;
      if (tag === 'HR') return '\n\n---\n\n';
      if (tag === 'TABLE') {
        const rows = Array.from(node.querySelectorAll('tr'));
        return `\n\n${rows.map((row) => {
          const cells = Array.from(row.children).map((cell) => (cell.textContent || '').trim().replace(/\|/g, '\\|'));
          return `| ${cells.join(' | ')} |`;
        }).join('\n')}\n\n`;
      }
      if (tag === 'P' || tag === 'DIV') return `${inline(node)}\n\n`;
      return inline(node);
    };
    return normalize(walk(doc.body));
  }

  function exportHtmlDocument(note) {
    const title = note.title || t('common.untitled');
    return `<!doctype html>
<html lang="${state.lang === 'tr' ? 'tr' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#f7f5f0;color:#24262c;font:17px/1.72 Georgia,'Times New Roman',serif}
main{max-width:760px;margin:0 auto;padding:70px 28px 90px}
h1{font:600 34px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-.03em;margin:0 0 28px}
h2,h3,h4{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-.02em}
img{max-width:100%;height:auto;border-radius:10px}
blockquote{border-left:3px solid #d7b46d;margin:1.2em 0;padding-left:18px;color:#5d616b}
pre{background:#f0ede6;padding:14px;border-radius:8px;overflow:auto;font-size:13px}
code{background:#f0ede6;padding:1px 4px;border-radius:4px;font-size:.9em}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #ddd9d0;padding:7px 9px;text-align:left}
hr{border:0;border-top:1px solid #ddd9d0;margin:28px 0}
.chk{display:none}.chk-text{display:inline}
@media(prefers-color-scheme:dark){body{background:#1b1c20;color:#e8e9ec}blockquote{color:#a4a7b0}pre,code{background:#26282d}td,th{border-color:#383b43}hr{border-color:#383b43}}
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1>${sanitizeHtml(note.content || '')}</main></body>
</html>`;
  }

  async function openPrintDialog() {
    if (!state.note) return;
    if (state.dirty) await saveNow();
    const modal = $('#print-modal');
    if (!modal) return;
    const include = $('#print-include-title');
    if (include) include.checked = true;
    const select = $('#print-printer');
    if (select) {
      select.innerHTML = `<option value="">${escapeHtml(t('print.loading'))}</option>`;
      try {
        const info = await call('list_printers');
        const printers = Array.isArray(info?.printers) ? info.printers : [];
        select.innerHTML = printers.length
          ? printers.map((name) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join('')
          : `<option value="">${escapeHtml(t('print.noPrinters'))}</option>`;
        if (info?.default) select.value = info.default;
      } catch (error) {
        console.error(error);
        select.innerHTML = `<option value="">${escapeHtml(t('print.systemDefault'))}</option>`;
      }
    }
    openModal(modal);
  }

  async function runPrint(mode) {
    const note = state.note;
    if (!note) return;
    const includeTitle = $('#print-include-title')?.checked !== false;
    const printer = $('#print-printer')?.value || '';
    const asPdf = mode === 'pdf' || /pdf/i.test(printer);
    const start = $('#print-start');
    const pdfButton = $('#print-save-pdf');
    if (start) start.disabled = true;
    if (pdfButton) pdfButton.disabled = true;
    document.body.classList.toggle('print-no-title', !includeTitle);
    try {
      if (asPdf) {
        const name = (note.title || t('common.untitled')).replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 80) || 'Notra';
        const result = await call('print_note_pdf', `${name}.pdf`);
        if (result?.path) {
          showToast(t('print.pdfSaved'), 'success');
          closeModal($('#print-modal'));
        }
      } else {
        await call('print_note', printer);
        showToast(t('print.sent'), 'success');
        closeModal($('#print-modal'));
      }
    } catch (error) {
      console.error(error);
      showToast(t('print.failed'), 'error');
    } finally {
      document.body.classList.remove('print-no-title');
      if (start) start.disabled = false;
      if (pdfButton) pdfButton.disabled = false;
    }
  }

  async function exportNote(kind) {
    if (!state.note) return;
    if (state.dirty) await saveNow();
    const note = state.note;
    if (kind === 'pdf') {
      await openPrintDialog();
      return;
    }
    try {
      let content = '';
      let extension = 'txt';
      if (kind === 'html') {
        content = exportHtmlDocument(note);
        extension = 'html';
      } else if (kind === 'markdown') {
        const title = note.title || t('common.untitled');
        content = `# ${title}\n\n${htmlToMarkdown(note.content || '')}\n`;
        extension = 'md';
      } else {
        const body = document.createElement('div');
        body.innerHTML = sanitizeHtml(note.content || '');
        content = `${note.title || t('common.untitled')}\n\n${body.innerText || ''}\n`;
        extension = 'txt';
      }
      const path = await call('save_export', friendlyFilename(note.title, extension), content, kind, false);
      if (path) showToast(t('toast.exportSaved', { path }), 'success', { duration: 5000 });
    } catch (error) {
      console.error(error);
      showToast(t('toast.exportFailed'), 'error');
    }
  }

  async function newNote(options = {}) {
    if (state.dirty) await saveNow();
    let groupId = options.groupId;
    if (groupId === undefined) groupId = state.view === 'group' ? state.groupId : null;
    try {
      const note = await call('create_note', '', '', groupId || null, state.view === 'tag' && state.tag ? [state.tag] : [], 'default');
      if (!note) return;
      if (groupId) {
        if (state.view !== 'group' || state.groupId !== groupId) setView('group', { groupId });
      } else if (state.view !== 'all' || state.query) {
        setView('all');
      }
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      await openNote(note.id);
      setTimeout(() => {
        const title = $('#note-title');
        title?.focus();
        title?.select();
      }, 40);
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function toggleFocusMode(force) {
    const app = $('#app');
    if (!app) return;
    const enabled = force === undefined ? !app.classList.contains('focus-mode') : Boolean(force);
    app.classList.toggle('focus-mode', enabled);
    state.focusMode = enabled;
    const button = $('#focus-status-btn');
    if (button) {
      button.classList.toggle('active', enabled);
      button.title = t(enabled ? 'editor.exitFocus' : 'editor.focus');
    }
    if (enabled) $('#note-body')?.focus();
  }

  function updateFullscreenButton() {
    const button = $('#fullscreen-status-btn');
    if (!button) return;
    const label = t(state.fullscreen ? 'editor.exitFullscreen' : 'editor.fullscreen');
    button.classList.toggle('active', state.fullscreen);
    button.title = label;
    button.setAttribute('aria-label', label);
    const text = $('span', button);
    if (text) text.textContent = label;
  }

  async function toggleFullscreen(force) {
    const next = typeof force === 'boolean' ? force : !state.fullscreen;
    if (next === state.fullscreen) return;
    try {
      await call('set_fullscreen', next);
      state.fullscreen = next;
      updateFullscreenButton();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function openExportMenu(anchor) {
    openAnchoredMenu([
      { type: 'label', label: t('editor.export') },
      { label: t('editor.exportHtml'), icon: 'code', action: () => exportNote('html') },
      { label: t('editor.exportMarkdown'), icon: 'note', action: () => exportNote('markdown') },
      { label: t('editor.exportText'), icon: 'file', action: () => exportNote('text') },
      { label: t('editor.exportPdf'), icon: 'print', action: () => openPrintDialog() }
    ], anchor);
  }

  function openNoteMenu(anchor) {
    const note = state.note;
    if (!note) return;
    const trashed = Boolean(note.trashed_at);
    const items = [];
    if (trashed) {
      items.push(
        { label: t('editor.restore'), icon: 'restore', action: restoreCurrent },
        { label: t('editor.deleteForever'), icon: 'trash', danger: true, action: deleteForever }
      );
    } else {
      items.push(
        { label: t(note.pinned ? 'editor.unpin' : 'editor.pin'), icon: 'pin', action: togglePin },
        { label: t(note.favorite ? 'editor.unfavorite' : 'editor.favorite'), icon: 'star', action: toggleFavorite },
        { label: t(note.archived_at ? 'editor.unarchive' : 'editor.archive'), icon: 'archive', action: toggleArchive },
        { label: t('editor.duplicate'), icon: 'copy', action: duplicateCurrent },
        { type: 'sep' },
        { type: 'label', label: t('editor.export') },
        { label: t('editor.exportHtml'), icon: 'code', action: () => exportNote('html') },
        { label: t('editor.exportMarkdown'), icon: 'note', action: () => exportNote('markdown') },
        { label: t('editor.exportText'), icon: 'file', action: () => exportNote('text') },
        { label: t('editor.exportPdf'), icon: 'print', action: () => openPrintDialog() },
        { type: 'sep' },
        { label: t('editor.trash'), icon: 'trash', danger: true, action: trashCurrent }
      );
    }
    openAnchoredMenu(items, anchor);
  }

  function drawContext() {
    const canvas = $('#draw-canvas');
    return canvas ? canvas.getContext('2d') : null;
  }

  function renderDrawColors() {
    const holder = $('#draw-colors');
    if (!holder) return;
    holder.innerHTML = DRAW_COLORS.map((color) => `<button class="draw-color${state.draw.color === color ? ' active' : ''}" data-draw-color="${color}" style="--swatch:${color}" title="${color}" aria-label="${color}"></button>`).join('');
  }

  function drawStrokeStyle(context, stroke) {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.globalAlpha = stroke.tool === 'marker' ? 0.34 : 1;
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineWidth = stroke.size * 2 * (stroke.tool === 'eraser' ? 1.8 : 1);
  }

  function paintStroke(context, stroke) {
    if (!stroke.points.length) return;
    drawStrokeStyle(context, stroke);
    context.beginPath();
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let index = 1; index < stroke.points.length; index += 1) {
      context.lineTo(stroke.points[index].x, stroke.points[index].y);
    }
    context.stroke();
  }

  function redrawCanvas() {
    const canvas = $('#draw-canvas');
    const context = drawContext();
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    state.draw.strokes.forEach((stroke) => paintStroke(context, stroke));
    const wrap = $('#canvas-wrap');
    if (wrap) wrap.classList.toggle('dirty', state.draw.strokes.length > 0);
  }

  function canvasPoint(event) {
    const canvas = $('#draw-canvas');
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height))
    };
  }

  function beginDrawStroke(event) {
    if (event.button !== 0) return;
    const canvas = $('#draw-canvas');
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = canvasPoint(event);
    const stroke = {
      tool: state.draw.tool,
      color: state.draw.color,
      size: state.draw.size,
      points: [point]
    };
    state.draw.current = stroke;
    state.draw.strokes.push(stroke);
    state.draw.redo = [];
    const context = drawContext();
    if (context) paintStroke(context, stroke);
    const wrap = $('#canvas-wrap');
    if (wrap) wrap.classList.add('dirty');
  }

  function continueDrawStroke(event) {
    const stroke = state.draw.current;
    const canvas = $('#draw-canvas');
    if (!stroke || !canvas) return;
    event.preventDefault();
    const point = canvasPoint(event);
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1.6) return;
    stroke.points.push(point);
    const context = drawContext();
    if (!context) return;
    drawStrokeStyle(context, stroke);
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function endDrawStroke() {
    if (!state.draw.current) return;
    state.draw.current = null;
    state.draw.dirty = state.draw.strokes.length > 0;
  }

  function setDrawTool(tool) {
    state.draw.tool = tool;
    $$('[data-draw-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.drawTool === tool);
    });
  }

  function setDrawColor(color) {
    state.draw.color = color;
    renderDrawColors();
  }

  function updateDrawSize(value) {
    const size = clamp(Number(value) || 6, 2, 36);
    state.draw.size = size;
    const input = $('#draw-size');
    if (input) input.value = String(size);
    const label = $('#draw-size-value');
    if (label) label.textContent = String(size);
  }

  function undoDrawing() {
    const stroke = state.draw.strokes.pop();
    if (!stroke) return;
    state.draw.redo.push(stroke);
    redrawCanvas();
  }

  function redoDrawing() {
    const stroke = state.draw.redo.pop();
    if (!stroke) return;
    state.draw.strokes.push(stroke);
    redrawCanvas();
  }

  async function clearDrawing() {
    if (!state.draw.strokes.length) return;
    const confirmed = await showConfirm({
      title: t('draw.clear'),
      body: t('draw.subtitle'),
      okLabel: t('draw.clear'),
      cancelLabel: t('dialog.cancel')
    });
    if (!confirmed) return;
    state.draw.strokes = [];
    state.draw.redo = [];
    state.draw.current = null;
    redrawCanvas();
    showToast(t('draw.clearToast'), 'info');
  }

  function setupDrawing() {
    if (state.draw.setup) return;
    state.draw.setup = true;
    const canvas = $('#draw-canvas');
    if (!canvas) return;
    canvas.addEventListener('pointerdown', beginDrawStroke);
    canvas.addEventListener('pointermove', continueDrawStroke);
    canvas.addEventListener('pointerup', endDrawStroke);
    canvas.addEventListener('pointercancel', endDrawStroke);
    canvas.addEventListener('pointerleave', (event) => {
      if (state.draw.current && event.buttons === 0) endDrawStroke();
    });
    const sizeInput = $('#draw-size');
    sizeInput?.addEventListener('input', () => updateDrawSize(sizeInput.value));
    $('#draw-undo')?.addEventListener('click', undoDrawing);
    $('#draw-redo')?.addEventListener('click', redoDrawing);
    $('#draw-clear')?.addEventListener('click', clearDrawing);
    $('#draw-insert')?.addEventListener('click', insertDrawing);
    $('#draw-colors')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-draw-color]');
      if (button) setDrawColor(button.dataset.drawColor);
    });
    $$('[data-draw-tool]').forEach((button) => {
      button.addEventListener('click', () => setDrawTool(button.dataset.drawTool));
    });
  }

  function openDrawing() {
    if (!state.note || state.note.trashed_at) return;
    setupDrawing();
    state.draw.strokes = [];
    state.draw.redo = [];
    state.draw.current = null;
    state.draw.dirty = false;
    saveEditorRange();
    renderDrawColors();
    setDrawTool('pen');
    updateDrawSize($('#draw-size')?.value || state.draw.size);
    const wrap = $('#canvas-wrap');
    if (wrap) wrap.classList.remove('dirty');
    redrawCanvas();
    openModal($('#draw-modal'));
  }

  function insertDrawing() {
    const canvas = $('#draw-canvas');
    if (!canvas || !state.draw.strokes.length) return;
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (error) {
      console.error(error);
      showToast(t('toast.imageFailed'), 'error');
      return;
    }
    closeModal($('#draw-modal'));
    insertHtmlAtSelection(`<p><img class="note-image" src="${escapeAttr(dataUrl)}" alt="Sketch"></p>`);
    showToast(t('draw.inserted'), 'success');
  }

  function paletteCommands() {
    const nextLanguage = state.lang === 'en' ? 'TÃ¼rkÃ§e' : 'English';
    return [
      { id: 'new-note', label: t('commands.newNote'), icon: 'plus', keywords: 'create note', action: () => newNote() },
      { id: 'new-notebook', label: t('commands.newNotebook'), icon: 'book', keywords: 'group folder', action: () => openGroupModal() },
      { id: 'search', label: t('commands.search'), icon: 'search', keywords: 'find', action: () => focusSearch() },
      {
        id: 'theme',
        label: t('commands.toggleTheme'),
        icon: 'moon',
        keywords: 'dark light appearance',
        action: () => updateSettings({ theme: actualTheme() === 'dark' ? 'light' : 'dark' })
      },
      {
        id: 'language',
        label: t('commands.toggleLanguage', { language: nextLanguage }),
        icon: 'globe',
        keywords: 'language english turkish',
        action: () => updateSettings({ language: state.lang === 'en' ? 'tr' : 'en' })
      },
      { id: 'settings', label: t('commands.settings'), icon: 'settings', keywords: 'preferences', action: () => openSettings() },
      { id: 'backup', label: t('commands.exportBackup'), icon: 'download', keywords: 'json save', action: () => exportBackup() },
      { id: 'data', label: t('commands.openData'), icon: 'folder-open', keywords: 'folder files', action: () => call('open_data_dir').catch(() => {}) },
      { id: 'shortcuts', label: t('commands.shortcuts'), icon: 'keyboard', keywords: 'keys help', action: () => openShortcuts() },
      { id: 'draw', label: t('commands.draw'), icon: 'pen', keywords: 'sketch canvas', action: () => openDrawing() },
      { id: 'focus', label: t('commands.focus'), icon: 'focus', keywords: 'zen distraction', action: () => toggleFocusMode() },
      { id: 'fullscreen', label: t('commands.fullscreen'), icon: 'expand', keywords: 'window screen', action: () => toggleFullscreen() },
      { id: 'stats', label: t('commands.stats'), icon: 'sparkle', keywords: 'numbers', action: () => openStats() }
    ];
  }

  async function paletteSearch(query) {
    if (!query) return [];
    try {
      const notes = await call('list_notes', 'all', null, null, query, 'updated_desc');
      return (Array.isArray(notes) ? notes : []).slice(0, 6);
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  function paletteItemHtml(item, index) {
    if (item.type === 'note') {
      const title = item.title || t('common.untitled');
      const group = item.group?.name || t('editor.noNotebook');
      return `<button class="command-item" data-palette-index="${index}">
        ${SVG('note')}
        <span class="command-note-title">${escapeHtml(title)}</span>
        <span class="command-meta">${escapeHtml(group)} Â· ${escapeHtml(relativeTime(item.updated_at))}</span>
      </button>`;
    }
    return `<button class="command-item" data-palette-index="${index}">
      ${SVG(item.icon || 'command')}
      <span class="command-note-title">${escapeHtml(item.label)}</span>
      ${item.hint ? `<span class="command-meta">${escapeHtml(item.hint)}</span>` : ''}
    </button>`;
  }

  async function renderPalette(keepIndex = false) {
    const input = $('#palette-input');
    const results = $('#palette-results');
    if (!input || !results) return;
    const token = ++state.paletteToken;
    const query = input.value.trim();
    const normalized = query.toLocaleLowerCase(state.lang);
    const commands = paletteCommands().filter((command) => {
      if (!normalized) return true;
      return `${command.label} ${command.keywords || ''}`.toLocaleLowerCase(state.lang).includes(normalized);
    });
    const notes = await paletteSearch(query);
    if (token !== state.paletteToken || !state.paletteOpen) return;
    const items = [
      ...commands.map((command) => ({ ...command, type: 'command' })),
      ...notes.map((note) => ({ ...note, type: 'note' }))
    ];
    state.paletteItems = items;
    if (!keepIndex) state.paletteIndex = 0;
    state.paletteIndex = clamp(state.paletteIndex, 0, Math.max(0, items.length - 1));
    if (!items.length) {
      results.innerHTML = `<div class="command-empty">${escapeHtml(t('commands.noResults'))}</div>`;
      return;
    }
    const commandItems = items.filter((item) => item.type === 'command');
    const noteItems = items.filter((item) => item.type === 'note');
    let cursor = 0;
    let html = '';
    if (commandItems.length) {
      html += `<div class="command-group-label">${escapeHtml(t('commands.actions'))}</div>`;
      commandItems.forEach((item) => {
        html += paletteItemHtml(item, cursor);
        cursor += 1;
      });
    }
    if (noteItems.length) {
      html += `<div class="command-group-label">${escapeHtml(t('commands.notes'))}</div>`;
      noteItems.forEach((item) => {
        html += paletteItemHtml(item, cursor);
        cursor += 1;
      });
    }
    results.innerHTML = html;
    const buttons = $$('[data-palette-index]', results);
    buttons.forEach((button) => {
      const index = Number(button.dataset.paletteIndex);
      button.classList.toggle('active', index === state.paletteIndex);
      button.addEventListener('mouseenter', () => {
        state.paletteIndex = index;
        buttons.forEach((item) => item.classList.toggle('active', item === button));
      });
      button.addEventListener('click', () => runPaletteItem(index));
    });
    const active = $(`[data-palette-index="${state.paletteIndex}"]`, results);
    active?.scrollIntoView({ block: 'nearest' });
  }

  function openPalette(initial = '') {
    const overlay = $('#palette');
    const input = $('#palette-input');
    if (!overlay || !input) return;
    closeMenu();
    state.paletteOpen = true;
    state.paletteIndex = 0;
    state.paletteToken = (state.paletteToken || 0) + 1;
    overlay.hidden = false;
    input.value = initial;
    renderPalette();
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  }

  function closePalette() {
    const overlay = $('#palette');
    if (overlay) overlay.hidden = true;
    state.paletteOpen = false;
    state.paletteItems = [];
    state.paletteToken = (state.paletteToken || 0) + 1;
    clearTimeout(state.paletteQueryTimer);
  }

  function movePaletteSelection(direction) {
    if (!state.paletteItems.length) return;
    const total = state.paletteItems.length;
    state.paletteIndex = (state.paletteIndex + direction + total) % total;
    $$('[data-palette-index]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.paletteIndex) === state.paletteIndex);
    });
    $(`[data-palette-index="${state.paletteIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function runPaletteItem(index) {
    const item = state.paletteItems[index];
    if (!item) return;
    closePalette();
    if (item.type === 'note') {
      openNote(item.id);
      return;
    }
    try {
      item.action();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function focusSearch() {
    if (state.focusMode) toggleFocusMode(false);
    const input = $('#search-input');
    if (!input) return;
    input.focus();
    input.select();
  }

  function openSortMenu(anchor) {
    openAnchoredMenu(SORTS.map((sort) => ({
      label: t(SORT_LABELS[sort]),
      icon: state.sort === sort ? 'check' : 'sort',
      action: async () => {
        if (state.sort === sort) return;
        state.sort = sort;
        updateSettings({ sort });
        await refreshNotes();
        updateSortLabel();
      }
    })), anchor);
  }

  function toggleSelectAll() {
    if (state.selected.size === state.notes.length && state.notes.length) {
      state.selected.clear();
    } else {
      state.notes.forEach((note) => state.selected.add(note.id));
    }
    renderSelection();
  }

  async function duplicateNoteById(noteId) {
    try {
      const copy = await call('duplicate_note', noteId);
      if (!copy) return;
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      showToast(t('editor.duplicatedToast'), 'success');
      return copy;
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function trashNotesByIds(ids, permanent = false) {
    const noteIds = ids.filter(Boolean);
    if (!noteIds.length) return false;
    const first = state.notes.find((note) => note.id === noteIds[0]);
    const title = noteIds.length === 1 && first ? noteTitle(first.title) : String(noteIds.length);
    const confirmed = await showConfirm({
      title: permanent ? t('editor.deleteTitle') : t('editor.trashTitle'),
      body: permanent
        ? (noteIds.length === 1 ? t('editor.deleteBody', { title }) : t('list.deleteConfirm', { n: noteIds.length }))
        : (noteIds.length === 1 ? t('editor.trashBody', { title }) : t('list.trashConfirm', { n: noteIds.length })),
      okLabel: permanent ? t('editor.deleteForever') : t('editor.trash'),
      tone: 'danger'
    });
    if (!confirmed) return false;
    try {
      if (permanent) await call('delete_notes', noteIds);
      else await call('trash_notes', noteIds);
      state.selected.clear();
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      ensureCurrentVisible();
      showToast(t(permanent ? 'list.deletedToast' : 'list.trashedToast', { n: noteIds.length }), 'success');
      return true;
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
      return false;
    }
  }

  async function restoreNotesByIds(ids) {
    const noteIds = ids.filter(Boolean);
    if (!noteIds.length) return;
    try {
      await call('restore_notes', noteIds);
      state.selected.clear();
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      ensureCurrentVisible();
      showToast(t('list.restoredToast', { n: noteIds.length }), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function openListNoteMenu(noteId, anchor) {
    const note = state.notes.find((item) => item.id === noteId);
    if (!note) return;
    if (state.note?.id === noteId) {
      openNoteMenu(anchor);
      return;
    }
    const items = [];
    if (note.trashed) {
      items.push(
        { label: t('list.restore'), icon: 'restore', action: () => restoreNotesByIds([note.id]) },
        { label: t('list.deleteForever'), icon: 'trash', danger: true, action: () => trashNotesByIds([note.id], true) }
      );
    } else {
      items.push(
        { label: t(note.pinned ? 'editor.unpin' : 'editor.pin'), icon: 'pin', action: () => togglePin(note.id) },
        { label: t(note.favorite ? 'editor.unfavorite' : 'editor.favorite'), icon: 'star', action: () => toggleFavorite(note.id) },
        { label: t(note.archived ? 'editor.unarchive' : 'editor.archive'), icon: 'archive', action: () => toggleArchive(note.id) },
        { label: t('editor.moveTitle'), icon: 'move', action: () => openMove([note.id], note.group_id) },
        { label: t('editor.duplicate'), icon: 'copy', action: () => duplicateNoteById(note.id) },
        { type: 'sep' },
        { label: t('editor.trash'), icon: 'trash', danger: true, action: () => trashNotesByIds([note.id]) }
      );
    }
    openAnchoredMenu(items, anchor);
  }

  async function runBulkAction(action) {
    const ids = Array.from(state.selected);
    if (!ids.length) return;
    if (action === 'move') {
      openMove(ids, undefined);
      return;
    }
    if (action === 'delete') {
      await trashNotesByIds(ids, state.view === 'trash');
      return;
    }
    try {
      if (action === 'favorite') await call('bulk_patch', ids, { favorite: true });
      if (action === 'archive') await call('bulk_patch', ids, { archived: true });
      state.selected.clear();
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      ensureCurrentVisible();
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  async function emptyTrash() {
    const count = Number(state.meta.counts?.trash) || 0;
    if (!count) return;
    const confirmed = await showConfirm({
      title: t('list.emptyTrashTitle'),
      body: t('list.emptyTrashConfirm', { n: count }),
      okLabel: t('list.emptyTrash'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const removed = await call('empty_trash');
      await Promise.all([refreshNotes({ ensureVisible: false }), refreshMeta()]);
      ensureCurrentVisible();
      showToast(t('list.emptyTrashToast', { n: removed ?? count }), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('error.title'), 'error');
    }
  }

  function revealApp() {
    const boot = $('#boot');
    const app = $('#app');
    if (app) {
      app.setAttribute('aria-hidden', 'false');
      app.classList.add('ready');
    }
    if (boot) {
      boot.classList.add('done');
      setTimeout(() => {
        boot.hidden = true;
      }, 450);
    }
  }

  function showBootError(error) {
    console.error(error);
    const boot = $('#boot');
    if (boot) {
      boot.hidden = false;
      boot.classList.remove('done');
    }
    const spinner = $('.boot-spinner');
    if (spinner) spinner.style.display = 'none';
    const box = $('#boot-error');
    if (box) box.hidden = false;
    const text = $('#boot-error-text');
    if (text) text.textContent = t('dialog.loadError');
  }

  async function boot() {
    const bootScreen = $('#boot');
    if (bootScreen) {
      bootScreen.hidden = false;
      bootScreen.classList.remove('done');
    }
    const errorBox = $('#boot-error');
    if (errorBox) errorBox.hidden = true;
    const spinner = $('.boot-spinner');
    if (spinner) spinner.style.display = '';
    try {
      if (!api) await initApi();
      const data = await call('bootstrap');
      state.app = data?.app || {};
      state.settings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) };
      state.lang = state.settings.language === 'tr' ? 'tr' : 'en';
      state.sort = SORTS.includes(state.settings.sort) ? state.settings.sort : 'updated_desc';
      state.view = ['all', 'favorites', 'archive', 'trash'].includes(state.settings.default_view) ? state.settings.default_view : 'all';
      state.groupId = null;
      state.tag = null;
      state.meta = data?.meta || { groups: [], tags: [], counts: {}, revisions: 0, data_dir: '' };
      state.notes = Array.isArray(data?.default_notes) ? data.default_notes : [];
      state.booted = true;
      applySettings();
      renderSidebar();
      renderList();
      const first = state.notes[0];
      if (first) await openNote(first.id, { silent: true });
      else closeEditor();
      const app = $('#app');
      if (app) app.setAttribute('aria-hidden', 'false');
      revealApp();
      window.setTimeout(() => {
        if (state.booted && !state.updateInfo && !updateInProgress()) checkForUpdates({ silent: true });
      }, 1800);
    } catch (error) {
      state.booted = false;
      showBootError(error);
    }
  }

  function bindSidebarEvents() {
    $('#primary-nav')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (button) setView(button.dataset.view);
    });

    $('#primary-nav')?.addEventListener('dragover', (event) => {
      if (!state.dragNoteId) return;
      if (event.target.closest('[data-view="all"]')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    });

    $('#primary-nav')?.addEventListener('drop', (event) => {
      if (!state.dragNoteId) return;
      const target = event.target.closest('[data-view="all"]');
      if (!target) return;
      event.preventDefault();
      const noteId = state.dragNoteId;
      state.dragNoteId = null;
      moveNotes([noteId], null);
    });

    const groupList = $('#group-list');
    groupList?.addEventListener('click', (event) => {
      const more = event.target.closest('[data-group-menu]');
      if (more) {
        event.stopPropagation();
        openGroupMenu(more.dataset.groupMenu, more);
        return;
      }
      const row = event.target.closest('[data-group-id]');
      if (row) setView('group', { groupId: row.dataset.groupId });
    });
    groupList?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-group-id]');
      if (!row) return;
      event.preventDefault();
      setView('group', { groupId: row.dataset.groupId });
    });
    groupList?.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('[data-group-id]');
      if (!row) return;
      event.preventDefault();
      openGroupMenu(row.dataset.groupId, row);
    });
    groupList?.addEventListener('dragover', (event) => {
      const row = event.target.closest('[data-group-id]');
      if (!row || !state.dragNoteId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      $$('#group-list .group-row').forEach((item) => item.classList.toggle('drag-over', item === row));
    });
    groupList?.addEventListener('dragleave', (event) => {
      if (event.relatedTarget && groupList.contains(event.relatedTarget)) return;
      $$('#group-list .group-row').forEach((item) => item.classList.remove('drag-over'));
    });
    groupList?.addEventListener('drop', (event) => {
      const row = event.target.closest('[data-group-id]');
      if (!row || !state.dragNoteId) return;
      event.preventDefault();
      const noteId = state.dragNoteId;
      const groupId = row.dataset.groupId;
      state.dragNoteId = null;
      $$('#group-list .group-row').forEach((item) => item.classList.remove('drag-over'));
      moveNotes([noteId], groupId);
    });

    $('#tag-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (button) setView('tag', { tag: button.dataset.tag });
    });
    $('#new-group-btn')?.addEventListener('click', () => openGroupModal());
    $('#settings-btn')?.addEventListener('click', () => openSettings());
    $('#language-btn')?.addEventListener('click', () => {
      updateSettings({ language: state.lang === 'en' ? 'tr' : 'en' });
    });
    $('#brand-focus-btn')?.addEventListener('click', () => toggleFocusMode());
  }

  function bindListEvents() {
    $('#new-note-btn')?.addEventListener('click', () => newNote());
    $('#editor-empty-new')?.addEventListener('click', () => newNote());
    $('#list-empty-action')?.addEventListener('click', () => newNote());
    $('#sort-btn')?.addEventListener('click', (event) => openSortMenu(event.currentTarget));
    $('#select-all-btn')?.addEventListener('click', toggleSelectAll);
    $('#empty-trash-btn')?.addEventListener('click', emptyTrash);
    $('#bulk-clear')?.addEventListener('click', () => {
      state.selected.clear();
      renderSelection();
    });
    $('#bulk-bar')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-bulk]');
      if (button) runBulkAction(button.dataset.bulk);
    });

    const search = $('#search-input');
    search?.addEventListener('input', () => {
      state.query = search.value.trim();
      const clear = $('#search-clear');
      if (clear) clear.hidden = !state.query;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => refreshNotes(), 220);
    });
    search?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (state.query) {
          search.value = '';
          state.query = '';
          const clear = $('#search-clear');
          if (clear) clear.hidden = true;
          refreshNotes();
        }
        search.blur();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const first = state.notes[0];
        if (first) openNote(first.id);
      }
    });
    $('#search-clear')?.addEventListener('click', () => {
      if (!search) return;
      search.value = '';
      state.query = '';
      const clear = $('#search-clear');
      if (clear) clear.hidden = true;
      refreshNotes();
      search.focus();
    });

    const list = $('#note-list');
    list?.addEventListener('click', (event) => {
      const check = event.target.closest('[data-check]');
      if (check) {
        event.stopPropagation();
        const id = check.dataset.check;
        if (state.selected.has(id)) state.selected.delete(id);
        else state.selected.add(id);
        renderSelection();
        return;
      }
      const inline = event.target.closest('[data-inline]');
      if (inline) {
        event.stopPropagation();
        const id = inline.dataset.id;
        const action = inline.dataset.inline;
        if (action === 'pin') togglePin(id);
        if (action === 'favorite') toggleFavorite(id);
        if (action === 'more') openListNoteMenu(id, inline);
        if (action === 'restore') restoreNotesByIds([id]);
        if (action === 'delete') trashNotesByIds([id], true);
        return;
      }
      const card = event.target.closest('[data-note-id]');
      if (card) openNote(card.dataset.noteId);
    });
    list?.addEventListener('keydown', (event) => {
      const card = event.target.closest('[data-note-id]');
      if (!card) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        openNote(card.dataset.noteId);
      }
      if (event.key === ' ') {
        event.preventDefault();
        const id = card.dataset.noteId;
        if (state.selected.has(id)) state.selected.delete(id);
        else state.selected.add(id);
        renderSelection();
      }
    });
    list?.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('[data-note-id]');
      if (!card) return;
      event.preventDefault();
      openListNoteMenu(card.dataset.noteId, card);
    });
    list?.addEventListener('dragstart', (event) => {
      if (event.target.closest('button')) {
        event.preventDefault();
        return;
      }
      const card = event.target.closest('[data-note-id]');
      if (!card) return;
      state.dragNoteId = card.dataset.noteId;
      card.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', state.dragNoteId);
      }
    });
    list?.addEventListener('dragend', () => {
      state.dragNoteId = null;
      $$('#note-list .note-card').forEach((card) => card.classList.remove('dragging'));
      $$('#group-list .group-row').forEach((row) => row.classList.remove('drag-over'));
    });
  }

  function bindEditorEvents() {
    const title = $('#note-title');
    title?.addEventListener('input', () => {
      markDirty();
      resizeNoteTitle();
      updateLiveCounts();
    });
    title?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        $('#note-body')?.focus();
      }
    });

    const body = $('#note-body');
    body?.addEventListener('input', () => {
      markDirty();
      updateLiveCounts();
      saveEditorRange();
      refreshToolbarState();
      if (state.imageSelection) positionImageFrame();
    });
    body?.addEventListener('keydown', (event) => {
      handleTableTab(event);
    });
    body?.addEventListener('click', (event) => {
      const check = event.target.closest('.chk');
      if (check) {
        event.preventDefault();
        toggleChecklistItem(check);
        updateLiveCounts();
        return;
      }
      const image = event.target.closest('img');
      if (image) {
        event.preventDefault();
        if (event.detail >= 2) {
          clearImageSelection();
          openImagePreview(image.getAttribute('src'));
        } else {
          selectImage(image);
        }
        return;
      }
      if (state.imageSelection) clearImageSelection();
      const link = event.target.closest('a');
      if (link) {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) call('open_external', link.getAttribute('href')).catch(() => {});
      }
    });

    $('#editor-scroll')?.addEventListener('scroll', () => positionImageFrame(), { passive: true });
    window.addEventListener('resize', () => positionImageFrame());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.imageSelection) clearImageSelection();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!state.imageSelection) return;
      if (event.target.closest('#image-frame') || event.target.closest('img')) return;
      clearImageSelection();
    }, true);

    $('#editor-toolbar')?.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) event.preventDefault();
    });
    $('#editor-toolbar')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cmd]');
      if (!button) return;
      const [command, value] = button.dataset.cmd.split(':');
      if (command === 'formatBlock') applyBlockStyle(value || 'blockquote');
      else execEditor(command, value || null);
    });
    $('#block-style')?.addEventListener('change', (event) => {
      applyBlockStyle(event.target.value);
    });
    $('#text-color-btn')?.addEventListener('click', () => {
      saveEditorRange();
      openTextColorMenu($('#text-color-btn'), TEXT_COLORS, state.textColor, (color) => setTextColor(color));
    });
    $('#highlight-btn')?.addEventListener('click', () => {
      saveEditorRange();
      openTextColorMenu($('#highlight-btn'), HIGHLIGHT_COLORS, state.highlightColor, (color) => setHighlightColor(color));
    });
    $('#checklist-btn')?.addEventListener('click', toggleChecklist);
    $('#inline-code-btn')?.addEventListener('click', insertInlineCode);
    $('#link-btn')?.addEventListener('click', insertLink);
    $('#table-btn')?.addEventListener('click', insertTable);
    $('#divider-btn')?.addEventListener('click', insertDivider);
    $('#image-btn')?.addEventListener('click', addImages);
    $('#draw-btn')?.addEventListener('click', openDrawing);
    $('#clear-format-btn')?.addEventListener('click', clearFormatting);

    $('#pin-btn')?.addEventListener('click', () => togglePin());
    $('#favorite-btn')?.addEventListener('click', () => toggleFavorite());
    $('#archive-btn')?.addEventListener('click', () => toggleArchive());
    $('#more-btn')?.addEventListener('click', (event) => openNoteMenu(event.currentTarget));
    $('#note-group-btn')?.addEventListener('click', () => {
      if (!state.note) return;
      openMove([state.note.id], state.note.group_id);
    });
    $('#color-btn')?.addEventListener('click', (event) => {
      if (!state.note) return;
      openColorMenu(event.currentTarget, state.note.color, (color) => setNoteColor(color));
    });

    $('#add-tag-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      openTagPopover();
    });
    $('#tag-popover-close')?.addEventListener('click', closeTagPopover);
    $('#tag-add-btn')?.addEventListener('click', () => addTag($('#tag-input')?.value));
    $('#tag-input')?.addEventListener('input', updateTagSuggestions);
    $('#tag-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addTag(event.currentTarget.value);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTagPopover();
      }
    });
    $('#tag-suggestions')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-tag]');
      if (button) addTag(button.dataset.addTag);
    });
    $('#note-tags')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-tag]');
      if (remove) {
        event.stopPropagation();
        removeTag(remove.dataset.removeTag);
        return;
      }
      const chip = event.target.closest('[data-tag-chip]');
      if (chip) setView('tag', { tag: chip.dataset.tagChip });
    });
    $('#banner-restore')?.addEventListener('click', restoreCurrent);
    $('#banner-delete')?.addEventListener('click', deleteForever);
    $('#history-btn')?.addEventListener('click', openHistory);
    $('#fullscreen-status-btn')?.addEventListener('click', () => toggleFullscreen());
    $('#focus-status-btn')?.addEventListener('click', () => toggleFocusMode());

    $('#table-tools')?.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    $('#table-tools')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-table-action]');
      if (button) runTableAction(button.dataset.tableAction);
    });
    document.addEventListener('selectionchange', () => {
      if (!state.note || $('#editor-shell')?.hidden) {
        hideTableTools();
        return;
      }
      if (document.activeElement?.closest?.('#table-tools')) return;
      const cell = tableCellAtSelection();
      if (cell) showTableTools(cell);
      else hideTableTools();
    });
    document.addEventListener('mousedown', (event) => {
      if (!event.target.closest('#table-tools') && !event.target.closest('#note-body table')) {
        hideTableTools();
      }
    });
    $('#editor-scroll')?.addEventListener('scroll', () => {
      if (state.tableCell?.isConnected) positionTableTools();
    });
    window.addEventListener('resize', () => {
      if (state.tableCell?.isConnected) positionTableTools();
    });
  }

  function bindSettingsEvents() {
    const modal = $('#settings-modal');
    modal?.addEventListener('click', (event) => {
      const close = event.target.closest('[data-close-settings]');
      if (close) {
        closeModal(modal);
        return;
      }
      const tab = event.target.closest('[data-settings-tab]');
      if (tab) {
        selectSettingsTab(tab.dataset.settingsTab);
        return;
      }
      const language = event.target.closest('[data-set-language]');
      if (language) {
        updateSettings({ language: language.dataset.setLanguage === 'tr' ? 'tr' : 'en' });
        return;
      }
      const theme = event.target.closest('[data-set-theme]');
      if (theme) {
        updateSettings({ theme: theme.dataset.setTheme });
        return;
      }
      const accent = event.target.closest('[data-set-accent]');
      if (accent) {
        updateSettings({ accent: accent.dataset.setAccent });
        return;
      }
      const font = event.target.closest('[data-set-font]');
      if (font) {
        updateSettings({ font_family: font.dataset.setFont });
      }
    });

    $('#open-data-folder')?.addEventListener('click', () => call('open_data_dir').catch(() => {}));
    $('#update-action')?.addEventListener('click', () => {
      if (state.updateInfo?.available) installUpdate();
      else checkForUpdates();
    });
    $('#update-chip')?.addEventListener('click', async () => {
      const info = state.updateInfo;
      if (!info?.available || updateInProgress()) return;
      const confirmed = await showConfirm({
        title: t('update.confirmTitle', { version: info.latest }),
        body: t('update.confirmBody'),
        okLabel: t('update.updateButton', { version: info.latest }),
        tone: 'primary',
      });
      if (confirmed) installUpdate();
    });
    $('#export-backup-btn')?.addEventListener('click', exportBackup);
    $('#import-backup-btn')?.addEventListener('click', importBackup);
    $('#open-stats-btn')?.addEventListener('click', openStats);
    $('#about-stats')?.addEventListener('click', openStats);
    $('#about-shortcuts')?.addEventListener('click', openShortcuts);

    $('#setting-default-view')?.addEventListener('change', (event) => {
      updateSettings({ default_view: event.target.value });
    });
    $('#setting-sort')?.addEventListener('change', (event) => {
      state.sort = event.target.value;
      updateSettings({ sort: state.sort });
      refreshNotes();
    });
    $('#setting-compact')?.addEventListener('change', (event) => updateSettings({ compact_list: event.target.checked }));
    $('#setting-spellcheck')?.addEventListener('change', (event) => updateSettings({ spellcheck: event.target.checked }));
    $('#setting-word-count')?.addEventListener('change', (event) => updateSettings({ show_word_count: event.target.checked }));
    const fontSize = $('#setting-font-size');
    fontSize?.addEventListener('input', () => {
      state.settings.font_size = Number(fontSize.value);
      applySettings();
      const label = $('#font-size-value');
      if (label) label.textContent = fontSize.value;
    });
    fontSize?.addEventListener('change', () => updateSettings({ font_size: Number(fontSize.value) }));
  }

  function bindGroupEvents() {
    $('#group-save')?.addEventListener('click', saveGroup);
    $('#group-name')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveGroup();
      }
    });
    $('#group-delete')?.addEventListener('click', () => {
      if (state.groupEditId) deleteGroup(state.groupEditId);
    });
    $('#group-colors')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-group-color]');
      if (!button) return;
      state.groupDraft.color = button.dataset.groupColor;
      renderGroupColors();
    });
    $('#group-icons')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-group-icon]');
      if (!button) return;
      state.groupDraft.icon = button.dataset.groupIcon;
      renderGroupIcons();
    });
    $('#move-confirm')?.addEventListener('click', confirmMove);
    $('#history-restore')?.addEventListener('click', restoreHistory);
    $('#history-list')?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-revision]');
      if (!item) return;
      state.historySelected = Number(item.dataset.revision);
      renderHistory();
    });
    $('#image-modal')?.addEventListener('click', () => closeModal($('#image-modal')));
    $('#print-cancel')?.addEventListener('click', () => closeModal($('#print-modal')));
    $('#print-start')?.addEventListener('click', () => runPrint('print'));
    $('#print-save-pdf')?.addEventListener('click', () => runPrint('pdf'));
  }

  function bindCloseButtons() {
    const closers = [
      ['data-close-settings', '#settings-modal'],
      ['data-close-draw', '#draw-modal'],
      ['data-close-group', '#group-modal'],
      ['data-close-move', '#move-modal'],
      ['data-close-history', '#history-modal'],
      ['data-close-shortcuts', '#shortcuts-modal'],
      ['data-close-stats', '#stats-modal']
    ];
    closers.forEach(([attribute, selector]) => {
      $$(`[${attribute}]`).forEach((button) => {
        button.addEventListener('click', () => closeModal($(selector)));
      });
    });
    $$('.modal').forEach((modal) => {
      if (modal.id === 'image-modal') return;
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal);
      });
    });
  }

  function bindPaletteEvents() {
    const input = $('#palette-input');
    input?.addEventListener('input', () => {
      clearTimeout(state.paletteQueryTimer);
      state.paletteQueryTimer = setTimeout(() => renderPalette(), 110);
    });
    $('#palette')?.addEventListener('click', (event) => {
      if (event.target === $('#palette')) closePalette();
    });
  }

  function bindGlobalEvents() {
    document.addEventListener('pointerdown', (event) => {
      if (state.menuEl && !state.menuEl.contains(event.target)) closeMenu();
      const popover = $('#tag-popover');
      if (popover && !popover.hidden && !popover.contains(event.target) && !event.target.closest('#add-tag-btn')) {
        closeTagPopover();
      }
    });
    window.addEventListener('resize', () => {
      closeMenu();
      closeTagPopover();
    });

    let selectionFrame = null;
    document.addEventListener('selectionchange', () => {
      if (selectionFrame) return;
      selectionFrame = requestAnimationFrame(() => {
        selectionFrame = null;
        if (!state.note) return;
        if (selectionInsideEditor()) saveEditorRange();
        refreshToolbarState();
      });
    });

    document.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('beforeunload', saveDraftNow);
  }

  function isTypingTarget(target) {
    if (!target) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  function handleGlobalKeydown(event) {
    const mod = event.ctrlKey || event.metaKey;
    const key = String(event.key || '').toLowerCase();
    const drawModal = $('#draw-modal');

    if (state.paletteOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        movePaletteSelection(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        movePaletteSelection(-1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        runPaletteItem(state.paletteIndex);
        return;
      }
      if (mod && key === 'k') {
        event.preventDefault();
        closePalette();
        return;
      }
    }

    if (drawModal && !drawModal.hidden) {
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoDrawing();
        else undoDrawing();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        redoDrawing();
        return;
      }
    }

    if (state.modalStack.some((modal) => !modal.hidden)) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTopLayer();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (closeTopLayer()) {
        event.preventDefault();
        return;
      }
      if (state.fullscreen) {
        event.preventDefault();
        toggleFullscreen(false);
        return;
      }
      if (state.focusMode) {
        toggleFocusMode(false);
        return;
      }
      const active = document.activeElement;
      if (active === $('#search-input') && state.query) {
        active.value = '';
        state.query = '';
        const clear = $('#search-clear');
        if (clear) clear.hidden = true;
        refreshNotes();
      }
      return;
    }

    if (key === 'f11') {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (mod && key === 's') {
      event.preventDefault();
      if (state.note) saveNow();
      return;
    }
    if (mod && key === 'n') {
      event.preventDefault();
      newNote();
      return;
    }
    if (mod && key === 'f') {
      event.preventDefault();
      focusSearch();
      return;
    }
    if (mod && key === 'k') {
      event.preventDefault();
      openPalette();
      return;
    }
    if (mod && key === ',') {
      event.preventDefault();
      openSettings();
      return;
    }
    if (mod && event.shiftKey && key === 'd') {
      event.preventDefault();
      openDrawing();
      return;
    }
    if (mod && event.shiftKey && key === 'f') {
      event.preventDefault();
      toggleFocusMode();
      return;
    }
    if (mod && event.shiftKey && key === 'c') {
      if (selectionInsideEditor()) {
        event.preventDefault();
        toggleChecklist();
      }
      return;
    }
    if (mod && ['b', 'i', 'u'].includes(key)) {
      if (selectionInsideEditor()) {
        event.preventDefault();
        execEditor(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
      }
      return;
    }
    if (mod && key === 'p') {
      event.preventDefault();
      if (state.note) openPrintDialog();
      return;
    }
    if (key === 'f1') {
      event.preventDefault();
      openShortcuts();
      return;
    }
    if (!isTypingTarget(event.target) && event.key === '/') {
      event.preventDefault();
      focusSearch();
    }
  }

  function bindEvents() {
    if (state.bound) return;
    state.bound = true;
    state.textColor = actualTheme() === 'light' ? '#1f2328' : '#e9eaee';
    state.highlightColor = HIGHLIGHT_COLORS[0];
    const textIndicator = $('#text-color-indicator');
    if (textIndicator) textIndicator.style.background = state.textColor;
    const highlightIndicator = $('#highlight-indicator');
    if (highlightIndicator) highlightIndicator.style.background = state.highlightColor;
    setupDrawing();
    bindSidebarEvents();
    bindListEvents();
    bindEditorEvents();
    bindSettingsEvents();
    bindGroupEvents();
    bindCloseButtons();
    bindPaletteEvents();
    bindGlobalEvents();
    $('#boot-retry')?.addEventListener('click', () => boot());
  }

  bindEvents();
  boot();
})();
