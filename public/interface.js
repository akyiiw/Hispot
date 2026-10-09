const socket = io();

const titleEl = document.getElementById('track-title');
const artistEl = document.getElementById('track-artist');
const coverEl = document.getElementById('album-cover');
const lyricsEl = document.getElementById('lyrics-content');

const pinBtn = document.getElementById('pin-btn');

// menu
const menuOverlay = document.getElementById('menu-overlay');
const sideMenu = document.getElementById('side-menu');
const menuBtn = document.getElementById('menu-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const lrcBtn = document.getElementById('lrc-button');
const cacheBtn = document.getElementById('cache-button');
const preferencesBtn = document.getElementById('preferences-button')

const profileImg = document.getElementById('profile-picture');
const profileUsername = document.getElementById('profile-username');

// add lyrics
const lrcModal = document.getElementById('lrc-modal');
const lrcFillWithCurrentSongData = document.getElementById('fill-with-current-song-data');
const lrcInput = document.getElementById('lrc-file');
const saveLrcBtn = document.getElementById('save-lrc-btn');
const closeLrcBtn = document.getElementById('close-lrc-btn');

const fileLabelText = document.getElementById('file-label-text');
const lrcDurationInput = document.getElementById('lrc-duration');

// toggles
const lyricsStyle = document.querySelectorAll('.lyrics-style');
const caching = document.querySelectorAll('.caching');
const theme = document.querySelectorAll('.theme')
const translating = document.querySelectorAll('.translation')

// cache 1
const cacheModal = document.getElementById('cache-modal');
const eraseCacheBtn = document.getElementById('erase-cache-btn');
const closeCacheBtn = document.getElementById('close-cache-btn');

const kbCache = document.getElementById('kb-cache');

// cache 2
const eraseCacheConfirmationModal = document.getElementById('erase-cache-modal')
const confirmEraseCacheBtn = document.getElementById('confirm-erase-cache-btn')
const cancelCacheErasingBtn = document.getElementById('close-erase-cache-btn')

// preferences
const preferencesModal = document.getElementById('preferences-modal');
const closePreferencesBtn = document.getElementById('close-preferences-btn');

let songTitle;
let artistTitle;
let albumTitle;
let albumCover;
let songDuration;
let uploadedLrcContent = '';

if (lrcDurationInput) {
    lrcDurationInput.addEventListener('input', (event) => {
        const digitsOnly = event.target.value.replace(/\D/g, '');
        event.target.value = formatDurationDigits(digitsOnly);
    });

    lrcDurationInput.addEventListener('blur', (event) => {
        if (!event.target.value) return;
        const totalSeconds = durationTextToSeconds(event.target.value);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        event.target.value = `${mins}:${String(secs).padStart(2, '0')}`;
    });
}

function formatDuration(duration) {
    const durationSeconds = Math.max(0, Math.floor(Number(duration) || 0));
    
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

lrcInput.addEventListener('change', (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        uploadedLrcContent = e.target.result;
        console.log('File content read successfully.');

        if (fileLabelText) {
            fileLabelText.innerHTML = `<span class="material-symbols-outlined">description</span> ${file.name}`;
        }
    };

    reader.readAsText(file, 'UTF-8');
});

lyricsEl.addEventListener('click', seekToPosition);

window.addEventListener('keydown', (event) => {
    if (event.key === 'F11') {
        event.preventDefault(); 

        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
                .then(() => {
                    console.log("[Hispot] Hispot is now on fullscreen.");
                })
                .catch((err) => {
                    console.error(`Error on activating fullscreen mode: ${err.message}`);
                });
        } else {
            document.exitFullscreen();
        }
    }
});

function closeMenu() {
    sideMenu.classList.remove('open');
    menuOverlay.classList.remove('open');
}

menuBtn.addEventListener('click', () => {
    sideMenu.classList.add('open');
    menuOverlay.classList.add('open');
});

closeMenuBtn.addEventListener('click', closeMenu);
menuOverlay.addEventListener('click', closeMenu);

lrcBtn.addEventListener('click', () => {
    lrcModal.classList.add('open');
});

closeLrcBtn.addEventListener('click', () => {
    lrcModal.classList.remove('open');
});

lrcFillWithCurrentSongData.addEventListener('click', () => {
    document.getElementById('lrc-title').value = songTitle || '';
    document.getElementById('lrc-artist').value = artistTitle || '';
    document.getElementById('lrc-album').value = albumTitle || '';
    
    if (songDuration !== undefined) {
        const mins = Math.floor(songDuration / 60);
        const secs = songDuration % 60;

        const rawDigits = `${mins}${String(secs).padStart(2, '0')}`;

        lrcDurationInput.value = formatDurationDigits(rawDigits);
    }
})

cacheBtn.addEventListener('click', () => {
    cacheModal.classList.add('open');
})

closeCacheBtn.addEventListener('click', () => {
    cacheModal.classList.remove('open');
})

eraseCacheBtn.addEventListener('click', () => {
    eraseCacheConfirmationModal.classList.add('open');
})

cancelCacheErasingBtn.addEventListener('click', () => {
    eraseCacheConfirmationModal.classList.remove('open');
})

preferencesBtn.addEventListener('click', () => {
    preferencesModal.classList.add('open');
})

closePreferencesBtn.addEventListener('click', () => {
    preferencesModal.classList.remove('open');
})

saveLrcBtn.addEventListener('click', () => {
    const trackName = document.getElementById('lrc-title').value;
    const artistName = document.getElementById('lrc-artist').value;
    const albumName = document.getElementById('lrc-album').value;
    const duration = durationTextToSeconds(lrcDurationInput.value);
    const plainLyrics = '';
    const syncedLyrics = uploadedLrcContent;

    socket.emit('publish_request', {
        trackName: trackName,
        artistName: artistName,
        albumName: albumName,
        duration: duration,
        plainLyrics: plainLyrics,
        syncedLyrics: syncedLyrics
    })

    console.log({
        trackName,
        artistName, 
        albumName, 
        duration: duration,
    });

    lrcModal.classList.remove('open');
});

confirmEraseCacheBtn.addEventListener('click', () => {
    socket.emit('cache_delete')

    eraseCacheConfirmationModal.classList.remove('open');
})

pinBtn.addEventListener('click', () => {
    isPinned = !isPinned;
    
    pinBtn.classList.toggle('pinned', isPinned);
    
    if (window.electronAPI) {
        window.electronAPI.togglePin(isPinned);
    }
});

// selectors

lyricsStyle.forEach(button => {
    button.addEventListener('click', (event) => {
        const btn = event.target;

        if (btn.classList.contains('active')) {
            renderLyrics();
            return;
        } 

        document.querySelectorAll('.lyrics-style').forEach(btn => btn.classList.remove('active'));
        btn.classList.add('active');
        currentLyricsMode = btn.dataset.mode;

        renderLyrics();
    });
});

caching.forEach(button => {
    button.addEventListener('click', (event) => {
        const btn = event.target;

        if (btn.classList.contains('active')) {
            return;
        }

        document.querySelectorAll('.caching').forEach(btn => btn.classList.remove('active'));
        btn.classList.add('active');
        currentCacheSetting = btn.dataset.mode;
        socket.emit('cache_setting', currentCacheSetting);

    })
})

translating.forEach(button => {
    button.addEventListener('click', (event) => {
        const btn = event.target;

        if (btn.classList.contains('active')) {
            return;
        }

        document.querySelectorAll('.translation').forEach(btn => btn.classList.remove('active'));
        btn.classList.add('active');
        currentTranslationLanguage = btn.dataset.mode;
        socket.emit('translation_language', currentTranslationLanguage);

    })
})

let isPinned = false;

let currentLyricsMode = 'lyrics';
let currentCacheSetting = 'caching';
let currentTranslationLanguage = 'english';

let lyricsSourceData = null;
let parsedLyrics = [];
let isSynced = false;
let currentProgressMs = 0;
let isPlaying = false;
let lastTickTime = Date.now();

function parseLRC(lrcText) {
    const lines = lrcText.split('\n');
    const result = [];
    const timeReg = /\[(\d+):(\d+)\.(\d+)\]/;

    for (let line of lines) {
        const match = timeReg.exec(line);
        if (match) {
            const min = parseInt(match[1]);
            const sec = parseInt(match[2]);

            const msStr = match[3];
            const ms = parseInt(msStr) * (msStr.length === 2 ? 10 : 1);
            
            const time = min * 60 * 1000 + sec * 1000 + ms;
            const text = line.replace(timeReg, '').trim();

            result.push({ time, text });
        }
    }

    return result;
}

setInterval(() => {
    if (isPlaying) {
        const now = Date.now();
        const delta = now - lastTickTime;
        currentProgressMs += delta;
        lastTickTime = now;

        if (isSynced) {
            updateActiveLine();
        }
    }
}, 50);

function updateActiveLine() {
    let activeIndex = -1;

    for (let i = 0; i < parsedLyrics.length; i++) {
        if (currentProgressMs >= parsedLyrics[i].time) {
            activeIndex = i;
        } else {
            break;
        }
    }

    if (activeIndex !== -1) {
        const lines = document.querySelectorAll('.lyric-line');
        lines.forEach((line, index) => {
            if (index === activeIndex) {
                if (!line.classList.contains('active')) {
                    line.classList.add('active');
                    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                line.classList.remove('active');
            }
        });
    }
}

function seekToPosition(event) {
    const clicked = event.target;

    if (!clicked.classList.contains('lyric-line')) return;

    const time = parseInt(clicked.dataset.time, 10);

    if (!isNaN(time)) {
        console.log(`Enviando tempo: ${time}ms`);
        socket.emit('seek_request', time);
    }
} 

function renderLyrics() {
    if (!lyricsSourceData) return;

    lyricsEl.innerHTML = '';

    let targetLyricsText = '';
    if (currentLyricsMode === 'romanized' && lyricsSourceData.romanized) {
        targetLyricsText = lyricsSourceData.romanized;
    } else if (currentLyricsMode === 'translated' && lyricsSourceData.translated) {
        targetLyricsText = lyricsSourceData.translated;
    } else {
        targetLyricsText = lyricsSourceData.lyrics;
    }

    const parsed = parseLRC(targetLyricsText);
    parsedLyrics = parsed;

    parsed.forEach((line) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'lyric-line';
        lineEl.innerText = line.text || '...';
        lineEl.dataset.time = line.time;

        lyricsEl.appendChild(lineEl);
    });
}

function formatDurationDigits(digits) {
    digits = digits.slice(-4);
    if (digits.length <= 2) return digits;
    const secs = digits.slice(-2);
    const mins = digits.slice(0, -2);
    return mins + ':' + secs;
}

function durationTextToSeconds(text) {
    const parts = text.split(':');
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parts[1] !== undefined ? Math.min(parseInt(parts[1], 10) || 0, 59) : 0;
    return minutes * 60 + seconds;
}

socket.on('track_changed', (data) => {
    songTitle = data.title;
    artistTitle = data.artist;
    albumTitle = data.album;
    albumCover = data.cover;
    songDuration = Math.floor((data.durationMs || 0) / 1000);

    titleEl.innerText = data.title;
    artistEl.innerText = data.artist;
    coverEl.src = data.cover || 'https://via.placeholder.com/300';

    lyricsEl.innerText = 'Searching for it...';
    lyricsEl.scrollTop = 0;
    parsedLyrics = [];
    isSynced = false;
});

socket.on('kb_cache', (data) => {
    kbCache.innerText = `${data} kB`;
})

socket.on('lyrics_ready', (data) => {
    lyricsEl.innerHTML = '';
    
    console.log("Dados recebidos da letra:", data);

    if (!data || !data.lyrics) {
        lyricsEl.innerHTML = 'No lyrics found for this one :(';
        return;
    }
    
    if (data.isSynced) {
        isSynced = true;
        parsedLyrics = parseLRC(data.lyrics);
        lyricsSourceData = data;

        if (currentLyricsMode === 'romanized') renderLyrics();

        if (parsedLyrics.length > 0) {
            parsedLyrics.forEach((line, index) => {
                const lineEl = document.createElement('div');
                lineEl.className = 'lyric-line';
                lineEl.innerText = line.text || '...';
                lineEl.dataset.time = line.time;
                lyricsEl.appendChild(lineEl);
            });
            updateActiveLine();
            return;
        }
    }

    isSynced = false;
    const staticDiv = document.createElement('div');
    staticDiv.className = 'static-lyrics';
    staticDiv.innerHTML = data.lyrics.replace(/\n/g, '<br>');
    lyricsEl.appendChild(staticDiv);
});

socket.on('player_tick', (data) => {
    currentProgressMs = data.progress_ms;
    isPlaying = data.is_playing;
    lastTickTime = Date.now();
});

socket.on('player_state', (data) => {
    if (data.playing === false) {
        titleEl.innerText = 'Pausado';
        artistEl.innerText = 'Toque algo no Spotify';
        coverEl.src = './defaultcover.png';
        lyricsEl.innerHTML = '<div class="static-lyrics">Dê o play no Spotify.</div>';
        isPlaying = false;
    }
});

socket.on('profile_info', (data) => {
    if (data.images && data.images.length > 0) {
        profileImg.src = data.images[0].url;
    } else {
        profileImg.src = "./default.png";
    }
    profileUsername.innerText = `${data.display_name}` || "Usuário";
});

socket.on('update_preferences', (data) => {
    console.log('Ponto de debug n2')
    const btn = document.querySelector(`button[data-mode="${data.value}"]`)

    if (btn) {
        document.querySelectorAll('.caching').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCacheSetting = btn.dataset.mode;
    } else {
        console.warn(`[Hispot] Button not exist for preference: ${data.value}`);
    }
});