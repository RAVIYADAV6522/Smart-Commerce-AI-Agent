/**
 * JSON contract for `POST /ask` and `POST /backend/ask` responses.
 * The handler may add `requestId` (string) to every success and error object.
 */
export type AskProduct = {
  id: number;
  name: string;
  price: number;
  category: string;
  stock?: number;
  /** Optional; used in search + UI */
  highlights?: string;
};

export type SearchFilterOptions = {
  maxPrice?: number | null;
  minPrice?: number | null;
  category?: string | null;
  inStockOnly?: boolean;
};

export type LineItem = {
  id: number;
  name: string;
  price: number;
  category?: string;
};

export type OrderRecord = {
  id: string;
  lineItems: LineItem[];
  subtotal: number;
  currency: string;
  createdAt: string;
  sessionId?: string;
  requestId?: string;
};

export type OrderPayload = {
  id: string;
  lineItems: LineItem[];
  subtotal: number;
  currency: string;
  createdAt: string;
};

export type PlaceOrderResult = {
  success: boolean;
  status: string;
  message: string;
  order: OrderPayload | null;
};

/**
 * Main assistant payload returned to the client.
 */
export type AskSuccess = {
  success: boolean;
  message: string;
  /** Present when the model finished or fast-path returned text */
  finished?: boolean;
  fastPath?: boolean;
  partial?: boolean;
  products?: AskProduct[];
  /** Current cart for this session after the turn */
  cart?: AskProduct[];
  order?: OrderPayload | null;
  status?: string;
  context?: unknown[];
};

export type AskErrorBody = {
  error: string;
  code?: string;
  requestId?: string;
};
