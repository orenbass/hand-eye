export function setupUserManagement(){
	const section=document.querySelector('[data-tab-section="users"]');
	if(!section) return;
	const searchInput=section.querySelector('#userSearchInput');
	const completionFilter=section.querySelector('#userCompletionFilter');
	const refreshBtn=section.querySelector('#userRefreshBtn');
	const listBody=section.querySelector('#userListBody');
	const loadingEl=section.querySelector('#userListLoading');
	const emptyEl=section.querySelector('#userListEmptyState');
	const errorEl=section.querySelector('#userListError');
	const firstNameInput=section.querySelector('#userFirstName');
	const lastNameInput=section.querySelector('#userLastName');
	const nationalIdInput=section.querySelector('#userNationalId');
	const notesInput=section.querySelector('#userNotes');
	const pinInput=section.querySelector('#userEntryPin');
	const pinRegenBtn=section.querySelector('#userPinRegenBtn');
	const allDoneInput=section.querySelector('#userAllDone');
	const testsMetaEl=section.querySelector('#userTestsMeta');
	const saveBtn=section.querySelector('#userSaveBtn');
	const resetBtn=section.querySelector('#userResetBtn');
	const deleteBtn=section.querySelector('#userDeleteBtn');
	const formStatus=section.querySelector('#userFormStatus');
	const formTitle=section.querySelector('#userFormTitle');
	const formMode=section.querySelector('#userFormMode');
	if(!listBody || !nationalIdInput) return;

	let usersCache=[];
	let currentEdit=null;
	let searchValue='';
	let completionValue='all';
	let debounceTimer=null;
	let pendingPin='';

	function generateEntryPin(){
		return String(Math.floor(Math.random()*10000)).padStart(4,'0');
	}
	function normalizePin(value){
		const str=String(value||'').trim();
		return /^\d{1,4}$/.test(str)? str.padStart(4,'0') : '';
	}
	function isPinInUse(pin, excludeId){
		const normalized=normalizePin(pin);
		if(!normalized) return false;
		return usersCache.some(user=>{
			if(excludeId && String(user.id)===String(excludeId)) return false;
			return normalizePin(user.entry_pin)===normalized;
		});
	}
	function pickUniquePin(seed){
		let candidate=normalizePin(seed)||generateEntryPin();
		const excludeId=currentEdit && currentEdit.id ? String(currentEdit.id):null;
		let guard=0;
		while(isPinInUse(candidate, excludeId) && guard<50){
			candidate=generateEntryPin();
			guard++;
		}
		if(isPinInUse(candidate, excludeId)){
			setFormStatus('לא נמצא קוד ייחודי – נסה שוב','error');
		}
		return candidate;
	}
	function setPin(value){
		const orig=normalizePin(value);
		const unique=pickUniquePin(value);
		pendingPin=unique;
		if(pinInput) pinInput.value=pendingPin;
		if(orig && orig!==unique){
			setFormStatus('קוד הכניסה כבר היה בשימוש – הופק קוד חדש '+unique,'muted');
		}
	}
	function regenPin(){
		setPin(generateEntryPin());
		setFormStatus('נוצר קוד חדש '+pendingPin,'muted');
	}
	function escapeHtml(value){
		if(value===null||value===undefined) return '';
		return String(value).replace(/[&<>"']/g,c=>({
			'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
		})[c]);
	}
	function formatDate(iso){
		if(!iso) return '-';
		try{
			return new Date(iso).toLocaleDateString('he-IL',{hour:'2-digit',minute:'2-digit'});
		}catch(e){
			return iso;
		}
	}
	function normalizeTestsCompleted(value){
		if(Array.isArray(value)) return value.filter(Boolean);
		if(value && typeof value==='object'){
			return Object.keys(value).filter(key=>value[key]);
		}
		if(typeof value==='string'){
			return value.split(',').map(v=>v.trim()).filter(Boolean);
		}
		return [];
	}
	function getDisplayName(user){
		const first=(user.first_name||'').trim();
		const last=(user.last_name||'').trim();
		const combined=`${first} ${last}`.trim();
		return combined || 'ללא שם';
	}
	function describeCompletion(user){
		const finished=!!user.all_tests_done;
		const completed=normalizeTestsCompleted(user.tests_completed);
		if(finished) return {text:'כל המבחנים הושלמו',style:'background:#10b981;color:#fff;'};
		if(completed.length) return {text:`${completed.length} מבחנים הושלמו`,style:'background:#fde68a;color:#78350f;'};
		return {text:'טרם בוצעו מבחנים',style:'background:#cbd5f5;color:#1f2937;'};
	}
	function describeTestsMeta(user){
		const completed=normalizeTestsCompleted(user.tests_completed);
		const scores=user && typeof user.scores==='object' ? Object.keys(user.scores||{}):[];
		if(!completed.length && !scores.length) return 'לא בוצעו ניסיונות עדיין';
		const parts=[];
		if(completed.length) parts.push(`${completed.length} מבחנים סומנו כהושלמו`);
		if(scores.length) parts.push(`קיימים ציונים ל-${scores.length} מבחנים`);
		return parts.join(' | ');
	}
	function setLoading(state){
		if(loadingEl) loadingEl.style.display=state?'block':'none';
		if(state && emptyEl) emptyEl.style.display='none';
	}
	function setEmpty(state){
		if(emptyEl) emptyEl.style.display=state?'block':'none';
	}
	function setError(text){
		if(!errorEl) return;
		errorEl.textContent=text||'';
		errorEl.style.display=text?'block':'none';
	}
	function setFormStatus(text,tone){
		if(!formStatus) return;
		const colors={success:'#10b981',error:'#ef4444',muted:'#94a3b8'};
		formStatus.textContent=text||'';
		formStatus.style.color=colors[tone]||colors.muted;
	}
	function updateFormMode(){
		if(!formTitle || !formMode) return;
		if(currentEdit){
			formTitle.textContent='עריכת מועמד';
			formMode.textContent='מצב עריכה';
			formMode.style.background='#fee2e2';
			formMode.style.color='#991b1b';
			if(deleteBtn) deleteBtn.style.display='inline-flex';
		}else{
			formTitle.textContent='הוסף מועמד חדש';
			formMode.textContent='מצב יצירה';
			formMode.style.background='var(--bg-terטיary)';
			formMode.style.color='var(--text-secondary)';
			if(deleteBtn) deleteBtn.style.display='none';
		}
	}
	function clearForm(){
		currentEdit=null;
		if(firstNameInput) firstNameInput.value='';
		if(lastNameInput) lastNameInput.value='';
		nationalIdInput.value='';
		if(notesInput) notesInput.value='';
		if(allDoneInput) allDoneInput.checked=false;
		if(testsMetaEl) testsMetaEl.textContent='לא בוצעו ניסיונות עדיין';
		setPin(generateEntryPin());
		updateFormMode();
	}
	function populateForm(user){
		currentEdit=user;
		if(firstNameInput) firstNameInput.value=user.first_name||'';
		if(lastNameInput) lastNameInput.value=user.last_name||'';
		nationalIdInput.value=user.national_id||'';
		if(notesInput) notesInput.value=user.notes||'';
		if(allDoneInput) allDoneInput.checked=!!user.all_tests_done;
		if(testsMetaEl) testsMetaEl.textContent=describeTestsMeta(user);
		setPin(user.entry_pin||'');
		updateFormMode();
	}
	function renderRows(rows){
		usersCache=Array.isArray(rows)? rows:[];
		if(!listBody) return;
		if(!usersCache.length){
			listBody.innerHTML='';
			setEmpty(true);
			return;
		}
		setEmpty(false);
		listBody.innerHTML=usersCache.map(user=>{
			const completion=describeCompletion(user);
			return `
				<tr data-user-id="${escapeHtml(user.id)}">
					<td style="padding:10px 12px;">
						<div style="font-weight:600;font-size:0.95rem;color:var(--text-primary);">${escapeHtml(getDisplayName(user))}</div>
						<div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(user.notes||'')}</div>
					</td>
					<td style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-primary);">${escapeHtml(user.national_id||'-')}</td>
					<td style="text-align:center;padding:10px 12px;font-family:'Courier New',monospace;font-weight:600;letter-spacing:0.2em;">${escapeHtml((user.entry_pin||'').padStart(4,'0'))}</td>
					<td style="text-align:center;padding:10px 12px;">
						<span class="pill-small" style="${completion.style}">${completion.text}</span>
					</td>
					<td style="text-align:center;padding:10px 12px;font-size:0.75rem;color:var(--text-secondary);">${formatDate(user.updated_at||user.created_at)}</td>
					<td style="text-align:center;padding:10px 12px;">
						<button class="btn btn-secondary" data-action="edit" data-id="${escapeHtml(user.id)}" style="padding:6px 12px;font-size:0.75rem;border-radius:8px;">ערוך</button>
					</td>
				</tr>
			`;
		}).join('');
	}
	async function loadUsers(){
		if(!window.examData || typeof window.examData.listUsers!=='function'){
			setError('מודול הנתונים אינו זמין');
			return;
		}
		if(typeof window.examData.isReady==='function' && !window.examData.isReady()){
			setError('ממתין לחיבור ל-Supabase...');
			setEmpty(true);
			return;
		}
		setError('');
		setLoading(true);
		try{
			const rows=await window.examData.listUsers({search:searchValue,completion:completionValue});
			renderRows(rows);
		}catch(err){
			console.warn('[settings] loadUsers failed',err);
			setError('שגיאה בטעינת מועמדים: '+(err && err.message? err.message:''));
			renderRows([]);
		}finally{
			setLoading(false);
		}
	}
	async function handleSave(){
		const payload={
			national_id:(nationalIdInput.value||'').trim(),
			first_name:firstNameInput? (firstNameInput.value||'').trim():'',
			last_name:lastNameInput? (lastNameInput.value||'').trim():'',
			notes:notesInput? (notesInput.value||'').trim():'',
			all_tests_done:allDoneInput? !!allDoneInput.checked:false,
			entry_pin:pendingPin
		};
		if(!payload.national_id){
			setFormStatus('חובה להזין תעודת זהות','error');
			nationalIdInput.focus();
			return;
		}
		if(isPinInUse(payload.entry_pin,currentEdit && currentEdit.id)){
			setFormStatus('קוד הכניסה כבר בשימוש – הפק קוד חדש לפני שמירה','error');
			return;
		}
		if(!window.examData){
			setFormStatus('מודול הנתונים אינו זמין','error');
			return;
		}
		setFormStatus('שומר מועמד...','muted');
		if(saveBtn) saveBtn.disabled=true;
		try{
			if(currentEdit){
				await window.examData.updateUser(currentEdit.id,payload);
				setFormStatus('✓ פרטי המועמד עודכנו','success');
			}else{
				await window.examData.createUser(payload);
				setFormStatus('✓ המועמד נוצר בהצלחה','success');
			}
			clearForm();
			await loadUsers();
		}catch(err){
			console.warn('[settings] save user failed',err);
			if(err && (err.code==='23505' || (err.message && err.message.includes('entry_pin')))){
				setFormStatus('קוד הכניסה כבר בשימוש – נסה להפיק קוד חדש ולשמור שוב','error');
			}else{
				setFormStatus('❌ '+(err && err.message? err.message:'שמירה נכשלה'),'error');
			}
		}finally{
			if(saveBtn) saveBtn.disabled=false;
		}
	}
	async function handleDelete(){
		if(!currentEdit) return;
		if(!window.examData){
			setFormStatus('מודול הנתונים אינו זמין','error');
			return;
		}
		const confirmed=confirm('האם למחוק את המועמד "'+getDisplayName(currentEdit)+'"? הפעולה בלתי הפיכה.');
		if(!confirmed) return;
		setFormStatus('מוחק מועמד...','muted');
		if(deleteBtn) deleteBtn.disabled=true;
		try{
			await window.examData.deleteUser(currentEdit.id);
			setFormStatus('✓ המועמד נמחק','success');
			clearForm();
			await loadUsers();
		}catch(err){
			console.warn('[settings] delete user failed',err);
			setFormStatus('❌ '+(err && err.message? err.message:'מחיקה נכשלה'),'error');
		}finally{
			if(deleteBtn) deleteBtn.disabled=false;
		}
	}

	if(listBody){
		listBody.addEventListener('click',ev=>{
			const btn=ev.target.closest('button[data-action]');
			if(!btn) return;
			const id=btn.getAttribute('data-id');
			if(btn.dataset.action==='edit' && id){
				const user=usersCache.find(u=>String(u.id)===String(id));
				if(user){
					populateForm(user);
					setFormStatus('בעריכת מועמד קיים','muted');
				}
			}
		});
	}
	if(searchInput){
		searchInput.value='';
		searchInput.oninput=()=>{
			searchValue=searchInput.value.trim();
			if(debounceTimer) clearTimeout(debounceTimer);
			debounceTimer=setTimeout(()=>loadUsers(),300);
		};
	}
	if(completionFilter){
		completionFilter.value='all';
		completionFilter.onchange=()=>{
			completionValue=completionFilter.value||'all';
			loadUsers();
		};
	}
	if(refreshBtn) refreshBtn.onclick=()=>loadUsers();
	if(resetBtn) resetBtn.onclick=()=>{
		clearForm();
		setFormStatus('הטופס אופס','muted');
	};
	if(saveBtn) saveBtn.onclick=handleSave;
	if(deleteBtn) deleteBtn.onclick=handleDelete;
	if(pinRegenBtn) pinRegenBtn.onclick=regenPin;

	updateFormMode();
	clearForm();
	setEmpty(true);
	window.refreshExamUsersList=loadUsers;
	loadUsers();
}

