# DSH 接口與驗證邊界

更新：2026-11-19。對照 [DeepSeek Harness 原始碼](https://github.com/deepseek-ai/deepseek-harness/tree/e8f7b93a344964de3dca1ace9e72b6e4d6de87cb)，並使用 npm 官方 `@deepseek-ai/dsh-*` **0.2.2-rc.1** 套件完成 runtime 整合測試。沒有登入或存取使用者聊天帳號。

## 接入契約

- package 的 `dsh.bundle.patch` 指向 Cordis patch，註冊本 package。
- runtime 提供 `dsh-tools.defineTool`、`dsh-llm.createUserMessage`；插件宣告注入 `agents`、`sessions`、`tools`。
- `session/event(session,event)` 通知已提交事件；`event.seq` 是序號、`event.time` 是毫秒時間戳，`session.id` 用於 scope 映射。
- user 訊息位於 `event.data`；assistant 訊息位於 `event.data.message`。工具結果同樣使用 `data.message`，透過 `source.callId` 關聯先前的 `tool/call`。
- 工具結果只擷取本次插件執行期間看過的非記憶工具呼叫；不靠文字是否包含 `sleep_` 判定，不重複存入記憶工具回傳值。
- `agent/pre-step` 先等待 `next()`，保留下游 reject、messages 與 flags。工具對目前 agent 可見時才注入回憶；直到回憶訊息實際提交，才更新去重狀態。
- 使用可信的 `agent.id` 選 scope，不接受模型指定另一個 scope。回憶失敗時繼續一般對話；失敗計數在 `sleep_status` 的 health 中可見。
- 卸載清除計時器、取消模型請求，禁止整理完成後再寫入；每個 scope 的整理錯誤不阻止其他 scope。

來源路徑：`packages/core/session/src/known-event-types.ts`、`packages/core/agent-loop/src/index.ts`、`packages/llm/llm/src`、`packages/core/tools/src`、`packages/core/tool-executor-native/src` 與 `docs/user/develop/basic/publish.md`。如上游目錄移動，請以固定 commit 為準。

## 已驗證與未驗證

| 層 | 方法 | 可推論的範圍 |
| --- | --- | --- |
| SQLite 核心 | Node 整合測試 | 原文與已審核摘要搜尋、刪除、分頁、scope、schema 1→2 與交易行為 |
| API client | 假 HTTP 回應與取消訊號 | 格式、錯誤、輸出上限、來源驗證及取消傳遞 |
| DSH adapter | 模擬 hook 與錯誤注入 | 儲存失敗、重試、可見性、設定邊界及卸載期間的寫入保護 |
| 官方 DSH runtime | `npm run test:dsh`，腳本模型 | 真實 agent loop、session 事件、native 工具執行、重新載入後跨 session 回憶、scope 隔離與工具卸載 |
| DSH 自動壓縮 | `npm run test:compaction`，官方 token meter 與 basic compaction，腳本模型 | 同一個 agent 在壓力門檻觸發壓縮、取得摘要後，仍能透過記憶讀回摘要遺漏的原始代號與事件 ID |
| 官方 CLI profile | DSH 0.2.2-rc.1 的隔離 profile、link 安裝與啟動 | 公開插件入口載入後，agent 可用 sleep_status |
| 桌面 / 真實大肥魚帳號 | 尚未執行 | 帳號環境需自行驗收 |
| 本地模型 | llama.cpp b6000、Qwen2.5-0.5B-Instruct Q4_K_M，verify --model | 用合成回憶答對隨機六位數代號；雲端供應商與摘要品質需另外評估 |

整合測試使用實際的 Cordis、LlmRuntime、SessionStore、AgentLoop、ToolRuntime 與 NativeToolExecutor；模型只產生預定文字及工具呼叫。這能發現真實事件欄位或工具 DSL 不相容，無法評估模型是否懂得使用記憶。測試會重新建立 runtime，保留同一份記憶存放區，確認新 session 能取回舊來源；SQLite 檔案重開與遷移另由核心測試涵蓋。

beta.1 在 Linux 實測了安裝後的公開插件入口。官方 DSH CLI 0.2.2-rc.1 將安裝目錄以 `link:` 加入隔離的 profile。測試驅動器建立兩個對應同一個新 scope 的 session，兩次獨立啟動 DSH。第一次送入合成的專案名稱和隨機六位數，第二次只問專案代號。官方 pi-ai adapter 透過本機 llama.cpp b6000（Qwen2.5-0.5B-Instruct Q4_K_M）取得正確答案。這次單題實驗停用了無關工具以適應小模型，記憶模式為本機摘錄。早期測試中該模型曾漏抄英數混合碼；檢索命中與最終回答正確率須分別評估。使用者可在自己的兩個私人 session 重複這個流程，或用 `verify --model` 個別檢查端點。

## 套件與診斷

核心 CLI 需要 Node 24.0+，不需要 npm runtime 相依套件。官方 DSH 0.2.2-rc.1 需要 **Node 24.9+**；建議使用最新 Node 24 LTS。

DSH peer 範圍為 optional `^0.2.2-rc.1`；開發相依與 lockfile 固定為已測試版本。範圍內其他版本仍須自行驗證，不能視為保證。DSH host 會解析 linked plugin 的 peer modules，CLI 不必為此強制安裝整個 DSH 生態。

- `doctor`：SQLite、設定、是否啟用與映射；不呼叫端點。
- `doctor --dsh`：另外載入可見的兩個 DSH 模組，驗證工具 schema 與 user message 工廠；不等於完整 agent loop 測試。
- 獨立終端看不到 host 專用 peer 時，`doctor --dsh` 以非零狀態結束並提供原因；應在實際 profile 確認載入，不代表插件在 host 內必定不可用。
- 開發者可 `npm ci --ignore-scripts && npm run test:dsh` 執行官方 runtime 測試。CI 對 Windows、macOS、Linux 分別執行；最新結果見 [Actions](https://github.com/Axiang1211/DSH_Sleep_skills/actions)。

## 行為限制

- 同一 scope 的資料互通；session 映射不等於聯絡人或聊天頻道隔離。
- 只處理啟用後的新文字事件，不回填舊記憶。
- 自動回憶搜尋原文與已接受摘要的詞彙，仍可能漏掉改述；代理可用 `sleep_search` 補查。
- 保留 DSH 原生 compaction、system prompt、工具權限與登入機制。
- 背景每輪每個 scope 最多一批。SQLite 同步存取在大量訊息下可能阻塞 event loop；尚無背景 worker。
- alpha.2 首次開啟升級至 schema 2；降回 alpha.1 需還原升級前備份，操作見 README。
