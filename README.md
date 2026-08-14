[README.md](https://github.com/user-attachments/files/31077688/README.md)
# SplitSnap 🧾

An AI-powered bill-splitting app. Photograph a restaurant receipt, let Gemini extract the items, then split the bill with friends — equally or item-by-item — and track who owes whom.

**Live app:** https://bill-split-gkd6.vercel.app
**Backend API:** https://billsplit-production-7e6c.up.railway.app
---
What it does

1. Sign up or continue as a guest.
2. Snap/upload a photo of a restaurant receipt.
3. Google Gemini's vision model parses the image into a structured, editable list of items and prices.
4. Add friends and choose a split mode:
   - **Equal** — total ÷ number of people.
   - **Itemized** — tag each line item to the friend(s) who ordered it.
5. SplitSnap calculates exactly how much each person owes.
6. Bills are saved to history (for signed-in users), with a dashboard showing running balances across everyone.
7. Optional email reminders (via Resend) nudge friends about what they owe.

---

## Tech stack

| Layer          | Choice                                      |
|----------------|----------------------------------------------|
| Frontend       | React + TypeScript (Vite)                    |
| Backend        | Node.js + Express + TypeScript                |
| Database       | PostgreSQL, via Prisma ORM                    |
| Image storage  | Cloudinary                                    |
| Receipt parsing| Google Gemini API (vision)                    |
| Auth           | Email/username + password (bcrypt), JWT       |
| Email          | Resend                                        |
| Hosting        | Vercel (frontend) · Railway (backend + DB)    |

---

## Architecture

```
┌─────────────┐      HTTPS       ┌──────────────┐
│   React     │ ───────────────► │   Express    │
│  (Vercel)   │ ◄─────────────── │  (Railway)   │
└─────────────┘      JSON        └──────┬───────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
             │  PostgreSQL  │     │  Cloudinary  │     │  Gemini API  │
             │  (Railway)   │     │   (images)   │     │  (parsing)   │
             └─────────────┘     └──────────────┘     └──────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    Resend     │
                                  │   (emails)    │
                                  └──────────────┘
```

**Auth flow:** signup/login issue a JWT (7-day expiry, HS256), stored client-side and sent as `Authorization: Bearer <token>` on protected routes. A `requireAuth` Express middleware verifies the token and attaches `userId` to the request.

**Data model** (Prisma):
- `User` → has many `Friend`, `Bill`
- `Bill` → has many `BillItem`, `Split`
- `BillItem` ↔ `Friend` — many-to-many (for itemized assignment)
- `Split` — one row per friend per bill, the computed amount owed

**Receipt parsing flow:** image uploads to Cloudinary → the hosted URL is sent to Gemini with a structured-output prompt → Gemini returns JSON (`{ name, price, quantity }[]`) → the frontend shows this as an editable list before the bill is saved.

---

## Project structure

```
splitsnap/
├── splitsnap-frontend/     # React + TS (Vite)
│   └── src/
│       ├── api/            # axios client
│       ├── components/     # shared UI (ProtectedRoute, etc.)
│       ├── context/        # AuthContext
│       └── pages/          # Login, Signup, Dashboard, NewBill, BillDetail, Friends
├── splitsnap-backend/       # Express + TS
│   └── src/
│       ├── routes/          # auth, bill, friend, split
│       ├── middleware/      # requireAuth, validate
│       ├── schemas/         # zod request validation
│       ├── lib/              # prisma client, resend client
│       └── generated/prisma/ # Prisma Client output (generated at build time)
└── prisma/
    ├── schema.prisma
    └── migrations/
```

---

## Running locally

### Backend

```bash
cd splitsnap-backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Requires a `.env` with:
```
DATABASE_URL=
PORT=5000
JWT_SECRET=
RESEND_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GEMINI_API_KEY=
```

### Frontend

```bash
cd splitsnap-frontend
npm install
npm run dev
```

Requires a `.env` with:
```
VITE_API_URL=http://localhost:5000
```

---

## Deployment notes

- **Backend (Railway):** builds with `prisma generate && tsc`, runs `node dist/index.js`. Root directory set to `splitsnap-backend`. Public networking target port must match what Express listens on (`process.env.PORT`, defaults to Railway's assigned port if unset).
- **Frontend (Vercel):** root directory `splitsnap-frontend`, framework auto-detected as Vite, `VITE_API_URL` set to the live Railway backend URL as a production environment variable.
- Prisma Client is regenerated on every build rather than committed to git (`src/generated/prisma` is gitignored).

---

## What's out of scope (by design)

This was built as a focused MVP, not a production payments app:
- No real payment processing (UPI/Razorpay) — SplitSnap tracks *who owes whom*, it doesn't move money.
- No restaurant discovery, reviews, or social feed.
- No real-time notifications (reminders are sent as one-off emails, not push).
- Guest mode data isn't migrated to an account if the guest later signs up — guest sessions are intentionally ephemeral.

---

## Known issues / in progress

- Split results occasionally fail to render immediately after clicking "split this bill" — investigating whether this is a state-refresh timing issue on the frontend or a response-shape mismatch from the `/split` endpoint.

---

## About this project

Built solo as a portfolio/resume project to learn the full stack of shipping a real product: schema design, auth, third-party API integration (AI vision, image hosting, transactional email), and production deployment across two separate hosting platforms.
