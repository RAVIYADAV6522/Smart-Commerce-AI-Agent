'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'products.json');

function loadProducts() {
  const raw = fs.readFileSync(PRODUCTS_PATH, 'utf8');
  return JSON.parse(raw);
}

function textMatches(name, category, queryLower) {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  return n.includes(queryLower) || c.includes(queryLower);
}

function hasMaxPriceLimit(maxPrice) {
  if (maxPrice === undefined || maxPrice === null) {
    return false;
  }
  return Number.isFinite(Number(maxPrice));
}

function searchProducts(query, maxPrice) {
  const normalizedQuery = query == null ? '' : String(query).trim();
  const queryLower = normalizedQuery.toLowerCase();

  console.log('[searchProducts] incoming query:', normalizedQuery);

  const products = loadProducts();
  const applyPriceCap = hasMaxPriceLimit(maxPrice);
  const priceCap = applyPriceCap ? Number(maxPrice) : null;

  const results = products.filter((p) => {
    if (!textMatches(p.name, p.category, queryLower)) {
      return false;
    }
    if (applyPriceCap) {
      return p.price <= priceCap;
    }
    return true;
  });

  console.log('[searchProducts] filtered results count:', results.length);

  return results;
}

function getProductById(id) {
  console.log('[getProductById] id:', id);

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    console.log('[getProductById] invalid id');
    return null;
  }

  const products = loadProducts();
  const found = products.find((p) => p.id === numericId) ?? null;

  console.log('[getProductById] found:', Boolean(found));

  return found;
}

module.exports = {
  searchProducts,
  getProductById,
};
