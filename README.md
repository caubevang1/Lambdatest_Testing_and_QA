# VolunteerHub

A Single Page Application (SPA) for organizing and managing volunteer activities (tree planting, clean-ups, charity drives, community tutoring, etc.). Tech stack: React (frontend) and Node.js + Express (backend, MVC). Roles: Volunteer, Event Manager, Admin.

Repo layout
- frontend/ — React app (pages, components, services, assets)
- backend/ — Express API (controllers, models, routes, middlewares)
- frontend/public & backend/public — static/public assets (service worker, manifest, uploads)
- README.md — this file

Key features (by role)

- Common / Platform
  - Email/password authentication and role-based access control (JWT).
  - Event discovery (search, filtering by date/category).
  - Per-event discussion channel (post/comment/like) created automatically when an event is approved.
  - Role-specific dashboards (Volunteer, Event Manager, Admin).
  - Export data (CSV/JSON) endpoints for Admin.

- Volunteer
  - Register / login.
  - Browse events with details (name, date, location, description, gallery).
  - Register & cancel registration before the event starts.
  - View participation history and completion status.
  - Receive notifications (push/email hooks supported).
  - Access and interact with event discussion channel after event approval.

- Event Manager
  - Register / login.
  - Create / edit / delete events (file upload support for cover images; use multipart/form-data).
  - Approve / reject volunteer registrations.
  - Mark volunteer participation as completed and rate performance.
  - View participants and event-specific reports.
  - Access event discussion channel for approved events.
  - Manager dashboard: overview of managed events, registrations, and basic stats.

- Admin
  - Login and system-level management.
  - Approve / reject / delete events created by managers.
  - Manage users (list, lock/unlock accounts, change roles).
  - Export events / users / volunteers (CSV or JSON) via blob responses.
  - Admin dashboard with system statistics and recent activity.

Configuration (do this first)
- Backend: create `backend/.env` (do not commit) with:
  - MONGO_URI=your_mongo_connection_string
  - JWT_SECRET=your_jwt_secret
  - PORT=5000
  - SMTP_EMAIL=your_smtp_email
  - SMTP_PASS=your_smtp_password
  - OTP_TEST_MODE=true            # optional: skip sending email OTP (test only)
  - OTP_FIXED=123456              # optional: fixed OTP value for tests
  - VAPID_PUBLIC_KEY=your_vapid_public_key
  - VAPID_PRIVATE_KEY=your_vapid_private_key

- Frontend (optional): create `frontend/.env.local` with:
  - VITE_API_BASE_URL=http://localhost:5000
  - or REACT_APP_API_BASE_URL=http://localhost:5000

- Web Push: generate VAPID keys locally (e.g., using `web-push`) and set them in backend `.env`. Service worker is at `frontend/public/service-worker.js`.

Quick start — development (after configuration)
Backend
1. cd backend
2. npm install
3. npm run dev    # recommended for development (nodemon)
4. npm start      # production
Default: http://localhost:5000

Frontend
1. cd frontend
2. npm install
3. npm run dev    # Vite or configured dev server
4. npm run build  # production build
Default dev: http://localhost:3000

Run both
- Open two terminals:
  - cd backend && npm run dev
  - cd frontend && npm run dev

Important backend endpoints (examples)
- Public events
  - GET /api/events/public
  - GET /api/events/public/:eventId
- Registrations (Volunteer / Manager)
  - POST /api/registrations/:eventId
  - DELETE /api/registrations/:eventId
  - GET /api/registrations/history/my
  - GET /api/registrations/:eventId/participants
  - PUT /api/registrations/:registrationId/status
  - PUT /api/registrations/:registrationId/complete
- Events (Manager/Admin)
  - POST /api/events          (multipart/form-data when uploading files)
  - PUT /api/events/:id
  - DELETE /api/events/:id
  - PUT /api/events/:id/complete
- Admin
  - GET /api/admin/dashboard
  - GET /api/admin/events/all
  - GET /api/admin/events/pending
  - PUT /api/admin/events/:id/approve
  - PUT /api/admin/events/:id/reject
  - GET /api/admin/export/users?format=csv

Notes & tips
- File uploads: use multipart/form-data (cover image, gallery).
- Export endpoints return binary blobs; frontend should use `responseType: 'blob'`.
- If CORS issues occur, enable CORS on backend or configure frontend dev proxy (`frontend/vite.config.js` proxies `/api` and `/uploads` to backend).
- Keep `.env` files out of version control.
- Ensure backend API payloads remain consistent with frontend expectations (e.g., event.stats, registrations arrays).

Where to look in the code
- Frontend services: `frontend/src/services/*`
- Frontend pages/components: `frontend/src/pages/*`, `frontend/src/components/*`
- Backend routes/controllers: `backend/src/routes/*`, `backend/src/controllers/*`
- Push utilities: `backend/src/utils/sendPush.js`
- Event & registration logic: `backend/src/controllers/event.controller.js`, `backend/src/controllers/registration.controller.js`

Team
- Nguyễn Trường Nam — 23021644  
- Nguyễn Đăng Đạo — 23021516  
- Nguyễn Lê Anh Tuấn — 23021708

Deployment
- See [DEPLOYMENT.md](DEPLOYMENT.md) for free-tier deployment setup (Render + Vercel).
