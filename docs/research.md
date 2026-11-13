# SLEEP 研究對照

來源：Behrouz、Hashemi、Javanmard、Mirrokni，*Language Models Need Sleep: Learning to Self-Modify and Consolidate Memories*，[arXiv:2606.03979](https://arxiv.org/abs/2606.03979)，以及 [Google Research 介紹](https://research.google/blog/the-sleep-framework-a-new-way-for-llms-to-retain-knowledge-in-continual-learning/)。查閱日期：2026-11-13。

論文的核心是週期性將短期資訊轉移至長期模型參數，並在另一階段透過合成資料進行 Dreaming。它包含參數容量擴充／啟用與蒸餾、模仿學習等訓練程序。一般推理 API 的 Skills 無法直接改變服務商模型權重；能在外部儲存與檢索資訊，不代表已重現論文。

| 研究概念 | 本專案目前的工程對應 | 差異 |
| --- | --- | --- |
| Wake | DSH 已提交的文字事件進 SQLite | 不是模型快速權重更新 |
| Consolidation | 背景批次建立摘錄或待審核摘要 | 存在外部 DB，沒有蒸餾進權重 |
| 長期記憶 | 原始事件、索引、引用與已接受摘要 | 推理時仍需檢索並放進有限上下文 |
| Dreaming | 未實作 | 不把虛構經歷寫成真實事件 |
| 長上下文評測 | 合成資料庫檢索 benchmark | 不等同論文評測與原生窗口擴大 |

## 為什麼先做外部記憶

它可以共用於本地推理與遠端 API，不要求訓練權限；資料可逐筆檢查、更正、忘記。對需要持續運作的個人代理，先保留正確來源與隔離邊界，才能評估長期使用是否變好。

## 後續版本與驗收條件

1. **DSH 實機適配**：鎖定 upstream commit 與可安裝依賴；跑完整記錄、壓縮、跨 session 查回、reload / disposal；增加按聯絡人與頻道的可信路由。通過後才宣稱支援對應的大肥魚版本。
2. **檢索品質**：混合詞彙／向量檢索與重排序；測試改述、中文別名、時間更新、多來源衝突、未知問題與拒答；用固定 tokenizer 報告 token 數。
3. **自動整理**：加入有評測支持的摘要品質門檻、成本上限與可取消工作。不能單靠另一個 LLM 說「正確」就視為真實。
4. **研究訓練版**：獨立實驗分支、相容的可訓練模型、可回復的 adapter、來源授權、保留集與遺忘評測；驗證後才考慮 LoRA 或 MoE。現有摘要器不是這一版的替代品。

建議主要指標：來源召回率、回答證據一致性、錯誤記憶率、跨 scope 洩漏、遺忘後殘留、延遲與整理成本。磁碟能存很大不代表這些指標自然提高。
