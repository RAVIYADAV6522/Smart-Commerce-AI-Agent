'use strict';

const axios = require('axios');
const {
  searchProducts,
  getProductById,
  inferBrandFromText,
  findCheapestPricedAbove,
} = require('./tools/productTool');
const {
  addToCart,
  getCart,
  clearCart,
  removeFromCartByProductId,
} = require('./tools/cartTool');
const { placeOrder } = require('./tools/orderTool');

const OLLAMA_GENERATE_URL =
  process.env.OLLAMA_GENERATE_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MAX_AGENT_ITERATIONS = Number(process.env.MAX_AGENT_ITERATIONS) || 5;
const AGENT_FAST_PATH =
  String(process.env.AGENT_FAST_PATH || '1').trim() !== '0';
const OLLAMA_WANTS_JSON =
  String(process.env.OLLAMA_JSON_FORMAT || '1').trim() !== '0';
const MAX_CONVERSATION_MESSAGES = 64;

/**
 * If true, the user is shopping / asking for products; do not treat as pure smalltalk.
 * @param {string} q
 * @returns {boolean}
 */
function hasShoppingOrProductIntent(q) {
  return /\b(phone|phones|laptop|laptops|macbook|notebook|ultrabook|cart|order|orders|cancel|remove|remov(e|al)|delete|trash|clear|empty|basket|line(s)?|buy|bought|shop|search|show|list|recommend|product|₹|rs\.?|rupee|price|under|below|budget|add\s+to|to\s+cart|checkout|pixel|samsung|iphone|redmi|realme|hp|dell|google|android|smartphone|need\s+a|looking\s+for|want\s+a|show\s+me|best|cheapest|cheap|which|what\s+(phone|laptop|model|device|should)|compare|device|lled|led\b|oled|qled|tv\b|television|trimmer|washing|microwave|purifier|vacuum|fryer|iron\b|dryer|air\s*fry|washer|groom|appliance|home\s*essential)\b/i.test(
    q
  );
}

/**
 * Greetings, thanks, or tiny acknowledgements — not product intent.
 * @param {string} raw
 * @returns {{ success: true, finished: true, fastPath: true, message: string }|null}
 */
function tryGreetingOrSmalltalkPath(raw) {
  const q = String(raw).trim();
  if (q.length === 0 || q.length > 120) {
    return null;
  }
  if (hasShoppingOrProductIntent(q)) {
    return null;
  }
  const one = q.replace(/\s+/g, ' ');

  if (
    /^(?:hi{1,3}|hii+|hyy+|hiya|hello|hey|heya|howdy|yo|sup|wassup|greetings|good\s+(?:morning|afternoon|evening|night)|gm|gn)(?:[!.?,\s…]|$)/i.test(
      one
    ) ||
    /^(?:thanks?|thx|ty|thank\s+you|much\s+appreciated|cheers)(?:[!.?,\s]|$)/i.test(
      one
    ) ||
    /^(?:how\s+are\s+you|how\s+r\s*u|how['’]re\s+you|what['’]s\s+up|whats\s+up)(?:[!.?,\s]|$)/i.test(
      one
    )
  ) {
    if (one.split(/\s+/).length > 7) {
      return null;
    }
    if (/[₹$€£]/.test(q)) {
      return null;
    }
    return {
      success: true,
      finished: true,
      fastPath: true,
      message:
        "Hi! I'm your Smart Commerce helper—browse phones, laptops, and home electronics (e.g. LED TVs, trimmers, washing machines, air fryers, hair dryers, microwaves, and more), add to cart, or start checkout. What are you looking for (and your budget in ₹, if you have one)?",
    };
  }

  return null;
}

/**
 * Silly or clearly off-topic questions (no catalog) — concise reply, skip LLM.
 * @param {string} raw
 * @returns {{ success: true, finished: true, fastPath: true, message: string }|null}
 */
function tryPlayfulOrOffTopicPath(raw) {
  const q = String(raw).trim();
  if (!q || q.length > 280) {
    return null;
  }
  if (hasShoppingOrProductIntent(q)) {
    return null;
  }
  const lower = q.toLowerCase();
  const playful =
    /\b(tell me (a |some )?joke|funny story|ha(ha)+|lol|lmao|riddle\b|meaning of life|2\s*\+\s*2|who (are|r) you|what are you|are you (real|human|ai|a bot|sentient)|sing (a |me )|dance for|poem about|bored|so random)\b/i.test(
      q
    ) || /^(yo|sup|wassup)\??$/i.test(lower);
  const offTopic =
    /\b(weather|forecast|temperature (in|at|for)|recipe|how to cook|football score|cricket score|stock price|bitcoin|ethereum|crypto|who won (the|last)|election result)\b/i.test(
      lower
    );
  if (!playful && !offTopic) {
    return null;
  }
  if (offTopic) {
    return {
      success: true,
      finished: true,
      fastPath: true,
      message:
        "I don’t have live web data—this demo only knows **our product catalog**, your **cart**, and **orders** in this session. Ask for something we sell, a **budget in ₹**, or e.g. **add product 3 to cart** / **checkout**.",
    };
  }
  return {
    success: true,
    finished: true,
    fastPath: true,
    message:
      "Fair point—I’m a **commerce** helper, not open-mic night. I can search **products** (phones, TVs, appliances…), remember your **budget**, update the **cart**, and help **checkout**. What should we look for?",
  };
}

/**
 * Light typo fixes for product words (e.g. "lled" → "led" for TV intent).
 * @param {string} text
 * @returns {string}
 */
function normalizeCommerceTypos(text) {
  return String(text).toLowerCase().replace(/\blled\b/g, 'led');
}

/**
 * Map free text to a catalog `category` substring (used with `category` on searchProducts, includes match).
 * @param {string} text
 * @returns {string|null}
 */
function inferCatalogCategoryFromText(text) {
  const raw = String(text);
  const t = normalizeCommerceTypos(raw);
  const phoneNotTv =
    /\b(phone|phones|mobile|smartphone|handset)\b/i.test(t) &&
    !/\b(tv|television|smart tv|uhd|4k|inch|led tv|oled|qled|screen|display|monitor)\b/i.test(
      t
    );

  if (/\b(dishwasher|dish washer)\b/i.test(t)) {
    return null;
  }
  if (/\b(washing machine|top load|front load|laundry|semi[- ]?automatic|fully automatic)\b/i.test(t)) {
    return 'Washing Machine';
  }
  if (/\b(washer)\b/i.test(t) && !/\b(dish|power)\b/i.test(t)) {
    return 'Washing Machine';
  }
  if (/\b(hair dryer|blow ?dry|blow dryer|hand dryer)\b/i.test(t)) {
    if (/\b(bathroom|hand )dryer\b/i.test(t) && !/\bhair\b/i.test(t)) {
      return null;
    }
    return 'Hair Dryer';
  }
  if (/\b(air[ -]purifier|hepa|room purifier|anti[- ]?pollution)\b/i.test(t)) {
    return 'Air Purifier';
  }
  if (/\b(air[ -]fryer|oil[ -]free|airfry|no oil)\b/i.test(t)) {
    return 'Air Fryer';
  }
  if (/\b(microwave|microwave oven|convection (microwave|oven)|\botg\b)\b/i.test(t)) {
    if (/\b(phone|mobile|router)\b/i.test(t)) {
      return null;
    }
    return 'Microwave';
  }
  if (/\b(vacuum|suction|stick vac|upright clean)\b/i.test(t) && !/\b(car detail)\b/i.test(t)) {
    return 'Vacuum Cleaner';
  }
  if (/\b(trimmer|beard|body groom|grooming kit|multigroom)\b/i.test(t) && !/\b(land line)\b/i.test(t)) {
    if (/\b(phone|mobile)\b/.test(t) && !/\b(trimmer|beard|groom)\b/i.test(t)) {
      return null;
    }
    return 'Trimmers';
  }
  if ((/\b(steam|dry|clothes|cordless) iron|iron(ing)?\s*for|clothes press|steam press\b/i).test(t)) {
    return 'Iron';
  }
  if (/\biron(s)?\b/i.test(t) && !phoneNotTv) {
    if (t.split(/\s+/).length <= 8) {
      if (!/\b(android|pixel|moto|poco|galaxy|iphone)\b/.test(t)) {
        return 'Iron';
      }
    }
  }
  if (/\b(smart tv|television|t\.?v\.?|4k|uhd|qled|mini ?led|android tv|google tv|webos)\b/i.test(t)) {
    if (phoneNotTv && /\b(phone|mobile)\b/i.test(t)) {
      return null;
    }
    return 'LED TV';
  }
  if (/\b(\d{2,3})\s*[-'"]\s*inch\s*(tv|screen)?\b/i.test(t) && !phoneNotTv) {
    return 'LED TV';
  }
  if (/\b(led|oled|qled|mini ?led|neo qled)\b/.test(t)) {
    if (phoneNotTv) {
      return null;
    }
    return 'LED TV';
  }
  return null;
}

/**
 * Deterministic: "looking for lled" / "hair under 2k" → search by category (no default to "phones" in LLM).
 * @param {string} input
 * @param {object} rt
 * @returns {object|null}
 */
function tryHeuristicApplianceCategorySearch(input, rt) {
  const raw = String(input).trim();
  if (!raw) {
    return null;
  }
  const cat = inferCatalogCategoryFromText(raw);
  if (!cat) {
    return null;
  }
  const storeIntent =
    hasShoppingOrProductIntent(raw) ||
    /\b(looking|want|need|search|show|find|recommend|list|best|buy|get|add|price|under|below|₹|rupee|k\b|budget|compare)\b/i.test(
      raw
    ) ||
    extractInrMaxBudget(raw) != null;
  if (!storeIntent) {
    return null;
  }

  const b = inferBrandFromText(raw);
  const cap = getEffectiveMaxPrice(rt, extractInrMaxBudget(raw));
  const opts = { matchMode: 'andTokens', category: cat };
  if (b) {
    opts.brand = b;
  }
  if (cap != null) {
    opts.maxPrice = cap;
  }

  let products = searchProducts('', opts);
  if (products.length === 0) {
    if (cap != null) {
      const broad = searchProducts('', { ...opts, maxPrice: undefined, brand: b || undefined });
      const next = findCheapestPricedAbove(broad, cap);
      if (next) {
        const label = cat === 'LED TV' ? 'LED TV' : cat;
        return {
          success: true,
          action: 'searchProducts',
          message: `No **${label}** in the sample catalog at or below ₹${cap}. Closest next price: **${next.name}** at ₹${next.price}.`,
          products: [next],
        };
      }
    }
    return {
      success: true,
      action: 'searchProducts',
      message: `No **${cat}** matches in our catalog for that phrasing. Try a brand (e.g. Samsung) or a higher budget—or browse phones and laptops too.`,
      products: [],
    };
  }
  return {
    success: true,
    action: 'searchProducts',
    message: `Found ${products.length} **${cat}** (and related) in our catalog (filters + your budget when set).`,
    products,
  };
}

/**
 * Phone + “battery / endurance” style questions: search catalog `highlights` (not real benchmarks).
 * @param {string} raw
 * @param {object|undefined} rt
 * @returns {{ success: true, action: string, message: string, products: object[] }|null}
 */
function tryHeuristicPhoneBatterySearch(raw, rt) {
  const q = String(raw).trim();
  if (!q) {
    return null;
  }
  const lower = q.toLowerCase();
  const phoneHints = /\b(phone|phones|mobile|smartphone|android|iphone|pixel|galaxy|handset)\b/i.test(
    lower
  );
  const batteryHints = /\b(battery|batter|mah|endurance|all[-\s]?day|longest|stamina|last\s+long|all\s*day|life|runtime)\b/i.test(
    lower
  );
  if (!phoneHints || !batteryHints) {
    return null;
  }
  if (/\b(laptop|macbook|notebook|ultrabook)\b/i.test(lower)) {
    return null;
  }

  const cap =
    rt == null
      ? null
      : getEffectiveMaxPrice(rt, extractInrMaxBudget(q));
  const opts = { category: 'Smartphones' };
  if (cap != null) {
    opts.maxPrice = cap;
  }
  let products = searchProducts('battery', opts);
  if (products.length === 0 && cap != null) {
    const broad = searchProducts('battery', { category: 'Smartphones' });
    const next = findCheapestPricedAbove(broad, cap);
    if (next) {
      return {
        success: true,
        action: 'searchProducts',
        message: `No battery-note matches at or below ₹${cap}. The next-closest in the catalog (by price) is **${next.name}** at ₹${next.price}.`,
        products: [next],
      };
    }
    return null;
  }
  if (products.length > 0) {
    return {
      success: true,
      action: 'searchProducts',
      message:
        'These phones mention battery in our product notes. We do not have third-party lab battery scores in this catalog—prices in ₹ are in the cards; tell me a budget to narrow it down, or I can call out a couple that skew toward “long battery” in the notes (often budget M-line or large-mAh options vs ultra-premium, depending on use).',
      products,
    };
  }
  return null;
}

/**
 * Parse user-stated max budget in ₹ (e.g. "10000", "10k", "₹20,000", "my budget is 10000").
 * @param {string} text
 * @returns {number|null}
 */
function extractInrMaxBudget(text) {
  const t = String(text).toLowerCase();
  const patterns = [
    /\bmy\s+budget\s*(?:is|of|around)?\s*[₹]?\s*(\d[\d,]*)(?:\s*k)?\b/,
    /\b(?:max(?:imum)?|under|below|less than|upto|up to|within|at most)\s*(?:is|of)?\s*[₹]?\s*(\d[\d,]*)(?:\s*k)?\b/,
    /\b(?:price|rupees?|inr)\s*(?:is|of)?\s*[₹]?\s*(\d[\d,]*)(?:\s*k)?\b/,
    /[₹]\s*(\d[\d,]*)\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      let n = parseInt(String(m[1]).replace(/,/g, ''), 10);
      if (/\bk\b/.test(m[0]) && n > 0 && n < 1000) {
        n *= 1000;
      }
      if (Number.isFinite(n) && n > 0 && n < 1e9) {
        return n;
      }
    }
  }
  const m2 = t.match(/(?:^|[^\d])(\d{1,2})\s*k(?:[^\d]|$)/i);
  if (m2) {
    const n = parseInt(m2[1], 10) * 1000;
    if (n > 0) {
      return n;
    }
  }
  return null;
}

/**
 * Persist latest stated budget in session (server truth for follow-up searches).
 * @param {string} input
 * @param {object} session
 */
function applyBudgetMentionToSession(input, session) {
  if (!session.shoppingContext || typeof session.shoppingContext !== 'object') {
    session.shoppingContext = { maxPrice: null, minPrice: null };
  }
  const n = extractInrMaxBudget(input);
  if (n != null) {
    session.shoppingContext.maxPrice = n;
  }
  if (/\bany\s+price|no\s+budget|ignore\s+my\s+budget|forget\s+the\s+budget|remove\s+the\s+cap\b/i.test(
    String(input)
  )) {
    session.shoppingContext.maxPrice = null;
  }
}

/**
 * "What is the speciality of Readmi" → answer from catalog highlights, not 6 random phones.
 * @param {string} input
 * @param {object} rt
 * @returns {object|null}
 */
function tryInformationalBrandQuestion(input, rt) {
  const q = String(input).trim();
  if (/\b(need|want) to (buy|get|purchase)\b/i.test(q)) {
    return null;
  }
  const isPureBrowse =
    /\b(show me|find|search|list)\b/i.test(q) &&
    !/\b(what|which|why|how\s|specialit|featur|tell me (about|what)|about (the )?brand|explain|describe|good|bad|better|worth|compare)\b/i.test(
      q
    );
  if (isPureBrowse) {
    return null;
  }
  const looksLikeWhy =
    /^(what|which|why|how|is there|are there|tell me (what|why|if|how|about)|can (you|u) (explain|describe|tell)|explain|describe|do you (know|have))\b/i.test(
      q
    ) ||
    /\b(tell me about|can (you|u) tell me)\b/i.test(q) ||
    /\?\s*$/.test(q);
  if (!looksLikeWhy) {
    return null;
  }
  const hasInfo =
    /\b(specialit|special|feature|features|differ|unique|stand out|strengths?|weakness|about the brand|makes? .+ (good|bad|better)|pros?|cons?|compare|vs\.?|which is better|worth (it|buying)|reliable|durable|battery life)\b/i.test(
      q
    ) ||
    /\bwhat (is|are) the\b/i.test(q) ||
    /^tell me about\b/i.test(q);
  if (!hasInfo) {
    return null;
  }
  if (/\b(how (much|do)|lowest|cheapest) (price|cost)\b/i.test(q)) {
    return null;
  }
  const b = inferBrandFromText(q);
  if (!b) {
    return null;
  }
  let allForBlurb = searchProducts('', {
    brand: b,
    matchMode: 'andTokens',
    category: 'Smartphone',
  });
  if (allForBlurb.length === 0) {
    allForBlurb = searchProducts('', {
      brand: b,
      matchMode: 'andTokens',
      category: 'Laptop',
    });
  }
  if (allForBlurb.length === 0) {
    return {
      success: true,
      message: `I don’t have ${b} items in the sample catalog to describe.`,
      products: [],
    };
  }
  const sc = rt.session.shoppingContext || {};
  const cap = hasNumberField(sc.maxPrice) ? Number(sc.maxPrice) : null;
  let overCap = false;
  let products = allForBlurb;
  if (cap != null) {
    const under = allForBlurb.filter((p) => p.price <= cap);
    if (under.length > 0) {
      products = under;
    } else {
      products = allForBlurb;
      overCap = true;
    }
  }
  const blurb = products
    .slice(0, 3)
    .map(
      (p) =>
        `• **${p.name}** (₹${p.price}): ${p.highlights || '—'}`
    )
    .join('\n');
  const capLine =
    cap != null
      ? overCap
        ? `\n\n(No **${b}** devices in the sample at or below **₹${cap}**; below are general catalog lines from this brand.)`
        : `\n\n(Applying your saved **₹${cap}** cap: **${products.length}** item(s) fit.)`
    : '';
  return {
    success: true,
    message: `From our **in-catalog product notes** for **${b}** (this is not a full expert review)${capLine}:\n\n${blurb}`,
    products: products.slice(0, 3),
  };
}

/**
 * Match many ways users ask to remove everything (must not rely on the LLM only).
 * @param {string} input
 * @returns {boolean}
 */
function shouldClearEntireCartByPhrase(input) {
  const q = String(input).trim();
  if (!q) {
    return false;
  }
  const t = q.toLowerCase();
  if (/\b(clear|empty)(\s+out)?\s+(\S+\s+){0,3}(my\s+)?(cart|basket)\b/i.test(t)) {
    return true;
  }
  if (/\b(remove|delete|trash|drop|strip)\b/i.test(t) && /\b(every(thing|one)?|all(\s+the)?\s*(products?|items?|lines?)|entire|whole)\b/i.test(t) && /\b(from|in|out\s+of)\s+(my\s+)?(cart|basket)\b/i.test(t)) {
    return true;
  }
  if (/\b(remove|delete)\s+all(\s+the)?\s+(products?|items?)\b/i.test(t)) {
    return true;
  }
  if (/\bremove\s+all|delete\s+all|clear\s+all\b/i.test(t) && /cart|basket|items?|products?|everything/i.test(t)) {
    return true;
  }
  if (/\b(get\s+rid\s+of|wipe|nuke)\b/i.test(t) && /\b(cart|basket|everything)\b/i.test(t)) {
    return true;
  }
  if (/\b(clear(\s+the)?\s+cart|empty(\s+the)?\s+cart|remove\s+all|delete\s+all|start\s+over)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Server-side: if the user phrasing clearly wants an empty cart, run clearCart
 * (do not depend on the model calling clearCart in JSON).
 * @param {string} input
 * @param {object} rt
 * @returns {{ success: true, finished: true, fastPath: true, action: string, message: string, cart: object[] }|null}
 */
function preflightClearEntireCartIfRequested(input, rt) {
  if (!shouldClearEntireCartByPhrase(input)) {
    return null;
  }
  const cart = rt.session.cart;
  if (!Array.isArray(cart)) {
    return null;
  }
  if (cart.length === 0) {
    return {
      success: true,
      finished: true,
      fastPath: true,
      action: 'clearCart',
      message: 'Your cart is already empty.',
      cart: getCart(cart),
    };
  }
  clearCart(cart);
  return {
    success: true,
    finished: true,
    fastPath: true,
    action: 'clearCart',
    message: 'All products have been removed from your cart.',
    cart: getCart(cart),
  };
}

/**
 * @param {object|undefined} session
 * @param {string|undefined} sessionId
 * @param {string|undefined} requestId
 */
function makeRuntime(session, sessionId, requestId) {
  const s = session || { cart: [], conversation: [] };
  if (!Array.isArray(s.cart)) s.cart = [];
  if (!Array.isArray(s.conversation)) s.conversation = [];
  if (!s.shoppingContext || typeof s.shoppingContext !== 'object') {
    s.shoppingContext = { maxPrice: null, minPrice: null };
  }
  return {
    session: s,
    sessionId: sessionId || 'anon',
    requestId,
    lastUserMessage: '',
    appendConversation(role, content) {
      const text =
        typeof content === 'string' ? content : JSON.stringify(content);
      s.conversation.push({ role, content: text });
      if (s.conversation.length > MAX_CONVERSATION_MESSAGES) {
        const overflow =
          s.conversation.length - MAX_CONVERSATION_MESSAGES;
        s.conversation.splice(0, overflow);
      }
    },
    getConversationForPrompt() {
      return s.conversation.slice(-5);
    },
  };
}

function assistantTranscript(payload) {
  if (payload == null) {
    return '';
  }
  if (typeof payload === 'string') {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function parseModelJson(raw) {
  const trimmed = String(raw).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(unfenced);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          /* fall through */
        }
      }
      throw new Error('Failed to parse LLM response as JSON');
    }
  }
}

/**
 * @param {object} rt
 */
function buildAgentLoopPrompt(userInput, context, lastResult, step, maxSteps, rt) {
  const lastChance = step >= maxSteps - 1;
  const historyJson = JSON.stringify(rt.getConversationForPrompt());
  const cartJson = JSON.stringify(getCart(rt.session.cart));
  const shopCtx = rt.session.shoppingContext || {};
  const shopJson = JSON.stringify(shopCtx);

  const base = `Conversation History:
${historyJson}

Current cart (GROUND TRUTH from server — you MUST make your "finish" text match this; do not say the cart is empty or "clean slate" unless this is [] or you just ran clearCart / remove / successful placeOrder):
${cartJson}

Shopping context (server — apply on follow-up turns; maxPrice in ₹; null = no cap):
${shopJson}

You control an e-commerce assistant. Use Conversation History for follow-ups ("that one", "the second", "my order").

**Catalog product types (use these in searchProducts "category" when the user is clearly asking for one; substring match, e.g. "Smartphone" also matches the Smartphones in JSON):** Smartphones, Laptops, Trimmers, Washing Machine, Hair Dryer, Microwave, Air Purifier, Vacuum Cleaner, Iron, Air Fryer, LED TV. Do not assume every query is a phone: if the user types a typo (e.g. "lled" for LED) or says TV, trimmer, microwave, etc., set **category** and a helpful **query** (brand, size, "4K", "budget", etc.)—not "phone" by default.

Current user message:
${String(userInput).trim()}

Previous tool steps this turn:
${JSON.stringify(context)}

Last tool result:
${JSON.stringify(lastResult)}

Rules:
- Reply with ONE JSON object only. No markdown, no prose before/after.
- Typical flow: run the right tool (if any), then on the NEXT step use action "finish" with a short helpful message for the user.
- PURE greeting, small talk, or thanks (no shopping or product questions): do NOT call searchProducts, addToCart, or placeOrder. Use ONLY: {"action":"finish","message":"..."} and reply briefly, then offer help. If the user only says "thanks" / "thank you", thank them in one line — do NOT describe the cart as empty or full (the cart JSON may be from an earlier turn).
- If the user is not clearly shopping, prefer "finish" to ask a clarifying question; do not run a random product search.
- If shoppingContext.maxPrice is a number, treat it as a **hard cap** for searchProducts unless the user explicitly changes budget or says "any price" / "ignore my budget" (this is persisted server-side).
- Pure brand/education questions ("what is special about Redmi", "why Samsung") that do not ask to *list* products should be answered in "finish" from conversation + general knowledge, or a tiny note—do not call searchProducts with an empty/weak query and return unrelated flagship SKUs. Prefer searchProducts with a specific brand + category when the user is clearly comparing **models** in the catalog.
- We do NOT support "cancel my order" or "refund" as server actions. If asked, "finish" and explain: checkout already placed orders stay placed; the user can start a new order by emptying the cart (clearCart) and adding items, or you can use removeFromCart / clearCart for the live cart. Never claim an order was cancelled from this chat unless a future cancel tool exists.
- Subjective "best" (battery, camera, “best” phone) when we have no benchmark data: be honest, use "finish" after any search to explain limitations; use the product "highlights" in tool results, not invented scores.
- If the user asks for a very old or external order history: explain that this demo only shows orders confirmed during the current server session, not full receipts.
- If Last tool result already answers the user, prefer "finish" now with a clear summary. Include the cart or order id in your message when helpful.
- For searchProducts, put the user's key words in "query" (e.g. "battery", "laptop", brand) so we match name, category, and catalog highlights. When they name a manufacturer, set "brand" to that OEM (e.g. "Samsung", "Apple", "Google")—do not use only the word "phone" or you will return every phone.
- searchProducts also accepts: "brand": "string" | null (works with the server brand filter; prefer together with "category" when clear): "Smartphone", "Laptop", "Trimmers", "Washing Machine", "Hair Dryer", "Microwave", "Air Purifier", "Vacuum Cleaner", "Iron", "Air Fryer", "LED TV"—or null when unsure.
- For remove this / that product: if exactly one line is in the cart, removeFromCart with that product's id. If several lines, ask which productId in "finish" or use remove with the id they name.
- maxPrice, minPrice may be null when not used. query may be empty if category or only price/stock filters are set.

${
  lastChance
    ? `FINAL STEP (${step}/${maxSteps}): You MUST output ONLY:
{"action":"finish","message":"<brief message for the user>"}
Summarize the last result, apologize if stuck, or say you cannot access long-term order history. No other action.`
    : ''
}`;

  const schema = `

Allowed action values (pick exactly one object):
{ "action": "searchProducts", "query": "string", "brand": "string" | null, "maxPrice": number | null, "minPrice": number | null, "category": "string" | null, "inStockOnly": boolean }
{ "action": "addToCart", "productId": number }
{ "action": "removeFromCart", "productId": number }
{ "action": "clearCart" }
{ "action": "placeOrder" }
{ "action": "finish", "message": "string" }`;

  return `${base}${schema}`;
}

async function invokeOllama(prompt) {
  let data;
  try {
    const body = {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: (() => {
          const t = Number(process.env.OLLAMA_TEMPERATURE);
          return Number.isFinite(t) ? t : 0.15;
        })(),
        top_p: 0.9,
        num_predict: (() => {
          const n = Number(process.env.OLLAMA_NUM_PREDICT);
          return Number.isFinite(n) ? n : 120;
        })(),
        num_ctx: (() => {
          const n = Number(process.env.OLLAMA_NUM_CTX);
          return Number.isFinite(n) ? n : 2048;
        })(),
      },
    };

    if (OLLAMA_WANTS_JSON) {
      body.format = 'json';
    }

    const res = await axios.post(OLLAMA_GENERATE_URL, body, {
      timeout: 180000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status < 500,
    });

    if (res.status >= 400) {
      throw new Error(
        `Ollama HTTP ${res.status}: ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`
      );
    }

    data = res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const detail = err.response?.data ?? err.message;
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      throw new Error(`Ollama request failed: ${msg}`);
    }
    throw err;
  }

  const raw = data?.response;
  if (raw == null || String(raw).trim() === '') {
    throw new Error('Empty response from Ollama');
  }

  try {
    return parseModelJson(raw);
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error: ${hint}`);
  }
}

/**
 * @param {object} rt
 */
async function callLLM(
  userInput,
  context,
  lastResult,
  step = 1,
  maxSteps = MAX_AGENT_ITERATIONS,
  rt
) {
  if (!rt) {
    rt = makeRuntime();
  }
  const prompt = buildAgentLoopPrompt(
    userInput,
    context,
    lastResult,
    step,
    maxSteps,
    rt
  );
  return invokeOllama(prompt);
}

function isValidPlan(parsed) {
  return (
    parsed != null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    typeof parsed.action === 'string'
  );
}

function hasNumberField(v) {
  if (v === null || v === undefined) {
    return false;
  }
  return Number.isFinite(Number(v));
}

/**
 * Merge LLM/inline max price with session shopping cap (stricter of the two).
 * @param {object|undefined} rt
 * @param {unknown} explicitFromParse
 * @returns {number|undefined}
 */
function getEffectiveMaxPrice(rt, explicitFromParse) {
  const s = rt && rt.session && rt.session.shoppingContext;
  const sessionMax = s && hasNumberField(s.maxPrice) ? Number(s.maxPrice) : null;
  const ex = hasNumberField(explicitFromParse) ? Number(explicitFromParse) : null;
  if (ex == null) {
    return sessionMax == null ? undefined : sessionMax;
  }
  if (sessionMax == null) {
    return ex;
  }
  return Math.min(ex, sessionMax);
}

/**
 * @param {string|undefined} inferredBrand from user text (OEM hint)
 * @returns {{ q: string, minPrice?: number, maxPrice?: number, category?: string, inStockOnly?: true, brand?: string }|null}
 */
function normalizeSearchParams(parsed, inferredBrand) {
  const q = parsed.query == null ? '' : String(parsed.query).trim();
  const category = parsed.category == null ? '' : String(parsed.category).trim();
  const brandRaw =
    parsed.brand != null && String(parsed.brand).trim() !== ''
      ? String(parsed.brand).trim()
      : inferredBrand && String(inferredBrand).trim() !== ''
        ? String(inferredBrand).trim()
        : '';
  const hasMin = hasNumberField(parsed.minPrice);
  const hasMax = hasNumberField(parsed.maxPrice);
  const inStockOnly = parsed.inStockOnly === true;
  const hasQuery = q.length > 0;
  const hasCategory = category.length > 0;
  const hasBrand = brandRaw.length > 0;

  if (!hasQuery && !hasCategory && !hasMin && !hasMax && !inStockOnly && !hasBrand) {
    return null;
  }

  const o = { q, brand: brandRaw };
  if (hasMin) o.minPrice = Number(parsed.minPrice);
  if (hasMax) o.maxPrice = Number(parsed.maxPrice);
  if (hasCategory) o.category = category;
  if (inStockOnly) o.inStockOnly = true;
  return o;
}

/**
 * @param {object} rt
 */
function runSearchProducts(parsed, rt) {
  const inferred = inferBrandFromText(rt.lastUserMessage || '');
  const params = normalizeSearchParams(parsed, inferred);
  if (!params) {
    return {
      success: false,
      action: 'searchProducts',
      message:
        'Search needs a product query, a category, a brand, a price range, and/or inStockOnly: true.',
    };
  }

  let { q, minPrice, maxPrice, category, inStockOnly, brand } = params;
  const mergedMax = getEffectiveMaxPrice(rt, maxPrice);
  if (mergedMax != null) {
    maxPrice = mergedMax;
  } else {
    maxPrice = undefined;
  }
  const u = (rt.lastUserMessage || '').toLowerCase();
  if (!category) {
    if (/\b(laptop|laptops|macbook|notebook|ultrabook|thinkpad|pavilion|xps|inspiron|alienware|surface)\b/.test(
      u
    )) {
      category = 'Laptop';
    } else if (
      /\b(phone|phones|handset|mobile|smartphone|android|iphone|pixel|galaxy)\b/.test(
        u
      )
    ) {
      category = 'Smartphone';
    } else {
      const fromCat = inferCatalogCategoryFromText(rt.lastUserMessage || '');
      if (fromCat) {
        category = fromCat;
      }
    }
  }

  const products = searchProducts(q, {
    minPrice,
    maxPrice: maxPrice ?? undefined,
    category,
    inStockOnly,
    brand: brand || undefined,
    matchMode: 'andTokens',
  });

  if (!products.length) {
    if (hasNumberField(maxPrice)) {
      const cap = Number(maxPrice);
      const broad = searchProducts(q, {
        minPrice,
        maxPrice: undefined,
        category,
        inStockOnly,
        brand: brand || undefined,
        matchMode: 'andTokens',
      });
      const next = findCheapestPricedAbove(broad, cap);
      if (next) {
        return {
          success: true,
          action: 'searchProducts',
          message: `No matches at or below ₹${cap} in the catalog. The **closest next** option is **${next.name}** at ₹${next.price}. (Raise your budget or say “any price” to clear your saved cap.)`,
          products: [next],
        };
      }
    }
    return {
      success: true,
      action: 'searchProducts',
      message: 'No matching products found.',
      products: [],
    };
  }

  const tail = brand
    ? `${String(brand)}-matching (OEM/keyword filter on our catalog, not a third-party “best” ranking).`
    : 'from the catalog.';
  return {
    success: true,
    action: 'searchProducts',
    message: `Found ${products.length} matching product(s) ${tail}`,
    products,
  };
}

/**
 * @param {object} rt
 */
function runAddToCart(parsed, rt) {
  const id = Number(parsed.productId);
  if (!Number.isFinite(id)) {
    return {
      success: false,
      action: 'addToCart',
      message: 'addToCart requires a valid numeric productId.',
      cart: getCart(rt.session.cart),
    };
  }

  if (!getProductById(id)) {
    return {
      success: false,
      action: 'addToCart',
      message: 'Product not found.',
      cart: getCart(rt.session.cart),
    };
  }

  const cart = addToCart(rt.session.cart, id);

  return {
    success: true,
    action: 'addToCart',
    message: 'Product added to cart.',
    cart,
  };
}

/**
 * @param {object} rt
 */
function runPlaceOrder(rt) {
  const result = placeOrder(rt.session.cart, {
    sessionId: rt.sessionId,
    requestId: rt.requestId,
  });
  if (!result.success) {
    return {
      success: false,
      action: 'placeOrder',
      message: result.message,
      status: result.status,
      order: null,
      cart: getCart(rt.session.cart),
    };
  }
  return {
    success: true,
    action: 'placeOrder',
    message: result.message,
    status: result.status,
    order: result.order,
    cart: getCart(rt.session.cart),
  };
}

/**
 * @param {object} rt
 */
function runRemoveFromCart(parsed, rt) {
  const id = Number(parsed.productId);
  if (!Number.isFinite(id)) {
    return {
      success: false,
      action: 'removeFromCart',
      message:
        'removeFromCart needs a numeric productId (see Current cart in the server snapshot).',
      cart: getCart(rt.session.cart),
    };
  }
  const r = removeFromCartByProductId(rt.session.cart, id);
  if (!r.ok) {
    return {
      success: false,
      action: 'removeFromCart',
      message: 'That product is not in your current cart.',
      cart: r.cart,
    };
  }
  return {
    success: true,
    action: 'removeFromCart',
    message: 'Removed that line from your cart.',
    cart: r.cart,
  };
}

/**
 * @param {object} rt
 */
function runClearCartAction(rt) {
  clearCart(rt.session.cart);
  return {
    success: true,
    action: 'clearCart',
    message: 'Your cart is now empty.',
    cart: getCart(rt.session.cart),
  };
}

/**
 * @param {object} rt
 */
function runTool(parsed, rt) {
  const action = parsed.action;
  console.log('Executing action:', action);

  switch (action) {
    case 'searchProducts':
      return runSearchProducts(parsed, rt);
    case 'addToCart':
      return runAddToCart(parsed, rt);
    case 'removeFromCart':
      return runRemoveFromCart(parsed, rt);
    case 'clearCart':
      return runClearCartAction(rt);
    case 'placeOrder':
      return runPlaceOrder(rt);
    default:
      throw new Error(`Unknown or unsupported action: ${action}`);
  }
}

/**
 * @param {object} rt
 */
async function runAgentTurn(input, rt) {
  const context = [];
  let lastResult = null;

  for (let step = 1; step <= MAX_AGENT_ITERATIONS; step++) {
    console.log('Step', step);

    let parsed;
    try {
      parsed = await callLLM(
        input,
        context,
        lastResult,
        step,
        MAX_AGENT_ITERATIONS,
        rt
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Agent error (LLM request or JSON parse):', msg);
      return {
        success: false,
        message: 'Unable to process your request right now. Please try again.',
      };
    }

    console.log('Agent Thought:', JSON.stringify(parsed));

    if (!isValidPlan(parsed)) {
      lastResult = {
        success: false,
        error: 'Invalid plan: expected object with action string.',
      };
      console.log('Tool Result:', JSON.stringify(lastResult));
      context.push({ action: 'invalid_plan', result: lastResult });
      continue;
    }

    const action = parsed.action;

    if (action === 'finish') {
      const finalMessage =
        parsed.message != null && String(parsed.message).trim() !== ''
          ? String(parsed.message).trim()
          : 'Done.';
      const finishResult = { message: finalMessage };
      context.push({ action: 'finish', result: finishResult });
      return {
        success: true,
        finished: true,
        message: finalMessage,
        context,
      };
    }

    let toolResult;
    try {
      toolResult = runTool(parsed, rt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toolResult = { success: false, error: msg };
      console.log('Tool Result:', JSON.stringify(toolResult));
      lastResult = toolResult;
      context.push({ action, result: toolResult });
      continue;
    }

    console.log('Tool Result:', JSON.stringify(toolResult));
    lastResult = toolResult;
    context.push({ action, result: toolResult });
  }

  const recovered = recoverFromIncompleteTurn(lastResult);
  if (recovered) {
    console.log('Agent recovered last tool result (model did not call finish).');
    return { ...recovered, context, partial: true };
  }

  return {
    success: false,
    message: 'Could not complete request',
    context,
  };
}

/**
 * If the user names a brand and device class, use OEM filter (stable without LLM query shape).
 * @param {string} input
 * @param {object} rt
 * @returns {object|null}
 */
function tryHeuristicBrandDeviceSearch(input, rt) {
  const b = inferBrandFromText(input);
  if (!b) {
    return null;
  }
  const u = String(input);
  const laptop = /\b(laptop|laptops|macbook|notebook|ultrabook|thinkpad|pavilion|xps|inspiron|alienware|surface|chromebook)\b/i.test(
    u
  );
  const phone = /\b(phone|phones|handset|mobile|smartphone|android|pixel|iphone|galaxy)\b/i.test(
    u
  );
  if (laptop && phone) {
    return null;
  }
  const opts = { matchMode: 'andTokens', brand: b };
  if (laptop) {
    opts.category = 'Laptop';
  } else if (phone) {
    opts.category = 'Smartphone';
  } else if (/\b(looking|show|list|search|find|recommend|want|need|after|for)\b/i.test(u)) {
    if (!/\b(watch|buds|earbuds|case|cover|charger|tablet|ipad)\b/i.test(u)) {
      opts.category = 'Smartphone';
    }
  }
  const cap = getEffectiveMaxPrice(rt, extractInrMaxBudget(u));
  if (cap != null) {
    opts.maxPrice = cap;
  }
  let products = searchProducts('', opts);
  if (products.length === 0) {
    if (cap != null) {
      const broad = searchProducts('', { ...opts, maxPrice: undefined });
      const next = findCheapestPricedAbove(broad, cap);
      if (next) {
        return {
          success: true,
          action: 'searchProducts',
          message: `Nothing for ${b} at or below ₹${cap}. The closest next price in the catalog is **${next.name}** at ₹${next.price}.`,
          products: [next],
        };
      }
    }
    return null;
  }
  return {
    success: true,
    action: 'searchProducts',
    message: `Found ${products.length} item(s) for ${b} in our catalog (brand filter; say a max price in ₹ to narrow).`,
    products,
  };
}

function tryHeuristicAddToCart(raw) {
  const q = String(raw).trim();
  if (/\b(remove|delete|clear|drop|trash)\b/i.test(q)) {
    return null;
  }
  const m =
    q.match(/\badd\s+(?:product\s+)?#?(\d+)\b/i) ||
    q.match(/\badd\s+(?:the\s+)?(?:item|product)\s+(\d+)\b/i) ||
    q.match(/\bproduct\s*(?:id)?\s*#?\s*(\d+)\b/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? { productId: id } : null;
}

function tryHeuristicPlaceOrder(raw) {
  const q = String(raw).trim().toLowerCase();
  if (/\b(do\s+not|don't|never)\b/.test(q)) return false;
  return /\b(place\s+(my\s+)?order|checkout|complete\s+(my\s+)?(purchase|order))\b/i.test(
    q
  );
}

/**
 * @param {string} raw
 * @param {object|undefined} rt
 */
function tryHeuristicProductSearch(raw, rt) {
  const q = String(raw).trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  const phoneHints = /\b(phone|phones|mobile|smartphone|android|iphone)\b/i.test(
    lower
  );
  const laptopHints = /\b(laptop|laptops|macbook|notebook|ultrabook)\b/i.test(
    lower
  );
  if (!phoneHints && !laptopHints) return null;
  if (phoneHints && laptopHints) return null;

  const searchQuery = laptopHints ? 'laptop' : 'phone';

  let maxPrice;
  const patterns = [
    /\b(?:my\s+)?(?:budget|max(?:imum)?(?:\s+price)?)\s*(?:is|of|:)?\s*[₹rs.]?\s*(\d[\d,]*)\b/i,
    /\b(?:under|below|less\s+than|upto|up\s+to|within|max(?:imum)?)\s*[₹rs.]?\s*(\d[\d,]*)\b/i,
    /\b[₹]\s*(\d[\d,]*)\b/i,
    /\binr\s*(\d[\d,]*)\b/i,
    /\b(\d[\d,]*)\s*(?:rupees|inr|rs\.?)\b/i,
    /\b(\d{1,2})\s*k\b/i,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m) {
      let n = parseInt(String(m[1]).replace(/,/g, ''), 10);
      if (/\bk\b/i.test(m[0]) && n > 0 && n < 1000) {
        n *= 1000;
      }
      if (Number.isFinite(n) && n > 0) {
        maxPrice = n;
        break;
      }
    }
  }

  if (!rt) {
    return { query: searchQuery, maxPrice };
  }
  const merged = getEffectiveMaxPrice(rt, maxPrice);
  return { query: searchQuery, maxPrice: merged };
}

/**
 * Deterministic remove / clear so "remove this from cart" never hits an unknown tool.
 * @param {string} input
 * @param {object} rt
 * @returns {object|null}
 */
function tryHeuristicRemoveOrClear(input, rt) {
  const q = String(input).trim();
  if (!q) {
    return null;
  }
  const lower = q.toLowerCase();
  const cart = rt.session.cart;
  if (!Array.isArray(cart)) {
    return null;
  }

  if (shouldClearEntireCartByPhrase(q)) {
    if (cart.length === 0) {
      return {
        success: true,
        action: 'clearCart',
        message: 'Your cart is already empty.',
        cart: getCart(cart),
      };
    }
    clearCart(cart);
    return {
      success: true,
      action: 'clearCart',
      message: 'All products have been removed from your cart.',
      cart: getCart(cart),
    };
  }

  const removeWord = /\b(remove|deleting|delete|trash|drop|take\s+out)\b/i.test(
    q
  );
  const targetsCartish =
    /\b(cart|basket|line|this|that|it|the\s+item|the\s+product|product|item)\b/i.test(
      lower
    ) || removeWord;
  if (!removeWord || !targetsCartish) {
    return null;
  }

  let productId;
  const idM =
    q.match(/\b(?:product|item|id|#)\s*#?\s*(\d+)\b/i) || q.match(/(?:^|\s)#(\d+)(?:\s|$)/);
  if (idM) {
    productId = Number(idM[1]);
  } else if (/\b(this|that|it)\b/i.test(lower) && cart.length === 1) {
    productId = Number(cart[0].id);
  } else if (cart.length === 1 && !/\b(phone|laptop|search|show|find|list|best)\b/i.test(q)) {
    // "remove from cart" with one line and no disambiguation needed
    productId = Number(cart[0].id);
  }

  if (!Number.isFinite(productId)) {
    if (cart.length > 1) {
      return {
        success: false,
        action: 'removeFromCart',
        message: `Your cart has ${cart.length} items. Tell me the product id to remove (e.g. "remove product 3 from cart"). Current line ids: ${[...new Set(cart.map((l) => l.id))].join(', ')}.`,
        cart: getCart(cart),
      };
    }
    if (cart.length === 0) {
      return {
        success: false,
        action: 'removeFromCart',
        message: 'Your cart is already empty; nothing to remove.',
        cart: getCart(cart),
      };
    }
    return null;
  }

  const r = removeFromCartByProductId(cart, productId);
  if (!r.ok) {
    return {
      success: false,
      action: 'removeFromCart',
      message: 'That product is not in your current cart.',
      cart: r.cart,
    };
  }
  return {
    success: true,
    action: 'removeFromCart',
    message: 'Removed that item from your cart.',
    cart: r.cart,
  };
}

function wrapFastPathOutcome(toolResult) {
  if (toolResult.success === false) {
    return {
      success: false,
      finished: true,
      fastPath: true,
      message:
        toolResult.message || 'Request could not be completed.',
      status: toolResult.status,
      cart: toolResult.cart,
      order: toolResult.order ?? null,
    };
  }
  const base = {
    success: true,
    finished: true,
    fastPath: true,
    message: toolResult.message || 'Done.',
  };
  if (Array.isArray(toolResult.products)) {
    return { ...base, products: toolResult.products };
  }
  if (Array.isArray(toolResult.cart)) {
    return { ...base, cart: toolResult.cart };
  }
  if (toolResult.status && toolResult.order) {
    return {
      ...base,
      message: toolResult.message,
      status: toolResult.status,
      order: toolResult.order,
    };
  }
  if (toolResult.status) {
    return {
      ...base,
      message: toolResult.message,
      status: toolResult.status,
    };
  }
  return base;
}

/**
 * @param {object} rt
 */
function tryDeterministicToolPath(input, rt) {
  const add = tryHeuristicAddToCart(input);
  if (add) {
    const toolResult = runAddToCart(
      {
        action: 'addToCart',
        productId: add.productId,
      },
      rt
    );
    return wrapFastPathOutcome(toolResult);
  }

  if (tryHeuristicPlaceOrder(input)) {
    const toolResult = runPlaceOrder(rt);
    return wrapFastPathOutcome(toolResult);
  }

  const removed = tryHeuristicRemoveOrClear(input, rt);
  if (removed) {
    return wrapFastPathOutcome(removed);
  }

  const infoBrand = tryInformationalBrandQuestion(input, rt);
  if (infoBrand) {
    return wrapFastPathOutcome(infoBrand);
  }

  const appliance = tryHeuristicApplianceCategorySearch(input, rt);
  if (appliance) {
    return wrapFastPathOutcome(appliance);
  }

  const brandDev = tryHeuristicBrandDeviceSearch(input, rt);
  if (brandDev) {
    return wrapFastPathOutcome(brandDev);
  }

  const phoneBattery = tryHeuristicPhoneBatterySearch(input, rt);
  if (phoneBattery) {
    return wrapFastPathOutcome(phoneBattery);
  }

  const search = tryHeuristicProductSearch(input, rt);
  if (search) {
    const cap = search.maxPrice;
    let products = searchProducts(search.query, {
      maxPrice: cap != null ? cap : undefined,
    });
    let toolResult;
    if (products.length > 0) {
      toolResult = {
        success: true,
        action: 'searchProducts',
        message: `Found ${products.length} matching product(s).`,
        products,
      };
    } else if (cap != null) {
      const broad = searchProducts(search.query, {});
      const next = findCheapestPricedAbove(broad, cap);
      toolResult =
        next != null
          ? {
              success: true,
              action: 'searchProducts',
              message: `No matches at or below ₹${cap}. The closest next option is **${next.name}** at ₹${next.price}.`,
              products: [next],
            }
          : {
              success: true,
              action: 'searchProducts',
              message: 'No matching products found.',
              products: [],
            };
    } else {
      toolResult = {
        success: true,
        action: 'searchProducts',
        message: 'No matching products found.',
        products: [],
      };
    }
    return wrapFastPathOutcome(toolResult);
  }

  return null;
}

function recoverFromIncompleteTurn(lastResult) {
  if (!lastResult || typeof lastResult !== 'object') {
    return null;
  }
  if (lastResult.success !== true) {
    return null;
  }

  if (Array.isArray(lastResult.products)) {
    return {
      success: true,
      finished: true,
      message:
        lastResult.message ||
        (lastResult.products.length
          ? `Here are ${lastResult.products.length} product(s).`
          : 'No matching products.'),
      products: lastResult.products,
    };
  }

  if (Array.isArray(lastResult.cart)) {
    return {
      success: true,
      finished: true,
      message: lastResult.message || 'Cart updated.',
      cart: lastResult.cart,
    };
  }

  if (lastResult.order && lastResult.status === 'success' && lastResult.message) {
    return {
      success: true,
      finished: true,
      message: lastResult.message,
      order: lastResult.order,
      status: lastResult.status,
    };
  }

  if (lastResult.status === 'success' && lastResult.message) {
    return {
      success: true,
      finished: true,
      message: lastResult.message,
      status: lastResult.status,
    };
  }

  return null;
}

/**
 * @param {string|undefined} userInput
 * @param {{ session?: object, sessionId?: string, requestId?: string }} [options]
 */
async function agent(userInput, options = {}) {
  const { session, sessionId, requestId } = options;
  const rt = makeRuntime(session, sessionId, requestId);
  const input = userInput == null ? '' : String(userInput).trim();
  rt.lastUserMessage = input;
  applyBudgetMentionToSession(input, rt.session);
  console.log('Agent received input:', input);

  rt.appendConversation('user', input);

  let outcome;
  try {
    const preClear = preflightClearEntireCartIfRequested(input, rt);
    if (preClear) {
      console.log('[agent] preflight clear cart (phrase match)');
      outcome = preClear;
    } else {
      const greet = AGENT_FAST_PATH ? tryGreetingOrSmalltalkPath(input) : null;
      if (greet) {
        console.log('[agent] greeting/smalltalk fast path — skipped LLM');
        outcome = greet;
      } else {
        const playful = AGENT_FAST_PATH ? tryPlayfulOrOffTopicPath(input) : null;
        if (playful) {
          console.log('[agent] playful/off-topic fast path — skipped LLM');
          outcome = playful;
        } else {
          const fast = AGENT_FAST_PATH ? tryDeterministicToolPath(input, rt) : null;
          if (fast) {
            console.log('[agent] tool fast path — skipped LLM');
            outcome = fast;
          } else {
            outcome = await runAgentTurn(input, rt);
          }
        }
      }
    }
  } catch (err) {
    console.error('Agent unexpected error:', err);
    outcome = {
      success: false,
      message: 'Unable to process your request right now. Please try again.',
    };
  }

  const withCart = {
    ...outcome,
    cart: getCart(rt.session.cart),
  };
  rt.appendConversation('assistant', assistantTranscript(withCart));

  return withCart;
}

module.exports = {
  agent,
  callLLM,
  makeRuntime,
};
