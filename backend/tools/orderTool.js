'use strict';

function placeOrder() {
  console.log('[placeOrder] invoked');

  const result = {
    status: 'success',
    message: 'Order placed successfully',
  };

  console.log('[placeOrder] result:', result);

  return result;
}

module.exports = {
  placeOrder,
};
