(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ReplaySystem = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  // Keep these matrices byte-for-byte compatible with the game simulation.  Replay
  // coordinates are relative to this padded matrix, not to a trimmed sprite shape.
  const PIECE_MATRICES = {
    I: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
    ],
    O: [[[1,1],[1,1]],[[1,1],[1,1]],[[1,1],[1,1]],[[1,1],[1,1]]],
    T: [[[0,1,0],[1,1,1],[0,0,0]],[[0,1,0],[0,1,1],[0,1,0]],[[0,0,0],[1,1,1],[0,1,0]],[[0,1,0],[1,1,0],[0,1,0]]],
    J: [[[1,0,0],[1,1,1],[0,0,0]],[[0,1,1],[0,1,0],[0,1,0]],[[0,0,0],[1,1,1],[0,0,1]],[[0,1,0],[0,1,0],[1,1,0]]],
    L: [[[0,0,1],[1,1,1],[0,0,0]],[[0,1,0],[0,1,0],[0,1,1]],[[0,0,0],[1,1,1],[1,0,0]],[[1,1,0],[0,1,0],[0,1,0]]],
    S: [[[0,1,1],[1,1,0],[0,0,0]],[[0,1,0],[0,1,1],[0,0,1]],[[0,0,0],[0,1,1],[1,1,0]],[[1,0,0],[1,1,0],[0,1,0]]],
    Z: [[[1,1,0],[0,1,1],[0,0,0]],[[0,0,1],[0,1,1],[0,1,0]],[[0,0,0],[1,1,0],[0,1,1]],[[0,1,0],[1,1,0],[1,0,0]]]
  };
  function pieceMatrix(type, rotation) {
    const rotations = PIECE_MATRICES[type];
    if (!rotations) return null;
    return clone(rotations[((rotation || 0) % 4 + 4) % 4]);
  }
  function currentPieceCells(piece) {
    if (!piece) return [];
    const matrix = Array.isArray(piece.matrix) ? piece.matrix : pieceMatrix(piece.type, piece.rot);
    if (!matrix) return [];
    const cells = [];
    matrix.forEach((line, y) => line.forEach((filled, x) => {
      if (filled) cells.push({ row: (piece.row || 0) + y, col: (piece.col || 0) + x });
    }));
    return cells;
  }
  function serializePiece(piece) {
    if (!piece) return null;
    const type = piece.type || piece.t;
    if (!type) return null;
    return { type, row: piece.row ?? piece.r ?? 0, col: piece.col ?? piece.c ?? 0, rot: piece.rot || 0 };
  }
  function ghostRowForPiece(piece, boardText, rows = 40, cols = 10) {
    const normalized = serializePiece(piece);
    if (!normalized) return null;
    const cells = currentPieceCells(normalized);
    const cellAt = (row, col) => (boardText && boardText[row * cols + col]) || '.';
    const blocked = offset => cells.some(({ row, col }) => {
      const testRow = row + offset;
      return testRow >= rows || col < 0 || col >= cols || (testRow >= 0 && cellAt(testRow, col) !== '.');
    });
    let offset = 0;
    while (!blocked(offset + 1)) offset++;
    return normalized.row + offset;
  }
  function createRecorder(options) {
    const startedAt = options.startedAt;
    const interval = options.frameIntervalMs || 5000;
    const frames = [];
    const highlights = [];
    let last = -Infinity;
    return {
      capture(now, state, force) {
        if (!force && now - last < interval) return false;
        frames.push({ t: Math.max(0, now - startedAt), state: clone(state) });
        last = now;
        return true;
      },
      highlight(now, kind, actor, detail) {
        detail = detail || {};
        let event = null;
        if (kind === 'KO') event = { kind: 'KO', label: 'K.O.' };
        else if (kind === 'PERFECT_CLEAR') event = { kind: 'PERFECT_CLEAR', label: 'PERFECT CLEAR' };
        else if (kind === 'TSPIN' || kind === 'QUAD' || kind === 'BOMB') event = { kind: kind, label: detail.label || kind };
        else if (kind === 'COMBO' && detail.combo >= 10) event = { kind: 'COMBO_10', label: detail.combo + ' COMBO' };
        else if (kind === 'COMBO' && detail.combo >= 5) event = { kind: 'COMBO_5', label: detail.combo + ' COMBO' };
        else if (kind === 'COMBO' && detail.combo >= 2) event = { kind: 'COMBO', label: detail.combo + ' COMBO' };
        if (!event) return false;
        highlights.push(Object.assign(event, detail, { t: Math.max(0, now - startedAt), actor: actor }));
        return true;
      },
      toReplay() { return { version: 1, frames: clone(frames), highlights: clone(highlights) }; }
    };
  }
  function findFrameAtOrBefore(frames, target) {
    return frames.reduce((best, frame) => frame.t <= target ? frame : best, frames[0] || null);
  }
  function createPlaybackClock(duration) {
    let time = 0;
    let playing = false;
    return {
      get time() { return time; },
      get playing() { return playing; },
      play() { if (time >= duration) time = 0; playing = true; },
      pause() { playing = false; },
      seek(value) { time = Math.max(0, Math.min(duration, value)); },
      tick(delta, speed) {
        if (!playing) return;
        this.seek(time + delta * speed);
        if (time >= duration) playing = false;
      }
    };
  }
  function createEventRecorder(options) {
    const startedAt = options.startedAt;
    const events = [];
    return {
      record(now, actor, state, type = 'STATE') {
        events.push({ t: Math.max(0, now - startedAt), actor, type, state: clone(state) });
      },
      toReplay() { return { version: 2, events: clone(events) }; }
    };
  }
  function expiredReplayIds(newestFirstIds, limit = 10) { return newestFirstIds.slice(limit); }
  function timelineHighlightEntries(events) {
    const entries = (events || []).map((highlight, index) => ({ highlight, index })).filter(({ highlight }) =>
      highlight.timeline !== false && !(highlight.kind === 'TSPIN' && /MINI/i.test(highlight.label || ''))
    );
    return entries.filter(({ highlight }, position) => {
      if (!/^COMBO/.test(highlight.kind || '') || typeof highlight.combo !== 'number') return true;
      return !entries.slice(position + 1).some(({ highlight: next }) =>
        /^COMBO/.test(next.kind || '') && next.actor === highlight.actor && next.combo === highlight.combo + 1 && (next.t || 0) - (highlight.t || 0) <= 5000
      );
    });
  }
  function timelineHighlights(events) { return timelineHighlightEntries(events).map(({ highlight }) => highlight); }
  return { createRecorder, findFrameAtOrBefore, createPlaybackClock, createEventRecorder, expiredReplayIds, pieceMatrix, currentPieceCells, serializePiece, ghostRowForPiece, timelineHighlights, timelineHighlightEntries };
});
