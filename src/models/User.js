const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  ownerName: {
    type: String,
    default: null
  },
  shops: [
    {
      shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
      shopName: { type: String },
      isActive: { type: Boolean, default: true }
    }
  ],
  activeShopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    default: null
  },
  preferredLanguage: {
    type: String,
    enum: ['en', 'hi'],
    default: 'en'
  },
  notificationSettings: {
    morningTime: { type: String, default: '08:00' },  // HH:MM 24h
    eveningTime: { type: String, default: '20:00' },
    enabled: { type: Boolean, default: true }
  },
  sessionState: {
    currentFlow: { type: String, default: null },
    step: { type: String, default: null },
    tempData: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  isOnboarded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
