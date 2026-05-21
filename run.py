from app import create_app, socketio

# 去總部把我們的遊戲建築拿出來，存進 app 變數
app = create_app()

# ！！微小但關鍵的設定：告訴系統把無線電通訊塔的線路接上！！
# 我們改用 from ... import ... 的語法，這樣 Python 就不會把 app 變數覆蓋掉了
from app.sockets import events

# 如果我們是直接執行這個檔案，就啟動伺服器
if __name__ == '__main__':
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)