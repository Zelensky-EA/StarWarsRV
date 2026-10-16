'use strict';
// Shared addition dates are kept separately from project and price columns.
window.ModelSpotlight = (() => {
  const TAB = '_TrackerModelDates';
  const DAY = 86400000;
  const today = (now = new Date()) => [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const validDate = value => {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
    const stamp=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?value:'';
  };
  const sheetDate=value=>{
    if(typeof value==='number'&&Number.isFinite(value)){
      const stamp=Date.UTC(1899,11,30)+Math.floor(value)*DAY;
      return Number.isFinite(stamp)&&stamp>=Date.UTC(1900,0,1)&&stamp<=Date.UTC(9999,11,31)?new Date(stamp).toISOString().slice(0,10):'';
    }
    const text=String(value??'').trim();if(validDate(text))return text;
    const us=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return us?validDate(us[3]+'-'+us[1].padStart(2,'0')+'-'+us[2].padStart(2,'0')):'';
  };
  const isNew = (value,now=today()) => {
    if(!validDate(value)||!validDate(now))return false;
    const age=(Date.parse(now+'T00:00:00Z')-Date.parse(value+'T00:00:00Z'))/DAY;
    return age>=0&&age<30;
  };
  const keyFor = item => item.name.normalize('NFC').trim().toLowerCase();
  function create(api){
    let sheetId=null;
    const range="'"+TAB+"'!A2:C";
    async function read(){
      const reply=await api('/values/'+encodeURIComponent("'"+TAB+"'!A1:C")+'?valueRenderOption=UNFORMATTED_VALUE');
      if(reply.values?.[0]?.[0]!=='Model key'||reply.values?.[0]?.[2]!=='Date added')throw Error('The reserved added-date tab has a different layout. Rename that tab before enabling spotlight tracking.');
      const records=new Map();
      (reply.values||[]).slice(1).forEach((row,index)=>{
        const key=String(row[0]||'');if(!key)return;
        const date=validDate(row[2]),old=records.get(key);
        if(old){old.rows.push(index+2);if(date&&(!old.date||date<old.date))old.date=date;}
        else records.set(key,{date,rows:[index+2]});
      });
      return records;
    }
    async function initialize(items){
      const meta=await api('?fields=sheets.properties(sheetId,title)');
      const existing=meta.sheets?.find(sheet=>sheet.properties.title===TAB);
      if(existing){sheetId=existing.properties.sheetId;return;}
      const used=new Set(meta.sheets?.map(sheet=>sheet.properties.sheetId));
      let proposed;do{proposed=Math.floor(Math.random()*2000000000)+1;}while(used.has(proposed));
      const names=new Map(items.map(item=>[keyFor(item),item.name]));
      const values=[['Model key','Model name','Date added'],...Array.from(names,([key,name])=>[key,name,''])];
      try{
        await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[
          {addSheet:{properties:{sheetId:proposed,title:TAB,hidden:true,gridProperties:{rowCount:Math.max(1000,values.length+100),columnCount:3}}}},
          {updateCells:{start:{sheetId:proposed,rowIndex:0,columnIndex:0},rows:values.map(row=>({values:row.map(value=>({userEnteredValue:{stringValue:value}}))})),fields:'userEnteredValue'}}
        ]})});
        sheetId=proposed;
      }catch(error){
        // A second browser may have initialized the same shared log first.
        const retry=await api('?fields=sheets.properties(sheetId,title)');
        const winner=retry.sheets?.find(sheet=>sheet.properties.title===TAB);
        if(!winner)throw error;sheetId=winner.properties.sheetId;
      }
    }
    async function sync(items){
      if(sheetId===null)await initialize(items);
      const records=await read(),pending=new Map();
      apply(items,records);
      for(const item of items){const key=keyFor(item);if(!records.has(key))pending.set(key,[key,item.name,today()]);}
      if(pending.size){
        await api('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
          method:'POST',body:JSON.stringify({values:Array.from(pending.values())})
        });
        return apply(items,await read());
      }
      return apply(items,records);
    }
    function apply(items,records){for(const item of items){
      item.logAddedAt=records.get(keyFor(item))?.date||'';
      item.addedAt=item.rawAddedAt!==undefined&&item.rawAddedAt!==null&&item.rawAddedAt!==''?sheetDate(item.rawAddedAt):item.logAddedAt;
    }return items;}
    async function dateRequests(item,value){
      if(value&&(!validDate(value)||value>today()))throw Error('Enter a valid date added, today or earlier.');
      if(sheetId===null)return [];
      const record=(await read()).get(keyFor(item));
      if(!record)return [];
      if(record.date!==(item.logAddedAt||''))throw Error('The added date changed. Refresh and reopen this model before saving.');
      return record.rows.map(row=>({updateCells:{start:{sheetId,rowIndex:row-1,columnIndex:2},rows:[{values:[{userEnteredValue:{stringValue:value}}]}],fields:'userEnteredValue'}}));
    }
    return {sync,dateRequests};
  }
  return {create,isNew,today,validDate,sheetDate};
})();
