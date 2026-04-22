'use strict';

const { clearCart, cartSnapshot } = require('./cartTool');

const CURRENCY = 'INR';

/** @type {import('../types/askResponse').OrderRecord[]} */
const orderLog = [];
let idCounter = 1;

/**
 * @param {object} line
 * @returns {number}
 */
function lineTotal(line) {
  if (line == null) return 0;
  if (typeof line.price === 'number' && !Number.isNaN(line.price)) {
    return line.price;
  }
  return 0;
}

/**
 * @param {object[]} cart
 * @param {{ sessionId: string|undefined, requestId?: string }} ctx
 * @returns {import('../types/askResponse').PlaceOrderResult}
 */
function placeOrder(cart, ctx = {}) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return {
      success: false,
      status: 'empty',
      message: 'Your cart is empty. Add products before checking out.',
      order: null,
    };
  }

  const lineItems = cart.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
  }));

  const subtotal = lineItems.reduce((sum, li) => sum + lineTotal(li), 0);
  const orderId = `ORD-${Date.now()}-${idCounter++}`;

  const record = {
    id: orderId,
    lineItems,
    subtotal,
    currency: CURRENCY,
    createdAt: new Date().toISOString(),
    sessionId: ctx.sessionId,
    requestId: ctx.requestId,
  };

  orderLog.push(record);
  clearCart(cart);

  return {
    success: true,
    status: 'success',
    message: `Order ${orderId} placed successfully. Total: ${CURRENCY} ${subtotal.toFixed(0)}`,
    order: {
      id: orderId,
      lineItems,
      subtotal,
      currency: CURRENCY,
      createdAt: record.createdAt,
    },
  };
}

/**
 * @param {string} [sessionId]
 * @returns {import('../types/askResponse').OrderRecord[]}
 */
function getOrdersForSession(sessionId) {
  if (sessionId == null || sessionId === '') {
    return [];
  }
  return orderLog.filter((o) => o.sessionId === sessionId);
}

/**
 * @param {string} [sessionId]
 * @returns {import('../types/askResponse').OrderRecord|null}
 */
function getLastOrderForSession(sessionId) {
  const list = getOrdersForSession(sessionId);
  return list.length > 0 ? list[list.length - 1] : null;
}

module.exports = {
  placeOrder,
  getOrdersForSession,
  getLastOrderForSession,
  orderLog,
  CURRENCY,
};
