const API = 'https://api.audius.co/v1';
const APP = 'PobreMusic';
const JAMENDO_API = 'https://api.jamendo.com/v3.0';

const norm = value =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const bad = value =>
  /\b(cover|karaoke|acapella|a cappella|instrumental|remix|rework|bootleg|edit|sped up|slowed|nightcore|version|tribute|dublagem|parodia|parody|live|ao vivo)\b/i.test(value || '');

const matchTrack = (track, title, artist) => {
  const wantedTitle = norm(title);
  const wantedArtist = norm(artist);
  const trackTitle = norm(track?.title);
  const artistNames = [track?.user?.name, track?.artist, track?.artist_name].filter(Boolean).map(norm);
  if (!wantedTitle || !trackTitle || bad(track?.title) || bad(track?.user?.name)) return false;
  if (!wantedTitle.split(' ').filter(Boolean).every(word => trackTitle.includes(word))) return false;
  return !wantedArtist || artistNames.some(name => name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name));
};

const matchJamendoTrack = (track, title, artist) => {
  const wantedTitle = norm(title);
  const wantedArtist = norm(artist);
  const trackTitle = norm(track?.name);
  const trackArtist = norm(track?.artist_name);
  if (!wantedTitle || !trackTitle || bad(track?.name) || bad(track?.artist_name)) return false;
  if (!wantedTitle.split(' ').filter(Boolean).every(word => trackTitle.includes(word))) return false;
  return !wantedArtist || trackArtist === wantedArtist || trackArtist.includes(wantedArtist) || wantedArtist.includes(trackArtist);
};

const json = (body, status = 200, cache = 'public, max-age=300') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache }
  });

async function findAudius(artist, title, queries) {
  for (const query of queries) {
    try {
      const res = await fetch(API + '/tracks/search?query=' + encodeURIComponent(query) + '&limit=15&sort_method=relevant&app_name=' + APP);
      if (!res.ok) continue;
      const data = await res.json();
      const tracks = (data.data || []).filter(track => (track.duration || 0) > 40);
      const match = tracks.find(track => matchTrack(track, title, artist));
      if (!match) continue;
      return {
        provider: 'audius',
        id: match.id,
        title: match.title,
        duration: match.duration || 0,
        artwork: match.artwork || null,
        sourceUrl: API + '/tracks/' + match.id + '/stream?app_name=' + APP
      };
    } catch {}
  }
  return null;
}

async function findJamendo(artist, title, queries, clientId) {
  if (!clientId) return null;
  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        format: 'json',
        limit: '20',
        search: query
      });
      const res = await fetch(JAMENDO_API + '/tracks/?' + params.toString());
      if (!res.ok) continue;
      const data = await res.json();
      const tracks = (data.results || []).filter(track => Number(track.duration || 0) > 40 && track.audiodownload_allowed !== false);
      const match = tracks.find(track => matchJamendoTrack(track, title, artist));
      if (!match) continue;
      const streamParams = new URLSearchParams({
        client_id: clientId,
        id: String(match.id),
        audioformat: 'mp32',
        action: 'stream'
      });
      return {
        provider: 'jamendo',
        id: String(match.id),
        title: match.name,
        duration: Number(match.duration || 0),
        artwork: match.album_image || match.image || null,
        sourceUrl: JAMENDO_API + '/tracks/file/?' + streamParams.toString()
      };
    } catch {}
  }
  return null;
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const artist = url.searchParams.get('artist') || '';
    const title = url.searchParams.get('title') || '';
    const q = url.searchParams.get('q') || [artist, title].filter(Boolean).join(' ');
    if (!q.trim()) return json({ error: 'Nenhum termo de busca fornecido' }, 400);

    const queries = [q, title, [title, artist].filter(Boolean).join(' ')].filter(Boolean);

    const audius = await findAudius(artist, title, queries);
    if (audius) return json({ success: true, ...audius }, 200, 'public, max-age=86400');

    const jamendo = await findJamendo(artist, title, queries, context.env?.JAMENDO_CLIENT_ID || '');
    if (jamendo) return json({ success: true, ...jamendo }, 200, 'public, max-age=86400');

    return json({ success: false, sourceUrl: null });
  } catch (err) {
    return json({ error: err.message || 'Erro interno' }, 500);
  }
}
