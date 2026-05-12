#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>
#include <emscripten/bind.h>

using namespace emscripten;

const int ROWS = 40;
const int COLS = 10;

const std::vector<std::vector<std::vector<int>>> PIECES = {
    {{0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0}, {0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0}, {0,0,0,0, 0,0,0,0, 1,1,1,1, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0}}, // 0: I
    {{1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}}, // 1: O
    {{0,1,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,1,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 0,1,0,0, 0,0,0,0}, {0,1,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0}}, // 2: T
    {{1,0,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,1,0, 0,1,0,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 0,0,1,0, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 1,1,0,0, 0,0,0,0}}, // 3: J
    {{0,0,1,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 0,1,1,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 1,0,0,0, 0,0,0,0}, {1,1,0,0, 0,1,0,0, 0,1,0,0, 0,0,0,0}}, // 4: L
    {{0,1,1,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,1,0, 0,0,1,0, 0,0,0,0}, {0,0,0,0, 0,1,1,0, 1,1,0,0, 0,0,0,0}, {1,0,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0}}, // 5: S
    {{1,1,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0}, {0,0,1,0, 0,1,1,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,0,0, 0,1,1,0, 0,0,0,0}, {0,1,0,0, 1,1,0,0, 1,0,0,0, 0,0,0,0}}  // 6: Z
};

int pieceCharToId(char type) {
    switch (type) {
        case 'I': return 0; case 'O': return 1; case 'T': return 2;
        case 'J': return 3; case 'L': return 4; case 'S': return 5; case 'Z': return 6;
        default: return -1;
    }
}

struct SearchNode {
    int board[ROWS][COLS];
    int holdId;
    bool holdUsed;
    int comboState;
    double score;
    int firstCol, firstRow, firstRot;
    bool firstUseHold;
    int queueConsumed;  // 追蹤已消耗的 queue 數量，修復 hold 時 queue 重複使用的 bug
};

class BrickadeAI {
private:
    int initialBoard[ROWS][COLS];

    void parseBoard(const std::string& boardStr) {
        int i = 0;
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                initialBoard[r][c] = (boardStr[i] == '.') ? 0 : 1;
                i++;
            }
        }
    }

    bool isValid(const std::vector<int>& matrix, int row, int col, const int testBoard[ROWS][COLS]) {
        for (int i = 0; i < 16; i++) {
            if (matrix[i] == 1) {
                int r = row + (i / 4), c = col + (i % 4);
                if (c < 0 || c >= COLS || r >= ROWS) return false;
                if (r >= 0 && testBoard[r][c] != 0) return false;
            }
        }
        return true;
    }

    // 核心評分引擎 (Shape Evaluator)
    double evaluate(int testBoard[ROWS][COLS], int linesCleared, int comboState, int keepEmpty) {
        int colHeights[COLS] = {0};
        int wellStart = COLS;
        if (keepEmpty == 1) wellStart = 9;
        else if (keepEmpty >= 2) wellStart = COLS - keepEmpty;

        int buildHoles = 0, wellHoles = 0, aggregateHeight = 0;

        for (int c = 0; c < COLS; c++) {
            bool foundTop = false;
            for (int r = 0; r < ROWS; r++) {
                if (testBoard[r][c] != 0) {
                    foundTop = true;
                    if (colHeights[c] == 0) colHeights[c] = ROWS - r;
                } else if (foundTop) {
                    if (c < wellStart) buildHoles++; 
                    else wellHoles++; 
                }
            }
            aggregateHeight += colHeights[c];
        }

        int maxHeight = *std::max_element(colHeights, colHeights + COLS);
        if (maxHeight > 22) return -999999999.0; 

        double score = 0;

        if (keepEmpty == 0 || keepEmpty == 1) {
            score -= buildHoles * 1000000.0; 
            int bumpiness = 0;
            for (int c = 1; c < wellStart; c++) bumpiness += std::abs(colHeights[c] - colHeights[c-1]);
            score -= bumpiness * 5000.0;
            score -= aggregateHeight * 50.0;
            if (linesCleared == 4) score += 200000.0; 
            else if (linesCleared > 0) score -= linesCleared * 20000.0;
        } else {
            // === 模式 B：4-wide 大進化版 ===
            int buildMin = 999, buildMax = 0;
            for (int c = 0; c < wellStart; c++) {
                if (colHeights[c] < buildMin) buildMin = colHeights[c];
                if (colHeights[c] > buildMax) buildMax = colHeights[c];
            }

            int targetResidue = keepEmpty - 1; // 4-wide 時為 3

            int rightBottomBlocks = 0;
            int wellBlocks = 0;
            int wellMaxHeight = 0;

            // 精準掃描右側深坑的方塊分佈
            for (int c = wellStart; c < COLS; c++) {
                if (colHeights[c] > wellMaxHeight) wellMaxHeight = colHeights[c];
                for (int r = 0; r < ROWS; r++) {
                    if (testBoard[r][c] != 0) {
                        wellBlocks++;
                        if (r == ROWS - 1) rightBottomBlocks++;
                    }
                }
            }

            int buildBumpiness = 0;
            for (int c = 1; c < wellStart; c++) buildBumpiness += std::abs(colHeights[c] - colHeights[c-1]);

            // 主塔洞永遠是大罪
            score -= buildHoles * 5000000.0;
            // 井裡的洞也是大罪
            score -= wellHoles * 5000000.0;

            // ★ 複合就緒度評估（取代死板的 buildMin < 12）
            bool isOpeningPhase;
            if (comboState >= 0) {
                isOpeningPhase = false; // 正在 combo 中，絕對不回到開場期
            } else {
                int readiness = 0;
                if (buildMin >= 8) readiness++;
                if (buildMin >= 10) readiness++;
                if (buildMax - buildMin <= 2) readiness++;     // 塔面平坦
                int wellDepth = buildMin - wellMaxHeight;
                if (wellDepth >= 6) readiness++;               // 足夠深的井
                if (wellBlocks <= targetResidue + 1) readiness++; // 井底乾淨
                isOpeningPhase = (readiness < 4); // 至少 4/5 才算就緒
            }

            if (isOpeningPhase) {
                // 【蓄力期】軟性引導，取代硬性懲罰

                // 獎勵蓋高
                score += buildMin * 15000.0;

                // 平坦度（二次方懲罰，越不平越慘）
                score -= (double)buildBumpiness * buildBumpiness * 2000.0;
                score -= (double)(buildMax - buildMin) * (buildMax - buildMin) * 5000.0;

                // 井的乾淨度：井裡超過 1 層方塊 = 大問題
                if (wellMaxHeight > 1) {
                    score -= (wellMaxHeight - 1) * 3000000.0;
                }

                // 殘留方塊管理（底部精確控制）
                if (rightBottomBlocks > targetResidue) {
                    score -= (rightBottomBlocks - targetResidue) * 5000000.0;
                } else if (rightBottomBlocks == targetResidue) {
                    score += 500000.0; // 完美殘留
                } else {
                    score += rightBottomBlocks * 80000.0;
                }

                // 井深獎勵
                int wellDepth = buildMin - wellMaxHeight;
                score += std::min(wellDepth, 12) * 50000.0;
                if (wellDepth < 6) score -= (6 - wellDepth) * 500000.0;

                // 禁止開場期消行
                if (linesCleared > 0) score -= linesCleared * 3000000.0;

            } else {
                // 【爆發期】加入 4n+3 規則和 combo 續航性

                if (linesCleared > 0) {
                    // Combo 基礎分（越高越好）
                    score += comboState * 1500000.0;

                    // 單行消除最適合延長 combo 長度
                    if (linesCleared == 1) score += 500000.0;
                    else score += linesCleared * 100000.0;

                    // ★ 4n+3 規則：消行後 well 中的方塊數應為 3, 7, 11, 15...
                    int remainder = wellBlocks % keepEmpty;
                    int target = keepEmpty - 1;
                    if (remainder == target) {
                        score += 1000000.0; // 完美殘留
                    } else {
                        score -= std::abs(remainder - target) * 400000.0;
                    }

                    // ★ Combo 續航性：檢查消行後的井口空格分佈
                    int wellTopRow = ROWS;
                    for (int c = wellStart; c < COLS; c++) {
                        for (int r = 0; r < ROWS; r++) {
                            if (testBoard[r][c] && r < wellTopRow) { wellTopRow = r; break; }
                        }
                    }
                    if (wellTopRow > 0 && wellTopRow < ROWS) {
                        int checkRow = wellTopRow; // 井頂那一行
                        int topGaps = 0;
                        int gapStart = -1, gapEnd = -1;
                        for (int c = wellStart; c < COLS; c++) {
                            if (testBoard[checkRow][c] == 0) {
                                topGaps++;
                                if (gapStart < 0) gapStart = c;
                                gapEnd = c;
                            }
                        }
                        // 1 個空格最好（任何方塊都能塞）
                        if (topGaps == 1) score += 300000.0;
                        // 2-3 個相鄰空格可接受
                        else if (topGaps >= 2 && topGaps <= 3 && gapEnd - gapStart == topGaps - 1) {
                            score += 150000.0;
                        }
                    }

                } else {
                    // 沒消行
                    if (comboState >= 0) {
                        score -= 50000000.0; // 斷 combo 依然是重罪
                    } else {
                        // 非 combo 狀態，回到蓄力模式
                        score += buildMin * 1000.0;
                        if (wellBlocks > targetResidue) {
                            score -= (wellBlocks - targetResidue) * 2000000.0;
                        }
                    }
                }
            }
        }
        return score;
    }

    // ★ 展開節點：純粹靠 evaluate() 的軟性評分引導，不再使用硬性規則
    void expandNode(const SearchNode& node, int pieceId, bool isHoldMove, std::vector<SearchNode>& nextBeam, int keepEmpty, bool isFirstDepth) {
        if (pieceId < 0 || pieceId >= (int)PIECES.size()) return;
        // 記憶體保護：避免 nextBeam 無限膨脹導致 OOM
        if (nextBeam.size() > 8000) return;

        for (int rot = 0; rot < 4; rot++) {
            const auto& matrix = PIECES[pieceId][rot];
            for (int c = -2; c <= COLS; c++) {
                int r = 18;
                if (!isValid(matrix, r, c, node.board)) continue;
                while (isValid(matrix, r + 1, c, node.board)) r++;

                // 效能優化：確認這步合法後，才進行 SearchNode 的複製
                SearchNode nextNode = node;
                
                for (int i = 0; i < 16; i++) {
                    if (matrix[i] == 1) {
                        int br = r + (i / 4), bc = c + (i % 4);
                        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) nextNode.board[br][bc] = 1;
                    }
                }

                // 效能優化：原地消行 (In-place clear)
                int linesCleared = 0;
                int dst = ROWS - 1;
                for (int src = ROWS - 1; src >= 0; src--) {
                    bool full = true;
                    for (int bc = 0; bc < COLS; bc++) {
                        if (nextNode.board[src][bc] == 0) { full = false; break; }
                    }
                    if (full) {
                        linesCleared++;
                    } else {
                        // 如果有被消除的行，才需要把上面的行「往下搬」
                        if (dst != src) {
                            for (int bc = 0; bc < COLS; bc++) nextNode.board[dst][bc] = nextNode.board[src][bc];
                        }
                        dst--;
                    }
                }
                // 把最頂部的空缺補上 0
                while (dst >= 0) {
                    for (int bc = 0; bc < COLS; bc++) nextNode.board[dst][bc] = 0;
                    dst--;
                }

                if (linesCleared > 0) nextNode.comboState++;
                else nextNode.comboState = -1;

                if (isFirstDepth) {
                    nextNode.firstCol = c;
                    nextNode.firstRow = r;
                    nextNode.firstRot = rot;
                    nextNode.firstUseHold = isHoldMove;
                }
                
                nextNode.holdUsed = isHoldMove;
                
                nextNode.score = evaluate(nextNode.board, linesCleared, nextNode.comboState, keepEmpty);
                
                nextBeam.push_back(nextNode);
            }
        }
    }

public:
    BrickadeAI() {}

    val findBestMove(std::string boardStr, std::string currentPiece, std::string holdPiece, std::string queueStr, int currentCombo, int keepEmpty) {
        if (boardStr.length() != ROWS * COLS) return val::object();
        parseBoard(boardStr);

        int currentId = pieceCharToId(currentPiece[0]);
        if (currentId < 0 || currentId >= (int)PIECES.size()) return val::object();
        int holdId = (holdPiece == "NONE") ? -1 : pieceCharToId(holdPiece[0]);
        if (holdId >= (int)PIECES.size()) holdId = -1;

        std::vector<int> queueIds;
        for (char c : queueStr) {
            int id = pieceCharToId(c);
            if (id >= 0 && id < (int)PIECES.size()) queueIds.push_back(id);
        }

        SearchNode rootNode;
        std::copy(&initialBoard[0][0], &initialBoard[0][0] + ROWS * COLS, &rootNode.board[0][0]);
        rootNode.holdId = holdId;
        rootNode.holdUsed = false;
        rootNode.comboState = currentCombo;
        rootNode.score = 0;
        rootNode.queueConsumed = 0;

        std::vector<SearchNode> currentBeam;
        currentBeam.push_back(rootNode);

        // 自適應搜索參數：4-wide combo 需要更寬更深的搜索
        // 效能考量：跑在 Web Worker 不會卡主畫面，但要控制思考時間
        int DEPTH = std::min((int)queueIds.size() + 1, 5);
        size_t BEAM_WIDTH = 30;
        if (keepEmpty >= 2) {
            BEAM_WIDTH = 40;       // 4-wide 蓄力期
            if (currentCombo >= 0) {
                BEAM_WIDTH = 60;   // combo 期間需要更寬搜索找到續 combo 的路
            }
        }

        for (int depth = 0; depth < DEPTH; depth++) {
            std::vector<SearchNode> nextBeam;
            // 預分配記憶體，避免頻繁重新分配導致 OOM
            nextBeam.reserve(BEAM_WIDTH * 80);

            for (const auto& node : currentBeam) {
                // 決定當前深度要放的方塊
                int pieceToDrop;
                if (depth == 0) {
                    pieceToDrop = currentId;
                } else {
                    int qIdx = node.queueConsumed;
                    if (qIdx >= (int)queueIds.size()) continue;
                    pieceToDrop = queueIds[qIdx];
                }

                // 正常放置
                {
                    SearchNode tmp = node;
                    if (depth > 0) tmp.queueConsumed++;
                    tmp.holdUsed = false;
                    expandNode(tmp, pieceToDrop, false, nextBeam, keepEmpty, (depth == 0));
                }

                // Hold 放置（任何深度都可以！）
                if (!node.holdUsed) {
                    if (node.holdId == -1) {
                        // 空 hold：當前方塊存入 hold，從 queue 拉下一個來用
                        int nextQIdx = node.queueConsumed + (depth > 0 ? 1 : 0);
                        if (nextQIdx < (int)queueIds.size()) {
                            SearchNode tmp = node;
                            tmp.holdId = pieceToDrop;
                            tmp.holdUsed = true;
                            tmp.queueConsumed = nextQIdx + 1;
                            int hPiece = queueIds[nextQIdx];
                            expandNode(tmp, hPiece, true, nextBeam, keepEmpty, (depth == 0));
                        }
                    } else {
                        // 有 hold：交換當前方塊和 hold
                        SearchNode tmp = node;
                        int hPiece = node.holdId;
                        tmp.holdId = pieceToDrop;
                        tmp.holdUsed = true;
                        if (depth > 0) tmp.queueConsumed++;
                        expandNode(tmp, hPiece, true, nextBeam, keepEmpty, (depth == 0));
                    }
                }
            }

            // 效能優化 ：不要排整個陣列，只排前 BEAM_WIDTH 個，排完就把後面的垃圾丟掉
            if (nextBeam.size() > BEAM_WIDTH) {
                std::partial_sort(nextBeam.begin(), nextBeam.begin() + BEAM_WIDTH, nextBeam.end(), 
                    [](const SearchNode& a, const SearchNode& b) {
                        return a.score > b.score;
                    });
                nextBeam.resize(BEAM_WIDTH);
            } else {
                std::sort(nextBeam.begin(), nextBeam.end(), [](const SearchNode& a, const SearchNode& b) {
                    return a.score > b.score;
                });
            }

            currentBeam = nextBeam;
        }

        val result = val::object();
        if (!currentBeam.empty()) {
            result.set("col", currentBeam[0].firstCol);
            result.set("row", currentBeam[0].firstRow);
            result.set("rot", currentBeam[0].firstRot);
            result.set("useHold", currentBeam[0].firstUseHold);
        } else {
            result.set("col", 3); result.set("row", 19); result.set("rot", 0); result.set("useHold", false);
        }
        return result;
    }
};

EMSCRIPTEN_BINDINGS(brickade_ai_module) {
    class_<BrickadeAI>("BrickadeAI")
        .constructor<>()
        .function("findBestMove", &BrickadeAI::findBestMove);
}