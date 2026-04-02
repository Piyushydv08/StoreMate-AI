const mongoose = require('mongoose');

const lossSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  unitsLost: { type: Number, required: true },
  pricePerUnit: { type: Number, default: 0 },
  estimatedLoss: { type: Number, default: 0 },
  reason: {
    type: String,
    enum: ['expired', 'damaged', 'stolen', 'other'],
    required: true
  },
  recordedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Loss', lossSchema);
