# Ledger Backend API

A production-ready REST API for the **Ledger Expense Tracker** built with Node.js, Express, and MongoDB.

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Runtime     | Node.js 18+                       |
| Framework   | Express 4                         |
| Database    | MongoDB + Mongoose 8              |
| Auth        | JWT (Access + Refresh tokens)     |
| Validation  | express-validator                 |
| Security    | helmet, cors, express-rate-limit  |
| Logging     | morgan                            |
| Dev         | nodemon                           |

---

## Project Structure

```
ledger-backend/
├── config/
│   └── db.js                  # MongoDB connection
├── controllers/
│   ├── authController.js      # Register, login, refresh, logout, profile
│   ├── expenseController.js   # Full CRUD + summary aggregation
│   ├── incomeController.js    # Full CRUD + summary aggregation
│   ├── budgetController.js    # Get / set / reset monthly budgets
│   ├── recurringController.js # Recurring expenses + apply logic
│   └── analyticsController.js # Charts and insight aggregations
├── middleware/
│   ├── auth.js                # JWT protect middleware
│   ├── errorHandler.js        # Central error handler + asyncHandler
│   └── validators.js          # express-validator rule sets
├── models/
│   ├── User.js                # User with bcrypt password
│   ├── Expense.js             # Expense with compound indexes
│   ├── Income.js              # Income entries
│   ├── Budget.js              # Monthly category limits (one per user)
│   └── Recurring.js           # Recurring expense templates
├── routes/
│   ├── auth.js
│   ├── expenses.js
│   ├── income.js
│   ├── budget.js
│   ├── recurring.js
│   └── analytics.js
├── utils/
│   └── dateHelpers.js         # getPeriodRange, getMonthPrefix
├── .env.example
├── .gitignore
├── server.js                  # Entry point
└── package.json
```

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB running locally **or** a MongoDB Atlas URI

### 2. Install & configure

```bash
cd ledger-backend
npm install

cp .env.example .env
# Edit .env — set MONGO_URI and change JWT secrets
```

### 3. Run

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:5000`

---

## Environment Variables

| Variable                | Default                               | Description                        |
|-------------------------|---------------------------------------|------------------------------------|
| `PORT`                  | `5000`                                | Server port                        |
| `NODE_ENV`              | `development`                         | Environment                        |
| `MONGO_URI`             | `mongodb://localhost:27017/ledger_db` | MongoDB connection string          |
| `JWT_SECRET`            | *(change this!)*                      | Access token signing secret        |
| `JWT_EXPIRE`            | `7d`                                  | Access token expiry                |
| `JWT_REFRESH_SECRET`    | *(change this!)*                      | Refresh token signing secret       |
| `JWT_REFRESH_EXPIRE`    | `30d`                                 | Refresh token expiry               |
| `CLIENT_URL`            | `http://localhost:5173`               | Allowed CORS origin                |
| `RATE_LIMIT_WINDOW_MS`  | `900000`                              | Rate limit window (ms)             |
| `RATE_LIMIT_MAX`        | `100`                                 | Max requests per window            |

---

## Authentication

All protected routes require the header:
```
Authorization: Bearer <accessToken>
```

Access tokens expire in 7 days. Use the refresh endpoint to get a new one.

---

## API Reference

### Base URL
```
http://localhost:5000/api
```

---

### 🔐 Auth  `/api/auth`

| Method | Path                    | Auth | Description                  |
|--------|-------------------------|------|------------------------------|
| POST   | `/register`             | ✗    | Register new user            |
| POST   | `/login`                | ✗    | Login, receive tokens        |
| POST   | `/refresh`              | ✗    | Refresh access token         |
| POST   | `/logout`               | ✓    | Revoke refresh token         |
| GET    | `/me`                   | ✓    | Get current user profile     |
| PUT    | `/profile`              | ✓    | Update name / settings       |
| PUT    | `/change-password`      | ✓    | Change password              |

#### POST `/api/auth/register`
```json
{
  "name": "Arjun Sharma",
  "email": "arjun@example.com",
  "password": "secret123"
}
```
**Response 201:**
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "_id": "...", "name": "Arjun Sharma", "email": "arjun@example.com", "settings": { "currency": "INR", "weekStart": "sun" } }
}
```

#### POST `/api/auth/login`
```json
{ "email": "arjun@example.com", "password": "secret123" }
```

#### POST `/api/auth/refresh`
```json
{ "refreshToken": "eyJ..." }
```

#### PUT `/api/auth/profile`
```json
{
  "name": "Arjun S",
  "settings": { "currency": "USD", "weekStart": "mon" }
}
```

---

### 💸 Expenses  `/api/expenses`

| Method | Path           | Description                          |
|--------|----------------|--------------------------------------|
| GET    | `/`            | List expenses (paginated, filtered)  |
| POST   | `/`            | Create expense                       |
| GET    | `/summary`     | Aggregated totals by category/date   |
| GET    | `/:id`         | Get single expense                   |
| PUT    | `/:id`         | Update expense                       |
| DELETE | `/:id`         | Delete expense                       |
| DELETE | `/bulk`        | Bulk delete by array of IDs          |

#### Query Parameters (GET `/`)
| Param      | Example           | Description                        |
|------------|-------------------|------------------------------------|
| `period`   | `month`           | `day` / `week` / `month` / `year`  |
| `from`     | `2025-01-01`      | Start date (YYYY-MM-DD)            |
| `to`       | `2025-01-31`      | End date (YYYY-MM-DD)              |
| `category` | `food`            | Filter by category                 |
| `page`     | `1`               | Page number                        |
| `limit`    | `50`              | Items per page (max 500)           |
| `sort`     | `-date`           | `date`, `-date`, `amount`, `-amount`|

#### POST `/api/expenses`
```json
{
  "amount": 450.00,
  "description": "Lunch at Saravana Bhavan",
  "category": "food",
  "date": "2025-07-15",
  "note": "With colleagues"
}
```

**Categories:** `food` `transport` `shopping` `entertainment` `health` `utilities` `education` `travel` `personal` `home` `savings` `other`

---

### 💰 Income  `/api/income`

| Method | Path        | Description                        |
|--------|-------------|------------------------------------|
| GET    | `/`         | List income (paginated, filtered)  |
| POST   | `/`         | Create income record               |
| GET    | `/summary`  | Aggregated income by category/date |
| GET    | `/:id`      | Get single income record           |
| PUT    | `/:id`      | Update income record               |
| DELETE | `/:id`      | Delete income record               |

#### POST `/api/income`
```json
{
  "amount": 75000,
  "description": "July Salary",
  "category": "salary",
  "date": "2025-07-01",
  "note": "After tax"
}
```

**Income Categories:** `salary` `freelance` `business` `investment` `gift` `rental` `other_inc`

---

### 🎯 Budget  `/api/budget`

| Method | Path  | Description                               |
|--------|-------|-------------------------------------------|
| GET    | `/`   | Get limits + current month spending       |
| PUT    | `/`   | Set category limits                       |
| DELETE | `/`   | Reset all limits to zero                  |

#### GET `/api/budget` — Response
```json
{
  "success": true,
  "data": {
    "limits": { "food": 8000, "transport": 3000 },
    "overview": [
      {
        "category": "food",
        "limit": 8000,
        "spent": 5200,
        "remaining": 2800,
        "percentUsed": 65,
        "isOver": false
      }
    ]
  }
}
```

#### PUT `/api/budget`
```json
{
  "limits": {
    "food": 8000,
    "transport": 3000,
    "entertainment": 2000,
    "shopping": 5000
  }
}
```

---

### 🔁 Recurring  `/api/recurring`

| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| GET    | `/`               | List all recurring items           |
| POST   | `/`               | Create recurring template          |
| GET    | `/:id`            | Get single recurring item          |
| PUT    | `/:id`            | Update recurring item              |
| DELETE | `/:id`            | Delete recurring item              |
| POST   | `/:id/apply`      | Log today's occurrence as expense  |
| POST   | `/apply-due`      | Auto-apply all overdue items       |

#### POST `/api/recurring`
```json
{
  "amount": 2000,
  "description": "Netflix",
  "category": "entertainment",
  "frequency": "monthly",
  "startDate": "2025-01-01"
}
```

**Frequencies:** `daily` `weekly` `monthly` `yearly`

---

### 📊 Analytics  `/api/analytics`

| Method | Path            | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | `/overview`     | Today/week/month/year totals             |
| GET    | `/monthly`      | Last 12 months income vs expenses        |
| GET    | `/weekly`       | Last N weeks (`?weeks=8`)                |
| GET    | `/daily`        | Last N days (`?days=30`)                 |
| GET    | `/categories`   | Category breakdown with % share          |
| GET    | `/insights`     | Streak, daily avg, largest, MoM change   |
| GET    | `/cashflow`     | Last N months cashflow (`?months=6`)     |

#### GET `/api/analytics/overview` — Response
```json
{
  "success": true,
  "data": {
    "day":   { "expenses": { "total": 450, "count": 2 }, "income": { "total": 0, "count": 0 }, "net": -450 },
    "week":  { "expenses": { "total": 3200, "count": 11 }, "income": { "total": 0, "count": 0 }, "net": -3200 },
    "month": { "expenses": { "total": 18500, "count": 45 }, "income": { "total": 75000, "count": 1 }, "net": 56500 },
    "year":  { "expenses": { "total": 142000, "count": 312 }, "income": { "total": 750000, "count": 12 }, "net": 608000 }
  }
}
```

#### GET `/api/analytics/insights` — Response
```json
{
  "success": true,
  "data": {
    "streak": 7,
    "monthChange": -12.5,
    "thisMonthTotal": 18500,
    "lastMonthTotal": 21143,
    "dailyAvg": 617.33,
    "largestExpense": { "amount": 15000, "description": "Rent July", "date": "2025-07-01" }
  }
}
```

---

## Error Responses

All errors return a consistent shape:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "amount", "message": "Amount must be a positive number" }
  ]
}
```

| Status | Meaning                        |
|--------|--------------------------------|
| 200    | OK                             |
| 201    | Created                        |
| 400    | Bad request / validation error |
| 401    | Unauthorized                   |
| 404    | Not found                      |
| 409    | Conflict (duplicate)           |
| 422    | Unprocessable entity           |
| 429    | Too many requests              |
| 500    | Internal server error          |

---

## Connecting the Frontend

Update your Vite frontend's `src/utils.js` (or create `src/api.js`) to call these endpoints instead of localStorage.

Example using fetch:
```js
const API = "http://localhost:5000/api";

export const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem("accessToken");
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return data;
};
```

---

## Security Features

- **Helmet** — sets secure HTTP headers
- **CORS** — whitelisted origin only
- **Rate limiting** — 100 req/15min globally, 20 req/15min on auth routes
- **bcryptjs** — passwords hashed with salt factor 12
- **JWT** — short-lived access tokens + long-lived refresh tokens
- **Mongoose validation** — schema-level validation on all models
- **express-validator** — input sanitisation on all routes
- **User isolation** — all queries scoped to `req.user._id`

---

## MongoDB Indexes

| Collection | Index                         | Purpose                     |
|------------|-------------------------------|-----------------------------|
| expenses   | `{ user, date }`              | Fast date-range queries     |
| expenses   | `{ user, category, date }`    | Category + date filtering   |
| income     | `{ user, date }`              | Fast date-range queries     |
| income     | `{ user, category, date }`    | Category + date filtering   |
| users      | `{ email }` unique            | Login lookup                |
| budgets    | `{ user }` unique             | One budget per user         |
