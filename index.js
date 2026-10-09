require('dotenv').config();
const Kuroshiro = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { solveChallenge } = require('./utils/challengesolver.js');

const REDIRECT_URI = 'http://127.0.0.1:8888/callback';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 8888;
const kuroshiro = new Kuroshiro();

kuroshiro.init(new KuromojiAnalyzer())
    .then(() => {
        isKuroshiroReady = true;
        console.log('[Hispot] Kuroshiro Japanese Analyzer is ready.');
    })
    .catch(err => {
        console.error('[Hispot] Failed to initialize Kuroshiro:', err.message);
    });

let isKuroshiroReady = false;
let spotifyAccessToken = '';
let spotifyRefreshToken = '';
let refreshPromise = null;
let isPolling = false;
let currentTrackId = '';
let pollingInterval = null;

let cacheSetting = 'caching';
let translationLanguage = 'en';

let lyricsCache = new Map();

async function translateLyrics(songData, targetLanguage) {
    const lines = songData.lyrics.trim().split('\n');
    const timestamps = [];
    const textLines = [];

    for (const line of lines) {
        const match = line.match(/^(\[\d{2}:\d{2}\.\d{2}\])\s*(.*)$/);
        if (match) {
        timestamps.push(match[1]);
        textLines.push(match[2] || '');
        } else {
        timestamps.push('');
        textLines.push(line);
        }
    }

    let translatedLyrics = songData.lyrics;

    try {
        const url = `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_API_KEY}`;

        const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            q: textLines,
            target: targetLanguage,
            format: 'text'
        })
        });

        if (!response.ok) {
            throw new Error(`Google API ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        const translatedResults = data.data.translations.map((t) => t.translatedText);

        translatedLyrics = timestamps
        .map((timestamp, index) => {
            const translatedLine = translatedResults[index] || textLines[index];
            return timestamp ? `${timestamp} ${translatedLine}` : translatedLine;
        })
        .join('\n');

    } catch (error) {
        console.error('Error while translating:', error.message);
    }

    return translatedLyrics;
}

function initCache() {
    if (fs.existsSync('cache.json')) {
        try {
            const readLyricsCache = fs.readFileSync('cache.json', 'utf-8');
            const readData = JSON.parse(readLyricsCache);
            lyricsCache = new Map(readData);
            console.log('[Hispot] Cache file retrieved successfully.')
        } catch (err) {
            console.error('[Hispot] Error parsing cache.json, initializing empty cache:', err.message);
            resetCacheFile();
        }
    } else {
        console.log('[Hispot] Cache file was not found. Creating a new one...');
        resetCacheFile();
    }
}

const settingsPath = path.join(__dirname, 'config', 'settings.json');

function initPreferences() {
    if (!fs.existsSync(settingsPath)) {
        console.warn('[Hispot] settings.json not found at', settingsPath);
        return;
    }

    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const cacheEntry = settings.find(s => 'cache-storing' in s);
        const translationLanguageEntry = settings.find(s => 'translation-language' in s);
        if (cacheEntry) cacheSetting = cacheEntry['cache-storing'];
        if (translationLanguageEntry) translationLanguage = translationLanguageEntry['translation-language'];

        console.log('[Hispot] Preferences loaded. Cache setting =', cacheSetting);
        console.log('[Hispot] Preferences loaded. Translation language =', translationLanguage);
    } catch (err) {
        console.error('[Hispot] Preferences could not be initialized.', err.message);
    }
}

const TOKEN_PATH = path.join(__dirname, 'spotify_token.json');

app.use(express.static(path.join(__dirname, 'public')));

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, application/xhtml+xml, */*',
    'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7'
};

function loadSavedToken() {
    if (fs.existsSync(TOKEN_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            if (data.refresh_token) {
                spotifyRefreshToken = data.refresh_token;
                console.log('[Hispot] Saved token found. Updating session...');
                refreshAccessToken();
                startPolling();
                return true;
            }
        } catch (err) {
            console.error('[Hispot] Error reading saved token:', err.message);
        }
    }
    return false;
}

function resetCacheFile() {
    fs.writeFileSync('cache.json', JSON.stringify([]));
    lyricsCache = new Map();
}

async function refreshAccessToken() {

    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: spotifyRefreshToken
            });

            const response = await axios.post(
                'https://accounts.spotify.com/api/token',
                params.toString(),
                { headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString('base64'),
                    ...defaultHeaders
                }, httpsAgent: httpsAgent }
            );

            spotifyAccessToken = response.data.access_token;

            if (response.data.refresh_token) {
                spotifyRefreshToken = response.data.refresh_token;
                fs.writeFileSync(TOKEN_PATH, JSON.stringify({
                    refresh_token: spotifyRefreshToken
                }), 'utf8');
            }
            console.log('[Hispot] Session restored successfully.', new Date().toISOString());

            io.emit('auth_success');

        } catch (err) {
            console.error('[Hispot] Error renewing expired token:', err.response ? err.response.data : err.message);

            stopPolling();
            spotifyAccessToken = '';
            spotifyRefreshToken = '';

            if (fs.existsSync(TOKEN_PATH)) {
                fs.unlinkSync(TOKEN_PATH);
            }
            console.log('[Hispot] Por favor, faça login novamente em http://127.0.0.1:8888/login');
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

const generateRandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let randomstring = '';
    for (let i = 0; i < length; i++) {
        randomstring += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return randomstring;
}

function sanitizeMetadata(text) {
    if (!text) return '';
    return text
        .replace(/\s*-\s*Single/gi, '')
        .replace(/\s*-\s*Live/gi, '')
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\s*\(.*?\)/g, '')
        .replace(/\s+-\s+.*/g, '') 
        .trim();
}

async function getLrcLyrics(songTitle, artistName, durationMs) {
    try {
        const cleanTitle = sanitizeMetadata(songTitle);
        const cleanArtistName = sanitizeMetadata(artistName);
        const duration_sec = durationMs / 1000;

        const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtistName)}&track_name=${encodeURIComponent(cleanTitle)}&duration=${encodeURIComponent(duration_sec)}`;
        const response = await axios.get(url, {
            headers: defaultHeaders,
            timeout: 10000,
            httpsAgent: httpsAgent
        });
        
        if (response.data) {
            if (response.data.syncedLyrics) {
                return { isSynced: true, lyrics: response.data.syncedLyrics };
            } else if (response.data.plainLyrics) {
                return { isSynced: false, lyrics: response.data.plainLyrics };
            }
        }
    } catch (err) {
        if (err.response && err.response.status === 404) {
            console.log('[Hispot] No lyrics found on LRClib for this song. Searching on Genius...');
        } else {
            console.error('[Hispot] Error on LRClib search:', err.message);
        }
    }
    return null;
}

async function searchSong(songTitle, artistName) {
    let cleanTitle = sanitizeMetadata(songTitle);
    let cleanArtistName = sanitizeMetadata(artistName);

    const query = `${cleanTitle} ${cleanArtistName}`;
    const url = `https://api.genius.com/search?q=${encodeURIComponent(query)}`; 
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${process.env.GENIUS_TOKEN}`,
            ...defaultHeaders
            }, httpsAgent: httpsAgent
        });
        const hits = response.data.response.hits;
        if (hits.length === 0) return null;
        return hits[0].result.url; 
    } catch (err) {
        console.error('Error:', err.message);
        return null;
    }
}

async function getLyrics(songUrl) {
    try {
        const { data: html } = await axios.get(songUrl, {
            headers: defaultHeaders,
            httpsAgent: httpsAgent
        });
        const $ = cheerio.load(html);
        let lyrics = '';
        $('[data-lyrics-container="true"]').each((index, element) => {
            $(element).find('br').replaceWith('\n');
            lyrics += $(element).text() + '\n\n';
        });
        return lyrics.trim();
    } catch (err) {
        console.error('Error:', err.message);
        return null;
    }
}

function kbCache(map) {
    let bytes = 0;
    
    for (let [chave, valor] of map) {
        bytes += String(chave).length * 2;
        bytes += JSON.stringify(valor).length * 2;
    }
    const kilobytes = bytes / 1024;
    return kilobytes.toFixed(2);
}

async function currentSong(forceRefetch = false) {

    if (!spotifyAccessToken || refreshPromise) return;
    if (isPolling) return;
    isPolling = true;

    try { 
        console.log('[Hispot DEBUG] token no momento do request:', spotifyAccessToken ? `presente (len ${spotifyAccessToken.length})` : 'VAZIO');
        const url = 'https://api.spotify.com/v1/me/player/currently-playing';

        const response = await axios.get(url, { 
            headers: { 
                'Authorization': `Bearer ${spotifyAccessToken}`,
                ...defaultHeaders
            }, httpsAgent: httpsAgent
        });


        if (response.status === 204 || !response.data || !response.data.item) {
            io.emit('player_state', { playing: false });
            isPolling = false;
            return;
        }

        const track = response.data.item;
        const trackId = track.id;
        const songTitle = track.name;
        const artistName = track.artists[0].name;
        const albumName = track.album.name;
        const albumCover = track.album.images[0]?.url || '';
        const progressMs = response.data.progress_ms;
        const isPlaying = response.data.is_playing;
        const durationMs = track.duration_ms;

        io.emit('player_tick', {
            progress_ms: progressMs,
            is_playing: isPlaying,
            duration_ms: durationMs
        });

        if (trackId !== currentTrackId || forceRefetch) {
            currentTrackId = trackId;
            console.log(`- Now playing: ${songTitle} - ${artistName}${forceRefetch ? ' (FORCE REFETCH)' : ''}`);

            if (forceRefetch && lyricsCache.has(trackId)) {
                console.log(`[Hispot Cache] Apagando item do cache para refetch: ${songTitle}`);
                lyricsCache.delete(trackId);
                
                const lyricsCacheJson = Array.from(lyricsCache.entries());
                fs.writeFileSync('cache.json', JSON.stringify(lyricsCacheJson, null, 2));
            }

            io.emit('track_changed', {
                title: songTitle,
                artist: artistName,
                album: albumName,
                cover: albumCover,
                lyrics: 'Searching lyrics...',
                durationMs: durationMs,
            });

            if (lyricsCache.has(trackId)) {
                console.log(`[Hispot] Lyrics retrieved instantly from cache for: ${songTitle}`);
                io.emit('lyrics_ready', lyricsCache.get(trackId));
            } else {
                console.log('[Hispot] Searching for lyrics on LRClib');
                let lyricsData = await getLrcLyrics(songTitle, artistName, durationMs);

                if (!lyricsData) {
                    const geniusUrl = await searchSong(songTitle, artistName);
                    let geniusLyrics = 'Lyrics not found for this one :(';
                    if (geniusUrl) {
                        geniusLyrics = await getLyrics(geniusUrl);
                    } else {
                        console.log("[Hispot] No lyrics found on Genius.");
                    }
                    
                    lyricsData = { isSynced: false, lyrics: geniusLyrics };
                }

                if (lyricsData && lyricsData.lyrics) {

                    lyricsData.romanized = lyricsData.lyrics;
                    lyricsData.translated = lyricsData.lyrics;

                    if (isKuroshiroReady) {
                        try {
                            console.log(`[Hispot] Romanizing lyrics for: ${songTitle}`);
                            lyricsData.romanized = await kuroshiro.convert(lyricsData.lyrics, { to: "romaji", mode: "normal" });
                        } catch (err) {
                            console.error('[Hispot] Error romanizing with Kuroshiro:', err.message);
                        }
                    }

                    console.log(`[Hispot] Translating lyrics for: ${songTitle}`);
                    const translated = await translateLyrics(lyricsData, translationLanguage);
                    lyricsData.translated = translated;
                }

                if (cacheSetting == 'caching') {
                    lyricsCache.set(trackId, lyricsData);
                    const lyricsCacheJson = Array.from(lyricsCache.entries());
                    fs.writeFileSync('cache.json', JSON.stringify(lyricsCacheJson, null, 2));
                    console.log('[Hispot] Lyrics have been saved on cache.');
                }

                io.emit('kb_cache', kbCache(lyricsCache));
                io.emit('lyrics_ready', lyricsData);
            }
        }

        isPolling = false;

    } catch (err) {

        if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') {
            isPolling = false;
            return;
        }

        if (err.response && err.response.status === 401 && spotifyRefreshToken) {

            console.log('[Hispot] Access token has expired. Renewing...', err.response.data);
            await refreshAccessToken();

            isPolling = false;
            if (spotifyAccessToken) {
                return currentSong();
            }

        } else {

            console.error('Error querying Spotify: ', err.message);
            isPolling = false;

        }
    }
}

async function getProfileData() {
    const url = 'https://api.spotify.com/v1/me';

    try {
        const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${spotifyAccessToken}`,
                    ...defaultHeaders
                }, httpsAgent: httpsAgent
            }
        )

        if (!response.data) {
            console.log('Something is wrong...')
        } else {
            io.emit('profile_info', response.data)
        }
    } catch (err) {
        console.error(err.response ? err.response.data : err.message)
    }
  
}

function startPolling() {
    if (!pollingInterval) {
        pollingInterval = setInterval(currentSong, 1200);
        currentSong();
    }
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function updatePreferences(preference, value) {
    try {
        const content = fs.readFileSync('config/settings.json', 'utf-8');
        const preferences = JSON.parse(content);

        let changed = false;

        preferences.forEach(index => {
            if (preference in index) {
                index[preference] = value;
                changed = true;
            }
        });

        if (!changed) {
            console.log('[Hispot] Key not found on Json.')
            return;
        }

        fs.writeFileSync('config/settings.json', JSON.stringify(preferences, null, 4), 'utf-8');
        console.log(`[Hispot] Key ${preference} changed to ${value}.`);
    } catch (err) {
        console.error('[Hispot] Error while reading or saving the file', err.message);
    }
}

async function requestChallenge() {
    const url = 'https://lrclib.net/api/request-challenge';

    try {

        const response = await axios.post(url, null,
            { headers: defaultHeaders }
        )

        if (response.status === 204 || !response.data) {
            console.log("[Hispot] Response for challenge doesn't exist")
            return;
        }

        return response.data

    } catch (err) {
        const errorMsg = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('[Hispot] Error requesting challenge:', errorMsg);
        return null;
    }
}

async function publishLyrics(publishToken, nonce, data) {
    const url = 'https://lrclib.net/api/publish'
    const songTitle = data?.trackName || 'Unknown Track';

    try {
        console.log("[Hispot] Publishing lyrics for:", songTitle)

        await axios.post(
            url,
            data, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Publish-Token': `${publishToken.prefix}:${nonce}`,
                    ...defaultHeaders
                }
            }
        )
        console.log("[Hispot] Lyrics published successfully.")

        if (currentTrackId) {
            lyricsCache.delete(currentTrackId); 
            currentTrackId = ''; 
        }

        await currentSong();

    } catch (err) {
        const errorDetails = err.response ? err.response.data : err.message;
        console.error('[Hispot] Error publishing lyrics:', errorDetails);
    }
}

app.get('/auth-check', (req, res) => {
    res.json({ loggedIn: spotifyAccessToken !== '' });
});

app.get('/login', function(req, res) {
    const state = generateRandomString(16);
    const scope = 'user-read-private user-read-email user-read-currently-playing user-modify-playback-state';
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
        state: state
    });
    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

app.get('/callback', async function(req, res) {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + new URLSearchParams({ error: 'state_mismatch' }).toString());
    } else {
        try {
            const params = new URLSearchParams({
                code: code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            });

            const response = await axios.post(
                'https://accounts.spotify.com/api/token',
                params.toString(),
                { 
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString('base64'),
                        ...defaultHeaders
                    }, 
                    httpsAgent: httpsAgent 
                }
            );

            spotifyAccessToken = response.data.access_token;
            spotifyRefreshToken = response.data.refresh_token;

            fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refresh_token: spotifyRefreshToken }), 'utf8');
            console.log('[Hispot] Session saved locally for future auto-logins.');

            res.redirect('/');
            startPolling();
        } catch (err) {
            console.error('Auth error:', err.response ? err.response.data : err.message);
            res.send('Error during authentication');
        }
    }
});

io.on('connection', (socket) => { 
    console.log('[Hispot] Web interface connected.');

    socket.emit('update_preferences', {
        preference: 'cache-storing',
        value: cacheSetting
    });
    
    socket.on('seek_request', (data) => {
        try {
            const position = typeof data === 'object' && data !== null ? data.position_ms : data;
            const solvedTime = Math.floor(Number(position));

            if (isNaN(solvedTime)) {
                console.error('[Hispot] Invalid seek position:', data);
                return;
            }

            async function seekToPositionPlayer(time) {
                const url = `https://api.spotify.com/v1/me/player/seek?position_ms=${time}`;

                try {
                    await axios.put(url, null, {
                        headers: {
                            'Authorization': `Bearer ${spotifyAccessToken}`,
                        ...defaultHeaders
                        }, httpsAgent: httpsAgent
                    });
                    console.log(`[Hispot] Seeked to ${time / 1000}s`);
                } catch (err) {
                    if (err.response) {
                        console.error('[Hispot] Erro da API do Spotify:', err.response.status, err.response.data);
                    } else {
                        console.error('[Hispot] Erro de requisição:', err.message);
                    }
                }
            }
            seekToPositionPlayer(solvedTime);
        } catch (err) {
            console.error('Erro geral no seek:', err.message);
        }
    })

    socket.on('publish_request', async (data) => {
        try {
            const publishToken = await requestChallenge()

            if (!publishToken) {
                console.log("[Hispot] Couldn't get publish token.")
                return;
            }

            const nonce = solveChallenge(publishToken.prefix, publishToken.target);

            await publishLyrics(publishToken, nonce, data);
            console.log("[Hispot] Publish request was sent.")
        } catch (err) {
            console.error('[Hispot] Publish error:', err.message);
        }
    })

    socket.on('cache_setting', (data) => {
        try {
            cacheSetting = data;
            updatePreferences('cache-storing', data);
        } catch (err) {
            console.error('[Hispot] Publish error:', err.message);
        }
    })

    socket.on('translation_language', (data) => {
        try {
            translationLanguage = data;
            updatePreferences('translation-language', data);
        } catch (err) {
            console.error('[Hispot] Publish error:', err.message);
        }
    })

    socket.on('cache_delete', () => {
        resetCacheFile()
        io.emit('kb_cache', kbCache(lyricsCache));
    })

    socket.on('refetch_lyrics', () => {
        console.log('[Hispot] Refresh solicitation sent from web interface');
        currentSong(true); 
    });
    
    if (spotifyAccessToken) {
        currentTrackId = '';
        currentSong();
        getProfileData();
        io.emit('kb_cache', kbCache(lyricsCache));
    }
});

server.listen(PORT, () => {
    const now = new Date();
    console.log(`\n[Hispot] Server started at ${now.toLocaleTimeString('pt-BR')}`);

    initCache();
    initPreferences();
    
    if (!loadSavedToken()) {
        console.log(`[Hispot] Access http://127.0.0.1:${PORT}/login to start`);
    }
});