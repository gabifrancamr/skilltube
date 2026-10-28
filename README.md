https://gabifrancamr.github.io/skilltube/

# Skill Tube — Plataforma Educacional Web

Protótipo com HTML5, CSS3 e JavaScript (ES6+): assista à playlist de programação integrada, **importe playlists públicas do YouTube**, acompanhe progresso e favoritos no `localStorage` — sem build e sem npm.

## Como abrir / iniciar

1. Abra a pasta `EduPlay` no VS Code.
2. Use a extensão **Live Server** (ou outro servidor HTTP estático) e abra `index.html`.
3. **ATENÇÃO**: Evite abrir via `file://` — o player do YouTube pode falhar (erro 153 / restrições de embed).

## Estrutura

```
EduPlay/
├── index.html
├── css/style.css
├── js/
│   ├── app.js        # Biblioteca, importação, player, progresso
│   └── courses.js    # Curso padrão + parse de URLs de playlist
├── assets/images/
└── README.md
```

## Importar playlist

1. Menu **Importar** (ou botão na home).
2. Cole um link válido, por exemplo:
   - `https://www.youtube.com/playlist?list=PLAYLIST_ID`
   - `https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID`
   - `https://www.youtube.com/embed/videoseries?list=PLAYLIST_ID`
3. (Opcional) informe um nome para o curso.
4. Clique em **Adicionar playlist**.

Validação: usa a classe `URL` do JavaScript, aceita apenas hosts do YouTube e exige o parâmetro `list`. O parâmetro `index` **não** é usado como identificador.

Reprodução: `https://www.youtube.com/embed/videoseries?list=PLAYLIST_ID` via **YouTube IFrame Player API** (`listType: 'playlist'`), com navegação por `playVideoAt` / `nextVideo` / `previousVideo` e sincronização por `getPlaylistIndex` / `getPlaylist`.

## Biblioteca e persistência

| Chave | Conteúdo |
|-------|----------|
| `skilltube_library` | Playlists salvas (id, URL, título, data, aulas descobertas) |
| `skilltube_progress` | Progresso por playlist (`completed`, `favorites`, `lastIndex`) |
| `skilltube_active_playlist` | Playlist em estudo |

A playlist de programação oficial (`PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q`) entra automaticamente na biblioteca e **não pode ser removida**. Progresso antigo (`skilltube_completed` etc.) é migrado automaticamente.

Não há sincronização entre dispositivos ou contas — tudo é local ao navegador.

## Funcionalidades

- Importar / rejeitar links inválidos com mensagens claras
- Minhas playlists: abrir, continuar, remover (exceto a oficial), ver progresso
- Player responsivo + setas Skill Tube + lista lateral
- Sincronização quando o vídeo muda pelos controles do YouTube
- Marcar concluída, favoritos, pesquisa nas aulas do curso ativo
- Fallback com link “Abrir no YouTube” se o embed falhar
- Menu responsivo

## Como testar

1. Adicionar playlist com `watch?v=...&list=...`
2. Adicionar com `/playlist?list=...`
3. Rejeitar vídeo sem `list=`
4. Rejeitar link de outro site
5. Abrir playlist salva na biblioteca
6. Navegar com setas / lista / botões e conferir título + índice
7. Avançar pelos controles do YouTube e ver a UI sincronizar
8. Marcar conclusão, recarregar a página e conferir persistência
9. Remover uma playlist importada sem apagar as demais
10. Confirmar que a playlist de programação continua disponível
11. Testar fallback quando o embed falha (link para o YouTube)
12. Testar layout em desktop e mobile

## Licença

Protótipo educacional. Conteúdo dos vídeos pertence aos respectivos autores no YouTube.
