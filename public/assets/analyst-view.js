(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages={research:'연구·기술 해설',plan:'계획',exhibition:'전시',sampling:'샘플',product_support:'제품 지원 범위',available:'공급 발표',shipment:'출하 표현',financial_actual:'실적 발표',unknown:'단계 미분류'};
  const date=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))+' KST':'미확인';
  const errorLabel=text=>/Unknown hypothesis reference/.test(text)?'등록되지 않은 가설을 참조해 결과를 거부했습니다.':/non-conflicting evidence/.test(text)?'같은 문단을 지지와 반박에 동시에 사용해 결과를 거부했습니다.':/timeout|timed out/i.test(text)?'로컬 분석이 제한 시간 안에 끝나지 않았습니다.':/incomplete|model mismatch|model changed/.test(text)?'응답 완료 또는 모델 일치 여부를 확인하지 못했습니다.':'분석 검증을 통과하지 못했습니다. 원인 기록을 보존했으며 기본 근거 화면은 계속 사용할 수 있습니다.';
  const proof=(ref,documents)=>{
    if(!ref)return '';
    const doc=documents.find(d=>d.id===ref.document_version_id);
    const translation=doc?.ko?.evidence?.find(p=>p.span_id===ref.span_id&&p.quote===ref.quote)?.quote_ko;
    return `<details class="analyst-proof"><summary>${esc(ref.key)} · ${esc(doc?.ko?.status==='reviewed'?doc.ko.title:ref.title||ref.company)}</summary>
      ${translation?`<p class="analyst-translation">검토된 문단 번역 · ${esc(translation)}</p>`:''}
      <blockquote class="evidence-quote">${esc(ref.quote)}</blockquote><p class="locator">문단 ${esc(ref.span_id)} · 버전 ${esc(ref.document_version_id)}<br>SHA-256 ${esc(ref.raw_hash)}</p>
      <a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">공식 원문 ↗</a> <button class="quiet small" data-doc="${esc(ref.document_version_id)}">이 근거의 한국어 요약 ↗</button></details>`;
  };
  function render(analysis={},company,documents=[],published=false){
    const rows=(analysis?.results||[]).filter(r=>r.packet?.evidence?.some(e=>e.company===company));
    const intro=published?(rows.length?'로컬 모델의 초안을 분석자가 검토해 공개한 결과입니다. 이 사이트는 모델을 실행하지 않습니다.':'이 기업과 연결된 AI 해석은 아직 공개 검토를 통과하지 않았습니다. 위의 신호 읽기에서 검토된 근거 사례를 먼저 볼 수 있습니다. 이 사이트는 모델을 실행하지 않습니다.'):analysis.mode==='local_ollama'?'로컬 모델 분석을 설정했습니다. 새 변화 후보만 정해진 처리량 안에서 분석합니다.':'자동 로컬 분석은 기본 꺼짐입니다. 별도로 실행한 분석 결과가 있으면 아래에 표시합니다.';
    return `<section class="analyst-intro"><h3>근거를 연결한 AI 해석</h3><p>${esc(intro)}</p><p>원문 연결 확인은 의미의 정확성을 보증하지 않습니다. 분석자의 검토·독립성·반대 증거를 함께 확인하세요.</p><button class="quiet small" data-reading-context="cpo">검토된 CPO 연결 사례 보기</button></section>${rows.map(job=>{
      const refs=job.packet.evidence,observations=job.content?.observations||[],candidates=job.content?.hypothesis_candidates||[];
      const rejected=job.semantic_review==='rejected',approved=job.semantic_review==='approved';
      const status=job.status==='running'?'로컬 분석 실행 기록 · 완료 확인 필요':job.status==='failed'?'분석 실패':approved?'분석자 의미 검토 완료':rejected?'의미 검토 반려':'의미 검토 대기';
      const body=`<h4>AI가 요약한 관측</h4>${observations.map(o=>`<article class="analyst-observation"><span class="chip">${esc(stages[o.stage]||'단계 미분류')} · AI 분류</span><p>${esc(o.summary_ko)}</p>${o.evidence_ids.map(key=>proof(refs.find(r=>r.key===key),documents)).join('')}</article>`).join('')}
        ${candidates.map(c=>`<article class="analyst-candidate"><span class="chip blue">${c.existing_hypothesis_key?'기존 추적 가설 연결 후보':'새 가설 후보 · 미등록'}</span><h4>${esc(c.claim_ko)}</h4><p><b>대안 설명</b> ${esc(c.alternative_ko)}</p><p><b>반증 조건</b> ${esc(c.disconfirm_ko)}</p><p><b>실적 연결 또는 미확인 부분</b> ${esc(c.impact_path_ko)}</p><p><b>다음 확인</b> ${c.next_checks_ko.map(esc).join(' · ')}</p><p class="detail-note">지지로 제안한 문단 ${c.supporting_ids.length}개 · 반박으로 제안한 문단 ${c.contradicting_ids.length}개. 직접 반박이 없다고 반대 증거가 없다는 뜻은 아닙니다.</p><details><summary>가설 연결에 사용한 원문</summary>${[...new Set([...c.supporting_ids,...c.contradicting_ids])].map(key=>proof(refs.find(r=>r.key===key),documents)).join('')}</details></article>`).join('')}`;
      return `<article class="analyst-job"><div class="chips"><span class="chip ${approved?'blue':'amber'}">${esc(status)}</span><span class="chip">${job.packet.origin==='historical_bootstrap'?'과거 자료 분석 · 새 변화 아님':'변화 후보의 분석'}</span></div><h3>${esc(job.packet.theme)}</h3>
        <p class="detail-note">${job.content?'원문 연결 확인 · 의미 검토는 별도':'검증된 분석 결과 대기'} · ${esc(job.model)} · ${esc(date(job.created_at))}</p>
        ${job.stale?'<p class="reading-gap">원문 또는 가설 재검토 필요 · 이 결과를 현재 판단으로 사용하지 마세요.</p>':''}
        ${job.error?`<p class="reading-gap">${esc(errorLabel(job.error))}</p>`:''}
        ${job.review?`<div class="analyst-review"><b>분석자의 검토 이유</b><p>${esc(job.review.note)}</p><small>${esc(job.review.reviewed_by)} · ${esc(date(job.review.reviewed_at))}</small></div>`:''}
        ${job.content?(rejected?`<details class="analyst-rejected"><summary>반려 결과와 원문 비교 · 판단에 사용하지 않음</summary>${body}</details>`:body):''}
        <p class="detail-note">원문 발행 기업 ${new Set(refs.map(r=>r.company)).size}곳 · 모두 기업 발표 채널이며 사건·근거 독립성은 미확인입니다. 실제 산업 활동 증가·신뢰도 자동 상승·주가 방향·크기 미판정. 자동으로 가설을 등록하거나 근거를 편입하지 않습니다.</p>
        <details class="provenance"><summary>모델·응답·입력 패킷 식별 정보</summary><p class="locator">작업 ${esc(job.id)}<br>모델 SHA-256 ${esc(job.model_digest)}<br>응답 SHA-256 ${esc(job.response_hash)}<br>자료 시점 ${esc(job.packet.as_of)}</p>${job.error?`<p class="locator">실패 원인 원문 · ${esc(job.error)}</p>`:''}<button class="quiet small" data-export-analysis="${esc(job.id)}">분석과 근거 패킷 내보내기</button></details></article>`;
    }).join('')||'<p class="empty-state">이 기업과 연결된 분석 결과가 아직 없습니다.</p>'}`;
  }
  window.RadarAnalyst={render};
})();
