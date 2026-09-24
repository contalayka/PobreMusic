export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const q = url.searchParams.get('q') || '';
    if (!q.trim()) {
      return new Response(JSON.stringify({ error: 'Termo de busca vazio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
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
      return new Response(JSON.stringify({ success: false, results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const html = await ytRes.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
    if (!match || !match[1]) {
      return new Response(JSON.stringify({ success: true, results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
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

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
