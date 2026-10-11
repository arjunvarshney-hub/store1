# SHRI JI Assistant — setup and safety guide

## What is implemented in this project snapshot

The storefront now includes a floating **SHRI JI Assistant** on the home, shop, category and product pages. It is intentionally hidden on cart, checkout, account and admin pages so it does not compete with payment or account actions.

The server-side endpoint is routed through the existing `/api/site` dispatcher as `/api/assistant`; it does not add a separate top-level Vercel function. It reads active products from the existing public catalogue. Recommendations include current price, current stock, product URL and only real ratings where available.

There are two modes:

- **AI mode:** enabled only when both `OPENAI_API_KEY` and `OPENAI_MODEL` are configured server-side. The server calls OpenAI's Responses API. The key is never sent to the browser.
- **Catalogue fallback:** when the key/model is missing or the AI provider fails, the assistant says that live AI is not configured/unavailable and can still use simple product/category/budget matching. It must not claim that this fallback is an AI-generated answer.

The assistant is read-only. It cannot change prices, inventory, order status, payment status, refund records or admin settings. It does not expose order details and redirects customers to the existing My Orders flow. Do not type passwords, payment secrets or private customer details into the chat.

## Configure live AI in Vercel

1. Open the correct Vercel project connected to this repository.
2. Open **Settings → Environment Variables**.
3. Add these variables for **Preview** first:
   - `AI_ASSISTANT_ENABLED` = `true`
   - `OPENAI_API_KEY` = your OpenAI API key (secret; server-side only)
   - `OPENAI_MODEL` = an available model ID enabled for your API project
4. Save the variables and redeploy the Preview deployment.
5. Open the Preview site on a phone and desktop. Ask the same product question in English, Hindi and Hinglish; test a budget and out-of-stock question.
6. Check the browser Network panel and built JavaScript to confirm the key is never present in responses or client files. Review Vercel function logs without printing request bodies or credentials.
7. Only after Preview works and usage/cost limits have been considered should the same variables be added to Production. Do not enable billing or buy credits without the owner's explicit choice.

**Never put `OPENAI_API_KEY` in `public/`, HTML, client JavaScript, a `NEXT_PUBLIC_`/public variable, Supabase public settings, GitHub commits, screenshots or this file. Never paste it into ChatGPT.**

If `OPENAI_API_KEY` or `OPENAI_MODEL` is absent, the endpoint deliberately stays in catalogue-only mode. If the provider is configured but times out/errors, the user sees a transparent fallback message. A real AI interaction cannot be verified until an authorized server-side key/model is configured and a Preview transaction is tested.

## Model/provider documentation and costs

The integration uses OpenAI's server-side **Responses API** with `store: false`, a short prompt, a 12-second timeout and a low output-token limit. Check the current official documentation and the models enabled in your own API project before choosing `OPENAI_MODEL`:

- API method: https://developers.openai.com/api/reference/resources/responses/methods/create
- Model list: https://developers.openai.com/api/docs/models

API usage may incur charges according to the model and current account pricing. This project does not create an account, enable billing or buy credits on the owner's behalf. Select an appropriate model and set account usage limits/alerts at the provider where available.

## Known limitations and operational notes

- The rate limiter currently uses per-runtime in-memory counters. It helps with short bursts but is **not a durable/distributed rate limit** across serverless instances and may reset on cold starts. Before substantial public traffic, add an approved durable rate limiter (or platform-level rate protection). Do not mistake the in-memory control for production-grade abuse prevention.
- The bot uses current public product rows as catalogue context, but a language model can still make mistakes. The product cards are tied to current server data; customers must verify exact variant and final total on the product page/checkout.
- This snapshot does not add an admin screen for editing chatbot FAQ content. Toggle the assistant with `AI_ASSISTANT_ENABLED`; provider credentials remain server-side environment variables. Published return/refund/guaranteed-delivery policies must be supplied and verified before the bot can answer them specifically.
- Order tracking deliberately does not look up records from the chat. Customers should use the existing signed-in **My Orders** flow.
- No real provider key was supplied for this build, so live AI responses are `NOT TESTABLE` in this environment.
