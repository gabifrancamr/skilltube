/**
 * Skill Tube — Lógica da aplicação
 * Progresso e favoritos em localStorage.
 * Navegação central: selecionarAula(indice).
 */

(() => {
  'use strict';

  const STORAGE_KEYS = {
    completed: 'skilltube_completed',
    favorites: 'skilltube_favorites',
    lastLesson: 'skilltube_last_lesson',
  };

  const {
    course,
    getEmbedUrl,
    getWatchUrl,
    getThumbnailUrl,
    getLessonByVideoId,
  } = window.SkillTubeData;

  /** @type {string[]} */
  let completedIds = loadJson(STORAGE_KEYS.completed, []);
  /** @type {string[]} */
  let favoriteIds = loadJson(STORAGE_KEYS.favorites, []);
  /** @type {string|null} */
  let currentLessonId = loadJson(STORAGE_KEYS.lastLesson, course.lessons[0].id);
  let currentView = 'home';
  let searchQuery = '';

  /** @type {YT.Player|null} */
  let ytPlayer = null;
  let ytApiRequested = false;
  let ytApiReady = false;
  let loadedVideoId = null;
  let syncingFromPlayer = false;

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    requestYouTubeApi();
    renderAll();
    showView('home');
  }

  function cacheElements() {
    els.navToggle = document.getElementById('nav-toggle');
    els.navMenu = document.getElementById('nav-menu');
    els.searchInput = document.getElementById('search-input');
    els.searchClear = document.getElementById('search-clear');
    els.headerProgressFill = document.getElementById('header-progress-fill');
    els.headerProgressText = document.getElementById('header-progress-text');
    els.views = {
      home: document.getElementById('view-home'),
      course: document.getElementById('view-course'),
      favorites: document.getElementById('view-favorites'),
    };
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
    els.lessonList = document.getElementById('lesson-list');
    els.playerHost = document.getElementById('player-host');
    els.playerFrame = document.getElementById('player-frame');
    els.playerFallback = document.getElementById('player-fallback');
    els.playerFallbackLink = document.getElementById('player-fallback-link');
    els.playerPrev = document.getElementById('player-prev');
    els.playerNext = document.getElementById('player-next');
    els.lessonTitle = document.getElementById('lesson-title');
    els.lessonDescription = document.getElementById('lesson-description');
    els.lessonIndicator = document.getElementById('lesson-indicator');
    els.courseProgressFill = document.getElementById('course-progress-fill');
    els.courseProgressText = document.getElementById('course-progress-text');
    els.btnPrev = document.getElementById('btn-prev');
    els.btnNext = document.getElementById('btn-next');
    els.btnComplete = document.getElementById('btn-complete');
    els.btnFavorite = document.getElementById('btn-favorite');
    els.favoritesList = document.getElementById('favorites-list');
    els.favoritesEmpty = document.getElementById('favorites-empty');
    els.toast = document.getElementById('toast');
  }

  function bindEvents() {
    els.navToggle?.addEventListener('click', () => {
      const open = els.navMenu.classList.toggle('is-open');
      els.navToggle.setAttribute('aria-expanded', String(open));
    });

    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-nav');
        if (view === 'course') openCourse();
        else showView(view);
        closeMobileNav();
      });
    });

    els.btnContinue?.addEventListener('click', () => openCourse(currentLessonId));
    els.btnOpenCourse?.addEventListener('click', () => openCourse());

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

    // Todos os controles usam a mesma navegação central
    els.btnPrev?.addEventListener('click', () => navegarAula(-1));
    els.btnNext?.addEventListener('click', () => navegarAula(1));
    els.playerPrev?.addEventListener('click', () => navegarAula(-1));
    els.playerNext?.addEventListener('click', () => navegarAula(1));
    els.btnComplete?.addEventListener('click', toggleComplete);
    els.btnFavorite?.addEventListener('click', toggleFavorite);

    els.playerFrame?.addEventListener('error', showPlayerFallback);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
    });
  }

  function closeMobileNav() {
    els.navMenu?.classList.remove('is-open');
    els.navToggle?.setAttribute('aria-expanded', 'false');
  }

  /* ---------- YouTube IFrame API ---------- */

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
      if (currentView === 'course') {
        carregarPlayer(getLesson(currentLessonId));
      }
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
    loadedVideoId = null;

    if (els.playerHost && !document.getElementById('player-frame')) {
      els.playerHost.innerHTML = `
        <iframe
          id="player-frame"
          title="Player de videoaula do YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      `;
      els.playerFrame = document.getElementById('player-frame');
    }
  }

  function carregarPlayer(lesson) {
    hidePlayerFallback();

    if (els.playerFallbackLink) {
      els.playerFallbackLink.href = getWatchUrl(lesson);
    }

    if (!lesson?.youtubeVideoId) {
      showPlayerFallback();
      return;
    }

    if (ytApiReady && window.YT && window.YT.Player) {
      if (!ytPlayer) {
        // Garante um elemento alvo limpo para a API
        if (!document.getElementById('player-frame') && els.playerHost) {
          els.playerHost.innerHTML = '<div id="player-frame"></div>';
        }

        ytPlayer = new window.YT.Player('player-frame', {
          width: '100%',
          height: '100%',
          videoId: lesson.youtubeVideoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              loadedVideoId = lesson.youtubeVideoId;
              hidePlayerFallback();
            },
            onError: () => showPlayerFallback(),
            onStateChange: onPlayerStateChange,
          },
        });
        loadedVideoId = lesson.youtubeVideoId;
        return;
      }

      if (loadedVideoId === lesson.youtubeVideoId) return;

      try {
        ytPlayer.cueVideoById(lesson.youtubeVideoId);
        loadedVideoId = lesson.youtubeVideoId;
      } catch {
        destruirPlayer();
        carregarPlayer(lesson);
      }
      return;
    }

    // Fallback sem API: iframe direto com ID real
    if (!els.playerFrame && els.playerHost) {
      els.playerHost.innerHTML = `
        <iframe
          id="player-frame"
          title="Player: ${escapeHtml(lesson.title)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      `;
      els.playerFrame = document.getElementById('player-frame');
    }

    if (!els.playerFrame) return;
    if (loadedVideoId === lesson.youtubeVideoId && els.playerFrame.src.includes(lesson.youtubeVideoId)) {
      return;
    }

    els.playerFrame.title = `Player: ${lesson.title}`;
    els.playerFrame.src = getEmbedUrl(lesson);
    loadedVideoId = lesson.youtubeVideoId;
  }

  function onPlayerStateChange(event) {
    if (syncingFromPlayer) return;
    if (!ytPlayer || typeof ytPlayer.getVideoData !== 'function') return;

    try {
      const data = ytPlayer.getVideoData();
      const videoId = data && data.video_id;
      if (!videoId) return;

      const lesson = getLessonByVideoId(videoId);
      if (!lesson) return;
      if (lesson.id === currentLessonId) {
        loadedVideoId = videoId;
        return;
      }

      // Se o vídeo no player mudou (ex.: controle nativo), sincroniza a UI
      syncingFromPlayer = true;
      selecionarAula(lesson.order - 1, { skipPlayer: true, silent: true });
      loadedVideoId = videoId;
      syncingFromPlayer = false;
    } catch {
      syncingFromPlayer = false;
    }
  }

  /* ---------- Storage ---------- */

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

  function persist() {
    saveJson(STORAGE_KEYS.completed, completedIds);
    saveJson(STORAGE_KEYS.favorites, favoriteIds);
    saveJson(STORAGE_KEYS.lastLesson, currentLessonId);
  }

  /* ---------- Progress helpers ---------- */

  function getProgress() {
    const total = course.lessons.length;
    const done = completedIds.filter((id) =>
      course.lessons.some((l) => l.id === id)
    ).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, percent };
  }

  function isCompleted(id) {
    return completedIds.includes(id);
  }

  function isFavorite(id) {
    return favoriteIds.includes(id);
  }

  function getLesson(id) {
    return course.lessons.find((l) => l.id === id) || course.lessons[0];
  }

  function getLessonIndex(id) {
    return course.lessons.findIndex((l) => l.id === id);
  }

  /* ---------- Navegação central ---------- */

  /**
   * Função central de troca de aula.
   * @param {number} indice - índice 0-based na lista de aulas
   * @param {{ skipPlayer?: boolean, silent?: boolean }} [options]
   */
  function selecionarAula(indice, options = {}) {
    const { skipPlayer = false, silent = false } = options;

    if (!Number.isInteger(indice) || indice < 0 || indice >= course.lessons.length) {
      return;
    }

    const lesson = course.lessons[indice];
    currentLessonId = lesson.id;
    persist();

    atualizarInterfaceAula(lesson, indice);

    if (!skipPlayer) {
      carregarPlayer(lesson);
    }

    if (!silent) {
      showToast(`Exibindo ${lesson.title}`);
    }
  }

  function navegarAula(delta) {
    const index = getLessonIndex(currentLessonId);
    selecionarAula(index + delta);
  }

  function atualizarInterfaceAula(lesson, index) {
    if (els.lessonTitle) els.lessonTitle.textContent = lesson.title;
    if (els.lessonDescription) els.lessonDescription.textContent = lesson.description;
    if (els.lessonIndicator) {
      els.lessonIndicator.textContent = `Aula ${lesson.order} de ${course.totalLessons}`;
    }

    atualizarControlesNavegacao(index);
    updateCompleteButton(lesson.id);
    updateFavoriteButton(lesson.id);
    renderLessonList();
    updateProgressUI();
  }

  function atualizarControlesNavegacao(index) {
    const atStart = index <= 0;
    const atEnd = index >= course.lessons.length - 1;

    if (els.btnPrev) els.btnPrev.disabled = atStart;
    if (els.btnNext) els.btnNext.disabled = atEnd;
    if (els.playerPrev) els.playerPrev.disabled = atStart;
    if (els.playerNext) els.playerNext.disabled = atEnd;
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
      btn.classList.toggle('is-active', btn.getAttribute('data-nav') === view);
      btn.setAttribute(
        'aria-current',
        btn.getAttribute('data-nav') === view ? 'page' : 'false'
      );
    });

    if (view === 'favorites') renderFavorites();
    if (view === 'home') renderHome();
    if (view === 'course') {
      const index = getLessonIndex(currentLessonId);
      selecionarAula(index < 0 ? 0 : index, { silent: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openCourse(lessonId) {
    if (lessonId) currentLessonId = lessonId;
    else if (!course.lessons.some((l) => l.id === currentLessonId)) {
      currentLessonId = course.lessons[0].id;
    }
    persist();
    showView('course');
  }

  /* ---------- Render ---------- */

  function renderAll() {
    updateProgressUI();
    renderHome();
    renderFavorites();
    // Curso é renderizado ao abrir a view (selecionarAula)
    const index = getLessonIndex(currentLessonId);
    if (index >= 0) {
      atualizarInterfaceAula(course.lessons[index], index);
    }
  }

  function updateProgressUI() {
    const { done, total, percent } = getProgress();
    const label = `${percent}% concluído`;
    const detail = `${done} de ${total} aulas`;

    if (els.headerProgressFill) {
      els.headerProgressFill.style.width = `${percent}%`;
      const bar = els.headerProgressFill.parentElement;
      if (bar) bar.setAttribute('aria-valuenow', String(percent));
    }
    if (els.headerProgressText) els.headerProgressText.textContent = label;

    if (els.homeProgressFill) {
      els.homeProgressFill.style.width = `${percent}%`;
      const bar = els.homeProgressFill.parentElement;
      if (bar) bar.setAttribute('aria-valuenow', String(percent));
    }
    if (els.homeProgressText) els.homeProgressText.textContent = detail;
    if (els.homeProgressPercent) els.homeProgressPercent.textContent = `${percent}%`;

    if (els.courseProgressFill) {
      els.courseProgressFill.style.width = `${percent}%`;
      const bar = els.courseProgressFill.parentElement;
      if (bar) bar.setAttribute('aria-valuenow', String(percent));
    }
    if (els.courseProgressText) {
      els.courseProgressText.textContent = `${detail} · ${percent}%`;
    }
  }

  function renderHome() {
    renderHomeLessons();
    renderContinue();
    updateProgressUI();
  }

  function renderHomeLessons() {
    const filtered = course.lessons.filter((lesson) =>
      lesson.title.toLowerCase().includes(searchQuery)
    );

    if (els.searchResults) els.searchResults.hidden = !searchQuery;
    if (els.searchEmpty) {
      els.searchEmpty.hidden = !(searchQuery && filtered.length === 0);
    }
    if (!els.lessonCards) return;

    if (searchQuery && filtered.length === 0) {
      els.lessonCards.innerHTML = '';
      return;
    }

    const list = searchQuery ? filtered : course.lessons;
    els.lessonCards.innerHTML = list.map((lesson) => lessonCardHtml(lesson)).join('');

    els.lessonCards.querySelectorAll('[data-open-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => openCourse(btn.getAttribute('data-open-lesson')));
    });

    els.lessonCards.querySelectorAll('[data-fav-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoriteById(btn.getAttribute('data-fav-toggle'));
        renderHomeLessons();
        renderFavorites();
      });
    });
  }

  function lessonCardHtml(lesson) {
    const done = isCompleted(lesson.id);
    const fav = isFavorite(lesson.id);
    const thumb = getThumbnailUrl(lesson);
    const thumbHtml = `<img src="${thumb}" alt="Miniatura de ${escapeHtml(lesson.title)}" loading="lazy" width="480" height="360">`;

    return `
      <article class="lesson-card ${done ? 'is-completed' : ''}">
        <button type="button" class="lesson-card__media" data-open-lesson="${lesson.id}" aria-label="Abrir ${escapeHtml(lesson.title)}">
          ${thumbHtml}
          <span class="lesson-card__play" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </span>
          ${done ? '<span class="badge badge--done">Concluída</span>' : ''}
        </button>
        <div class="lesson-card__body">
          <p class="lesson-card__meta">Aula ${lesson.order} de ${course.totalLessons}</p>
          <h3 class="lesson-card__title">${escapeHtml(lesson.title)}</h3>
          <p class="lesson-card__desc">${escapeHtml(lesson.description)}</p>
          <div class="lesson-card__actions">
            <button type="button" class="btn btn--primary btn--sm" data-open-lesson="${lesson.id}">Assistir</button>
            <button type="button" class="btn btn--ghost btn--sm ${fav ? 'is-fav' : ''}" data-fav-toggle="${lesson.id}" aria-pressed="${fav}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              ${fav ? 'Favorito' : 'Favoritar'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderContinue() {
    const lesson = getLesson(currentLessonId);
    const { percent } = getProgress();

    if (!els.continueSection || !els.continueCard) return;

    if (percent === 100) {
      els.continueSection.hidden = false;
      els.continueCard.innerHTML = `
        <div class="continue-card__content">
          <p class="eyebrow">Parabéns</p>
          <h3>Você concluiu todas as aulas</h3>
          <p>Revise o conteúdo ou assista novamente quando quiser.</p>
          <button type="button" class="btn btn--primary" id="btn-review">Revisar curso</button>
        </div>
      `;
      document.getElementById('btn-review')?.addEventListener('click', () => openCourse(course.lessons[0].id));
      return;
    }

    els.continueSection.hidden = false;
    const thumb = getThumbnailUrl(lesson);
    els.continueCard.innerHTML = `
      <div class="continue-card__thumb">
        <img src="${thumb}" alt="" width="320" height="180">
      </div>
      <div class="continue-card__content">
        <p class="eyebrow">Continue de onde parou</p>
        <h3>${escapeHtml(lesson.title)}</h3>
        <p>Aula ${lesson.order} de ${course.totalLessons}${isCompleted(lesson.id) ? ' · já marcada como concluída' : ''}</p>
        <button type="button" class="btn btn--primary" id="btn-resume">Retomar aula</button>
      </div>
    `;
    document.getElementById('btn-resume')?.addEventListener('click', () => openCourse(lesson.id));
  }

  function showPlayerFallback() {
    if (els.playerFallback) els.playerFallback.hidden = false;
  }

  function hidePlayerFallback() {
    if (els.playerFallback) els.playerFallback.hidden = true;
  }

  function renderLessonList() {
    if (!els.lessonList) return;

    els.lessonList.innerHTML = course.lessons
      .map((lesson, index) => {
        const active = lesson.id === currentLessonId;
        const done = isCompleted(lesson.id);
        const fav = isFavorite(lesson.id);
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
      btn.addEventListener('click', () => {
        selecionarAula(Number(btn.getAttribute('data-select-index')));
      });
    });
  }

  function toggleComplete() {
    toggleCompleteById(currentLessonId);
    updateCompleteButton(currentLessonId);
    renderLessonList();
    updateProgressUI();
    renderHomeLessons();
    renderContinue();
  }

  function toggleCompleteById(id) {
    if (isCompleted(id)) {
      completedIds = completedIds.filter((x) => x !== id);
      showToast('Marcação de conclusão removida');
    } else {
      completedIds = [...completedIds, id];
      showToast('Aula marcada como concluída');
    }
    persist();
  }

  function updateCompleteButton(id) {
    if (!els.btnComplete) return;
    const done = isCompleted(id);
    els.btnComplete.setAttribute('aria-pressed', String(done));
    els.btnComplete.classList.toggle('is-done', done);
    els.btnComplete.innerHTML = done
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Concluída`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg> Marcar como concluída`;
  }

  function toggleFavorite() {
    toggleFavoriteById(currentLessonId);
    updateFavoriteButton(currentLessonId);
    renderLessonList();
    renderHomeLessons();
    renderFavorites();
  }

  function toggleFavoriteById(id) {
    if (isFavorite(id)) {
      favoriteIds = favoriteIds.filter((x) => x !== id);
      showToast('Removido dos favoritos');
    } else {
      favoriteIds = [...favoriteIds, id];
      showToast('Adicionado aos favoritos');
    }
    persist();
  }

  function updateFavoriteButton(id) {
    if (!els.btnFavorite) return;
    const fav = isFavorite(id);
    els.btnFavorite.setAttribute('aria-pressed', String(fav));
    els.btnFavorite.classList.toggle('is-fav', fav);
    els.btnFavorite.innerHTML = fav
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> Favorito`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> Favoritar`;
  }

  function renderFavorites() {
    if (!els.favoritesList || !els.favoritesEmpty) return;

    const favLessons = course.lessons.filter((l) => isFavorite(l.id));

    if (favLessons.length === 0) {
      els.favoritesEmpty.hidden = false;
      els.favoritesList.innerHTML = '';
      return;
    }

    els.favoritesEmpty.hidden = true;
    els.favoritesList.innerHTML = favLessons.map((lesson) => lessonCardHtml(lesson)).join('');

    els.favoritesList.querySelectorAll('[data-open-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => openCourse(btn.getAttribute('data-open-lesson')));
    });

    els.favoritesList.querySelectorAll('[data-fav-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoriteById(btn.getAttribute('data-fav-toggle'));
        renderFavorites();
        renderHomeLessons();
        if (currentView === 'course') {
          updateFavoriteButton(currentLessonId);
          renderLessonList();
        }
      });
    });
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, 2400);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.SkillTubeApp = {
    openCourse,
    selecionarAula,
    navegarAula,
    showPlayerFallback,
  };
})();
