# 🏨 Hotel Management System

> *"I couldn't find a hotel management system I actually liked, so I built one."*

A full-stack, from-scratch hotel management system — Django REST API on the back, React on the front — built to run the day-to-day of a real hotel: rooms, reservations, billing, cash, and everyone in between. Started as a "not sure I'll ever finish this 😜" side project. It got finished. It's got GST invoicing, guest analytics, and shift-based cash settlement now. Turns out we launched it.

If you're new here: this is not a tutorial CRUD app. It's the real thing — clone it, seed it, and you'll have a working front desk in five minutes.

---

## ✨ What's inside

**Front desk & rooms**
- 🛏️ Room dashboard, room types, and datewise price charts (with a default-price fallback)
- 👥 Group-based check-ins — because two different sets of guests *can* share room 101 on the same day, and someone needs to know who stayed with whom
- 📅 Reservations, booking pipeline, bulk booking, and reservation fulfillment
- 🚪 Checkout flow, no-show/cancellation requests (NC Requests), and cancellation refunds

**Money**
- 💳 Payments, multiple payment methods, cash drawer & withdrawals
- 🧾 GST-compliant invoicing (PDF), expense & income tracking with categories and attachments
- 📊 Daily settlement with per-method breakdowns — close out a shift and know exactly what's in the till
- 💰 Revenue, occupancy, and cancellation reports

**Guests & extras**
- 🧍 Customers, country codes, guest analytics, customer lifetime value
- 🛎️ Amenities, extra-bed upsell, food orders, stay notes & vehicles
- 📈 Room performance, seasonal trends, stay duration analytics

**Under the hood**
- 🔐 JWT auth with granular, permission-key-based access control (`ReportPermissions`, per-feature checks)
- ⚙️ A developer-defined key/value `Configurations` table for things like `extra_bed_price` — no migration needed to tweak business rules
- 🌱 A `seed_data` management command so you're never staring at an empty database

---

## 🧱 Stack

| Layer | Tech |
|---|---|
| Backend | Django 5 + Django REST Framework + SimpleJWT |
| Frontend | React 19 + Vite + Mantine UI + TanStack Query |
| Database | SQLite (dev-ready out of the box) |
| Charts / PDF | Recharts, @react-pdf/renderer |

---

## 🚀 Getting started

### 1. Backend (Django API)

```bash
# from the repo root
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file in the repo root:

```env
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost
```

Then set up the database and (optionally) load some sample data so the app isn't a ghost town:

```bash
python manage.py migrate
python manage.py seed_data
python manage.py createsuperuser
python manage.py runserver
```

The API is now running at `http://127.0.0.1:8000/`.

### 2. Frontend (React app)

```bash
cd frontend
npm install
npm run dev
```

Vite will print a local URL (typically `http://localhost:5173/`) — open it and log in with the superuser (or seeded) credentials.

---

## 🧠 Core concepts worth knowing

### Rooms & pricing
A room's bed count = how many guests it holds by default, but extra beds can bump that up. Prices resolve in this order:
1. A datewise entry in **RoomsPriceChart**
2. The room's own default price
3. A manual override entered at the time the room is actually given to a customer

### Groups & customers
Two different sets of guests can occupy the same room on the same day (different check-in/checkout windows). To keep track of *who stayed with whom*, every check-in creates a **Group** — one or more customers, tied to a room for a specific stay. It's the join table that makes the history make sense.

### Configurations
A simple key/value store for business rules the *developer* defines and the *code* validates — e.g. `extra_bed_price = 500`. No schema change needed to adjust a number like that.

---

## 📁 Project layout

```
Hotel-Management/
├── core/               # Django project settings, URLs, WSGI/ASGI
├── management/         # The main Django app — models, views, serializers, permissions, ledger/settlement logic
│   └── management/commands/seed_data.py
├── frontend/           # React + Vite app (Mantine UI, React Query)
│   └── src/pages/      # One file per feature — rooms, reports, finance, admin
├── media/              # Uploaded attachments (expense/income receipts, etc.)
├── manage.py
└── requirements.txt
```

---

## 🤝 Contributing

Found a bug, or have an idea for a feature a real front desk needs? Open an issue or a PR — this project grew out of solving real problems for a real hotel, and it's still growing.

---

Built out of pure "why doesn't this already exist" energy. 🏨✨
