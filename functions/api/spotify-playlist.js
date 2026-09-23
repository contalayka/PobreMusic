export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID da playlist não fornecido' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const spotifyRes = await fetch(`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!spotifyRes.ok) {
      return new Response(JSON.stringify({ error: `Erro no Spotify (${spotifyRes.status})` }), {
        status: spotifyRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const html = await spotifyRes.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

    if (!match || !match[1]) {
      return new Response(JSON.stringify({ error: 'Não foi possível extrair dados da playlist' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
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

    return new Response(
      JSON.stringify({
        success: true,
        name: playlistName,
        image: coverImage,
        tracks
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Erro interno' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
