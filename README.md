# DSH Sleep Skills

## 《重生之上一世我讓大肥魚在百萬上下文後失憶了》

**我重生了。**

上一世，我親手養大了一條大肥魚。

我教牠認識我，陪牠讀文件、寫程式，把每一次決定、每一個習慣，都一點一點告訴牠。我以為，百萬上下文，足夠裝下我們的全部。

直到那一天，對話越過了記憶的邊界。

牠看著我，禮貌地問：

> 「你好，請問有什麼可以幫你的？」

我愣在螢幕前。那些熬夜改過的需求、反覆確認的約定，還有那句「這個你一定要記住」，彷彿從來沒有存在過。

再睜眼，我竟回到了上下文即將滿載的前一刻。

這一世，我要拿回那些被遺忘的對話、被壓縮掉的細節，還有那條曾經認識我的大肥魚。

我打開終端，敲下了第一行命令。

**DSH Sleep Skills。這一次，失去的記憶，我要一筆一筆查回來。**

故事從這裡開始，實作從外部記憶開始：保存對話來源、按需檢索，在 Sleep 階段整理成可追溯的記憶，讓 AI 在對話壓縮後仍有機會找回過去的經歷。

給 DeepSeek Harness（DSH）與個人代理使用的持久記憶預覽版。採 MIT 授權，可下載、自行安裝與修改。核心不需要 npm 相依套件或 API Key。

> **v0.1.0-alpha.1：研究預覽版。** 這是受 SLEEP 啟發的外部記憶系統，不是論文的權重訓練實作，也不會把模型的原生上下文窗口改成無限大。DSH 接口有模擬合約測試，尚未在真實「大肥魚」帳號或 DSH runtime 完成端到端驗證。

## 下載與安裝

1. 安裝 [Node.js 24 LTS](https://nodejs.org/)（最低 24.0）。目前沒有內含 Node 的 exe / dmg。
2. 從 [Releases](https://github.com/Axiang1211/DSH_Sleep_skills/releases) 下載版本 ZIP，或直接下載 [main 原始碼 ZIP](https://github.com/Axiang1211/DSH_Sleep_skills/archive/refs/heads/main.zip)，解壓縮。
3. Windows 雙擊 `Install.cmd`。macOS / Linux 在解壓縮目錄執行：

   ```sh
   node bin/install.mjs
   ```

   macOS 也提供 `Install.command`；若下載權限不允許雙擊，使用上面的命令。

安裝器會安裝到 `~/.dsh-sleep/app`，把 skill 放到 `$DSH_HOME/skills/sleep-memory`（未設變數時為 `~/.dsh/skills/sleep-memory`）。它保留既有資料庫與設定，不替你更改 DSH 帳號或啟用網路傳輸。預設 `enabled: false`。

**安裝完成 ≠ 已接上 DSH。** 完成下方「接入 DSH」後才會自動記錄新訊息。只想試用時，可直接在原始碼目錄執行以下示範。

## 兩分鐘離線示範

```sh
node bin/sleep.mjs init
node bin/sleep.mjs ingest demo examples/events.jsonl
node bin/sleep.mjs search demo "Aurora 發佈色"
node bin/sleep.mjs sleep demo
node bin/sleep.mjs context demo "月光蜜瓜"
node bin/sleep.mjs status demo
```

這會匯入明確標示的測試資料，建立 SQLite 記憶，再產生附來源的摘錄。使用 `read demo e_...` 查完整原文；ID 來自搜尋結果。安裝後，將 `bin/sleep.mjs` 換成安裝器輸出的絕對路徑即可。不會修改目前模型、購買服務或發送任何聊天訊息。

## 目前提供的版本

| 形式 | 目前狀態 | 用途 |
| --- | --- | --- |
| 核心 / CLI | 可執行，有自動測試 | 本地存檔、中文與英文關鍵字搜尋、引用、忘記資料 |
| Skills Lite | 附帶 skill 與唯讀 helper | 讓支援 Skills 且能執行本地命令的代理按流程查記憶；不會單靠 markdown 自動擷取對話 |
| DSH 插件 | 接口預覽，實機待驗證 | 指定 session 的新訊息存檔、回答前回憶、背景 Sleep |
| API 模型整理 | 已實作，端點用 mock 測試 | 呼叫相容 Chat Completions 的端點產生待審核摘要 |
| 本地模型整理 | 與 API 共用協定，實機待驗證 | 連到本機推理伺服器，不要求模型權重可訓練 |
| 權重訓練研究版 | **未實作** | 未來評估 LoRA / MoE 與遺忘測試；不宣稱重現論文 |

## 接入 DSH（實驗性）

先確認你使用的 DSH 版本支援第三方 bundle / Cordis 插件。接口會隨 DSH 變更，詳見 [相容性與來源](docs/compatibility.md)。

1. 使用安裝器輸出的命令，將套件註冊到實際使用的 profile。例如：

   ```sh
   dsh plugin --profile desktop add "link:/你的完整路徑/.dsh-sleep/app"
   ```

   `desktop` 只是範例；換成實際 profile。這一步需 DSH 主程式已安裝，且可解析 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm`。若出現模組找不到或 hook 不相容，先停用插件，不要停用 DSH 的原生壓縮。

2. 編輯 `~/.dsh-sleep/config.json`，用**實際 session ID**建立明確映射：

   ```json
   {
     "enabled": true,
     "sessionScopes": { "your-private-session-id": "owner-personal" },
     "mode": "extractive",
     "captureToolResults": false,
     "recallBytes": 12000,
     "sleepIntervalSeconds": 300,
     "sleepAfterEvents": 100
   }
   ```

3. 重新載入 DSH profile，確認 `sleep_search`、`sleep_read`、`sleep_status` 工具出現。用不含個資的測試訊息驗證 `status owner-personal` 數量增加、換一個映射到同 scope 的測試 session 能找到原始來源。未映射的 session 不記錄、不可透過這些工具查詢。

**大肥魚場景的重要限制：** 此版的隔離單位是 session → scope，不是聯絡人。如果微信、Discord、B 站等所有人共用同一個 whale session，插件無法憑空分辨收件人權限。先用只有你的小號／私人測試 session；公開或多人回覆須先加入可靠的聯絡人／頻道隔離適配器。不要把私人記憶 scope 掛到會替陌生人回覆的共用 session。

只記錄安裝並啟用後的純文字 user / assistant 事件。預設不擷取工具結果；不回填 DSH 舊日誌，不存圖片、音訊或隱藏推理。現有資料用 JSONL 明確匯入。

## API / 本地模型整理

預設 `extractive` 只建立原文摘錄，沒有模型費用。若需要摘要，參考：

- [本機端點設定](examples/config.local-model.json)：改成實際 `baseUrl`、已載入的 `model`，保留你的 session 映射。
- [遠端 API 設定](examples/config.api.json)：HTTPS、`allowRemote: true`，並透過環境變數 `DSH_SLEEP_API_KEY`提供金鑰。不要把金鑰填進設定或提交到 Git。

`mode: "model"` 會把每批選中的歷史文字送到該端點；設定為遠端代表資料會離開本機，可能產生費用。只實作 `/chat/completions` 文字協定，尚未認證特定供應商或本地模型。

```sh
node bin/sleep.mjs sleep owner-personal
node bin/sleep.mjs memories owner-personal candidate
node bin/sleep.mjs review owner-personal m_實際ID accept
```

檢查摘要與 quote 是否相符後才接受；用 `reject` 拒絕。精確引文只能證明文字存在，不能證明摘要正確。候選摘要不會被注入回答。原始資料始終可搜尋，模型失敗不會刪除來源。每次 `sleep` 最多處理 20 筆、約 96 KB 序列化來源；被模型略過的事件保留待整理。背景排程在 DSH 執行期間每次最多一批，低於門檻的尾批可手動處理。

## 記憶管理

所有 CLI 用法：`node bin/sleep.mjs help`。`DSH_SLEEP_HOME` 指定資料目錄，`DSH_SLEEP_CONFIG` 指定設定檔；同一組變數需提供給 CLI 與 DSH。資料預設保存在 `~/.dsh-sleep/memory.sqlite`，不是上傳到此 GitHub repo。

- 每筆匯入需有穩定且不重複的 `sourceKey`、`source`、`text`；同 key 同內容可安全重跑，不同內容需新 key。
- `read` 用 `nextOffset` 分頁，單位是 Unicode 字元，不是 tokens。
- `forget <scope> <event-id>` 同時移除本庫的原文可查內容、索引與衍生摘要，保留不可查的去重 tombstone。同 key 重匯入不會復活它。
- 刪除不會抹除 DSH 原始日誌、已注入上下文、磁碟快照或外部備份；不是磁碟鑑識等級安全抹除。資料庫未加密，依賴你的 OS 帳號／磁碟保護。
- `scope` 是應用層的查詢隔離，不能抵擋已能執行任意 shell、讀檔的代理。共用不受信任主機需另做 OS / 容器隔離。

更新：關閉使用此插件的 DSH profile，從新解壓縮目錄重跑安裝器；設定和 DB 保留。移除：先用你的 DSH 版本提供的插件管理命令移除 bundle，再刪除此專案擁有的 skill 與 `~/.dsh-sleep/app`。是否刪除 `memory.sqlite` 與設定由你決定。

## 原理與限制

記錄原始事件 → 中文／英文詞彙索引 → 按需查回 → 固定大小的上下文證據區塊。Sleep 另外建立有來源的摘要／摘錄，模型摘要經人工接受後可隨匹配來源附帶回憶。

這解決「歷史超出目前窗口後仍有地方找」，不保證每次都找到，也不讓模型一次推理整個資料庫。此版尚無向量檢索、重排序、跨來源自動衝突解決、tokenizer 精算、訓練或 Dreaming。回憶大小以 **UTF-8 bytes** 限制，保留 DSH 原生 token 計量與壓縮。摘要搜尋仍依賴原始事件的詞彙命中。

論文研究的是模型參數內的記憶鞏固與 Dreaming；本專案是工程上的外部記憶改編。閱讀 [研究對照與後續路線](docs/research.md)。

## 開發與驗證

```sh
npm test
npm run benchmark
python3 scripts/bundle.py
```

測試不需要 DSH、聊天帳號或 API 金鑰。Benchmark 使用合成資料，回報位元組、空白分隔詞數及來源命中；**不是論文的 BABILong、不是經模型 tokenizer 驗證的百萬 token 評測，也不是模型回答正確率**。跨平台 CI 與 tag release workflow 已提供；實際通過結果以 Actions 為準。

程式授權：[MIT](LICENSE)。研究引用：[Google Research](https://research.google/blog/the-sleep-framework-a-new-way-for-llms-to-retain-knowledge-in-continual-learning/) · [Language Models Need Sleep](https://arxiv.org/abs/2606.03979) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。本專案與 Google / DeepSeek 無官方隸屬關係。
