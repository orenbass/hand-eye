export function renderAdminLayout(container){
  if(!container) return;

  if(!document.getElementById('adminSaveBarStyles')){
    const st=document.createElement('style');
    st.id='adminSaveBarStyles';
    st.textContent=`
      .admin-save-bar .save-bar-btn,
      .admin-save-bar .save-settings-btn {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background .15s, color .15s, border-color .15s;
      }
      .admin-save-bar .save-bar-btn:hover,
      .admin-save-bar .save-settings-btn:hover {
        background: var(--bg-hover);
        color: var(--accent-primary);
        border-color: var(--accent-primary);
      }
      .admin-save-bar .save-bar-btn:active,
      .admin-save-bar .save-settings-btn:active {
        background: var(--bg-active);
      }
    `;
    document.head.appendChild(st);
  }

  container.innerHTML=`
    <div class="admin-settings">
      <div class="admin-save-bar" role="region" aria-label="ניהול ושמירה">
        <div class="save-bar-title">💾 ניהול ושמירה</div>
        <button id="saveSettings" class="save-settings-btn save-bar-btn" type="button">שמור את כל ההגדרות</button>
        <button id="exportSettings" class="save-settings-btn save-bar-btn" type="button">⬇ הורד הגדרות (JSON)</button>
        <button id="exportSettingsZip" class="save-settings-btn save-bar-btn" type="button">🗜 הורד ZIP</button>
        <button id="importSettingsFile" class="save-settings-btn save-bar-btn" type="button">📂 טען קובץ הגדרות</button>
        <span id="saveStatus" class="save-status" aria-live="polite"></span>
      </div>
      <div class="admin-layout-grid">
        <aside class="admin-tabs-bar" role="tablist">
          <button class="admin-tab-btn" data-admin-tab="general">כללי</button>
          <button class="admin-tab-btn" data-admin-tab="users">ניהול משתמשים</button>
          <button class="admin-tab-btn" data-admin-tab="eyehand">תיאום עין-יד</button>
          <button class="admin-tab-btn" data-admin-tab="reaction">זמן תגובה</button>
          <button class="admin-tab-btn" data-admin-tab="memory">זיכרון צבעים</button>
          <button class="admin-tab-btn" data-admin-tab="tracking">מעקב וקשב</button>
          <button class="admin-tab-btn" data-admin-tab="northfind">מציאת הצפון</button>
          <button class="admin-tab-btn" data-admin-tab="flightcontrol">בקרת טיסה</button>
          <button class="admin-tab-btn" data-admin-tab="targetid">ירי במטרות</button>
          <button class="admin-tab-btn" data-admin-tab="orientation">התמצאות</button>
          <button class="admin-tab-btn" data-admin-tab="flightexam">מבחן הטסה</button>
        </aside>
        <div class="admin-content-panel">
          <div class="settings-section section-general" data-tab-section="general">
            <h3>הגדרות כלליות</h3>
            <div class="form-grid">
              <div class="form-group">
                <label>סקאלת ציון גלובלית</label>
                <div class="scale-inputs">
                  <input id="cfgScaleMin" type="number" min="1" max="99" value="1" placeholder="מינ׳">
                  <span>עד</span>
                  <input id="cfgScaleMax" type="number" min="2" max="100" value="7" placeholder="מקס׳">
                </div>
                <span class="form-hint">טווח הציונים עבור כל המבחנים</span>
              </div>
            </div>
            <h4 style="margin-top:30px;margin-bottom:16px;color:var(--accent-primary)">סדר וכלילת מבחנים</h4>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">גרור שורה לשינוי סדר המבחנים. ההגדרות המפורטות של כל מבחן נמצאות בטאב הייעודי שלו.</p>
            <table class="tests-table">
              <thead>
                <tr>
                  <th>שם המבחן</th>
                  <th style="text-align:center">כלול במערכת</th>
                  <th style="text-align:center">מזהה</th>
                </tr>
              </thead>
              <tbody id="testsOrderConfig"></tbody>
            </table>
          </div>
          <div class="settings-section section-users" data-tab-section="users" style="display:none">
            <h3>ניהול מועמדים</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:18px">עבודה מול טבלת <code>exam_users</code> ב-Supabase – ניתן לחפש לפי תעודת זהות או שם, לעדכן פרטי מועמד ולסמן השלמת כלל המבחנים.</p>
            <div class="user-mgmt" style="display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px;align-items:flex-start;flex-wrap:wrap;">
              <div class="user-mgmt-list" style="border:2px solid var(--border-color);border-radius:14px;padding:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm);min-width:0;">
                <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;align-items:center;">
                  <input id="userSearchInput" type="search" placeholder="חיפוש לפי תעודת זהות או שם" style="flex:1;padding:10px 12px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);min-width:220px;">
                  <select id="userCompletionFilter" style="padding:10px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);min-width:150px;">
                    <option value="all">כל המשתמשים</option>
                    <option value="pending">בתהליך</option>
                    <option value="done">סיימו הכל</option>
                  </select>
                  <button id="userRefreshBtn" class="btn btn-secondary" style="padding:10px 18px;font-size:0.85rem;border-radius:10px;">↻ רענן</button>
                </div>
                <div class="user-list-wrapper" style="overflow:auto;max-height:420px;border:2px dashed var(--border-color);border-radius:12px;">
                  <table style="width:100%;border-collapse:collapse;font-size:0.85rem;min-width:520px;">
                    <thead style="background:var(--bg-tertiary);position:sticky;top:0;z-index:2;">
                      <tr>
                        <th style="text-align:right;padding:10px 12px;font-weight:600;color:var(--text-secondary);">שם המועמד</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">תעודת זהות</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">קוד כניסה</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">סטטוס מבחנים</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">עודכן</th>
                        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-secondary);">פעולות</th>
                      </tr>
                    </thead>
                    <tbody id="userListBody"></tbody>
                  </table>
                  <div id="userListLoading" style="padding:16px;text-align:center;font-size:0.85rem;color:var(--text-secondary);display:none;">טוען נתונים...</div>
                  <div id="userListEmptyState" style="padding:20px;text-align:center;font-size:0.85rem;color:var(--text-secondary);display:none;">אין משתמשים להצגה</div>
                  <div id="userListError" style="padding:16px;text-align:center;font-size:0.85rem;color:#fb7185;display:none;"></div>
                </div>
              </div>
              <div class="user-mgmt-form" style="border:2px solid var(--border-color);border-radius:14px;padding:18px;background:var(--bg-secondary);box-shadow:var(--shadow-sm);min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                  <h4 id="userFormTitle" style="margin:0;font-size:1rem;">הוסף מועמד חדש</h4>
                  <span id="userFormMode" class="pill-small" style="background:var(--bg-terטיary);color:var(--text-secondary);">מצב יצירה</span>
                </div>
                <div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
                  <div class="form-group" style="margin:0;">
                    <label for="userFirstName">שם פרטי</label>
                    <input id="userFirstName" type="text" placeholder="לדוגמה: דנה" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label for="userLastName">שם משפחה</label>
                    <input id="userLastName" type="text" placeholder="לדוגמה: כהן" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                  </div>
                </div>
                <div class="form-group">
                  <label for="userNationalId">תעודת זהות (חובה)</label>
                  <input id="userNationalId" type="text" placeholder="לדוגמה: 123456789" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                  <span class="form-hint" style="font-size:0.75rem;color:var(--text-secondary);">זהו המפתח בעזרתו מאתרים את המועמד</span>
                </div>
                <div class="form-group">
                  <label for="userNotes">הערות פנימיות</label>
                  <textarea id="userNotes" rows="3" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;resize:vertical;" placeholder="פרטים נוספים, סטטוס מבחנים וכו'."></textarea>
                </div>
                <div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
                  <div class="form-group" style="margin:0;">
                    <label for="userAccessStart">פתיחת חלון ביצוע</label>
                    <input id="userAccessStart" type="datetime-local" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                    <span class="form-hint" style="font-size:0.75rem;color:var(--text-secondary);">תחילת פרק הזמן שבו ניתן לבצע את המבחנים</span>
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label for="userAccessEnd">סגירת חלון ביצוע</label>
                    <input id="userAccessEnd" type="datetime-local" style="width:100%;padding:12px;border:2px solid var(--border-color);border-radius:10px;">
                    <span class="form-hint" style="font-size:0.75rem;color:var(--text-secondary);">אופציונלי – מועד אחרון לביצוע</span>
                  </div>
                </div>
                <div class="form-group" style="margin-bottom:10px;">
                  <label for="userEntryPin">קוד כניסה (4 ספרות)</label>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <input id="userEntryPin" type="text" readonly style="flex:1;min-width:120px;padding:12px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);font-weight:600;text-align:center;letter-spacing:0.2em;">
                    <button id="userPinRegenBtn" type="button" class="btn btn-secondary" style="padding:10px 16px;border-radius:10px;">הפק קוד חדש</button>
                  </div>
                  <span class="form-hint" style="font-size:0.75rem;color:var(--text-secondary);">שמור את הקוד והזכר לנבחן להזין אותו יחד עם תעודת הזהות בכניסה</span>
                </div>
                <label style="display:flex;align-items:center;gap:10px;margin:6px 0 4px;font-weight:600;color:var(--text-primary);">
                  <input type="checkbox" id="userAllDone" style="width:auto;">
                  כל המבחנים הושלמו בהצלחה
                </label>
                <div id="userTestsMeta" style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">לא בוצעו ניסיונות עדיין</div>
                <div id="userFormStatus" style="font-size:0.8rem;color:var(--text-secondary);min-height:18px;margin-top:6px;"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
                  <button id="userSaveBtn" type="button" class="btn" style="background:#10b981;color:#fff;padding:10px 18px;border-radius:10px;">💾 שמור מועמד</button>
                  <button id="userResetBtn" type="button" class="btn btn-secondary" style="padding:10px 18px;border-radius:10px;">איפוס טופס</button>
                  <button id="userDeleteBtn" type="button" class="btn" style="background:#ef4444;color:#fff;padding:10px 18px;border-radius:10px;display:none;">🗑️ מחק מועמד</button>
                </div>
                <div class="bulk-import-card" style="margin-top:24px;padding:16px;border:2px dashed var(--border-color);border-radius:14px;background:var(--bg-tertiary);">
                  <h4 style="margin-top:0;margin-bottom:10px;font-size:0.95rem;display:flex;align-items:center;gap:6px;">ייבוא מרוכז של מועמדים</h4>
                  <p style="margin:0 0 12px;font-size:0.8rem;color:var(--text-secondary);">הורד קובץ תבנית, מלא בו את פרטי המועמדים (כולל חלון ביצוע) ולאחר מכן העלה אותו לכאן לצורך בדיקת תקינות ויצירה אוטומטית.</p>
                  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    <button id="userExcelTemplateBtn" type="button" class="btn btn-secondary" style="padding:8px 16px;border-radius:10px;">⬇ הורד תבנית Excel</button>
                    <button id="userExcelUploadBtn" type="button" class="btn" style="padding:8px 16px;border-radius:10px;background:#0ea5e9;color:#fff;">⬆ העלה קובץ Excel</button>
                    <input id="userExcelInput" type="file" accept=".xlsx,.xls,.csv" style="display:none;">
                    <span id="userExcelStatus" style="font-size:0.8rem;color:var(--text-secondary);"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-section section-eyehand" data-tab-section="eyehand" style="display:none">
            <h3>מבחן תיאום עין-יד</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="eyehandSeconds">משך המבחן (שניות)</label>
                <input id="eyehandSeconds" type="number" min="5" max="600" value="30">
                <span class="form-hint">זמן שיינתן לנבחן להשלמת המסלול</span>
              </div>
              <div class="form-group">
                <label for="eyehandDifficulty">רמת קושי</label>
                <select id="eyehandDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על רוחב המסלול ומורכבותו</span>
              </div>
            </div>
          </div>
          <div class="settings-section section-reaction" data-tab-section="reaction" style="display:none">
            <h3>מבחן זמן תגובה</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="reactionSeconds">משך המבחן (שניות)</label>
                <input id="reactionSeconds" type="number" min="5" max="600" value="40">
                <span class="form-hint">זמן כולל למבחן</span>
              </div>
              <div class="form-group">
                <label for="reactionDifficulty">רמת קושי</label>
                <select id="reactionDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות ומורכבות הצורות</span>
              </div>
              <div class="form-group">
                <label for="cfgReactionShapeSec">משך הופעת צורה (שניות)</label>
                <input id="cfgReactionShapeSec" type="number" min="0.2" max="10" step="0.1" value="1">
                <span class="form-hint">כל צורה מוחלפת ברגע שנגמר הזמן</span>
              </div>
            </div>
          </div>
          <div class="settings-section section-memory" data-tab-section="memory" style="display:none">
            <h3>מבחן זיכרון צבעים</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="memorySeconds">משך המבחן (שניות)</label>
                <input id="memorySeconds" type="number" min="5" max="600" value="60">
                <span class="form-hint">זמן מקסימלי למבחן</span>
              </div>
              <div class="form-group">
                <label for="memoryDifficulty">רמת קושי</label>
                <select id="memoryDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על אורך הרצפים</span>
              </div>
            </div>
          </div>
          <div class="settings-section section-tracking" data-tab-section="tracking" style="display:none">
            <h3>מבחן מעקב וקשב</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="trackingSeconds">משך המבחן (שניות)</label>
                <input id="trackingSeconds" type="number" min="5" max="600" value="30">
                <span class="form-hint">זמן המבחן</span>
              </div>
              <div class="form-group">
                <label for="trackingDifficulty">רמת קושי</label>
                <select id="trackingDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות תנועת היעד</span>
              </div>
            </div>
          </div>
          <div class="settings-section section-northfind" data-tab-section="northfind" style="display:none">
            <h3>מבחן מציאת הצפון</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="northfindSeconds">משך המבחן (שניות)</label>
                <input id="northfindSeconds" type="number" min="5" max="600" value="45">
                <span class="form-hint">זמן כולל למבחן (כל הניסיונות)</span>
              </div>
              <div class="form-group">
                <label for="northfindDifficulty">רמת קושי</label>
                <select id="northfindDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות הסיבוב</span>
              </div>
            </div>
            <h4 style="margin-top:30px;margin-bottom:16px">הגדרות מפורטות</h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="northTrials">מספר ניסיונות</label>
                <input id="northTrials" type="number" min="1" max="20" value="5">
                <span class="form-hint">מספר הסיבובים במבחן</span>
              </div>
              <div class="form-group">
                <label for="northShowNorth">זמן הצגת צפון (שניות)</label>
                <input id="northShowNorth" type="number" min="1" max="10" value="3">
                <span class="form-hint">כמה זמן להציג את חץ הצפון</span>
              </div>
              <div class="form-group">
                <label for="northSpin">משך סיבוב (שניות)</label>
                <input id="northSpin" type="number" min="3" max="30" value="6">
                <span class="form-hint">כמה זמן המפה מסתובבת</span>
              </div>
              <div class="form-group">
                <label for="northAnswer">זמן תגובה (שניות)</label>
                <input id="northAnswer" type="number" min="3" max="60" value="10">
                <span class="form-hint">זמן לבחירת מיקום הצפון</span>
              </div>
            </div>
            <div class="north-upload-card">
              <div class="north-upload-actions">
                <button id="northImagesUploadBtn" type="button" class="btn btn-secondary" style="padding:10px 18px;border-radius:10px;">⬆ העלה מפות</button>
                <button id="northImagesClearBtn" type="button" class="btn" style="padding:10px 18px;border-radius:10px;background:#ef4444;color:#fff;">🗑️ מחק את כל המפות</button>
                <input id="northImagesInput" type="file" accept="image/*" multiple style="display:none">
                <span id="northUploadStatus" class="north-upload-status">אין מפות מותאמות כרגע</span>
              </div>
              <p class="north-upload-hint">ניתן להעלות מספר תמונות מפה (JPEG/PNG). התמונות נשמרות מקומית ומסונכרנות עם Supabase בעת שמירת הגדרות.</p>
              <div id="northfindImagesPreview" class="north-images-grid"></div>
            </div>
            <div class="north-actions">
              <button id="btnNorthSave" class="save-settings-btn">שמור הגדרות צפון</button>
            </div>
            <span id="northStatus" class="route-status" style="margin-top:10px">טרם הועלו מפות</span>
          </div>
          <div class="settings-section section-orientation" data-tab-section="orientation" style="display:none">
            <h3>מבחן התמצאות וכיוונים</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="orientationSeconds">זמן כולל למבחן (שניות)</label>
                <input id="orientationSeconds" type="number" min="60" max="3600" value="360">
                <span class="form-hint">זמן כולל לכל המבחן (ברירת מחדל: 6 דקות)</span>
              </div>
              <div class="form-group">
                <label for="orientationDifficulty">רמת קושי</label>
                <select id="orientationDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מספר אפשרויות בשאלות</span>
              </div>
            </div>
            <h4 style="margin-top:30px;margin-bottom:16px">הגדרות מתקדמות</h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="orientMaxQuestions">מספר שאלות מקסימלי</label>
                <input id="orientMaxQuestions" type="number" min="1" max="50" value="10">
                <span class="form-hint">כמות השאלות שיופיעו במבחן</span>
              </div>
              <div class="form-group">
                <label for="orientShowCompass">
                  <input type="checkbox" id="orientShowCompass" style="width:auto;margin-left:8px" checked>
                  הצג שושנת רוחות
                </label>
                <span class="form-hint">הצגת מצפן על תמונת המבט על</span>
              </div>
            </div>
            <h4 style="margin-top:30px;margin-bottom:16px">ניהול תמונות דרך Supabase</h4>
            <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:18px">
              המערכת טוענת את כל השאלות ישירות מבסיס הנתונים. ניתן להעלות כאן קבוצה חדשה שתשמר מיד ב-Supabase.
            </p>
            <button id="btnOpenOrientationUpload" class="btn" style="background:#2563eb;color:#fff;padding:10px 22px;border-radius:10px;font-weight:600;box-shadow:0 6px 18px rgba(37,99,235,0.25);">
              ⬆ פתח חלון העלאה חדש
            </button>
            <span id="orientationUploadStatus" style="display:block;margin-top:12px;font-size:0.82rem;color:var(--text-secondary);">
              הקבוצות מנוהלות דרך Supabase. ניתן להעלות קבוצה חדשה באמצעות החלון היעודי.
            </span>
            <div style="margin-top:16px;background:rgba(37,99,235,0.08);border:1px dashed rgba(37,99,235,0.35);border-radius:12px;padding:14px;color:var(--text-secondary);font-size:0.8rem;">
              💡 לאחר ההעלאה, הקבוצה תופיע בטבלה למטה. מומלץ להכין מראש קובץ TOP וכמה תמונות כיוון בפורמט JPG/PNG.
            </div>
            <h4 style="margin-top:40px;margin-bottom:14px">תמונות קיימות בבסיס (Supabase)</h4>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 10px">טעינה אוטומטית של כל התמונות מהטבלה orientation_images וקיבוץ לפי מספר מבחן. לחיצה כפולה על תמונה לפתיחה מלאה.</p>
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <button id="btnReloadOrientationDb" class="btn btn-secondary" style="padding:6px 14px;font-size:0.75rem">↻ רענן</button>
              <span id="orientationDbStatus" style="font-size:0.75rem;color:var(--text-secondary)">ממתין לטעינה...</span>
            </div>
            <div id="orientationDbPreview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;min-height:60px"></div>
          </div>
          <div class="settings-section section-flightcontrol" data-tab-section="flightcontrol" style="display:none">
            <h3>מבחן בקרת טיסה</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="flightcontrolSeconds">משך המבחן (שניות)</label>
                <input id="flightcontrolSeconds" type="number" min="5" max="600" value="60">
                <span class="form-hint">זמן המבחן</span>
              </div>
              <div class="form-group">
                <label for="flightcontrolDifficulty">רמת קושי</label>
                <select id="flightcontrolDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על עוצמת ההפרעות</span>
              </div>
            </div>
          </div>
          <div class="settings-section section-targetid" data-tab-section="targetid" style="display:none">
            <h3>מבחן ירי במטרות</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="targetidSeconds">משך המבחן (שניות)</label>
                <input id="targetidSeconds" type="number" min="5" max="600" value="60">
                <span class="form-hint">זמן המבחן</span>
              </div>
              <div class="form-group">
                <label for="targetidDifficulty">רמת קושי</label>
                <select id="targetidDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על מהירות ומספר המטרות</span>
              </div>
            </div>
          </div>
          <div class="settings-section section-flightexam" data-tab-section="flightexam" style="display:none">
            <h3>מבחן הטסה</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="flightexamSeconds">משך כל חלק (שניות)</label>
                <input id="flightexamSeconds" type="number" min="5" max="600" value="20">
                <span class="form-hint">זמן ברירת מחדל לחלק</span>
              </div>
              <div class="form-group">
                <label for="flightexamDifficulty">רמת קושי</label>
                <select id="flightexamDifficulty">
                  <option>קל</option>
                  <option selected>בינוני</option>
                  <option>קשה</option>
                </select>
                <span class="form-hint">משפיע על רגישות הדיוק</span>
              </div>
            </div>
            <h4 style="margin-top:30px;margin-bottom:16px">זמני שלבי המבחן</h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="flightExamPathTime">זמן צפייה במסלול (שניות)</label>
                <input id="flightExamPathTime" type="number" min="3" max="300" value="15">
                <span class="form-hint">משך הצגת המסלול לפני ספירה</span>
              </div>
              <div class="form-group">
                <label for="flightExamPreDelay">ספירת ביניים (שניות)</label>
                <input id="flightExamPreDelay" type="number" min="0" max="120" value="10">
                <span class="form-hint">ספירה לאחר תנועת המטוס על המסלול</span>
              </div>
              <div class="form-group">
                <label for="flightExamFlightDur">זמן טיסה (שניות)</label>
                <input id="flightExamFlightDur" type="number" min="5" max="600" value="60">
                <span class="form-hint">הזמן שבו הנבחן מזיז את המטוס</span>
              </div>
            </div>
            <h4 style="margin-top:40px;margin-bottom:14px;color:var(--accent-primary)">ניהול חלקי מבחן ב-Supabase</h4>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px">
              טעינה אוטומטית של כל החלקים מהטבלה flight_exam_parts. כל חלק כולל תמונת מסלול, תמונת מבחן ונקודות מסלול.
            </p>
            <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;background:var(--bg-terטיary);padding:14px;border-radius:12px;border:2px solid var(--border-color);">
              <button id="btnAddNewFlightPartToDb" class="btn" style="background:#10b981;color:#fff;padding:10px 20px;font-size:0.9rem;border:none;border-radius:10px;cursor:pointer;font-weight:600;box-shadow:0 4px 12px rgba(16,185,129,0.3);transition:all 0.2s;">
                ➕ הוסף חלק חדש לבסיס
              </button>
              <button id="btnReloadFlightExamDb" class="btn btn-secondary" style="padding:10px 18px;font-size:0.85rem;border-radius:10px;">
                ↻ רענן רשימה
              </button>
              <span id="flightExamDbStatus" style="font-size:0.8rem;color:var(--text-secondary);margin-right:auto;">ממתין לטעינה...</span>
            </div>
            <div id="flightExamDbPreview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;min-height:100px;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const buttons=container.querySelectorAll('.admin-tab-btn');
  const sections=container.querySelectorAll('[data-tab-section]');
  buttons.forEach(btn=>{
    btn.onclick=()=>{
      const tab=btn.getAttribute('data-admin-tab');
      buttons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      sections.forEach(section=>{
        const sectionKey=section.getAttribute('data-tab-section');
        section.style.display=sectionKey===tab? '' : 'none';
      });
    };
  });
  const defaultTab=container.querySelector('.admin-tab-btn[data-admin-tab="general"]');
  if(defaultTab) defaultTab.click();
}
