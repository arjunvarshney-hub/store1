// A signed-in customer's OWN orders only (always filtered by the verified user id).
import { route, requireUser, admin, jsonBody, HttpError } from "../../_lib.js";
import { orderNumber } from "../../_validate.js";
import { signReturnPhotos } from "./returns.js";
import { enqueueAdminNotification, processNotificationOutbox } from "../../_notifications.js";

const COLS = "id,order_number,created_at,updated_at,delivered_at,customer_name,phone,email,address,city,state,pincode,payment_method,payment_status,order_status,items,subtotal,shipping,total,tracking_number,tracking_url";

export default route(["GET", "POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const db = await admin();
  if (req.method === "GET") {
    const num = req.query?.number;
    if (num) {
      const { data, error } = await db.from("orders").select(COLS).eq("user_id", user.id).eq("order_number", orderNumber(num)).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Order not found.");
      let events = [], returns = [], cancellationRequest = null;
      const ev = await db.from("order_events").select("event_type,old_status,new_status,note,created_at").eq("order_id", data.id).order("created_at", { ascending: true }).limit(100);
      if (!ev.error) events = ev.data || []; else if (ev.error.code !== "42P01") throw ev.error;
      const rr = await db.from("order_returns").select("id,order_number,item_index,item_snapshot,reason,details,status,decision_reason,refund_amount,refund_status,delivered_at,return_deadline,legal_issue,photo_urls,created_at,updated_at").eq("order_id", data.id).eq("user_id", user.id).order("created_at", { ascending: true }).limit(50);
      if (!rr.error) returns = await Promise.all((rr.data || []).map(async r => ({ ...r, photos: await signReturnPhotos(db, r.photo_urls), photo_urls: undefined }))); else if (rr.error.code !== "42P01") throw rr.error;
      const cr = await db.from("order_cancellation_requests").select("id,reason,status,decision_reason,created_at,updated_at,decided_at").eq("order_id", data.id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!cr.error) cancellationRequest = cr.data; else if (cr.error.code !== "42P01") throw cr.error;
      return res.json({ order: { ...data, events, returns, cancellationRequest } });
    }
    const { data, error } = await db.from("orders").select(COLS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return res.json({ orders: data || [] });
  }
  const b = jsonBody(req);
  if (b.action !== "cancel") throw new HttpError(400, "Unknown action.");
  const requestedNumber = orderNumber(b.orderNumber);
  const { data: before } = await db.from("orders").select("id,order_number,created_at,customer_name,phone,email,address,city,state,pincode,payment_method,payment_status,order_status,items,subtotal,shipping,total").eq("user_id", user.id).eq("order_number", requestedNumber).maybeSingle();
  const { data, error } = await db.rpc("set_order_status", { p_order_number: requestedNumber, p_status: "cancelled", p_user: user.id });
  if (error) {
    if (/NOT_FOUND/.test(error.message)) throw new HttpError(404, "Order not found.");
    if (/NOT_ALLOWED/.test(error.message)) throw new HttpError(409, "This order can no longer be cancelled online. Please call the shop.");
    throw error;
  }
  try {
    if (data.order_status === "cancelled") {
      await enqueueAdminNotification(db, { ...(before || data), ...data }, "order_cancelled");
      await processNotificationOutbox(db, { limit: 2 });
    }
  } catch (e) { console.error("[order-notification] queue failed", String(e?.message || "error").slice(0,120)); }
  res.json({ ok: true, order_status: data.order_status, payment_status: data.payment_status });
});
