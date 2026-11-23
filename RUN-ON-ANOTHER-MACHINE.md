# Run the AOI app on another Windows machine

Step-by-step to get the AOI application running on a fresh **Windows 10/11**
machine using the desktop icon. The app runs entirely in Docker — you do **not**
need to install Python, Node, or Postgres on the target machine, only Docker
Desktop.

When it's set up, double-clicking the **AOI System** desktop icon starts
everything and opens the app in your browser at <http://localhost:5173>.

---

## 1. Prerequisites (one-time, on the new machine)

1. **CPU virtualization enabled in BIOS/UEFI.** Required by WSL2. It's on by
   default on most machines; only revisit this if Docker complains in step 2.
2. **Install Docker Desktop for Windows** — <https://www.docker.com/products/docker-desktop/>
   - During install, keep the **"Use WSL 2 instead of Hyper-V"** option enabled.
   - If prompted, install the **WSL2 kernel update** (Docker links it, or run
     `wsl --install` in an elevated PowerShell once).
   - **Launch Docker Desktop once** and wait until the whale icon in the system
     tray says **"Engine running"**. Accept the service agreement on first run.
3. **Git for Windows** — only if you'll fetch the code with `git clone`
   (Option A below). Not needed if you copy the folder.

> Verify Docker is ready: open PowerShell and run `docker version` — both a
> **Client** and a **Server** section should appear (Server present = engine up).

---

## 2. Get the project onto the machine — pick ONE option

### Option A — Git clone (recommended if the machine has internet + Git)

```powershell
git clone https://github.com/solutionsDigibull/AOI-BuLLMQuality.git
cd AOI-BuLLMQuality
```

### Option B — Copy the folder (USB / network share, works offline)

Copy the whole project folder to the new machine. To keep the copy small, you
can **skip** these folders — they're regenerated automatically:

- `frontend/node_modules`
- `archive/legacy-streamlit/venv`
- `.git` (only if you don't need git history)
- `data/` (runtime captures — leave behind unless you want the old data)

Then open PowerShell in the copied folder (Shift + right-click the folder →
**"Open PowerShell window here"**).

---

## 3. Install the desktop icon (one-time, run in the project folder)

From a PowerShell prompt **inside the project folder**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-icon.ps1
```

This generates the icon (`scripts\aoi.ico`, from the Innotech logo) and creates
an **AOI System** shortcut on your Desktop. You'll see
`Done. Double-click 'AOI System' on your Desktop to launch the app.`

---

## 4. Launch the app

**Double-click the "AOI System" icon on the Desktop.** A console window opens and:

1. Starts Docker Desktop automatically if the engine isn't running (waits up to
   5 minutes — a cold WSL2 start is slow; a live counter shows progress).
2. Runs `docker compose up -d` to bring up Postgres + backend + frontend.
3. Waits for the web UI, then opens your browser at <http://localhost:5173>.

> **First launch is slow** — it downloads the Postgres image, builds the backend
> image, and installs frontend dependencies inside the container. Expect a few
> minutes. **Every launch after that is fast.**

You can close the console window once the browser opens — the app keeps running
in the background (managed by Docker Desktop).

When the dashboard prompts for **camera access**, allow it (the webcam is read by
your browser on `localhost`, not by the container).

---

## 5. Stop the app

From the project folder:

```powershell
docker compose down
```

…or quit Docker Desktop from the tray. Your captured images and database persist
in Docker volumes and are still there on the next launch (use
`docker compose down -v` only if you want to wipe the database).

---

## 6. Optional — admin password & email reports (`.env`)

The app runs without this, but **admin features (Settings edits, captures ZIP
export, manual report email) stay disabled until a strong `ADMIN_PASSWORD` is
set** — there is no default password. For admin access and the daily email
report, create a `.env` in the project root:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `ADMIN_PASSWORD`, `SENDER_EMAIL`, `SENDER_PASSWORD`, `RECIPIENT_EMAILS`, then
re-launch via the icon. (Leave `DATABASE_URL` alone — Docker Compose supplies it.)

---

## 7. Production mode (`docker-compose.prod.yml`)

The default launch (steps 4–6) is the **development** stack: Vite dev server,
hot-reloading backend, and Postgres published on host port 5433 with the
password `aoi`. Anyone on the same network can reach those ports. For a
station on a shared network, use the production stack instead:

| | Dev (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
| --- | --- | --- |
| Web UI | Vite dev server, port 5173 on all interfaces | nginx serving a built bundle, `127.0.0.1:5174` only (port: `AOI_PROD_HTTP_PORT`) |
| Backend | `uvicorn --reload`, source bind-mounted, port 8001 on all interfaces | gunicorn, 1 worker, baked image, `127.0.0.1:8011` only |
| Database | published on 5433, password `aoi` | **not published**, password from `POSTGRES_PASSWORD` |
| Compose project / volumes | `aoi-bullmquality`, `aoi-bullmquality_aoi_*` | `aoi-prod`, `aoi-prod_prod_*` (separate data) |

1. In `.env`, set a strong `ADMIN_PASSWORD` and add `POSTGRES_PASSWORD=` with
   32 hex characters (see `.env.example`). Both are required; compose refuses
   to start without them.
2. Start it: `.\scripts\start-aoi.ps1 -Prod -Build` (first time), then
   `.\scripts\start-aoi.ps1 -Prod`. Point the desktop shortcut's arguments at
   `-Prod` once you have switched over.
3. Open the UI **on the station itself** at `http://localhost:5174`. Nothing
   is published on the network: the UI and the API listen on `127.0.0.1` only
   and the database has no host port. (The camera also needs `localhost` or
   HTTPS.) Opening the UI to other PCs is a deliberate, approved edit of the
   `frontend` port line in `docker-compose.prod.yml`, not a setting.
4. Check from another PC on the network that nothing answers:

   ```powershell
   Test-NetConnection <station-ip> -Port 5174   # False (loopback only)
   Test-NetConnection <station-ip> -Port 8011   # False (loopback only)
   Test-NetConnection <station-ip> -Port 5433   # False once the dev stack is stopped
   ```

Production starts with **empty** volumes. Moving existing data over is a
planned step: back up the dev stack and restore it into the production
project (below), then compare the counts.

### Backup

```powershell
.\scripts\backup-aoi.ps1 -ComposeFile docker-compose.prod.yml -Project aoi-prod
```

The script **stops the app containers** (in-flight requests finish), keeps
Postgres running, dumps the database and archives the images while writes are
paused, writes a manifest (row counts + SHA-256 of every file), and restarts the
app. Expect about a minute of downtime: run it between shifts. Files land in
`backups\` (git-ignored). **Copy them off the machine.**

**Session guard.** Inspection sessions live in the backend's memory, so
stopping it ends them (the operator must start a new session; saved captures
are kept). The script first asks the backend how many sessions are live and
**refuses (nothing stopped) if any are, or if it cannot tell** (backend down,
not answering, older version without the check). It checks again right before
stopping the backend, after the UI is already down. To back up anyway, add
`-ConfirmInterruption`; there is no option that skips the checks. It never
prompts, so scheduled runs behave the same.

| Exit code | Meaning |
| --- | --- |
| 0 | Backup written |
| 1 | Backup failed; the services it stopped were restarted |
| 2 | Refused: active session(s) |
| 3 | Refused: could not tell whether sessions are active |
| 4 | Refused: a session started after the first check (backend not stopped) |
| 5 | Backup written, but a session started in the last moment before the backend stopped and was ended (only possible by calling the backend port directly) |
| 6 | A service the script stopped did not come back healthy: **the app is down**, follow the printed command |

It restarts only what it stopped, waits for each service to report healthy,
and records both checks and the decision in the manifest. A session that a
browser left open without "End session" counts as active until the backend
restarts; a count of 0 live dashboards in the message suggests it is
abandoned.

### Restore (always into fresh volumes)

```powershell
.\scripts\restore-aoi.ps1 -Backup backups\aoi-prod_<stamp>.dump `
    -ComposeFile docker-compose.prod.yml -Project aoi-prod-restore
```

It refuses to touch existing volumes or containers, restores the database and
images, then verifies row counts, every file's SHA-256 and missing images
against the manifest. App containers stay stopped until you start them.

### Rolling back from production to dev

Never just restart the old dev stack: its data is from before the switch and
would silently drop every capture made in production. Instead:

1. Back up production (command above). Record the counts it prints.
2. Restore that backup into a **new** dev project:
   `.\scripts\restore-aoi.ps1 -Backup backups\aoi-prod_<stamp>.dump -ComposeFile docker-compose.yml -Project aoi-rollback`
   (needs ports 5433/8001/5173 free, so stop the production and old dev stacks first).
3. Compatibility check before switching: `docker compose -p aoi-rollback up -d backend`,
   then confirm `http://localhost:8001/healthz`, the operator list, today's
   summary and a capture image open. Only then start the frontend
   (`docker compose -p aoi-rollback up -d`).
4. Keep the production volumes and the original dev volumes untouched until the
   rolled-back stack has run a full shift.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `... install-desktop-icon.ps1 cannot be loaded because running scripts is disabled` | Use the exact command in step 3 — the `-ExecutionPolicy Bypass` flag handles it. If Windows still blocks the shortcut, right-click `AOI System.lnk` → **Properties** → **Unblock** → OK. |
| Console says **"Docker engine did not come up within 300s"** | Open Docker Desktop manually, wait until the tray icon says **"Engine running"**, then double-click the icon again. |
| Browser shows **"This site can't be reached"** at `localhost:5173` | The first build may still be running. Wait a minute and refresh, or check progress with `docker compose ps` / `docker compose logs -f` from the project folder. |
| **Port 5173 already in use** | Something else is using that port. Stop it, or edit the `frontend` port mapping in `docker-compose.yml`. |
| `docker` not recognized / no **Server** in `docker version` | Docker Desktop isn't installed or isn't running. Revisit step 1–2. |

---

## What's happening under the hood

The icon runs `scripts\start-aoi.ps1`, which is path-independent (it finds the
project root relative to itself), so the project folder can live anywhere on the
machine. It uses the repo's `docker-compose.yml`, which boots three containers —
`db` (Postgres 16), `backend` (FastAPI), `frontend` (Vite) — and injects
`DATABASE_URL` itself, which is why no `.env` is needed just to run.
