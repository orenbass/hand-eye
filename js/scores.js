// Admin scores viewer screen
(function(){
    const openBtn = document.getElementById('scores-button');
    const screen = document.getElementById('scores-screen');
    const backBtn = document.getElementById('scores-back-button');
    const refreshBtn = document.getElementById('scores-refresh-button');
    const tableBody = document.getElementById('scores-table-body');
    const statusEl = document.getElementById('scores-status');
    const detailModal = document.getElementById('score-detail-modal');
    const detailCloseBtn = document.getElementById('score-detail-close');
    const detailContent = document.getElementById('score-detail-content');

    if(!openBtn || !screen || !tableBody) return;

    let previousScreen = null;
    const candidateAttemptsCache = new Map();

    const ensureAdmin = ()=> window.testAuth && typeof window.testAuth.isAdmin === 'function' && window.testAuth.isAdmin();

    openBtn.addEventListener('click', ()=>{
        if(!ensureAdmin()){
            alert('הצגת הנתונים זמינה למנהלים בלבד');
            return;
        }
        showScoresScreen();
        loadScores();
    });

    if(backBtn) backBtn.addEventListener('click', hideScoresScreen);
    if(refreshBtn) refreshBtn.addEventListener('click', loadScores);
    if(detailCloseBtn && detailModal){
        detailCloseBtn.addEventListener('click', ()=> hideModal(detailModal));
        detailModal.addEventListener('click', evt=>{ if(evt.target === detailModal) hideModal(detailModal); });
    }

    function showModal(el){ if(el) el.style.display = 'flex'; }
    function hideModal(el){ if(el) el.style.display = 'none'; }

    function findVisibleScreen(){
        const screens = document.querySelectorAll('.screen');
        for(const sc of screens){
            if(sc === screen) continue;
            const style = window.getComputedStyle(sc);
            if(style.display !== 'none') return sc;
        }
        return null;
    }

    function showScoresScreen(){
        if(!screen) return;
        if(!previousScreen){
            const visible = findVisibleScreen();
            if(visible && visible !== screen){
                previousScreen = visible;
                visible.dataset.prevDisplay = visible.style.display || '';
                visible.style.display = 'none';
            }
        }
        screen.style.display = 'block';
        screen.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function hideScoresScreen(){
        if(!screen) return;
        screen.style.display = 'none';
        if(previousScreen){
            previousScreen.style.display = previousScreen.dataset.prevDisplay || '';
            delete previousScreen.dataset.prevDisplay;
            previousScreen = null;
        }
    }

    function formatDate(iso){
        if(!iso) return '-';
        try {
            return new Date(iso).toLocaleString('he-IL');
        } catch(err){
            return iso;
        }
    }

    async function loadScores(){
        if(!statusEl) return;
        if(!window.examData || typeof window.examData.listUsers !== 'function'){
            statusEl.textContent = 'מודול הנתונים אינו זמין';
            tableBody.innerHTML = '';
            return;
        }
        const ready = typeof window.examData.isReady === 'function' ? window.examData.isReady() : true;
        if(!ready){
            statusEl.textContent = 'חיבור Supabase אינו זמין כרגע';
            tableBody.innerHTML = '';
            return;
        }
        candidateAttemptsCache.clear();
        statusEl.textContent = 'טוען נתונים...';
        tableBody.innerHTML = '';
        try {
            const rows = await window.examData.listUsers({ limit:500 });
            const grouped = groupByCandidate(rows || []);
            renderGroups(grouped);
            statusEl.textContent = grouped.length ? `הוצגו ${grouped.length} נבחנים` : 'אין נבחנים להצגה';
        } catch(err){
            console.warn('[scores] load failed', err);
            statusEl.textContent = 'שגיאה בטעינת הנתונים';
        }
    }

    function groupByCandidate(rows){
        const map = new Map();
        rows.forEach(user=>{
            const key = (user && user.national_id) ? user.national_id.trim() : `id:${user.id}`;
            if(!map.has(key)){
                map.set(key, {
                    nationalId: user.national_id || 'ללא תעודת זהות',
                    firstName: user.first_name || '',
                    lastName: user.last_name || '',
                    sessions: []
                });
            }
            map.get(key).sessions.push(user);
        });
        return Array.from(map.values()).map(group=>{
            group.sessions.sort((a,b)=>{
                const aDate = new Date(a.created_at || a.updated_at || 0).getTime();
                const bDate = new Date(b.created_at || b.updated_at || 0).getTime();
                return bDate - aDate;
            });
            return group;
        }).sort((a,b)=>{
            const aName = `${a.lastName} ${a.firstName}`.trim();
            const bName = `${b.lastName} ${b.firstName}`.trim();
            return aName.localeCompare(bName, 'he', { sensitivity:'base' });
        });
    }

    function renderGroups(groups){
        tableBody.innerHTML = '';
        if(!groups.length){
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" style="padding:16px;text-align:center;color:#cbd5f5">אין נתונים להצגה</td>';
            tableBody.appendChild(row);
            return;
        }
        groups.forEach(group=>{
            const summary = summarizeGroup(group);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding:10px 12px;font-weight:600">${escapeHtml(group.firstName)} ${escapeHtml(group.lastName)} ${group.sessions.length>1 ? '<span style="background:#f97316;color:#0f172a;padding:2px 8px;border-radius:999px;font-size:0.75rem;margin-right:6px">'+group.sessions.length+' ניסיונות</span>' : ''}</td>
                <td style="text-align:center;padding:10px 12px;font-family:'Courier New',monospace">${escapeHtml(group.nationalId)}</td>
                <td style="text-align:center;padding:10px 12px">${group.sessions.length}</td>
                <td style="text-align:center;padding:10px 12px">${summary.totalTests}</td>
                <td style="text-align:center;padding:10px 12px">${summary.latestDate ? formatDate(summary.latestDate) : '-'}</td>
                <td style="text-align:center;padding:10px 12px">${summary.avgScore !== null ? summary.avgScore.toFixed(1) : '-'}</td>
                <td style="text-align:center;padding:6px 12px"><button class="btn btn-secondary" type="button" data-action="expand">צפייה במבחנים</button></td>
            `;
            tableBody.appendChild(row);

            const detailRow = document.createElement('tr');
            detailRow.className = 'scores-detail-row';
            detailRow.style.display = 'none';
            const detailCell = document.createElement('td');
            detailCell.colSpan = 7;
            detailCell.style.background = 'rgba(30,41,59,0.8)';
            detailCell.style.padding = '16px';
            detailCell.innerHTML = '';
            detailRow.appendChild(detailCell);
            tableBody.appendChild(detailRow);

            const expandBtn = row.querySelector('[data-action="expand"]');
            expandBtn.addEventListener('click', ()=>{
                const open = detailRow.style.display === '' || detailRow.style.display === 'table-row';
                if(open){
                    detailRow.style.display = 'none';
                    expandBtn.textContent = 'צפייה במבחנים';
                } else {
                    detailRow.style.display = 'table-row';
                    expandBtn.textContent = 'הסתר פירוט';
                    if(!detailCell.dataset.loaded){
                        detailCell.dataset.loaded = 'loading';
                        renderSessionDetails(group, detailCell)
                            .then(()=>{ detailCell.dataset.loaded = 'true'; })
                            .catch(()=>{ delete detailCell.dataset.loaded; });
                    }
                }
            });
        });
    }

    function summarizeGroup(group){
        let totalTests = 0;
        const sessionScores = [];
        let latestDate = null;
        group.sessions.forEach(session=>{
            const completed = Array.isArray(session.tests_completed) ? session.tests_completed.length : 0;
            totalTests += completed;
            const score = calcSessionScore(session);
            if(score !== null) sessionScores.push(score);
            const sessionDate = session.updated_at || session.created_at || null;
            if(sessionDate && (!latestDate || new Date(sessionDate) > new Date(latestDate))){
                latestDate = sessionDate;
            }
        });
        const avgScore = sessionScores.length ? (sessionScores.reduce((a,b)=>a+b,0) / sessionScores.length) : null;
        return { totalTests, avgScore, latestDate };
    }

    function calcSessionScore(session){
        if(!session || !session.scores || typeof session.scores !== 'object') return null;
        const values = Object.values(session.scores).map(Number).filter(v=>Number.isFinite(v));
        if(!values.length) return null;
        return values.reduce((a,b)=>a+b,0) / values.length;
    }

    async function renderSessionDetails(group, container){
        if(!group) return;
        container.innerHTML = '<div style="color:#cbd5f5">טוען ציונים מהשרת...</div>';
        try {
            const attempts = await getCandidateAttempts(group);
            container.innerHTML = '';

            const attemptTables = buildAttemptTables(group, attempts);
            if(attemptTables.length){
                attemptTables.forEach(el => container.appendChild(el));
            }

            if(!attemptTables.length){
                const empty = document.createElement('div');
                empty.style.color = '#cbd5f5';
                empty.style.fontSize = '0.9rem';
                empty.textContent = 'לא נמצאו ציונים להצגה עבור נבחן זה';
                container.appendChild(empty);
            }
        } catch(err){
            console.warn('[scores] failed to render details', err);
            container.innerHTML = '<div style="color:#fca5a5">שגיאה בטעינת הציונים עבור נבחן זה</div>';
        }
    }

    function buildAttemptTables(group, attempts){
        const groupedAttempts = groupAttemptsBySession(attempts);
        if(groupedAttempts.length){
            return groupedAttempts
                .map(info => createAttemptTable(info, group))
                .filter(Boolean);
        }
        // שימוש בנתוני הסשנים הישנים כגיבוי אם אין ניסיונות שמורים בטבלה החדשה
        return buildTablesFromGroupSessions(group);
    }

    function groupAttemptsBySession(attempts){
        if(!attempts || !attempts.length) return [];
        const buckets = new Map();
        attempts.forEach(att=>{
            const key = att.session && att.session.id ? att.session.id : `${att.candidate_id || 'candidate'}-${att.stage || 'exam'}`;
            if(!buckets.has(key)){
                buckets.set(key, {
                    sessionId: key,
                    sessionIndex: att.sessionIndex || null,
                    entryPin: att.session && att.session.entry_pin ? att.session.entry_pin : '',
                    referenceDate: att.completed_at || (att.session && (att.session.updated_at || att.session.created_at)) || null,
                    tests: new Map()
                });
            }
            const bucket = buckets.get(key);
            const testKey = att.test_id || 'ללא שם מבחן';
            const existing = bucket.tests.get(testKey);
            const attTime = new Date(att.completed_at || 0).getTime();
            const existingTime = existing ? new Date(existing.completed_at || 0).getTime() : -Infinity;
            if(!existing || attTime >= existingTime){
                bucket.tests.set(testKey, att);
            }
            if(!bucket.referenceDate && att.completed_at){
                bucket.referenceDate = att.completed_at;
            }
        });
        const ordered = Array.from(buckets.values()).map(bucket=>{
            bucket.testsList = Array.from(bucket.tests.values()).sort((a,b)=>{
                const aName = a.test_id || '';
                const bName = b.test_id || '';
                return aName.localeCompare(bName, 'he', { sensitivity:'base' });
            });
            return bucket;
        }).sort((a,b)=>{
            const aDate = new Date(a.referenceDate || 0).getTime();
            const bDate = new Date(b.referenceDate || 0).getTime();
            if(aDate === bDate){
                return (a.sessionIndex || 0) - (b.sessionIndex || 0);
            }
            return aDate - bDate;
        });
        return ordered.map((bucket, idx)=>{
            if(!bucket.sessionIndex){
                bucket.sessionIndex = idx + 1;
            }
            return bucket;
        });
    }

    function buildTablesFromGroupSessions(group){
        const sessions = Array.isArray(group && group.sessions) ? group.sessions : [];
        if(!sessions.length) return [];
        return sessions.map((session, idx)=>{
            if(!session || !session.scores || typeof session.scores !== 'object') return null;
            const testsList = Object.entries(session.scores).map(([testId, score])=>({
                test_id: testId,
                scaled_score: score,
                completed_at: session.updated_at || session.created_at || null
            })).sort((a,b)=>{
                const aName = a.test_id || '';
                const bName = b.test_id || '';
                return aName.localeCompare(bName, 'he', { sensitivity:'base' });
            });
            if(!testsList.length) return null;
            return createAttemptTable({
                sessionIndex: idx + 1,
                entryPin: session.entry_pin || '',
                referenceDate: session.updated_at || session.created_at || null,
                testsList
            }, group);
        }).filter(Boolean);
    }

    function createAttemptTable(info, group){
        const tests = Array.isArray(info.testsList) ? info.testsList : [];
        if(!tests.length) return null;
        const card = document.createElement('div');
        card.style.border = '1px solid rgba(255,255,255,0.12)';
        card.style.borderRadius = '10px';
        card.style.background = 'rgba(15,23,42,0.95)';
        card.style.padding = '14px 16px';
        card.style.marginBottom = '12px';

        const attemptLabel = info.sessionIndex ? `ניסיון ${info.sessionIndex}` : 'ניסיון';
        const dateLabel = info.referenceDate ? formatDate(info.referenceDate) : 'תאריך לא זמין';
        const entryPin = info.entryPin ? ` · קוד כניסה: ${escapeHtml(info.entryPin)}` : '';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';
        header.style.marginBottom = '10px';

        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.style.color = '#e2e8f0';
        title.innerHTML = `${attemptLabel} · ${dateLabel}${entryPin}`;
        header.appendChild(title);

        const actions = document.createElement('div');
        const detailsBtn = document.createElement('button');
        detailsBtn.type = 'button';
        detailsBtn.className = 'btn btn-tertiary';
        detailsBtn.textContent = 'פרטים נוספים';
        detailsBtn.addEventListener('click', ()=> openAttemptRawModal(info, group));
        actions.appendChild(detailsBtn);
        header.appendChild(actions);

        const headerCells = tests.map(test=>`
            <th style="text-align:center;padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.3)">
                ${escapeHtml(translateTestName(test.test_id))}
            </th>
        `).join('');

        const scoreCells = tests.map(test=>`
            <td style="text-align:center;padding:8px 10px;border-bottom:1px solid rgba(148,163,184,0.15)">
                ${formatScore(test.scaled_score !== undefined ? test.scaled_score : test.raw_score)}
            </td>
        `).join('');

        const tableHtml = `
            <div style="overflow-x:auto">
                <table style="width:100%;min-width:420px;border-collapse:collapse;color:#e2e8f0;font-size:0.9rem">
                    <thead style="background:rgba(30,41,59,0.9)">
                        <tr>${headerCells}</tr>
                    </thead>
                    <tbody>
                        <tr>${scoreCells}</tr>
                    </tbody>
                </table>
            </div>
        `;

        card.appendChild(header);
        card.insertAdjacentHTML('beforeend', tableHtml);
        return card;
    }

    function openAttemptRawModal(info, group){
        showModal(detailModal);
        detailContent.innerHTML = buildAttemptRawView(info, group);
    }

    function buildAttemptRawView(info, group){
        const attemptLabel = info && info.sessionIndex ? `ניסיון ${info.sessionIndex}` : 'ניסיון';
        const dateLabel = info && info.referenceDate ? formatDate(info.referenceDate) : 'תאריך לא זמין';
        const entryPin = info && info.entryPin ? ` · קוד כניסה: ${escapeHtml(info.entryPin)}` : '';
        const candidateLine = group ? `<div><strong>${escapeHtml(group.firstName || '')} ${escapeHtml(group.lastName || '')}</strong> · ת.ז ${escapeHtml(group.nationalId || '')}</div>` : '';
        const header = `
            <div style="margin-bottom:12px">
                ${candidateLine}
                <div style="font-size:0.9rem;color:#cbd5f5">${attemptLabel} · ${dateLabel}${entryPin}</div>
            </div>
        `;
        const tests = info && Array.isArray(info.testsList) ? info.testsList : [];
        if(!tests.length){
            return header + '<p style="color:#cbd5f5">אין נתונים להצגה עבור ניסיון זה.</p>';
        }
        const body = tests.map((test, idx)=> renderAttemptDetailCard(test, idx)).join('');
        return header + body;
    }

    function renderAttemptDetailCard(test, index){
        const scoreBlock = `
            <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.85rem;color:#e2e8f0;margin-bottom:8px">
                <span><strong>מבחן:</strong> ${escapeHtml(translateTestName(test.test_id))}</span>
                <span><strong>ציון:</strong> ${formatScore(test.scaled_score, 2)}</span>
                ${test.raw_score !== undefined ? `<span><strong>ציון גולמי:</strong> ${formatScore(test.raw_score, 2)}</span>` : ''}
                ${test.attempt_index ? `<span><strong>מספר ניסיון:</strong> ${escapeHtml(test.attempt_index)}</span>` : ''}
                ${test.stage ? `<span><strong>שלב:</strong> ${escapeHtml(test.stage)}</span>` : ''}
                ${test.completed_at ? `<span><strong>הושלם:</strong> ${formatDate(test.completed_at)}</span>` : ''}
            </div>
        `;
        const rawBlock = test.raw_payload && typeof test.raw_payload === 'object'
            ? `<div style="margin-top:10px"><div style="font-weight:600;color:#f472b6;margin-bottom:4px">נתונים גולמיים</div>${renderStructuredData(test.raw_payload, 0)}</div>`
            : '<div style="margin-top:10px;color:#94a3b8;font-size:0.85rem">אין נתונים גולמיים זמינים עבור מבחן זה.</div>';

        return `
            <div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:12px">
                ${scoreBlock}
                ${rawBlock}
            </div>
        `;
    }

    async function getCandidateAttempts(group){
        const sessions = Array.isArray(group.sessions) ? group.sessions : [];
        if(!sessions.length) return [];
        const cacheKey = (group.nationalId && group.nationalId.trim()) || `group-${sessions[0].id || 'unknown'}`;
        if(candidateAttemptsCache.has(cacheKey)){
            return candidateAttemptsCache.get(cacheKey);
        }
        if(!window.examData || typeof window.examData.fetchUserAttempts !== 'function'){
            throw new Error('מודול הנתונים אינו זמין');
        }
        const fetchers = sessions
            .filter(session=> session && session.id)
            .map((session, sessionIdx)=> window.examData.fetchUserAttempts(session.id)
                .then(list=> (Array.isArray(list) ? list : []).map(att=>Object.assign({}, att, {
                    session,
                    sessionIndex: sessionIdx + 1,
                    nationalId: group.nationalId,
                    firstName: group.firstName,
                    lastName: group.lastName
                })))
                .catch(err=>{
                    console.warn('[scores] attempts fetch failed', err);
                    return [];
                }));
        if(!fetchers.length){
            candidateAttemptsCache.set(cacheKey, []);
            return [];
        }
        const nested = await Promise.all(fetchers);
        const flattened = nested.flat().sort((a,b)=>{
            const aDate = new Date(a.completed_at || a.created_at || 0).getTime();
            const bDate = new Date(b.completed_at || b.created_at || 0).getTime();
            return aDate - bDate;
        });
        candidateAttemptsCache.set(cacheKey, flattened);
        return flattened;
    }

    function buildTestsTableFromAttempts(attempts, group){
        const breakdown = aggregateTestsById(attempts);
        if(!breakdown.length){
            return null;
        }
        const wrap = document.createElement('div');
        wrap.style.border = '1px solid rgba(255,255,255,0.12)';
        wrap.style.borderRadius = '10px';
        wrap.style.background = 'rgba(15,23,42,0.95)';
        wrap.innerHTML = `
            <div style="padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.15);font-weight:600">ציונים לפי מבחן</div>
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;min-width:620px;font-size:0.9rem;color:#e2e8f0">
                    <thead style="background:rgba(30,41,59,0.9);color:#e2e8f0">
                        <tr>
                            <th style="text-align:right;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.3)">מבחן</th>
                            <th style="text-align:center;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.3)">מספר ניסיונות</th>
                            <th style="text-align:right;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.3)">ציונים</th>
                            <th style="text-align:center;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.3)">תאריך אחרון</th>
                            <th style="text-align:center;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,0.3)"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${breakdown.map((item, idx)=>`
                            <tr>
                                <td style="padding:8px 12px;border-bottom:1px solid rgba(148,163,184,0.15)">${escapeHtml(item.displayName)}</td>
                                <td style="text-align:center;padding:8px 12px;border-bottom:1px solid rgba(148,163,184,0.15)">${item.totalAttempts}</td>
                                <td style="padding:8px 12px;border-bottom:1px solid rgba(148,163,184,0.15)">${renderScoreBadges(item.attempts)}</td>
                                <td style="text-align:center;padding:8px 12px;border-bottom:1px solid rgba(148,163,184,0.15)">${item.lastDate ? formatDate(item.lastDate) : '-'}</td>
                                <td style="text-align:center;padding:6px 12px;border-bottom:1px solid rgba(148,163,184,0.15)"><button class="btn btn-secondary" type="button" data-test-index="${idx}">פרטים נוספים</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        breakdown.forEach((item, idx)=>{
            const btn = wrap.querySelector(`[data-test-index="${idx}"]`);
            if(btn){
                btn.addEventListener('click', ()=> openTestDetailModal(item.attempts, group, item.testId));
            }
        });

        return wrap;
    }

    function aggregateTestsById(attempts){
        const map = new Map();
        (attempts || []).forEach(att=>{
            const testId = att && att.test_id ? att.test_id : 'ללא שם מבחן';
            if(!map.has(testId)){
                map.set(testId, { testId, attempts: [] });
            }
            map.get(testId).attempts.push(att);
        });
        return Array.from(map.values()).map(entry=>{
            entry.attempts.sort((a,b)=>{
                const aDate = new Date(a.completed_at || 0).getTime();
                const bDate = new Date(b.completed_at || 0).getTime();
                return aDate - bDate;
            });
            const last = entry.attempts[entry.attempts.length - 1] || null;
            entry.totalAttempts = entry.attempts.length;
            entry.lastDate = last ? last.completed_at : null;
            entry.lastScore = last ? last.scaled_score : null;
            entry.displayName = translateTestName(entry.testId);
            return entry;
        }).sort((a,b)=> entryLocaleCompare(a.displayName, b.displayName));
    }

    function renderScoreBadges(attempts){
        if(!attempts || !attempts.length){
            return '<span style="font-size:0.85rem;color:#cbd5f5">אין ציונים</span>';
        }
        return attempts.map((att, idx)=>{
            const score = formatScore(att.scaled_score);
            const label = att.attempt_index ? `ניסיון ${att.attempt_index}` : `ניסיון ${idx+1}`;
            return `<span style="display:inline-flex;align-items:center;background:rgba(59,130,246,0.15);color:#bfdbfe;border:1px solid rgba(59,130,246,0.4);border-radius:999px;padding:2px 10px;font-size:0.8rem;margin-inline-end:6px;margin-bottom:4px">${label}: ${score}</span>`;
        }).join('');
    }

    async function openTestDetailModal(attempts, group, focusTestId){
        showModal(detailModal);
        detailContent.innerHTML = '<p>טוען פרטי מבחן...</p>';
        try {
            let data = Array.isArray(attempts) ? attempts.slice() : [];
            if(!data.length && group){
                const fallback = {
                    sessions: group.sessions || [],
                    nationalId: group.nationalId,
                    firstName: group.firstName,
                    lastName: group.lastName
                };
                data = await getCandidateAttempts(fallback);
            }
            if(focusTestId){
                data = data.filter(att=> att.test_id === focusTestId);
            }
            const info = group || { firstName:'', lastName:'', nationalId:'' };
            detailContent.innerHTML = buildAttemptsView(info, data, focusTestId);
        } catch(err){
            console.warn('[scores] detail modal failed', err);
            detailContent.innerHTML = '<p>שגיאה בטעינת פרטי המבחן.</p>';
        }
    }

    function buildAttemptsView(group, attempts, focusTestId){
        const selectedTestLabel = focusTestId ? translateTestName(focusTestId) : '';
        const header = `
            <div style="margin-bottom:12px">
                <div><strong>${escapeHtml(group.firstName || '')} ${escapeHtml(group.lastName || '')}</strong></div>
                <div style="font-size:0.85rem;color:#cbd5f5">תעודת זהות: ${escapeHtml(group.nationalId || '')}</div>
                ${focusTestId ? `<div style="font-size:0.85rem;color:#cbd5f5">מבחן נבחר: ${escapeHtml(selectedTestLabel)}</div>` : ''}
            </div>
        `;
        if(!attempts || !attempts.length){
            return header + `<p style="font-size:0.85rem;color:#cbd5f5">לא נמצאו ניסיונות${focusTestId ? ' למבחן זה' : ''} במערכת.</p>`;
        }
        const rows = attempts.map((att, idx)=>{
            const rawBlock = att.raw_payload && typeof att.raw_payload === 'object'
                ? `<details style="margin-top:6px"><summary style="cursor:pointer;color:#93c5fd">נתונים גולמיים</summary><div style="background:rgba(15,23,42,0.8);padding:8px;border-radius:8px;color:#e2e8f0;overflow:auto">${renderStructuredData(att.raw_payload, 0)}</div></details>`
                : '';
            const sessionInfo = att.session ? `<span>קוד כניסה: ${escapeHtml(att.session.entry_pin || '-')}</span>` : '';
            const attemptLabel = att.attempt_index ? att.attempt_index : (idx + 1);
            return `
                <div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;margin-bottom:10px">
                    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:#e2e8f0">
                        <span><strong>מבחן:</strong> ${escapeHtml(translateTestName(att.test_id))}</span>
                        <span><strong>ציון:</strong> ${formatScore(att.scaled_score)}</span>
                        <span><strong>ציון גולמי:</strong> ${formatScore(att.raw_score)}</span>
                        <span><strong>ניסיון #</strong> ${attemptLabel}</span>
                        <span><strong>הושלם:</strong> ${formatDate(att.completed_at)}</span>
                        ${sessionInfo}
                    </div>
                    ${rawBlock}
                </div>
            `;
        }).join('');
        return header + rows;
    }

    function renderStructuredData(value, depth, parentKey){
        const level = Number(depth) || 0;
        if(level > 5){
            try {
                return `<span>${escapeHtml(JSON.stringify(value))}</span>`;
            } catch(err){
                return '<span>נתונים</span>';
            }
        }
        if(value === null || value === undefined){
            return '<span style="color:#cbd5f5">-</span>';
        }
        if(typeof value === 'string'){
            return `<span>${escapeHtml(value)}</span>`;
        }
        if(typeof value === 'number'){
            if(isScoreField(parentKey)){
                return `<span>${formatScore(value, 2)}</span>`;
            }
            return `<span>${value}</span>`;
        }
        if(typeof value === 'boolean'){
            return `<span>${value ? 'כן' : 'לא'}</span>`;
        }
        if(Array.isArray(value)){
            if(!value.length) return '<span>רשימה ריקה</span>';
            return `<div style="display:flex;flex-direction:column;gap:6px">${value.map((item, idx)=>`
                <div style="border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:6px 8px">
                    <div style="font-weight:600;margin-bottom:4px">פריט ${idx+1}</div>
                    <div>${renderStructuredData(item, level+1, parentKey)}</div>
                </div>
            `).join('')}</div>`;
        }
        if(typeof value === 'object'){
            const entries = Object.entries(value);
            if(!entries.length) return '<span>אובייקט ריק</span>';
            return `<div style="display:flex;flex-direction:column;gap:6px">${entries.map(([key,val])=>`
                <div style="display:flex;gap:8px;align-items:flex-start">
                    <div style="min-width:120px;font-weight:600;color:#cbd5f5">${escapeHtml(translateFieldKey(key))}</div>
                    <div style="flex:1">${renderStructuredData(val, level+1, key)}</div>
                </div>
            `).join('')}</div>`;
        }
        return `<span>${escapeHtml(String(value))}</span>`;
    }

    function formatScore(value, digits){
        const num = Number(value);
        const places = Number.isInteger(digits) ? digits : 1;
        return Number.isFinite(num) ? num.toFixed(places) : '-';
    }

    function translateTestName(testId){
        if(testId === null || testId === undefined) return 'ללא שם מבחן';
        const raw = String(testId).trim();
        if(!raw) return 'ללא שם מבחן';
        const normalized = normalizeKey(raw);
        const directMap = {
            eyehand: 'קואורדינציה עין-יד',
            eye_hand: 'קואורדינציה עין-יד',
            flightcontrol: 'בקרת טיסה',
            flight_control: 'בקרת טיסה',
            flightexam: 'מבחן טיסה',
            flight_exam: 'מבחן טיסה',
            memory: 'זיכרון',
            northfind: 'איתור צפון',
            north_find: 'איתור צפון',
            orientation: 'התמצאות',
            reaction: 'זמן תגובה',
            reactiontime: 'זמן תגובה',
            reaction_time: 'זמן תגובה',
            targetid: 'זיהוי מטרות',
            target_id: 'זיהוי מטרות',
            tracking: 'מעקב',
            trackingtest: 'מעקב',
            tracking_test: 'מעקב'
        };
        if(directMap[normalized]) return directMap[normalized];

        const containsMap = [
            { token: 'eyehand', label: 'קואורדינציה עין-יד' },
            { token: 'flight', label: 'מבחן טיסה' },
            { token: 'control', label: 'בקרת טיסה' },
            { token: 'memory', label: 'זיכרון' },
            { token: 'north', label: 'איתור צפון' },
            { token: 'orient', label: 'התמצאות' },
            { token: 'react', label: 'זמן תגובה' },
            { token: 'target', label: 'זיהוי מטרות' },
            { token: 'track', label: 'מעקב' }
        ];
        for(const rule of containsMap){
            if(normalized.includes(rule.token)){
                return rule.label;
            }
        }

        const tokenMap = {
            eye: 'עין',
            hand: 'יד',
            flight: 'טיסה',
            control: 'בקרה',
            exam: 'מבחן',
            test: 'מבחן',
            memory: 'זיכרון',
            north: 'צפון',
            find: 'איתור',
            orientation: 'התמצאות',
            orient: 'התמצאות',
            react: 'תגובה',
            reaction: 'תגובה',
            time: 'זמן',
            target: 'מטרה',
            targets: 'מטרות',
            id: 'מזהה',
            tracking: 'מעקב',
            track: 'מעקב',
            practice: 'תרגול',
            stage: 'שלב',
            final: 'סופי'
        };
        const tokens = splitKeyTokens(raw);
        const translatedTokens = tokens.map(tok=> tokenMap[tok] || null).filter(Boolean);
        if(translatedTokens.length){
            return translatedTokens.join(' ');
        }
        return raw;
    }

    function entryLocaleCompare(a, b){
        const left = a || '';
        const right = b || '';
        return left.localeCompare(right, 'he', { sensitivity:'base' });
    }

    function isScoreField(key){
        if(!key) return false;
        const normalized = normalizeKey(key);
        return ['score','scaled_score','raw_score','percent','normalized','accuracy','avg','average','median']
            .some(match=> normalized.includes(match));
    }

    function translateFieldKey(key){
        if(!key) return '';
        const baseMap = {
            score: 'ציון',
            scaled_score: 'ציון מנורמל',
            raw_score: 'ציון גולמי',
            normalized_score: 'ציון מנורמל',
            final_score: 'ציון סופי',
            best_score: 'ציון מיטבי',
            worst_score: 'ציון נמוך',
            average_score: 'ציון ממוצע',
            percent: 'אחוז',
            accuracy: 'דיוק',
            duration_ms: 'משך (מילישניות)',
            duration_seconds: 'משך (שניות)',
            duration: 'משך',
            time_ms: 'זמן (מילישניות)',
            time_seconds: 'זמן (שניות)',
            test_id: 'מזהה מבחן',
            stage: 'שלב',
            attempt_index: 'מספר ניסיון',
            attempts: 'ניסיונות',
            mistakes: 'טעויות',
            errors: 'שגיאות',
            hits: 'פגיעות',
            misses: 'החטאות',
            missed: 'החטאות',
            lifts: 'הרמות',
            wall_percent: 'אחוז נגיעה בקיר',
            outside_percent: 'אחוז מחוץ לאזור',
            wallPercent: 'אחוז נגיעה בקיר',
            outsidePercent: 'אחוז מחוץ לאזור',
            success: 'הצלחה',
            speed: 'מהירות',
            latency: 'זמן תגובה',
            reaction_time: 'זמן תגובה',
            target: 'מטרה',
            targets: 'מטרות',
            total_targets: 'סה"כ מטרות',
            result: 'תוצאה',
            completed_at: 'תאריך השלמה',
            created_at: 'נוצר ב',
            updated_at: 'עודכן ב'
        };
        if(baseMap[key]) return baseMap[key];

        const normalized = normalizeKey(key);
        if(baseMap[normalized]) return baseMap[normalized];

        const tokenMap = {
            score: 'ציון',
            scaled: 'מנורמל',
            normalized: 'מנורמל',
            raw: 'גולמי',
            final: 'סופי',
            best: 'מיטבי',
            worst: 'נמוך',
            average: 'ממוצע',
            avg: 'ממוצע',
            median: 'חציון',
            total: 'סה"כ',
            count: 'כמות',
            hits: 'פגיעות',
            hit: 'פגיעה',
            misses: 'החטאות',
            miss: 'החטאה',
            missed: 'החטאה',
            lift: 'הרמה',
            lifts: 'הרמות',
            wall: 'קיר',
            outside: 'מחוץ',
            percent: 'אחוז',
            percentage: 'אחוז',
            mistakes: 'טעויות',
            errors: 'שגיאות',
            attempts: 'ניסיונות',
            attempt: 'ניסיון',
            success: 'הצלחה',
            failures: 'כישלונות',
            failure: 'כישלון',
            time: 'זמן',
            duration: 'משך',
            latency: 'זמן תגובה',
            speed: 'מהירות',
            reaction: 'תגובת',
            target: 'מטרה',
            targets: 'מטרות',
            eye: 'עין',
            hand: 'יד',
            scoregap: 'פער ציון',
            stage: 'שלב',
            session: 'סשן',
            rawdata: 'נתונים גולמיים',
            summary: 'סיכום'
        };

        const tokens = splitKeyTokens(key);
        const translatedTokens = tokens.map(tok=> tokenMap[tok] || null);
        if(translatedTokens.some(Boolean)){
            const combined = translatedTokens.map((tok, idx)=> tok || tokens[idx]).join(' ').replace(/\s+/g,' ').trim();
            return combined;
        }
        return key;
    }

    function normalizeKey(key){
        return String(key)
            .replace(/([a-z0-9])([A-Z])/g,'$1_$2')
            .replace(/[\s-]+/g,'_')
            .toLowerCase();
    }

    function splitKeyTokens(key){
        return normalizeKey(key).split('_').filter(Boolean);
    }

    function escapeHtml(value){
        if(value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
    }

    window.scoresView = {
        close: hideScoresScreen
    };
})();
