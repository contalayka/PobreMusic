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

    // 2. Local equivalent of the Cloudflare full-audio resolver.
    // It searches the supported Audius catalog; it does not scrape protected platforms.
    server.middlewares.use('/api/full-audio', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const artist = url.searchParams.get('artist') || '';
        const title = url.searchParams.get('title') || '';
        const q = url.searchParams.get('q') || [artist, title].filter(Boolean).join(' ');

        if (!q.trim()) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Nenhum termo de busca fornecido' }));
        }

        const norm = value =>
          (value || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const bad = value =>
          /\\b(cover|karaoke|acapella|a cappella|instrumental|remix|rework|bootleg|edit|sped up|slowed|nightcore|version|tribute|dublagem|parodia|parody|live|ao vivo)\\b/i.test(value || '');
        const wantedTitle = norm(title);
        const wantedArtist = norm(artist);
        const queries = [q, title, [title, artist].filter(Boolean).join(' ')].filter(Boolean);

        let match = null;
        for (const query of queries) {
          const r = await fetch(
            'https://api.audius.co/v1/tracks/search?query=' +
              encodeURIComponent(query) +
              '&limit=15&sort_method=relevant&app_name=PobreMusic'
          );
          if (!r.ok) continue;
          const data = await r.json();
          const tracks = (data.data || []).filter(t => (t.duration || 0) > 40 && !bad(t.title) && !bad(t.user?.name));
          match = tracks.find(t => {
            const tt = norm(t.title);
            const names = [t.user?.name, t.artist, t.artist_name].filter(Boolean).map(norm);
            const titleOk = wantedTitle && wantedTitle.split(' ').every(word => tt.includes(word));
            const artistOk = !wantedArtist || names.some(name => name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name));
            return titleOk && artistOk;
          });
          if (match) break;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(JSON.stringify(match ? {
          success: true,
          id: match.id,
          title: match.title,
          duration: match.duration || 0,
          artwork: match.artwork || null,
          sourceUrl: 'https://api.audius.co/v1/tracks/' + match.id + '/stream?app_name=PobreMusic'
        } : { success: false, sourceUrl: null }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
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
