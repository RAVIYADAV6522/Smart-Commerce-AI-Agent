'use strict';

const { getProductById } = require('./productTool');

/**
 * @param {object[]} cart mutable line-item list
 * @param {number|string} productId
 * @returns {object[]}
 */
function addToCart(cart, productId) {
  const id = Number(productId);
  if (!Array.isArray(cart) || !Number.isFinite(id)) {
    return cartSnapshot(cart);
  }

  const product = getProductById(id);
  if (!product) {
    return cartSnapshot(cart);
  }

  cart.push({ ...product });
  return cartSnapshot(cart);
}

/**
 * @param {object[]|null|undefined} cart
 * @returns {object[]}
 */
function cartSnapshot(cart) {
  if (!Array.isArray(cart)) {
    return [];
  }
  return cart.map((item) => ({ ...item }));
}

/**
 * @param {object[]} cart
 * @returns {object[]}
 */
function getCart(cart) {
  return cartSnapshot(cart);
}

/**
 * @param {object[]} cart
 */
function clearCart(cart) {
  if (Array.isArray(cart)) {
    cart.length = 0;
  }
}

/**
 * Remove the first cart line with this product id.
 * @param {object[]} cart
 * @param {number|string} productId
 * @returns {{ ok: boolean, cart: object[] }}
 */
function removeFromCartByProductId(cart, productId) {
  const id = Number(productId);
  if (!Array.isArray(cart) || !Number.isFinite(id)) {
    return { ok: false, cart: cartSnapshot(cart) };
  }
  const i = cart.findIndex((l) => Number(l.id) === id);
  if (i < 0) {
    return { ok: false, cart: cartSnapshot(cart) };
  }
  cart.splice(i, 1);
  return { ok: true, cart: cartSnapshot(cart) };
}

module.exports = {
  addToCart,
  getCart,
  cartSnapshot,
  clearCart,
  removeFromCartByProductId,
};
