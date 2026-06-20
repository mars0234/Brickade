# Replay System Design

## Goal

Record every completed 1v1 match, including AI matches, so any signed-in player can open a public match record, replay the whole match, seek through a timeline, and jump to meaningful highlights.

## Scope

- Record completed human 1v1 and AI battles. Existing historical records remain readable but are not replayable.
- Add AI match-history records with the AI speed mode, custom-speed value where applicable, and play style.
- Store a public replay independently from the lightweight player history entry.
- Replay controls: pause/play, 0.5x/1x/2x/4x playback, seekable timeline, and +/- five-second jumps.
- Highlight types: every KO, Combo 5+, Combo 10+, and Perfect Clear. The match end remains a timeline endpoint, not a highlight.

## Recording and Playback

The recorder captures compact state frames for both boards at a fixed five-second interval and whenever a highlight is created. It also records gameplay events with their elapsed timestamps. A replay starts from the nearest preceding frame, then applies subsequent frames/events to reconstruct the visual state. This permits immediate seeking without replaying a full match from the beginning.

The initial release replays authoritative captured board states rather than re-running AI or player input. This is necessary because current AI behavior uses random and timing-dependent decisions. It produces faithful public playback and stays robust when the AI implementation changes.

## Data Model

Each history entry gains `matchType` (`PLAYER` or `AI`), `replayId`, and for AI matches `aiSettings` (`speedMode`, `customSpeed`, `wideMode`). The replay document stores `version`, participants, start/end metadata, frames, highlights, and the final result. Frames contain timestamped, serialized board/HUD state for both participants. The history entry remains deliberately small so the existing fifty-record list stays fast.

## Public Access and Integrity

Replay documents and history records are readable by any authenticated user. The participating player may create a replay exactly once; clients never update or delete it after creation. History records link only to their replay. Firestore rules must enforce read access and immutable replay writes. Since the current app is client-authoritative, these rules prevent later mutation but cannot prove the original client did not cheat; anti-cheat is outside this feature.

## UI

History cards show a Replay button only when `replayId` exists. AI records show `VS AI` plus the stored speed and style. The replay modal uses the existing two-board battle layout, a timeline with markers, a highlight list, and playback controls. Selecting a marker seeks three seconds before the event where possible.

## Failure Handling

If replay upload fails, match history still saves with no replay button. If a replay is missing, malformed, or from a newer unsupported version, the modal shows a clear error and leaves the history card usable. Replay mode is read-only and does not emit network, score, or match-history updates.

## Verification

Unit tests cover replay-frame sampling, highlight de-duplication/tiers, seek-frame selection, and history metadata generation. Browser smoke testing verifies an AI match produces a record, public history opens it, all controls work, and highlights seek to the correct moment.
