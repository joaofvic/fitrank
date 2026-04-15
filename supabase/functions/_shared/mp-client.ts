const MP_API_BASE = 'https://api.mercadopago.com';

// ============================================================
// Types
// ============================================================

export interface MpPreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
  description?: string;
}

export interface MpBackUrls {
  success: string;
  failure: string;
  pending: string;
}

export interface MpPayer {
  email: string;
  name?: string;
}

export interface MpPreferenceInput {
  items: MpPreferenceItem[];
  payer: MpPayer;
  back_urls: MpBackUrls;
  auto_return?: 'approved' | 'all';
  external_reference: string;
  notification_url: string;
  expires?: boolean;
  statement_descriptor?: string;
}

export interface MpPreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  external_reference: string;
  [key: string]: unknown;
}

export interface MpPayment {
  id: number;
  status: 'approved' | 'pending' | 'authorized' | 'in_process' | 'in_mediation' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';
  status_detail: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
  payment_method_id: string;
  payment_type_id: string;
  payer: {
    id: number | null;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  date_approved: string | null;
  date_created: string;
  [key: string]: unknown;
}

export interface MpRefundResponse {
  id: number;
  payment_id: number;
  amount: number;
  status: string;
  date_created: string;
  [key: string]: unknown;
}

export interface MpCreatePaymentInput {
  transaction_amount: number;
  description: string;
  payment_method_id: string; // 'pix' | 'visa' | ...
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    identification?: { type: string; number: string };
  };
  external_reference?: string;
  notification_url?: string;
  installments?: number;
  token?: string;
  issuer_id?: string;
}

export interface MpCreatePaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  external_reference?: string;
  transaction_amount: number;
  payment_method_id: string;
  payment_type_id?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  [key: string]: unknown;
}

// ============================================================
// Client
// ============================================================

export class MpClient {
  private accessToken: string;

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error('MpClient: MP_ACCESS_TOKEN é obrigatório');
    }
    this.accessToken = accessToken;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${MP_API_BASE}${path}`;

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
    };

    if (body && method !== 'GET') {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    if (res.status === 204) return undefined as T;

    const data = await res.json();

    if (!res.ok) {
      const detail = data?.message ?? data?.error ?? JSON.stringify(data);
      throw new Error(`MpAPI ${method} ${path} (${res.status}): ${detail}`);
    }

    return data as T;
  }

  // ---- Preferences ----

  async createPreference(input: MpPreferenceInput): Promise<MpPreferenceResponse> {
    return this.request<MpPreferenceResponse>(
      'POST',
      '/checkout/preferences',
      input as unknown as Record<string, unknown>
    );
  }

  // ---- Payments ----

  async getPayment(paymentId: string | number): Promise<MpPayment> {
    return this.request<MpPayment>('GET', `/v1/payments/${paymentId}`);
  }

  async createPayment(input: MpCreatePaymentInput): Promise<MpCreatePaymentResponse> {
    return this.request<MpCreatePaymentResponse>(
      'POST',
      '/v1/payments',
      input as unknown as Record<string, unknown>
    );
  }

  // ---- Refunds ----

  async refundPayment(paymentId: string | number): Promise<MpRefundResponse> {
    return this.request<MpRefundResponse>(
      'POST',
      `/v1/payments/${paymentId}/refunds`,
      {}
    );
  }

  // ---- Webhook Signature ----

  /**
   * Valida a assinatura HMAC-SHA256 do webhook do Mercado Pago.
   * O header x-signature contém `ts=...,v1=...` e usamos o secret
   * para recalcular e comparar.
   */
  static async validateWebhookSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
    secret: string
  ): Promise<boolean> {
    const parts = Object.fromEntries(
      xSignature.split(',').map(p => {
        const [k, ...v] = p.trim().split('=');
        return [k, v.join('=')];
      })
    );

    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(manifest)
    );

    const computed = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computed === v1;
  }

  // ---- Helpers ----

  static centsToReais(cents: number): number {
    return Math.round(cents) / 100;
  }

  static reaisToCents(reais: number): number {
    return Math.round(reais * 100);
  }
}

// ============================================================
// Factory
// ============================================================

export function createMpClient(): MpClient {
  const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!accessToken) {
    throw new Error('Variável MP_ACCESS_TOKEN não configurada');
  }
  return new MpClient(accessToken);
}
