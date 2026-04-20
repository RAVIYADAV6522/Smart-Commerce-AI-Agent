'use strict';

const { getProductById } = require('./productTool');

const cart = [];

function addToCart(productId) {
  console.log('[addToCart] productId:', productId);

  const id = Number(productId);
  if (!Number.isFinite(id)) {
    console.log('[addToCart] invalid id, cart unchanged');
    return cartSnapshot();
  }

  const product = getProductById(id);
  if (!product) {
    console.log('[addToCart] product not found, cart unchanged');
    return cartSnapshot();
  }

  cart.push({ ...product });
  console.log('[addToCart] items in cart:', cart.length);

  return cartSnapshot();
}

function cartSnapshot() {
  return cart.map((item) => ({ ...item }));
}

function getCart() {
  console.log('[getCart] items:', cart.length);
  return cartSnapshot();
}

module.exports = {
  addToCart,
  getCart,
};
