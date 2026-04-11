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
    {{0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0}, {0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0}, {0,0,0,0, 0,0,0,0, 1,1,1,1, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0}},
    {{1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {1,1,0,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}},
    {{0,1,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,1,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 0,1,0,0, 0,0,0,0}, {0,1,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0}},
    {{1,0,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,1,0, 0,1,0,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 0,0,1,0, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 1,1,0,0, 0,0,0,0}},
    {{0,0,1,0, 1,1,1,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,0,0, 0,1,1,0, 0,0,0,0}, {0,0,0,0, 1,1,1,0, 1,0,0,0, 0,0,0,0}, {1,1,0,0, 0,1,0,0, 0,1,0,0, 0,0,0,0}},
    {{0,1,1,0, 1,1,0,0, 0,0,0,0, 0,0,0,0}, {0,1,0,0, 0,1,1,0, 0,0,1,0, 0,0,0,0}, {0,0,0,0, 0,1,1,0, 1,1,0,0, 0,0,0,0}, {1,0,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0}},
    {{1,1,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0}, {0,0,1,0, 0,1,1,0, 0,1,0,0, 0,0,0,0}, {0,0,0,0, 1,1,0,0, 0,1,1,0, 0,0,0,0}, {0,1,0,0, 1,1,0,0, 1,0,0,0, 0,0,0,0}}
};

int pieceCharToId(char type) {
    switch (type) {
        case 'I': return 0; case 'O': return 1; case 'T': return 2;
        case 'J': return 3; case 'L': return 4; case 'S': return 5; case 'Z': return 6;
        default: return -1;
    }
}

class TetrisAI {
private:
    int board[ROWS][COLS];

    void parseBoard(const std::string& boardStr) {
        int i = 0;
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                board[r][c] = (boardStr[i] == '.') ? 0 : 1;
                i++;
            }
        }
    }

    bool isValid(const std::vector<int>& matrix, int row, int col, int testBoard[ROWS][COLS]) {
        for (int i = 0; i < 16; i++) {
            if (matrix[i] == 1) {
                int r = row + (i / 4), c = col + (i % 4);
                if (c < 0 || c >= COLS || r >= ROWS) return false;
                if (r >= 0 && testBoard[r][c] != 0) return false;
            }
        }
        return true;
    }

    // ★ 宗師級評分引擎：分離 Tetris 打法與 Combo 打法
    double evaluate(int testBoard[ROWS][COLS], int linesCleared, int comboState, int keepEmpty) {
        int colHeights[COLS] = {0};
        
        // 決定建塔區的邊界 (1-wide 和 Auto 都是打 Tetris，只有 2, 3, 4 是打 Combo)
        int wellStart = COLS;
        if (keepEmpty == 1) wellStart = 9;
        else if (keepEmpty >= 2) wellStart = COLS - keepEmpty;

        int buildHoles = 0;
        int aggregateHeight = 0;

        for (int c = 0; c < COLS; c++) {
            bool foundTop = false;
            for (int r = 0; r < ROWS; r++) {
                if (testBoard[r][c] != 0) {
                    foundTop = true;
                    if (colHeights[c] == 0) colHeights[c] = ROWS - r;
                } else if (foundTop) {
                    // ★ 核心修復：絕對不把 4-wide 坑洞裡的「殘留物下方空格」視為死洞！
                    if (c < wellStart) buildHoles++; 
                }
            }
            aggregateHeight += colHeights[c];
        }

        int maxHeight = *std::max_element(colHeights, colHeights + COLS);
        if (maxHeight > 24) return -999999999.0; // 保命底線

        double score = 0;
        score -= buildHoles * 1000000.0; // 建塔區有死洞唯一死罪

        // ============================================
        // 模式 A：Auto 與 1-wide (Tetris 爆發流)
        // ============================================
        if (keepEmpty == 0 || keepEmpty == 1) {
            int bumpiness = 0;
            for (int c = 1; c < wellStart; c++) bumpiness += std::abs(colHeights[c] - colHeights[c-1]);
            
            score -= bumpiness * 5000.0;
            score -= aggregateHeight * 50.0;

            if (keepEmpty == 1) {
                // 1-wide 專屬：確保最右邊 (第 9 列) 永遠是最矮的
                int mainMin = 999;
                for (int c = 0; c < 9; c++) if (colHeights[c] < mainMin) mainMin = colHeights[c];
                if (colHeights[9] > mainMin) score -= (colHeights[9] - mainMin) * 500000.0;
            }

            // 獎勵大爆發，扣除小碎步
            if (linesCleared == 1) score -= 20000.0;
            else if (linesCleared == 2) score -= 10000.0;
            else if (linesCleared >= 4) score += 200000.0; // Tetris 狂喜！

            // 壓力大時允許緊急消行
            if (maxHeight > 14 && linesCleared > 0) score += linesCleared * 50000.0;
        } 
        // ============================================
        // 模式 B：2, 3, 4-wide (Combo 連擊流)
        // ============================================
        else {
            int buildMin = 999, buildMax = 0;
            for (int c = 0; c < wellStart; c++) {
                if (colHeights[c] < buildMin) buildMin = colHeights[c];
                if (colHeights[c] > buildMax) buildMax = colHeights[c];
            }

            int buildBumpiness = 0;
            for(int c=1; c<wellStart; c++) buildBumpiness += std::abs(colHeights[c] - colHeights[c-1]);
            score -= buildBumpiness * 8000.0;

            // 絕對禁止建塔區出現斷崖
            for (int c = 1; c < wellStart; c++) {
               if (std::abs(colHeights[c] - colHeights[c-1]) > 2) score -= 200000.0;
            }

            // ★ 殘留物 (Residue) 核心計算
            int cloggedRows = 0;
            int wellBlocks = 0;
            int wellMaxHeight = 0;
            for (int c = wellStart; c < COLS; c++) if (colHeights[c] > wellMaxHeight) wellMaxHeight = colHeights[c];

            for (int r = ROWS - buildMin; r < ROWS; r++) {
                int blocksInThisRow = 0;
                for (int c = wellStart; c < COLS; c++) {
                    if (testBoard[r][c] != 0) blocksInThisRow++;
                }
                wellBlocks += blocksInThisRow;
                
                // 根據 four.lol 的理論設定殘留物標準
                if (keepEmpty == 4 || keepEmpty == 3) {
                    // 3/4-wide: 允許 1 顆殘留物，超過 1 顆視為阻塞
                    if (blocksInThisRow > 1) cloggedRows += (blocksInThisRow - 1); 
                } else if (keepEmpty == 2) {
                    // 2-wide: 盡量不要有殘留物
                    if (blocksInThisRow > 0) cloggedRows += blocksInThisRow; 
                }
            }

            // 絕對禁止右邊的殘留物高過左邊的塔 (會擋住入口)
            if (wellMaxHeight > buildMin && comboState < 0) {
                score -= (wellMaxHeight - buildMin) * 800000.0;
            }

            bool inDanger = (maxHeight > 16);

            if (comboState >= 0) {
                // 【連擊中】
                if (linesCleared > 0) {
                    score += linesCleared * 50000.0;
                    score += comboState * 200000.0; // Combo 越高分數獎勵越大
                } else {
                    score -= 2000000.0; // 斷 Combo 是死罪
                }
            } else {
                // 【蓄力中】
                if (!inDanger && buildMin < 15) {
                    score += buildMin * 15000.0; // 乖乖疊高
                    score -= cloggedRows * 500000.0; // 嚴格懲罰阻塞
                    
                    // 4-wide 需要稍微寬容一點點整體的殘留物總量，避免無謂扣分
                    if (keepEmpty >= 3 && wellBlocks > (buildMin * 0.8)) score -= 100000.0;

                    // 蓄力期如果不小心消行了，扣分 (但不如以前扣那麼重，給它一條活路)
                    if (linesCleared > 0) score -= linesCleared * 400000.0; 
                } else {
                    // 【爆發期】(塔蓋夠高了，或是有危險了)
                    if (linesCleared > 0) {
                        score += linesCleared * 50000.0; // 開始狂消
                    } else {
                        score -= cloggedRows * 500000.0;
                        score += buildMin * 1000.0;
                    }
                }
            }
        }
        return score;
    }

    double getBestScoreFuture(int currentBoard[ROWS][COLS], int pId, int comboState, int keepEmpty) {
        double bestScore = -999999999.0;
        for (int rot = 0; rot < 4; rot++) {
            const auto& matrix = PIECES[pId][rot];
            for (int c = -2; c <= COLS; c++) {
                int r = 18;
                if (!isValid(matrix, r, c, currentBoard)) continue;
                while (isValid(matrix, r + 1, c, currentBoard)) r++;

                int simBoard[ROWS][COLS];
                std::copy(&currentBoard[0][0], &currentBoard[0][0] + ROWS * COLS, &simBoard[0][0]);
                for (int i = 0; i < 16; i++) {
                    if (matrix[i] == 1) {
                        int br = r + (i / 4), bc = c + (i % 4);
                        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) simBoard[br][bc] = 1;
                    }
                }

                int linesCleared = 0;
                int nextBoard[ROWS][COLS] = {0};
                for (int br = 0; br < ROWS; br++) {
                    bool full = true;
                    for (int bc = 0; bc < COLS; bc++) {
                        if (simBoard[br][bc] == 0) { full = false; break; }
                    }
                    if (full) linesCleared++;
                }

                if (linesCleared > 0) {
                    int dst = ROWS - 1;
                    for (int src = ROWS - 1; src >= 0; src--) {
                        bool full = true;
                        for (int bc = 0; bc < COLS; bc++) {
                            if (simBoard[src][bc] == 0) { full = false; break; }
                        }
                        if (!full) {
                            for (int bc = 0; bc < COLS; bc++) nextBoard[dst][bc] = simBoard[src][bc];
                            dst--;
                        }
                    }
                } else {
                    std::copy(&simBoard[0][0], &simBoard[0][0] + ROWS * COLS, &nextBoard[0][0]);
                }

                double score = evaluate(nextBoard, linesCleared, comboState, keepEmpty);
                if (score > bestScore) bestScore = score;
            }
        }
        return bestScore;
    }

public:
    TetrisAI() {}

    val findBestMove(std::string boardStr, std::string currentPiece, std::string holdPiece, std::string queueStr, int currentCombo, int keepEmpty) {
        if (boardStr.length() != ROWS * COLS) return val::object();
        parseBoard(boardStr);

        int currentId = pieceCharToId(currentPiece[0]);
        int holdId = (holdPiece == "NONE") ? -1 : pieceCharToId(holdPiece[0]);
        int nextId = (queueStr.length() > 0) ? pieceCharToId(queueStr[0]) : -1;

        double globalBestScore = -999999999.0;
        int bestCol = 3, bestRow = 19, bestRot = 0;
        bool useHold = false;

        auto evaluatePiece = [&](int pId, bool isHold) {
            for (int rot = 0; rot < 4; rot++) {
                const auto& matrix = PIECES[pId][rot];
                for (int c = -2; c <= COLS; c++) {
                    int r = 18;
                    if (!isValid(matrix, r, c, board)) continue;
                    while (isValid(matrix, r + 1, c, board)) r++;

                    int simBoard[ROWS][COLS];
                    std::copy(&board[0][0], &board[0][0] + ROWS * COLS, &simBoard[0][0]);
                    for (int i = 0; i < 16; i++) {
                        if (matrix[i] == 1) {
                            int br = r + (i / 4), bc = c + (i % 4);
                            if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) simBoard[br][bc] = 1;
                        }
                    }

                    int linesCleared = 0;
                    int nextBoard[ROWS][COLS] = {0};
                    for (int br = 0; br < ROWS; br++) {
                        bool full = true;
                        for (int bc = 0; bc < COLS; bc++) {
                            if (simBoard[br][bc] == 0) { full = false; break; }
                        }
                        if (full) linesCleared++;
                    }

                    if (linesCleared > 0) {
                        int dst = ROWS - 1;
                        for (int src = ROWS - 1; src >= 0; src--) {
                            bool full = true;
                            for (int bc = 0; bc < COLS; bc++) {
                                if (simBoard[src][bc] == 0) { full = false; break; }
                            }
                            if (!full) {
                                for (int bc = 0; bc < COLS; bc++) nextBoard[dst][bc] = simBoard[src][bc];
                                dst--;
                            }
                        }
                    } else {
                        std::copy(&simBoard[0][0], &simBoard[0][0] + ROWS * COLS, &nextBoard[0][0]);
                    }

                    double score = evaluate(nextBoard, linesCleared, currentCombo, keepEmpty);

                    int simulatedCombo = currentCombo;
                    if (linesCleared > 0) simulatedCombo++;
                    else simulatedCombo = -1;

                    if (nextId != -1) {
                        score += getBestScoreFuture(nextBoard, nextId, simulatedCombo, keepEmpty) * 0.8;
                    }

                    if (score > globalBestScore) {
                        globalBestScore = score; bestCol = c; bestRow = r; bestRot = rot; useHold = isHold;
                    }
                }
            }
        };

        evaluatePiece(currentId, false);

        int activeHoldId = holdId;
        if (activeHoldId == -1 && nextId != -1) activeHoldId = nextId;
        if (activeHoldId != -1 && activeHoldId != currentId) {
            evaluatePiece(activeHoldId, true);
        }

        val result = val::object();
        result.set("col", bestCol);
        result.set("row", bestRow);
        result.set("rot", bestRot);
        result.set("useHold", useHold);
        return result;
    }
};

EMSCRIPTEN_BINDINGS(tetris_ai_module) {
    class_<TetrisAI>("TetrisAI")
        .constructor<>()
        .function("findBestMove", &TetrisAI::findBestMove);
}