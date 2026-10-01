(() => {
  'use strict';
  const D=JSON.parse(document.querySelector('#radar-data').textContent), $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2});
  const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+' KST':'확인 대기';
  const day=v=>v?(String(v).length===10?String(v):new Date(v).toISOString().slice(0,10)):'';
  if(D.deployment?.mode==='published_snapshot'){
    const status=$('#deployment-status');status.hidden=false;
    status.textContent='공개 체험판 · 자료 스냅샷 '+date(D.deployment.snapshot_at)+' · 이 사이트는 자동 수집하지 않습니다.';
    status.title='배포 버전 '+D.deployment.revision;
  }
  const labels={ok:'확인 완료',degraded:'범위 제한',error:'확인 실패',pending:'연결 대기'};
  const kindLabels={baseline:'기준 자료',content_changed:'본문 변경',metadata_only:'표시 정보 변경',parser_reprocess:'추출 갱신'};
  const safeStore={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}};
  const S={company:D.default_company||'AMD',mode:'capex',tab:'evidence',range:'ALL',selected:null,theme:'all',query:'',newOnly:false,watchOnly:false,
    stars:safeStore.get('radar:stars',[]),prices:{...(D.prices||{})},dark:safeStore.get('radar:dark',false)};
  S.graphFocus=null;S.graphCertainty='all';
  if(!Array.isArray(S.stars))S.stars=[];
  let chart=null,series=null,markerPlugin=null,chartPoints=[],toastTimer=null;
  const company=()=>D.companies.find(c=>c.name===S.company);
  const docs=()=>D.documents.filter(d=>d.company===S.company);
  const filtered=()=>(S.query?D.documents:docs()).filter(d=>(S.theme==='all'||d.themes.includes(S.theme))&&(!S.newOnly||d.alert)&&
    (!S.query||[d.title,d.company,d.ticker,d.quote,...d.themes].join(' ').toLowerCase().includes(S.query)));
  function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3000)}
  function exportJSON(filename,payload){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function colorTheme(){document.documentElement.dataset.theme=S.dark?'dark':'light';$('#theme-toggle').setAttribute('aria-label',S.dark?'밝은 테마로 전환':'어두운 테마로 전환')}
  function renderCompanies(){
    const shown=D.companies.filter(c=>!S.watchOnly||S.stars.includes(c.name));
    $('#company-list').innerHTML=shown.map(c=>`<button class="company-row ${c.name===S.company?'active':''}" data-company="${esc(c.name)}" aria-pressed="${c.name===S.company}"><span class="avatar" style="background:${esc(c.color)}">${esc(c.initials)}</span><span><strong>${esc(c.name==='Samsung Electronics'?'Samsung':c.name)}</strong><small>${esc(c.ticker)} · 관련 ${c.related_count}건</small></span><span class="row-dot ${esc(c.quality)}" title="${esc(labels[c.quality])}"></span></button>`).join('')||'<p class="empty-state">관심기업을 별표로 저장해보세요.</p>';
    $('#all-companies').classList.toggle('active',!S.watchOnly);$('#watch-only').classList.toggle('active',S.watchOnly);
  }
  function selectCompany(name){
    if(!D.companies.some(c=>c.name===name))return;
    S.company=name;S.selected=null;S.range='ALL';S.mode=S.prices[company().ticker]?'price':name==='AMD'&&D.capex.length?'capex':'observations';
    S.graphFocus=null;
    closeInspector();render();
  }
  function renderHeader(){
    const c=company();$('#company-avatar').style.background=c.color;$('#company-avatar').textContent=c.initials;
    $('#company-name').textContent=c.name;$('#ticker').textContent=c.ticker+' · AI 반도체';
    $('#star-company').textContent=S.stars.includes(c.name)?'★ 관심기업':'☆ 관심기업';$('#star-company').setAttribute('aria-pressed',S.stars.includes(c.name));
    const ready=D.readiness.sources?.[c.source_id];
    $('#overview').innerHTML=`<div class="metric"><label>관련 기술 발표</label><strong>${c.related_count}<small> 건</small></strong><small>확보 문서 ${c.document_count}건 중</small></div><button class="metric" type="button" data-open-quality aria-label="정보원 확인 상태 열기"><label>정보원 확인</label><strong style="font-size:18px">${esc(labels[c.quality])}</strong><small>${esc(c.quality==='degraded'?'커버리지 제한 있음':c.quality==='pending'?'자동 확인 준비 중':date(c.checked_at))}</small></button><div class="metric"><label>Signal Score</label><strong style="font-size:18px">관측 축적 중</strong><small>${ready?ready.consecutive_quality_days+' / 91일 최소 조건':'비교 가능한 기준선 준비 중'}</small></div>`;
  }
  function emptyChart(title,explanation){$('#chart-empty').hidden=false;$('#chart-empty').innerHTML=`<strong>${esc(title)}</strong><p>${esc(explanation)}</p>`}
  function renderChart(){
    if(chart){chart.remove();chart=null}chartPoints=[];markerPlugin=null;series=null;
    $('#chart-empty').hidden=true;$('#chart-crosshair').textContent='';
    document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===S.mode));
    document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b.dataset.range===S.range));
    const c=company(),data=docs(),L=window.LightweightCharts,dark=S.dark;
    let markers=[],type='area',other=null,volume=null,note='';
    if(S.mode==='capex'){
      const capex=S.company==='AMD'?[...D.capex].reverse():[];
      chartPoints=capex.map(p=>({time:p.period_end,value:Number(p.current)}));
      $('#chart-label').textContent='회사 전체 CAPEX · 분기';
      const latest=capex.at(-1);$('#chart-value').textContent=latest?'$'+fmt(latest.current)+'m':'자료 준비 중';
      $('#chart-subtitle').innerHTML=latest?`전분기 대비 <span class="${Number(latest.quarter_delta)>=0?'up':'down'}">${Number(latest.quarter_delta)>=0?'+':''}${fmt(latest.quarter_pct)}%</span> · ${esc(latest.period_end)} 분기 말`:esc('이 기업의 검증된 CAPEX 분기표가 아직 연결되지 않았습니다.');
      note='단위: 백만 USD · AMD 전체 CAPEX. AI 전용 투자액은 확인되지 않았어요. 과거 분기 비교이며 최근 이상 신호 판정은 대기 중입니다.';
      markers=capex.map(p=>({time:p.period_end,position:'aboveBar',color:'#3182f6',shape:'circle',size:.5,text:''}));
      if(!capex.length)emptyChart('CAPEX 자료를 준비 중이에요','발표 이력 탭에서 현재 확보한 공식 문서를 확인할 수 있어요.');
    }else if(S.mode==='observations'){
      const grouped=new Map();filtered().filter(d=>d.company===S.company&&d.published_at).forEach(d=>grouped.set(day(d.published_at),(grouped.get(day(d.published_at))||0)+1));
      chartPoints=[...grouped].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,value])=>({time,value}));type='histogram';
      $('#chart-label').textContent='확보 문서의 공개일 분포';$('#chart-value').textContent=filtered().filter(d=>d.company===S.company).length+'건';
      $('#chart-subtitle').textContent='공식 발표 이력 · 첫 확보 기준 자료 포함';
      note='공개일(UTC)에 따라 확보한 최신 문서 버전을 묶었습니다. 출처 범위가 달라질 수 있어 과거 대비 활동 증가나 Signal Score로 해석하지 않습니다.';
      if(!chartPoints.length)emptyChart('표시할 발표가 없어요','검색·기술 테마 조건을 바꾸거나 정보원 확인 상태를 살펴보세요.');
    }else{
      const prices=S.prices[c.ticker];$('#chart-label').textContent='일별 주가 · '+(c.ticker.endsWith('.KS')?'KRW':'USD');
      if(!prices){$('#chart-value').textContent='가격 자료 미연결';$('#chart-subtitle').textContent='출처가 있는 CSV로 차트를 시작하세요';note='실제 가격은 자동 연결되지 않았습니다. 조정종가 또는 OHLCV CSV를 가져오면 발표 시점과 함께 확인할 수 있어요.';emptyChart('가격 자료를 가져와주세요','조정종가·종가·OHLCV 파일을 지원해요. 발표·근거는 이미 저장된 공식 자료로 확인할 수 있어요.');
      }else{
        chartPoints=prices.points;const last=chartPoints.at(-1),first=chartPoints[0],value=last.value??last.close,delta=(value/(first.value??first.close)-1)*100;
        $('#chart-value').textContent=(c.ticker.endsWith('.KS')?'₩':'$')+fmt(value);
        $('#chart-subtitle').innerHTML=`파일 기간 대비 <span class="${delta>=0?'up':'down'}">${delta>=0?'+':''}${fmt(delta)}%</span> · ${esc(last.time)}`;
        type=prices.kind==='ohlcv'?'candlestick':'area';
        if(prices.kind==='ohlcv')volume=prices.points.map(p=>({time:p.time,value:p.volume,color:p.close>=p.open?'#e54d5b44':'#3182f644'}));
        note=`자료: ${prices.source} · ${prices.kind==='adjusted_close'?'조정종가 (공급자 표기, 독립 검증 전)':'분할·배당 조정 여부 미확인'} · 화면에서 가져온 파일은 이번 화면에서만 유지됩니다.`;
        if(prices.benchmark){const compared=RadarData.compareAdjusted(prices,prices.benchmark);chartPoints=compared.stock;other=compared.benchmark;type='line';$('#chart-label').textContent='시장 대비 경로 · 공통 첫 거래일 = 100';$('#chart-value').textContent=fmt(chartPoints.at(-1).value)+' / '+fmt(other.at(-1).value);$('#chart-subtitle').textContent='종목 / 비교지수 · '+compared.firstDay+' 기준';note+=' 비교지수: '+prices.benchmark.source+' · 공통 거래일만 비교, 종목 제외 '+compared.excluded+'일.';}
        const dates=new Set(chartPoints.map(p=>p.time));markers=[...new Set(data.map(d=>day(d.published_at)).filter(d=>dates.has(d)))].sort().map(time=>({time,position:'aboveBar',color:'#9a63dd',shape:'circle',text:'발표'}));
      }
    }
    $('#chart-note').textContent=note;
    $('#chart-accessible').innerHTML=chartPoints.length?`<details><summary>차트 수치·발표 선택 ${chartPoints.length}개</summary><table class="chart-table"><thead><tr><th>날짜</th><th>${S.mode==='capex'?'CAPEX (백만 USD)':S.mode==='observations'?'문서 수':'값'}</th></tr></thead><tbody>${chartPoints.slice(-35).reverse().map(p=>`<tr><td><button data-chart-day="${esc(p.time)}">${esc(p.time)}</button></td><td>${fmt(p.value??p.close)}</td></tr>`).join('')}</tbody></table>${chartPoints.length>35?'<p class="chart-note">최근 35개 수치 표시. 전체 가격은 내보내기 파일에서 확인하세요.</p>':''}</details>`:'';
    if(!L){emptyChart('차트 파일을 불러오지 못했어요','아래 수치 표와 공식 근거 보고서에서 자료를 확인할 수 있어요.');return}
    chart=L.createChart($('#chart'),{autoSize:true,layout:{background:{type:'solid',color:dark?'#191f28':'#fff'},textColor:dark?'#b0b8c1':'#8b95a1',fontFamily:"'Segoe UI','Malgun Gothic',sans-serif",fontSize:11,attributionLogo:true},grid:{vertLines:{visible:false},horzLines:{color:dark?'#293340':'#f1f3f5'}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:false,fixLeftEdge:true},crosshair:{mode:L.CrosshairMode.Normal},localization:{locale:'ko-KR'}});
    const common={priceLineVisible:false,lastValueVisible:true};
    if(type==='candlestick')series=chart.addSeries(L.CandlestickSeries,{...common,upColor:'#e54d5b',downColor:'#3182f6',wickUpColor:'#e54d5b',wickDownColor:'#3182f6',borderVisible:false});
    else if(type==='histogram')series=chart.addSeries(L.HistogramSeries,{...common,color:'#88b7fa',priceFormat:{type:'custom',formatter:v=>Math.round(v)+'건',minMove:1}});
    else if(type==='line')series=chart.addSeries(L.LineSeries,{...common,color:'#3182f6',lineWidth:2});
    else series=chart.addSeries(L.AreaSeries,{...common,lineColor:'#3182f6',topColor:'#3182f62a',bottomColor:'#3182f601',lineWidth:2});
    series.setData(chartPoints);
    if(other){const comparison=chart.addSeries(L.LineSeries,{color:'#8b95a1',lineWidth:2,priceLineVisible:false});comparison.setData(other)}
    if(volume){const v=chart.addSeries(L.HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false});v.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});v.setData(volume);series.priceScale().applyOptions({scaleMargins:{top:.12,bottom:.22}})}
    if(markers.length)markerPlugin=L.createSeriesMarkers(series,markers);
    chart.subscribeCrosshairMove(p=>{const point=p.seriesData?.get(series);$('#chart-crosshair').textContent=p.time&&point?String(typeof p.time==='object'?`${p.time.year}-${String(p.time.month).padStart(2,'0')}-${String(p.time.day).padStart(2,'0')}`:p.time)+' · '+fmt(point.value??point.close):''});
    chart.subscribeClick(p=>{if(p.time){const t=typeof p.time==='object'?`${p.time.year}-${String(p.time.month).padStart(2,'0')}-${String(p.time.day).padStart(2,'0')}`:String(p.time);selectChartDay(t)}});
    applyRange();
  }
  function applyRange(){if(!chart||!chartPoints.length)return;if(S.range==='ALL'){chart.timeScale().fitContent();return}const end=chartPoints.at(-1).time,start=new Date(end+'T00:00:00Z');const months={'1M':1,'3M':3,'6M':6,'1Y':12}[S.range];start.setUTCMonth(start.getUTCMonth()-months);chart.timeScale().setVisibleRange({from:start.toISOString().slice(0,10),to:end})}
  function selectChartDay(t){const capex=S.mode==='capex'?D.capex.find(p=>p.period_end===t):null;const d=capex?D.documents.find(d=>d.id===capex.document_version_id):docs().find(d=>day(d.published_at)===t);if(d){S.selected=d.id;renderResearch();renderDetail(true)}else toast('이 날짜에 연결된 공식 발표가 없어요.')}
  function renderEvidence(){const list=filtered();$('#filter-count').textContent=(S.query?'전체 기업 · ':'')+list.length+'건 표시';$('#doc-count').textContent=docs().length;
    return list.map(d=>`<button class="evidence-row ${d.id===S.selected?'active':''}" data-doc="${esc(d.id)}" aria-pressed="${d.id===S.selected}"><div class="row-meta"><span>${esc(day(d.published_at)||'날짜 미확인')} · ${esc(d.company)}</span><span class="chip ${d.alert?'blue':''}">${esc(d.alert?'알림 후보':kindLabels[d.kind]||d.kind)}</span></div><h3>${esc(d.title)}</h3><p>${esc(d.quote.slice(0,250))}</p><div class="chips" style="margin-top:8px">${d.themes.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}${d.quality==='degraded'?'<span class="chip amber">출처 범위 제한</span>':''}</div></button>`).join('')||'<div class="empty-state">현재 조건에 맞는 근거가 없어요.<br>검색 또는 기술 테마를 바꿔보세요.</div>';
  }
  function relatedHypotheses(){const ids=new Set(docs().map(d=>d.id));return D.hypotheses.filter(h=>h.evidence.some(e=>ids.has(e.document_version_id))||docs().some(d=>h.theme&&d.themes.includes(h.theme)))}
  function renderHypotheses(){const list=relatedHypotheses();return list.map(h=>{const supports=h.evidence.filter(e=>e.stance==='supporting'),against=h.evidence.filter(e=>e.stance==='contradicting');return `<article class="hypothesis-row"><div class="chips"><span class="chip blue">수동 검토 가설</span><span class="chip">판단 ${esc(h.confidence)}</span>${h.stale?'<span class="chip amber">근거 재검토 필요</span>':''}</div><h3>${esc(h.claim)}</h3><p><b>반증 조건</b> ${esc(h.disconfirm)}</p><p><b>대안 설명</b> ${esc(h.alternative)}</p><p>지지 ${supports.length} · 반박 ${against.length} · 미분류 ${h.evidence.length-supports.length-against.length} · 검토 시한 ${esc(h.horizon)}</p><div class="company-chips">${h.evidence.slice(0,8).map(e=>`<button data-doc="${esc(e.document_version_id)}">${esc(e.stance==='supporting'?'지지':e.stance==='contradicting'?'반박':'미분류')} 근거 ↗</button>`).join('')}</div><details class="provenance"><summary>판단 이력 ${h.history.length}개 · 새 검토 후보 ${h.suggestions?.length||0}개</summary>${h.history.map(v=>`<p>${esc(date(v.created_at))} · ${esc(v.confidence)}<br>${esc(v.note)}</p>`).join('')}${(h.suggestions||[]).map(e=>`<p>${esc(e.quote.slice(0,200))} <button data-doc="${esc(e.document_version_id)}">검토 ↗</button></p>`).join('')}</details><p class="detail-note">신뢰도는 검토자의 판단입니다. 주가 방향·크기는 미판정입니다.</p></article>`}).join('')||'<div class="empty-state">이 기업과 연결된 추적 가설이 아직 없어요.<br>공식 근거와 반증 조건을 확보하며 연구를 이어갑니다.</div>'}
  function renderConnections(){const list=D.coobservations.filter(x=>x.companies.includes(S.company));return list.map(x=>`<article class="connection-row"><span class="chip blue">교차 관측 후보</span><h3>${esc(x.theme)}</h3><div class="company-chips">${x.companies.map(c=>`<button data-company="${esc(c)}">${esc(c)} ↗</button>`).join('')}</div><p>${esc(x.interpretation)}</p>${x.evidence.map(e=>`<button class="evidence-row" data-doc="${esc(e.version_id)}"><strong>${esc(e.company)}</strong><p>${esc(e.quote)}</p></button>`).join('')}<p class="detail-note">발표의 독립성과 과거 대비 증가를 확인하기 전 후보로 유지됩니다.</p></article>`).join('')||'<div class="empty-state">최근 45일의 서로 다른 기업에서 연결할 공식 근거를 찾고 있어요.<br>출처 확인을 통과한 문단만 후보에 포함됩니다.</div>'}
  function renderScenario(){return `<div class="scenario"><h3>실적 가정이 주당 가치에 미치는 민감도</h3><p>가정의 통화와 단위를 맞춰 입력하세요. 실제 발표 금액이나 현재 시장 기대는 자동 대입되지 않습니다.</p><form id="scenario-form"><div class="scenario-grid"><label class="field">통화<select name="currency"><option>USD</option><option>KRW</option></select></label>${[['revenue','연간 추가 매출 (10억)'],['margin','증분 영업이익률 (%)'],['cost','연간 추가 비용 (10억)'],['tax','세율 (%)'],['shares','희석 주식 수 (10억 주)'],['pe','적용 PER (배)'],['priced','이미 반영된 비율 (%)']].map(([n,l])=>`<label class="field">${l}<input name="${n}" type="number" step="any" required placeholder="직접 입력"></label>`).join('')}</div><button class="primary" type="submit">가정 계산</button><div id="scenario-output" class="scenario-output" aria-live="polite">모든 가정을 입력하면 계산합니다.</div></form><p class="detail-note">[(추가 매출 × 이익률 − 추가 비용) × (1 − 세율) ÷ 주식 수] × PER × (1 − 이미 반영된 비율). 입력 가정에 대한 단순 민감도이며 실제 주가 예측은 검증 대기 중입니다.</p></div>`}
  function renderResearch(){document.querySelectorAll('#research-tabs [data-tab]').forEach(b=>{const active=b.dataset.tab===S.tab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;b.id='tab-'+b.dataset.tab;b.setAttribute('aria-controls','research-content')});$('#research-content').setAttribute('aria-labelledby','tab-'+S.tab);$('#filters').hidden=S.tab!=='evidence';$('#research-content').innerHTML=S.tab==='evidence'?renderEvidence():S.tab==='hypotheses'?renderHypotheses():S.tab==='connections'?renderConnections():S.tab==='graph'?RadarGraph.render(D.graph,{company:S.company,focus:S.graphFocus,certainty:S.graphCertainty}):renderScenario();}
  function closeInspector(){const wasOpen=$('#inspector').classList.contains('open');$('#inspector').classList.remove('open');$('#inspector').removeAttribute('aria-modal');$('#inspector').removeAttribute('role');for(const el of [$('#main'),$('.watchlist'),$('.app-header')])el.inert=false;if(wasOpen)document.querySelector('[data-doc="'+S.selected+'"]')?.focus()}
  function openInspector(){$('#inspector').classList.add('open');if(innerWidth<=1250){$('#inspector').setAttribute('role','dialog');$('#inspector').setAttribute('aria-modal','true');for(const el of [$('#main'),$('.watchlist'),$('.app-header')])el.inert=true;$('#close-inspector').focus()}}
  function renderDetail(open=false){const d=D.documents.find(d=>d.id===S.selected)||docs()[0];if(!d){$('#detail-content').innerHTML='<div class="empty-state">선택한 기업의 공식 근거를 준비하고 있어요.</div>';return}S.selected=d.id;
    const impact=d.impact,links=D.hypotheses.filter(h=>h.evidence.some(e=>e.document_version_id===d.id));
    const numeric=D.capex.find(p=>p.document_version_id===d.id);
    const latestReactions=(d.market_reactions||[]).filter((r,i,all)=>all.findIndex(x=>x.ticker===r.ticker)===i);
    const marketHtml=latestReactions.length?`<section class="detail-block"><h3>발표 후 가격 반응</h3>${latestReactions.map(r=>`<p class="detail-note">${esc(r.ticker)} · ${esc(r.benchmark)} 대비 · 기준 거래일 ${esc(r.reaction_date)}</p>${Object.entries(r.windows).map(([h,p])=>`<p class="detail-note">${h}거래일: ${p.status==='measured'?'시장 대비 차이 '+esc(p.excess_return_pp)+'%p':p.status==='awaiting_sessions'?'자료 대기':'거래일 불일치'}</p>`).join('')}<p class="locator">자료: ${esc(r.price_source)} / ${esc(r.benchmark_source)}</p>`).join('')}<p class="detail-note">다른 동시 사건을 제거하지 않은 사후 관측값입니다.</p></section>`:'';
    $('#detail-content').innerHTML=`<div class="chips"><span class="chip blue">${esc(d.company)}</span><span class="chip">${esc(d.alert?'알림 후보':kindLabels[d.kind]||d.kind)}</span></div><h3 class="detail-title">${esc(d.title)}</h3><div class="detail-meta">공개 ${esc(d.publication_precision==='date'?day(d.published_at)+' (공식 발행일 · 시각 미확인)':date(d.published_at))}<br>첫 확보 ${esc(date(d.first_seen_at))}<br>${esc(d.scope)}</div><a class="detail-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">공식 원문 보기 ↗</a>
    ${numeric?`<section class="detail-block"><h3>수치 변화 · 회사 전체 CAPEX</h3><p class="evidence-quote">분기 $${fmt(numeric.current)}m<br>전분기 $${fmt(numeric.prior_quarter)}m → $${fmt(numeric.current)}m (${fmt(numeric.quarter_pct)}%)<br>전년 동기 $${fmt(numeric.prior_year)}m 대비 ${fmt(numeric.year_pct)}%</p><details class="provenance"><summary>계산에 사용한 공식 표 행</summary><blockquote class="evidence-quote">${esc(numeric.quote)}</blockquote><p class="locator">${esc(numeric.locator)} · 문단 ${esc(numeric.span_id)}</p></details><p class="detail-note">표의 3개월 수치만 비교했어요. AI 전용 투자액·이상 신호·주가 방향은 미판정입니다.</p></section>`:''}
    <section class="detail-block"><h3>관측 · 공식 근거</h3>${d.spans.slice(0,5).map(s=>`<blockquote class="evidence-quote">${esc(s.quote)}</blockquote><p class="locator">${esc(s.locator)}</p>`).join('')}<p class="detail-note">문서의 표현은 관측된 근거입니다. 발표 내용의 실현 여부는 후속 자료로 확인합니다.</p></section>
    <section class="detail-block"><h3>주가 영향 경로</h3><span class="chip ${impact.review_state==='needs_review'?'':'blue'}">${esc(impact.review_state==='curated_path'?'근거별 분석 경로':impact.review_state==='rule_candidate'?'자동 후보 · 검토 필요':'분석 대기')}</span>${impact.cases.map(c=>`<div class="analysis-card"><strong>${esc(c.target)} · ${esc(c.ticker)}</strong><p><span class="label">실적 연결</span>${esc(c.financial_link)}</p><p><span class="label">상방 조건</span>${esc(c.upside_if)}</p><p><span class="label">하방·반증</span>${esc(c.downside_if)}</p><p><span class="label">다음 확인</span>${esc(c.market_check)}</p></div>`).join('')||'<p class="detail-note">현재 이 발표의 실적 연결 경로는 검토 대기 중이에요.</p>'}<p class="detail-note">주가 방향·크기: 미판정. ${esc(impact.price_reason)}</p></section>
    ${marketHtml}<section class="detail-block"><h3>연결된 가설 ${links.length}개</h3>${links.map(h=>`<p class="detail-note">${esc(h.claim)}${h.stale?' · 재검토 필요':''}</p>`).join('')||'<p class="detail-note">검토된 가설 연결이 아직 없습니다.</p>'}</section>
    <section class="detail-block"><details class="provenance"><summary>문서 버전·원문 해시·변경 비교</summary><p class="locator">버전 ${esc(d.id)}<br>SHA-256 ${esc(d.raw_hash)}</p><pre>${esc(d.diff||'첫 확보 자료 · 이전 버전과 비교 없음')}</pre></details><button class="quiet small" data-export-doc="${esc(d.id)}">이 근거 내보내기</button></section>`;
    if(open)openInspector();
  }
  function renderQuality(){$('#quality-list').innerHTML=D.companies.map(c=>`<div class="quality-row"><strong>${esc(c.name)}</strong><span class="chip ${c.quality==='ok'?'blue':'amber'}">${esc(labels[c.quality])}</span><small>최근 확인 ${esc(date(c.checked_at))} · 저장 ${c.document_count}건${c.health.excerpt_only?' · RSS 요약만 확보됨 · 제품 발표 제외 가능':''}${c.health.detail_failed?' · 원문 확인 실패 '+c.health.detail_failed+'건':''}${c.health.window_overlap===false?' · 수집 창 사이 누락 가능':''}${c.health.error?' · '+esc(c.health.error):''}</small></div>`).join('')}
  function render(){renderCompanies();renderHeader();renderDetail();renderResearch();renderChart();renderQuality();$('#generated-at').textContent='화면 생성 '+date(D.created_at)}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.company)selectCompany(b.dataset.company);
    if(b.dataset.doc){const d=D.documents.find(x=>x.id===b.dataset.doc);if(d){if(d.company!==S.company)selectCompany(d.company);S.selected=d.id;renderResearch();renderDetail(true)}else toast('해당 근거의 최신 화면 자료가 없어요. 전체 보고서를 확인하세요.')}
    if(b.dataset.exportDoc){const d=D.documents.find(d=>d.id===b.dataset.exportDoc);exportJSON('radar-evidence-'+d.id+'.json',d)}
    if(b.dataset.chartDay)selectChartDay(b.dataset.chartDay);
    if(b.dataset.mode){S.mode=b.dataset.mode;renderChart()}
    if(b.dataset.range){S.range=b.dataset.range;document.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('active',x===b));applyRange()}
    if(b.dataset.tab){S.tab=b.dataset.tab;renderResearch()}
    if(b.dataset.graphNode){S.graphFocus=b.dataset.graphNode;renderResearch()}
    if(b.hasAttribute('data-graph-home')){S.graphFocus=null;renderResearch()}
    if(b.hasAttribute('data-export-graph'))exportJSON('radar-relations.json',D.graph);
    if(b.hasAttribute('data-open-quality'))$('#quality-dialog').showModal();
    if(b.dataset.close)$('#'+b.dataset.close).close();
  });
  $('#search').addEventListener('input',e=>{S.query=e.target.value.toLowerCase().trim();renderResearch();if(S.mode==='observations')renderChart()});
  $('#theme-filter').addEventListener('change',e=>{S.theme=e.target.value;renderResearch();if(S.mode==='observations')renderChart()});
  $('#new-only').addEventListener('change',e=>{S.newOnly=e.target.checked;renderResearch();if(S.mode==='observations')renderChart()});
  $('#all-companies').onclick=()=>{S.watchOnly=false;renderCompanies()};$('#watch-only').onclick=()=>{S.watchOnly=true;renderCompanies()};
  $('#star-company').onclick=()=>{S.stars=S.stars.includes(S.company)?S.stars.filter(c=>c!==S.company):[...S.stars,S.company];safeStore.set('radar:stars',S.stars);renderCompanies();renderHeader()};
  $('#theme-toggle').onclick=()=>{S.dark=!S.dark;safeStore.set('radar:dark',S.dark);colorTheme();renderChart()};
  $('#quality-button').onclick=()=>$('#quality-dialog').showModal();$('#close-inspector').onclick=closeInspector;
  $('#fit-chart').onclick=()=>{S.range='ALL';renderChart()};$('#import-prices').onclick=()=>{$('#import-error').textContent='';$('#import-dialog').showModal()};
  $('#export-company').onclick=()=>exportJSON('radar-'+company().ticker+'-evidence.json',{created_at:D.created_at,company:company(),documents:docs(),capex:D.capex.filter(p=>p.company===S.company),hypotheses:relatedHypotheses(),prices:S.prices[company().ticker]||null});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')&&!$('#main').inert){e.preventDefault();$('#search').focus()}if(e.key==='Escape')closeInspector();if(e.target.closest('[role=tablist]')&&['ArrowLeft','ArrowRight'].includes(e.key)){const tabs=[...document.querySelectorAll('#research-tabs [role=tab]')],i=tabs.indexOf(e.target),next=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];next.focus();next.click();e.preventDefault()}});
  $('#price-form').addEventListener('submit',async e=>{e.preventDefault();try{const file=$('#price-file').files[0],source=$('#price-source').value.trim();if(!file||!source)throw Error('종목 파일과 자료 출처를 입력하세요.');if(file.size>2*1024*1024)throw Error('파일은 2MB 이하여야 합니다.');const parsed=RadarData.parsePriceCSV(await file.text());if(parsed.points.some(p=>p.time>day(D.created_at)))throw Error('화면 생성일 이후의 미래 가격이 포함되어 있습니다.');let benchmark=null;const bfile=$('#benchmark-file').files[0];if(bfile){const bsource=$('#benchmark-source').value.trim();if(!bsource)throw Error('비교지수 자료 출처를 입력하세요.');if(bfile.size>2*1024*1024)throw Error('비교지수 파일은 2MB 이하여야 합니다.');benchmark={...RadarData.parsePriceCSV(await bfile.text()),source:bsource};if(benchmark.points.some(p=>p.time>day(D.created_at)))throw Error('비교지수에 미래 가격이 포함되어 있습니다.');RadarData.compareAdjusted(parsed,benchmark)}S.prices[company().ticker]={...parsed,source,benchmark,file_name:file.name,imported_at:new Date().toISOString()};S.mode='price';S.range='ALL';$('#import-dialog').close();renderChart();toast('가격 자료를 차트에 적용했어요.')}catch(error){$('#import-error').textContent=error.message}});
  $('#research-content').addEventListener('submit',e=>{if(e.target.id!=='scenario-form')return;e.preventDefault();const f=new FormData(e.target),names=['revenue','margin','cost','tax','shares','pe','priced'],v=names.map(n=>Number(f.get(n)));const [revenue,margin,cost,tax,shares,pe,priced]=v,out=$('#scenario-output');if(v.some(n=>!Number.isFinite(n))||revenue<0||cost<0||margin<0||margin>100||tax<0||tax>100||shares<=0||pe<0||priced<0||priced>100){out.textContent='비율은 0~100, 주식 수는 0 초과, 매출·비용·PER은 0 이상으로 입력하세요.';return}const eps=(revenue*margin/100-cost)*(1-tax/100)/shares;out.textContent=`가정상 주당 이익 변화 ${fmt(eps)} ${f.get('currency')} · 주당 가치 민감도 ${fmt(eps*pe*(1-priced/100))} ${f.get('currency')}`});
  $('#research-content').addEventListener('change',e=>{if(e.target.id==='graph-certainty'){S.graphCertainty=e.target.value;renderResearch()}});
  $('#research-content').addEventListener('click',e=>{const summary=e.target.closest('.relation-proof summary');if(!summary)return;const card=summary.closest('[data-relation]'),edge=D.graph?.edges.find(x=>x.id===card.dataset.relation),index=[...card.querySelectorAll('.relation-proof')].indexOf(summary.parentElement),ref=edge?.evidence[index];if(!ref)return;const doc=D.documents.find(x=>x.id===ref.document_version_id);if(doc){S.selected=doc.id;renderDetail()}else toast('이전 원문 버전의 근거는 이 관계 카드에서 확인할 수 있어요.')});
  let resizeFrame;
  new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>requestAnimationFrame(()=>{applyRange();if(innerWidth>1250&&$('#inspector').classList.contains('open'))closeInspector()}))}).observe($('#chart'));
  colorTheme();render();
})();
