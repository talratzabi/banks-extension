const $=s=>document.querySelector(s);
let accounts=[],discovered=[],selectedKeys=[],syncScope='business',accountFilter='both',accountKinds={},privateOwnerName='',hideMortgages=false,isracardUnassigned=[],calUnassigned=[],maxUnassigned=[],isracardLastCards=[],calLastCards=[],maxLastCards=[],cardHistoryStats={},cardNewMarks={},chequeInfo={},chequePayers={},chequePayerDoubt={},chequePayerMeta={},chequePayerGuess={},chequePayerBank={},chequeHashes={},chequeAccounts={},chequeLedger=[],chequePayerSource={},activeView='accounts',loadEpoch=0,loadTimer=null,monthlyCardMonths=null,monthlyPick='';
let movementSearchTimer=null,movementSearchEpoch=0;
// ⚠ סט ריק פירושו **כל המקורות**, ולא "אף מקור". כך פתיחה ראשונה של הלשונית
// מציגה הכול בלי לדרוש סימון, וגם מקור חדש שנוסף אחרי סנכרון נכנס מעצמו.
const movementSourcePick=new Set();let movementSourceSig='',movementBreakdown='none',movementLastMatched=[],movementLastTerms=[];
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
  {id:'max',name:'MAX',logo:'https://www.max.co.il/favicon.ico',url:'https://www.max.co.il/',ready:true,max:true},
  // ⚠⚠ 27.08.2026 — טל: „יש לי הלוואה ב-BTB, זה חשבון הלוואה ללא עו״ש."
  // ⚠ `ready:false` **במכוון**: הלחיצה פותחת את מסך הכניסה ומודיעה שהחיבור
  // יתווסף — זה המסלול הגנרי שכבר קיים. **אין עדיין מתאם, והאריח לא יטען
  // שיש.** ה-DOM של BTB לא נמדד מעולם, ואחרי היום הזה לא נכתב סלקטור לפני מדידה.
  // ⚠ ה-favicon נבדק בפועל: `btbisrael.co.il` **נכשל**, ו-`borrowers.` עונה 256×256.
  {id:'btb',name:'BTB — הלוואה',logo:'https://borrowers.btbisrael.co.il/favicon.ico',
   url:'https://auth.btbisrael.co.il/auth/signin/id?appType=borrower&callbackUrl=https%3A%2F%2Fborrowers.btbisrael.co.il%2Fdashboard',ready:true,btb:true}
];
const productStyles=document.createElement('style');
productStyles.textContent='.wrap{max-width:1800px!important}.account{display:block!important;overflow:hidden!important;padding:0!important}.account-balance-row{display:grid;grid-template-columns:minmax(0,1.8fr) repeat(4,minmax(0,.82fr)) minmax(0,.9fr) minmax(0,.95fr) 74px;align-items:stretch;gap:0;width:100%;min-width:0}.account-cell{min-width:0;min-height:86px;padding:12px 8px;border-left:1px solid #e7ebf2;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.account-cell:last-child{border-left:0}.account-cell>span,.account-cell>small{display:block;color:#6d788b;font-size:11px;line-height:1.25;margin-bottom:5px;white-space:normal}.account-cell strong{font-size:clamp(12px,1.05vw,16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-identity h3{margin:0 0 5px;font-size:clamp(13px,1.1vw,16px);white-space:normal;overflow-wrap:anywhere}.account-identity p{margin:0 0 6px;font-size:12px}.account-identity select{font-size:11px;max-width:100%}.negative{color:#b53737}.balance-link{width:100%;height:100%}.account-actions{flex-direction:row!important;align-items:center;justify-content:center;gap:4px}.refresh-row{border:0;background:#eef4ff;color:#173b86;border-radius:999px;width:28px;height:28px;font-size:15px;font-weight:800;cursor:pointer;margin:auto 4px auto auto}.refresh-row:hover{background:#dce8ff}.remove-row{border:0;background:#f1f3f7;border-radius:999px;width:28px;height:28px;font-size:18px;cursor:pointer;margin:auto}.accounts-total{margin-top:14px}.accounts-total h3{margin:0 0 14px}.accounts-total-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.accounts-total-grid div{background:#eef4ff;border-radius:13px;padding:14px}.accounts-total-grid span,.accounts-total-grid strong{display:block}.accounts-total-grid span{font-size:12px;color:#63718a;margin-bottom:6px}.accounts-total-grid strong{font-size:19px;color:#173b86}@media(max-width:1050px){.account-balance-row{grid-template-columns:minmax(0,1.6fr) repeat(4,minmax(0,.76fr)) minmax(0,.82fr) minmax(0,.88fr) 34px}.account-cell{padding:10px 5px}.account-cell strong{font-size:12px}.account-cell>span{font-size:10px}}@media(max-width:760px){.account{overflow-x:auto!important}.account-balance-row{min-width:850px}.accounts-total-grid{grid-template-columns:repeat(2,1fr)}}.details{margin-top:18px}.details summary{font-weight:800;cursor:pointer}.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:10px}.detail-card{border:1px solid #e3e8f1;border-radius:14px;padding:14px}.detail-card h4{margin:0 0 8px}.detail-card p{margin:5px 0}.mini-table{width:100%;font-size:12px;margin-top:10px}.mini-table td{padding:5px;border-top:1px solid #edf0f4}';
document.head.appendChild(productStyles);
const statementStyles=document.createElement('style');statementStyles.textContent='.card-month-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 16px}.card-month-bar select{padding:8px 12px;border-radius:10px;border:1px solid #dfe5ef;font:inherit;font-weight:700}.card-statement{margin-top:12px;overflow:auto}.statement-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.statement-head strong{font-size:20px;white-space:nowrap}.card-statement .mini-table{min-width:620px;border-collapse:collapse}.card-statement .mini-table th{text-align:right;padding:8px 5px;color:#6d788b;border-bottom:1px solid #dfe5ef}.card-statement .mini-table td:last-child,.card-statement .mini-table th:last-child{text-align:center}';document.head.appendChild(statementStyles);
const statusStyles=document.createElement('style');statusStyles.textContent='.sync-detail{display:block;overflow-wrap:anywhere;word-break:break-word;max-height:5.5em;overflow-y:auto}#syncBanner,#syncStatus{max-width:100%;overflow:hidden}.panel{overflow-wrap:anywhere}';document.head.appendChild(statusStyles);
const scopeStyles=document.createElement('style');scopeStyles.textContent='.scope-panel{margin:20px 0}.auto-sync{display:flex;align-items:center;gap:10px;background:#eef4ff;border:1px solid #d4e2ff;border-radius:14px;padding:12px 16px;margin:12px 0 4px;cursor:pointer;font-weight:800;color:#173b86;width:max-content;max-width:100%}.auto-sync small{display:block;font-weight:600;color:#5b6b8c;margin-top:3px}.auto-sync input{width:18px;height:18px;cursor:pointer}.scope-choice{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.scope-choice label{border:1px solid #dfe5ef;border-radius:14px;padding:12px 18px;cursor:pointer}.scope-choice label:has(input:checked){background:#eef4ff;border-color:#3157d5;color:#18357c;font-weight:800}.source-badge{display:inline-block;background:#eef4ff;color:#3157d5;border-radius:999px;padding:3px 8px;margin-left:6px;font-size:12px}.bank-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.bank-button{border:1px solid #dfe5ef;background:#fff;border-radius:16px;padding:15px;display:flex;align-items:center;gap:12px;text-align:right;cursor:pointer}.bank-button:hover{border-color:#3157d5;box-shadow:0 8px 24px #24385d18}.bank-button img{width:36px;height:36px;object-fit:contain}.bank-button b,.bank-button small{display:block}.bank-button small{color:#6d788b;margin-top:4px}.bank-button.ready small{color:#087f5b;font-weight:700}';document.head.appendChild(scopeStyles);
const loansTabStyles=document.createElement('style');loansTabStyles.textContent='.dashboard-tabs{display:flex;gap:8px;margin:28px 0 18px;padding:6px;background:#eef2f7;border-radius:16px;width:max-content}.dashboard-tab{border:0;background:transparent;border-radius:11px;padding:11px 20px;font-weight:800;cursor:pointer;color:#657087}.dashboard-tab.active{background:#fff;color:#173b86;box-shadow:0 3px 12px #22386118}.loans-table-wrap{overflow:auto}.loans-table{width:100%;border-collapse:collapse;min-width:850px}.loans-table th,.loans-table td{text-align:right;padding:13px 10px;border-bottom:1px solid #e5eaf1}.loans-table th{color:#68758a;font-size:12px}.loans-total{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:18px;border-radius:15px;background:#eef4ff;color:#173b86;font-size:18px}.loans-total strong{font-size:24px}.hidden{display:none!important}';document.head.appendChild(loansTabStyles);
const mortgageStyles=document.createElement('style');mortgageStyles.textContent='.mortgage-tag{display:inline-block;margin-right:6px;padding:3px 8px;border-radius:999px;background:#fff0d8;color:#8a5700;font-size:11px;font-weight:800}#toggleMortgages{margin:0 0 14px}';document.head.appendChild(mortgageStyles);
const balanceLinkStyles=document.createElement('style');balanceLinkStyles.textContent='.balance-link{border:0;background:transparent;font:inherit;cursor:pointer;border-radius:12px;padding:8px;text-align:left}.balance-link:hover{background:#eef4ff}.balance-link strong{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}.balance-link:focus-visible{outline:2px solid #3157d5}.account-modal{position:fixed;inset:0;background:#10213a99;z-index:1000;display:grid;place-items:center;padding:24px}.account-modal-card{background:#fff;border-radius:22px;width:min(1100px,96vw);max-height:88vh;overflow:auto;padding:24px;box-shadow:0 24px 70px #07152c55}.account-modal-head{display:flex;justify-content:space-between;align-items:center;gap:20px}.modal-close{border:0;background:#eef2f7;border-radius:999px;width:38px;height:38px;font-size:22px;cursor:pointer}.account-modal table{width:100%;border-collapse:collapse;min-width:720px}.account-modal th,.account-modal td{text-align:right;padding:10px;border-bottom:1px solid #e5eaf1}.account-modal-table{overflow:auto}';document.head.appendChild(balanceLinkStyles);
const movementSearchStyles=document.createElement('style');movementSearchStyles.textContent='.movement-search-fields{display:grid;grid-template-columns:minmax(220px,2fr) repeat(5,minmax(135px,1fr)) auto;gap:12px;align-items:end;margin:16px 0 22px}.movement-search-fields label{display:grid;gap:6px;color:#68758a;font-size:12px;font-weight:800}.movement-search-fields select{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fff;color:#14213d}.movement-search-fields select:focus{outline:2px solid #3157d5;border-color:transparent}.movement-search-fields input{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fff;color:#14213d}.movement-search-fields input:focus{outline:2px solid #3157d5;border-color:transparent}.movement-search-table{overflow:auto}.movement-search-table table{width:100%;border-collapse:collapse;min-width:850px}.movement-search-table th,.movement-search-table td{text-align:right;padding:11px 9px;border-bottom:1px solid #e5eaf1}.movement-search-table th{color:#68758a;font-size:12px}.movement-search-summary{display:flex;justify-content:space-between;gap:15px;background:#eef4ff;color:#173b86;border-radius:13px;padding:13px 16px;margin-bottom:12px;font-weight:800}.movement-search-total{display:flex;flex-wrap:wrap;justify-content:space-between;gap:15px;background:#f4f7fd;color:#173b86;border:1px solid #d9e3f7;border-radius:13px;padding:13px 16px;margin-top:12px;font-weight:800}.movement-search-total .mst-debit{color:#a3253f}.movement-search-total .mst-credit{color:#1c6b45}.movement-breakdown-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;color:#68758a;font-size:12px;font-weight:800}.movement-breakdown-bar button{border:1px solid #dfe5ef;background:#f4f7fd;color:#173b86;border-radius:9px;padding:6px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.movement-breakdown-bar button:hover{background:#e6eefc;border-color:#c9d6ef}.movement-breakdown-bar button.on{background:#3157d5;border-color:#3157d5;color:#fff}.movement-breakdown-table{margin-top:10px;overflow:auto}.movement-breakdown-table table{width:100%;border-collapse:collapse;min-width:540px}.movement-breakdown-table th,.movement-breakdown-table td{text-align:right;padding:9px;border-bottom:1px solid #e5eaf1;font-size:13px}.movement-breakdown-table thead th{color:#68758a;font-size:12px;font-weight:800}.movement-breakdown-table .bd-total th{background:#f4f7fd;color:#173b86;border-bottom:none}.movement-breakdown-table .bd-month{vertical-align:top;background:#fbfcfe;color:#14213d;font-weight:800;white-space:nowrap;border-inline-start:3px solid #dfe5ef}.movement-breakdown-table .bd-debit{color:#a3253f}.movement-breakdown-table .bd-credit{color:#1c6b45}.sum-from-rows{display:inline-block;margin-inline-start:7px;background:#fff4e2;color:#8a5a12;border:1px solid #f0dcb8;border-radius:7px;padding:1px 7px;font-size:10px;font-weight:800;vertical-align:middle}.payer-tag{display:inline-block;margin-inline-start:7px;background:#e8f3ec;color:#1c6b45;border:1px solid #cfe6d9;border-radius:7px;padding:2px 9px;font:inherit;font-size:11px;font-weight:800;vertical-align:middle;cursor:pointer}.payer-tag:hover{background:#d8ecdf}.payer-tag small{opacity:.7;font-weight:700}.payer-review select{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fff;color:#14213d}.acct-thumb{cursor:zoom-in;display:block;width:100%;max-width:260px;border:1px solid #e5eaf1;border-radius:8px;background:#fff}.acct-table .acct-pic{width:170px}.acct-table .acct-pic .acct-thumb{max-width:160px}.acct-stuck{margin-top:18px;border-top:1px solid #e5eaf1;padding-top:14px}.acct-stuck h3{margin:0 0 4px;font-size:15px;color:#a3253f}.acct-stuck-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:10px}.acct-card{display:grid;gap:8px;border:1px solid #e5eaf1;border-radius:12px;padding:10px;background:#fbfcfe}.acct-card input{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:10px;padding:9px 11px;font:inherit;direction:ltr;text-align:left}.acct-card .acct-one{border:1px solid #c9d6ef;background:#eef4ff;color:#173b86;border-radius:9px;padding:7px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.ledger-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}.ledger-sum div{background:#f4f7fd;border:1px solid #dfe5ef;border-radius:12px;padding:11px 13px}.ledger-sum small{display:block;color:#68758a;font-size:11px;font-weight:800;margin-bottom:3px}.ledger-sum strong{font-size:20px;color:#14213d;font-variant-numeric:tabular-nums}.was-wrong{color:#a3253f;text-decoration:line-through}.acct-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0}.acct-bar button{border:1px solid #3157d5;background:#3157d5;color:#fff;border-radius:10px;padding:9px 16px;font:inherit;font-weight:800;cursor:pointer}.acct-bar button.secondary{background:#eef4ff;color:#173b86;border-color:#c9d6ef}.acct-bar button[disabled]{opacity:.6;cursor:default}.acct-table{overflow:auto;margin-top:10px}.acct-table table{width:100%;border-collapse:collapse;min-width:620px}.acct-table th,.acct-table td{text-align:right;padding:9px;border-bottom:1px solid #e5eaf1;font-size:13px}.acct-table thead th{color:#68758a;font-size:12px}.acct-table td b{font-variant-numeric:tabular-nums}.acct-table .acct-name{border:1px solid #c9d6ef;background:#eef4ff;color:#173b86;border-radius:9px;padding:6px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.payer-review .pr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;max-height:260px;overflow:auto}.payer-review .pr-grid label{display:grid;gap:6px;border:1px solid #e5eaf1;border-radius:10px;padding:8px;cursor:pointer;background:#fbfcfe}.payer-review .pr-grid label:hover{border-color:#c9d6ef}.payer-review .pr-grid img{width:100%;border-radius:6px;border:1px solid #eef1f6}.payer-review .pr-apply{background:#eef4ff;border:1px solid #c9d6ef;color:#173b86;border-radius:10px;padding:9px 12px;font-size:13px;font-weight:800}.payer-tag.stamped{border-color:#1c6b45}.payer-guess{display:inline-block;margin-inline-start:7px;background:#fdecec;color:#a3253f;border:1px dashed #e6a9b4;border-radius:7px;padding:2px 9px;font:inherit;font-size:11px;font-weight:800;vertical-align:middle;cursor:pointer}.payer-guess:hover{background:#fbdcdf;border-color:#d98a99}.payer-review{display:grid;gap:12px}.payer-review img{width:100%;max-width:720px;border:1px solid #e5eaf1;border-radius:10px;display:block}.payer-review .pr-cands{display:flex;flex-wrap:wrap;gap:8px}.payer-review .pr-cands button{border:1px solid #c9d6ef;background:#eef4ff;color:#173b86;border-radius:9px;padding:6px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.payer-review input{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fff;color:#14213d}.payer-review .pr-actions{display:flex;gap:8px;flex-wrap:wrap}.payer-review .pr-actions button{border-radius:10px;padding:9px 16px;font:inherit;font-weight:800;cursor:pointer;border:1px solid #dfe5ef;background:#f4f7fd;color:#173b86}.payer-review .pr-actions .pr-save{background:#3157d5;border-color:#3157d5;color:#fff}.payer-review .pr-count{color:#68758a;font-size:12px;font-weight:800}.payer-doubt{display:inline-block;margin-inline-start:7px;background:#fff4e2;color:#8a5a12;border:1px solid #f0dcb8;border-radius:7px;padding:2px 9px;font:inherit;font-size:11px;font-weight:800;vertical-align:middle;cursor:pointer}.payer-doubt:hover{background:#ffe9c9}.cheque-note{display:inline-block;margin-inline-start:7px;color:#4a5568;font-size:12px;font-weight:600;background:#f4f7fd;border-radius:7px;padding:1px 8px;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}.cheque-crop{margin:12px 0 0}.cheque-crop figcaption{font-weight:800;margin-bottom:6px;color:#6d788b;font-size:12px}.cheque-crop img{width:100%;max-width:640px;border:1px solid #e5eaf1;border-radius:10px;display:block}.cheque-claim{margin:10px 0 0;color:#8a5a12;background:#fff4e2;border:1px solid #f0dcb8;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6}.cheque-note-block{margin:10px 0 0;color:#14213d;font-size:13px;line-height:1.6;background:#f4f7fd;border-radius:10px;padding:10px 12px}.cheque-view{margin-inline-start:7px;border:1px solid #c9d6ef;background:#eef4ff;color:#173b86;border-radius:8px;padding:2px 9px;font:inherit;font-size:11px;font-weight:800;cursor:pointer;vertical-align:middle}.cheque-view:hover{background:#dfe9fb}.cheque-view[disabled]{opacity:.6;cursor:default}.new-tag{display:inline-block;margin-inline-start:7px;background:#1c6b45;color:#fff;border-radius:7px;padding:1px 7px;font-size:10px;font-weight:800;vertical-align:middle;letter-spacing:.3px}.movement-search-terms{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-4px 0 12px;color:#68758a;font-size:12px;font-weight:800}.movement-search-terms .mterm{background:#eef4ff;color:#173b86;border-radius:8px;padding:2px 10px}.movement-search-terms .mterm b{font-variant-numeric:tabular-nums}.field-hint{color:#8a93a5;font-weight:700;font-size:11px}.movement-search-note{margin-top:8px;color:#68758a;font-size:12px;font-weight:700}.movement-source-pick{border:1px solid #dfe5ef;border-radius:12px;background:#fff;margin:-6px 0 18px}.movement-source-pick>summary{cursor:pointer;padding:11px 14px;font-size:13px;font-weight:800;color:#173b86}.movement-source-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:8px;padding:0 14px 14px;max-height:330px;overflow:auto}.movement-source-list .msrc-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;background:#fff;padding:2px 0 9px;z-index:1}.movement-source-list .msrc-actions button{border:1px solid #dfe5ef;background:#f4f7fd;color:#173b86;border-radius:9px;padding:6px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.movement-source-list .msrc-actions button:hover{background:#e6eefc;border-color:#c9d6ef}.msrc-item{display:flex;align-items:center;gap:10px;min-width:0;border:1px solid #e5eaf1;border-radius:10px;padding:9px 11px;background:#fbfcfe;cursor:pointer}.msrc-item:hover{border-color:#c9d6ef;background:#f4f7fd}.msrc-item.on{border-color:#3157d5;background:#eef4ff}.msrc-item input{flex:none;width:16px;height:16px;accent-color:#3157d5;margin:0}.msrc-body{display:grid;gap:2px;min-width:0}.msrc-name{font-size:13px;font-weight:800;color:#14213d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.msrc-tag{color:#68758a;font-size:11px;font-weight:700}.movement-source-list .msrc-empty{grid-column:1/-1;color:#68758a;font-size:12px;font-weight:700}@media(max-width:1050px){.movement-search-fields{grid-template-columns:repeat(2,minmax(150px,1fr))}}';document.head.appendChild(movementSearchStyles);
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
  monthlyCardMonths=null; // טעינה מחדש = ייתכנו חודשי כרטיסים חדשים; הלשונית תקרא שוב.
  document.querySelector('.sources')?.classList.add('hidden');
  const data=await chrome.storage.local.get({viewSince:'',viewSinceInit:false,collectSince:'',accounts:[],discoveredAccounts:[],selectedAccountKeys:null,syncScope:'business',accountFilter:'both',accountKinds:{},privateOwnerName:'',hideMortgages:false,isracardUnassigned:[],calUnassigned:[],maxUnassigned:[],isracardLastCards:[],calLastCards:[],maxLastCards:[],cardNewMarks:{},chequeInfo:{},chequePayers:{},chequePayerDoubt:{},chequePayerMeta:{},chequePayerGuess:{},chequePayerBank:{},chequeHashes:{},chequeAccounts:{},chequeLedger:[],chequePayerSource:{},fibiConnectionNames:{},syncStatus:'טרם בוצע',syncProgress:null,statusBySource:{},bankDiagnostics:{},hiddenCards:[],maslaka:null,realEstate:[],balanceAssets:[],balanceLiabs:[],loanKinds:{}});
  maslaka=data.maslaka||null;loanKinds=data.loanKinds||{};realEstate=Array.isArray(data.realEstate)?data.realEstate:[];balanceAssets=Array.isArray(data.balanceAssets)?data.balanceAssets:[];balanceLiabs=Array.isArray(data.balanceLiabs)?data.balanceLiabs:[];
  hiddenCards=(data.hiddenCards||[]).map(x=>String(x).replace(/\D/g,'')).filter(Boolean);
  // כרטיס שהוסתר אינו חוזר דרך סנכרון: הסינון כאן, לפני כל רינדור.
  data.accounts=(data.accounts||[]).map(a=>({...a,cards:(a.cards||[]).filter(c=>!cardHidden(c))}));
  for(const k of ['isracardUnassigned','calUnassigned','maxUnassigned'])data[k]=(data[k]||[]).filter(c=>!cardHidden(c));
  statusBySource=data.statusBySource||{};bankDiagnostics=data.bankDiagnostics||{};
  if(epoch!==loadEpoch)return;
  viewSince=String(data.viewSince||'');
  // ⚠ 22.08.2026 — הגירה חד-פעמית בפיצול „תחילת איסוף נתונים" לשניים.
  // עד כאן הגבול **מחק** את מה שקדם לו, ולכן הוא גם קבע מה נראה. מרגע
  // שהמחיקה בוטלה, משתמש קיים היה רואה פתאום חודשים ישנים שחשב שסילק.
  // לכן חלון התצוגה מאותחל פעם אחת לערך הגבול הישן — המסך נראה בדיוק
  // כמו קודם — ומכאן השניים עצמאיים לגמרי.
  if(!data.viewSinceInit){viewSince=String(data.collectSince||'');chrome.storage.local.set({viewSince,viewSinceInit:true})}
  accounts=data.accounts;discovered=data.discoveredAccounts;syncScope=data.syncScope;accountFilter=data.accountFilter;accountKinds=data.accountKinds;privateOwnerName=data.privateOwnerName;hideMortgages=Boolean(data.hideMortgages);isracardUnassigned=data.isracardUnassigned||[];calUnassigned=data.calUnassigned||[];maxUnassigned=data.maxUnassigned||[];isracardLastCards=data.isracardLastCards||[];calLastCards=data.calLastCards||[];maxLastCards=data.maxLastCards||[];cardNewMarks=data.cardNewMarks||{};chequeInfo=data.chequeInfo||{};chequePayers=data.chequePayers||{};chequePayerDoubt=data.chequePayerDoubt||{};chequePayerMeta=data.chequePayerMeta||{};chequePayerGuess=data.chequePayerGuess||{};chequePayerBank=data.chequePayerBank||{};chequeHashes=data.chequeHashes||{};chequeAccounts=data.chequeAccounts||{};chequeLedger=data.chequeLedger||[];chequePayerSource=data.chequePayerSource||{};setTimeout(()=>{try{refreshPayerButton()}catch(e){}},0);
  // ⚠⚠⚠ **כאן ישבה הגירה שהורידה שמות ל"הצעה", והיא הוסרה - זה היה באג.**
  // היא סימנה את עצמה כבוצעה **רק כשהיה מה להעביר**. אצל טל לא היה,
  // ולכן היא נשארה דרוכה - ואחרי שהייבוא מהנהלת החשבונות מילא שמות
  // אמיתיים, היא הורידה **גם אותם** בטעינה הבאה. בצילום שלו נראה
  // "יפרח מזל ?" באדום: שם נכון שהוצג כניחוש.
  // **הלקח: הגירה שמסמנת את עצמה רק כשהיא פועלת היא מוקש דרוך.**
  selectedKeys=(Array.isArray(data.selectedAccountKeys)?data.selectedAccountKeys:accounts.map(a=>a.selectionKey||a.id)).map(k=>String(k).includes('|')?k:`business|${k}`);
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
  // ⚠⚠ 31.08.2026 - **הסימון האוטומטי הוסר, באישור טל.** כאן ישב בלוק
  // שסימן **את כל** החשבונות שזוהו ברגע שאף אחד מהם לא היה מסומן, פעם
  // אחת לכל "טביעת אצבע" של קבוצה. בלאומי הזיהוי מחזיר את כל החשבונות
  // בבת אחת, ולכן כולם נדלקו יחד - וטל ראה חשבונות "מוכנים לסנכרון"
  // שמעולם לא ביקש.
  // **זה סתר את AGENTS §9: "אין סנכרון אוטומטי בלי בחירת חשבון של
  // המשתמש".** חשבון שהתוסף סימן בעצמו אינו בחירה של המשתמש, והוא כן
  // היה נכנס לסנכרון האוטומטי דרך selectedAccountKeys.
  // מעכשיו: חשבון שזוהה מופיע **לא מסומן**, וממתין להחלטה.
  renderScope();renderIsracardAssignments();render();renderSelection();
  // כשזיהוי מסתיים, קופצים ללשונית הבחירה כדי שלא יצטרכו לחפש אותה
  setActiveView(discovered.length&&activeView!=='selection'?'selection':activeView);
}
function renderScope(){const syncToggleState=()=>chrome.storage.local.get({autoSyncOnLogin:false}).then(x=>{for(const c of document.querySelectorAll('[id="autoSyncOnLogin"]'))c.checked=x.autoSyncOnLogin});let panel=$('#scopePanel');if(!panel){panel=document.createElement('section');panel.id='scopePanel';panel.className='panel scope-panel';document.querySelector('.sources')?.before(panel)}panel.onchange=async e=>{const c=e.target.closest('#autoSyncOnLogin');if(c)await chrome.storage.local.set({autoSyncOnLogin:c.checked})};
panel.innerHTML=`<h2>הבנקים וכרטיסי האשראי שלי</h2><div class="control-row"><label class="control" title="תחילת איסוף נתונים — הבנק יישאל מתאריך זה ואילך. מה שכבר נשמר נשאר."><span>איסוף מ־</span>${collectSinceControls()}</label><label class="control" title="הצגת נתונים — סינון תצוגה בלבד. אינו מוחק ואינו פונה לבנק."><span>תצוגה מ־</span>${viewSinceControls()}</label><label class="control" title="עסקי / פרטי — כולל כרטיסי האשראי המשויכים לכל חשבון"><span>סוג</span><select id="accountFilter" class="since-select"><option value="both">שניהם</option><option value="business">עסקי</option><option value="private">פרטי</option></select></label><label class="control control-check" title="בכל התחברות חדשה מעדכן לבד את החשבונות שכבר בחרת"><input type="checkbox" id="autoSyncOnLogin"><span>סנכרון אוטומטי</span></label></div><div class="bank-grid">${BANK_BUTTONS.map(b=>`<button class="bank-button ${b.ready?'ready':''}" data-bank="${b.id}" title="${esc(bankLine(b))}"><img src="${b.logo}" alt=""><span><b>${b.name}</b><small>${esc(bankAction(b))}</small></span></button>`).join('')}</div><h3>אילו חשבונות להציג?</h3><div class="scope-choice"><label><input type="radio" name="accountFilter" value="business" ${accountFilter==='business'?'checked':''}> עסקיים</label><label><input type="radio" name="accountFilter" value="private" ${accountFilter==='private'?'checked':''}> פרטיים</label><label><input type="radio" name="accountFilter" value="both" ${accountFilter==='both'?'checked':''}> כולם</label></div>`;panel.onclick=async e=>{const button=e.target.closest('.bank-button');if(!button)return;const bank=BANK_BUTTONS.find(b=>b.id===button.dataset.bank);if(bank)return dispatchBank(bank,button)};panel.onchange=async e=>{if(e.target.name==='accountFilter'){accountFilter=e.target.value;await chrome.storage.local.set({accountFilter});render()}}
syncToggleState();}
function cardSrc(c){const s=String(c?.issuer||'');return /MAX|מקס/i.test(s)?'max':/כאל|CAL/i.test(s)?'cal':'isracard'}
function assignSelect(c){return`<select class="isracard-account" data-suffix="${esc(c.suffix)}" data-src="${esc(cardSrc(c))}"><option value="">ממתין לשיוך — בחר חשבון</option>${accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.sourceLabel)} · ${esc(a.branch)}-${esc(a.accountNumber)}${a.nickname||a.owner?` · ${esc(a.nickname||a.owner)}`:''}</option>`).join('')}</select>`}
async function assignCard(src,suffix,accountId){const account=accounts.find(a=>a.id===accountId);if(!account)return;const lists={isracard:isracardUnassigned,cal:calUnassigned,max:maxUnassigned},same=c=>String(c.suffix)===String(suffix);const card=(lists[src]||[]).find(same)||[...isracardLastCards,...calLastCards,...maxLastCards].find(same);if(!card)return;account.cards=[...(account.cards||[]).filter(c=>!same(c)),card];isracardUnassigned=isracardUnassigned.filter(c=>!same(c));calUnassigned=calUnassigned.filter(c=>!same(c));maxUnassigned=maxUnassigned.filter(c=>!same(c));const patch={accounts,isracardUnassigned,calUnassigned,maxUnassigned};if(src==='isracard'){const saved=await chrome.storage.local.get({isracardAssignments:{}});patch.isracardAssignments={...saved.isracardAssignments,[suffix]:account.id}}await chrome.storage.local.set(patch);toast(`כרטיס ${suffix} שויך לחשבון ${account.branch}-${account.accountNumber}`)}
document.addEventListener('change',e=>{const sel=e.target?.closest?.('.isracard-account');if(!sel||!sel.value)return;assignCard(sel.dataset.src,sel.dataset.suffix,sel.value)});
function renderIsracardAssignments(){const pending=[...isracardUnassigned,...calUnassigned,...maxUnassigned];let panel=$('#isracardAssignments');if(!pending.length){panel?.remove();return}if(!panel){panel=document.createElement('section');panel.id='isracardAssignments';panel.className='panel';$('#scopePanel')?.after(panel)}panel.innerHTML=`<h2>שיוך כרטיסי אשראי לחשבונות</h2><p>כרטיס שהבנק לא דיווח עליו אינו משוייך אוטומטית. בחר פעם אחת חשבון חיוב — הסנכרונים הבאים כבר יזהו אותו.</p>${pending.map(c=>`<label class="choice"><span><b>${esc(c.name||'כרטיס')} · ${esc(c.suffix)}</b><small>${esc(c.issuer||'')} · חיוב ${money(c.amount)}${c.chargeDate?` · ${esc(c.chargeDate)}`:''}</small>${assignSelect(c)}</span></label>`).join('')}`}
function money(n){return new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(Number(n)||0)}
function shortDateTime(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';const pad=n=>String(n).padStart(2,'0');return`${d.getDate()}.${d.getMonth()+1}.${pad(d.getFullYear()%100)} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function renderSyncStatus(raw=''){const value=String(raw||''),el=$('#syncStatus');let banner=$('#syncBanner');if(!banner){banner=document.createElement('section');banner.id='syncBanner';banner.className='panel';document.querySelector('.summary')?.before(banner)}let state='waiting',label='ממתין לחיבור';if(/שגיאה|נכשל/.test(value)){state='error';label='הסנכרון נכשל'}else if(/ממתין להתחברות/.test(value)){state='waiting';label='ממתין להתחברות לבנק'}else if(/לפני פחות מ-|האוטומטי כבוי|תור הסנכרון|כבר רץ|לא נשמרו חשבונות|אין חיבור שאושר/.test(value)){state='waiting';label='הסנכרון דולג'}else if(/הסתיים|סונכרן|כבר עודכן/.test(value)){state='done';label=/הסתיים/.test(value)?'הסנכרון הסתיים בהצלחה':'הסנכרון הסתיים'}else if(/קורא|מסנכרן|מזהה|מחפש|בודק|טוען|מתבצע|שומר|שולף|מוריד|פותח|מעדכן/.test(value)){state='running';label='סנכרון בתהליך'}// ⚠⚠ 22.08.2026 — טל: „אין תוסף?" ואז „זה התצוגה של הדשבורד". **התוסף היה
// תקין; הדשבורד הוא שנראה כמו דף ריק עם מחרוזת אחת ארוכה.** המחרוזת בצילום
// זוהתה כ-`syncStatus` עצמו: הודעת הכשל של לאומי נושאת את כתובת הלשונית,
// ובלאומי הכתובת כוללת פרמטר `?q=` דחוס — סך הכל **1,052 תווים בלי רווח
// אחד**. מחרוזת כזו אינה נשברת לשורות, ולכן היא מתחה את הדף לרוחב ודחפה
// את כל שאר התוכן מחוץ למסך.
// **שלוש הגנות, כי מחרוזת אחת הפילה מסך שלם:**
//   1. קיצור לתצוגה — האבחון המלא נשמר ממילא ב-leumiDebug/leumiDiscoverError.
//   2. שבירה בתוך מילה, כדי ש**שום** מלל עתידי לא יוכל למתוח את הדף.
//   3. תקרת גובה עם גלילה, כדי שהודעה ארוכה לא תדחוף את התוכן כלפי מטה.
const shown=String(value||'').length>320?String(value).slice(0,320)+'…':String(value||'');
const html=`<span class="sync-state ${state}">${label}</span><small class="sync-detail">${esc(shown)}</small>`;el.innerHTML=html;banner.innerHTML=html}
// ⚠⚠ 28.08.2026 - טל: "אני משנה לפרטי וזה חוזר". textContent->innerHTML
// מנטרל < > & אבל **לא גרשיים** - בטוח לטקסט, שבור בתוך מאפיין. הגרש של
// 'מט"י' סגר את data-key באמצע, נשמר מפתח קטוע, והרינדור לא מצא אותו.
// ישויות (&quot;) נפרסות זהה בטקסט ובמאפיין, ולכן התיקון בטוח בשני ההקשרים.
function cardNewKeys(suffix){const m=cardNewMarks[String(suffix??'')];return m?.keys?.length?new Set(m.keys):null}
function newTag(keys,t){return keys&&keys.has(cardTxKey(t))?' <span class="new-tag">חדש</span>':''}
// סכום הכרטיס מגיע מהאתר. כשהאתר לא מסר אותו (מקס, 28.08.2026) נשמר 0,
// והכותרת הראתה 0.00 ₪ מעל טבלה מלאה. אפס מול עסקאות שסכומן חיובי הוא
// כמעט תמיד סכום חסר ולא חודש ריק - ואז מוצג סכום העסקאות, **מסומן
// במפורש** כדי שלא ייראה כמו נתון שהאתר מסר. הנתון השמור לא משתנה:
// זו תצוגה בלבד, והסנכרון הבא יביא סכום אמיתי.
function cardTotal(c){
 const a=Number(c?.amount),sum=(c?.transactions||[]).reduce((x,t)=>x+Math.abs(Number(t.amount)||0),0);
 if(Number.isFinite(a)&&a!==0)return money(a);
 if(!sum)return money(a||0);
 return `${money(sum)} <span class="sum-from-rows" title="האתר לא מסר סכום לכרטיס הזה — זהו סכום העסקאות המוצגות">מחושב מהעסקאות</span>`;
}
function chequePayerHtml(id){
 const name=chequePayers[id]||'';
 const m=chequePayerMeta[id]||{},g=chequePayerGuess[id];
 if(!name&&g){
  const txt=g.name||g.crop||g.full||'';
  return ` <button type="button" class="payer-guess" data-payer="${esc(id)}" title="הצעה של המודל, לא אושרה — ואינה נכנסת לחיפוש. לחיצה לאישור או תיקון מול החיתוך.">${esc(txt||'שם לא נקרא')} ?</button>`;
 }
 if(name){
  const bank=chequePayerBank[id]||'';
  const src=chequePayerSource[id];
  const how=[src==='ledger'?'מהנהלת החשבונות — נתון ודאי':src==='manual'?'הוקלד ידנית':'',
   bank?`בנק השיק: ${bank}`:'',m.stamp?`אושר מול החותמת (${m.stamp})`:m.kind==='private'?'לא נמצאה חותמת — שיק פרטי':''].filter(Boolean).join(' · ')||'שם מוסר השיק';
  return ` <button type="button" class="payer-tag${m.stamp?' stamped':''}" data-payer="${esc(id)}" title="${esc(how)}. לחיצה לתיקון.">${esc(name)}${bank?` <small>${esc(bank)}</small>`:''}</button>`;
 }
 const d=chequePayerDoubt[id];
 if(!d)return '';
 const opts=[d.crop,d.full,d.stamp&&`חותמת: ${d.stamp}`].filter(Boolean).join(' / ')||'לא נקרא';
 return ` <button type="button" class="payer-doubt" data-payer="${esc(id)}" title="שתי הקריאות לא הסכימו: ${esc(opts)} — לחיצה לקביעת השם">שם לא הוכרע</button>`;
}
function chequeNoteHtml(id){
 const text=chequeInfo[id]||'';
 return text?` <span class="cheque-note" title="הטקסט כפי שהופיע בחלון צילום השיק באתר לאומי">${esc(text)}</span>`:'';
}
function esc(v){const d=document.createElement('div');d.textContent=String(v??'');
  return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
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
  const cardTotalCell=totals.querySelector('.accounts-total-grid div:nth-child(4) strong');if(cardTotalCell)cardTotalCell.textContent=money(dedupedCardTotal(visible));const dates=accounts.map(a=>a.lastSync).filter(Boolean).sort();$('#lastSync').textContent=dates.length?shortDateTime(dates.at(-1)):'טרם בוצע';renderTransactions();renderAllCards().then(renderHiddenCards).catch(e=>console.warn('renderAllCards',e));renderLoansTable();renderMaslaka();renderRealEstate();renderBalance();if(activeView==='monthly')renderMonthlyTab();
}
function dedupedCardTotal(visible){const cards=new Map(),fallback=[];for(const a of visible){if((a.cards||[]).length)for(const c of a.cards){const key=String(c.suffix||`${a.id}-${cards.size}`);cards.set(key,Number(c.amount)||0)}else fallback.push(Number(a.upcomingCardCharges)||0)}const hasIsracard=accountFilter==='both'&&isracardLastCards.length>0;if(hasIsracard)for(const c of isracardLastCards)cards.set(String(c.suffix),Number(c.amount)||0);return[...cards.values()].reduce((s,n)=>s+n,0)+(hasIsracard?0:fallback.reduce((s,n)=>s+n,0))}
function accountCardTotal(a){if(!(a.cards||[]).length)return a.upcomingCardCharges==null?null:Number(a.upcomingCardCharges)||0;const bySuffix=new Map();for(const c of a.cards)bySuffix.set(String(c.suffix||bySuffix.size),Number(c.amount)||0);return[...bySuffix.values()].reduce((s,n)=>s+n,0)}
function accountKey(a){return a.selectionKey||`${a.source||'business'}|${a.branch}-${a.accountNumber}`}
function fullAccount(a){return`${a.accountNumber}${a.accountSuffix?`/${a.accountSuffix}`:''}`}
// ⚠ סוג הכרטיס אינו נשמר על הכרטיס אלא **נגזר מן החשבון שאליו שויך**.
// כרטיס שאינו משויך לאף חשבון מוצג בכל הסינונים ואינו מוסתר — **לא מסתירים
// נתון בגלל שחסר לנו מידע עליו.** מנוע השיוך (1.14.0) כבר משייך כמעט הכול.
function cardKindOf(suffix){
  const s=String(suffix||'');if(!s)return null;
  const owner=accounts.find(a=>(a.cards||[]).some(c=>String(c.suffix||'')===s));
  return owner?kindOf(owner):null;
}
function cardPasses(suffix){
  if(accountFilter==='both')return true;
  const k=cardKindOf(suffix);
  return k===null||k===accountFilter;
}
function kindOf(a){return accountKinds[accountKey(a)]||(a.source==='private'||a.source==='discount-private'||String(a.source).startsWith('fibi-')?'private':'business')}
function renderLoans(loans,source=''){if(!loans.length)return'<details class="details"><summary>הלוואות (אין הלוואות בחשבון)</summary></details>';const fibi=String(source).startsWith('fibi-');return`<details class="details" open><summary>פירוט הלוואות (${loans.length})</summary><div class="detail-grid">${loans.map(l=>fibi?`<div class="detail-card"><p>סכום הלוואה: <b>${money(l.originalPrincipal)}</b></p><p>תשלום קרוב: <b>${money(l.nextPayment)}</b></p><p>ריבית: <b>${esc(l.interest||'—')}</b></p></div>`:`<div class="detail-card"><h4>${esc(l.type)}</h4><p>יתרה: <b>${money(l.balance)}</b></p><p>קרן מקורית: ${money(l.originalPrincipal)}</p><p>תשלום הבא: ${money(l.nextPayment)} ${esc(l.nextPaymentDate)}</p><small>${esc(l.startDate)}—${esc(l.endDate)}</small></div>`).join('')}</div></details>`}
function renderCards(cards){if(!cards.length)return'<details class="details"><summary>כרטיסי אשראי (לא נמצאו כרטיסים)</summary></details>';return`<details class="details" open><summary>פירוט כרטיסי אשראי (${cards.length})</summary>${cards.map(c=>`<section class="detail-card card-statement"><div class="statement-head"><div><h4>${esc(c.name)} · ארבע ספרות אחרונות ${esc(c.suffix)}</h4><p>${esc(c.issuer)} · מועד חיוב ${esc(c.chargeDate)}</p></div><strong>${cardTotal(c)}</strong></div>${c.transactions?.length?(k=>`<table class="mini-table"><thead><tr><th>תאריך</th><th>בית עסק</th><th>סכום</th><th>תשלומים</th></tr></thead><tbody>${[...c.transactions].sort((a,b)=>dateKey(b.date)-dateKey(a.date)).map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.merchant)}${newTag(k,t)}</td><td>${money(t.amount)}</td><td>${esc(t.payments)}</td></tr>`).join('')}</tbody></table>`)(cardNewKeys(c.suffix)):'<small>באתר הבנק לא מוצגות עסקאות לכרטיס זה; הפירוט זמין באתר חברת הכרטיס.</small>'}</section>`).join('')}</details>`}
function dateKey(value){const m=String(value||'').match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);if(!m)return 0;let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1])).getTime()}
function renderTransactions(){const shown=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter),totalBalance=shown.reduce((sum,a)=>sum+(Number(a.balance)||0),0),states=new Map(shown.map(a=>[accountKey(a),Number(a.balance)||0]));// ⚠⚠ 25.08.2026 — טל: „עמודת היתרות היא לא לפי הסדר בבנק."
// המיון היה **לפי תאריך בלבד**. `sort` ב-JS יציב, ולכן בתוך אותו
// תאריך השורות נשארו בסדר **עולה** (סדר הבנק כפי שנשמר) בזמן
// שהרשימה כולה **יורדת** — והלולאה שמתחתיה, שמהלכת אחורה בזמן
// ומחשבת יתרה רצה, עיבדה בתוך כל תאריך מהישן לחדש. התוצאה: עמודת
// יתרה שמזגזגת ואינה תואמת את הבנק.
// ⚠ **התקדים כבר היה בקובץ:** מודל „תנועות עו״ש" משתמש מזמן ב-
// `||b.i-a.i`. כאן זה פשוט לא הוחל — אותו דפוס שחזר היום בשומר
// ההזרקה ובגלאי הניווט.
// ⚠ שובר השוויון חל **רק בתוך אותו חשבון**: השוואת אינדקסים בין
// חשבונות שונים חסרת משמעות, ושם הסדר ממילא שרירותי.
const rows=shown.flatMap(a=>visibleTx(a).map((t,i)=>({...t,account:a,__i:i})))
  .sort((a,b)=>dateKey(b.date)-dateKey(a.date)||(a.account===b.account?b.__i-a.__i:0))
  .slice(0,200),newCount=rows.filter(t=>t.isNew).length;for(const t of rows){const key=accountKey(t.account);if(t.balance!=null)states.set(key,Number(t.balance));t.totalBalance=[...states.values()].reduce((sum,value)=>sum+value,0);const after=states.get(key)||0,credit=Math.abs(Number(t.credit)||0),debit=Math.abs(Number(t.debit)||0);states.set(key,after-credit+debit)}const total=`<div class="loans-total"><span>יתרת עו״ש כוללת · ${shown.length} חשבונות ${newCount?`<b class="new-transactions-count">${newCount} חדשות</b>`:''}</span><strong>${money(totalBalance)}</strong></div>`;if(!rows.length){$('#transactions').innerHTML=`${total}<div class="empty">אין תנועות בסוג החשבון שנבחר.</div>`;return}$('#transactions').innerHTML=`${total}<table><thead><tr><th>תאריך</th><th>חשבון</th><th>פעולה ופרטים</th><th>חובה</th><th>זכות</th><th>יתרה כוללת</th></tr></thead><tbody>${rows.map(t=>`<tr class="${t.isNew?'new-transaction':''}"><td>${esc(t.date)} ${t.isNew?'<span class="new-badge">חדש</span>':''}</td><td>${esc(t.account.branch)}-${esc(t.account.accountNumber)}</td><td>${esc(t.action)} ${esc(t.details)}</td><td class="debit">${t.debit==null?'':money(t.debit)}</td><td class="credit">${t.credit==null?'':money(t.credit)}</td><td><b>${money(t.totalBalance)}</b></td></tr>`).join('')}</tbody></table>`}
function openAccountTransactions(accountOrKey){const account=typeof accountOrKey==='object'&&accountOrKey?accountOrKey:accounts.find(a=>accountKey(a)===accountOrKey||String(a.id)===String(accountOrKey));if(!account){toast('החשבון לא נמצא. יש לרענן את הדשבורד');return}// ⚠ 21.08.2026 — טל: „למה הסדר ביתרה לא נכון". נמדד מהמסך עצמו, בחשבון 009-2556371:
// 17/08 הראה העברה 250,000 (יתרה -267,664.63) **מעל** הקמת הלוואה 300,000 (יתרה 32,335.37),
// והחשבון מוכיח את ההפך: -267,664.63 + 300,000 = 32,335.37 בדיוק. כלומר בתוך אותו יום
// הרשימה מהאתר היא **בסדר עולה**, והמיון לפי תאריך בלבד (מיון יציב) שימר אותה כך —
// ואז בין ימים חדש-לישן ובתוך יום ישן-לחדש. לכן שובר שוויון: היפוך הסדר המקורי.
const rows=[...visibleTx(account)].map((t,i)=>({t,i})).sort((a,b)=>dateKey(b.t.date)-dateKey(a.t.date)||b.i-a.i).map(x=>x.t);$('#accountModalTitle').textContent=`תנועות עו״ש · ${account.branch}-${account.accountNumber}`;$('#accountModalBody').innerHTML=rows.length?`<div class="account-modal-table"><table><thead><tr><th>תאריך</th><th>פעולה ופרטים</th><th>חובה</th><th>זכות</th><th>יתרה</th></tr></thead><tbody>${rows.map(t=>`<tr class="${t.isNew?'new-transaction':''}"><td>${esc(t.date)} ${t.isNew?'<span class="new-badge">חדש</span>':''}</td><td>${esc(t.action)} ${esc(t.details)}${account.source==='leumi'&&t.cheque?` <button class="button cheque-image" data-selection="${esc(accountKey(account))}" data-reference="${esc(t.reference||'')}" data-branch="${esc(account.branch)}" data-account="${esc(account.accountNumber)}" data-date="${esc(t.date)}" data-amount="${Number(t.chequeAmount)||0}">צילום שיק</button>${chequePayerHtml(chequeId(accountKey(account),t.reference||''))}${chequeNoteHtml(chequeId(accountKey(account),t.reference||''))}`:''}</td><td class="debit">${t.debit==null?'':money(t.debit)}</td><td class="credit">${t.credit==null?'':money(t.credit)}</td><td>${t.balance==null?'':money(t.balance)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">אין תנועות בחשבון זה.</div>';const modal=$('#accountTransactionsModal');modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false')}

// ── בורר חודש בלשונית כרטיסי האשראי ───────────────────────────────────────
// ברירת המחדל היא החיוב הקרוב — כלומר הנתונים החיים מהסנכרון האחרון. בחירת חודש קודם
// קוראת מ-IndexedDB, ואם החודש טרם נשמר מציעה לטעון אותו מהאתר.
let cardMonth='';
// ⚠ „תחילת איסוף נתונים" — הגדרה גלובלית אחת, ולא פר-בנק. נשמרת ב-collectSince.
let collectSince='',viewSince='';
chrome.storage.local.get({collectSince:''}).then(x=>{collectSince=String(x.collectSince||'');renderScope()});
const HEB_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
// ⚠ 18.08.2026 — שדה <input type="date"> מוצג בפורמט של לוקאל הדפדפן (לרוב mm/dd/yyyy),
// ואחרי הבחירה לא היה ברור ממתי בדיוק ייאסף. לכן: שני בוררים בעברית, ומשפט מצב מפורש.
// הערך נשמר כ-YYYY-MM-01 — הגרעיניות האמיתית של האיסוף היא חודש, לא יום.
function sinceParts(value){const m=String(value||'').match(/^(\d{4})-(\d{2})/);return m?{year:Number(m[1]),month:Number(m[2])}:null}
function collectSinceParts(){return sinceParts(collectSince)}
function viewSinceParts(){return sinceParts(viewSince)}
// ⚠ 22.08.2026 — סינון תצוגה, לא מחיקה. שינוי כאן אינו נוגע באחסון, ולכן
// הרחבת החלון מחזירה מיד את מה שהוסתר — בלי סנכרון ובלי פנייה לבנק.
// dateKey מחזיר 0 לתאריך שלא נקרא; כזה **נשאר מוצג**, בדיוק כמו הכלל
// „תאריך שלא ניתן לפענוח נשמר" שברקע. עדיף להראות רשומה מסופקת מלהעלים.
function visibleTx(account){const p=viewSinceParts();const rows=account?.transactions||[];
  if(!p)return rows;const since=new Date(p.year,p.month-1,1).getTime();
  return rows.filter(t=>{const ms=dateKey(t?.date);return !ms||ms>=since})}
function collectSinceSentence(){const p=collectSinceParts();
  return p?`הבנק יישאל מ-1 ב${HEB_MONTHS[p.month-1]} ${p.year} ואילך. תנועות, שיקים וחודשי כרטיס שקודמים לתאריך זה לא יימשכו — אבל מה שכבר נשמר נשאר.`
          :'לא נקבע גבול: נמשך כל מה שהבנק מציע.'}
function viewSinceSentence(){const p=viewSinceParts();
  return p?`מוצגות תנועות מ-1 ב${HEB_MONTHS[p.month-1]} ${p.year} ואילך. מה שקודם לכן שמור ורק מוסתר — הרחבת החלון תחזיר אותו מיד.`
          :'מוצג כל מה ששמור.'}
function sinceControls(prefix,value,noneLabel){const p=sinceParts(value),now=new Date(),years=[];
  for(let y=now.getFullYear();y>=now.getFullYear()-5;y--)years.push(y);
  return `<select id="${prefix}Month"><option value="">${noneLabel}</option>${HEB_MONTHS.map((name,i)=>`<option value="${i+1}" ${p&&p.month===i+1?'selected':''}>${name}</option>`).join('')}</select>`
    +`<select id="${prefix}Year" ${p?'':'disabled'}>${years.map(y=>`<option value="${y}" ${p&&p.year===y?'selected':''}>${y}</option>`).join('')}</select>`}
function collectSinceControls(){return sinceControls('collectSince',collectSince,'— ללא הגבלה —')}
function viewSinceControls(){return sinceControls('viewSince',viewSince,'— הכל —')}
// ⚠⚠ 27.08.2026 — טל: „מיון לפי עסקי/פרטי/שניהם, וכל כרטיסי האשראי ימוינו
// בהתאם." **נמדד לפני שנכתב:** `accountFilter` כבר היה קיים, כבר נשמר, וכבר
// הוחל על חשבונות, תנועות והלוואות — **אבל לא הייתה שום דרך לשנות אותו.**
// `grep 'accountFilter='` החזיר את ההצהרה ואת הטעינה בלבד. כלומר לא נדרש
// מנגנון חדש אלא **פקד**, ותיקון במקום היחיד שלא כובד: הכרטיסים.
function accountFilterSentence(){
  const n=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter).length;
  const label=accountFilter==='business'?'עסקי':accountFilter==='private'?'פרטי':'עסקי ופרטי';
  return `מוצגים ${n} חשבונות (${label}) והכרטיסים המשויכים להם.`;
}
document.addEventListener('change',async e=>{const sel=e.target.closest('#accountFilter');if(!sel)return;
  accountFilter=sel.value;await chrome.storage.local.set({accountFilter});await load()});
document.addEventListener('change',async e=>{const hit=e.target.closest('#collectSinceMonth,#collectSinceYear');if(!hit)return;
  const monthSelect=document.querySelector('#collectSinceMonth'),yearSelect=document.querySelector('#collectSinceYear');
  const month=Number(monthSelect?.value||0),year=Number(yearSelect?.value||new Date().getFullYear());
  collectSince=month?`${year}-${String(month).padStart(2,'0')}-01`:'';
  await chrome.storage.local.set({collectSince});
  if(yearSelect)yearSelect.disabled=!month;
  const line=document.querySelector('#collectSinceLine');if(line)line.textContent=collectSinceSentence();
  toast(collectSince?`מעכשיו נאסף מ-1 ב${HEB_MONTHS[month-1]} ${year}`:'הגבול הוסר — נאסף כל מה שהבנק מציע');
  await renderAllCards()});
// גבול התצוגה עצמאי לחלוטין מגבול המשיכה: אין כאן פנייה לרשת ואין כתיבה
// ל-collectSince — רק שמירה ורינדור מחדש.
document.addEventListener('change',async e=>{const hit=e.target.closest('#viewSinceMonth,#viewSinceYear');if(!hit)return;
  const monthSelect=document.querySelector('#viewSinceMonth'),yearSelect=document.querySelector('#viewSinceYear');
  const month=Number(monthSelect?.value||0),year=Number(yearSelect?.value||new Date().getFullYear());
  viewSince=month?`${year}-${String(month).padStart(2,'0')}-01`:'';
  await chrome.storage.local.set({viewSince});
  if(yearSelect)yearSelect.disabled=!month;
  const line=document.querySelector('#viewSinceLine');if(line)line.textContent=viewSinceSentence();
  toast(viewSince?`מוצג מ-1 ב${HEB_MONTHS[month-1]} ${year} — לא נמחק דבר`:'מוצג כל מה ששמור');
  render()});
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
        // ⚠ „נטענו 3 חודשים" בלי להזכיר שדולגו 90 נראה כמו כישלון. אומרים את שניהם.
        if(r.cardSkipped)toast(`נטענו ${r.loaded} חודשים · דולגו ${r.cardSkipped} צירופי כרטיס־חודש ששמורים כבר`);
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
    +`<label class="auto-sync"><input type="checkbox" id="cardYearOnlyMissing" checked> <span>השלם חסרים בלבד<small>מדלג על חודשים ששמורים כבר; חודש החיוב הקרוב והקודם נקראים תמיד מחדש. הסר סימון לרענון מלא של 12 החודשים</small></span></label>`
    +`<button type="button" class="button secondary" id="loadCardYear">טען שנה אחורה — ישראכרט</button>`
    +`<small class="sync-detail">${saved.length?`שמורים ${saved.length} חודשים`:'טרם נשמרה היסטוריה'}${cardMonth?` · מוצג ${monthLabel(cardMonth)}`:''}</small>`;
}
// ⚠⚠ 27.08.2026 — טל: „תציין גם בכרטיסים מתי היה סנכרון אחרון."
// ⚠ **לא נדרש שדה חדש:** `cardHistStats()` כבר מחזיר `lastSync` לכל סיומת
// (הוא נגזר מ-`savedAt` של הרשומות ב-IndexedDB), והדשבורד כבר טוען אותו
// ל-`cardHistoryStats`. חסרה הייתה רק **התצוגה**.
// ⚠ נפילה: כרטיס בלי היסטוריה שמורה מקבל את `lastSync` של **החשבון** שאליו
// שויך — זה הרגע שבו נתוני הכרטיס באמת רועננו בסנכרון הרגיל.
const cardLastSync=(suffix,account)=>{
  const stat=cardHistoryStats[String(suffix)]||{};
  return stat.lastSync||account?.lastSync||'';
};
const cardSyncBadge=(suffix,account)=>{const when=cardLastSync(suffix,account);
  return when?`<span class="source-badge">סונכרן ${esc(shortDateTime(when))}</span>`:'<span class="source-badge">לא סונכרן</span>'};
const cardHistoryMark=suffix=>{const stat=cardHistoryStats[String(suffix)]||{},n=Number(stat.count)||0,since=stat.activeSince;const months=n===1?'חודש אחד':`${n} חודשים`;return n?`<span class="source-badge">כבר סונכרן · ${months}${since?` · פעיל מחודש ${esc(monthLabel(since))}`:''}</span>`:''},
// ⚠ 18.08.2026 — הכפתור היה תלוי בקיום היסטוריה שמורה, ולכן דווקא כרטיס שנטען בטעות —
// המקרה היחיד שלשמו נכתב — לא היה ניתן למחיקה, וגם לא כרטיסי כאל ו-MAX.
// deleteCardEverywhere מוחק לפי סיומת מכל שלוש רשימות הלא-משויכים, ואינו תלוי בהיסטוריה.
cardDeleteButton=suffix=>{const s=String(suffix||'').replace(/\D/g,'');return s?`<button type="button" class="button secondary delete-card-history" data-suffix="${esc(s)}" title="מסיר את הכרטיס מהתצוגה ומהסנכרונים הבאים">מחק כרטיס</button>`:''},cardHistoryButton=suffix=>`${cardHistoryStats[String(suffix)]?.count?'סנכרן מחדש':'סנכרן שנה'}`;
const isOtherIssuer=card=>/\b(?:MAX|CAL)\b|כאל|מקס/i.test(`${card.issuer||''} ${card.name||''}`),cardSyncControl=(account,card)=>{const text=`${card.issuer||''} ${card.name||''}`,cal=/\bCAL\b|כאל/i.test(text)?`<button type="button" class="button secondary sync-cal-card" data-suffix="${esc(card.suffix||'')}">סנכרן שנה מכאל</button>`:'',max=/\bMAX\b|מקס/i.test(text)?`<button type="button" class="button secondary sync-max-card" data-suffix="${esc(card.suffix||'')}">סנכרן שנה מ‑MAX</button>`:'',isracard=isOtherIssuer(card)?'':`${cardHistoryMark(card.suffix)} <button type="button" class="button secondary sync-card-history" data-suffix="${esc(card.suffix||'')}">${cardHistoryStats[String(card.suffix)]?.count?'סנכרן מחדש מישראכרט':'סנכרן שנה מישראכרט'}</button>`,bank=account?` <button type="button" class="button secondary sync-bank-card" data-source="${esc(account.source||'business')}" data-suffix="${esc(card.suffix||'')}">עדכן מהבנק</button>`:'';return`${cal}${max}${isracard}${bank} ${cardDeleteButton(card.suffix)}`};
async function renderAllCards(){const history=await chrome.runtime.sendMessage({type:'CARD_HISTORY_STATS'}),state=await chrome.storage.local.get({isracardActiveSince:{}});cardHistoryStats=history?.stats||{};for(const [suffix,activeSince] of Object.entries(state.isracardActiveSince||{})){cardHistoryStats[suffix]||(cardHistoryStats[suffix]={});cardHistoryStats[suffix].activeSince=activeSince}await renderCardMonthPicker();
calLastCards=[...new Map([...calLastCards,...maxLastCards].map(c=>[String(c.suffix),c])).values()];
// ⚠ תצוגת החודש לא סוננה כלל לפי סוג החשבון — כרטיס עסקי הופיע גם בסינון
// „פרטי". זה בדיוק מה שטל ביקש לתקן.
if(cardMonth){const rows=((await chrome.runtime.sendMessage({type:'CARD_MONTH_DATA',month:cardMonth}))?.rows||[]).filter(c=>!cardHidden(c)&&cardPasses(c.suffix));
 const box=document.querySelector('#allCards');
 if(!rows.length){box.innerHTML='<div class="empty">החודש הזה עדיין לא נשמר. בחר "טען חודש זה מהאתר" כשאתה מחובר לישראכרט.</div>';return}
 box.innerHTML=rows.map(c=>`<section class="detail-card"><div class="statement-head"><div><h4>${esc(c.name||'כרטיס')} · ${esc(c.suffix)} ${cardSyncBadge(c.suffix,null)} ${cardHistoryMark(c.suffix)} <button type="button" class="button secondary sync-card-history" data-suffix="${esc(c.suffix)}">${cardHistoryButton(c.suffix)}</button></h4><small>${esc(c.issuer||'')} · חודש ${esc(monthLabel(c.month))}</small></div><strong>${c.amount==null?'—':money(c.amount)}</strong></div>`
 +((c.transactions||[]).length?`<div class="card-statement"><table class="mini-table"><thead><tr><th>תאריך</th><th>בית עסק</th><th>סכום</th><th>תשלומים</th></tr></thead><tbody>`
 +((k)=>c.transactions.map(t=>`<tr><td>${esc(t.date||'')}</td><td>${esc(t.merchant||'')}${newTag(k,t)}</td><td>${t.amount==null?'':money(t.amount)}</td><td>${esc(t.payments||'')}</td></tr>`).join(''))(cardNewKeys(c.suffix))
 +`</tbody></table></div>`:'<div class="empty">אין תנועות לחודש זה.</div>')+`</section>`).join('');
 return}
const shown=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter),bySuffix=new Map();
// ⚠⚠ כאן היה השורש: הרשימה **הוזרעה מכל כרטיסי המנפיקים** (`isracardLastCards`,
// `calLastCards`) עם `account:null`, ורק אחר כך נדרסה בכרטיסים של החשבונות
// המוצגים. כלומר כרטיס ששייך לחשבון עסקי הופיע גם כשסוננו „פרטי" — הוא נכנס
// דרך ההזרעה ולא דרך החשבון. **הסינון חל עכשיו גם על ההזרעה.**
for(const card of [...isracardLastCards,...calLastCards])if(cardPasses(card.suffix))bySuffix.set(String(card.suffix),{account:null,card});for(const a of shown)for(const card of a.cards||[]){const key=String(card.suffix||`${a.id}-${bySuffix.size}`),current=bySuffix.get(key);bySuffix.set(key,{account:a,card:current?.card?.transactions?.length&&!card.transactions?.length?{...card,transactions:current.card.transactions}:card})}const groups=[...bySuffix.values()],isracardTotal=isracardLastCards.reduce((s,c)=>s+(Number(c.amount)||0),0),box=$('#allCards');if(!groups.length){box.innerHTML='<div class="empty">לא נמצאו כרטיסי אשראי בחשבונות המוצגים.</div>';return}box.innerHTML=`${isracardLastCards.length?`<div class="loans-total"><span>סך החיובים בכל כרטיסי ישראכרט</span><strong>${money(isracardTotal)}</strong></div>`:''}${groups.map(({account:a,card:c})=>`<section class="detail-card card-statement"><div class="statement-head"><div><h3>${esc(c.name||'כרטיס אשראי')} · ${esc(c.suffix||'')} ${cardSyncBadge(c.suffix,a)} ${cardSyncControl(a,c)}</h3><p>${esc(c.issuer||a?.sourceLabel||'')}${a?` · חשבון ${esc(a.branch)}-${esc(a.accountNumber)}`:' · '+assignSelect(c)}${c.chargeDate?` · חיוב ${esc(c.chargeDate)}`:''}</p></div><strong>${cardTotal(c)}</strong></div>${c.transactions?.length?(k=>`<table class="mini-table"><thead><tr><th>תאריך</th><th>בית עסק</th><th>סכום</th><th>תשלומים</th></tr></thead><tbody>${[...c.transactions].sort((x,y)=>dateKey(y.date)-dateKey(x.date)).map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(t.merchant)}${newTag(k,t)}</td><td>${money(t.amount)}</td><td>${esc(t.payments||'')}</td></tr>`).join('')}</tbody></table>`)(cardNewKeys(c.suffix)):'<div class="empty">אין תנועות זמינות לכרטיס זה.</div>'}</section>`).join('')}`}
// ── סוג הלוואה: עסקי/פרטי ─────────────────────────────────────────────
// ⚠ 28.08.2026 - טל: "תאפשר להגדיר בתוסף עצמו אם ההלוואה פרטית או עסקית."
// עד עכשיו הלוואה ירשה את הסוג מהחשבון - אבל הלוואה עסקית יכולה לשבת
// בחשבון פרטי ולהפך. הדריסה נשמרת ב-loanKinds לפי מפתח **יציב**:
// חשבון + סוג + תאריך סיום - שדות ששורדים סנכרון (אינדקס היה משתנה
// עם כל שינוי סדר, ולכן אינו מפתח).
var loanKinds={};
function loanKeyOf(a,l){return `${a.selectionKey||accountKey(a)}|${l.type||''}|${l.endDate||''}`}
function loanKindOf(a,l){return loanKinds[loanKeyOf(a,l)]||kindOf(a)}
function renderAllLoans(){
// ⚠ הסינון עבר מרמת החשבון לרמת ההלוואה - אחרת הלוואה עסקית בחשבון
// פרטי לא הייתה מופיעה לעולם בסינון "עסקיים".
const rows=[],seen=new Set();for(const a of accounts){const ownerKey=`${a.branch}-${a.accountNumber}`;for(let loanIndex=0;loanIndex<(a.loans||[]).length;loanIndex++){const l=a.loans[loanIndex];if(!l||(Number(l.balance)<=0&&Number(l.nextPayment)<=0)||l.accountKey&&l.accountKey!==ownerKey)continue;if(accountFilter!=='both'&&loanKindOf(a,l)!==accountFilter)continue;
const fingerprint=[a.source,ownerKey,l.type,l.originalPrincipal,l.balance,l.endDate,l.nextPayment,l.nextPaymentDate,l.interest].join('|');if(seen.has(fingerprint))continue;seen.add(fingerprint);rows.push({account:a,loan:l,loanIndex})}}rows.sort((x,y)=>String(x.account.sourceLabel).localeCompare(String(y.account.sourceLabel),'he')||String(x.account.branch).localeCompare(String(y.account.branch),'he')||String(x.account.accountNumber).localeCompare(String(y.account.accountNumber),'he')||Number(y.loan.balance||0)-Number(x.loan.balance||0));const box=$('#allLoans');if(!rows.length){box.innerHTML='<div class="empty">לא נמצאו הלוואות בחשבונות המוצגים.</div>';return}const short=v=>{const s=String(v||'').replace(/\s+/g,' ').trim();return s&&s.length<=60?s:'—'},remaining=l=>{const m=String(l.installments||'').match(/(\d+)\s*\/\s*(\d+)/);if(m){const paid=Number(m[1]),total=Number(m[2]);return total>=paid?`${total-paid}/${total}`:'—'}const left=Number(l.remainingInstallments),total=Number(l.totalInstallments);
  if(Number.isFinite(left)&&left>=0&&Number.isFinite(total)&&total>0)return `${left}/${total}`;
  // ⚠ 18.08.2026 — לאומי אינו מחזיר מספר תשלומים כלל: ברשומה שלו אין installments,
  // בעוד שפועלים מחזיר "8/71". לכן העמודה הופיעה ריקה דווקא בהלוואה של לאומי.
  // כשיש תאריך התחלה, תאריך סיום ותשלום חודשי — המספר נגזר מהתאריכים, ומסומן ב-~
  // כדי שלא ייקרא כנתון שהבנק מסר.
  const loanMonths=(from,to)=>{const part=v=>{const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m)return null;const y=Number(m[3]);return{y:y<100?2000+y:y,m:Number(m[2])}};
    const a2=part(from),b2=part(to);return a2&&b2?(b2.y-a2.y)*12+(b2.m-a2.m):null};
  const allMonths=loanMonths(l.startDate,l.endDate),leftMonths=loanMonths(l.nextPaymentDate,l.endDate);
  if(Number.isFinite(allMonths)&&allMonths>0&&Number.isFinite(leftMonths)&&leftMonths>=0)return `~${leftMonths+1}/${allMonths+1}`;
  return '—'};const monthly=rows.reduce((sum,row)=>sum+(Number(row.loan.nextPayment)||0),0),hasMortgages=rows.some(r=>r.loan.isMortgage);box.innerHTML=`<div class="loans-table-wrap"><table class="loans-table"><thead><tr><th>בנק וחשבון</th><th>יתרה</th><th>תשלומים שנותרו</th><th>תשלום קרוב</th><th>תשלום סופי</th><th>ריבית</th><th>החזר קרוב</th><th>סוג</th><th>הסרה</th></tr></thead><tbody>${rows.map(({account:a,loan:l,loanIndex})=>`<tr><td><b>${esc(a.sourceLabel||'בנק')}</b> · ${esc(a.branch)}-${esc(a.accountNumber)} ${l.isMortgage?'<span class="mortgage-tag">משכנתא</span>':''}</td><td>${l.balance==null?'—':money(l.balance)}</td><td dir="ltr">${esc(remaining(l))}</td><td>${esc(short(l.nextPaymentDate))}</td><td>${esc(short(l.endDate))}</td><td title="${esc(l.interestNote||'')}">${esc(short(l.interest))}</td><td><b>${l.nextPayment==null?'—':money(l.nextPayment)}</b></td><td><select class="loan-kind" data-key="${encodeURIComponent(loanKeyOf(a,l))}" title="ברירת המחדל — לפי סוג החשבון (${kindOf(a)==='business'?'עסקי':'פרטי'})"><option value="" ${loanKinds[loanKeyOf(a,l)]?'':'selected'}>לפי החשבון</option><option value="business" ${loanKinds[loanKeyOf(a,l)]==='business'?'selected':''}>עסקי</option><option value="private" ${loanKinds[loanKeyOf(a,l)]==='private'?'selected':''}>פרטי</option></select></td><td>${l.isMortgage?`<label class="loan-remove-label"><input type="checkbox" class="mortgage-remove" data-account-id="${esc(a.id)}" data-loan-index="${loanIndex}"> הסר</label>`:'—'}</td></tr>`).join('')}</tbody></table></div>${hasMortgages?'<button type="button" id="removeSelectedMortgages" class="button secondary">הסר משכנתאות מסומנות מהרשימה</button>':''}<div class="loans-total"><span>סה״כ החזר חודשי</span><strong>${money(monthly)}</strong></div>`}
function setActiveView(view){activeView=['accounts','selection','transactions','monthly','cards','search','loans','maslaka','realestate','balance'].includes(view)?view:'accounts';document.querySelectorAll('.monthly-view').forEach(el=>el.classList.toggle('hidden',activeView!=='monthly'));document.querySelectorAll('.dashboard-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));document.querySelectorAll('.selection-view').forEach(el=>el.classList.toggle('hidden',activeView!=='selection'));document.querySelectorAll('.accounts-view').forEach(el=>el.classList.toggle('hidden',activeView!=='accounts'));document.querySelectorAll('.transactions-view').forEach(el=>el.classList.toggle('hidden',activeView!=='transactions'));document.querySelectorAll('.cards-view').forEach(el=>el.classList.toggle('hidden',activeView!=='cards'));document.querySelectorAll('.search-view').forEach(el=>el.classList.toggle('hidden',activeView!=='search'));document.querySelectorAll('.loans-view').forEach(el=>el.classList.toggle('hidden',activeView!=='loans'));document.querySelectorAll('.maslaka-view').forEach(el=>el.classList.toggle('hidden',activeView!=='maslaka'));document.querySelectorAll('.realestate-view').forEach(el=>el.classList.toggle('hidden',activeView!=='realestate'));document.querySelectorAll('.balance-view').forEach(el=>el.classList.toggle('hidden',activeView!=='balance'));if(activeView==='search')scheduleMovementSearch();if(activeView==='monthly')renderMonthlyTab()}

function searchDateValue(value,end=false){if(!value)return end?Infinity:-Infinity;return new Date(`${value}T${end?'23:59:59':'00:00:00'}`).getTime()}
// בורר המקורות נבנה מהשורות שנאספו בפועל, ולא מרשימת החשבונות — כך מקור
// שמופיע בתוצאות תמיד מופיע גם בבורר, ולהפך. הרשימה נכתבת מחדש רק כשקבוצת
// המקורות עצמה השתנתה; אחרת סימון תיבה היה נמחק באמצע הקלדה.
function renderMovementSources(rows){
 const list=$('#movementSourceList'),sum=$('#movementSourceSummary');if(!list||!sum)return;
 const index=new Map();
 for(const r of rows){const cur=index.get(r.source);if(cur){cur.n++}else index.set(r.source,{source:r.source,type:r.type,n:1})}
 const items=[...index.values()].sort((a,b)=>a.type===b.type?a.source.localeCompare(b.source,'he'):a.type==='bank'?-1:1);
 // מקור שנעלם (חשבון שהוסר, חודש כרטיס שנמחק) יוצא מהבחירה, אחרת הסינון
 // היה נתקע על מפתח שאינו קיים והתוצאה הייתה ריקה בלי שום הסבר.
 for(const key of [...movementSourcePick])if(!index.has(key))movementSourcePick.delete(key);
 const sig=items.map(i=>i.source).join('|');
 if(sig!==movementSourceSig){movementSourceSig=sig;
  list.innerHTML=items.length?`<div class="msrc-actions"><button type="button" data-act="all">כל המקורות</button><button type="button" data-act="banks">בנקים בלבד</button><button type="button" data-act="cards">כרטיסים בלבד</button></div>`
   +items.map(i=>`<label class="msrc-item${movementSourcePick.has(i.source)?' on':''}" title="${esc(i.source)}"><input type="checkbox" data-src="${esc(i.source)}" data-type="${i.type}"${movementSourcePick.has(i.source)?' checked':''}><span class="msrc-body"><span class="msrc-name">${esc(i.source)}</span><span class="msrc-tag">${i.type==='bank'?'בנק':'כרטיס'} · ${i.n} תנועות</span></span></label>`).join('')
   :'<div class="msrc-empty">אין עדיין תנועות שמורות — סנכרן בנק או כרטיס.</div>'}
 for(const box of list.querySelectorAll('input[data-src]')){box.checked=movementSourcePick.has(box.dataset.src);box.closest('.msrc-item')?.classList.toggle('on',box.checked)}
 sum.textContent=movementSourcePick.size?`מקורות: ${movementSourcePick.size} מתוך ${items.length}`:`מקורות: כל הבנקים והכרטיסים (${items.length})`;
}
function movementSourceAction(act){
 movementSourcePick.clear();
 if(act!=='all')for(const box of document.querySelectorAll('#movementSourceList input[data-src]'))
   if(box.dataset.type===(act==='banks'?'bank':'card'))movementSourcePick.add(box.dataset.src);
 scheduleMovementSearch();
}
// ── פילוח הסיכום התחתון ─────────────────────────────────────────────────
// ⚠ הפילוח מצויר מ-movementLastMatched ולא מריצה חוזרת של החיפוש: מעבר בין
// "לפי חודש" ל"לפי מקור" הוא שאלה על אותן שורות בדיוק, ואיסוף מחדש היה
// פותח שוב את כל חודשי הכרטיסים בלי שום נתון חדש.
function movementMonthTitle(key){
 if(key==='ללא תאריך')return key;
 const [y,m]=key.split('-').map(Number);
 return new Date(y,m-1,1).toLocaleDateString('he-IL',{month:'long',year:'numeric'});
}
function movementMonthKey(r){if(!r.when)return 'ללא תאריך';const d=new Date(r.when);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
// ⚠ מיון החודשים: 'ללא תאריך' עוקף כל YYYY-MM במיון היורד (אותיות אחרי
// ספרות) והתיישב בראש הטבלה. הדלי חסר-התאריך נדחף לסוף במפורש.
function movementMonthDesc(a,b){return a==='ללא תאריך'?1:b==='ללא תאריך'?-1:String(b).localeCompare(String(a))}
function movementGroups(matched,by,terms){
 if(by==='term'){
  // סדר ההקלדה, לא סדר הגודל: "מונח 1, מונח 2" הוא איך שטל חושב עליהם.
  return (terms||[]).map(term=>{
   const cur={key:term,month:'',source:term,n:0,debit:0,credit:0};
   for(const r of matched)if(r.hay.includes(term)){cur.n++;if(r.flow==='credit')cur.credit+=r.amount;else cur.debit+=r.amount}
   return cur});
 }
 const g=new Map();
 for(const r of matched){
  const month=by==='source'?'':movementMonthKey(r),source=by==='month'?'':r.source,
   key=by==='both'?JSON.stringify([month,source]):by==='month'?month:source;
  const cur=g.get(key)||{key,month,source,n:0,debit:0,credit:0};
  cur.n++;if(r.flow==='credit')cur.credit+=r.amount;else cur.debit+=r.amount;
  g.set(key,cur);
 }
 const list=[...g.values()],size=(a,b)=>(b.debit+b.credit)-(a.debit+a.credit);
 // חודשים מהחדש לישן; מקורות לפי גודל, כי שם השאלה היא "מי הכי משמעותי".
 // בשילוב: החודש קובע את הסדר, וגודל המקור קובע בתוכו.
 if(by==='month')return list.sort((a,b)=>movementMonthDesc(a.month,b.month));
 if(by==='both')return list.sort((a,b)=>movementMonthDesc(a.month,b.month)||size(a,b));
 return list.sort(size);
}
function paintMovementBreakdown(){
 const box=$('#movementBreakdownBox');if(!box)return;
 const matched=movementLastMatched,manySources=new Set(matched.map(r=>r.source)).size>1;
 // ⚠ "לפי מקור" ו"חודש ומקור" חסרי משמעות על מקור יחיד, ולכן אינם מוצעים -
 // ואם המשתמש כבר עמד עליהם והתוצאה הצטמצמה למקור אחד, המצב חוזר ל"ללא"
 // במקום להשאיר כפתור פעיל שאין לו כפתור בסרגל.
 const manyTerms=movementLastTerms.length>1;
 if((movementBreakdown==='source'||movementBreakdown==='both')&&!manySources)movementBreakdown='none';
 if(movementBreakdown==='term'&&!manyTerms)movementBreakdown='none';
 const btn=(id,label)=>`<button type="button" data-bd="${id}" class="${movementBreakdown===id?'on':''}">${label}</button>`;
 const bar=`<div class="movement-breakdown-bar"><span>פילוח הסיכום:</span>${btn('none','ללא')}${btn('month','לפי חודש')}${manySources?btn('source','לפי מקור')+btn('both','חודש ומקור'):''}${manyTerms?btn('term','לפי מונח חיפוש'):''}</div>`;
 if(movementBreakdown==='none'){box.innerHTML=bar;return}
 const by=movementBreakdown,rows=movementGroups(matched,by,movementLastTerms),
  tn=rows.reduce((x,r)=>x+r.n,0),td=rows.reduce((x,r)=>x+r.debit,0),tc=rows.reduce((x,r)=>x+r.credit,0),
  nums=r=>`<td>${r.n}</td><td class="bd-debit">${money(r.debit)}</td><td class="bd-credit">${money(r.credit)}</td><td>${money(r.debit-r.credit)}</td>`;
 let head,body,totalLabel;
 if(by==='both'){
  // תא החודש נמתח על כל מקורותיו (rowspan) במקום לחזור בכל שורה - כך
  // הטבלה נקראת כחודשים שבתוכם מקורות, וזו בדיוק השאלה שהפילוח הזה עונה.
  const order=[],perMonth=new Map();
  for(const r of rows){if(!perMonth.has(r.month)){perMonth.set(r.month,[]);order.push(r.month)}perMonth.get(r.month).push(r)}
  head=`<th>חודש</th><th>מקור</th><th>תנועות</th><th>חובה</th><th>זכות</th><th>נטו</th>`;
  body=order.map(m=>{const list=perMonth.get(m);
   return list.map((r,i)=>`<tr>${i?'':`<th class="bd-month" rowspan="${list.length}">${esc(movementMonthTitle(m))}</th>`}<td>${esc(r.source)}</td>${nums(r)}</tr>`).join('')}).join('');
  totalLabel=`<th colspan="2">סה״כ ${order.length} חודשים · ${new Set(rows.map(r=>r.source)).size} מקורות</th>`;
 }else{
  head=`<th>${by==='month'?'חודש':by==='term'?'מונח חיפוש':'מקור'}</th><th>תנועות</th><th>חובה</th><th>זכות</th><th>נטו</th>`;
  body=rows.map(r=>`<tr><td>${esc(by==='month'?movementMonthTitle(r.key):r.key)}</td>${nums(r)}</tr>`).join('');
  totalLabel=`<th>סה״כ ${rows.length} ${by==='month'?'חודשים':by==='term'?'מונחים':'מקורות'}</th>`;
 }
 box.innerHTML=bar+`<div class="movement-breakdown-table"><table><thead><tr>${head}</tr></thead><tbody>${body}`
  +`<tr class="bd-total">${totalLabel}<th>${tn}</th><th>${money(td)}</th><th>${money(tc)}</th><th>${money(td-tc)}</th></tr></tbody></table></div>`  +(by==='term'&&tn!==matched.length?`<div class="movement-search-note">הסכום כאן (${tn}) גדול מ-${matched.length} התנועות שנמצאו: תנועה שמתאימה ליותר ממונח אחד נספרת בכל אחד מהם.</div>`:'');
}
function scheduleMovementSearch(){clearTimeout(movementSearchTimer);movementSearchTimer=setTimeout(renderMovementSearch,220)}
async function renderMovementSearch(){
 const box=$('#movementSearchResults');if(!box)return;const epoch=++movementSearchEpoch,q=String($('#movementSearchText')?.value||'').trim().toLocaleLowerCase('he'),minRaw=$('#movementSearchMin')?.value,maxRaw=$('#movementSearchMax')?.value,fromRaw=$('#movementSearchFrom')?.value,toRaw=$('#movementSearchTo')?.value,flowPick=String($('#movementSearchKind')?.value||'both'),terms=q.split(',').map(x=>x.trim()).filter(Boolean);
 box.className='empty';box.textContent='מחפש בתנועות עו״ש וכרטיסי האשראי…';const min=minRaw===''?0:Math.abs(Number(minRaw)),max=maxRaw===''?Infinity:Math.abs(Number(maxRaw)),from=searchDateValue(fromRaw),to=searchDateValue(toRaw,true),rows=[];
 let chequeIds=new Set();try{chequeIds=await chequeKeys()}catch(e){}
 for(const a of accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter))for(const t of visibleTx(a)){const amount=Math.abs(Number(t.debit)||Number(t.credit)||Number(t.amount)||0),name=`${t.action||''} ${t.details||''}`.trim(),when=dateKey(t.date);const chqId=a.source==='leumi'&&t.cheque&&t.reference?chequeId(accountKey(a),t.reference):'';
  const payer=chqId?String(chequePayers[chqId]||''):'',payerBank=chqId?String(chequePayerBank[chqId]||''):'';
  rows.push({date:t.date,when,name,payer,chq:chqId,hay:`${name} ${payer} ${payerBank}`.toLocaleLowerCase('he'),amount,cheque:chqId&&chequeIds.has(chqId)?chqId:'',source:`${a.sourceLabel||'בנק'} · ${a.branch}-${a.accountNumber}`,type:'bank',flow:Number(t.credit)?'credit':'debit',kind:Number(t.credit)?'זכות':'חובה'})}
 const monthResult=await chrome.runtime.sendMessage({type:'CARD_MONTHS'}),months=monthResult?.months||[];
 for(const month of months){const result=await chrome.runtime.sendMessage({type:'CARD_MONTH_DATA',month});for(const c of result?.rows||[])for(const t of c.transactions||[]){const raw=Number(t.amount)||0,flow=raw<0?'credit':'debit';rows.push({date:t.date,when:dateKey(t.date),name:t.merchant||'',payer:'',hay:String(t.merchant||'').toLocaleLowerCase('he'),amount:Math.abs(raw),source:`${c.issuer||'כרטיס אשראי'} · ${c.suffix||''}`,type:'card',fresh:cardNewKeys(c.suffix)?.has(cardTxKey(t))||false,flow,kind:flow==='credit'?'זכות (זיכוי)':'חובה'})}}
 if(epoch!==movementSearchEpoch)return;renderMovementSources(rows);
 if(!q&&minRaw===''&&maxRaw===''&&!fromRaw&&!toRaw&&flowPick==='both'&&!movementSourcePick.size){box.className='empty';box.textContent='הקלד שם, סכום או תקופה — או בחר מקור — והתוצאות יופיעו מיד.';return}
 // ⚠ הסיכום נמדד על **כל** ההתאמות ולא על 500 השורות המוצגות. קודם הוא חושב
 // אחרי ה-slice, ולכן חיפוש רחב הציג סכום קטן מהאמת בלי שום סימן לכך.
 const matched=rows.filter(r=>(!terms.length||terms.some(term=>r.hay.includes(term)))&&r.amount>=min&&r.amount<=max&&r.when>=from&&r.when<=to&&(flowPick==='both'||r.flow===flowPick)&&(!movementSourcePick.size||movementSourcePick.has(r.source))).sort((a,b)=>b.when-a.when),filtered=matched.slice(0,500);
 const debitRows=matched.filter(r=>r.flow==='debit'),creditRows=matched.filter(r=>r.flow==='credit'),debitSum=debitRows.reduce((s,r)=>s+r.amount,0),creditSum=creditRows.reduce((s,r)=>s+r.amount,0),sum=debitSum+creditSum;
 if(!matched.length){box.className='empty';box.textContent='לא נמצאו תנועות שמתאימות לחיפוש.';return}const capped=matched.length>filtered.length;box.className='movement-search-table';const perTerm=terms.length>1?terms.map(term=>({term,n:matched.filter(r=>r.hay.includes(term)).length})):[];
 box.innerHTML=`<div class="movement-search-summary"><span>נמצאו ${matched.length} תנועות</span><span>סכום מצטבר ${money(sum)}</span></div>${perTerm.length?`<div class="movement-search-terms">${perTerm.length} מונחי חיפוש · ${perTerm.map(x=>`<span class="mterm">${esc(x.term)} <b>${x.n}</b></span>`).join('')}</div>`:''}<table><thead><tr><th>תאריך</th><th>ספק / לקוח / פעולה</th><th>מקור</th><th>סוג</th><th>סכום</th></tr></thead><tbody>${filtered.map(r=>`<tr><td>${esc(r.date||'')}</td><td><b>${esc(r.name||'ללא פירוט')}</b>${r.chq?chequePayerHtml(r.chq):''}${r.fresh?' <span class="new-tag">חדש</span>':''}${r.cheque?` <button type="button" class="cheque-view" data-cheque="${esc(r.cheque)}" data-date="${esc(r.date||'')}" data-amount="${r.amount}" title="צילום השיק שמור מקומית — נפתח גם בלי חיבור לבנק">צילום שיק</button>${chequeNoteHtml(r.cheque)}`:''}</td><td>${esc(r.source)}</td><td>${esc(r.kind)}</td><td>${money(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">סה״כ ${matched.length} תנועות</th><th>${money(sum)}</th></tr></tfoot></table><div class="movement-search-total"><span class="mst-debit">חובה · ${debitRows.length} תנועות · ${money(debitSum)}</span><span class="mst-credit">זכות · ${creditRows.length} תנועות · ${money(creditSum)}</span><span>נטו (חובה פחות זכות) · ${money(debitSum-creditSum)}</span></div><div id="movementBreakdownBox"></div>${capped?`<div class="movement-search-note">מוצגות ${filtered.length} התנועות האחרונות מתוך ${matched.length}; הסיכום כולל את כולן.</div>`:''}`;
 movementLastMatched=matched;movementLastTerms=terms;paintMovementBreakdown();
}
// ⚠⚠ 31.08.2026 - טל: "זה עבד מקודם, בסיום הסנכרון הרשימה הייתה נעלמת."
// **זו הייתה רגרסיה, ומצאתי את הקומיט.** עד 1.11.2 סיום סנכרון כתב
// `discoveredAccounts:[]` - הבורר התרוקן. הקומיט ההוא תיקן תקלה הפוכה
// ואמיתית ("סנכרון של בנק אחד מחק את הבורר של כולם") והחליף את האיפוס
// בסינון **לפי מקור הריצה** - ומאז חשבון שנכנס לבורר ולא סונכרן דרך
// syncSelected נשאר שם לנצח.
//
// **שתי ההתנהגויות שגויות. הנכונה היא שלישית:** חשבון יורד מהבורר כשהוא
// **כבר שמור ב-accounts** - כי אז הוא חשבון קיים ולא "ממתין לבחירה".
// הקריטריון הוא מצב החשבון עצמו, ולכן:
//   · סנכרון בנק א' אינו נוגע בבורר של בנק ב'  (התיקון מ-1.11.2 נשמר)
//   · סנכרון ישות אחת אינו מסלק ישויות אחרות    (התיקון מ-1.0.22 נשמר)
// ⚠ זהו **סינון תצוגה בלבד** - שום נתון לא נמחק, ולכן אין כאן שום דרך
// לשחזר את שתי התקלות ההן.
function savedAccountKeys(){
 const out=new Set();
 for(const a of accounts){
  if(a.selectionKey)out.add(String(a.selectionKey));
  if(a.branch&&a.accountNumber)out.add(`${a.source||'business'}|${a.branch}-${a.accountNumber}`);
 }
 return out;
}
function pendingDiscovered(){
 const saved=savedAccountKeys();
 return discovered.filter(a=>{
  if(saved.has(String(a.key)))return false;
  if(a.branch&&a.accountNumber&&saved.has(`${a.source||'business'}|${a.branch}-${a.accountNumber}`))return false;
  return true;
 });
}
function renderSelection(){const box=$('#discoveredAccounts'),tab=$('#selectionTab');
 const discovered=pendingDiscovered();
// ⚠ הפאנל כבר לא מסתתר מעצמו — הלשונית שולטת בהצגה. קודם הוא נעלם כשלא היו חשבונות
// שזוהו, ולכן לא היה שום מקום קבוע לחפש בו את הבחירה.
if(tab)tab.textContent=discovered.length?`בחירה וסנכרון (${discovered.length})`:'בחירה וסנכרון';
if(!discovered.length){box.innerHTML='<div class="empty">אין חשבונות שממתינים לבחירה. חשבון שכבר סונכרן יורד מהרשימה — הוא מופיע בלשונית "חשבונות". התחבר לבנק כדי לזהות חשבונות חדשים; הסנכרון לא מתחיל לפני שתאשר.</div>';
  // ⚠⚠ 27.08.2026 — טל אמר פעמיים „בפנים" ומדידה לא הגיעה. **נמדד: הכפתור
  // „מדוד לשונית פעילה" יושב ב-`#selectionTools`, והשורה הזו הסירה את כל
  // הסרגל כשאין חשבונות שממתינים לבחירה.** ב-BTB אין מתאם ולכן אין „חשבונות
  // שזוהו" — כלומר **בדיוק במקרה שבו צריך למדוד, הכלי נעלם מהמסך.**
  // ⚠ המדידה היא כלי אבחון ואינה חלק מבחירת חשבונות; היא נשארת תמיד.
  const tools=$('#selectionTools');
  if(tools)tools.innerHTML='<button type="button" class="button" id="probeTab" title="קורא את מבנה הדף בלשונית הפעילה. קריאה בלבד — בלי לחיצות ובלי ניווט.">מדוד לשונית פעילה</button>';
  return}
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
 const map={business:'business',private:'private',leumi:'leumi','discount-business':'discount-business','discount-private':'discount-private',mizrahi:'mizrahi',yahav:'yahav',isracard:'isracard',cal:'cal',max:'max',btb:'btb'};
 return BANK_BUTTONS.find(b=>b.id===map[s])}
// ⚠⚠ 27.08.2026 — טל: „פתחת את בנק הפועלים במקום את BTB".
// היו **שתי** שרשראות ניתוב זהות — אחת לאריח ואחת לרענון — ו-BTB נוסף רק לאחת מהן.
// מי שנופל מהשרשרת מגיע ל-startChosenSync ומשם ל-START_AUTO_SYNC, שברירת
// המחדל שלו היא פועלים. לכן **שרשרת אחת בלבד**, ושתי הכניסות קוראות לה.
// (האיחוד גם סוגר פער הפוך: לרענון חסר ענף cal.)
async function dispatchBank(bank,button){
 if(bank.fibi)return startFibi(bank.id,button);
 if(bank.leumi)return startLeumi(button);
 if(bank.discountBusiness)return startDiscountBusiness(button);
 if(bank.discountPrivate)return startDiscountPrivate(button);
 if(bank.mizrahi)return startMizrahi(button);
 if(bank.yahav)return startYahav(button);
 if(bank.isracard)return startIsracard(button);
 if(bank.cal)return startCal(button);
 if(bank.max)return startMax(button);
 if(bank.btb)return startBtb(button);
 if(bank.ready)return startChosenSync(bank.id,button);
 await chrome.runtime.sendMessage({type:'OPEN_EXTERNAL_BANK',url:bank.url});
 toast(`${bank.name}: האתר הרשמי נפתח; חיבור הסנכרון יתווסף בשלב הבא`)}
async function refreshBank(source,button){const bank=bankForSource(source);
 if(!bank)return toast('לא ידוע איזה חיבור מרענן את החשבון הזה');
 return dispatchBank(bank,button)}
async function startChosenSync(scope,button){syncScope=scope;await chrome.storage.local.set({syncScope});const original=button.innerHTML;button.disabled=true;button.textContent='פותח את הבנק…';const response=await chrome.runtime.sendMessage({type:'START_AUTO_SYNC',scope,force:scope!=='both'});button.disabled=false;button.innerHTML=original;if(!response?.ok)return toast(response?.error||'ההפעלה נכשלה');if(response.status==='already_synced_today')return toast('כל החיבורים כבר סונכרנו היום');toast(scope==='both'?'התחבר לשני אתרי הבנק; חיבור שעודכן היום ידולג':'מתבצע סנכרון ידני מחדש גם אם החשבון עודכן היום')}
async function startFibi(slot,button){const original=button.innerHTML;button.disabled=true;button.textContent='בודק חיבור לבינלאומי…';const r=await chrome.runtime.sendMessage({type:'START_FIBI',slot});button.disabled=false;button.innerHTML=original;if(!r?.ok)return toast(r?.error||'פתיחת הבינלאומי נכשלה');toast(r.status==='syncing_connected'?'נמצא חיבור פעיל — הסנכרון התחיל':'התחבר בבינלאומי; הסנכרון יתחיל אוטומטית')}
async function startLeumi(button){const original=button.innerHTML;button.disabled=true;button.textContent='מזהה חשבונות לאומי…';let r;try{r=await chrome.runtime.sendMessage({type:'START_LEUMI'})}catch(e){button.disabled=false;button.innerHTML=original;return toast(`רכיב לאומי לא נטען: ${e.message}. יש לרענן את התוסף`)}button.disabled=false;button.innerHTML=original;if(!r?.ok)return toast(r?.error||'פתיחת לאומי נכשלה');toast(r.status==='discovering'?'מזהה את חשבונות לאומי לבחירה':'התחבר ללאומי; לאחר הכניסה יוצגו החשבונות לבחירה')}
async function startDiscountBusiness(button){const original=button.innerHTML;button.disabled=true;button.textContent='מזהה ישויות בדיסקונט…';try{const r=await chrome.runtime.sendMessage({type:'START_DISCOUNT_BUSINESS'});if(!r?.ok)return toast(r?.error||'פתיחת דיסקונט עסקי נכשלה');toast(r.status==='discovering'?'נמצאו הישויות — הדשבורד מתעדכן':'התחבר לדיסקונט עסקי; לאחר הכניסה יוצגו הישויות לבחירה')}catch(e){toast(`רכיב דיסקונט לא נטען: ${e.message}. יש לרענן את התוסף`)}finally{button.disabled=false;button.innerHTML=original}}
async function startDiscountPrivate(button){const original=button.innerHTML;button.disabled=true;button.textContent='פותח דיסקונט פרטי…';try{const r=await chrome.runtime.sendMessage({type:'START_DISCOUNT_PRIVATE'});if(!r?.ok)return toast(r?.error||'פתיחת דיסקונט פרטי נכשלה');toast('התחבר לדיסקונט פרטי; לאחר הכניסה החשבון יזוהה לבחירה')}catch(e){toast(`רכיב דיסקונט פרטי לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startBtb(button){const original=button.innerHTML;button.disabled=true;button.textContent='קורא הלוואת BTB…';
  try{const r=await chrome.runtime.sendMessage({type:'START_BTB'});
    if(!r?.ok)return toast(r?.error||'קריאת ההלוואה נכשלה');
    toast(r.status==='waiting_login'?'התחבר ל-BTB ולחץ שוב על הכפתור':`הלוואה ${r.number} נקראה · יתרה ${r.balance}`);
    await load()}
  catch(e){toast(`רכיב BTB לא נטען: ${e.message}`)}
  finally{button.disabled=false;button.innerHTML=original}}
async function startMizrahi(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן מזרחי־טפחות…';try{const r=await chrome.runtime.sendMessage({type:'START_MIZRAHI'});if(!r?.ok)return toast(r?.error||'פתיחת מזרחי־טפחות נכשלה');toast(r.status==='waiting_login'?'התחבר למזרחי־טפחות ולחץ שוב על הכפתור':'סנכרון מזרחי־טפחות התחיל')}catch(e){toast(`רכיב מזרחי־טפחות לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startYahav(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן יהב…';try{const r=await chrome.runtime.sendMessage({type:'START_YAHAV'});if(!r?.ok)return toast(r?.error||'פתיחת יהב נכשלה');toast(r.status==='waiting_login'?'התחבר ליהב ולחץ שוב על הכפתור':'סנכרון יהב התחיל')}catch(e){toast(`רכיב יהב לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startIsracard(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן ישראכרט — נא להמתין…';try{const r=await chrome.runtime.sendMessage({type:'START_ISRACARD'});if(!r?.ok)return toast(r?.error||'פתיחת ישראכרט נכשלה');toast(r.status==='waiting_login'?'התחבר לישראכרט ולחץ שוב על הכפתור':`הסנכרון הסתיים: נקראו ${r.cards||0} כרטיסים, ${r.assigned||0} שויכו לחשבונות`);await load()}catch(e){toast(`רכיב ישראכרט לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startCal(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן כאל — נא להמתין…';try{const r=await chrome.runtime.sendMessage({type:'START_CAL'});if(!r?.ok)return toast(r?.error||'פתיחת כאל נכשלה');toast(r.status==='waiting_login'?'התחבר לכאל; הסנכרון יתחיל אוטומטית':'סנכרון כאל התחיל');await load()}catch(e){toast(`רכיב כאל לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
async function startMax(button){const original=button.innerHTML;button.disabled=true;button.textContent='מסנכרן MAX — נא להמתין…';try{const r=await chrome.runtime.sendMessage({type:'START_MAX'});if(!r?.ok)return toast(r?.error||'פתיחת MAX נכשלה');toast(r.status==='waiting_login'?'התחבר ל‑MAX; הסנכרון יתחיל אוטומטית':'סנכרון MAX התחיל');await load()}catch(e){toast(`רכיב MAX לא נטען: ${e.message}`)}finally{button.disabled=false;button.innerHTML=original}}
$('#syncAll').onclick=()=>startChosenSync(syncScope,$('#syncAll'));

document.querySelector('.dashboard-tabs').onclick=e=>{const tab=e.target.closest('.dashboard-tab');if(tab)setActiveView(tab.dataset.view)};
$('#movementSourceList').addEventListener('change',e=>{const box=e.target.closest('input[data-src]');if(!box)return;if(box.checked)movementSourcePick.add(box.dataset.src);else movementSourcePick.delete(box.dataset.src);box.closest('.msrc-item')?.classList.toggle('on',box.checked)});
$('#movementSourceList').addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(b)movementSourceAction(b.dataset.act)});
// ⚠ טל ראה "מופז גל" על שיק שכתוב עליו "ועד מקומי מושב יד-נתן". מכונה
// טועה, ולכן חייבת להיות דרך אנושית לתקן - בלחיצה, מכל מקום שהשם מוצג.
// ── אישור שמות: החיתוך מול העין, ההצעה כטיוטה, וטל מכריע ─────────────
// ⚠ זה לא "עוד מסך". זו ההודאה שהמודל לא קורא עברית מהסריקות האלה:
// שני שמות מומצאים אצל טל, אחד מהם אחרי ששתי קריאות "הסכימו". כל עוד
// אין אימות אמיתי, אישור אנושי הוא הדבר היחיד שהופך הצעה לנתון.
const PAYER_BANKS=['לאומי','הפועלים','דיסקונט','מזרחי טפחות','הבינלאומי','מרכנתיל','יהב','ירושלים','אגוד','מסד','אוצר החייל','פאגי','one zero','בנק הדואר','אחר'];
let payerQueue=[],payerAt=0;
// ⚠⚠ **הקיבוץ אינו אוטומטי - ובכוונה.** המדידה (ראה cheque-ocr.js)
// הראתה שטווחי המרחק של "אותו מוסר" ושל "מוסרים שונים" חופפים, ולכן כל
// סף היה מורח שם על שיקים זרים בשקט. הדמיון **מדרג** מועמדים, וטל מכריע
// מול התמונות - לחיצה אחת מכסה עשרה שיקים, בלי אף שיוך שאיש לא ראה.
function chequeCandidates(id){
 return chequeSimilarRanked(chequeHashes,id,8).filter(x=>!chequePayers[x.id]);
}
function payerPending(){return Object.keys(chequePayerGuess).filter(id=>!chequePayers[id])}
async function openPayerReview(startId){
 const st=$('#ocrChequesState');
 if(typeof chequeHashAll==='function'){
  try{if(st)st.textContent='מחשב טביעות של הבלוק המודפס…';
   await chequeHashAll({onProgress:({done,total})=>{if(st&&total)st.textContent=`טביעות ${done}/${total}`}});
   chequeHashes=(await chrome.storage.local.get({chequeHashes:{}})).chequeHashes||{};
   if(st)st.textContent='';
  }catch(e){if(st)st.textContent=''}
 }
 payerQueue=payerPending();
 if(startId){const i=payerQueue.indexOf(startId);payerQueue=i>=0?[startId,...payerQueue.filter(x=>x!==startId)]:[startId]}
 if(!payerQueue.length)return toast('אין שמות שממתינים לאישור');
 payerAt=0;$('#payerReviewModal').classList.remove('hidden');await paintPayerReview();
}
async function paintPayerReview(){
 const body=$('#payerReviewBody');if(!body)return;
 if(payerAt>=payerQueue.length){closePayerReview();return toast('הרשימה הושלמה')}
 const id=payerQueue[payerAt],g=chequePayerGuess[id]||{},m=chequePayerMeta[id]||{};
 const cands=[...new Set([g.name,g.crop,g.full,g.stamp].filter(Boolean))];
 body.innerHTML='';
 const box=document.createElement('div');box.className='payer-review';
 const count=document.createElement('div');count.className='pr-count';
 count.textContent=`${payerAt+1} מתוך ${payerQueue.length} · ${m.stamp?'נמצאה חותמת — חברה/מושב/ועד':'לא נמצאה חותמת — כנראה אדם פרטי'}`;
 const img=document.createElement('img');img.alt='הפינה הימנית-העליונה של השיק';
 const rec=await chequeGet(id).catch(()=>null);
 if(rec?.front){try{const b=await chequeCropTopRight(rec.front);img.src=URL.createObjectURL(b);img.onload=()=>URL.revokeObjectURL(img.src)}catch(e){img.src=rec.front}}
 const input=document.createElement('input');
 input.type='text';input.placeholder='שם מוסר השיק';input.value=g.name||g.crop||'';
 const bank=document.createElement('select');
 bank.innerHTML='<option value="">בנק המוסר (לא ידוע)</option>'+PAYER_BANKS.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');
 bank.value=chequePayerBank[id]||'';
 // מועמדים לאותו חשבון: מדורגים לפי דמיון, **מוצגים כתמונה**, ומסומנים
 // בידיים. אף אחד אינו מסומן מראש - הסימון הוא ההכרעה.
 const cands2=chequeCandidates(id);
 const applyNote=document.createElement('div');applyNote.className='pr-apply';
 applyNote.textContent=cands2.length?`סמן שיקים נוספים מאותו חשבון — השם והבנק יוחלו גם עליהם (${cands2.length} מועמדים דומים)`
   :'לא נמצאו שיקים נוספים לבדיקה';
 const grid=document.createElement('div');grid.className='pr-grid';
 for(const c of cands2){
  const lab=document.createElement('label');
  const cb=document.createElement('input');cb.type='checkbox';cb.value=c.id;
  const im=document.createElement('img');im.alt='בלוק מודפס של שיק מועמד';
  chequeGet(c.id).then(r=>r?.front&&chequeCropTopRight(r.front)).then(b=>{if(b){im.src=URL.createObjectURL(b);im.onload=()=>URL.revokeObjectURL(im.src)}}).catch(()=>{});
  lab.append(cb,im);grid.appendChild(lab);
 }
 const cbox=document.createElement('div');cbox.className='pr-cands';
 for(const c of cands){const b=document.createElement('button');b.type='button';b.textContent=c;
   b.onclick=()=>{input.value=c;input.focus()};cbox.appendChild(b)}
 const acts=document.createElement('div');acts.className='pr-actions';
 const save=document.createElement('button');save.type='button';save.className='pr-save';save.textContent='שמור והמשך';
 const skip=document.createElement('button');skip.type='button';skip.textContent='דלג';
 const full=document.createElement('button');full.type='button';full.textContent='הצג שיק מלא';
 save.onclick=async()=>{
   const name=input.value.trim(),bk=bank.value;
   if(name){chequePayers[id]=name;chequePayerSource[id]='manual'}else{delete chequePayers[id];delete chequePayerSource[id]}
   if(bk)chequePayerBank[id]=bk;else delete chequePayerBank[id];
   delete chequePayerGuess[id];
   // ⚠ ההחלה על הקבוצה קורית **רק כשיש שם**: להחיל "ריק" על עשרה שיקים
   // היה מוחק אישורים בלי שאיש ביקש.
   let spread=0;
   const picked=[...grid.querySelectorAll('input:checked')].map(x=>x.value);
   if(name)for(const other of picked){
     chequePayers[other]=name;chequePayerSource[other]='manual';if(bk)chequePayerBank[other]=bk;
     delete chequePayerGuess[other];spread++;
   }
   await chrome.storage.local.set({chequePayers,chequePayerBank,chequePayerGuess,chequePayerSource});
   payerQueue=payerQueue.filter((x,i)=>i!==payerAt&&!picked.includes(x));
   if(spread)toast(`הוחל גם על ${spread} שיקים מאותו חשבון`);
   await paintPayerReview();render();scheduleMovementSearch();refreshPayerButton();
 };
 skip.onclick=async()=>{payerAt++;await paintPayerReview()};
 full.onclick=()=>{if(rec?.front)showCheque(rec,{date:''})};
 input.onkeydown=e=>{if(e.key==='Enter')save.click()};
 acts.append(save,skip,full);
 box.append(count,img,cbox,input,bank,applyNote,grid,acts);
 body.appendChild(box);input.focus();input.select();
}
// ── שיקים לפי חשבון המוסר ─────────────────────────────────────────────
// ⚠ **הקיבוץ הוא לפי הספרות המודפסות בתחתית השיק**, ולא לפי דמיון חזותי
// (שנמדד ונפסל ב-1.83.0). חשבון זהה = אותו מוסר, בוודאות שאין לתמונה.
function chequeAccountGroups(){
 const by=new Map();
 for(const [id,a] of Object.entries(chequeAccounts)){
  const key=chequeAccountKey(a);
  if(!key)continue;
  const g=by.get(key)||{key,bank:a.bank,branch:a.branch,account:a.account,ids:[],names:new Set()};
  g.ids.push(id);
  if(chequePayers[id])g.names.add(chequePayers[id]);
  by.set(key,g);
 }
 // ⚠ שיקים שהחשבון שלהם לא נקרא אינם "חשבון ריק" - הם קבוצה נפרדת,
 // כי איחודם היה מקבץ מוסרים שונים תחת מפתח ריק.
 const unread=Object.keys(chequeHashes).concat(Object.keys(chequeAccounts))
   .filter((v,i,arr)=>arr.indexOf(v)===i)
   .filter(id=>!chequeAccountKey(chequeAccounts[id]||{}));
 return{groups:[...by.values()].sort((x,y)=>y.ids.length-x.ids.length),unread};
}
// ⚠⚠ 31.08.2026 - טל: "לחצתי על שיקים לפי חשבון מוסר, זה לא עושה כלום,
// אין מונה." שתי סיבות, ושתיהן תוקנו:
//   1. **הכול היה מאחורי `await`**: `chequeOcrAvailability()` נקרא לפני
//      שנפתח משהו, ואם הוא תולה (או שהקריאה למסד איטית) - הלחיצה נראית
//      כאילו לא קרה כלום. **עכשיו החלון נפתח ראשון, ורק אחר כך בודקים.**
//   2. **המונה נכתב ל-#ocrChequesState** שיושב בשורת הגיבוי הרחוקה. עכשיו
//      כל המצב מוצג **בתוך החלון עצמו**, מול העיניים.
const nChq=n=>n===1?'שיק אחד':`${n} שיקים`;
function chequeAccountsStatus(text){const el=$('#chequeAccountsStatus');if(el)el.textContent=text||''}
// ⚠⚠ 31.08.2026 - שלוש הערות של טל, וכולן נכונות:
//   1. "אין צילום שיק, איך אני ארשום שם" - שורת מספרים אינה אומרת למי
//      היא שייכת. **לכל חשבון מוצג עכשיו הבלוק המודפס** של אחד משיקיו.
//   2. "89 שיקים לא זוהה חשבון" - הקריאה נכשלה על רובם.
//   3. "אין אפשרות להפקיד שיק ללא חשבון" - **נכון, ולכן "לא זוהה" הוא
//      כשל קריאה ולא קטגוריה.** הוא מוצג ככזה, עם דרך ידנית לתקן אותו.
let acctUnreadShown=12;
function acctThumb(id,kind){
 const fig=document.createElement('img');
 fig.className='acct-thumb';fig.alt=kind==='micr'?'שורת החשבון בתחתית השיק':'הבלוק המודפס של השיק';
 fig.dataset.zoom=id;fig.title='לחיצה להגדלה';
 chequeGet(id).then(r=>{if(!r?.front)return null;return kind==='micr'?chequeCropMicr(r.front):chequeCropTopRight(r.front)})
  .then(b=>{if(b){fig.src=URL.createObjectURL(b);fig.onload=()=>URL.revokeObjectURL(fig.src)}}).catch(()=>{});
 return fig;
}
async function openChequeAccounts(){
 const box=$('#chequeAccountsBody');if(!box)return;
 $('#chequeAccountsModal').classList.remove('hidden');
 const {groups,unread}=chequeAccountGroups();
 const named=groups.reduce((n,g)=>n+g.ids.length,0);
 let all=[];try{all=[...await chequeKeys()]}catch(e){}
 const missing=all.filter(id=>!chequeAccounts[id]);
 // נכשלו = נקראו, נשמרו, ולא הפיקו מבנה תקין. אלה שניתן לנסות שוב.
 const failed=all.filter(id=>{const a=chequeAccounts[id];return a&&!a.manual&&!chequeAccountKey(a)});
 const stuck=[...new Set([...unread,...missing])];
 box.innerHTML=`<p class="muted">${nChq(all.length)} שמורים · ${named} שויכו ל-${groups.length} חשבונות`
  +`${stuck.length?` · <b>${stuck.length} בלי חשבון</b>`:''}.</p>`
  +`<div class="acct-bar">${missing.length?`<button type="button" id="readAccountsNow">קרא את החשבון של ${nChq(missing.length)}</button>`:''}`
  +`${failed.length?`<button type="button" id="retryFailedAccounts" class="secondary">נסה שוב את ${nChq(failed.length)} שנכשלו</button>`:''}`
  +`<span id="chequeAccountsStatus" class="muted"></span></div>`
  +(groups.length?`<div class="acct-table"><table><thead><tr><th>השיק</th><th>בנק</th><th>סניף</th><th>חשבון</th><th>שיקים</th><th>שם המוסר</th><th></th></tr></thead><tbody>`
   +groups.map(g=>`<tr data-acct="${esc(g.key)}"><td class="acct-pic" data-thumb="${esc(g.ids[0])}"></td>`
    +`<td>${esc(g.bank)}</td><td>${esc(g.branch)}</td><td>${esc(g.account)}</td>`
    +`<td><b>${g.ids.length}</b></td>`
    +`<td>${g.names.size?esc([...g.names].join(' / ')):'<span class="muted">—</span>'}</td>`
    +`<td><button type="button" class="acct-name" data-acct="${esc(g.key)}">${g.names.size?'שינוי שם':'קבע שם לכל '+g.ids.length}</button></td></tr>`).join('')
   +`</tbody></table></div>`:'')
  +(stuck.length?`<div class="acct-stuck"><h3>החשבון לא נקרא — ${nChq(stuck.length)}</h3>`
   +`<p class="muted">כל שיק נמשך מחשבון כלשהו, ולכן אלה אינם "בלי חשבון" — הקריאה האוטומטית פשוט נכשלה עליהם. `
   +`הקלד את הספרות מהשורה התחתונה של השיק (בנק · סניף · חשבון), או קבע שם ישירות.</p>`
   +`<div id="acctStuckGrid" class="acct-stuck-grid"></div>`
   +(stuck.length>acctUnreadShown?`<div class="acct-bar"><button type="button" id="acctMore">הצג עוד ${Math.min(12,stuck.length-acctUnreadShown)}</button></div>`:'')
   +`</div>`:'');
 // התמונות נטענות אחרי הכתיבה, כדי שהחלון יופיע מיד
 for(const td of box.querySelectorAll('.acct-pic'))td.appendChild(acctThumb(td.dataset.thumb,'top'));
 const grid=box.querySelector('#acctStuckGrid');
 if(grid)for(const id of stuck.slice(0,acctUnreadShown)){
  const card=document.createElement('div');card.className='acct-card';
  card.appendChild(acctThumb(id,'top'));
  card.appendChild(acctThumb(id,'micr'));
  const inp=document.createElement('input');inp.type='text';inp.placeholder='בנק סניף חשבון — למשל 20 433 251592';
  inp.dataset.acctFor=id;
  const nm=document.createElement('button');nm.type='button';nm.className='acct-one';nm.dataset.one=id;nm.textContent='קבע שם לשיק הזה';
  card.append(inp,nm);grid.appendChild(card);
 }
}
// ⚠ הקלדה ידנית של החשבון היא **הכרעה של טל**, ולכן היא מסומנת manual
// ואינה נדרסת בקריאה אוטומטית הבאה.
// ── תיקון הסריקה מול הייצוא ────────────────────────────────────────────
// ⚠⚠ **הסכום מגיע מהבנק, לא מקריאת תמונה.** הוא הדבר היחיד בשרשרת שאינו
// יכול להיות שגוי, ולכן הוא העוגן. הקריאה הרועשת רק בוחרת בין המועמדים
// שנשארו - וזה בדיוק ההבדל בין "לנחש שם" ל"לבחור מתוך 141".
function chequeTxIndex(){
 const by={};
 for(const a of accounts)for(const t of a.transactions||[]){
  if(!t.cheque||!t.reference)continue;
  by[chequeId(accountKey(a),t.reference)]={date:t.date,amount:Math.abs(Number(t.chequeAmount)||Number(t.credit)||0)};
 }
 return by;
}
async function applyLedger(){
 if(!chequeLedger.length)return toast('לא יובא ייצוא הנהלת חשבונות');
 // ⚠ עוברים על **התנועות** ולא על הצילומים: הזיהוי אינו תלוי בתמונה.
 const tx=chequeTxIndex(),ids=Object.keys(tx);
 if(!ids.length)return toast('לא נמצאו תנועות שיק בחשבונות — סנכרן לאומי תחילה');
 let fixed=0,confirmed=0,unsure=0,none=0;
 const report=[];
 for(const id of ids){
  const info=tx[id];
  const acc=chequeAccounts[id]||{};
  const micr=[acc.raw||'',acc.bank,acc.branch,acc.account].join(' ');
  const pick=ledgerPick(chequeLedger,{amount:info.amount,date:info.date,micr,nameGuess:(chequePayerGuess[id]||{}).name});
  if(!pick.row){none++;continue}
  if(pick.confidence==='low'){unsure++;continue}
  const before=chequeAccountKey(acc),after=ledgerKey(pick.row);
  const nameBefore=chequePayers[id]||(chequePayerGuess[id]||{}).name||'';
  report.push({id,amount:info.amount,date:info.date,nameBefore,nameAfter:pick.row.name,
   accBefore:before,accAfter:after,confidence:pick.confidence,reason:pick.reason});
  // ⚠ הייצוא הוא האמת: הוא נכתב בהנהלת החשבונות, לא נקרא מתמונה.
  chequePayers[id]=pick.row.name;
  chequePayerSource[id]='ledger';
  if(after)chequeAccounts[id]={bank:pick.row.bank,branch:pick.row.branch,account:pick.row.account,
    raw:acc.raw||'',agree:true,fromLedger:true};
  delete chequePayerGuess[id];
  // ⚠ "תוקן" נמדד לפי **השם** ולא לפי החשבון: זה מה שהמסך מציג, וזה
  // מה שטל רואה. מונה שסופר משהו אחר מהתצוגה הוא מלכודת.
  if(nameBefore&&nameBefore!==pick.row.name)fixed++;else confirmed++;
 }
 await chrome.storage.local.set({chequePayers,chequeAccounts,chequePayerGuess,chequePayerSource,chequeLedgerReport:report.slice(0,300)});
 render();scheduleMovementSearch();refreshPayerButton();
 showLedgerReport({total:ids.length,report,fixed,confirmed,unsure,none});
 return{fixed,confirmed,unsure,none,report};
}
function showLedgerReport({total,report,fixed,confirmed,unsure,none}){
 const box=$('#chequeAccountsBody');if(!box)return;
 $('#chequeAccountsTitle').textContent='תוצאת הזיהוי מול הנהלת החשבונות';
 $('#chequeAccountsModal').classList.remove('hidden');
 const changed=report.filter(r=>r.nameBefore&&r.nameBefore!==r.nameAfter);
 const added=report.filter(r=>!r.nameBefore);
 box.innerHTML=`<div class="ledger-sum">`
  +`<div><small>תנועות שיק בחשבונות</small><strong>${total}</strong></div>`
  +`<div><small>זוהו מהייצוא</small><strong>${report.length}</strong></div>`
  +`<div><small>קיבלו שם לראשונה</small><strong>${added.length}</strong></div>`
  +`<div><small>תיקנו קריאה שגויה</small><strong>${changed.length}</strong></div>`
  +`<div><small>לא הוכרעו</small><strong>${unsure}</strong></div>`
  +`<div><small>אין שורה בסכום</small><strong>${none}</strong></div></div>`
  +(changed.length?`<h3>מה תוקן</h3><div class="acct-table"><table><thead><tr><th>תאריך</th><th>סכום</th><th>נקרא בטעות</th><th>האמת מהייצוא</th></tr></thead><tbody>`
    +changed.slice(0,40).map(r=>`<tr><td>${esc(r.date)}</td><td>${money(r.amount)}</td>`
     +`<td class="was-wrong">${esc(r.nameBefore)}</td><td><b>${esc(r.nameAfter)}</b></td></tr>`).join('')
    +`</tbody></table></div>`:'')
  +(added.length?`<h3>שמות שנוספו</h3><div class="acct-table"><table><thead><tr><th>תאריך</th><th>סכום</th><th>שם המוסר</th><th>חשבון</th><th>ודאות</th></tr></thead><tbody>`
    +added.slice(0,60).map(r=>`<tr><td>${esc(r.date)}</td><td>${money(r.amount)}</td><td><b>${esc(r.nameAfter)}</b></td>`
     +`<td>${esc(r.accAfter||'—')}</td><td>${esc(r.confidence)}</td></tr>`).join('')
    +`</tbody></table></div>`:'')
  +(!report.length?`<div class="empty">אף תנועה לא הותאמה. בדוק שהסכומים בייצוא תואמים לסכומי ההפקדה בבנק.</div>`:'');
}
$('#ledgerFile')?.addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{
  const rows=ledgerParse(await f.text());
  if(!rows.length)return toast('לא נמצאו שורות בקובץ');
  chequeLedger=rows;
  await chrome.storage.local.set({chequeLedger:rows});
  const accts=new Set(rows.map(ledgerKey).filter(Boolean)).size;
  toast(`יובאו ${rows.length} המחאות · ${accts} חשבונות`);
  await applyLedger();
 }catch(err){toast(`הייבוא נכשל: ${err.message}`)}
 finally{e.target.value=''}
});
async function setAccountManually(id,raw){
 const parsed=chequeParseMicr(raw);
 if(!chequeAccountKey(parsed))return toast('לא זוהה מבנה של בנק · סניף · חשבון — נסה שוב');
 chequeAccounts[id]={...parsed,agree:true,manual:true};
 await chrome.storage.local.set({chequeAccounts});
 toast(`שויך לחשבון ${chequeAccountKey(parsed)}`);
 await openChequeAccounts();
}
// הקריאה עצמה - מופעלת מתוך החלון, ומדווחת בתוכו.
async function readChequeAccounts(retryFailed=false){
 const btn=$(retryFailed?'#retryFailedAccounts':'#readAccountsNow');if(btn)btn.disabled=true;
 chequeAccountsStatus('בודק זמינות של המודל…');
 // ⚠ תקרת זמן: קריאה שתולה השאירה את הלחיצה בלי שום סימן חיים.
 const avail=await Promise.race([
   chequeOcrAvailability().catch(()=>'unsupported'),
   new Promise(r=>setTimeout(()=>r('timeout'),8000))]);
 if(avail==='unsupported'||avail==='unavailable'||avail==='timeout'){
  chequeAccountsStatus(avail==='timeout'?'המודל לא השיב תוך 8 שניות — נסה שוב, או שאין מודל זמין בדפדפן הזה'
    :'המודל המובנה של Chrome אינו זמין כאן — אי אפשר לקרוא את שורת החשבון');
  if(btn)btn.disabled=false;return;
 }
 if(avail!=='available'&&!confirm(['Chrome צריך להוריד פעם אחת את מודל הקריאה למחשב הזה.',
   'הכול נשאר מקומי — שום צילום לא יוצא מהמחשב.','להתחיל?'].join(String.fromCharCode(10)))){
  chequeAccountsStatus('');if(btn)btn.disabled=false;return;
 }
 try{
  const r=await chequeAccountsAll({retryFailed,
   onDownload:l=>chequeAccountsStatus(`מוריד מודל… ${Math.round(l*100)}%`),
   onProgress:({done,total,read})=>chequeAccountsStatus(`קורא ${done} מתוך ${total} · זוהו ${read} חשבונות`)});
  chequeAccounts=(await chrome.storage.local.get({chequeAccounts:{}})).chequeAccounts||{};
  await openChequeAccounts();
  chequeAccountsStatus(`הסתיים — ${r.read} חשבונות זוהו מתוך ${r.total}`);
 }catch(e){chequeAccountsStatus(`הקריאה נכשלה: ${e.message}`);if(btn)btn.disabled=false}
}
// ⚠⚠ זו ה"מכה אחת" שטל ביקש: שם אחד נקבע לכל השיקים של אותו **חשבון**.
// מותר כאן דווקא משום שהמפתח הוא ספרות מודפסות ולא ניחוש חזותי.
async function nameWholeAccount(key){
 const {groups}=chequeAccountGroups();
 const g=groups.find(x=>x.key===key);if(!g)return;
 const cur=[...g.names][0]||'';
 const name=prompt(`שם המוסר עבור חשבון ${key} (${g.ids.length} שיקים):`,cur);
 if(name===null)return;
 const clean=String(name).trim();
 const bank=prompt('בנק המוסר (אפשר להשאיר ריק):',chequePayerBank[g.ids[0]]||'');
 if(bank===null)return;
 for(const id of g.ids){
  if(clean){chequePayers[id]=clean;chequePayerSource[id]='manual'}else{delete chequePayers[id];delete chequePayerSource[id]}
  if(String(bank).trim())chequePayerBank[id]=String(bank).trim();
  delete chequePayerGuess[id];
 }
 await chrome.storage.local.set({chequePayers,chequePayerBank,chequePayerGuess,chequePayerSource});
 toast(clean?`${clean} — הוחל על ${g.ids.length} שיקים`:`השם נמחק מ-${g.ids.length} שיקים`);
 await openChequeAccounts();render();scheduleMovementSearch();refreshPayerButton();
}
async function nameOneCheque(id){
 const name=prompt('שם המוסר:',chequePayers[id]||'');
 if(name===null)return;
 const clean=String(name).trim();
 if(clean){chequePayers[id]=clean;chequePayerSource[id]='manual'}else{delete chequePayers[id];delete chequePayerSource[id]}
 delete chequePayerGuess[id];
 await chrome.storage.local.set({chequePayers,chequePayerGuess,chequePayerSource});
 toast(clean?`נשמר: ${clean}`:'השם נמחק');
 await openChequeAccounts();render();scheduleMovementSearch();refreshPayerButton();
}
$('#closeChequeAccounts')?.addEventListener('click',()=>$('#chequeAccountsModal').classList.add('hidden'));
$('#chequeAccountsModal')?.addEventListener('click',e=>{
 const z=e.target.closest('[data-zoom]');
 if(z)return chequeGet(z.dataset.zoom).then(r=>{if(r?.front)showCheque(r,{date:''});else toast('הצילום לא נמצא')});
 if(e.target.id==='readAccountsNow')return readChequeAccounts();
 if(e.target.id==='retryFailedAccounts')return readChequeAccounts(true);
 if(e.target.id==='acctMore'){acctUnreadShown+=12;return openChequeAccounts()}
 const one=e.target.closest('.acct-one');if(one)return nameOneCheque(one.dataset.one);
 const b=e.target.closest('.acct-name');
 if(b)return nameWholeAccount(b.dataset.acct);
 if(e.target.id==='chequeAccountsModal')$('#chequeAccountsModal').classList.add('hidden');
});
// הקלדת החשבון: Enter מספיק, בלי כפתור נוסף לכל כרטיס.
$('#chequeAccountsModal')?.addEventListener('keydown',e=>{
 const inp=e.target.closest('input[data-acct-for]');
 if(inp&&e.key==='Enter')setAccountManually(inp.dataset.acctFor,inp.value);
});
// ⚠ הלחיצה **פותחת מיד**, בלי שום await לפני כן.
$('#chequeAccounts')?.addEventListener('click',()=>{openChequeAccounts().catch(e=>toast(`פתיחת הדוח נכשלה: ${e.message}`))});
function closePayerReview(){$('#payerReviewModal').classList.add('hidden')}
$('#closePayerReview')?.addEventListener('click',closePayerReview);
$('#payerReviewModal')?.addEventListener('click',e=>{if(e.target.id==='payerReviewModal')closePayerReview()});
$('#reviewPayers')?.addEventListener('click',()=>openPayerReview());
function refreshPayerButton(){const b=$('#reviewPayers');if(!b)return;const n=payerPending().length;
 b.textContent=n?`אישור שמות מוסרים (${n})`:'אישור שמות מוסרים';b.disabled=!n}
async function editChequePayer(id){
 const cur=chequePayers[id]||'',d=chequePayerDoubt[id];
 const nl=String.fromCharCode(10);
 const m=chequePayerMeta[id]||{};
 const hint=d?[`הקריאות לא הסכימו:`,`· פינה ימנית: ${d.crop||'(ריק)'}`,`· שיק מלא: ${d.full||'(ריק)'}`,
   d.stamp?`· חותמת: ${d.stamp}`:'· לא נמצאה חותמת (שיק פרטי)','',''].join(nl):'';
 const val=prompt(hint+'שם מוסר השיק (ריק = מחיקה):',cur||d?.crop||d?.full||'');
 if(val===null)return;
 const name=String(val).trim();
 if(name){chequePayers[id]=name;chequePayerSource[id]='manual'}else{delete chequePayers[id];delete chequePayerSource[id]}
 delete chequePayerDoubt[id];
 await chrome.storage.local.set({chequePayers,chequePayerDoubt,chequePayerSource});
 toast(name?`נשמר: ${name}`:'השם נמחק');render();scheduleMovementSearch();
}
document.addEventListener('click',e=>{const p=e.target.closest('[data-payer]');if(!p)return;
 // הצעה שלא אושרה נפתחת מול החיתוך; שם מאושר נערך בשורה אחת.
 if(p.classList.contains('payer-guess'))openPayerReview(p.dataset.payer);else editChequePayer(p.dataset.payer)});
$('#movementSearchResults').addEventListener('click',async e=>{
 const bd=e.target.closest('button[data-bd]');
 if(bd){movementBreakdown=bd.dataset.bd;paintMovementBreakdown();return}
 const chq=e.target.closest('.cheque-view');if(!chq)return;
 chq.disabled=true;chq.textContent='פותח…';
 const record=await chequeGet(chq.dataset.cheque).catch(()=>null);
 chq.disabled=false;chq.textContent='צילום שיק';
 // הצילום נבדק כקיים בזמן הרינדור; אם נעלם מאז (ניקוי יתומים, שחזור
 // גיבוי) אומרים זאת במפורש במקום לפתוח חלון ריק.
 if(record?.front)showCheque(record,{date:chq.dataset.date,amount:chq.dataset.amount});else toast('צילום השיק אינו במסד המקומי');
});
$('#movementSearchPanel').addEventListener('input',scheduleMovementSearch);$('#movementSearchPanel').addEventListener('change',scheduleMovementSearch);$('#clearMovementSearch').onclick=()=>{for(const input of document.querySelectorAll('#movementSearchPanel input'))input.value='';const kindPick=$('#movementSearchKind');if(kindPick)kindPick.value='both';movementSourcePick.clear();movementBreakdown='none';scheduleMovementSearch()};
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
function showCheque(record,data){const body=$('#chequeModalBody');// ⚠ textContent ולא innerHTML — הכותרת נושאת אסמכתא ושם מוסר שמקורם
// בקריאת מכונה, ולא בקוד. הם נכנסים כטקסט בלבד.
$('#chequeModalTitle').textContent=`צילום שיק · ${data.date||''} · אסמכתא ${record.reference}${chequePayers[record.id]?` · ${chequePayers[record.id]}`:''}`;
body.innerHTML=`<div class="cheque-shots"><figure><figcaption>קדמי</figcaption><img alt="צילום תמונת שיק מלפנים" src="${esc(record.front)}"></figure>${record.back?`<figure><figcaption>אחורי</figcaption><img alt="צילום תמונת שיק מאחור" src="${esc(record.back)}"></figure>`:''}</div>`+`<p class="cheque-claim">התוסף שייך את הצילום הזה לתנועה: <b>${esc(data.date||'')}</b>${data.amount?` · <b>${money(Number(data.amount)||0)}</b>`:''} · אסמכתא <b>${esc(record.reference||'')}</b>. אם המספרים שעל השיק אינם אלה — השיוך שגוי, ויש לדווח.</p>`+`${record.info?`<p class="cheque-note-block"><b>פרטים מחלון השיק בלאומי:</b> ${esc(record.info)}</p>`:''}<small class="sync-detail">נשמר מקומית ${record.savedAt?new Date(record.savedAt).toLocaleString('he-IL'):''} — נפתח גם ללא חיבור לבנק.</small>`;
$('#chequeModal').classList.remove('hidden');
if(typeof chequeCropTopRight==='function')chequeCropTopRight(record.front).then(b=>{
 const box=$('#chequeModalBody');if(!box||$('#chequeModal').classList.contains('hidden'))return;
 const wrap=document.createElement('figure');wrap.className='cheque-crop';
 const cap=document.createElement('figcaption');cap.textContent='האזור שנשלח לזיהוי השם';
 const img=document.createElement('img');img.alt='הפינה הימנית-העליונה של השיק';
 img.src=URL.createObjectURL(b);img.onload=()=>URL.revokeObjectURL(img.src);
 wrap.append(cap,img);box.appendChild(wrap);
}).catch(()=>{})}
$('#closeChequeModal').onclick=()=>$('#chequeModal').classList.add('hidden');
$('#chequeModal').onclick=e=>{if(e.target.id==='chequeModal')e.currentTarget.classList.add('hidden')};
$('#allLoans').onclick=async e=>{if(!e.target.closest('#toggleMortgages'))return;hideMortgages=!hideMortgages;await chrome.storage.local.set({hideMortgages});render();toast(hideMortgages?'המשכנתאות הוסרו מהתצוגה ומהסיכומים':'המשכנתאות הוחזרו לתצוגה ולסיכומים')};
const chequeStyles=document.createElement('style');chequeStyles.textContent='#stopSync{margin-top:6px;display:block}.collect-since select{margin-inline-start:8px;font:inherit;padding:4px 8px;border-radius:8px}.collect-since{align-items:center}.auto-sync{display:inline-flex;align-items:center;gap:6px;font-weight:800;color:#173b86;background:#eef4ff;border-radius:999px;padding:8px 14px}.choice-id{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.02em;direction:ltr;text-align:right;display:block}.cheque-shots{display:grid;gap:14px}.cheque-shots figure{margin:0}.cheque-shots figcaption{font-weight:800;margin-bottom:6px;color:#6d788b}.cheque-shots img{width:100%;max-width:640px;border:1px solid #e5eaf1;border-radius:10px;display:block}';document.head.appendChild(chequeStyles);
$('#accounts').onchange=async e=>{const select=e.target.closest('.account-kind');if(!select)return;accountKinds[select.dataset.key]=select.value;await chrome.storage.local.set({accountKinds});render()};
// ⚠ הקליטה היא ייבוא מקומי: הקובץ נקרא בדפדפן ונשמר ב-chrome.storage,
// ולא נשלח לשום מקום.
// ⚠ הקיפול נרשם על שני הצדדים באותו מאזין, ורץ **לפני** מאזיני העריכה
// והמחיקה; לחיצה בתוך input או על כפתור הסרה אינה מקפלת.
for(const sel of ['#balanceAssets','#balanceLiabs'])$(sel)?.addEventListener('click',e=>{
  if(e.target.closest('input,button'))return;
  const row=e.target.closest('.fold');if(!row)return;
  const key=row.dataset.key;if(!key)return;
  if(balanceOpen.has(key))balanceOpen.delete(key);else balanceOpen.add(key);
  renderBalance()});
$('#balanceLiabAdd')?.addEventListener('submit',async e=>{e.preventDefault();
  await blAdd($('#blName').value,$('#blGroup').value,$('#blValue').value);
  $('#blName').value='';$('#blValue').value='';$('#blName').focus()});
$('#balanceLiabs')?.addEventListener('change',e=>{const cell=e.target.closest('.bl-cell');if(!cell)return;
  blEdit(cell.closest('tr').dataset.id,cell.dataset.field,cell.value)});
$('#balanceLiabs')?.addEventListener('click',e=>{const b=e.target.closest('.bl-remove');
  if(b)blRemove(b.closest('tr').dataset.id)});
// שמירת סוג הלוואה: ערך ריק = חזרה לירושה מהחשבון (מוחקים את הדריסה).
$('#allLoans')?.addEventListener('change',async e=>{const sel=e.target.closest('.loan-kind');if(!sel)return;
  const key=decodeURIComponent(sel.dataset.key);
  if(sel.value)loanKinds[key]=sel.value;else delete loanKinds[key];
  await chrome.storage.local.set({loanKinds});render()});
$('#balanceAssetAdd')?.addEventListener('submit',async e=>{e.preventDefault();
  await baAdd($('#baName').value,$('#baGroup').value,$('#baValue').value);
  $('#baName').value='';$('#baValue').value='';$('#baName').focus()});
$('#balanceAssets')?.addEventListener('change',e=>{const cell=e.target.closest('.ba-cell');if(!cell)return;
  baEdit(cell.closest('tr').dataset.id,cell.dataset.field,cell.value)});
$('#balanceAssets')?.addEventListener('click',e=>{const b=e.target.closest('.ba-remove');
  if(b)baRemove(b.closest('tr').dataset.id)});
$('#realEstateAdd')?.addEventListener('submit',async e=>{e.preventDefault();
  await reAdd($('#reAddress').value,$('#reCity').value,$('#reValue').value);
  $('#reAddress').value='';$('#reCity').value='';$('#reValue').value='';$('#reAddress').focus()});
$('#realEstateTable')?.addEventListener('change',e=>{const cell=e.target.closest('.re-cell');if(!cell)return;
  reEdit(cell.closest('tr').dataset.id,cell.dataset.field,cell.value)});
$('#realEstateTable')?.addEventListener('click',e=>{const b=e.target.closest('.re-remove');
  if(b)reRemove(b.closest('tr').dataset.id)});
$('#maslakaFile')?.addEventListener('change',e=>{maslakaLoadFiles(e.target.files);e.target.value=''});
$('#maslakaClear')?.addEventListener('click',async()=>{maslaka=null;await chrome.storage.local.remove('maslaka');renderMaslaka();toast('נתוני המסלקה נוקו')});
$('#confirmSelection').onclick=async()=>{document.querySelectorAll('.discovered-kind').forEach(s=>accountKinds[s.dataset.key]=s.value);const keys=[...document.querySelectorAll('#discoveredAccounts input:checked')].map(x=>x.value);if(!keys.length)return toast('יש לבחור לפחות חשבון אחד');/* ⚠ 21.08.2026 — כאן נכתבו לאחסון **רק** המפתחות שסומנו בתיבת הזיהוי, ולכן אישור ישות חדשה מחק מן הבחירה את הישויות שכבר סונכרנו, והן נשרו מן הסנכרון האוטומטי. עכשיו מוסרים רק מפתחות שמופיעים בתיבה ולא סומנו, ושאר הבחירה נשמרת. *//* ⚠ 22.08.2026 — נמדד: בזרימת לאומי הופיעו בתיבה גם ארבע ישויות דיסקונט —
     שריד מזיהוי דיסקונט שנכשל ולכן לא נוקה. הן לא סומנו, וההסרה הפילה אותן
     מ-selectedAccountKeys: נשאר leumi|921-348300 בלבד, והסנכרון האוטומטי הפסיק
     לרענן את דיסקונט. הנתונים לא נפגעו — רק הבחירה. אישור של בנק אחד אינו
     אמירה על בנק אחר, ולכן ההסרה מוגבלת עכשיו למקורות שמופיעים בסבב הזה. */
  const sourceOf=k=>String(k).includes('|')?String(k).split('|')[0]:'business';
  const roundSources=new Set(keys.map(sourceOf));
  const inBox=new Set(discovered.map(a=>a.key).filter(k=>roundSources.has(sourceOf(k))));selectedKeys=[...new Set([...selectedKeys.filter(k=>!inBox.has(k)),...keys])];await chrome.storage.local.set({selectedAccountKeys:selectedKeys,accountKinds});const button=$('#confirmSelection');button.disabled=true;button.textContent='מסנכרן את החשבונות שנבחרו…';const response=await chrome.runtime.sendMessage({type:'SYNC_SELECTED',keys});button.disabled=false;button.textContent='אישור וסנכרון המסומנים';if(!response?.ok)return toast(response?.error||'הסנכרון נכשל');toast(`${response.count} חשבונות סונכרנו`);await load()};
function toast(text){const el=$('#toast');el.textContent=text;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4500)}
function renderLoansTable(){const allRows=[],seen=new Set();for(const a of accounts){const ownerKey=`${a.branch}-${a.accountNumber}`;for(const l of a.loans||[]){if(!l||(Number(l.balance)<=0&&Number(l.nextPayment)<=0)||l.accountKey&&l.accountKey!==ownerKey)continue;if(accountFilter!=='both'&&loanKindOf(a,l)!==accountFilter)continue;
const fingerprint=[a.source,ownerKey,l.type,l.originalPrincipal,l.balance,l.endDate,l.nextPayment,l.nextPaymentDate,l.interest].join('|');if(seen.has(fingerprint))continue;seen.add(fingerprint);allRows.push({account:a,loan:l})}}allRows.sort((x,y)=>String(x.account.sourceLabel).localeCompare(String(y.account.sourceLabel),'he')||String(x.account.branch).localeCompare(String(y.account.branch),'he')||String(x.account.accountNumber).localeCompare(String(y.account.accountNumber),'he')||Number(y.loan.balance||0)-Number(x.loan.balance||0));const box=$('#allLoans'),hasMortgages=allRows.some(r=>r.loan.isMortgage),rows=hideMortgages?allRows.filter(r=>!r.loan.isMortgage):allRows,toggle=hasMortgages?`<button type="button" id="toggleMortgages" class="button secondary">${hideMortgages?'החזר משכנתאות':'הסר משכנתאות'}</button>`:'';if(!rows.length){box.innerHTML=`${toggle}<div class="empty">לא נמצאו הלוואות בחשבונות המוצגים.</div>`;return}const short=v=>{const s=String(v||'').replace(/\s+/g,' ').trim();return s&&s.length<=60?s:'—'},remaining=l=>{const m=String(l.installments||'').match(/(\d+)\s*\/\s*(\d+)/);if(m){const paid=Number(m[1]),total=Number(m[2]);return total>=paid?`${total-paid}/${total}`:'—'}const left=Number(l.remainingInstallments),total=Number(l.totalInstallments);
  if(Number.isFinite(left)&&left>=0&&Number.isFinite(total)&&total>0)return `${left}/${total}`;
  // ⚠ 18.08.2026 — לאומי אינו מחזיר מספר תשלומים כלל: ברשומה שלו אין installments,
  // בעוד שפועלים מחזיר "8/71". לכן העמודה הופיעה ריקה דווקא בהלוואה של לאומי.
  // כשיש תאריך התחלה, תאריך סיום ותשלום חודשי — המספר נגזר מהתאריכים, ומסומן ב-~
  // כדי שלא ייקרא כנתון שהבנק מסר.
  const loanMonths=(from,to)=>{const part=v=>{const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m)return null;const y=Number(m[3]);return{y:y<100?2000+y:y,m:Number(m[2])}};
    const a2=part(from),b2=part(to);return a2&&b2?(b2.y-a2.y)*12+(b2.m-a2.m):null};
  const allMonths=loanMonths(l.startDate,l.endDate),leftMonths=loanMonths(l.nextPaymentDate,l.endDate);
  if(Number.isFinite(allMonths)&&allMonths>0&&Number.isFinite(leftMonths)&&leftMonths>=0)return `~${leftMonths+1}/${allMonths+1}`;
  return '—'};const monthly=rows.reduce((sum,row)=>sum+(Number(row.loan.nextPayment)||0),0);box.innerHTML=`${toggle}<div class="loans-table-wrap"><table class="loans-table"><thead><tr><th>בנק וחשבון</th><th>יתרה</th><th>תשלומים שנותרו</th><th>תשלום קרוב</th><th>תשלום סופי</th><th>ריבית</th><th>החזר קרוב</th><th>סוג</th></tr></thead><tbody>${rows.map(({account:a,loan:l})=>`<tr><td><b>${esc(a.sourceLabel||'בנק')}</b> · ${esc(a.branch)}-${esc(a.accountNumber)} ${l.isMortgage?'<span class="mortgage-tag">משכנתא</span>':''}</td><td>${l.balance==null?'—':money(l.balance)}</td><td dir="ltr">${esc(remaining(l))}</td><td>${esc(short(l.nextPaymentDate))}</td><td>${esc(short(l.endDate))}</td><td title="${esc(l.interestNote||'')}">${esc(short(l.interest))}</td><td><b>${l.nextPayment==null?'—':money(l.nextPayment)}</b></td><td><select class="loan-kind" data-key="${encodeURIComponent(loanKeyOf(a,l))}" title="ברירת המחדל — לפי סוג החשבון (${kindOf(a)==='business'?'עסקי':'פרטי'})"><option value="" ${loanKinds[loanKeyOf(a,l)]?'':'selected'}>לפי החשבון</option><option value="business" ${loanKinds[loanKeyOf(a,l)]==='business'?'selected':''}>עסקי</option><option value="private" ${loanKinds[loanKeyOf(a,l)]==='private'?'selected':''}>פרטי</option></select></td></tr>`).join('')}</tbody></table></div><div class="loans-total"><span>סה״כ החזר חודשי</span><strong>${money(monthly)}</strong></div>`}



// ── המסלקה ────────────────────────────────────────────────────────────
// ⚠⚠ 27.08.2026 — טל: „תפתח עוד לשונית שתקלוט את נתוני המסלקה."
// הנתונים כבר קיימים ומיוצרים חודשית בצינור של המסלקה
// (`המסלקה/MMYY/joined_*.json`, ולפניו `maslaka_*.json`), ולכן **הקליטה
// היא ייבוא הקובץ ולא גרידה נוספת של אתר** — מקור שכבר נבדק ומתוחזק,
// במקום מתאם חדש שיישבר בשינוי הבא באתר.
// ⚠ מה שנמדד בקובץ יולי בפועל (68 שורות פעילות + 11 סגורות):
//   ברוטו 18,354,537.53 · הלוואות כנגד הקופות 13,163,225.78 · נטו ~5,191,311.75
//   „סגורה" = קופה שנעלמה מול החודש הקודם, יתרה 0 — מוצגת בנפרד ולא בסך.
var maslaka=null;
// ⚠ סוג המוצר נגזר **מהקובץ עצמו** ולא מטבלה שאני ממציא: יש שורות שבהן
// `type` מפורש, ומהן נבנית המפה ל-`sug_mutzar` המספרי עבור השורות החסרות.
// כך המפה תמיד נכונה לקובץ שנטען, גם אם המסלקה תשנה קידוד.
function maslakaTypeMap(rows){
  const map={};
  for(const r of rows){const k=String(r.sug_mutzar??'');if(k&&r.type&&!map[k])map[k]=r.type}
  return map;
}
function maslakaRow(r,map){
  const type=r.type||map[String(r.sug_mutzar??'')]||(r.sug_mutzar?`סוג ${r.sug_mutzar}`:'—');
  const balance=Number(r.balance)||0,loan=Number(r.loan)||0;
  return{person:r.person||'',inst:r.inst||r.yatzran||'',plan:r.plan||'',type,
    acct:String(r.acct||r.acct_n||''),balance,loan,net:balance-loan,
    ytd:r.ytd==null?null:Number(r.ytd),date:r.date||'',closed:!!r.closed};
}
// ⚠ הקובץ עשוי להיות מערך או עטוף באובייקט; שתי הצורות מתקבלות.
function maslakaParse(text,name){
  const raw=JSON.parse(text);
  const arr=Array.isArray(raw)?raw:(Array.isArray(raw?.rows)?raw.rows:null);
  if(!arr)throw Error('הקובץ אינו רשימת שורות מסלקה');
  const map=maslakaTypeMap(arr);
  const rows=arr.map(r=>maslakaRow(r,map));
  if(!rows.length)throw Error('הקובץ ריק');
  const dates=rows.map(r=>r.date).filter(Boolean).sort();
  return{fileName:name,loadedAt:new Date().toISOString(),asOf:dates[dates.length-1]||'',rows};
}
const maslakaMonth=d=>{const m=String(d||'').match(/^(\d{4})(\d{2})(\d{2})$/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:String(d||'')};
function renderMaslaka(){
  const sourceEl=$('#maslakaSource'),sum=$('#maslakaSummary'),tbl=$('#maslakaTable');
  if(!sum||!tbl)return;
  if(!maslaka?.rows?.length){
    if(sourceEl)sourceEl.textContent='טרם נטען קובץ';
    sum.innerHTML='';
    tbl.className='empty';
    tbl.textContent='טען קובץ joined_*.json או maslaka_*.json מתיקיית המסלקה — הנתונים נשמרים מקומית בתוסף.';
    return;
  }
  const rows=maslaka.rows,live=rows.filter(r=>!r.closed),closed=rows.filter(r=>r.closed);
  const gross=live.reduce((s,r)=>s+r.balance,0),loans=live.reduce((s,r)=>s+r.loan,0);
  if(sourceEl)sourceEl.textContent=`${maslaka.fileName} · ${live.length} קופות · נכון ל-${maslakaMonth(maslaka.asOf)||'—'}`;
  const group=(key,list)=>{const m=new Map();
    for(const r of list){const k=r[key]||'—';const v=m.get(k)||{balance:0,loan:0,n:0};
      v.balance+=r.balance;v.loan+=r.loan;v.n++;m.set(k,v)}
    return [...m.entries()].sort((a,b)=>b[1].balance-a[1].balance)};
  const card=(label,value,note)=>`<div class="maslaka-card"><span>${esc(label)}</span><b>${money(value)}</b>${note?`<small>${esc(note)}</small>`:''}</div>`;
  // ⚠ הנטו הוא העיקר: הצבירה לבדה מסתירה שכ-72% ממנה משועבדים להלוואות.
  sum.innerHTML=`<div class="maslaka-cards">
    ${card('צבירה ברוטו',gross,`${live.length} קופות`)}
    ${card('הלוואות כנגד הקופות',loans,gross?`${(loans/gross*100).toFixed(1)}% מהצבירה`:'')}
    ${card('נטו',gross-loans,'צבירה בניכוי הלוואות')}
  </div>
  <div class="maslaka-splits">${[['person','לפי אדם'],['type','לפי סוג מוצר'],['inst','לפי מוסד']].map(([key,title])=>
    `<div class="maslaka-split"><h4>${title}</h4><table><tbody>${group(key,live).map(([k,v])=>
      `<tr><td>${esc(k)}</td><td>${money(v.balance)}</td><td class="muted-cell">נטו ${money(v.balance-v.loan)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`;
  const ytd=v=>v==null?'—':`${v.toFixed(2)}%`;
  const body=[...live].sort((a,b)=>b.balance-a.balance).map(r=>
    `<tr><td>${esc(r.person)}</td><td><b>${esc(r.inst)}</b></td><td>${esc(r.plan)}</td><td>${esc(r.type)}</td>
     <td dir="ltr">${esc(r.acct)}</td><td>${money(r.balance)}</td><td>${r.loan?money(r.loan):'—'}</td>
     <td><b>${money(r.net)}</b></td><td dir="ltr">${ytd(r.ytd)}</td></tr>`).join('');
  tbl.className='';
  tbl.innerHTML=`<div class="loans-table-wrap"><table class="loans-table"><thead><tr>
    <th>אדם</th><th>מוסד</th><th>תוכנית</th><th>סוג</th><th>חשבון</th><th>יתרה</th><th>הלוואה</th><th>נטו</th><th>תשואה מתחילת שנה</th>
    </tr></thead><tbody>${body}</tbody></table></div>`
    // ⚠ קופות סגורות אינן נמחקות מהתצוגה ואינן נכנסות לסך — היעלמות היא מידע.
    +(closed.length?`<p class="maslaka-closed">${closed.length} קופות נסגרו מול החודש הקודם: ${esc(closed.map(r=>`${r.person} · ${r.inst} ${r.plan}`).join(' · '))}</p>`:'');
}
async function maslakaLoadFiles(files){
  const picked=[...files||[]];
  if(!picked.length)return;
  try{
    // ⚠ נבחרו כמה קבצים → נטען העדכני ביותר לפי asOf, לא הראשון ברשימה.
    const parsed=[];
    for(const f of picked)parsed.push(maslakaParse(await f.text(),f.name));
    parsed.sort((a,b)=>String(a.asOf).localeCompare(String(b.asOf)));
    maslaka=parsed[parsed.length-1];
    await chrome.storage.local.set({maslaka});
    renderMaslaka();
    toast(`נטענו ${maslaka.rows.length} שורות מ-${maslaka.fileName}`);
  }catch(e){toast(`קריאת קובץ המסלקה נכשלה: ${e.message}`)}
}


// ── נדל"ן ─────────────────────────────────────────────────────────────
// ⚠⚠ 27.08.2026 — טל: „תוסיף עוד לשונית נדל\"ן, שבה אפשר להוסיף נכסים
// בשורות: כתובת, עיר ושווי."
// ⚠ זה **המקור היחיד בתוסף שאין לו בנק מאחוריו** — אין סנכרון שיתקן טעות
// ואין ממה לקרוא מחדש. לכן: שמירה מיידית על כל שינוי, מזהה יציב לכל שורה,
// ומחיקה שמבקשת אישור. שורה שנמחקת כאן אבודה.
var realEstate=[];
const reId=()=>{try{return crypto.randomUUID()}catch(e){return 're-'+Math.random().toString(36).slice(2)}};
const reNum=v=>{const n=Number(String(v??'').replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:0};
async function reSave(){await chrome.storage.local.set({realEstate});renderRealEstate()}
async function reAdd(address,city,value){
  const a=String(address||'').trim();
  if(!a)return toast('צריך כתובת');
  realEstate=[...realEstate,{id:reId(),address:a,city:String(city||'').trim(),value:reNum(value)}];
  await reSave();toast('הנכס נוסף');
}
// ⚠ עריכה נשמרת על `change` ולא על כל הקשה — אחרת כל תו כותב לאחסון,
// והשדה מאבד מיקוד באמצע ההקלדה כשהטבלה מצוירת מחדש.
async function reEdit(id,field,value){
  const row=realEstate.find(r=>r.id===id);if(!row)return;
  row[field]=field==='value'?reNum(value):String(value||'').trim();
  await chrome.storage.local.set({realEstate});
  if(field==='value')renderRealEstate();   // רק הסכום צריך צביעה מחדש
}
async function reRemove(id){
  const row=realEstate.find(r=>r.id===id);if(!row)return;
  if(!confirm(`למחוק את ${row.address||'הנכס'}? אין מאיפה לשחזר.`))return;
  realEstate=realEstate.filter(r=>r.id!==id);await reSave();toast('הנכס נמחק');
}
function renderRealEstate(){
  const box=$('#realEstateTable');if(!box)return;
  if(!realEstate.length){box.className='empty';
    box.textContent='אין נכסים עדיין. הוסף כתובת, עיר ושווי בשורה שלמעלה.';return}
  const total=realEstate.reduce((sum,r)=>sum+reNum(r.value),0);
  box.className='';
  box.innerHTML=`<div class="loans-table-wrap"><table class="loans-table re-table"><thead><tr>
    <th>כתובת</th><th>עיר</th><th>שווי</th><th>הסרה</th></tr></thead><tbody>
    ${realEstate.map(r=>`<tr data-id="${esc(r.id)}">
      <td><input class="re-cell" data-field="address" value="${esc(r.address)}" placeholder="כתובת"></td>
      <td><input class="re-cell" data-field="city" value="${esc(r.city)}" placeholder="עיר"></td>
      <td><input class="re-cell re-value" data-field="value" type="number" step="1000" value="${esc(r.value)}"></td>
      <td><button type="button" class="re-remove" title="מחיקת הנכס">✕</button></td></tr>`).join('')}
    </tbody><tfoot><tr><td><b>סה״כ</b></td><td>${realEstate.length} נכסים</td>
      <td><b>${money(total)}</b></td><td></td></tr></tfoot></table></div>`;
}


// ── מאזן נכסים · צד הנכסים ────────────────────────────────────────────
// ⚠⚠ 27.08.2026 — טל: „תוסיף לשונית מאזן נכסים. תבנה קודם נכסים ואח״כ
// התחייבויות", וצירף את `מאזן נכסים.xlsx` (גיליון „מאזנים שנתיים טל",
// טורים 31.12.13 עד 14.07.26).
// ⚠ מה שנקרא מהקובץ בפועל, ומה שהוא מלמד על המבנה:
//   סה"כ רכוש 23,011,760 · סה"כ יתרות עו"ש 153,748 · סה"כ הלוואות −19,420,193
//   ושורת „הלוואות פחות עוש ורכוש" = 3,745,315 — כלומר **הון = רכוש + יתרות − הלוואות**.
//   ההלוואות מחולקות שם לשלוש: שפיצר בנקאיות, הלוואות נכסים, והלוואות גרייס
//   כנגד קופות הגמל (12.7M — הגוש הגדול). זה המבנה שהצד השני ייבנה לפיו.
// ⚠⚠ **ההבדל מהאקסל:** שם כל שורה מוקלדת ביד פעם בשנה. כאן רוב השורות
// כבר קיימות חיות בתוסף — עו"ש מהחשבונות, חיסכון פנסיוני מהמסלקה, נדל"ן
// מהלשונית שלו. לכן הן **נגזרות ולא מוקלדות**, ורק מה שהתוסף אינו יודע
// (רכב, מזומן, חסכונות ילדים) נשאר ידני. מספר שמוקלד פעמיים מתיישן פעמיים.
var balanceAssets=[];
const baId=()=>{try{return crypto.randomUUID()}catch(e){return 'ba-'+Math.random().toString(36).slice(2)}};
// ⚠ המאזן הוא תמונה כוללת ולכן **אינו מכבד את מסנן עסקי/פרטי** —
// מאזן חלקי אינו מאזן. הדבר נאמר במפורש בתצוגה.
function balanceAutoAssets(){
  const rows=[];
  // WHY 27.08.2026 - טל: "כל בנק וכל קופה יופיע סכום כולל, ורק בלחיצה על
  // המכשיר יופיע פירוט". לכן השורות נבנות **פריט-פריט** עם שיוך לקבוצה
  // ולמכשיר, והסיכום נעשה בתצוגה. קודם נבנה כאן סכום אחד מוכן, ואי אפשר
  // היה לפרוט אותו בחזרה - **סכום שנבנה מוקדם מדי אינו ניתן לפתיחה.**
  for(const a of accounts){
    if(a.balance==null)continue;
    rows.push({group:'עו״ש',inst:a.sourceLabel||'בנק',
      name:`${a.branch}-${a.accountNumber}${a.nickname?` · ${a.nickname}`:''}`,
      value:Number(a.balance)||0,source:a.sourceLabel||'בנק',note:''});
  }
  for(const r of (maslaka?.rows||[]).filter(x=>!x.closed))
    rows.push({group:'חיסכון פנסיוני',inst:r.inst||'קופה',name:r.plan||'',
      value:r.balance,source:'מסלקה',note:r.person||''});
  for(const r of realEstate)
    rows.push({group:'נדל״ן',inst:r.city||'ללא עיר',name:r.address||'נכס',
      value:Number(r.value)||0,source:'נדל״ן',note:''});
  return rows;
}
async function baSave(){await chrome.storage.local.set({balanceAssets});renderBalance()}
async function baAdd(name,group,value){
  const n=String(name||'').trim();
  if(!n)return toast('צריך שם לפריט');
  balanceAssets=[...balanceAssets,{id:baId(),name:n,group:String(group||'').trim()||'אחר',value:reNum(value)}];
  await baSave();toast('הנכס נוסף למאזן');
}
async function baEdit(id,field,value){
  const row=balanceAssets.find(r=>r.id===id);if(!row)return;
  row[field]=field==='value'?reNum(value):String(value||'').trim();
  await chrome.storage.local.set({balanceAssets});
  if(field==='value')renderBalance();
}
async function baRemove(id){
  const row=balanceAssets.find(r=>r.id===id);if(!row)return;
  if(!confirm(`למחוק את ${row.name||'הפריט'} מהמאזן?`))return;
  balanceAssets=balanceAssets.filter(r=>r.id!==id);await baSave();toast('הפריט הוסר');
}

// -- מאזן נכסים · צד ההתחייבויות ---------------------------------------
// ⚠ שלוש הקבוצות הן של האקסל של טל, לא המצאה שלי: "סה"כ הלוואות שפיצר",
// "סה"כ הלוואות נכסים" ו"סה"כ הלוואות גרייס". גם כאן רוב השורות נגזרות.
// ⚠⚠ **הסיווג נעשה לפי מה שהתוסף כבר יודע, ולא לפי שם ההלוואה:**
//   isMortgage או מקור btb -> הלוואת נכס · שאר הלוואות הבנקים -> שפיצר ·
//   loan של קופה במסלקה -> גרייס. שם חופשי היה משתנה עם כל שינוי בבנק.
// ⚠ כפילות שנבדקה במפורש: הלוואות הגרייס אינן מופיעות ברשימות ההלוואות
// של הבנקים - הן ניתנות מחברות הגמל - ולכן אין ספירה כפולה מולן.
var balanceLiabs=[];
function balanceAutoLiabs(){
  const rows=[];
  for(const a of accounts)for(const l of a.loans||[]){
    const bal=Number(l.balance)||0;if(bal<=0)continue;
    const property=l.isMortgage||a.source==='btb';
    rows.push({group:property?'הלוואות נכסים':'הלוואות בנקאיות',
      inst:a.sourceLabel||'בנק',name:String(l.type||'הלוואה').slice(0,70),
      value:bal,source:a.sourceLabel||'בנק',
      note:l.nextPayment?`החזר ${money(l.nextPayment)}`:''});
  }
  // ⚠ הגוש הגדול באקסל (-12.7M) - הלוואות כנגד הקופות, קופה-קופה.
  for(const r of (maslaka?.rows||[]).filter(x=>!x.closed&&x.loan>0))
    rows.push({group:'הלוואות כנגד קופות',inst:r.inst||'קופה',
      name:String(r.plan||'').slice(0,70),value:r.loan,source:'מסלקה',note:r.person||''});
  // ⚠ חיוב אשראי עתידי אינו יושב ביתרת העו"ש, ולכן אינו נספר פעמיים.
  const cards=accounts.flatMap(a=>a.cards||[]).reduce((sum,c)=>sum+(Number(c.amount)||0),0);
  if(cards>0)rows.push({group:'חובות אחרים',inst:'כרטיסי אשראי',
    name:'חיוב קרוב',value:cards,source:'כרטיסים',note:''});
  return rows;
}
const blId=()=>{try{return crypto.randomUUID()}catch(e){return 'bl-'+Math.random().toString(36).slice(2)}};
async function blSave(){await chrome.storage.local.set({balanceLiabs});renderBalance()}
async function blAdd(name,group,value){
  const n=String(name||'').trim();
  if(!n)return toast('צריך שם להתחייבות');
  // ⚠ נשמר כמספר חיובי והמאזן מחסיר אותו. מינוס שמוקלד ביד היה הופך לחיבור.
  balanceLiabs=[...balanceLiabs,{id:blId(),name:n,group:String(group||'').trim()||'חובות אחרים',
    value:Math.abs(reNum(value))}];
  await blSave();toast('ההתחייבות נוספה');
}
async function blEdit(id,field,value){
  const row=balanceLiabs.find(r=>r.id===id);if(!row)return;
  row[field]=field==='value'?Math.abs(reNum(value)):String(value||'').trim();
  await chrome.storage.local.set({balanceLiabs});
  if(field==='value')renderBalance();
}
async function blRemove(id){
  const row=balanceLiabs.find(r=>r.id===id);if(!row)return;
  if(!confirm(`למחוק את ${row.name||'הפריט'} מהמאזן?`))return;
  balanceLiabs=balanceLiabs.filter(r=>r.id!==id);await blSave();toast('ההתחייבות הוסרה');
}
// ⚠ טבלה אחת לשני הצדדים: התנהגות זהה, ולכן לא שני מימושים שיתפצלו בהמשך.
// WHY: המאזן היה רשימה שטוחה ארוכה - 68 קופות ועוד הלוואות בטבלה אחת.
// עכשיו שלוש רמות: קבוצה -> מכשיר -> פירוט, וכל רמה נפתחת בלחיצה.
// ⚠ מצב הפתיחה נשמר ב-Set חי ולא באחסון: הוא מצב תצוגה רגעי, ושמירתו
// הייתה כותבת לאחסון בכל לחיצה. רינדור מחדש שומר על מה שפתוח.
var balanceOpen=new Set();
function balanceTable(box,auto,manual,cls,totalLabel){
  const all=[...auto.map(r=>({...r,manual:false,inst:r.inst||'אחר'})),
             ...manual.map(r=>({...r,manual:true,group:r.group||'אחר',inst:'הוספות ידניות'}))];
  if(!all.length){box.className='empty';box.textContent='אין עדיין שורות.';return 0}
  const sum=list=>list.reduce((t,r)=>t+(Number(r.value)||0),0);
  const total=sum(all);
  const groups=[...new Set(all.map(r=>r.group))];
  const caret=open=>`<span class="caret">${open?'▾':'▸'}</span>`;
  const detail=r=>`<tr class="lvl3" ${r.manual?`data-id="${esc(r.id)}"`:''}>
    <td class="indent2">${r.manual?`<input class="${cls}-cell" data-field="name" value="${esc(r.name)}">`:esc(r.name)}</td>
    <td class="muted-cell">${esc(r.manual?'ידני':`אוטומטי · ${r.source}`)}${r.note?` · ${esc(r.note)}`:''}</td>
    <td>${r.manual?`<input class="${cls}-cell re-value" data-field="value" type="number" step="1000" value="${esc(r.value)}">`:money(r.value)}</td>
    <td>${r.manual?`<button type="button" class="${cls}-remove" title="הסרה">✕</button>`:''}</td></tr>`;
  let html='';
  for(const g of groups){
    const inGroup=all.filter(r=>r.group===g),gKey=`${cls}|${g}`,gOpen=balanceOpen.has(gKey);
    html+=`<tbody><tr class="lvl1 fold" data-key="${esc(gKey)}"><td colspan="2">${caret(gOpen)}${esc(g)}
      <small>${inGroup.length} פריטים</small></td><td><b>${money(sum(inGroup))}</b></td><td></td></tr>`;
    if(gOpen)for(const inst of [...new Set(inGroup.map(r=>r.inst))]){
      const inInst=inGroup.filter(r=>r.inst===inst),iKey=`${gKey}|${inst}`,iOpen=balanceOpen.has(iKey);
      // ⚠ מכשיר עם פריט אחד נפתח מיד: קיפול שמסתיר שורה בודדת מוסיף לחיצה ולא מידע.
      const single=inInst.length===1;
      html+=`<tr class="lvl2 ${single?'':'fold'}" ${single?'':`data-key="${esc(iKey)}"`}>
        <td class="indent1">${single?'':caret(iOpen)}${esc(inst)}${single?'':`<small>${inInst.length}</small>`}</td>
        <td class="muted-cell">${single?esc(inInst[0].manual?'ידני':`אוטומטי · ${inInst[0].source}`):''}</td>
        <td>${money(sum(inInst))}</td><td></td></tr>`;
      if(single||iOpen)for(const r of inInst)if(!single||r.manual)html+=detail(r);
    }
    html+='</tbody>';
  }
  box.className='';
  box.innerHTML=`<div class="loans-table-wrap"><table class="loans-table ba-table folding"><thead><tr>
    <th>קבוצה / מכשיר / פריט</th><th>מקור</th><th>סכום</th><th></th></tr></thead>
    ${html}
    <tfoot><tr><td colspan="2"><b>${esc(totalLabel)}</b></td><td><b>${money(total)}</b></td><td></td></tr></tfoot>
    </table></div>`;
  return total;
}
function renderBalance(){
  const cards=$('#balanceCards'),assetsBox=$('#balanceAssets'),liabBox=$('#balanceLiabs');
  if(!assetsBox)return;
  const assets=balanceTable(assetsBox,balanceAutoAssets(),balanceAssets,'ba','סך הנכסים');
  const liabs=liabBox?balanceTable(liabBox,balanceAutoLiabs(),balanceLiabs,'bl','סך ההתחייבויות'):0;
  // ⚠ ההון העצמי הוא השורה שבגללה המאזן קיים - היא מודגשת ולא נחבאת בתחתית.
  const equity=assets-liabs;
  if(cards)cards.innerHTML=`<div class="maslaka-cards">
    <div class="maslaka-card"><span>סך הנכסים</span><b>${money(assets)}</b></div>
    <div class="maslaka-card"><span>סך ההתחייבויות</span><b>${money(liabs)}</b>
      <small>${assets?`${(liabs/assets*100).toFixed(1)}% מהנכסים`:''}</small></div>
    <div class="maslaka-card ${equity<0?'negative':'equity'}"><span>הון עצמי</span><b>${money(equity)}</b>
      <small>נכסים בניכוי התחייבויות</small></div>
  </div><p class="balance-note">המאזן מציג את התמונה המלאה ואינו מכבד את מסנן "עסקי / פרטי". שורות "אוטומטי" נגזרות מהלשוניות האחרות ומתעדכנות איתן.</p>`;
}


// ── גיבוי ושחזור — AUDIT סעיף 1: הסיכון הבלתי-הפיך היחיד ─────────────
// כל הנתונים חיים בפרופיל כרום אחד; הסרת תוסף/פרופיל שנפגם מוחקים הכול,
// והבנקים מוגבלים אחורה כך שאין ממה לשחזר. הייצוא הוא קובץ JSON אחד:
// כל chrome.storage + כל צילומי השיקים. השחזור דורס — ולכן שואל פעמיים.
async function exportAllData(scope='both',fromMs=NaN,toMs=NaN){
  const storage=await chrome.storage.local.get(null);
  // ⚠⚠ 28.08.2026 - טל: "אין צילומי שקים". הסיבה שזה עבר בשקט: catch ריק
  // בלע את הכשל והייצוא הוכרז כהצלחה. עכשיו כשל בקריאת הצילומים **מבטל את
  // הייצוא ואומר למה** - וגם ספירה שאינה תואמת את המסד נחשבת כשל.
  let cheques;
  try{cheques=await chequeAll()}
  catch(e){return toast(`קריאת צילומי השיקים נכשלה (${e.message}) — הייצוא בוטל כדי לא לייצר גיבוי חסר`)}
  let dbCount=null;try{dbCount=await chequeCount()}catch(e){}
  if(dbCount!=null&&dbCount!==cheques.length)
    return toast(`במסד ${dbCount} צילומים אך נקראו ${cheques.length} — הייצוא בוטל. רענן את הדף ונסה שוב`);
  let cardMonths=[];try{cardMonths=await cardHistAll()}catch(e){toast(`אזהרה: היסטוריית הכרטיסים לא נקראה (${e.message})`)}

  // ── היקף: עסקי / פרטי / הכול ─────────────────────────────────────────
  // ⚠ קובץ ממוקד הוא **לשיתוף וצפייה** (למשל עסקי בלבד לרואה החשבון), לא
  // לשחזור: שחזור של קובץ חלקי היה מוחק את החצי השני. הייבוא מסרב לו.
  const kindOfA=a=>accountKinds[accountKey(a)]||(a.source==='private'||a.source==='discount-private'||String(a.source).startsWith('fibi-')?'private':'business');
  let payloadStorage=storage,keptCheques=cheques,keptMonths=cardMonths;
  if(scope!=='both'){
    // ⚠⚠ 28.08.2026 - טל: "הלוואה שהוגדרה פרטי יצאה בייצוא עסקי." הסינון
    // היה ברמת החשבון בלבד, וההלוואות נסעו עם החשבון. עכשיו הוא מכבד את
    // loanKinds בשני הכיוונים:
    //   - הלוואה שנדרסה **החוצה** מההיקף - נחתכת מהחשבון שלה.
    //   - הלוואה שנדרסה **פנימה** (למשל עסקית בחשבון פרטי) - נכנסת, אבל
    //     **רק היא**: החשבון מצורף מרוקן - בלי תנועות, יתרה וכרטיסים -
    //     כי שאר החשבון שייך להיקף השני, ולדלוף איתו זה בדיוק הבאג ההפוך.
    const lk=storage.loanKinds||{};
    const kindOfLoan=(a,l)=>lk[`${a.selectionKey||accountKey(a)}|${l.type||''}|${l.endDate||''}`]||kindOfA(a);
    const keptAccounts=(storage.accounts||[]).filter(a=>kindOfA(a)===scope)
      .map(a=>({...a,loans:(a.loans||[]).filter(l=>kindOfLoan(a,l)===scope)}));
    const crossAccounts=(storage.accounts||[]).filter(a=>kindOfA(a)!==scope)
      .filter(a=>(a.loans||[]).some(l=>kindOfLoan(a,l)===scope))
      .map(a=>({...a,loans:(a.loans||[]).filter(l=>kindOfLoan(a,l)===scope),
        transactions:[],futureTransactions:[],cards:[],balance:null,creditLimit:null,availableCredit:null,
        chequeCount:0,status:`${a.status||''} · רק הלוואות (החשבון עצמו ${scope==='business'?'פרטי':'עסקי'})`.trim()}));
    // ⚠ מפתחות הצילומים - מהחשבונות המלאים בלבד; חשבון-רק-הלוואות לא מדליף שיקים.
    const keys=new Set(keptAccounts.map(a=>a.selectionKey||accountKey(a)));
    keptAccounts.push(...crossAccounts);
    keptCheques=cheques.filter(c=>keys.has(c.selectionKey));
    const digits=v=>String(v||'').replace(/\D/g,'');
    const suffixes=new Set(keptAccounts.flatMap(a=>(a.cards||[]).map(c=>digits(c.suffix))).filter(Boolean));
    keptMonths=cardMonths.filter(r=>{const d=digits(r.suffix);
      return [...suffixes].some(x=>x.endsWith(d)||d.endsWith(x))});
    // המסלקה, הנדל"ן והמאזן הידני הם פרטיים — נכנסים רק בהיקף פרטי.
    payloadStorage={accounts:keptAccounts,accountKinds:storage.accountKinds||{},dataVersion:storage.dataVersion||2,
      ...(scope==='private'?{maslaka:storage.maslaka||null,realEstate:storage.realEstate||[],
        balanceAssets:storage.balanceAssets||[],balanceLiabs:storage.balanceLiabs||[]}:{}),
      ...(storage.sanityAlerts?{sanityAlerts:storage.sanityAlerts}:{})};
  }
  // ── טווח תאריכים ─────────────────────────────────────────────────────
  // ⚠ הטווח חל על הנתונים ה**תנועתיים** בלבד: תנועות, צילומים, חודשי
  // כרטיסים. יתרות, הלוואות, מסלקה ונדל"ן הם תמונת-מצב — חיתוך שלהם לפי
  // תאריך היה שקר (יתרה של אתמול אינה "יתרת ינואר").
  // כל הפורמטים בתוסף הם יום-קודם (dd.mm / dd/mm), כולל 'ה׳ 20/08/26'.
  const rangeSet=Number.isFinite(fromMs)||Number.isFinite(toMs);
  if(rangeSet){
    const lo=Number.isFinite(fromMs)?fromMs:-Infinity,hi=Number.isFinite(toMs)?toMs:Infinity;
    const txMs=d=>{const m=String(d||'').match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
      if(!m)return null;const y=m[3].length===2?2000+Number(m[3]):Number(m[3]);
      return Date.UTC(y,Number(m[2])-1,Number(m[1]))};
    const inR=d=>{const ms=txMs(d);return ms!=null&&ms>=lo&&ms<=hi};
    const filtered=(payloadStorage.accounts||[]).map(a=>({...a,
      transactions:(a.transactions||[]).filter(t=>inR(t.date)),
      futureTransactions:(a.futureTransactions||[]).filter(t=>inR(t.date))}));
    payloadStorage={...payloadStorage,accounts:filtered};
    // צילום שהתנועה שלו נחתכה — נחתך איתה.
    const validChq=new Set();
    for(const a of filtered)for(const t of a.transactions||[])
      if(t.cheque&&t.reference)validChq.add(`${a.selectionKey}|${t.reference}`);
    keptCheques=keptCheques.filter(c=>validChq.has(c.id));
    // חודשי כרטיסים לפי חפיפת חודש (month='MM.YYYY').
    const ym=ms=>{const d=new Date(ms);return d.getUTCFullYear()*12+d.getUTCMonth()};
    const loYm=Number.isFinite(fromMs)?ym(fromMs):-Infinity,hiYm=Number.isFinite(toMs)?ym(toMs):Infinity;
    // ⚠⚠ 28.08.2026 - המסד שומר חודש כ-'062026' (בלי נקודה); התבנית הישנה
    // זרקה את **כל** חודשי הכרטיסים מייצוא עם טווח (נמדד: cardMonths:0
    // בקובץ העסקי של טל, מול 22 בגיבוי המלא). שני הפורמטים מתקבלים.
    keptMonths=keptMonths.filter(r=>{const m=String(r.month||'').match(/^(\d{2})\.?(\d{4})$/);
      if(!m)return false;const v=Number(m[2])*12+Number(m[1])-1;return v>=loYm&&v<=hiYm});
  }
  // ⚠ טווח הופך גם "הכול" לקובץ חלקי: לא גיבוי, לא לשחזור, לא מאפס תזכורת.
  const partial=scope!=='both'||rangeSet;
  const iso=ms=>Number.isFinite(ms)?new Date(ms).toISOString().slice(0,10):'';
  const payload={format:'banks-extension-backup',dataVersion:storage.dataVersion||2,scope,
    range:rangeSet?{from:iso(fromMs),to:iso(toMs)}:null,
    exportedAt:new Date().toISOString(),storage:payloadStorage,cheques:keptCheques,cardMonths:keptMonths};
  const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  const scopeName={both:'',business:'-business',private:'-private'}[scope]||'';
  const rangeName=rangeSet?`-${iso(fromMs)||'עד'}_${iso(toMs)||'היום'}`:'';
  a.download=`banks-backup${scopeName}${rangeName}-${new Date().toISOString().slice(0,10)}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  // ⚠ רק גיבוי מלא מאפס את שעון התזכורת — קובץ חלקי אינו גיבוי.
  if(!partial)await chrome.storage.local.set({lastBackupAt:new Date().toISOString()});
  renderBackupState();
  const txTotal=(payloadStorage.accounts||[]).reduce((n,x)=>n+(x.transactions||[]).length,0);
  toast(!partial
    ?`הגיבוי ירד: ${keptCheques.length} צילומים, ${keptMonths.length} חודשי כרטיסים + כל הנתונים`
    :`ייצוא ${scope==='business'?'עסקי':scope==='private'?'פרטי':'מלא'}${rangeSet?` בטווח ${iso(fromMs)||'…'} עד ${iso(toMs)||'…'}`:''}: ${payloadStorage.accounts.length} חשבונות, ${txTotal} תנועות, ${keptCheques.length} צילומים — לצפייה, לא לשחזור`);
}
async function importAllData(file){
  let data;try{data=JSON.parse(await file.text())}catch(e){return toast('הקובץ אינו JSON תקין')}
  if(data?.format!=='banks-extension-backup')return toast('זה אינו קובץ גיבוי של התוסף');
  // ⚠ קובץ ממוקד משחזר רק חצי — ומחיקת clear() הייתה מוחקת את החצי השני.
  if((data.scope&&data.scope!=='both')||data.range)return toast('זהו קובץ ייצוא חלקי (היקף או טווח) — מיועד לצפייה בלבד. שחזור נעשה רק מגיבוי מלא ללא טווח');
  if(!confirm(`לשחזר גיבוי מ-${String(data.exportedAt||'').slice(0,10)}? הנתונים הנוכחיים יוחלפו במלואם.`))return;
  await chrome.storage.local.clear();
  await chrome.storage.local.set(data.storage||{});
  let put=0;for(const c of data.cheques||[]){try{await chequePut(c);put++}catch(e){}}
  let months=0;for(const r of data.cardMonths||[]){try{await cardHistPut(r);months++}catch(e){}}
  toast(`שוחזר: ${put} צילומים ו-${months} חודשי כרטיסים — טוען מחדש`);setTimeout(()=>location.reload(),900);
}
// ⚠ ניקוי יתומים ידני בלבד, לעולם לא אוטומטי: מחיקת צילום היא בלתי הפיכה,
// ותקלת סנכרון רגעית שמעלימה תנועות הייתה גוררת מחיקה אוטומטית של אמת.
async function pruneOrphanCheques(){
  const st=await chrome.storage.local.get({accounts:[]});
  const valid=new Set();
  for(const a of st.accounts||[])for(const t of a.transactions||[])
    if(t.cheque&&t.reference)valid.add(chequeId(a.selectionKey,t.reference));
  const all=await chequeAll();
  const orphans=all.filter(c=>!valid.has(c.id));
  if(!orphans.length)return toast(`אין יתומים — כל ${all.length} הצילומים מפנים לתנועות שמורות`);
  if(!confirm(`${orphans.length} צילומים אינם מפנים לאף תנועה שמורה (מתוך ${all.length}). למחוק אותם? אין שחזור.`))return;
  for(const c of orphans)await chequeDelete(c.id);
  toast(`נמחקו ${orphans.length} צילומים יתומים`);
}
async function renderBackupState(){
  const el=$('#backupState'),pr=$('#btbPrimeState');if(!el)return;
  const st=await chrome.storage.local.get({lastBackupAt:'',btbPrime:0.05,btbPrimeSetAt:''});
  const days=st.lastBackupAt?Math.round((Date.now()-Date.parse(st.lastBackupAt))/86400000):null;
  // ⚠ ההתרעה חייבת להיראות: אין גיבוי = הסיכון הגדול ביותר במערכת.
  el.textContent=days==null?'⚠ מעולם לא יוצא גיבוי — הכול בפרופיל הזה בלבד':
    days>30?`⚠ הגיבוי האחרון לפני ${days} יום`:`גיבוי אחרון לפני ${days} יום`;
  el.className=days==null||days>30?'backup-warn':'backup-ok';
  if(pr){const age=st.btbPrimeSetAt?Math.round((Date.now()-Date.parse(st.btbPrimeSetAt))/86400000):null;
    pr.textContent=`פריים ${(Number(st.btbPrime)*100).toFixed(2)}%${age==null?' (ברירת מחדל)':age>60?` (⚠ לפני ${age} יום)`:''}`;}
}
$('#exportAll')?.addEventListener('click',()=>{
  const f=$('#exportFrom')?.value,t=$('#exportTo')?.value;
  const fromMs=f?Date.parse(f+'T00:00:00Z'):NaN,toMs=t?Date.parse(t+'T23:59:59Z'):NaN;
  if(Number.isFinite(fromMs)&&Number.isFinite(toMs)&&fromMs>toMs)return toast('טווח הפוך — "מ־" מאוחר מ"עד"');
  exportAllData($('#exportScope')?.value||'both',fromMs,toMs).catch(e=>toast(`הייצוא נכשל: ${e.message}`))});
$('#importAll')?.addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';if(f)importAllData(f).catch(err=>toast(`השחזור נכשל: ${err.message}`))});
$('#downloadViewer')?.addEventListener('click',async()=>{
  // דף הצפייה עצמאי לגמרי — שומרים אותו ליד הגיבוי וכל מחשב יפתח את שניהם.
  const t=await (await fetch('viewer.html')).text();
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/html'}));
  a.download='banks-viewer.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  toast('דף הצפייה ירד — שמור אותו יחד עם קובץ הגיבוי');});
$('#pruneCheques')?.addEventListener('click',()=>pruneOrphanCheques().catch(e=>toast(`הניקוי נכשל: ${e.message}`)));
// ⚠⚠ הורדת המודל היא ג'יגה-בייטים מהמחשב של טל, ולכן היא **לא מתחילה
// בלי אישור מפורש**. גם הריצה עצמה יכולה לקחת דקות, ולכן היא מדווחת
// התקדמות ולא נועלת את הדף בשקט.
// האבחון של קציר הצילומים, מוכן להדבקה. עדיף מלבקש מטל לחפור ב-storage.
$('#chequeAudit')?.addEventListener('click',async()=>{
 const st=await chrome.storage.local.get({leumiChequeAudit:null,leumiChequeWindows:null,
   leumiChequeReport:null,leumiChequeMissing:{},chequeAuditForce:0});
 const stored=(await chequeKeys().catch(()=>new Set())).size;
 // ⚠ **תמיד מעתיקים משהו.** הגרסה הקודמת סירבה כשלא הייתה ביקורת חדשה
 // והחזירה את טל בידיים ריקות, למרות שגששים ישנים כן היו במכשיר.
 const text=JSON.stringify({
   נכתב:new Date().toISOString(),גרסה:chrome.runtime.getManifest().version,
   צילומים_שמורים:stored,ממתין_לאבחון:st.chequeAuditForce||0,
   audit:st.leumiChequeAudit||'לא נכתב עדיין — נדרשת קצירה',
   windows:st.leumiChequeWindows,report:st.leumiChequeReport,
   missing:Object.keys(st.leumiChequeMissing||{}).length},null,1);
 try{await navigator.clipboard.writeText(text)}catch(e){}
 if(st.leumiChequeAudit)return toast(`האבחון הועתק (${st.leumiChequeAudit.rows?.length||0} שיקים)`);
 // ⚠ בלי המכסה הזאת הקציר מדלג על כל שיק ששמור, ולכן לא ייכתב אבחון לעולם.
 if(!confirm(['אין עדיין ביקורת, כי הקציר מדלג על שיקים ששמורים — ואצלך כולם שמורים.',
   `להורות לתוסף לקצור מחדש 5 שיקים בסנכרון לאומי הבא, לצורך אבחון בלבד?`,
   'הצילומים נשמרים תחת אותם מפתחות — שום נתון לא נמחק.'].join(String.fromCharCode(10))))
   return toast('מה שכן היה במכשיר הועתק ללוח');
 await chrome.storage.local.set({chequeAuditForce:5});
 toast('סומן. הרץ סנכרון לאומי, ואז לחץ שוב על "העתקת אבחון שיקים"');
});
// ⚠ מחיקה מלאה, לא ניקוי יתומים: אחרי שהשיוך יתוקן צריך לקצור מחדש.
// הקציר מוגבל ל-90 שניות לסנכרון, ולכן זה יתפרס על כמה סנכרונים.
$('#clearCheques')?.addEventListener('click',async()=>{
 const ids=[...await chequeKeys()];
 if(!ids.length)return toast('אין צילומים שמורים');
 if(!confirm([`למחוק ${ids.length} צילומי שיקים?`,
   'הסנכרונים הבאים יקצרו אותם מחדש מלאומי — זה ייקח כמה סנכרונים.',
   'שאר הנתונים אינם נוגעים.'].join(String.fromCharCode(10))))return;
 let n=0;for(const id of ids){try{await chequeDelete(id);n++}catch(e){}}
 // בלי איפוס הזיכרון הזה, שיקים שנרשמו "אין צילום" ידולגו לעוד 30 יום.
 await chrome.storage.local.set({leumiChequeMissing:{},chequePayers:{},chequeInfo:{}});
 chequePayers={};chequeInfo={};
 toast(`נמחקו ${n} צילומים — הסנכרון הבא יקצור מחדש`);render();scheduleMovementSearch();
});
$('#ocrCheques')?.addEventListener('click',async()=>{
 const btn=$('#ocrCheques'),state=$('#ocrChequesState');
 const avail=await chequeOcrAvailability();
 if(avail==='unsupported'||avail==='unavailable')
   return toast('המודל המובנה של Chrome אינו זמין בדפדפן הזה — אי אפשר לקרוא את השם מהסריקה');
 if(avail!=='available'&&!confirm([
   'Chrome צריך להוריד פעם אחת את מודל הקריאה (כמה ג׳יגה-בייט) למחשב הזה.',
   'הכול נשאר מקומי — שום צילום לא יוצא מהמחשב.',
   'להתחיל?'].join(String.fromCharCode(10))))return;
 btn.disabled=true;
 try{
  // טביעות לכל צילום חדש, ואז החלה אוטומטית של שמות שכבר אושרו -
  // כך שיק חוזר מאותו חשבון כלל לא מגיע לתור האישור.
  if(typeof chequeHashAll==='function'){await chequeHashAll({onProgress:({done,total})=>{state.textContent=`טביעות ${done}/${total}`}});
   chequeHashes=(await chrome.storage.local.get({chequeHashes:{}})).chequeHashes||{};
  }
  const r=await chequeOcrRunAll({
   onDownload:loaded=>{state.textContent=`מוריד מודל… ${Math.round(loaded*100)}%`},
   onProgress:({done,total,found,unsure})=>{state.textContent=`קורא שיקים ${done}/${total} · הוכרעו ${found} · בספק ${unsure||0}`}});
  const fresh=await chrome.storage.local.get({chequePayers:{},chequePayerDoubt:{}});
  chequePayers=fresh.chequePayers||{};chequePayerDoubt=fresh.chequePayerDoubt||{};
  state.textContent=r.total?`הסתיים — ${r.found} הוכרעו · ${r.unsure||0} בספק מתוך ${r.total}`:'אין צילומים חדשים לקריאה';
  toast(r.total?`${r.total} הצעות מוכנות לאישור — לחץ "אישור שמות מוסרים"`:'כל הצילומים כבר נקראו');
  refreshPayerButton();
  render();scheduleMovementSearch();
 }catch(e){state.textContent='';toast(`החילוץ נכשל: ${e.message}`)}
 finally{btn.disabled=false}
});
$('#editPrime')?.addEventListener('click',async()=>{
  const st=await chrome.storage.local.get({btbPrime:0.05});
  const v=prompt('ריבית הפריים של בנק ישראל (באחוזים):',(Number(st.btbPrime)*100).toFixed(2));
  if(v==null)return;const n=Number(String(v).replace(',','.'));
  if(!Number.isFinite(n)||n<=0||n>20)return toast('ערך פריים לא סביר');
  await chrome.storage.local.set({btbPrime:n/100,btbPrimeSetAt:new Date().toISOString()});
  renderBackupState();toast(`הפריים עודכן ל-${n.toFixed(2)}% — ייכנס לתוקף בסנכרון BTB הבא`);
});
renderBackupState();

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
// ⚠⚠ 23.08.2026 — טל: „עדיין מופיע". הקיצור שהוסף לבאנר ולפופ-אפ
// לא כיסה את **אריח הבנק**: הוא קורא מ-`statusBySource`, ערוץ שלישי,
// ושם ישבה אותה הודעה בת 1,000+ תווים. **שלושה משטחים מציגים
// סטטוס, ותיקנתי שניים מתוך שלושה.** הקיצור יושב על נקודת התצוגה
// ולא על הכתיבה, כדי שגם הודעות שכבר שמורות באחסון יוצגו קצר.
const shortLine=t=>{t=String(t||'').replace(/\s+/g,' ').trim();return t.length>110?t.slice(0,110)+'…':t};
// ⚠⚠ 27.08.2026 — טל: „תדאג שהמלל חוץ משם הבנק כתוב התחלת סנכרון בלבד."
// באריחים הוצגו ארבעה נוסחים שונים („לחיצה תפתח מסך כניסה", „הסנכרון הסתיים —
// 19 תנועות ו־1 הלוואות · לפני 1 שע׳", „סונכרן · לפני 2 שע׳"…). עכשיו טקסט אחד.
// ⚠ **„טרם נתמך" נשאר** — אריח שאי אפשר לסנכרן ממנו לא יגיד „התחלת סנכרון".
// זה היה הופך את הטקסט לשקר, ולא לקיצור.
// ⚠⚠ **והמצב המלא לא נמחק — הוא עבר ל-`title`**, כולל שורת האבחון
// (`bankDiagnostics`) שנבנתה היום כדי להסביר למה יהב לא מגיע לינואר.
// ההערה במקור אמרה שזו „השורה שהמשתמש מצלם ושולח" — היא עדיין קיימת, בריחוף.
function bankAction(b){return b.ready?'התחלת סנכרון':'טרם נתמך'}
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

// ── ניתוח חודשי (1.59.0) ─────────────────────────────────────────────
// אותה לוגיקה כמו ב-viewer.html (1.55-1.58), על הנתונים החיים של התוסף:
// העו"ש מ-accounts, פירוט האשראי מ-cardHistAll(). הלקחים מן ה-viewer חלים:
// ⚠⚠ אין כפל-ספירה — הסכומים מצד הבנק בלבד; עסקאות הכרטיס תצוגה בלבד.
// ⚠⚠ חיוב הכרטיס יורד בחודש שאחרי חודש העסקאות — התאמה קודם מול החודש הקודם.
// ⚠ מסד הכרטיסים שומר '062026' בלי נקודה — normMonth מקבל את שני הפורמטים.
// ⚠ שסתום עמלות: נפילת "כל כרטיסי החודש" רק לחיובים מעל 200 ש"ח.
// ⚠ כל הקבוצות מוצגות — slice שהעלים קבוצות עלה יום עבודה ב-viewer.
// מכבד את בורר עסקי/פרטי: חשבונות לפי kindOf, כרטיסים לפי cardPasses.
function signedAmt(t){return t.debit!=null&&t.debit!==''?-Math.abs(Number(t.debit)||0):(Number(t.credit)||Number(t.amount)||0)}
function mKeyMs(ms){const d=new Date(ms);return `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`}
function normMonth(m){const x=String(m||'').match(/^(\d{2})\.?(\d{4})$/);return x?`${x[1]}.${x[2]}`:null}
// monthlyCardMonths ו-monthlyPick מוצהרים בראש הקובץ — load() ניגשת אליהם.
async function renderMonthlyTab(){
  const state=$('#monthlyState');
  if(monthlyCardMonths===null){
    if(state)state.textContent='קורא היסטוריית כרטיסים…';
    try{monthlyCardMonths=await cardHistAll();if(state)state.textContent=''}
    catch(e){monthlyCardMonths=[];if(state)state.textContent=`היסטוריית הכרטיסים לא נקראה (${e.message}) — הניתוח מוצג בלי פירוט אשראי`}
  }
  renderMonthlyView(monthlyPick);
}
$('#monthPick').onchange=e=>{monthlyPick=e.target.value;renderMonthlyView(monthlyPick)};
function renderMonthlyView(pick=''){
  const box=$('#monthlyBox');if(!box)return;
  const cardMonths=(monthlyCardMonths||[]).filter(r=>cardPasses(r.suffix));
  const shownAccounts=accounts.filter(a=>accountFilter==='both'||kindOf(a)===accountFilter);
  const buckets=new Map();
  const bucket=k=>{if(!buckets.has(k))buckets.set(k,{inSum:0,outSum:0,n:0,byAcc:new Map(),byAction:new Map()});return buckets.get(k)};
  for(const a of shownAccounts){
    const accName=`${a.sourceLabel||a.source||''} ${a.branch||''}-${a.accountNumber||''}`.trim();
    for(const t of a.transactions||[]){
      const ms=dateKey(t.date);if(!ms)continue;
      const amt=signedAmt(t);if(!amt)continue;
      const b=bucket(mKeyMs(ms));b.n++;
      if(amt>0)b.inSum+=amt;else b.outSum+=-amt;
      const acc=b.byAcc.get(accName)||{inSum:0,outSum:0};
      if(amt>0)acc.inSum+=amt;else acc.outSum+=-amt;b.byAcc.set(accName,acc);
      const label=`${amt>0?'+':'-'}|${String(t.action||t.merchant||'ללא שם').replace(/\s+/g,' ').trim().slice(0,40)||'ללא שם'}`;
      const g=b.byAction.get(label)||{sum:0,n:0,txs:[]};g.sum+=Math.abs(amt);g.n++;
      const isCard=amt<0&&/ישראכרט|כאל|מקס|max|לאומי קארד|ויזה|כרטיסי אשראי|אשראי/i.test(String(t.action||''));
      g.txs.push({date:t.date,amt,details:String(t.details||'').slice(0,60),ref:t.reference||'',acc:accName,isCard});
      b.byAction.set(label,g);
    }}
  const cardsBy=new Map();
  for(const r of cardMonths){const k=normMonth(r.month);if(!k)continue;
    if(!cardsBy.has(k))cardsBy.set(k,[]);cardsBy.get(k).push(r)}
  // כרטיס-חודש מוליד את שורת חודש-החיוב שלו (החודש העוקב), לא את שלו-עצמו.
  const nextK=k=>{const[m1,y1]=k.split('.').map(Number);
    return m1===12?`01.${y1+1}`:`${String(m1+1).padStart(2,'0')}.${y1}`};
  for(const k of cardsBy.keys())bucket(nextK(k));
  const keys=[...buckets.keys()].sort((a,b)=>{const[a1,a2]=a.split('.'),[b1,b2]=b.split('.');
    return (Number(b2)*12+Number(b1))-(Number(a2)*12+Number(a1))});
  if(!keys.length){box.innerHTML='<div class="empty">אין תנועות מתוארכות — התחבר וסנכרן קודם.</div>';return}
  const pickEl=$('#monthPick');
  pickEl.innerHTML='<option value="">כל החודשים</option>'+keys.map(k=>`<option value="${k}">${k}</option>`).join('');
  pickEl.value=pick&&keys.includes(pick)?pick:'';
  const chosen=pickEl.value;
  const shown=chosen?keys.filter(k=>k===chosen):keys;
  const pct=(x,t)=>t?` (${(x/t*100).toFixed(0)}%)`:'';
  box.innerHTML=shown.map(k=>{
    const b=buckets.get(k),net=b.inSum-b.outSum;
    const prevK=(()=>{const[m1,y1]=k.split('.').map(Number);
      return m1===1?`12.${y1-1}`:`${String(m1-1).padStart(2,'0')}.${y1}`})();
    // cmCharged - הכרטיסים שחיובם ירד בחודש הזה (עסקאות החודש הקודם);
    // cmSame - נפילה לאחור בלבד, לכרטיס שמחויב באותו חודש.
    const cmCharged=cardsBy.get(prevK)||[],cmSame=cardsBy.get(k)||[];
    const cardSum=cmCharged.reduce((s,r)=>s+(Number(r.amount)||0),0);
    const actions=dir=>[...b.byAction.entries()].filter(([l])=>l.startsWith(dir))
      .sort((x,y)=>y[1].sum-x[1].sum);
    const merch=new Map();
    for(const r of cmCharged)for(const t of r.transactions||[]){
      const m2=String(t.merchant||'ללא שם').slice(0,40);const g=merch.get(m2)||{sum:0,n:0,txs:[]};
      const am=Math.abs(Number(t.amount)||0);g.sum+=am;g.n++;
      g.txs.push({date:t.date||'',amt:-am,details:t.payments?`תשלומים ${t.payments}`:'',ref:'',acc:`כרטיס ${r.suffix||''}`});
      merch.set(m2,g)}
    const topMerch=[...merch.entries()].sort((x,y)=>y[1].sum-x[1].sum);
    // התאמת סכום (±1 ש"ח) קודם מול החודש הקודם - המקרה הרגיל - ואז מול
    // אותו חודש; בלי התאמה נופלים לחודש הקודם ואז לנוכחי (רק מעל 200 ש"ח).
    const chargeCards=amt=>{
      const near=list=>list.filter(r=>Math.abs((Number(r.amount)||0)-Math.abs(amt))<=1);
      const hp=near(cmCharged);if(hp.length)return{rows:hp,exact:true,note:''};
      const hc=near(cmSame);if(hc.length)return{rows:hc,exact:true,note:''};
      if(Math.abs(amt)<200)return{rows:[],exact:false,note:''};
      if(cmCharged.length)return{rows:cmCharged,exact:false,note:'התאמה לפי חודש החיוב'};
      return{rows:cmSame,exact:false,note:'התאמה לפי חודש'}};
    const cardDrill=t=>{if(!t.isCard)return '';
      if(!cmCharged.length&&!cmSame.length)
        return `<tr class="m-cardwrap"><td colspan="3"><span class="muted">אין פירוט אשראי שמור לחודש ${esc(prevK)}</span></td></tr>`;
      const {rows,exact,note}=chargeCards(t.amt);
      const txn=rows.flatMap(r=>(r.transactions||[]).map(x=>({...x,suffix:r.suffix})));
      if(!txn.length)return '';
      return `<tr class="m-cardwrap"><td colspan="3"><details class="m-cardsub">
        <summary>▸ פירוט החיוב · ${txn.length} עסקאות · כרטיס${rows.length>1?'ים':''} ${rows.map(r=>esc(r.suffix||'')).join(', ')} <span class="muted">(חודש עסקאות ${esc(normMonth(rows[0]?.month)||rows[0]?.month||'')})</span>${exact?'':` <span class="muted">(${note})</span>`}</summary>
        <table class="m-sub"><tbody>${txn.sort((a2,b2)=>Math.abs(Number(b2.amount)||0)-Math.abs(Number(a2.amount)||0)).map(x=>
         `<tr><td class="num">${esc(x.date||'')}</td><td>${esc(x.merchant||'')} <span class="muted">${x.payments?`תשלומים ${esc(x.payments)} · `:''}כרטיס ${esc(x.suffix||'')}</span></td>
          <td class="num neg">${money(Math.abs(Number(x.amount)||0))}-</td></tr>`).join('')}</tbody></table></details></td></tr>`};
    const groupTx=g=>`<table class="m-sub"><tbody>${(g.txs||[]).map(t=>
      `<tr><td class="num">${esc(t.date)}</td><td>${esc(t.details||'')} <span class="muted">${esc(t.acc)}${t.ref?` · ${esc(t.ref)}`:''}</span></td>
       <td class="num ${t.amt<0?'neg':'pos'}">${money(Math.abs(t.amt))}${t.amt<0?'-':''}</td></tr>${cardDrill(t)}`).join('')}</tbody></table>`;
    const list=(title,rows,total)=>rows.length?`<div class="m-col"><h4>${title}</h4>
      ${rows.map(([l,g])=>`<details class="m-row"><summary><span>▸ ${esc(l.slice(2))} <span class="muted">×${g.n}</span></span>
        <span class="num">${money(g.sum)}${pct(g.sum,total)}</span></summary>${groupTx(g)}</details>`).join('')}</div>`:'';
    return `<details class="m-month" ${chosen?'open':''}><summary>
      <span><b>${esc(k)}</b> <span class="muted">· ${b.n} תנועות${cmCharged.length?` · חיובי אשראי ${money(cardSum)}`:''}</span></span>
      <span class="num"><span class="pos">+${money(b.inSum)}</span> · <span class="neg">-${money(b.outSum)}</span>
       · נטו <b class="${net<0?'neg':'pos'}">${money(net)}</b></span></summary>
      <div class="m-grid">
       ${list('הכנסות לפי סוג',actions('+'),b.inSum)}
       ${list('הוצאות לפי סוג',actions('-'),b.outSum)}
       ${topMerch.length?`<div class="m-col"><h4>אשראי לפי בית עסק <span class="muted">(חיובי החודש · עסקאות ${esc(prevK)} · כלול בהוצאות)</span></h4>
        ${topMerch.map(([m2,g])=>`<details class="m-row"><summary><span>▸ ${esc(m2)} <span class="muted">×${g.n}</span></span>
         <span class="num">${money(g.sum)}${pct(g.sum,cardSum)}</span></summary>${groupTx(g)}</details>`).join('')}</div>`:''}
       <div class="m-col"><h4>לפי חשבון</h4><table><tbody>
        ${[...b.byAcc.entries()].sort((x,y)=>(y[1].inSum+y[1].outSum)-(x[1].inSum+x[1].outSum)).map(([n2,v2])=>
         `<tr><td>${esc(n2)}</td><td class="num"><span class="pos">+${money(v2.inSum)}</span> / <span class="neg">-${money(v2.outSum)}</span></td></tr>`).join('')}</tbody></table></div>
      </div></details>`}).join('');
}
