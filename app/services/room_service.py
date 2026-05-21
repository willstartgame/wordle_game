import random
import time # 引入計時專家
import uuid
from app.core.exceptions import Result
from app.core.constants import GameConfig

from typing import Optional

# 這是管理員手上的「包廂名冊」，用來記住現在有哪些房間正在進行
active_rooms = {}

def get_new_target(exclude_word: Optional[str] = None) -> str:
    """隨機選題去重，確保不連續抽到同一個字"""
    pool = [w for w in GameConfig.WORD_BANK if w != exclude_word]
    return random.choice(pool) if pool else random.choice(GameConfig.WORD_BANK)

def join_room(room_id: str, username: str) -> Result:
    """純函式：幫玩家安排房間與座位，不直接操作 SocketIO"""
    # 檢查是否已經在遊戲中
    if room_id in active_rooms and active_rooms[room_id].get("is_playing", False):
        return Result.failure("該房間的遊戲已經開始囉，請等待下一輪或加入其他房間！")

    # 如果這是一個新房間，只有在單人模式下才自動創建
    if room_id not in active_rooms:
        if room_id.startswith("single_"):
            active_rooms[room_id] = {
                "players": {},       # 記錄玩家與他們的分數
                "is_playing": False, # 記錄遊戲是否開始了
                "host": username,    # 第一個加入的當房主
                "mode": "classic",
                "session_id": "",     # 用於防範併發計時器衝突的唯一 ID
                "max_players": 1,
                "is_private": True
            }
        else:
            return Result.failure("房間不存在！請確認房號是否正確。")
    
    room = active_rooms[room_id]
    
    # 檢查人數上限限制
    if username not in room["players"] and len(room["players"]) >= room.get("max_players", 10):
        return Result.failure(f"該房間已滿（上限 {room.get('max_players', 10)} 人）！")
    
    # 幫這位玩家在計分表上留個位子，初始分數為 0
    if username not in room["players"]:
        room["players"][username] = {
            "score": 0,
            "current_target": get_new_target(), # 直接先發給他一題
            "guesses": [] # 記錄當前單字已猜過的清單
        }
        
    return Result.success(data=room)

def create_room(room_id: str, username: str, max_players: int = 10, is_private: bool = False) -> Result:
    """創建多人連線房間"""
    if not room_id or not room_id.strip():
        return Result.failure("房間號碼不能為空！")
    room_id = room_id.strip()

    if room_id.startswith("single_"):
        return Result.failure("不能使用此房號格式！")

    if room_id in active_rooms:
        return Result.failure("該房間已存在，請換一個房號！")

    # 限制人數在 2 至 10 人之間
    try:
        max_players = int(max_players)
    except (ValueError, TypeError):
        max_players = 10
        
    if max_players < 2 or max_players > 10:
        return Result.failure("人數上限必須在 2 到 10 人之間！")

    # 初始化房間資料
    active_rooms[room_id] = {
        "players": {},       # 記錄玩家與他們的分數
        "is_playing": False, # 記錄遊戲是否開始了
        "host": username,    # 創房者為房主
        "mode": "classic",
        "session_id": "",     # 用於防範併發計時器衝突的唯一 ID
        "max_players": max_players,
        "is_private": is_private
    }

    # 同步把創房者放進去
    active_rooms[room_id]["players"][username] = {
        "score": 0,
        "current_target": get_new_target(),
        "guesses": []
    }

    return Result.success(data=active_rooms[room_id])

def player_scored(room_id: str, username: str) -> Result:
    """當玩家答對時，負責加分與換題"""
    # 確保房間和玩家都存在
    if room_id in active_rooms and username in active_rooms[room_id]["players"]:
        prev_word = active_rooms[room_id]["players"][username]["current_target"]
        # 分數加 1 分
        active_rooms[room_id]["players"][username]["score"] += 1
        # 隨機再抽一題新單字（去重），並重置已猜單字清單
        active_rooms[room_id]["players"][username]["current_target"] = get_new_target(prev_word)
        active_rooms[room_id]["players"][username]["guesses"] = []
        
        return Result.success(data=active_rooms[room_id]["players"])
    
    return Result.failure("找不到該房間或玩家")

def get_player_target(room_id: str, username: str) -> str:
    """偷偷看一下這位玩家現在要猜的題目是什麼"""
    if room_id in active_rooms:
        if active_rooms[room_id].get("mode") == "battle":
            return active_rooms[room_id].get("battle_target", "")
        if username in active_rooms[room_id]["players"]:
            return active_rooms[room_id]["players"][username]["current_target"]
    return ""

def get_player_guesses(room_id: str, username: str) -> list:
    """獲取玩家當前題目已猜測的單字清單"""
    if room_id in active_rooms and username in active_rooms[room_id]["players"]:
        return active_rooms[room_id]["players"][username].get("guesses", [])
    return []

def add_player_guess(room_id: str, username: str, guess: str):
    """將玩家的猜測記錄至後端狀態"""
    if room_id in active_rooms and username in active_rooms[room_id]["players"]:
        if "guesses" not in active_rooms[room_id]["players"][username]:
            active_rooms[room_id]["players"][username]["guesses"] = []
        active_rooms[room_id]["players"][username]["guesses"].append(guess.upper())

def leave_room(room_id: str, username: str) -> Result:
    """玩家退出房間，清空記憶體資料，並處理房主轉移"""
    if room_id in active_rooms and username in active_rooms[room_id]["players"]:
        del active_rooms[room_id]["players"][username]
        # 如果房間空了，就把整個房間刪掉
        if not active_rooms[room_id]["players"]:
            del active_rooms[room_id]
        else:
            # 如果退出的是房主，自動轉移給下一位
            if active_rooms[room_id].get("host") == username:
                next_host = list(active_rooms[room_id]["players"].keys())[0]
                active_rooms[room_id]["host"] = next_host
        return Result.success(data=active_rooms.get(room_id))
    return Result.failure("找不到該房間或玩家")

def start_multiplayer_game(room_id: str, username: str, mode: str) -> Result:
    """房主專用：開始多人遊戲"""
    if room_id in active_rooms:
        room = active_rooms[room_id]
        if room.get("host") == username:
            room["is_playing"] = True
            room["mode"] = mode
            # 每次開始新局都生成唯一 session_id，防範過期計時器喚醒
            room["session_id"] = str(uuid.uuid4())
            
            # 關鍵修復：開始新遊戲時，徹底重置所有玩家的分數、當前題目與猜測紀錄，防止分數繼承！
            for p_name in room["players"]:
                room["players"][p_name]["score"] = 0
                room["players"][p_name]["current_target"] = get_new_target()
                room["players"][p_name]["guesses"] = []
                
            return Result.success(data=room)
        return Result.failure("你不是房主，無法開始遊戲")
    return Result.failure("找不到該房間")

def end_multiplayer_game(room_id: str) -> Result:
    """強制結束遊戲，把大家重置回準備大廳狀態"""
    if room_id in active_rooms:
        active_rooms[room_id]["is_playing"] = False
        
        # 備份結算成績
        import copy
        final_scores = copy.deepcopy(active_rooms[room_id]["players"])
        
        # 將所有玩家分數歸零，並更換新題目、清空猜測記錄
        for user in active_rooms[room_id]["players"]:
            active_rooms[room_id]["players"][user]["score"] = 0
            active_rooms[room_id]["players"][user]["current_target"] = get_new_target()
            active_rooms[room_id]["players"][user]["guesses"] = []
            
        return Result.success(data={
            "room": active_rooms[room_id],
            "final_scores": final_scores
        })
    return Result.failure("找不到該房間")

def skip_player_word(room_id: str, username: str) -> Result:
    """玩家放棄或超過次數，幫他換一個新單字（不加分）"""
    if room_id in active_rooms and username in active_rooms[room_id]["players"]:
        prev_word = active_rooms[room_id]["players"][username]["current_target"]
        active_rooms[room_id]["players"][username]["current_target"] = get_new_target(prev_word)
        active_rooms[room_id]["players"][username]["guesses"] = []
        return Result.success(data=active_rooms[room_id]["players"])
    return Result.failure("找不到該房間或玩家")