/**
 * Skill Tube — Dados do curso padrão + utilitários de playlist
 *
 * A playlist de programação integrada permanece disponível.
 * Novas playlists são adicionadas pelo usuário e salvas no localStorage (app.js).
 *
 * Metadados oficiais extras (títulos de playlists importadas) exigem
 * YouTube Data API v3 com chave — não usada no frontend por segurança.
 */

const DEFAULT_PLAYLIST_ID = 'PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q';
const DEFAULT_PLAYLIST_URL =
  'https://www.youtube.com/watch?v=G5OLtuHulhU&list=PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q';

/** @type {Array<{id:string,order:number,title:string,description:string,youtubeVideoId:string,playlistIndex:number}>} */
const defaultLessons = [
  {
    id: 'aula-1',
    order: 1,
    title: 'Aula 1',
    description: 'Primeira videoaula da playlist de programação do Skill Tube.',
    youtubeVideoId: 'G5OLtuHulhU',
    playlistIndex: 0,
  },
  {
    id: 'aula-2',
    order: 2,
    title: 'Aula 2',
    description: 'Segunda videoaula da playlist de programação.',
    youtubeVideoId: 'gdIpsayKz78',
    playlistIndex: 1,
  },
  {
    id: 'aula-3',
    order: 3,
    title: 'Aula 3',
    description: 'Terceira videoaula da playlist de programação.',
    youtubeVideoId: 'RtziM3qy8V4',
    playlistIndex: 2,
  },
  {
    id: 'aula-4',
    order: 4,
    title: 'Aula 4',
    description: 'Quarta videoaula da playlist de programação.',
    youtubeVideoId: 'VBAFQTXljxc',
    playlistIndex: 3,
  },
  {
    id: 'aula-5',
    order: 5,
    title: 'Aula 5',
    description: 'Quinta videoaula da playlist de programação.',
    youtubeVideoId: 'NcVeeaLXoAY',
    playlistIndex: 4,
  },
  {
    id: 'aula-6',
    order: 6,
    title: 'Aula 6',
    description: 'Sexta videoaula da playlist de programação.',
    youtubeVideoId: 'jf16-xhoTZE',
    playlistIndex: 5,
  },
];

const defaultCourse = {
  playlistId: DEFAULT_PLAYLIST_ID,
  sourceUrl: DEFAULT_PLAYLIST_URL,
  title: 'Programação — Playlist oficial',
  description:
    'Curso de programação baseado na playlist oficial do YouTube. Progresso e favoritos ficam neste navegador.',
  isDefault: true,
  thumbnailVideoId: 'G5OLtuHulhU',
  videoCount: defaultLessons.length,
  lessons: defaultLessons,
  addedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Extrai o ID de playlist de um link do YouTube.
 * @param {string} input
 * @returns {{ ok: true, playlistId: string, sourceUrl: string } | { ok: false, error: string }}
 */
function parsePlaylistUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return { ok: false, error: 'Cole o link de uma playlist pública do YouTube.' };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Endereço inválido. Use um link completo começando com https://.' };
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const allowed = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
  if (!allowed.includes(host)) {
    return { ok: false, error: 'Aceitamos apenas links do YouTube.' };
  }

  const listParam = url.searchParams.get('list');
  if (!listParam || !/^[\w-]+$/.test(listParam)) {
    return {
      ok: false,
      error:
        'Este link não contém uma playlist. Use um endereço com o parâmetro list= (ex.: /playlist?list=... ou watch?v=...&list=...).',
    };
  }

  // Rejeita mixes/rádios (RDxx) com aviso — ainda assim o ID é válido; permitimos, mas
  // playlists "normais" começam com PL, UU, FL, OL etc.
  const sourceUrl = `https://www.youtube.com/playlist?list=${listParam}`;

  return { ok: true, playlistId: listParam, sourceUrl };
}

function getPlaylistEmbedUrl(playlistId) {
  return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&rel=0&modestbranding=1&enablejsapi=1`;
}

function getPlaylistWatchUrl(playlistId, videoId) {
  if (videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&list=${encodeURIComponent(playlistId)}`;
  }
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

function getThumbnailUrl(videoId, quality = 'hqdefault') {
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Monta aulas genéricas a partir dos IDs retornados por player.getPlaylist().
 * Não inventa títulos oficiais.
 */
function buildLessonsFromVideoIds(videoIds, knownLessons) {
  const knownByVideo = new Map(
    (knownLessons || [])
      .filter((l) => l.youtubeVideoId)
      .map((l) => [l.youtubeVideoId, l])
  );

  return (videoIds || []).map((videoId, index) => {
    const known = knownByVideo.get(videoId);
    return {
      id: `aula-${index + 1}`,
      order: index + 1,
      title: known?.title || `Aula ${index + 1}`,
      description:
        known?.description ||
        'Videoaula da playlist importada. Títulos oficiais exigem YouTube Data API v3.',
      youtubeVideoId: videoId,
      playlistIndex: index,
    };
  });
}

/** Compat: mantém nomes antigos usados por versões anteriores. */
const course = {
  id: 'curso-playlist-skilltube',
  title: defaultCourse.title,
  subtitle: 'Playlist de programação',
  description: defaultCourse.description,
  playlistId: DEFAULT_PLAYLIST_ID,
  playlistUrl: DEFAULT_PLAYLIST_URL,
  thumbnailVideoId: 'G5OLtuHulhU',
  totalLessons: defaultLessons.length,
  lessons: defaultLessons,
};

window.SkillTubeData = {
  DEFAULT_PLAYLIST_ID,
  DEFAULT_PLAYLIST_URL,
  defaultCourse,
  defaultLessons,
  course,
  lessons: defaultLessons,
  parsePlaylistUrl,
  getPlaylistEmbedUrl,
  getPlaylistWatchUrl,
  getThumbnailUrl,
  buildLessonsFromVideoIds,
  getEmbedUrl(lesson) {
    return `https://www.youtube.com/embed/${lesson.youtubeVideoId}?rel=0&modestbranding=1&enablejsapi=1`;
  },
  getWatchUrl(lesson) {
    return getPlaylistWatchUrl(DEFAULT_PLAYLIST_ID, lesson.youtubeVideoId);
  },
  getLessonByVideoId(videoId) {
    return defaultLessons.find((l) => l.youtubeVideoId === videoId) || null;
  },
};
