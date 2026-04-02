const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  shopName: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: ''
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Shop', shopSchema);
