import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const musicApiPlugin = () => ({
  name: 'music-api-middleware',
  configureServer(server) {
    // 1. Spotify playlist extractor
    server.middlewares.use('/api/spotify-playlist', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const id = url.searchParams.get('id');

        if (!id) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: 'ID da playlist não fornecido' }));
        }

        const spotifyRes = await fetch(`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });

        if (!spotifyRes.ok) {
          res.statusCode = spotifyRes.status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: `Erro no Spotify (${spotifyRes.status})` }));
        }

        const html = await spotifyRes.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

        if (!match || !match[1]) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: 'Não foi possível extrair dados da playlist' }));
        }

        const nextData = JSON.parse(match[1]);
        const entity = nextData?.props?.pageProps?.state?.data?.entity;
        const trackList = entity?.trackList || nextData?.props?.pageProps?.initialData?.tracks || [];
        const playlistName = entity?.name || entity?.title || 'Playlist do Spotify';
        const coverImage = entity?.coverArt?.sources?.[0]?.url || entity?.visualIdentity?.image?.[0]?.url || '';

        const tracks = trackList.map((t, idx) => ({
          id: t.uri ? t.uri.replace('spotify:track:', '') : 'sp_' + idx,
          name: t.title || t.name,
          title: t.title || t.name,
          artist: t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : 'Artista'),
          duration: t.duration ? Math.floor(t.duration / 1000) : 0,
          previewUrl: t.audioPreview?.url || null,
          image: coverImage,
          spotifyUri: t.uri || (t.id ? `spotify:track:${t.id}` : null)
        }));

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(
          JSON.stringify({
            success: true,
            name: playlistName,
            image: coverImage,
            tracks
          })
        );
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: err.message || 'Erro interno' }));
      }
    });

    // 2. Full song audio resolver (no 30s limit!)
    server.middlewares.use('/api/full-audio', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const artist = url.searchParams.get('artist') || '';
        const title = url.searchParams.get('title') || '';
        const q = url.searchParams.get('q') || `${artist} ${title}`;

        if (!q.trim()) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: 'Nenhum termo de busca fornecido' }));
        }

        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q.trim() + ' audio')}`;
        const ytRes = await fetch(searchUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });

        if (!ytRes.ok) {
          res.statusCode = ytRes.status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: 'Erro ao buscar áudio' }));
        }

        const html = await ytRes.text();
        let videoId = null;
        let duration = 0;
        let trackTitle = title || q;

        const jsonMatch = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1]);
            const contents =
              data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
                ?.itemSectionRenderer?.contents;
            const video = contents?.find(c => c.videoRenderer)?.videoRenderer;
            if (video) {
              videoId = video.videoId;
              trackTitle = video.title?.runs?.[0]?.text || trackTitle;
              const durStr = video.lengthText?.simpleText;
              if (durStr) {
                const parts = durStr.split(':').map(Number);
                if (parts.length === 2) duration = parts[0] * 60 + parts[1];
                else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }
          } catch (e) {}
        }

        if (!videoId) {
          const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (match) videoId = match[1];
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(
          JSON.stringify({
            success: !!videoId,
            videoId,
            duration,
            title: trackTitle
          })
        );
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: err.message || 'Erro interno' }));
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), musicApiPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0'
  }
});
