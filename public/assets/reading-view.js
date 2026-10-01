(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={'NVIDIA':'엔비디아','AMD':'AMD','Broadcom':'브로드컴','TSMC':'TSMC','SK hynix':'SK하이닉스','Samsung Electronics':'삼성전자','Samsung':'삼성전자','Micron':'마이크론'};
  const themes={'CPO · Silicon Photonics':'광통신 · CPO / 실리콘 포토닉스','HBM · HBM4':'고대역폭 메모리 · HBM / HBM4','Advanced Packaging':'첨단 패키징'};
  const confidence={low:'낮음',medium:'중간',high:'높음',unassessed:'미평가'};
  const terms={HBM:'GPU에 데이터를 빠르게 공급하는 고대역폭 메모리입니다.',CPO:'광학 부품을 칩 패키지에 함께 넣어 데이터 이동과 전력 문제를 줄이려는 연결 방식입니다.',
    '첨단 패키징':'여러 칩을 가까이 배치하거나 쌓고 연결하는 기술입니다. 연결 공정과 수율 관리가 중요합니다.',CAPEX:'공장·설비 등 장기간 사용하는 자산에 지출하는 설비투자입니다. 회사 전체 투자와 특정 기술 투자는 다릅니다.',
    '하이브리드 본딩':'칩 표면과 금속 연결부를 직접 접합하는 기술입니다. 기술 전망과 실제 양산 채택을 구분해야 합니다.',
    'Signal Score':'여러 독립적인 변화의 강도를 비교하려는 종합 지표입니다. 현재는 발표 빈도 한 채널만 계측해 종합점수를 보류합니다.'};
  const name=v=>names[v]||v,theme=v=>themes[v]||v;
  const title=d=>d?.ko?.status==='reviewed'?d.ko.title:d?.title||'자료 확인 대기';
  const summary=d=>d?.ko?.status==='reviewed'?d.ko.summary:'한국어 요약을 준비 중입니다. 영어 원문은 근거 상세에서 확인할 수 있습니다.';
  function judgmentHtml(doc){
    const changes={baseline:'처음 확보한 기준 자료입니다. 최근 새로 발생한 변화로 세지 않습니다.',
      metadata_only:'표시 정보가 바뀌었습니다. 본문의 새로운 변화로 세지 않습니다.',
      parser_reprocess:'추출 방식을 갱신한 자료입니다. 새로운 기업 발표로 세지 않습니다.',
      content_changed:'본문이 달라졌습니다. 이전 문단과 비교해 어떤 주장이 바뀌었는지 확인해야 합니다.'};
    return `<section class="document-judgment"><h3>이 자료는 지금 어떤 단서인가요?</h3><p>${esc(changes[doc.kind]||'새로 확인한 자료입니다. 발표일과 첫 확보일을 함께 확인하세요.')}</p><p>${doc.alert?'원문 비교가 필요한 알림 후보입니다.':doc.themes?.length?'관련 기술 용어를 찾은 자료입니다.':'관련 기술 단서 미분류 · 산업 변화와의 연결을 아직 검토하지 않았습니다.'}</p><small>용어 일치와 알림 후보만으로 투자 증가·수주·주가 방향을 판단하지 않습니다.</small></section>`;
  }
  function contextHtml(doc,stories){
    const linked=(stories||[]).flatMap(story=>story.observations
      .filter(o=>o.status==='available'&&o.version_id===doc.id&&o.raw_hash===doc.raw_hash)
      .map(observation=>({story,observation})));
    if(!linked.length)return '';
    return `<section class="korean-summary"><h3>이 자료가 연결되는 신호</h3>${linked.map(({story,observation})=>`<p><b>${esc(story.label)} · ${esc(observation.stage)}</b><br>${esc(observation.observed_ko)}</p><p class="detail-note">다음 판단의 갈림길: ${esc(story.next_checks[0])}</p><button class="quiet small" data-reading-context="${esc(story.id)}">다른 기업의 근거와 연결해서 보기 ↗</button>`).join('')}<small>검토한 원문 문단이 사례에 연결돼 있습니다. 실제 확대와 주가 방향은 후속 증거로 판단합니다.</small></section>`;
  }
  function summaryHtml(doc){
    const ko=doc.ko;
    if(ko?.status!=='reviewed')return '<p class="detail-note">한국어 요약 준비 중 · 이 원문 버전의 요약을 아직 검토하지 않았습니다.</p>';
    const scope={selected_paragraphs:'제목·선택한 본문 문단 기준',excerpt:'제목·RSS 요약 기준 · 상세 본문 미확보',title_only:'제목만 확보 · 세부 내용 미확인'}[ko.scope]||'발췌 범위';
    return `<section class="korean-summary"><span class="chip blue">한국어 요약</span><p>${esc(ko.summary)}</p><small>${esc(scope)} · 전체 문서 번역은 아닙니다.</small><details class="provenance"><summary>요약의 근거 문단 ${ko.evidence.length}개 · 한국어 번역과 영어 원문</summary><p class="detail-note">AI가 작성하고 저장된 원문과 대조한 요약입니다. 해석은 아래 분석에서 구분합니다.</p>${ko.evidence.map(ref=>`${ref.quote_ko?`<p class="reading-translation">${esc(ref.quote_ko)}</p>`:''}<blockquote class="evidence-quote">${esc(ref.quote)}</blockquote><p class="locator">${esc(ref.locator)} · 문단 ${esc(ref.span_id)}</p>`).join('')}<p class="locator">검토 ${esc(ko.reviewed_at)} · 버전 ${esc(doc.id)}<br>SHA-256 ${esc(doc.raw_hash)}</p></details></section>`;
  }
  function render(stories,selected){
    if(!stories?.length)return '<p class="empty-state">원문을 연결한 핵심 Signal을 준비하고 있습니다.</p>';
    const story=stories.find(s=>s.id===selected)||stories[0];
    const active=story.observations.filter(o=>o.status==='available');
    const status=s=>s.signal_score!=null?'강도 측정 중':s.companies?.length>=2?'교차 관측':'관측 중';
    const headline=s=>({
      hbm:'AI 메모리 공급망이 다음 단계로 움직이는가',
      cpo:'AI 병목이 연산에서 데이터 이동으로 번지는가',
      packaging:'고적층 메모리가 본딩 공정 변화를 부르는가'
    }[s.id]||s.title);
    const short=s=>s.judgment?.can_say||s.assessment||s.why;
    const evidence=s=>(s.observations||[]).filter(o=>o.status==='available').length;
    const selectedCompanies=[...new Set(active.map(o=>o.company).filter(Boolean))];
    const firstProof=active[0];
    return `<div class="signal-home">
      <section class="signal-hero">
        <div>
          <p class="eyebrow">WORLD SIGNAL RADAR</p>
          <h2>지금 세계 산업에서<br>무엇이 바뀌고 있는가</h2>
          <p>기업들의 공식 발표를 따로 읽지 않고 연결해서 봅니다. 기술·투자·공급망의 작은 변화가 같은 방향을 가리키는지 추적합니다.</p>
        </div>
        <div class="signal-summary">
          <div><strong>${stories.length}</strong><span>현재 추적 Signal</span></div>
          <div><strong>${stories.reduce((n,s)=>n+evidence(s),0)}</strong><span>연결된 근거 문단</span></div>
          <div><strong>${new Set(stories.flatMap(s=>s.companies||[])).size}</strong><span>근거 기업</span></div>
        </div>
      </section>

      <section class="signal-block">
        <div class="signal-section-head">
          <div><p class="eyebrow">CORE SIGNALS</p><h3>현재 핵심 Signal</h3></div>
          <span>강화·약화 점수는 기준선 확보 후 표시</span>
        </div>
        <div class="signal-card-grid">
          ${stories.map((s,i)=>`<button class="signal-card ${s.id===story.id?'active':''}" data-story="${esc(s.id)}" aria-pressed="${s.id===story.id}">
            <div class="signal-card-top"><span>0${i+1}</span><span class="signal-state">${esc(status(s))}</span></div>
            <strong>${esc(headline(s))}</strong>
            <p>${esc(short(s))}</p>
            <small>근거 ${evidence(s)}개 · 기업 ${(s.companies||[]).length}곳</small>
          </button>`).join('')}
        </div>
      </section>

      <section class="signal-map-panel" aria-label="산업 Signal Map">
        <div class="signal-section-head">
          <div><p class="eyebrow">SIGNAL MAP</p><h3>산업 변화가 연결되는 경로</h3></div>
          <span>확정 공급관계가 아닌 관찰 지도</span>
        </div>
        <div class="signal-map">
          <span>AI Compute</span><b>→</b><span class="hot">HBM</span><b>→</b><span class="hot">Advanced Packaging</span><b>→</b><span class="hot">Data Movement · CPO</span><b>→</b><span class="muted-node">Power · Cooling</span>
        </div>
        <p class="signal-map-note">현재는 HBM · 첨단 패키징 · CPO를 핵심 추적축으로 검토합니다. 전력·냉각 등 주변 인프라는 근거를 더 연결한 뒤 정식 Signal로 확장합니다.</p>
      </section>

      <section class="signal-focus">
        <div class="signal-focus-head">
          <div><p class="eyebrow">SELECTED SIGNAL</p><h3>${esc(headline(story))}</h3><p>${esc(story.why)}</p></div>
          <span class="signal-state large">${esc(status(story))}</span>
        </div>
        <div class="signal-verdict">
          <section><span>지금 확인된 것</span><p>${esc(story.judgment?.can_say||story.assessment)}</p></section>
          <section><span>아직 확인 못 한 것</span><p>${esc(story.judgment?.not_yet||'과거 대비 증가·실제 공급·주가 방향 미확인')}</p></section>
          <section><span>다음 확인</span><p>${esc(story.judgment?.watch_next||story.next_checks?.[0]||'후속 공식 근거')}</p></section>
        </div>

        <div class="signal-focus-grid">
          <section>
            <h4>연결해서 보는 흐름</h4>
            <div class="reading-flow">${story.connection.map((node,i)=>`<span>${esc(node)}</span>${i<story.connection.length-1?'<span class="flow-arrow" aria-hidden="true">→</span>':''}`).join('')}</div>
            <p class="reading-caption">이 경로는 검토할 산업 연결입니다. 주문·수혜·주가 상승을 확정하는 관계가 아닙니다.</p>
          </section>
          <section>
            <h4>관련 기업과 근거</h4>
            <div class="signal-company-list">${selectedCompanies.map(c=>`<span>${esc(name(c))}</span>`).join('')||'<span>근거 재검토 중</span>'}</div>
            <p class="signal-evidence-line">${active.slice(0,3).map(o=>`${esc(name(o.company))}: ${esc(o.observed_ko)}`).join('<br>')||'연결된 원문을 다시 확인하고 있습니다.'}</p>
            <div class="signal-actions">
              ${firstProof?`<button class="primary" data-doc="${esc(firstProof.version_id)}">대표 근거 보기</button>`:''}
              <button class="quiet" data-reading-frequency="${esc(story.id)}">강도 기준선 확인</button>
            </div>
          </section>
        </div>
      </section>

      <div class="signal-transition">
        <div><p class="eyebrow">DEEP DIVE</p><strong>아래부터는 기업별 상세 분석입니다.</strong><span>차트 · 공식 발표 · 가설 · 관계 그래프 · 실적 시나리오</span></div>
      </div>
    </div>`;
  }
  window.RadarReading={render,name,theme,title,summary,summaryHtml,contextHtml,judgmentHtml,confidence:v=>confidence[v]||v};
})();
