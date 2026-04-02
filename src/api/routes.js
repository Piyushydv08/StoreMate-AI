/**
 * routes.js
 * REST API routes for internal use, admin, and testing.
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Loss = require('../models/Loss');
const Sale = require('../models/Sale');
const { sendMorningSummary, sendEveningSummary, sendExpiryAlerts } = require('../services/alertService');
const { getDailySummary, getExpiringProducts, getLowStockProducts } = require('../services/inventoryService');

// ── Products ──────────────────────────────────────────────────────────────────

// GET /api/products/:shopId — Get all products for a shop
router.get('/products/:shopId', async (req, res) => {
  try {
    const products = await Product.find({ shopId: req.params.shopId, isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, count: products.length, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products — Add a product directly
router.post('/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    await Shop.findByIdAndUpdate(req.body.shopId, { $push: { products: product._id } });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id — Update a product
router.put('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/products/:id — Soft delete a product
router.delete('/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { $set: { isActive: false } });
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

// GET /api/summary/:shopId — Get daily summary data
router.get('/summary/:shopId', async (req, res) => {
  try {
    const summary = await getDailySummary(req.params.shopId);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expiring/:shopId?days=7 — Get expiring products
router.get('/expiring/:shopId', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const products = await getExpiringProducts(req.params.shopId, days);
    res.json({ success: true, count: products.length, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/lowstock/:shopId — Get low stock products
router.get('/lowstock/:shopId', async (req, res) => {
  try {
    const products = await getLowStockProducts(req.params.shopId);
    res.json({ success: true, count: products.length, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Losses ────────────────────────────────────────────────────────────────────

// GET /api/losses/:shopId — Get loss report
router.get('/losses/:shopId', async (req, res) => {
  try {
    const losses = await Loss.find({ shopId: req.params.shopId }).sort({ recordedAt: -1 });
    const totalLoss = losses.reduce((sum, l) => sum + l.estimatedLoss, 0);
    res.json({ success: true, count: losses.length, totalLoss, losses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Sales ─────────────────────────────────────────────────────────────────────

// GET /api/sales/:shopId — Get sales history
router.get('/sales/:shopId', async (req, res) => {
  try {
    const sales = await Sale.find({ shopId: req.params.shopId }).sort({ saleDate: -1 });
    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    res.json({ success: true, count: sales.length, totalRevenue, sales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Users & Shops ─────────────────────────────────────────────────────────────

// GET /api/users — List all users (admin)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-sessionState');
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/shops/:userId — Get shops for a user
router.get('/shops/:userId', async (req, res) => {
  try {
    const shops = await Shop.find({ ownerId: req.params.userId });
    res.json({ success: true, shops });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Alert Testing ─────────────────────────────────────────────────────────────

// POST /api/alert/morning?phone=whatsapp:+91xxxxxxxxxx
router.post('/alert/morning', async (req, res) => {
  try {
    const phone = req.query.phone;
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    await sendMorningSummary(phone, user.ownerName);
    res.json({ success: true, message: 'Morning summary sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alert/evening?phone=whatsapp:+91xxxxxxxxxx
router.post('/alert/evening', async (req, res) => {
  try {
    const phone = req.query.phone;
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    await sendEveningSummary(phone, user.ownerName);
    res.json({ success: true, message: 'Evening summary sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alert/expiry — Trigger expiry check for all users
router.post('/alert/expiry', async (req, res) => {
  try {
    await sendExpiryAlerts();
    res.json({ success: true, message: 'Expiry alerts processed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

module.exports = router;
