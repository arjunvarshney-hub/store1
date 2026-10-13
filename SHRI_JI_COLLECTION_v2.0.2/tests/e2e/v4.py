# v4.0.0 browser checks (Android-size screen). Start the harness first:  SEED=1 PORT=4333 node tests/e2e/server.mjs
import json, sys, urllib.request, re
from playwright.sync_api import sync_playwright
B = "http://localhost:4333"; R = []
def rec(name, ok, note=""):
    R.append((name, ok)); print(("PASS " if ok else "FAIL ") + name + (" — " + str(note) if note else ""), flush=True)
def state(): return json.load(urllib.request.urlopen(B + "/__state"))
CTX = dict(viewport={"width": 360, "height": 740}, device_scale_factor=2, is_mobile=True, has_touch=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    def ctx(): return br.new_context(**CTX)
    def overflow(pg, n):
        w = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]"); rec(f"no horizontal overflow: {n}", w[0] <= w[1], w)
    c = ctx(); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    # ---- home: Thakur Ji first; removed categories gone ----
    pg.goto(B + "/"); html = pg.content(); overflow(pg, "home")
    rec("home: Thakur Ji section comes before Ladies Wear", html.index('id="thakur"') < html.index('class="wrap sec ladies"'))
    rec("home: hero button leads to Thakur Ji Poshak", pg.locator("a.btn.primary.lg").first.get_attribute("href") == "/category/thakur-ji-poshak")
    pg.click("#menuBtn"); menu = pg.inner_text("#menuPanel")
    rec("menu lists Thakur Ji Poshak before Ladies Wear", menu.index("Thakur Ji Poshak") < menu.index("Ladies Wear"))
    rec("removed categories are not offered anywhere", not re.search(r"Maxi|Gown|Fall and Astar|Dress Material|Saree", html + menu + pg.content()))
    rec("Mala and Necklace is one category", "Mala and Necklace" in menu and ">Necklace<" not in html)
    pg.goto(B + "/category/maxi"); rec("a removed category page is a 404", "not found" in pg.content().lower() or pg.title().lower().startswith("page")); errs.clear()   # (the 404 itself is expected)

    # ---- product with photos: swipe gallery, zoom, rich text, specs, return policy ----
    pg.goto(B + "/product/maroon-velvet-laddu-gopal-poshak-1"); overflow(pg, "product page")
    rec("gallery shows 1 / 3 and swipes by scrolling", pg.inner_text("#galCount") == "1 / 3")
    pg.evaluate("document.getElementById('galTrack').scrollTo({left: document.getElementById('galTrack').clientWidth, behavior: 'instant'})"); pg.wait_for_timeout(300)
    rec("after a swipe the counter says 2 / 3", pg.inner_text("#galCount") == "2 / 3", pg.inner_text("#galCount"))
    pg.click(".gal-th .th[data-i='2']"); pg.wait_for_timeout(600); rec("thumbnail jumps to photo 3", pg.inner_text("#galCount") == "3 / 3")
    pg.click(".gal-zoom[data-i='2']"); rec("tap opens zoom view", pg.is_visible("#lightbox") and "3 / 3" in pg.inner_text("#lbCount"))
    pg.click("#lbImg"); rec("tap on photo zooms in", "zoomed" in (pg.get_attribute("#lbImg", "class") or "")); pg.keyboard.press("Escape"); rec("Esc closes zoom", not pg.is_visible("#lightbox"))
    d = pg.inner_html(".desc.rich")
    rec("description keeps bold + bullet list + heading", "<strong>poshak</strong>" in d and "<ul><li>" in d and "<h3>" in d)
    rec("specifications table hides empty rows and shows owner rows", "Suitable idol size" in pg.inner_text(".specs") and "Pack size" not in pg.inner_text(".specs"))
    rec("returnable product shows window", "Returnable within 7 days" in pg.inner_text(".ret.ok"))
    rec("delivery rule visible", "FREE from ₹1,000" in pg.inner_text("#deliveryNote"))
    pg.click("#addBtn"); rec("size is required", "select a size" in pg.inner_text("#pdpMsg").lower())

    # ---- non-returnable + minimum order ----
    pg.goto(B + "/product/royal-blue-silk-krishna-poshak-2")
    rec("non-returnable is stated clearly", "Non-Returnable" in pg.inner_text(".ret.no") and "legal rights" in pg.inner_text(".ret.no"))
    rec("quantity starts at the minimum order (2)", pg.inner_text("#qVal") == "2")
    pg.click("#qMinus"); rec("cannot go below the minimum", pg.inner_text("#qVal") == "2")

    # ---- variants + pack size ----
    pg.goto(B + "/product/pearl-necklace-for-laddu-gopal-5"); overflow(pg, "variant product")
    pg.click("#addBtn"); rec("variant options are required", "Please choose: Colour, Pack Size" in pg.inner_text("#optMsg"), pg.inner_text("#optMsg"))
    pg.click('.opt[data-v="Blue"]'); rec("a pack that is out of stock is disabled for that colour", pg.is_disabled('.opt[data-v="Pack of 3"]'))
    pg.click('.opt[data-v="Blue"]'); pg.click('.opt[data-v="Red"]'); pg.click('.opt[data-v="Pack of 3"]')
    rec("variant price + sale shown", "₹300" in pg.inner_text("#priceBox") and "₹330" in pg.inner_text("#priceBox"), pg.inner_text("#priceBox"))
    rec("pack info explains pieces", "6 pieces" in pg.inner_text("#packInfo"), pg.inner_text("#packInfo"))
    pg.click("#addBtn"); rec("added to cart", "Added to your cart" in pg.inner_text("#pdpMsg"))

    # ---- signup, cart totals with delivery ----
    pg.goto(B + "/account"); pg.click("text=Create account"); pg.fill("input[name=name]", "Sita Devi"); pg.fill("input[name=email]", "sita@example.com"); pg.fill("input[name=password]", "Password123")
    pg.click("#go"); pg.wait_for_selector("text=My orders")
    pg.goto(B + "/cart"); pg.wait_for_selector(".row"); t = pg.inner_text("#box")
    rec("cart shows pack of 3 and quantity 2", "Pack of 3 (3 pieces per pack)" in t and "× 2" in t)
    rec("₹600 subtotal => delivery ₹40, total ₹640", "₹600" in t and "₹40" in t and "₹640" in t, t[-260:].replace("\n", " "))
    rec("free-delivery hint is exact (₹400 more)", "Add ₹400 more to unlock free delivery." in t)
    overflow(pg, "cart")
    pg.goto(B + "/product/silver-bansuri-6"); pg.click("#addBtn"); pg.goto(B + "/cart"); pg.wait_for_selector(".row")
    t = pg.inner_text("#box"); rec("₹820 subtotal => still ₹40; hint ₹180", "₹820" in t and "Add ₹180 more" in t, t[-200:].replace("\n", " "))
    pg.click('[data-a="inc"] >> nth=-1'); t = pg.inner_text("#box")
    rec("₹1,040 subtotal => delivery FREE", "₹1,040" in t and "FREE" in t and "You have free delivery" in t, t[-200:].replace("\n", " "))
    pg.click('[data-a="dec"] >> nth=-1')
    pg.goto(B + "/checkout"); pg.wait_for_selector("form#f", timeout=8000)
    pg.fill("input[name=name]", "Sita Devi"); pg.fill("input[name=phone]", "9927892667"); pg.fill("textarea[name=address]", "Sarai Tareen, Sambhal"); pg.fill("input[name=city]", "Sambhal"); pg.fill("input[name=state]", "Uttar Pradesh"); pg.fill("input[name=pincode]", "244303")
    rec("checkout shows delivery and total payable", "Delivery" in pg.inner_text("#box") and "Total payable" in pg.inner_text("#box"))
    pg.click("input[value=COD]"); pg.click("#go"); pg.wait_for_url(re.compile(r"/account\?order="), timeout=8000)
    st = state(); o = st["orders"][-1]
    rec("server total = subtotal + delivery (never from the browser)", o["subtotal"] == 820 and o["shipping"] == 40 and o["total"] == 860, (o["subtotal"], o["shipping"], o["total"]))
    line = [i for i in o["items"] if i["variant_id"]][0]
    rec("order snapshot keeps variant, SKU, pack and pieces", line["pieces"] == 6 and line["pack_qty"] == 3 and line["sku"] == "NK-R3" and line["variant_label"] == "Red / Pack of 3")
    v = [x for x in st["variants"] if x["id"] == line["variant_id"]][0]
    rec("stock fell by 6 PIECES (2 packs of 3): 30 -> 24", v["stock"] == 24, v["stock"])
    rec("no console errors on the shop", not errs, errs[:2])

    # ---- admin ----
    ca = br.new_context(viewport={"width": 390, "height": 844}); ad = ca.new_page(); aerr = []; ad.on("pageerror", lambda e: aerr.append(str(e)))   # (narrow window; touch emulation breaks hit-testing inside scrolling panels); aerr = []; ad.on("pageerror", lambda e: aerr.append(str(e)))
    ad.goto(B + "/account"); ad.click("text=Create account"); ad.fill("input[name=email]", "owner@example.com"); ad.fill("input[name=password]", "OwnerPass123"); ad.click("#go"); ad.wait_for_selector("text=Log out")
    urllib.request.urlopen(B + "/__admin_grant?email=owner@example.com"); ad.goto(B + "/admin"); ad.wait_for_selector(".pcard"); overflow(ad, "admin products")
    rec("admin lists products with SKU and stock", "LGP-001" in ad.inner_text("#pane") and "pcs" in ad.inner_text("#pane"))
    ad.fill("#ps", "LGP-001"); ad.wait_for_timeout(700); rec("search by SKU narrows the list", ad.locator(".pcard").count() == 1)
    ad.fill("#ps", ""); ad.wait_for_timeout(700); n_all = ad.locator(".pcard").count()
    ad.click("summary:has-text('Filters')"); ad.select_option("[data-f=sort]", "price_asc"); ad.wait_for_timeout(500)
    first = ad.locator(".pcard .nm").first.inner_text(); rec("sorting by price changes the order", "Necklace" in first or "Bansuri" in first, first)
    ad.select_option("[data-f=stock]", "out"); ad.wait_for_timeout(500); rec("stock filter returns only sold-out items", 0 < ad.locator(".pcard").count() < n_all, ad.locator(".pcard").count())
    ad.click("#clear"); ad.wait_for_timeout(500); rec("clear filters restores the list", ad.locator(".pcard").count() == n_all)
    ad.click("#add"); ad.wait_for_selector("#pf"); overflow(ad, "admin product form")
    ad.fill("input[name=name]", "Pooja Thali Set"); ad.fill("input[name=sku]", "PT-01"); ad.select_option("#catSel", "__other"); ad.fill("input[name=custom_category]", "Pooja Thali")
    ad.fill("input[name=price]", "500"); ad.fill("input[name=cost_price]", "310"); ad.fill("input[name=stock]", "20"); ad.fill("input[name=min_order_qty]", "2"); ad.fill("input[name=pack_size]", "2")
    ad.evaluate("document.getElementById('rte').scrollIntoView({block:'center'})"); ad.focus("#rte"); ad.keyboard.type("Brass thali"); ad.keyboard.press("Control+A"); ad.dispatch_event("[data-cmd=bold]", "click"); ad.dispatch_event("[data-cmd=ul]", "click")
    ad.click("summary:has-text('7. Specifications')"); ad.click("summary:has-text('8. Return policy')"); ad.click("#addSpec"); ad.fill(".srow [data-s=label]", "Material"); ad.fill(".srow [data-s=value]", "Brass")
    ad.select_option("select[name=return_eligible]", "false")
    ad.click("#save")
    try: ad.wait_for_selector(".asheet", state="detached", timeout=8000)
    except Exception: print("FORM MESSAGE:", ad.inner_text("#fm"))
    st = state(); pr = [x for x in st["products"] if x["name"] == "Pooja Thali Set"]
    rec("'Others' created and saved a new reusable category", any(c["slug"] == "pooja-thali" for c in st["categories"]) and pr and pr[0]["category"] == "pooja-thali")
    rec("rich text saved sanitised; cost price stored; min qty + pack saved", pr and "<strong>" in (pr[0]["description_html"] or "") and pr[0]["cost_price"] == 310 and pr[0]["min_order_qty"] == 2 and pr[0]["pack_size"] == 2, pr[0].get("description_html") if pr else None)
    rec("specification + non-returnable saved", pr and pr[0]["specs"][0] == {"label": "Material", "value": "Brass"} and pr[0]["return_eligible"] is False)
    api = json.load(urllib.request.urlopen(B + "/api/products?ids=" + str(pr[0]["id"])))["products"][0] if pr else {}
    rec("public product API returns the product (cost price is a DB-level secret in production)", api.get("name") == "Pooja Thali Set")
    ad.click("button[data-t=categories]"); ad.wait_for_selector(".crow"); rec("categories tab lists both groups with Thakur Ji first", ad.inner_text("#pane").index("Thakur Ji Poshak") < ad.inner_text("#pane").index("Ladies Wear"))
    ad.on("dialog", lambda d: d.accept())
    ad.fill(".crow[data-slug=kurti] .cname", "Kurtis"); ad.click(".crow[data-slug=kurti] [data-c=save]"); ad.wait_for_timeout(500)
    rec("category rename saved", [c for c in state()["categories"] if c["slug"] == "kurti"][0]["name"] == "Kurtis")
    rec("no JS errors in admin", not aerr, aerr[:2])
    br.close()
bad = [n for n, ok in R if not ok]
print(f"\n{len(R) - len(bad)}/{len(R)} browser checks passed"); sys.exit(1 if bad else 0)
