const BASE_URL = 'https://api.cakto.com.br';
const CHECKOUT_BASE_URL = 'https://pay.cakto.com.br';
const TOKEN_REFRESH_MARGIN_MS = 60_000;

// ============================================================
// Types
// ============================================================

export interface CaktoOffer {
  id: string;
  name: string;
  image: string | null;
  price: number;
  units: number;
  default: boolean;
  product: string;
  status: 'active' | 'disabled' | 'deleted';
  type: 'unique' | 'subscription';
  intervalType?: 'week' | 'month' | 'year' | 'lifetime';
  interval?: number;
  recurrence_period?: number;
  quantity_recurrences?: number;
  trial_days?: number;
  max_retries?: number;
  retry_interval?: number;
}

export interface CreateOfferInput {
  name: string;
  price: number;
  product: string;
  type: 'unique' | 'subscription';
  status?: 'active' | 'disabled';
  intervalType?: 'week' | 'month' | 'year' | 'lifetime';
  interval?: number;
  recurrence_period?: number;
  quantity_recurrences?: number;
  trial_days?: number;
  max_retries?: number;
  retry_interval?: number;
}

export interface UpdateOfferInput {
  name?: string;
  price?: number;
  status?: 'active' | 'disabled';
  intervalType?: 'week' | 'month' | 'year' | 'lifetime';
  interval?: number;
  recurrence_period?: number;
  quantity_recurrences?: number;
  trial_days?: number;
  max_retries?: number;
  retry_interval?: number;
}

export interface CaktoOrderCustomer {
  name: string | null;
  email: string | null;
  phone: string | null;
  docType: string | null;
  docNumber: string | null;
  birthDate: string | null;
}

export interface CaktoOrder {
  id: string;
  refId: string;
  status: string;
  amount: number;
  baseAmount: string;
  discount: string;
  paidAt: string | null;
  createdAt: string;
  canceledAt: string | null;
  refundedAt: string | null;
  chargedbackAt: string | null;
  paymentMethod: string;
  customer: CaktoOrderCustomer;
  product: {
    id: string;
    name: string;
    type: 'unique' | 'subscription';
  };
  offer: {
    id: string;
    name: string;
    price: number;
  };
  checkoutUrl: string;
  sck: string | null;
  subscription: unknown | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CaktoProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'unique' | 'subscription';
  status: 'active' | 'blocked' | 'deleted';
  paymentMethods: string[];
}

// ============================================================
// Client
// ============================================================

export class CaktoClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(clientId: string, clientSecret: string) {
    if (!clientId || !clientSecret) {
      throw new Error('CaktoClient: client_id e client_secret são obrigatórios');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // ---- Auth ----

  async authenticate(): Promise<void> {
    const res = await fetch(`${BASE_URL}/public_api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CaktoClient: autenticação falhou (${res.status}): ${text}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in * 1000) - TOKEN_REFRESH_MARGIN_MS;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      await this.authenticate();
    }
  }

  // ---- HTTP primitives ----

  async request<T = unknown>(
    method: string,
    path: string,
    options?: { body?: Record<string, unknown>; params?: Record<string, string> }
  ): Promise<T> {
    await this.ensureAuth();

    let url = `${BASE_URL}${path}`;
    if (options?.params) {
      const qs = new URLSearchParams(options.params).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    if (options?.body && method !== 'GET') {
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, init);

    if (res.status === 204) return undefined as T;

    const data = await res.json();

    if (!res.ok) {
      const detail = data?.detail ?? JSON.stringify(data);
      throw new Error(`CaktoAPI ${method} ${path} (${res.status}): ${detail}`);
    }

    return data as T;
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async put<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  async del<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ---- Offers ----

  async createOffer(input: CreateOfferInput): Promise<CaktoOffer> {
    return this.post<CaktoOffer>('/public_api/offers/', input as unknown as Record<string, unknown>);
  }

  async getOffer(offerId: string): Promise<CaktoOffer> {
    return this.get<CaktoOffer>(`/public_api/offers/${offerId}/`);
  }

  async updateOffer(offerId: string, input: UpdateOfferInput): Promise<CaktoOffer> {
    const current = await this.getOffer(offerId);
    const merged = { ...current, ...input };
    return this.put<CaktoOffer>(`/public_api/offers/${offerId}/`, merged as unknown as Record<string, unknown>);
  }

  async listOffers(params?: Record<string, string>): Promise<PaginatedResponse<CaktoOffer>> {
    return this.get<PaginatedResponse<CaktoOffer>>('/public_api/offers/', params);
  }

  async disableOffer(offerId: string): Promise<CaktoOffer> {
    return this.updateOffer(offerId, { status: 'disabled' });
  }

  async deleteOffer(offerId: string): Promise<void> {
    await this.del(`/public_api/offers/${offerId}/`);
  }

  // ---- Products ----

  async listProducts(params?: Record<string, string>): Promise<PaginatedResponse<CaktoProduct>> {
    return this.get<PaginatedResponse<CaktoProduct>>('/public_api/products/', params);
  }

  async getProduct(productId: string): Promise<CaktoProduct> {
    return this.get<CaktoProduct>(`/public_api/products/${productId}/`);
  }

  // ---- Orders ----

  async getOrder(orderId: string): Promise<CaktoOrder> {
    return this.get<CaktoOrder>(`/public_api/orders/${orderId}/`);
  }

  async listOrders(params?: Record<string, string>): Promise<PaginatedResponse<CaktoOrder>> {
    return this.get<PaginatedResponse<CaktoOrder>>('/public_api/orders/', params);
  }

  async refundOrder(orderId: string): Promise<{ detail: string }> {
    return this.post<{ detail: string }>(`/public_api/orders/${orderId}/refund/`, {});
  }

  // ---- Helpers ----

  /**
   * Monta a URL de checkout da Cakto para uma oferta, com parâmetros opcionais
   * para identificar o usuário FitRank via `sck` e pré-preencher o email.
   */
  static checkoutUrl(offerId: string, options?: { email?: string; sck?: string }): string {
    const url = new URL(`${CHECKOUT_BASE_URL}/${offerId}`);
    if (options?.email) url.searchParams.set('email', options.email);
    if (options?.sck) url.searchParams.set('sck', options.sck);
    return url.toString();
  }

  /**
   * Converte um valor em centavos (usado no FitRank DB) para reais (usado na API Cakto).
   * Ex: 2990 -> 29.90
   */
  static centsToReais(cents: number): number {
    return Math.round(cents) / 100;
  }

  /**
   * Converte um valor em reais (API Cakto) para centavos (FitRank DB).
   * Ex: 29.90 -> 2990
   */
  static reaisToCents(reais: number): number {
    return Math.round(reais * 100);
  }
}

// ============================================================
// Factory — cria CaktoClient a partir de env vars do Supabase
// ============================================================

export function createCaktoClient(): CaktoClient {
  const clientId = Deno.env.get('CAKTO_CLIENT_ID');
  const clientSecret = Deno.env.get('CAKTO_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Variáveis CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET não configuradas');
  }
  return new CaktoClient(clientId, clientSecret);
}
