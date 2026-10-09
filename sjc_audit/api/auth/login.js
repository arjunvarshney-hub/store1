import { anon, setAuthCookies } from "../../lib/supabase.js";

export default async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { email, password } = req.body || {};
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim()) || typeof password !== "string" || password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: "Enter a valid email address and password." });
  }
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)) {
    console.error("Auth login unavailable: Supabase URL/anon key missing");
    return res.status(503).json({ error: "Login service is not configured. Check SUPABASE_URL and SUPABASE_ANON_KEY in Vercel Environment Variables." });
  }
  try {
    const { data, error } = await anon.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data?.session) {
      const code = String(error?.code || error?.message || "").toLowerCase();
      if (code.includes("email_not_confirmed") || code.includes("email not confirmed")) {
        return res.status(401).json({ error: "Please confirm your email using the link sent by Supabase, then sign in again." });
      }
      return res.status(401).json({ error: "Login failed. Check your email and password. If you just created the account, confirm your email first." });
    }
    setAuthCookies(res, data.session);
    return res.status(200).json({ ok: true, user: { id: data.user.id, email: data.user.email } });
  } catch (e) {
    console.error("Auth login failed", e?.message || "unknown error");
    return res.status(503).json({ error: "Login service is temporarily unavailable. Check the deployment logs and Supabase configuration." });
  }
}
