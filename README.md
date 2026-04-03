# 🏪 StoreMate AI — WhatsApp Inventory Management System

<div align="center">

![StoreMate AI Banner](https://img.shields.io/badge/StoreMate-AI-1E3A5F?style=for-the-badge&logo=whatsapp&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Twilio](https://img.shields.io/badge/Twilio-F22F46?style=for-the-badge&logo=twilio&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

**Manage your shop inventory by just sending a WhatsApp message — in Hindi, English, or Hinglish.**

*Team: NextGen | Leader: Aditi Raj | Member: Piyush Yadav*

</div>

---

## 📌 Table of Contents

- [Problem Statement](#-problem-statement)
- [Our Solution](#-our-solution)
- [Features](#-features)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Setup Instructions](#-setup-instructions)
- [API Endpoints](#-api-endpoints)
- [WhatsApp Conversation Flows](#-whatsapp-conversation-flows)
- [Environment Variables](#-environment-variables)
- [Hinglish Support](#-hinglish-support)
- [Demo](#-demo)
- [Team](#-team)

---

## ❗ Problem Statement

India has **63 million+ small shops** (kirana stores, medical stores, grocery shops). Most owners:

- Track inventory on paper registers or from memory
- Never know when products are about to expire
- Realise stock is finished only when a customer asks for it
- Cannot afford or learn complex inventory software
- But — **they ALL use WhatsApp every day**

> Estimated ₹4,000 Cr+ annual loss in Indian small retail due to poor inventory management.

---

## ✅ Our Solution

**StoreMate AI** is a WhatsApp chatbot that lets shop owners manage their entire inventory by sending simple text messages or photos — in Hindi, English, or Hinglish.

```
No app to download. No training needed. Just WhatsApp.
```

### What makes it special?

| Feature | StoreMate AI | Traditional Apps |
|---------|-------------|-----------------|
| Installation needed | ❌ None | ✅ Download required |
| Language support | Hindi + English + Hinglish | English only |
| Works on basic phones | ✅ Any WhatsApp phone | ❌ Needs modern smartphone |
| Barcode scanning | ✅ Built-in | ✅ But needs app |
| Expiry alerts | ✅ WhatsApp auto-alert | ✅ But inside app |
| Learning curve | Near zero | Days to weeks |

---

## ⭐ Features

### 1. Three Ways to Add Products

```
📄 Invoice Photo   →  OCR reads product name, qty, price, expiry
📷 Barcode Photo   →  Scans barcode + fetches from Open Food Facts
✍️  Manual Text     →  "50 units Parle-G expiry March 2026 price 120"
```

### 2. Hinglish NLP

The bot understands mixed Hindi-English messages:

```
User: "das packet Tata salt add karo exp 03/2026 price 18"
Bot:  ✅ Got it! Adding 10 packets of Tata Salt, expiry March 2026, ₹18...
```

### 3. Smart Expiry Alerts

- **7 days before**: Early warning
- **3 days before**: Urgent reminder
- **1 day before**: 🚨 Critical alert + discount suggestion
- One-time alert per threshold — no spam

### 4. Low Stock Alerts

- Fires **instantly** when stock drops to ≤ 3 units
- Suggests restocking immediately

### 5. Daily Summaries

- ☀️ **Morning**: Total products, low stock count, expiring soon count
- 🌙 **Evening**: Detailed expiry list + smart discount suggestions
- Per-user custom times (e.g., 8:00 AM and 9:00 PM)

### 6. Multi-Shop Support

One WhatsApp number → manage multiple shops → switch between shops easily

### 7. Sales & Loss Tracking

- Record sales → auto-decrement stock → calculate revenue
- Record losses with reason: expired / damaged / stolen / other
- Estimated financial loss tracking

### 8. REST API

Full REST API for admin use, reporting, and external integrations.

---

## 🔄 How It Works

```
┌─────────────┐    WhatsApp     ┌──────────────┐    POST /webhook   ┌─────────────────────┐
│   Shop      │ ─────────────► │   Twilio     │ ────────────────► │  Node.js + Express   │
│   Owner     │ ◄───────────── │   API        │ ◄──────────────── │  (messageHandler.js) │
└─────────────┘    Reply       └──────────────┘    Response        └──────────┬──────────┘
                                                                               │
                                                        ┌──────────────────────┼────────────────────┐
                                                        │                      │                    │
                                               ┌────────▼──────┐    ┌─────────▼──────┐   ┌─────────▼──────┐
                                               │  NLP Service  │    │  OCR Service   │   │ Barcode Service│
                                               │ (Hinglish     │    │ (Google Vision │   │ (ZXing + Open  │
                                               │  parsing)     │    │  + Tesseract)  │   │  Food Facts)   │
                                               └────────┬──────┘    └─────────┬──────┘   └─────────┬──────┘
                                                        │                      │                    │
                                                        └──────────────────────┼────────────────────┘
                                                                               │
                                                                    ┌──────────▼──────────┐
                                                                    │   MongoDB Database   │
                                                                    │  Users, Products,    │
                                                                    │  Sales, Losses,      │
                                                                    │  Sessions            │
                                                                    └─────────────────────┘
```

### Conversation State Machine

Every user has a session with:
- `currentFlow`: Which flow they are in (ONBOARDING, ADD_PRODUCT, INVENTORY, etc.)
- `step`: Which step within that flow
- `tempData`: Partial data collected so far

Sessions survive server restarts because they are stored in MongoDB.

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | ≥ 18.x | Backend runtime |
| **Express.js** | 4.x | HTTP server + REST API |
| **MongoDB** | 6.x | Database |
| **Mongoose** | 8.x | MongoDB ODM |
| **Twilio** | 4.x | WhatsApp messaging |
| **Google Vision API** | v1 | Invoice OCR (primary) |
| **Tesseract.js** | 5.x | Invoice OCR (fallback, free) |
| **ZXing (zbarimg)** | CLI | Barcode decoding |
| **Open Food Facts** | API | Product database lookup |
| **node-cron** | 3.x | Scheduled alerts |
| **moment.js** | 2.x | Date parsing |
| **sharp** | 0.33 | Image preprocessing |
| **axios** | 1.x | HTTP requests |
| **nodemon** | 3.x | Dev auto-restart |

---

## 📁 Project Structure

```
storemate-ai/
├── src/
│   ├── server.js                    ← Entry point, DB connect, scheduler init
│   ├── api/
│   │   ├── routes.js                ← REST API (admin/testing routes)
│   │   └── inventoryRoutes.js       ← Full CRUD inventory REST API
│   ├── webhook/
│   │   └── messageHandler.js        ← WhatsApp message router (main hub)
│   ├── flows/
│   │   ├── onboardingFlow.js        ← New user setup (name → shop → menu)
│   │   ├── mainMenuFlow.js          ← Main menu + shop selector
│   │   ├── addProductFlow.js        ← Add via invoice/barcode/manual
│   │   ├── inventoryFlow.js         ← View/sell/update/delete/loss
│   │   └── notificationFlow.js     ← Settings + daily summary
│   ├── services/
│   │   ├── twilioService.js         ← Send WhatsApp messages via Twilio
│   │   ├── nlpService.js            ← Hinglish text parser + intent detector
│   │   ├── ocrService.js            ← Google Vision + Tesseract fallback
│   │   ├── barcodeService.js        ← ZXing + Open Food Facts + Vision OCR
│   │   ├── inventoryService.js      ← CRUD operations + daily summary logic
│   │   ├── alertService.js          ← Expiry + low stock alert messages
│   │   └── schedulerService.js      ← Cron jobs (morning/evening/expiry)
│   ├── models/
│   │   ├── User.js                  ← Owner profile + session + shops
│   │   ├── Shop.js                  ← Shop document
│   │   ├── Product.js               ← Product with expiry, qty, alerts
│   │   ├── Loss.js                  ← Loss records with reason
│   │   └── Sale.js                  ← Sale records with revenue
│   ├── state/
│   │   └── sessionManager.js        ← In-memory + MongoDB session store
│   └── utils/
│       ├── hinglishMap.js           ← 80+ Hindi-English word mappings
│       ├── dateParser.js            ← Multi-format date parser
│       ├── navHelper.js             ← Back/home navigation helpers
│       └── imageDownloader.js       ← Download Twilio media to temp/
├── temp/                            ← Temp files (auto-deleted after use)
├── .env.example                     ← Copy to .env and fill values
├── package.json
└── README.md
```

---

## ⚙️ Setup Instructions

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Twilio account with WhatsApp sandbox
- Google Cloud account (optional, for better OCR)
- ngrok (for local development)

### Step 1 — Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/storemate-ai.git
cd storemate-ai
npm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# MongoDB
MONGODB_URI=mongodb://localhost:27017/storemate

# Google Vision API (optional — Tesseract.js used if not set)
GOOGLE_VISION_API_KEY=your_google_vision_api_key

# Server
PORT=3000
NODE_ENV=development
```

### Step 3 — Start MongoDB

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu/Linux
sudo systemctl start mongod

# OR use MongoDB Atlas — just set MONGODB_URI to your Atlas connection string
```

### Step 4 — Install System Dependencies

```bash
# Ubuntu/Debian — for barcode scanning
sudo apt-get install zbar-tools

# macOS
brew install zbar
```

### Step 5 — Set Up Twilio WhatsApp Sandbox

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging → Try it out → Send a WhatsApp message**
3. Send `join <sandbox-keyword>` to the Twilio number from your phone
4. Set webhook URL to: `https://YOUR_NGROK_URL/webhook`

### Step 6 — Expose Local Server (Dev)

```bash
# Install ngrok if needed
npm install -g ngrok

# Start tunnel
ngrok http 3000
```

Copy the `https://` URL and paste it as the Twilio webhook.

### Step 7 — Run the Server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

You should see:
```
✅ MongoDB connected
📅 Scheduler initialised
🚀 StoreMate AI running on port 3000
```

### Step 8 — Test It!

Send **any message** to your Twilio WhatsApp sandbox number. The bot will greet you and start onboarding.

---

## 🌐 API Endpoints

### Inventory Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventory/:shopId` | Get all products (filter + paginate) |
| `GET` | `/api/inventory/:shopId/:productId` | Get single product + sales/losses |
| `POST` | `/api/inventory/:shopId` | Add new product |
| `PUT` | `/api/inventory/:shopId/:productId` | Update product details |
| `DELETE` | `/api/inventory/:shopId/:productId` | Soft-delete product |
| `POST` | `/api/inventory/:shopId/:productId/sale` | Record a sale |
| `POST` | `/api/inventory/:shopId/:productId/loss` | Record a loss |
| `POST` | `/api/inventory/:shopId/:productId/adjust` | Adjust quantity |
| `POST` | `/api/inventory/:shopId/bulk-import` | Import multiple products |
| `POST` | `/api/inventory/:shopId/transfer` | Transfer stock between shops |

### Analytics & Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventory/:shopId/statistics/overview` | Dashboard stats |
| `GET` | `/api/inventory/:shopId/low-stock` | Low stock list |
| `GET` | `/api/inventory/:shopId/expiring` | Expiring soon list |
| `GET` | `/api/inventory/:shopId/top-products` | Best sellers |
| `GET` | `/api/inventory/:shopId/categories` | Category breakdown |
| `GET` | `/api/inventory/:shopId/sales` | Sales history |
| `GET` | `/api/inventory/:shopId/losses` | Loss history |

### Admin & Testing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `GET` | `/api/shops/:userId` | User's shops |
| `POST` | `/api/alert/morning?phone=whatsapp:+91xxx` | Trigger morning alert |
| `POST` | `/api/alert/evening?phone=whatsapp:+91xxx` | Trigger evening alert |
| `POST` | `/api/alert/expiry` | Run expiry check now |
| `GET` | `/health` | Server health check |

---

## 💬 WhatsApp Conversation Flows

### New User Onboarding

```
User → Any message
Bot  → "Namaste! Welcome to StoreMate AI! What is your name?"
User → "Ramesh"
Bot  → "Nice to meet you, Ramesh! What is your shop name?"
User → "Ramesh Kirana Store"
Bot  → "✅ Shop created! Here is the main menu..."
```

### Add Product — 3 Ways

```
METHOD 1: Invoice Photo
─────────────────────────
User → [Photo of invoice]
Bot  → "🔍 Reading invoice..."
Bot  → "✅ Found: Parle-G | 50 units | ₹120 | Exp: Mar 2026. Confirm?"
User → "YES"
Bot  → "✅ Product saved!"

METHOD 2: Barcode Photo
─────────────────────────
User → [Photo of barcode]
Bot  → "Barcode: 8901030616575"
Bot  → "📦 Parle-G Biscuits | Parle | 200g | MRP: ₹10 | Nutri-Score: C"
Bot  → "How many units are you adding?"
User → "50"
...

METHOD 3: Manual Text (Hinglish)
─────────────────────────────────
User → "50 packet Tata salt expiry 12/2026 price 18"
Bot  → "📋 Tata Salt | 50 units | ₹18 | Exp: Dec 2026. Confirm?"
User → "haan"
Bot  → "✅ Saved!"
```

### Mark as Sold

```
User → "2" (View Inventory) → "1" (Mark as Sold)
Bot  → [Shows numbered product list]
User → "3" (selects product 3)
Bot  → "How many units of Tata Salt were sold?"
User → "5"
Bot  → "✅ Sale recorded! 5 units sold. 25 units remaining."
```

### Expiry Alert (Auto-sent)

```
Bot  → "⚠️ Expires in 3 days!
        📦 Maggi Noodles
        🔢 Qty: 40 units
        📅 Expiry: 06 Apr 2026
        
        💡 Offer 10% discount to clear stock!
        
        1️⃣ Mark as Discounted
        2️⃣ Record as Loss
        3️⃣ Dismiss"
```

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | ✅ Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | ✅ Yes | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | ✅ Yes | Twilio WhatsApp number (with `whatsapp:` prefix) |
| `MONGODB_URI` | ✅ Yes | MongoDB connection string |
| `GOOGLE_VISION_API_KEY` | ❌ Optional | Better OCR accuracy. Falls back to Tesseract.js if not set. |
| `OPEN_FOOD_FACTS_API` | ❌ Optional | Defaults to public API |
| `PORT` | ❌ Optional | Server port (default: 3000) |
| `NODE_ENV` | ❌ Optional | `development` or `production` |

---

## 🌐 Hinglish Support

StoreMate AI understands a mix of Hindi and English. Here are examples:

### Numbers (Hindi)

| Hindi | Meaning |
|-------|---------|
| ek | 1 |
| do | 2 |
| das | 10 |
| bis | 20 |
| sau | 100 |

### Actions

| Hinglish | English |
|----------|---------|
| jodo / add karo / daalo | add |
| hatao / nikalo | remove |
| becho / becha | sell / sold |
| dikhao / dekho | show |
| cancel karo | cancel |

### Inventory Terms

| Hinglish | English |
|----------|---------|
| saman / maal / cheez | product |
| matra / kitna / kitne | quantity |
| peti / dabba | box |
| khatam / expire | expiry |

### Time Expressions

| Hinglish | English |
|----------|---------|
| aaj | today |
| kal | tomorrow |
| agle mahine | next month |
| is saal | this year |

### Date Formats Supported

```
MM/YYYY       → 03/2026
DD-MM-YYYY    → 15-03-2026
Month YYYY    → March 2026
DD Month YYYY → 5 April 2026
next month    → End of next month
skip          → No expiry
```

---

## 📊 Data Models

### User
```javascript
{
  phoneNumber: String,       // WhatsApp number (primary key)
  ownerName: String,
  shops: [{ shopId, shopName, isActive }],
  activeShopId: ObjectId,
  notificationSettings: {
    morningTime: "08:00",    // HH:MM 24h format
    eveningTime: "21:00",
    enabled: Boolean
  },
  sessionState: {
    currentFlow: String,     // ONBOARDING, ADD_PRODUCT, INVENTORY, etc.
    step: String,            // Current step in flow
    tempData: Object         // Partial data collected
  },
  isOnboarded: Boolean
}
```

### Product
```javascript
{
  shopId: ObjectId,
  name: String,
  brand: String,
  barcode: String,
  category: String,
  quantity: Number,
  price: Number,
  expiryDate: Date,
  addedVia: "invoice" | "barcode" | "manual",
  lowStockAlerted: Boolean,
  expiryAlertSent: ["7days", "3days", "1day"],
  isDiscounted: Boolean,
  discountPercent: Number,
  isActive: Boolean
}
```

---

## 🚨 Troubleshooting

### Messages not received?

```bash
# Check Twilio webhook URL is set correctly
# Make sure ngrok is running and URL matches
# Verify phone joined the sandbox (send 'join <keyword>')
```

### Barcode not scanning?

```bash
# Install zbar tools
sudo apt-get install zbar-tools   # Ubuntu
brew install zbar                 # macOS

# Make sure barcode image is clear and well-lit
```

### OCR not working well?

```bash
# Add Google Vision API key to .env for better accuracy
# Without it, Tesseract.js is used (free but less accurate)
GOOGLE_VISION_API_KEY=your_key_here
```

### MongoDB connection error?

```bash
# Check MongoDB is running
sudo systemctl status mongod

# Or verify Atlas URI in .env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/storemate
```

### Sessions getting lost?

Sessions are stored in both memory (fast) and MongoDB (persistent). If sessions are lost after restart, check MongoDB write permissions.

---

## 🧪 Running Tests

```bash
# Test morning alert for a user
curl -X POST "http://localhost:3000/api/alert/morning?phone=whatsapp:+91XXXXXXXXXX"

# Test expiry check
curl -X POST "http://localhost:3000/api/alert/expiry"

# Check server health
curl http://localhost:3000/health
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is built for the hackathon submission. All rights reserved by Team NextGen.

---

## 👥 Team

| Name | Role |
|------|------|
| **Aditi Raj** | Team Leader — Backend Architecture, NLP, Flows |
| **Piyush Yadav** | Team Member — OCR, Barcode Service, API, Database |

**Team Name:** NextGen

**Track:** Hack 'N' Solve

---

## 🎯 Impact Summary

> StoreMate AI empowers 63 million small shop owners in India with professional inventory management — delivered through the one app they already use every day: WhatsApp. No downloads, no training, no barriers.

```
📦 Track stock  →  📅 Get expiry alerts  →  💰 Record sales  →  📊 See daily reports
                     All through WhatsApp. All in Hinglish.
```

---

<div align="center">

Made with ❤️ by **Team NextGen**

*"Manage your dukaan, one WhatsApp message at a time."*

</div>
