const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  unitsSold: { type: Number, required: true },
  pricePerUnit: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  saleDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', saleSchema);
