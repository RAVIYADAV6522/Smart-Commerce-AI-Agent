'use strict';

const axios = require('axios');
const { searchProducts, getProductById } = require('./tools/productTool');
const { addToCart, getCart } = require('./tools/cartTool');
const { placeOrder } = require('./tools/orderTool');

const OLLAMA_GENERATE_URL =
  process.env.OLLAMA_GENERATE_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MAX_AGENT_ITERATIONS = Number(process.env.MAX_AGENT_ITERATIONS) || 5;
/** Skip Ollama for obvious search/cart/order phrases (big latency win). Set AGENT_FAST_PATH=0 to disable. */
const AGENT_FAST_PATH =
  String(process.env.AGENT_FAST_PATH || '1').trim() !== '0';
/** Ollama JSON mode (reduces invalid / non-JSON replies). Set OLLAMA_JSON_FORMAT=0 to disable. */
const OLLAMA_WANTS_JSON =
  String(process.env.OLLAMA_JSON_FORMAT || '1').trim() !== '0';
/** Cap stored turns so memory stays bounded (user + assistant entries). */
const MAX_CONVERSATION_MESSAGES = 64;

const conversationHistory = [];

function appendConversation(role, content) {
  const text =
    typeof content === 'string' ? content : JSON.stringify(content);
  conversationHistory.push({ role, content: text });
  if (conversationHistory.length > MAX_CONVERSATION_MESSAGES) {
    const overflow = conversationHistory.length - MAX_CONVERSATION_MESSAGES;
    conversationHistory.splice(0, overflow);
  }
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

function buildAgentLoopPrompt(userInput, context, lastResult, step, maxSteps) {
  const lastChance = step >= maxSteps - 1;

  const base = `Conversation History:
${JSON.stringify(conversationHistory.slice(-5))}

You control an e-commerce assistant. Use Conversation History for follow-ups ("that one", "the second", "my order").

Current user message:
${String(userInput).trim()}

Previous tool steps this turn:
${JSON.stringify(context)}

Last tool result:
${JSON.stringify(lastResult)}

Rules:
- Reply with ONE JSON object only. No markdown, no prose before/after.
- Typical flow: run the right tool (if any), then on the NEXT step use action "finish" with a short helpful message for the user.
- If the user asks for past order details or receipts: we do NOT store order history. Use "finish" and explain that only live cart/checkout actions are supported.
- If Last tool result already answers the user, prefer "finish" now with a clear summary.
- maxPrice may be null when no budget is given.

${
  lastChance
    ? `FINAL STEP (${step}/${maxSteps}): You MUST output ONLY:
{"action":"finish","message":"<brief message for the user>"}
Summarize the last result, apologize if stuck, or say you cannot access order history. No other action.`
    : ''
}`;

  const schema = `

Allowed action values (pick exactly one object):
{ "action": "searchProducts", "query": "string", "maxPrice": number | null }
{ "action": "addToCart", "productId": number }
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

    const res = await axios.post(OLLAMA_GENERATE_URL, body,
      {
        timeout: 180000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status < 500,
      }
    );

    if (res.status >= 400) {
      throw new Error(
        `Ollama HTTP ${res.status}: ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`
      );
    }

    data = res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const detail = err.response?.data ?? err.message;
      const msg =
        typeof detail === 'string' ? detail : JSON.stringify(detail);
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

async function callLLM(
  userInput,
  context,
  lastResult,
  step = 1,
  maxSteps = MAX_AGENT_ITERATIONS
) {
  const prompt = buildAgentLoopPrompt(
    userInput,
    context,
    lastResult,
    step,
    maxSteps
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

function normalizeSearchParams(parsed) {
  const q = parsed.query == null ? '' : String(parsed.query).trim();
  if (!q) {
    return null;
  }

  const maxRaw = parsed.maxPrice;
  const maxPrice =
    maxRaw === null || maxRaw === undefined ? undefined : Number(maxRaw);

  if (maxPrice !== undefined && !Number.isFinite(maxPrice)) {
    return null;
  }

  return { q, maxPrice };
}

function runSearchProducts(parsed) {
  const params = normalizeSearchParams(parsed);
  if (!params) {
    return {
      success: false,
      action: 'searchProducts',
      message: 'Search needs a valid query and optional numeric maxPrice.',
    };
  }

  const products = searchProducts(params.q, params.maxPrice);

  if (!products.length) {
    return {
      success: true,
      action: 'searchProducts',
      message: 'No matching products found.',
      products: [],
    };
  }

  return {
    success: true,
    action: 'searchProducts',
    message: `Found ${products.length} matching product(s).`,
    products,
  };
}

function runAddToCart(parsed) {
  const id = Number(parsed.productId);
  if (!Number.isFinite(id)) {
    return {
      success: false,
      action: 'addToCart',
      message: 'addToCart requires a valid numeric productId.',
      cart: getCart(),
    };
  }

  if (!getProductById(id)) {
    return {
      success: false,
      action: 'addToCart',
      message: 'Product not found.',
      cart: getCart(),
    };
  }

  const cart = addToCart(id);

  return {
    success: true,
    action: 'addToCart',
    message: 'Product added to cart.',
    cart,
  };
}

function runPlaceOrder() {
  const order = placeOrder();
  return {
    success: true,
    action: 'placeOrder',
    message: order.message,
    status: order.status,
  };
}

function runTool(parsed) {
  const action = parsed.action;
  console.log('Executing action:', action);

  switch (action) {
    case 'searchProducts':
      return runSearchProducts(parsed);
    case 'addToCart':
      return runAddToCart(parsed);
    case 'placeOrder':
      return runPlaceOrder();
    default:
      throw new Error(`Unknown or unsupported action: ${action}`);
  }
}

async function runAgentTurn(input) {
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
        MAX_AGENT_ITERATIONS
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
      toolResult = runTool(parsed);
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

function tryHeuristicAddToCart(raw) {
  const q = String(raw).trim();
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

function tryHeuristicProductSearch(raw) {
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

  const query = laptopHints ? 'laptop' : 'phone';

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

  return { query, maxPrice };
}

function wrapFastPathOutcome(toolResult) {
  const base = {
    success: true,
    finished: true,
    fastPath: true,
    message:
      toolResult.message ||
      (toolResult.success === false ? 'Request could not be completed.' : 'Done.'),
  };
  if (Array.isArray(toolResult.products)) {
    return { ...base, products: toolResult.products };
  }
  if (Array.isArray(toolResult.cart)) {
    return { ...base, cart: toolResult.cart };
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

function tryDeterministicToolPath(input) {
  const add = tryHeuristicAddToCart(input);
  if (add) {
    const toolResult = runAddToCart({
      action: 'addToCart',
      productId: add.productId,
    });
    return wrapFastPathOutcome(toolResult);
  }

  if (tryHeuristicPlaceOrder(input)) {
    const toolResult = runPlaceOrder();
    return wrapFastPathOutcome(toolResult);
  }

  const search = tryHeuristicProductSearch(input);
  if (search) {
    const products = searchProducts(search.query, search.maxPrice);
    const toolResult =
      products.length > 0
        ? {
            success: true,
            action: 'searchProducts',
            message: `Found ${products.length} matching product(s).`,
            products,
          }
        : {
            success: true,
            action: 'searchProducts',
            message: 'No matching products found.',
            products: [],
          };
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

async function agent(userInput) {
  const input = userInput == null ? '' : String(userInput).trim();

  console.log('Agent received input:', input);

  appendConversation('user', input);

  let outcome;
  try {
    const fast = AGENT_FAST_PATH ? tryDeterministicToolPath(input) : null;
    if (fast) {
      console.log('[agent] fast path — skipped LLM');
      outcome = fast;
    } else {
      outcome = await runAgentTurn(input);
    }
  } catch (err) {
    console.error('Agent unexpected error:', err);
    outcome = {
      success: false,
      message: 'Unable to process your request right now. Please try again.',
    };
  }

  appendConversation('assistant', assistantTranscript(outcome));

  return outcome;
}

module.exports = {
  agent,
  callLLM,
};
