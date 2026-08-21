(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const f=s=>String(s||'').replace(/\s+/g,' ').trim();
const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');d&&d.set?d.set.call(el,v):el.value=v;for(const t of['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}))};
const from=document.querySelector('input#fromDate'),to=document.querySelector('input#toDate');
const btn=[...document.querySelectorAll('button')].find(b=>/advanced-search-btn/.test(String(b.className||'')));
set(from,'01/01/2026');await wait(300);set(to,'20/08/2026');await wait(300);btn.click();
let last=-1,stable=0;
for(let i=0;i<40;i++){await wait(600);const n=document.querySelectorAll('.rc-table-row').length;if(n>0&&n===last){if(++stable>=2)break}else stable=0;last=n}
const months={};
for(const r of document.querySelectorAll('.rc-table-row')){const m=f(r.textContent).match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);if(m)months[m[3].slice(-2)+'-'+m[2]]=(months[m[3].slice(-2)+'-'+m[2]]||0)+1}
return{rows:document.querySelectorAll('.rc-table-row').length,months,fromVal:from.value,toVal:to.value};
})()
