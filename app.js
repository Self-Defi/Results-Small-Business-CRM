const CSV_PATH="data/leads.csv";

function parseCSV(t){
  const l=t.trim().split(/\r?\n/);
  const h=l[0].split(",").map(s=>s.trim());
  return l.slice(1).map(line=>{
    const c=line.split(",").map(s=>s.trim());
    const r={}; h.forEach((k,i)=>r[k]=c[i]??"");
    return r;
  });
}
function setText(id,v){const el=document.getElementById(id); if(el) el.textContent=v;}
function groupCount(rows,key){
  const m=new Map();
  for(const r of rows){
    const k=(r[key]||"Unknown").trim()||"Unknown";
    m.set(k,(m.get(k)||0)+1);
  }
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
function renderList(id,entries){
  const ul=document.getElementById(id);
  if(!ul) return;
  ul.innerHTML="";
  for(const [k,v] of entries){
    const li=document.createElement("li");
    li.textContent=`${k}: ${v}`;
    ul.appendChild(li);
  }
}
function renderTable(tbodySelector, rows, cols){
  const tb=document.querySelector(tbodySelector);
  tb.innerHTML="";
  for(const r of rows){
    const tr=document.createElement("tr");
    for(const c of cols){
      const td=document.createElement("td");
      td.textContent = (r[c] ?? "").toString() || "—";
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
}

function toNum(x){const n=Number(x); return Number.isFinite(n)?n:0;}
async function main(){
  const res=await fetch(CSV_PATH,{cache:"no-store"});
  const text=await res.text();
  const rows=parseCSV(text);

  const todayISO=(new Date()).toISOString().slice(0,10);
  setText("asOf","As of: "+todayISO);
  setText("totalCount","Leads: "+rows.length);

  const norm = rows.map(r => ({...r, days: toNum(r.days_in_stage), val: toNum(r.deal_value)}));
  const stalled = norm.filter(r => r.days>=7).sort((a,b)=>b.days-a.days);
  setText("stalledCount","Stalled: "+stalled.length);

  const totalValue = norm.reduce((s,r)=>s+r.val,0);
  const stalledValue = stalled.reduce((s,r)=>s+r.val,0);
  setText("totalValue","$"+Math.round(totalValue).toLocaleString());
  setText("stalledValue","$"+Math.round(stalledValue).toLocaleString());

  const byStage = groupCount(stalled, "stage");
  renderList("byStage", byStage);
  setText("worstStage", byStage[0] ? (byStage[0][0] + " (" + byStage[0][1] + ")") : "—");

  const topDeal = [...norm].sort((a,b)=>b.val-a.val)[0];
  setText("topDeal", topDeal ? (topDeal.company + " ($" + Math.round(topDeal.val).toLocaleString() + ")") : "—");

  const tableRows = stalled.map(r=>({
    Lead:r.lead_id, Company:r.company, Stage:r.stage, "Days in Stage":String(r.days),
    Value:"$"+Math.round(r.val).toLocaleString(),
    Owner:r.owner, "Next Action":r.next_action, Updated:r.last_updated||"—"
  }));

  renderTable("#mainTable tbody", tableRows.slice(0,25),
    ["Lead","Company","Stage","Days in Stage","Value","Owner","Next Action","Updated"]);
}
main().catch(e=>{console.error(e); alert("Failed to load data/leads.csv. Serve via GitHub Pages (not file://).");});
