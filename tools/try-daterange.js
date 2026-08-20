(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const f=s=>String(s||'').replace(/\s+/g,' ').trim();
const table=()=>[...document.querySelectorAll('tr,[role="row"],.rc-table-row')].map(r=>f(r.textContent)).filter(Boolean);
const dates=()=>{const out=[];for(const t of table())for(const m of t.matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g)){const y=m[3].length===2?2000+ +m[3]:+m[3];out.push(new Date(y,+m[2]-1,+m[1]).getTime())}return out};
const summary=()=>{const d=dates().filter(Boolean);const fmt=t=>new Date(t).toLocaleDateString('he-IL');return{rows:table().length,min:d.length?fmt(Math.min(...d)):null,max:d.length?fmt(Math.max(...d)):null}};
const before=summary();
const from=document.querySelector('input#fromDate');
const to=document.querySelector('input#toDate');
if(!from)return{error:'input#fromDate לא נמצא'};
const set=(el,v)=>{const proto=Object.getPrototypeOf(el);const desc=Object.getOwnPropertyDescriptor(proto,'value');desc&&desc.set?desc.set.call(el,v):el.value=v;
  for(const t of ['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}));};
from.focus();set(from,'01/01/2026');
await wait(600);
const btn=[...document.querySelectorAll('button')].find(b=>/advanced-search-btn/.test(b.className||''));
if(!btn)return{error:'כפתור החיפוש לא נמצא',before};
btn.click();
for(let i=0;i<20;i++){await wait(700);const now=summary();if(now.min&&now.min!==before.min)return{ok:true,before,after:now,fromValue:from.value,toValue:to&&to.value,waited:(i+1)*0.7};}
return{ok:false,before,after:summary(),fromValue:from.value,toValue:to&&to.value};
})()
