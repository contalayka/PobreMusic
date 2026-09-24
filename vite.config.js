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
          (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const isUnwantedVariant = (candidate, wanted = '') => {
          const normC = norm(candidate);
          const normW = norm(wanted);
          const badPatterns = [
            /\b(cover|karaoke|acapella|a cappella|instrumental|tribute|dublagem|parodia|parody)\b/i,
            /\b(sped up|slowed|nightcore)\b/i,
            /\b(ao vivo|live at|live in|live from)\b/i
          ];
          return badPatterns.some(pat => pat.test(normC) && !pat.test(normW));
        };
        const wantedTitle = norm(title);
        const wantedArtist = norm(artist);
        const queries = [q, title, [title, artist].filter(Boolean).join(' ')].filter(Boolean);

        let match = null;
        let bestFallback = null;
        for (const query of queries) {
          const r = await fetch(
            'https://api.audius.co/v1/tracks/search?query=' +
              encodeURIComponent(query) +
              '&limit=15&sort_method=relevant&app_name=PobreMusic'
          );
          if (!r.ok) continue;
          const data = await r.json();
          const allTracks = (data.data || []).filter(t => (t.duration || 0) > 30);
          const tracks = allTracks.filter(t => !isUnwantedVariant(t.title, title) && !isUnwantedVariant(t.user?.name, artist));
          const list = tracks.length > 0 ? tracks : allTracks;

          match = list.find(t => {
            const tt = norm(t.title);
            const names = [t.user?.name, t.artist, t.artist_name].filter(Boolean).map(norm);
            const titleOk = wantedTitle && wantedTitle.split(' ').every(word => tt.includes(word));
            const artistOk = !wantedArtist || names.some(name => name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name));
            return titleOk && artistOk;
          });
          if (match) break;
        }

        const finalMatch = match;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(JSON.stringify(finalMatch ? {
          success: true,
          id: finalMatch.id,
          title: finalMatch.title,
          duration: finalMatch.duration || 0,
          artwork: finalMatch.artwork || null,
          sourceUrl: 'https://api.audius.co/v1/tracks/' + finalMatch.id + '/stream?app_name=PobreMusic'
        } : { success: false, sourceUrl: null }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Erro interno' }));
      }
    });

    // 3. YouTube Search resolver
    server.middlewares.use('/api/youtube-search', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: 'Termo de busca vazio' }));
        }

        const ytRes = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
          }
        );

        if (!ytRes.ok) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ success: false, results: [] }));
        }

        const html = await ytRes.text();
        const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
        if (!match || !match[1]) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ success: true, results: [] }));
        }

        const data = JSON.parse(match[1]);
        const sectionList =
          data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

        const allVideos = [];
        const seenVids = new Set();

        for (const sec of sectionList) {
          const items = sec.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (item.videoRenderer?.videoId) {
              if (!seenVids.has(item.videoRenderer.videoId)) {
                seenVids.add(item.videoRenderer.videoId);
                allVideos.push(item.videoRenderer);
              }
            } else if (item.shelfRenderer?.content?.verticalListRenderer?.items) {
              for (const sub of item.shelfRenderer.content.verticalListRenderer.items) {
                if (sub.videoRenderer?.videoId && !seenVids.has(sub.videoRenderer.videoId)) {
                  seenVids.add(sub.videoRenderer.videoId);
                  allVideos.push(sub.videoRenderer);
                }
              }
            }
          }
        }

        const parseDur = str => {
          if (!str) return 180;
          const parts = str.split(':').map(Number);
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          return Number(str) || 180;
        };

        const results = allVideos
          .slice(0, 30)
          .map(v => {
            const timeFromOverlay = v.thumbnailOverlays?.find(o => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
            const durStr = v.lengthText?.simpleText || timeFromOverlay || '3:30';
            const vid = v.videoId;
            const thumb =
              v.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
              `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
            const titleStr = v.title?.runs?.map(r => r.text).join('') || 'Sem título';
            const artistStr = v.ownerText?.runs?.[0]?.text || 'Artista';

            return {
              id: 'yt_' + vid,
              youtubeId: vid,
              title: titleStr,
              name: titleStr,
              artist: artistStr,
              user: { name: artistStr },
              duration: parseDur(durStr),
              durationText: durStr,
              artwork: {
                _480x480: thumb,
                _150x150: thumb
              },
              image: thumb,
              provider: 'youtube'
            };
          });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=1800');
        return res.end(JSON.stringify({ success: true, results }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(JSON.stringify({ error: err.message || 'Erro interno' }));
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
