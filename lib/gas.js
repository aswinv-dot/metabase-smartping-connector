// lib/gas.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbxOF8IfE40PFWYQQ37cLc9SBFyjoWuBoJ2pGzpl205eEH-3IkeMF9oOC2mfbV9gKTs1/exec";
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

export async function getAllRules() {
  const d = await gasGet({action:"getRules"});
  const rules = d.rules||[];
  // normalize filters_json string → filters array
  return rules.map(r => {
    let filters = r.filters || r.filters_json || [];
    if (typeof filters === 'string') {
      try { filters = JSON.parse(filters); } catch(e) { filters = []; }
    }
    return { ...r, filters, filters_json: filters };
  });
}
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
