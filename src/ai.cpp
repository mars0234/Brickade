#include <string>
#include <vector>
#include <cstring>
#include <algorithm>
#include <cmath>
#include <emscripten/bind.h>

using namespace emscripten;

const int ROWS = 40;
const int COLS = 10;

// 盤面格子狀態（與 game.js 的 aiBoard 對應）
// 0 = 空格 '.' / 1 = 一般方塊 / 2 = 垃圾 'G' / 3 = 炸彈 'B'
// BOMB 模式規則：含 G/B 的行「永遠不能」靠填滿消除，唯一移除方式是把方塊
// 疊在炸彈正上方引爆（與 game.js aiLockPiece 的規則完全一致）
const int CELL_EMPTY = 0;
const int CELL_BLOCK = 1;
const int CELL_GARBAGE = 2;
const int CELL_BOMB = 3;

const std::vector<std::vector<std::vector<int>>> PIECES = {
    {{0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0}, {0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0}, {0,0,0,0, 0,0,0,0, 1,1,1,1, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0}}, // 0: I
    {{1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}}, // 1: O
    {{0,1,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,1,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 0,1,0,0, 0,0,0,0}, {0,1,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0}}, // 2: T
    {{1,0,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,1,0, 0,1,0,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 0,0,1,0, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 1,1,0,0, 0,0,0,0}}, // 3: J
    {{0,0,1,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 0,1,1,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 1,0,0,0, 0,0,0,0}, {1,1,0,0, 0,1,0,0, 0,1,0,0, 0,0,0,0}}, // 4: L
    {{0,1,1,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,1,0, 0,0,1,0, 0,0,0,0}, {0,0,0,0, 0,1,1,0, 1,1,0,0, 0,0,0,0}, {1,0,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0}}, // 5: S
    {{1,1,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0}, {0,0,1,0, 0,1,1,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,0,0, 0,1,1,0, 0,0,0,0}, {0,1,0,0, 1,1,0,0, 1,0,0,0, 0,0,0,0}}  // 6: Z
};

// === SRS 踢牆表（與 game.js 的 JLSTZ_KICKS / I_KICKS 一字不差）===
// 索引 [from][to]，每組 5 個 [dx, dy]；套用方式：nr = row - dy, nc = col + dx
const int JLSTZ_KICKS[4][4][5][2] = {
    // from 0
    {{}, {{0,0},{-1,0},{-1,1},{0,-2},{-1,-2}}, {}, {{0,0},{1,0},{1,1},{0,-2},{1,-2}}},
    // from 1
    {{{0,0},{1,0},{1,-1},{0,2},{1,2}}, {}, {{0,0},{1,0},{1,-1},{0,2},{1,2}}, {}},
    // from 2
    {{}, {{0,0},{-1,0},{-1,1},{0,-2},{-1,-2}}, {}, {{0,0},{1,0},{1,1},{0,-2},{1,-2}}},
    // from 3
    {{{0,0},{-1,0},{-1,-1},{0,2},{-1,2}}, {}, {{0,0},{-1,0},{-1,-1},{0,2},{-1,2}}, {}}
};
const int I_KICKS[4][4][5][2] = {
    // from 0
    {{}, {{0,0},{-2,0},{1,0},{-2,-1},{1,2}}, {}, {{0,0},{-1,0},{2,0},{-1,2},{2,-1}}},
    // from 1
    {{{0,0},{2,0},{-1,0},{2,1},{-1,-2}}, {}, {{0,0},{-1,0},{2,0},{-1,2},{2,-1}}, {}},
    // from 2
    {{}, {{0,0},{1,0},{-2,0},{1,-2},{-2,1}}, {}, {{0,0},{2,0},{-1,0},{2,1},{-1,-2}}},
    // from 3
    {{{0,0},{1,0},{-2,0},{1,-2},{-2,1}}, {}, {{0,0},{-2,0},{1,0},{-2,-1},{1,2}}, {}}
};

// 與 game.js applyScore / aiLockPiece 一致的攻擊表
const int CLEAR_ATTACK[5] = {0, 0, 1, 2, 4};
const int COMBO_BONUS[11] = {0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4};

enum TSpinType { TSPIN_NONE = 0, TSPIN_MINI = 1, TSPIN_FULL = 2 };

int pieceCharToId(char type) {
    switch (type) {
        case 'I': return 0; case 'O': return 1; case 'T': return 2;
        case 'J': return 3; case 'L': return 4; case 'S': return 5; case 'Z': return 6;
        default: return -1;
    }
}

enum Phase { PHASE_OPENING = 0, PHASE_BURST = 1 };

// 一個可達的鎖定位置（BFS 產出）
struct Placement {
    int row, col, rot;
    int tSpin;        // TSPIN_NONE / MINI / FULL（只有 T 會非 0）
    std::string path; // 從出生點到此的操作序列（只在需要時回填）
};

struct SearchNode {
    int board[ROWS][COLS];
    int holdId;
    int comboState;
    int b2bState;        // ★ B2B 連鎖計數（與 game.js 的 b2b 同語意）
    int queueConsumed;
    int phase;
    int maxH;
    double accumReward;
    double score;
    int firstCol, firstRow, firstRot;
    bool firstUseHold;
    std::string firstPath; // 第一步的操作路徑，回傳給 JS 照著播放
};

struct Metrics {
    int colH[COLS];
    int maxH;
    int garbageRows;
    int buildHoles, wellHoles;
    double buildHolesW, wellHolesW;
    int almostRows;
    int buildMinNet, buildMaxNet;
    int buildBump;
    int wellMaxNet;
    int wellBlocksNet;
    int residueBlocks;
    int trenchSq;
    int tSlotScore;      // ★ TSD 凹槽偵測分（auto 模式用來主動蓋 T 槽）
    int tstSlotScore;    // ★ TST 缺口偵測分（DT 砲下半部：1 格寬 3 深 + 屋簷）
};

// === BFS 可達性搜索的狀態編碼 ===
// row -2..41 (44) × col -4..11 (16) × rot 4 = 2816 states
const int BFS_ROW_OFF = 2, BFS_ROW_N = 44;
const int BFS_COL_OFF = 4, BFS_COL_N = 16;
const int BFS_STATES = BFS_ROW_N * BFS_COL_N * 4;

inline int encodeState(int row, int col, int rot) {
    return ((row + BFS_ROW_OFF) * BFS_COL_N + (col + BFS_COL_OFF)) * 4 + rot;
}

class BrickadeAI {
private:
    int initialBoard[ROWS][COLS];

    // BFS 工作區（成員變數避免每次重新配置）
    unsigned char visitedMove[BFS_STATES]; // 以「移動/下降」進入
    unsigned char visitedRot[BFS_STATES];  // 以「旋轉」進入（T-Spin 判定需要）
    short parentMove[BFS_STATES];
    short parentRot[BFS_STATES];
    char actMove[BFS_STATES];
    char actRot[BFS_STATES];
    unsigned char rotKick[BFS_STATES];     // 旋轉進入時用了第幾個踢牆測試

    void parseBoard(const std::string& boardStr) {
        int i = 0;
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                char ch = boardStr[i++];
                if (ch == '.') initialBoard[r][c] = CELL_EMPTY;
                else if (ch == 'G') initialBoard[r][c] = CELL_GARBAGE;
                else if (ch == 'B') initialBoard[r][c] = CELL_BOMB;
                else initialBoard[r][c] = CELL_BLOCK;
            }
        }
    }

    bool isValid(const std::vector<int>& matrix, int row, int col, const int testBoard[ROWS][COLS]) {
        for (int i = 0; i < 16; i++) {
            if (matrix[i] == 1) {
                int r = row + (i / 4), c = col + (i % 4);
                if (c < 0 || c >= COLS || r >= ROWS) return false;
                if (r >= 0 && testBoard[r][c] != CELL_EMPTY) return false;
            }
        }
        return true;
    }

    // T-Spin 判定（與 game.js getTSpinType 一字不差的 3-corner 規則）
    // 前提：最後動作是旋轉（呼叫端保證），kickIndex 是該次旋轉用的踢牆測試索引
    int classifyTSpin(const int board[ROWS][COLS], int row, int col, int rot, int kickIndex) {
        int r = row + 1, c = col + 1; // T 的 3x3 中心
        const int corners[4][2] = {{r-1,c-1},{r-1,c+1},{r+1,c-1},{r+1,c+1}};
        const int frontIdxTable[4][2] = {{0,1},{1,3},{2,3},{0,2}};

        int filled = 0, frontFilled = 0, backFilled = 0;
        for (int i = 0; i < 4; i++) {
            int cr = corners[i][0], cc = corners[i][1];
            bool occ = (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || board[cr][cc] != CELL_EMPTY);
            if (occ) {
                filled++;
                if (i == frontIdxTable[rot][0] || i == frontIdxTable[rot][1]) frontFilled++;
                else backFilled++;
            }
        }
        if (filled >= 3) {
            if (kickIndex == 4) return TSPIN_FULL;   // 第 5 踢（TST 踢）無條件 Full
            if (frontFilled == 2) return TSPIN_FULL;
            if (frontFilled == 1 && backFilled == 2) return TSPIN_MINI;
        }
        return TSPIN_NONE;
    }

    // ★ BFS 可達性搜索：從出生點枚舉所有「真的走得到」的鎖定位置，
    // 含平移、軟降、SRS 踢牆旋轉（所以找得到 tuck 和各種 spin）。
    // wantPaths = true 時回填操作路徑（只有第 0 層需要，給 JS 播動畫）
    void generatePlacements(const int board[ROWS][COLS], int pieceId, bool wantPaths,
                            std::vector<Placement>& out) {
        out.clear();
        int spawnRow = (pieceId == 0) ? 18 : 19;
        int spawnCol = 3;
        if (!isValid(PIECES[pieceId][0], spawnRow, spawnCol, board)) return; // 出生即死

        bool isT = (pieceId == 2);
        bool isO = (pieceId == 1);

        std::memset(visitedMove, 0, sizeof(visitedMove));
        if (isT) std::memset(visitedRot, 0, sizeof(visitedRot));

        // BFS 佇列：state 編碼 + 進入方式（0=移動 1=旋轉）
        static std::vector<int> queue;
        queue.clear();
        int start = encodeState(spawnRow, spawnCol, 0);
        visitedMove[start] = 1;
        parentMove[start] = -1;
        queue.push_back(start << 1);

        for (size_t qi = 0; qi < queue.size(); qi++) {
            int packed = queue[qi];
            int s = packed >> 1;
            int rot = s & 3;
            int col = ((s >> 2) % BFS_COL_N) - BFS_COL_OFF;
            int row = ((s >> 2) / BFS_COL_N) - BFS_ROW_OFF;

            // --- 平移 / 軟降 ---
            const struct { int dr, dc; char a; } moves[3] = {{0,-1,'L'},{0,1,'R'},{1,0,'D'}};
            for (int mi = 0; mi < 3; mi++) {
                int nr = row + moves[mi].dr, nc = col + moves[mi].dc;
                if (nr + BFS_ROW_OFF < 0 || nr + BFS_ROW_OFF >= BFS_ROW_N) continue;
                if (nc + BFS_COL_OFF < 0 || nc + BFS_COL_OFF >= BFS_COL_N) continue;
                if (!isValid(PIECES[pieceId][rot], nr, nc, board)) continue;
                int ns = encodeState(nr, nc, rot);
                if (visitedMove[ns]) continue;
                visitedMove[ns] = 1;
                parentMove[ns] = (short)s;
                actMove[ns] = moves[mi].a;
                // 紀錄 parent 是從移動鏈(0)還是旋轉鏈(1)進入的，重建路徑時要走對條鏈
                parentMoveKind[ns] = (unsigned char)(packed & 1);
                queue.push_back(ns << 1);
            }

            // --- 旋轉（含 SRS 踢牆）。O 不旋轉（四個旋轉態相同）---
            if (!isO) {
                for (int dir = 0; dir < 2; dir++) {
                    int to = (rot + (dir == 0 ? 1 : 3)) % 4;
                    const int (*kicks)[2] = (pieceId == 0) ? I_KICKS[rot][to] : JLSTZ_KICKS[rot][to];
                    for (int i = 0; i < 5; i++) {
                        int dx = kicks[i][0], dy = kicks[i][1];
                        int nr = row - dy, nc = col + dx;
                        if (nr + BFS_ROW_OFF < 0 || nr + BFS_ROW_OFF >= BFS_ROW_N) continue;
                        if (nc + BFS_COL_OFF < 0 || nc + BFS_COL_OFF >= BFS_COL_N) continue;
                        if (!isValid(PIECES[pieceId][to], nr, nc, board)) continue;
                        int ns = encodeState(nr, nc, to);
                        // 旋轉進入：T 需要獨立追蹤（T-Spin 的「最後動作是旋轉」）
                        if (isT) {
                            if (!visitedRot[ns]) {
                                visitedRot[ns] = 1;
                                parentRot[ns] = (short)s;
                                actRot[ns] = (dir == 0) ? 'c' : 'z';
                                rotKick[ns] = (unsigned char)i;
                                parentRotKind[ns] = (unsigned char)(packed & 1);
                                queue.push_back((ns << 1) | 1);
                            }
                        }
                        if (!visitedMove[ns]) {
                            visitedMove[ns] = 1;
                            parentMove[ns] = (short)s;
                            actMove[ns] = (dir == 0) ? 'c' : 'z';
                            parentMoveKind[ns] = (unsigned char)(packed & 1);
                            queue.push_back(ns << 1);
                        }
                        break; // 第一個成功的踢牆測試就是實際旋轉結果（與遊戲一致）
                    }
                }
            }
        }

        // 收集所有鎖定位置（下方不可再降）
        for (int row = -1; row < ROWS; row++) {
            for (int col = -4; col <= 11; col++) {
                for (int rot = 0; rot < 4; rot++) {
                    if (isO && rot > 0) continue;
                    if (row + BFS_ROW_OFF < 0 || row + BFS_ROW_OFF >= BFS_ROW_N) continue;
                    if (col + BFS_COL_OFF < 0 || col + BFS_COL_OFF >= BFS_COL_N) continue;
                    int s = encodeState(row, col, rot);
                    bool byMove = visitedMove[s];
                    bool byRot = isT && visitedRot[s];
                    if (!byMove && !byRot) continue;
                    if (isValid(PIECES[pieceId][rot], row + 1, col, board)) continue; // 還能下降，不是鎖定點

                    Placement p;
                    p.row = row; p.col = col; p.rot = rot;
                    p.tSpin = TSPIN_NONE;

                    bool useRotChain = false;
                    if (byRot) {
                        int t = classifyTSpin(board, row, col, rot, rotKick[s]);
                        if (t != TSPIN_NONE) { p.tSpin = t; useRotChain = true; }
                    }
                    if (wantPaths) {
                        p.path = reconstructPath(s, useRotChain);
                        if (p.path.empty() && s != encodeState((pieceId==0)?18:19, 3, 0)) {
                            // 防呆：路徑重建失敗就放棄這個落點（不應發生）
                            if (!byMove) continue;
                        }
                    }
                    out.push_back(p);
                }
            }
        }
    }

    unsigned char parentMoveKind[BFS_STATES]; // parentMove 指向的狀態是移動鏈(0)還是旋轉鏈(1)
    unsigned char parentRotKind[BFS_STATES];

    std::string reconstructPath(int state, bool useRotChain) {
        std::string rev;
        int s = state;
        int kind = useRotChain ? 1 : 0;
        int guard = 0;
        while (s >= 0 && guard++ < 200) {
            short par; char a; unsigned char pk;
            if (kind == 1) { par = parentRot[s]; a = actRot[s]; pk = parentRotKind[s]; }
            else { par = parentMove[s]; a = actMove[s]; pk = parentMoveKind[s]; }
            if (par < 0) break;
            rev.push_back(a);
            s = par; kind = pk;
        }
        if (guard >= 200) return std::string(); // 不應發生
        std::reverse(rev.begin(), rev.end());
        return rev;
    }

    Metrics computeMetrics(const int board[ROWS][COLS], int keepEmpty) {
        Metrics m;
        int wellStart = (keepEmpty >= 1) ? COLS - keepEmpty : COLS;

        m.garbageRows = 0;
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                if (board[r][c] == CELL_GARBAGE || board[r][c] == CELL_BOMB) { m.garbageRows++; break; }
            }
        }

        // （TST 缺口偵測曾在此實驗過：誤判率太高（普通盤面常有 3 深縫），
        // 會讓 auto 模式的 TSD 產量掉 7 成。等 DT 砲開局書要上架時，
        // 必須配合「缺口行接近完成」的條件重做。）
        m.tstSlotScore = 0;

        m.maxH = 0;
        m.buildHoles = 0; m.wellHoles = 0;
        m.buildHolesW = 0; m.wellHolesW = 0;
        m.wellBlocksNet = 0;
        for (int c = 0; c < COLS; c++) {
            m.colH[c] = 0;
            bool foundTop = false;
            int coverCount = 0;
            for (int r = 0; r < ROWS; r++) {
                if (board[r][c] != CELL_EMPTY) {
                    if (!foundTop) { foundTop = true; m.colH[c] = ROWS - r; }
                    coverCount++;
                    if (c >= wellStart && board[r][c] == CELL_BLOCK) m.wellBlocksNet++;
                } else if (foundTop) {
                    double w = 1.0 + 0.35 * std::min(coverCount, 5);
                    if (c < wellStart) { m.buildHoles++; m.buildHolesW += w; }
                    else { m.wellHoles++; m.wellHolesW += w; }
                }
            }
            if (m.colH[c] > m.maxH) m.maxH = m.colH[c];
        }

        m.almostRows = 0;
        for (int r = ROWS - 1; r >= 0 && m.almostRows < 8; r--) {
            int empty = 0; bool garbage = false;
            for (int c = 0; c < COLS; c++) {
                if (board[r][c] == CELL_EMPTY) empty++;
                else if (board[r][c] != CELL_BLOCK) { garbage = true; break; }
            }
            if (garbage) continue;
            if (empty >= 1 && empty <= 2) m.almostRows++;
            if (empty > 6) break;
        }

        m.buildMinNet = 999; m.buildMaxNet = 0;
        m.buildBump = 0;
        for (int c = 0; c < wellStart; c++) {
            int net = m.colH[c] - m.garbageRows; if (net < 0) net = 0;
            if (net < m.buildMinNet) m.buildMinNet = net;
            if (net > m.buildMaxNet) m.buildMaxNet = net;
            if (c > 0) m.buildBump += std::abs(m.colH[c] - m.colH[c-1]);
        }
        if (m.buildMinNet == 999) m.buildMinNet = 0;

        m.wellMaxNet = 0;
        for (int c = wellStart; c < COLS; c++) {
            int net = m.colH[c] - m.garbageRows; if (net < 0) net = 0;
            if (net > m.wellMaxNet) m.wellMaxNet = net;
        }

        m.residueBlocks = 0;
        int bottomNetRow = ROWS - 1 - m.garbageRows;
        if (bottomNetRow >= 0) {
            for (int c = wellStart; c < COLS; c++) {
                if (board[bottomNetRow][c] == CELL_BLOCK) m.residueBlocks++;
            }
        }

        m.trenchSq = 0;
        for (int c = 0; c < wellStart; c++) {
            int left = (c > 0) ? m.colH[c-1] : 9999;
            int right = (c + 1 < wellStart) ? m.colH[c+1] : 9999;
            int neighborMin = std::min(left, right);
            if (neighborMin == 9999) continue;
            int d = neighborMin - m.colH[c];
            if (d > 2) {
                int over = std::min(d - 2, 8);
                m.trenchSq += over * over;
            }
        }

        // ★ TSD 凹槽偵測（只有 auto 模式用，wide 模式跳過省時間）：
        // 尋找「上行缺 c-1..c+1 三格、下行只缺 c、屋簷蓋住一側」的標準 TSD 槽
        m.tSlotScore = 0;
        int scanTop = ROWS - m.maxH - 1; if (scanTop < 2) scanTop = 2;
        for (int c = 1; keepEmpty < 1 && c < COLS - 1 && m.tSlotScore == 0; c++) {
            for (int r = scanTop; r < ROWS - 1; r++) {
                int upper = r, lower = r + 1;
                if (lower >= ROWS) continue;
                // 下行：只缺中央 c，且整行其他格都是可消方塊（不含 G/B）
                bool lowerOk = true; bool lowerGarbage = false;
                for (int cc = 0; cc < COLS; cc++) {
                    int cell = board[lower][cc];
                    if (cc == c) { if (cell != CELL_EMPTY) { lowerOk = false; break; } }
                    else {
                        if (cell == CELL_EMPTY) { lowerOk = false; break; }
                        if (cell != CELL_BLOCK) { lowerGarbage = true; break; }
                    }
                }
                if (!lowerOk || lowerGarbage) continue;
                // 上行：缺 c-1, c, c+1 三格，其餘填滿（不含 G/B）
                bool upperOk = true; bool upperGarbage = false;
                for (int cc = 0; cc < COLS; cc++) {
                    int cell = board[upper][cc];
                    if (cc >= c - 1 && cc <= c + 1) { if (cell != CELL_EMPTY) { upperOk = false; break; } }
                    else {
                        if (cell == CELL_EMPTY) { upperOk = false; break; }
                        if (cell != CELL_BLOCK) { upperGarbage = true; break; }
                    }
                }
                if (!upperOk || upperGarbage) continue;
                // 屋簷：上行再上面一行，c-1 或 c+1 其中一側有方塊（旋入用），中央 c 必須空
                int roof = upper - 1;
                if (roof < 0) continue;
                if (board[roof][c] != CELL_EMPTY) continue;
                bool leftRoof = board[roof][c-1] != CELL_EMPTY;
                bool rightRoof = board[roof][c+1] != CELL_EMPTY;
                if (leftRoof || rightRoof) {
                    m.tSlotScore = 1; // 場上有一個完整 TSD 槽
                    break;
                }
            }
        }
        return m;
    }

    int phaseOf(const Metrics& m, int comboState, int incoming, int keepEmpty) {
        if (keepEmpty < 1) return PHASE_BURST;
        if (m.maxH + incoming >= 16) return PHASE_BURST;
        if (m.buildHoles >= 2) return PHASE_BURST;
        if (comboState >= 2) return PHASE_BURST;

        int targetH = 13 - m.garbageRows - incoming;
        if (targetH < 6) targetH = 6;
        int targetResidue = keepEmpty - 1;
        int wellDepth = m.buildMinNet - m.wellMaxNet;
        int needDepth = std::min(keepEmpty >= 3 ? 6 : 4, targetH - 1);

        int readiness = 0;
        if (m.buildMinNet >= targetH - 2) readiness++;
        if (m.buildMinNet >= targetH) readiness++;
        if (m.buildMaxNet - m.buildMinNet <= 2) readiness++;
        if (wellDepth >= needDepth) readiness++;
        if (m.wellBlocksNet <= targetResidue + 1) readiness++;
        return (readiness >= 4) ? PHASE_BURST : PHASE_OPENING;
    }

    double evaluate(const int board[ROWS][COLS], const Metrics& m, int phase,
                    int comboState, int b2bState, int keepEmpty, int incoming) {
        double score = 0;
        int wellStart = (keepEmpty >= 1) ? COLS - keepEmpty : COLS;

        int effMax = m.maxH + incoming;
        if (effMax > 12) {
            double over = effMax - 12;
            score -= over * over * 40000.0;
        }
        if (m.maxH >= 18) score -= (m.maxH - 17) * 6000000.0;

        score -= m.garbageRows * 100000.0;
        score -= m.trenchSq * 300000.0;

        if (keepEmpty < 1) {
            // --- Auto 模式：TSD/B2B 風格 + 均衡生存 ---
            // 注意：T 槽的「洞」會被洞懲罰打到——所以 T 槽獎勵必須高於
            // 它造成的洞懲罰，AI 才願意主動蓋槽（槽的下行中央格會被算成 1 個洞）
            score -= m.buildHolesW * 1500000.0;
            int bump = 0;
            for (int c = 1; c < COLS; c++) bump += std::abs(m.colH[c] - m.colH[c-1]);
            score -= bump * 15000.0;
            for (int c = 0; c < COLS; c++) score -= (m.colH[c] - m.garbageRows > 0 ? (m.colH[c] - m.garbageRows) : 0) * 3000.0;
            if (comboState >= 0) score += 300000.0;
            // ★ 完整 TSD 槽：+6M（覆蓋它自帶的 1-2 個洞懲罰 ~2-3M 之後依然是大獎勵，
            // 也讓 AI 在等 T 來的期間願意守住這個槽）
            if (m.tSlotScore > 0 && m.maxH + incoming < 15) score += 6000000.0;
            // ★ B2B 火種：保持 B2B 鏈活著（下一次 TSD/Quad 攻擊翻倍）
            if (b2bState > 0) score += 500000.0;
            return score;
        }

        int targetResidue = keepEmpty - 1;

        if (phase == PHASE_OPENING) {
            score -= m.buildHolesW * 2500000.0;
            score -= m.wellHolesW * 2500000.0;

            score += m.buildMinNet * 180000.0;
            for (int c = 0; c < wellStart; c++) {
                int net = m.colH[c] - m.garbageRows; if (net < 0) net = 0;
                score += std::min(net, 13) * 8000.0;
            }

            score -= (double)m.buildBump * m.buildBump * 2000.0;
            int span = m.buildMaxNet - m.buildMinNet;
            score -= (double)span * span * 5000.0;

            if (m.wellMaxNet > 1) score -= (m.wellMaxNet - 1) * 3000000.0;

            if (m.residueBlocks > targetResidue) {
                score -= (m.residueBlocks - targetResidue) * 5000000.0;
            } else if (m.residueBlocks == targetResidue) {
                score += 500000.0;
            } else {
                score += m.residueBlocks * 80000.0;
            }

            int wellDepth = m.buildMinNet - m.wellMaxNet;
            score += std::min(wellDepth, 12) * 50000.0;
            if (wellDepth < 6) score -= (6 - wellDepth) * 300000.0;

        } else {
            score -= m.buildHolesW * 1800000.0;
            score -= m.wellHolesW * 2800000.0;

            score -= (double)m.buildBump * m.buildBump * 1000.0;

            if (keepEmpty == 1) {
                double wellPenalty = (m.maxH + incoming >= 16) ? 600000.0 : 2000000.0;
                score -= m.wellBlocksNet * wellPenalty;
                score += m.buildMinNet * 30000.0;
                // 1-wide 是 Quad 流：B2B 鏈價值很高（B2B Quad = 6 攻擊）
                if (b2bState > 0) score += 600000.0;
                return score;
            }

            int wellDebt = m.wellBlocksNet - targetResidue;
            if (wellDebt > 0) score -= wellDebt * 500000.0;

            if (comboState >= 0) {
                score += 800000.0 + std::min(comboState, 10) * 150000.0;

                int remainder = m.wellBlocksNet % keepEmpty;
                if (remainder == targetResidue) score += 600000.0;
                else score -= std::abs(remainder - targetResidue) * 300000.0;

                int wellTopRow = ROWS;
                for (int c = wellStart; c < COLS; c++) {
                    for (int r = 0; r < ROWS; r++) {
                        if (board[r][c] != CELL_EMPTY) { if (r < wellTopRow) wellTopRow = r; break; }
                    }
                }
                if (wellTopRow > 0 && wellTopRow < ROWS) {
                    int topGaps = 0, gapStart = -1, gapEnd = -1;
                    for (int c = wellStart; c < COLS; c++) {
                        if (board[wellTopRow][c] == CELL_EMPTY) {
                            topGaps++;
                            if (gapStart < 0) gapStart = c;
                            gapEnd = c;
                        }
                    }
                    if (topGaps == 1) score += 600000.0;
                    else if (topGaps >= 2 && topGaps <= 3 && gapEnd - gapStart == topGaps - 1) score += 300000.0;
                }
            } else {
                score += m.buildMinNet * 30000.0;
                score += m.almostRows * 80000.0;
            }
        }
        return score;
    }

    void simulateLock(int board[ROWS][COLS], const std::vector<int>& matrix, int row, int col,
                      int& comboState, int& linesCleared, int& bombsCleared, bool& perfectClear) {
        for (int i = 0; i < 16; i++) {
            if (matrix[i] == 1) {
                int br = row + (i / 4), bc = col + (i % 4);
                if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) board[br][bc] = CELL_BLOCK;
            }
        }

        bool clearRow[ROWS] = {false};
        for (int i = 0; i < 16; i++) {
            if (matrix[i] == 1) {
                int br = row + (i / 4), bc = col + (i % 4);
                if (bc < 0 || bc >= COLS) continue;
                int checkR = br + 1;
                while (checkR < ROWS && board[checkR][bc] == CELL_BOMB) {
                    clearRow[checkR] = true;
                    checkR++;
                }
            }
        }

        linesCleared = 0;
        for (int r = 0; r < ROWS; r++) {
            bool full = true, hasGarbage = false;
            for (int c = 0; c < COLS; c++) {
                if (board[r][c] == CELL_EMPTY) { full = false; break; }
                if (board[r][c] == CELL_GARBAGE || board[r][c] == CELL_BOMB) hasGarbage = true;
            }
            if (full && !hasGarbage) { clearRow[r] = true; linesCleared++; }
        }

        bombsCleared = 0;
        int totalCleared = 0;
        int dst = ROWS - 1;
        for (int src = ROWS - 1; src >= 0; src--) {
            if (clearRow[src]) {
                totalCleared++;
                for (int c = 0; c < COLS; c++) {
                    if (board[src][c] == CELL_BOMB) { bombsCleared++; break; }
                }
            } else {
                if (dst != src) {
                    for (int c = 0; c < COLS; c++) board[dst][c] = board[src][c];
                }
                dst--;
            }
        }
        while (dst >= 0) {
            for (int c = 0; c < COLS; c++) board[dst][c] = CELL_EMPTY;
            dst--;
        }

        if (totalCleared > 0) comboState++;
        else comboState = -1;

        perfectClear = false;
        if (totalCleared > 0) {
            perfectClear = true;
            for (int r = ROWS - 1; r >= 0 && perfectClear; r--) {
                for (int c = 0; c < COLS; c++) {
                    if (board[r][c] != CELL_EMPTY) { perfectClear = false; break; }
                }
            }
        }
    }

    // 攻擊計算（與 game.js applyScore 的攻擊表一字不差，外加炸彈與 PC）
    // 同時更新 b2bState（呼叫前的值決定 B2B 加成，呼叫後更新鏈）
    int attackOf(int linesCleared, int bombsCleared, int comboState, int tSpin,
                 int& b2bState, bool perfectClear) {
        int attack = 0;
        bool difficult = false;
        if (tSpin == TSPIN_FULL) {
            difficult = true;
            const int t[4] = {0, 2, 4, 6};
            attack = (linesCleared <= 3) ? t[linesCleared] : 6;
        } else if (tSpin == TSPIN_MINI) {
            difficult = true;
            const int t[4] = {0, 1, 0, 0};
            attack = (linesCleared <= 3) ? t[linesCleared] : 0;
        } else {
            attack = CLEAR_ATTACK[std::min(linesCleared, 4)];
            if (linesCleared == 4) difficult = true;
        }

        if (difficult) {
            if (linesCleared > 0) {
                if (b2bState > 0) {
                    if (tSpin == TSPIN_NONE && linesCleared == 4) attack = 6;
                    else if (tSpin == TSPIN_MINI && linesCleared == 1) attack = 2;
                    else if (tSpin == TSPIN_FULL && linesCleared == 1) attack = 3;
                    else if (tSpin == TSPIN_FULL && linesCleared == 2) attack = 6;
                    else if (tSpin == TSPIN_FULL && linesCleared == 3) attack = 9;
                }
                b2bState++;
            }
        } else if (linesCleared > 0) {
            b2bState = 0;
        }

        if (comboState > 0) attack += COMBO_BONUS[std::min(comboState, 10)];
        attack += bombsCleared;
        if (perfectClear) attack += 10;
        return attack;
    }

    // === Perfect Clear 窮舉求解器 ===
    // 盤面乾淨（無垃圾、無洞、maxH<=4）且空格數是 4 的倍數時，
    // 窮舉「接下來的方塊（含 hold 調度）能否恰好填滿全部空格」。
    // 用 BFS 落點保證可達性（含 spin/tuck），成功就回傳整條線的第一步。

    // 剪枝：底部區域每個「空格連通塊」大小必須是 4 的倍數，否則永遠填不滿。
    // ★ 連通的定義必須包含「同一欄內隔著方塊的空格」——因為消行會讓上面的
    // 空格區掉下來跟下面合併（很多 PC 解法靠這個），不算進去會把正解剪光
    bool pcRegionsOk(const int board[ROWS][COLS], int topRow) {
        bool seen[4][COLS] = {{false}};
        for (int r = topRow; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                if (board[r][c] != CELL_EMPTY || seen[r - topRow][c]) continue;
                int stack[4 * COLS][2], sp = 0, size = 0;
                stack[sp][0] = r; stack[sp][1] = c; sp++;
                seen[r - topRow][c] = true;
                while (sp > 0) {
                    sp--;
                    int cr = stack[sp][0], cc = stack[sp][1];
                    size++;
                    // 左右相鄰
                    const int dc2[2] = {-1, 1};
                    for (int k = 0; k < 2; k++) {
                        int nc = cc + dc2[k];
                        if (nc < 0 || nc >= COLS) continue;
                        if (board[cr][nc] != CELL_EMPTY || seen[cr - topRow][nc]) continue;
                        seen[cr - topRow][nc] = true;
                        stack[sp][0] = cr; stack[sp][1] = nc; sp++;
                    }
                    // 同一欄的所有空格（消行下移後會相連）
                    for (int nr = topRow; nr < ROWS; nr++) {
                        if (nr == cr) continue;
                        if (board[nr][cc] != CELL_EMPTY || seen[nr - topRow][cc]) continue;
                        seen[nr - topRow][cc] = true;
                        stack[sp][0] = nr; stack[sp][1] = cc; sp++;
                    }
                }
                if (size % 4 != 0) return false;
            }
        }
        return true;
    }

    // DFS：每一手有兩個選項（直接放當前方塊 / 跟 hold 交換後放）。
    // 成功時第 0 層把第一步寫進 outFirst / outUseHold。
    bool pcDfs(int board[ROWS][COLS], int topRow, int curId, int holdId,
               const std::vector<int>& queueIds, int qIdx, int depth,
               Placement& outFirst, bool& outUseHold, int& nodeBudget, bool rootHoldAllowed) {
        if (--nodeBudget <= 0) return false;

        bool empty = true;
        for (int r = topRow; r < ROWS && empty; r++) {
            for (int c = 0; c < COLS; c++) {
                if (board[r][c] != CELL_EMPTY) { empty = false; break; }
            }
        }
        if (empty) return true;
        if (depth >= 5 || curId < 0) return false;

        // 選項：piece = 這手實際放的方塊；nHold/nQIdx = 放完後的 hold 與 queue 狀態
        struct Option { int piece; int nHold; int nQIdx; bool isHold; };
        Option opts[2]; int nOpts = 0;
        opts[nOpts++] = { curId, holdId, qIdx, false };
        if (depth > 0 || rootHoldAllowed) {
            if (holdId == -1) {
                if (qIdx < (int)queueIds.size() && queueIds[qIdx] != curId)
                    opts[nOpts++] = { queueIds[qIdx], curId, qIdx + 1, true };
            } else if (holdId != curId) {
                opts[nOpts++] = { holdId, curId, qIdx, true };
            }
        }

        static std::vector<Placement> plist[5];
        for (int oi = 0; oi < nOpts; oi++) {
            const Option& opt = opts[oi];
            generatePlacements(board, opt.piece, depth == 0, plist[depth]);
            for (const auto& p : plist[depth]) {
                // 所有格子必須落在 PC 區域內（不能疊出區域頂）
                const auto& matrix = PIECES[opt.piece][p.rot];
                bool inRegion = true;
                for (int i = 0; i < 16 && inRegion; i++) {
                    if (matrix[i] == 1 && p.row + (i / 4) < topRow) inRegion = false;
                }
                if (!inRegion) continue;

                int backup[ROWS][COLS];
                std::memcpy(backup, board, sizeof(backup));
                int tmpCombo = 0, lines = 0, bombs = 0; bool pc = false;
                simulateLock(board, matrix, p.row, p.col, tmpCombo, lines, bombs, pc);

                bool ok = pc;
                if (!ok && pcRegionsOk(board, topRow)) {
                    int nextCur = (opt.nQIdx < (int)queueIds.size()) ? queueIds[opt.nQIdx] : -2;
                    if (nextCur >= 0) {
                        Placement dummy; bool dummyHold;
                        ok = pcDfs(board, topRow, nextCur, opt.nHold, queueIds, opt.nQIdx + 1,
                                   depth + 1, dummy, dummyHold, nodeBudget, rootHoldAllowed);
                    }
                }
                std::memcpy(board, backup, sizeof(backup));
                if (ok) {
                    if (depth == 0) { outFirst = p; outUseHold = opt.isHold; }
                    return true;
                }
                if (nodeBudget <= 0) return false;
            }
        }
        return false;
    }

    // 入口：檢查是否值得啟動 PC 搜尋；成功時回傳 true 並填好第一步
    bool tryPerfectClear(int curId, int holdId, const std::vector<int>& queueIds,
                         bool holdUsed, const Metrics& m, Placement& outFirst, bool& outUseHold) {
        if (m.garbageRows > 0) return false;
        // 注意：不能因為「有洞」就放棄——正典 PCO 的版型本來就帶一個被蓋住的洞，
        // 解法靠「先消上面的行讓洞化解」。pcDfs 的消行模擬會正確處理
        if (m.maxH < 1 || m.maxH > 4) return false;
        int topRow = ROWS - m.maxH;
        int emptyCells = 0;
        for (int r = topRow; r < ROWS; r++)
            for (int c = 0; c < COLS; c++)
                if (initialBoard[r][c] == CELL_EMPTY) emptyCells++;
        if (emptyCells == 0 || emptyCells % 4 != 0) return false;
        if (emptyCells / 4 > 4) return false; // 還差太多顆，交給一般搜索
        if (!pcRegionsOk(initialBoard, topRow)) return false;

        int board[ROWS][COLS];
        std::memcpy(board, initialBoard, sizeof(board));
        int nodeBudget = 2200; // 限制最壞情況思考時間（16 格 4 顆的解需要多一點）
        return pcDfs(board, topRow, curId, holdId, queueIds, 0, 0,
                     outFirst, outUseHold, nodeBudget, !holdUsed);
    }

    void expandNode(const SearchNode& node, int pieceId, bool isHoldMove,
                    std::vector<SearchNode>& nextBeam, int keepEmpty, int incoming,
                    bool isFirstDepth, double rewardDiscount, bool useBFS) {
        if (pieceId < 0 || pieceId >= (int)PIECES.size()) return;
        if (nextBeam.size() > 8000) return;

        static std::vector<Placement> placements;
        if (useBFS) {
            generatePlacements(node.board, pieceId, isFirstDepth, placements);
        } else {
            // 深層用快速直落（spin 規劃通常只需要看 1-2 步）
            placements.clear();
            for (int rot = 0; rot < 4; rot++) {
                if (pieceId == 1 && rot > 0) continue; // O 不必重複
                const auto& matrix = PIECES[pieceId][rot];
                for (int c = -2; c <= COLS; c++) {
                    int r = 18;
                    if (!isValid(matrix, r, c, node.board)) continue;
                    while (isValid(matrix, r + 1, c, node.board)) r++;
                    Placement p; p.row = r; p.col = c; p.rot = rot; p.tSpin = TSPIN_NONE;
                    placements.push_back(p);
                }
            }
        }

        for (const auto& p : placements) {
            const auto& matrix = PIECES[pieceId][p.rot];

            SearchNode nextNode = node;

            int linesCleared = 0, bombsCleared = 0;
            bool perfectClear = false;
            simulateLock(nextNode.board, matrix, p.row, p.col,
                         nextNode.comboState, linesCleared, bombsCleared, perfectClear);

            double reward = 0;
            int atk = attackOf(linesCleared, bombsCleared, nextNode.comboState, p.tSpin,
                               nextNode.b2bState, perfectClear);
            reward += atk * 1000000.0;
            reward += bombsCleared * 700000.0;
            // T-Spin 額外鼓勵（攻擊表已經反映大半，再加一點讓 AI 願意花步數轉進去）
            if (p.tSpin == TSPIN_FULL && linesCleared >= 2) reward += 800000.0;

            if (node.phase == PHASE_OPENING && linesCleared > 0 && p.tSpin == TSPIN_NONE) {
                double headroom = (16.0 - node.maxH - incoming) / 4.0;
                if (headroom > 1.0) headroom = 1.0;
                if (headroom < 0.0) headroom = 0.0;
                reward -= linesCleared * 2800000.0 * headroom;
            }

            Metrics m = computeMetrics(nextNode.board, keepEmpty);
            if (m.maxH >= 18) reward -= (m.maxH - 17) * 2000000.0;

            nextNode.accumReward = node.accumReward + reward * rewardDiscount;
            nextNode.phase = phaseOf(m, nextNode.comboState, incoming, keepEmpty);
            nextNode.maxH = m.maxH;
            nextNode.score = nextNode.accumReward
                           + evaluate(nextNode.board, m, nextNode.phase, nextNode.comboState,
                                      nextNode.b2bState, keepEmpty, incoming);

            if (isFirstDepth) {
                nextNode.firstCol = p.col;
                nextNode.firstRow = p.row;
                nextNode.firstRot = p.rot;
                nextNode.firstUseHold = isHoldMove;
                nextNode.firstPath = p.path;
            }
            nextBeam.push_back(nextNode);
        }
    }

public:
    BrickadeAI() {}

    val findBestMove(std::string boardStr, std::string currentPiece, std::string holdPiece,
                     std::string queueStr, int currentCombo, int keepEmpty,
                     bool holdUsed, int incomingGarbage, int currentB2b) {
        val result = val::object();
        result.set("col", 3); result.set("row", 19); result.set("rot", 0);
        result.set("useHold", false); result.set("path", std::string(""));
        if (boardStr.length() != ROWS * COLS) return result;
        parseBoard(boardStr);

        int currentId = pieceCharToId(currentPiece.empty() ? '?' : currentPiece[0]);
        if (currentId < 0) return result;
        int holdId = (holdPiece == "NONE" || holdPiece.empty()) ? -1 : pieceCharToId(holdPiece[0]);

        std::vector<int> queueIds;
        for (char ch : queueStr) {
            int id = pieceCharToId(ch);
            if (id >= 0) queueIds.push_back(id);
        }

        SearchNode rootNode;
        std::copy(&initialBoard[0][0], &initialBoard[0][0] + ROWS * COLS, &rootNode.board[0][0]);
        rootNode.holdId = holdId;
        rootNode.comboState = currentCombo;
        rootNode.b2bState = currentB2b;
        rootNode.queueConsumed = 0;
        rootNode.accumReward = 0;
        rootNode.score = 0;
        rootNode.firstCol = 3; rootNode.firstRow = 19; rootNode.firstRot = 0;
        rootNode.firstUseHold = false;
        Metrics rootM = computeMetrics(rootNode.board, keepEmpty);
        rootNode.phase = phaseOf(rootM, currentCombo, incomingGarbage, keepEmpty);
        rootNode.maxH = rootM.maxH;

        // ★ Perfect Clear 窮舉：盤面乾淨且差 ≤4 顆就能全清時，直接走 PC 線（+10 攻擊）
        {
            Placement pcMove; bool pcHold = false;
            if (tryPerfectClear(currentId, holdId, queueIds, holdUsed, rootM, pcMove, pcHold)) {
                result.set("col", pcMove.col);
                result.set("row", pcMove.row);
                result.set("rot", pcMove.rot);
                result.set("useHold", pcHold);
                result.set("path", pcMove.path);
                return result;
            }
        }

        std::vector<SearchNode> currentBeam;
        currentBeam.push_back(rootNode);

        int DEPTH = std::min((int)queueIds.size() + 1, 5);
        size_t BEAM_WIDTH = 64;
        if (currentCombo >= 0 || rootM.garbageRows > 0) BEAM_WIDTH = 96;

        const double DISCOUNT[5] = {1.0, 0.97, 0.94, 0.91, 0.88};

        for (int depth = 0; depth < DEPTH; depth++) {
            std::vector<SearchNode> nextBeam;
            nextBeam.reserve(BEAM_WIDTH * 80);
            double disc = DISCOUNT[depth];
            // 第 0-1 層用完整 BFS（找 tuck/spin），深層用直落（速度）
            bool useBFS = (depth <= 1);

            for (const auto& node : currentBeam) {
                int pieceToDrop;
                if (depth == 0) {
                    pieceToDrop = currentId;
                } else {
                    int qIdx = node.queueConsumed;
                    if (qIdx >= (int)queueIds.size()) continue;
                    pieceToDrop = queueIds[qIdx];
                }

                {
                    SearchNode tmp = node;
                    if (depth > 0) tmp.queueConsumed++;
                    expandNode(tmp, pieceToDrop, false, nextBeam, keepEmpty, incomingGarbage, (depth == 0), disc, useBFS);
                }

                if (!(depth == 0 && holdUsed)) {
                    if (node.holdId == -1) {
                        int nextQIdx = node.queueConsumed + (depth > 0 ? 1 : 0);
                        if (nextQIdx < (int)queueIds.size()) {
                            SearchNode tmp = node;
                            tmp.holdId = pieceToDrop;
                            tmp.queueConsumed = nextQIdx + 1;
                            expandNode(tmp, queueIds[nextQIdx], true, nextBeam, keepEmpty, incomingGarbage, (depth == 0), disc, useBFS);
                        }
                    } else {
                        SearchNode tmp = node;
                        int hPiece = node.holdId;
                        tmp.holdId = pieceToDrop;
                        if (depth > 0) tmp.queueConsumed++;
                        expandNode(tmp, hPiece, true, nextBeam, keepEmpty, incomingGarbage, (depth == 0), disc, useBFS);
                    }
                }
            }

            if (nextBeam.empty()) break;

            if (nextBeam.size() > BEAM_WIDTH) {
                std::partial_sort(nextBeam.begin(), nextBeam.begin() + BEAM_WIDTH, nextBeam.end(),
                    [](const SearchNode& a, const SearchNode& b) { return a.score > b.score; });
                nextBeam.resize(BEAM_WIDTH);
            } else {
                std::sort(nextBeam.begin(), nextBeam.end(),
                    [](const SearchNode& a, const SearchNode& b) { return a.score > b.score; });
            }
            currentBeam = nextBeam;
        }

        if (!currentBeam.empty() && currentBeam[0].firstRow >= 0) {
            result.set("col", currentBeam[0].firstCol);
            result.set("row", currentBeam[0].firstRow);
            result.set("rot", currentBeam[0].firstRot);
            result.set("useHold", currentBeam[0].firstUseHold);
            result.set("path", currentBeam[0].firstPath);
        }
        return result;
    }
};

EMSCRIPTEN_BINDINGS(brickade_ai_module) {
    class_<BrickadeAI>("BrickadeAI")
        .constructor<>()
        .function("findBestMove", &BrickadeAI::findBestMove);
}
