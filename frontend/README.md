# Frontend: desktop app

**Tech stack:** Electron (desktop window) wrapping a React 19 + TypeScript + Vite app, styled with Tailwind CSS v4, with React Router (hash mode), Recharts charts and Lucide icons.

**Caveats:** You need Node 20+ and the backend running at `http://localhost:8000` (or set `VITE_API_URL` in `frontend/.env`), or login will say "can't reach the server". Keep `HashRouter` and `base: './'`, because Electron loads files from `file://` and normal routes break there.

**What to work on:** Build new pages for your idea in `src/pages/`, reusing the components in `src/components/ui.tsx` and `ChartCard.tsx`, and retheme through the tokens in `src/index.css`.

```bash
npm install
npm run desktop       # Electron + hot reload (main way to develop/present)
npm run dev           # same app in a browser at http://localhost:5173
npm run build         # typecheck + production build into dist/
npm run desktop:prod  # run the built app in Electron (use this for the final demo)
```

| File | Purpose |
|---|---|
| `src/config/nav.tsx` | **Add a page:** one line here adds the route and sidebar icon |
| `src/config/app.ts` | App name, tagline, API URL |
| `src/index.css` | Brand colours, dark mode and high-contrast tokens |
| `src/components/ui.tsx` | Button, Card, Field, StatCard, Segmented, Switch, Loading, ErrorState |
| `src/components/ChartCard.tsx` | Chart wrapper with an accessible "View as table" toggle and source link |
| `src/hooks/useApi.ts` | `useApi<T>('/api/...')` returns `{ data, error, loading, reload }` |
| `src/lib/api.ts` | `api<T>(path, { method, body })` with the auth token added automatically |
| `electron/main.cjs` | Window size and title (Electron settings) |

Accessibility rules to keep: every icon-only button needs an `aria-label`, every input goes through `<Field label=...>`, and every chart goes inside `<ChartCard>`.
