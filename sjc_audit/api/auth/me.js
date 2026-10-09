import {getUser} from "../../lib/supabase.js";
export default async function(req,res){if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});const u=await getUser(req,res);res.setHeader("Cache-Control","no-store");return res.json({user:u?{id:u.id,email:u.email}:null})}
