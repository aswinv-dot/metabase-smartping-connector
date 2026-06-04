// pages/api/schedule/[id].js
import { updateSchedule, deleteSchedule } from "../../../lib/supabase";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();

  const { id } = req.query;

  if (req.method==="PATCH") {
    const result = await updateSchedule(id, req.body);
    return res.status(200).json({ success:true, result });
  }

  if (req.method==="DELETE") {
    await deleteSchedule(id);
    return res.status(200).json({ deleted:true });
  }

  return res.status(405).json({ error:"Method not allowed" });
}
