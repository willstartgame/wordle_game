from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# 建立一個資料庫專屬小幫手
db = SQLAlchemy()

# 玩家資料表（想像成 Excel 的第一張工作表）
class Player(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False) # 存放加密後的密碼
    total_score = db.Column(db.Integer, default=0)
    games_played = db.Column(db.Integer, default=0) # 為了算勝率用的：總場數
    games_won = db.Column(db.Integer, default=0)    # 為了算勝率用的：獲勝場數
    frenzy_wins = db.Column(db.Integer, default=0)  # 新增：限時狂熱賽勝場數
    battle_wins = db.Column(db.Integer, default=0)  # 新增：同題搶答大亂鬥勝場數

# 遊戲紀錄表（想像成 Excel 的第二張工作表）
class GameRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey('player.id')) # 綁定玩家 ID
    score = db.Column(db.Integer)
    wrong_count = db.Column(db.Integer) # 記錄猜錯的次數
    play_time = db.Column(db.Float)
    mode = db.Column(db.String(20), default="frenzy") # 新增：遊戲模式
    is_win = db.Column(db.Boolean, default=False)     # 新增：是否獲勝
    # pyrefly: ignore [deprecated]
    created_at = db.Column(db.DateTime, default=datetime.utcnow) # 記錄什麼時候玩的
