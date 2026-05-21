# 🎮 Wordle 多人連線搶分戰 (Multiplayer Wordle Battle)

歡迎來到 **Wordle 多人連線搶分戰**！這是一個基於 Python Flask、Socket.IO 與 SQLite 開發的跨平台多人即時 Wordle 競技遊戲。

本專案支援**單人自主練習**、**多人限時狂熱賽 (Frenzy Mode)**，以及具有極高對抗性的**同題搶答大亂鬥 (Shared Grid Battle - 5分鐘限時無限制猜測)**，並配備了高質感的**可收展與自由拖曳浮動虛擬鍵盤**。

---

## 📋 系統需求與事前準備

* **Python 版本**：建議安裝 **Python 3.8 或以上版本**。
* **網路環境**：如果要進行多人連線對戰，所有組員的裝置必須連接到**同一個 Wi-Fi 網路（區域網路）**。

---

## 🛠️ 環境建置與執行指南

為了確保套件版本互不干擾，本專案採用 Python 虛擬環境 (`venv`) 進行隔離開發。請根據您的作業系統，選擇對應的步驟進行設定：

### 🪟 Windows 系統設定指南

打開 **PowerShell** 或 **命令提示字元 (cmd)**，進入專案根目錄，並依序執行以下指令：

#### 1. 建立虛擬環境
```powershell
python -m venv venv
```

#### 2. 啟用虛擬環境
* **如果使用 PowerShell**：
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
* **如果使用 傳統 cmd**：
  ```cmd
  .\venv\Scripts\activate.bat
  ```
*(成功啟用後，您的終端機最左邊會出現 `(venv)` 的標記)*

#### 3. 安裝依賴套件
```powershell
pip install -r requirements.txt
```

#### 4. 運行專案
```powershell
python run.py
```
*(啟動後，在瀏覽器輸入 `http://127.0.0.1:5000` 即可開始遊玩！)*

---

### 🍎 macOS 系統設定指南

打開 Mac 的 **「終端機 (Terminal)」**，進入專案根目錄，並依序執行以下指令：

#### 1. 建立虛擬環境
```bash
python3 -m venv venv
```

#### 2. 啟用虛擬環境
```bash
source venv/bin/activate
```
*(成功啟用後，終端機最左邊會出現 `(venv)`)*

#### 3. 安裝依賴套件
```bash
pip install -r requirements.txt
```

#### 4. 運行專案
```bash
python run.py
```
*(啟動後，在瀏覽器輸入 `http://127.0.0.1:5000` 即可開始遊玩！)*

---

## 👥 組員之間如何跨裝置連線遊玩？

如果想讓其他組員用他們的手機或筆電，連上您電腦上架設的遊戲伺服器，請依序完成以下三步：

### 第一步：修改 `run.py` 監聽設定
預設伺服器只允許您本機存取。若要開放給區網內的其他組員，請用編輯器打開 `run.py`，將最底部的啟動程式碼修改為：
```python
if __name__ == '__main__':
    # 新增 host='0.0.0.0' 代表監聽所有網路卡，允許外部連入
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
```

### 第二步：查詢您電腦的「區域網路 IP」
* **Windows 查詢法**：打開 `cmd`，輸入 `ipconfig`，尋找「無線區域網路介面卡 Wi-Fi」底下的 **`IPv4 位址`**（通常為 `192.168.x.x` 或 `10.x.x.x`）。
* **Mac 查詢法**：打開系統設定 ➔ 網路 ➔ 點選已連線的 Wi-Fi ➔ 點選「詳細資訊」，即可看見本機 IP 位址。

### 第三步：讓組員輸入您的 IP 連線
請其他組員在他們的裝置（手機/平板/筆電）連上**同一個 Wi-Fi** 後，於瀏覽器輸入：
```text
http://<您的電腦區域網路IP>:5000
```
*(例如：`http://192.168.1.105:5000`，即可一秒跨裝置加入您的 Wordle 遊戲大廳！)*

> [!IMPORTANT]
> **Windows 防火牆提示**：
> 如果組員的裝置連不上，代表您的 Windows 防火牆擋住了連線。請至「Windows Defender 防火牆」➔ 允許應用程式通過防火牆 ➔ 將 `python` 或 `python.exe` 的「私用」與「公用」網路連線勾選允許即可。

---

## 📁 關於 `.gitignore` 的重要提醒

本專案已設定好 `.gitignore` 檔案。
當您使用 Git 進行協作時，**以下項目將不會被上傳到 GitHub**：
* `venv/`：虛擬環境資料夾（每位組員的電腦應各自建立自己的 `venv`，不可混用）。
* `wordle.db`：本地端測試資料庫（每台電腦的測試帳號與分數都是各自獨立的，這能預防二進位檔案產生 Git 衝突）。
* `.env`：機密設定檔。

當第一位組員首次執行專案時，系統會自動在本地端建立一個全新的 `wordle.db` 資料庫，無需任何手動設定，請安心使用！
