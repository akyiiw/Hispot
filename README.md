# Hispot

Hispot is an Electron-based desktop application for viewing lyrics, fetching them from sources other than just Musixmatch.

Currently supported:
- LRCLib 
- Genius (static only)

## Features

### Lyrics from other sources

Around May 2021, after five years, Spotify ended its partnership with Genius and, in collaboration with Musixmatch, created its own lyrics system. Although it has a huge database, it still requires the song's creator or a trusted contributor to publish the lyrics, which can cause delays or never make it possible to read them while listening.

### Synced with Spotify (LRClib)

No need to scroll while singing; you can just let it roll.

Unfortunately, the only way to sync lyrics (using .lrc files) with the Spotify player is via LRCLib, due to the timestamps included in the text. The Musixmatch database is not publicly accessible, and Genius only provides static/plain lyrics.

### Adding songs to LRClib 

Fortunately, using LRCGet, you can add any lyrics you want to their database.

It is highly recommended to use a tool for creating .lrc files.

https://lrc-maker.github.io/ <- This is an example.

### Seek to Position

With Spotify Premium, you can use "Seek to Position" just like in the official Spotify app. A single click on any lyric line will skip the song forward or backward to that exact part.

### Romanization and translation

The UI allows you to toggle between 3 lyrics modes: Original, romanized and translated.
As expected, for example, lyrics in Japanese would have kanji, hiragana and katakana. Romanizing would transcript and transliterate as accurately as possible, bringing romaji (わたし or 私 becomes watashi). Translating would, of course, translate the meaning.

## Installation

Clone the repository:

```bash
git clone https://github.com/akyiiw/hispot.git 
cd hispot
```

Install dependencies:

```bash
npm install
```

Run the development environment:

```bash
npm start
```

This will open a new window for Hispot. Since it runs a local server, you can also access it via your browser at ```http://127.0.0.1:8888/```

## Usage

As far as I've read, Spotify and Genius do not allow the use of their APIs for open-source projects. That said, for the next steps, you will need an Access Token for both APIs.

After setting up the environment, either your browser or the desktop window will redirect you to the Spotify login page. It is recommended to use Hispot with a Spotify Premium subscription to enable the "Seek to Position" feature through the lyrics.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

MIT License

Copyright (c) 2026 akyiiw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
