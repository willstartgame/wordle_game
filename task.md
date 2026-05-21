# 同題搶答大亂鬥實作任務清單

- `[x]` 1. 資料庫模型與自動移轉 (Database Migration)
  - `[x]` 1.1 修改 `orm.py`，在 `Player` 中新增 `battle_wins` 欄位
  - `[x]` 1.2 建立並執行 `migrate_battle.py` 自動欄位補登腳本
- `[x]` 2. 大亂鬥核心服務邏輯 (Battle Service Layer)
  - `[x]` 2.1 建立 `battle_service.py` 模組，處理狀態結構與核心機制
- `[x]` 3. Socket.IO 事件分流與派發 (Socket Events)
  - `[x]` 3.1 修改 `events.py` 整合 `battle_service` 大亂鬥事件
- `[x]` 4. API 路由與查詢擴充 (REST APIs)
  - `[x]` 4.1 修改 `routes.py` 支援 `battle_wins` 排行榜與大亂鬥歷史戰績
- `[x]` 5. 前端 HTML 介面更新 (HTML Templates)
  - `[x]` 5.1 修改 `index.html` 新增「個人草稿區」與「排行榜/紀錄切換」
- `[x]` 6. 前端 JavaScript 交互與渲染 (JavaScript Logic)
  - `[x]` 6.1 修改 `game.js` 實作鍵盤輸入重定向、共享網格廣播渲染、多回合切換與計分板更新
  - `[x]` 6.2 修正大亂鬥共享網格渲染中的 `charData.char` 未定義 Bug (改為 `charData.letter`)
- `[x]` 7. 系統功能與連線驗證 (Verification)
  - `[x]` 7.1 驗證多人連線同場搶答與「搶尾刀」得勝邏輯
  - `[x]` 7.2 修正 Flask 開發伺服器 Werkzeug 安全啟動限制 (`allow_unsafe_werkzeug=True`)
  - `[x]` 7.3 修正多分頁/多帳號登入時 Socket.IO 與 HTTP Session 不同步 Bug (斷線重連機制)
- `[x]` 8. 多遊戲模式分數繼承修正 (Score Inheritance Resolution)
  - `[x]` 8.1 修正開始多人經典/狂熱賽時未重置玩家分數之問題
  - `[x]` 8.2 實作開始新局時廣播重置後的 `update_scoreboard` 給所有人
- `[x]` 9. 全模式互動式虛擬鍵盤與行動端響應式排版優化 (Virtual Keyboard & Responsiveness)
  - `[x]` 9.1 在 `index.html` 新增精緻對稱的 QWERTY 虛擬鍵盤佈局
  - `[x]` 9.2 在 `style.css` 新增虛擬按鍵樣式與動態提示燈號狀態 (.green, .yellow, .gray)
  - `[x]` 9.3 新增行動端螢幕寬度媒體查詢自適應規則 (<= 768px 與 <= 480px)，確保零排版衝突與完美的垂直人體工學排版
  - `[x]` 9.4 在 `game.js` 重構並收攏實體鍵盤與觸控/點擊事件分發核心至 `handleInput(key)`
  - `[x]` 9.5 實作 `updateKeyColor` 與優先權保護（Green > Yellow > Gray），並在各模式改卷/刷新時同步更新鍵盤
  - `[x]` 9.6 實作 `resetKeyboardColors`，在 `initGrid()` 時完美清空按鍵燈號狀態


