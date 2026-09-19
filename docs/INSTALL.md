<p align="center"><b>English</b> · <a href="INSTALL.ur.md">اردو</a> · <a href="INSTALL.ar.md">العربية</a></p>

# Installing Farooq BizManager

There are three ways. Pick one.

| | Who it is for | Cost | Time |
|---|---|---|---|
| **A. Free cloud** | Anyone. No programming. | Free | ~20 minutes |
| **B. Your own server** | IT people who want the data on their own machine | Free (your hardware) | ~1 hour |
| **C. Developer mode** | Programmers who want to change the code | Free | ~10 minutes |

---

## How it works

Farooq BizManager has two halves:

1. **The screens** — a website that runs in the browser (Chrome, Edge, Safari, Firefox; computer, tablet or phone).
2. **The server and database** — [Convex](https://www.convex.dev). It stores your data and runs all the accounting rules. Convex is open source: you can use their free cloud (way A) or run it yourself (way B).

Sign-in is built in (email and password). No other company is involved.

---

## A. Free cloud — step by step

You need three free accounts. Use the same email for all three to keep things simple.

### Step 1 — GitHub (where the code lives)

1. Go to **https://github.com** and click **Sign up**. Create a free account.
2. Open **https://github.com/FarooqStars/farooq-bizmanager**.
3. Click **Fork** (top right), then **Create fork**.
   You now have your own copy of the software.

### Step 2 — Convex (your database)

1. Go to **https://www.convex.dev** and click **Start building** / **Sign up**. Choose **Continue with GitHub**.
2. Click **Create a project**. Name it, for example, `bizmanager`.
3. Open the project. Choose the **Production** deployment.
4. Go to **Settings → Deploy keys** (the exact wording may differ slightly) and click **Generate production deploy key**.
5. **Copy the key** and keep it somewhere safe. It is like a password to your database — never share it or put it on GitHub.

### Step 3 — Vercel (puts the website online)

1. Go to **https://vercel.com** and sign up with **Continue with GitHub** (the free **Hobby** plan is enough).
2. Click **Add New… → Project**.
3. Find **farooq-bizmanager** in the list and click **Import**.
4. Open **Environment Variables** and add one:
   - Name: `CONVEX_DEPLOY_KEY`
   - Value: the key you copied in step 2
5. Leave everything else as it is (the project already contains the right build settings) and click **Deploy**.
6. Wait 2–4 minutes. When you see **Congratulations**, click the picture of your site to open it.

### Step 4 — Create the owner account

> ⚠️ Do this **straight away**. On a new installation, the first person who opens the website becomes the owner.

1. The website shows **First-time setup**.
2. Enter your company name, your name, your email and a password (at least 8 characters).
3. Click **Create account and start**. You are now the owner and you are on the dashboard.

### Step 5 — First things to do

1. **Company Profile** — choose your country. Currency, tax, date format and fiscal year are filled in for you.
2. **Accounting → Chart of Accounts** — use the ready-made accounts or add your own.
3. **Users & Roles → Add Team Member** — give each person an email and a starting password. They sign in on the same website.
4. Add your products, customers and vendors. Opening balances and opening stock can be entered on each of them.

That's it. Bookmark your website address.

---

## Optional: sending emails

Without this, everything works — only automatic emails (payment reminders, receipts, low-stock alerts) are not sent.

1. Create a free account at **https://resend.com** and add your domain (they show you how).
2. Create an **API key**.
3. In the Convex dashboard: your project → **Production → Settings → Environment Variables** → add
   - Name: `RESEND_API_KEY`
   - Value: your key

## Updating to a new version

1. Open your copy on GitHub (`github.com/<your-name>/farooq-bizmanager`).
2. If there are updates, you will see **Sync fork**. Click it, then **Update branch**.
3. Vercel rebuilds the website by itself within a few minutes. Your data is not touched.

## Forgot the owner password

Team members: the owner sets a new password with the key button in **Users & Roles**.

The owner:
1. Open the Convex dashboard → your project → **Production → Functions**.
2. Find **authActions → resetPasswordByEmail** and click **Run**.
3. Enter `{"email": "you@example.com", "newPassword": "a-new-password"}` and run it.
4. Sign in with the new password.

## Backups

Your data is in Convex. Use the backup and export options in the Convex dashboard (see **https://docs.convex.dev**, "Backup & Restore") and keep a copy regularly. The app's **Data** page can also export tables to CSV.

---

## B. Your own server (for IT people)

Run the Convex backend yourself and serve the website from any web server.

1. Set up a self-hosted Convex backend by following the official guide:
   **https://github.com/get-convex/convex-backend/tree/main/self-hosted**
   (Docker is the usual way.) Note the backend URL (for example `http://your-server:3210`) and generate an **admin key** as the guide explains.
2. On a machine with Node.js 20+ and pnpm:
   ```bash
   git clone https://github.com/FarooqStars/farooq-bizmanager.git
   cd farooq-bizmanager
   pnpm install
   ```
3. Create `.env.local`:
   ```
   CONVEX_SELF_HOSTED_URL=http://your-server:3210
   CONVEX_SELF_HOSTED_ADMIN_KEY=<your admin key>
   VITE_CONVEX_URL=http://your-server:3210
   ```
4. Send the server code to your backend, then build the website:
   ```bash
   npx convex deploy
   pnpm build
   ```
5. Serve the `dist` folder with any web server (nginx, Caddy, IIS…). All unknown paths must fall back to `index.html`.
6. Open the website and complete **First-time setup** (step 4 of way A).

For email, set `RESEND_API_KEY` on the backend:
```bash
npx convex env set RESEND_API_KEY <your key>
```

This path was tested with the self-hosted Convex backend on Linux.

---

## C. Developer mode

```bash
git clone https://github.com/FarooqStars/farooq-bizmanager.git
cd farooq-bizmanager
pnpm install
npx convex dev      # creates a development database and keeps it in sync
pnpm dev            # in a second terminal — opens the site on http://localhost:5173
pnpm test           # 128 tests
```

Where things are:

| Folder | What is inside |
|---|---|
| `convex/` | Server: database schema, all business and accounting rules |
| `convex/lib/ledger.ts` | The posting engine — every journal entry goes through here |
| `convex/authActions.ts` | Built-in sign-in |
| `convex/__tests__/` | Tests |
| `src/pages/` | One folder per screen |
| `src/locales/` | English, Urdu and Arabic texts |

Rule of thumb for contributors: every change that moves money must post a balanced journal entry through `lib/ledger.ts`, respect the posting lock (`enforcePostingDate`), and come with a test that **fails** when the change is removed.
