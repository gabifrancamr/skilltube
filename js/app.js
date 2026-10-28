/**
 * Skill Tube — Biblioteca de playlists, importação e player sincronizado
 */

(() => {
  'use strict';

  const STORAGE = {
    library: 'skilltube_library',
    progress: 'skilltube_progress',
    active: 'skilltube_active_playlist',
    // legado (migração)
    completed: 'skilltube_completed',
    favorites: 'skilltube_favorites',
    lastLesson: 'skilltube_last_lesson',
  };

  const data = window.SkillTubeData;
  const {
    defaultCourse,
    parsePlaylistUrl,
    getPlaylistEmbedUrl,
    getPlaylistWatchUrl,
    getThumbnailUrl,
    buildLessonsFromVideoIds,
  } = data;

  /** @type {Array<Object>} */
  let library = [];
  /** @type {Record<string, { completed: number[], favorites: number[], lastIndex: number }>} */
  let progressMap = {};
  /** @type {Object|null} */
  let activeCourse = null;
  /** @type {Array<Object>} */
  let activeLessons = [];
  let currentIndex = 0;
  let currentView = 'home';
  let searchQuery = '';

  let ytPlayer = null;
  let ytApiRequested = false;
  let ytApiReady = false;
  let loadedPlaylistId = null;
  let syncingFromPlayer = false;
  let navigatingProgrammatically = false;

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    loadState();
    bindEvents();
    requestYouTubeApi();
    renderAll();
    showView('home');
  }

  /* ---------- Estado / storage ---------- */

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadState() {
    library = loadJson(STORAGE.library, []);
    progressMap = loadJson(STORAGE.progress, {});

    ensureDefaultInLibrary();
    migrateLegacyProgress();

    const activeId = loadJson(STORAGE.active, defaultCourse.playlistId);
    activeCourse = library.find((c) => c.playlistId === activeId) || library[0];
    resolveActiveLessons();
    const prog = getProgressRecord(activeCourse.playlistId);
    currentIndex = clampIndex(prog.lastIndex ?? 0);
  }

  function ensureDefaultInLibrary() {
    const exists = library.some((c) => c.playlistId === defaultCourse.playlistId);
    if (!exists) {
      library.unshift(serializeCourse(defaultCourse));
    } else {
      library = library.map((c) =>
        c.playlistId === defaultCourse.playlistId
          ? {
              ...c,
              title: c.title || defaultCourse.title,
              isDefault: true,
              lessons: defaultCourse.lessons,
              videoCount: defaultCourse.videoCount,
              thumbnailVideoId: defaultCourse.thumbnailVideoId,
              description: defaultCourse.description,
            }
          : c
      );
    }
    saveJson(STORAGE.library, library);
  }

  function serializeCourse(course) {
    return {
      playlistId: course.playlistId,
      sourceUrl: course.sourceUrl,
      title: course.title,
      description: course.description || '',
      isDefault: !!course.isDefault,
      thumbnailVideoId: course.thumbnailVideoId || null,
      videoCount: course.videoCount ?? (course.lessons ? course.lessons.length : null),
      lessons: course.lessons || null,
      addedAt: course.addedAt || new Date().toISOString(),
    };
  }

  function migrateLegacyProgress() {
    const pid = defaultCourse.playlistId;
    if (progressMap[pid]) return;

    const oldCompleted = loadJson(STORAGE.completed, null);
    const oldFavorites = loadJson(STORAGE.favorites, null);
    const oldLast = loadJson(STORAGE.lastLesson, null);

    if (!oldCompleted && !oldFavorites && !oldLast) {
      progressMap[pid] = { completed: [], favorites: [], lastIndex: 0 };
      saveJson(STORAGE.progress, progressMap);
      return;
    }

    const toIndex = (lessonId) => {
      const i = defaultCourse.lessons.findIndex((l) => l.id === lessonId);
      return i;
    };

    const completed = Array.isArray(oldCompleted)
      ? oldCompleted.map(toIndex).filter((i) => i >= 0)
      : [];
    const favorites = Array.isArray(oldFavorites)
      ? oldFavorites.map(toIndex).filter((i) => i >= 0)
      : [];
    let lastIndex = 0;
    if (typeof oldLast === 'string') {
      const i = toIndex(oldLast);
      if (i >= 0) lastIndex = i;
    }

    progressMap[pid] = { completed, favorites, lastIndex };
    saveJson(STORAGE.progress, progressMap);
  }

  function getProgressRecord(playlistId) {
    if (!progressMap[playlistId]) {
      progressMap[playlistId] = { completed: [], favorites: [], lastIndex: 0 };
    }
    return progressMap[playlistId];
  }

  function persistProgress() {
    if (!activeCourse) return;
    const rec = getProgressRecord(activeCourse.playlistId);
    rec.lastIndex = currentIndex;
    progressMap[activeCourse.playlistId] = rec;
    saveJson(STORAGE.progress, progressMap);
    saveJson(STORAGE.active, activeCourse.playlistId);
    saveJson(STORAGE.library, library);
  }

  function resolveActiveLessons() {
    if (!activeCourse) {
      activeLessons = [];
      return;
    }
    if (activeCourse.lessons && activeCourse.lessons.length) {
      activeLessons = activeCourse.lessons;
      return;
    }
    if (activeCourse.videoCount && activeCourse.videoCount > 0) {
      activeLessons = Array.from({ length: activeCourse.videoCount }, (_, index) => ({
        id: `aula-${index + 1}`,
        order: index + 1,
        title: `Aula ${index + 1}`,
        description: 'Videoaula da playlist. Detalhes oficiais podem exigir YouTube Data API v3.',
        youtubeVideoId: null,
        playlistIndex: index,
      }));
      return;
    }
    activeLessons = [];
  }

  function clampIndex(i) {
    if (!activeLessons.length) return Math.max(0, i || 0);
    return Math.min(Math.max(0, i), activeLessons.length - 1);
  }

  function currentLesson() {
    if (!activeLessons.length) {
      return {
        id: 'aula-1',
        order: currentIndex + 1,
        title: `Aula ${currentIndex + 1}`,
        description: 'Reproduzindo via playlist do YouTube.',
        youtubeVideoId: null,
        playlistIndex: currentIndex,
      };
    }
    return activeLessons[clampIndex(currentIndex)];
  }

  /* ---------- DOM ---------- */

  function cacheElements() {
    els.navToggle = document.getElementById('nav-toggle');
    els.navMenu = document.getElementById('nav-menu');
    els.searchInput = document.getElementById('search-input');
    els.searchClear = document.getElementById('search-clear');
    els.headerProgressFill = document.getElementById('header-progress-fill');
    els.headerProgressText = document.getElementById('header-progress-text');
    els.views = {
      home: document.getElementById('view-home'),
      library: document.getElementById('view-library'),
      import: document.getElementById('view-import'),
      course: document.getElementById('view-course'),
      favorites: document.getElementById('view-favorites'),
    };
    els.libraryGrid = document.getElementById('library-grid');
    els.libraryEmpty = document.getElementById('library-empty');
    els.homeLibraryGrid = document.getElementById('home-library-grid');
    els.lessonCards = document.getElementById('lesson-cards');
    els.searchResults = document.getElementById('search-results');
    els.searchEmpty = document.getElementById('search-empty');
    els.continueSection = document.getElementById('continue-section');
    els.continueCard = document.getElementById('continue-card');
    els.homeProgressFill = document.getElementById('home-progress-fill');
    els.homeProgressText = document.getElementById('home-progress-text');
    els.homeProgressPercent = document.getElementById('home-progress-percent');
    els.btnContinue = document.getElementById('btn-continue');
    els.btnOpenCourse = document.getElementById('btn-open-course');
    els.btnImportNav = document.getElementById('btn-go-import');
    els.importForm = document.getElementById('import-form');
    els.importUrl = document.getElementById('import-url');
    els.importTitle = document.getElementById('import-title');
    els.importSubmit = document.getElementById('import-submit');
    els.importStatus = document.getElementById('import-status');
    els.importLoading = document.getElementById('import-loading');
    els.lessonList = document.getElementById('lesson-list');
    els.playerHost = document.getElementById('player-host');
    els.playerFallback = document.getElementById('player-fallback');
    els.playerFallbackLink = document.getElementById('player-fallback-link');
    els.playerPrev = document.getElementById('player-prev');
    els.playerNext = document.getElementById('player-next');
    els.courseTitle = document.getElementById('course-title');
    els.courseDescription = document.getElementById('course-description');
    els.lessonTitle = document.getElementById('lesson-title');
    els.lessonDescription = document.getElementById('lesson-description');
    els.lessonIndicator = document.getElementById('lesson-indicator');
    els.courseProgressFill = document.getElementById('course-progress-fill');
    els.courseProgressText = document.getElementById('course-progress-text');
    els.btnPrev = document.getElementById('btn-prev');
    els.btnNext = document.getElementById('btn-next');
    els.btnComplete = document.getElementById('btn-complete');
    els.btnFavorite = document.getElementById('btn-favorite');
    els.btnBackLibrary = document.getElementById('btn-back-library');
    els.favoritesList = document.getElementById('favorites-list');
    els.favoritesEmpty = document.getElementById('favorites-empty');
    els.toast = document.getElementById('toast');
    els.activeCourseLabel = document.getElementById('active-course-label');
  }

  function bindEvents() {
    els.navToggle?.addEventListener('click', () => {
      const open = els.navMenu.classList.toggle('is-open');
      els.navToggle.setAttribute('aria-expanded', String(open));
    });

    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-nav');
        if (view === 'course') openActiveCourse();
        else showView(view);
        closeMobileNav();
      });
    });

    els.btnContinue?.addEventListener('click', () => openActiveCourse());
    els.btnOpenCourse?.addEventListener('click', () => openActiveCourse());
    els.btnImportNav?.addEventListener('click', () => showView('import'));
    els.btnBackLibrary?.addEventListener('click', () => showView('library'));

    els.searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      els.searchClear.hidden = !searchQuery;
      if (searchQuery && currentView !== 'home') showView('home');
      renderHomeLessons();
    });

    els.searchClear?.addEventListener('click', () => {
      els.searchInput.value = '';
      searchQuery = '';
      els.searchClear.hidden = true;
      els.searchInput.focus();
      renderHomeLessons();
    });

    els.btnPrev?.addEventListener('click', () => navegarAula(-1));
    els.btnNext?.addEventListener('click', () => navegarAula(1));
    els.playerPrev?.addEventListener('click', () => navegarAula(-1));
    els.playerNext?.addEventListener('click', () => navegarAula(1));
    els.btnComplete?.addEventListener('click', toggleComplete);
    els.btnFavorite?.addEventListener('click', toggleFavorite);

    els.importForm?.addEventListener('submit', onImportSubmit);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
    });
  }

  function closeMobileNav() {
    els.navMenu?.classList.remove('is-open');
    els.navToggle?.setAttribute('aria-expanded', 'false');
  }

  /* ---------- Importar playlist ---------- */

  function onImportSubmit(e) {
    e.preventDefault();
    clearImportStatus();

    const urlValue = els.importUrl?.value || '';
    const customTitle = (els.importTitle?.value || '').trim();
    const parsed = parsePlaylistUrl(urlValue);

    if (!parsed.ok) {
      setImportStatus(parsed.error, 'error');
      return;
    }

    if (library.some((c) => c.playlistId === parsed.playlistId)) {
      setImportStatus('Esta playlist já está na sua biblioteca. Abrindo o curso…', 'success');
      openCourseByPlaylistId(parsed.playlistId);
      return;
    }

    setImportLoading(true);
    setImportStatus('Validando e adicionando playlist…', 'info');

    // Processamento local (sem scraping / sem chave de API)
    window.setTimeout(() => {
      try {
        const entry = {
          playlistId: parsed.playlistId,
          sourceUrl: parsed.sourceUrl,
          title: customTitle || `Playlist ${parsed.playlistId.slice(0, 8)}…`,
          description:
            'Playlist importada do YouTube. Títulos oficiais das aulas podem aparecer como “Aula N” até a sincronização com o player.',
          isDefault: false,
          thumbnailVideoId: null,
          videoCount: null,
          lessons: null,
          addedAt: new Date().toISOString(),
        };

        library.push(entry);
        progressMap[entry.playlistId] = { completed: [], favorites: [], lastIndex: 0 };
        saveJson(STORAGE.library, library);
        saveJson(STORAGE.progress, progressMap);

        setImportLoading(false);
        setImportStatus('Playlist adicionada com sucesso!', 'success');
        if (els.importUrl) els.importUrl.value = '';
        if (els.importTitle) els.importTitle.value = '';
        showToast('Playlist adicionada à biblioteca');
        openCourseByPlaylistId(entry.playlistId);
      } catch (err) {
        setImportLoading(false);
        setImportStatus('Não foi possível adicionar a playlist. Tente novamente.', 'error');
      }
    }, 450);
  }

  function setImportLoading(on) {
    if (els.importLoading) els.importLoading.hidden = !on;
    if (els.importSubmit) els.importSubmit.disabled = on;
  }

  function setImportStatus(message, type) {
    if (!els.importStatus) return;
    els.importStatus.hidden = !message;
    els.importStatus.textContent = message || '';
    els.importStatus.className = `form-status form-status--${type || 'info'}`;
  }

  function clearImportStatus() {
    setImportStatus('', 'info');
    if (els.importStatus) els.importStatus.hidden = true;
  }

  /* ---------- Curso ativo ---------- */

  function openCourseByPlaylistId(playlistId) {
    const course = library.find((c) => c.playlistId === playlistId);
    if (!course) return;
    activeCourse = course;
    resolveActiveLessons();
    const prog = getProgressRecord(playlistId);
    currentIndex = clampIndex(prog.lastIndex ?? 0);
    persistProgress();
    destruirPlayer();
    showView('course');
  }

  function openActiveCourse() {
    if (!activeCourse) activeCourse = library[0];
    openCourseByPlaylistId(activeCourse.playlistId);
  }

  function removeCourse(playlistId) {
    const item = library.find((c) => c.playlistId === playlistId);
    if (!item) return;
    if (item.isDefault) {
      showToast('A playlist oficial de programação não pode ser removida');
      return;
    }
    library = library.filter((c) => c.playlistId !== playlistId);
    delete progressMap[playlistId];
    saveJson(STORAGE.library, library);
    saveJson(STORAGE.progress, progressMap);

    if (activeCourse?.playlistId === playlistId) {
      activeCourse = library[0];
      resolveActiveLessons();
      currentIndex = 0;
      persistProgress();
      destruirPlayer();
    }

    showToast('Playlist removida da biblioteca');
    renderLibrary();
    renderHome();
  }

  /* ---------- YouTube API ---------- */

  function requestYouTubeApi() {
    if (ytApiRequested) return;
    ytApiRequested = true;

    if (window.YT && window.YT.Player) {
      ytApiReady = true;
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      ytApiReady = true;
      if (currentView === 'course') ensurePlaylistPlayer();
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }

  function destruirPlayer() {
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      try {
        ytPlayer.destroy();
      } catch {
        /* ignore */
      }
    }
    ytPlayer = null;
    loadedPlaylistId = null;

    if (els.playerHost) {
      els.playerHost.innerHTML = '<div id="player-frame"></div>';
    }
  }

  function ensurePlaylistPlayer() {
    if (!activeCourse) return;
    hidePlayerFallback();

    const watchUrl = getPlaylistWatchUrl(activeCourse.playlistId);
    if (els.playerFallbackLink) els.playerFallbackLink.href = watchUrl;

    if (ytApiReady && window.YT && window.YT.Player) {
      if (ytPlayer && loadedPlaylistId === activeCourse.playlistId) {
        try {
          const idx = ytPlayer.getPlaylistIndex?.();
          if (typeof idx === 'number' && idx !== currentIndex) {
            navigatingProgrammatically = true;
            ytPlayer.playVideoAt(currentIndex);
            window.setTimeout(() => {
              navigatingProgrammatically = false;
            }, 400);
          }
        } catch {
          /* ignore */
        }
        return;
      }

      destruirPlayer();
      if (els.playerHost) els.playerHost.innerHTML = '<div id="player-frame"></div>';

      ytPlayer = new window.YT.Player('player-frame', {
        width: '100%',
        height: '100%',
        playerVars: {
          listType: 'playlist',
          list: activeCourse.playlistId,
          index: currentIndex,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: onPlayerReady,
          onError: () => showPlayerFallback(),
          onStateChange: onPlayerStateChange,
        },
      });
      loadedPlaylistId = activeCourse.playlistId;
      return;
    }

    // Fallback sem API
    if (els.playerHost) {
      const src = getPlaylistEmbedUrl(activeCourse.playlistId);
      els.playerHost.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.id = 'player-frame';
      iframe.title = `Player: ${activeCourse.title}`;
      iframe.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.src = src;
      els.playerHost.appendChild(iframe);
    }
  }

  function onPlayerReady(event) {
    hidePlayerFallback();
    syncLessonsFromPlayer(event.target);
    try {
      if (currentIndex > 0) event.target.playVideoAt(currentIndex);
    } catch {
      /* ignore */
    }
    atualizarInterfaceAula(currentIndex);
  }

  function syncLessonsFromPlayer(player) {
    if (!player || typeof player.getPlaylist !== 'function') return;
    let videoIds = null;
    try {
      videoIds = player.getPlaylist();
    } catch {
      videoIds = null;
    }
    if (!Array.isArray(videoIds) || !videoIds.length) return;

    const known = activeCourse.isDefault ? defaultCourse.lessons : activeCourse.lessons;
    const lessons = buildLessonsFromVideoIds(videoIds, known);
    activeLessons = lessons;
    activeCourse.lessons = lessons;
    activeCourse.videoCount = lessons.length;
    if (!activeCourse.thumbnailVideoId && lessons[0]?.youtubeVideoId) {
      activeCourse.thumbnailVideoId = lessons[0].youtubeVideoId;
    }

    library = library.map((c) =>
      c.playlistId === activeCourse.playlistId ? { ...activeCourse } : c
    );
    saveJson(STORAGE.library, library);
    renderLessonList();
    updateProgressUI();
  }

  function onPlayerStateChange(event) {
    if (navigatingProgrammatically || syncingFromPlayer) return;
    if (!ytPlayer) return;

    try {
      syncLessonsFromPlayer(ytPlayer);
      const idx =
        typeof ytPlayer.getPlaylistIndex === 'function' ? ytPlayer.getPlaylistIndex() : -1;
      if (typeof idx === 'number' && idx >= 0 && idx !== currentIndex) {
        syncingFromPlayer = true;
        selecionarAula(idx, { skipPlayer: true, silent: true });
        syncingFromPlayer = false;
      }

      // Atualiza título com o nome do vídeo quando a API expõe
      const videoData = ytPlayer.getVideoData?.();
      if (videoData?.title && els.lessonTitle && activeLessons[currentIndex]) {
        const generic = /^Aula \d+$/.test(activeLessons[currentIndex].title);
        if (generic || !activeCourse.isDefault) {
          // Só substitui placeholders; não inventa — usa título real do player
          if (videoData.title) {
            activeLessons[currentIndex] = {
              ...activeLessons[currentIndex],
              title: videoData.title,
              youtubeVideoId: videoData.video_id || activeLessons[currentIndex].youtubeVideoId,
            };
            if (els.lessonTitle) els.lessonTitle.textContent = videoData.title;
            renderLessonList();
          }
        }
      }
    } catch {
      syncingFromPlayer = false;
    }

    if (event?.data === window.YT?.PlayerState?.ERROR) {
      showPlayerFallback();
    }
  }

  /* ---------- Navegação central ---------- */

  function selecionarAula(indice, options = {}) {
    const { skipPlayer = false, silent = false } = options;

    if (!Number.isInteger(indice) || indice < 0) return;
    if (activeLessons.length && indice >= activeLessons.length) return;

    currentIndex = indice;
    persistProgress();
    atualizarInterfaceAula(indice);

    if (!skipPlayer) {
      if (ytPlayer && typeof ytPlayer.playVideoAt === 'function' && loadedPlaylistId === activeCourse.playlistId) {
        try {
          navigatingProgrammatically = true;
          ytPlayer.playVideoAt(indice);
          window.setTimeout(() => {
            navigatingProgrammatically = false;
          }, 500);
        } catch {
          navigatingProgrammatically = false;
          ensurePlaylistPlayer();
        }
      } else {
        ensurePlaylistPlayer();
      }
    }

    if (!silent) {
      const lesson = currentLesson();
      showToast(`Exibindo ${lesson.title}`);
    }
  }

  function navegarAula(delta) {
    const next = currentIndex + delta;
    if (activeLessons.length) {
      selecionarAula(next);
      return;
    }
    // Sem lista conhecida: usa API do player
    if (ytPlayer) {
      try {
        navigatingProgrammatically = true;
        if (delta > 0) ytPlayer.nextVideo();
        else ytPlayer.previousVideo();
        window.setTimeout(() => {
          const idx = ytPlayer.getPlaylistIndex?.();
          if (typeof idx === 'number' && idx >= 0) {
            selecionarAula(idx, { skipPlayer: true, silent: true });
          }
          navigatingProgrammatically = false;
        }, 400);
      } catch {
        navigatingProgrammatically = false;
      }
    }
  }

  function atualizarInterfaceAula(index) {
    const lesson = activeLessons[index] || currentLesson();
    const total = activeLessons.length || activeCourse?.videoCount || '?';

    if (els.courseTitle) els.courseTitle.textContent = activeCourse?.title || 'Curso';
    if (els.courseDescription) {
      els.courseDescription.textContent =
        activeCourse?.description ||
        'Assista pelas setas do Skill Tube para manter a interface sincronizada.';
    }
    if (els.lessonTitle) els.lessonTitle.textContent = lesson.title;
    if (els.lessonDescription) els.lessonDescription.textContent = lesson.description;
    if (els.lessonIndicator) {
      els.lessonIndicator.textContent =
        typeof total === 'number' ? `Aula ${index + 1} de ${total}` : `Aula ${index + 1}`;
    }
    if (els.activeCourseLabel) els.activeCourseLabel.textContent = activeCourse?.title || '';

    atualizarControlesNavegacao(index);
    updateCompleteButton(index);
    updateFavoriteButton(index);
    renderLessonList();
    updateProgressUI();
  }

  function atualizarControlesNavegacao(index) {
    const total = activeLessons.length;
    const atStart = index <= 0;
    const atEnd = total ? index >= total - 1 : false;

    [els.btnPrev, els.playerPrev].forEach((btn) => {
      if (btn) btn.disabled = atStart;
    });
    [els.btnNext, els.playerNext].forEach((btn) => {
      if (btn) btn.disabled = total ? atEnd : false;
    });
  }

  /* ---------- Progresso / favoritos ---------- */

  function getProgress() {
    const rec = getProgressRecord(activeCourse?.playlistId);
    const total = activeLessons.length || activeCourse?.videoCount || 0;
    const done = (rec.completed || []).filter((i) => i >= 0 && (!total || i < total)).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, percent };
  }

  function isCompleted(index) {
    return getProgressRecord(activeCourse.playlistId).completed.includes(index);
  }

  function isFavorite(index) {
    return getProgressRecord(activeCourse.playlistId).favorites.includes(index);
  }

  function toggleComplete() {
    const rec = getProgressRecord(activeCourse.playlistId);
    if (rec.completed.includes(currentIndex)) {
      rec.completed = rec.completed.filter((i) => i !== currentIndex);
      showToast('Marcação de conclusão removida');
    } else {
      rec.completed = [...rec.completed, currentIndex];
      showToast('Aula marcada como concluída');
    }
    persistProgress();
    updateCompleteButton(currentIndex);
    renderLessonList();
    updateProgressUI();
    renderHomeLessons();
    renderContinue();
    renderLibrary();
  }

  function toggleFavorite() {
    const rec = getProgressRecord(activeCourse.playlistId);
    if (rec.favorites.includes(currentIndex)) {
      rec.favorites = rec.favorites.filter((i) => i !== currentIndex);
      showToast('Removido dos favoritos');
    } else {
      rec.favorites = [...rec.favorites, currentIndex];
      showToast('Adicionado aos favoritos');
    }
    persistProgress();
    updateFavoriteButton(currentIndex);
    renderLessonList();
    renderHomeLessons();
    renderFavorites();
  }

  function updateCompleteButton(index) {
    if (!els.btnComplete) return;
    const done = isCompleted(index);
    els.btnComplete.setAttribute('aria-pressed', String(done));
    els.btnComplete.classList.toggle('is-done', done);
    els.btnComplete.innerHTML = done
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Concluída`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg> Marcar como concluída`;
  }

  function updateFavoriteButton(index) {
    if (!els.btnFavorite) return;
    const fav = isFavorite(index);
    els.btnFavorite.setAttribute('aria-pressed', String(fav));
    els.btnFavorite.classList.toggle('is-fav', fav);
    els.btnFavorite.innerHTML = fav
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> Favorito`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> Favoritar`;
  }

  /* ---------- Views ---------- */

  function showView(view) {
    currentView = view;
    Object.entries(els.views).forEach(([name, el]) => {
      if (!el) return;
      const active = name === view;
      el.hidden = !active;
      el.classList.toggle('is-active', active);
    });

    document.querySelectorAll('[data-nav]').forEach((btn) => {
      const nav = btn.getAttribute('data-nav');
      btn.classList.toggle('is-active', nav === view);
      btn.setAttribute('aria-current', nav === view ? 'page' : 'false');
    });

    if (view === 'home') renderHome();
    if (view === 'library') renderLibrary();
    if (view === 'favorites') renderFavorites();
    if (view === 'import') clearImportStatus();
    if (view === 'course') {
      atualizarInterfaceAula(currentIndex);
      ensurePlaylistPlayer();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showPlayerFallback() {
    if (els.playerFallback) els.playerFallback.hidden = false;
  }

  function hidePlayerFallback() {
    if (els.playerFallback) els.playerFallback.hidden = true;
  }

  /* ---------- Render ---------- */

  function renderAll() {
    updateProgressUI();
    renderHome();
    renderLibrary();
    renderFavorites();
  }

  function updateProgressUI() {
    const { done, total, percent } = getProgress();
    const label = `${percent}% concluído`;
    const detail = total ? `${done} de ${total} aulas` : `${done} concluída(s)`;

    if (els.headerProgressFill) {
      els.headerProgressFill.style.width = `${percent}%`;
      els.headerProgressFill.parentElement?.setAttribute('aria-valuenow', String(percent));
    }
    if (els.headerProgressText) els.headerProgressText.textContent = label;
    if (els.homeProgressFill) {
      els.homeProgressFill.style.width = `${percent}%`;
      els.homeProgressFill.parentElement?.setAttribute('aria-valuenow', String(percent));
    }
    if (els.homeProgressText) els.homeProgressText.textContent = detail;
    if (els.homeProgressPercent) els.homeProgressPercent.textContent = `${percent}%`;
    if (els.courseProgressFill) {
      els.courseProgressFill.style.width = `${percent}%`;
      els.courseProgressFill.parentElement?.setAttribute('aria-valuenow', String(percent));
    }
    if (els.courseProgressText) {
      els.courseProgressText.textContent = `${detail} · ${percent}%`;
    }
  }

  function renderHome() {
    renderHomeLibrary();
    renderHomeLessons();
    renderContinue();
    updateProgressUI();
  }

  function courseProgress(playlistId) {
    const course = library.find((c) => c.playlistId === playlistId);
    const rec = getProgressRecord(playlistId);
    const total = course?.videoCount || course?.lessons?.length || 0;
    const done = (rec.completed || []).filter((i) => i >= 0 && (!total || i < total)).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, percent };
  }

  function libraryCardHtml(course) {
    const { percent, done, total } = courseProgress(course.playlistId);
    const thumb =
      getThumbnailUrl(course.thumbnailVideoId) ||
      getThumbnailUrl(course.lessons?.[0]?.youtubeVideoId);
    const thumbHtml = thumb
      ? `<img src="${thumb}" alt="" width="480" height="270" loading="lazy">`
      : `<div class="card-thumb-placeholder" aria-hidden="true">▶</div>`;

    return `
      <article class="library-card">
        <button type="button" class="library-card__media" data-open-course="${escapeAttr(course.playlistId)}" aria-label="Abrir ${escapeAttr(course.title)}">
          ${thumbHtml}
          ${course.isDefault ? '<span class="badge badge--featured">Oficial</span>' : ''}
        </button>
        <div class="library-card__body">
          <h3 class="library-card__title">${escapeHtml(course.title)}</h3>
          <p class="library-card__meta">${total ? `${total} aulas` : 'Playlist YouTube'} · ${percent}% concluído</p>
          <div class="progress-bar library-card__progress" aria-hidden="true">
            <div class="progress-bar__fill" style="width:${percent}%"></div>
          </div>
          <div class="library-card__actions">
            <button type="button" class="btn btn--primary btn--sm" data-open-course="${escapeAttr(course.playlistId)}">Abrir</button>
            ${
              course.isDefault
                ? ''
                : `<button type="button" class="btn btn--ghost btn--sm" data-remove-course="${escapeAttr(course.playlistId)}">Remover</button>`
            }
          </div>
          <p class="sr-only">${done} de ${total || '?'} concluídas</p>
        </div>
      </article>
    `;
  }

  function bindLibraryCards(root) {
    root?.querySelectorAll('[data-open-course]').forEach((btn) => {
      btn.addEventListener('click', () => openCourseByPlaylistId(btn.getAttribute('data-open-course')));
    });
    root?.querySelectorAll('[data-remove-course]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCourse(btn.getAttribute('data-remove-course'));
      });
    });
  }

  function renderHomeLibrary() {
    if (!els.homeLibraryGrid) return;
    els.homeLibraryGrid.innerHTML = library.map(libraryCardHtml).join('');
    bindLibraryCards(els.homeLibraryGrid);
  }

  function renderLibrary() {
    if (!els.libraryGrid) return;
    if (els.libraryEmpty) els.libraryEmpty.hidden = library.length > 0;
    els.libraryGrid.innerHTML = library.map(libraryCardHtml).join('');
    bindLibraryCards(els.libraryGrid);
  }

  function renderHomeLessons() {
    if (!els.lessonCards) return;
    const lessons = activeLessons.length ? activeLessons : [];
    const filtered = lessons.filter((lesson) =>
      lesson.title.toLowerCase().includes(searchQuery)
    );

    if (els.searchResults) els.searchResults.hidden = !searchQuery;
    if (els.searchEmpty) {
      els.searchEmpty.hidden = !(searchQuery && filtered.length === 0);
    }

    if (!lessons.length) {
      els.lessonCards.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          Abra um curso para listar as aulas. Em playlists importadas, a lista aparece após o player carregar.
        </div>`;
      return;
    }

    if (searchQuery && filtered.length === 0) {
      els.lessonCards.innerHTML = '';
      return;
    }

    const list = searchQuery ? filtered : lessons;
    const total = lessons.length;
    els.lessonCards.innerHTML = list
      .map((lesson) => {
        const index = lesson.playlistIndex ?? lesson.order - 1;
        const done = isCompleted(index);
        const fav = isFavorite(index);
        const thumb = getThumbnailUrl(lesson.youtubeVideoId || activeCourse?.thumbnailVideoId);
        const thumbHtml = thumb
          ? `<img src="${thumb}" alt="Miniatura de ${escapeHtml(lesson.title)}" loading="lazy" width="480" height="360">`
          : `<div class="card-thumb-placeholder" aria-hidden="true">${lesson.order}</div>`;

        return `
          <article class="lesson-card ${done ? 'is-completed' : ''}">
            <button type="button" class="lesson-card__media" data-open-index="${index}" aria-label="Abrir ${escapeHtml(lesson.title)}">
              ${thumbHtml}
              <span class="lesson-card__play" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </span>
              ${done ? '<span class="badge badge--done">Concluída</span>' : ''}
            </button>
            <div class="lesson-card__body">
              <p class="lesson-card__meta">Aula ${lesson.order} de ${total}</p>
              <h3 class="lesson-card__title">${escapeHtml(lesson.title)}</h3>
              <p class="lesson-card__desc">${escapeHtml(lesson.description)}</p>
              <div class="lesson-card__actions">
                <button type="button" class="btn btn--primary btn--sm" data-open-index="${index}">Assistir</button>
                <button type="button" class="btn btn--ghost btn--sm ${fav ? 'is-fav' : ''}" data-fav-index="${index}" aria-pressed="${fav}">
                  ${fav ? 'Favorito' : 'Favoritar'}
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    els.lessonCards.querySelectorAll('[data-open-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentIndex = Number(btn.getAttribute('data-open-index'));
        persistProgress();
        showView('course');
        selecionarAula(currentIndex, { silent: true });
      });
    });

    els.lessonCards.querySelectorAll('[data-fav-index]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-fav-index'));
        const rec = getProgressRecord(activeCourse.playlistId);
        if (rec.favorites.includes(idx)) {
          rec.favorites = rec.favorites.filter((i) => i !== idx);
        } else {
          rec.favorites = [...rec.favorites, idx];
        }
        persistProgress();
        renderHomeLessons();
        renderFavorites();
      });
    });
  }

  function renderContinue() {
    if (!els.continueSection || !els.continueCard || !activeCourse) return;
    const lesson = currentLesson();
    const { percent } = getProgress();
    const thumb = getThumbnailUrl(lesson.youtubeVideoId || activeCourse.thumbnailVideoId);

    els.continueSection.hidden = false;
    els.continueCard.innerHTML = `
      <div class="continue-card__thumb">
        ${
          thumb
            ? `<img src="${thumb}" alt="" width="320" height="180">`
            : `<div class="card-thumb-placeholder">${lesson.order}</div>`
        }
      </div>
      <div class="continue-card__content">
        <p class="eyebrow">${percent === 100 ? 'Curso concluído' : 'Continue de onde parou'}</p>
        <h3>${escapeHtml(activeCourse.title)}</h3>
        <p>${escapeHtml(lesson.title)} · Aula ${currentIndex + 1}${
          activeLessons.length ? ` de ${activeLessons.length}` : ''
        }</p>
        <button type="button" class="btn btn--primary" id="btn-resume">Retomar</button>
      </div>
    `;
    document.getElementById('btn-resume')?.addEventListener('click', () => openActiveCourse());
  }

  function renderLessonList() {
    if (!els.lessonList) return;

    if (!activeLessons.length) {
      els.lessonList.innerHTML = `
        <li class="lesson-list__hint">A lista de aulas será preenchida quando o player carregar a playlist.</li>
      `;
      return;
    }

    els.lessonList.innerHTML = activeLessons
      .map((lesson, index) => {
        const active = index === currentIndex;
        const done = isCompleted(index);
        const fav = isFavorite(index);
        return `
          <li>
            <button type="button"
              class="lesson-list__item ${active ? 'is-active' : ''} ${done ? 'is-completed' : ''}"
              data-select-index="${index}"
              aria-current="${active ? 'true' : 'false'}">
              <span class="lesson-list__index" aria-hidden="true">${done ? '✓' : lesson.order}</span>
              <span class="lesson-list__info">
                <span class="lesson-list__title">${escapeHtml(lesson.title)}</span>
                <span class="lesson-list__meta">Aula ${lesson.order}${fav ? ' · ★' : ''}</span>
              </span>
            </button>
          </li>
        `;
      })
      .join('');

    els.lessonList.querySelectorAll('[data-select-index]').forEach((btn) => {
      btn.addEventListener('click', () => selecionarAula(Number(btn.getAttribute('data-select-index'))));
    });
  }

  function renderFavorites() {
    if (!els.favoritesList || !els.favoritesEmpty) return;

    const items = [];
    library.forEach((course) => {
      const rec = getProgressRecord(course.playlistId);
      (rec.favorites || []).forEach((index) => {
        const lesson = course.lessons?.[index];
        items.push({
          course,
          index,
          title: lesson?.title || `Aula ${index + 1}`,
          thumb: getThumbnailUrl(lesson?.youtubeVideoId || course.thumbnailVideoId),
        });
      });
    });

    if (!items.length) {
      els.favoritesEmpty.hidden = false;
      els.favoritesList.innerHTML = '';
      return;
    }

    els.favoritesEmpty.hidden = true;
    els.favoritesList.innerHTML = items
      .map(
        (item) => `
        <article class="lesson-card">
          <button type="button" class="lesson-card__media" data-fav-open="${escapeAttr(item.course.playlistId)}" data-fav-index="${item.index}">
            ${
              item.thumb
                ? `<img src="${item.thumb}" alt="" loading="lazy" width="480" height="360">`
                : `<div class="card-thumb-placeholder">${item.index + 1}</div>`
            }
          </button>
          <div class="lesson-card__body">
            <p class="lesson-card__meta">${escapeHtml(item.course.title)}</p>
            <h3 class="lesson-card__title">${escapeHtml(item.title)}</h3>
            <button type="button" class="btn btn--primary btn--sm" data-fav-open="${escapeAttr(item.course.playlistId)}" data-fav-index="${item.index}">Assistir</button>
          </div>
        </article>
      `
      )
      .join('');

    els.favoritesList.querySelectorAll('[data-fav-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.getAttribute('data-fav-open');
        const idx = Number(btn.getAttribute('data-fav-index'));
        openCourseByPlaylistId(pid);
        selecionarAula(idx, { silent: true });
      });
    });
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  window.SkillTubeApp = {
    openActiveCourse,
    openCourseByPlaylistId,
    selecionarAula,
    navegarAula,
    showPlayerFallback,
  };
})();
