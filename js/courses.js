/**
 * Skill Tube — Dados do curso
 *
 * IDs reais da playlist PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q.
 * Títulos oficiais ainda podem ser editados aqui quando disponíveis
 * (YouTube Data API v3). Até lá, usamos rótulos genéricos "Aula N".
 */

const PLAYLIST_ID = 'PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q';
const PLAYLIST_WATCH_URL =
  'https://www.youtube.com/watch?v=G5OLtuHulhU&list=PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q';

/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {number} order
 * @property {string} title
 * @property {string} description
 * @property {string} youtubeVideoId
 * @property {number} playlistIndex
 */

/** @type {Lesson[]} */
const lessons = [
  {
    id: 'aula-1',
    order: 1,
    title: 'Aula 1',
    description:
      'Primeira videoaula da playlist oficial. Assista pelo player da Skill Tube ou abra no YouTube.',
    youtubeVideoId: 'G5OLtuHulhU',
    playlistIndex: 1,
  },
  {
    id: 'aula-2',
    order: 2,
    title: 'Aula 2',
    description:
      'Segunda videoaula da playlist oficial. Use as setas da Skill Tube para navegar entre as aulas.',
    youtubeVideoId: 'gdIpsayKz78',
    playlistIndex: 2,
  },
  {
    id: 'aula-3',
    order: 3,
    title: 'Aula 3',
    description:
      'Terceira videoaula da playlist oficial. O progresso é marcado manualmente em cada aula.',
    youtubeVideoId: 'RtziM3qy8V4',
    playlistIndex: 3,
  },
  {
    id: 'aula-4',
    order: 4,
    title: 'Aula 4',
    description:
      'Quarta videoaula da playlist oficial. Favoritos e conclusão ficam salvos neste navegador.',
    youtubeVideoId: 'VBAFQTXljxc',
    playlistIndex: 4,
  },
  {
    id: 'aula-5',
    order: 5,
    title: 'Aula 5',
    description:
      'Quinta videoaula da playlist oficial. Continue de onde parou pela página inicial.',
    youtubeVideoId: 'NcVeeaLXoAY',
    playlistIndex: 5,
  },
  {
    id: 'aula-6',
    order: 6,
    title: 'Aula 6',
    description:
      'Sexta videoaula da playlist oficial. Última aula do curso nesta playlist.',
    youtubeVideoId: 'jf16-xhoTZE',
    playlistIndex: 6,
  },
];

const course = {
  id: 'curso-playlist-skilltube',
  title: 'Curso Skill Tube — Playlist Oficial',
  subtitle: 'Seis videoaulas hospedadas no YouTube',
  description:
    'Curso baseado na playlist oficial do YouTube. Cada aula usa o ID real do vídeo no player incorporado. Navegue pelas setas da Skill Tube para manter título, indicador e lista lateral sincronizados.',
  playlistId: PLAYLIST_ID,
  playlistUrl: PLAYLIST_WATCH_URL,
  thumbnailVideoId: 'G5OLtuHulhU',
  totalLessons: lessons.length,
  lessons,
};

/**
 * Embed por vídeo individual (sem list=) para evitar as setas nativas
 * da playlist do YouTube, que mudariam o vídeo sem atualizar a UI.
 */
function getEmbedUrl(lesson) {
  const id = lesson.youtubeVideoId;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1`;
}

function getWatchUrl(lesson) {
  return `https://www.youtube.com/watch?v=${lesson.youtubeVideoId}&list=${PLAYLIST_ID}&index=${lesson.playlistIndex}`;
}

function getThumbnailUrl(lesson, quality = 'hqdefault') {
  return `https://i.ytimg.com/vi/${lesson.youtubeVideoId}/${quality}.jpg`;
}

function getLessonByVideoId(videoId) {
  return lessons.find((l) => l.youtubeVideoId === videoId) || null;
}

window.SkillTubeData = {
  course,
  lessons,
  PLAYLIST_ID,
  PLAYLIST_WATCH_URL,
  getEmbedUrl,
  getWatchUrl,
  getThumbnailUrl,
  getLessonByVideoId,
};
