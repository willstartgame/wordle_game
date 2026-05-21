import os
from dotenv import load_dotenv

# 告訴系統去讀取剛剛建立的 .env 保險箱
load_dotenv()

class AppConfig:
    # 預防機制：若找不到環境變數，將引發錯誤而非使用不安全的預設值
    SECRET_KEY = os.environ["FLASK_SECRET_KEY"]
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///default.db")