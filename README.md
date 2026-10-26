# K4 Cam

**K4 Cam is a fork of [ChessCam](https://github.com/Pbatch/CameraChessWeb) by Pbatch**, made for
[Schachklub Kreis 4](https://schachklub-k4.ch) (Zurich) and its Lichess broadcasts: a phone on a
stand films a board, and the moves it recognises go to the club's events app
(`events.skk4.ch`), which merges them into the round it already broadcasts, under the real
names and with the result. Everything ChessCam does is still here, unchanged; the K4 mode is
added at `/k4`. The app runs at **cam.skk4.ch**. Licence: **AGPL-3.0**, as upstream
(`LICENSE.md`); the source of this modified version is this repository
(https://github.com/PomPomLtd/k4-cam).

## Changes in this fork (AGPL §5)

Forked on 13 October 2026 from upstream `main` at `6410b63` (27 September 2026). Changed, with
the dates in the git history:

**26 October 2026.** After the first try on the club's phone stands: the `/k4` column is K4
Cam's own (`src/components/k4/`: the names, Find the board, Start, then the lens, the camera and
a scan of the position); it sets up in portrait too and films in landscape; **Start from move
1** drops the stored game; a **lens** choice (wide / normal / close, from the track's zoom
range, remembered) replaces upstream's forced minimum zoom in the K4 mode only (`video.tsx`);
a **camera** select lists the phone's inputs once the stream plays (`deviceButton.tsx`'s list is
now set once the browser has answered, an upstream bug); a **move list** while filming;
**Scan the position** for a game already under way (`src/utils/k4/position.ts`: upstream's
piece reader, the side to move and the move number from the player, castling rights from the
home squares), sent to the events app as the record's start position.

- **The `/k4` mode** (`src/components/k4/`, `src/utils/k4/`): a camera link
  (`https://cam.skk4.ch/k4#v=1&api=<origin>&t=<token>`) names the events app and a camera
  token in the URL fragment, which never reaches a server. The page asks the app which board it
  films (`GET /api/live/v1/session`), lets ChessCam find the board, and sends the whole game
  with the time each move was first seen (`PUT /api/live/v1/state`) whenever a settled move
  changes and every 15 seconds otherwise; it resumes from the stored game after a reload or on
  another phone, backs off while offline, keeps the screen on, and stops when the game has a
  result, the round is over, or the organiser revokes the camera. No Lichess login, no Lichess
  call, no image ever leaves the phone. The allowed API origins are a build setting
  (`VITE_K4_API_ORIGINS`, see `.env.example`).
- **One line in the detection loop** (`src/utils/findPieces.tsx`): the wall-clock time a move
  was played travels with the game update (`Game.lastMoveAt`), for the app's estimated clocks.
- `Mode` gains `"k4"`; `videoAndSidebar.tsx` picks the K4 sidebar for it; `cornersButton.tsx`
  takes a label.
- The name "K4 Cam" (title, manifests, home page) with "based on ChessCam by Pbatch" and a
  Source code link (AGPL §13); `package.json`'s `license` field matches `LICENSE.md`.
- **The K4 look on the K4 screens only** (`src/style/k4.css`, scoped to `.k4`): the club's six
  colour tokens (paper by default, the inverse on black in the dark theme; the camera screen is
  always dark), Syne and Syne Tactile self-hosted through `@fontsource`, four type roles, square
  44 px controls, status marks. ChessCam's own screens keep their Bootstrap look.
- Vitest for `src/utils/k4/` (`npm test`), a GitHub Actions workflow, `vercel.json` (the SPA
  rewrite for `/k4`), npm's `package-lock.json` as the one lockfile; two `==` in the board
  preview became `===` so `npm run build` passes Biome.

Nothing in ChessCam's recognition (the models, the move matcher) is changed. The K4 mode's
protocol is meant to be generic ("report moves to an address"); an issue will be opened upstream
to offer it.

## Running the K4 mode

```bash
npm install
VITE_K4_API_ORIGINS=http://localhost:3901 npm start   # a development build also allows localhost:3000 and :3901
npm test                                              # the K4 utilities
npm run build                                         # tsc, Biome, Vite
```

Open a camera link made by the events app (its organiser's Cameras section, a printed camera
card, or a player's "Film this game"); `/k4` without a link says the link isn't valid.

---

# ChessCam (upstream README)

<div align="center">

📌 This app is under active development and may experience minor issues.  
Please report any bugs on Discord, and we will fix them promptly.

<table>
  <tr>
    <td align=center>
      <img src="https://github.com/user-attachments/assets/f7e73c25-36f6-42b7-aae9-e970e7bcebeb" alt="ChessCam" width="512">
    </td>
  </tr>
</table>

[![Discord](https://img.shields.io/badge/Discord-00c8d6?logo=discord&logoColor=white&style=flat)](https://discord.gg/3yQth8YBp8)
[![All Contributors](https://img.shields.io/badge/all_contributors-6-orange.svg?style=flat-square)](#contributors-)

Replace Chess eBoards with your phone camera using ChessCam (https://www.chesscam.net).

Do you have ideas, bugs to report or training footage? Join our [Discord Server](https://discord.gg/3yQth8YBp8).

</div>

## Demo
[<img src="https://raw.githubusercontent.com/wiki/Pbatch/CameraChessWeb/images/thumbnail.png" width="100%">](https://youtu.be/AAs4EX372bc)

## Roadmap

* Raise an alert when an illegal move is played (currently they're just ignored)
* Add sounds for the opponents moves in "/play"
* Add support for variants
* Develop a testing framework for different board + piece sets
* ... Your next big idea?

## Models, Data, Reports and Scripts

Please post in the Issues tab if you need any help with:
* Running inference
* Exporting models to different formats
* Training on data of varying resolutions (I.e. 640x640)
* etc. etc.

### Pieces

| Name | Description | Link |
| :---: | :---: | :---: |
| 480M_leyolo_pieces.onnx | LeYOLO ONNX model| https://drive.google.com/file/d/1-80xp_nly9i6s3o0mF0mU9OZGEzUAlGj/view?usp=sharing |
| 480M_leyolo_pieces.pt | LeYOLO pt model | https://drive.google.com/file/d/1L6PZbSdT-peCmiJGNwmgHJN5MTpfAM-0/view?usp=sharing |
| pieces.tar.gz | Train/test data in YOLOv5 format | https://drive.google.com/file/d/12-Y3AJckAsFiDTlhQV8R50AK5ilM0s_Z/view?usp=sharing |
| Report | Weights & Biases report from the LeYOLO training run | https://api.wandb.ai/links/pbatch/g2rcvycv |

### Xcorners

| Name | Description | Link |
| :---: | :---: | :---: |
| 480L_leyolo_xcorners.onnx | LeYOLO ONNX model | https://drive.google.com/file/d/1-2wodbiXag9UQ44e2AYAmoRN6jVpxy83/view?usp=sharing |
| 480L_leyolo_xcorners.pt | LeYOLO pt model | https://drive.google.com/file/d/173orSe8eaytN8nin_HOvd2sEfP_wtOUW/view?usp=sharing |
| xcorners.tar.gz | Train/test data in YOLOv5 format | https://drive.google.com/file/d/15Liy-vMcujSZak4YRPeC2TpVjIA3AwVM/view?usp=sharing |
| Report | Weights & Biases report from the LeYOLO training run | https://api.wandb.ai/links/pbatch/ziwur3gr |

### Google Colab scripts

* LeYOLO Training + ONNX export - https://gist.github.com/Pbatch/dccc680ac2f852d4f258e4b6f1997a7b
* TFJS export - https://gist.github.com/Pbatch/46d958df7e0363e42561bda50163a57a

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ConorShepherd"><img src="https://avatars.githubusercontent.com/u/75845466?v=4?s=100" width="100px;" alt="Conor Shepherd"/><br /><sub><b>Conor Shepherd</b></sub></a><br /><a href="#research-ConorShepherd" title="Research">🔬</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/tdr24008"><img src="https://avatars.githubusercontent.com/u/109679977?v=4?s=100" width="100px;" alt="tdr24008"/><br /><sub><b>tdr24008</b></sub></a><br /><a href="#research-tdr24008" title="Research">🔬</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/DakshHandeCode"><img src="https://avatars.githubusercontent.com/u/153603746?v=4?s=100" width="100px;" alt="DakshHandeCode"/><br /><sub><b>DakshHandeCode</b></sub></a><br /><a href="#design-DakshHandeCode" title="Design">🎨</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ChessScholar"><img src="https://avatars.githubusercontent.com/u/65353254?v=4?s=100" width="100px;" alt="ChessScholar"/><br /><sub><b>ChessScholar</b></sub></a><br /><a href="https://github.com/Pbatch/CameraChessWeb/issues?q=author%3AChessScholar" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/JohnP-1"><img src="https://avatars.githubusercontent.com/u/55811674?v=4?s=100" width="100px;" alt="JohnP-1"/><br /><sub><b>JohnP-1</b></sub></a><br /><a href="https://github.com/Pbatch/CameraChessWeb/issues?q=author%3AJohnP-1" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/AbdullahKhetran"><img src="https://avatars.githubusercontent.com/u/101284310?v=4?s=100" width="100px;" alt="Abdullah Khetran"/><br /><sub><b>Abdullah Khetran</b></sub></a><br /><a href="#research-AbdullahKhetran" title="Research">🔬</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://tejasraman.me"><img src="https://avatars.githubusercontent.com/u/96961804?v=4?s=100" width="100px;" alt="Tejas Raman"/><br /><sub><b>Tejas Raman</b></sub></a><br /><a href="#security-tejasraman" title="Security">🛡️</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/danispringer"><img src="https://avatars.githubusercontent.com/u/19246409?v=4?s=100" width="100px;" alt="Dani Springer Chess Lessons 🇮🇱"/><br /><sub><b>Dani Springer Chess Lessons 🇮🇱</b></sub></a><br /><a href="https://github.com/Pbatch/CameraChessWeb/commits?author=danispringer" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lucastcox"><img src="https://avatars.githubusercontent.com/u/6495989?v=4?s=100" width="100px;" alt="Lucas Cox"/><br /><sub><b>Lucas Cox</b></sub></a><br /><a href="https://github.com/Pbatch/CameraChessWeb/commits?author=lucastcox" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/squidKid-deluxe"><img src="https://avatars.githubusercontent.com/u/63127872?v=4?s=100" width="100px;" alt="squiddible"/><br /><sub><b>squiddible</b></sub></a><br /><a href="https://github.com/Pbatch/CameraChessWeb/issues?q=author%3AsquidKid-deluxe" title="Bug reports">🐛</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
