from flask import Flask
# pyrefly: ignore [untyped-import]
from flask_socketio import SocketIO
from app.core.config import AppConfig
from app.models.orm import db

# 準備廣播通訊器
socketio = SocketIO()

def create_app():
    # 1. 建立 Flask 主建築
    app = Flask(__name__)
    
    # 2. 把安管中心的設定套用進來
    app.config['SECRET_KEY'] = AppConfig.SECRET_KEY
    app.config['SQLALCHEMY_DATABASE_URI'] = AppConfig.SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # 3. 請資料庫管家開始工作
    db.init_app(app)
    
    # 4. 把廣播通訊器裝進這棟建築
    socketio.init_app(app, cors_allowed_origins="*")  # type: ignore

    # ==========================================
    # ！！新增加的指標：把大廳接待櫃台註冊到總部！！
    from app.api.routes import main_bp
    app.register_blueprint(main_bp)
    # ==========================================

    # 5. 確保資料庫管家有把我們剛剛設計的空白表格建立出來
    with app.app_context():
        db.create_all()

    return app
