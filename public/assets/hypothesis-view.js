(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stamp=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+' KST':'미확인';
  const stance={supporting:'지지로 검토',contradicting:'반박으로 검토',dismissed:'근거 편입 보류',unclassified:'방향 미분류'};
  const kinds={historical_discovery:'과거 발표의 추가 확보',new_announcement:'가설 등록 이후 공개',
    source_revision:'연결된 원문 비교 필요',source_refresh:'문서 버전 갱신 · 문단 대조',publication_time_unknown:'발표 시점 미확인'};
  const fields={claim:'가설',horizon:'검토 시한',disconfirm:'반증 조건',alternative:'대안 설명',confidence:'신뢰도',status:'추적 상태',theme:'관련 기술'};
  const judgments={unassessed:'미평가',low:'낮음',medium:'중간',high:'높음',candidate:'후보',watching:'추적 중',closed:'추적 종료'};
  const label=(row,documents)=>{
    const doc=documents.find(d=>d.id===row.document_version_id);
    return doc?.ko?.status==='reviewed'?doc.ko.title:row.title||'연결된 원문 문단';
  };
  const proof=(row,documents)=>`<details class="hypothesis-proof"><summary>${esc(label(row,documents))} · ${esc(stance[row.stance]||'검토 후보')}</summary>
    <blockquote class="evidence-quote">${esc(row.quote)}</blockquote>
    <p class="locator">문단 ${esc(row.span_id)} · 버전 ${esc(row.document_version_id)}<br>SHA-256 ${esc(row.raw_hash)}</p>
    ${row.url?`<a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">공식 원문 ↗</a>`:''}
    <button class="quiet small" data-doc="${esc(row.document_version_id)}">한국어 요약과 분석 보기 ↗</button></details>`;
  function renderChanges(hypothesis,documents=[]){
    const c=hypothesis.changes;
    if(!c)return '';
    const gaps=(c.coverage||[]).filter(row=>row.status!=='ok');
    const added=c.evidence_added||[],removed=c.evidence_removed||[],reclassified=c.evidence_reclassified||[];
    const pending=c.pending_candidates||[],reviews=c.reviews||[];
    return `<section class="hypothesis-update"><h4>직전 판단 이후 달라진 점</h4>
      <p class="hypothesis-period">${esc(stamp(c.since))} → ${esc(stamp(c.as_of))}</p>
      ${c.baseline_status==='not_yet_created'?'<p>비교 시작 시점에는 이 가설이 아직 등록되지 않았습니다.</p>':''}
      <div class="hypothesis-deltas"><span>근거 추가 <b>${added.length}</b></span><span>교체·제외 <b>${removed.length}</b></span><span>분류 변경 <b>${reclassified.length}</b></span></div>
      <p class="detail-note">자료 확보·검토 기록의 변화입니다. 실제 산업 활동 증가나 독립 신호 수를 뜻하지 않습니다.</p>
      ${Object.entries(c.judgment_changes||{}).length?Object.entries(c.judgment_changes).map(([key,value])=>`<p><b>${esc(fields[key]||key)}</b> ${esc(judgments[value.from]||value.from)} → ${esc(judgments[value.to]||value.to)}</p>`).join(''):'<p><b>판단 항목의 변경 없음</b> · 근거 수가 늘어도 신뢰도를 자동으로 올리지 않습니다.</p>'}
      ${added.map(row=>proof(row,documents)).join('')}
      ${reclassified.map(row=>`<p>${esc(stance[row.from])} → ${esc(stance[row.to])}</p>${proof(row,documents)}`).join('')}
      ${removed.length?`<details class="provenance"><summary>교체·제외한 이전 근거 ${removed.length}개</summary>${removed.map(row=>proof(row,documents)).join('')}</details>`:''}
      ${(c.stale_evidence||[]).length?`<p class="reading-gap">원문 버전이 바뀐 연결 근거 ${c.stale_evidence.length}개를 재검토해야 합니다.</p>`:''}
      ${gaps.length?`<p class="reading-gap">확인이 부족한 정보원: ${gaps.map(row=>esc(row.company)).join(', ')}. 후보가 없어도 변화 없음으로 판정하지 않습니다.</p>`:''}
      <details class="hypothesis-reviews"><summary>이 기간의 검토 기록 ${reviews.length}개</summary>${reviews.map(row=>`<article><span class="chip">${esc(stance[row.decision])}</span><p>${esc(row.note)}</p><small>${esc(row.reviewed_by)} · ${esc(stamp(row.reviewed_at))}</small>${proof({...row,stance:row.decision},documents)}</article>`).join('')||'<p>검토 결과가 아직 기록되지 않았습니다.</p>'}</details>
      <details class="hypothesis-candidates"><summary>현재 범위의 미검토 후보 ${pending.length}개</summary>${pending.map(row=>`<article><span class="chip">${esc(kinds[row.candidate_kind]||'원문 검토 후보')}</span><p>공개 ${esc(row.published_at?.slice(0,10)||'시점 미확인')} · 확보 ${esc(stamp(row.recorded_at))}</p>${proof(row,documents)}</article>`).join('')||'<p>현재 확인한 범위에서 미검토 후보가 없습니다.</p>'}</details>
      <button class="quiet small" data-export-hypothesis="${esc(hypothesis.id)}">이전 판단과 근거 비교 내보내기</button>
      ${window.RadarReview?.render(hypothesis,documents)||''}
    </section>`;
  }
  window.RadarHypothesis={renderChanges};
})();
