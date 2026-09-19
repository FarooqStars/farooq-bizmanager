<p align="center"><b>English</b> · <a href="INSTALL.ur.md">اردو</a> · <a href="INSTALL.ar.md">العربية</a></p>

# Installing Farooq BizManager

> 🟢 **Try it first:** https://farooq-bizmanager-demo.vercel.app — press **Try the demo**.

There are three ways. Pick one.

| | Who it is for | Cost | Time |
|---|---|---|---|
| **A. Free cloud** (this page) | Anyone. No programming. | Free | ~20 minutes |
| **B. Your own server** ([separate guide](SELF-HOSTING.md)) | IT people who want the data on their own machine | Your server | ~1–2 hours |
| **C. Developer mode** (end of this page) | Programmers who want to change the code | Free | ~10 minutes |

---

## How it works

Farooq BizManager has two halves:

1. **The screens** — a website that runs in the browser (computer, tablet or phone). **Vercel** puts it on the internet for free.
2. **The server and database** — **[Convex](https://www.convex.dev)**. It stores your data and runs all the accounting rules. Convex is open source; its free cloud is used here.

Sign-in is built in (email and password). No other company is involved.

**Before you start:** never enter a payment card in Convex or Vercel. On the free plans nothing can ever be charged.

---

## A. Free cloud — step by step, with pictures

You need three free accounts: GitHub, Convex and Vercel. Sign in to Convex and Vercel **with your GitHub account** — it keeps everything simple.

The red boxes in the pictures show what to press.

### Step 1 — GitHub: your own copy

1. Create a free account at **https://github.com**.
2. Open **https://github.com/FarooqStars/farooq-bizmanager**.
3. Press **Fork**, then **Create fork**. You now have your own copy.

### Step 2 — Convex: your database

1. Go to **https://www.convex.dev**, sign up, choose **Continue with GitHub** and authorise (it only reads your name and email).
2. Create a project, for example `bizmanager`.
3. Convex first offers a **Development** deployment. Open the green selector at the top and choose **Production** instead. Pick the region closest to you (Europe is closer to the Gulf and Pakistan; US East to the Americas) and press **Create deployment**.

![Production deployment](images/install/01-convex-production.png)

4. Go to **Settings → General** and find **Deploy Keys**. Press the button to create a **production deploy key**.
5. Fill it in like this:
   - **Name:** `vercel`
   - **Expiration:** leave as it is
   - **Permissions:** tick **only** `deployment:deploy` (top left). Do **not** press *Select all*.
   - Press **Create**.

![Deploy key with one permission](images/install/03-convex-deploy-key.png)

6. **Copy the key** into Notepad for the next step. It is the password to your database: never share it, never send a picture of it, never put it on GitHub.

### Step 3 — Vercel: put the website online

1. Go to **https://vercel.com/signup**. Choose **personal projects (Hobby)**, give a name and **Continue with GitHub**.

![Hobby plan](images/install/04-vercel-hobby.png)

2. Press **Add New… → Project**. Vercel asks to be installed on GitHub. Choose **Only select repositories** and pick only your `farooq-bizmanager`. Press **Install**.

![GitHub app, one repository only](images/install/05-github-app.png)

3. Next to `farooq-bizmanager` press **Import**.
4. On the settings page:
   - **Project Name:** this becomes your web address, e.g. `mycompany-books` → `mycompany-books.vercel.app`.
   - Open **Environment Variables** and add **Key** `CONVEX_DEPLOY_KEY`, **Value** = the key from step 2.
   - **Environments:** change it to **Production** only. (Your copy is public; this stops test builds made from other people's suggestions from ever using your key.)
   - Change nothing else — the project already contains the right build settings.
   - Press **Create Project**.

![Name, key, Production only](images/install/06-vercel-env.png)

5. Press **Deploy**. Do **not** press **Add** next to *Convex* under *Optional Integrations* — that would create a second, empty database. You already have yours.

![Deploy — not Add](images/install/07-vercel-deploy.png)

6. Vercel may suggest two-step sign-in (2FA). It is a good idea if you have an authenticator app on your phone; otherwise skip it and add it later.
7. Wait 2–4 minutes until **Congratulations!**

![Congratulations](images/install/08-vercel-success.png)

8. Press **Continue to Dashboard**. Your address is shown under **Domains**. Press **Visit**.

![Your web address](images/install/11-vercel-domains.png)

### Step 4 — Create the owner account

> ⚠️ Do this **straight away**. On a new installation, the first person who opens the website becomes the owner.

1. The website shows **First-time setup**.
2. Enter company name, your name, email and a password (at least 8 characters).
3. Press **Create account and start**. You are the owner.

![First-time setup](screenshots/00-first-time-setup.png)

### Step 5 — First things to do

1. **Company Profile** — choose your country. Currency, tax, date format and fiscal year are filled in.
2. **Accounting → Chart of Accounts** — use the ready-made accounts or add your own.
3. **Users & Roles → Add Team Member** — give each person an email and a starting password.
4. Add products, customers and vendors. Opening balances and opening stock can be entered on each.

Bookmark your website address. That's it.

---

## Optional: sending emails

Without this everything works; only automatic emails (reminders, receipts, low-stock alerts) are not sent.

1. Create a free account at **https://resend.com**, add your domain and create an **API key**.
2. In Convex: your project → **Production → Settings → Environment Variables** → **Add**: Name `RESEND_API_KEY`, Value = your key.

![Where environment variables live](images/install/02-convex-env-vars.png)

## Updating to a new version

1. Open your copy on GitHub. If there is an update you will see **Sync fork** → **Update branch**.
2. Vercel rebuilds the website by itself. Your data is not touched.

## Forgot the owner password

Team members: the owner sets a new password with the key button in **Users & Roles**.

The owner: Convex → your project → **Production → Functions** → **authActions → resetPasswordByEmail**. Press **Unlock Edits** (production asks for it), enter

```
{"email": "you@example.com", "newPassword": "a-new-password"}
```

and press **Run action**.

## Backups

Your data is in Convex. Use **Settings → Backup & Restore** in the Convex dashboard regularly and keep a copy somewhere else. The app's **Data** page can also export tables to CSV.

---

## Running a public demo (like the official one)

Install exactly as above, then:

1. In Convex add the environment variable `DEMO_MODE` = `true` (see the picture in *sending emails*).
2. Convex → **Production → Functions → demoActions → reset**. Press **Unlock Edits**, then **Run action** with `{}`.

![Unlock Edits](images/install/09-convex-unlock.png)

![Demo built](images/install/10-convex-reset-done.png)

3. Open your website. It now shows **Try the demo**:

![Try the demo](images/install/12-demo-sign-in.png)

In demo mode passwords, roles and removing people are locked, every screen shows a "public demo" bar, and everything is wiped and rebuilt every night at 00:00 UTC. Until the first reset has run, the site shows *"The demo is being prepared"* instead of first-time setup, so no visitor can make themselves the owner.

**Never set `DEMO_MODE` on an installation with real data** — the nightly reset deletes everything.

---

## B. Your own server

See the separate guide: **[SELF-HOSTING.md](SELF-HOSTING.md)** — what server you need, domain and HTTPS, backups, updates and security.

---

## C. Developer mode

```bash
git clone https://github.com/FarooqStars/farooq-bizmanager.git
cd farooq-bizmanager
pnpm install
npx convex dev      # creates a development database and keeps it in sync
pnpm dev            # in a second terminal — http://localhost:5173
pnpm test           # 131 tests
```

| Folder | What is inside |
|---|---|
| `convex/` | Server: database schema, all business and accounting rules |
| `convex/lib/ledger.ts` | The posting engine — every journal entry goes through here |
| `convex/authActions.ts` | Built-in sign-in |
| `convex/demoActions.ts` | Public demo reset |
| `convex/__tests__/` | Tests |
| `src/pages/` | One folder per screen |
| `src/locales/` | English, Urdu and Arabic texts |

Rule for contributors: every change that moves money must post a balanced journal entry through `lib/ledger.ts`, respect the posting lock (`enforcePostingDate`), and come with a test that **fails** when the change is removed.
