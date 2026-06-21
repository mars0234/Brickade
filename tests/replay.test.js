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

test('records KO, combo tiers, and perfect clear highlights', () => {
  const r = createRecorder({ startedAt: 0 });
  r.highlight(100, 'COMBO', 'me', { combo: 4 });
  r.highlight(200, 'COMBO', 'me', { combo: 5 });
  r.highlight(300, 'COMBO', 'opponent', { combo: 10 });
  r.highlight(400, 'KO', 'me');
  r.highlight(500, 'PERFECT_CLEAR', 'opponent');
  assert.deepEqual(r.toReplay().highlights.map(h => h.kind), ['COMBO', 'COMBO_5', 'COMBO_10', 'KO', 'PERFECT_CLEAR']);
});

test('records every visible combo from two onward with its board target and position', () => {
  const r = createRecorder({ startedAt: 0 });
  r.highlight(100, 'COMBO', 'me', { combo: 1, target: 'me', y: 380 });
  r.highlight(200, 'COMBO', 'opponent', { combo: 2, target: 'me', y: 380, size: 30 });
  r.highlight(300, 'KO', 'opponent', { target: 'me', y: 340, size: 100 });
  assert.deepEqual(r.toReplay().highlights.map(h => h.label), ['2 COMBO', 'K.O.']);
  assert.deepEqual(r.toReplay().highlights[0], { kind: 'COMBO', label: '2 COMBO', combo: 2, target: 'me', y: 380, size: 30, t: 200, actor: 'opponent' });
});

test('omits ordinary combo and T-spin events from the timeline but keeps their playback effects', () => {
  const { timelineHighlights } = require('../src/replay.js');
  const events = [
    { kind: 'COMBO', label: '2 COMBO', timeline: false },
    { kind: 'TSPIN', label: 'T-SPIN DOUBLE', timeline: false },
    { kind: 'COMBO_5', label: '5 COMBO', timeline: true },
    { kind: 'TSPIN', label: 'B2B T-SPIN DOUBLE', timeline: true },
    { kind: 'TSPIN', label: 'B2B MINI T-SPIN', timeline: true }
  ];
  assert.deepEqual(timelineHighlights(events).map(event => event.label), ['5 COMBO', 'B2B T-SPIN DOUBLE']);
});

test('collapses one combo chain to its last high-combo highlight while keeping separate attacks', () => {
  const { timelineHighlightEntries } = require('../src/replay.js');
  const events = [
    { kind: 'COMBO_5', label: '5 COMBO', combo: 5, actor: 'me', t: 1000, timeline: true },
    { kind: 'COMBO_5', label: '6 COMBO', combo: 6, actor: 'me', t: 1800, timeline: true },
    { kind: 'COMBO_5', label: '7 COMBO', combo: 7, actor: 'me', t: 2500, timeline: true },
    { kind: 'COMBO_5', label: '5 COMBO', combo: 5, actor: 'opponent', t: 2600, timeline: true },
    { kind: 'COMBO_5', label: '6 COMBO', combo: 6, actor: 'me', t: 9000, timeline: true }
  ];
  assert.deepEqual(timelineHighlightEntries(events).map(({ index, highlight }) => [index, highlight.label]), [[2, '7 COMBO'], [3, '5 COMBO'], [4, '6 COMBO']]);
});

test('records tactical highlights with the supplied labels', () => {
  const r = createRecorder({ startedAt: 0 });
  r.highlight(10, 'TSPIN', 'me', { label: 'T-SPIN DOUBLE' });
  r.highlight(20, 'BOMB', 'opponent', { label: 'BOMB +2' });
  assert.deepEqual(r.toReplay().highlights.map(h => h.label), ['T-SPIN DOUBLE', 'BOMB +2']);
});

test('clamps playback seeks and advances only when playing', () => {
  const { createPlaybackClock } = require('../src/replay.js');
  const clock = createPlaybackClock(1200);
  clock.seek(9999); assert.equal(clock.time, 1200);
  clock.seek(100); clock.tick(100, 2); assert.equal(clock.time, 100);
  clock.play(); clock.tick(100, 2); assert.equal(clock.time, 300);
  clock.pause(); clock.tick(100, 4); assert.equal(clock.time, 300);
  clock.seek(1100); clock.play(); clock.tick(100, 1);
  assert.equal(clock.time, 1200);
  assert.equal(clock.playing, false);
  clock.play();
  assert.equal(clock.time, 0);
  assert.equal(clock.playing, true);
});

test('records every changed visual state with block types and current piece', () => {
  const { createEventRecorder } = require('../src/replay.js');
  const r = createEventRecorder({ startedAt: 0 });
  r.record(10, 'me', { board: '...B', current: { type: 'T', row: 2, col: 3, rot: 1 } });
  r.record(30, 'me', { board: '...B', current: { type: 'T', row: 3, col: 3, rot: 1 } });
  assert.deepEqual(r.toReplay().events.map(e => e.t), [10, 30]);
  assert.equal(r.toReplay().events[0].state.board, '...B');
});

test('uses the game canonical matrix so rotated pieces retain their padded origin', () => {
  const { pieceMatrix, currentPieceCells } = require('../src/replay.js');
  assert.deepEqual(pieceMatrix('T', 2), [[0,0,0],[1,1,1],[0,1,0]]);
  assert.deepEqual(pieceMatrix('I', 1), [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]]);
  assert.deepEqual(
    currentPieceCells({ type: 'T', row: 19, col: 3, rot: 2 }),
    [{ row: 20, col: 3 }, { row: 20, col: 4 }, { row: 20, col: 5 }, { row: 21, col: 4 }]
  );
});

test('prefers the recorded matrix when a replayed piece has a nonstandard spawn rotation', () => {
  const { currentPieceCells } = require('../src/replay.js');
  const cells = currentPieceCells({ type: 'I', row: 18, col: 2, rot: 3, matrix: [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]] });
  assert.deepEqual(cells, [{ row: 18, col: 3 }, { row: 19, col: 3 }, { row: 20, col: 3 }, { row: 21, col: 3 }]);
});

test('finds an opponent ghost landing row against the locked board only', () => {
  const { ghostRowForPiece } = require('../src/replay.js');
  const board = '.'.repeat(38 * 10) + '.....J....' + '....JJJ...';
  assert.equal(ghostRowForPiece({ type: 'O', row: 20, col: 4, rot: 0 }, board), 36);
});

test('serializes pieces without matrix arrays so Firestore can store them', () => {
  const { serializePiece } = require('../src/replay.js');
  assert.deepEqual(serializePiece({ t: 'T', r: 19, c: 3, rot: 2 }), { type: 'T', row: 19, col: 3, rot: 2 });
  assert.deepEqual(serializePiece({ type: 'I', row: 18, col: 2, rot: 3, matrix: [[0,1],[0,1]] }), { type: 'I', row: 18, col: 2, rot: 3 });
});

test('keeps only the ten newest replay identifiers', () => {
  const { expiredReplayIds } = require('../src/replay.js');
  assert.deepEqual(expiredReplayIds(['r11','r10','r9','r8','r7','r6','r5','r4','r3','r2','r1'], 10), ['r1']);
});
