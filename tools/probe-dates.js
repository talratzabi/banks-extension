(()=>{
const f=s=>String(s||'').replace(/\s+/g,' ').trim();
const own=el=>f([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' '))||f(el.textContent).slice(0,60);
const path=el=>{const p=[];let n=el;for(let i=0;i<5&&n&&n!==document.body;i++){p.unshift(n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).slice(0,2).join('.'):''));n=n.parentElement}return p.join(' > ')};
const RANGE=/תארי|טווח|תקופה|מתאריך|עד תאריך|חודש|מתארי|לתקופה|from|to|date|period|range/i;
const deCamel=v=>String(v||'').replace(/([a-z])([A-Z])/g,'$1 $2');
const inputs=[...document.querySelectorAll('input')].map(el=>({type:el.type,id:el.id,name:el.name,ph:el.placeholder,aria:el.getAttribute('aria-label'),val:String(el.value||'').slice(0,20),ro:el.readOnly,path:path(el)}));
const selects=[...document.querySelectorAll('select')].map(el=>({id:el.id,name:el.name,aria:el.getAttribute('aria-label'),opts:[...el.options].slice(0,12).map(o=>f(o.textContent)),val:el.value,path:path(el)}));
const clickable=[...document.querySelectorAll('button,[role="button"],[role="tab"],[role="radio"],[role="combobox"],a')].map(el=>({tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||'',txt:own(el).slice(0,40),aria:f(el.getAttribute('aria-label')),exp:el.getAttribute('aria-expanded'),path:path(el)})).filter(x=>RANGE.test(deCamel(x.txt+' '+x.aria)));
const labels=[...document.querySelectorAll('label,legend,h1,h2,h3,[role="heading"]')].map(el=>own(el)).filter(t=>t&&RANGE.test(t)).slice(0,20);
const frames=[...document.querySelectorAll('iframe')].map(fr=>({id:fr.id,src:String(fr.src||'').slice(0,90)}));
return {url:location.href, inputsAll:inputs.length,
  dateInputs:inputs.filter(x=>x.type==='date'||RANGE.test(deCamel(`${x.id} ${x.name} ${x.ph} ${x.aria} ${x.val}`))).slice(0,15),
  selects:selects.slice(0,12), clickable:clickable.slice(0,20), labels, frames,
  rows:document.querySelectorAll('tr,[role="row"]').length,
  head:f(document.body.innerText).slice(0,300)};
})()
