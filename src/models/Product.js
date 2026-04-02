const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true
  },
  name: { type: String, required: true },
  brand: { type: String, default: '' },
  barcode: { type: String, default: '' },
  category: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  expiryDate: { type: Date, default: null },
  addedVia: {
    type: String,
    enum: ['invoice', 'barcode', 'manual'],
    default: 'manual'
  },
  lowStockAlerted: { type: Boolean, default: false },
  expiryAlertSent: {
    type: [String],  // e.g. ['7days', '3days', '1day']
    default: []
  },
  isDiscounted: { type: Boolean, default: false },
  discountPercent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Product', productSchema);
