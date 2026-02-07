# CutoutLab

Production-ready monorepo for an Apple‑inspired image cutout generator. The backend uses Django + DRF with Gemini 2.5 Flash for segmentation, and the frontend is Next.js (App Router) with TailwindCSS.

## Structure

```
frontend/   # Next.js App Router + Tailwind
backend/    # Django + DRF + Celery
```

## Features (MVP)

- Drag & drop uploads (single, multiple, folder)
- Concurrency‑limited processing queue + per‑file status
- Gemini 2.5 Flash segmentation, mask post‑processing, PNG cutout export
- Reprocess with live params (threshold, feather, padding, auto‑enhance)
- Batch export ZIP + per‑item download
- Light/dark mode, clean Apple‑style UI

## Quick Start (Docker)

```
docker compose up --build
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Manual Setup

### Backend

```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Start the Celery worker:

```
cd backend
source .venv/bin/activate
celery -A config worker -l info
```

### Frontend

```
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Environment Variables

Backend (`backend/.env`):
- `GEMINI_API_KEY` – required
- `GEMINI_MODEL` – default `gemini-2.5-flash`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `MAX_UPLOAD_SIZE`

Frontend (`frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` – `http://localhost:8000`

## API Endpoints

- `POST /api/upload` – optional upload
- `POST /api/segment` – multipart (file or `file_id`) + params
- `GET /api/job/<id>` – job status + result
- `GET /api/download/<id>` – PNG download
- `GET /api/download_zip?ids=...` – ZIP download

## Tests

```
cd backend
python manage.py test
```

## Notes

- Folder upload works best in Chromium-based browsers via `webkitdirectory`.
- The queue caps concurrent processing to keep the UI responsive.
- Results are cached by image hash + params.
