# 🏪 StoreMate AI — WhatsApp Inventory Management System

A complete WhatsApp-based inventory management system built with Node.js, Express, MongoDB, and Twilio.

---

## 📁 Project Structure

```
storemate-ai/
├── src/
│   ├── server.js                    ← Entry point
│   ├── api/
│   │   └── routes.js                ← REST API routes
│   ├── webhook/
│   │   └── messageHandler.js        ← WhatsApp message router
│   ├── flows/
│   │   ├── onboardingFlow.js        ← New user setup
│   │   ├── mainMenuFlow.js          ← Main menu + shop selector
│   │   ├── addProductFlow.js        ← Add via invoice/barcode/manual
│   │   ├── inventoryFlow.js         ← View/sell/update/delete/loss
│   │   └── notificationFlow.js     ← Settings + daily summary
│   ├── services/
│   │   ├── twilioService.js         ← Send WhatsApp messages
│   │   ├── nlpService.js            ← Text parser (Hinglish)
│   │   ├── ocrService.js            ← Google Vision + Tesseract
│   │   ├── barcodeService.js        ← ZXing + Open Food Facts
│   │   ├── inventoryService.js      ← CRUD operations
│   │   ├── alertService.js          ← Expiry/stock alerts
│   │   └── schedulerService.js      ← Cron jobs
│   ├── models/
│   │   ├── User.js
│   │   ├── Shop.js
│   │   ├── Product.js
│   │   ├── Loss.js
│   │   └── Sale.js
│   ├── state/
│   │   └── sessionManager.js        ← Conversation state machine
│   └── utils/
│       ├── hinglishMap.js           ← Hinglish word mappings
│       ├── dateParser.js            ← Date parsing utilities
│       └── imageDownloader.js       ← Download Twilio media files
├── temp/                            ← Temp image files (auto-created)
├── .env.example                     ← Copy to .env and fill in values
├── package.json
└── README.md
```

---

## ⚙️ Setup Instructions

### Step 1: Install Dependencies

```bash
cd storemate-ai
npm install
```

### Step 2: Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `MONGODB_URI` — Your MongoDB connection string
- `TWILIO_ACCOUNT_SID` — From Twilio Console
- `TWILIO_AUTH_TOKEN` — From Twilio Console
- `TWILIO_WHATSAPP_NUMBER` — Twilio sandbox number (whatsapp:+14155238886)
- `GOOGLE_VISION_API_KEY` — From Google Cloud Console (optional, falls back to Tesseract)

### Step 3: Set Up MongoDB

Make sure MongoDB is running locally:
```bash
# macOS with Homebrew
brew services start mongodb-community

# Ubuntu/Linux
sudo systemctl start mongod

# OR use MongoDB Atlas (cloud) — just set your MONGODB_URI
```

### Step 4: Set Up Twilio WhatsApp Sandbox

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging → Try it out → Send a WhatsApp message**
3. Follow instructions to join the sandbox (send "join [sandbox-keyword]" to the Twilio number)
4. Set the webhook URL to: `https://your-domain.com/webhook`

### Step 5: Expose Your Local Server (Development)

Use [ngrok](https://ngrok.com) to expose your local server:
```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and set it as the Twilio webhook URL.

### Step 6: Run the Server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/products/:shopId` | Get all products |
| POST | `/api/products` | Add a product |
| PUT | `/api/products/:id` | Update a product |
| DELETE | `/api/products/:id` | Delete a product |
| GET | `/api/summary/:shopId` | Daily summary |
| GET | `/api/expiring/:shopId?days=7` | Expiring products |
| GET | `/api/lowstock/:shopId` | Low stock products |
| GET | `/api/losses/:shopId` | Loss report |
| GET | `/api/sales/:shopId` | Sales history |
| GET | `/api/users` | All users (admin) |
| GET | `/api/shops/:userId` | User's shops |
| POST | `/api/alert/morning?phone=whatsapp:+91xxx` | Test morning alert |
| POST | `/api/alert/evening?phone=whatsapp:+91xxx` | Test evening alert |
| POST | `/api/alert/expiry` | Trigger expiry check |

---

## 💬 WhatsApp Conversation Flows

### First-Time User
```
User messages → Ask name → Ask shop name → Main Menu
```

### Add Product (3 ways)
```
1. Invoice Photo → OCR → Extract details → Confirm → Save
2. Barcode Photo → ZXing decode → Food Facts lookup → Add qty/expiry → Confirm → Save
3. Manual text → NLP parse → Fill missing fields → Confirm → Save
```

### Sell Product
```
View Inventory → Mark as Sold → Select Product → Enter Qty → Saved + Low Stock Alert if needed
```

### Notifications (Scheduler)
- ☀️ **Morning**: Daily summary at user's set morning time
- 🌙 **Evening**: Expiry alerts at user's set evening time
- 📅 **Expiry check**: Runs daily at 8AM for 7/3/1 day alerts

---

## 🔧 Key Features

- ✅ Multi-shop support per owner
- ✅ Hinglish NLP (mix of Hindi + English)
- ✅ OCR from invoice photos (Google Vision + Tesseract fallback)
- ✅ Barcode scanning (ZXing + Open Food Facts API)
- ✅ Stateful conversations (survives disconnections)
- ✅ Per-user notification scheduling
- ✅ Low stock alerts (fires immediately at qty ≤ 3)
- ✅ Expiry alerts at 7, 3, and 1 day before
- ✅ Loss tracking with reason codes
- ✅ Sales tracking with revenue calculation
- ✅ Daily morning + evening summaries
- ✅ Smart discount suggestions near expiry

---

## 📦 Tech Stack

| Tool | Purpose |
|------|---------|
| Node.js + Express | Backend server |
| MongoDB + Mongoose | Database |
| Twilio | WhatsApp messaging |
| Google Vision API | Invoice OCR (primary) |
| Tesseract.js | Invoice OCR (fallback) |
| ZXing | Barcode decoding |
| Open Food Facts | Product database via barcode |
| node-cron | Scheduled alerts |
| moment.js | Date parsing |
| Jimp | Image preprocessing |
| axios | HTTP requests |

---

## 🚨 Troubleshooting

**Messages not received?**
- Check that your ngrok URL is set as the Twilio webhook
- Make sure your phone joined the sandbox

**OCR not working?**
- Verify `GOOGLE_VISION_API_KEY` is set in `.env`
- If not set, Tesseract.js will be used automatically

**Barcode not scanning?**
- Ensure barcode is clear, well-lit, and fully visible in the photo
- ZXing supports EAN-13, EAN-8, QR Code, Code 128, and more

**MongoDB errors?**
- Make sure `mongod` service is running
- Check your `MONGODB_URI` in `.env`
