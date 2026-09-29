# Study Space

A static, installable PWA (no backend, no build step). Deploy by pushing this folder to GitHub Pages; every path is relative, so sub-paths like `/study-space/` work.

- Run locally: `python3 -m http.server` in this folder, open http://localhost:8000
- After adding/removing files run `./tools-build.sh` to refresh the service-worker precache list.
- `vendor/` holds pdf.js (Apache-2.0) so PDFs render offline. YouTube's IFrame API is the only external script (loaded lazily, only when a video is added).
- DABSy: open its settings and enter your own endpoint/model/key. Nothing is hard-coded; the key stays in this browser's IndexedDB.
- SolveCount / Calendar: same-origin `BroadcastChannel('student-ecosystem')` or `window.StudySpaceEcosystem.receive({source:'solvecount', type:'session', state:'running', startedAt, elapsedMs, subject})`.
