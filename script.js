// ============================================================
// STORAGE
// ============================================================
const KEYS = {
  WATCHLIST: 'wh_watchlist',
  WATCHING:  'wh_watching',
  COMPLETED: 'wh_completed',
  THEME:     'wh_theme',
  SORT:      'wh_sort',
  LAST_SEASON_CHECK: 'wh_last_season_check',
};

function storageGet(key) {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : [];
  } catch { return []; }
}

function storageSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}

// ============================================================
// API CONFIGURATION (TMDB + Jikan)
// ============================================================
// 1. Create a free account at https://www.themoviedb.org/signup
// 2. Go to Settings -> API -> request a "Developer" API key (v3 auth)
// 3. Paste the key (a 32-character string) below.
// Jikan (MyAnimeList) needs NO key at all — it's free and public.
const TMDB_API_KEY = '519140b0347e36a3d2722d99bb71203f'; // <-- paste your TMDB v3 API key here
const TMDB_BASE     = 'https://api.themoviedb.org/3';
const TMDB_IMG_THUMB = 'https://image.tmdb.org/t/p/w92';
const TMDB_IMG_FULL  = 'https://image.tmdb.org/t/p/w500';
const JIKAN_BASE    = 'https://api.jikan.moe/v4';

const TMDB_MOVIE_GENRES = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
  99:'Documentary', 18:'Drama', 10751:'Family', 14:'Fantasy', 36:'History',
  27:'Horror', 10402:'Music', 9648:'Mystery', 10749:'Romance',
  878:'Science Fiction', 10770:'TV Movie', 53:'Thriller', 10752:'War', 37:'Western'
};
const TMDB_TV_GENRES = {
  10759:'Action & Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
  99:'Documentary', 18:'Drama', 10751:'Family', 10762:'Kids', 9648:'Mystery',
  10763:'News', 10764:'Reality', 10765:'Sci-Fi & Fantasy', 10766:'Soap',
  10767:'Talk', 10768:'War & Politics', 37:'Western'
};

function mapGenreIds(ids, isTV) {
  const map = isTV ? TMDB_TV_GENRES : TMDB_MOVIE_GENRES;
  return (ids || []).map(id => map[id]).filter(Boolean).slice(0, 3).join(', ');
}

function hasTmdbKey() {
  return !!(TMDB_API_KEY && TMDB_API_KEY.trim().length > 0);
}

// Generic debounce helper
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ---- TMDB: search movies ----
async function tmdbSearchMovies(query) {
  const url = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB error (${res.status})`);
  const data = await res.json();
  return (data.results || []).slice(0, 8).map(r => ({
    sourceType:  'tmdb_movie',
    sourceId:    r.id,
    title:       r.title,
    year:        r.release_date ? r.release_date.slice(0, 4) : '',
    poster:      r.poster_path ? TMDB_IMG_FULL + r.poster_path : null,
    thumb:       r.poster_path ? TMDB_IMG_THUMB + r.poster_path : null,
    genre:       mapGenreIds(r.genre_ids, false),
    apiRating:   r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
    seasons:     null,
    episodesPerSeason: null,
  }));
}

// ---- TMDB: search TV / series ----
async function tmdbSearchTV(query) {
  const url = `${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB error (${res.status})`);
  const data = await res.json();
  return (data.results || []).slice(0, 8).map(r => ({
    sourceType:  'tmdb_tv',
    sourceId:    r.id,
    title:       r.name,
    year:        r.first_air_date ? r.first_air_date.slice(0, 4) : '',
    poster:      r.poster_path ? TMDB_IMG_FULL + r.poster_path : null,
    thumb:       r.poster_path ? TMDB_IMG_THUMB + r.poster_path : null,
    genre:       mapGenreIds(r.genre_ids, true),
    apiRating:   r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
    seasons:     null,            // filled in once user picks this result
    episodesPerSeason: null,
  }));
}

// ---- TMDB: fetch season/episode breakdown for a chosen TV show ----
async function tmdbGetTVDetails(tvId) {
  const url = `${TMDB_BASE}/tv/${tvId}?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB error (${res.status})`);
  const data = await res.json();
  const seasons = (data.seasons || [])
    .filter(s => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)
    .map(s => s.episode_count || 0);
  return {
    seasons: seasons.length || data.number_of_seasons || null,
    episodesPerSeason: seasons.length ? seasons : null,
  };
}

// ---- Jikan: search anime (no API key needed) ----
async function jikanSearchAnime(query) {
  const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan error (${res.status})`);
  const data = await res.json();
  return (data.data || []).map(r => {
    const title = r.title_english || r.title;
    const poster = r.images?.jpg?.large_image_url || r.images?.jpg?.image_url || null;
    const thumb  = r.images?.jpg?.image_url || poster;
    const genre  = (r.genres || []).map(g => g.name).slice(0, 3).join(', ');
    return {
      sourceType: 'jikan_anime',
      sourceId:   r.mal_id,
      title,
      year:       r.year || (r.aired?.from ? r.aired.from.slice(0, 4) : ''),
      poster,
      thumb,
      genre,
      apiRating:  r.score || null,
      seasons:    1,
      episodesPerSeason: r.episodes ? [r.episodes] : null,
    };
  });
}

// Unified search dispatcher based on the category currently selected in a form
async function searchTitlesForCategory(category, query) {
  if (category === 'movies') return tmdbSearchMovies(query);
  if (category === 'series') return tmdbSearchTV(query);
  return jikanSearchAnime(query); // anime
}

// ============================================================
// STATE
// ============================================================
let watchlist = storageGet(KEYS.WATCHLIST);
let watching  = storageGet(KEYS.WATCHING);
let completed = storageGet(KEYS.COMPLETED);

let activeTab   = 'watchlist';
let filterCat   = 'all';
let searchQuery = '';
let sortMode    = localStorage.getItem(KEYS.SORT) || 'recent'; // 'recent' | 'az' | 'rating'

// Form state
let selectedCat    = 'movies';
let selectedStatus = 'watchlist';
let seasonCount    = 0;
let epInputs       = [];
let currentSeasonIdx = 0;

// Edit state
let editItemId   = null;
let editItemTab  = null;
let editCat      = 'movies';

// API autofill state (Add modal)
let currentApiAutofill = null; // { sourceType, sourceId, poster, genre, apiRating, year, seasons, episodesPerSeason }

// API autofill state (Edit modal)
let editApiAutofill = null;

// Per-context search sequence counters (guards against out-of-order async responses)
const acSeq = { add: 0, edit: 0 };
let acHighlighted = { add: -1, edit: -1 };
let acResults = { add: [], edit: [] };

// Delete state
let deleteItemId  = null;
let deleteItemTab = null;

// Swipe state
let touchStartX = 0;
let touchStartY = 0;

// ============================================================
// HELPERS
// ============================================================
function genId() {
  return Date.now() + '_' + Math.random().toString(36).substr(2, 8);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

const SUB_TAGS = {
  movies: ['Bollywood','Hollywood','Tollywood','Marvel','DC','Korean','Japanese','Chinese','Other'],
  series: ['Indian Series','Non-Indian','Marvel','DC','Korean Drama','Japanese Drama','Chinese Drama','Other'],
  anime:  ['Japanese Anime','Korean Anime','Chinese Anime','Other'],
};

const TAG_CLASS_MAP = {
  'Marvel':         'tag-marvel',
  'DC':             'tag-dc',
  'Bollywood':      'tag-bollywood',
  'Hollywood':      'tag-hollywood',
  'Tollywood':      'tag-tollywood',
  'Japanese Anime': 'tag-japanese',
  'Korean Anime':   'tag-korean',
  'Chinese Anime':  'tag-chinese',
  'Indian Series':  'tag-indian',
  'Non-Indian':     'tag-nonindian',
  'Korean Drama':   'tag-korean',
  'Japanese Drama': 'tag-japanese',
  'Chinese Drama':  'tag-chinese',
};

function getTagClass(subTag) {
  return TAG_CLASS_MAP[subTag] || 'tag-other';
}

const CAT_EMOJI = { movies: '🎬', series: '📺', anime: '🎌' };
const CAT_LABELS = { movies: 'Movies', series: 'Series', anime: 'Anime' };
const TAB_LABELS = { watchlist: '📋 Watchlist', watching: '▶️ Watching', completed: '✅ Completed' };
const TAB_ORDER  = ['watchlist', 'watching', 'completed', 'stats'];

// ============================================================
// SORT HELPER
// ============================================================
function sortItems(items) {
  const copy = [...items];
  if (sortMode === 'az') {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortMode === 'rating') {
    copy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else {
    // recent — newest addedAt first
    copy.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }
  return copy;
}

// ============================================================
// CARD POSTER
// ============================================================
function renderPoster(item) {
  const emoji = CAT_EMOJI[item.category] || '🎬';
  const safeTitle = escapeHtml(item.title);
  const ratingBadge = item.apiRating
    ? `<span class="poster-rating-badge">★ ${item.apiRating}</span>`
    : '';

  if (item.poster) {
    return `
      <div class="card-poster has-image">
        <img src="${item.poster}" alt="${safeTitle}" loading="lazy"
             onerror="this.closest('.card-poster').classList.add('img-error')">
        <div class="poster-gradient"></div>
        <div class="poster-fallback">
          <span class="card-poster-emoji">${emoji}</span>
          <span class="card-poster-title-preview">${safeTitle}</span>
        </div>
        ${ratingBadge}
      </div>
    `;
  }

  return `
    <div class="card-poster">
      <div class="card-poster-stripe"></div>
      <div class="poster-fallback">
        <span class="card-poster-emoji">${emoji}</span>
        <span class="card-poster-title-preview">${safeTitle}</span>
      </div>
      ${ratingBadge}
    </div>
  `;
}

// ============================================================
// RENDER HELPERS
// ============================================================

// Watchlist card
function renderWatchlistCard(item) {
  const div = document.createElement('div');
  div.className = 'card card-enter';
  div.dataset.id = item.id;
  div.innerHTML = `
    ${renderPoster(item)}
    <div class="card-body">
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="card-meta">
        <span class="tag ${getTagClass(item.subTag)}">${escapeHtml(item.subTag)}</span>
        ${item.genre ? `<span class="tag tag-genre">${escapeHtml(item.genre)}</span>` : ''}
        ${item.seasons ? `<span class="tag tag-default">📺 ${item.seasons} Season${item.seasons > 1 ? 's' : ''}</span>` : ''}
        <span class="tag-date">Added ${formatDate(item.addedAt)}</span>
      </div>
      ${item.notes ? `<div class="card-notes">📝 ${escapeHtml(item.notes)}</div>` : ''}
      <div class="card-actions">
        <button class="btn-primary" onclick="moveToWatching('${item.id}')">▶ Start Watching</button>
        <button class="btn-edit" onclick="openEditModal('${item.id}','watchlist')" title="Edit">✏️</button>
        <button class="btn-danger" onclick="confirmDelete('${item.id}','watchlist')" title="Delete">🗑</button>
      </div>
    </div>
  `;
  return div;
}

// Watching card
function renderWatchingCard(item) {
  const isSeriesLike = item.category === 'series' || item.category === 'anime';
  const totalEps = item.episodesPerSeason
    ? (item.episodesPerSeason[item.currentSeason - 1] || 0) : 0;

  const progressBadge = isSeriesLike
    ? `<span class="tag tag-progress">S${String(item.currentSeason).padStart(2,'0')}E${String(item.currentEpisode).padStart(2,'0')}</span>`
    : `<span class="tag tag-inprogress">🎬 In Progress</span>`;

  // Episode progress bar for series/anime
  let progressBarHtml = '';
  if (isSeriesLike && totalEps > 0) {
    const pct = Math.min(100, Math.round(((item.currentEpisode - 1) / totalEps) * 100));
    progressBarHtml = `
      <div class="ep-progress-bar-wrap">
        <div class="ep-progress-bar-label">
          <span>Episode Progress</span>
          <span>${item.currentEpisode - 1}/${totalEps} eps (${pct}%)</span>
        </div>
        <div class="ep-progress-bar-track">
          <div class="ep-progress-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }

  const progressControls = isSeriesLike ? `
    <div class="progress-controls">
      <div class="progress-label">Progress Controls</div>
      ${progressBarHtml}
      ${item.seasons > 1 ? `
      <div class="progress-row">
        <span class="progress-text">Season ${item.currentSeason}</span>
        <button class="counter-btn" onclick="changeProgress('${item.id}','season',-1)"
          ${item.currentSeason <= 1 ? 'disabled' : ''}>−</button>
        <button class="counter-btn" onclick="changeProgress('${item.id}','season',1)"
          ${item.seasons && item.currentSeason >= item.seasons ? 'disabled' : ''}>+</button>
        ${item.seasons ? `<span class="ep-of">of ${item.seasons}</span>` : ''}
      </div>` : ''}
      <div class="progress-row">
        <span class="progress-text">Episode ${item.currentEpisode}</span>
        <button class="counter-btn" onclick="changeProgress('${item.id}','episode',-1)"
          ${item.currentEpisode <= 1 && item.currentSeason <= 1 ? 'disabled' : ''}>−</button>
        <button class="counter-btn" onclick="changeProgress('${item.id}','episode',1)">+</button>
        ${totalEps ? `<span class="ep-of">of ${totalEps}</span>` : ''}
      </div>
    </div>
  ` : '';

  const div = document.createElement('div');
  div.className = 'card card-watching card-enter';
  div.dataset.id = item.id;
  div.innerHTML = `
    ${renderPoster(item)}
    <div class="card-body">
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="card-meta">
        <span class="tag ${getTagClass(item.subTag)}">${escapeHtml(item.subTag)}</span>
        ${item.genre ? `<span class="tag tag-genre">${escapeHtml(item.genre)}</span>` : ''}
        ${progressBadge}
      </div>
      ${progressControls}
      ${item.notes ? `<div class="card-notes">📝 ${escapeHtml(item.notes)}</div>` : ''}
      <div class="card-actions">
        <button class="btn-success" onclick="moveToCompleted('${item.id}')">✓ Mark Complete</button>
        <button class="btn-edit" onclick="openEditModal('${item.id}','watching')" title="Edit">✏️</button>
        <button class="btn-danger" onclick="confirmDelete('${item.id}','watching')" title="Delete">🗑</button>
      </div>
    </div>
  `;
  return div;
}

// Completed card
function renderCompletedCard(item) {
  const rating = item.rating || 0;
  const starsHtml = [1,2,3,4,5].map(s => `
    <button class="star-btn ${s <= rating ? 'filled' : ''}"
      onclick="rateItem('${item.id}',${s})">
      ${s <= rating ? '★' : '☆'}
    </button>
  `).join('');

  const div = document.createElement('div');
  div.className = 'card card-completed card-enter';
  div.dataset.id = item.id;
  div.innerHTML = `
    ${renderPoster(item)}
    <div class="card-body">
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="card-meta">
        <span class="tag ${getTagClass(item.subTag)}">${escapeHtml(item.subTag)}</span>
        ${item.genre ? `<span class="tag tag-genre">${escapeHtml(item.genre)}</span>` : ''}
        <span class="tag tag-default">✅ Completed</span>
      </div>
      ${item.completedAt ? `<div class="completed-date">Completed ${formatDate(item.completedAt)}</div>` : ''}
      <div class="star-row">
        <span class="star-label">Rating</span>
        ${starsHtml}
        ${rating > 0 ? `<span class="star-value">${rating}/5</span>` : '<span style="font-size:11px;color:var(--text-muted);margin-left:4px">Not rated</span>'}
      </div>
      ${item.notes ? `<div class="card-notes">📝 ${escapeHtml(item.notes)}</div>` : ''}
      <div class="card-actions" style="margin-top:12px">
        <button class="btn-back-watch" onclick="moveBackToWatching('${item.id}')">↩ Back to Watching</button>
        <button class="btn-edit" onclick="openEditModal('${item.id}','completed')" title="Edit">✏️</button>
        <button class="btn-danger" onclick="confirmDelete('${item.id}','completed')" title="Delete">🗑</button>
      </div>
    </div>
  `;
  return div;
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  renderTab('watchlist');
  renderTab('watching');
  renderTab('completed');
  updateCounts();
  renderStats();
}

function renderTab(tab) {
  const cats = ['movies', 'series', 'anime'];
  const prefix = tab === 'watchlist' ? 'wl' : tab === 'watching' ? 'wt' : 'cp';
  const list = tab === 'watchlist' ? watchlist : tab === 'watching' ? watching : completed;

  cats.forEach(cat => {
    const grid  = document.getElementById(`${prefix}-${cat}-grid`);
    const empty = document.getElementById(`${prefix}-${cat}-empty`);
    const count = document.getElementById(`${prefix}-${cat}-count`);
    if (!grid) return;

    let items = list.filter(i => {
      const matchCat    = i.category === cat;
      const matchFilter = filterCat === 'all' || filterCat === cat;
      return matchCat && matchFilter;
    });

    items = sortItems(items);

    grid.innerHTML = '';
    items.forEach((item, idx) => {
      let card;
      if (tab === 'watchlist') card = renderWatchlistCard(item);
      else if (tab === 'watching') card = renderWatchingCard(item);
      else card = renderCompletedCard(item);

      // Stagger animation
      card.style.animationDelay = `${idx * 0.04}s`;
      grid.appendChild(card);
    });

    if (count) count.textContent = items.length;
    if (empty) {
      if (items.length === 0) empty.classList.remove('hidden');
      else empty.classList.add('hidden');
    }
  });
}

function updateCounts() {
  document.getElementById('watchlistCount').textContent = watchlist.length;
  document.getElementById('watchingCount').textContent  = watching.length;
  document.getElementById('completedCount').textContent = completed.length;
}

// ============================================================
// STATISTICS
// ============================================================
function renderStats() {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  const totalCompleted = completed.length;
  const totalWatching  = watching.length;
  const totalWatchlist = watchlist.length;
  const totalAll       = totalCompleted + totalWatching + totalWatchlist;

  // Total episodes watched across completed series/anime
  let totalEpsWatched = 0;
  [...completed, ...watching].forEach(item => {
    if (item.episodesPerSeason) {
      totalEpsWatched += item.episodesPerSeason.reduce((s, e) => s + (parseInt(e) || 0), 0);
    }
    if (item.currentEpisode) totalEpsWatched += item.currentEpisode - 1;
  });

  // Most watched category (by completed count)
  const catCounts = { movies: 0, series: 0, anime: 0 };
  completed.forEach(i => { if (catCounts[i.category] !== undefined) catCounts[i.category]++; });
  const topCat = Object.entries(catCounts).sort((a,b) => b[1]-a[1])[0];
  const topCatLabel = topCat[1] > 0 ? `${CAT_EMOJI[topCat[0]]} ${CAT_LABELS[topCat[0]]}` : '—';

  // Avg rating
  const ratedItems = completed.filter(i => i.rating > 0);
  const avgRating  = ratedItems.length > 0
    ? (ratedItems.reduce((s, i) => s + i.rating, 0) / ratedItems.length).toFixed(1)
    : '—';

  // Max for bar chart
  const maxCat = Math.max(...Object.values(catCounts), 1);

  grid.innerHTML = `
    <div class="stat-card card-enter">
      <span class="stat-icon">✅</span>
      <div class="stat-value">${totalCompleted}</div>
      <div class="stat-label">Titles Completed</div>
    </div>
    <div class="stat-card card-enter" style="animation-delay:0.06s">
      <span class="stat-icon">▶️</span>
      <div class="stat-value">${totalWatching}</div>
      <div class="stat-label">Currently Watching</div>
    </div>
    <div class="stat-card card-enter" style="animation-delay:0.12s">
      <span class="stat-icon">📋</span>
      <div class="stat-value">${totalWatchlist}</div>
      <div class="stat-label">In Watchlist</div>
    </div>
    <div class="stat-card card-enter" style="animation-delay:0.18s">
      <span class="stat-icon">🎬</span>
      <div class="stat-value">${totalAll}</div>
      <div class="stat-label">Total Tracked</div>
    </div>
    <div class="stat-card card-enter" style="animation-delay:0.24s">
      <span class="stat-icon">📺</span>
      <div class="stat-value">${totalEpsWatched}</div>
      <div class="stat-label">Episodes Watched</div>
      <div class="stat-sub">Across series & anime</div>
    </div>
    <div class="stat-card card-enter" style="animation-delay:0.30s">
      <span class="stat-icon">⭐</span>
      <div class="stat-value">${avgRating}</div>
      <div class="stat-label">Avg Rating</div>
      <div class="stat-sub">${ratedItems.length} rated title${ratedItems.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat-card card-enter" style="animation-delay:0.36s;grid-column:1/-1">
      <span class="stat-icon">🏆</span>
      <div class="stat-value" style="font-size:24px">${topCatLabel}</div>
      <div class="stat-label">Most Completed Category</div>
    </div>
  `;

  // Append breakdown bar chart
  const breakdown = document.createElement('div');
  breakdown.className = 'stats-breakdown card-enter';
  breakdown.style.animationDelay = '0.42s';
  breakdown.innerHTML = `
    <div class="stats-breakdown-title">Completed by Category</div>
    <div class="stats-bar-row">
      <div class="stats-bar-label">🎬 Movies</div>
      <div class="stats-bar-track">
        <div class="stats-bar-fill movies" style="width:${Math.round((catCounts.movies/maxCat)*100)}%"></div>
      </div>
      <div class="stats-bar-count">${catCounts.movies}</div>
    </div>
    <div class="stats-bar-row">
      <div class="stats-bar-label">📺 Series</div>
      <div class="stats-bar-track">
        <div class="stats-bar-fill series" style="width:${Math.round((catCounts.series/maxCat)*100)}%"></div>
      </div>
      <div class="stats-bar-count">${catCounts.series}</div>
    </div>
    <div class="stats-bar-row">
      <div class="stats-bar-label">🎌 Anime</div>
      <div class="stats-bar-track">
        <div class="stats-bar-fill anime" style="width:${Math.round((catCounts.anime/maxCat)*100)}%"></div>
      </div>
      <div class="stats-bar-count">${catCounts.anime}</div>
    </div>
  `;
  grid.appendChild(breakdown);
}

// ============================================================
// ACTIONS
// ============================================================
function moveToWatching(id) {
  const idx = watchlist.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = { ...watchlist[idx], currentSeason: 1, currentEpisode: 1, startedAt: new Date().toISOString() };
  watchlist.splice(idx, 1);
  watching.push(item);
  storageSet(KEYS.WATCHLIST, watchlist);
  storageSet(KEYS.WATCHING, watching);
  renderAll();
}

function moveToCompleted(id) {
  const idx = watching.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = { ...watching[idx], completedAt: new Date().toISOString(), rating: watching[idx].rating || 0 };
  watching.splice(idx, 1);
  completed.push(item);
  storageSet(KEYS.WATCHING, watching);
  storageSet(KEYS.COMPLETED, completed);
  renderAll();
}

// NEW: Move back from completed → watching
function moveBackToWatching(id) {
  const idx = completed.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = { ...completed[idx] };
  delete item.completedAt;
  // Restore watch progress if present, else reset
  if (!item.currentSeason)  item.currentSeason  = 1;
  if (!item.currentEpisode) item.currentEpisode = 1;
  item.startedAt = item.startedAt || new Date().toISOString();
  completed.splice(idx, 1);
  watching.push(item);
  storageSet(KEYS.COMPLETED, completed);
  storageSet(KEYS.WATCHING, watching);
  renderAll();
  switchTab('watching');
}

// Confirm-before-delete
function confirmDelete(id, tab) {
  deleteItemId  = id;
  deleteItemTab = tab;
  const allLists = { watchlist, watching, completed };
  const item = (allLists[tab] || []).find(i => i.id === id);
  const name = item ? item.title : 'this title';
  document.getElementById('deleteConfirmSub').textContent = `"${name}" will be permanently removed.`;
  document.getElementById('deleteModalOverlay').classList.remove('hidden');
}

function executeDelete() {
  const id  = deleteItemId;
  const tab = deleteItemTab;
  if (!id || !tab) return;

  if (tab === 'watchlist') {
    watchlist = watchlist.filter(i => i.id !== id);
    storageSet(KEYS.WATCHLIST, watchlist);
  } else if (tab === 'watching') {
    watching = watching.filter(i => i.id !== id);
    storageSet(KEYS.WATCHING, watching);
  } else {
    completed = completed.filter(i => i.id !== id);
    storageSet(KEYS.COMPLETED, completed);
  }

  deleteItemId  = null;
  deleteItemTab = null;
  document.getElementById('deleteModalOverlay').classList.add('hidden');
  renderAll();
}

function changeProgress(id, type, delta) {
  const item = watching.find(i => i.id === id);
  if (!item) return;

  if (type === 'episode') {
    let ep = item.currentEpisode + delta;
    let season = item.currentSeason;
    const totalEps = item.episodesPerSeason ? item.episodesPerSeason[season - 1] || 0 : 0;

    if (delta > 0 && totalEps && ep > totalEps) {
      if (!item.seasons || season < item.seasons) {
        season++;
        ep = 1;
      } else {
        ep = totalEps;
      }
    }
    if (ep < 1) {
      if (season > 1) {
        season--;
        ep = item.episodesPerSeason ? (item.episodesPerSeason[season - 1] || 1) : 1;
      } else {
        ep = 1;
      }
    }
    item.currentEpisode = ep;
    item.currentSeason  = season;
  } else {
    let season = item.currentSeason + delta;
    if (season < 1) season = 1;
    if (item.seasons && season > item.seasons) season = item.seasons;
    item.currentSeason  = season;
    item.currentEpisode = 1;
  }

  storageSet(KEYS.WATCHING, watching);
  renderTab('watching');
}

function rateItem(id, rating) {
  const item = completed.find(i => i.id === id);
  if (!item) return;
  item.rating = rating;
  storageSet(KEYS.COMPLETED, completed);
  renderTab('completed');
  renderStats();
}

// ============================================================
// EDIT MODAL
// ============================================================
function openEditModal(id, tab) {
  const allLists = { watchlist, watching, completed };
  const item = (allLists[tab] || []).find(i => i.id === id);
  if (!item) return;

  editItemId  = id;
  editItemTab = tab;
  editCat     = item.category;
  editApiAutofill = null;

  document.getElementById('editTitleInput').value = item.title;
  document.getElementById('editNotesInput').value = item.notes || '';
  document.getElementById('editTitleSuggestions').classList.add('hidden');
  document.getElementById('editSelectedPreview').classList.add('hidden');

  // Set category buttons
  document.querySelectorAll('#editCatBtns .cat-select-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === editCat);
  });

  // Populate subtag options
  updateEditSubTagOptions(item.subTag);

  document.getElementById('editModalOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('editTitleInput').focus(), 100);
}

function updateEditSubTagOptions(selected) {
  const select = document.getElementById('editSubTagSelect');
  const tags = SUB_TAGS[editCat] || [];
  select.innerHTML = tags.map(t =>
    `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`
  ).join('');
}

function saveEdit() {
  const newTitle  = document.getElementById('editTitleInput').value.trim();
  const newSubTag = document.getElementById('editSubTagSelect').value;
  if (!newTitle) { alert('Title cannot be empty!'); return; }

  const allLists = { watchlist, watching, completed };
  const list = allLists[editItemTab];
  const item = list ? list.find(i => i.id === editItemId) : null;
  if (!item) return;

  item.title    = newTitle;
  item.category = editCat;
  item.subTag   = newSubTag;
  item.notes    = document.getElementById('editNotesInput').value.trim();

  // If the user re-picked a match from TMDB/Jikan while editing, refresh the API-sourced fields
  if (editApiAutofill) {
    item.poster     = editApiAutofill.poster || item.poster || null;
    item.genre       = editApiAutofill.genre || item.genre || null;
    item.apiRating   = editApiAutofill.apiRating ?? item.apiRating ?? null;
    item.releaseYear = editApiAutofill.year || item.releaseYear || null;
    item.sourceType  = editApiAutofill.sourceType || item.sourceType || null;
    item.sourceId    = editApiAutofill.sourceId ?? item.sourceId ?? null;
  }

  storageSet(KEYS.WATCHLIST, watchlist);
  storageSet(KEYS.WATCHING, watching);
  storageSet(KEYS.COMPLETED, completed);

  editApiAutofill = null;
  document.getElementById('editModalOverlay').classList.add('hidden');
  renderAll();
}

// ============================================================
// ADD FORM
// ============================================================
function updateSubTagOptions() {
  const select = document.getElementById('subTagSelect');
  const tags = SUB_TAGS[selectedCat] || [];
  select.innerHTML = tags.map(t => `<option value="${t}">${t}</option>`).join('');
}

function updateSeasonsVisibility() {
  const group = document.getElementById('seasonsGroup');
  if (selectedCat === 'movies') group.classList.add('hidden');
  else group.classList.remove('hidden');
}

function updateNextBtnText() {
  const btn = document.getElementById('mainNextBtn');
  const hasSeasonsInput = document.getElementById('seasonsInput').value;
  const isSeriesLike = selectedCat !== 'movies';
  if (isSeriesLike && hasSeasonsInput) {
    btn.textContent = 'Next → Set Episodes per Season';
  } else {
    btn.textContent = `Add to ${selectedStatus === 'watching' ? 'Watching' : 'Watchlist'}`;
  }
}

// ============================================================
// SEARCH
// ============================================================
function performSearch(query) {
  const resultsWrap = document.getElementById('searchResults');
  const resultsBox  = document.getElementById('searchResultsBox');

  if (query.length < 2) {
    resultsWrap.classList.add('hidden');
    return;
  }

  const q = query.toLowerCase();
  const allItems = [
    ...watchlist.map(i => ({ ...i, tab: 'watchlist' })),
    ...watching.map(i  => ({ ...i, tab: 'watching'  })),
    ...completed.map(i => ({ ...i, tab: 'completed' })),
  ];

  const filtered = allItems.filter(i => {
    const matchSearch = i.title.toLowerCase().includes(q);
    const matchFilter = filterCat === 'all' || i.category === filterCat;
    return matchSearch && matchFilter;
  });

  resultsBox.innerHTML = '';
  resultsWrap.classList.remove('hidden');

  if (filtered.length === 0) {
    resultsBox.innerHTML = `<div class="search-no-results">No results found for "<strong>${escapeHtml(query)}</strong>"</div>`;
    return;
  }

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <div>
        <div class="search-result-title">${escapeHtml(item.title)}</div>
        <div class="search-result-sub">${escapeHtml(item.subTag)} • ${CAT_LABELS[item.category]}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="tag ${getTagClass(item.subTag)}">${CAT_LABELS[item.category]}</span>
        <span style="font-size:11px;color:var(--gold);font-weight:700">${TAB_LABELS[item.tab]}</span>
      </div>
    `;
    div.addEventListener('click', () => {
      switchTab(item.tab);
      resultsWrap.classList.add('hidden');
      document.getElementById('searchInput').value = '';
      searchQuery = '';
    });
    resultsBox.appendChild(div);
  });
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const activePanel = document.getElementById(`tab-${tab}`);
  if (activePanel) activePanel.classList.add('active');
}

// ============================================================
// MODAL (add)
// ============================================================
function openModal() {
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('stepMain').classList.remove('hidden');
  document.getElementById('stepEpisodes').classList.add('hidden');
  document.getElementById('titleInput').value = '';
  document.getElementById('seasonsInput').value = '';
  document.getElementById('titleSuggestions').classList.add('hidden');
  document.getElementById('selectedPreview').classList.add('hidden');
  selectedCat    = 'movies';
  selectedStatus = 'watchlist';
  currentApiAutofill = null;

  document.querySelectorAll('.cat-select-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === 'movies');
  });
  document.querySelectorAll('.status-select-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.status === 'watchlist');
  });

  updateSubTagOptions();
  updateSeasonsVisibility();
  updateNextBtnText();
  updateApiStatusBanner();
  setTimeout(() => document.getElementById('titleInput').focus(), 100);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  currentApiAutofill = null;
}

// ============================================================
// EPISODE WIZARD
// ============================================================
function renderSeasonDots() {
  const container = document.getElementById('seasonDots');
  container.innerHTML = '';
  epInputs.forEach((ep, i) => {
    const span = document.createElement('span');
    span.className = `season-dot ${i < currentSeasonIdx ? 'season-dot-done' : i === currentSeasonIdx ? 'season-dot-current' : 'season-dot-pending'}`;
    span.textContent = `S${i+1}${ep ? `: ${ep}ep` : ''}`;
    container.appendChild(span);
  });
}

function showEpisodeStep() {
  document.getElementById('stepMain').classList.add('hidden');
  document.getElementById('stepEpisodes').classList.remove('hidden');
  document.getElementById('epStepTitle').textContent = `📺 Season ${currentSeasonIdx + 1} Episodes`;
  document.getElementById('epInputLabel').textContent = `Episodes in Season ${currentSeasonIdx + 1}`;
  document.getElementById('epInput').value = epInputs[currentSeasonIdx] || '';

  const infoBox = document.getElementById('seasonInfoBox');
  infoBox.innerHTML = `
    <div class="season-info-title">🎬 ${escapeHtml(document.getElementById('titleInput').value)}</div>
    <div class="season-info-sub">Season ${currentSeasonIdx + 1} of ${epInputs.length}</div>
  `;

  const backBtn = document.getElementById('epBackBtn');
  if (currentSeasonIdx > 0) backBtn.classList.remove('hidden');
  else backBtn.classList.add('hidden');

  const nextBtn = document.getElementById('epNextBtn');
  nextBtn.textContent = currentSeasonIdx + 1 < epInputs.length
    ? `Next → Season ${currentSeasonIdx + 2}`
    : `✅ Add to ${selectedStatus === 'watching' ? 'Watching' : 'Watchlist'}`;

  renderSeasonDots();
  setTimeout(() => document.getElementById('epInput').focus(), 100);
}

function submitItem(episodesPerSeason) {
  const title = document.getElementById('titleInput').value.trim();
  const subTag = document.getElementById('subTagSelect').value;
  const seasonsVal = document.getElementById('seasonsInput').value;
  const seasons = selectedCat !== 'movies' && seasonsVal ? parseInt(seasonsVal) : null;

  const item = {
    id: genId(),
    title,
    category: selectedCat,
    subTag,
    addedAt: new Date().toISOString(),
    seasons,
    episodesPerSeason: episodesPerSeason || null,
    poster:       currentApiAutofill?.poster || null,
    genre:        currentApiAutofill?.genre || null,
    apiRating:    currentApiAutofill?.apiRating ?? null,
    releaseYear:  currentApiAutofill?.year || null,
    sourceType:   currentApiAutofill?.sourceType || null,
    sourceId:     currentApiAutofill?.sourceId ?? null,
  };

  if (selectedStatus === 'watching') {
    item.currentSeason  = 1;
    item.currentEpisode = 1;
    item.startedAt      = new Date().toISOString();
    watching.push(item);
    storageSet(KEYS.WATCHING, watching);
  } else {
    watchlist.push(item);
    storageSet(KEYS.WATCHLIST, watchlist);
  }

  currentApiAutofill = null;
  closeModal();
  renderAll();

  if (selectedStatus === 'watching') switchTab('watching');
  else switchTab('watchlist');
}

// ============================================================
// TITLE AUTOCOMPLETE (TMDB / Jikan) — shared by Add + Edit modals
// ============================================================
function getAcEls(context) {
  if (context === 'edit') {
    return {
      input:    document.getElementById('editTitleInput'),
      dropdown: document.getElementById('editTitleSuggestions'),
      preview:  document.getElementById('editSelectedPreview'),
      getCategory: () => editCat,
    };
  }
  return {
    input:    document.getElementById('titleInput'),
    dropdown: document.getElementById('titleSuggestions'),
    preview:  document.getElementById('selectedPreview'),
    getCategory: () => selectedCat,
  };
}

function buildSuggestionItemHtml(r, idx) {
  const thumb = r.thumb || r.poster;
  const thumbHtml = thumb
    ? `<img class="suggestion-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.outerHTML='&lt;div class=&quot;suggestion-thumb-fallback&quot;&gt;🎬&lt;/div&gt;'">`
    : `<div class="suggestion-thumb-fallback">🎬</div>`;
  const subParts = [r.year, r.genre].filter(Boolean);
  const ratingPart = r.apiRating ? ` • ★ ${r.apiRating}` : '';
  return `
    <div class="suggestion-item" data-idx="${idx}">
      ${thumbHtml}
      <div class="suggestion-info">
        <div class="suggestion-title">${escapeHtml(r.title)}</div>
        <div class="suggestion-sub">${escapeHtml(subParts.join(' • '))}${ratingPart}</div>
      </div>
    </div>
  `;
}

function wireManualLink(context) {
  const els = getAcEls(context);
  const link = els.dropdown.querySelector('.manual-entry-link');
  if (link) {
    link.addEventListener('click', () => {
      els.dropdown.classList.add('hidden');
      els.dropdown.innerHTML = '';
    });
  }
}

function renderSelectedPreview(context, result) {
  const els = getAcEls(context);
  const thumb = result.thumb || result.poster;
  const subParts = [result.year, result.genre].filter(Boolean);
  const ratingPart = result.apiRating ? ` • ★ ${result.apiRating}` : '';
  els.preview.innerHTML = `
    ${thumb ? `<img src="${thumb}" alt="" onerror="this.style.display='none'">` : ''}
    <div class="selected-preview-info">
      <div class="selected-preview-title">${escapeHtml(result.title)}</div>
      <div class="selected-preview-sub">${escapeHtml(subParts.join(' • '))}${ratingPart}</div>
    </div>
    <button type="button" class="selected-preview-clear" title="Clear selection">✕</button>
  `;
  els.preview.classList.remove('hidden');
  els.preview.querySelector('.selected-preview-clear').addEventListener('click', () => clearAutofill(context));
}

function clearAutofill(context) {
  const els = getAcEls(context);
  if (context === 'add') currentApiAutofill = null;
  else editApiAutofill = null;
  els.preview.classList.add('hidden');
  els.preview.innerHTML = '';
}

function setAutofillResult(context, result) {
  const els = getAcEls(context);
  if (context === 'add') currentApiAutofill = result;
  else editApiAutofill = result;

  els.input.value = result.title;
  els.dropdown.classList.add('hidden');
  els.dropdown.innerHTML = '';
  renderSelectedPreview(context, result);

  if (context === 'add') {
    if (result.seasons && selectedCat !== 'movies') {
      document.getElementById('seasonsInput').value = result.seasons;
    }
    updateSeasonsVisibility();
    updateNextBtnText();
  }
}

async function selectSuggestion(context, result) {
  const els = getAcEls(context);
  if (result.sourceType === 'tmdb_tv') {
    els.dropdown.classList.remove('hidden');
    els.dropdown.innerHTML = `<div class="suggestion-status"><span class="suggestion-spinner"></span>Fetching season info...</div>`;
    try {
      const details = await tmdbGetTVDetails(result.sourceId);
      result.seasons = details.seasons;
      result.episodesPerSeason = details.episodesPerSeason;
    } catch (e) {
      // Network/API hiccup — keep season info empty, user can fill it manually
    }
  }
  setAutofillResult(context, result);
}

async function performTitleAutocomplete(context, rawQuery) {
  const els = getAcEls(context);
  const query = rawQuery.trim();

  if (query.length < 2) {
    els.dropdown.classList.add('hidden');
    els.dropdown.innerHTML = '';
    return;
  }

  const category = els.getCategory();

  if (category !== 'anime' && !hasTmdbKey()) {
    els.dropdown.classList.remove('hidden');
    els.dropdown.innerHTML = `
      <div class="suggestion-status">No TMDB API key configured — type the title manually and fill in the fields below.</div>
    `;
    return;
  }

  const seq = ++acSeq[context];
  els.dropdown.classList.remove('hidden');
  els.dropdown.innerHTML = `<div class="suggestion-status"><span class="suggestion-spinner"></span>Searching...</div>`;

  let results = [];
  try {
    results = await searchTitlesForCategory(category, query);
  } catch (err) {
    if (seq !== acSeq[context]) return; // a newer keystroke already started another search
    els.dropdown.innerHTML = `
      <div class="suggestion-status">Couldn't reach the database${category !== 'anime' ? ' (check your connection or API key)' : ' (check your connection)'}. You can still enter the title manually.</div>
      <div class="manual-entry-link">✕ Close and enter manually</div>
    `;
    wireManualLink(context);
    return;
  }

  if (seq !== acSeq[context]) return; // stale response — a newer search has already started

  acResults[context] = results;
  acHighlighted[context] = -1;

  if (results.length === 0) {
    els.dropdown.innerHTML = `
      <div class="suggestion-status">No matches for "${escapeHtml(query)}" — you can still enter it manually.</div>
      <div class="manual-entry-link">✕ Close and enter manually</div>
    `;
    wireManualLink(context);
    return;
  }

  els.dropdown.innerHTML =
    results.map((r, i) => buildSuggestionItemHtml(r, i)).join('') +
    `<div class="manual-entry-link">✕ None of these — enter manually</div>`;

  els.dropdown.querySelectorAll('.suggestion-item').forEach((node, i) => {
    node.addEventListener('click', () => selectSuggestion(context, results[i]));
  });
  wireManualLink(context);
}

const debouncedAddAutocomplete  = debounce((q) => performTitleAutocomplete('add', q), 450);
const debouncedEditAutocomplete = debounce((q) => performTitleAutocomplete('edit', q), 450);

function updateAcHighlight(context) {
  const els = getAcEls(context);
  const items = els.dropdown.querySelectorAll('.suggestion-item');
  items.forEach((node, i) => node.classList.toggle('highlighted', i === acHighlighted[context]));
  const active = els.dropdown.querySelector('.suggestion-item.highlighted');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function handleAcKeydown(context, e) {
  const els = getAcEls(context);
  const isOpen = !els.dropdown.classList.contains('hidden');
  const results = acResults[context];
  if (!isOpen || results.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acHighlighted[context] = Math.min(acHighlighted[context] + 1, results.length - 1);
    updateAcHighlight(context);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acHighlighted[context] = Math.max(acHighlighted[context] - 1, 0);
    updateAcHighlight(context);
  } else if (e.key === 'Enter' && acHighlighted[context] >= 0) {
    e.preventDefault();
    selectSuggestion(context, results[acHighlighted[context]]);
  } else if (e.key === 'Escape') {
    els.dropdown.classList.add('hidden');
  }
}

function updateApiStatusBanner() {
  const banner = document.getElementById('apiStatusBanner');
  if (!banner) return;

  if (selectedCat === 'anime') {
    banner.classList.add('hidden');
    return;
  }

  if (!hasTmdbKey()) {
    banner.classList.remove('hidden');
    banner.classList.remove('is-error');
    banner.innerHTML = `
      <span>⚠️</span>
      <span><strong>TMDB API key not set.</strong> Auto-fetch for Movies/Series is off.
      Open <code>script.js</code>, find <code>TMDB_API_KEY</code> near the top, and paste your free key in.
      You can still add titles manually for now.</span>
    `;
  } else {
    banner.classList.add('hidden');
  }
}

// ============================================================
// THEME
// ============================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(KEYS.THEME, theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================================
// SWIPE GESTURES (mobile tab switching)
// ============================================================
function initSwipe() {
  const main = document.getElementById('mainContent');
  main.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  main.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only horizontal swipes (dx bigger than dy, and dx > 50px threshold)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const currentIdx = TAB_ORDER.indexOf(activeTab);
      if (dx < 0 && currentIdx < TAB_ORDER.length - 1) {
        switchTab(TAB_ORDER[currentIdx + 1]);
      } else if (dx > 0 && currentIdx > 0) {
        switchTab(TAB_ORDER[currentIdx - 1]);
      }
    }
  }, { passive: true });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, opts = {}) {
  let toastWrap = document.getElementById('toastWrap');
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.id = 'toastWrap';
    toastWrap.className = 'toast-wrap';
    document.body.appendChild(toastWrap);
  }
  const toast = document.createElement('div');
  toast.className = 'toast' + (opts.error ? ' toast-error' : '');
  toast.innerHTML = `<span>${message}</span>`;
  toastWrap.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-out'), 4200);
  setTimeout(() => toast.remove(), 4600);
}

// ============================================================
// BACKUP & RESTORE (export / import as JSON)
// ============================================================
function exportBackup() {
  const payload = {
    app: 'My Watchlist Hub',
    version: 1,
    exportedAt: new Date().toISOString(),
    watchlist, watching, completed,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `watchlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('💾 Backup downloaded');
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.onload = (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      alert('That file is not valid JSON. Please pick a backup exported from this app.');
      return;
    }

    const looksValid = data && Array.isArray(data.watchlist) &&
      Array.isArray(data.watching) && Array.isArray(data.completed);
    if (!looksValid) {
      alert("This file doesn't look like a watchlist backup — missing watchlist/watching/completed lists.");
      return;
    }

    const itemCount = data.watchlist.length + data.watching.length + data.completed.length;
    const ok = confirm(
      `Restore this backup? It has ${itemCount} title(s) and will REPLACE everything currently in the app. This can't be undone.`
    );
    if (!ok) return;

    watchlist = data.watchlist;
    watching  = data.watching;
    completed = data.completed;
    storageSet(KEYS.WATCHLIST, watchlist);
    storageSet(KEYS.WATCHING, watching);
    storageSet(KEYS.COMPLETED, completed);

    renderAll();
    showToast('✅ Backup restored');
  };

  reader.onerror = () => alert('Could not read that file. Try exporting a fresh backup.');
  reader.readAsText(file);
}

// ============================================================
// AUTO-ADVANCE: detect new seasons for completed series (TMDB only)
// ============================================================
async function checkForNewSeasons() {
  if (!hasTmdbKey()) return; // needs TMDB to know season counts

  // Throttle to once every 6 hours so we don't hammer the API on every reload
  const lastCheck = parseInt(localStorage.getItem(KEYS.LAST_SEASON_CHECK) || '0', 10);
  if (Date.now() - lastCheck < 6 * 60 * 60 * 1000) return;

  const candidates = completed.filter(
    i => i.category === 'series' && i.sourceType === 'tmdb_tv' && i.sourceId
  );
  if (candidates.length === 0) {
    localStorage.setItem(KEYS.LAST_SEASON_CHECK, String(Date.now()));
    return;
  }

  const moved = [];

  for (const item of candidates) {
    try {
      const details = await tmdbGetTVDetails(item.sourceId);
      const newCount = details.seasons || 0;
      const oldCount = item.seasons || 0;

      if (newCount > oldCount) {
        // Pull the item out of Completed
        completed = completed.filter(i => i.id !== item.id);

        // Extend episodesPerSeason with the new season(s)' episode counts
        const oldEpisodes = item.episodesPerSeason || [];
        const newEpisodes = details.episodesPerSeason || [];
        const mergedEpisodes = oldEpisodes.slice(0, oldCount);
        for (let s = oldCount; s < newCount; s++) {
          mergedEpisodes.push(newEpisodes[s] || 0);
        }

        item.seasons            = newCount;
        item.episodesPerSeason  = mergedEpisodes;
        item.currentSeason      = oldCount + 1;
        item.currentEpisode     = 1;
        item.startedAt          = new Date().toISOString();
        delete item.completedAt;

        watching.push(item);
        moved.push(item.title);
      }
    } catch (err) {
      // Network hiccup or removed show on TMDB — skip silently, try again next check
    }
  }

  if (moved.length > 0) {
    storageSet(KEYS.WATCHING, watching);
    storageSet(KEYS.COMPLETED, completed);
    renderAll();
    const list = moved.length === 1 ? moved[0] : `${moved.length} shows`;
    showToast(`📺 New season found for ${escapeHtml(list)} — moved to Watching!`);
  }

  localStorage.setItem(KEYS.LAST_SEASON_CHECK, String(Date.now()));
}

// ============================================================
// PWA: service worker + install prompt
// ============================================================
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support just won't be available — the app still works online as normal
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.add('hidden');
  showToast('📲 App installed!');
});


document.addEventListener('DOMContentLoaded', () => {

  // Apply saved theme
  const savedTheme = localStorage.getItem(KEYS.THEME) || 'dark';
  applyTheme(savedTheme);

  // Initial render
  renderAll();

  // Check for newly released seasons of completed series (throttled, TMDB-only)
  checkForNewSeasons();

  // Backup & restore
  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    importBackupFile(e.target.files[0]);
    e.target.value = ''; // allow re-selecting the same file later
  });

  // Install app (PWA)
  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installBtn').classList.add('hidden');
  });

  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  // Add button
  document.getElementById('openModalBtn').addEventListener('click', openModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('closeModalBtn2').addEventListener('click', closeModal);

  // Close add modal on overlay click
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Edit modal
  document.getElementById('closeEditModalBtn').addEventListener('click', () => {
    editApiAutofill = null;
    document.getElementById('editModalOverlay').classList.add('hidden');
  });
  document.getElementById('editModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editModalOverlay')) {
      editApiAutofill = null;
      document.getElementById('editModalOverlay').classList.add('hidden');
    }
  });
  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);

  // Edit category buttons
  document.querySelectorAll('#editCatBtns .cat-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editCat = btn.dataset.cat;
      document.querySelectorAll('#editCatBtns .cat-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateEditSubTagOptions();
      clearAutofill('edit');
      document.getElementById('editTitleSuggestions').classList.add('hidden');
      const val = document.getElementById('editTitleInput').value;
      if (val.trim().length >= 2) performTitleAutocomplete('edit', val);
    });
  });

  // Delete modal
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    deleteItemId = null; deleteItemTab = null;
    document.getElementById('deleteModalOverlay').classList.add('hidden');
  });
  document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
  document.getElementById('deleteModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('deleteModalOverlay')) {
      deleteItemId = null; deleteItemTab = null;
      document.getElementById('deleteModalOverlay').classList.add('hidden');
    }
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      document.getElementById('searchInput').value = '';
      document.getElementById('searchResults').classList.add('hidden');
      searchQuery = '';
    });
  });

  // Category select buttons in add form
  document.querySelectorAll('#catBtns .cat-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCat = btn.dataset.cat;
      document.querySelectorAll('#catBtns .cat-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSubTagOptions();
      updateSeasonsVisibility();
      updateNextBtnText();
      updateApiStatusBanner();
      clearAutofill('add');
      document.getElementById('titleSuggestions').classList.add('hidden');
      const val = document.getElementById('titleInput').value;
      if (val.trim().length >= 2) performTitleAutocomplete('add', val);
    });
  });

  // Status select buttons
  document.querySelectorAll('.status-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedStatus = btn.dataset.status;
      document.querySelectorAll('.status-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateNextBtnText();
    });
  });

  // Seasons input change
  document.getElementById('seasonsInput').addEventListener('input', updateNextBtnText);

  // Main Next button
  document.getElementById('mainNextBtn').addEventListener('click', () => {
    const title = document.getElementById('titleInput').value.trim();
    if (!title) { alert('Please enter a title!'); return; }

    const seasonsVal = document.getElementById('seasonsInput').value;
    const isSeriesLike = selectedCat !== 'movies';

    if (isSeriesLike && seasonsVal) {
      const count = parseInt(seasonsVal);
      if (count > 0) {
        const apiEpisodes = currentApiAutofill?.episodesPerSeason;
        epInputs = new Array(count).fill('').map((_, i) =>
          (apiEpisodes && apiEpisodes[i]) ? apiEpisodes[i] : ''
        );
        currentSeasonIdx = 0;
        showEpisodeStep();
        return;
      }
    }
    submitItem(null);
  });

  // Episode next button
  document.getElementById('epNextBtn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('epInput').value);
    if (!val || val < 1) { alert('Please enter a valid episode count!'); return; }
    epInputs[currentSeasonIdx] = val;

    if (currentSeasonIdx + 1 < epInputs.length) {
      currentSeasonIdx++;
      showEpisodeStep();
    } else {
      submitItem(epInputs.map(e => parseInt(e) || 1));
    }
  });

  // Episode back button
  document.getElementById('epBackBtn').addEventListener('click', () => {
    const val = document.getElementById('epInput').value;
    if (val) epInputs[currentSeasonIdx] = parseInt(val) || '';
    currentSeasonIdx--;
    showEpisodeStep();
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    performSearch(searchQuery);
  });

  // Close search on outside click
  document.addEventListener('click', (e) => {
    const searchWrap  = document.querySelector('.search-wrap');
    const resultsWrap = document.getElementById('searchResults');
    if (!searchWrap.contains(e.target) && !resultsWrap.contains(e.target)) {
      resultsWrap.classList.add('hidden');
    }
  });

  // Sort dropdown
  document.getElementById('sortBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('sortDropdown').classList.toggle('hidden');
    document.getElementById('filterDropdown').classList.add('hidden');
  });

  document.querySelectorAll('#sortDropdown .filter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      sortMode = btn.dataset.sort;
      localStorage.setItem(KEYS.SORT, sortMode);
      const labels = { recent: 'Recent', az: 'A–Z', rating: 'Rating' };
      document.getElementById('sortLabel').textContent = labels[sortMode] || 'Recent';
      document.querySelectorAll('#sortDropdown .filter-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sortDropdown').classList.add('hidden');
      renderAll();
    });
    // Set initial active state
    if (btn.dataset.sort === sortMode) btn.classList.add('active');
  });

  // Sync sort label on load
  const sortLabels = { recent: 'Recent', az: 'A–Z', rating: 'Rating' };
  document.getElementById('sortLabel').textContent = sortLabels[sortMode] || 'Recent';

  // Filter button
  document.getElementById('filterBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('filterDropdown').classList.toggle('hidden');
    document.getElementById('sortDropdown').classList.add('hidden');
  });

  // Filter options
  document.querySelectorAll('#filterDropdown .filter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      filterCat = btn.dataset.cat;
      document.getElementById('filterLabel').textContent =
        filterCat === 'all' ? 'All' : { movies:'Movies', series:'Series', anime:'Anime' }[filterCat];
      document.querySelectorAll('#filterDropdown .filter-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('filterDropdown').classList.add('hidden');
      renderAll();
      if (searchQuery.length >= 2) performSearch(searchQuery);
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    const filterWrap = document.querySelector('.filter-wrap');
    const sortWrap   = document.querySelector('.sort-wrap');
    if (filterWrap && !filterWrap.contains(e.target)) {
      document.getElementById('filterDropdown').classList.add('hidden');
    }
    if (sortWrap && !sortWrap.contains(e.target)) {
      document.getElementById('sortDropdown').classList.add('hidden');
    }
  });

  // Enter key on title input (with autocomplete keyboard nav support)
  document.getElementById('titleInput').addEventListener('keydown', (e) => {
    const dropdown = document.getElementById('titleSuggestions');
    const navKeys = ['ArrowDown', 'ArrowUp', 'Escape'];
    if (!dropdown.classList.contains('hidden') &&
        (navKeys.includes(e.key) || (e.key === 'Enter' && acHighlighted.add >= 0))) {
      handleAcKeydown('add', e);
      return;
    }
    if (e.key === 'Enter') document.getElementById('mainNextBtn').click();
  });

  // Live autocomplete search as the user types a title
  document.getElementById('titleInput').addEventListener('input', (e) => {
    if (currentApiAutofill && e.target.value !== currentApiAutofill.title) {
      clearAutofill('add');
    }
    debouncedAddAutocomplete(e.target.value);
  });

  // Enter key on episode input
  document.getElementById('epInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('epNextBtn').click();
  });

  // Enter on edit title (with autocomplete keyboard nav support)
  document.getElementById('editTitleInput').addEventListener('keydown', (e) => {
    const dropdown = document.getElementById('editTitleSuggestions');
    const navKeys = ['ArrowDown', 'ArrowUp', 'Escape'];
    if (!dropdown.classList.contains('hidden') &&
        (navKeys.includes(e.key) || (e.key === 'Enter' && acHighlighted.edit >= 0))) {
      handleAcKeydown('edit', e);
      return;
    }
    if (e.key === 'Enter') saveEdit();
  });

  // Live autocomplete search in edit modal
  document.getElementById('editTitleInput').addEventListener('input', (e) => {
    if (editApiAutofill && e.target.value !== editApiAutofill.title) {
      clearAutofill('edit');
    }
    debouncedEditAutocomplete(e.target.value);
  });

  // Close autocomplete dropdowns when clicking elsewhere
  document.addEventListener('click', (e) => {
    const addWrap  = document.querySelector('#stepMain .title-input-wrap');
    const editWrap = document.querySelector('#editModal .title-input-wrap');
    if (addWrap && !addWrap.contains(e.target)) {
      document.getElementById('titleSuggestions').classList.add('hidden');
    }
    if (editWrap && !editWrap.contains(e.target)) {
      document.getElementById('editTitleSuggestions').classList.add('hidden');
    }
  });

  // Swipe gestures
  initSwipe();

});
