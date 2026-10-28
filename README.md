# Skill Tube — Plataforma Educacional Web

Protótipo funcional de plataforma de estudos com 6 videoaulas de uma playlist do YouTube, progresso, favoritos e pesquisa — feito com HTML5, CSS3 e JavaScript (ES6+), sem build e sem npm.

## Como abrir / iniciar

1. Abra a pasta `EduPlay` no VS Code (ou Cursor).
2. Use a extensão **Live Server** (ou qualquer servidor HTTP estático) e abra `index.html`.
3. **Atenção**: Alguns navegadores restringem iframes do YouTube em `file://`; um servidor local é recomendado.


## Estrutura

```
EduPlay/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js        # Lógica (navegação, progresso, favoritos, pesquisa)
│   └── courses.js    # Dados do curso (editáveis)
├── assets/
│   └── images/
└── README.md
```

## Integração com o YouTube

- Playlist oficial: [PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q](https://www.youtube.com/watch?v=G5OLtuHulhU&list=PLuqN50UwdfI8tvNQTp3q2PuQWImoyi4-q)
- Cada aula usa o **ID real** no embed: `https://www.youtube.com/embed/ID`
- IDs cadastrados: `G5OLtuHulhU`, `gdIpsayKz78`, `RtziM3qy8V4`, `VBAFQTXljxc`, `NcVeeaLXoAY`, `jf16-xhoTZE`
- O embed **não** inclui `list=` para evitar as setas nativas da playlist do YouTube (que mudavam o vídeo sem atualizar a UI).
- Navegação oficial da Skill Tube: setas sobrepostas ao player + botões “Aula anterior/próxima” + lista lateral — todos via `selecionarAula(indice)`.
- YouTube IFrame Player API: troca de vídeo, erros e sincronização se o vídeo no player mudar.
- Se o embed falhar, há mensagem amigável e link “Abrir no YouTube”.


## Progresso e favoritos (localStorage)

| Chave | Conteúdo |
|-------|----------|
| `skilltube_completed` | IDs das aulas marcadas como concluídas |
| `skilltube_favorites` | IDs das aulas favoritas |
| `skilltube_last_lesson` | Última aula aberta (“continuar estudando”) |

O percentual de conclusão = `(aulas concluídas / 6) × 100`.  
**Não** há detecção automática de “assistiu o vídeo inteiro” (isso exigiria a YouTube IFrame Player API com eventos confiáveis e ainda assim tem limitações).

## Funcionalidades implementadas

- Página inicial com boas-vindas, banner do curso e “Continuar estudando”
- Cards das 6 aulas e seção “Continue de onde parou”
- Área do curso com lista lateral, player, título/descrição, anterior/próxima
- Marcar/desmarcar aula como concluída + barra de progresso
- Favoritar/desfavoritar com persistência
- Pesquisa por título + mensagem quando não há resultados
- Menu responsivo para mobile
- Indicador “Aula X de 6”
- Fallback para abrir no YouTube

## Limitações do protótipo

- Títulos das aulas 2–6 são placeholders até preenchimento manual ou via API oficial.
- IDs individuais das aulas 2–6 não estão cadastrados; a navegação usa índice da playlist.
- Progresso depende de marcação manual (“Marcar como concluída”).
- Dados ficam só no navegador local (não há conta, backend ou sincronização).
- Thumbnails das aulas sem `youtubeVideoId` reutilizam a capa do primeiro vídeo.
- Alguns vídeos podem bloquear embed conforme política do proprietário no YouTube.

## Como testar

1. Abra o curso e navegue entre as aulas (lista, anterior/próxima).
2. Marque 2 aulas como concluídas e confira o percentual (deve ser ~33%).
3. Favoritar uma aula e abra a seção Favoritos.
4. Recarregue a página: progresso, favoritos e última aula devem permanecer.
5. Pesquise um título inexistente e confirme a mensagem de “nenhuma aula encontrada”.
6. Redimensione a janela ou use o DevTools em modo mobile e teste o menu.

## Licença

Protótipo educacional. Conteúdo dos vídeos pertence aos respectivos autores no YouTube.
