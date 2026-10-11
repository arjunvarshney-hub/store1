import json, sys, urllib.request
from playwright.sync_api import sync_playwright
B="http://localhost:4321"; R=[]
def rec(name, ok, note=""):
    R.append((name, ok, note)); print(("PASS " if ok else "FAIL ")+name+(" — "+note if note else ""), flush=True)
def state(): return json.load(urllib.request.urlopen(B+"/__state"))
def get(p): return urllib.request.urlopen(B+p).read().decode()

with sync_playwright() as p:
    br=p.chromium.launch()
    ctxo=dict(viewport={"width":360,"height":740},device_scale_factor=2,is_mobile=True,has_touch=True,
      user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")
    def newctx():
        c=br.new_context(**ctxo)
        # stub Razorpay checkout (no internet): calls handler with a REAL signature from the harness
        c.route("https://checkout.razorpay.com/**", lambda r: r.fulfill(content_type="text/javascript", body="""
window.Razorpay=function(o){this.o=o;this.h={};};
Razorpay.prototype.on=function(e,f){this.h[e]=f};
Razorpay.prototype.open=function(){var o=this.o,self=this;if(window.__RZP_MODE==='fail'){self.h['payment.failed']({error:{description:'Card declined'}});return}
if(window.__RZP_MODE==='dismiss'){o.modal.ondismiss();return}
var pay='pay_E2E'+Math.random().toString(36).slice(2,10);
fetch('/__sign?order='+o.order_id+'&pay='+pay).then(r=>r.text()).then(function(sig){o.handler({razorpay_order_id:o.order_id,razorpay_payment_id:pay,razorpay_signature:window.__RZP_MODE==='badsig'?'0'*0+'deadbeef':sig})})};"""))
        return c
    def overflow(pg, name):
        w=pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        rec(f"no horizontal overflow: {name}", w[0]<=w[1], f"scrollWidth={w[0]} viewport={w[1]}")
    def shot(pg,n): pg.screenshot(path=f"/tmp/shots/{n}.png")

    # ---------- empty shop ----------
    c=newctx(); pg=c.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(B+"/"); overflow(pg,"home (empty catalogue)"); shot(pg,"01_home_empty")
    rec("home shows friendly empty state", "coming soon" in pg.content())
    pg.click("#menuBtn"); rec("mobile menu opens", pg.is_visible("#menuPanel")); shot(pg,"02_menu"); pg.click("#menuBtn")

    # ---------- customer signup / login ----------
    pg.goto(B+"/account"); pg.click("text=Create account")
    pg.fill("input[name=name]","Sita Devi"); pg.fill("input[name=email]","sita@example.com"); pg.fill("input[name=password]","short")
    pg.click("#go"); pg.wait_for_selector(".msg.err"); rec("signup rejects short password", "8 to 72" in pg.inner_text("#m"))
    pg.fill("input[name=password]","Password123"); pg.click("#go"); pg.wait_for_selector("text=My orders")
    rec("signup (email confirmation OFF) logs in and shows My orders", True); shot(pg,"03_account")
    pg.click("#out"); pg.wait_for_url(B+"/"); pg.goto(B+"/account")
    pg.fill("input[name=email]","sita@example.com"); pg.fill("input[name=password]","wrong"); pg.click("#go"); pg.wait_for_selector(".msg.err")
    rec("wrong password gives friendly error", "Incorrect email or password" in pg.inner_text("#m"))
    pg.fill("input[name=password]","Password123"); pg.click("#go"); pg.wait_for_selector("text=Log out")
    pg.reload(); pg.wait_for_selector("text=Log out"); rec("login works and session survives reload", True)

    # ---------- admin security ----------
    pg.goto(B+"/admin"); pg.wait_for_selector(".panel"); rec("customer sees Access denied on /admin", "Access denied" in pg.inner_text("#root"))
    r=pg.evaluate("fetch('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)"); rec("customer POST /api/admin/products => 403", r==403, str(r))
    r=pg.evaluate("fetch('/api/admin/orders').then(r=>r.status)"); rec("customer GET /api/admin/orders => 403", r==403, str(r))

    # ---------- admin: add product with photos ----------
    ca=newctx(); ad=ca.new_page(); ad.goto(B+"/account"); ad.click("text=Create account")
    ad.fill("input[name=email]","owner@example.com"); ad.fill("input[name=password]","OwnerPass123"); ad.click("#go"); ad.wait_for_selector("text=Log out")
    urllib.request.urlopen(B+"/__admin_grant?email=owner@example.com")
    ad.goto(B+"/admin"); ad.wait_for_selector("#add"); overflow(ad,"admin products"); shot(ad,"04_admin_empty")
    ad.click("#add"); ad.wait_for_selector("#pf")
    ad.click("#save"); rec("admin form validates required fields", "product name" in ad.inner_text("#m").lower())
    ad.fill("input[name=name]","Red Velvet Laddu Gopal Poshak"); ad.select_option("select[name=category]","laddu-gopal-poshak")
    ad.fill("input[name=price]","650"); ad.fill("input[name=sale_price]","499"); ad.fill("input[name=stock]","5")
    ad.click("#qs button[data-s='1']"); ad.click("#qs button[data-s='2']"); ad.click("#qs button[data-s='3']")
    ad.fill("input[name=material]","Velvet"); ad.fill("textarea[name=description]","Soft velvet poshak with gota work. <b>Hand finished</b>")
    ad.set_input_files("#files",["/tmp/fx/a.jpg","/tmp/fx/b.jpg","/tmp/fx/bad.svg"])
    ad.wait_for_selector(".im >> nth=1"); rec("photo previews shown before saving (2 valid, SVG rejected)", ad.locator(".im").count()==2 and "not a JPG" in ad.inner_text("#m"), f"{ad.locator('.im').count()} previews")
    ad.click("[data-rm='1']"); rec("remove a photo before saving", ad.locator(".im").count()==1)
    ad.set_input_files("#files",["/tmp/fx/b.jpg"]); ad.wait_for_selector(".im >> nth=1"); shot(ad,"05_admin_form")
    overflow(ad,"admin product form")
    ad.click("#save"); ad.wait_for_selector(".pcard"); st=state()
    sizes=list((st["files"] or {}).values())
    rec("product saved to DB with 2 uploaded photos", len(st["products"])==1 and len(st["products"][0]["image_urls"])==2, str(st["products"][0]["image_urls"][:1]))
    rec("phone photos were shrunk before upload (3000x2250 → <600KB)", all(s<600_000 for s in sizes) and len(sizes)==2, f"{sizes} bytes")
    shot(ad,"06_admin_list")

    # ---------- public pages show it ----------
    pg.goto(B+"/"); rec("product appears on homepage", "Red Velvet Laddu Gopal Poshak" in pg.content()); overflow(pg,"home with product"); shot(pg,"07_home")
    pg.goto(B+"/category/laddu-gopal-poshak"); rec("product appears in category page", "Red Velvet" in pg.content()); overflow(pg,"category page")
    pg.goto(B+"/shop?q=velvet"); rec("search finds product", "Red Velvet" in pg.content())
    pg.goto(B+"/shop?q=zzzzqq"); rec("search with no match shows empty state", "No products found" in pg.content())
    slug=state()["products"][0]["slug"]; pg.goto(B+"/product/"+slug); overflow(pg,"product page"); shot(pg,"08_product")
    html=pg.content(); rec("product page: JSON-LD + canonical + escaped description", "application/ld+json" in html and "&lt;b&gt;Hand finished" in html and f"/product/{slug}" in html)
    rec("product page: sale price shown", "₹499" in html and "23% off" in html)
    rec("gallery thumbnails present", pg.locator(".th").count()==2)
    pg.click(".th >> nth=1"); rec("gallery switches image", pg.get_attribute("#galMain img","src")==pg.get_attribute(".th >> nth=1","data-src"))
    pg.click("#addBtn"); rec("add to cart without size is blocked", "select a size" in pg.inner_text("#pdpMsg").lower())
    pg.click(".sz >> nth=1"); pg.click("#qPlus"); pg.click("#addBtn"); rec("add to cart works (size 2, qty 2)", json.loads(pg.evaluate("localStorage.getItem('sjc_cart_v2')"))==[{"id":1,"size":"2","qty":2}])
    rec("cart badge shows 2", pg.inner_text("#cartCount")=="2")
    print("sitemap:", [l for l in get("/sitemap.xml").split("<loc>")[1:]][:2] if False else "")

    # ---------- cart & checkout (COD) ----------
    pg.goto(B+"/cart"); pg.wait_for_selector(".row"); overflow(pg,"cart"); shot(pg,"09_cart")
    rec("cart total from server price (2 × ₹499 = ₹998)", "₹998" in pg.inner_text("#box"))
    pg.click("[data-a=inc]"); rec("cart quantity +", "₹1,497" in pg.inner_text("#box")); pg.click("[data-a=dec]"); pg.click("[data-a=dec]"); rec("cart quantity − (min 1)", "₹499" in pg.inner_text("#box"))
    pg.click("[data-a=inc]")
    pg.click("text=Proceed to checkout"); pg.wait_for_selector("#f"); overflow(pg,"checkout"); shot(pg,"10_checkout")
    pg.click("#go"); rec("checkout validates phone", "10-digit" in pg.inner_text("#m"))
    pg.fill("input[name=phone]","9927892667"); pg.fill("textarea[name=address]","Near Tirth Mandir, Sarai Tareen"); pg.fill("input[name=city]","Sambhal"); pg.fill("input[name=pincode]","244303")
    pg.dblclick("#go"); pg.wait_for_url("**/account?order=*"); pg.wait_for_selector("text=Order placed")
    st=state(); rec("double-click creates exactly ONE order (idempotency)", len(st["orders"])==1, f"{len(st['orders'])} orders")
    o=st["orders"][0]; rec("order stored with server price & COD/pending", o["payment_method"]=="COD" and o["payment_status"]=="pending" and o["total"]==998 and o["order_status"]=="pending", f"total={o['total']}")
    rec("stock reduced 5 → 3", state()["products"][0]["stock"]==3, str(state()["products"][0]["stock"])); overflow(pg,"order detail"); shot(pg,"11_order_cod")
    pg.goto(B+"/account"); pg.wait_for_selector(".ocard"); rec("My Orders lists the order", o["order_number"] in pg.inner_text("#orders")); shot(pg,"12_my_orders")

    # ---------- price manipulation attempt ----------
    r=pg.evaluate("""fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:{name:'Sita Devi',phone:'9927892667',address:'Near Tirth Mandir road',city:'Sambhal',state:'UP',pincode:'244303'},items:[{productId:1,qty:1,size:'1',price:1}],total:1,subtotal:1,paymentMethod:'COD'})}).then(r=>r.json())""")
    rec("tampered price ignored (total from DB = ₹499)", state()["orders"][-1]["total"]==499, str(state()["orders"][-1]["total"]))
    r=pg.evaluate("""fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:{name:'Sita Devi',phone:'9927892667',address:'Near Tirth Mandir road',city:'Sambhal',state:'UP',pincode:'244303'},items:[{productId:1,qty:10,size:'1'}],paymentMethod:'COD'})}).then(r=>r.status)""")
    rec("ordering more than stock rejected (409)", r==409, str(r))

    # ---------- online payment ----------
    pg.goto(B+"/product/"+slug); pg.click(".sz >> nth=0"); pg.click("#addBtn"); pg.goto(B+"/checkout"); pg.wait_for_selector("#f")
    pg.check("input[value=ONLINE]"); pg.evaluate("window.__RZP_MODE='badsig'"); pg.click("#go"); pg.wait_for_selector(".msg.err", timeout=8000)
    rec("forged payment signature is rejected; order NOT marked paid", state()["orders"][-1]["payment_status"]=="pending" and "do NOT pay again" in pg.inner_text("#box"), state()["orders"][-1]["payment_status"])
    on=state()["orders"][-1]["order_number"]
    pg.goto(B+"/account?order="+on); pg.wait_for_selector("#pay"); rec("unpaid online order offers Pay now / Cancel", pg.is_visible("#pay") and pg.is_visible("#cancel")); shot(pg,"13_unpaid")
    pg.evaluate("window.__RZP_MODE='ok'"); pg.click("#pay"); pg.wait_for_selector("text=Payment received", timeout=8000)
    o2=[x for x in state()["orders"] if x["order_number"]==on][0]
    rec("valid signature => paid + confirmed + payment id stored", o2["payment_status"]=="paid" and o2["order_status"]=="confirmed" and o2["razorpay_payment_id"].startswith("pay_"), o2["payment_status"])
    rec("paid order has no Pay/Cancel buttons", pg.locator("#pay").count()==0 and pg.locator("#cancel").count()==0)

    # ---------- admin order management ----------
    ad.goto(B+"/admin"); ad.click("[data-t=orders]"); ad.wait_for_selector("[data-o]"); overflow(ad,"admin orders"); shot(ad,"14_admin_orders")
    rec("admin sees all orders", ad.locator("[data-o]").count()==3, str(ad.locator("[data-o]").count()))
    ad.fill("#os","9927892667"); ad.wait_for_timeout(700); rec("admin search by phone", ad.locator("[data-o]").count()==3)
    ad.fill("#os","SJC-260101-00001"); ad.wait_for_timeout(700); rec("admin search by order number", ad.locator("[data-o]").count()==1)
    ad.fill("#os",""); ad.select_option("#of","pending"); ad.wait_for_timeout(500); rec("admin filter by status", ad.locator("[data-o]").count()==2, str(ad.locator("[data-o]").count()))
    ad.click("[data-o] >> nth=0"); ad.wait_for_selector(".sheet"); shot(ad,"15_admin_order_detail"); overflow(ad,"admin order detail")
    rec("order detail shows address, phone, items, payment", all(t in ad.inner_text(".sheet") for t in ["Sambhal","9927892667","Red Velvet","Cash on Delivery"]))
    ad.click("[data-st=packed]"); ad.wait_for_selector("text=Status updated"); rec("admin updates status → packed", any(x["order_status"]=="packed" for x in state()["orders"]))
    before=state()["products"][0]["stock"]; ad.once("dialog", lambda d: d.accept()); ad.click("[data-st=cancelled]"); ad.wait_for_timeout(800)
    rec("admin cancel returns stock", state()["products"][0]["stock"]>before, f"{before}→{state()['products'][0]['stock']}")
    rec("cancelled order cannot be re-opened", ad.locator("[data-st=shipped][disabled]").count()==1)
    pg.goto(B+"/account"); pg.wait_for_selector(".ocard"); rec("customer sees updated order status", ("cancelled" in pg.inner_text("#orders").lower()) or ("packed" in pg.inner_text("#orders").lower()))
    # customer cannot read another user's order
    c3=newctx(); o3=c3.new_page(); o3.goto(B+"/account"); o3.click("text=Create account"); o3.fill("input[name=email]","other@example.com"); o3.fill("input[name=password]","OtherPass123"); o3.click("#go"); o3.wait_for_selector("text=Log out")
    r=o3.evaluate(f"fetch('/api/orders/my?number={on}').then(r=>r.status)"); rec("another customer cannot open my order (404)", r==404, str(r))
    r=o3.evaluate("fetch('/api/orders/my',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',orderNumber:'%s'})}).then(r=>r.status)"%state()["orders"][0]["order_number"]); rec("another customer cannot cancel my order (404)", r==404, str(r))

    # ---------- admin edit / hide / delete ----------
    ad.goto(B+"/admin"); ad.wait_for_selector(".pcard"); ad.click("[data-act=edit]"); ad.wait_for_selector("#pf"); ad.fill("input[name=price]","700"); ad.click("#save"); ad.wait_for_selector(".pcard")
    rec("admin edit product", state()["products"][0]["price"]==700)
    ad.uncheck("[data-act=toggle]"); ad.wait_for_timeout(800); rec("admin hides product → disappears from shop", state()["products"][0]["active"] is False and "Red Velvet" not in get("/shop"))
    ad.once("dialog", lambda d: d.accept()); ad.click("[data-act=del]"); ad.wait_for_timeout(800); rec("admin deletes product", len(state()["products"])==0)

    # ---------- misc pages ----------
    pg.goto(B+"/nope"); rec("unknown URL gets 404 page", "Page not found" in pg.content())
    pg.goto(B+"/product/does-not-exist"); rec("unknown product → 404 page (noindex)", "Product not found" in pg.content() and "noindex" in pg.content())
    for path,name in [("/cart","cart empty"),("/account","login"),("/category/kurti","category empty"),("/shop","shop")]:
        pg.goto(B+path); overflow(pg,name)
    c320=br.new_context(**{**ctxo,"viewport":{"width":320,"height":640}}); q=c320.new_page()
    for path in ["/","/shop","/category/kurti","/account","/cart","/admin"]:
        q.goto(B+path); overflow(q,"320px "+path)
    js=[e for e in errs if "Failed to load resource" not in e]; rec("no JavaScript errors on storefront pages", not js, "; ".join(js[:3]))
    br.close()
bad=[r for r in R if not r[1]]; print(f"\n{len(R)-len(bad)} passed, {len(bad)} failed"); sys.exit(1 if bad else 0)
