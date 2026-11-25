# FindMyJob

FindMyJob is a personal job-discovery and matching app for BDJobs and pasted listings. It syncs BDJobs listings and accepts jobs copied from other platforms. Google Gemini extracts details, compares jobs against your resume, and drafts application emails. BDJobs jobs and pasted jobs are stored separately in MongoDB through Mongoose.

## Previews

### Light theme

![FindMyJob light theme](md/preview-light.png)

### Dark theme

![FindMyJob dark theme](md/preview-dark.png)

## Features

- **BDJobs sync:** Sync listings by category and posted-within days. The category and day range are selected in the interface.
- **Pasted jobs:** Paste a listing in its own frontend view. BullMQ queues extraction, resume matching, and application-email drafting so the form returns immediately while processing continues in the background.
- **Editable email drafts:** Pasted job cards display the extracted listing details and an editable `To`, `Subject`, and `Content` form. Drafts can be saved or copied and are never sent automatically.
- **Resume-based matching:** Scores new jobs against your resume using Google Gemini. Match scores and a short explanation are saved with each job.
- **Detailed job data:** Fetches available job details, including skills and requirements, to enrich matching and job previews. Listing data is still used if details cannot be fetched.
- **Live sync progress:** Shows the current job and sync counts in the app, and the browser tab title displays progress while syncing.
- **Job discovery controls:** Search and filter by match score, posting age (rolling days), category, location, job type, source, recent status, applied status, shortlist status, and removed status.
- **Sorting and infinite scroll:** Sort by match percentage, sync time, publish date, or first-seen date; additional results load as you scroll.
- **Job tracking:** Mark jobs as applied, shortlist or unshortlist them, remove individual jobs, or bulk-remove all jobs matching the active filters.
- **Theme toggle:** Switch between light and dark themes; your selection is saved in the browser.
- **Last-sync status:** Shows when the job list was last synced with BDJobs.

## Requirements

- Node.js 18 or newer and npm
- MongoDB connection string (for example, a MongoDB Atlas cluster)
- Redis server/connection for the BullMQ pasted-job queue
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- A resume saved as `RESUME.md` in the project root

## Setup

1. Install the API dependencies from the project root:

   ```powershell
   npm install
   ```

2. Install the frontend dependencies:

   ```powershell
   npm install --prefix frontend
   ```

3. Create your backend environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and set your MongoDB connection string and any other required values. Do not commit credentials.

4. Create `RESUME.md` in the project root and add the resume text you want the matcher to use. Keep personal information private and do not commit your resume.

5. Add your Gemini API key to the backend `.env` as `GEMINI_API_KEY`. Keep it out of frontend environment variables and source control.

6. Optionally configure the frontend API origin by creating `frontend/.env`:

   ```dotenv
   VITE_API_BASE_URL=
   ```

   Leave it blank for the included Vite development proxy (`localhost:5173` to `localhost:3000`). Set it to the API's base URL when the API is hosted elsewhere.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `BDJOBS_GET_JOBS_URL` | Yes | — | BDJobs job-search API URL. |
| `BDJOBS_GET_JOB_DETAILS_URL` | Yes | — | BDJobs job-details API URL/prefix used with a job ID. |
| `MONGODB_URL` | Yes | — | MongoDB connection string. |
| `QUEUE_REDIS_URL` | No | `redis://127.0.0.1:6379` | Redis connection used by the BullMQ pasted-job queue. Redis must be reachable before the API starts. |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key. Keep it private and backend-only. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model used for extraction, matching, and email drafts. |
| `PORT` | No | `3000` | API server port. |
| `RPP` | No | `50` | Number of BDJobs results requested per page. |
| `MAX_PAGES` | No | `50` | Maximum number of BDJobs pages to process per sync. |
| `FRONTEND_ORIGINS` | No | `http://localhost:5173` | Comma-separated list of allowed frontend origins. |
| `AUTO_SYNC_HOUR` | No | Disabled | Run a cron sync every N hours, at the corresponding local clock-hour boundaries. Set to `2` to run at 00:00, 02:00, 04:00, and so on. |
| `AUTO_SYNC_CATEGORY_ID` | No | No category filter | BDJobs category used by scheduled syncs. |
| `AUTO_SYNC_POSTED_WITHIN_DAY` | No | `1` | Posted-within day range used by scheduled syncs. |
| `VITE_API_BASE_URL` | No | Empty | Frontend API origin; leave empty to use same-origin/Vite proxy behavior. |

The backend reads `.env` from the project root. `.env` is ignored by Git; use `.env.example` as a starting point. Start Redis before the API; pasted-job processing is handled by a BullMQ worker in the API process.
Automatic sync does not run immediately on startup. It runs on the configured cron schedule using the category and day range from `.env`; a scheduled run is skipped if a manual or other sync is already in progress.

## Backend structure

The backend is organized by feature module:

- `src/app.ts` configures Express middleware and mounts API routes.
- `src/server.ts` connects to MongoDB, starts HTTP/WebSocket services and the scheduled sync, and handles shutdown.
- `src/config/` contains environment configuration and the Mongoose database lifecycle.
- `src/modules/jobs/` contains job routes, controllers, service logic, model, BDJobs API client, matcher, and interfaces.
- Pasted listings use the separate `pasted_jobs` MongoDB collection and `/api/pasted-jobs` endpoints; they are not mixed into the BDJobs jobs list.
- `src/modules/sync/` contains sync routes, controllers, orchestration, scheduler, state model, and interfaces.
- `src/routes/index.ts` mounts feature routes under `/api`.
- `src/shared/` contains cross-feature infrastructure such as WebSocket broadcasting.

## Run locally

Start the API in one terminal:

```powershell
npm run dev
```

Start the frontend in another terminal:

```powershell
npm run dev --prefix frontend
```

Open [http://localhost:5173](http://localhost:5173). The API runs at `http://localhost:3000` by default. MongoDB, Redis, and Gemini API access must be available before processing jobs.

## Build

Build/type-check the API:

```powershell
npm run build
```

Build the frontend:

```powershell
npm run build:web
```

## API overview

- `GET /api/health` — API health check.
- `GET /api/sync/status` — last successful sync time.
- `POST /api/sync` — start a sync. JSON body accepts `categoryId` and `postedWithin` (a positive number of days; defaults to `1` on the backend). Returns `202` when started and `409` if a sync is already running.
- `GET /api/jobs` — list and paginate jobs. Supports filters such as `min_match`, `max_match`, `posted_within` (positive number of rolling days), `cat_id`, `q`, `location`, `job_type`, `source`, `is_recent`, `is_applied`, `is_sort_listed`, and `is_removed`, plus `page`, `page_size`, `sort`, and `sort_direction`.
- `GET /api/jobs/:id` — retrieve a job by its BDJobs ID.
- `POST /api/pasted-jobs` — save and enqueue a pasted job. JSON body: `{ "text": "...", "sourceUrl": "https://..." }`; `sourceUrl` is optional and must be HTTP(S). Text must be 20–30,000 characters. Returns `202` immediately with a queue ID.
- `GET /api/pasted-jobs` — list pasted jobs separately, including queued/processing/completed/failed status and extracted details.
- `PATCH /api/pasted-jobs/:id/email` — save edits to the generated email draft (`to`, `subject`, and `content`); does not send the email.
- `PATCH /api/pasted-jobs/:id` — update pasted-job tracking flags: `isApplied`, `isSortListed`, and/or `isRemoved`.
- `ws://localhost:3000/ws` — broadcasts `pasted_job_updated` events when pasted-job stages, extraction, scoring, or email-draft status changes; reconnecting clients reload the current list.
- `PATCH /api/jobs/:id` — update `isApplied`, `isRemoved`, and/or `isSortListed`.
- `POST /api/jobs/bulk-remove` — mark all jobs matching the provided `filters` as removed.
- `ws://localhost:3000/ws` — live sync progress events for the frontend.

## How matching works

For each new listing, the backend attempts to fetch its details and compares the available job information with `RESUME.md` using the configured Gemini model. It stores a 0–100 match score, a short reason, the original listing, and available details. Pasted job extraction, resume matching, and email drafting also use Gemini. There is no Ollama fallback. Existing job IDs are not scored again during sync.
