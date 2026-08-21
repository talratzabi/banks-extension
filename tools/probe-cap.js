(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const f=s=>String(s||'').replace(/\s+/g,' ').trim();
const rows=()=>document.querySelectorAll('.rc-table-row').length;
const dates=()=>{const o=[];for(const r of document.querySelectorAll('.rc-table-row'))for(const m of f(r.textContent).matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g)){const y=m[3].length===2?2000+ +m[3]:+m[3];o.push(new Date(y,+m[2]-1,+m[1]).getTime())}return o};
const span=()=>{const d=dates();const fmt=t=>new Date(t).toLocaleDateString('he-IL');return d.length?{n:rows(),min:fmt(Math.min(...d)),max:fmt(Math.max(...d))}:{n:rows(),min:null,max:null}};
const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');d&&d.set?d.set.call(el,v):el.value=v;for(const t of['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}))};
const from=document.querySelector('input#fromDate'),to=document.querySelector('input#toDate');
const btn=[...document.querySelectorAll('button')].find(b=>/advanced-search-btn/.test(String(b.className||'')));
if(!from||!to||!btn)return{error:'פקדים חסרים',hasFrom:!!from,hasTo:!!to,hasBtn:!!btn};
const run=async(a,b)=>{set(from,a);await wait(300);set(to,b);await wait(300);btn.click();
  let last=-1,stable=0;
  for(let i=0;i<40;i++){await wait(600);const n=rows();if(n>0&&n===last){if(++stable>=2)break}else stable=0;last=n}
  const note=f(document.body.innerText).match(/לתקופה\s*[\d\/\-]+/);
  return{ask:a+" עד "+b,...span(),note:note?note[0]:null,fromVal:from.value,toVal:to.value}};
const out=[];
out.push({initial:span(),fromVal:from.value,toVal:to.value});
out.push(await run('01/01/2026','20/08/2026'));
out.push(await run('01/04/2026','30/06/2026'));
return out;
})()
