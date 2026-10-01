(function(root){
  'use strict';
  function validDay(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;
  }
  function parsePriceCSV(text){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>2*1024*1024)throw Error('파일은 2MB 이하여야 합니다.');
    const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    if(lines.length<3||lines.length>3001)throw Error('2~3,000개의 거래일이 필요합니다.');
    const header=lines[0].trim(),columns=header.split(',');
    const kind=header==='date,adjusted_close'?'adjusted_close':header==='date,close'?'close':header==='date,open,high,low,close,volume'?'ohlcv':null;
    if(!kind)throw Error('지원하는 CSV 열 이름과 순서를 확인하세요.');
    let previous='';
    const points=lines.slice(1).map((line,i)=>{
      const fields=line.split(',').map(v=>v.trim()),day=fields[0];
      if(fields.length!==columns.length||!validDay(day)||day<=previous)throw Error((i+2)+'행: 실제 날짜를 중복 없이 오름차순으로 입력하세요.');
      const values=fields.slice(1).map(v=>v!==''&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)?Number(v):NaN);
      if(values.some(v=>!Number.isFinite(v)))throw Error((i+2)+'행: 잘못된 수치가 있습니다.');
      previous=day;
      if(kind!=='ohlcv'){
        if(values[0]<=0)throw Error((i+2)+'행: 종가는 0보다 커야 합니다.');
        return {time:day,value:values[0]};
      }
      const [open,high,low,close,volume]=values;
      if(Math.min(open,high,low,close)<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))throw Error((i+2)+'행: OHLC 범위나 거래량을 확인하세요.');
      return {time:day,open,high,low,close,volume};
    });
    return {kind,points};
  }
  function compareAdjusted(stock,benchmark){
    if(stock.kind!=='adjusted_close'||benchmark.kind!=='adjusted_close')throw Error('비교에는 두 파일 모두 조정종가가 필요합니다.');
    const map=new Map(benchmark.points.map(p=>[p.time,p.value]));
    const common=stock.points.filter(p=>map.has(p.time));
    if(common.length<2)throw Error('공통 거래일이 2개 이상 필요합니다.');
    const first=common[0];
    return {stock:common.map(p=>({time:p.time,value:p.value/first.value*100})),
      benchmark:common.map(p=>({time:p.time,value:map.get(p.time)/map.get(first.time)*100})),
      firstDay:first.time,excluded:stock.points.length-common.length};
  }
  const api={validDay,parsePriceCSV,compareAdjusted};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RadarData=api;
})(typeof window!=='undefined'?window:globalThis);
