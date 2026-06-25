# Demo assets

Drop generation captures here so they render in the root [`README.md`](../README.md):

- **`demo-pipeline.png`** — a screenshot of the Studio UI mid-run (the prompt box
  + the live pipeline timeline). Take it from your browser during a job.
- **`demo-game.gif`** — a short clip of a finished game playing. The capture step
  of every job already records a video at
  `godoplat/data/jobs/<id>/media/video.webm` (or `.mp4`); convert a few seconds
  of it to a GIF, e.g.:

  ```bash
  ffmpeg -i video.mp4 -t 4 -vf "fps=12,scale=640:-1" demo-game.gif
  ```

Keep them small (a few hundred KB) so the README stays light.
