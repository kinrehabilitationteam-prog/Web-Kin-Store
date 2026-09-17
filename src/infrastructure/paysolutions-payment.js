import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { PaymentGateway } from "../application/commerce-ports.js";
import { CatalogError } from "../domain/catalog.js";

// Contract: https://api-docs.payso.co/docs/api/payment-link/secure-link-api
// Status: https://api-docs.payso.co/docs/api/payment-features/inquiry-api
export class PaySolutionsPaymentGateway extends PaymentGateway {
  provider = "paysolutions";
  label = "Pay Solutions";
  testMode = false;
  requiresStartMarker = true;
  constructor({
    merchantId = "",
    shopName = "",
    apiKey = "",
    secretKey = "",
    publicUrl = "",
    fetcher = fetch,
  } = {}) {
    super();
    Object.assign(this, { merchantId, shopName, apiKey, secretKey, fetcher });
    this.publicUrl = publicUrl.replace(/\/$/, "");
    this.enabled = !!(
      merchantId &&
      shopName &&
      apiKey &&
      secretKey &&
      publicUrl
    );
    if (
      this.enabled &&
      (!/^\d{8}$/.test(merchantId) || !/^[a-zA-Z0-9_-]+$/.test(shopName))
    )
      throw new Error(
        "Pay Solutions requires an 8-digit merchant ID and payment-link shop name",
      );
    if (this.enabled) {
      const url = new URL(this.publicUrl);
      if (url.protocol !== "https:" || url.origin !== this.publicUrl)
        throw new Error(
          "Pay Solutions requires PUBLIC_URL to be an HTTPS origin",
        );
    }
  }
  newOrderId() {
    return String(randomInt(100000000000, 1000000000000));
  }
  token(id) {
    return createHmac("sha256", this.secretKey).update(id).digest("hex");
  }
  verifyPostback(id, token = "") {
    return (
      this.enabled &&
      /^[a-f0-9]{64}$/.test(token) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(this.token(id)))
    );
  }
  async request(path, data, inquiry = false) {
    if (!this.enabled)
      throw new CatalogError("ยังไม่ได้ตั้งค่า Pay Solutions", 503);
    try {
      const response = await this.fetcher(
        "https://apis.paysolutions.asia" + path,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            apikey: this.apiKey,
            ...(inquiry
              ? {
                  merchantID: this.merchantId.slice(-5),
                  merchantSecretKey: this.secretKey,
                }
              : {}),
          },
          body: JSON.stringify(data),
        },
      );
      if (!response.ok) throw new Error();
      const text = await response.text();
      if (!text.trim() && inquiry) return null;
      return JSON.parse(text);
    } catch {
      throw new CatalogError(
        "ตรวจสอบกับ Pay Solutions ไม่สำเร็จ กรุณาลองใหม่",
        502,
      );
    }
  }
  async start(order) {
    if (!/^\d{12}$/.test(order.id) || order.currency !== "thb")
      throw new CatalogError("ข้อมูลคำสั่งซื้อไม่รองรับ Pay Solutions", 409);
    if (order.checkoutUrl) return { id: order.id, url: order.checkoutUrl };
    if (!order.paymentAttemptFresh)
      throw new CatalogError(
        "มีการเริ่มชำระเงินแล้วแต่ยังไม่ได้รับลิงก์ กรุณาติดต่อร้านเพื่อตรวจสอบก่อนเริ่มใหม่",
        409,
      );
    // Bangkok merchant time. No local stock release depends on this link expiry.
    const expiry = new Date(Date.parse(order.expiresAt) + 7 * 3600000)
      .toISOString()
      .slice(0, 19)
      .replace(/[T:]/g, "-");
    const link = await this.request(
      `/secure/v3/secure/encryptz/${encodeURIComponent(this.shopName)}`,
      {
        merchant: this.shopName,
        payValue: (order.total / 100).toFixed(2),
        orderDetail: `Order ${order.id}`,
        expireDate: expiry,
        userEMail: order.customer.email,
        userTelNo: order.customer.phone,
        postBackURL: `${this.publicUrl}/api/payments/paysolutions/postback/${order.id}?token=${this.token(order.id)}`,
        returnURL: `${this.publicUrl}/orders/${order.id}?payment=returned`,
        monthInstallment: "",
        bankInstallment: "",
        oneTime: "Y",
        refNo: order.id,
      },
    );
    if (
      link?.merchant !== this.shopName ||
      !/^[a-zA-Z0-9_-]+$/.test(String(link.payValue || "")) ||
      typeof link.orderDetail !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(link.orderDetail)
    )
      throw new CatalogError("ข้อมูลลิงก์จาก Pay Solutions ไม่ถูกต้อง", 502);
    return {
      id: order.id,
      url: `https://pay.sn/${this.shopName}/${link.payValue}/${link.orderDetail}`,
    };
  }
  async status(order) {
    const data = await this.request(
      "/order/orderdetailpost",
      {
        merchantID: this.merchantId.slice(-5),
        orderNo: "X",
        refno: order.id,
        productDetail: "QWERTY",
      },
      true,
    );
    if (data === null || (Array.isArray(data) && !data.length))
      return { status: "pending" };
    const rows = Array.isArray(data) ? data : [data];
    const matches = rows.filter((r) => String(r.ReferenceNo) === order.id);
    if (matches.length !== 1)
      throw new CatalogError(
        "ผลการชำระเงินไม่ตรงกับคำสั่งซื้อ กรุณาติดต่อเจ้าหน้าที่",
        409,
      );
    const row = matches[0];
    if (
      String(row.MerchantID) !== this.merchantId ||
      row.ProductDetail !== `Order ${order.id}` ||
      row.CurrencyCode !== "00" ||
      !/^\d+(\.\d{1,2})?$/.test(String(row.Total))
    )
      throw new CatalogError(
        "ข้อมูลยืนยัน Pay Solutions ไม่ตรงกับคำสั่งซื้อ",
        409,
      );
    return {
      id: order.id,
      status: row.Status === "CP" ? "paid" : "pending",
      amount: Math.round(Number(row.Total) * 100),
      currency: "thb",
    };
  }
  async cancel(order) {
    if (!order.paymentId)
      return {
        status:
          Date.now() >= Date.parse(order.expiresAt) ? "expired" : "cancelled",
      };
    // Inquiry has no authoritative unpaid/void result: never release reserved stock on silence.
    const state = await this.status(order);
    if (state.status === "paid") return state;
    throw new CatalogError(
      "เปิดรายการกับ Pay Solutions แล้ว กรุณาติดต่อร้านเพื่อตรวจสอบหรือยกเลิกการชำระเงิน",
      409,
    );
  }
}
