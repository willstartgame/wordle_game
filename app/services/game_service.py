from app.core.exceptions import Result
from app.core.constants import GameConfig

def check_wordle_guess(target_word: str, guess_word: str) -> Result:
    """純函式：只負責計算 Wordle 的綠、黃、灰邏輯，不操作資料庫或伺服器"""
    
    # 1. 把單字都轉成大寫，比較好對比
    target = target_word.upper()
    guess = guess_word.upper()

    # 2. 檢查玩家猜的長度與合法性
    if len(guess) != GameConfig.WORD_LENGTH:
        return Result.failure(GameConfig.MSG_INVALID_LENGTH)

    if not guess.isalpha():
        return Result.failure("單字必須只能包含英文字母喔")

    if guess not in GameConfig.WORD_BANK:
        return Result.failure(GameConfig.MSG_INVALID_WORD)

    # 3. 準備記錄每個字母的結果，預設大家都是灰色 (gray)
    result_details = [{"letter": char, "status": "gray"} for char in guess]
    
    # 把目標單字拆成一個個字母，方便我們做記號
    target_letters_left = list(target)

    # 第一圈檢查：先找「完全命中」的綠色 (green)
    for i in range(GameConfig.WORD_LENGTH):
        if guess[i] == target[i]:
            result_details[i]["status"] = "green"
            # pyrefly: ignore [unsupported-operation]
            target_letters_left[i] = None  # 對過的字母就打個叉叉，標記為已使用

    # 第二圈檢查：再找「位置錯但有這個字母」的黃色 (yellow)
    for i in range(GameConfig.WORD_LENGTH):
        # 如果它不是綠色，而且這個字母還有剩在目標單字裡
        if result_details[i]["status"] != "green" and guess[i] in target_letters_left:
            result_details[i]["status"] = "yellow"
            # 把用掉的黃色字母打叉叉，避免重複算
            # pyrefly: ignore [unsupported-operation]
            target_letters_left[target_letters_left.index(guess[i])] = None

    # 4. 檢查是不是 5 個字母全綠了（完全猜中）
    is_correct = (guess == target)
    
    # 5. 決定要給玩家什麼鼓勵的話
    message = GameConfig.MSG_CORRECT if is_correct else GameConfig.MSG_WRONG

    # 6. 把結果填寫在標準表單 Result 裡面回傳
    return Result.success(data={
        "is_correct": is_correct,
        "details": result_details,
        "message": message
    })
