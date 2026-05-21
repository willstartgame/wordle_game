# pyrefly: ignore [untyped-import]
from flask_socketio import emit, join_room, leave_room as socket_leave_room
from flask import session, request
from app import socketio, db
from app.models.orm import Player, GameRecord
from app.services.game_service import check_wordle_guess
from app.core.constants import GameConfig
from app.services.room_service import (
    join_room as manager_join_room,
    create_room as manager_create_room,
    player_scored,
    get_player_target,
    leave_room as manager_leave_room,
    skip_player_word,
    start_multiplayer_game as manager_start_game,
    end_multiplayer_game as manager_end_game,
    get_player_guesses,
    add_player_guess
)
from app.services.battle_service import (
    start_battle_game,
    handle_battle_guess,
    next_battle_round
)

def get_battle_scoreboard_data(room_id: str) -> dict:
    """計算並回傳大亂鬥計分板資料，包含每位玩家的已猜測次數"""
    from app.services.room_service import active_rooms
    if room_id not in active_rooms:
        return {}
    room = active_rooms[room_id]
    guesses = room.get("guesses", [])
    
    scoreboard = {}
    for p_name, p_info in room["players"].items():
        p_guess_count = sum(1 for g in guesses if g["username"] == p_name)
        scoreboard[p_name] = {
            "score": p_info["score"],
            "guess_count": p_guess_count
        }
    return scoreboard
def get_active_rooms_list() -> list:
    """獲取目前所有活躍的多人房間列表（排除單人房間與私人房間）"""
    from app.services.room_service import active_rooms
    rooms = []
    for r_id, r_info in active_rooms.items():
        if r_id.startswith("single_"):
            continue
        if r_info.get("is_private", False):
            continue
        rooms.append({
            "room_id": r_id,
            "player_count": len(r_info.get("players", {})),
            "max_players": r_info.get("max_players", 10),
            "players": list(r_info.get("players", {}).keys()),
            "is_playing": r_info.get("is_playing", False),
            "host": r_info.get("host", ""),
            "mode": r_info.get("mode", "classic")
        })
    return rooms

def broadcast_rooms_list():
    """廣播最新的活躍房間清單給全體在線玩家"""
    socketio.emit("update_rooms_list", get_active_rooms_list())

@socketio.on("get_rooms_list")
def handle_get_rooms_list():
    emit("update_rooms_list", get_active_rooms_list())

# 用來追蹤所有在線 Socket 連線與對應的 (room_id, username)，方便處理異常斷線清理
online_connections = {}

# 當玩家連接 Socket 時
@socketio.on("connect")
def handle_connect():
    # 僅做記錄，當加入房間後才會寫入 online_connections
    pass

# 當玩家中斷 Socket 連線時
@socketio.on("disconnect")
def handle_disconnect():
    connection = online_connections.pop(getattr(request, "sid", None), None)
    if connection:
        room_id = connection["room_id"]
        username = connection["username"]
        
        # 呼叫退房邏輯，清理記憶體狀態與處理房主自動轉移
        result = manager_leave_room(room_id, username)
        socket_leave_room(room_id)
        
        # 廣播給該房間的其餘玩家
        if result.is_success and result.data:
            emit("update_waiting_room", {
                "players": list(result.data["players"].keys()),
                "host": result.data["host"]
            }, to=room_id)
            if result.data.get("mode") == "battle":
                emit("update_scoreboard", get_battle_scoreboard_data(room_id), to=room_id)
            else:
                emit("update_scoreboard", result.data["players"], to=room_id)
        broadcast_rooms_list()

# 當收到玩家用對講機喊 "join_single_player" (加入單人遊戲) 時
@socketio.on("join_single_player")
def handle_join_single(data):
    username = session.get("username") or data.get("username")
    if not username:
        return # 尚未登入
        
    room_id = f"single_{username}" # 建立專屬單人房

    player = Player.query.filter_by(username=username).first()
    if not player:
        return # 無效玩家
    
    # 加入專屬單人房
    join_room(room_id)
    manager_join_room(room_id, username)
    
    # 追蹤連線
    online_connections[getattr(request, "sid", None)] = {
        "room_id": room_id,
        "username": username
    }
    
    # 把目前的總分傳給該玩家
    emit("update_total_score", {"total_score": player.total_score}, to=room_id)

# 當收到玩家用對講機喊 "join_game" (加入遊戲) 時
@socketio.on("join_game")
def handle_join(data):
    room_id = data["room_id"]
    username = session.get("username") or data.get("username")
    if not username:
        emit("join_error", {"message": "請先登入帳號喔！"})
        return

    player = Player.query.filter_by(username=username).first()
    if not player:
        return
    
    # 1. 請「包廂管理員」把玩家的名字寫進計分板
    result = manager_join_room(room_id, username)
    
    if result.is_success:
        # 2. 讓玩家的連線加入這個包廂的專屬廣播頻道
        join_room(room_id)
        
        # 追蹤連線
        online_connections[getattr(request, "sid", None)] = {
            "room_id": room_id,
            "username": username
        }
        
        # 廣播更新大廳名單給所有人
        emit("update_waiting_room", {
            # pyrefly: ignore [unsupported-operation]
            "players": list(result.data["players"].keys()),
            # pyrefly: ignore [unsupported-operation]
            "host": result.data["host"]
        }, to=room_id)
        # 同時也更新計分板
        # pyrefly: ignore [unsupported-operation]
        if result.data.get("mode") == "battle":
            emit("update_scoreboard", get_battle_scoreboard_data(room_id), to=room_id)
        else:
            emit("update_scoreboard", result.data["players"], to=room_id)
        broadcast_rooms_list()
    else:
        # 玩家加入失敗
        emit("join_error", {"message": result.error_message})

@socketio.on("create_room")
def handle_create_room(data):
    room_id = data.get("room_id")
    max_players = data.get("max_players", 10)
    is_private = data.get("is_private", False)
    username = session.get("username") or data.get("username")
    if not username:
        emit("join_error", {"message": "請先登入帳號喔！"})
        return

    player = Player.query.filter_by(username=username).first()
    if not player:
        return
    
    result = manager_create_room(room_id, username, max_players, is_private)
    
    if result.is_success:
        # 讓連線加入房間
        join_room(room_id)
        
        # 追蹤連線
        online_connections[getattr(request, "sid", None)] = {
            "room_id": room_id,
            "username": username
        }
        
        # 回應建立成功，帶入房間資訊
        emit("create_success", {
            "room_id": room_id,
            "players": list(result.data["players"].keys()),
            "host": result.data["host"]
        })
        
        # 廣播更新大廳名單給包廂內所有人
        emit("update_waiting_room", {
            "players": list(result.data["players"].keys()),
            "host": result.data["host"]
        }, to=room_id)
        
        # 同時也更新計分板
        emit("update_scoreboard", result.data["players"], to=room_id)
        
        # 更新大廳的公開房間列表
        broadcast_rooms_list()
    else:
        # 建立失敗
        emit("join_error", {"message": result.error_message})

def battle_round_timer_task(room_id, round_number, session_id, app):
    """大亂鬥每回合倒數 5 分鐘 (300 秒)"""
    socketio.sleep(300)
    with app.app_context():
        from app.services.room_service import active_rooms
        if room_id in active_rooms:
            room = active_rooms[room_id]
            # 確保仍處於大亂鬥遊戲中、相同回合與唯一 session_id
            if (room.get("is_playing") and 
                room.get("mode") == "battle" and 
                room.get("current_round") == round_number and 
                room.get("session_id") == session_id):
                
                # 時間截止，廣播本回合平局結束
                target_word = room.get("battle_target", "")
                socketio.emit("battle_round_over", {
                    "winner": None,
                    "target": target_word,
                    "next_round_delay": 5
                }, to=room_id)
                
                socketio.start_background_task(battle_round_delay_task, room_id, app)

def battle_round_delay_task(room_id, app):
    socketio.sleep(5)
    with app.app_context():
        result = next_battle_round(room_id)
        if result.is_success:
            # pyrefly: ignore [unsupported-operation]
            if result.data.get("game_over"):
                socketio.emit("battle_game_over", {
                    # pyrefly: ignore [unsupported-operation]
                    "winners": result.data["winners"],
                    # pyrefly: ignore [unsupported-operation]
                    "final_scores": result.data["final_scores"]
                }, to=room_id)
                broadcast_rooms_list()
            else:
                import time
                # 計算下一個回合的絕對結束時間戳記 (當前時間 + 300秒)
                end_time = int((time.time() + 300) * 1000)
                
                socketio.emit("battle_next_round", {
                    # pyrefly: ignore [unsupported-operation]
                    "current_round": result.data["current_round"],
                    "end_time": end_time
                }, to=room_id)
                
                # 再次廣播已重置的大亂鬥計分板
                socketio.emit("update_scoreboard", get_battle_scoreboard_data(room_id), to=room_id)
                
                # 啟動下一回合的 5 分鐘計時器
                # pyrefly: ignore [unsupported-operation]
                session_id = result.data["room"]["session_id"]
                # pyrefly: ignore [unsupported-operation]
                round_num = result.data["current_round"]
                socketio.start_background_task(battle_round_timer_task, room_id, round_num, session_id, app)

# 當收到玩家用對講機喊 "submit_guess" (送出猜的單字) 時
@socketio.on("submit_guess")
def handle_guess(data):
    room_id = data["room_id"]
    username = session.get("username") or data.get("username")
    guess_word = data["guess"]

    if not username:
        emit("guess_error", {"message": "請先登入帳號！"})
        return

    from app.services.room_service import active_rooms
    if room_id in active_rooms and active_rooms[room_id].get("mode") == "battle":
        result = handle_battle_guess(room_id, username, guess_word)
        if not result.is_success:
            emit("guess_error", {"message": result.error_message})
            return
            
        # pyrefly: ignore [unsupported-operation]
        guesses = result.data["guesses"]
        # pyrefly: ignore [unsupported-operation]
        new_guess = result.data["new_guess"]
        # pyrefly: ignore [unsupported-operation]
        round_over = result.data["round_over"]
        # pyrefly: ignore [unsupported-operation]
        winner = result.data["winner"]
        # pyrefly: ignore [unsupported-operation]
        target = result.data["target"]
        
        emit("battle_update_grid", {
            "guesses": guesses,
            "new_guess": new_guess
        }, to=room_id)
        
        # 每次成功送出猜測，即時向所有人廣播更新大亂鬥計分板及剩餘次數
        emit("update_scoreboard", get_battle_scoreboard_data(room_id), to=room_id)
        
        if round_over:
            emit("battle_round_over", {
                "winner": winner,
                "target": target,
                "next_round_delay": 5
            }, to=room_id)
            
            from flask import current_app
            app = getattr(current_app, "_get_current_object")()
            socketio.start_background_task(battle_round_delay_task, room_id, app)
        return

    # 1. 伺服器端猜測限制與重設校驗
    guesses = get_player_guesses(room_id, username)
    if len(guesses) >= GameConfig.MAX_GUESSES:
        emit("guess_error", {"message": "您已經猜過 6 次囉，請等待系統更換題目！"})
        return
        
    if guess_word.upper() in guesses:
        emit("guess_error", {"message": GameConfig.MSG_ALREADY_GUESSED})
        return

    # 2. 問包廂管理員，這位玩家現在要猜的題目是什麼？
    target_word = get_player_target(room_id, username)
    
    # 3. 把玩家猜的字交給「裁判大腦」改考卷 (判斷綠、黃、灰與英文單字有效性)
    judge_result = check_wordle_guess(target_word, guess_word)
    
    # 情況 A：如果字數不對或不是合法單字，偷偷用對講機告訴玩家就好，不用廣播
    if not judge_result.is_success:
        emit("guess_error", {"message": judge_result.error_message})
        return

    # 記錄此次有效的猜測
    add_player_guess(room_id, username, guess_word)
    guesses = get_player_guesses(room_id, username)

    # 情況 B：如果完全猜中 (拿到全綠燈)
    # pyrefly: ignore [unsupported-operation]
    if judge_result.data["is_correct"]:
        player = Player.query.filter_by(username=username).first()
        if player:
            player.total_score += 1
            player.games_won += 1
            player.games_played += 1
            db.session.commit()
            
            emit("update_total_score", {"total_score": player.total_score}, to=room_id)
            
        score_result = player_scored(room_id, username)
        if score_result.is_success:
            emit("update_scoreboard", score_result.data, to=room_id)
            
        # 若當前為狂熱賽 (frenzy) 模式，則廣播即時得分提示（不含單字資訊）給房內所有人
        if room_id in active_rooms and active_rooms[room_id].get("mode") == "frenzy":
            emit("frenzy_player_scored", {"username": username}, to=room_id)
            
    # 情況 C：猜錯達 6 次，伺服器主動幫他換新字（不加分），並通知他
    elif len(guesses) >= GameConfig.MAX_GUESSES:
        skip_player_word(room_id, username)
        if isinstance(judge_result.data, dict):
            judge_result.data["guesses_exhausted"] = True
        emit("guess_result", judge_result.data)
        return
    
    # 4. 把批改好的考卷（綠黃灰結果）還給這位猜字的玩家
    emit("guess_result", judge_result.data)

@socketio.on("leave_room")
def handle_leave_room(data):
    room_id = data.get("room_id")
    username = session.get("username") or data.get("username")
    if room_id and username:
        online_connections.pop(getattr(request, "sid", None), None)
        result = manager_leave_room(room_id, username)
        socket_leave_room(room_id)
        
        if result.is_success and result.data:
            emit("update_waiting_room", {
                "players": list(result.data["players"].keys()),
                "host": result.data["host"]
            }, to=room_id)
            if result.data.get("mode") == "battle":
                emit("update_scoreboard", get_battle_scoreboard_data(room_id), to=room_id)
            else:
                emit("update_scoreboard", result.data["players"], to=room_id)
        broadcast_rooms_list()

@socketio.on("skip_word")
def handle_skip_word(data):
    room_id = data.get("room_id")
    username = session.get("username") or data.get("username")
    if room_id and username:
        skip_player_word(room_id, username)

def frenzy_timer_task(room_id, session_id, app):
    """限時狂熱賽倒數 3 分鐘"""
    socketio.sleep(180)
    with app.app_context():
        from app.services.room_service import active_rooms
        # 驗證此房間是否仍然存在，且 session_id 吻合，防範併發舊計時器衝突
        if room_id in active_rooms and active_rooms[room_id].get("session_id") == session_id:
            result = manager_end_game(room_id)
            if result.is_success:
                # pyrefly: ignore [unsupported-operation]
                final_scores = result.data["final_scores"]
                
                # 找出最高分
                max_score = -1
                winners = []
                for user, info in final_scores.items():
                    if info["score"] > max_score:
                        max_score = info["score"]
                        winners = [user]
                    elif info["score"] == max_score and max_score != -1:
                        winners.append(user)
                        
                # 更新玩家勝場與儲存 GameRecord
                for user, info in final_scores.items():
                    player = Player.query.filter_by(username=user).first()
                    if player:
                        is_win = (user in winners) and (max_score > 0)
                        if is_win:
                            player.frenzy_wins += 1
                        
                        record = GameRecord(
                            player_id=player.id,
                            score=info["score"],
                            mode="frenzy",
                            is_win=is_win
                        )  # type: ignore
                        db.session.add(record)
                db.session.commit()
                
                # pyrefly: ignore [unsupported-operation]
                socketio.emit("frenzy_game_over", {"players": final_scores}, to=room_id)
                socketio.emit("update_waiting_room", {
                    # pyrefly: ignore [unsupported-operation]
                    "players": list(result.data["room"]["players"].keys()),
                    # pyrefly: ignore [unsupported-operation]
                    "host": result.data["room"]["host"]
                }, to=room_id)
                broadcast_rooms_list()

@socketio.on("start_multiplayer_game")
def handle_start_game(data):
    room_id = data.get("room_id")
    username = session.get("username") or data.get("username")
    mode = data.get("mode", "frenzy")
    
    if room_id and username:
        if mode == "battle":
            result = start_battle_game(room_id, username)
            if result.is_success:
                import time
                end_time = int((time.time() + 300) * 1000)
                emit("update_scoreboard", get_battle_scoreboard_data(room_id), to=room_id)
                emit("game_started", {
                    "mode": "battle",
                    "current_round": 1,
                    "end_time": end_time
                }, to=room_id)
                
                # pyrefly: ignore [unsupported-operation]
                session_id = result.data["session_id"]
                from flask import current_app
                app = getattr(current_app, "_get_current_object")()
                socketio.start_background_task(battle_round_timer_task, room_id, 1, session_id, app)
                
                broadcast_rooms_list()
        else:
            result = manager_start_game(room_id, username, mode)
            if result.is_success:
                import time
                # 計算絕對結束時間戳記 (Unix Timestamp 毫秒級)，同步發給所有前端
                end_time = int((time.time() + 180) * 1000)
                
                # pyrefly: ignore [unsupported-operation]
                session_id = result.data["session_id"]
                
                # 廣播更新重置後的計分板給所有人，防止顯示舊分數！
                # pyrefly: ignore [unsupported-operation]
                emit("update_scoreboard", result.data["players"], to=room_id)
                
                emit("game_started", {
                    "mode": mode,
                    "end_time": end_time
                }, to=room_id)
                
                if mode == "frenzy":
                    from flask import current_app
                    app = getattr(current_app, "_get_current_object")()
                    socketio.start_background_task(frenzy_timer_task, room_id, session_id, app)
                broadcast_rooms_list()

@socketio.on("get_admin_target")
def handle_get_admin_target(data):
    room_id = data.get("room_id")
    username = session.get("username") or data.get("username")
    if username == "will" and room_id:
        target = get_player_target(room_id, username)
        if target:
            emit("admin_target_word", {"target": target})

