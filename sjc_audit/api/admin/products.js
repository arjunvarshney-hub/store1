import {admin,getUser} from "../../lib/supabase.js";
async function isAdmin(u){if(!u)return false;const {data,error}=await admin.from("admin_users").select("user_id").eq("user_id",u.id).maybeSingle();return !error&&!!data}
function validate(p){
 if(!p||typeof p!=="object"||Array.isArray(p))return "Invalid product";
 if(typeof p.name!=="string"||!p.name.trim()||p.name.length>180)return "Product name is required (max 180 characters)";
 if(typeof p.category!=="string"||!p.category.trim()||p.category.length>100)return "Category is required (max 100 characters)";
 const price=Number(p.price),stock=Number(p.stock??0),sale=(p.sale_price===null||p.sale_price===""||p.sale_price===undefined)?null:Number(p.sale_price);
 if(!Number.isFinite(price)||price<=0||price>10000000)return "Enter a valid price";
 if(!Number.isInteger(stock)||stock<0||stock>10000000)return "Enter a valid stock quantity";
 if(sale!==null&&(!Number.isFinite(sale)||sale<=0||sale>=price))return "Sale price must be positive and lower than the regular price";
 if(!Array.isArray(p.sizes)||p.sizes.length>50||p.sizes.some(x=>typeof x!=="string"||x.length>40))return "Invalid sizes";
 if(!Array.isArray(p.image_urls)||p.image_urls.length>12||p.image_urls.some(x=>typeof x!=="string"||x.length>2000||!/^https:\/\//i.test(x)))return "Invalid image URLs";
 if(p.description!==undefined&&(typeof p.description!=="string"||p.description.length>5000))return "Description is too long";
 if(p.material!==undefined&&(typeof p.material!=="string"||p.material.length>120))return "Material is too long";
 return null;
}
function payload(p){return {name:p.name.trim(),category:p.category.trim(),price:Number(p.price),sale_price:(p.sale_price===null||p.sale_price===""||p.sale_price===undefined)?null:Number(p.sale_price),stock:Number(p.stock??0),material:typeof p.material==="string"?p.material.trim():null,sizes:p.sizes||[],image_urls:p.image_urls||[],description:typeof p.description==="string"?p.description.trim():null,active:p.active!==false&&p.active!=="false"}}
export default async function(req,res){if(!["GET","POST","PATCH","DELETE"].includes(req.method))return res.status(405).json({error:"Method not allowed"});const u=await getUser(req,res);if(!(await isAdmin(u)))return res.status(403).json({error:"Admin access required"});try{
 if(req.method==="GET"){const {data,error}=await admin.from("products").select("*").order("created_at",{ascending:false});if(error)throw error;return res.json({products:data||[]})}
 if(req.method==="POST"||req.method==="PATCH"){const body=req.body||{},err=validate(body);if(err)return res.status(400).json({error:err});const clean=payload(body);if(req.method==="POST"){const {data,error}=await admin.from("products").insert(clean).select().single();if(error)throw error;return res.status(201).json({product:data})}const id=Number(body.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:"Invalid product ID"});const {data,error}=await admin.from("products").update(clean).eq("id",id).select().maybeSingle();if(error)throw error;if(!data)return res.status(404).json({error:"Product not found"});return res.json({product:data})}
 const id=Number(req.body?.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:"Invalid product ID"});const {data,error}=await admin.from("products").delete().eq("id",id).select("id").maybeSingle();if(error)throw error;if(!data)return res.status(404).json({error:"Product not found"});return res.json({ok:true})
 }catch(e){console.error("Admin product operation failed",e.message);return res.status(500).json({error:"Product operation failed"})}}
