// 1. 拿起對講機 (連線到伺服器)
const socket = io(); 

// 記住自己是誰、在哪個房間
let currentRoom = "";
let currentUser = "";
let isSinglePlayer = false;

// Wordle 鍵盤邏輯變數
let currentRow = 0;
let currentCol = 0;
let isGameOver = false;

// 新增大亂鬥模式的變數
let isBattleMode = false;
let draftCol = 0;
let myRemainingGuesses = 6;

// 狂熱賽計時器變數
let frenzyTimerInterval = null;
let frenzyTimeLeft = 180;

// --- 設定選單邏輯 ---
function toggleSettings() {
    const menu = document.getElementById("settings-menu");
    menu.style.display = menu.style.display === "none" ? "block" : "none";
}

async function logout() {
    if (currentRoom) {
        // 先通知伺服器我們要退出房間了
        socket.emit("leave_room", { room_id: currentRoom, username: currentUser });
    }
    // 呼叫後端 API 清除 Session Cookie
    try {
        await fetch("/api/logout", { method: "POST" });
    } catch (e) {
        console.error("Logout session error:", e);
    }
    // 等待 0.1 秒，確保伺服器有收到退出房間的訊息，再重整網頁
    setTimeout(() => {
        currentUser = "";
        location.reload(); 
    }, 100);
}

function leaveRoom() {
    if (!currentRoom) return;
    socket.emit("leave_room", { room_id: currentRoom, username: currentUser });
    currentRoom = "";
    isSinglePlayer = false;
    isBattleMode = false;
    
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    document.getElementById("timer-container").style.display = "none";
    document.getElementById("battle-round-indicator").style.display = "none";
    document.getElementById("private-draft-container").style.display = "none";
    document.getElementById("battle-guess-log").style.display = "none";
    
    // 隱藏管理員特權卡片
    const adminCard = document.getElementById("admin-cheat-card");
    if (adminCard) adminCard.style.display = "none";
    
    // 切換 UI 回到模式選擇
    document.getElementById("game-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
    document.getElementById("settings-menu").style.display = "none";
    document.getElementById("btn-leave-room").style.display = "none";
}

// --- 初始化 Wordle 網格 ---
function initGrid() {
    const grid = document.getElementById("wordle-grid");
    grid.innerHTML = "";
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 5; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.id = `cell-${r}-${c}`;
            grid.appendChild(cell);
        }
    }
    currentRow = 0;
    currentCol = 0;
    isGameOver = false;
    document.getElementById("message-box").innerText = "";

    // 重設滾動條到頂部
    const wrapper = document.getElementById("wordle-grid-wrapper");
    if (wrapper) {
        wrapper.scrollTop = 0;
    }

    // 清理個人草稿區
    clearDraft();

    // 重設虛擬鍵盤所有燈號狀態
    resetKeyboardColors();

    // 重設猜測次數、金黃 Badge 與草稿提示訊息
    myRemainingGuesses = 0;
    const badge = document.getElementById("draft-remaining-badge");
    if (badge) {
        badge.innerText = "已猜測 0 次";
        badge.className = "draft-badge badge-sufficient";
    }
    const tip = document.getElementById("private-draft-tip");
    if (tip) {
        tip.innerHTML = '打字並按下 <span style="background: #eee; padding: 2px 6px; border-radius: 4px; font-weight: bold;">Enter</span> 鍵，搶先送出到上方共享大螢幕！';
        tip.style.color = "#777";
    }

    // 關鍵修復：立即清空大亂鬥模式的猜測軌跡與出處紀錄，避免上一回合舊紀錄殘留
    const logList = document.getElementById("battle-guess-log-list");
    if (logList) {
        logList.innerHTML = "";
    }

    // 如果是管理員 will，索取當前題目的正確答案
    if (currentUser === "will" && currentRoom) {
        socket.emit("get_admin_target", { room_id: currentRoom, username: currentUser });
    }
}

function clearDraft() {
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`draft-cell-${c}`);
        if (cell) {
            cell.innerText = "";
            cell.removeAttribute("data-state");
        }
    }
    draftCol = 0;
}

// --- 9.5 Wordle 鍵盤輸入核心分發與處理 (Keyboard Event Routing) ---
let keyStates = {};

function handleInput(key) {
    if (!currentRoom || isGameOver) return; // 不在房間內或遊戲結束時不理會鍵盤

    const lowerKey = key.toLowerCase();

    if (lowerKey === "enter") {
        submitGuess();
    } else if (lowerKey === "backspace") {
        if (isBattleMode) {
            if (draftCol > 0) {
                draftCol--;
                const cell = document.getElementById(`draft-cell-${draftCol}`);
                if (cell) {
                    cell.innerText = "";
                    cell.removeAttribute("data-state");
                }
            }
        } else {
            if (currentCol > 0) {
                currentCol--;
                const cell = document.getElementById(`cell-${currentRow}-${currentCol}`);
                if (cell) {
                    cell.innerText = "";
                    cell.removeAttribute("data-state");
                }
            }
        }
    } else if (/^[a-z]$/.test(lowerKey)) {
        if (isBattleMode) {
            if (draftCol < 5) {
                const cell = document.getElementById(`draft-cell-${draftCol}`);
                if (cell) {
                    cell.innerText = lowerKey.toUpperCase();
                    cell.setAttribute("data-state", "filled");
                    draftCol++;
                }
            }
        } else {
            if (currentCol < 5) {
                const cell = document.getElementById(`cell-${currentRow}-${currentCol}`);
                if (cell) {
                    cell.innerText = lowerKey.toUpperCase();
                    cell.setAttribute("data-state", "filled");
                    currentCol++;
                }
            }
        }
    }
}

// 監聽實體鍵盤
document.addEventListener("keydown", (e) => {
    if (!currentRoom || isGameOver) return; // 不在房間內或遊戲結束時不理會鍵盤
    if (document.activeElement && document.activeElement.tagName === "INPUT") return; // 正在輸入框打字時不攔截

    const key = e.key;
    if (key === "Enter" || key === "Backspace" || (/^[a-zA-Z]$/.test(key) && key.length === 1)) {
        e.preventDefault();
        handleInput(key);
    }
});

// 初始化虛擬鍵盤點擊與觸控事件
function initVirtualKeyboard() {
    const keys = document.querySelectorAll(".virtual-keyboard .key");
    keys.forEach(button => {
        const triggerInput = (e) => {
            e.preventDefault();
            const key = button.getAttribute("data-key");
            if (key) {
                handleInput(key);
            }
        };

        // 使用 touchstart 提高行動端按壓反應速度，並利用 preventDefault 防止 click 重複觸發與縮放
        button.addEventListener("touchstart", triggerInput, { passive: false });

        button.addEventListener("click", (e) => {
            if (e.button === 0) { // 僅處理左鍵點擊
                const key = button.getAttribute("data-key");
                if (key) {
                    handleInput(key);
                }
            }
        });
    });

    // [NEW] 綁定拖曳把手與拖曳功能
    const keyboard = document.getElementById("virtual-keyboard");
    const handle = document.getElementById("keyboard-drag-handle");
    if (keyboard && handle) {
        makeElementDraggable(keyboard, handle);
    }

    // [NEW] 載入自訂大小設定與綁定縮放把手
    const resizeHandle = document.getElementById("keyboard-resize-handle");
    if (keyboard && resizeHandle) {
        makeElementResizable(keyboard, resizeHandle);
    }
    
    // 初始化鍵盤尺寸
    if (keyboard) {
        const savedWidth = localStorage.getItem("kbd_custom_width");
        if (savedWidth && !keyboard.classList.contains("collapsed")) {
            keyboard.style.width = savedWidth + "px";
            updateKeyboardScale(keyboard, parseInt(savedWidth));
        }
    }
}

// [NEW] 讓元素變得可自由拖曳 (支援滑鼠與觸控)
function makeElementDraggable(elmnt, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    dragHandle.addEventListener("mousedown", dragMouseDown);
    dragHandle.addEventListener("touchstart", dragTouchStart, { passive: false });

    function dragMouseDown(e) {
        e = e || window.event;
        // 僅處理滑鼠左鍵點擊
        if (e.button !== 0) return;
        
        // 阻止預設的拖曳/選取行為
        e.preventDefault();
        
        // 第一次拖曳時，將 CSS right/bottom 佈局轉換為絕對 left/top 座標
        convertToAbsolutePositioning();
        
        // 獲取起始鼠標座標
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        document.addEventListener("mouseup", closeDragElement);
        document.addEventListener("mousemove", elementDrag);
        
        elmnt.classList.add("dragging");
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        
        // 計算移動距離
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // 設定新位置
        let newLeft = elmnt.offsetLeft - pos1;
        let newTop = elmnt.offsetTop - pos2;
        
        // 安全視窗邊界限制 ( margin = 10 )
        const margin = 10;
        const minLeft = margin;
        const maxLeft = window.innerWidth - elmnt.offsetWidth - margin;
        const minTop = margin;
        const maxTop = window.innerHeight - elmnt.offsetHeight - margin;
        
        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < minTop) newTop = minTop;
        if (newTop > maxTop) newTop = maxTop;
        
        elmnt.style.left = newLeft + "px";
        elmnt.style.top = newTop + "px";
    }

    function closeDragElement() {
        document.removeEventListener("mouseup", closeDragElement);
        document.removeEventListener("mousemove", elementDrag);
        elmnt.classList.remove("dragging");
    }

    // 行動端觸控拖曳
    function dragTouchStart(e) {
        if (e.touches.length !== 1) return;
        
        convertToAbsolutePositioning();
        
        const touch = e.touches[0];
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        
        document.addEventListener("touchend", closeTouchDragElement);
        document.addEventListener("touchmove", elementTouchDrag, { passive: false });
        
        elmnt.classList.add("dragging");
    }

    function elementTouchDrag(e) {
        if (e.touches.length !== 1) return;
        // 阻止行動端拖曳把手時造成整個頁面上下滑動滾動
        e.preventDefault();
        
        const touch = e.touches[0];
        pos1 = pos3 - touch.clientX;
        pos2 = pos4 - touch.clientY;
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        
        let newLeft = elmnt.offsetLeft - pos1;
        let newTop = elmnt.offsetTop - pos2;
        
        const margin = 10;
        const minLeft = margin;
        const maxLeft = window.innerWidth - elmnt.offsetWidth - margin;
        const minTop = margin;
        const maxTop = window.innerHeight - elmnt.offsetHeight - margin;
        
        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < minTop) newTop = minTop;
        if (newTop > maxTop) newTop = maxTop;
        
        elmnt.style.left = newLeft + "px";
        elmnt.style.top = newTop + "px";
    }

    function closeTouchDragElement() {
        document.removeEventListener("touchend", closeTouchDragElement);
        document.removeEventListener("touchmove", elementTouchDrag);
        elmnt.classList.remove("dragging");
    }

    function convertToAbsolutePositioning() {
        if (elmnt.style.left && elmnt.style.top) return;
        
        const rect = elmnt.getBoundingClientRect();
        elmnt.style.left = rect.left + "px";
        elmnt.style.top = rect.top + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    // 視窗大小改變時，自適應微調定位，防止鍵盤被擠出螢幕之外
    window.addEventListener("resize", () => {
        if (!elmnt.style.left && !elmnt.style.top) return;
        
        const margin = 10;
        let left = parseFloat(elmnt.style.left);
        let top = parseFloat(elmnt.style.top);
        
        const maxLeft = window.innerWidth - elmnt.offsetWidth - margin;
        const maxTop = window.innerHeight - elmnt.offsetHeight - margin;
        
        if (left < margin) left = margin;
        if (left > maxLeft) left = maxLeft;
        if (top < margin) top = margin;
        if (top > maxTop) top = maxTop;
        
        elmnt.style.left = left + "px";
        elmnt.style.top = top + "px";
    });
}

// [NEW] 動態更新虛擬鍵盤按鍵縮放比例
function updateKeyboardScale(elmnt, width) {
    const ratio = width / 450; // 基準寬度為 450px
    elmnt.style.setProperty("--kbd-key-max-width", (44 * ratio) + "px");
    elmnt.style.setProperty("--kbd-key-height", (50 * ratio) + "px");
    elmnt.style.setProperty("--kbd-key-font-size", Math.max(10, 14 * ratio) + "px");
    elmnt.style.setProperty("--kbd-wide-key-max-width", (72 * ratio) + "px");
    elmnt.style.setProperty("--kbd-wide-key-font-size", Math.max(8, 11 * ratio) + "px");
}

// [NEW] 讓元素變得可縮放 (支援滑鼠與觸控)
function makeElementResizable(elmnt, handle) {
    let startX = 0, startWidth = 0;

    handle.addEventListener("mousedown", initResize);
    handle.addEventListener("touchstart", initTouchResize, { passive: false });

    function initResize(e) {
        if (e.button !== 0) return; // 僅允許左鍵
        e.preventDefault();
        e.stopPropagation();

        startX = e.clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(elmnt).width, 10);

        document.addEventListener("mousemove", resize);
        document.addEventListener("mouseup", stopResize);

        elmnt.classList.add("resizing");
    }

    function resize(e) {
        e.preventDefault();
        const dx = e.clientX - startX;
        let newWidth = startWidth + dx;

        const minWidth = 280;
        const maxWidth = Math.min(800, window.innerWidth - 30);

        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        elmnt.style.width = newWidth + "px";
        updateKeyboardScale(elmnt, newWidth);
        
        keepKeyboardWithinBounds(elmnt);
    }

    function stopResize() {
        document.removeEventListener("mousemove", resize);
        document.removeEventListener("mouseup", stopResize);
        elmnt.classList.remove("resizing");

        if (!elmnt.classList.contains("collapsed")) {
            localStorage.setItem("kbd_custom_width", parseInt(elmnt.style.width, 10));
        }
    }

    // 觸控拖曳縮放支援
    function initTouchResize(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        startX = touch.clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(elmnt).width, 10);

        document.addEventListener("touchmove", touchResize, { passive: false });
        document.addEventListener("touchend", stopTouchResize);

        elmnt.classList.add("resizing");
    }

    function touchResize(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        let newWidth = startWidth + dx;

        const minWidth = 280;
        const maxWidth = Math.min(800, window.innerWidth - 30);

        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        elmnt.style.width = newWidth + "px";
        updateKeyboardScale(elmnt, newWidth);
        
        keepKeyboardWithinBounds(elmnt);
    }

    function stopTouchResize() {
        document.removeEventListener("touchmove", touchResize);
        document.removeEventListener("touchend", stopTouchResize);
        elmnt.classList.remove("resizing");

        if (!elmnt.classList.contains("collapsed")) {
            localStorage.setItem("kbd_custom_width", parseInt(elmnt.style.width, 10));
        }
    }

    // 監聽視窗大小改變，自動適應微調
    window.addEventListener("resize", () => {
        if (elmnt.classList.contains("collapsed")) return;
        
        const savedWidth = localStorage.getItem("kbd_custom_width");
        let activeWidth = savedWidth ? parseInt(savedWidth) : 450;
        
        const maxWidth = Math.min(800, window.innerWidth - 30);
        if (activeWidth > maxWidth) {
            activeWidth = maxWidth;
            elmnt.style.width = activeWidth + "px";
            updateKeyboardScale(elmnt, activeWidth);
        }
    });
}

// [NEW] 全局折疊控制函數 (折疊/展開虛擬鍵盤)
function toggleKeyboardCollapse(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const keyboard = document.getElementById("virtual-keyboard");
    const toggleBtn = document.getElementById("keyboard-toggle-btn");
    if (!keyboard || !toggleBtn) return;
    
    const isCollapsing = !keyboard.classList.contains("collapsed");
    keyboard.classList.toggle("collapsed");
    
    if (isCollapsing) {
        toggleBtn.innerText = "➕ 展開";
        // 清除行內寬度樣式，讓 CSS 中的 .collapsed 寬度 (170px) 能順利套用
        keyboard.style.width = "";
    } else {
        toggleBtn.innerText = "➖ 收起";
        
        // 展開時恢復 localStorage 記憶的自訂寬度與縮放
        const savedWidth = localStorage.getItem("kbd_custom_width");
        if (savedWidth) {
            keyboard.style.width = savedWidth + "px";
            updateKeyboardScale(keyboard, parseInt(savedWidth));
        } else {
            keyboard.style.width = "";
            keyboard.style.removeProperty("--kbd-key-max-width");
            keyboard.style.removeProperty("--kbd-key-height");
            keyboard.style.removeProperty("--kbd-key-font-size");
            keyboard.style.removeProperty("--kbd-wide-key-max-width");
            keyboard.style.removeProperty("--kbd-wide-key-font-size");
        }
        
        // 展開時需要自動防護，防止鍵盤溢出邊界
        // 1. 立即大略校正
        keepKeyboardWithinBounds(keyboard);
        
        // 2. 在 0.25 秒 CSS 寬度/邊界動畫結束後，進行精準的高精度校正
        setTimeout(() => {
            keepKeyboardWithinBounds(keyboard);
        }, 260);
    }
}

// [NEW] 校正鍵盤位置使其完全在可視視窗內
function keepKeyboardWithinBounds(elmnt) {
    if (!elmnt.style.left && !elmnt.style.top) {
        // 尚未拖曳過（使用 CSS 預設 right/bottom 定位），無須校正
        return;
    }
    const rect = elmnt.getBoundingClientRect();
    const margin = 10;
    
    let left = parseFloat(elmnt.style.left);
    let top = parseFloat(elmnt.style.top);
    
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    
    if (left < margin) left = margin;
    if (left > maxLeft) left = maxLeft;
    if (top < margin) top = margin;
    if (top > maxTop) top = maxTop;
    
    elmnt.style.left = left + "px";
    elmnt.style.top = top + "px";
}

// 立即在加載時初始化虛擬鍵盤
initVirtualKeyboard();

// 更新虛擬鍵盤單一字母的精緻燈號狀態 (Green > Yellow > Gray)
function updateKeyColor(letter, status) {
    if (!letter) return;
    const lowerLetter = letter.toLowerCase();
    
    if (status !== "green" && status !== "yellow" && status !== "gray") {
        return;
    }
    
    const colorPriority = {
        "green": 3,
        "yellow": 2,
        "gray": 1
    };
    
    const currentStatus = keyStates[lowerLetter] || "";
    const currentPriority = colorPriority[currentStatus] || 0;
    const newPriority = colorPriority[status] || 0;
    
    if (newPriority > currentPriority) {
        keyStates[lowerLetter] = status;
        
        // 尋找虛擬鍵盤按鈕並更新樣式
        const button = document.querySelector(`.virtual-keyboard .key[data-key="${lowerLetter}"]`);
        if (button) {
            button.classList.remove("green", "yellow", "gray");
            button.classList.add(status);
        }
    }
}

// 重設虛擬鍵盤所有燈號狀態
function resetKeyboardColors() {
    keyStates = {};
    const keys = document.querySelectorAll(".virtual-keyboard .key");
    keys.forEach(key => {
        key.classList.remove("green", "yellow", "gray");
    });
}

// --- 動作：註冊 ---
async function register() {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    const msg = document.getElementById("auth-message");

    if (!u || !p) { msg.innerText = "請輸入帳號與密碼！"; return; }

    const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    
    if (res.ok) {
        msg.style.color = "green";
        msg.innerText = data.message;
    } else {
        msg.style.color = "red";
        msg.innerText = data.message;
    }
}

// --- 動作：登入 ---
async function login() {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    const msg = document.getElementById("auth-message");

    if (!u || !p) { msg.innerText = "請輸入帳號與密碼！"; return; }

    const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    
    if (res.ok) {
        currentUser = data.username;
        
        // 關鍵修復：斷開並重新連線 Socket，將更新後的登入 Session Cookie 同步至 Socket 連線中
        socket.disconnect();
        socket.connect();
        
        // 登入成功，切換介面
        document.getElementById("logo-section").style.display = "none";
        document.getElementById("auth-section").style.display = "none";
        document.getElementById("mode-selection-section").style.display = "block";
        document.getElementById("settings-container").style.display = "block";
        document.getElementById("welcome-message").innerText = "歡迎回來，" + currentUser + "！";
    } else {
        msg.style.color = "red";
        msg.innerText = data.message;
    }
}

// --- 動作：加入單人遊戲 ---
function joinSinglePlayer() {
    if (!currentUser) return;

    isSinglePlayer = true;
    currentRoom = "single_" + currentUser;
    
    // 用對講機呼叫通訊塔，說我們要加入單人模式
    socket.emit("join_single_player", { username: currentUser });

    // 切換 UI
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("game-section").style.display = "flex";
    document.getElementById("scoreboard-area").style.display = "none";
    document.getElementById("single-player-stats").style.display = "block";
    document.getElementById("btn-leave-room").style.display = "block";
    
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    document.getElementById("timer-container").style.display = "none";

    initGrid();
}

// --- 動作：建立房間 ---
function createRoom() {
    if (!currentUser) return;
    const roomInput = document.getElementById("create-room-id");
    const maxPlayersInput = document.getElementById("room-max-players");
    const privacyInput = document.getElementById("room-privacy");

    const roomId = roomInput ? roomInput.value.trim() : "";
    if (!roomId) {
        alert("請輸入房間號碼喔！");
        return;
    }

    const maxPlayers = maxPlayersInput ? parseInt(maxPlayersInput.value) : 5;
    const isPrivate = privacyInput ? (privacyInput.value === "private") : false;

    currentRoom = roomId;

    socket.emit("create_room", {
        room_id: roomId,
        username: currentUser,
        max_players: maxPlayers,
        is_private: isPrivate
    });

    // 先切換 UI 至準備大廳，若失敗會被 bounce back
    document.getElementById("multiplayer-lobby-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("display-room-id").innerText = roomId;
    document.getElementById("btn-leave-room").style.display = "block";
}

// --- 動作：加入遊戲 ---
function joinGame() {
    if (!currentUser) return;
    const roomInput = document.getElementById("room-id");
    currentRoom = roomInput ? roomInput.value.trim() : "";

    if (!currentRoom) {
        alert("請輸入房間號碼喔！");
        return;
    }

    // 用對講機呼叫通訊塔，說我們要加入房間
    socket.emit("join_game", { room_id: currentRoom, username: currentUser });

    // 切換 UI 至準備大廳
    document.getElementById("multiplayer-lobby-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("display-room-id").innerText = currentRoom;
    document.getElementById("btn-leave-room").style.display = "block";
}

// --- 動作：送出猜測 ---
function submitGuess() {
    let guess = "";
    if (isBattleMode) {
        if (draftCol !== 5) {
            document.getElementById("message-box").innerText = "請輸入 5 個字母！";
            document.getElementById("message-box").style.color = "red";
            return;
        }
        for (let c = 0; c < 5; c++) {
            const cell = document.getElementById(`draft-cell-${c}`);
            guess += cell ? cell.innerText : "";
        }
    } else {
        if (currentCol !== 5) {
            document.getElementById("message-box").innerText = "請輸入 5 個字母！";
            document.getElementById("message-box").style.color = "red";
            return;
        }
        for (let c = 0; c < 5; c++) {
            const cell = document.getElementById(`cell-${currentRow}-${c}`);
            guess += cell ? cell.innerText : "";
        }
    }

    // 用對講機把猜的字傳給裁判
    socket.emit("submit_guess", {
        room_id: currentRoom,
        username: currentUser,
        guess: guess
    });
}

// --- 接收單一訊息：更新個人總分 (單人模式用) ---
socket.on("update_total_score", function(data) {
    document.getElementById("my-total-score").innerText = data.total_score;
});

// --- 接收廣播：更新計分板 ---
socket.on("update_scoreboard", function(players_data) {
    const scoreList = document.getElementById("score-list");
    scoreList.innerHTML = ""; // 先把舊的計分板擦掉

    // 根據接收到的資料結構自動判斷是否為大亂鬥模式，防止與 game_started 事件的順序競爭
    const hasRemainingGuesses = Object.values(players_data).some(p => p && p.remaining_guesses !== undefined);
    if (hasRemainingGuesses) {
        isBattleMode = true;
    }

    // 將資料轉成陣列並依據分數排序 (由高到低)
    const sortedPlayers = Object.entries(players_data).sort((a, b) => b[1].score - a[1].score);

    sortedPlayers.forEach((player, index) => {
        const username = player[0];
        const data = player[1];
        
        const row = document.createElement("div");
        row.className = "score-row" + (index === 0 && data.score > 0 ? " first-place" : "");
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "player-name";
        
        let displayName = username;
        if (isBattleMode && data.guess_count !== undefined) {
            displayName += ` (已猜 ${data.guess_count} 次)`;
        }
        if (index === 0 && data.score > 0) {
            displayName += " 🏆";
        }
        nameDiv.innerText = displayName;
        
        const scoreDiv = document.createElement("div");
        scoreDiv.className = "player-score";
        scoreDiv.innerText = data.score + " 分";
        
        row.appendChild(nameDiv);
        row.appendChild(scoreDiv);
        scoreList.appendChild(row);
    });

    // 動態更新自己已猜測的次數 Badge 與提示
    if (isBattleMode && players_data[currentUser] !== undefined) {
        const myData = players_data[currentUser];
        const guessCount = myData.guess_count !== undefined ? myData.guess_count : 0;
        
        const badge = document.getElementById("draft-remaining-badge");
        if (badge) {
            badge.innerText = `已猜測 ${guessCount} 次`;
            badge.className = "draft-badge badge-sufficient";
        }

        const tip = document.getElementById("private-draft-tip");
        if (tip) {
            tip.innerHTML = '打字並按下 <span style="background: #eee; padding: 2px 6px; border-radius: 4px; font-weight: bold;">Enter</span> 鍵，搶先送出到上方共享大螢幕！';
            tip.style.color = "#777";
            tip.style.fontWeight = "normal";
        }
    }
});

// --- 接收單一訊息：裁判改完考卷了 ---
socket.on("guess_result", function(result) {
    const messageBox = document.getElementById("message-box");
    
    // 將結果顏色塗上目前的 currentRow
    result.details.forEach((charData, index) => {
        const cell = document.getElementById(`cell-${currentRow}-${index}`);
        if (cell) {
            cell.className = "cell " + charData.status; 
            
            // 同步更新虛擬鍵盤提示燈號
            const letter = cell.innerText;
            updateKeyColor(letter, charData.status);
        }
    });

    if (result.is_correct) {
        isGameOver = true;
        messageBox.innerText = result.message + " 準備換下一題！";
        messageBox.style.color = "green";
        setTimeout(() => { initGrid(); }, 1500);
    } else if (result.guesses_exhausted) {
        isGameOver = true;
        messageBox.innerText = "猜錯 6 次了！幫你換一個新單字...";
        messageBox.style.color = "red";
        setTimeout(() => {
            initGrid();
        }, 1500);
    } else {
        messageBox.innerText = result.message;
        messageBox.style.color = "black";
        currentRow++;
        currentCol = 0;
        
        // 6 次機會用完了
        if (currentRow >= 6) {
            isGameOver = true;
            messageBox.innerText = "猜錯 6 次了！幫你換一個新單字...";
            messageBox.style.color = "red";
            setTimeout(() => {
                socket.emit("skip_word", { room_id: currentRoom, username: currentUser });
                initGrid();
            }, 1500);
        }
    }
});

// --- 接收錯誤訊息：例如字數不對 ---
socket.on("guess_error", function(data) {
    document.getElementById("message-box").innerText = data.message;
    document.getElementById("message-box").style.color = "red";
});

// --- 管理員特權：接收正確答案並顯示 ---
socket.on("admin_target_word", function(data) {
    const adminCard = document.getElementById("admin-cheat-card");
    const adminDisplay = document.getElementById("admin-target-display");
    if (adminCard && adminDisplay) {
        adminCard.style.display = "block";
        adminDisplay.innerText = data.target.toUpperCase();
    }
});

// --- 接收更新：大廳名單更新 ---
socket.on("update_waiting_room", function(data) {
    const list = document.getElementById("waiting-players-list");
    list.innerHTML = "";
    
    data.players.forEach(p => {
        const li = document.createElement("li");
        li.innerText = p + (p === data.host ? " 👑" : "");
        list.appendChild(li);
    });

    // 判斷是否為房主
    const isHost = (currentUser === data.host);
    const select = document.getElementById("game-mode-select");
    const btnStart = document.getElementById("btn-start-game");
    const msg = document.getElementById("host-message");

    if (isHost) {
        select.disabled = false;
        btnStart.style.display = "inline-block";
        msg.style.display = "none";
    } else {
        select.disabled = true;
        btnStart.style.display = "none";
        msg.style.display = "block";
    }
});

// --- 動作：房主開始遊戲 ---
function startGame() {
    const mode = document.getElementById("game-mode-select").value;
    socket.emit("start_multiplayer_game", { room_id: currentRoom, username: currentUser, mode: mode });
}

// --- 接收事件：遊戲開始 ---
socket.on("game_started", function(data) {
    document.getElementById("waiting-room-section").style.display = "none";
    document.getElementById("game-section").style.display = "flex";
    document.getElementById("scoreboard-area").style.display = "block";
    document.getElementById("single-player-stats").style.display = "none";
    
    // 隱藏結算提示框
    const resultBox = document.getElementById("frenzy-result-message");
    if (resultBox) resultBox.style.display = "none";
    
    // 設定大亂鬥模式的 UI 顯示與參數
    if (data.mode === "battle") {
        isBattleMode = true;
        document.getElementById("battle-round-indicator").style.display = "block";
        document.getElementById("private-draft-container").style.display = "flex";
        document.getElementById("battle-guess-log").style.display = "block";
        const roundSpan = document.getElementById("battle-current-round");
        if (roundSpan) roundSpan.innerText = data.current_round || 1;
    } else {
        isBattleMode = false;
        document.getElementById("battle-round-indicator").style.display = "none";
        document.getElementById("private-draft-container").style.display = "none";
        document.getElementById("battle-guess-log").style.display = "none";
    }

    // 如果是狂熱模式或大亂鬥模式，顯示並啟動計時器 (使用絕對時間戳記同步)
    if ((data.mode === "frenzy" || data.mode === "battle") && data.end_time) {
        startCountdownTimer(data.mode, data.end_time);
    } else {
        document.getElementById("timer-container").style.display = "none";
        if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    }

    initGrid();
});

function startCountdownTimer(mode, endTime) {
    if (!endTime) return;
    
    const timerTitle = document.getElementById("timer-title");
    if (timerTitle) {
        if (mode === "battle") {
            timerTitle.innerText = "⌛ 本回合剩餘時間";
        } else {
            timerTitle.innerText = "剩餘時間";
        }
    }
    
    document.getElementById("timer-container").style.display = "block";
    
    const tick = () => {
        const now = Date.now();
        frenzyTimeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
        updateTimerUI();
        if (frenzyTimeLeft <= 0) {
            clearInterval(frenzyTimerInterval);
        }
    };
    
    tick();
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    frenzyTimerInterval = setInterval(tick, 1000);
}

function updateTimerUI() {
    const m = Math.floor(frenzyTimeLeft / 60).toString().padStart(2, "0");
    const s = (frenzyTimeLeft % 60).toString().padStart(2, "0");
    const timerEl = document.getElementById("frenzy-timer");
    timerEl.innerText = `${m}:${s}`;
    
    if (frenzyTimeLeft <= 30) {
        timerEl.classList.add("timer-urgent");
    } else {
        timerEl.classList.remove("timer-urgent");
    }
}

// --- 接收事件：狂熱賽時間到 ---
socket.on("frenzy_game_over", function(data) {
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    
    // 找出最高分
    let maxScore = -1;
    let winners = [];
    for (const [user, info] of Object.entries(data.players)) {
        if (info.score > maxScore) {
            maxScore = info.score;
            winners = [user];
        } else if (info.score === maxScore) {
            winners.push(user);
        }
    }
    
    // 顯示結算成績於大廳
    const resultBox = document.getElementById("frenzy-result-message");
    const winnersText = document.getElementById("frenzy-winners-text");
    if (resultBox && winnersText) {
        resultBox.style.display = "block";
        winnersText.innerText = `🏆 贏家：${winners.join(", ")} (${maxScore} 分)`;
    }
    
    // 切換回大廳
    document.getElementById("game-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("timer-container").style.display = "none";
});

// --- 接收事件：狂熱賽即時得分提示 ---
socket.on("frenzy_player_scored", function(data) {
    showFrenzyScoreToast(data.username);
});

// --- 接收加入房間錯誤 ---
socket.on("join_error", function(data) {
    alert(data.message);
    currentRoom = "";
    document.getElementById("waiting-room-section").style.display = "none";
    document.getElementById("multiplayer-lobby-section").style.display = "block";
    document.getElementById("btn-leave-room").style.display = "none";
});

// --- 大亂鬥事件監聽器 ---
socket.on("battle_update_grid", function(data) {
    // 關鍵新增：即時彈出頂部猜測與出處浮動提示 (0.5秒後自動消失)
    if (data.new_guess) {
        showBattleGuessToast(data.new_guess.username, data.new_guess.word, data.new_guess.is_correct);
    }

    const guesses = data.guesses;
    const neededRows = isBattleMode ? Math.max(6, Math.ceil((guesses.length + 1) / 2) * 2) : 6;
    
    // 動態重建/擴充主網格
    const grid = document.getElementById("wordle-grid");
    grid.innerHTML = "";
    for (let r = 0; r < neededRows; r++) {
        for (let c = 0; c < 5; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.id = `cell-${r}-${c}`;
            grid.appendChild(cell);
        }
    }
    
    // 重設虛擬鍵盤提示燈號
    resetKeyboardColors();

    // 填入已送出的猜測與裁判結果
    guesses.forEach((g, r) => {
        g.details.forEach((charData, c) => {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell) {
                cell.innerText = charData.letter.toUpperCase();
                cell.className = "cell " + charData.status;
                cell.setAttribute("data-state", "filled");
                
                // 同步更新虛擬鍵盤提示燈號
                updateKeyColor(charData.letter, charData.status);
            }
        });
    });
    
    currentRow = guesses.length;

    // 自動滾動到最底部以顯示最新的行
    const wrapper = document.getElementById("wordle-grid-wrapper");
    if (wrapper) {
        setTimeout(() => {
            wrapper.scrollTop = wrapper.scrollHeight;
        }, 50);
    }
    
    // 更新軌跡紀錄框
    const logContainer = document.getElementById("battle-guess-log");
    const logList = document.getElementById("battle-guess-log-list");
    if (logContainer && logList) {
        logContainer.style.display = "block";
        logList.innerHTML = "";
        guesses.forEach((g, index) => {
            const div = document.createElement("div");
            div.style.marginBottom = "5px";
            div.style.borderBottom = "1px solid #f0f0f0";
            div.style.paddingBottom = "3px";
            div.innerHTML = `第 <strong style="color: #9c27b0;">${index + 1}</strong> 行：` +
                            `<span style="font-weight: bold; font-size: 1.1em; color: #333; letter-spacing: 1px; margin-right: 10px;">${g.word}</span>` +
                            `由 <span style="background: #e3f2fd; color: #1e88e5; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.85em;">${g.username}</span> 送出`;
            logList.appendChild(div);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    // 填寫者本人清空草稿
    if (data.new_guess && data.new_guess.username === currentUser) {
        clearDraft();
    }
});

socket.on("battle_round_over", function(data) {
    isGameOver = true;
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    const messageBox = document.getElementById("message-box");
    
    let winMsg = "";
    if (data.winner) {
        winMsg = `🎉 玩家 【${data.winner}】 答對了！本回合結束。`;
    } else {
        winMsg = `💀 猜測機會已用盡，本回合平局結束。`;
    }
    
    messageBox.style.color = "#9c27b0";
    messageBox.style.fontWeight = "bold";
    messageBox.innerText = `${winMsg}\n答案是：【${data.target.toUpperCase()}】\n${data.next_round_delay} 秒後自動開啟下一回合...`;
    
    let secondsLeft = data.next_round_delay - 1;
    const interval = setInterval(() => {
        if (secondsLeft > 0) {
            messageBox.innerText = `${winMsg}\n答案是：【${data.target.toUpperCase()}】\n${secondsLeft} 秒後自動開啟下一回合...`;
            secondsLeft--;
        } else {
            clearInterval(interval);
        }
    }, 1000);
});

socket.on("battle_next_round", function(data) {
    isGameOver = false;
    const roundSpan = document.getElementById("battle-current-round");
    if (roundSpan) {
        roundSpan.innerText = data.current_round;
    }
    if (data.end_time) {
        startCountdownTimer("battle", data.end_time);
    }
    initGrid();
});

socket.on("battle_game_over", function(data) {
    isGameOver = true;
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    
    document.getElementById("game-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("battle-round-indicator").style.display = "none";
    document.getElementById("battle-guess-log").style.display = "none";
    
    const resultBox = document.getElementById("frenzy-result-message");
    const resultTitle = document.getElementById("result-title");
    const winnersText = document.getElementById("frenzy-winners-text");
    
    if (resultBox && resultTitle && winnersText) {
        resultBox.style.display = "block";
        resultTitle.innerText = "⚔️ 大亂鬥完賽！最終結算";
        resultTitle.style.color = "#9c27b0";
        
        let scoreString = "";
        Object.entries(data.final_scores).forEach(([user, info]) => {
            scoreString += `<li>${user}: <strong>${info.score}</strong> 分</li>`;
        });
        
        winnersText.innerHTML = `<span style="font-size: 1.3em; color: #7b1fa2;">🏆 總冠軍：${data.winners.join(", ")}</span>` +
                                `<ul style="list-style-type: none; padding: 0; margin-top: 10px; font-size: 1em; color: #555;">` +
                                `${scoreString}</ul>`;
    }
});

// --- 排行榜邏輯 ---
function openLeaderboard() {
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("leaderboard-section").style.display = "block";
    fetchLeaderboard("total_score"); // 預設載入總得分
}

function closeLeaderboard() {
    document.getElementById("leaderboard-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

async function fetchLeaderboard(type) {
    // 改變按鈕顏色
    const btnTotal = document.getElementById("btn-lb-total");
    const btnFrenzy = document.getElementById("btn-lb-frenzy");
    const btnBattle = document.getElementById("btn-lb-battle");
    
    if (btnTotal) btnTotal.style.backgroundColor = "#787c7e";
    if (btnFrenzy) btnFrenzy.style.backgroundColor = "#787c7e";
    if (btnBattle) btnBattle.style.backgroundColor = "#787c7e";
    
    if (type === "total_score") {
        if (btnTotal) btnTotal.style.backgroundColor = "#4CAF50";
    } else if (type === "frenzy_wins") {
        if (btnFrenzy) btnFrenzy.style.backgroundColor = "#2196F3";
    } else if (type === "battle_wins") {
        if (btnBattle) btnBattle.style.backgroundColor = "#9c27b0";
    }

    const res = await fetch(`/api/leaderboard?type=${type}`);
    const data = await res.json();
    
    const list = document.getElementById("leaderboard-list");
    list.innerHTML = "";
    
    data.forEach((p, index) => {
        const row = document.createElement("div");
        row.className = "score-row" + (index === 0 && p.score > 0 ? " first-place" : "");
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "player-name";
        nameDiv.innerText = `#${index + 1} ` + p.username + (index === 0 && p.score > 0 ? " 🏆" : "");
        
        const scoreDiv = document.createElement("div");
        scoreDiv.className = "player-score";
        
        let unit = " 分";
        if (type === "frenzy_wins" || type === "battle_wins") {
            unit = " 勝";
        }
        scoreDiv.innerText = p.score + unit;
        
        row.appendChild(nameDiv);
        row.appendChild(scoreDiv);
        list.appendChild(row);
    });
}

// --- 帳號資訊邏輯 ---
let currentHistoryTab = "frenzy";

function switchHistoryTab(tab) {
    currentHistoryTab = tab;
    const btnFrenzy = document.getElementById("btn-hist-frenzy");
    const btnBattle = document.getElementById("btn-hist-battle");
    const frenzyContainer = document.getElementById("frenzy-history-container");
    const battleContainer = document.getElementById("battle-history-container");
    
    if (tab === "frenzy") {
        if (btnFrenzy) btnFrenzy.style.backgroundColor = "#2196F3";
        if (btnBattle) btnBattle.style.backgroundColor = "#787c7e";
        if (frenzyContainer) frenzyContainer.style.display = "block";
        if (battleContainer) battleContainer.style.display = "none";
    } else {
        if (btnFrenzy) btnFrenzy.style.backgroundColor = "#787c7e";
        if (btnBattle) btnBattle.style.backgroundColor = "#9c27b0";
        if (frenzyContainer) frenzyContainer.style.display = "none";
        if (battleContainer) battleContainer.style.display = "block";
    }
}

async function openAccountInfo() {
    if (!currentUser) return;
    
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("account-info-section").style.display = "block";
    
    switchHistoryTab("frenzy"); // 預設顯示狂熱賽
    
    const res = await fetch(`/api/account_info?username=${currentUser}`);
    const data = await res.json();
    
    if (data.status === "success") {
        document.getElementById("acc-total-score").innerText = data.total_score;
        document.getElementById("acc-frenzy-wins").innerText = data.frenzy_wins;
        document.getElementById("acc-battle-wins").innerText = data.battle_wins || 0;
        
        const list = document.getElementById("acc-recent-games");
        list.innerHTML = "";
        
        if (data.recent_games.length === 0) {
            list.innerHTML = "<p style='color: #666;'>尚無戰績</p>";
        } else {
            data.recent_games.forEach((g) => {
                const row = createRecentGameRow(g);
                list.appendChild(row);
            });
        }
        
        const battleList = document.getElementById("acc-recent-battle-games");
        battleList.innerHTML = "";
        
        if (!data.recent_battle_games || data.recent_battle_games.length === 0) {
            battleList.innerHTML = "<p style='color: #666;'>尚無戰績</p>";
        } else {
            data.recent_battle_games.forEach((g) => {
                const row = createRecentGameRow(g);
                battleList.appendChild(row);
            });
        }
    }
}

function createRecentGameRow(g) {
    const row = document.createElement("div");
    row.style.padding = "10px";
    row.style.borderRadius = "5px";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.marginBottom = "5px";
    
    if (g.is_win) {
        row.style.backgroundColor = "#e8f5e9";
        row.style.borderLeft = "4px solid #4CAF50";
    } else {
        row.style.backgroundColor = "#ffebee";
        row.style.borderLeft = "4px solid #f44336";
    }
    
    const leftDiv = document.createElement("div");
    leftDiv.innerHTML = `<strong>${g.score} 分</strong> <span style="color: #666; font-size: 0.9em; margin-left: 10px;">${g.date}</span>`;
    
    const rightDiv = document.createElement("div");
    rightDiv.style.fontWeight = "bold";
    if (g.is_win) {
        rightDiv.innerText = "勝 🏆";
        rightDiv.style.color = "#4CAF50";
    } else {
        rightDiv.innerText = "敗";
        rightDiv.style.color = "#f44336";
    }
    
    row.appendChild(leftDiv);
    row.appendChild(rightDiv);
    return row;
}

function closeAccountInfo() {
    document.getElementById("account-info-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

// --- 多人模式連線大廳導覽邏輯 ---
function openMultiplayerLobby() {
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("multiplayer-lobby-section").style.display = "block";
    
    // 自動聚焦建立房號輸入框，並清除舊內容提供極致 UX
    const createInput = document.getElementById("create-room-id");
    if (createInput) {
        createInput.value = "";
        createInput.focus();
    }
    const joinInput = document.getElementById("room-id");
    if (joinInput) {
        joinInput.value = "";
    }
    
    // 向伺服器要求取得最新的活躍房間清單
    socket.emit("get_rooms_list");
}

function closeMultiplayerLobby() {
    document.getElementById("multiplayer-lobby-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

// --- 8. 大亂鬥即時猜測浮動提示 (Premium Floating Toast) ---
function showBattleGuessToast(username, word, isCorrect = false) {
    let container = document.getElementById("battle-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "battle-toast-container";
        container.className = "battle-toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    
    if (isCorrect) {
        toast.className = "battle-toast battle-toast-correct";
        toast.innerHTML = `<span class="toast-icon">🏆</span>` +
                          `<span class="toast-user">${username}</span>` +
                          `<span class="toast-action"> 猜對了！ </span>` +
                          `<span class="toast-word">${word.toUpperCase()}</span>` +
                          `<span class="toast-pts">+1分</span>`;
                          
        // 產生 16 個黃金璀璨火花特效
        for (let i = 0; i < 16; i++) {
            const sparkle = document.createElement("div");
            
            // 隨機分配火花形狀
            const shapes = ["sparkle-circle", "sparkle-star", "sparkle-diamond"];
            const shapeClass = shapes[Math.floor(Math.random() * shapes.length)];
            sparkle.className = `battle-gold-sparkle ${shapeClass}`;
            
            // 隨機角度與爆炸擴散距離
            const angle = Math.random() * Math.PI * 2;
            const distance = 35 + Math.random() * 65;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            const size = 5 + Math.random() * 8;
            
            sparkle.style.width = `${size}px`;
            sparkle.style.height = `${size}px`;
            sparkle.style.left = `50%`;
            sparkle.style.top = `50%`;
            sparkle.style.setProperty("--tx", `${x}px`);
            sparkle.style.setProperty("--ty", `${y}px`);
            
            // 黃金與亮白色系的火花色彩搭配
            const colors = ["#FFE259", "#FFA751", "#FFD700", "#FFB300", "#FFFFFF"];
            sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
            
            toast.appendChild(sparkle);
        }
    } else {
        toast.className = "battle-toast";
        toast.innerHTML = `<span class="toast-icon">⚡</span>` +
                          `<span class="toast-user">${username}</span>` +
                          `<span> 送出了 </span>` +
                          `<span class="toast-word">${word.toUpperCase()}</span>`;
    }
                      
    container.appendChild(toast);
    
    // 1 秒後從 DOM 中完全移除，與 CSS 1s 的淡出動畫精準同步
    setTimeout(() => {
        toast.remove();
    }, 1000);
}

// --- 9. 狂熱賽即時得分提示 (Frenzy Score Toast) ---
function showFrenzyScoreToast(username) {
    let container = document.getElementById("battle-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "battle-toast-container";
        container.className = "battle-toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = "battle-toast frenzy-toast";
    toast.innerHTML = `<span class="toast-icon">🔥</span>` +
                      `<span class="toast-user">${username}</span>` +
                      `<span class="toast-action"> 答對得分！ </span>` +
                      `<span class="toast-pts">+1分</span>`;
                      
    // 產生 12 個炫藍霓虹火花特效
    for (let i = 0; i < 12; i++) {
        const sparkle = document.createElement("div");
        
        // 隨機分配火花形狀
        const shapes = ["sparkle-circle", "sparkle-star", "sparkle-diamond"];
        const shapeClass = shapes[Math.floor(Math.random() * shapes.length)];
        sparkle.className = `frenzy-blue-sparkle ${shapeClass}`;
        
        // 隨機角度與爆炸擴散距離
        const angle = Math.random() * Math.PI * 2;
        const distance = 30 + Math.random() * 60;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const size = 4 + Math.random() * 6;
        
        sparkle.style.width = `${size}px`;
        sparkle.style.height = `${size}px`;
        sparkle.style.left = `50%`;
        sparkle.style.top = `50%`;
        sparkle.style.setProperty("--tx", `${x}px`);
        sparkle.style.setProperty("--ty", `${y}px`);
        
        // 藍色、青色與白色的霓虹配色
        const colors = ["#00C6FF", "#0072FF", "#00F2FE", "#4FACFE", "#FFFFFF"];
        sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        toast.appendChild(sparkle);
    }
    
    container.appendChild(toast);
    
    // 1 秒後從 DOM 中完全移除，與 CSS 1s 的淡出動畫精準同步
    setTimeout(() => {
        toast.remove();
    }, 1000);
}

// --- 10. 接收事件：更新活躍房間列表 ---
socket.on("update_rooms_list", function(rooms) {
    const roomsList = document.getElementById("available-rooms-list");
    if (!roomsList) return;
    
    roomsList.innerHTML = "";
    
    if (!rooms || rooms.length === 0) {
        roomsList.innerHTML = `
            <div class="room-list-empty">
                <div class="room-list-empty-icon">🚪</div>
                <div>目前沒有活躍的房間，快去建立一個吧！</div>
            </div>
        `;
        return;
    }
    
    rooms.forEach(room => {
        const card = document.createElement("div");
        card.className = "room-card";
        
        // 房間資訊區
        const infoDiv = document.createElement("div");
        infoDiv.className = "room-info";
        
        const titleRow = document.createElement("div");
        titleRow.className = "room-title-row";
        
        const titleText = document.createElement("span");
        titleText.className = "room-title-text";
        titleText.innerText = `房間 ${room.room_id}`;
        titleRow.appendChild(titleText);
        infoDiv.appendChild(titleRow);
        
        const detailsDiv = document.createElement("div");
        detailsDiv.className = "room-details";
        
        const hostSpan = document.createElement("span");
        hostSpan.className = "room-host";
        hostSpan.innerText = `房主: ${room.host}`;
        
        const playersSpan = document.createElement("span");
        playersSpan.className = "room-players-count";
        playersSpan.innerText = `👥 ${room.player_count} / ${room.max_players} 人`;
        
        detailsDiv.appendChild(hostSpan);
        detailsDiv.appendChild(playersSpan);
        infoDiv.appendChild(detailsDiv);
        
        card.appendChild(infoDiv);
        
        // 狀態 Badge 與按鈕區
        const statusContainer = document.createElement("div");
        statusContainer.className = "room-status-container";
        
        const badge = document.createElement("span");
        const btn = document.createElement("button");
        
        if (room.is_playing) {
            badge.className = "room-badge room-badge-playing";
            badge.innerText = "遊戲中";
            
            btn.className = "room-join-btn btn-disabled";
            btn.disabled = true;
            btn.innerText = "遊戲中";
        } else {
            badge.className = "room-badge room-badge-waiting";
            badge.innerText = "尚未開始";
            
            btn.className = "room-join-btn";
            btn.innerText = "加入";
            // 綁定快速加入點擊事件
            btn.onclick = function() {
                const input = document.getElementById("room-id");
                if (input) {
                    input.value = room.room_id;
                    joinGame();
                }
            };
        }
        
        statusContainer.appendChild(badge);
        statusContainer.appendChild(btn);
        card.appendChild(statusContainer);
        
        roomsList.appendChild(card);
    });
});