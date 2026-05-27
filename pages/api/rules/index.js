<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Campaign Rulesets</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0a;--surface:#111;--surface2:#161616;--border:#222;--border2:#2a2a2a;
  --text:#e0e0e0;--muted:#555;--muted2:#888;
  --lime:#C5FF00;--red:#ff4d4d;--green:#4dff91;--amber:#ffb84d;
  --font:'Courier New',monospace;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;padding-bottom:80px}
.header{display:flex;align-items:center;gap:16px;padding:18px 32px;border-bottom:1px solid var(--border);background:#0d0d0d}
.logo{font-size:20px;font-weight:900;letter-spacing:4px;color:#fff}.logo span{color:var(--lime)}
.sub{font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;flex:1}
.nav-link{font-size:11px;color:var(--muted2);text-decoration:none;border:1px solid var(--border2);padding:6px 14px;border-radius:3px;letter-spacing:1px;transition:all .15s}
.nav-link:hover{border-color:var(--lime);color:var(--lime)}
.layout{display:grid;grid-template-columns:520px 1fr;gap:1px;background:var(--border);min-height:calc(100vh - 57px)}
.left{background:var(--bg);padding:28px 32px}
.right{background:var(--bg);padding:28px 32px}
.sec-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.form-group{margin-bottom:14px}
.form-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted2);margin-bottom:6px;display:block}
.form-input{width:100%;background:#111;border:1px solid var(--border2);color:var(--text);padding:9px 12px;font-family:var(--font);font-size:12px;border-radius:3px;outline:none;transition:border-color .15s}
.form-input:focus{border-color:var(--lime)}
.form-select{width:100%;background:#111;border:1px solid var(--border2);color:var(--text);padding:9px 12px;font-family:var(--font);font-size:12px;border-radius:3px;outline:none;appearance:none;cursor:pointer;transition:border-color .15s}
.form-select:focus{border-color:var(--lime)}
.fetch-bar{display:flex;align-items:center;gap:10px;margin-bottom:18px;padding:10px 14px;background:var(--surface);border:1px solid var(--border2);border-radius:4px}
.fetch-status{font-size:10px;color:var(--muted);letter-spacing:.5px;flex:1}
.fetch-status.ok{color:var(--green)}.fetch-status.err{color:var(--red)}
.fetch-all-btn{background:transparent;border:1px solid var(--border2);color:var(--muted2);padding:7px 16px;cursor:pointer;font-family:var(--font);font-size:11px;letter-spacing:1px;border-radius:3px;transition:all .15s;white-space:nowrap;flex-shrink:0}
.fetch-all-btn:hover{border-color:var(--lime);color:var(--lime)}
.fetch-all-btn:disabled{opacity:.4;cursor:not-allowed}
.filter-list{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.filter-row{border:1px solid var(--border2);border-radius:4px;padding:10px 12px;background:var(--surface)}
.filter-top{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.filter-bottom{display:grid;grid-template-columns:1fr 28px;gap:6px;align-items:center}
.filter-row select{background:#0a0a0a;border:1px solid var(--border2);color:var(--text);padding:7px 10px;font-family:var(--font);font-size:11px;border-radius:3px;outline:none;width:100%;transition:border-color .15s;appearance:none}
.filter-row select:focus{border-color:var(--lime)}
.filter-row select:disabled{opacity:.35;cursor:not-allowed}
.logic-toggle{display:flex;border:1px solid var(--border2);border-radius:3px;overflow:hidden;flex-shrink:0}
.lt-btn{background:transparent;border:none;color:var(--muted2);padding:5px 10px;cursor:pointer;font-family:var(--font);font-size:10px;letter-spacing:1px;transition:all .15s;width:36px;text-align:center}
.lt-btn.active{background:var(--lime);color:#000;font-weight:700}
.lt-spacer{width:72px;flex-shrink:0}
.remove-btn{background:transparent;border:1px solid var(--border2);color:var(--muted);width:28px;height:30px;cursor:pointer;font-size:14px;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:var(--font);flex-shrink:0}
.remove-btn:hover{border-color:var(--red);color:var(--red)}
.add-filter-btn{background:transparent;border:1px dashed var(--border2);color:var(--muted2);padding:8px 14px;cursor:pointer;font-family:var(--font);font-size:11px;letter-spacing:1px;border-radius:3px;width:100%;transition:all .15s;margin-bottom:14px}
.add-filter-btn:hover{border-color:var(--lime);color:var(--lime)}
.btn-primary{background:var(--lime);color:#000;border:none;padding:10px 24px;cursor:pointer;font-family:var(--font);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;border-radius:3px;transition:opacity .15s}
.btn-primary:hover{opacity:.85}
.btn-ghost{background:transparent;color:var(--muted2);border:1px solid var(--border2);padding:10px 18px;cursor:pointer;font-family:var(--font);font-size:11px;letter-spacing:1px;border-radius:3px;transition:all .15s}
.btn-ghost:hover{border-color:var(--lime);color:var(--lime)}
.btn-preview{background:transparent;color:var(--amber);border:1px solid #5a3a00;padding:10px 18px;cursor:pointer;font-family:var(--font);font-size:11px;letter-spacing:1px;border-radius:3px;transition:all .15s}
.btn-preview:hover{border-color:var(--amber);background:#1a0f00}
.btn-preview:disabled{opacity:.4;cursor:not-allowed}
.btn-danger{background:transparent;color:var(--muted);border:1px solid var(--border2);padding:5px 10px;cursor:pointer;font-family:var(--font);font-size:10px;letter-spacing:.5px;border-radius:3px;transition:all .15s}
.btn-danger:hover{border-color:var(--red);color:var(--red)}
.btn-row{display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap}
.divider{border:none;border-top:1px solid var(--border);margin:20px 0}
.preview-box{background:var(--surface);border:1px solid var(--border2);border-radius:4px;padding:14px 16px;margin-top:12px}
.preview-count{font-size:28px;font-weight:700;color:var(--lime);font-family:var(--font)}
.preview-sublabel{font-size:10px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px}
.preview-table-wrap{max-height:200px;overflow-y:auto;margin-top:10px}
.preview-table{width:100%;border-collapse:collapse;font-size:10px}
.preview-table th{padding:7px 10px;background:#0d0d0d;color:var(--muted);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid var(--border);text-align:left;position:sticky;top:0}
.preview-table td{padding:7px 10px;border-bottom:1px solid #141414;color:var(--muted2)}
.preview-table tr:last-child td{border-bottom:none}
.preview-table tr:hover td{background:#111}
.rules-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.rules-toolbar .sec-label{margin-bottom:0;flex:1}
.rule-card{border:1px solid var(--border2);border-radius:4px;overflow:hidden;margin-bottom:12px;transition:border-color .2s}
.rule-card.active-rule{border-color:#3a5500}
.rule-card-header{background:var(--surface);padding:12px 16px;display:flex;align-items:center;justify-content:space-between}
.rule-card-name{font-size:13px;font-weight:700;color:#fff}
.rule-card-campaign{font-size:10px;color:var(--muted2);margin-top:2px}
.status-badge{font-size:9px;padding:2px 8px;border-radius:2px;letter-spacing:1px;cursor:pointer;border:1px solid transparent;font-family:var(--font)}
.status-badge.active{background:#1a2200;color:var(--lime);border-color:#3a5500}
.status-badge.paused{background:#1a1a1a;color:var(--muted);border-color:var(--border2)}
.rule-card-body{padding:12px 16px;display:flex;flex-direction:column;gap:4px}
.rule-filter-pill{display:inline-flex;align-items:center;gap:5px;font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:2px;padding:3px 8px;color:var(--muted2)}
.rule-filter-pill .rfield{color:var(--text)}
.rule-filter-pill .rop{color:var(--amber);font-size:9px}
.rule-filter-pill .rval{color:var(--lime)}
.rule-logic-sep{font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin:2px 0 2px 4px}
.rule-card-footer{padding:10px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--surface2)}
.rule-actions{display:flex;gap:8px}
.empty-rules{padding:48px;text-align:center;color:var(--muted);font-size:12px;letter-spacing:1px;border:1px solid var(--border);border-radius:4px}
.save-status{font-size:10px;padding:4px 10px;border-radius:3px;display:inline-block}
.save-status.saving{color:var(--amber)}
.save-status.saved{color:var(--green)}
.save-status.error{color:var(--red)}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;width:10px;height:10px;border:2px solid var(--border2);border-top-color:var(--lime);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:4px}
@media(max-width:1000px){.layout{grid-template-columns:1fr}.left,.right{padding:20px 16px}}
</style>
</head>
<body>
<div class="header">
  <div class="logo">TERRATERN<span>.</span></div>
  <div class="sub">Campaign Rulesets</div>
  <a href="/dashboard.html" class="nav-link">&#8592; Dashboard</a>
</div>
<div class="layout">
  <div class="left">
    <div class="sec-label" id="form-title">Create Rule</div>
    <div class="form-group">
      <label class="form-label">Rule Name</label>
      <input class="form-input" id="rule-name" placeholder="e.g. Germany Not Interested Reactivated"/>
    </div>
    <div class="form-group">
      <label class="form-label">Campaign</label>
      <select class="form-select" id="rule-campaign">
        <option value="ghcalum_api">ghcalum_api — Germany Healthcare Alumni</option>
      </select>
    </div>
    <div class="fetch-bar">
      <span class="fetch-status" id="fetch-status">Fetch values to enable filter dropdowns</span>
      <button class="fetch-all-btn" id="fetch-all-btn" onclick="fetchAllValues()">&#8635; Fetch Values</button>
    </div>
    <div class="form-label" style="margin-bottom:10px">Filters</div>
    <div class="filter-list" id="filter-list"></div>
    <button class="add-filter-btn" onclick="addFilter()">+ Add Filter</button>
    <div class="btn-row">
      <button class="btn-preview" id="preview-btn" onclick="previewLeads()">&#9681; Preview Leads</button>
    </div>
    <div id="preview-area"></div>
    <hr class="divider"/>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveRule()">Save Rule</button>
      <button class="btn-ghost" onclick="resetForm()">Clear</button>
      <span class="save-status" id="save-status"></span>
    </div>
    <div style="font-size:11px;margin-top:10px;letter-spacing:.5px" id="form-msg"></div>
  </div>
  <div class="right">
    <div class="rules-toolbar">
      <div class="sec-label">Saved Rules <span id="rule-count" style="color:var(--lime)"></span></div>
      <button class="btn-ghost" style="padding:7px 14px;font-size:11px" onclick="loadRulesFromKV()">&#8635; Refresh</button>
    </div>
    <div id="rules-list"><div class="empty-rules">Loading rules...</div></div>
  </div>
</div>
<script>
const METABASE_PROXY = "/api/metabase-proxy";
const RULES_API      = "/api/rules";

const FIELDS = [
  'current_lead_status','current_lead_stage','application','mql_status',
  'webinar_booked','webinar_attended','state','utm_source',
  'latest_utm_campaign','bde','otp_verified'
];
const OPERATORS = [
  {value:'is',           label:'is',               needsVal:true},
  {value:'is_not',       label:'is not',           needsVal:true},
  {value:'contains',     label:'contains',         needsVal:true},
  {value:'not_contains', label:'does not contain', needsVal:true},
  {value:'has_value',    label:'has any value',    needsVal:false},
  {value:'is_empty',     label:'is empty / null',  needsVal:false},
];

let rules         = [];
let filters       = [];
let editId        = null;
let leadsCache    = null;
let fieldValCache = {};
let fetchedOnce   = false;

window.onload = () => {
  addFilter(true); addFilter(false);
  loadRulesFromKV();
};

// ── KV CRUD ───────────────────────────────────────────────────
async function loadRulesFromKV() {
  try {
    const res  = await fetch(RULES_API);
    const data = await res.json();
    rules = data.rules || [];
    renderRules();
  } catch(e) {
    document.getElementById('rules-list').innerHTML =
      `<div class="empty-rules" style="color:var(--red)">Failed to load rules: ${e.message}</div>`;
  }
}

async function saveRuleToKV(rule) {
  const res  = await fetch(RULES_API, {
    method:  'POST',
    headers: {'Content-Type':'application/json'},
    body:    JSON.stringify(rule),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Save failed');
  return data.rule;
}

async function patchRuleKV(id, patch) {
  const res  = await fetch(`${RULES_API}/${id}`, {
    method:  'PATCH',
    headers: {'Content-Type':'application/json'},
    body:    JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data.rule;
}

async function deleteRuleKV(id) {
  await fetch(`${RULES_API}/${id}`, {method:'DELETE'});
}

// ── FETCH VALUES ──────────────────────────────────────────────
async function fetchAllValues() {
  const btn    = document.getElementById('fetch-all-btn');
  const status = document.getElementById('fetch-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Fetching...';
  status.className = 'fetch-status';
  status.textContent = 'Fetching from Metabase...';
  try {
    leadsCache = null;
    const leads = await fetchLeads();
    fieldValCache = {};
    FIELDS.forEach(field => {
      const seen = new Set(); const nonNull = []; let hasEmpty = false;
      leads.forEach(r => {
        const raw = r[field];
        const v = (raw===null||raw===undefined||String(raw).trim()==='') ? null : String(raw).trim();
        if (v===null) hasEmpty=true;
        else if (!seen.has(v)) { seen.add(v); nonNull.push(v); }
      });
      nonNull.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true}));
      fieldValCache[field] = hasEmpty ? [...nonNull,''] : nonNull;
    });
    fetchedOnce = true;
    status.className = 'fetch-status ok';
    status.textContent = `Fetched ${leads.length} leads — dropdowns ready`;
    renderFilterList();
  } catch(e) {
    status.className = 'fetch-status err';
    status.textContent = 'Fetch failed: ' + e.message;
  }
  btn.disabled = false;
  btn.innerHTML = '&#8635; Fetch Values';
}

// ── FILTERS ───────────────────────────────────────────────────
function addFilter() {
  filters.push({logic:'AND',field:FIELDS[0],op:'is',val:''});
  renderFilterList();
}

function renderFilterList() {
  const list = document.getElementById('filter-list');
  if (!filters.length) { list.innerHTML=''; return; }
  if (fetchedOnce) {
    filters.forEach(f => {
      const vals = fieldValCache[f.field]||[];
      const curOp = OPERATORS.find(o=>o.value===f.op);
      if (curOp?.needsVal && vals.length && !vals.includes(f.val)) f.val = vals[0];
    });
  }
  list.innerHTML = filters.map((f,i) => {
    const fieldOpts = FIELDS.map(ff=>`<option value="${ff}" ${f.field===ff?'selected':''}>${ff}</option>`).join('');
    const opOpts    = OPERATORS.map(o=>`<option value="${o.value}" ${f.op===o.value?'selected':''}>${o.label}</option>`).join('');
    const curOp     = OPERATORS.find(o=>o.value===f.op);
    const needVal   = curOp?curOp.needsVal:true;
    let valEl = '';
    if (!needVal) {
      valEl=`<select disabled><option>—</option></select>`;
    } else if (!fetchedOnce) {
      valEl=`<select disabled><option>— fetch values first —</option></select>`;
    } else {
      const vals=fieldValCache[f.field]||[];
      if (!vals.length) { valEl=`<select disabled><option>— no values —</option></select>`; }
      else {
        const opts=vals.map(v=>{
          const display=v===''?'(empty / null)':escHtml(v);
          const sel=f.val===v?'selected':'';
          return `<option value="${escHtml(v)}" ${sel}>${display}</option>`;
        }).join('');
        valEl=`<select onchange="updateFilter(${i},'val',this.value)">${opts}</select>`;
      }
    }
    const logicEl = i===0
      ? `<div class="lt-spacer"></div>`
      : `<div class="logic-toggle">
           <button class="lt-btn ${f.logic==='AND'?'active':''}" onclick="setFilterLogic(${i},'AND')">AND</button>
           <button class="lt-btn ${f.logic==='OR'?'active':''}"  onclick="setFilterLogic(${i},'OR')">OR</button>
         </div>`;
    return `<div class="filter-row">
      <div class="filter-top">
        ${logicEl}
        <select style="flex:1" onchange="updateFilter(${i},'field',this.value)">${fieldOpts}</select>
        <select style="flex:1" onchange="updateFilter(${i},'op',this.value)">${opOpts}</select>
      </div>
      <div class="filter-bottom">${valEl}<button class="remove-btn" onclick="removeFilter(${i})">&#215;</button></div>
    </div>`;
  }).join('');
}

function updateFilter(i,key,val) {
  filters[i][key]=val;
  if (key==='field') { const vals=fieldValCache[val]||[]; filters[i].val=vals.length?vals[0]:''; renderFilterList(); }
  if (key==='op')    { const vals=fieldValCache[filters[i].field]||[]; filters[i].val=vals.length?vals[0]:''; renderFilterList(); }
}
function setFilterLogic(i,val){ filters[i].logic=val; renderFilterList(); }
function removeFilter(i){ filters.splice(i,1); renderFilterList(); }

// ── FETCH LEADS ───────────────────────────────────────────────
async function fetchLeads() {
  if (leadsCache) return leadsCache;
  const res=await fetch(METABASE_PROXY);
  const data=await res.json();
  if (!Array.isArray(data)) throw new Error('Bad response from Metabase');
  leadsCache=data; return leadsCache;
}

// ── PREVIEW ───────────────────────────────────────────────────
async function previewLeads() {
  const area=document.getElementById('preview-area');
  const btn=document.getElementById('preview-btn');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span>Fetching...'; area.innerHTML='';
  try {
    const leads=await fetchLeads();
    const matched=applyFilters(leads,filters);
    area.innerHTML=`<div class="preview-box">
      <div class="preview-count">${matched.length}</div>
      <div class="preview-sublabel">leads matched</div>
      ${matched.length?`<div class="preview-table-wrap"><table class="preview-table">
        <thead><tr><th>Name</th><th>Mobile</th><th>Application</th><th>Status</th><th>utm_campaign</th></tr></thead>
        <tbody>${matched.slice(0,50).map(r=>`<tr>
          <td>${escHtml(r.fullname||'—')}</td><td>${escHtml(r.mobile||'—')}</td>
          <td style="font-size:9px">${escHtml(String(r.application||'—').slice(0,28))}</td>
          <td>${escHtml(r.current_lead_status||'—')}</td>
          <td style="color:${r.latest_utm_campaign?'var(--lime)':'var(--muted)'}">${escHtml(r.latest_utm_campaign||'(null)')}</td>
        </tr>`).join('')}</tbody>
      </table>${matched.length>50?`<div style="font-size:10px;color:var(--muted);padding:6px 10px">Showing 50 of ${matched.length}</div>`:''}</div>`:''}
    </div>`;
  } catch(e) {
    area.innerHTML=`<div style="font-size:11px;color:var(--red);margin-top:10px">Error: ${e.message}</div>`;
  }
  btn.disabled=false; btn.innerHTML='&#9681; Preview Leads';
}

// ── FILTER ENGINE ─────────────────────────────────────────────
function applyFilters(leads,filterList) {
  if (!filterList?.length) return leads;
  return leads.filter(lead=>{
    let result=evalFilter(lead,filterList[0]);
    for (let i=1;i<filterList.length;i++) {
      const test=evalFilter(lead,filterList[i]);
      result=filterList[i].logic==='OR'?result||test:result&&test;
    }
    return result;
  });
}
function evalFilter(lead,f) {
  const raw=lead[f.field]; const cell=String(raw??'').toLowerCase().trim(); const val=String(f.val??'').toLowerCase().trim();
  switch(f.op) {
    case 'is':           return cell===val;
    case 'is_not':       return cell!==val;
    case 'contains':     return cell.includes(val);
    case 'not_contains': return !cell.includes(val);
    case 'has_value':    return raw!==null&&raw!==undefined&&String(raw).trim()!=='';
    case 'is_empty':     return raw===null||raw===undefined||String(raw).trim()==='';
    default:             return true;
  }
}

// ── SAVE RULE ─────────────────────────────────────────────────
async function saveRule() {
  const name=document.getElementById('rule-name').value.trim();
  const campaign=document.getElementById('rule-campaign').value;
  const ss=document.getElementById('save-status');
  if (!name)           { showMsg('Rule name is required.','var(--red)'); return; }
  if (!filters.length) { showMsg('Add at least one filter.','var(--red)'); return; }
  const valid=filters.filter(f=>{ const op=OPERATORS.find(o=>o.value===f.op); return op&&(op.needsVal===false||f.val!==''); });
  if (!valid.length)   { showMsg('Set filter values first.','var(--red)'); return; }

  ss.className='save-status saving'; ss.textContent='Saving...';
  try {
    const rule={
      id:editId||Date.now().toString(36), name, campaign, filters:valid,
      active:true, created_at:new Date().toISOString()
    };
    const saved=await saveRuleToKV(rule);
    const idx=rules.findIndex(r=>r.id===saved.id);
    if (idx>-1) rules[idx]=saved; else rules.push(saved);
    renderRules(); resetForm();
    ss.className='save-status saved'; ss.textContent='Saved to KV';
    setTimeout(()=>ss.textContent='',3000);
  } catch(e) {
    ss.className='save-status error'; ss.textContent='Save failed: '+e.message;
  }
}

function showMsg(txt,color){ const el=document.getElementById('form-msg'); el.textContent=txt; el.style.color=color; }

// ── EDIT / TOGGLE / DELETE ────────────────────────────────────
function editRule(id) {
  const rule=rules.find(r=>r.id===id); if(!rule) return;
  editId=id;
  document.getElementById('rule-name').value=rule.name;
  document.getElementById('rule-campaign').value=rule.campaign;
  filters=rule.filters.map(f=>({...f}));
  renderFilterList();
  document.getElementById('form-title').textContent='Edit Rule';
  document.getElementById('form-msg').textContent='';
  document.getElementById('preview-area').innerHTML='';
  window.scrollTo({top:0,behavior:'smooth'});
}

async function toggleRule(id) {
  const rule=rules.find(r=>r.id===id); if(!rule) return;
  try {
    const updated=await patchRuleKV(id,{active:!rule.active});
    const idx=rules.findIndex(r=>r.id===id);
    if (idx>-1) rules[idx]=updated;
    renderRules();
  } catch(e) { alert('Failed to update: '+e.message); }
}

async function deleteRule(id) {
  if (!confirm('Delete this rule?')) return;
  try {
    await deleteRuleKV(id);
    rules=rules.filter(r=>r.id!==id);
    renderRules();
  } catch(e) { alert('Failed to delete: '+e.message); }
}

// ── RENDER RULES ──────────────────────────────────────────────
function renderRules() {
  const list=document.getElementById('rules-list');
  document.getElementById('rule-count').textContent=rules.length?`(${rules.length})`:'';
  if (!rules.length) { list.innerHTML='<div class="empty-rules">No rules yet. Create one on the left.</div>'; return; }
  list.innerHTML=rules.map(rule=>{
    const pills=rule.filters.map((f,i)=>{
      const opLabel=OPERATORS.find(o=>o.value===f.op)?.label||f.op;
      const needVal=OPERATORS.find(o=>o.value===f.op)?.needsVal;
      const valPart=needVal?`<span class="rval">${f.val===''?'(empty)':escHtml(f.val)}</span>`:'';
      const sep=i<rule.filters.length-1?`<div class="rule-logic-sep">${rule.filters[i+1].logic}</div>`:'';
      return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        <div class="rule-filter-pill"><span class="rfield">${f.field}</span><span class="rop">${opLabel}</span>${valPart}</div>${sep}
      </div>`;
    }).join('');
    return `<div class="rule-card ${rule.active?'active-rule':''}">
      <div class="rule-card-header">
        <div><div class="rule-card-name">${escHtml(rule.name)}</div><div class="rule-card-campaign">&#9654; ${rule.campaign}</div></div>
        <span class="status-badge ${rule.active?'active':'paused'}" onclick="toggleRule('${rule.id}')">${rule.active?'ACTIVE':'PAUSED'}</span>
      </div>
      <div class="rule-card-body">${pills}</div>
      <div class="rule-card-footer">
        <span style="font-size:10px;color:var(--muted)">${fmtDate(rule.created_at)}</span>
        <div class="rule-actions">
          <button class="btn-ghost" style="padding:5px 12px;font-size:10px" onclick="editRule('${rule.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteRule('${rule.id}')">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── RESET ─────────────────────────────────────────────────────
function resetForm() {
  editId=null; leadsCache=null; filters=[];
  document.getElementById('rule-name').value='';
  document.getElementById('rule-campaign').value='ghcalum_api';
  document.getElementById('form-title').textContent='Create Rule';
  document.getElementById('preview-area').innerHTML='';
  document.getElementById('form-msg').textContent='';
  addFilter(true); addFilter(false); renderFilterList();
}

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso){ try{ return new Date(iso).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){ return '—'; } }
</script>
</body>
</html>
