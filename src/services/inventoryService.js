const Product = require('../models/Product');
const Loss = require('../models/Loss');
const Sale = require('../models/Sale');
const { sendMessage } = require('./twilioService');
const { formatDate, daysUntil } = require('../utils/dateParser');

/**
 * Add a new product to a shop
 */
async function addProduct(shopId, data) {
  const product = new Product({
    shopId,
    name: data.name,
    brand: data.brand || '',
    barcode: data.barcode || '',
    category: data.category || '',
    quantity: data.quantity || 0,
    price: data.price || 0,
    expiryDate: data.expiryDate || null,
    addedVia: data.addedVia || 'manual'
  });
  await product.save();
  return product;
}

/**
 * Get all active products for a shop
 */
async function getProducts(shopId) {
  return Product.find({ shopId, isActive: true }).sort({ createdAt: -1 });
}

/**
 * Update product quantity
 */
async function updateQuantity(productId, newQty) {
  return Product.findByIdAndUpdate(
    productId,
    { quantity: newQty, updatedAt: new Date() },
    { new: true }
  );
}

/**
 * Record a sale — decrements quantity and saves sale record
 * Returns { product, sale, isLowStock }
 */
async function recordSale(shopId, productId, unitsSold) {
  const product = await Product.findById(productId);
  if (!product) throw new Error('Product not found');

  const newQty = Math.max(0, product.quantity - unitsSold);
  product.quantity = newQty;
  await product.save();

  const sale = new Sale({
    shopId,
    productId,
    productName: product.name,
    unitsSold,
    pricePerUnit: product.price,
    totalAmount: unitsSold * product.price
  });
  await sale.save();

  const isLowStock = newQty <= 3;
  return { product, sale, isLowStock };
}

/**
 * Record a loss
 */
async function recordLoss(shopId, productId, unitsLost, reason) {
  const product = await Product.findById(productId);
  if (!product) throw new Error('Product not found');

  const newQty = Math.max(0, product.quantity - unitsLost);
  product.quantity = newQty;
  if (reason === 'expired') product.isActive = false;
  await product.save();

  const loss = new Loss({
    shopId,
    productId,
    productName: product.name,
    unitsLost,
    pricePerUnit: product.price,
    estimatedLoss: unitsLost * product.price,
    reason
  });
  await loss.save();

  return { product, loss };
}

/**
 * Delete a product (soft delete)
 */
async function deleteProduct(productId) {
  return Product.findByIdAndUpdate(productId, { isActive: false });
}

/**
 * Get daily summary stats for a shop
 */
async function getDailySummary(shopId) {
  const products = await Product.find({ shopId, isActive: true });
  const today = new Date();

  const lowStock = products.filter(p => p.quantity <= 3);
  const expiring7 = products.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 7 && daysUntil(p.expiryDate) >= 0);
  const expiring3 = products.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 3 && daysUntil(p.expiryDate) >= 0);
  const expiring1 = products.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 1 && daysUntil(p.expiryDate) >= 0);

  // Today's sales
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const todaySales = await Sale.find({ shopId, saleDate: { $gte: startOfDay } });
  const totalSold = todaySales.reduce((sum, s) => sum + s.unitsSold, 0);
  const totalRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);

  return {
    totalProducts: products.length,
    lowStock,
    expiring7,
    expiring3,
    expiring1,
    todaySales: todaySales.length,
    totalSold,
    totalRevenue,
    products
  };
}

/**
 * Format inventory list as WhatsApp message
 */
function formatInventoryList(products) {
  if (!products.length) return 'No products found in inventory.';

  return products.map((p, i) => {
    const expStr = p.expiryDate ? `| Exp: ${formatDate(p.expiryDate)}` : '';
    const lowStr = p.quantity <= 3 ? ' ⚠️' : '';
    return `${i + 1}. ${p.name} — ${p.quantity} units ${expStr}${lowStr}`;
  }).join('\n');
}

module.exports = {
  addProduct,
  getProducts,
  updateQuantity,
  recordSale,
  recordLoss,
  deleteProduct,
  getDailySummary,
  formatInventoryList
};
