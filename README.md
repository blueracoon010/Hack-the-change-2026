# Project Spark: Code the Change YYC boilerplate

A working desktop app built ahead of time so hackathon day goes to **the idea**, not setup. It includes login/signup, an icon sidebar, dark mode, accessibility settings, live **AESO** energy data, **City of Calgary** open data, an **ML forecast**, and an **AWS** deploy script.

| Folder | What it is | Owner on the day |
|---|---|---|
| [`frontend/`](frontend/README.md) | Electron + React desktop app (all UI) | UI / design person |
| [`backend/`](backend/README.md) | FastAPI API: auth, privacy, AESO + Calgary data | Backend person |
| [`ml/`](ml/README.md) | Trains models on real AESO data | Data / ML person |
| [`cloud/`](cloud/README.md) | Docker + AWS Lightsail deploy | Whoever finishes first |

## Run it (2 terminals)

```bash
# Terminal 1: backend  (http://localhost:8000/docs for the interactive API docs)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-ml.txt
uvicorn app.main:app --reload

# Terminal 2: desktop app
cd frontend && npm install
npm run desktop        # Electron window with hot reload   (or: npm run dev → browser at localhost:5173)
```

## How it maps to the judging criteria

| Criterion | Already in the boilerplate | Your job on the day |
|---|---|---|
| **Voltex: real energy data** | Live AESO grid data (load, fuel mix, pool price, AESO forecast) with **no API key**, plus ML trained on a year of real AESO history. Every chart cites its source. | Make the data *central* to your idea and turn it into a clear benefit for people. |
| **Clio: accessibility & privacy** | Keyboard navigation, skip link, visible focus, screen-reader labels, "view as table" for every chart, text size, high contrast, reduced motion, dark mode, data export, account deletion, hashed passwords, Canadian AWS region. | Keep using the shared components and labels; mention all of this in the demo. |
| **Benevity: Calgary impact** | Calgary Open Data client (any dataset) with a City solar example. | Pick a real Calgary problem and its dataset at [data.calgary.ca](https://data.calgary.ca). |
| **Technical execution** | Typed frontend, tested API, cached external calls, ML with honest metrics vs a baseline. | Don't break it, and keep the demo path working. |
| **UX & design** | Code the Change brand palette, consistent components, polished auth and dashboard. | Rename it and retheme (`frontend/src/index.css` + `frontend/src/config/app.ts`). |
| **Feasibility & scalability** | Dockerized, one-command deploy, SQLite to Postgres via one env var. | Mention the cost (about $7/month) and the path to scale in your pitch. |

## Day-of checklist
1. Rename the app in `frontend/src/config/app.ts`, `frontend/index.html` and `frontend/electron/main.cjs`.
2. Retheme by editing the tokens at the top of `frontend/src/index.css`.
3. Add pages with one line each in `frontend/src/config/nav.tsx`.
4. Add API routes in `backend/app/routers/`, and tables in `backend/app/models.py`.

## Moving this into a new repo on hackathon day
```bash
# Keep history: create an EMPTY repo on GitHub first, then
git remote add hackathon https://github.com/<you>/<new-repo>.git
git push hackathon main

# OR start fresh with one commit (no prep-day history)
rm -rf .git && git init && git add . && git commit -m "Initial commit from boilerplate"
git remote add origin https://github.com/<you>/<new-repo>.git && git push -u origin main
```
