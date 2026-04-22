'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'products.json');

let cachedProducts = null;
let lastLoadError = null;

const STOP_WORDS = new Set(
  'a an the for i im im am is are to in and or of on with by at be it that this my we you your from me us an get set up out off can do does did has have had not was were would could should may might must need if then than also just only when how what which who why where very too any some own same such both few more most other such into from than then them they their was were been being each few further here there where why will would about could should would im ive ill thats this thats u ur'.split(
    ' '
  )
);
/** Words that are too generic to require as a literal match (implied by category or almost every listing). */
const SOFT_MATCH_TOKENS = new Set(
  'phone phones smartphone smartphones mobile cell handheld android device 5g 4g lte new pro max plus air mini ultra se gb ram ssd hdd inr rs rupees rupee in store buy shop item items product products looking look want need find show search get give any all latest budget cheap affordable premium flagship'.split(
    ' '
  )
);

function readProductsFromDisk() {
  const raw = fs.readFileSync(PRODUCTS_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * (Re)load catalog from `products.json` and refresh the in-memory cache.
 * @returns {object[]}
 */
function reloadProductCatalog() {
  try {
    const arr = readProductsFromDisk();
    if (!Array.isArray(arr)) {
      throw new Error('products.json must contain a JSON array');
    }
    cachedProducts = arr;
    lastLoadError = null;
  } catch (err) {
    lastLoadError = err;
    throw err;
  }
  return getProducts();
}

/**
 * @returns {object[]}
 */
function getProducts() {
  if (cachedProducts == null) {
    reloadProductCatalog();
  }
  if (lastLoadError) {
    throw lastLoadError;
  }
  return cachedProducts;
}

function textMatchesNameCategory(name, category, queryLower) {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  return n.includes(queryLower) || c.includes(queryLower);
}

/**
 * @param {object} p
 * @param {string} queryLower
 */
function productTextMatches(p, queryLower) {
  if (queryLower === '') {
    return true;
  }
  if (textMatchesNameCategory(p.name, p.category, queryLower)) {
    return true;
  }
  if (p.highlights && String(p.highlights).toLowerCase().includes(queryLower)) {
    return true;
  }
  return false;
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function tokenizeQuery(raw) {
  const t = String(raw)
    .toLowerCase()
    .replace(/[₹,]/g, ' ')
    .split(/[^a-z0-9+]+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return t.filter((w) => !STOP_WORDS.has(w) && w.length > 0);
}

/**
 * Hard tokens must appear (substring) in product haystack. Soft tokens are ignored for matching
 * (they only justify that the user is browsing phones/laptops, etc.).
 * @param {object} p
 * @param {string[]} hardTokens
 */
function productMatchesHardTokens(p, hardTokens) {
  if (hardTokens.length === 0) {
    return true;
  }
  const hay = `${p.name} ${p.category} ${p.highlights || ''}`.toLowerCase();
  return hardTokens.every((tok) => hay.includes(tok));
}

/**
 * Name or highlights must reflect the OEM (stable filter; does not depend on phrasing "samsung phones").
 * @param {object} p
 * @param {string} brand
 */
function productMatchesBrand(p, brand) {
  const b = String(brand).trim().toLowerCase();
  if (!b) {
    return true;
  }
  const hay = `${p.name} ${p.highlights || ''} ${p.category}`.toLowerCase();
  if (b === 'apple') {
    return (
      hay.includes('apple') ||
      hay.includes('iphone') ||
      hay.includes('ipad') ||
      hay.includes('macbook')
    );
  }
  if (b === 'google') {
    return hay.includes('google') || hay.includes('pixel');
  }
  if (b === 'xiaomi') {
    return /redmi|poco|xiaomi/.test(hay);
  }
  return hay.includes(b);
}

/**
 * First matching brand in user text (order: specific before generic).
 * @param {string} text
 * @returns {string|null} brand string for productMatchesBrand (e.g. "Samsung", "apple")
 */
function inferBrandFromText(text) {
  const s = String(text);
  const rules = [
    [/\b(readmi|ridmi|redmi|poco|xiaomi)\b/i, 'Xiaomi'],
    [/\b(samsung|galaxy)\b/i, 'Samsung'],
    [/\b(iphone|ipad|macbook|mac\s+os)\b/i, 'Apple'],
    [/\bapple\b/i, 'Apple'],
    [/\b(pixel|google)\b/i, 'Google'],
    [/\brealme\b/i, 'realme'],
    [/\b(motorola|moto\s+z|moto\s+g|moto\s+e)\b/i, 'Motorola'],
    [/\boneplus\b/i, 'oneplus'],
    [/\b(hp|pavilion|omen|envy)\b/i, 'hp'],
    [/\b(dell|xps|alienware|inspiron)\b/i, 'dell'],
    [/\b(lenovo|thinkpad|ideapad|yoga)\b/i, 'lenovo'],
    [/\b(asus|rog|zenbook|vivobook|tuf)\b/i, 'asus'],
    [/\b(acer|nitro|swift|aspire)\b/i, 'acer'],
    [/\b(microsoft|surface)\b/i, 'microsoft'],
  ];
  for (const [re, label] of rules) {
    if (re.test(s)) {
      return label;
    }
  }
  return null;
}

/**
 * @param {number|object|undefined|null} maxPriceOrOptions
 */
function normalizeSearchOptions(maxPriceOrOptions) {
  if (maxPriceOrOptions == null) {
    return {};
  }
  if (typeof maxPriceOrOptions === 'number') {
    return { maxPrice: maxPriceOrOptions };
  }
  if (typeof maxPriceOrOptions === 'object') {
    return {
      maxPrice: maxPriceOrOptions.maxPrice,
      minPrice: maxPriceOrOptions.minPrice,
      category: maxPriceOrOptions.category,
      inStockOnly: maxPriceOrOptions.inStockOnly,
      brand: maxPriceOrOptions.brand,
      matchMode: maxPriceOrOptions.matchMode,
    };
  }
  return {};
}

function hasNumberField(v) {
  if (v === null || v === undefined) {
    return false;
  }
  return Number.isFinite(Number(v));
}

/**
 * @param {string} query
 * @param {number|object|undefined|null} [maxPriceOrOptions]
 * @returns {object[]}
 */
function searchProducts(query, maxPriceOrOptions) {
  const normalizedQuery = query == null ? '' : String(query).trim();
  const queryLower = normalizedQuery.toLowerCase();

  const o = normalizeSearchOptions(maxPriceOrOptions);
  const maxPrice = hasNumberField(o.maxPrice) ? Number(o.maxPrice) : null;
  const minPrice = hasNumberField(o.minPrice) ? Number(o.minPrice) : null;
  const categoryFilter =
    o.category == null
      ? null
      : String(o.category).trim().toLowerCase();
  const inStockOnly = o.inStockOnly === true;
  const brandFilter =
    o.brand == null || String(o.brand).trim() === ''
      ? null
      : String(o.brand).trim();
  const matchMode = o.matchMode === 'phrase' ? 'phrase' : 'andTokens';

  const allTokens = tokenizeQuery(normalizedQuery);
  const hardTokens = allTokens.filter((t) => !SOFT_MATCH_TOKENS.has(t));
  const useAndTokens = matchMode === 'andTokens' && normalizedQuery.length > 0;

  const products = getProducts();
  const results = products.filter((p) => {
    if (brandFilter && !productMatchesBrand(p, brandFilter)) {
      return false;
    }
    if (normalizedQuery) {
      if (useAndTokens) {
        if (hardTokens.length === 0) {
          if (!productTextMatches(p, queryLower)) {
            return false;
          }
        } else if (!productMatchesHardTokens(p, hardTokens)) {
          return false;
        }
      } else if (!productTextMatches(p, queryLower)) {
        return false;
      }
    }
    if (minPrice != null && p.price < minPrice) {
      return false;
    }
    if (maxPrice != null && p.price > maxPrice) {
      return false;
    }
    if (categoryFilter) {
      if (!String(p.category).toLowerCase().includes(categoryFilter)) {
        return false;
      }
    }
    if (inStockOnly) {
      const s = p.stock;
      if (!(typeof s === 'number' && s > 0)) {
        return false;
      }
    }
    return true;
  });

  return results;
}

/**
 * @param {number|string} id
 * @returns {object|null}
 */
function getProductById(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return null;
  }
  const products = getProducts();
  return products.find((p) => p.id === numericId) ?? null;
}

/**
 * @param {object[]} list
 * @param {number} minExclusive
 * @returns {object|null}
 */
function findCheapestPricedAbove(list, minExclusive) {
  const above = list.filter(
    (p) => typeof p.price === 'number' && p.price > minExclusive
  );
  if (above.length === 0) {
    return null;
  }
  return above.sort((a, b) => a.price - b.price)[0];
}

module.exports = {
  searchProducts,
  getProductById,
  reloadProductCatalog,
  getProducts,
  PRODUCTS_PATH,
  inferBrandFromText,
  tokenizeQuery,
  findCheapestPricedAbove,
};
