const session = requireRoleOrRedirect("customer");
if (session) {
  document.getElementById("userName").textContent = session.user.name;
  document.getElementById("footerEmail").textContent = session.user.email;
}

const GRADIENTS = [
  ["#cfe8b0", "#a7d9e8"],
  ["#f7d6e0", "#f9e79f"],
  ["#c9e4de", "#f6cccb"],
  ["#ffe8d6", "#d0f4de"],
  ["#e0c3fc", "#8ec5fc"],
  ["#fbc4ab", "#ffe5d9"],
];

let allProducts = [];
let ratingSummary = {}; // { productId: { avg, count } }
let activeCategory = "All";
let searchTerm = "";
let cart = []; // [{ productId, name, price, quantity, stock, gradient }]
let wishlist = JSON.parse(localStorage.getItem("stockledger_wishlist") || "[]");
let cartStep = "cart"; // 'cart' | 'payment' | 'success'
let activeProductId = null; // product currently open in the detail modal

function gradientFor(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % GRADIENTS.length;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function starString(rating) {
  const full = Math.round(rating);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ---------- View switching (Shop / Orders) ---------- */
document.querySelectorAll(".shop-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".shop-nav a").forEach((a) => a.classList.remove("active"));
    link.classList.add("active");
    const view = link.dataset.view;
    document.getElementById("shopView").style.display = view === "shop" ? "block" : "none";
    document.getElementById("ordersView").style.display = view === "orders" ? "block" : "none";
    if (view === "orders") loadOrders();
  });
});

/* ---------- Search ---------- */
document.getElementById("searchToggle").addEventListener("click", () => {
  const bar = document.getElementById("searchBar");
  bar.style.display = bar.style.display === "none" ? "block" : "none";
  if (bar.style.display === "block") document.getElementById("searchInput").focus();
});
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderProducts();
});

/* ---------- Categories ---------- */
function renderCategories() {
  const cats = ["All", ...new Set(allProducts.map((p) => p.category || "General"))];
  const row = document.getElementById("catRow");
  row.innerHTML = cats.map((c) => `
    <div class="cat-pill ${c === activeCategory ? "active" : ""}" data-cat="${escapeHtml(c)}">
      <span class="dot"></span>${escapeHtml(c)}
    </div>
  `).join("");
  row.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      activeCategory = pill.dataset.cat;
      renderCategories();
      renderProducts();
    });
  });
}

/* ---------- Product grid ---------- */
function renderProducts() {
  const grid = document.getElementById("productGrid");
  const empty = document.getElementById("productEmpty");

  let list = allProducts;
  if (activeCategory !== "All") list = list.filter((p) => (p.category || "General") === activeCategory);
  if (searchTerm) list = list.filter((p) => p.name.toLowerCase().includes(searchTerm));

  if (list.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  grid.innerHTML = list.map((p) => {
    const [a, b] = gradientFor(p.sku || p.name);
    const isOut = p.stock <= 0;
    const isWished = wishlist.includes(p._id);
    const rating = ratingSummary[p._id];

    return `
      <div class="shop-card">
        <div class="shop-card-media" data-view="${p._id}" style="--card-a:${a}; --card-b:${b};">
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" />` : escapeHtml(p.name)}
          <div class="stock-flag ${isOut ? "out" : ""}">${isOut ? "Out of stock" : p.stock + " left"}</div>
          <button class="wish-btn ${isWished ? "active" : ""}" data-id="${p._id}">♥</button>
          <button class="add-btn" data-id="${p._id}" ${isOut ? "disabled" : ""}>+</button>
        </div>
        <div class="shop-card-body">
          <div class="shop-card-name" data-view="${p._id}">${escapeHtml(p.name)}</div>
          <div class="shop-card-sub">${escapeHtml(p.category || "General")}</div>
          ${rating ? `<div class="card-rating"><span class="stars">${starString(rating.avg)}</span><span class="count">(${rating.count})</span></div>` : ""}
          <div class="shop-card-price">${money(p.price)}</div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); addToCart(btn.dataset.id); });
  });
  grid.querySelectorAll(".wish-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleWish(btn.dataset.id); });
  });
  grid.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => openProductDetail(el.dataset.view));
  });
}

function toggleWish(id) {
  if (wishlist.includes(id)) wishlist = wishlist.filter((w) => w !== id);
  else wishlist.push(id);
  localStorage.setItem("stockledger_wishlist", JSON.stringify(wishlist));
  renderProducts();
}

/* ---------- Product detail modal ---------- */
async function openProductDetail(productId) {
  const p = allProducts.find((x) => x._id === productId);
  if (!p) return;
  activeProductId = productId;

  const [a, b] = gradientFor(p.sku || p.name);
  const media = document.getElementById("pdMedia");
  media.style.setProperty("--card-a", a);
  media.style.setProperty("--card-b", b);
  media.innerHTML = p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" />` : escapeHtml(p.name);

  document.getElementById("pdCategory").textContent = p.category || "General";
  document.getElementById("pdName").textContent = p.name;
  document.getElementById("pdPrice").textContent = money(p.price);
  document.getElementById("pdStock").textContent = p.stock > 0 ? `${p.stock} in stock` : "Out of stock";
  document.getElementById("pdDesc").textContent = p.description || "No description provided yet.";
  document.getElementById("pdQtyValue").textContent = "1";

  const rating = ratingSummary[productId];
  document.getElementById("pdRatingSummary").innerHTML = rating
    ? `<span>${starString(rating.avg)}</span><span>${rating.avg}</span><span class="count">(${rating.count} review${rating.count === 1 ? "" : "s"})</span>`
    : `<span class="count">No reviews yet — be the first.</span>`;

  document.getElementById("pdAddBtn").disabled = p.stock <= 0;

  resetStarInput();
  document.getElementById("pdComment").value = "";
  document.getElementById("pdReviewList").innerHTML = `<div class="review-empty">Loading reviews…</div>`;

  document.getElementById("pdBackdrop").classList.add("show");

  try {
    const reviews = await apiFetch(`/api/reviews/${productId}`);
    renderReviewList(reviews);
  } catch (err) {
    document.getElementById("pdReviewList").innerHTML = `<div class="review-empty">Could not load reviews.</div>`;
  }
}

function renderReviewList(reviews) {
  const list = document.getElementById("pdReviewList");
  if (reviews.length === 0) {
    list.innerHTML = `<div class="review-empty">No reviews yet — be the first to share your thoughts.</div>`;
    return;
  }
  list.innerHTML = reviews.map((r) => `
    <div class="review-row">
      <div class="review-top">
        <span class="review-name">${escapeHtml(r.customerName)}</span>
        <span class="review-date">${new Date(r.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="review-stars">${starString(r.rating)}</div>
      ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ""}
    </div>
  `).join("");
}

document.getElementById("pdClose").addEventListener("click", closeProductDetail);
document.getElementById("pdBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "pdBackdrop") closeProductDetail();
});
function closeProductDetail() {
  document.getElementById("pdBackdrop").classList.remove("show");
  activeProductId = null;
}

document.getElementById("pdQtyMinus").addEventListener("click", () => {
  const el = document.getElementById("pdQtyValue");
  el.textContent = Math.max(1, parseInt(el.textContent, 10) - 1);
});
document.getElementById("pdQtyPlus").addEventListener("click", () => {
  const p = allProducts.find((x) => x._id === activeProductId);
  const el = document.getElementById("pdQtyValue");
  const next = parseInt(el.textContent, 10) + 1;
  el.textContent = p && next > p.stock ? p.stock : next;
});
document.getElementById("pdAddBtn").addEventListener("click", () => {
  const qty = parseInt(document.getElementById("pdQtyValue").textContent, 10) || 1;
  addToCart(activeProductId, qty);
});

/* Star input for writing a review */
function resetStarInput() {
  document.querySelectorAll("#pdStarInput span").forEach((s) => s.classList.remove("filled"));
  document.getElementById("pdStarInput").dataset.value = "0";
}
document.querySelectorAll("#pdStarInput span").forEach((star) => {
  star.addEventListener("click", () => {
    const v = parseInt(star.dataset.v, 10);
    document.getElementById("pdStarInput").dataset.value = v;
    document.querySelectorAll("#pdStarInput span").forEach((s) => {
      s.classList.toggle("filled", parseInt(s.dataset.v, 10) <= v);
    });
  });
});

document.getElementById("pdSubmitReview").addEventListener("click", async () => {
  const rating = parseInt(document.getElementById("pdStarInput").dataset.value || "0", 10);
  const comment = document.getElementById("pdComment").value.trim();

  if (!rating) {
    toast("Pick a star rating first.", true);
    return;
  }
  try {
    await apiFetch("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ productId: activeProductId, rating, comment }),
    });
    toast("Review submitted — thank you!");
    const [reviews, summary] = await Promise.all([
      apiFetch(`/api/reviews/${activeProductId}`),
      apiFetch("/api/reviews/summary"),
    ]);
    ratingSummary = summary;
    renderReviewList(reviews);
    const r = ratingSummary[activeProductId];
    document.getElementById("pdRatingSummary").innerHTML = r
      ? `<span>${starString(r.avg)}</span><span>${r.avg}</span><span class="count">(${r.count} review${r.count === 1 ? "" : "s"})</span>`
      : "";
    renderProducts();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- Cart ---------- */
function addToCart(productId, quantity = 1) {
  const product = allProducts.find((p) => p._id === productId);
  if (!product || product.stock <= 0) return;

  const line = cart.find((l) => l.productId === productId);
  if (line) {
    const next = line.quantity + quantity;
    if (next > product.stock) {
      toast(`Only ${product.stock} of "${product.name}" available.`, true);
      line.quantity = product.stock;
    } else {
      line.quantity = next;
    }
  } else {
    const [a, b] = gradientFor(product.sku || product.name);
    cart.push({
      productId,
      name: product.name,
      price: product.price,
      quantity: Math.min(quantity, product.stock),
      stock: product.stock,
      gradient: [a, b],
    });
  }
  toast(`Added "${product.name}" to cart.`);
  renderCart();
}

function changeQty(productId, delta) {
  const line = cart.find((l) => l.productId === productId);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity <= 0) {
    cart = cart.filter((l) => l.productId !== productId);
  } else if (line.quantity > line.stock) {
    line.quantity = line.stock;
    toast(`Only ${line.stock} available.`, true);
  }
  renderCart();
}

function removeLine(productId) {
  cart = cart.filter((l) => l.productId !== productId);
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

function renderCart() {
  const itemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const totalEl = document.getElementById("cartTotal");

  const count = cart.reduce((n, l) => n + l.quantity, 0);
  countEl.textContent = count;
  countEl.style.display = count > 0 ? "flex" : "none";

  if (cart.length === 0) {
    itemsEl.innerHTML = `<div class="cart-empty">Your cart is empty. Add something from the shop.</div>`;
  } else {
    itemsEl.innerHTML = cart.map((l) => `
      <div class="cart-line">
        <div class="cart-line-swatch" style="--card-a:${l.gradient[0]}; --card-b:${l.gradient[1]};"></div>
        <div class="cart-line-info">
          <div class="cart-line-name">${escapeHtml(l.name)}</div>
          <div class="cart-line-price">${money(l.price)} each</div>
        </div>
        <div class="cart-qty">
          <button data-id="${l.productId}" data-delta="-1">−</button>
          <span>${l.quantity}</span>
          <button data-id="${l.productId}" data-delta="1">+</button>
        </div>
        <button class="cart-remove" data-remove="${l.productId}">✕</button>
      </div>
    `).join("");

    itemsEl.querySelectorAll("[data-delta]").forEach((btn) => {
      btn.addEventListener("click", () => changeQty(btn.dataset.id, parseInt(btn.dataset.delta, 10)));
    });
    itemsEl.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => removeLine(btn.dataset.remove));
    });
  }

  totalEl.textContent = money(cartTotal());
  document.getElementById("paySummaryTotal").textContent = money(cartTotal());
  updateFooter();
}

function updateFooter() {
  const btn = document.getElementById("checkoutBtn");
  const foot = document.getElementById("cartFoot");

  if (cartStep === "success") {
    foot.style.display = "none";
    return;
  }
  foot.style.display = "block";

  if (cartStep === "cart") {
    btn.textContent = "Checkout";
    btn.disabled = cart.length === 0;
  } else if (cartStep === "payment") {
    btn.textContent = `Confirm & pay ${money(cartTotal())}`;
    btn.disabled = false;
  }
}

function setCartStep(step) {
  cartStep = step;
  document.getElementById("cartItems").style.display = step === "cart" ? "block" : "none";
  document.getElementById("paymentPanel").style.display = step === "payment" ? "block" : "none";
  document.getElementById("successPanel").style.display = step === "success" ? "block" : "none";
  updateFooter();
}

document.getElementById("cartToggle").addEventListener("click", () => {
  setCartStep("cart");
  document.getElementById("cartDrawer").classList.add("show");
  document.getElementById("cartBackdrop").classList.add("show");
});
function closeCart() {
  document.getElementById("cartDrawer").classList.remove("show");
  document.getElementById("cartBackdrop").classList.remove("show");
}
document.getElementById("cartClose").addEventListener("click", closeCart);
document.getElementById("cartBackdrop").addEventListener("click", closeCart);
document.getElementById("paymentBack").addEventListener("click", () => setCartStep("cart"));
document.getElementById("continueShoppingBtn").addEventListener("click", () => {
  closeCart();
  setCartStep("cart");
});

/* Payment method field toggling */
document.querySelectorAll('input[name="payMethod"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const method = document.querySelector('input[name="payMethod"]:checked').value;
    document.getElementById("cardFields").style.display = method === "card" ? "flex" : "none";
    document.getElementById("walletFields").style.display = method === "wallet" ? "flex" : "none";
  });
});

document.getElementById("checkoutBtn").addEventListener("click", async () => {
  if (cartStep === "cart") {
    if (cart.length === 0) return;
    setCartStep("payment");
    return;
  }
  if (cartStep === "payment") {
    await placeOrder();
  }
});

async function placeOrder() {
  const method = document.querySelector('input[name="payMethod"]:checked').value;
  let paymentReference = "";
  if (method === "card") {
    const num = document.getElementById("cardNumber").value.replace(/\s+/g, "");
    if (num.length < 4) { toast("Enter a card number to continue.", true); return; }
    paymentReference = "Card ending " + num.slice(-4);
  } else if (method === "wallet") {
    const wid = document.getElementById("walletId").value.trim();
    if (!wid) { toast("Enter a wallet ID to continue.", true); return; }
    paymentReference = "Wallet " + wid;
  } else {
    paymentReference = "Pay on delivery";
  }

  const btn = document.getElementById("checkoutBtn");
  btn.disabled = true;
  btn.textContent = "Placing order…";

  try {
    await apiFetch("/api/sales", {
      method: "POST",
      body: JSON.stringify({
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paymentMethod: method,
        paymentReference,
      }),
    });
    document.getElementById("successMessage").textContent =
      `Your order total was ${money(cartTotal())}, paid by ${method === "cod" ? "cash on delivery" : method === "card" ? "card" : "wallet"}.`;
    cart = [];
    renderCart();
    setCartStep("success");
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
    updateFooter();
  }
}

/* ---------- Data loading ---------- */
async function loadProducts() {
  try {
    const [products, summary] = await Promise.all([
      apiFetch("/api/products"),
      apiFetch("/api/reviews/summary"),
    ]);
    allProducts = products;
    ratingSummary = summary;
    renderCategories();
    renderProducts();
  } catch (err) {
    toast(err.message, true);
  }
}

async function loadOrders() {
  try {
    const orders = await apiFetch("/api/sales/mine");
    const panel = document.getElementById("ordersPanel");
    const empty = document.getElementById("orderEmpty");

    if (orders.length === 0) {
      panel.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    const paymentLabel = { cod: "Cash on delivery", card: "Card", wallet: "Wallet" };
    panel.innerHTML = orders.map((o) => `
      <div class="order-row">
        <div class="order-date">${new Date(o.createdAt).toLocaleDateString()}</div>
        <div class="order-items">${o.items.map((i) => `${i.quantity}× ${escapeHtml(i.name)}`).join(", ")}</div>
        <div class="order-total">${money(o.total)}</div>
        <div class="order-status">${paymentLabel[o.paymentMethod] || "Cash on delivery"}</div>
        <div class="order-status">${o.status}</div>
      </div>
    `).join("");
  } catch (err) {
    toast(err.message, true);
  }
}

async function init() {
  await loadProducts();
  renderCart();
}
init();

const products = [
{
    id:1,
    name:"Deep Moisture Cream",
    category:"Skin Care",
    price:30.99,
    image:"/image/product4.jpg"
},
{
    id:2,
    name:"Vitamin C Serum",
    category:"Serum",
    price:43.99,
    image:"/image/product3.jpg"
},
{
    id:3,
    name:"Facial Cleanser",
    category:"Cleanser",
    price:12.99,
    image:"/image/product2.jpg"
}
];

const productGrid = document.getElementById("productGrid");

products.forEach(product => {

    productGrid.innerHTML += `

    <div class="product-card">

        <img src="${product.image}">

        <h3>${product.name}</h3>

        <p>${product.category}</p>

        <h4>$${product.price}</h4>

        <button onclick="addToCart(${product.id})">
            Add to Cart
        </button>

    </div>

    `;

});