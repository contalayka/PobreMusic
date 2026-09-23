export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const artist = url.searchParams.get('artist') || '';
    const title = url.searchParams.get('title') || '';
    const q = url.searchParams.get('q') || `${artist} ${title}`;

    if (!q.trim()) {
      return new Response(JSON.stringify({ error: 'Nenhum termo de busca fornecido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
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
      return new Response(JSON.stringify({ error: 'Erro ao buscar áudio' }), {
        status: ytRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
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

    return new Response(
      JSON.stringify({
        success: !!videoId,
        videoId,
        duration,
        title: trackTitle
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
