import React, { Component, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home,
  Search,
  Library,
  Heart,
  Plus,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Shuffle,
  Repeat,
  Music2,
  ListMusic,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  AlertCircle,
  FileText,
  Link,
  Check,
  Sparkles,
  Trash2,
  FolderPlus,
  X
} from 'lucide-react';
import './styles.css';

const API = 'https://api.audius.co/v1';
const APP = 'PobreMusic';
const SA = 'https://accounts.spotify.com';
const SP = 'https://api.spotify.com/v1';

// Safe localStorage parser
const getStoredJSON = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

const isSpotifyPreview = url =>
  typeof url === 'string' && (url.includes('p.scdn.co') || url.includes('spotify.com/preview'));

const resolveFullAudio = async t => {
  if (!t) return t;
  if (t.youtubeId) return t;

  const artist = t.user?.name || t.artist || t.artists?.[0]?.name || '';
  const title = t.name || t.title || '';
  if (!title) return t;

  const cacheKey = norm(`${artist} ${title}`);
  const cache = getStoredJSON('pm-full-audio-cache', {});
  if (cache[cacheKey] && cache[cacheKey].videoId) {
    return {
      ...t,
      youtubeId: cache[cacheKey].videoId,
      duration: cache[cacheKey].duration || t.duration || 180
    };
  }

  try {
    const res = await fetch(`/api/full-audio?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.videoId) {
        cache[cacheKey] = { videoId: data.videoId, duration: data.duration };
        try {
          localStorage.setItem('pm-full-audio-cache', JSON.stringify(cache));
        } catch {}
        return {
          ...t,
          youtubeId: data.videoId,
          duration: data.duration || t.duration || 180
        };
      }
    }
  } catch (err) {
    console.warn('Could not resolve full audio:', err);
  }
  return t;
};

const norm = v =>
  (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const bad = v =>
  /\b(cover|karaoke|acapella|a cappella|instrumental|remix|rework|bootleg|edit|sped up|slowed|nightcore|version|tribute|dublagem|parodia|parody|live|ao vivo)\b/i.test(
    v || ''
  );

const names = t => [t?.user?.name, t?.artist, t?.artist_name].filter(Boolean).map(norm);

const exact = (t, title, artist) => {
  const normT = norm(t?.title);
  const normWanted = norm(title);
  const artistMatch = names(t).some(a => a.includes(norm(artist)) || norm(artist).includes(a));
  return normT.includes(normWanted) && artistMatch && !bad(t?.title);
};

const smartMatch = (t, title, artist) => {
  const normT = norm(t?.title);
  const normTitle = norm(title);
  const normArtist = norm(artist);

  const titleWords = normTitle.split(' ').filter(w => w.length > 2);
  const hasTitle =
    titleWords.length > 0 ? titleWords.every(w => normT.includes(w)) : normT.includes(normTitle);
  if (!hasTitle) return false;

  const artistWords = normArtist.split(' ').filter(w => w.length > 2);
  const hasArtist =
    artistWords.length > 0
      ? artistWords.some(w => normT.includes(w) || names(t).some(a => a.includes(w)))
      : normT.includes(normArtist) || names(t).some(a => a.includes(normArtist));

  return hasArtist;
};

const resolveAudiusTrack = async (artist, title) => {
  const q = `${artist} ${title}`.trim();
  if (!q) return null;
  const cacheKey = norm(q);
  const cache = getStoredJSON('pm-audius-cache', {});
  if (cache[cacheKey] && cache[cacheKey].id) {
    return cache[cacheKey];
  }

  try {
    const r = await fetch(
      API + '/tracks/search?query=' + encodeURIComponent(q) + '&limit=15&app_name=' + APP
    );
    if (r.ok) {
      const j = await r.json();
      const hits = (j.data || []).filter(x => (x.duration || 0) > 40);
      const match = hits.find(x => smartMatch(x, title, artist)) || hits[0];
      if (match) {
        const item = {
          id: match.id,
          sourceUrl: API + '/tracks/' + match.id + '/stream?app_name=' + APP,
          duration: match.duration || 180,
          title: match.title,
          artwork: match.artwork
        };
        cache[cacheKey] = item;
        try {
          localStorage.setItem('pm-audius-cache', JSON.stringify(cache));
        } catch {}
        return item;
      }
    }
  } catch (e) {}
  return null;
};

const art = t =>
  t?.artwork?.['_480x480'] ||
  t?.artwork?.['_150x150'] ||
  t?.album?.images?.[1]?.url ||
  t?.album?.images?.[0]?.url ||
  t?.image ||
  'https://placehold.co/480x480/17171b/fff?text=♪';

const fmt = s => {
  s = Math.floor(s || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

const playlistId = u => {
  if (!u) return null;
  const str = String(u).trim();
  const urlMatch = str.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?playlist\/([A-Za-z0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  const uriMatch = str.match(/spotify:playlist:([A-Za-z0-9]+)/i);
  if (uriMatch) return uriMatch[1];
  if (/^[A-Za-z0-9]{22}$/.test(str)) return str;
  return null;
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const pkce = async () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  const v = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  let s = '';
  new Uint8Array(h).forEach(x => (s += String.fromCharCode(x)));
  return {
    verifier: v,
    challenge: btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  };
};

// Error Boundary to prevent any blank white screen
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('PobreMusic Error Boundary caught:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('pm-spotify-access-token');
    localStorage.removeItem('pm-spotify-user');
    window.location.href = window.location.origin + window.location.pathname;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#fff', maxWidth: 600, margin: '60px auto', background: '#16161b', borderRadius: 16, border: '1px solid #333' }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2>Algo inesperado aconteceu</h2>
          <p style={{ color: '#aaa', margin: '12px 0 24px' }}>
            {this.state.error?.message || 'Ocorreu uma falha na renderização.'}
          </p>
          <button
            onClick={this.handleReset}
            style={{ padding: '12px 24px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 24, fontWeight: 700, cursor: 'pointer' }}
          >
            Recarregar PobreMusic
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Player({ queue, setQueue }) {
  const ref = useRef(null);
  const spotifyRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const pendingPlayRef = useRef(null);
  const repeatRef = useRef(false);
  const deviceRef = useRef('');

  const [track, setTrack] = useState(null);
  const [src, setSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [mode, setMode] = useState('audio'); // 'audio' | 'yt' | 'spotify'
  const [loadingTrack, setLoadingTrack] = useState(false);

  repeatRef.current = repeat;

  // Listen to postMessage events from YouTube embed player
  useEffect(() => {
    const handleMsg = event => {
      try {
        if (typeof event.data !== 'string') return;
        const d = JSON.parse(event.data);
        if (d.event === 'infoDelivery' && d.info) {
          if (typeof d.info.currentTime === 'number' && d.info.currentTime >= 0) {
            setTime(d.info.currentTime);
          }
          if (typeof d.info.duration === 'number' && d.info.duration > 0) {
            setDur(d.info.duration);
          }
          if (d.info.playerState === 1) {
            setPlaying(true);
          } else if (d.info.playerState === 2) {
            setPlaying(false);
          } else if (d.info.playerState === 0) {
            if (repeatRef.current) {
              seek(0);
            } else {
              next();
            }
          }
        } else if (d.event === 'initialDelivery' && d.info) {
          if (typeof d.info.duration === 'number' && d.info.duration > 0) {
            setDur(d.info.duration);
          }
        } else if (d.event === 'onStateChange') {
          if (d.info === 1) setPlaying(true);
          else if (d.info === 2) setPlaying(false);
          else if (d.info === 0) {
            if (repeatRef.current) seek(0);
            else next();
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [queue, idx, shuffle, repeat]);

  // Active ticker that keeps the progress bar moving smoothly in real-time
  useEffect(() => {
    if (!playing) return;

    const interval = setInterval(() => {
      if (mode === 'yt') {
        const iframe = document.getElementById('yt-embed-player');
        if (iframe?.contentWindow) {
          try {
            iframe.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }),
              '*'
            );
          } catch {}
        }
        setTime(prev => {
          const totalDur = dur || track?.duration || 180;
          const nextTime = +(prev + 0.5).toFixed(1);
          if (totalDur > 0 && nextTime >= totalDur) {
            if (repeatRef.current) {
              seek(0);
              return 0;
            } else {
              next();
              return 0;
            }
          }
          return nextTime;
        });
      } else if (mode === 'audio' && ref.current) {
        if (!ref.current.paused && ref.current.currentTime != null && !isNaN(ref.current.currentTime)) {
          setTime(ref.current.currentTime);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [playing, mode, dur, track?.duration, queue, idx, shuffle, repeat]);

  // HTML5 audio event listeners
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    const a = () => setTime(e.currentTime || 0);
    const b = () => setDur(e.duration || 0);
    const onEnded = () => {
      if (repeatRef.current) {
        e.currentTime = 0;
        e.play().catch(() => {});
      } else {
        next();
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    e.addEventListener('timeupdate', a);
    e.addEventListener('loadedmetadata', b);
    e.addEventListener('ended', onEnded);
    e.addEventListener('play', onPlay);
    e.addEventListener('pause', onPause);

    return () => {
      e.removeEventListener('timeupdate', a);
      e.removeEventListener('loadedmetadata', b);
      e.removeEventListener('ended', onEnded);
      e.removeEventListener('play', onPlay);
      e.removeEventListener('pause', onPause);
    };
  }, [src]);

  // Safe Spotify Web Playback SDK integration
  useEffect(() => {
    const token = localStorage.getItem('pm-spotify-access-token');
    if (!token) return;

    let isMounted = true;

    const initSpotifyPlayer = () => {
      try {
        if (!window.Spotify || !window.Spotify.Player) return;
        const player = new window.Spotify.Player({
          name: 'PobreMusic Player',
          getOAuthToken: cb => {
            const currentToken = localStorage.getItem('pm-spotify-access-token') || token;
            cb(currentToken);
          },
          volume: vol
        });

        player.addListener('ready', ({ device_id }) => {
          deviceRef.current = device_id;
          if (isMounted) setSpotifyReady(true);
        });

        player.addListener('not_ready', () => {
          if (isMounted) setSpotifyReady(false);
        });

        player.addListener('authentication_error', () => {
          if (isMounted) setSpotifyReady(false);
        });

        player.addListener('account_error', () => {
          if (isMounted) setSpotifyReady(false);
        });

        player.connect().catch(() => {});
        spotifyRef.current = player;
      } catch (err) {
        console.warn('Spotify SDK init error:', err);
      }
    };

    if (window.Spotify && window.Spotify.Player) {
      initSpotifyPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (isMounted) initSpotifyPlayer();
      };

      if (!document.getElementById('spotify-player-script')) {
        const s = document.createElement('script');
        s.id = 'spotify-player-script';
        s.src = 'https://sdk.scdn.co/spotify-player.js';
        s.async = true;
        document.body.appendChild(s);
      }
    }

    return () => {
      isMounted = false;
      try {
        spotifyRef.current?.disconnect();
      } catch {}
    };
  }, []);

  const fallbackToYouTube = async t => {
    let resolved = t;
    if (!t.youtubeId) {
      setLoadingTrack(true);
      resolved = await resolveFullAudio(t);
      setLoadingTrack(false);
      setTrack(resolved);
      if (resolved.duration) setDur(resolved.duration);
    }
    if (resolved.youtubeId) {
      setMode('yt');
      setPlaying(true);
      if (ref.current) {
        ref.current.pause();
        ref.current.removeAttribute('src');
      }
    }
  };

  const startPlayback = async (t, i) => {
    if (!t) return;
    setIdx(i);
    setTrack(t);
    setTime(0);
    setDur(t.duration || 180);

    const tk = localStorage.getItem('pm-spotify-access-token');
    if (t.spotifyUri && tk && deviceRef.current && spotifyReady) {
      setMode('spotify');
      setPlaying(true);
      try {
        await fetch(SP + '/me/player/play?device_id=' + encodeURIComponent(deviceRef.current), {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + tk,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uris: [t.spotifyUri] })
        });
      } catch {}
      return;
    }

    // 1. Direct audio check (Audius tracks or direct audio streams)
    const hasDirectAudio = t.sourceUrl && !isSpotifyPreview(t.sourceUrl);
    const isAudiusId =
      t.id &&
      !String(t.id).startsWith('sp_') &&
      !String(t.id).startsWith('tr_') &&
      !String(t.id).startsWith('yt_') &&
      !String(t.id).startsWith('txt_') &&
      !t.youtubeId;

    if (hasDirectAudio || isAudiusId) {
      const audioUrl = hasDirectAudio
        ? t.sourceUrl
        : API + '/tracks/' + t.id + '/stream?app_name=' + APP;
      setMode('audio');
      setSrc(audioUrl);
      setPlaying(true);
      if (ref.current) {
        ref.current.src = audioUrl;
        ref.current.volume = vol;
        ref.current.play().catch(err => {
          console.warn('Audio play failed, falling back to YouTube:', err);
          fallbackToYouTube(t);
        });
      }
      return;
    }

    // 2. Pre-resolved YouTube video
    if (t.youtubeId) {
      setMode('yt');
      setPlaying(true);
      if (ref.current) {
        ref.current.pause();
        ref.current.removeAttribute('src');
      }
      return;
    }

    // 3. Resolve on Audius first using smartMatch (100% full duration)
    setLoadingTrack(true);
    const artist = t.user?.name || t.artist || t.artists?.[0]?.name || '';
    const title = t.name || t.title || '';
    const audiusMatch = await resolveAudiusTrack(artist, title);

    if (audiusMatch && audiusMatch.sourceUrl) {
      setLoadingTrack(false);
      const updatedTrack = {
        ...t,
        id: audiusMatch.id,
        sourceUrl: audiusMatch.sourceUrl,
        duration: audiusMatch.duration || t.duration || 180,
        artwork: t.artwork || audiusMatch.artwork
      };
      setTrack(updatedTrack);
      setDur(updatedTrack.duration);
      setMode('audio');
      setSrc(audiusMatch.sourceUrl);
      setPlaying(true);
      if (ref.current) {
        ref.current.src = audiusMatch.sourceUrl;
        ref.current.volume = vol;
        ref.current.play().catch(err => {
          console.warn('Audius play error, falling back:', err);
          fallbackToYouTube(updatedTrack);
        });
      }
      return;
    }

    // 4. Fallback to YouTube
    await fallbackToYouTube(t);
    setLoadingTrack(false);
  };

  const at = i => {
    if (!queue || !queue[i]) return;
    startPlayback(queue[i], i);
  };

  const play = t => {
    const i = queue.findIndex(x => x.id === t.id);
    if (i >= 0) {
      startPlayback(queue[i], i);
    } else {
      const n = [...queue, t];
      setQueue(n);
      startPlayback(t, n.length - 1);
    }
  };

  const next = () => {
    if (!queue.length) return;
    if (!repeat && idx === queue.length - 1 && !shuffle) return;
    let n =
      shuffle && queue.length > 1
        ? Math.floor(Math.random() * queue.length)
        : (idx + 1) % queue.length;
    if (shuffle && queue.length > 1 && n === idx) n = (n + 1) % queue.length;
    at(n);
  };

  const previous = () => {
    if (time > 5) {
      seek(0);
      return;
    }
    if (queue.length) at((idx - 1 + queue.length) % queue.length);
  };

  const togglePlay = () => {
    if (!track) return;
    const nextPlaying = !playing;
    setPlaying(nextPlaying);

    if (mode === 'yt') {
      const iframe = document.getElementById('yt-embed-player');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: nextPlaying ? 'playVideo' : 'pauseVideo',
            args: []
          }),
          '*'
        );
      }
    } else if (mode === 'audio' && ref.current) {
      if (nextPlaying) {
        ref.current.play().catch(() => setPlaying(false));
      } else {
        ref.current.pause();
      }
    }
  };

  const seek = newVal => {
    setTime(newVal);
    if (mode === 'yt') {
      const iframe = document.getElementById('yt-embed-player');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'seekTo',
            args: [newVal, true]
          }),
          '*'
        );
      }
    } else if (ref.current) {
      ref.current.currentTime = newVal;
    }
  };

  const changeVol = newVol => {
    setVol(newVol);
    if (mode === 'yt') {
      const iframe = document.getElementById('yt-embed-player');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [newVol * 100]
          }),
          '*'
        );
      }
    }
    if (ref.current) {
      ref.current.volume = newVol;
    }
  };

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      const m = navigator.mediaSession;
      m.metadata = new MediaMetadata({
        title: track.title || track.name || 'Música',
        artist: track.user?.name || track.artist || 'Artista',
        album: 'PobreMusic',
        artwork: [{ src: art(track), sizes: '480x480', type: 'image/jpeg' }]
      });
      const a = {
        play: () => togglePlay(),
        pause: () => togglePlay(),
        nexttrack: next,
        previoustrack: previous,
        seekbackward: () => seek(Math.max(0, time - 10)),
        seekforward: () => seek(Math.min(dur || 0, time + 10))
      };
      Object.entries(a).forEach(([k, h]) => {
        try {
          m.setActionHandler(k, h);
        } catch {}
      });
      return () =>
        Object.keys(a).forEach(k => {
          try {
            m.setActionHandler(k, null);
          } catch {}
        });
    } catch {}
  }, [track, idx, queue, shuffle, repeat, time, dur, mode, playing]);

  return {
    track,
    playing,
    time,
    dur,
    vol,
    shuffle,
    repeat,
    loadingTrack,
    mode,
    play,
    next,
    previous,
    togglePlay,
    seek,
    changeVol,
    setShuffle,
    setRepeat,
    ref,
    src,
    spotifyReady,
    fallbackToYouTube
  };
}

function App() {
  const [queue, setQueue] = useState([]);
  const p = Player({ queue, setQueue });
  const [page, setPage] = useState('home');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const sanitizeList = list => {
    if (!Array.isArray(list)) return [];
    return list.map(t => {
      const isPreview = t.sourceUrl && (t.sourceUrl.includes('p.scdn.co') || t.sourceUrl.includes('preview'));
      return {
        ...t,
        sourceUrl: isPreview ? null : t.sourceUrl,
        duration: t.duration === 30 && !t.sourceUrl ? 190 : (t.duration || 190)
      };
    });
  };

  const [liked, setLiked] = useState(() => sanitizeList(getStoredJSON('pm-liked', [])));
  const [library, setLibrary] = useState(() => sanitizeList(getStoredJSON('pm-library', [])));
  const [playlists, setPlaylists] = useState(() => {
    const stored = getStoredJSON('pm-playlists', []);
    if (!Array.isArray(stored)) return [];
    return stored.map(pl => ({
      ...pl,
      tracks: sanitizeList(pl.tracks || [])
    }));
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [libraryTab, setLibraryTab] = useState('playlists'); // 'playlists' | 'tracks'
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(null);
  const [newPlaylistModal, setNewPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [trending, setTrending] = useState([]);

  useEffect(() => {
    fetch(API + '/tracks/trending?limit=12&app_name=' + APP)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setTrending(d.data.filter(t => (t.duration || 0) > 40));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('pm-liked', JSON.stringify(liked));
    } catch {}
  }, [liked]);

  useEffect(() => {
    try {
      localStorage.setItem('pm-library', JSON.stringify(library));
    } catch {}
  }, [library]);

  useEffect(() => {
    try {
      localStorage.setItem('pm-playlists', JSON.stringify(playlists));
    } catch {}
  }, [playlists]);

  const search = async term => {
    term = (term ?? q).trim();
    if (!term) return;
    setLoading(true);
    setMsg('');
    try {
      let c = [];
      try {
        const r = await fetch(
          API +
            '/tracks/search?query=' +
            encodeURIComponent(term) +
            '&limit=30&sort_method=relevant&app_name=' +
            APP
        );
        if (r.ok) {
          const j = await r.json();
          const raw = j.data || [];
          const filtered = raw.filter(t => !bad(t.title) && !bad(t.user?.name));
          c = filtered.length > 0 ? filtered : raw;
        }
      } catch {}

      // Complement with full audio match if not many results
      if (c.length < 8) {
        try {
          const ytRes = await fetch(`/api/full-audio?q=${encodeURIComponent(term)}`);
          if (ytRes.ok) {
            const ytData = await ytRes.json();
            if (ytData.videoId && !c.some(x => x.youtubeId === ytData.videoId)) {
              const fullSong = {
                id: 'yt_' + ytData.videoId,
                youtubeId: ytData.videoId,
                title: ytData.title || term,
                user: { name: term },
                duration: ytData.duration || 210,
                artwork: { '_480x480': `https://i.ytimg.com/vi/${ytData.videoId}/hqdefault.jpg` }
              };
              c.unshift(fullSong);
            }
          }
        } catch {}
      }

      setResults(c);
      setPage('search');
      setMsg(c.length ? '' : 'Nenhuma faixa encontrada.');
    } catch {
      setMsg('O serviço de música está temporariamente indisponível.');
    } finally {
      setLoading(false);
    }
  };

  const list = page === 'library' ? library : page === 'liked' ? liked : results;
  const save = t => setLibrary(x => (x.some(a => a.id === t.id) ? x : [...x, t]));
  const like = t =>
    setLiked(x => (x.some(a => a.id === t.id) ? x.filter(a => a.id !== t.id) : [...x, t]));

  const importPlaylist = (ts, autoplay = true, meta = null) => {
    const sanitized = sanitizeList(ts);
    if (!sanitized.length) return;

    const playlistId = 'pl_' + Date.now();
    const playlistTitle = meta?.name?.trim() || 'Minha Playlist Importada';
    const newPlaylist = {
      id: playlistId,
      name: playlistTitle,
      image: meta?.image || art(sanitized[0]),
      tracks: sanitized,
      createdAt: Date.now()
    };

    setPlaylists(prev => {
      const filtered = prev.filter(p => p.id !== playlistId && p.name !== playlistTitle);
      return [newPlaylist, ...filtered];
    });

    setLibrary(x => [...x, ...sanitized.filter(t => !x.some(a => a.id === t.id))]);

    if (autoplay && sanitized.length > 0) {
      setQueue(sanitized);
      p.play(sanitized[0]);
    }

    setSelectedPlaylistId(playlistId);
    setPage('playlist-detail');
  };

  const playPlaylist = (playlist, startIndex = 0) => {
    if (!playlist?.tracks?.length) return;
    setQueue(playlist.tracks);
    p.play(playlist.tracks[startIndex] || playlist.tracks[0]);
  };

  const deletePlaylist = id => {
    setPlaylists(prev => prev.filter(pl => pl.id !== id));
    if (selectedPlaylistId === id) {
      setPage('library');
    }
  };

  const removeTrackFromPlaylist = (playlistId, trackId) => {
    setPlaylists(prev =>
      prev.map(pl => {
        if (pl.id !== playlistId) return pl;
        return { ...pl, tracks: pl.tracks.filter(t => t.id !== trackId) };
      })
    );
  };

  const addToPlaylist = (playlistId, track) => {
    setPlaylists(prev =>
      prev.map(pl => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some(t => t.id === track.id)) return pl;
        return {
          ...pl,
          image: pl.image || art(track),
          tracks: [...pl.tracks, track]
        };
      })
    );
    setShowAddToPlaylistModal(null);
  };

  const createNewPlaylist = (name, initialTrack = null) => {
    const title = (name || '').trim() || `Minha Playlist #${playlists.length + 1}`;
    const newId = 'pl_' + Date.now();
    const newPl = {
      id: newId,
      name: title,
      image: initialTrack ? art(initialTrack) : '',
      tracks: initialTrack ? [initialTrack] : [],
      createdAt: Date.now()
    };
    setPlaylists(prev => [newPl, ...prev]);
    setNewPlaylistModal(false);
    setNewPlaylistName('');
    setShowAddToPlaylistModal(null);
    setSelectedPlaylistId(newId);
    setPage('playlist-detail');
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        <aside>
          <div className="brand" onClick={() => setPage('home')} style={{ cursor: 'pointer' }}>
            ♬ <span>PobreMusic</span>
          </div>
          <button className={page === 'home' ? 'on' : ''} onClick={() => setPage('home')}>
            <Home />
            <span>Início</span>
          </button>
          <button className={page === 'search' ? 'on' : ''} onClick={() => setPage('search')}>
            <Search />
            <span>Buscar</span>
          </button>
          <button
            className={page === 'library' && libraryTab === 'tracks' ? 'on' : ''}
            onClick={() => {
              setLibraryTab('tracks');
              setPage('library');
            }}
          >
            <Library />
            <span>Biblioteca</span>
          </button>
          <div className="sideTitle">Sua música</div>
          <button className={page === 'liked' ? 'on' : ''} onClick={() => setPage('liked')}>
            <Heart />
            <span>Curtidas ({liked.length})</span>
          </button>
          <button
            className={(page === 'library' && libraryTab === 'playlists') || page === 'playlist-detail' ? 'on' : ''}
            onClick={() => {
              setLibraryTab('playlists');
              setPage('library');
            }}
          >
            <ListMusic />
            <span>Playlists ({playlists.length})</span>
          </button>
          <button className={page === 'import' ? 'on' : ''} onClick={() => setPage('import')}>
            <Download />
            <span>Importar</span>
          </button>

          {/* User Playlists in sidebar */}
          {playlists.length > 0 && (
            <div style={{ marginTop: 18, borderTop: '1px solid #1c1c24', paddingTop: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 8px 8px'
                }}
              >
                <span className="sideTitle" style={{ margin: 0, padding: 0 }}>Playlists</span>
                <button
                  onClick={() => setNewPlaylistModal(true)}
                  title="Criar nova playlist"
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: '#aaa',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
              <div style={{ maxHeight: 'calc(100vh - 480px)', overflowY: 'auto' }}>
                {playlists.map(pl => (
                  <button
                    key={pl.id}
                    className={page === 'playlist-detail' && selectedPlaylistId === pl.id ? 'on' : ''}
                    onClick={() => {
                      setSelectedPlaylistId(pl.id);
                      setPage('playlist-detail');
                    }}
                    style={{
                      fontSize: 13,
                      padding: '8px 10px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block'
                    }}
                    title={pl.name}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main>
          <header>
            <form
              onSubmit={e => {
                e.preventDefault();
                search();
              }}
            >
              <Search />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="O que você quer ouvir hoje?"
              />
            </form>
            <div className="profile">P</div>
          </header>

          <section className="content">
            {page === 'import' ? (
              <ImportPanel onImport={importPlaylist} onPlay={p.play} />
            ) : page === 'home' ? (
              <>
                <h1>Bem-vindo ao PobreMusic</h1>
                <div className="hero">
                  <div>
                    <small>SEM LIMITES & SEM ANÚNCIOS</small>
                    <h2>Música livre e gratuita.</h2>
                    <p>Pesquise músicas, importe playlists do Spotify ou escute sua biblioteca.</p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                      <button
                        onClick={() => {
                          setPage('search');
                          setTimeout(() => document.querySelector('input')?.focus(), 100);
                        }}
                      >
                        <Search size={18} />
                        Buscar músicas
                      </button>
                      <button
                        onClick={() => setPage('import')}
                        style={{ background: '#221d28', color: '#fff', border: '1px solid #443c50' }}
                      >
                        <Download size={18} />
                        Importar Spotify
                      </button>
                    </div>
                  </div>
                  <Music2 size={110} />
                </div>
                <h2>Explorar Estilos</h2>
                <div className="chips">
                  {['funk', 'trap', 'sertanejo', 'pagode', 'pop', 'electronic', 'hip hop', 'rock', 'chill'].map(x => (
                    <button key={x} onClick={() => search(x)}>
                      {x}
                    </button>
                  ))}
                </div>

                {trending.length > 0 && (
                  <>
                    <h2 style={{ marginTop: 32 }}>Músicas em Alta</h2>
                    <div className="tracks">
                      {trending.map((t, i) => (
                        <div className="track" key={`trend_${t.id || 'tr'}_${i}`}>
                          <img src={art(t)} alt="" />
                          <div className="meta">
                            <b>{t.title}</b>
                            <span>{t.user?.name || t.artist || 'Artista'}</span>
                          </div>
                          <span className="dur">{fmt(t.duration)}</span>
                          <button
                            className={liked.some(a => a.id === t.id) ? 'liked' : ''}
                            onClick={() => like(t)}
                            title="Curtir"
                          >
                            <Heart size={18} />
                          </button>
                          <button onClick={() => setShowAddToPlaylistModal(t)} title="Adicionar à playlist">
                            <Plus size={18} />
                          </button>
                          <button
                            className="rowPlay"
                            onClick={() => {
                              setQueue(trending);
                              p.play(t);
                            }}
                            title="Tocar"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : page === 'playlist-detail' ? (
              (() => {
                const currentPl = playlists.find(pl => pl.id === selectedPlaylistId);
                if (!currentPl) {
                  return (
                    <div className="empty">
                      <Music2 size={40} />
                      <p style={{ marginTop: 12 }}>Playlist não encontrada.</p>
                      <button
                        onClick={() => {
                          setLibraryTab('playlists');
                          setPage('library');
                        }}
                        style={{
                          background: '#a855f7',
                          color: '#fff',
                          border: 0,
                          borderRadius: 20,
                          padding: '8px 18px',
                          marginTop: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Voltar para Playlists
                      </button>
                    </div>
                  );
                }
                const totalDuration = currentPl.tracks.reduce((acc, t) => acc + (t.duration || 180), 0);
                const coverArt = currentPl.image || (currentPl.tracks[0] ? art(currentPl.tracks[0]) : art({}));

                return (
                  <div>
                    <button
                      onClick={() => {
                        setLibraryTab('playlists');
                        setPage('library');
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #333',
                        color: '#aaa',
                        padding: '7px 16px',
                        borderRadius: 20,
                        cursor: 'pointer',
                        marginBottom: 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                        fontSize: 13
                      }}
                    >
                      ← Voltar para Playlists
                    </button>

                    <div
                      style={{
                        display: 'flex',
                        gap: 24,
                        alignItems: 'flex-end',
                        padding: '28px',
                        background: 'linear-gradient(135deg, #261433 0%, #131217 100%)',
                        borderRadius: 18,
                        border: '1px solid #3d2b4f',
                        flexWrap: 'wrap'
                      }}
                    >
                      <img
                        src={coverArt}
                        alt=""
                        style={{
                          width: 170,
                          height: 170,
                          borderRadius: 12,
                          objectFit: 'cover',
                          boxShadow: '0 12px 32px rgba(0,0,0,0.7)'
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <small
                          style={{
                            color: '#b77cff',
                            fontWeight: 800,
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            fontSize: 12
                          }}
                        >
                          PLAYLIST
                        </small>
                        <h1 style={{ fontSize: 36, margin: '8px 0 10px', wordBreak: 'break-word' }}>
                          {currentPl.name}
                        </h1>
                        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                          {currentPl.tracks.length} {currentPl.tracks.length === 1 ? 'música' : 'músicas'} • Duração total: {fmt(totalDuration)}
                        </p>

                        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => playPlaylist(currentPl, 0)}
                            disabled={!currentPl.tracks.length}
                            style={{
                              background: '#a855f7',
                              color: '#fff',
                              border: 0,
                              borderRadius: 24,
                              padding: '12px 24px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: currentPl.tracks.length ? 'pointer' : 'not-allowed',
                              boxShadow: '0 4px 14px rgba(168,85,247,0.4)'
                            }}
                          >
                            <Play size={18} fill="#fff" /> Tocar Playlist
                          </button>
                          <button
                            onClick={() => {
                              const shuffled = [...currentPl.tracks].sort(() => Math.random() - 0.5);
                              setQueue(shuffled);
                              p.play(shuffled[0]);
                            }}
                            disabled={!currentPl.tracks.length}
                            style={{
                              background: '#1d1d24',
                              color: '#fff',
                              border: '1px solid #363644',
                              borderRadius: 24,
                              padding: '12px 20px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: currentPl.tracks.length ? 'pointer' : 'not-allowed'
                            }}
                          >
                            <Shuffle size={18} /> Ordem Aleatória
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Excluir a playlist "${currentPl.name}"?`)) {
                                deletePlaylist(currentPl.id);
                              }
                            }}
                            style={{
                              background: 'transparent',
                              color: '#ef4444',
                              border: '1px solid #4a1d1d',
                              borderRadius: 24,
                              padding: '12px 18px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            <Trash2 size={16} /> Excluir Playlist
                          </button>
                        </div>
                      </div>
                    </div>

                    <h2 style={{ marginTop: 32 }}>Músicas da Playlist</h2>
                    <div className="tracks">
                      {currentPl.tracks.map((t, idx) => (
                        <div className="track" key={`pl_${currentPl.id}_${t.id || idx}_${idx}`}>
                          <img src={art(t)} alt="" />
                          <div className="meta">
                            <b>{t.title}</b>
                            <span>{t.user?.name || t.artist || 'Artista'}</span>
                          </div>
                          <span className="dur">{fmt(t.duration)}</span>
                          <button
                            className={liked.some(a => a.id === t.id) ? 'liked' : ''}
                            onClick={() => like(t)}
                            title="Curtir"
                          >
                            <Heart size={18} />
                          </button>
                          <button
                            onClick={() => removeTrackFromPlaylist(currentPl.id, t.id)}
                            title="Remover desta playlist"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            className="rowPlay"
                            onClick={() => playPlaylist(currentPl, idx)}
                            title="Tocar a partir daqui"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {!currentPl.tracks.length && (
                      <div className="empty">
                        <Music2 size={40} />
                        <p style={{ marginTop: 12 }}>Esta playlist está vazia. Adicione músicas clicando no botão + em qualquer música!</p>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : page === 'library' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                  <h1>Sua Biblioteca</h1>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setNewPlaylistModal(true)}
                      style={{
                        background: '#a855f7',
                        color: '#fff',
                        border: 0,
                        borderRadius: 22,
                        padding: '9px 18px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={16} /> Nova Playlist
                    </button>
                    <button
                      onClick={() => setPage('import')}
                      style={{
                        background: '#221d28',
                        color: '#fff',
                        border: '1px solid #443c50',
                        borderRadius: 22,
                        padding: '9px 18px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <Download size={16} /> Importar Spotify
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #222', paddingBottom: 14, marginBottom: 24 }}>
                  <button
                    onClick={() => setLibraryTab('playlists')}
                    style={{
                      background: libraryTab === 'playlists' ? '#a855f7' : '#18181f',
                      color: libraryTab === 'playlists' ? '#fff' : '#aaa',
                      border: '1px solid ' + (libraryTab === 'playlists' ? '#a855f7' : '#282832'),
                      borderRadius: 20,
                      padding: '8px 18px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <ListMusic size={16} /> Playlists ({playlists.length})
                  </button>
                  <button
                    onClick={() => setLibraryTab('tracks')}
                    style={{
                      background: libraryTab === 'tracks' ? '#a855f7' : '#18181f',
                      color: libraryTab === 'tracks' ? '#fff' : '#aaa',
                      border: '1px solid ' + (libraryTab === 'tracks' ? '#a855f7' : '#282832'),
                      borderRadius: 20,
                      padding: '8px 18px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Music2 size={16} /> Músicas Salvas ({library.length})
                  </button>
                </div>

                {libraryTab === 'playlists' ? (
                  playlists.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 20
                      }}
                    >
                      {playlists.map(pl => {
                        const plArt = pl.image || (pl.tracks[0] ? art(pl.tracks[0]) : art({}));
                        return (
                          <div
                            key={pl.id}
                            onClick={() => {
                              setSelectedPlaylistId(pl.id);
                              setPage('playlist-detail');
                            }}
                            className="playlist-card"
                            style={{
                              background: '#14141a',
                              borderRadius: 14,
                              padding: 14,
                              cursor: 'pointer',
                              position: 'relative'
                            }}
                          >
                            <div
                              style={{
                                position: 'relative',
                                width: '100%',
                                aspectRatio: '1',
                                borderRadius: 10,
                                overflow: 'hidden',
                                marginBottom: 12
                              }}
                            >
                              <img
                                src={plArt}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  playPlaylist(pl, 0);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 10,
                                  bottom: 10,
                                  width: 44,
                                  height: 44,
                                  borderRadius: '50%',
                                  background: '#a855f7',
                                  border: 0,
                                  color: '#fff',
                                  display: 'grid',
                                  placeItems: 'center',
                                  boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
                                  cursor: 'pointer'
                                }}
                                title="Tocar Playlist"
                              >
                                <Play size={20} fill="#fff" />
                              </button>
                            </div>
                            <b
                              style={{
                                display: 'block',
                                fontSize: 16,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {pl.name}
                            </b>
                            <span style={{ color: '#888', fontSize: 13, marginTop: 4, display: 'block' }}>
                              {pl.tracks.length} {pl.tracks.length === 1 ? 'música' : 'músicas'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty">
                      <ListMusic size={44} />
                      <p style={{ marginTop: 14, fontSize: 17, fontWeight: 700 }}>Nenhuma playlist criada ou importada ainda.</p>
                      <p className="muted" style={{ margin: '6px 0 20px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                        Você pode importar qualquer playlist do Spotify pelo link ou criar suas próprias playlists personalizadas!
                      </p>
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setPage('import')}
                          style={{
                            background: '#a855f7',
                            color: '#fff',
                            border: 0,
                            borderRadius: 22,
                            padding: '11px 22px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Importar Playlist do Spotify
                        </button>
                        <button
                          onClick={() => setNewPlaylistModal(true)}
                          style={{
                            background: '#221d28',
                            color: '#fff',
                            border: '1px solid #443c50',
                            borderRadius: 22,
                            padding: '11px 22px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          + Criar Nova Playlist
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    <div className="tracks">
                      {library.map((t, i) => (
                        <div className="track" key={`lib_${t.id || 'tr'}_${i}`}>
                          <img src={art(t)} alt="" />
                          <div className="meta">
                            <b>{t.title}</b>
                            <span>{t.user?.name || t.artist || 'Artista'}</span>
                          </div>
                          <span className="dur">{fmt(t.duration)}</span>
                          <button
                            className={liked.some(a => a.id === t.id) ? 'liked' : ''}
                            onClick={() => like(t)}
                            title="Curtir"
                          >
                            <Heart size={18} />
                          </button>
                          <button onClick={() => setShowAddToPlaylistModal(t)} title="Adicionar à playlist">
                            <Plus size={18} />
                          </button>
                          <button
                            className="rowPlay"
                            onClick={() => {
                              setQueue(library);
                              p.play(t);
                            }}
                            title="Tocar"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {!library.length && (
                      <div className="empty">
                        <Music2 size={40} />
                        <p style={{ marginTop: 12 }}>Nenhuma música avulsa salva aqui ainda.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : page === 'liked' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                  <h1>Músicas Curtidas ({liked.length})</h1>
                  {liked.length > 0 && (
                    <button
                      onClick={() => {
                        setQueue(liked);
                        p.play(liked[0]);
                      }}
                      style={{
                        background: '#a855f7',
                        color: '#fff',
                        border: 0,
                        borderRadius: 22,
                        padding: '10px 20px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer'
                      }}
                    >
                      <Play size={18} fill="#fff" /> Tocar Todas as Curtidas
                    </button>
                  )}
                </div>
                <div className="tracks">
                  {liked.map((t, i) => (
                    <div className="track" key={`liked_${t.id || 'tr'}_${i}`}>
                      <img src={art(t)} alt="" />
                      <div className="meta">
                        <b>{t.title}</b>
                        <span>{t.user?.name || t.artist || 'Artista'}</span>
                      </div>
                      <span className="dur">{fmt(t.duration)}</span>
                      <button
                        className="liked"
                        onClick={() => like(t)}
                        title="Descurtir"
                      >
                        <Heart size={18} />
                      </button>
                      <button onClick={() => setShowAddToPlaylistModal(t)} title="Adicionar à playlist">
                        <Plus size={18} />
                      </button>
                      <button
                        className="rowPlay"
                        onClick={() => {
                          setQueue(liked);
                          p.play(t);
                        }}
                        title="Tocar"
                      >
                        <Play size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                {!liked.length && (
                  <div className="empty">
                    <Heart size={40} />
                    <p style={{ marginTop: 12 }}>Você ainda não curtiu nenhuma música.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h1>Buscar</h1>
                <div className="searchBox">
                  <Search />
                  <input
                    autoFocus
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    placeholder="Artistas, músicas, álbuns..."
                  />
                  <button onClick={() => search()}>Buscar</button>
                </div>
                {loading && <p className="muted">Pesquisando músicas...</p>}
                {msg && <p className="muted">{msg}</p>}
                <div className="tracks">
                  {results.map((t, i) => (
                    <div className="track" key={`search_${t.id || 'tr'}_${i}`}>
                      <img src={art(t)} alt="" />
                      <div className="meta">
                        <b>{t.title}</b>
                        <span>{t.user?.name || t.artist || 'Artista'}</span>
                      </div>
                      <span className="dur">{fmt(t.duration)}</span>
                      <button
                        className={liked.some(a => a.id === t.id) ? 'liked' : ''}
                        onClick={() => like(t)}
                        title="Curtir"
                      >
                        <Heart size={18} />
                      </button>
                      <button onClick={() => setShowAddToPlaylistModal(t)} title="Adicionar à playlist">
                        <Plus size={18} />
                      </button>
                      <button
                        className="rowPlay"
                        onClick={() => {
                          setQueue(results);
                          p.play(t);
                        }}
                        title="Tocar"
                      >
                        <Play size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                {!results.length && !loading && (
                  <div className="empty">
                    <Music2 size={40} />
                    <p style={{ marginTop: 12 }}>Nenhuma música encontrada aqui ainda.</p>
                  </div>
                )}
              </>
            )}
          </section>
        </main>

        {/* Invisible background audio engine (pure audio, never opens any video window) */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            right: 0,
            width: '200px',
            height: '200px',
            opacity: 0.0001,
            pointerEvents: 'none',
            zIndex: -9999,
            overflow: 'hidden'
          }}
          aria-hidden="true"
        >
          <iframe
            id="yt-embed-player"
            onLoad={e => {
              try {
                e.target.contentWindow?.postMessage(
                  JSON.stringify({ event: 'listening', id: 1 }),
                  '*'
                );
              } catch {}
            }}
            src={
              p.mode === 'yt' && p.track?.youtubeId
                ? `https://www.youtube.com/embed/${p.track.youtubeId}?autoplay=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
                : 'about:blank'
            }
            title="Audio Stream"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            tabIndex={-1}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        </div>

        <footer>
          {p.track ? (
            <>
              <img src={art(p.track)} alt="" />
              <div className="now">
                <b>{p.track.title}</b>
                <span>{p.track.user?.name || p.track.artist || 'Artista'}</span>
                {p.loadingTrack && (
                  <span style={{ fontSize: 11, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={10} className="spin" /> Carregando áudio completo...
                  </span>
                )}
              </div>
              <button
                onClick={() => p.setShuffle(!p.shuffle)}
                className={p.shuffle ? 'active' : ''}
                title="Aleatório"
              >
                <Shuffle size={18} />
              </button>
              <button onClick={p.previous} title="Anterior">
                <SkipBack size={20} />
              </button>
              <button className="mainplay" onClick={p.togglePlay} title="Play/Pause">
                {p.playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button onClick={p.next} title="Próxima">
                <SkipForward size={20} />
              </button>
              <button
                onClick={() => p.setRepeat(!p.repeat)}
                className={p.repeat ? 'active' : ''}
                title="Repetir"
              >
                <Repeat size={18} />
              </button>
              <span className="time-cur">{fmt(p.time)}</span>
              <input
                className="range"
                type="range"
                min="0"
                max={Math.max(1, Math.round(p.dur || 1))}
                step="0.5"
                value={Math.min(Math.round(p.dur || 1), Math.max(0, p.time))}
                onChange={e => p.seek(+e.target.value)}
              />
              <span className="time-dur">{fmt(p.dur)}</span>
              <Volume2 size={20} />
              <input
                className="vol"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={p.vol}
                onChange={e => p.changeVol(+e.target.value)}
              />
              <audio
                ref={p.ref}
                src={p.src}
                onError={() => {
                  console.warn('Audio playback error, switching to alternative stream');
                  if (p.track) p.fallbackToYouTube(p.track);
                }}
              />
            </>
          ) : (
            <span className="emptyPlayer">Escolha uma música para começar a ouvir</span>
          )}
        </footer>

        {/* Modal: Create New Playlist */}
        {newPlaylistModal && (
          <div className="modal-overlay" onClick={() => setNewPlaylistModal(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 20 }}>Nova Playlist</h3>
                <button
                  onClick={() => setNewPlaylistModal(false)}
                  style={{ background: 'transparent', border: 0, color: '#888', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>
              <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>
                Dê um nome para a sua nova playlist:
              </p>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  createNewPlaylist(newPlaylistName);
                }}
              >
                <input
                  autoFocus
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  placeholder="Ex: Pagode 90, Treino Pesado, Relaxar..."
                  style={{
                    width: '100%',
                    background: '#0d0d12',
                    border: '1px solid #363644',
                    borderRadius: 10,
                    padding: '12px 14px',
                    color: '#fff',
                    fontSize: 15,
                    marginBottom: 20
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setNewPlaylistModal(false)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #333',
                      color: '#bbb',
                      borderRadius: 20,
                      padding: '9px 18px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      background: '#a855f7',
                      border: 0,
                      color: '#fff',
                      borderRadius: 20,
                      padding: '9px 20px',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    Criar Playlist
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add track to playlist */}
        {showAddToPlaylistModal && (
          <div className="modal-overlay" onClick={() => setShowAddToPlaylistModal(null)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>Adicionar à Playlist</h3>
                <button
                  onClick={() => setShowAddToPlaylistModal(null)}
                  style={{ background: 'transparent', border: 0, color: '#888', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#0e0e13', borderRadius: 10, marginBottom: 18 }}>
                <img src={art(showAddToPlaylistModal)} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />
                <div style={{ overflow: 'hidden' }}>
                  <b style={{ display: 'block', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {showAddToPlaylistModal.title}
                  </b>
                  <span style={{ color: '#888', fontSize: 12 }}>
                    {showAddToPlaylistModal.user?.name || showAddToPlaylistModal.artist || 'Artista'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  createNewPlaylist('', showAddToPlaylistModal);
                }}
                style={{
                  width: '100%',
                  background: '#22192c',
                  border: '1px dashed #59357d',
                  borderRadius: 10,
                  padding: '12px',
                  color: '#d8b4fe',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 16
                }}
              >
                <FolderPlus size={18} /> + Criar Nova Playlist com esta música
              </button>

              <div className="sideTitle" style={{ margin: '10px 0 8px', padding: 0 }}>Suas Playlists</div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {playlists.length > 0 ? (
                  playlists.map(pl => {
                    const alreadyIn = pl.tracks.some(t => t.id === showAddToPlaylistModal.id);
                    return (
                      <button
                        key={pl.id}
                        onClick={() => addToPlaylist(pl.id, showAddToPlaylistModal)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#111116',
                          border: '1px solid #252530',
                          borderRadius: 8,
                          padding: '10px 14px',
                          marginBottom: 8,
                          color: '#fff',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div>
                          <b style={{ display: 'block', fontSize: 14 }}>{pl.name}</b>
                          <span style={{ color: '#888', fontSize: 12 }}>{pl.tracks.length} músicas</span>
                        </div>
                        {alreadyIn ? (
                          <span style={{ color: '#a855f7', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Check size={14} /> Na playlist
                          </span>
                        ) : (
                          <Plus size={16} color="#aaa" />
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="muted" style={{ fontSize: 13, textAlign: 'center', margin: '14px 0' }}>
                    Nenhuma playlist criada ainda. Use o botão acima para criar uma!
                  </p>
                )}
              </div>

              <div style={{ borderTop: '1px solid #242430', paddingTop: 14, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    save(showAddToPlaylistModal);
                    setShowAddToPlaylistModal(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #333',
                    color: '#bbb',
                    borderRadius: 18,
                    padding: '8px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Salvar na Biblioteca Geral
                </button>
                <button
                  onClick={() => setShowAddToPlaylistModal(null)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function ImportPanel({ onImport, onPlay }) {
  const [clientId, setClientId] = useState(
    () => localStorage.getItem('pm-spotify-client-id') || ''
  );
  const [user, setUser] = useState(() => getStoredJSON('pm-spotify-user', null));
  const [url, setUrl] = useState('');
  const [textList, setTextList] = useState('');
  const [textPlaylistName, setTextPlaylistName] = useState('Minha Playlist');
  const [tracks, setTracks] = useState([]);
  const [playlistMeta, setPlaylistMeta] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [found, setFound] = useState(null);
  const [mode, setMode] = useState('url'); // 'url' | 'text' | 'developer'

  // Handle Spotify OAuth Callback safely
  useEffect(() => {
    try {
      const u = new URLSearchParams(window.location.search);
      const code = u.get('code');
      const state = u.get('state');
      const saved = getStoredJSON('pm-spotify-pkce', null);

      if (!code || !saved || state !== saved.state) return;

      (async () => {
        setBusy(true);
        setStatus('Autenticando com Spotify...');
        try {
          const body = new URLSearchParams({
            client_id: saved.clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: window.location.origin + window.location.pathname,
            code_verifier: saved.verifier
          });
          const r = await fetch(SA + '/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
          });
          const j = await r.json();
          if (!j.access_token) {
            throw new Error(j.error_description || j.error || 'Token inválido');
          }
          localStorage.setItem('pm-spotify-access-token', j.access_token);
          if (j.refresh_token) localStorage.setItem('pm-spotify-refresh-token', j.refresh_token);
          localStorage.setItem(
            'pm-spotify-expires-at',
            String(Date.now() + (j.expires_in || 3600) * 1000)
          );
          const me = await fetch(SP + '/me', {
            headers: { Authorization: 'Bearer ' + j.access_token }
          }).then(res => res.json());
          localStorage.setItem('pm-spotify-user', JSON.stringify(me));
          setUser(me);
          setStatus('Spotify conectado com sucesso!');
          window.history.replaceState({}, '', window.location.pathname);
        } catch (e) {
          console.error('Spotify OAuth error:', e);
          setStatus('Falha ao conectar ao Spotify: ' + (e.message || 'Verifique o Client ID.'));
        } finally {
          setBusy(false);
        }
      })();
    } catch (err) {
      console.error('Callback parsing error:', err);
    }
  }, []);

  const login = async () => {
    const cid = clientId.trim();
    if (!cid) {
      setStatus('Por favor, digite seu Spotify Client ID.');
      return;
    }
    try {
      localStorage.setItem('pm-spotify-client-id', cid);
      const x = await pkce();
      const state = generateUUID();
      sessionStorage.setItem(
        'pm-spotify-pkce',
        JSON.stringify({ verifier: x.verifier, state, clientId: cid })
      );
      const redirectUri = window.location.origin + window.location.pathname;
      const authUrl =
        SA +
        '/authorize?' +
        new URLSearchParams({
          client_id: cid,
          response_type: 'code',
          redirect_uri: redirectUri,
          code_challenge_method: 'S256',
          code_challenge: x.challenge,
          state,
          scope:
            'playlist-read-private playlist-read-collaborative user-read-private user-read-email streaming'
        });
      window.location.href = authUrl;
    } catch (err) {
      setStatus('Erro ao iniciar login Spotify: ' + err.message);
    }
  };

  const logout = () => {
    [
      'pm-spotify-access-token',
      'pm-spotify-refresh-token',
      'pm-spotify-expires-at',
      'pm-spotify-user'
    ].forEach(k => localStorage.removeItem(k));
    setUser(null);
    setStatus('Spotify desconectado.');
  };

  // Direct Spotify Playlist fetch (Safe multi-layer resolver)
  const read = async () => {
    const id = playlistId(url);
    if (!id) {
      setStatus('Cole um link ou ID válido do Spotify (ex: https://open.spotify.com/playlist/...)');
      return;
    }

    setBusy(true);
    setStatus('Obtendo faixas da playlist...');
    setTracks([]);
    setPlaylistMeta(null);

    const tk = localStorage.getItem('pm-spotify-access-token');

    // Method 1: If authenticated with Spotify API token
    if (tk) {
      try {
        let offset = 0;
        let allTracks = [];
        while (true) {
          const res = await fetch(
            SP + '/playlists/' + id + '/items?limit=50&offset=' + offset + '&market=BR',
            { headers: { Authorization: 'Bearer ' + tk } }
          );
          if (res.status === 401) throw new Error('auth_expired');
          if (!res.ok) throw new Error('api_error');
          const data = await res.json();
          const items = (data.items || [])
            .map(x => x.item || x.track)
            .filter(t => t && t.type === 'track')
            .map((t, idx) => ({
              id: t.id || 'sp_' + (offset + idx),
              name: t.name,
              title: t.name,
              artists: t.artists || [],
              artist: t.artists?.map(a => a.name).join(', ') || 'Artista',
              album: t.album,
              image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url,
              previewUrl: t.preview_url || null,
              duration: t.duration_ms ? Math.floor(t.duration_ms / 1000) : 0,
              spotifyUri: t.uri
            }));
          allTracks = allTracks.concat(items);
          if (!data.next || allTracks.length >= 200) break;
          offset += 50;
        }
        setTracks(allTracks);
        setStatus(`${allTracks.length} faixas carregadas via Spotify API!`);
        setBusy(false);
        return;
      } catch (e) {
        if (e.message === 'auth_expired') {
          setStatus('Sessão expirada. Tentando modo direto...');
        }
      }
    }

    // Method 2: Internal /api/spotify-playlist proxy (Vite dev server + Cloudflare Pages Function)
    try {
      const apiRes = await fetch(`/api/spotify-playlist?id=${encodeURIComponent(id)}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.tracks && data.tracks.length > 0) {
          setTracks(data.tracks);
          setPlaylistMeta({ name: data.name, image: data.image });
          setStatus(`${data.tracks.length} faixas carregadas com sucesso de "${data.name}"!`);
          setBusy(false);
          return;
        }
      }
    } catch (err) {
      console.warn('/api/spotify-playlist proxy failed:', err);
    }

    // Method 3: Fallback CORS proxies
    const corsProxies = [
      u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
      u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
    ];

    const embedUrl = `https://open.spotify.com/embed/playlist/${id}`;

    for (const makeProxy of corsProxies) {
      try {
        setStatus('Carregando via serviço alternativo...');
        const proxyUrl = makeProxy(embedUrl);
        const res = await fetch(proxyUrl);
        if (!res.ok) continue;
        const html = await res.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (match && match[1]) {
          const nextData = JSON.parse(match[1]);
          const entity = nextData?.props?.pageProps?.state?.data?.entity;
          const trackList = entity?.trackList || nextData?.props?.pageProps?.initialData?.tracks || [];
          if (trackList.length > 0) {
            const coverImage = entity?.coverArt?.sources?.[0]?.url || entity?.visualIdentity?.image?.[0]?.url || '';
            const parsed = trackList.map((t, idx) => ({
              id: t.uri ? t.uri.replace('spotify:track:', '') : 'sp_' + idx,
              name: t.title || t.name,
              title: t.title || t.name,
              artist: t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : 'Artista'),
              duration: t.duration ? Math.floor(t.duration / 1000) : 0,
              previewUrl: t.audioPreview?.url || null,
              image: coverImage,
              spotifyUri: t.uri || `spotify:track:${t.id}`
            }));
            setTracks(parsed);
            setPlaylistMeta({ name: entity?.name || entity?.title || 'Playlist Spotify', image: coverImage });
            setStatus(`${parsed.length} faixas carregadas com sucesso!`);
            setBusy(false);
            return;
          }
        }
      } catch (proxyErr) {
        console.warn('Fallback proxy error:', proxyErr);
      }
    }

    setStatus(
      'Não foi possível extrair a playlist automaticamente agora. Você pode usar a aba "Colar Lista de Músicas" para importar suas músicas diretamente!'
    );
    setBusy(false);
  };

  // Convert Spotify tracks into playable stream items with full audio
  const resolve = async () => {
    if (!tracks.length) return;
    setBusy(true);
    setStatus('Importando músicas com áudio completo...');

    const mapped = tracks.map((t, idx) => ({
      id: t.id || 'tr_' + idx,
      title: t.name || t.title,
      user: { name: t.artist || t.artists?.[0]?.name || 'Artista' },
      duration: t.duration || 190,
      artwork: { '_480x480': t.image || art({}) },
      spotifyUri: t.spotifyUri,
      sourceUrl: null
    }));

    setBusy(false);
    onImport(mapped, true, {
      name: playlistMeta?.name || 'Playlist Spotify',
      image: playlistMeta?.image || mapped[0]?.artwork?.['_480x480']
    });
    setStatus(`Playlist "${playlistMeta?.name || 'Spotify'}" salva como playlist na sua biblioteca!`);
  };

  // Import raw text list of songs with full audio
  const importFromText = async () => {
    if (!textList.trim()) {
      setStatus('Cole ao menos o nome de uma música.');
      return;
    }

    const lines = textList
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2);

    if (!lines.length) return;

    setBusy(true);
    setStatus(`Adicionando ${lines.length} músicas com áudio completo...`);

    const mapped = lines.map((line, idx) => {
      const parts = line.split('-').map(s => s.trim());
      const artistPart = parts.length > 1 ? parts[0] : '';
      const titlePart = parts.length > 1 ? parts.slice(1).join(' - ') : line;
      return {
        id: 'txt_' + idx + '_' + Date.now(),
        title: titlePart,
        user: { name: artistPart || 'Artista' },
        duration: 200,
        artwork: { '_480x480': art({}) },
        sourceUrl: null
      };
    });

    setBusy(false);
    onImport(mapped, true, {
      name: textPlaylistName.trim() || 'Minha Playlist Importada',
      image: mapped[0]?.artwork?.['_480x480']
    });
    setStatus(`Playlist "${textPlaylistName.trim() || 'Minha Playlist Importada'}" salva na sua biblioteca!`);
  };

  const find = async () => {
    if (!artist || !title) return;
    setStatus('Procurando áudio completo...');
    try {
      const audiusHit = await resolveAudiusTrack(artist, title);
      if (audiusHit && audiusHit.sourceUrl) {
        const hit = {
          id: audiusHit.id,
          sourceUrl: audiusHit.sourceUrl,
          title: title || audiusHit.title,
          user: { name: artist },
          duration: audiusHit.duration || 210,
          artwork: audiusHit.artwork || { '_480x480': art({}) }
        };
        setFound(hit);
        setStatus('Música encontrada com sucesso (áudio completo Audius)!');
        return;
      }
    } catch {}

    try {
      const res = await fetch(`/api/full-audio?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.videoId) {
          const hit = {
            id: 'yt_' + data.videoId,
            youtubeId: data.videoId,
            title: title || data.title,
            user: { name: artist },
            duration: data.duration || 210,
            artwork: { '_480x480': `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg` }
          };
          setFound(hit);
          setStatus('Música encontrada com sucesso (áudio completo YouTube)!');
          return;
        }
      }
    } catch {}

    setStatus('Nenhuma gravação compatível encontrada.');
  };

  return (
    <div>
      <h1>Importar Músicas & Playlists</h1>

      <div className="importCard">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => setMode('url')}
            className={mode === 'url' ? 'on' : ''}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: '1px solid #333',
              background: mode === 'url' ? '#a855f7' : '#1e1e24',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Link size={16} /> Link de Playlist Spotify
          </button>
          <button
            onClick={() => setMode('text')}
            className={mode === 'text' ? 'on' : ''}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: '1px solid #333',
              background: mode === 'text' ? '#a855f7' : '#1e1e24',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <FileText size={16} /> Colar Lista de Músicas
          </button>
          <button
            onClick={() => setMode('developer')}
            className={mode === 'developer' ? 'on' : ''}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: '1px solid #333',
              background: mode === 'developer' ? '#a855f7' : '#1e1e24',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <LogIn size={16} /> Spotify Developer (Login)
          </button>
        </div>

        {/* Tab 1: Direct Spotify Playlist Link */}
        {mode === 'url' && (
          <div>
            <h2>Importar Playlist do Spotify</h2>
            <p>
              Cole o link de qualquer playlist do Spotify (pública ou aberta) para carregar todas as faixas sem precisar fazer login.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="Ex: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
                style={{ flex: 1, margin: 0 }}
                onKeyDown={e => e.key === 'Enter' && read()}
              />
              <button onClick={read} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {busy ? <RefreshCw size={18} className="spin" /> : <Download size={18} />}
                Carregar
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Paste Song List (Text Mode) */}
        {mode === 'text' && (
          <div>
            <h2>Colar Lista de Músicas</h2>
            <p>
              Copie e cole uma lista de músicas (uma por linha) e nós salvaremos como uma nova playlist com áudio completo:
            </p>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, color: '#aaa', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Nome da Playlist:
              </label>
              <input
                value={textPlaylistName}
                onChange={e => setTextPlaylistName(e.target.value)}
                placeholder="Ex: Treino Pesado, Pagode 90, Favoritas..."
                style={{
                  width: '100%',
                  background: '#0e0e11',
                  border: '1px solid #303039',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: 14,
                  marginBottom: 14
                }}
              />
            </div>
            <label style={{ fontSize: 13, color: '#aaa', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Músicas (uma por linha):
            </label>
            <textarea
              rows={5}
              value={textList}
              onChange={e => setTextList(e.target.value)}
              placeholder={'Exemplo:\nMiley Cyrus - Flowers\nAlok - Hear Me Now\nVintage Culture - In The Dark'}
              style={{
                width: '100%',
                background: '#0e0e11',
                border: '1px solid #303039',
                borderRadius: 10,
                padding: 12,
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: 14,
                marginBottom: 14,
                resize: 'vertical'
              }}
            />
            <button
              onClick={importFromText}
              disabled={busy}
              style={{
                background: '#a855f7',
                color: '#fff',
                border: 'none',
                borderRadius: 22,
                padding: '10px 20px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {busy ? <RefreshCw size={18} className="spin" /> : <Sparkles size={18} />}
              Salvar Playlist e Ouvir
            </button>
          </div>
        )}

        {/* Tab 3: Spotify Developer PKCE */}
        {mode === 'developer' && (
          <div>
            <h2>Spotify Developer (PKCE)</h2>
            <p>Conecte sua conta do Spotify via Client ID para ler suas playlists privadas sem expor o Client Secret.</p>
            <div className="importGrid" style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
              <input
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Cole seu Spotify Client ID"
                style={{ flex: 1, margin: 0 }}
              />
              <button onClick={user ? logout : login} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {user ? (
                  <>
                    <LogOut size={18} /> Desconectar ({user.display_name || 'Conta'})
                  </>
                ) : (
                  <>
                    <LogIn size={18} /> Conectar Spotify
                  </>
                )}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Redirect URI cadastrada no Spotify Dashboard: <b>{window.location.origin + window.location.pathname}</b>
            </p>
            {user && (
              <div style={{ marginTop: 14 }}>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="Link da playlist do Spotify"
                  style={{ width: '100%', marginBottom: 10 }}
                />
                <button onClick={read} disabled={busy}>
                  {busy ? <RefreshCw size={18} /> : <Download size={18} />} Ler playlist da conta
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status Message */}
        {status && (
          <p
            style={{
              marginTop: 14,
              color: status.includes('Falha') || status.includes('Erro') || status.includes('Não foi possível') ? '#f87171' : '#a855f7',
              fontWeight: 600
            }}
          >
            {status}
          </p>
        )}

        {/* Loaded Playlist Tracks Result */}
        {tracks.length > 0 && (
          <div style={{ marginTop: 24, background: '#0e0e12', padding: 18, borderRadius: 14, border: '1px solid #23232c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {playlistMeta?.image && (
                  <img src={playlistMeta.image} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{playlistMeta?.name || 'Faixas da Playlist'}</h3>
                  <span style={{ color: '#888', fontSize: 13 }}>{tracks.length} músicas carregadas</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={resolve}
                  disabled={busy}
                  style={{
                    background: '#a855f7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 20,
                    padding: '9px 18px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Play size={16} />
                  {busy ? 'Importando...' : 'Importar e Tocar Playlist'}
                </button>
                <button
                  onClick={() => {
                    const mapped = tracks.map((t, idx) => ({
                      id: t.id || 'tr_' + idx,
                      title: t.name || t.title,
                      user: { name: t.artist || t.artists?.[0]?.name || 'Artista' },
                      duration: t.duration || 190,
                      artwork: { '_480x480': t.image || art({}) },
                      spotifyUri: t.spotifyUri,
                      sourceUrl: null
                    }));
                    onImport(mapped, false, {
                      name: playlistMeta?.name || 'Playlist Spotify',
                      image: playlistMeta?.image || mapped[0]?.artwork?.['_480x480']
                    });
                    setStatus(`Playlist "${playlistMeta?.name || 'Playlist Spotify'}" salva com sucesso!`);
                  }}
                  style={{
                    background: '#22222b',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: 20,
                    padding: '9px 18px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <ListMusic size={16} /> Salvar como Playlist
                </button>
              </div>
            </div>

            <div className="tracks" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {tracks.map((t, idx) => (
                <div className="track" key={`import_${t.id || 'tr'}_${idx}`}>
                  <img src={art(t)} alt="" />
                  <div className="meta">
                    <b>{t.name || t.title}</b>
                    <span>{t.artist || t.artists?.[0]?.name || 'Artista'}</span>
                  </div>
                  <span className="dur">{fmt(t.duration || 190)}</span>
                  <button
                    onClick={() => {
                      const singleTrack = {
                        id: t.id || 'tr_' + idx,
                        title: t.name || t.title,
                        user: { name: t.artist || t.artists?.[0]?.name || 'Artista' },
                        duration: t.duration || 190,
                        artwork: { '_480x480': t.image || art({}) },
                        spotifyUri: t.spotifyUri,
                        sourceUrl: null
                      };
                      onImport([singleTrack], false);
                    }}
                    title="Adicionar à Biblioteca"
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    className="rowPlay"
                    onClick={() => {
                      const item = {
                        id: t.id || 'tr_' + idx,
                        title: t.name || t.title,
                        user: { name: t.artist || t.artists?.[0]?.name || 'Artista' },
                        duration: t.duration || 190,
                        artwork: { '_480x480': t.image || art({}) },
                        spotifyUri: t.spotifyUri,
                        sourceUrl: null
                      };
                      onPlay(item);
                    }}
                    title="Tocar música completa"
                  >
                    <Play size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <hr style={{ margin: '28px 0', borderColor: '#292930' }} />

        {/* Quick Individual Song Search */}
        <h2>Buscar Música Individual</h2>
        <div style={{ display: 'flex', gap: 10, margin: '14px 0', flexWrap: 'wrap' }}>
          <input
            value={artist}
            onChange={e => setArtist(e.target.value)}
            placeholder="Artista (Ex: Alok, Matuê)"
            style={{ flex: 1, minWidth: 160, margin: 0 }}
          />
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Música (Ex: Hear Me Now, Anos Luz)"
            style={{ flex: 1, minWidth: 160, margin: 0 }}
          />
          <button onClick={find} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={18} /> Buscar
          </button>
        </div>

        {found && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#1c1c22', padding: 12, borderRadius: 12, marginTop: 12 }}>
            <img src={art(found)} alt="" style={{ width: 50, height: 50, borderRadius: 8, objectFit: 'cover' }} />
            <div style={{ flex: 1 }}>
              <b>{found.title}</b>
              <div style={{ color: '#888', fontSize: 13 }}>{found.user?.name}</div>
            </div>
            <button
              onClick={() => {
                onImport([found], true);
              }}
              style={{
                background: '#a855f7',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                padding: '8px 16px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Play size={16} /> Tocar Agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
