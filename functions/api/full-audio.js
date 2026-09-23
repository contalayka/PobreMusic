const API = 'https://api.audius.co/v1';
const APP = 'PobreMusic';

const norm = value =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const bad = value =>
  /\b(cover|karaoke|acapella|a cappella|instrumental|remix|rework|bootleg|edit|sped up|slowed|nightcore|version|tribute|dublagem|parodia|parody|live|ao vivo)\b/i.test(
    value || ''
  );

const matchTrack = (track, title, artist) => {
  const wantedTitle = norm(title);
  const wantedArtist = norm(artist);
  const trackTitle = norm(track?.title);
  const artistNames = [track?.user?.name, track?.artist, track?.artist_name].filter(Boolean).map(norm);

  if (!wantedTitle || !trackTitle || bad(track?.title) || bad(track?.user?.name)) return false;

  const titleWords = wantedTitle.split(' ').filter(Boolean);
  const titleOk = titleWords.every(word => trackTitle.includes(word));
  if (!titleOk) return false;

  const artistOk = !wantedArtist || artistNames.some(name => name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name));
  return artistOk;
};

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const artist = url.searchParams.get('artist') || '';
    const title = url.searchParams.get('title') || '';
    const q = url.searchParams.get('q') || [artist, title].filter(Boolean).join(' ');

    if (!q.trim()) {
      return new Response(JSON.stringify({ error: 'Nenhum termo de busca fornecido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const queries = [q, title, [title, artist].filter(Boolean).join(' ')].filter(Boolean);
    for (const query of queries) {
      const res = await fetch(
        API + '/tracks/search?query=' + encodeURIComponent(query) + '&limit=15&sort_method=relevant&app_name=' + APP
      );
      if (!res.ok) continue;

      const data = await res.json();
      const tracks = (data.data || []).filter(track => (track.duration || 0) > 40);
      const match = tracks.find(track => matchTrack(track, title, artist));
      if (!match) continue;

      return new Response(
        JSON.stringify({
          success: true,
          id: match.id,
          title: match.title,
          duration: match.duration || 0,
          artwork: match.artwork || null,
          sourceUrl: API + '/tracks/' + match.id + '/stream?app_name=' + APP
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400'
          }
        }
      );
    }

    return new Response(JSON.stringify({ success: false, sourceUrl: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
