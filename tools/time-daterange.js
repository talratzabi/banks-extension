(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const f=s=>String(s||'').replace(/\s+/g,' ').trim();
const rows=()=>document.querySelectorAll('.rc-table-row').length;
const dates=()=>{const out=[];for(const r of document.querySelectorAll('.rc-table-row'))for(const m of f(r.textContent).matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g)){const y=m[3].length===2?2000+ +m[3]:+m[3];out.push(new Date(y,+m[2]-1,+m[1]).getTime())}return out};
const early=()=>{const d=dates();return d.length?new Date(Math.min(...d)).toLocaleDateString('he-IL'):null};
const from=document.querySelector('input#fromDate');
const btn=[...document.querySelectorAll('button')].find(b=>/advanced-search-btn/.test(String(b.className||'')));
if(!from||!btn)return{error:'פקדים חסרים',hasFrom:!!from,hasBtn:!!btn};
const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');d&&d.set?d.set.call(el,v):el.value=v;for(const t of['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}))};
const start={rows:rows(),early:early(),val:from.value};
from.focus();set(from,'01/01/2026');await wait(500);
btn.click();
const trace=[];
for(let i=1;i<=40;i++){await wait(500);trace.push(`${(i*0.5).toFixed(1)}s:${rows()}/${early()||'-'}`)}
return{start,end:{rows:rows(),early:early(),val:from.value},trace};
})()
