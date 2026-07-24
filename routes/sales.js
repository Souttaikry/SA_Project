const express = require("express");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const { requireAuth, requireRole } = require("../middleware/auth");
const QRCode = require("qrcode");
const axios = require("axios");

const router = express.Router();

// ---------- Helper: generate KHQR string ----------
async function generateKHQR({ amount, billNumber }) {
  const { BakongKHQR, khqrData, IndividualInfo } = await import("bakong-khqr");

  const optionalData = {
    currency: khqrData.currency.usd,
    amount: amount,
    billNumber: billNumber,
    storeLabel: "COSTME",
    terminalLabel: "Web",
  };

  const individualInfo = new IndividualInfo(
    "YOUR_BAKONG_ACCOUNT_ID",
    "COSTME",
    "Phnom Penh",
    optionalData
  );

  const khqr = new BakongKHQR();
  const response = khqr.generateIndividual(individualInfo);
  return response.data.qr;
}

// ---------- Helper: notify Telegram ----------
async function notifyTelegram(saleDoc) {
  const itemsList = saleDoc.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const text = `🛒 New Sale!\nItems: ${itemsList}\nTotal: $${saleDoc.total.toFixed(2)}\nPayment: ${saleDoc.paymentMethod}`;
  console.log("TOKEN:", process.env.TELEGRAM_BOT_TOKEN);
  console.log("CHAT ID:", process.env.TELEGRAM_CHAT_ID);
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
    });
  } catch (err) {
    console.error("Telegram notify failed:", err.message);
  }
}

// Customer: place an order
// body: { items: [{ productId, quantity }] }
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { items, paymentMethod, paymentReference } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Add at least one product to buy." });
    }
    const allowedMethods = ["cod", "card", "wallet"];
    const method = allowedMethods.includes(paymentMethod) ? paymentMethod : "cod";

    const saleItems = [];
    let total = 0;

    for (const line of items) {
      const product = await Product.findById(line.productId);
      if (!product || !product.active) {
        throw new Error(`Product not found or unavailable.`);
      }
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) throw new Error(`Invalid quantity for ${product.name}.`);
      if (product.stock < qty) {
        throw new Error(`Not enough stock for "${product.name}". Only ${product.stock} left.`);
      }

      product.stock -= qty;
      await product.save();

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

    const saleDoc = await Sale.create({
      customer: req.user.id,
      items: saleItems,
      total,
      paymentMethod: method,
      paymentReference: (paymentReference || "").slice(0, 40),
    });

    // Generate KHQR for wallet payments
    if (method === "wallet") {
      const qrString = await generateKHQR({ amount: total, billNumber: saleDoc._id.toString() });
      const qrImage = await QRCode.toDataURL(qrString);
      saleDoc._doc.qrImage = qrImage;
    }

    // Notify Telegram (fire-and-forget, doesn't block the response)
    notifyTelegram(saleDoc);

    res.status(201).json(saleDoc);
  } catch (err) {
    res.status(400).json({ message: err.message || "Could not complete purchase." });
  }
});

// Admin: list all sales (most recent first)
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 }).populate("customer", "name");
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: "Could not load sales." });
  }
});

// Admin: today's revenue/orders/units summary, plus data for the dashboard popups
router.get("/summary/today", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sales = await Sale.find({ createdAt: { $gte: startOfDay }, status: "completed" })
      .sort({ createdAt: -1 })
      .populate("customer", "name");

    let revenueToday = 0;
    let unitsSoldToday = 0;
    const revenueByPayment = { cod: 0, card: 0, wallet: 0 };
    const unitsByProductMap = {};

    const orders = sales.map((s) => {
      revenueToday += s.total;
      revenueByPayment[s.paymentMethod] = (revenueByPayment[s.paymentMethod] || 0) + s.total;

      s.items.forEach((i) => {
        unitsSoldToday += i.quantity;
        if (!unitsByProductMap[i.name]) {
          unitsByProductMap[i.name] = { name: i.name, quantity: 0, revenue: 0 };
        }
        unitsByProductMap[i.name].quantity += i.quantity;
        unitsByProductMap[i.name].revenue += i.subtotal;
      });

      return {
        time: s.createdAt,
        customerName: s.customer ? s.customer.name : "—",
        items: s.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        total: s.total,
        paymentMethod: s.paymentMethod,
        paymentReference: s.paymentReference,
        status: s.status,
      };
    });

    const unitsByProduct = Object.values(unitsByProductMap).sort((a, b) => b.quantity - a.quantity);

    res.json({
      revenueToday,
      ordersToday: sales.length,
      unitsSoldToday,
      revenueByPayment,
      orders,
      unitsByProduct,
    });
  } catch (err) {
    res.status(500).json({ message: "Could not load today's summary." });
  }
});

module.exports = router;

module.exports = router;