# Third-Party Notices

本文件记录宝宝巴士运行时代码的直接来源，以及本地 `reference/` 中用于设计研究的项目。`reference/` 已加入 `.gitignore`，不应随宝宝巴士发布。

## Directly derived runtime component

### @linxin666/dsh-study-assistant 0.1.0

- Local package name: `@linxin666/dsh-study-assistant`
- Declared license: Apache License 2.0
- Use in this project: `server/embedded.mjs` was extracted and subsequently modified from the package's `lib/index.js`; `tools/extract-from-plugin.mjs` documents that derivation.
- Modifications include standalone rendering wording, numbered source anchors, PPTX speaker-note extraction, PDF page anchors, spreadsheet cell anchors, and notebook cell anchors.
- License text: `LICENSES/Apache-2.0.txt`

The locally installed package did not include a separate LICENSE or NOTICE file and its `package.json` did not identify a copyright holder. Its package metadata explicitly identifies the license as `Apache-2.0`; this distribution includes the full Apache-2.0 text and records the modifications above. No upstream NOTICE content was present to reproduce.

## Bundled presentation runtime dependencies

### KaTeX 0.18.4

- Source: https://github.com/KaTeX/KaTeX
- Copyright (c) 2013-2020 Khan Academy and other contributors
- License: MIT (`LICENSES/KaTeX-MIT.txt`)
- Use in this project: formulas are rendered locally; generated courses no longer depend on an external CDN.

### reveal.js 5.1.0

- Source: https://github.com/hakimel/reveal.js
- Copyright (C) 2011-2024 Hakim El Hattab and reveal.js contributors
- License: MIT (`LICENSES/Reveal.js-MIT.txt`)
- Use in this project: generated HTML courses use the locally served slide runtime and stylesheet.

Other npm dependencies remain separately licensed upstream. A distributable installer or archive should retain this notice, the copied license texts, and an attribution report covering the exact dependency versions in `package-lock.json`.

## Application runtime dependencies

The lightweight Windows launcher is original project code built against Windows' .NET Framework and opens the interface with the installed Microsoft Edge. Electron and Chromium are not redistributed by this project.

### React and React DOM 18.3.1

- Source: https://github.com/facebook/react
- Copyright (c) Facebook, Inc. and its affiliates.
- License: MIT (`LICENSES/React-MIT.txt`)
- Use in this project: application user interface bundled into the production frontend assets.

### ws 8.21.3

- Source: https://github.com/websockets/ws
- Copyright (c) 2011 Einar Otto Stangvik; Copyright (c) 2013 Arnout Kazemier and contributors; Copyright (c) 2016 Luigi Pinca and contributors.
- License: MIT (`LICENSES/ws-MIT.txt`)
- Use in this project: Node WebSocket client used by the local generation backend.

## Design references (MIT)

The following projects informed architecture and quality decisions. The current implementation reimplements the relevant ideas in the existing Node/React architecture; their complete repositories are not runtime dependencies.

### GenSlide

- Source: https://github.com/mehdimo/GenSlide
- License: MIT (`LICENSES/GenSlide-MIT.txt`)
- Local license copy contains the MIT grant and conditions but no explicit copyright line.

### Skill-Anything 0.3.0

- Source: https://github.com/SYuan03/Skill-Anything
- Copyright (c) 2026 Skill-Anything Contributors
- License: MIT (`LICENSES/Skill-Anything-MIT.txt`)

### SlideSage

- Source: https://github.com/vedraut/slidesage
- Copyright (c) 2026 Ved Raut
- License: MIT (`LICENSES/SlideSage-MIT.txt`)

### universal-examprep

- Copyright (c) 2026 ZeKaiNie
- License: MIT (`LICENSES/universal-examprep-MIT.txt`)
- The local snapshot does not provide a canonical repository URL in its root metadata.

If substantial source from any MIT project is copied in a future change, copy that project's copyright notice and full MIT license into the distributed notices at the same time.
