# DSH 接口與驗證邊界

查閱日期：2026-11-13。依據 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的公開原始碼（查閱 HEAD：`e8f7b93a344964de3dca1ace9e72b6e4d6de87cb`）設計，沒有存取使用者聊天帳號。

目前 adapter 假設：

- package 的 `dsh.bundle.patch` 指向 Cordis patch，註冊本 package。
- runtime 提供 `@deepseek-ai/dsh-tools` 的 `defineTool`，以及 `@deepseek-ai/dsh-llm` 的 `createUserMessage`。
- 插件可以注入 `agents`、`sessions`、`tools`，透過 `ctx.tools.register()` 註冊工具。
- `session/event(session,event)` 是已提交事件的同步通知；`event.seq` 為數字，`session.id` 可作映射 key。
- `agent/pre-step` 是 waterfall；必須先呼叫 `next()`、保留 reject 與下游 messages / flags。只有工具對此 agent 可見才注入回憶。
- 使用 `agent.id` 選 scope，不接受模型提供其他 scope。`session/disposed` 清快取；`ctx.effect` 清除計時器與 SQLite 連線。

參考路徑（upstream 可能調整）：

- `packages/skill/tool-skill/src/index.ts`：工具定義、可見性與 context message。
- DSH 的 session event 型別、agent/pre-step hook 與 plugin bundle 文件。

## 已驗證與未驗證

| 層 | 方法 | 可推論的範圍 |
| --- | --- | --- |
| SQLite 核心 | Node 整合測試 | 去重、刪除、分頁、scope 與交易行為 |
| API client | 假 HTTP 回應 | 格式、錯誤、輸出上限與來源驗證 |
| DSH adapter | 模擬 ctx / events / hooks | 自己的接入邏輯符合已查閱的接口形狀 |
| DSH 真實 runtime | 尚未執行 | 不能宣稱端到端相容 |
| 本地模型／雲端供應商 | 尚未呼叫 | 不能宣稱摘要品質或模型相容性 |

peer dependencies 暫時標成 optional `*`，只是避免核心 CLI 強制安裝整個 DSH 生態，**不是所有版本都相容**。npm 上發行的版本與 upstream 主分支可能不同。正式適配應鎖定已驗證的版本／commit，再縮小 peer 範圍。安裝成功但缺 peer module 時，CLI 仍可用，DSH adapter 需先解決 host 依賴。

## 行為限制

- 同一 scope 的資料預設互通；是否可共用是運維配置決策，不由模型猜測。
- 只處理新文字事件；沒有以 deprecated session snapshot API 回填舊記憶。
- 自動回憶是詞彙檢索，可能找不到改述或注入不足；代理可呼叫 `sleep_search` 補查。
- 不替換 DSH compaction、system prompt、工具權限或登入機制。
- 背景每輪最多一批；不是持續訓練服務。DB 同步寫入在大量訊息下可能阻塞 event loop，正式多使用者服務需改為隊列與背景 worker。
