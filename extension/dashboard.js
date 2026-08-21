const $=s=>document.querySelector(s);
let accounts=[],discovered=[],selectedKeys=[],syncScope='business',accountFilter='both',accountKinds={},privateOwnerName='',hideMortgages=false,isracardUnassigned=[],calUnassigned=[],maxUnassigned=[],isracardLastCards=[],calLastCards=[],maxLastCards=[],cardHistoryStats={},activeView='accounts',loadEpoch=0,loadTimer=null;
let movementSearchTimer=null,movementSearchEpoch=0;
const BANK_BUTTONS=[
  {id:'business',name:'פועלים עסקי',logo:'icons/poalim-business.png',ready:true},
  {id:'private',name:'פועלים פרטי',logo:'https://www.bankhapoalim.co.il/favicon.ico',ready:true},
  {id:'leumi',name:'לאומי',logo:'icons/leumi.png',ready:true,leumi:true},
  {id:'yahav',name:'יהב',logo:'https://www.bank-yahav.co.il/favicon.ico',url:'https://digital.yahav.co.il/BaNCSDigitalUI/app/index.html',ready:true,yahav:true},
  {id:'discount-business',name:'דיסקונט עסקי',logo:'https://www.discountbank.co.il/favicon.ico',ready:true,discountBusiness:true},
  {id:'discount-private',name:'דיסקונט פרטי',logo:'https://www.discountbank.co.il/favicon.ico',ready:true,discountPrivate:true},
  {id:'fibi-1',name:'הבינלאומי — חיבור 1',logo:'https://www.fibi.co.il/favicon.ico',ready:true,fibi:true},
  {id:'fibi-2',name:'הבינלאומי — חיבור 2',logo:'https://www.fibi.co.il/favicon.ico',ready:true,fibi:true},
  {id:'mizrahi',name:'מזרחי־טפחות',logo:'icons/mizrahi.png',ready:true,mizrahi:true},
  {id:'isracard',name:'ישראכרט — חיבור 1',logo:'icons/isracard.png',url:'https://web.isracard.co.il/StatusPage',ready:true,isracard:true},
  {id:'cal',name:'כאל',logo:'icons/cal.png',url:'https://www.cal-online.co.il/',ready:true,cal:true},
  {id:'max',name:'MAX',logo:'https://www.max.co.il/favicon.ico',url:'https://www.max.co.il/',ready:true,max:true}
];
const productStyles=document.createElement('style');
productStyles.textContent='.wrap{max-width:1800px!important}.account{display:block!important;overflow:hidden!important;padding:0!important}.account-balance-row{display:grid;grid-template-columns:minmax(0,1.8fr) repeat(4,minmax(0,.82fr)) minmax(0,.9fr) minmax(0,.95fr) 74px;align-items:stretch;gap:0;width:100%;min-width:0}.account-cell{min-width:0;min-height:86px;padding:12px 8px;border-left:1px solid #e7ebf2;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.account-cell:last-child{border-left:0}.account-cell>span,.account-cell>small{display:block;color:#6d788b;font-size:11px;line-height:1.25;margin-bottom:5px;white-space:normal}.account-cell strong{font-size:clamp(12px,1.05vw,16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-identity h3{margin:0 0 5px;font-size:clamp(13px,1.1vw,16px);white-space:normal;overflow-wrap:anywhere}.account-identity p{margin:0 0 6px;font-size:12px}.account-identity select{font-size:11px;max-width:100%}.negative{color:#b53737}.balance-link{width:100%;height:100%}.account-actions{flex-direction:row!important;align-items:center;justify-content:center;gap:4px}.refresh-row{border:0;background:#eef4ff;color:#173b86;border-radius:999px;width:28px;height:28px;font-size:15px;font-weight:800;cursor:pointer;margin:auto 4px auto auto}.refresh-row:hover{background:#dce8ff}.remove-row{border:0;background:#f1f3f7;border-radius:999px;width:28px;height:28px;font-size:18px;cursor:pointer;margin:auto}.accounts-total{margin-top:14px}.accounts-total h3{margin:0 0 14px}.accounts-total-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.accounts-total-grid div{background:#eef4ff;border-radius:13px;padding:14px}.accounts-total-grid span,.accounts-total-grid strong{display:block}.accounts-total-grid span{font-size:12px;color:#63718a;margin-bottom:6px}.accounts-total-grid strong{font-size:19px;color:#173b86}@media(max-width:1050px){.account-balance-row{grid-template-columns:minmax(0,1.6fr) repeat(4,minmax(0,.76fr)) minmax(0,.82fr) minmax(0,.88fr) 34px}.account-cell{padding:10px 5px}.account-cell strong{font-size:12px}.account-cell>span{font-size:10px}}@media(max-width:760px){.account{overflow-x:auto!important}.account-balance-row{min-width:850px}.accounts-total-grid{grid-template-columns:repeat(2,1fr)}}.details{margin-top:18px}.details summary{font-weight:800;cursor:pointer}.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:10px}.detail-card{border:1px solid #e3e8f1;border-radius:14px;padding:14px}.detail-card h4{margin:0 0 8px}.detail-card p{margin:5px 0}.mini-table{width:100%;font-size:12px;margin-top:10px}.mini-table td{padding:5px;border-top:1px solid #edf0f4}';
document.head.appendChild(productStyles);
const statementStyles=document.createElement('style');statementStyles.textContent='.card-month-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 16px}.card-month-bar select{padding:8px 12px;border-radius:10px;border:1px solid #dfe5ef;font:inherit;font-weight:700}.card-statement{margin-top:12px;overflow:auto}.statement-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.statement-head strong{font-size:20px;white-space:nowrap}.card-statement .mini-table{min-width:620px;border-collapse:collapse}.card-statement .mini-table th{text-align:right;padding:8px 5px;color:#6d788b;border-bottom:1px solid #dfe5ef}.card-statement .mini-table td:last-child,.card-statement .mini-table th:last-child{text-align:center}';document.head.appendChild(statementStyles);
const scopeStyles=document.createElement('style');scopeStyles.textContent='.scope-panel{margin:20px 0}.auto-sync{display:flex;align-items:center;gap:10px;background:#eef4ff;border:1px solid #d4e2ff;border-radius:14px;padding:12px 16px;margin:12px 0 4px;cursor:pointer;font-weight:800;color:#173b86;width:max-content;max-width:100%}.auto-sync small{display:block;font-weight:600;color:#5b6b8c;margin-top:3px}.auto-sync input{width:18px;height:18px;cursor:pointer}.scope-choice{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.scope-choice label{border:1px solid #dfe5ef;border-radius:14px;padding:12px 18px;cursor:pointer}.scope-choice label:has(input:checked){background:#eef4ff;border-color:#3157d5;color:#18357c;font-weight:800}.source-badge{display:inline-block;background:#eef4ff;color:#3157d5;border-radius:999px;padding:3px 8px;margin-left:6px;font-size:12px}.bank-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.bank-button{border:1px solid #dfe5ef;background:#fff;border-radius:16px;padding:15px;display:flex;align-items:center;gap:12px;text-align:right;cursor:pointer}.bank-button:hover{border-color:#3157d5;box-shadow:0 8px 24px #24385d18}.bank-button img{width:36px;height:36px;object-fit:contain}.bank-button b,.bank-button small{display:block}.bank-button small{color:#6d788b;margin-top:4px}.bank-button.ready small{color:#087f5b;font-weight:700}';document.head.appendChild(scopeStyles);
const loansTabStyles=document.createElement('style');loansTabStyles.textContent='.dashboard-tabs{display:flex;gap:8px;margin:28px 0 18px;padding:6px;background:#eef2f7;border-radius:16px;width:max-content}.dashboard-tab{border:0;background:transparent;border-radius:11px;padding:11px 20px;font-weight:800;cursor:pointer;color:#657087}.dashboard-tab.active{background:#fff;color:#173b86;box-shadow:0 3px 12px #22386118}.loans-table-wrap{overflow:auto}.loans-table{width:100%;border-collapse:collapse;min-width:850px}.loans-table th,.loans-table td{text-align:right;padding:13px 10px;border-bottom:1px solid #e5eaf1}.loans-table th{color:#68758a;font-size:12px}.loans-total{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:18px;border-radius:15px;background:#eef4ff;color:#173b86;font-size:18px}.loans-total strong{font-size:24px}.hidden{display:none!important}';document.head.appendChild(loansTabStyles);
const mortgageStyles=document.createElement('style');mortgageStyles.textContent='.mortgage-tag{display:inline-block;margin-right:6px;padding:3px 8px;border-radius:999px;background:#fff0d8;color:#8a5700;font-size:11px;font-weight:800}#toggleMortgages{margin:0 0 14px}';document.head.appendChild(mortgageStyles);
const balanceLinkStyles=document.createElement('style');balanceLinkStyles.textContent='.balance-link{border:0;background:transparent;font:inherit;cursor:pointer;border-radius:12px;padding:8px;text-align:left}.balance-link:hover{background:#eef4ff}.balance-link strong{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}.balance-link:focus-visible{outline:2px solid #3157d5}.account-modal{position:fixed;inset:0;background:#10213a99;z-index:1000;display:grid;place-items:center;padding:24px}.account-modal-card{background:#fff;border-radius:22px;width:min(1100px,96vw);max-height:88vh;overflow:auto;padding:24px;box-shadow:0 24px 70px #07152c55}.account-modal-head{display:flex;justify-content:space-between;align-items:center;gap:20px}.modal-close{border:0;background:#eef2f7;border-radius:999px;width:38px;height:38px;font-size:22px;cursor:pointer}.account-modal table{width:100%;border-collapse:collapse;min-width:720px}.account-modal th,.account-modal td{text-align:right;padding:10px;border-bottom:1px solid #e5eaf1}.account-modal-table{overflow:auto}';document.head.appendChild(balanceLinkStyles);
const movementSearchStyles=document.createElement('style');movementSearchStyles.textContent='.movement-search-fields{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(135px,1fr)) auto;gap:12px;align-items:end;margin:16px 0 22px}.movement-search-fields label{display:grid;gap:6px;color:#68758a;font-size:12px;font-weight:800}.movement-search-fields input{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fff;color:#14213d}.movement-search-fields input:focus{outline:2px solid #3157d5;border-color:transparent}.movement-search-table{overflow:auto}.movement-search-table table{width:100%;border-collapse:collapse;min-width:850px}.movement-search-table th,.movement-search-table td{text-align:right;padding:11px 9px;border-bottom:1px solid #e5eaf1}.movement-search-table th{color:#68758a;font-size:12px}.movement-search-summary{display:flex;justify-content:space-between;gap:15px;background:#eef4ff;color:#173b86;border-radius:13px;padding:13px 16px;margin-bottom:12px;font-weight:800}@media(max-width:1050px){.movement-search-fields{grid-template-columns:repeat(2,minmax(150px,1fr))}}';document.head.appendChild(movementSearchStyles);
const syncStatusStyles=document.createElement('style');syncStatusStyles.textContent='#syncBanner{position:sticky;top:0;z-index:900;box-shadow:0 6px 18px #22386114}.sync-state{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;font-weight:800;margin-top:6px}.sync-state:before{content:"";width:9px;height:9px;border-radius:50%;background:currentColor}.sync-state.waiting{background:#fff4dc;color:#946200}.sync-state.running{background:#eaf1ff;color:#2450bd}.sync-state.running:before{animation:syncPulse 1s ease-in-out infinite}@keyframes syncPulse{0%,100%{opacity:1}50%{opacity:.25}}.sync-state.done{background:#e4f7ef;color:#087f5b}.sync-state.error{background:#ffebe9;color:#b42318}.sync-detail{display:block;color:#6d788b;margin-top:6px}';document.head.appendChild(syncStatusStyles);
document.addEventListener('DOMContentLoaded',load);
document.addEventListener('click',async e=>{const b=e.target.closest('.sync-card-history');if(!b||!b.dataset.suffix)return;e.preventDefault();e.stopPropagation();const suffix=b.dataset.suffix,old=b.textContent;b.disabled=true;b.textContent='מסנכרן…';toast(`מתחיל סנכרון שנה לכרטיס ${suffix}`);try{const r=await chrome.runtime.sendMessage({type:'LOAD_CARD_YEAR',months:12,suffixes:[suffix]});if(!r?.ok)return toast(r?.error||`סנכרון כרטיס ${suffix} נכשל`);toast(`כרטיס ${suffix}: נטענו ${r.loaded} חודשים`);await renderAllCards()}catch(err){toast(`כרטיס ${suffix}: ${err?.message||'התקשורת עם התוסף נקטעה — רענן את הדשבורד'}`)}finally{if(b.isConnected){b.disabled=false;b.textContent=old}}});
document.addEventListener('click',async e=>{const b=e.target.closest('.sync-bank-card');if(!b||!b.dataset.source)return;e.preventDefault();e.stopPropagation();toast(`כרטיס ${b.dataset.suffix}: מעדכן חיוב ושיוך דרך הבנק`);try{await refreshBank(b.dataset.source,b)}catch(err){toast(err?.message||'עדכון הכרטיס דרך הבנק נכשל')}});
document.addEventListener('click',async e=>{const b=e.target.closest('.sync-cal-card');if(!b)return;e.preventDefault();e.stopPropagation();const old=b.textContent;b.disabled=true;b.textContent='טוען שנה מכאל…';toast(`כרטיס ${b.dataset.suffix}: מתחיל קריאת 12 חודשים מכאל`);try{const r=await chrome.runtime.sendMessage({type:'START_CAL',suffix:b.dataset.suffix});if(!r?.ok)return toast(r?.error||'סנכרון כאל לא התחיל');toast(r.status==='waiting_login'?'יש להתחבר לכאל ואז ללחוץ שוב':'טעינת השנה מכאל התחילה')}catch(err){toast(err?.message||'סנכרון כאל נכשל')}finally{if(b.isConnected){b.disabled=false;b.textContent=old}}});
document.addEventListener('click',async e=>{const b=e.target.closest('.sync-max-card');if(!b)return;e.preventDefault();e.stopPropagation();const old=b.textContent;b.disabled=true;b.textContent='טוען שנה מ‑MAX…';try{const r=await chrome.runtime.sendMessage({type:'START_MAX',suffix:b.dataset.suffix});toast(r?.ok?(r.status==='waiting_login'?'יש להתחבר ל‑MAX ואז הסנכרון יתחיל':'טעינת השנה מ‑MAX התחילה'):(r?.error||'סנכרון MAX לא התחיל'))}catch(err){toast(err?.message||'סנכרון MAX נכשל')}finally{if(b.isConnected){b.disabled=false;b.textContent=old}}});
// זיהוי דיסקונט מעדכן ארבע שורות בזו אחר זו. מריצים רינדור אחד אחרי רצף העדכונים
// ומבטלים טעינה ישנה, כדי שמצב "אין חשבונות" לא ידרוס רשימה חדשה שכבר נמצאה.
chrome.storage.onChanged.addListener(()=>{clearTimeout(loadTimer);loadTimer=setTimeout(load,120)});

async function load(){
  const epoch=++loadEpoch;
  document.querySelector('.sources')?.classList.add('hidden');
  const data=await chrome.storage.local.get({accounts:[],discoveredAccounts:[],selectedAccountKeys:null,syncScope:'business',accountFilter:'both',accountKinds:{},privateOwnerName:'',hideMortgages:false,isracardUnassigned:[],calUnassigned:[],maxUnassigned:[],isracardLastCards:[],calLastCards:[],maxLastCards:[],fibiConnectionNames:{},syncStatus:'טרם בוצע',syncProgress:null,statusBySource:{},bankDiagnostics:{},hiddenCards:[]});
  hiddenCards=(data.hiddenCards||[]).map(x=>String(x).replace(/\D/g,'')).filter(Boolean);
  // כרטיס שהוסתר אינו חוזר דרך סנכרון: הסינון כאן, לפני כל רינדור.
  data.accounts=(data.accounts||[]).map(a=>({...a,cards:(a.cards||[]).filter(c=>!cardHidden(c))}));
  for(const k of ['isracardUnassigned','calUnassigned','maxUnassigned'])data[k]=(data[k]||[]).filter(c=>!cardHidden(c));
  statusBySource=data.statusBySource||{};bankDiagnostics=data.bankDiagnostics||{};
  if(epoch!==loadEpoch)return;
  accounts=data.accounts;discovered=data.discoveredAccounts;syncScope=data.syncScope;accountFilter=data.accountFilter;accountKinds=data.accountKinds;privateOwnerName=data.privateOwnerName;hideMortgages=Boolean(data.hideMortgages);isracardUnassigned=data.isracardUnassigned||[];calUnassigned=data.calUnassigned||[];maxUnassigned=data.maxUnassigned||[];isracardLastCards=data.isracardLastCards||[];calLastCards=data.calLastCards||[];maxLastCards=data.maxLastCards||[];selectedKeys=(Array.isArray(data.selectedAccountKeys)?data.selectedAccountKeys:accounts.map(a=>a.selectionKey||a.id)).map(k=>String(k).includes('|')?k:`business|${k}`);
  // תיקון רשומות בינלאומי שכבר נשמרו לפני אימות לוח הסילוקין. הערכים נמדדו
  // ישירות בלוחות שסופקו: מספר התשלום הקרוב והתקופה עד מועד הפירעון הסופי.
  let correctedFibi=false;for(const a of accounts){if(!String(a.source||'').startsWith('fibi-'))continue;for(const l of a.loans||[]){const id=String(l.type||'');let remaining=null,total=null;if(String(a.accountNumber)==='236352'&&id.includes('493-432')){remaining=54;total=60}else if(String(a.accountNumber)==='206601'&&id.includes('205-432')){remaining=45;total=60}else if(String(a.accountNumber)==='206601'&&id.includes('302-432')){remaining=47;total=55}if(remaining!=null&&(l.remainingInstallments!==remaining||l.totalInstallments!==total||l.installments!==`${total-remaining}/${total}`)){l.remainingInstallments=remaining;l.totalInstallments=total;l.installments=`${total-remaining}/${total}`;correctedFibi=true}}}if(correctedFibi)await chrome.storage.local.set({accounts});
  const requestedPrivate=[...accounts,...discovered].find(a=>String(a.accountNumber)==='690300');if(requestedPrivate&&!accountKinds[accountKey(requestedPrivate)]){accountKinds[accountKey(requestedPrivate)]='private';await chrome.storage.local.set({accountKinds})}
  for(const bank of BANK_BUTTONS)if(bank.fibi&&data.fibiConnectionNames[bank.id])bank.name=`הבינלאומי — ${data.fibiConnectionNames[bank.id]}`;
  if(!Array.isArray(data.selectedAccountKeys))await chrome.storage.local.set({selectedAccountKeys:selectedKeys});
  renderSyncStatus(data.syncStatus);
  renderSyncProgress(data.syncProgress,data.syncStatus);
  await rememberBankStatus(data.syncStatus,data.statusBySource);
  {const b=$('#syncAll');if(b&&!b.disabled)b.textContent=syncAllLabel();}
  $('#syncAll').textContent='סנכרון לפי הבחירה האחרונה';
  const totalLabel=$('#total')?.previousElementSibling;if(totalLabel)totalLabel.textContent='יתרה כוללת בכל החשבונות';
  const selectable=discovered.filter(a=>a.branch&&a.accountNumber),fresh=selectable.filter(a=>!selectedKeys.includes(a.key));
  // סימון ברירת מחדל קורה פעם אחת לכל זיהוי, ונשמר — לא מחושב מחדש בכל רינדור
  {const fp=selectable.map(a=>a.key).sort().join(',');const picked=(await chrome.storage.local.get({autoPickedFor:''})).autoPickedFor;if(selectable.length&&fresh.length===selectable.length&&picked!==fp){selectedKeys=[...new Set([...selectedKeys,...selectable.map(a=>a.key)])];await chrome.storage.local.set({selectedAccountKeys:selectedKeys,autoPickedFor:fp});if(epoch!==loadEpoch)return}else if(selectable.length&&picked!==fp)await chrome.storage.local.set({autoPickedFor:fp})}
  renderScope();renderIsracardAssignments();render();renderSelection();
  // כשזיהוי מסתיים, קופצים ללשונית הבחירה כדי שלא יצטרכו לחפש אותה
  setActiveView(discovered.length&&activeView!=='selection'?'selection':activeView);
}
function renderScope(){const syncToggleState=()=>chrome.storage.local.get({autoSyncOnLogin:false}).then(x=>{for(const c of document.querySelectorAll('[id="autoSyncOnLogin"]'))c.checked=x.autoSyncOnLogin});let panel=$('#scopePanel');if(!panel){panel=document.createElement('section');panel.id='scopePanel';panel.className='panel scope-panel';document.querySelector('.sources')?.before(panel)}panel.onchange=async e=>{const c=e.target.closest('#autoSyncOnLogin');if(c)await chrome.storage.local.set({autoSyncOnLogin:c.checked})};
panel.innerHTML=`<h2>הבנקים וכרטיסי האשראי שלי</h2><div class="auto-sync collect-since"><span>תחילת איסוף נתונים<small>הגדרה אחת לכל הבנקים והכרטיסים</small></span> ${collectSinceControls()}</div><p id="collectSinceLine" class="sync-detail">${collectSinceSentence()}</p><p>לחיצה על בנק או חברת אשראי תפתח את מסך הכניסה שלו. אחרי שתתחבר, הסנכרון ירוץ ברקע והתוסף יישאר לפניך.</p><label class="auto-sync"><input type="checkbox" id="autoSyncOnLogin"> <span>סנכרון אוטומטי בכל כניסה לבנק<small>בכל התחברות חדשה מעדכן לבד את החשבונות שכבר בחרת</small></span></label><div class="bank-grid">${BANK_BUTTONS.map(b=>`<button class="bank-button ${b.ready?'ready':''}" data-bank="${b.id}"><img src="${b.logo}" alt=""><span><b>${b.name}</b><small>${esc(bankLine(b))}</small></span></button>`).join('')}</div><h3>אילו חשבונות להציג?</h3><div class="scope-choice"><label><input type="radio" name="accountFilter" value="business" ${accountFilter==='business'?'checked':''}> עסקיים</label><label><input type="radio" name="accountFilter" value="private" ${accountFilter==='private'?'checked':''}> פרטיים</label><label><input type="radio" name="accountFilter" value="both" ${accountFilter==='both'?'checked':''}> כולם</label></div>`;panel.onclick=async e=>{const button=e.target.closest('.bank-button');if(!button)return;const bank=BANK_BUTTONS.find(b=>b.id===button.dataset.bank);if(bank.fibi)return startFibi(bank.id,button);if(bank.leumi)return startLeumi(button);if(bank.discountBusiness)return startDiscountBusiness(button);if(bank.discountPrivate)return startDiscountPrivate(button);if(bank.mizrahi)return startMizrahi(button);if(bank.yahav)return startYahav(button);if(bank.isracard)return startIsracard(button);if(bank.cal)return startCal(button);if(bank.max)return startMax(button);if(bank.ready)return startChosenSync(bank.id,button);await chrome.runtime.sendMessage({type:'OPEN_EXTERNAL_BANK',url:bank.url});toast(`${bank.name}: האתר הרשמי נפתח; חיבור הסנכרון יתווסף בשלב הבא`)};panel.onchange=async e=>{if(e.target.name==='accountFilter'){accountFilter=e.target.value;await chrome.storage.local.set({accountFilter});render()}}
syncToggleState();}
function cardSrc(c){const s=String(c?.issuer||'');return /MAX|מקס/i.test(s)?'max':/כאל|CAL/i.test(s)?'cal':'isracard'}
function assignSelect(c){return`<select class="isracard-account" data-suffix="${esc(c.suffix)}" data-src="${esc(cardSrc(c))}"><option value="">ממתין לשיוך — בחר חשבון</option>${accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.sourceLabel)} · ${esc(a.branch)}-${esc(a.accountNumber)}${a.nickname||a.owner?` · ${esc(a.nickname||a.owner)}`:''}</option>`).join('')}</select>`}
async function assignCard(src,suffix,accountId){const account=accounts.find(a=>a.id===accountId);if(!account)return;const lists={isracard:isracardUnassigned,cal:calUnassigned,max:maxUnassigned},same=c=>String(c.suffix)===String(suffix);const card=(lists[src]||[]).find(same)||[...isracardLastCards,...calLastCards,...maxLastCards].find(same);if(!card)return;account.cards=[...(account.cards||[]).filter(c=>!same(c)),card];isracardUnassigned=isracardUnassigned.filter(c=>!same(c));calUnassigned=calUnassigned.filter(c=>!same(c));maxUnassigned=maxUnassigned.filter(c=>!same(c));const patch={accounts,isracardUnassigned,calUnassigned,maxUnassigned};if(src==='isracard'){const saved=await chrome.storage.local.get({isracardAssignments:{}});patch.isracardAssignments={...saved.isracardAssignments,[suffix]:account.id}}await chrome.storage.local.set(patch);toast(`כרטיס ${suffix} שויך לחשבון ${account.branch}-${account.accountNumber}`)}
document.addEventListener('change',e=>{const sel=e.target?.closest?.('.isracard-account');if(!sel||!sel.value)return;assignCard(sel.dataset.src,sel.dataset.suffix,sel.value)});
function renderIsracardAssignments(){const pending=[...isracardUnassigned,...calUnassigned,...maxUnassigned];let panel=$('#isracardAssignments');if(!pending.length){panel?.remove();return}if(!panel){panel=document.createElement('section');panel.id='isracardAssignments';panel.className='panel';$('#scopePanel')?.after(panel)}panel.innerHTML=`<h2>שיוך כרטיסי אשראי לחשבונות</h2><p>כרטיס שהבנק לא דיווח עליו אינו משוייך אוטומטית. בחר פעם אחת חשבון חיוב — הסנכרונים הבאים כבר יזהו אותו.</p>${pending.map(c=>`<label class="choice"><span><b>${esc(c.name||'כרטיס')} · ${esc(c.suffix)}</b><small>${esc(c.issuer||'')} · חיוב ${money(c.amount)}${c.chargeDate?` · ${esc(c.chargeDate)}`:''}</small>${assignSelect(c)}</span></label>`).join('')}`}
function money(n){return new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(Number(n)||0)}
function shortDateTime(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';const pad=n=>String(n).padStart(2,'0');return`${d.getDate()}.${d.getMonth()+1}.${pad(d.getFullYear()%100)} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function renderSyncStatus(raw=''){const value=String(raw||''),el=$('#syncStatus');let banner=$('#syncBanner');if(!banner){banner=document.createElement('section');banner.id='syncBanner';banner.className='panel';document.querySelector('.summary')?.before(banner)}let state='waiting',label='ממתין לחיבור';if(/שגיאה|נכשל/.test(value)){state='error';label='הסנכרון נכשל'}else if(/לפני פחות מ-|האוטומטי כבוי|תור הסנכרון|כבר רץ|לא נשמרו חשבונות|אין חיבור שאושר/.test(value)){state='waiting';label='הסנכרון דולג'}else if(/הסתיים|סונכרן|כבר עודכן/.test(value)){state='done';label=/הסתיים/.test(value)?'הסנכרון הסתיים בהצלחה':'הסנכרון הסתיים'}else if(/קורא|מסנכרן|מזהה|מחפש|בודק|טוען|מתבצע|שומר|שולף|מוריד|פותח|מעדכן|ממתין להתחברות/.test(value)){state='running';label='סנכרון בתהליך'}const html=`<span class="sync-state ${state}">${label}</span><small class="sync-detail">${esc(value)}</small>`;el.innerHTML=html;banner.innerHTML=html}
function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}
function render(){
  const visible=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter);const box=$('#accounts');box.innerHTML=visible.length?'':'<div class="panel empty">אין חשבונות בסוג שנבחר.</div>';
  visible.forEach(a=>{
    const ownerName=a.owner||(a.source==='private'?privateOwnerName:'');
    const card=document.createElement('article');card.className='panel account';
    const loanBalance=(a.loans||[]).filter(l=>!hideMortgages||!l.isMortgage).reduce((sum,l)=>sum+(Number(l.balance)||0),0);
    card.innerHTML=`<div class="account-balance-row"><div class="account-cell account-identity"><h3>${esc(a.nickname)} <span class="source-badge">${esc(a.sourceLabel||'פועלים עסקי')}</span></h3><p>סניף ${esc(a.branch)} · חשבון ${esc(fullAccount(a))}</p><label>סוג: <select class="account-kind" data-key="${esc(accountKey(a))}"><option value="business" ${kindOf(a)==='business'?'selected':''}>עסקי</option><option value="private" ${kindOf(a)==='private'?'selected':''}>פרטי</option></select></label></div><button type="button" class="account-cell balance-link" title="הצגת תנועות העו״ש בחשבון"><span>יתרת עו״ש</span><strong>${money(a.balance)}</strong></button><div class="account-cell"><span>מסגרת אשראי</span><strong>${a.creditLimit==null?'—':money(a.creditLimit)}</strong></div><div class="account-cell"><span>${Number(a.availableCredit)<0?'חריגה מהמסגרת':'יתרה זמינה'}</span><strong class="${Number(a.availableCredit)<0?'negative':''}">${a.availableCredit==null?'—':money(a.availableCredit)}</strong></div><div class="account-cell"><span>חיובי כרטיסים קרובים</span><strong>${accountCardTotal(a)==null?'—':money(accountCardTotal(a))}</strong></div><div class="account-cell"><span>עדכון אחרון</span><strong>${shortDateTime(a.lastSync)}</strong></div><div class="account-cell"><span>יתרת הלוואות</span><strong>${(a.loans||[]).length?money(loanBalance):'—'}</strong></div><div class="account-cell account-actions"><button type="button" class="refresh-row" data-source="${esc(a.source||'business')}" title="עדכן את החיבור הזה עכשיו" aria-label="עדכון ${esc(a.nickname)}">⟳</button><button type="button" class="remove remove-row" data-id="${a.id}" aria-label="מחיקת ${esc(a.nickname)}">×</button></div></div>`;
    if(ownerName){const heading=card.querySelector('h3');if(heading?.firstChild)heading.firstChild.textContent=`${ownerName} `;const ownerLine=document.createElement('p');ownerLine.innerHTML=`<b>בעלים:</b> ${esc(ownerName)}`;heading?.after(ownerLine)}
    card.querySelector('.balance-link').onclick=()=>openAccountTransactions(a);
    box.appendChild(card);
  });
  const sums={balance:visible.reduce((s,a)=>s+(Number(a.balance)||0),0),limit:visible.reduce((s,a)=>s+(Number(a.creditLimit)||0),0),available:visible.reduce((s,a)=>s+(Number(a.availableCredit)||0),0),cards:visible.reduce((s,a)=>s+(Number(a.upcomingCardCharges)||0),0),loans:visible.reduce((s,a)=>s+(a.loans||[]).filter(l=>!hideMortgages||!l.isMortgage).reduce((n,l)=>n+(Number(l.balance)||0),0),0)};$('#count').textContent=visible.length;$('#total').textContent=money(sums.balance);let totals=$('#accountsTotals');if(!totals){totals=document.createElement('section');totals.id='accountsTotals';totals.className='panel accounts-total accounts-view';box.after(totals)}totals.innerHTML=`<h3>סיכום כללי · ${visible.length} חשבונות</h3><div class="accounts-total-grid"><div><span>יתרת עו״ש כוללת</span><strong>${money(sums.balance)}</strong></div><div><span>מסגרות אשראי</span><strong>${money(sums.limit)}</strong></div><div><span>יתרה זמינה</span><strong>${money(sums.available)}</strong></div><div><span>חיובי כרטיסים קרובים</span><strong>${money(sums.cards)}</strong></div><div><span>יתרת הלוואות כוללת</span><strong>${money(sums.loans)}</strong></div></div>`;
  const cardTotalCell=totals.querySelector('.accounts-total-grid div:nth-child(4) strong');if(cardTotalCell)cardTotalCell.textContent=money(dedupedCardTotal(visible));const dates=accounts.map(a=>a.lastSync).filter(Boolean).sort();$('#lastSync').textContent=dates.length?shortDateTime(dates.at(-1)):'טרם בוצע';renderTransactions();renderAllCards().then(renderHiddenCards).catch(e=>console.warn('renderAllCards',e));renderLoansTable();
}
function dedupedCardTotal(visible){const cards=new Map(),fallback=[];for(const a of visible){if((a.cards||[]).length)for(const c of a.cards){const key=String(c.suffix||`${a.id}-${cards.size}`);cards.set(key,Number(c.amount)||0)}else fallback.push(Number(a.upcomingCardCharges)||0)}const hasIsracard=accountFilter==='both'&&isracardLastCards.length>0;if(hasIsracard)for(const c of isracardLastCards)cards.set(String(c.suffix),Number(c.amount)||0);return[...cards.values()].reduce((s,n)=>s+n,0)+(hasIsracard?0:fallback.reduce((s,n)=>s+n,0))}
function accountCardTotal(a){if(!(a.cards||[]).length)return a.upcomingCardCharges==null?null:Number(a.upcomingCardCharges)||0;const bySuffix=new Map();for(const c of a.cards)bySuffix.set(String(c.suffix||bySuffix.size),Number(c.amount)||0);return[...bySuffix.values()].reduce((s,n)=>s+n,0)}
function accountKey(a){return a.selectionKey||`${a.source||'business'}|${a.branch}-${a.accountNumber}`}
function fullAccount(a){return`${a.accountNumber}${a.accountSuffix?`/${a.accountSuffix}`:''}`}
function kindOf(a){return accountKinds[accountKey(a)]||(a.source==='private'||a.source==='discount-private'||String(a.source).startsWith('fibi-')?'private':'business')}
function renderLoans(loans,source=''){if(!loans.length)return'<details class="details"><summary>הלוואות (אין הלוואות בחשבון)</summary></details>';const fibi=String(source).startsWith('fibi-');return`<details class="details" open><summary>פירוט הלוואות (${loans.length})</summary><div class="detail-grid">${loans.map(l=>fibi?`<div class="detail-card"><p>סכום הלוואה: <b>${money(l.originalPrincipal)}</b></p><p>תשלום קרוב: <b>${money(l.nextPayment)}</b></p><p>ריבית: <b>${esc(l.interest||'—')}</b></p></div>`:`<div class="detail-card"><h4>${esc(l.type)}</h4><p>יתרה: <b>${money(l.balance)}</b></p><p>קרן מקורית: ${money(l.originalPrincipal)}</p><p>תשלום הבא: ${money(l.nextPayment)} ${esc(l.nextPaymentDate)}</p><small>${esc(l.startDate)}—${esc(l.endDate)}</small></div>`).join('')}</div></details>`}
function renderCards(cards){if(!cards.length)return'<details class="details"><summary>כרטיסי אשראי (לא נמצאו כרטיסים)</summary></details>';return`<details class="details" open><summary>פירוט כרטיסי אשראי (${cards.length})</summary>${cards.map(c=>`<section class="detail-card card-statement"><div class="statement-head"><div><h4>${esc(c.name)} · ארבע ספרות אחרונות ${esc(c.suffix)}</h4><p>${esc(c.issuer)} · מועד חיוב ${esc(c.chargeDate)}</p></div><strong>${money(c.amount)}</strong></div>${c.transactions?.length?`<table class="mini-table"><thead><tr><th>תאריך</th><th>בית עסק</th><th>סכום</th><th>תשלומים</th></tr></thead><tbody>${[...c.transactions].sort((a,b)=>dateKey(b.date)-dateKey(a.date)).map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.merchant)}</td><td>${money(t.amount)}</td><td>${esc(t.payments)}</td></tr>`).join('')}</tbody></table>`:'<small>באתר הבנק לא מוצגות עסקאות לכרטיס זה; הפירוט זמין באתר חברת הכרטיס.</small>'}</section>`).join('')}</details>`}
function dateKey(value){const m=String(value||'').match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);if(!m)return 0;let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1])).getTime()}
function renderTransactions(){const shown=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter),totalBalance=shown.reduce((sum,a)=>sum+(Number(a.balance)||0),0),states=new Map(shown.map(a=>[accountKey(a),Number(a.balance)||0]));const rows=shown.flatMap(a=>(a.transactions||[]).map(t=>({...t,account:a}))).sort((a,b)=>dateKey(b.date)-dateKey(a.date)).slice(0,200),newCount=rows.filter(t=>t.isNew).length;for(const t of rows){const key=accountKey(t.account);if(t.balance!=null)states.set(key,Number(t.balance));t.totalBalance=[...states.values()].reduce((sum,value)=>sum+value,0);const after=states.get(key)||0,credit=Math.abs(Number(t.credit)||0),debit=Math.abs(Number(t.debit)||0);states.set(key,after-credit+debit)}const total=`<div class="loans-total"><span>יתרת עו״ש כוללת · ${shown.length} חשבונות ${newCount?`<b class="new-transactions-count">${newCount} חדשות</b>`:''}</span><strong>${money(totalBalance)}</strong></div>`;if(!rows.length){$('#transactions').innerHTML=`${total}<div class="empty">אין תנועות בסוג החשבון שנבחר.</div>`;return}$('#transactions').innerHTML=`${total}<table><thead><tr><th>תאריך</th><th>חשבון</th><th>פעולה ופרטים</th><th>חובה</th><th>זכות</th><th>יתרה כוללת</th></tr></thead><tbody>${rows.map(t=>`<tr class="${t.isNew?'new-transaction':''}"><td>${esc(t.date)} ${t.isNew?'<span class="new-badge">חדש</span>':''}</td><td>${esc(t.account.branch)}-${esc(t.account.accountNumber)}</td><td>${esc(t.action)} ${esc(t.details)}</td><td class="debit">${t.debit==null?'':money(t.debit)}</td><td class="credit">${t.credit==null?'':money(t.credit)}</td><td><b>${money(t.totalBalance)}</b></td></tr>`).join('')}</tbody></table>`}
function openAccountTransactions(accountOrKey){const account=typeof accountOrKey==='object'&&accountOrKey?accountOrKey:accounts.find(a=>accountKey(a)===accountOrKey||String(a.id)===String(accountOrKey));if(!account){toast('החשבון לא נמצא. יש לרענן את הדשבורד');return}// ⚠ 21.08.2026 — טל: „למה הסדר ביתרה לא נכון". נמדד מהמסך עצמו, בחשבון 009-2556371:
// 17/08 הראה העברה 250,000 (יתרה -267,664.63) **מעל** הקמת הלוואה 300,000 (יתרה 32,335.37),
// והחשבון מוכיח את ההפך: -267,664.63 + 300,000 = 32,335.37 בדיוק. כלומר בתוך אותו יום
// הרשימה מהאתר היא **בסדר עולה**, והמיון לפי תאריך בלבד (מיון יציב) שימר אותה כך —
// ואז בין ימים חדש-לישן ובתוך יום ישן-לחדש. לכן שובר שוויון: היפוך הסדר המקורי.
const rows=[...(account.transactions||[])].map((t,i)=>({t,i})).sort((a,b)=>dateKey(b.t.date)-dateKey(a.t.date)||b.i-a.i).map(x=>x.t);$('#accountModalTitle').textContent=`תנועות עו״ש · ${account.branch}-${account.accountNumber}`;$('#accountModalBody').innerHTML=rows.length?`<div class="account-modal-table"><table><thead><tr><th>תאריך</th><th>פעולה ופרטים</th><th>חובה</th><th>זכות</th><th>יתרה</th></tr></thead><tbody>${rows.map(t=>`<tr class="${t.isNew?'new-transaction':''}"><td>${esc(t.date)} ${t.isNew?'<span class="new-badge">חדש</span>':''}</td><td>${esc(t.action)} ${esc(t.details)}${account.source==='leumi'&&t.cheque?` <button class="button cheque-image" data-selection="${esc(accountKey(account))}" data-reference="${esc(t.reference||'')}" data-branch="${esc(account.branch)}" data-account="${esc(account.accountNumber)}" data-date="${esc(t.date)}" data-amount="${Number(t.chequeAmount)||0}">צילום שיק</button>`:''}</td><td class="debit">${t.debit==null?'':money(t.debit)}</td><td class="credit">${t.credit==null?'':money(t.credit)}</td><td>${t.balance==null?'':money(t.balance)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">אין תנועות בחשבון זה.</div>';const modal=$('#accountTransactionsModal');modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false')}

// ── בורר חודש בלשונית כרטיסי האשראי ───────────────────────────────────────
// ברירת המחדל היא החיוב הקרוב — כלומר הנתונים החיים מהסנכרון האחרון. בחירת חודש קודם
// קוראת מ-IndexedDB, ואם החודש טרם נשמר מציעה לטעון אותו מהאתר.
let cardMonth='';
// ⚠ „תחילת איסוף נתונים" — הגדרה גלובלית אחת, ולא פר-בנק. נשמרת ב-collectSince.
let collectSince='';
chrome.storage.local.get({collectSince:''}).then(x=>{collectSince=String(x.collectSince||'');renderScope()});
const HEB_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
// ⚠ 18.08.2026 — שדה <input type="date"> מוצג בפורמט של לוקאל הדפדפן (לרוב mm/dd/yyyy),
// ואחרי הבחירה לא היה ברור ממתי בדיוק ייאסף. לכן: שני בוררים בעברית, ומשפט מצב מפורש.
// הערך נשמר כ-YYYY-MM-01 — הגרעיניות האמיתית של האיסוף היא חודש, לא יום.
function collectSinceParts(){const m=String(collectSince||'').match(/^(\d{4})-(\d{2})/);return m?{year:Number(m[1]),month:Number(m[2])}:null}
function collectSinceSentence(){const p=collectSinceParts();
  return p?`הנתונים ייאספו מ-1 ב${HEB_MONTHS[p.month-1]} ${p.year} ואילך. תנועות, שיקים וחודשי כרטיס שקודמים לתאריך זה לא ייאספו.`
          :'לא נקבע גבול: נאסף כל מה שהבנק מציע.'}
function collectSinceControls(){const p=collectSinceParts(),now=new Date(),years=[];
  for(let y=now.getFullYear();y>=now.getFullYear()-5;y--)years.push(y);
  return `<select id="collectSinceMonth"><option value="">— ללא הגבלה —</option>${HEB_MONTHS.map((name,i)=>`<option value="${i+1}" ${p&&p.month===i+1?'selected':''}>${name}</option>`).join('')}</select>`
    +`<select id="collectSinceYear" ${p?'':'disabled'}>${years.map(y=>`<option value="${y}" ${p&&p.year===y?'selected':''}>${y}</option>`).join('')}</select>`}
document.addEventListener('change',async e=>{const hit=e.target.closest('#collectSinceMonth,#collectSinceYear');if(!hit)return;
  const monthSelect=document.querySelector('#collectSinceMonth'),yearSelect=document.querySelector('#collectSinceYear');
  const month=Number(monthSelect?.value||0),year=Number(yearSelect?.value||new Date().getFullYear());
  collectSince=month?`${year}-${String(month).padStart(2,'0')}-01`:'';
  await chrome.storage.local.set({collectSince});
  if(yearSelect)yearSelect.disabled=!month;
  const line=document.querySelector('#collectSinceLine');if(line)line.textContent=collectSinceSentence();
  toast(collectSince?`מעכשיו נאסף מ-1 ב${HEB_MONTHS[month-1]} ${year}`:'הגבול הוסר — נאסף כל מה שהבנק מציע');
  await renderAllCards()});
const monthLabel=m=>{const mm=String(m).slice(0,2),yy=String(m).slice(2);return `${mm}/${yy}`};
function lastTwelveMonths(){const out=[],d=new Date();for(let i=0;i<12;i++){out.push(`${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`);d.setMonth(d.getMonth()-1)}
  // חודשים שקודמים לתחילת האיסוף אינם מוצעים כלל — אחרת הבורר מציע לטעון מה שלא ייאסף.
  const t=Date.parse(collectSince||'');if(!Number.isFinite(t))return out;
  const bound=new Date(t),boundOrd=bound.getUTCFullYear()*100+bound.getUTCMonth()+1;
  return out.filter(m=>Number(m.slice(2))*100+Number(m.slice(0,2))>=boundOrd)}
async function renderCardMonthPicker(){
  const panel=document.querySelector('#cardsPanel');if(!panel)return;
  let bar=document.querySelector('#cardMonthBar');
  if(!bar){bar=document.createElement('div');bar.id='cardMonthBar';bar.className='card-month-bar';panel.querySelector('h2')?.after(bar);
    bar.onchange=async e=>{const sel=e.target.closest('#cardMonthSelect');if(!sel)return;cardMonth=sel.value;await renderAllCards()};
    bar.onclick=async e=>{
      const y=e.target.closest('#loadCardYear');
      if(y){const pick=String(document.querySelector('#cardYearCard')?.value||'').replace(/\D/g,'');
        const onlyMissingAsk=!!document.querySelector('#cardYearOnlyMissing')?.checked;
        if(!confirm(pick
          ?`טעינת 12 חודשים לכרטיס ${pick}${onlyMissingAsk?' — חסרים בלבד, ולכן ייקרא רק מה שאינו שמור':', רענון מלא של כל 12 החודשים'}. אם אינך מחובר — האתר ייפתח ותצטרך ללחוץ שוב. להמשיך?`
          :'טעינת שנה אחורה לכל הכרטיסים: 12 חודשים × כל כרטיס, מספר דקות ארוכות, והסשן של ישראכרט עלול להיסגר באמצע. עדיף לבחור כרטיס אחד בבורר. להמשיך בכל זאת?'))return;
        y.disabled=true;const yt=y.textContent;y.textContent='טוען…';
        const onlyMissing=!!document.querySelector('#cardYearOnlyMissing')?.checked;
        const r=await chrome.runtime.sendMessage({type:'LOAD_CARD_YEAR',months:12,suffixes:pick?[pick]:[],onlyMissing});
        y.disabled=false;y.textContent=yt;
        if(!r?.ok)return toast(r?.error||'טעינת השנה נכשלה');
        toast(r.disconnected?`ישראכרט ניתק את הסשן — נשמרו ${r.loaded} חודשים. התחבר ולחץ שוב.`:r.skipped?`כל ${r.skipped} החודשים כבר שמורים — לא נדרשה קריאה`:r.loaded?`נטענו ${r.loaded} חודשים`:'כל החודשים כבר היו שמורים');
        return renderAllCards()}
      const b=e.target.closest('#loadCardMonth');if(!b)return;
      b.disabled=true;const t=b.textContent;b.textContent='טוען מהאתר…';
      const r=await chrome.runtime.sendMessage({type:'LOAD_CARD_MONTH',month:cardMonth});
      b.disabled=false;b.textContent=t;
      if(!r?.ok)return toast(r?.error||'טעינת החודש נכשלה');
      toast(`נטענו ${r.cards} כרטיסים לחודש ${monthLabel(cardMonth)}`);await renderAllCards()};
  }
  // ⚠ 18.08.2026 — טעינת שנה לכל הכרטיסים היא 12×N דפים עם שהייה מחויבת, והסשן
  // של ישראכרט נסגר באמצע. הבורר מאפשר שנה לכרטיס אחד — 12 דפים, כדקה.
  const yearCards=(()=>{const seen=new Map();
    for(const c of isracardLastCards||[])if(c?.suffix&&!isOtherIssuer(c))seen.set(String(c.suffix),c);
    for(const a of accounts||[])for(const c of a.cards||[])if(c?.suffix&&!isOtherIssuer(c)&&!seen.has(String(c.suffix)))seen.set(String(c.suffix),c);
    return [...seen.values()]})();
  const saved=(await chrome.runtime.sendMessage({type:'CARD_MONTHS'}))?.months||[];
  const months=lastTwelveMonths();
  bar.innerHTML=`<label>חודש חיוב: <select id="cardMonthSelect">`
    +`<option value="" ${cardMonth?'':'selected'}>החיוב הקרוב</option>`
    +months.map(m=>`<option value="${m}" ${cardMonth===m?'selected':''}>${monthLabel(m)}${saved.includes(m)?'':' — לא נטען'}</option>`).join('')
    +`</select></label>`
    +(cardMonth&&!saved.includes(cardMonth)?`<button type="button" class="button" id="loadCardMonth">טען חודש זה — ישראכרט</button>`:'')
    +`<label>טעינת 12 חודשים: <select id="cardYearCard">`
      +`<option value="">כל הכרטיסים — ארוך, והסשן עלול להיסגר</option>`
      +yearCards.map(c=>`<option value="${esc(c.suffix)}">כרטיס ${esc(c.suffix)}${c.name?` — ${esc(c.name)}`:''}</option>`).join('')
      +`</select></label>`
    +`<label class="auto-sync"><input type="checkbox" id="cardYearOnlyMissing" checked> <span>השלם חסרים בלבד<small>מדלג על חודשים ששמורים כבר. הסר סימון לרענון מלא של 12 החודשים</small></span></label>`
    +`<button type="button" class="button secondary" id="loadCardYear">טען שנה אחורה — ישראכרט</button>`
    +`<small class="sync-detail">${saved.length?`שמורים ${saved.length} חודשים`:'טרם נשמרה היסטוריה'}${cardMonth?` · מוצג ${monthLabel(cardMonth)}`:''}</small>`;
}
const cardHistoryMark=suffix=>{const stat=cardHistoryStats[String(suffix)]||{},n=Number(stat.count)||0,since=stat.activeSince;const months=n===1?'חודש אחד':`${n} חודשים`;return n?`<span class="source-badge">כבר סונכרן · ${months}${since?` · פעיל מחודש ${esc(monthLabel(since))}`:''}</span>`:''},
// ⚠ 18.08.2026 — הכפתור היה תלוי בקיום היסטוריה שמורה, ולכן דווקא כרטיס שנטען בטעות —
// המקרה היחיד שלשמו נכתב — לא היה ניתן למחיקה, וגם לא כרטיסי כאל ו-MAX.
// deleteCardEverywhere מוחק לפי סיומת מכל שלוש רשימות הלא-משויכים, ואינו תלוי בהיסטוריה.
cardDeleteButton=suffix=>{const s=String(suffix||'').replace(/\D/g,'');return s?`<button type="button" class="button secondary delete-card-history" data-suffix="${esc(s)}" title="מסיר את הכרטיס מהתצוגה ומהסנכרונים הבאים">מחק כרטיס</button>`:''},cardHistoryButton=suffix=>`${cardHistoryStats[String(suffix)]?.count?'סנכרן מחדש':'סנכרן שנה'}`;
const isOtherIssuer=card=>/\b(?:MAX|CAL)\b|כאל|מקס/i.test(`${card.issuer||''} ${card.name||''}`),cardSyncControl=(account,card)=>{const text=`${card.issuer||''} ${card.name||''}`,cal=/\bCAL\b|כאל/i.test(text)?`<button type="button" class="button secondary sync-cal-card" data-suffix="${esc(card.suffix||'')}">סנכרן שנה מכאל</button>`:'',max=/\bMAX\b|מקס/i.test(text)?`<button type="button" class="button secondary sync-max-card" data-suffix="${esc(card.suffix||'')}">סנכרן שנה מ‑MAX</button>`:'',isracard=isOtherIssuer(card)?'':`${cardHistoryMark(card.suffix)} <button type="button" class="button secondary sync-card-history" data-suffix="${esc(card.suffix||'')}">${cardHistoryStats[String(card.suffix)]?.count?'סנכרן מחדש מישראכרט':'סנכרן שנה מישראכרט'}</button>`,bank=account?` <button type="button" class="button secondary sync-bank-card" data-source="${esc(account.source||'business')}" data-suffix="${esc(card.suffix||'')}">עדכן מהבנק</button>`:'';return`${cal}${max}${isracard}${bank} ${cardDeleteButton(card.suffix)}`};
async function renderAllCards(){const history=await chrome.runtime.sendMessage({type:'CARD_HISTORY_STATS'}),state=await chrome.storage.local.get({isracardActiveSince:{}});cardHistoryStats=history?.stats||{};for(const [suffix,activeSince] of Object.entries(state.isracardActiveSince||{})){cardHistoryStats[suffix]||(cardHistoryStats[suffix]={});cardHistoryStats[suffix].activeSince=activeSince}await renderCardMonthPicker();
calLastCards=[...new Map([...calLastCards,...maxLastCards].map(c=>[String(c.suffix),c])).values()];
if(cardMonth){const rows=((await chrome.runtime.sendMessage({type:'CARD_MONTH_DATA',month:cardMonth}))?.rows||[]).filter(c=>!cardHidden(c));
 const box=document.querySelector('#allCards');
 if(!rows.length){box.innerHTML='<div class="empty">החודש הזה עדיין לא נשמר. בחר "טען חודש זה מהאתר" כשאתה מחובר לישראכרט.</div>';return}
 box.innerHTML=rows.map(c=>`<section class="detail-card"><div class="statement-head"><div><h4>${esc(c.name||'כרטיס')} · ${esc(c.suffix)} ${cardHistoryMark(c.suffix)} <button type="button" class="button secondary sync-card-history" data-suffix="${esc(c.suffix)}">${cardHistoryButton(c.suffix)}</button></h4><small>${esc(c.issuer||'')} · חודש ${esc(monthLabel(c.month))}</small></div><strong>${c.amount==null?'—':money(c.amount)}</strong></div>`
 +((c.transactions||[]).length?`<div class="card-statement"><table class="mini-table"><thead><tr><th>תאריך</th><th>בית עסק</th><th>סכום</th><th>תשלומים</th></tr></thead><tbody>`
 +c.transactions.map(t=>`<tr><td>${esc(t.date||'')}</td><td>${esc(t.merchant||'')}</td><td>${t.amount==null?'':money(t.amount)}</td><td>${esc(t.payments||'')}</td></tr>`).join('')
 +`</tbody></table></div>`:'<div class="empty">אין תנועות לחודש זה.</div>')+`</section>`).join('');
 return}
const shown=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter),bySuffix=new Map();for(const card of [...isracardLastCards,...calLastCards])bySuffix.set(String(card.suffix),{account:null,card});for(const a of shown)for(const card of a.cards||[]){const key=String(card.suffix||`${a.id}-${bySuffix.size}`),current=bySuffix.get(key);bySuffix.set(key,{account:a,card:current?.card?.transactions?.length&&!card.transactions?.length?{...card,transactions:current.card.transactions}:card})}const groups=[...bySuffix.values()],isracardTotal=isracardLastCards.reduce((s,c)=>s+(Number(c.amount)||0),0),box=$('#allCards');if(!groups.length){box.innerHTML='<div class="empty">לא נמצאו כרטיסי אשראי בחשבונות המוצגים.</div>';return}box.innerHTML=`${isracardLastCards.length?`<div class="loans-total"><span>סך החיובים בכל כרטיסי ישראכרט</span><strong>${money(isracardTotal)}</strong></div>`:''}${groups.map(({account:a,card:c})=>`<section class="detail-card card-statement"><div class="statement-head"><div><h3>${esc(c.name||'כרטיס אשראי')} · ${esc(c.suffix||'')} ${cardSyncControl(a,c)}</h3><p>${esc(c.issuer||a?.sourceLabel||'')}${a?` · חשבון ${esc(a.branch)}-${esc(a.accountNumber)}`:' · '+assignSelect(c)}${c.chargeDate?` · חיוב ${esc(c.chargeDate)}`:''}</p></div><strong>${money(c.amount)}</strong></div>${c.transactions?.length?`<table class="mini-table"><thead><tr><th>תאריך</th><th>בית עסק</th><th>סכום</th><th>תשלומים</th></tr></thead><tbody>${[...c.transactions].sort((x,y)=>dateKey(y.date)-dateKey(x.date)).map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.merchant)}</td><td>${money(t.amount)}</td><td>${esc(t.payments||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">אין תנועות זמינות לכרטיס זה.</div>'}</section>`).join('')}`}
function renderAllLoans(){const shown=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter),rows=[],seen=new Set();for(const a of shown){const ownerKey=`${a.branch}-${a.accountNumber}`;for(let loanIndex=0;loanIndex<(a.loans||[]).length;loanIndex++){const l=a.loans[loanIndex];if(!l||(Number(l.balance)<=0&&Number(l.nextPayment)<=0)||l.accountKey&&l.accountKey!==ownerKey)continue;const fingerprint=[a.source,ownerKey,l.type,l.originalPrincipal,l.balance,l.endDate,l.nextPayment,l.nextPaymentDate,l.interest].join('|');if(seen.has(fingerprint))continue;seen.add(fingerprint);rows.push({account:a,loan:l,loanIndex})}}rows.sort((x,y)=>String(x.account.sourceLabel).localeCompare(String(y.account.sourceLabel),'he')||String(x.account.branch).localeCompare(String(y.account.branch),'he')||String(x.account.accountNumber).localeCompare(String(y.account.accountNumber),'he')||Number(y.loan.balance||0)-Number(x.loan.balance||0));const box=$('#allLoans');if(!rows.length){box.innerHTML='<div class="empty">לא נמצאו הלוואות בחשבונות המוצגים.</div>';return}const short=v=>{const s=String(v||'').replace(/\s+/g,' ').trim();return s&&s.length<=60?s:'—'},remaining=l=>{const m=String(l.installments||'').match(/(\d+)\s*\/\s*(\d+)/);if(m){const paid=Number(m[1]),total=Number(m[2]);return total>=paid?`${total-paid}/${total}`:'—'}const left=Number(l.remainingInstallments),total=Number(l.totalInstallments);
  if(Number.isFinite(left)&&left>=0&&Number.isFinite(total)&&total>0)return `${left}/${total}`;
  // ⚠ 18.08.2026 — לאומי אינו מחזיר מספר תשלומים כלל: ברשומה שלו אין installments,
  // בעוד שפועלים מחזיר "8/71". לכן העמודה הופיעה ריקה דווקא בהלוואה של לאומי.
  // כשיש תאריך התחלה, תאריך סיום ותשלום חודשי — המספר נגזר מהתאריכים, ומסומן ב-~
  // כדי שלא ייקרא כנתון שהבנק מסר.
  const loanMonths=(from,to)=>{const part=v=>{const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m)return null;const y=Number(m[3]);return{y:y<100?2000+y:y,m:Number(m[2])}};
    const a2=part(from),b2=part(to);return a2&&b2?(b2.y-a2.y)*12+(b2.m-a2.m):null};
  const allMonths=loanMonths(l.startDate,l.endDate),leftMonths=loanMonths(l.nextPaymentDate,l.endDate);
  if(Number.isFinite(allMonths)&&allMonths>0&&Number.isFinite(leftMonths)&&leftMonths>=0)return `~${leftMonths+1}/${allMonths+1}`;
  return '—'};const monthly=rows.reduce((sum,row)=>sum+(Number(row.loan.nextPayment)||0),0),hasMortgages=rows.some(r=>r.loan.isMortgage);box.innerHTML=`<div class="loans-table-wrap"><table class="loans-table"><thead><tr><th>בנק וחשבון</th><th>יתרה</th><th>תשלומים שנותרו</th><th>תשלום קרוב</th><th>תשלום סופי</th><th>ריבית</th><th>החזר קרוב</th><th>הסרה</th></tr></thead><tbody>${rows.map(({account:a,loan:l,loanIndex})=>`<tr><td><b>${esc(a.sourceLabel||'בנק')}</b> · ${esc(a.branch)}-${esc(a.accountNumber)} ${l.isMortgage?'<span class="mortgage-tag">משכנתא</span>':''}</td><td>${l.balance==null?'—':money(l.balance)}</td><td dir="ltr">${esc(remaining(l))}</td><td>${esc(short(l.nextPaymentDate))}</td><td>${esc(short(l.endDate))}</td><td>${esc(short(l.interest))}</td><td><b>${l.nextPayment==null?'—':money(l.nextPayment)}</b></td><td>${l.isMortgage?`<label class="loan-remove-label"><input type="checkbox" class="mortgage-remove" data-account-id="${esc(a.id)}" data-loan-index="${loanIndex}"> הסר</label>`:'—'}</td></tr>`).join('')}</tbody></table></div>${hasMortgages?'<button type="button" id="removeSelectedMortgages" class="button secondary">הסר משכנתאות מסומנות מהרשימה</button>':''}<div class="loans-total"><span>סה״כ החזר חודשי</span><strong>${money(monthly)}</strong></div>`}
function setActiveView(view){activeView=['accounts','selection','transactions','cards','search','loans'].includes(view)?view:'accounts';document.querySelectorAll('.dashboard-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));document.querySelectorAll('.selection-view').forEach(el=>el.classList.toggle('hidden',activeView!=='selection'));document.querySelectorAll('.accounts-view').forEach(el=>el.classList.toggle('hidden',activeView!=='accounts'));document.querySelectorAll('.transactions-view').forEach(el=>el.classList.toggle('hidden',activeView!=='transactions'));document.querySelectorAll('.cards-view').forEach(el=>el.classList.toggle('hidden',activeView!=='cards'));document.querySelectorAll('.search-view').forEach(el=>el.classList.toggle('hidden',activeView!=='search'));document.querySelectorAll('.loans-view').forEach(el=>el.classList.toggle('hidden',activeView!=='loans'));if(activeView==='search')scheduleMovementSearch()}

function searchDateValue(value,end=false){if(!value)return end?Infinity:-Infinity;return new Date(`${value}T${end?'23:59:59':'00:00:00'}`).getTime()}
function scheduleMovementSearch(){clearTimeout(movementSearchTimer);movementSearchTimer=setTimeout(renderMovementSearch,220)}
async function renderMovementSearch(){
 const box=$('#movementSearchResults');if(!box)return;const epoch=++movementSearchEpoch,q=String($('#movementSearchText')?.value||'').trim().toLocaleLowerCase('he'),minRaw=$('#movementSearchMin')?.value,maxRaw=$('#movementSearchMax')?.value,fromRaw=$('#movementSearchFrom')?.value,toRaw=$('#movementSearchTo')?.value;
 if(!q&&minRaw===''&&maxRaw===''&&!fromRaw&&!toRaw){box.className='empty';box.textContent='הקלד שם, סכום או תקופה — התוצאות יופיעו מיד.';return}
 box.className='empty';box.textContent='מחפש בתנועות עו״ש וכרטיסי האשראי…';const min=minRaw===''?0:Math.abs(Number(minRaw)),max=maxRaw===''?Infinity:Math.abs(Number(maxRaw)),from=searchDateValue(fromRaw),to=searchDateValue(toRaw,true),rows=[];
 for(const a of accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter))for(const t of a.transactions||[]){const amount=Math.abs(Number(t.debit)||Number(t.credit)||Number(t.amount)||0),name=`${t.action||''} ${t.details||''}`.trim(),when=dateKey(t.date);rows.push({date:t.date,when,name,amount,source:`${a.sourceLabel||'בנק'} · ${a.branch}-${a.accountNumber}`,kind:Number(t.credit)?'זכות':'חובה'})}
 const monthResult=await chrome.runtime.sendMessage({type:'CARD_MONTHS'}),months=monthResult?.months||[];
 for(const month of months){const result=await chrome.runtime.sendMessage({type:'CARD_MONTH_DATA',month});for(const c of result?.rows||[])for(const t of c.transactions||[]){rows.push({date:t.date,when:dateKey(t.date),name:t.merchant||'',amount:Math.abs(Number(t.amount)||0),source:`${c.issuer||'כרטיס אשראי'} · ${c.suffix||''}`,kind:'כרטיס אשראי'})}}
 if(epoch!==movementSearchEpoch)return;const filtered=rows.filter(r=>(!q||r.name.toLocaleLowerCase('he').includes(q))&&r.amount>=min&&r.amount<=max&&r.when>=from&&r.when<=to).sort((a,b)=>b.when-a.when).slice(0,500),sum=filtered.reduce((s,r)=>s+r.amount,0);
 if(!filtered.length){box.className='empty';box.textContent='לא נמצאו תנועות שמתאימות לחיפוש.';return}box.className='movement-search-table';box.innerHTML=`<div class="movement-search-summary"><span>נמצאו ${filtered.length} תנועות</span><span>סכום מצטבר ${money(sum)}</span></div><table><thead><tr><th>תאריך</th><th>ספק / לקוח / פעולה</th><th>מקור</th><th>סוג</th><th>סכום</th></tr></thead><tbody>${filtered.map(r=>`<tr><td>${esc(r.date||'')}</td><td><b>${esc(r.name||'ללא פירוט')}</b></td><td>${esc(r.source)}</td><td>${esc(r.kind)}</td><td>${money(r.amount)}</td></tr>`).join('')}</tbody></table>`;
}
function renderSelection(){const box=$('#discoveredAccounts'),tab=$('#selectionTab');
// ⚠ הפאנל כבר לא מסתתר מעצמו — הלשונית שולטת בהצגה. קודם הוא נעלם כשלא היו חשבונות
// שזוהו, ולכן לא היה שום מקום קבוע לחפש בו את הבחירה.
if(tab)tab.textContent=discovered.length?`בחירה וסנכרון (${discovered.length})`:'בחירה וסנכרון';
if(!discovered.length){box.innerHTML='<div class="empty">אין חשבונות שממתינים לבחירה. התחבר לבנק מלשונית "חשבונות", ובסיום ההתחברות החשבונות שזוהו יופיעו כאן לבחירה — הסנכרון לא מתחיל לפני שתאשר.</div>';const tools=$('#selectionTools');if(tools)tools.remove();return}
// ⚠ הרשימה נמחקת בכל התחברות, ולכן כל מה שבה הוא תוצר של הזיהוי הנוכחי — והכול מסומן
// כברירת מחדל. קודם רק חשבון שסונכרן בעבר הגיע מסומן, וחשבונות חדשים נשמטו בשקט.
if(!$('#selectionTools')){const tools=document.createElement('div');tools.id='selectionTools';tools.style.cssText='display:flex;gap:8px;margin-bottom:10px';
tools.innerHTML='<label class="auto-sync"><input type="checkbox" id="autoSyncOnLogin"> סנכרון אוטומטי בכניסה לבנק</label><button type="button" class="button" data-pick="all">סמן הכול</button><button type="button" class="button" data-pick="none">נקה הכול</button><button type="button" class="button" id="probeTab" title="קורא את מבנה הדף בלשונית הפעילה. קריאה בלבד — בלי לחיצות ובלי ניווט.">מדוד לשונית פעילה</button><span id="selectionCount" class="sync-detail"></span>';
box.before(tools);
chrome.storage.local.get({autoSyncOnLogin:false}).then(x=>{for(const c of document.querySelectorAll('[id="autoSyncOnLogin"]'))c.checked=x.autoSyncOnLogin});
tools.onchange=async e=>{const c=e.target.closest('#autoSyncOnLogin');if(c)await chrome.storage.local.set({autoSyncOnLogin:c.checked})};
tools.onclick=async e=>{if(e.target.closest('#autoSyncOnLogin'))return;const probe=e.target.closest('#probeTab');
if(probe){probe.disabled=true;probe.textContent='מודד…';
  // ⚠ בלי גבול זמן כאן הכפתור נשאר „מודד…" לנצח כשהרקע לא עונה. נמדד 18.08.2026.
  let r=null;
  try{r=await Promise.race([chrome.runtime.sendMessage({type:'PROBE_ACTIVE_TAB'}),new Promise((_,rej)=>setTimeout(()=>rej(Error('המדידה לא החזירה תשובה תוך 30 שניות')),30000))])}
  catch(err){r={ok:false,error:err?.message||'המדידה נכשלה'}}
  probe.disabled=false;probe.textContent='מדוד לשונית פעילה';
  toast(r?.ok?`נמדד: ${r.host}`:(r?.error||'המדידה נכשלה'));return}
const b=e.target.closest('[data-pick]');if(!b)return;const all=b.dataset.pick==='all',enabled=[...box.querySelectorAll('input[type=checkbox]:not(:disabled)')];enabled.forEach(c=>{c.checked=all});const shown=new Set(enabled.map(c=>c.value));selectedKeys=all?[...new Set([...selectedKeys,...shown])]:selectedKeys.filter(k=>!shown.has(k));await chrome.storage.local.set({selectedAccountKeys:selectedKeys});updateSelectionCount()}}
box.innerHTML=discovered.map(a=>{const kind=accountKinds[a.key]||(a.source==='private'||a.source==='discount-private'?'private':'business'),ready=!!(a.branch&&a.accountNumber);return`<label class="choice ${ready?'':'identifying'}"><input type="checkbox" value="${esc(a.key)}" ${ready&&selectedKeys.includes(a.key)?'checked':''} ${ready?'':'disabled'}><span><b>${esc(a.nickname||a.owner||`חשבון ${a.accountNumber||''}`)} <span class="source-badge">${esc(a.sourceLabel||'פועלים עסקי')}</span></b><small class="choice-id">${ready?esc(a.branch)+"-"+esc(fullAccount(a)):'מזהה מספר חשבון…'}</small><small>${ready?'היתרה תיקרא רק לאחר אישור הסנכרון':'ממתין לזיהוי בלבד — עדיין לא מוריד נתונים'}</small><select class="discovered-kind" data-key="${esc(a.key)}" ${ready?'':'disabled'}><option value="business" ${kind==='business'?'selected':''}>עסקי</option><option value="private" ${kind==='private'?'selected':''}>פרטי</option></select></span></label>`}).join('');box.onchange=async e=>{const c=e.target.closest('input[type=checkbox]');if(c){selectedKeys=c.checked?[...new Set([...selectedKeys,c.value])]:selectedKeys.filter(k=>k!==c.value);await chrome.storage.local.set({selectedAccountKeys:selectedKeys})}updateSelectionCount()};updateSelectionCount()}
function updateSelectionCount(){const box=document.querySelector('#discoveredAccounts'),el=document.querySelector('#selectionCount');if(!box||!el)return;const n=box.querySelectorAll('input[type=checkbox]:checked').length,total=box.querySelectorAll('input[type=checkbox]').length;el.textContent=`${n} מתוך ${total} מסומנים`;const btn=document.querySelector('#confirmSelection');if(btn)btn.textContent=n?`אישור וסנכרון ${n} חשבונות`:'סמן לפחות חשבון אחד';}

// כפתור עדכון לכל חשבון: מפעיל בדיוק את אותו מסלול של כפתור הבנק, ועוקף את פער
// 6 השעות של הסנכרון האוטומטי — כי כאן המשתמש ביקש רענון מפורשות.
function bankForSource(source){const s=String(source||'');
 if(s.startsWith('fibi-'))return BANK_BUTTONS.find(b=>b.id===s)||BANK_BUTTONS.find(b=>b.fibi);
 const map={business:'business',private:'private',leumi:'leumi','discount-business':'discount-business','discount-private':'discount-private',mizrahi:'mizrahi',yahav:'yahav',isracard:'isracard'};
 return BANK_BUTTONS.find(b=>b.id===map[s])}
async function refreshBank(source,button){const bank=bankForSource(source);
 if(!bank)return toast('לא ידוע איזה חיבור מרענן את החשבון הזה');
 if(bank.fibi)return startFibi(bank.id,button);
 if(bank.leumi)return startLeumi(button);
 if(bank.discountBusiness)return startDiscountBusiness(button);
 if(bank.discountPrivate)return startDiscountPrivate(button);
 if(bank.mizrahi)return startMizrahi(button);
 if(bank.yahav)return startYahav(button);
  if(bank.isracard)return startIsracard(button);
  if(bank.max)return startMax(button);
 return startChosenSync(bank.id,button)}
async function startChosenSync(scope,button){syncScope=scope;await chrome.storage.local.set({syncScope});const original=button.innerHTML;button.disabled=true;button.textContent='פותח את הבנק…';const response=await chrome.runtime.sendMessage({type:'START_AUTO_SYNC',scope,force:scope!=='both'});button.disabled=false;button.innerHTML=original;if(!response?.ok)return toast(response?.error||'ההפעלה נכשלה');if(response.status==='already_synced_today')return toast('כל החיבורים כבר סונכרנו היום');toast(scope==='both'?'התחבר לשני אתרי הבנק; חיבור שעודכן היום ידולג':'מתבצע סנכרון ידני מחדש גם אם החשבון עודכן היום')}
async function startFibi(slot,button){const original=button.innerHTML;button.disabled=true;button.textContent='בודק חיבור לבינלאומי…';const r=await chrome.runtime.sendMessage({type:'START_FIBI',slot});button.disabled=false;button.innerHTML=original;if(!r?.ok)return toast(r?.error||'פתיחת הבינלאומי נכשלה');toast(r.status==='syncing_connected'?'נמצא חיבור פעיל — הסנכרון התחיל':'התחבר בבינלאומי; הסנכרון יתחיל אוטומטית')}
async function startLeumi(button){const original=button.innerHTML;button.disabled=true;button.textContent='מזהה חשבונות לאומי…';let r;try{r=await chrome.runtime.sendMessage({type:'START_LEUMI'})}catch(e){button.disabled=false;button.innerHTML=original;return toast(`רכיב לאומי לא נטען: ${e.message}. יש לרענן את התוסף`)}button.disabled=false;button.innerHTML=original;if(!r?.ok)return toast(r?.error||'פתיחת לאומי נכשלה');toast(r.status==='discovering'?'מזהה את חשבונות לאומי לבחירה':'התחבר ללאומי; לאחר הכניסה יוצגו החשבונות לבחירה')}
async function startDiscountBusiness(button){const original=button.innerHTML;button.disabled=true;button.textContent='מזהה ישויות בדיסקונט…';try{const r=await chrome.runtime.sendMessage({type:'START_DISCOUNT_BUSINESS'});if(!r?.ok)return toast(r?.error||'פתיחת דיסקונט עסקי נכשלה');toast(r.status==='discovering'?'נמצאו הישויות — הדשבורד מתעדכן':'התחבר לדיסקונט עסקי; לאחר הכניסה יוצגו הישויות לבחירה')}catch(e){toast(`רכיב דיסקונט לא נטען: ${e.message}. יש לרענן את התוסף`)}finally{button.disabled=false;button.innerHTML=original}}
async function startDiscountPrivate(button){const original=button.innerHTML;button.disabled=true;button.textContent='פותח דיסקונט פרטי…';try{const r=await chrome.runtime.sendMessage({type:'START_DISCOUNT_PRIVATE'});if(!r?.ok)return toast(r?.error||'פתיחת דיסקונט פרטי נכשלה');toast('התחבר לדיסקונט פרטי; לאחר הכניסה החשבון יזוהה לבחירה')}catch(e){toast(`רכיב דיסקונט פרטי לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startMizrahi(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן מזרחי־טפחות…';try{const r=await chrome.runtime.sendMessage({type:'START_MIZRAHI'});if(!r?.ok)return toast(r?.error||'פתיחת מזרחי־טפחות נכשלה');toast(r.status==='waiting_login'?'התחבר למזרחי־טפחות ולחץ שוב על הכפתור':'סנכרון מזרחי־טפחות התחיל')}catch(e){toast(`רכיב מזרחי־טפחות לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startYahav(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן יהב…';try{const r=await chrome.runtime.sendMessage({type:'START_YAHAV'});if(!r?.ok)return toast(r?.error||'פתיחת יהב נכשלה');toast(r.status==='waiting_login'?'התחבר ליהב ולחץ שוב על הכפתור':'סנכרון יהב התחיל')}catch(e){toast(`רכיב יהב לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startIsracard(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן ישראכרט — נא להמתין…';try{const r=await chrome.runtime.sendMessage({type:'START_ISRACARD'});if(!r?.ok)return toast(r?.error||'פתיחת ישראכרט נכשלה');toast(r.status==='waiting_login'?'התחבר לישראכרט ולחץ שוב על הכפתור':`הסנכרון הסתיים: נקראו ${r.cards||0} כרטיסים, ${r.assigned||0} שויכו לחשבונות`);await load()}catch(e){toast(`רכיב ישראכרט לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startCal(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן כאל — נא להמתין…';try{const r=await chrome.runtime.sendMessage({type:'START_CAL'});if(!r?.ok)return toast(r?.error||'פתיחת כאל נכשלה');toast(r.status==='waiting_login'?'התחבר לכאל; הסנכרון יתחיל אוטומטית':'סנכרון כאל התחיל');await load()}catch(e){toast(`רכיב כאל לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startMax(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן MAX — נא להמתין…';try{const r=await chrome.runtime.sendMessage({type:'START_MAX'});if(!r?.ok)return toast(r?.error||'פתיחת MAX נכשלה');toast(r.status==='waiting_login'?'התחבר ל‑MAX; הסנכרון יתחיל אוטומטית':'סנכרון MAX התחיל');await load()}catch(e){toast(`רכיב MAX לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
$('#syncAll').onclick=()=>startChosenSync(syncScope,$('#syncAll'));

document.querySelector('.dashboard-tabs').onclick=e=>{const tab=e.target.closest('.dashboard-tab');if(tab)setActiveView(tab.dataset.view)};
$('#movementSearchPanel').addEventListener('input',scheduleMovementSearch);$('#clearMovementSearch').onclick=()=>{for(const input of document.querySelectorAll('#movementSearchPanel input'))input.value='';scheduleMovementSearch()};
$('#accounts').onclick=async e=>{
 const refresh=e.target.closest('.refresh-row');
 if(refresh){refresh.disabled=true;const old=refresh.textContent;refresh.textContent='…';
  try{await refreshBank(refresh.dataset.source,refresh)}finally{refresh.disabled=false;refresh.textContent=old}return}const button=e.target.closest('.remove');if(!button)return;const account=accounts.find(a=>a.id===button.dataset.id);if(account&&confirm(`למחוק את ${account.nickname}, סניף ${account.branch}, חשבון ${account.accountNumber}?`)){accounts=accounts.filter(a=>a.id!==account.id);selectedKeys=selectedKeys.filter(k=>k!==(account.selectionKey||account.id));await chrome.storage.local.set({accounts,selectedAccountKeys:selectedKeys});render()}};
$('#closeAccountModal').onclick=()=>$('#accountTransactionsModal').classList.add('hidden');$('#accountTransactionsModal').onclick=e=>{if(e.target.id==='accountTransactionsModal')e.currentTarget.classList.add('hidden')};
$('#accountModalBody').onclick=async e=>{const b=e.target.closest('.cheque-image');if(!b)return;b.disabled=true;b.textContent='פותח צילום…';
// קודם מקומי — כך הצילום נפתח גם כשאין חיבור לבנק. הפנייה לבנק היא נפילה לאחור בלבד.
const local=b.dataset.selection&&b.dataset.reference?await chequeGet(chequeId(b.dataset.selection,b.dataset.reference)).catch(()=>null):null;
if(local?.front){showCheque(local,b.dataset);b.disabled=false;b.textContent='צילום שיק';return}
const r=await chrome.runtime.sendMessage({type:'OPEN_LEUMI_CHEQUE',branch:b.dataset.branch,accountNumber:b.dataset.account,date:b.dataset.date,amount:Number(b.dataset.amount)});if(!r?.ok){b.disabled=false;b.textContent='צילום שיק';toast(r?.error||'צילום השיק לא נמצא')}else{b.disabled=false;b.textContent='צילום שיק'}};
function showCheque(record,data){const body=$('#chequeModalBody');$('#chequeModalTitle').textContent=`צילום שיק · ${data.date||''} · אסמכתא ${record.reference}`;
body.innerHTML=`<div class="cheque-shots"><figure><figcaption>קדמי</figcaption><img alt="צילום תמונת שיק מלפנים" src="${record.front}"></figure>${record.back?`<figure><figcaption>אחורי</figcaption><img alt="צילום תמונת שיק מאחור" src="${record.back}"></figure>`:''}</div><small class="sync-detail">נשמר מקומית ${record.savedAt?new Date(record.savedAt).toLocaleString('he-IL'):''} — נפתח גם ללא חיבור לבנק.</small>`;
$('#chequeModal').classList.remove('hidden')}
$('#closeChequeModal').onclick=()=>$('#chequeModal').classList.add('hidden');
$('#chequeModal').onclick=e=>{if(e.target.id==='chequeModal')e.currentTarget.classList.add('hidden')};
$('#allLoans').onclick=async e=>{if(!e.target.closest('#toggleMortgages'))return;hideMortgages=!hideMortgages;await chrome.storage.local.set({hideMortgages});render();toast(hideMortgages?'המשכנתאות הוסרו מהתצוגה ומהסיכומים':'המשכנתאות הוחזרו לתצוגה ולסיכומים')};
const chequeStyles=document.createElement('style');chequeStyles.textContent='#stopSync{margin-top:6px;display:block}.collect-since select{margin-inline-start:8px;font:inherit;padding:4px 8px;border-radius:8px}.collect-since{align-items:center}.auto-sync{display:inline-flex;align-items:center;gap:6px;font-weight:800;color:#173b86;background:#eef4ff;border-radius:999px;padding:8px 14px}.choice-id{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.02em;direction:ltr;text-align:right;display:block}.cheque-shots{display:grid;gap:14px}.cheque-shots figure{margin:0}.cheque-shots figcaption{font-weight:800;margin-bottom:6px;color:#6d788b}.cheque-shots img{width:100%;max-width:640px;border:1px solid #e5eaf1;border-radius:10px;display:block}';document.head.appendChild(chequeStyles);
$('#accounts').onchange=async e=>{const select=e.target.closest('.account-kind');if(!select)return;accountKinds[select.dataset.key]=select.value;await chrome.storage.local.set({accountKinds});render()};
$('#confirmSelection').onclick=async()=>{document.querySelectorAll('.discovered-kind').forEach(s=>accountKinds[s.dataset.key]=s.value);const keys=[...document.querySelectorAll('#discoveredAccounts input:checked')].map(x=>x.value);if(!keys.length)return toast('יש לבחור לפחות חשבון אחד');await chrome.storage.local.set({selectedAccountKeys:keys,accountKinds});const button=$('#confirmSelection');button.disabled=true;button.textContent='מסנכרן את החשבונות שנבחרו…';const response=await chrome.runtime.sendMessage({type:'SYNC_SELECTED',keys});button.disabled=false;button.textContent='אישור וסנכרון המסומנים';if(!response?.ok)return toast(response?.error||'הסנכרון נכשל');toast(`${response.count} חשבונות סונכרנו`);await load()};
function toast(text){const el=$('#toast');el.textContent=text;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4500)}
function renderLoansTable(){const shown=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter),allRows=[],seen=new Set();for(const a of shown){const ownerKey=`${a.branch}-${a.accountNumber}`;for(const l of a.loans||[]){if(!l||(Number(l.balance)<=0&&Number(l.nextPayment)<=0)||l.accountKey&&l.accountKey!==ownerKey)continue;const fingerprint=[a.source,ownerKey,l.type,l.originalPrincipal,l.balance,l.endDate,l.nextPayment,l.nextPaymentDate,l.interest].join('|');if(seen.has(fingerprint))continue;seen.add(fingerprint);allRows.push({account:a,loan:l})}}allRows.sort((x,y)=>String(x.account.sourceLabel).localeCompare(String(y.account.sourceLabel),'he')||String(x.account.branch).localeCompare(String(y.account.branch),'he')||String(x.account.accountNumber).localeCompare(String(y.account.accountNumber),'he')||Number(y.loan.balance||0)-Number(x.loan.balance||0));const box=$('#allLoans'),hasMortgages=allRows.some(r=>r.loan.isMortgage),rows=hideMortgages?allRows.filter(r=>!r.loan.isMortgage):allRows,toggle=hasMortgages?`<button type="button" id="toggleMortgages" class="button secondary">${hideMortgages?'החזר משכנתאות':'הסר משכנתאות'}</button>`:'';if(!rows.length){box.innerHTML=`${toggle}<div class="empty">לא נמצאו הלוואות בחשבונות המוצגים.</div>`;return}const short=v=>{const s=String(v||'').replace(/\s+/g,' ').trim();return s&&s.length<=60?s:'—'},remaining=l=>{const m=String(l.installments||'').match(/(\d+)\s*\/\s*(\d+)/);if(m){const paid=Number(m[1]),total=Number(m[2]);return total>=paid?`${total-paid}/${total}`:'—'}const left=Number(l.remainingInstallments),total=Number(l.totalInstallments);
  if(Number.isFinite(left)&&left>=0&&Number.isFinite(total)&&total>0)return `${left}/${total}`;
  // ⚠ 18.08.2026 — לאומי אינו מחזיר מספר תשלומים כלל: ברשומה שלו אין installments,
  // בעוד שפועלים מחזיר "8/71". לכן העמודה הופיעה ריקה דווקא בהלוואה של לאומי.
  // כשיש תאריך התחלה, תאריך סיום ותשלום חודשי — המספר נגזר מהתאריכים, ומסומן ב-~
  // כדי שלא ייקרא כנתון שהבנק מסר.
  const loanMonths=(from,to)=>{const part=v=>{const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m)return null;const y=Number(m[3]);return{y:y<100?2000+y:y,m:Number(m[2])}};
    const a2=part(from),b2=part(to);return a2&&b2?(b2.y-a2.y)*12+(b2.m-a2.m):null};
  const allMonths=loanMonths(l.startDate,l.endDate),leftMonths=loanMonths(l.nextPaymentDate,l.endDate);
  if(Number.isFinite(allMonths)&&allMonths>0&&Number.isFinite(leftMonths)&&leftMonths>=0)return `~${leftMonths+1}/${allMonths+1}`;
  return '—'};const monthly=rows.reduce((sum,row)=>sum+(Number(row.loan.nextPayment)||0),0);box.innerHTML=`${toggle}<div class="loans-table-wrap"><table class="loans-table"><thead><tr><th>בנק וחשבון</th><th>יתרה</th><th>תשלומים שנותרו</th><th>תשלום קרוב</th><th>תשלום סופי</th><th>ריבית</th><th>החזר קרוב</th></tr></thead><tbody>${rows.map(({account:a,loan:l})=>`<tr><td><b>${esc(a.sourceLabel||'בנק')}</b> · ${esc(a.branch)}-${esc(a.accountNumber)} ${l.isMortgage?'<span class="mortgage-tag">משכנתא</span>':''}</td><td>${l.balance==null?'—':money(l.balance)}</td><td dir="ltr">${esc(remaining(l))}</td><td>${esc(short(l.nextPaymentDate))}</td><td>${esc(short(l.endDate))}</td><td>${esc(short(l.interest))}</td><td><b>${l.nextPayment==null?'—':money(l.nextPayment)}</b></td></tr>`).join('')}</tbody></table></div><div class="loans-total"><span>סה״כ החזר חודשי</span><strong>${money(monthly)}</strong></div>`}


// ── טבעת התקדמות הסנכרון ─────────────────────────────────────────────────
// האחוז מגיע מ-syncProgress שנכתב ב-background (שלב מתוך סך). הערכת הזמן נגזרת
// מקצב השלבים בפועל — זמן שחלף חלקי שלבים שהושלמו — ולא ממספר קבוע כלשהו.
// אין נתוני שלבים (בנק שטרם חוברו לו) → טבעת מסתובבת בלי אחוז, במקום מספר מומצא.
var progressTicker=null,lastProgress=null;
function etaText(p){
  if(!p||!p.done||!p.startedAt)return '';
  const elapsed=Date.now()-p.startedAt;
  if(elapsed<4000)return 'מחשב זמן…';
  const remain=Math.round((elapsed/p.done)*(p.total-p.done)/1000);
  if(remain<=0)return 'עוד רגע';
  if(remain<60)return `נותרו כ-${remain} שנ׳`;
  return `נותרו כ-${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')} דק׳`;
}
function progressLine(p){return `שלב ${p.done} מתוך ${p.total} · ${etaText(p)}`}
document.addEventListener('click',async e=>{const b=e.target.closest('#stopSync');if(!b)return;
  b.disabled=true;b.textContent='עוצר…';
  try{await chrome.runtime.sendMessage({type:'ABORT_SYNC'});toast('בקשת העצירה נשלחה — הסנכרון ייעצר בסוף הצעד הנוכחי')}
  catch(err){b.disabled=false;b.textContent='עצור סנכרון';toast(err?.message||'בקשת העצירה לא נשלחה')}});
function renderSyncProgress(p,status=''){
  const banner=document.getElementById('syncBanner');
  if(!banner)return;
  document.getElementById('syncRing')?.remove();
  lastProgress=p&&p.total?p:null;
  const busy=/קורא|מסנכרן|מזהה|מחפש|בודק|טוען|מתבצע|שומר|שולף|מוריד|פותח|מעדכן/.test(String(status||''));
  if(!lastProgress&&!busy){if(progressTicker){clearInterval(progressTicker);progressTicker=null}return}
  const C=163.36,pct=lastProgress?Math.round(lastProgress.done/lastProgress.total*100):null;
  const wrap=document.createElement('div');
  wrap.id='syncRing';wrap.className='sync-ring';
  const action=lastProgress&&lastProgress.action?lastProgress.action:'מסתנכרן';
  wrap.innerHTML=`<div class="ring-wrap"><svg viewBox="0 0 60 60" class="${pct==null?'spin':''}" aria-hidden="true">`+
    `<circle cx="30" cy="30" r="26" class="ring-track"></circle>`+
    `<circle cx="30" cy="30" r="26" class="ring-fill" stroke-dasharray="${pct==null?`${C*0.25} ${C}`:C}" stroke-dashoffset="${pct==null?0:C*(1-pct/100)}"></circle>`+
    `</svg><div class="ring-center"><strong>${pct==null?'':pct+'%'}</strong>`+
    `<span>${esc(action)}</span></div></div>`+
    `<div class="sync-ring-text"><small id="syncEta">${lastProgress?progressLine(lastProgress):'בתהליך'}</small>`+
    // ⚠ „עצור סנכרון" ליד הגלגל, לבקשת טל. עצירה בין צעד לצעד — מה שנשמר נשאר.
    `<button type="button" class="button secondary" id="stopSync">עצור סנכרון</button></div>`;
  banner.appendChild(wrap);
  if(progressTicker)clearInterval(progressTicker);
  progressTicker=setInterval(()=>{
    const el=document.getElementById('syncEta');
    if(!el||!lastProgress){clearInterval(progressTicker);progressTicker=null;return}
    el.textContent=progressLine(lastProgress);
  },1000);
}
const syncRingStyles=document.createElement('style');
syncRingStyles.textContent='.sync-ring{display:flex;align-items:center;gap:14px;margin-top:10px}'+
'.sync-ring .ring-wrap{position:relative;width:118px;height:118px;flex:0 0 auto}'+
'.sync-ring svg{position:absolute;inset:0;width:118px;height:118px;transform:rotate(-90deg)}'+
'.sync-ring svg.spin{animation:syncSpin 1.1s linear infinite}'+
'@keyframes syncSpin{to{transform:rotate(270deg)}}'+
'.sync-ring .ring-track{fill:none;stroke:currentColor;opacity:.16;stroke-width:5}'+
'.sync-ring .ring-fill{fill:none;stroke:currentColor;stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .5s ease}'+
'.sync-ring .ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 17px;gap:3px}'+
'.sync-ring .ring-center strong{font-size:1.25rem;font-weight:800;line-height:1}'+
'.sync-ring .ring-center span{font-size:.63rem;font-weight:700;line-height:1.2;opacity:.85}'+
'.sync-ring-text small{opacity:.75}';
document.head.appendChild(syncRingStyles);


// ── סטטוס נפרד לכל בנק ──────────────────────────────────────────────────
// הבעיה שזה פותר: syncStatus הוא מחרוזת גלובלית אחת לכל היעדים. כשפתוחים שמונה
// בנקים, הודעה של אחד נכתבת מעל השני, וב-17.08.2026 זה הסתיר כישלון של פועלים
// פרטי במשך שני סבבי אבחון שלמים.
// למה בצד הדשבורד ולא ב-background: ההודעות כבר נושאות את שם הבנק, ולכן אפשר
// לשייך אותן בקריאה — בלי לגעת בעשרות נקודות הכתיבה שבתוך זרימות הסנכרון.
var statusBySource={},bankDiagnostics={};
function bankBase(name){return String(name).split(' — ')[0]}
// כמה זמן הודעת סנכרון נחשבת „חיה". מעבר לזה היא היסטוריה, ולא מצב.
const LIVE_STATUS_MS=3*60*1000;
function agoText(ms){
  const m=Math.round(ms/60000);
  if(m<60)return `לפני ${m} דק׳`;
  const h=Math.round(m/60);
  if(h<24)return `לפני ${h} שע׳`;
  const d=Math.round(h/24);
  return d===1?'אתמול':`לפני ${d} ימים`;
}
function attributeStatus(value){
  const v=String(value||'');if(!v)return null;
  let best=null;
  for(const b of BANK_BUTTONS){
    const full=b.name,base=bankBase(b.name);
    if(v.includes(full)||v.includes(base)){
      // השם הארוך ביותר מנצח: „פועלים פרטי" גובר על „פועלים"
      if(!best||bankBase(b.name).length>bankBase(best.name).length)best=b;
    }
  }
  return best?best.id:null;
}
function bankLine(b){
  const diag=bankDiagnostics[b.id];
  if(diag)return diag;   // אבחון גובר: זו השורה שהמשתמש מצלם ושולח
  // ⚠ 18.08.2026: הסטטוס נשמר בלי גיל, ולכן אריחים הציגו „ממתין להתחברות אל
  // פועלים עסקי" ו„קורא משכנתאות חשבון 1" שעות אחרי שהסנכרון נגמר — הודעת ביניים
  // שהוצגה כמצב נוכחי. **הודעת ביניים שהתיישנה אינה מייצגת דבר, ותוצאה כן.**
  const s=statusBySource[b.id];
  if(s&&s.text){
    const base=bankBase(b.name),t=(s.text.split(base+':').pop()||'').trim()||s.text;
    const age=Date.now()-(Number(s.at)||0);
    if(age<LIVE_STATUS_MS)return t;                                   // חי — כלשונו
    if(/הסתיים|סונכרן|עודכן|שגיאה|נכשל|דולג/.test(t))return `${t} · ${agoText(age)}`;  // תוצאה — עם גיל
  }
  // „סנכרון פעיל" נקרא כאילו סנכרון רץ ברגע זה, והכוונה הייתה „נתמך". המלל אומר
  // עכשיו מה תעשה הלחיצה, ולא מה מצב המערכת.
  return b.ready?'לחיצה תפתח מסך כניסה':'טרם נתמך';
}
// ⚠ הכפתור הגדול נקרא „סנכרון הכול" אך מסנכרן **רק פועלים** — `chosenSources`
// מחזיר business/private בלבד. המלל אומר עכשיו את מה שקורה בפועל.
function syncAllLabel(){
  return syncScope==='both'?'התחברות וסנכרון — פועלים עסקי ופרטי'
    :syncScope==='private'?'התחברות וסנכרון — פועלים פרטי'
    :'התחברות וסנכרון — פועלים עסקי';
}
async function rememberBankStatus(value,stored){
  const id=attributeStatus(value);
  if(!id)return;
  const prev=(stored||{})[id];
  if(prev&&prev.text===String(value))return;   // בלי כתיבה מיותרת — כל כתיבה מפעילה load מחדש
  const next={...(stored||{}),[id]:{text:String(value),at:Date.now()}};
  statusBySource=next;
  await chrome.storage.local.set({statusBySource:next});
}


// ── מחיקת היסטוריית כרטיס ────────────────────────────────────────────────
// לבקשת טל 18.08.2026: כרטיס שנטען בטעות לא היה ניתן להסרה.
// ⚠ פעולה הרסנית, ולכן אישור מפורש עם מספר הכרטיס בגוף השאלה.
document.addEventListener('click',async e=>{
  const b=e.target.closest('.delete-card-history');
  if(!b||!b.dataset.suffix)return;
  e.preventDefault();e.stopPropagation();
  const suffix=b.dataset.suffix;
  if(!confirm(`להסיר את כרטיס ${suffix} מהתצוגה?\n\nההיסטוריה השמורה תימחק, והכרטיס לא יחזור בסנכרון הבא.\nהנתונים אצל חברת האשראי אינם נמחקים — אפשר לשחזר מ"כרטיסים שהוסרו".`))return;
  const original=b.textContent;b.disabled=true;b.textContent='מוחק…';
  try{
    const r=await chrome.runtime.sendMessage({type:'CARD_HISTORY_DELETE_CARD',suffix});
    if(!r?.ok)throw Error(r?.error||'המחיקה נכשלה');
    toast(`כרטיס ${suffix} הוסר · ${r.removed} חודשי היסטוריה · ${r.cards||0} הופעות בחשבונות`);
    await load();
  }catch(err){toast(`מחיקת כרטיס ${suffix} נכשלה: ${err.message}`)}
  finally{b.disabled=false;b.textContent=original}
});


// ── כרטיסים שהוסתרו ──────────────────────────────────────────────────────
// מחיקה מקומית אינה מוחקת את הכרטיס אצל חברת האשראי, ולכן סנכרון מחזיר אותו.
// הרשימה הזו היא מה שמונע את החזרה — והיא הפיכה, כי הסתרה בטעות קורית.
var hiddenCards=[],removedCardsOpen=false;
function cardHidden(c){
  const d=String((c&&c.suffix)||c||'').replace(/\D/g,'');
  return !!d&&hiddenCards.some(h=>h&&(d.endsWith(h)||h.endsWith(d)));
}
function renderHiddenCards(){
  const box=document.querySelector('#allCards');
  if(!box)return;
  document.getElementById('removedCardsBox')?.remove();
  if(!hiddenCards.length)return;
  const open=removedCardsOpen;
  const wrap=document.createElement('section');
  wrap.id='removedCardsBox';
  wrap.className='panel';
  wrap.style.cssText='margin-top:14px';
  wrap.innerHTML=`<button type="button" id="removedCardsToggle" class="button secondary">`
    +`כרטיסים שהוסרו · ${hiddenCards.length} ${open?'▲':'▼'}</button>`
    +(open?`<p style="margin:10px 0 6px">הכרטיסים האלה הוסרו מהתצוגה ואינם חוזרים בסנכרון. `
      +`הנתונים אצל חברת האשראי לא נמחקו — שחזור יחזיר אותם בסנכרון הבא.</p>`
      +`<div class="removed-cards">${hiddenCards.map(h=>`<div class="removed-card-row" style="display:flex;align-items:center;gap:10px;padding:6px 0">`
        +`<span class="source-badge">כרטיס ${esc(h)}</span>`
        +`<button type="button" class="button secondary restore-card" data-suffix="${esc(h)}">שחזר כרטיס</button>`
      +`</div>`).join('')}</div>`:'');
  box.appendChild(wrap);
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('.restore-card');
  if(!b||!b.dataset.suffix)return;
  e.preventDefault();e.stopPropagation();
  const suffix=b.dataset.suffix;
  if(!confirm(`לשחזר את כרטיס ${suffix}? הוא יופיע שוב אחרי הסנכרון הבא.`))return;
  const st=await chrome.storage.local.get({hiddenCards:[]});
  await chrome.storage.local.set({hiddenCards:(st.hiddenCards||[]).filter(h=>String(h)!==String(suffix))});
  toast(`כרטיס ${suffix} יוצג שוב אחרי הסנכרון הבא`);
  await load();
});

document.addEventListener('click',e=>{
  if(!e.target.closest('#removedCardsToggle'))return;
  e.preventDefault();
  removedCardsOpen=!removedCardsOpen;
  renderHiddenCards();
});
