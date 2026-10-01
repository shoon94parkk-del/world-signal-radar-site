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
  function summaryHtml(doc){
    const ko=doc.ko;
    if(ko?.status!=='reviewed')return '<p class="detail-note">한국어 요약 준비 중 · 이 원문 버전의 요약을 아직 검토하지 않았습니다.</p>';
    const scope={selected_paragraphs:'제목·선택한 본문 문단 기준',excerpt:'제목·RSS 요약 기준 · 상세 본문 미확보',title_only:'제목만 확보 · 세부 내용 미확인'}[ko.scope]||'발췌 범위';
    return `<section class="korean-summary"><span class="chip blue">한국어 요약</span><p>${esc(ko.summary)}</p><small>${esc(scope)} · 전체 문서 번역은 아닙니다.</small><details class="provenance"><summary>요약에 사용한 영어 원문 ${ko.evidence.length}개</summary><p class="detail-note">AI가 작성하고 저장된 원문과 대조한 요약입니다. 해석은 아래 분석에서 구분합니다.</p>${ko.evidence.map(ref=>`<blockquote class="evidence-quote">${esc(ref.quote)}</blockquote><p class="locator">${esc(ref.locator)} · 문단 ${esc(ref.span_id)}</p>`).join('')}<p class="locator">검토 ${esc(ko.reviewed_at)} · 버전 ${esc(doc.id)}<br>SHA-256 ${esc(doc.raw_hash)}</p></details></section>`;
  }
  function render(stories,selected){
    if(!stories?.length)return '<p class="empty-state">원문을 연결한 신호 읽기 사례를 준비하고 있습니다.</p>';
    const story=stories.find(s=>s.id===selected)||stories[0];
    const events=new Set(story.observations.filter(o=>o.status==='available').map(o=>o.event_group)).size;
    return `<div class="reading-heading"><div><p class="eyebrow">작은 단서를 연결하는 방법</p><h2>이 자료로 무엇을 판단할 수 있을까요?</h2><p>아래 사례를 따라 관측과 해석을 구분하고, 다음에 확인할 증거를 찾아보세요.</p></div><span class="chip blue">근거를 연결한 연구 후보</span></div>
    <div class="reading-tabs" role="tablist" aria-label="신호 읽기 사례">${stories.map(s=>`<button role="tab" data-story="${esc(s.id)}" aria-selected="${s.id===story.id}" aria-controls="reading-story" id="reading-tab-${esc(s.id)}" tabindex="${s.id===story.id?0:-1}">${esc(s.label)}</button>`).join('')}</div>
    <div id="reading-story" role="tabpanel" aria-labelledby="reading-tab-${esc(story.id)}"><h3>${esc(story.title)}</h3><p class="reading-why">${esc(story.why)}</p>
    <div class="reading-flow" aria-label="연결해서 검토할 경로">${story.connection.map((node,i)=>`<span>${esc(node)}</span>${i<story.connection.length-1?'<span class="flow-arrow" aria-hidden="true">→</span>':''}`).join('')}</div><p class="reading-caption">위 화살표는 검토할 경로입니다. 공급 물량이나 수혜가 확정된 관계를 뜻하지 않습니다.</p>
    <div class="reading-steps"><section><h4><span>1</span>관측 · 원문에서 확인한 것</h4>${story.observations.map(o=>o.status==='available'?`<article class="reading-observation"><div><strong>${esc(name(o.company))}</strong><span class="chip">${esc(o.stage)}</span></div><p>${esc(o.observed_ko)}</p><small>발표 ${esc(o.published_at.slice(0,10))}</small><button class="reading-proof-button" data-doc="${esc(o.version_id)}">이 발표의 한국어 요약 ↗</button><details><summary>이 판단의 정확한 원문</summary><blockquote class="evidence-quote">${esc(o.quote)}</blockquote><p class="locator">문단 ${esc(o.span_id)} · 버전 ${esc(o.version_id)}<br>SHA-256 ${esc(o.raw_hash)}</p><a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">공식 원문 보기 ↗</a></details></article>`:`<p class="reading-gap">원문 버전이 달라졌거나 확인되지 않은 근거: ${esc(o.observed_ko)} · 재검토 전 판단에 사용하지 않습니다.</p>`).join('')}</section>
    <section><h4><span>2</span>변화 · 아직 단정할 수 없는 것</h4><div class="reading-state"><strong>${story.evidence_count===0?'원문 재검토 전 판단 보류':story.missing_evidence?'연결 단서는 있음 · 일부 근거 재검토':'연결 단서는 있음 · 실제 확대는 확인 중'}</strong><p>확인한 문단 ${story.evidence_count}개 · 원문 발행 기업 ${story.companies.length}곳 · 묶어서 볼 사건 ${events}개</p><p>모두 발표·해설 채널입니다. 사건과 기업 수가 많아도 독립적인 채용·특허·투자 증거가 추가된 것은 아닙니다.</p><p>과거 대비 활동 증가와 종합점수는 아직 확인하지 못했습니다.</p><button class="quiet small" data-reading-frequency="${esc(story.id)}">빈도 기준선과 관측 부족 확인</button></div><h4><span>3</span>관계 → 가설 · 이렇게 연결해 볼 수 있음</h4><p class="reading-hypothesis">${esc(story.hypothesis)}</p><p class="reading-caption">공식 발표를 연결한 분석자의 가설입니다.</p><div class="reading-price"><b>실적과 주가까지 연결하려면</b><p>${esc(story.price_path)}</p><small>실제 주문·마진·시장 기대와 가격을 확인하기 전 주가 방향은 미판정입니다.</small></div></section></div>
    <div class="reading-checks"><section><h4>이 증거가 붙으면 가설이 강해져요</h4><ul>${story.next_checks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section><section><h4>이런 변화가 보이면 다시 생각해야 해요</h4><ul>${story.counterchecks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section></div>
    <p class="reading-pitfall"><b>헷갈리기 쉬운 점</b> ${esc(story.pitfall)}</p><div class="reading-actions"><button class="quiet" data-reading-graph="${esc(story.id)}">관련 기업의 관계 그래프 보기</button><button class="quiet" data-export-stories>이 사례와 근거 내보내기</button></div></div>
    <details class="reading-glossary"><summary>용어를 쉽게 읽기 · HBM / CPO / 설비투자</summary><dl>${Object.entries(terms).map(([term,meaning])=>`<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl></details>`;
  }
  window.RadarReading={render,name,theme,title,summary,summaryHtml,confidence:v=>confidence[v]||v};
})();
