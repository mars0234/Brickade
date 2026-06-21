# Replay System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record public, seekable replays and AI battle history for completed 1v1 matches.

**Architecture:** `src/replay.js` is a pure UMD module that records timestamped two-board frames and highlighter events. `game.js` owns the active recorder, persists a public Firestore replay document, and drives a read-only modal. History only stores a replay ID and small AI metadata.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, Firebase Firestore compat, Node built-in `node:test`.

---

## Files

- Create `src/replay.js`: recorder, highlights, seeking, playback clock.
- Create `tests/replay.test.js`: pure module coverage.
- Create `firestore.rules`: authenticated public reads and immutable creates.
- Modify `package.json`, `firebase.json`, `src/index.html`, `src/game.js`, `src/i18n.js`.

### Task 1: Test harness and pure replay recorder

- [ ] Write `tests/replay.test.js` before production code:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecorder, findFrameAtOrBefore } = require('../src/replay.js');

test('samples five-second two-board frames and finds a seek frame', () => {
  const r = createRecorder({ startedAt: 1000, frameIntervalMs: 5000 });
  assert.equal(r.capture(1000, { me: { board: 'A' }, opponent: { board: 'B' } }), true);
  assert.equal(r.capture(4000, { me: { board: 'C' }, opponent: { board: 'D' } }), false);
  assert.equal(r.capture(6000, { me: { board: 'E' }, opponent: { board: 'F' } }), true);
  assert.equal(findFrameAtOrBefore(r.toReplay().frames, 4200).state.me.board, 'A');
});
```

- [ ] Run `node --test tests/replay.test.js`; expect a missing-module failure.
- [ ] Create `src/replay.js` with `createRecorder` (five-second/forced captures), `findFrameAtOrBefore`, and UMD exports. Set `package.json` to `"test": "node --test tests/*.test.js"`.
- [ ] Run `npm.cmd test`; expect PASS.
- [ ] Commit `package.json src/replay.js tests/replay.test.js` as `test: establish replay module coverage`.

### Task 2: Highlights and replay metadata

- [ ] Add failing tests for `highlight(now, 'COMBO', actor, { combo })`, asserting only `COMBO_5` and `COMBO_10` at the stated thresholds, plus `KO` and `PERFECT_CLEAR`.
- [ ] Run the tests; expect `highlight is not a function`.
- [ ] Implement `highlight` and `buildReplayDocument`; each event contains `t`, `actor`, `kind`, and label. Force a snapshot at each accepted highlight.
- [ ] Add tests for `buildHistoryReplayFields({isAI:true,replayId,aiSpeedMode,aiCustomSpeed,aiWideMode})`.
- [ ] Implement it to return `matchType`, `replayId`, and `aiSettings`; run `npm.cmd test`; commit as `feat: add replay highlights`.

### Task 3: Live capture and persistence

- [ ] Add `<script src="./replay.js"></script>` before `game.js` in `src/index.html`.
- [ ] In `src/game.js`, create/reset a recorder when the 1v1 countdown completes; snapshot local board/HUD and `oppState`/AI board every five seconds from existing state sync.
- [ ] At existing KO, combo, and Perfect Clear branches call recorder highlights. At completed match end force the final frame, build `replays/{replayId}`, and save once.
- [ ] Keep ranked LP updates player-only, but write authenticated completed AI history records with opponent `AI`, stored speed/style, and `replayId`.
- [ ] If replay write rejects, retain a history entry without `replayId`. Run `npm.cmd test && node --check src/game.js`; commit `feat: record battle replays and AI history`.

### Task 4: Public history and replay viewer

- [ ] Add Chinese/English replay, unavailable, speed/style, loading, and highlight strings to `src/i18n.js`.
- [ ] Render `VS AI · speed · style` from saved fields, and a delegated Replay button only when `replayId` exists.
- [ ] Add `#replay-modal` with two canvases, play/pause, 0.5x/1x/2x/4x, +/- 5s, range input, timer, and highlight list.
- [ ] Add failing `createPlaybackClock` tests for pause, speed advancement, and clamped seeking; then implement it in `src/replay.js`.
- [ ] Load/validate `replays/{id}`, draw only captured data, seek three seconds before marker clicks, and cancel the animation loop on close. Run tests/checks; commit `feat: add seekable public replay viewer`.

### Task 5: Firestore policy and verification

- [ ] Add `firestore.rules`: authenticated users read histories/replays; only a user may create their own history or replay; updates/deletes denied; replay create requires `ownerUid == request.auth.uid` and `version == 1`.
- [ ] Add `"firestore": { "rules": "firestore.rules" }` to `firebase.json` without changing hosting configuration.
- [ ] Run `npm.cmd test && node --check src/replay.js && node --check src/game.js && npm.cmd run deploy`.
- [ ] Smoke-test an AI battle: card includes speed/style, replay plays, drag and all controls work, and KO/Combo 5+/Combo 10+/Perfect Clear seek correctly. Sign in as another user to confirm public playback.
- [ ] Inspect `git diff --check`, verify no uncommitted functional changes, then commit verification fixes only.

