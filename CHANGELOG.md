## [1.6.0](https://github.com/pablofmorales/kuma-cli/compare/v1.5.2...v1.6.0) (2026-04-02)

### 🚀 Features

* add parent option to monitors and group monitor type ([ade1f14](https://github.com/pablofmorales/kuma-cli/commit/ade1f14516e4ce3dbed724ad0f03c64b4a9d99e3))

### 🐛 Bug Fixes

* improve add/create input handling for parent and group monitors ([b5efe9a](https://github.com/pablofmorales/kuma-cli/commit/b5efe9a948b71027138ce79045442640de4e780f))

## [1.5.2](https://github.com/pablofmorales/kuma-cli/compare/v1.5.1...v1.5.2) (2026-03-31)

### 🐛 Bug Fixes

* keep [@blackasteroid](https://github.com/blackasteroid) npm scope for publishing ([7c2fede](https://github.com/pablofmorales/kuma-cli/commit/7c2feded9e3ae98a069eb24d87ae5e7d9efbacd3))

## [1.5.1](https://github.com/pablofmorales/kuma-cli/compare/v1.5.0...v1.5.1) (2026-03-31)

### 🐛 Bug Fixes

* use pablo@blackasteroid.com.ar instead of personal email ([15a0ac8](https://github.com/pablofmorales/kuma-cli/commit/15a0ac8258a8ac20de1f57635b26f8d6510a1a31))

## [1.5.0](https://github.com/pablofmorales/kuma-cli/compare/v1.4.1...v1.5.0) (2026-03-31)

### 🚀 Features

* add --as flag to login for instance naming ([41c74dd](https://github.com/pablofmorales/kuma-cli/commit/41c74ddf8eb0e59c705d8189eb3e2e07c0cb7ae8))
* add --instance flag to all existing commands ([00e59a9](https://github.com/pablofmorales/kuma-cli/commit/00e59a933c5ec01fbbfc20cff6ed6c9ef25003cd))
* add cluster create, list, remove, info, and sync commands ([ac1e952](https://github.com/pablofmorales/kuma-cli/commit/ac1e9522e2fcf8057e9c7f5f6296c5c656c6b520))
* add InstanceManager for multi-instance resolution ([a29e225](https://github.com/pablofmorales/kuma-cli/commit/a29e225915e93573b0e4512e24631709b2d27dea))
* add instances list and remove commands ([38df694](https://github.com/pablofmorales/kuma-cli/commit/38df694f7c07cf373ec1fdb6df03b688e33507d3))
* add unified cluster view to monitors list ([c25088b](https://github.com/pablofmorales/kuma-cli/commit/c25088b4da1e7f809bc205f80958042714d10cb3))
* add use command for instance/cluster context switching ([0882f20](https://github.com/pablofmorales/kuma-cli/commit/0882f203326b5a4dc288ff4c82b2afccc3bd2aa1))
* multi-instance config schema with migration ([068b1b3](https://github.com/pablofmorales/kuma-cli/commit/068b1b3aaf0b34cca8d1faa0ab54f3de19c33a23))
* register instances/use commands and update status for multi-instance ([1d783a6](https://github.com/pablofmorales/kuma-cli/commit/1d783a63acb5629ba54368b3bee12e842ca54a08))
* update logout for multi-instance support ([f4ee65b](https://github.com/pablofmorales/kuma-cli/commit/f4ee65bb8716a05ed69deaaf52988ebc46a2617e))

### 🐛 Bug Fixes

* add --instance flag to heartbeat send command ([e8f0958](https://github.com/pablofmorales/kuma-cli/commit/e8f09582d0d44f135710cff2e9b244a7452d345c))
* handle config migration edge case with empty instances + legacy keys ([3cb94a2](https://github.com/pablofmorales/kuma-cli/commit/3cb94a21d39655813251d29b22ac248e3ac1eb15))
* tag health monitors by name prefix and preserve instance on logout ([7073c25](https://github.com/pablofmorales/kuma-cli/commit/7073c255bf51813dc64623e1aab14b8156fefac1))
* update repo URLs from BlackAsteroid to pablofmorales ([d2d702b](https://github.com/pablofmorales/kuma-cli/commit/d2d702b16d0282b6a19e682ab88a5a1d6635dbf9))

### ⚡ Performance

* reuse client connections during cluster sync ([76b9564](https://github.com/pablofmorales/kuma-cli/commit/76b95641701ea9f8cafdde0bb7f1abfb8db970cc))

### 📚 Documentation

* add multi-instance & cluster support design document ([8129cd2](https://github.com/pablofmorales/kuma-cli/commit/8129cd2423dd59beec749445578f00f94b0da11e))
* add multi-instance and cluster guide to README ([19d15b7](https://github.com/pablofmorales/kuma-cli/commit/19d15b74a42119b945626b91e82e4fe36f266bde))
* add multi-instance cluster implementation plan ([2b35609](https://github.com/pablofmorales/kuma-cli/commit/2b356095a2fcbfbb23ca682ea3f163da6f996cd3))
* clarify cluster create help text and examples ([d39b299](https://github.com/pablofmorales/kuma-cli/commit/d39b299e2074eaa7409e7469cfb355a9a5856869))
* improve help text clarity across all multi-instance commands ([ce24eaf](https://github.com/pablofmorales/kuma-cli/commit/ce24eaf3e6934c82d13b546d9400c47a5cbcb8ae))
* update CLI help with multi-instance and cluster examples ([4c4da0d](https://github.com/pablofmorales/kuma-cli/commit/4c4da0d30e77453a7e7559b4e13c9b8551a6eb4e))

## [1.4.1](https://github.com/BlackAsteroid/kuma-cli/compare/v1.4.0...v1.4.1) (2026-03-26)

### 📚 Documentation

* add Homebrew install to README + bump docs → patch release ([896cb50](https://github.com/BlackAsteroid/kuma-cli/commit/896cb505e6c2ff8aaafc84dcc7dc017ae148be7b))

## [1.4.0](https://github.com/BlackAsteroid/kuma-cli/compare/v1.3.1...v1.4.0) (2026-03-26)

### 🚀 Features

* add demo GIF to README (closes [#52](https://github.com/BlackAsteroid/kuma-cli/issues/52), fixes [#54](https://github.com/BlackAsteroid/kuma-cli/issues/54)) ([#56](https://github.com/BlackAsteroid/kuma-cli/issues/56)) ([68388a6](https://github.com/BlackAsteroid/kuma-cli/commit/68388a67288d7430cb2d9f1b39fcc8811f99a7ea))
* add demo video and GIF to README ([#53](https://github.com/BlackAsteroid/kuma-cli/issues/53)) ([83f6fb9](https://github.com/BlackAsteroid/kuma-cli/commit/83f6fb9c3fced99e77f27e420fd502e735c537f4))
* add Homebrew tap support ([7f9a68a](https://github.com/BlackAsteroid/kuma-cli/commit/7f9a68aae044eddea818a130b778dee4880172a5))

### 🐛 Bug Fixes

* remove demo.mp4 from git history, add to .gitignore ([#55](https://github.com/BlackAsteroid/kuma-cli/issues/55)) ([d5d2458](https://github.com/BlackAsteroid/kuma-cli/commit/d5d24589ea16c0e6d2c37928ef609212f1bd82e7))

## [1.3.1](https://github.com/BlackAsteroid/kuma-cli/compare/v1.3.0...v1.3.1) (2026-03-20)

### 🐛 Bug Fixes

* **security:** prevent notification config injection during import ([#51](https://github.com/BlackAsteroid/kuma-cli/issues/51)) ([00bb2d4](https://github.com/BlackAsteroid/kuma-cli/commit/00bb2d4b1853019c057d2a89ab5bfc40f2a78b7c)), closes [#49](https://github.com/BlackAsteroid/kuma-cli/issues/49)

## [1.3.0](https://github.com/BlackAsteroid/kuma-cli/compare/v1.2.1...v1.3.0) (2026-03-20)

### 🚀 Features

* advanced filtering, config export/import, docs folder ([#38](https://github.com/BlackAsteroid/kuma-cli/issues/38)-[#44](https://github.com/BlackAsteroid/kuma-cli/issues/44)) ([#45](https://github.com/BlackAsteroid/kuma-cli/issues/45)) ([8216d98](https://github.com/BlackAsteroid/kuma-cli/commit/8216d98b4971f51733457be3817ed369565f0129)), closes [#39](https://github.com/BlackAsteroid/kuma-cli/issues/39) [#40](https://github.com/BlackAsteroid/kuma-cli/issues/40) [#41](https://github.com/BlackAsteroid/kuma-cli/issues/41) [#42](https://github.com/BlackAsteroid/kuma-cli/issues/42) [#43](https://github.com/BlackAsteroid/kuma-cli/issues/43) [38-#41](https://github.com/BlackAsteroid/38-/issues/41) [42-#43](https://github.com/BlackAsteroid/42-/issues/43)

## [1.2.1](https://github.com/BlackAsteroid/kuma-cli/compare/v1.2.0...v1.2.1) (2026-03-19)

### 🐛 Bug Fixes

* security hardening (Gerard's review findings [#1](https://github.com/BlackAsteroid/kuma-cli/issues/1)-[#7](https://github.com/BlackAsteroid/kuma-cli/issues/7)) ([675d5bf](https://github.com/BlackAsteroid/kuma-cli/commit/675d5bfbe210db07ae06f6613b528b6306dddfb2)), closes [#2](https://github.com/BlackAsteroid/kuma-cli/issues/2) [#3](https://github.com/BlackAsteroid/kuma-cli/issues/3) [#5](https://github.com/BlackAsteroid/kuma-cli/issues/5) [#6](https://github.com/BlackAsteroid/kuma-cli/issues/6) [#4](https://github.com/BlackAsteroid/kuma-cli/issues/4)

### 📚 Documentation

* add agent usage section + v1.2.0 commands ([7fc703d](https://github.com/BlackAsteroid/kuma-cli/commit/7fc703d2063b603f11c68b628d6ba0bfdb8b5513))

## [1.2.0](https://github.com/BlackAsteroid/kuma-cli/compare/v1.1.0...v1.2.0) (2026-03-19)

### 🚀 Features

* monitors create, bulk-pause/resume, heartbeat send ([cefd450](https://github.com/BlackAsteroid/kuma-cli/commit/cefd45031aac31a1d2251a0c5fa5d7691c057704)), closes [#24](https://github.com/BlackAsteroid/kuma-cli/issues/24) [#26](https://github.com/BlackAsteroid/kuma-cli/issues/26) [#28](https://github.com/BlackAsteroid/kuma-cli/issues/28) [#24](https://github.com/BlackAsteroid/kuma-cli/issues/24) [#26](https://github.com/BlackAsteroid/kuma-cli/issues/26) [#28](https://github.com/BlackAsteroid/kuma-cli/issues/28)

### 🐛 Bug Fixes

* QA issues from PR [#31](https://github.com/BlackAsteroid/kuma-cli/issues/31) review ([a43a449](https://github.com/BlackAsteroid/kuma-cli/commit/a43a449ec1d4465c5fe1b98eaec6a49ba7e90caa))

## [1.1.0](https://github.com/BlackAsteroid/kuma-cli/compare/v1.0.1...v1.1.0) (2026-03-18)

### 🚀 Features

* notifications create/list/delete + monitors set-notification ([5cb5245](https://github.com/BlackAsteroid/kuma-cli/commit/5cb524540685d98f8406fa1ad9b4c29739f3966d)), closes [#23](https://github.com/BlackAsteroid/kuma-cli/issues/23)

## [1.0.1](https://github.com/BlackAsteroid/kuma-cli/compare/v1.0.0...v1.0.1) (2026-03-18)

### 🐛 Bug Fixes

* kuma upgrade now installs from npm instead of GitHub source ([e066fd1](https://github.com/BlackAsteroid/kuma-cli/commit/e066fd1213e18a90ece4814985df4521898c49b6))

## 1.0.0 (2026-03-18)

### 🚀 Features

* add logout command + fix tsconfig moduleResolution ([acba98d](https://github.com/BlackAsteroid/kuma-cli/commit/acba98d8993716a8b73a53a9532be6454c7702e2))
* add monitors update command + editMonitor client method ([b927ee2](https://github.com/BlackAsteroid/kuma-cli/commit/b927ee27e6bde4704861759c348905d42a57af99))
* agent-compatible JSON mode (--json flag + KUMA_JSON env var) ([925beba](https://github.com/BlackAsteroid/kuma-cli/commit/925beba3c39bbb4fa5c5eef0f7647ac1e01a311d)), closes [#17](https://github.com/BlackAsteroid/kuma-cli/issues/17)
* improve --help output with Quick Start, examples, and better descriptions ([7627984](https://github.com/BlackAsteroid/kuma-cli/commit/7627984c885c2ee548c02fa1fcf89281f6cd37d4)), closes [#16](https://github.com/BlackAsteroid/kuma-cli/issues/16)
* initial kuma-cli scaffold ([cfb77bf](https://github.com/BlackAsteroid/kuma-cli/commit/cfb77bfbcd34aa46b612db77660ab15f3de0cbd3))
* kuma upgrade self-update command ([f50dbd4](https://github.com/BlackAsteroid/kuma-cli/commit/f50dbd40b0d5cd97990ab426c3dfa7ea58ef7a94)), closes [#15](https://github.com/BlackAsteroid/kuma-cli/issues/15)
* monitors update with --active/--no-active flags and full object fetch ([a9ee7a3](https://github.com/BlackAsteroid/kuma-cli/commit/a9ee7a3e84902077994a9334f3bf7e0588777017))

### 🐛 Bug Fixes

* add files field to package.json to include dist/ in npm install ([4774860](https://github.com/BlackAsteroid/kuma-cli/commit/4774860ed722ae94763c519f08b007af48f04fc0))
* add prepare script so npm install from GitHub builds dist/ ([80b797a](https://github.com/BlackAsteroid/kuma-cli/commit/80b797a1cb06a6e91ffb7ea2b94222bd4291ee88))
* buffer heartbeatList/uptime events on connect for reliable monitor status ([5068ed6](https://github.com/BlackAsteroid/kuma-cli/commit/5068ed6f6fefe1598fe64e705aad3ab2c2ef5916))
* bundle all deps into dist for global install support ([ab01f68](https://github.com/BlackAsteroid/kuma-cli/commit/ab01f68212f7b1d218e6df22324b8365482ec196))
* getMonitorList now waits for heartbeatList/uptime push events ([6f83e4a](https://github.com/BlackAsteroid/kuma-cli/commit/6f83e4aba76a4e94180639cf86d46d8486720783))
* heartbeat and status-pages timeouts (BUG-01, BUG-02) ([78f74ff](https://github.com/BlackAsteroid/kuma-cli/commit/78f74ffedb0c669cff9c79289d08c1d051a1a1b0))
* resolve BUG-01 through BUG-04 from Jawad's QA report ([de00991](https://github.com/BlackAsteroid/kuma-cli/commit/de00991a43aba0b0e957fc0eafa74bbb2c81f9bd))

### 📚 Documentation

* full command reference in README ([4d66ca1](https://github.com/BlackAsteroid/kuma-cli/commit/4d66ca18e6e3c96e620a2f09970dcc09d2aa43a9))
* humanize README prose ([dd26387](https://github.com/BlackAsteroid/kuma-cli/commit/dd2638735e9d391bd4ea2045cd37fb164f9605f6))

# Changelog

All notable changes to this project will be documented in this file.

This file is generated automatically by [semantic-release](https://github.com/semantic-release/semantic-release).
Do not edit it manually.
