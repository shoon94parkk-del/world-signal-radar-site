(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=id=>'radar:review-draft:'+id;
  const working=new Map(); // Unsaved form input survives source-detail navigation in this page.
  function evidenceFor(h){
    const rows=[...(h.evidence||[]),...(h.changes?.pending_candidates||[])];
    return rows.filter((row,i)=>rows.findIndex(r=>r.span_id===row.span_id)===i);
  }
  function read(id){try{return JSON.parse(localStorage.getItem(key(id)))||null}catch{return null}}
  function current(d,h){
    if(!d||d.kind!=='radar_hypothesis_review_draft'||d.schema_version!==1||d.hypothesis_id!==h.id||d.base_version_id!==h.version_id)return false;
    return evidenceFor(h).some(r=>r.span_id===d.evidence?.span_id&&r.document_version_id===d.evidence.document_version_id&&r.raw_hash===d.evidence.raw_hash&&r.quote===d.evidence.quote&&!r.stale);
  }
  function makeDraft(h,row,decision,note,reviewedBy){
    if(!row||row.stale)throw Error('현재 유효한 원문 문단을 선택하세요.');
    if(!['supporting','contradicting','dismissed'].includes(decision))throw Error('검토 방향을 선택하세요.');
    if(row.stance&&row.stance!=='unclassified'&&decision==='dismissed')throw Error('이미 연결된 근거를 보류할 수 없습니다. 지지 또는 반박으로 검토하세요.');
    note=String(note).trim();reviewedBy=String(reviewedBy).trim();
    if(!note||note.length>2000||!reviewedBy||reviewedBy.length>200)throw Error('검토자와 이유를 입력하세요. 이유는 2,000자, 검토자는 200자 이내입니다.');
    if(!row.raw_hash||!row.quote||row.quote.length<40)throw Error('검토할 원문 본문이 부족합니다.');
    return {schema_version:1,kind:'radar_hypothesis_review_draft',hypothesis_id:h.id,base_version_id:h.version_id,
      evidence:{document_version_id:row.document_version_id,span_id:row.span_id,raw_hash:row.raw_hash,quote:row.quote,replaces_span_id:row.replaces_span_id||null},
      decision,note,reviewed_by:reviewedBy,drafted_at:new Date().toISOString()};
  }
  function render(h,documents=[]){
    const rows=evidenceFor(h).filter(r=>!r.stale&&r.quote?.length>=40&&r.raw_hash),stored=read(h.id),saved=working.get(h.id)||stored,valid=current(saved,h);
    if(!rows.length)return `<details class="review-draft" data-review-hypothesis="${esc(h.id)}"><summary>내 검토 초안 · 원문 재확인 필요</summary><p class="detail-note">검토 초안을 작성하려면 현재 유효한 원문 본문이 필요합니다.</p>${stored?'<button class="quiet small" type="button" data-old-review>이전 초안 내려받기</button>':''}<p class="review-status" role="status"></p></details>`;
    const chosen=valid?rows.find(r=>r.span_id===saved.evidence.span_id):rows[0];
    return `<details class="review-draft" data-review-hypothesis="${esc(h.id)}"><summary>내 검토 초안 작성${stored?' · 저장된 초안':''}</summary>
      <p class="detail-note">이 자료가 가설을 강화하나요, 약화하나요? 원문과 이유를 함께 남겨보세요. 초안은 이 브라우저에만 저장되며 서버로 전송되지 않습니다.</p>
      ${stored&&!current(stored,h)?'<p class="reading-gap">저장된 초안의 가설 또는 원문이 바뀌었습니다. 이전 초안을 내려받아 비교한 뒤 현재 근거로 다시 검토하세요.</p><button class="quiet small" type="button" data-old-review>이전 초안 내려받기</button>':''}
      <form class="review-draft-form"><label class="field">검토할 원문<select name="span_id">${rows.map(row=>{
        const doc=documents.find(d=>d.id===row.document_version_id);
        const title=doc?.ko?.status==='reviewed'?doc.ko.title:row.title||'원문 문단';
        return `<option value="${esc(row.span_id)}"${row.span_id===chosen.span_id?' selected':''}>${esc(title)} · ${esc(row.quote.slice(0,55))}</option>`;
      }).join('')}</select></label>
      <div class="review-source"></div>
      <label class="field">검토 방향<select name="decision"><option value="">선택하세요</option><option value="supporting">가설을 지지하는 근거</option><option value="contradicting">가설을 약화하는 근거</option><option value="dismissed">직접 근거 편입 보류</option></select></label>
      <label class="field">검토자<input name="reviewed_by" required maxlength="200" value="${esc(valid?saved.reviewed_by:'')}" autocomplete="off"></label>
      <label class="field">검토 이유<textarea name="note" required maxlength="2000" rows="4" placeholder="원문이 무엇을 확인해 주는지, 아직 확인되지 않은 부분은 무엇인지 적어주세요.">${esc(valid?saved.note:'')}</textarea></label>
      <p class="review-status" role="status"></p><div class="review-actions"><button class="primary" type="submit">이 브라우저에 초안 저장</button><button class="quiet" type="button" data-download-review>검토 초안 내려받기</button><button class="quiet small" type="button" data-clear-review>저장된 초안 지우기</button></div></form>
      <p class="detail-note">공개 가설은 바뀌지 않습니다. 내려받은 파일을 로컬 레이더에서 검증·반영하면 영구 검토 기록이 됩니다. 다른 기기와는 동기화되지 않으며 브라우저 데이터를 지우면 사라집니다.</p>
      <details class="review-help"><summary>로컬 레이더에 반영하는 방법</summary><p>프로젝트 폴더에서 <code>radar hypothesis-review-file &lt;내려받은 파일&gt;</code>을 실행합니다. 개인 검토는 기본 비공개이며 공개 배포에 자동 포함되지 않습니다. 원문과 가설이 달라졌다면 반영을 거부합니다.</p></details>
    </details>`;
  }
  function bind(root,hypotheses,download){
    function setup(panel){
      const h=hypotheses.find(h=>h.id===panel.dataset.reviewHypothesis),form=panel.querySelector('form');
      if(!h||!form)return;
      const row=evidenceFor(h).find(r=>r.span_id===form.elements.span_id.value),saved=working.get(h.id)||read(h.id),valid=current(saved,h);
      const decision=form.elements.decision;
      for(const opt of decision.options)opt.disabled=Boolean(opt.value==='dismissed'&&row?.stance&&row.stance!=='unclassified');
      if(!panel.dataset.ready&&valid)decision.value=saved.decision;
      if(decision.selectedOptions[0]?.disabled)decision.value='';
      panel.dataset.ready='true';
      panel.querySelector('.review-source').innerHTML=`<button class="quiet small" type="button" data-doc="${esc(row?.document_version_id)}">선택 근거의 한국어 요약 보기 ↗</button><details><summary>선택한 영어 원문과 근거 식별 정보</summary><blockquote class="evidence-quote">${esc(row?.quote)}</blockquote><p class="locator">SHA-256 ${esc(row?.raw_hash)}<br>문단 ${esc(row?.span_id)}</p></details>`;
    }
    root.addEventListener('toggle',e=>{if(e.target.matches('.review-draft')&&e.target.open)setup(e.target)},true);
    root.addEventListener('change',e=>{if(e.target.name==='span_id'&&e.target.closest('.review-draft'))setup(e.target.closest('.review-draft'))});
    function capture(e){
      const panel=e.target.closest('.review-draft'),form=panel?.querySelector('form');if(!form)return;
      const h=hypotheses.find(h=>h.id===panel.dataset.reviewHypothesis),row=evidenceFor(h).find(r=>r.span_id===form.elements.span_id.value);if(!row)return;
      working.set(h.id,{kind:'radar_hypothesis_review_draft',schema_version:1,hypothesis_id:h.id,base_version_id:h.version_id,
        evidence:{document_version_id:row.document_version_id,span_id:row.span_id,quote:row.quote,raw_hash:row.raw_hash},
        note:form.elements.note.value,reviewed_by:form.elements.reviewed_by.value,decision:form.elements.decision.value});
    }
    root.addEventListener('input',capture);
    root.addEventListener('change',capture);
    function collect(panel){
      const h=hypotheses.find(h=>h.id===panel.dataset.reviewHypothesis),form=panel.querySelector('form');
      return makeDraft(h,evidenceFor(h).find(r=>r.span_id===form.elements.span_id.value),form.elements.decision.value,form.elements.note.value,form.elements.reviewed_by.value);
    }
    function save(panel,d){localStorage.setItem(key(d.hypothesis_id),JSON.stringify(d));panel.querySelector('summary').textContent='내 검토 초안 작성 · 저장된 초안';panel.querySelector('.review-status').textContent='이 브라우저에 저장했습니다. 공개 가설과 영구 기록은 변경되지 않았습니다.'}
    root.addEventListener('submit',e=>{
      if(!e.target.matches('.review-draft-form'))return;e.preventDefault();const panel=e.target.closest('.review-draft');
      try{save(panel,collect(panel))}catch(error){panel.querySelector('.review-status').textContent=['QuotaExceededError','SecurityError'].includes(error.name)?'브라우저에 저장할 수 없습니다. 파일로 내려받아 보관하세요.':error.message}
    });
    root.addEventListener('click',e=>{
      const button=e.target.closest('button'),panel=button?.closest('.review-draft');if(!panel)return;
      const status=panel.querySelector('.review-status');
      try{
        if(button.hasAttribute('data-download-review')){const d=collect(panel);download('radar-review-draft-'+d.hypothesis_id+'.json',d);status.textContent='검토 초안 파일을 내려받았습니다. 로컬 검증·반영 전까지 공개 가설은 바뀌지 않습니다.'}
        if(button.hasAttribute('data-old-review')){const d=read(panel.dataset.reviewHypothesis);if(d)download('radar-review-draft-old-'+d.hypothesis_id+'.json',d)}
        if(button.hasAttribute('data-clear-review')){localStorage.removeItem(key(panel.dataset.reviewHypothesis));working.delete(panel.dataset.reviewHypothesis);const form=panel.querySelector('form');form.reset();form.elements.note.value='';form.elements.reviewed_by.value='';form.elements.decision.value='';setup(panel);panel.querySelector('summary').textContent='내 검토 초안 작성';status.textContent='브라우저에 저장된 초안을 지웠습니다. 내려받은 파일은 남아 있습니다.'}
      }catch(error){status.textContent=error.message}
    });
  }
  window.RadarReview={render,bind,makeDraft,current,evidenceFor};
})();
