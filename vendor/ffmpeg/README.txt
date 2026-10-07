ffmpeg.wasm (self-hosted) — used only by /try.html (자동 자막 체험) to extract the audio track
in the visitor's browser. Loaded lazily, only when a visitor processes their own video.

Files (from npm, UMD builds, single-thread core — GitHub Pages cannot send COOP/COEP headers):
  ffmpeg.js, 814.ffmpeg.js   @ffmpeg/ffmpeg 0.12.15  dist/umd/   License: MIT (LICENSE-ffmpeg-ffmpeg-MIT.txt)
  ffmpeg-core.js             @ffmpeg/core   0.12.10  dist/umd/   License: GPL-2.0-or-later (LICENSE-ffmpeg-core-GPL-2.0.txt)
  ffmpeg-core.wasm           @ffmpeg/core   0.12.10  dist/umd/   License: GPL-2.0-or-later

Source code (GPL-2.0-or-later, corresponding source for ffmpeg-core.js / ffmpeg-core.wasm):
  ffmpeg.wasm (build scripts, core):  https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10
  npm package:                        https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10
  FFmpeg itself:                      https://ffmpeg.org/download.html  (https://git.ffmpeg.org/ffmpeg.git)
The files are unmodified copies of the npm packages. Update by replacing all four files with the same versions.
