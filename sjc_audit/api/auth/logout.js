import {clearAuthCookies} from "../../lib/supabase.js";
export default async function(req,res){if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});clearAuthCookies(res);return res.json({ok:true})}
