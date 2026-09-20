(() => {
  const state = {
    q: '',
    artist: '',
    tag: '',
    playlist: '',
    favoritesOnly: false,
    sort: 'artist',
    playlists: [],
    currentVideoId: null,
  };

  const el = {
    search: document.getElementById('search'),
    favToggle: document.getElementById('favToggle'),
    scanSection: document.getElementById('scanSection'),
    scanProgressFill: document.getElementById('scanProgressFill'),
    scanProgressLabel: document.getElementById('scanProgressLabel'),
    sortSelect: document.getElementById('sortSelect'),
    grid: document.getElementById('grid'),
    resultCount: document.getElementById('resultCount'),
    emptyState: document.getElementById('emptyState'),
    playlistList: document.getElementById('playlistList'),
    artistList: document.getElementById('artistList'),
    tagList: document.getElementById('tagList'),
    newPlaylistForm: document.getElementById('newPlaylistForm'),
    newPlaylistName: document.getElementById('newPlaylistName'),
    modal: document.getElementById('playerModal'),
    player: document.getElementById('player'),
    closeModal: document.getElementById('closeModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalArtist: document.getElementById('modalArtist'),
    modalFav: document.getElementById('modalFav'),
    modalWatched: document.getElementById('modalWatched'),
    modalTags: document.getElementById('modalTags'),
    addTagForm: document.getElementById('addTagForm'),
    addTagInput: document.getElementById('addTagInput'),
    playlistSelect: document.getElementById('playlistSelect'),
    addToPlaylistBtn: document.getElementById('addToPlaylistBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
  };

  let debounceTimer = null;
  function debounce(fn, ms) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), ms);
    };
  }

  function formatDuration(sec) {
    if (!sec && sec !== 0) return '';
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  async function api(path, opts) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (res.status === 401) {
      location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    if (res.status === 204) return null;
    return res.json();
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.artist) params.set('artist', state.artist);
    if (state.tag) params.set('tag', state.tag);
    if (state.playlist) params.set('playlist', state.playlist);
    if (state.favoritesOnly) params.set('favorite', '1');
    params.set('sort', state.sort);
    return params.toString();
  }

  async function loadVideos() {
    const videos = await api(`/videos?${buildQuery()}`);
    renderGrid(videos);
  }

  function renderGrid(videos) {
    el.resultCount.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;
    el.emptyState.classList.toggle('hidden', videos.length > 0);
    el.grid.innerHTML = videos.map(cardHtml).join('');
    el.grid.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => openPlayer(Number(card.dataset.id)));
    });
    el.grid.querySelectorAll('.add-playlist-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlaylistPopover(Number(btn.dataset.id), btn);
      });
    });
  }

  function cardHtml(v) {
    const thumb = v.thumbnail
      ? `<img src="${v.thumbnail}" alt="" loading="lazy" />`
      : `<div class="noimg">🎵</div>`;
    const tags = v.tags.slice(0, 3).map((t) => `<span>${escapeHtml(t)}</span>`).join('');
    return `
      <div class="card" data-id="${v.id}">
        <div class="card-thumb">
          ${thumb}
          ${v.favorite ? '<div class="fav-badge">★</div>' : ''}
          ${v.duration ? `<div class="duration-badge">${formatDuration(v.duration)}</div>` : ''}
          <button class="add-playlist-btn" data-id="${v.id}" title="Add to playlist">+</button>
          <div class="play-badge">▶</div>
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(v.title)}</div>
          <div class="card-artist">${escapeHtml(v.artist)}</div>
          ${tags ? `<div class="card-tags">${tags}</div>` : ''}
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  async function loadSidebar() {
    const [artists, tags, playlists] = await Promise.all([api('/artists'), api('/tags'), api('/playlists')]);

    el.artistList.innerHTML = artists
      .map((a) => `<li data-artist="${escapeHtml(a.artist)}" class="${state.artist === a.artist ? 'active' : ''}">${escapeHtml(a.artist)} <span class="count">${a.count}</span></li>`)
      .join('');
    el.tagList.innerHTML = tags
      .map((t) => `<li data-tag="${escapeHtml(t.name)}" class="${state.tag === t.name ? 'active' : ''}">${escapeHtml(t.name)} <span class="count">${t.count}</span></li>`)
      .join('');

    state.playlists = playlists;
    el.playlistList.innerHTML =
      `<li data-playlist="" class="${state.playlist === '' ? 'active' : ''}">All Videos</li>` +
      playlists
        .map(
          (p) =>
            `<li data-playlist="${p.id}" class="${String(state.playlist) === String(p.id) ? 'active' : ''}">
              <span class="playlist-name">${escapeHtml(p.name)} <span class="count">${p.count}</span></span>
              <button class="playlist-delete" data-playlist-id="${p.id}" data-playlist-name="${escapeHtml(p.name)}" title="Delete playlist">✕</button>
            </li>`
        )
        .join('');

    el.playlistSelect.innerHTML = playlists.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

    el.artistList.querySelectorAll('li').forEach((li) =>
      li.addEventListener('click', () => {
        state.artist = state.artist === li.dataset.artist ? '' : li.dataset.artist;
        refresh();
      })
    );
    el.tagList.querySelectorAll('li').forEach((li) =>
      li.addEventListener('click', () => {
        state.tag = state.tag === li.dataset.tag ? '' : li.dataset.tag;
        refresh();
      })
    );
    el.playlistList.querySelectorAll('li[data-playlist]').forEach((li) =>
      li.addEventListener('click', () => {
        state.playlist = li.dataset.playlist;
        refresh();
      })
    );
    el.playlistList.querySelectorAll('.playlist-delete').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.dataset.playlistName;
        if (!confirm(`Delete playlist "${name}"? The videos themselves won't be affected.`)) return;
        const id = btn.dataset.playlistId;
        await api(`/playlists/${id}`, { method: 'DELETE' });
        if (String(state.playlist) === String(id)) state.playlist = '';
        refresh();
      })
    );
  }

  function refresh() {
    loadVideos();
    loadSidebar();
  }

  // ---------- Quick "add to playlist" popover on card thumbnails ----------
  const playlistPopover = document.createElement('div');
  playlistPopover.id = 'playlistPopover';
  playlistPopover.className = 'playlist-popover hidden';
  document.body.appendChild(playlistPopover);

  function closePlaylistPopover() {
    playlistPopover.classList.add('hidden');
  }

  function openPlaylistPopover(videoId, anchorEl) {
    if (!playlistPopover.classList.contains('hidden') && playlistPopover.dataset.videoId === String(videoId)) {
      closePlaylistPopover();
      return;
    }
    playlistPopover.dataset.videoId = videoId;

    if (state.playlists.length === 0) {
      playlistPopover.innerHTML = `<div class="popover-empty">No playlists yet — create one in the sidebar.</div>`;
    } else {
      playlistPopover.innerHTML = state.playlists
        .map((p) => `<button data-playlist-id="${p.id}">${escapeHtml(p.name)}</button>`)
        .join('');
      playlistPopover.querySelectorAll('button').forEach((btn) =>
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.disabled = true;
          btn.textContent = 'Added ✓';
          await api(`/playlists/${btn.dataset.playlistId}/videos`, {
            method: 'POST',
            body: JSON.stringify({ videoId }),
          });
          loadSidebar();
          setTimeout(closePlaylistPopover, 400);
        })
      );
    }

    const rect = anchorEl.getBoundingClientRect();
    playlistPopover.style.top = `${window.scrollY + rect.bottom + 6}px`;
    playlistPopover.style.left = `${window.scrollX + Math.min(rect.left, window.innerWidth - 200)}px`;
    playlistPopover.classList.remove('hidden');
  }

  document.addEventListener('click', (e) => {
    if (!playlistPopover.contains(e.target) && !e.target.classList.contains('add-playlist-btn')) {
      closePlaylistPopover();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlaylistPopover();
  });

  // ---------- Modal / player ----------
  async function openPlayer(id) {
    const v = await api(`/videos/${id}`);
    state.currentVideoId = id;
    el.player.src = `/api/videos/${id}/stream`;
    el.modalTitle.textContent = v.title;
    el.modalArtist.textContent = v.artist;
    el.modalFav.classList.toggle('active', v.favorite);
    el.modalWatched.classList.toggle('active', v.watched);
    renderModalTags(v.tags);
    el.modal.classList.remove('hidden');

    if (!v.watched) {
      el.player.addEventListener(
        'timeupdate',
        function markWatched() {
          if (el.player.currentTime > 5) {
            api(`/videos/${id}`, { method: 'PATCH', body: JSON.stringify({ watched: true }) });
            el.modalWatched.classList.add('active');
            el.player.removeEventListener('timeupdate', markWatched);
          }
        }
      );
    }
  }

  function renderModalTags(tags) {
    el.modalTags.innerHTML = tags
      .map((t) => `<span>${escapeHtml(t)} <button data-tag="${escapeHtml(t)}" title="Remove tag">✕</button></span>`)
      .join('');
    el.modalTags.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const v = await api(`/videos/${state.currentVideoId}`);
        const newTags = v.tags.filter((t) => t !== btn.dataset.tag);
        const updated = await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ tags: newTags }) });
        renderModalTags(updated.tags);
        loadSidebar();
      })
    );
  }

  function closePlayer() {
    el.modal.classList.add('hidden');
    el.player.pause();
    el.player.src = '';
    loadVideos();
  }

  el.closeModal.addEventListener('click', closePlayer);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closePlayer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.modal.classList.contains('hidden')) closePlayer();
  });

  el.modalFav.addEventListener('click', async () => {
    const active = !el.modalFav.classList.contains('active');
    await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ favorite: active }) });
    el.modalFav.classList.toggle('active', active);
  });

  el.modalWatched.addEventListener('click', async () => {
    const active = !el.modalWatched.classList.contains('active');
    await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ watched: active }) });
    el.modalWatched.classList.toggle('active', active);
  });

  el.addTagForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = el.addTagInput.value.trim();
    if (!val) return;
    const v = await api(`/videos/${state.currentVideoId}`);
    const newTags = [...new Set([...v.tags, val])];
    const updated = await api(`/videos/${state.currentVideoId}`, { method: 'PATCH', body: JSON.stringify({ tags: newTags }) });
    renderModalTags(updated.tags);
    el.addTagInput.value = '';
    loadSidebar();
  });

  el.addToPlaylistBtn.addEventListener('click', async () => {
    const playlistId = el.playlistSelect.value;
    if (!playlistId || !state.currentVideoId) return;
    await api(`/playlists/${playlistId}/videos`, { method: 'POST', body: JSON.stringify({ videoId: state.currentVideoId }) });
    loadSidebar();
  });

  // ---------- Top controls ----------
  el.search.addEventListener(
    'input',
    debounce((e) => {
      state.q = e.target.value.trim();
      loadVideos();
    }, 250)
  );

  el.favToggle.addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    el.favToggle.classList.toggle('active', state.favoritesOnly);
    loadVideos();
  });

  el.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    loadVideos();
  });

  let wasScanning = false;

  function updateScanUI(status) {
    if (!status.running) {
      el.scanSection.classList.add('hidden');
      return;
    }
    el.scanSection.classList.remove('hidden');
    const total = status.total || 0;
    const scanned = status.scanned || 0;
    if (total > 0) {
      const pct = Math.min(100, Math.round((scanned / total) * 100));
      el.scanProgressFill.classList.remove('indeterminate');
      el.scanProgressFill.style.width = `${pct}%`;
      el.scanProgressLabel.textContent = `${scanned} / ${total} files — ${pct}%`;
    } else {
      el.scanProgressFill.classList.add('indeterminate');
      el.scanProgressFill.style.width = '';
      el.scanProgressLabel.textContent = 'Scanning…';
    }
  }

  async function pollScanStatusTick() {
    let status;
    try {
      status = await api('/scan/status');
    } catch {
      return;
    }
    updateScanUI(status);

    if (wasScanning && !status.running) refresh();
    wasScanning = status.running;
  }

  setInterval(pollScanStatusTick, 2000);
  pollScanStatusTick();

  el.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login';
  });

  el.newPlaylistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el.newPlaylistName.value.trim();
    if (!name) return;
    try {
      await api('/playlists', { method: 'POST', body: JSON.stringify({ name }) });
      el.newPlaylistName.value = '';
      loadSidebar();
    } catch {
      alert('A playlist with that name already exists.');
    }
  });

  refresh();
})();
