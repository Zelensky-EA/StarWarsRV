'use strict';
const CONFIG = window.TRACKER_CONFIG;
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const money = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'});
const state = {token:'',expires:0,client:null,data:null,view:'all',query:'',busy:false,saving:false,sheetId:null,current:null};
const $ = id => document.getElementById(id);
const spotlight=window.ModelSpotlight.create(api);
const isNewModel=item=>window.ModelSpotlight.isNew(item.addedAt);
const groups = [
  {key:'inprogress',title:'In progress',description:'The builds underway right now'},
  {key:'first',title:'First priority',description:'Projects next in line'},
  {key:'second',title:'Second priority',description:'Projects coming after first priority'},
  {key:'mid',title:'Mid priority',description:'Additional planned projects'},
  {key:'other',title:'Other priorities',description:'Other labels from the sheet'},
  {key:'selected',title:'Selected, not scheduled',description:'Chosen models without a priority'},
  {key:'completed',title:'Completed',description:'Finished projects, collected together'},
  {key:'ideas',title:'Ideas and unselected models',description:'Unscheduled models still in the collection'}
];
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function setStatus(message,isError){$('status').textContent=message;$('statusDot').classList.toggle('error',!!isError);}
function validUrl(value,site){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname===site?url.href:'';}catch{return '';}}
function groupFor(item){
  const p=(item.priority||'').trim().toLowerCase();
  if(p==='completed')return 'completed';
  if(p==='in progress'||p==='in-progress')return 'inprogress';
  if(p==='first')return 'first';
  if(p==='second')return 'second';
  if(p==='mid'||p==='middle')return 'mid';
  if(p)return 'other';
  return (item.selected||'').trim().toLowerCase()==='yes'?'selected':'ideas';
}
function connect(){
  if(!CONFIG?.oauthClientId||CONFIG.oauthClientId.startsWith('REPLACE_')){setStatus('Add your Google OAuth client ID to config.js first.',true);return;}
  if(!window.google?.accounts?.oauth2){setStatus('Google sign-in has not loaded. Refresh and try again.',true);return;}
  if(!state.client){state.client=google.accounts.oauth2.initTokenClient({
    client_id:CONFIG.oauthClientId,scope:SCOPE,
    callback:response=>{
      if(response.error||!response.access_token||!google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){
        setStatus('Spreadsheet permission was not granted.',true);return;
      }
      state.token=response.access_token;
      state.expires=Date.now()+(Number(response.expires_in||3300)-60)*1000;
      $('signIn').classList.add('hidden');$('signOut').classList.remove('hidden');load();
    },
    error_callback:()=>setStatus('Google sign-in was cancelled or blocked.',true)
  });}
  state.client.requestAccessToken({prompt:state.token?'':'select_account'});
}
function disconnect(){
  const previous=state.token;state.token='';state.expires=0;state.data=null;state.sheetId=null;state.current=null;
  if(previous&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(previous,()=>{});
  $('signIn').classList.remove('hidden');$('signOut').classList.add('hidden');
  $('count').textContent='—';$('total').textContent='—';$('remaining').textContent='—';$('due').textContent='—';
  $('filters').replaceChildren();$('content').replaceChildren(el('div','empty','Disconnected. Connect Google to view the projects.'));
  setStatus('Disconnected from Google',false);
}
async function api(path,options={}){
  if(!state.token||Date.now()>state.expires)throw new Error('Your session expired. Click Connect Google to continue.');
  const reply=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(CONFIG.spreadsheetId)+path,{
    ...options,
    headers:{Authorization:'Bearer '+state.token,...(options.body?{'Content-Type':'application/json'}:{})}
  });
  if(!reply.ok){let msg='Google Sheets request failed ('+reply.status+').';try{const payload=await reply.json();msg=payload.error?.message||msg;}catch{}
    if(reply.status===401)msg='Your Google session expired. Click Connect Google to sign in again.';
    if(reply.status===403)msg='This account cannot access or edit the sheet, or Sheets API access is blocked.';
    throw new Error(msg);
  }
  return reply.json();
}
function a1(value){return "'"+value.replaceAll("'","''")+"'";}
async function load(){
  if(!state.token||state.busy||state.saving)return;
  state.busy=true;$('refresh').disabled=true;setStatus('Refreshing from Google Sheets…',false);
  try{
    const ranges=[a1('Sheet1')+'!A2:I',a1('Sheet4')+'!A2:D'];
    const query=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});
    ranges.forEach(r=>query.append('ranges',r));
    const tasks=[api('/values:batchGet?'+query.toString())];
    if(state.sheetId===null)tasks.push(api('?fields=sheets.properties(sheetId,title)'));
    const [batch,metadata]=await Promise.all(tasks);
    if(metadata){const primary=metadata.sheets?.find(sheet=>sheet.properties?.title==='Sheet1');if(!primary)throw new Error('Sheet1 was not found in this spreadsheet.');state.sheetId=primary.properties.sheetId;}
    const images=new Map();
    (batch.valueRanges?.[1]?.values||[]).forEach(row=>{const name=String(row[0]||'').trim();if(name&&!images.has(name))images.set(name,{image:validUrl(row[1],'makerworld.bblmw.com'),model:validUrl(row[3],'makerworld.com')});});
    const items=[];
    (batch.valueRanges?.[0]?.values||[]).forEach((row,index)=>{
      const name=String(row[0]||'').trim();
      if(!name||/^(due now|total|remaining balance)\b/i.test(name))return;
      const meta=images.get(name)||{};
      items.push({row:index+2,name,selected:String(row[2]||''),priority:String(row[3]||''),
        price:typeof row[4]==='number'?row[4]:null,agreed:String(row[5]||''),paid:String(row[6]||''),note:String(row[7]||''),
        rawAddedAt:row[8]??'',addedAt:window.ModelSpotlight.sheetDate(row[8]),image:meta.image||'',model:meta.model||''});
    });
    let dateWarning='';
    try{await spotlight.sync(items);}catch(error){dateWarning=' · New-model dates unavailable: '+error.message;}
    const totals=items.reduce((out,item)=>{if(item.price!==null){out.total+=item.price;if(item.paid.toLowerCase()==='no'){out.remaining+=item.price;if(item.priority.toLowerCase()==='completed')out.due+=item.price;}}return out;},{total:0,remaining:0,due:0});
    state.data={items,totals,updated:Date.now()};render();
    setStatus('Live sheet · updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+dateWarning,!!dateWarning);
  }catch(err){setStatus(err.message,true);if(!state.data)$('content').replaceChildren(el('div','error-box',err.message));}
  finally{state.busy=false;$('refresh').disabled=false;}
}
function drawFilters(counts){
  const root=$('filters');root.replaceChildren();
  [{key:'all',title:'All projects',n:state.data.items.length},
    {key:'new',title:'New models',n:state.data.items.filter(isNewModel).length},
    {key:'active',title:'Active & planned',n:state.data.items.length-counts.completed-counts.ideas},
    {key:'completed',title:'Completed',n:counts.completed},{key:'ideas',title:'Ideas',n:counts.ideas}]
    .forEach(option=>{const btn=el('button','filter'+(state.view===option.key?' active':''),option.title+'  '+option.n);btn.type='button';btn.setAttribute('aria-pressed',String(state.view===option.key));btn.onclick=()=>{state.view=option.key;render();};root.append(btn);});
}
function card(item,key){
  const recent=isNewModel(item),article=el('article','card'+(recent?' new-model':''));const visual=el('div','visual');
  if(item.image){const img=el('img');img.src=item.image;img.alt='Preview of '+item.name;img.loading=key==='inprogress'?'eager':'lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(el('div','fallback','500%'));visual.append(img);}else visual.append(el('div','fallback','500%'));
  const label=key==='other'?item.priority:(key==='inprogress'?'In progress':key==='completed'?'Completed':key==='first'?'First priority':key==='second'?'Second priority':key==='mid'?'Mid priority':key==='selected'?'Selected':'Idea');
  visual.append(el('span','badge',label));
  if(recent)visual.append(el('span','new-model-badge','New Model Added'));
  article.append(visual);
  const main=el('div','card-main');main.append(el('h3','',item.name));const meta=el('div','meta');
  if(item.paid==='No')meta.append(el('span','pill unpaid','Unpaid'));else if(item.paid==='Yes')meta.append(el('span','pill paid','Paid'));
  if(item.agreed==='Yes')meta.append(el('span','pill','Price agreed'));else if(item.agreed==='No')meta.append(el('span','pill','Price not agreed'));
  if(item.selected.toLowerCase()==='yes')meta.append(el('span','pill','Selected'));
  main.append(meta);if(recent)main.append(el('p','added-date','Added '+new Date(item.addedAt+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})));if(item.note)main.append(el('p','note',item.note));article.append(main);
  const foot=el('div','card-foot');foot.append(el('strong',item.price===null?'unknown':'',item.price===null?'Price not entered':money.format(item.price)));
  if(item.model){const link=el('a','model-link','View model ↗');link.href=item.model;link.target='_blank';link.rel='noopener noreferrer';foot.append(link);}
  const edit=el('button','edit-btn','Edit');edit.type='button';edit.setAttribute('aria-label','Edit '+item.name);edit.onclick=()=>openEditor(item);foot.append(edit);
  article.append(foot);return article;
}
function render(){
  if(!state.data)return;const data=state.data;
  $('count').textContent=data.items.length.toLocaleString();$('total').textContent=money.format(data.totals.total);$('remaining').textContent=money.format(data.totals.remaining);$('due').textContent=money.format(data.totals.due);
  const counts=Object.fromEntries(groups.map(g=>[g.key,0]));data.items.forEach(item=>counts[groupFor(item)]++);drawFilters(counts);
  const visible=data.items.filter(item=>{const g=groupFor(item);if(state.view==='new'&&!isNewModel(item))return false;if(state.view==='completed'&&g!=='completed')return false;if(state.view==='ideas'&&g!=='ideas')return false;if(state.view==='active'&&(g==='completed'||g==='ideas'))return false;return (item.name+' '+item.note+' '+item.priority).toLowerCase().includes(state.query);});
  const root=$('content');root.replaceChildren();let count=0;
  const recent=visible.filter(isNewModel).sort((a,b)=>b.addedAt.localeCompare(a.addedAt)||a.name.localeCompare(b.name));
  if(state.view==='all'&&recent.length){
    const section=el('section','section new-model-spotlight'),head=el('div','section-head'),title=el('h2','','New Model Added');title.append(el('em','',String(recent.length)));
    head.append(title,el('p','desc','New arrivals in the last 30 days'));section.append(head);
    const grid=el('div','grid');recent.forEach(item=>grid.append(card(item,groupFor(item))));section.append(grid);root.append(section);
  }
  groups.forEach(group=>{const list=visible.filter(item=>groupFor(item)===group.key);if(!list.length)return;list.sort((a,b)=>a.name.localeCompare(b.name));count+=list.length;
    const section=el('section','section');section.id='group-'+group.key;const head=el('div','section-head');const title=el('h2','',group.title);title.append(el('em','',String(list.length)));head.append(title,el('p','desc',group.description));section.append(head);
    const grid=el('div','grid'+(group.key==='inprogress'?' featured':''));list.forEach(item=>grid.append(card(item,group.key)));section.append(grid);root.append(section);
  });
  if(!count)root.append(el('div','empty',data.items.length?'No projects match this search or filter.':'The project sheet has no rows.'));
}
function openEditor(item){
  state.current=item;const form=$('editForm');$('editTitle').textContent=item.name;$('formError').textContent='';
  for(const key of ['selected','priority','agreed','paid','note'])form.elements[key].value=item[key];
  form.elements.price.value=item.price===null?'':String(item.price);
  form.elements.addedAt.value=item.addedAt||'';form.elements.addedAt.max=window.ModelSpotlight.today();
  $('editor').showModal();
}
async function saveEditor(event){
  event.preventDefault();if(!state.current||state.saving)return;
  const item=state.current,form=$('editForm');$('formError').textContent='';
  if(!form.elements.price.validity.valid){$('formError').textContent='Enter a valid price with no more than two decimal places.';return;}
  const rawPrice=form.elements.price.value.trim();const price=rawPrice===''?null:Number(rawPrice);
  if(price!==null&&(!Number.isFinite(price)||price<0||Math.abs(Math.round(price*100)-price*100)>1e-7)){$('formError').textContent='Enter a valid dollar amount with at most two decimal places.';return;}
  const changes=[
    {col:2,old:item.selected,value:form.elements.selected.value},
    {col:3,old:item.priority,value:form.elements.priority.value.trim()},
    {col:4,old:item.price,value:price},
    {col:5,old:item.agreed,value:form.elements.agreed.value},
    {col:6,old:item.paid,value:form.elements.paid.value},
    {col:7,old:item.note,value:form.elements.note.value.trim()}
  ].filter(change=>change.old!==change.value);
  const addedAt=form.elements.addedAt.value,dateChanged=addedAt!==(item.addedAt||'');
  if(addedAt&&(!window.ModelSpotlight.validDate(addedAt)||addedAt>window.ModelSpotlight.today())){$('formError').textContent='Enter a valid date added, today or earlier.';return;}
  if(!changes.length&&!dateChanged){$('editor').close();return;}
  if(dateChanged)changes.push({col:8,old:item.rawAddedAt??'',value:addedAt?Math.round((Date.parse(addedAt+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000):null});
  state.saving=true;$('saveEdit').disabled=true;
  try{
    // Recheck the same row and touched cells immediately before writing, so a
    // stale open editor does not silently overwrite changes made in the sheet.
    const check=await api('/values/'+encodeURIComponent(a1('Sheet1')+'!A'+item.row+':I'+item.row)+'?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
    const live=check.values?.[0]||[];
    if(String(live[0]||'').trim()!==item.name||changes.some(change=>{
      const value=live[change.col];return change.col===8?String(value??'')!==String(change.old):change.col===4?(typeof value==='number'?value:null)!==change.old:String(value||'')!==change.old;
    }))throw new Error('This project changed in the spreadsheet. Close this editor, refresh, and try again.');
    // Updating only userEnteredValue preserves existing currency formats and
    // the Drive link attached to a priced cell's formatting.
    const requests=changes.map(change=>({updateCells:{start:{sheetId:state.sheetId,rowIndex:item.row-1,columnIndex:change.col},rows:[{values:[{userEnteredValue:change.value===null?{stringValue:''}:typeof change.value==='number'?{numberValue:change.value}:{stringValue:change.value}}]}],fields:'userEnteredValue'}}));
    if(dateChanged)requests.push(...await spotlight.dateRequests(item,addedAt));
    if(dateChanged&&addedAt)requests.push({repeatCell:{range:{sheetId:state.sheetId,startRowIndex:item.row-1,endRowIndex:item.row,startColumnIndex:8,endColumnIndex:9},cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'m/d/yyyy'}}},fields:'userEnteredFormat.numberFormat'}});
    await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
    $('editor').close();state.current=null;state.saving=false;await load();
  }catch(err){$('formError').textContent=err.message;setStatus('Save failed: '+err.message,true);}
  finally{state.saving=false;$('saveEdit').disabled=false;}
}
$('sheetLink').href='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(CONFIG.spreadsheetId)+'/edit';
$('signIn').addEventListener('click',connect);$('signOut').addEventListener('click',disconnect);
$('search').addEventListener('input',event=>{state.query=event.target.value.trim().toLowerCase();render();});
$('refresh').addEventListener('click',()=>{if(state.token)load();else setStatus('Connect Google to load the sheet.',true);});
$('editForm').addEventListener('submit',saveEditor);$('cancelEdit').addEventListener('click',()=>$('editor').close());
setStatus('Connect Google to view and edit projects',false);
setInterval(()=>{if(!document.hidden&&state.token)load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.token&&state.data&&Date.now()-state.data.updated>60000)load();});
