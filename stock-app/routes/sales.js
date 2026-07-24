const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Customer: place an order
// body: { items: [{ productId, quantity }] }
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { items, paymentMethod, paymentReference } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Add at least one product to buy." });
    }
    const allowedMethods = ["cod", "card", "wallet"];
    const method = allowedMethods.includes(paymentMethod) ? paymentMethod : "cod";

    let saleDoc;

    await session.withTransaction(async () => {
      const saleItems = [];
      let total = 0;

      for (const line of items) {
        const product = await Product.findById(line.productId).session(session);
        if (!product || !product.active) {
          throw new Error(`Product not found or unavailable.`);
        }
        const qty = Number(line.quantity) || 0;
        if (qty <= 0) throw new Error(`Invalid quantity for ${product.name}.`);
        if (product.stock < qty) {
          throw new Error(`Not enough stock for "${product.name}". Only ${product.stock} left.`);
        }

        product.stock -= qty;
        await product.save({ session });

        const subtotal = qty * product.price;
        total += subtotal;
        saleItems.push({
          product: product._id,
          name: product.name,
          unitPrice: product.price,
          quantity: qty,
          subtotal,
        });
      }

      const created = await Sale.create(
        [{
          customer: req.user.id,
          items: saleItems,
          total,
          paymentMethod: method,
          paymentReference: (paymentReference || "").slice(0, 40),
        }],
        { session }
      );
      saleDoc = created[0];
    });

    res.status(201).json(saleDoc);
  } catch (err) {
    res.status(400).json({ message: err.message || "Could not complete purchase." });
  } finally {
    session.endSession();
  }
});

// Customer: view own order history
router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const sales = await Sale.find({ customer: req.user.id }).sort({ createdAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: "Could not load your orders.", error: err.message });
  }
});

// Admin: view all sales (optionally filter by date range with ?from=&to=)
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const sales = await Sale.find(filter).populate("customer", "name email").sort({ createdAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: "Could not load sales.", error: err.message });
  }
});

// Admin: today's summary (total revenue, order count, units sold)
router.get("/summary/today", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const sales = await Sale.find({
      createdAt: { $gte: start, $lte: end },
      status: "completed",
    });

    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    const unitsSold = sales.reduce(
      (sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0),
      0
    );

    res.json({ ordersToday: sales.length, revenueToday: revenue, unitsSoldToday: unitsSold });
  } catch (err) {
    res.status(500).json({ message: "Could not load today's summary.", error: err.message });
  }
});

module.exports = router;
