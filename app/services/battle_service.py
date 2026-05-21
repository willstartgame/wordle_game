import uuid
import time
from typing import Optional
from app import db
from app.models.orm import Player, GameRecord
from app.core.exceptions import Result
from app.services.room_service import active_rooms, get_new_target
from app.services.game_service import check_wordle_guess

def start_battle_game(room_id: str, username: str) -> Result:
    """房主專用：開始同題搶答大亂鬥"""
    if room_id not in active_rooms:
        return Result.failure("找不到該房間")
    
    room = active_rooms[room_id]
    if room.get("host") != username:
        return Result.failure("你不是房主，無法開始遊戲")
        
    room["is_playing"] = True
    room["mode"] = "battle"
    room["session_id"] = str(uuid.uuid4())
    room["current_round"] = 1
    room["battle_target"] = get_new_target()
    room["guesses"] = []
    
    # 初始化玩家大亂鬥分數為 0
    for player_name in room["players"]:
        room["players"][player_name]["score"] = 0
        
    return Result.success(data=room)

def handle_battle_guess(room_id: str, username: str, guess_word: str) -> Result:
    """大亂鬥模式猜測改卷與共享網格處理"""
    if room_id not in active_rooms:
        return Result.failure("找不到該房間")
        
    room = active_rooms[room_id]
    if not room.get("is_playing"):
        return Result.failure("遊戲尚未開始或已結束")
        
    if username not in room["players"]:
        return Result.failure("您不在這間房間內")
        
    guesses = room.get("guesses", [])
        
    guess_upper = guess_word.upper()
    # 檢查是否在此回合已經被任何人猜過
    for g in guesses:
        if g["word"] == guess_upper:
            return Result.failure("此單字本回合已被猜過囉，換個字試試！")
            
    # 調用改卷裁判
    target_word = room.get("battle_target", "")
    judge_result = check_wordle_guess(target_word, guess_upper)
    if not judge_result.is_success:
        return Result.failure(judge_result.error_message)
        
    # pyrefly: ignore [unsupported-operation]
    is_correct = judge_result.data["is_correct"]
    # pyrefly: ignore [unsupported-operation]
    details = judge_result.data["details"]
    
    # 記錄有效猜測
    guess_entry = {
        "username": username,
        "word": guess_upper,
        "details": details,
        "is_correct": is_correct
    }
    guesses.append(guess_entry)
    room["guesses"] = guesses
    
    # 回傳給事件層處理廣播
    result_data = {
        "guesses": guesses,
        "new_guess": guess_entry,
        "round_over": False,
        "winner": None,
        "target": target_word
    }
    
    if is_correct:
        # 答對得分！
        room["players"][username]["score"] += 1
        result_data["round_over"] = True
        result_data["winner"] = username
        
    return Result.success(data=result_data)

def next_battle_round(room_id: str) -> Result:
    """自動開啟下一回合或進行最終結算"""
    if room_id not in active_rooms:
        return Result.failure("找不到該房間")
        
    room = active_rooms[room_id]
    current_round = room.get("current_round", 1)
    
    if current_round >= 3:
        # 3 回合全部結束，進入終局結算
        room["is_playing"] = False
        
        # 找出得點最高者（冠軍）
        players_info = room["players"]
        max_score = -1
        winners = []
        for user, info in players_info.items():
            if info["score"] > max_score:
                max_score = info["score"]
                winners = [user]
            elif info["score"] == max_score and max_score != -1:
                winners.append(user)
                
        # 儲存紀錄與累加勝場
        import copy
        final_scores = copy.deepcopy(players_info)
        
        for user, info in players_info.items():
            player = Player.query.filter_by(username=user).first()
            if player:
                is_win = (user in winners) and (max_score > 0)
                if is_win:
                    player.battle_wins += 1
                    
                record = GameRecord(
                    player_id=player.id,
                    score=info["score"],
                    mode="battle",
                    is_win=is_win
                )
                db.session.add(record)
                
        db.session.commit()
        
        # 結算後，將所有人分數歸零，以便重新準備
        for user in players_info:
            players_info[user]["score"] = 0
            players_info[user]["guesses"] = []
            
        return Result.success(data={
            "game_over": True,
            "winners": winners,
            "final_scores": final_scores
        })
    else:
        # 開啟下一回合
        room["current_round"] = current_round + 1
        room["guesses"] = []
        room["battle_target"] = get_new_target()
        
        return Result.success(data={
            "game_over": False,
            "current_round": room["current_round"],
            "room": room
        })

