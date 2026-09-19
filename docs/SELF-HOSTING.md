<p align="center"><b>English</b> · <a href="SELF-HOSTING.ur.md">اردو</a> · <a href="SELF-HOSTING.ar.md">العربية</a></p>

# Running Farooq BizManager on your own server

This guide is for IT people who want the data on a machine they control — an office
server, a home server, or a rented virtual server (VPS). If you just want it running,
the [free cloud way](INSTALL.md) is much easier.

> **Be honest with yourself first.** On your own server *you* are the operator:
> security updates, backups, disk space and uptime are your job. Accounting data is
> valuable — if the server dies and there is no backup, the books are gone.

---

## 1. What runs where

```
 Browser (staff, phone, PC)
        │  https://app.example.com         ← the website (static files)
        │  https://api.example.com         ← Convex backend, port 3210
        │  https://site.example.com        ← Convex HTTP actions, port 3211
        ▼
 ┌──────────────────────── your server ────────────────────────┐
 │  Caddy (HTTPS + serves the website files)                    │
 │  Convex backend  (Docker)  ── database (SQLite or Postgres)  │
 │  Convex dashboard (Docker, private — never on the internet)  │
 └──────────────────────────────────────────────────────────────┘
```

- **Website:** plain files (`dist/`) after a build. Any web server can serve them.
- **Convex backend:** open-source server that stores the data and runs every accounting rule. Official Docker images.
- **Sign-in:** built into the app. It needs the backend to reach its own `site` address (to read `/.well-known/jwks.json`), so that address must work *from the server itself* too.

## 2. What you need

| Item | Minimum | Comfortable |
|---|---|---|
| Server | Linux (Ubuntu 22.04/24.04), 2 CPU, 4 GB RAM | 4 CPU, 8 GB RAM |
| Disk | 40 GB SSD | 100 GB SSD + a separate backup disk |
| Software | Docker + Docker Compose | + Caddy as reverse proxy |
| Build machine | Node.js 20+ and pnpm (can be the server itself) | |
| Domain | one domain with 3 sub-domains (app, api, site) | |
| Backup place | a second location: another disk, NAS, or cloud storage | two places, one off-site |

Rough running costs: a small VPS is typically a few dollars to about 20 US dollars a
month, a domain roughly 10–15 dollars a year (prices vary by provider and country).
An office or home server costs only electricity, but then power cuts, internet
outages and hardware failures are your responsibility.

## 3. Install, step by step

### 3.1 Prepare the server
1. Install Ubuntu, create a normal user with `sudo`, turn on automatic security updates.
2. Firewall: allow only **22** (SSH), **80** and **443**. Nothing else from outside.
3. Install Docker and Docker Compose.

### 3.2 Start the Convex backend
Follow the official self-hosting guide — it has the current `docker-compose.yml`:
**https://github.com/get-convex/convex-backend/tree/main/self-hosted**

The important settings in that file:
- `CONVEX_CLOUD_ORIGIN` = `https://api.example.com` (public address of port 3210)
- `CONVEX_SITE_ORIGIN` = `https://site.example.com` (public address of port 3211)
- keep the data volume on a disk you back up

Start it, then create the **admin key** as the guide explains. The admin key is
the master key of your data — store it in a password manager, never in a file in the repo.

Keep the **dashboard** private: bind it to `localhost` and reach it through an SSH
tunnel or a VPN (for example Tailscale), never open it to the internet.

### 3.3 Domain and HTTPS
Point `app`, `api` and `site` at your server's IP. With Caddy, HTTPS certificates are
automatic. Example `Caddyfile`:

```
app.example.com {
    root * /srv/bizmanager/dist
    try_files {path} /index.html
    file_server
}
api.example.com {
    reverse_proxy localhost:3210
}
site.example.com {
    reverse_proxy localhost:3211
}
```

`try_files … /index.html` is required: the app's pages are browser routes and must all fall back to `index.html`.

### 3.4 Send the app to your backend and build the website
On the build machine:

```bash
git clone https://github.com/FarooqStars/farooq-bizmanager.git
cd farooq-bizmanager
pnpm install
```

Create `.env.local` (this file is ignored by git — it never goes to GitHub):

```
CONVEX_SELF_HOSTED_URL=https://api.example.com
CONVEX_SELF_HOSTED_ADMIN_KEY=<your admin key>
VITE_CONVEX_URL=https://api.example.com
```

Then:

```bash
npx convex deploy     # sends the server code and database schema
pnpm build            # makes the website in dist/
```

Copy `dist/` to `/srv/bizmanager/dist` on the server.

### 3.5 First-time setup
Open `https://app.example.com` **straight away** and create the owner account —
the first person to open a new installation becomes the owner.

### 3.6 Email (optional)
```bash
npx convex env set RESEND_API_KEY <your key>
```

## 4. Backups — the most important part

Follow the **3-2-1 rule**: **3** copies of the data, on **2** different kinds of storage,
**1** of them in another place (off-site).

1. **Daily export** of all data to a zip (run on the build machine or the server, from the project folder with `.env.local`):
   ```bash
   npx convex export --path /backups/bizmanager-$(date +%F).zip
   ```
   Schedule it with cron, for example every night at 02:00:
   ```
   0 2 * * *  cd /srv/bizmanager-src && npx convex export --path /backups/bizmanager-$(date +\%F).zip
   ```
2. **Keep** daily copies for 14 days, weekly for 3 months, monthly for a year.
3. **Copy off-site** every night (another building, a NAS, or cloud storage — e.g. with `rclone`).
4. **Encrypt** off-site copies — they contain your customers, salaries and bank data.
5. **Test a restore** every month on a spare machine or a test backend. A backup you have never restored is only a hope:
   ```bash
   npx convex import --replace-all /backups/bizmanager-YYYY-MM-DD.zip   # ONLY on a test backend
   ```
6. Before every update: take an extra export.

Check the official Convex documentation for the current export/import options:
**https://docs.convex.dev**

## 5. Updates

**App update** (new version of Farooq BizManager):
```bash
npx convex export --path /backups/before-update-$(date +%F).zip
git pull
pnpm install
pnpm test            # all tests must pass
npx convex deploy
pnpm build           # then copy dist/ to the server again
```

**Backend update** (new Convex images): take an export first, then follow the
official guide (`docker compose pull` and restart). Read their release notes.

**Server:** keep automatic security updates on; reboot in a quiet hour when the kernel is updated.

## 6. Security checklist

- [ ] Only ports 80, 443 and SSH open; SSH with keys, password login off
- [ ] Dashboard reachable only via SSH tunnel or VPN
- [ ] Admin key in a password manager, not in any shared file or chat
- [ ] `.env.local` never committed (it is in `.gitignore`)
- [ ] HTTPS on all three addresses
- [ ] Owner account created immediately after installation
- [ ] Team members use their own accounts; people who leave are switched off at once
- [ ] Never set `DEMO_MODE` on a server with real data — its nightly reset deletes everything

## 7. Monitoring

- An uptime check on `https://app.example.com` (many free services exist) that emails you when it is down.
- A weekly look at free disk space (`df -h`) — a full disk stops the database.
- In the app: **Reports → Reconciliation Panel** — if a check turns red, investigate before closing the month.

## 8. What was tested

The app was tested with the self-hosted Convex backend on Linux: deploy, sign-in
(including the `.well-known/jwks.json` check) and building the full demo company. The
131 automated tests pass as well. The Docker Compose and Caddy files above follow the official
documentation but depend on your server — test on a spare machine first.

---

Need the easy way instead? → [Free cloud installation](INSTALL.md)
