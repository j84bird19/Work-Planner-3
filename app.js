const KEY='bird_binder_template_v1';
const SECTIONS={
 schedule:{sub:'Schedule / Calendar + Agenda',tabs:[
  ['calendar','Calendar + Agenda','Calendar view and selected day agenda area.'],
  ['add','Add Job/Event/Tasks','Blank page for adding job, event, and simple daily tasks.']
 ]},
 clients:{sub:'Clients / Directory',tabs:[
  ['directory','Directory','Alphabetical client list.'],
  ['client','Client','Selected client record and totals.'],
  ['invoices','Invoices','All client invoices in numerical order.']
 ]},
 supplies:{sub:'Supplies / Supply List',tabs:[
  ['list','Supply List','All supplies. Selecting item opens item page.'],
  ['item','Item','Specific supply item details.'],
  ['inventory','Inventory','All supply quantities remaining.'],
  ['receipts','Receipts','Receipts for supply purchases.']
 ]},
 banking:{sub:'Banking / Accounts',tabs:[
  ['accounts','Accounts','Main spending and savings accounts.'],
  ['trackers','Trackers','Money received, spent, saved, and categories.'],
  ['receipts','Receipts','All banking receipts.']
 ]}
};
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{section:'schedule',tabs:{schedule:'calendar',clients:'directory',supplies:'list',banking:'accounts'},notes:{}};
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function setSection(s){state.section=s;save();render()}
function setTab(t){state.tabs[state.section]=t;save();render()}
function render(){
 document.querySelectorAll('.sideTab').forEach(b=>b.classList.toggle('active',b.dataset.section===state.section));
 subtitle.textContent=SECTIONS[state.section].sub;
 subtabs.innerHTML=SECTIONS[state.section].tabs.map(t=>`<button class="subtab ${state.tabs[state.section]===t[0]?'active':''}" onclick="setTab('${t[0]}')">${t[1]}</button>`).join('');
 let tab=SECTIONS[state.section].tabs.find(t=>t[0]===state.tabs[state.section]);
 let key=state.section+':'+tab[0];
 content.innerHTML=`<div class="titleRow"><div><h2>${tab[1]}</h2><p>${tab[2]}</p></div><div class="note">Blank Page Template</div></div>
 <div class="layout">
  <div class="box"><h3>Main Content Area</h3><p>This is where the ${tab[1]} tools will go.</p><div class="line"></div><div class="line"></div><div class="line"></div><div class="actions"><button class="save">Save</button><button>Add</button><button class="delete">Delete</button><button>Back</button></div></div>
  <div class="box"><h3>Side / Detail Area</h3><p>Selected records, trackers, or linked info will go here.</p><textarea style="width:100%;min-height:120px;border-radius:10px;padding:8px" oninput="state.notes['${key}']=this.value;save()">${state.notes[key]||''}</textarea></div>
 </div>`;
}
function backup(){let b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='bird-planner-template-backup.json';a.click();URL.revokeObjectURL(u)}
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}))}
render();