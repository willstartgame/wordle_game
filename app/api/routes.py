from flask import Blueprint, jsonify, render_template, request, session
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.orm import Player, GameRecord, db

# 建立一個名為 'main' 的接待櫃台 (Blueprint)
main_bp = Blueprint('main', __name__)

# 當玩家來到遊戲大門口（網址是 / 時）
@main_bp.route('/')
def index():
    # ！！！更新這裡！！！
    # 請 Flask 幫我們把剛剛蓋好的 index.html 網頁拿出來交給玩家
    return render_template("index.html")

# 當玩家想看排行榜（網址是 /api/leaderboard 時）
@main_bp.route('/api/leaderboard')
def leaderboard():
    board_type = request.args.get('type', 'total_score')
    
    if board_type == 'frenzy_wins':
        players = Player.query.order_by(Player.frenzy_wins.desc()).limit(10).all()
        data = [{"username": p.username, "score": p.frenzy_wins} for p in players]
    elif board_type == 'battle_wins':
        players = Player.query.order_by(Player.battle_wins.desc()).limit(10).all()
        data = [{"username": p.username, "score": p.battle_wins} for p in players]
    else:
        players = Player.query.order_by(Player.total_score.desc()).limit(10).all()
        data = [{"username": p.username, "score": p.total_score} for p in players]
        
    return jsonify(data), 200

@main_bp.route('/api/account_info', methods=['GET'])
def get_account_info():
    username = request.args.get('username')
    if not username:
        return jsonify({"status": "error", "message": "Missing username"}), 400
        
    player = Player.query.filter_by(username=username).first()
    if not player:
        return jsonify({"status": "error", "message": "Player not found"}), 404
        
    frenzy_records = GameRecord.query.filter_by(player_id=player.id, mode="frenzy")\
                               .order_by(GameRecord.created_at.desc()).limit(10).all()
                               
    recent_games = [{
        "score": r.score,
        "is_win": r.is_win,
        "date": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else ""
    } for r in frenzy_records]
    
    battle_records = GameRecord.query.filter_by(player_id=player.id, mode="battle")\
                               .order_by(GameRecord.created_at.desc()).limit(10).all()
                               
    recent_battle_games = [{
        "score": r.score,
        "is_win": r.is_win,
        "date": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else ""
    } for r in battle_records]
    
    return jsonify({
        "status": "success",
        "total_score": player.total_score,
        "frenzy_wins": player.frenzy_wins,
        "battle_wins": player.battle_wins,
        "recent_games": recent_games,
        "recent_battle_games": recent_battle_games
    }), 200

@main_bp.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"status": "error", "message": "請輸入帳號與密碼"}), 400

    existing_player = Player.query.filter_by(username=username).first()
    if existing_player:
        return jsonify({"status": "error", "message": "此帳號已經被註冊過了"}), 400

    hashed_password = generate_password_hash(password, method="pbkdf2:sha256")
    new_player = Player()
    new_player.username = username
    new_player.password_hash = hashed_password
    db.session.add(new_player)
    db.session.commit()

    return jsonify({"status": "success", "message": "註冊成功！請登入"}), 201

@main_bp.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"status": "error", "message": "請輸入帳號與密碼"}), 400

    player = Player.query.filter_by(username=username).first()
    if not player or not check_password_hash(player.password_hash, password):
        return jsonify({"status": "error", "message": "帳號或密碼錯誤"}), 401

    # 登入成功，儲存安全 Session
    session["username"] = player.username
    return jsonify({"status": "success", "message": "登入成功", "username": player.username}), 200

@main_bp.route('/api/logout', methods=['POST'])
def logout():
    session.pop("username", None)
    return jsonify({"status": "success", "message": "登出成功"}), 200