'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  reloadProductCatalog,
  searchProducts,
  getProductById,
  inferBrandFromText,
} = require('../tools/productTool');
const {
  addToCart,
  getCart,
  removeFromCartByProductId,
} = require('../tools/cartTool');
const { placeOrder, getLastOrderForSession } = require('../tools/orderTool');
const { agent } = require('../agent.js');

describe('productTool', () => {
  it('caches catalog and finds products by substring', () => {
    reloadProductCatalog();
    const phones = searchProducts('samsung', { maxPrice: 200000 });
    assert.ok(phones.length >= 1);
    assert.match(phones[0].name, /samsung/i);
  });

  it('applies inStockOnly and category filters', () => {
    reloadProductCatalog();
    const inStock = searchProducts('', { inStockOnly: true, category: 'Smartphone' });
    assert.ok(inStock.every((p) => p.stock > 0));
  });

  it('resolves getProductById', () => {
    reloadProductCatalog();
    const p = getProductById(1);
    assert.ok(p);
    assert.equal(p.id, 1);
  });

  it('matches optional highlights (e.g. battery)', () => {
    reloadProductCatalog();
    const withBattery = searchProducts('battery', { category: 'Smartphones' });
    assert.ok(withBattery.length >= 1);
    assert.ok(
      withBattery.some((p) =>
        String(p.highlights || '')
          .toLowerCase()
          .includes('battery')
      )
    );
  });

  it('brand + category: Samsung phones only in catalog', () => {
    reloadProductCatalog();
    const onlySam = searchProducts('', {
      category: 'Smartphone',
      brand: 'Samsung',
      matchMode: 'andTokens',
    });
    assert.equal(onlySam.length, 2);
    assert.ok(onlySam.every((p) => /samsung|galaxy/i.test(p.name)));
  });

  it('infers brand from free text', () => {
    assert.equal(inferBrandFromText('looking for Samsung phones'), 'Samsung');
    assert.equal(inferBrandFromText('need a redmi under 20k'), 'Xiaomi');
  });
});

describe('cartTool + orderTool', () => {
  it('adds to cart and places order with line items and total', () => {
    const cart = [];
    reloadProductCatalog();
    const p1 = getProductById(1);
    assert.ok(p1);
    addToCart(cart, 1);
    assert.equal(getCart(cart).length, 1);

    const r = placeOrder(cart, { sessionId: 'test-sess' });
    assert.equal(r.success, true);
    assert.ok(r.order);
    assert.equal(r.order.lineItems.length, 1);
    assert.equal(cart.length, 0);
    const last = getLastOrderForSession('test-sess');
    assert.equal(last.id, r.order.id);
  });

  it('rejects placeOrder on empty cart', () => {
    const cart = [];
    const r = placeOrder(cart, { sessionId: 'x' });
    assert.equal(r.success, false);
    assert.equal(r.status, 'empty');
  });

  it('removes a line by product id', () => {
    reloadProductCatalog();
    const cart = [];
    addToCart(cart, 1);
    addToCart(cart, 1);
    assert.equal(cart.length, 2);
    const r1 = removeFromCartByProductId(cart, 1);
    assert.equal(r1.ok, true);
    assert.equal(cart.length, 1);
    const r2 = removeFromCartByProductId(cart, 1);
    assert.equal(r2.ok, true);
    assert.equal(cart.length, 0);
  });
});

describe('agent context (fast path)', () => {
  it('greeting is not a product search', async () => {
    const s = { cart: [], conversation: [] };
    const r = await agent('hyy', { session: s });
    assert.ok(!r.products);
    assert.equal(r.fastPath, true);
    assert.match(
      r.message,
      /phones|laptops|electronic|LED|TV|trimmer|cart|check|checkout/i,
      String(r.message)
    );
  });

  it('phone + battery question uses highlights search', async () => {
    const s = { cart: [], conversation: [] };
    const r = await agent('which phone is best for battery life', { session: s });
    assert.ok(Array.isArray(r.products) && r.products.length > 0);
    assert.equal(r.fastPath, true);
    const msg = (r.message || '').toLowerCase();
    assert.ok(
      msg.includes('battery') || msg.includes('notes') || msg.includes('catalog')
    );
  });

  it('remove this product from cart (single line)', async () => {
    const s = { cart: [], conversation: [] };
    await agent('add product 3 to my cart', { session: s });
    assert.equal(s.cart.length, 1);
    const r = await agent('remove this product from my cart', { session: s });
    assert.equal(s.cart.length, 0);
    assert.equal(r.success, true);
    assert.equal(r.fastPath, true);
  });

  it('preflight clears cart for "remove all the products from my cart"', async () => {
    const s = { cart: [], conversation: [] };
    await agent('add product 3 to my cart', { session: s });
    await agent('add product 4 to my cart', { session: s });
    assert.equal(s.cart.length, 2);
    const r = await agent('remove all the products from my cart', { session: s });
    assert.equal(s.cart.length, 0);
    assert.equal(Array.isArray(r.cart) && r.cart.length, 0);
    assert.equal(r.fastPath, true);
  });

  it('samsung phones intent returns only Samsung rows (fast path)', async () => {
    const s = { cart: [], conversation: [] };
    const r = await agent('i am looking for samsung phones', { session: s });
    assert.equal(r.products.length, 2);
    assert.ok(
      r.products.every((p) => /samsung|galaxy/i.test(p.name)),
      r.products.map((p) => p.name).join(' | ')
    );
  });

  it('thanks does not claim cart is empty (greeting path)', async () => {
    const s = { cart: [], conversation: [] };
    await agent('add product 1 to my cart', { session: s });
    const r = await agent('thanks', { session: s });
    assert.equal(s.cart.length, 1);
    assert.ok(r.message);
    assert.equal(r.fastPath, true);
    assert.match(
      r.message,
      /helper|find|phones|laptops|cart|checkout|shop/i,
      r.message
    );
  });

  it('remembers session budget for follow-up “good phones” (no 10k+ flood)', async () => {
    const s = { cart: [], conversation: [] };
    const r0 = await agent('my budget is 10000 and i want to buy phone', { session: s });
    assert.equal(s.shoppingContext.maxPrice, 10000);
    if (r0.products && r0.products.length > 0) {
      assert.ok(
        r0.products.every((p) => p.price > 10000),
        'first turn may suggest closest-above, not in-budget stock'
      );
    }

    const r1 = await agent('can u tell me about good phones', { session: s });
    assert.equal(r1.fastPath, true);
    assert.equal(
      s.shoppingContext.maxPrice,
      10000,
      'budget should still apply on follow-up'
    );
    const names = (r1.products || []).map((p) => p.name).join(' ');
    assert.doesNotMatch(names, /iPhone|Pixel|S24|Ultra|₹1[0-2],[89]/i, r1.message);
    assert.equal(r1.products.length, 1, 'closest-above or tight list, not the whole catalog');
    assert.equal(r1.products[0].id, 1, 'expected cheapest above 10k (Redmi 13C) in this fixture');
    assert.match(
      (r1.message || '').toLowerCase(),
      /10000|10,?000/,
      'message should reference the cap'
    );
  });

  it('silly / off-topic question returns fast path and stays in scope', async () => {
    const s = { cart: [], conversation: [] };
    const r = await agent('tell me a joke', { session: s });
    assert.equal(r.fastPath, true);
    assert.match(
      (r.message || '').toLowerCase(),
      /commerce|product|cart|shop|look for|browse|checkout/i,
      r.message
    );
  });

  it('typo "lled" maps to LED TVs, not phones', async () => {
    const s = { cart: [], conversation: [] };
    const r = await agent('i am looking for lled', { session: s });
    assert.equal(r.fastPath, true);
    assert.ok(r.products && r.products.length >= 1);
    assert.ok(
      r.products.every((p) => String(p.category).toLowerCase().includes('led tv')),
      r.products.map((p) => p.category).join(' | ')
    );
    assert.doesNotMatch(
      String(r.message).toLowerCase(),
      /lled.*phone|phone.*lled|'lled' phone/i
    );
  });

  it('Readmi speciality question: informational path, only Xiaomi/Redmi rows', async () => {
    const s = { cart: [], conversation: [] };
    const r = await agent('what is the speciality of Readmi phones', { session: s });
    assert.equal(r.fastPath, true);
    const names = (r.products || []).map((p) => p.name);
    assert.ok(names.length >= 1 && names.length <= 3);
    assert.ok(
      names.every((n) => /redmi/i.test(n)),
      'expected only Redmi SKUs, got: ' + names.join(' | ')
    );
  });
});
