// lib/gas.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbwqA9phseoKP-IGXoV9Efx-NtCLmmMpZiZ2N1ZAAH3D4DhD_MMGr9Hv2CRVAPTU_zy4/exec";

export async function gasGet(params={}) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
  return res.json();
}

export async function gasPost(body={}) {
  const res = await fetch(GAS_URL, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  return res.json();
}

export async function getAllRules()       { const d=await gasGet({action:"getRules"});     return d.rules||[]; }
export async function getCampaigns()      { const d=await gasGet({action:"getCampaigns"}); return d.campaigns||[]; }
export async function saveRule(rule)      { return gasPost({action:"saveRule",rule}); }
export async function updateRule(id,patch){ return gasPost({action:"updateRule",id,patch}); }
export async function deleteRule(id)      { return gasPost({action:"deleteRule",id}); }
export async function saveCampaign(c)     { return gasPost({action:"saveCampaign",campaign:c}); }
export async function deleteCampaign(n)   { return gasPost({action:"deleteCampaign",campaign_name:n}); }
export async function getLogs()           { return gasGet({action:"getLogs"}); }
export async function addLog(entry)       { return gasPost({action:"addLog",entry}); }
export async function isDuplicate(phone,campaign) {
  const d = await gasGet({action:"checkDedup",phone,campaign});
  return d.isDuplicate===true;
}
export async function markSent(phone,campaign) { return gasPost({action:"markSent",phone,campaign}); }
