# 部署與新電腦安裝流程

## A. 必要帳號

- GitHub
- Vercel
- Supabase
- OpenAI Platform

## B. 安裝軟體

- Git
- Node.js：建議使用 LTS 版本。此機目前實測 `v24.18.0`
- npm：此機目前實測 `11.16.0`
- VS Code

建議 VS Code 擴充套件：

- ESLint
- Tailwind CSS IntelliSense
- GitLens
- Prettier，可選

## C. 從 GitHub 下載專案

```bash
git clone <REPOSITORY_URL>
cd rotary-os/app
npm install
npm run dev
```

目前 Next.js 專案位於 repository 的 `app/` 目錄，因此 `cd rotary-os/app` 是必要步驟。

## D. 建立本機環境變數

複製 `.env.example` 為 `.env.local`：

```bash
cp .env.example .env.local
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env.local
```

填入：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
```

不要把真實值寫進文件或 commit。

## E. 本機驗證

```bash
npm run lint
npm run build
npm run dev
```

## F. Git 流程

```bash
git status
git add .
git commit -m "描述本次修改"
git push
```

Codex 工作規則：除非 Jane 明確要求，不自行 commit。

## G. Vercel 部署

- Root Directory：`app`
- Install Command：`npm install`
- Build Command：`npm run build`
- Environment Variables：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `OPENAI_API_KEY`

重新部署：Vercel Dashboard → Project → Deployments → Redeploy。

## H. 換電腦後驗收清單

- `/` 首頁可開啟
- `/calendar` 年度行事曆可讀資料
- `/events` 活動可讀寫
- `/programs` 程序表可預覽與列印
- `/members` 社友可搜尋
- `/dues` 社費可讀取與匯出 JPG
- `/donations` 捐獻計畫可讀寫
- `/donate` 公開登記可送出
- `/accounting` 會計收支與年度預算可讀寫
- `/assistant` Jade AI 可顯示；若沒有 `OPENAI_API_KEY`，會顯示未設定
