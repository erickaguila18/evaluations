import { doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

window.allInstructorActivities = []; 
let currentUser = null;
let originalPool = [], renderedQuestions = [], examConfig = {};
let sessionData = { studentName: "", studentEmail: "", studentGen: "", startTime: null, docId: null };
let isExamActive = false, isBlocked = false, isHandlingInfraction = false, isPermanentlyBlocked = false;
let cheatCount = 0; let MAX_INFRACTIONS = 5;
let timerInterval, timeRemainingSeconds = 0;
let inactivityTimer = null;
let surveyAutoSaveTimer = null;
window.gradesList = []; 
let currentSort = { column: '', asc: true };
let examToDelete = null;
window.currentCourseModules = [];
window.currentModuleIndex = 0;
window.uploadType = 'exam';

const urlParams = new URLSearchParams(window.location.search);
window.currentExamId = urlParams.get('examId'); 

window.CustomDialog = {
    show: function(title, message, isConfirm = false) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-dialog');
            const box = document.getElementById('dialog-box');
            document.getElementById('dialog-title').innerHTML = `<i class="fi fi-ss-info"></i> ` + title;
            document.getElementById('dialog-message').innerText = message;
            document.getElementById('dialog-cancel-btn').className = isConfirm ? 'btn-secondary' : 'hidden';
            box.className = isConfirm ? 'modal-content danger-top' : 'modal-content primary-top';
            modal.classList.remove('hidden');
            document.getElementById('dialog-ok-btn').onclick = () => { modal.classList.add('hidden'); resolve(true); };
            document.getElementById('dialog-cancel-btn').onclick = () => { modal.classList.add('hidden'); resolve(false); };
        });
    },
    alert: function(message, title="Atención") { return this.show(title, message, false); },
    confirm: function(message, title="Confirmación") { return this.show(title, message, true); }
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

window.setLoading = (btnId, isLoading, defaultHtml = "") => {
    const btn = document.getElementById(btnId);
    if(!btn) return;
    if(isLoading) {
        btn.disabled = true;
        if(!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fi fi-ss-spinner" style="display:inline-block; animation:spin 1s linear infinite;"></i> Procesando...`;
        btn.style.opacity = "0.7";
        btn.style.cursor = "not-allowed";
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.origHtml || defaultHtml;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    }
};

const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

function getYTid(url) {
    if(!url) return null;
    let regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    let match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function sanitize(str) { return typeof str === 'string' ? str.replace(/[^\w\s#:/.-]/gi, '') : ''; }

function applyBrandingUI(data) {
    if(data.color && data.color.length >= 7) {
        document.documentElement.style.setProperty('--primary', sanitize(data.color), 'important');
        try {
            let R = parseInt(data.color.substring(1,3),16); let G = parseInt(data.color.substring(3,5),16); let B = parseInt(data.color.substring(5,7),16);
            R = parseInt(R * (80) / 100); G = parseInt(G * (80) / 100); B = parseInt(B * (80) / 100);
            R = (R<255)?R:255; G = (G<255)?G:255; B = (B<255)?B:255;
            let RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
            let GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
            let BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));
            document.documentElement.style.setProperty('--primary-dark', "#"+RR+GG+BB, 'important');
        } catch(e) {}
    }
    if(data.footerColor && data.footerColor.length >= 7) {
        document.documentElement.style.setProperty('--footer-bg', sanitize(data.footerColor), 'important');
    }
    
    if(data.name && data.name.trim() !== "") document.getElementById('nav-brand-text').innerText = data.name;
    
    if(data.footerQuote !== undefined) {
        const fQuote = document.getElementById('app-footer-quote');
        const cQuote = document.getElementById('cert-footer-quote');
        if(fQuote) fQuote.innerText = data.footerQuote;
        if(cQuote) cQuote.innerText = data.footerQuote;
    }

    if(data.logoUrl) {
        document.getElementById('nav-brand-icon').classList.add('hidden');
        document.getElementById('nav-brand-img').src = data.logoUrl;
        document.getElementById('nav-brand-img').classList.remove('hidden');
    }
    
    if(data.instructorName && data.instructorName.trim() !== "") {
        const el = document.getElementById('dashboard-inst-name');
        if(el) el.innerText = data.instructorName;
    }
    if(data.instructorAvatarUrl) {
        const elIcon = document.getElementById('dashboard-inst-icon');
        const elAvatar = document.getElementById('dashboard-inst-avatar');
        if(elIcon && elAvatar) {
            elIcon.classList.add('hidden');
            elAvatar.src = data.instructorAvatarUrl;
            elAvatar.classList.remove('hidden');
        }
    }
    
    const socialContainer = document.getElementById('footer-social-links');
    if(socialContainer) {
        socialContainer.innerHTML = '';
        if(data.socialFb) socialContainer.innerHTML += `<a href="${sanitize(data.socialFb)}" target="_blank" class="social-link"><i class="fi fi-brands-facebook"></i></a>`;
        if(data.socialIg) socialContainer.innerHTML += `<a href="${sanitize(data.socialIg)}" target="_blank" class="social-link"><i class="fi fi-brands-instagram"></i></a>`;
        if(data.socialWa) socialContainer.innerHTML += `<a href="${sanitize(data.socialWa)}" target="_blank" class="social-link"><i class="fi fi-brands-whatsapp"></i></a>`;
        if(data.socialWeb) socialContainer.innerHTML += `<a href="${sanitize(data.socialWeb)}" target="_blank" class="social-link"><i class="fi fi-ss-globe"></i></a>`;
        
        if(socialContainer.innerHTML === '') {
            socialContainer.classList.add('hidden');
        } else {
            socialContainer.classList.remove('hidden');
        }
    }
}

function applyDefaultBranding() {
    const dynStyle = document.getElementById('dynamic-branding');
    if (dynStyle) { dynStyle.remove(); }
    
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--primary-dark');
    document.documentElement.style.removeProperty('--footer-bg');
    
    document.getElementById('nav-brand-text').innerText = "Plataforma EEMS";
    
    const defQuote = '"If you want different results, do not do the same things." - Albert Einstein';
    const fQuote = document.getElementById('app-footer-quote');
    const cQuote = document.getElementById('cert-footer-quote');
    if(fQuote) fQuote.innerText = defQuote;
    if(cQuote) cQuote.innerText = defQuote;

    document.getElementById('nav-brand-icon').classList.remove('hidden');
    document.getElementById('nav-brand-img').classList.add('hidden');
    
    let favicon = document.getElementById('dynamic-favicon');
    if (favicon) { favicon.href = "data:image/x-icon;,"; }

    const elName = document.getElementById('dashboard-inst-name');
    if(elName) elName.innerText = "Instructor Principal";
    const elIcon = document.getElementById('dashboard-inst-icon');
    const elAvatar = document.getElementById('dashboard-inst-avatar');
    if(elIcon && elAvatar) { elIcon.classList.remove('hidden'); elAvatar.classList.add('hidden'); }
    
    const socialContainer = document.getElementById('footer-social-links');
    if(socialContainer) {
        socialContainer.innerHTML = '';
        socialContainer.classList.add('hidden');
    }
}

function applyStoredBranding() {
    try {
        const stored = localStorage.getItem('eems_branding');
        if (stored) applyBrandingUI(JSON.parse(stored));
        else applyDefaultBranding();
    } catch(e) { applyDefaultBranding(); }
}

async function loadBranding(instructorUid = null) {
    try {
        let docRef = doc(db, "settings", "branding");
        if (instructorUid) { docRef = doc(db, "settings", "branding_" + instructorUid); }
        const configSnap = await getDoc(docRef);
        if(configSnap.exists()) {
            const data = configSnap.data();
            localStorage.setItem('eems_branding', JSON.stringify(data));
            applyBrandingUI(data);
        } else if (instructorUid) { applyStoredBranding(); }
    } catch(e) { applyStoredBranding(); }
}

window.addEventListener('pageshow', function(event) {
    if (localStorage.getItem('estado_examen_bloqueado') === 'true') {
        hideAll();
        document.getElementById('blocked-title').innerText = "ANULADO";
        document.getElementById('blocked-msg').innerText = "El sistema detectó que intentaste regresar a la actividad bloqueada.";
        document.getElementById('blocked-view').classList.remove('hidden');
        document.getElementById('nav-ingresar').classList.add('hidden');
        document.getElementById('nav-settings').classList.add('hidden');
        document.getElementById('nav-volver').classList.add('hidden');
        document.querySelector('.container').classList.remove('expanded');
        isPermanentlyBlocked = true;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = ['certificate-modal', 'student-feedback-modal', 'details-modal', 'delete-modal', 'reset-modal', 'custom-dialog', 'warning-modal', 'severe-modal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) {
                if (id === 'custom-dialog') {
                    const cancel = document.getElementById('dialog-cancel-btn');
                    if (cancel && !cancel.classList.contains('hidden')) cancel.click();
                    else { const ok = document.getElementById('dialog-ok-btn'); if(ok) ok.click(); }
                } else if (id === 'certificate-modal') {
                    el.classList.add('hidden');
                    window.exitActivity();
                } else if (id === 'warning-modal') {
                    window.closeModal();
                } else if (id === 'severe-modal') {
                    window.exitActivity();
                } else {
                    el.classList.add('hidden');
                }
            }
        });
    }
    
    if (isExamActive && (!examConfig || (examConfig.type !== 'survey' && examConfig.type !== 'course')) && (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === '3' || e.key === '4')) {
        e.preventDefault();
        triggerSevereInfraction("Comando de recorte detectado.");
    }
});

function hideAll() {
    ['loading-screen', 'role-selector', 'login-view', 'student-login-view', 'student-portal', 
     'instructor-dashboard', 'instructor-upload', 'instructor-grades', 'exam-view', 'course-view',
     'blocked-view', 'success-view', 'severe-modal', 'admin-settings', 'delete-modal', 'reset-modal', 'details-modal', 'student-feedback-modal', 'instructor-survey-analytics', 'certificate-modal'].forEach(id => {
         const el = document.getElementById(id);
         if (el) el.classList.add('hidden');
     });
    const container = document.querySelector('.container');
    if (container) container.classList.remove('expanded');
    
    const ytContainer = document.getElementById('course-video-container');
    if(ytContainer) ytContainer.innerHTML = '';
}

window.exitActivity = () => {
    isExamActive = false;
    window.currentExamId = null;
    clearInterval(timerInterval);
    clearTimeout(inactivityTimer);
    clearTimeout(surveyAutoSaveTimer);
    history.pushState(null, null, location.href.split('?')[0]);
    window.goHome();
};

window.logoClick = () => {
    if(isExamActive && (!examConfig || (examConfig.type !== 'course' && examConfig.type !== 'survey'))) { 
        window.CustomDialog.alert("Debes finalizar antes de salir de la plataforma."); 
        return; 
    }
    window.exitActivity();
}

window.goHome = () => {
    if (isPermanentlyBlocked || localStorage.getItem('estado_examen_bloqueado') === 'true') {
        hideAll(); document.getElementById('blocked-view').classList.remove('hidden'); 
        document.getElementById('nav-actions').classList.remove('hidden'); 
        document.getElementById('nav-ingresar').classList.add('hidden');
        document.getElementById('nav-settings').classList.add('hidden');
        document.getElementById('nav-volver').classList.add('hidden');
        return;
    }
    
    if (window.currentExamId && !isExamActive) {
        window.exitActivity();
        return;
    }

    hideAll();
    isExamActive = false; clearInterval(timerInterval);
    document.getElementById('nav-volver').classList.add('hidden');
    document.getElementById('nav-actions').classList.remove('hidden'); 
    
    window.setLoading('login-btn', false, '<i class="fi fi-ss-sign-in-alt"></i> Ingresar');
    window.setLoading('std-login-btn', false, '<i class="fi fi-ss-user-check"></i> Entrar a mi Aula');

    if (currentUser) { 
        document.getElementById('nav-ingresar').classList.remove('hidden');
        document.getElementById('nav-settings').classList.remove('hidden');
        window.backToDashboard(); 
    } else if (localStorage.getItem('tumb_student')) { 
        document.getElementById('nav-ingresar').classList.remove('hidden');
        document.getElementById('nav-settings').classList.add('hidden');
        window.loadStudentDashboard(); 
    } else {
        document.getElementById('role-selector').classList.remove('hidden');
        document.getElementById('nav-ingresar').classList.remove('hidden');
        document.getElementById('nav-settings').classList.add('hidden');
        document.getElementById('nav-ingresar').innerHTML = `<i class="fi fi-ss-sign-in-alt"></i> Ingresar`;
        document.getElementById('nav-ingresar').onclick = () => window.showInstructorLogin();
    }
};

window.promptResetSettings = () => {
    document.getElementById('reset-confirm-input').value = "";
    document.getElementById('reset-modal').classList.remove('hidden');
};

window.closeResetModal = () => {
    document.getElementById('reset-modal').classList.add('hidden');
};

window.executeResetSettings = async () => {
    const input = document.getElementById('reset-confirm-input').value.trim().toLowerCase();
    if (input !== "resetear") {
        return window.CustomDialog.alert("Debes escribir la palabra 'resetear' exactamente para continuar.");
    }

    window.setLoading('btn-confirm-reset', true);

    try {
        if (currentUser) {
            await deleteDoc(doc(db, "settings", "branding_" + currentUser.uid));
        }
        
        localStorage.removeItem('eems_branding');
        applyDefaultBranding();
        
        document.getElementById('config-inst-name').value = "";
        document.getElementById('config-inst-avatar').value = "";
        document.getElementById('config-brand-name').value = "";
        document.getElementById('config-brand-color').value = "#0288D1";
        document.getElementById('config-brand-hex').value = "#0288D1";
        document.getElementById('config-footer-color').value = "#2C3E50";
        document.getElementById('config-footer-hex').value = "#2C3E50";
        document.getElementById('config-footer-quote').value = "";
        document.getElementById('config-brand-logo').value = "";
        document.getElementById('config-social-fb').value = "";
        document.getElementById('config-social-ig').value = "";
        document.getElementById('config-social-wa').value = "";
        document.getElementById('config-social-web').value = "";

        window.setLoading('btn-confirm-reset', false, '<i class="fi fi-ss-trash"></i> Restaurar');
        window.closeResetModal();
        window.CustomDialog.alert("La plataforma ha sido restaurada a su configuración de fábrica.", "Éxito");
        
    } catch (error) {
        window.setLoading('btn-confirm-reset', false, '<i class="fi fi-ss-trash"></i> Restaurar');
        window.CustomDialog.alert("Error al restaurar la configuración.", "Error");
    }
};

window.showInstructorLogin = () => { 
    hideAll(); 
    document.getElementById('login-view').classList.remove('hidden'); 
    document.getElementById('nav-ingresar').classList.remove('hidden');
    document.getElementById('nav-settings').classList.add('hidden');
    document.getElementById('nav-volver').classList.add('hidden');
    document.getElementById('nav-ingresar').innerHTML = `<i class="fi fi-ss-home"></i> Inicio`;
    document.getElementById('nav-ingresar').onclick = window.goHome;
    window.setLoading('login-btn', false, '<i class="fi fi-ss-sign-in-alt"></i> Ingresar');
};

window.showStudentLogin = () => { 
    hideAll(); 
    document.getElementById('student-login-view').classList.remove('hidden'); 
    document.getElementById('nav-ingresar').classList.remove('hidden');
    document.getElementById('nav-settings').classList.add('hidden');
    document.getElementById('nav-volver').classList.add('hidden');
    document.getElementById('nav-ingresar').innerHTML = `<i class="fi fi-ss-home"></i> Inicio`;
    document.getElementById('nav-ingresar').onclick = window.goHome;
    window.setLoading('std-login-btn', false, '<i class="fi fi-ss-user-check"></i> Entrar a mi Aula');
};

document.addEventListener('DOMContentLoaded', () => {
    const loginPwd = document.getElementById('login-pwd');
    if (loginPwd) { loginPwd.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.loginInstructor(); }); }
    const loginEmail = document.getElementById('login-email');
    if (loginEmail) { loginEmail.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.loginInstructor(); }); }
    const stdGen = document.getElementById('std-login-gen');
    if (stdGen) { stdGen.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.loginStudent(); }); }
    
    const colorPicker = document.getElementById('config-brand-color');
    const hexInput = document.getElementById('config-brand-hex');
    if(colorPicker && hexInput) {
        colorPicker.addEventListener('input', (e) => hexInput.value = e.target.value.toUpperCase());
        hexInput.addEventListener('input', (e) => {
            if(/^#[0-9A-F]{6}$/i.test(e.target.value)) colorPicker.value = e.target.value;
        });
    }

    const footerColorPicker = document.getElementById('config-footer-color');
    const footerHexInput = document.getElementById('config-footer-hex');
    if(footerColorPicker && footerHexInput) {
        footerColorPicker.addEventListener('input', (e) => footerHexInput.value = e.target.value.toUpperCase());
        footerHexInput.addEventListener('input', (e) => {
            if(/^#[0-9A-F]{6}$/i.test(e.target.value)) footerColorPicker.value = e.target.value;
        });
    }
    
    const uploadTriggerEl = document.getElementById('upload-trigger');
    if (uploadTriggerEl) {
        uploadTriggerEl.addEventListener('click', async (e) => {
            const isSurvey = window.uploadType === 'survey';
            const nameValid = document.getElementById('exam-name').value.trim();
            const genValid = document.getElementById('exam-gen').value.trim();
            const qValid = (isSurvey || window.uploadType === 'course') ? true : document.getElementById('exam-q-to-show').value;

            if(!nameValid || !genValid || !qValid) { 
                e.preventDefault(); 
                await window.CustomDialog.alert("Llena todos los campos obligatorios."); 
            }
        });
    }

    const jsonFileEl = document.getElementById('json-file');
    if (jsonFileEl) {
        jsonFileEl.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const rawData = JSON.parse(e.target.result);
                    const newExamId = 'EXM-' + Math.random().toString(36).substr(2, 6).toUpperCase();
                    let dbStruct, masterKey;

                    if(window.uploadType === 'survey') {
                        const safeData = rawData.map(q => ({ q: q.q, type: q.type || 'multiple', opts: q.opts || [] }));
                        dbStruct = {
                            instructorId: currentUser.uid,
                            config: {
                                name: document.getElementById('exam-name').value.trim(), 
                                gen: document.getElementById('exam-gen').value.trim().toUpperCase() || "GLOBAL",
                                expiration: document.getElementById('exam-expiration').value, 
                                type: 'survey'
                            }, 
                            questions: safeData, 
                            timestamp: new Date().toISOString()
                        };
                        masterKey = { instructorId: currentUser.uid, answers: [] }; 
                    } else if (window.uploadType === 'course') {
                        const safeData = rawData.map(m => ({ title: m.title || "Lección", video: m.video || "", attachments: m.attachments || [] }));
                        dbStruct = {
                            instructorId: currentUser.uid,
                            config: {
                                name: document.getElementById('exam-name').value.trim(), 
                                gens_string: document.getElementById('exam-gen').value.trim().toUpperCase(),
                                expiration: document.getElementById('exam-expiration').value, 
                                type: 'course'
                            }, 
                            modules: safeData, 
                            timestamp: new Date().toISOString()
                        };
                        masterKey = { instructorId: currentUser.uid, answers: [] }; 
                    } else {
                        const safeData = rawData.map(q => ({ q: q.q, opts: q.opts, topic: q.topic || "Sin tema" }));
                        const qToShow = parseInt(document.getElementById('exam-q-to-show').value) || safeData.length;
                        const securityLvl = document.getElementById('exam-security').value;

                        dbStruct = {
                            instructorId: currentUser.uid,
                            config: {
                                name: document.getElementById('exam-name').value.trim(), 
                                gen: document.getElementById('exam-gen').value.trim().toUpperCase(),
                                minScore: parseInt(document.getElementById('exam-min-score').value.trim()), 
                                duration: parseInt(document.getElementById('exam-duration').value.trim()),
                                expiration: document.getElementById('exam-expiration').value, 
                                totalQuestions: safeData.length, 
                                questionsToShow: qToShow,
                                securityLevel: securityLvl,
                                type: 'exam'
                            }, 
                            questions: safeData, 
                            timestamp: new Date().toISOString()
                        };
                        masterKey = { instructorId: currentUser.uid, answers: rawData.map(q => q.ans) };
                    }

                    await setDoc(doc(db, "exams", newExamId), dbStruct);
                    await setDoc(doc(db, "exam_keys", newExamId), masterKey);
                    
                    let strTipo = window.uploadType === 'survey' ? 'Encuesta' : (window.uploadType === 'course' ? 'Curso' : 'Evaluación');
                    await window.CustomDialog.alert(`¡${strTipo} Creado(a) con Éxito!`, "Éxito");
                    window.backToDashboard();
                } catch (err) { await window.CustomDialog.alert("Error al procesar el JSON.", "Error"); }
            };
            reader.readAsText(file);
        });
    }

    const examContainerEl = document.getElementById('exam-container');
    if (examContainerEl) {
        examContainerEl.addEventListener('input', (e) => {
            if(isExamActive && examConfig.type === 'survey') {
                clearTimeout(surveyAutoSaveTimer);
                surveyAutoSaveTimer = setTimeout(window.saveSurveyProgress, 1000);
            }
        });
    }
});

onAuthStateChanged(auth, async (user) => { 
    try {
        if (isExamActive) return; 
        document.getElementById('main-navbar').classList.remove('hidden');
        
        if (window.currentExamId) {
            await loadExamView();
        } else if (user) {
            currentUser = user;
            await loadBranding(user.uid);
            window.goHome(); 
        } else {
            currentUser = null;
            applyStoredBranding();
            if (urlParams.get('admin') === 'true') {
                hideAll(); 
                document.getElementById('login-view').classList.remove('hidden');
                document.getElementById('nav-ingresar').classList.remove('hidden');
                document.getElementById('nav-settings').classList.add('hidden');
                document.getElementById('nav-volver').classList.add('hidden');
                document.getElementById('nav-ingresar').innerHTML = `<i class="fi fi-ss-home"></i> Inicio`;
                document.getElementById('nav-ingresar').onclick = () => window.location.href = window.location.pathname;
            } else {
                window.goHome();
            }
        }
    } catch (error) {
        console.error("Error initializing app:", error);
    } finally {
        document.getElementById('full-screen-loader').classList.add('hidden');
    }
});

window.loginStudent = async () => {
    window.setLoading('std-login-btn', true);
    const email = document.getElementById('std-login-email').value.trim().toLowerCase();
    const gen = document.getElementById('std-login-gen').value.trim().toUpperCase();
    const name = document.getElementById('std-login-name').value.trim();
    if(!email || !gen || !name) { 
        window.setLoading('std-login-btn', false, '<i class="fi fi-ss-user-check"></i> Entrar a mi Aula');
        return window.CustomDialog.alert("Llena todos los campos."); 
    }
    document.getElementById('full-screen-loader').classList.remove('hidden');
    localStorage.setItem('tumb_student', JSON.stringify({email, gen, name}));
    document.getElementById('std-login-email').value = ""; document.getElementById('std-login-gen').value = ""; document.getElementById('std-login-name').value = "";
    
    setTimeout(() => {
        window.setLoading('std-login-btn', false, '<i class="fi fi-ss-user-check"></i> Entrar a mi Aula');
        window.loadStudentDashboard();
        document.getElementById('full-screen-loader').classList.add('hidden');
    }, 500);
};

window.logoutStudent = () => { 
    document.getElementById('full-screen-loader').classList.remove('hidden');
    window.currentExamId = null; 
    localStorage.removeItem('tumb_student');
    sessionStorage.clear();
    history.pushState(null, null, location.href.split('?')[0]);
    setTimeout(() => { 
        window.goHome(); 
        document.getElementById('full-screen-loader').classList.add('hidden'); 
    }, 500); 
};

window.logoutInstructor = async () => { 
    document.getElementById('full-screen-loader').classList.remove('hidden');
    currentUser = null; 
    window.currentExamId = null; 
    history.pushState(null, null, location.href.split('?')[0]);
    await signOut(auth); 
    sessionStorage.clear();
    setTimeout(() => { 
        window.goHome(); 
        document.getElementById('full-screen-loader').classList.add('hidden'); 
    }, 500); 
};

window.loadStudentDashboard = async () => {
    const studentStr = localStorage.getItem('tumb_student');
    if(!studentStr) return window.goHome();
    const student = JSON.parse(studentStr);
    
    hideAll(); document.getElementById('student-portal').classList.remove('hidden');
    document.getElementById('portal-std-name').innerText = student.name;
    document.getElementById('portal-std-gen').innerText = student.gen;
    
    document.getElementById('nav-actions').classList.remove('hidden');
    document.getElementById('nav-ingresar').classList.remove('hidden');
    document.getElementById('nav-ingresar').innerHTML = `<i class="fi fi-ss-sign-out-alt"></i> Cerrar Sesión`;
    document.getElementById('nav-ingresar').onclick = window.logoutStudent;
    
    document.getElementById('pending-exams-list').innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-secondary);"><i class="fi fi-ss-spinner" style="animation: spin 1s linear infinite; font-size: 2rem; display:inline-block; margin-bottom:10px;"></i><br>Buscando actividades...</div>`;
    document.getElementById('history-exams-list').innerHTML = `<tr><td colspan='3' style='text-align:center; padding: 30px; color: var(--text-secondary);'><i class="fi fi-ss-spinner" style="animation: spin 1s linear infinite; font-size: 2rem; display:inline-block; margin-bottom:10px;"></i><br>Cargando historial...</td></tr>`;
    
    try {
        const subQ = query(collection(db, "submissions"), where("student.email", "==", student.email));
        const subSnap = await getDocs(subQ);
        let completedExams = {};
        let historyHTML = "";
        let passedCount = 0;
        let totalAvg = 0;
        let gradedExams = 0;
        
        window.studentSubmissions = {};
        window.inProgressCourses = {}; 

        subSnap.forEach(d => {
            const sub = d.data();
            
            const isSurvey = sub.examInfo?.type === 'survey';
            const isCourse = sub.examInfo?.type === 'course';
            const examName = sub.examInfo?.name || "Evaluación Pasada";

            if (sub.status === "BLOCKED") {
                completedExams[sub.examId] = sub;
                window.studentSubmissions[d.id] = sub;
                historyHTML += `<tr><td>${examName}</td><td><span class="badge badge-blocked" title="${sub.metrics?.detail || 'Infracción'}"><i class="fi fi-ss-ban"></i> ANULADO</span></td><td>--</td></tr>`;
            } else if (sub.status === "IN_PROGRESS") {
                if (isCourse || isSurvey) {
                    window.inProgressCourses[sub.examId] = { docId: d.id, moduleIndex: sub.currentModuleIndex || 0, answers: sub.answers || [] };
                } else {
                    completedExams[sub.examId] = sub;
                    window.studentSubmissions[d.id] = sub;
                    historyHTML += `<tr><td>${examName}</td><td><span class="badge badge-progress" title="Abandono"><i class="fi fi-ss-spinner"></i> EN CURSO</span></td><td>--</td></tr>`;
                }
            } else {
                completedExams[sub.examId] = sub;
                window.studentSubmissions[d.id] = sub;
                if(isSurvey) {
                     historyHTML += `<tr><td>${examName}</td><td><span class="badge" style="background:#E8F5E9; color:#2E7D32; border:1px solid #A5D6A7;"><i class="fi fi-ss-check"></i> ENVIADA</span></td><td>--</td></tr>`;
                } else if (isCourse) {
                     historyHTML += `<tr><td>${examName}</td><td><span class="badge" style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9;"><i class="fi fi-ss-diploma"></i> COMPLETADO</span></td><td><button class="btn-sm" onclick="window.viewCertificate('${sub.examId}', '${d.id}')">Ver Certificado</button></td></tr>`;
                } else if(sub.graded) {
                    historyHTML += `<tr><td>${examName}</td><td><span class="badge badge-pass"><i class="fi fi-ss-check"></i> CALIFICADO</span></td><td><button class="btn-sm" onclick="window.viewStudentFeedback('${d.id}')">Ver Resultados</button></td></tr>`;
                    gradedExams++;
                    totalAvg += sub.percentage || 0;
                    if(sub.passed) passedCount++;
                } else {
                    historyHTML += `<tr><td>${examName}</td><td><span class="badge badge-pending"><i class="fi fi-ss-spinner"></i> EN REVISIÓN</span></td><td>--</td></tr>`;
                }
            }
        });
        
        document.getElementById('history-exams-list').innerHTML = historyHTML || "<tr><td colspan='3' style='text-align:center; padding: 20px; color: var(--text-secondary);'>No hay registros aún.</td></tr>";

        const allExamsQ = query(collection(db, "exams"));
        const allExamsSnap = await getDocs(allExamsQ);
        
        let pendingHTML = "";
        
        if(gradedExams > 0) {
            document.getElementById('std-stats-passed').innerText = passedCount;
            document.getElementById('std-stats-avg').innerText = (totalAvg / gradedExams).toFixed(1) + "%";
        } else {
            document.getElementById('std-stats-passed').innerText = "0";
            document.getElementById('std-stats-avg').innerText = "--";
        }

        const renderPendingItem = (d, isSurvey) => {
            const examId = d.id; const eData = d.data();
            if(!eData.config) return;
            const isExpired = eData.config.expiration && new Date() > new Date(eData.config.expiration);
            const isCourse = eData.config.type === 'course';
            
            let gensStr = eData.config.gen || eData.config.gens_string || "";
            if(!gensStr.includes(student.gen) && !gensStr.includes("GLOBAL")) return;

            if(!completedExams[examId] && !isExpired) {
                let isResuming = window.inProgressCourses && window.inProgressCourses[examId];
                if (isCourse) {
                    let btnText = isResuming ? "Continuar Curso" : "Iniciar Curso";
                    let iconPlay = isResuming ? "fi-ss-refresh" : "fi-ss-play";
                    pendingHTML += `<div class="exam-item pending course">
                        <div><h3 style="margin:0;"><i class="fi fi-ss-e-learning" style="color:var(--primary); margin-right:5px;"></i>${eData.config.name}</h3><p style="margin:5px 0 0 0; color:var(--text-secondary); font-size:0.9rem;">Curso Interactivo</p></div>
                        <button style="width:auto;" onclick="location.href='?examId=${examId}'"><i class="fi ${iconPlay}"></i> ${btnText}</button>
                    </div>`;
                } else {
                    const qToShow = eData.config.questionsToShow || eData.config.totalQuestions || "Todas";
                    const classSurvey = isSurvey ? "survey" : "";
                    const iconPlay = isSurvey ? (isResuming ? "fi-ss-refresh" : "fi-ss-comment-alt") : "fi-ss-play";
                    const btnText = isSurvey ? (isResuming ? "Continuar Encuesta" : "Responder Encuesta") : "Presentar Ahora";
                    const subText = isSurvey ? "Encuesta de Opinión" : `Preguntas Evaluadas: ${qToShow}`;

                    const iconHeader = isSurvey ? '<i class="fi fi-ss-comment-alt" style="color:var(--primary); margin-right:5px;"></i>' : '<i class="fi fi-ss-file-signature" style="color:var(--primary); margin-right:5px;"></i>';

                    pendingHTML += `<div class="exam-item pending ${classSurvey}">
                        <div><h3 style="margin:0;">${iconHeader}${eData.config.name}</h3><p style="margin:5px 0 0 0; color:var(--text-secondary); font-size:0.9rem;">${subText}</p></div>
                        <button style="width:auto;" onclick="location.href='?examId=${examId}'"><i class="fi ${iconPlay}"></i> ${btnText}</button>
                    </div>`;
                }
            }
        };

        allExamsSnap.forEach(d => {
            try {
                const eData = d.data();
                renderPendingItem(d, eData.config?.type === 'survey');
            } catch(innerErr) {
                console.error("Actividad corrupta saltada:", d.id);
            }
        });
        document.getElementById('pending-exams-list').innerHTML = pendingHTML || "<p style='text-align:center; padding: 20px; color: var(--text-secondary);'>No tienes evaluaciones ni encuestas pendientes.</p>";

    } catch(e) { 
        console.error(e);
        document.getElementById('pending-exams-list').innerHTML = "Error al cargar datos. Comuníquese con soporte."; 
        document.getElementById('history-exams-list').innerHTML = "<tr><td colspan='3'>Error al cargar el historial.</td></tr>";
    }
};

window.viewStudentFeedback = (subId) => {
    const sub = window.studentSubmissions[subId];
    
    if (!sub || !sub.graded) {
        return window.CustomDialog.alert("Tu evaluación ha sido recibida con éxito y está siendo procesada. Regresa más tarde.", "En Revisión");
    }

    const percentage = sub.percentage || 0;
    const passed = sub.passed || false;
    const score = sub.score || 0;
    const total = sub.total || 0;

    document.getElementById('student-feedback-score').innerText = `${percentage.toFixed(1)}%`;
    document.getElementById('student-feedback-score').style.color = passed ? 'var(--success)' : 'var(--danger)';
    document.getElementById('student-feedback-status').innerHTML = passed ? `<strong>¡Aprobado!</strong> (${score}/${total} aciertos)` : `<strong>No Aprobado</strong> (${score}/${total} aciertos)`;

    let html = "";
    if (sub.failedTopics && sub.failedTopics.length > 0) {
        html += `<p style="text-align:center; color: var(--text-secondary); margin-bottom: 15px;">Temas sugeridos a repasar:</p>`;
        html += `<div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">`;
        
        const tagColors = ['#E3F2FD', '#FFF3E0', '#E8F5E9', '#FCE4EC', '#F3E5F5', '#E8EAF6', '#FFF8E1'];
        const textColors = ['#1565C0', '#E65100', '#2E7D32', '#C2185B', '#6A1B9A', '#283593', '#F57F17'];

        sub.failedTopics.forEach((topic, idx) => {
            let colorIdx = idx % tagColors.length;
            html += `<span style="background: ${tagColors[colorIdx]}; color: ${textColors[colorIdx]}; padding: 8px 15px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; border: 1px solid ${textColors[colorIdx]}33;">
                        <i class="fi fi-ss-bookmark"></i> ${topic}
                     </span>`;
        });
        html += `</div>`;
    } else {
        html += `<p style="color: var(--success); text-align: center; font-weight: bold; margin-top:20px;">¡Excelente! Has dominado todos los temas evaluados.</p>`;
    }
    
    document.getElementById('student-feedback-questions').innerHTML = html;
    
    hideAll();
    document.getElementById('student-portal').classList.remove('hidden');
    document.getElementById('student-feedback-modal').classList.remove('hidden');
};

window.loginInstructor = async () => {
    window.setLoading('login-btn', true);
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-pwd').value;
    try {
        document.getElementById('full-screen-loader').classList.remove('hidden');
        await signInWithEmailAndPassword(auth, email, pwd);
        document.getElementById('login-email').value = "";
        document.getElementById('login-pwd').value = "";
    } catch(error) {
        document.getElementById('full-screen-loader').classList.add('hidden');
        window.setLoading('login-btn', false, '<i class="fi fi-ss-sign-in-alt"></i> Ingresar');
        window.CustomDialog.alert("Credenciales incorrectas.");
    }
};

window.backToDashboard = async () => {
    window.currentExamId = null; 
    hideAll(); document.getElementById('instructor-dashboard').classList.remove('hidden');
    document.getElementById('nav-ingresar').innerHTML = `<i class="fi fi-ss-sign-out-alt"></i> Cerrar Sesión`;
    document.getElementById('nav-ingresar').onclick = window.logoutInstructor;
    document.getElementById('nav-volver').classList.add('hidden');
    document.getElementById('nav-settings').classList.remove('hidden');

    document.getElementById('exams-list-container').innerHTML = "<p style='text-align:center;'><i class='fi fi-ss-spinner' style='animation: spin 1s linear infinite;'></i> Cargando actividades...</p>";

    const q = query(collection(db, "exams"), where("instructorId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    const container = document.getElementById('exams-list-container');
    container.innerHTML = snapshot.empty ? "<p style='text-align:center;'>No has creado ninguna actividad.</p>" : "";
    
    window.allInstructorActivities = [];
    snapshot.forEach(d => {
        window.allInstructorActivities.push({ id: d.id, data: d.data() });
    });
    
    window.filterActivities();
};

window.filterActivities = () => {
    const container = document.getElementById('exams-list-container');
    const typeFilter = document.getElementById('filter-act-type').value;
    const searchFilter = document.getElementById('filter-act-search').value.toLowerCase().trim();
    
    container.innerHTML = "";
    let count = 0;

    window.allInstructorActivities.forEach(item => {
        const exam = item.data;
        const docId = item.id;
        
        const isSurvey = exam.config.type === 'survey';
        const isCourse = exam.config.type === 'course';
        const actType = isSurvey ? 'survey' : (isCourse ? 'course' : 'exam');

        let gensStr = (exam.config.gens_string || exam.config.gen || "").toLowerCase();
        let nameStr = (exam.config.name || "").toLowerCase();

        if (typeFilter !== 'all' && typeFilter !== actType) return;
        if (searchFilter && !gensStr.includes(searchFilter) && !nameStr.includes(searchFilter)) return;

        count++;

        let expText = "Sin límite de tiempo";
        if(exam.config.expiration) {
            const isExpired = new Date() > new Date(exam.config.expiration);
            const expDate = new Date(exam.config.expiration).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
            expText = isExpired ? `<span style="color:var(--danger);"><i class="fi fi-ss-time-delete"></i> CERRADO (${expDate})</span>` : `<span style="color:var(--warning);"><i class="fi fi-ss-time-fast"></i> Cierra: ${expDate}</span>`;
        }
        
        let iconMain, textMain, actionCall, itemClass;

        if (isSurvey) {
            iconMain = "fi-ss-poll-h"; textMain = "Detalles"; itemClass = "survey";
            actionCall = `window.viewSurveyAnalytics('${docId}', '${exam.config.name}')`;
        } else if (isCourse) {
            iconMain = "fi-ss-users-alt"; textMain = "Detalles"; itemClass = "course";
            actionCall = `window.viewExamGrades('${docId}', '${exam.config.name}')`;
        } else {
            iconMain = "fi-ss-stats"; textMain = "Detalles"; itemClass = "";
            actionCall = `window.viewExamGrades('${docId}', '${exam.config.name}')`;
        }

        const iconHeader = isSurvey ? '<i class="fi fi-ss-comment-alt" style="color:var(--primary); margin-right:5px;"></i>' : (isCourse ? '<i class="fi fi-ss-e-learning" style="color:var(--primary); margin-right:5px;"></i>' : '<i class="fi fi-ss-file-signature" style="color:var(--primary); margin-right:5px;"></i>');

        container.innerHTML += `<div class="exam-item ${itemClass}">
            <div><h3 style="margin:0;">${iconHeader}${exam.config.name}</h3><p style="margin:5px 0 0 0; color:var(--text-secondary); font-size:0.9rem;">Clase(s): ${exam.config.gens_string || exam.config.gen || "GLOBAL"} | ${expText}</p></div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button onclick="${actionCall}" style="width: auto;"><i class="fi ${iconMain}"></i> ${textMain}</button>
                <button onclick="window.promptDeleteExam('${docId}', '${exam.config.name}')" class="btn-danger" style="width: auto; padding: 14px;"><i class="fi fi-ss-trash"></i></button>
            </div>
        </div>`;
    });

    if (count === 0) {
        container.innerHTML = "<p style='text-align:center; color: var(--text-secondary); padding: 20px;'>No se encontraron actividades con estos filtros.</p>";
    }
};

window.showSettingsPanel = async () => {
    hideAll(); document.getElementById('admin-settings').classList.remove('hidden');
    document.getElementById('nav-settings').classList.add('hidden');
    document.getElementById('nav-volver').classList.remove('hidden');
    
    const configSnap = await getDoc(doc(db, "settings", "branding_" + currentUser.uid));
    if(configSnap.exists()) {
        const data = configSnap.data();
        if(data.name) document.getElementById('config-brand-name').value = data.name;
        if(data.color) {
            document.getElementById('config-brand-color').value = data.color;
            document.getElementById('config-brand-hex').value = data.color.toUpperCase();
        }
        if(data.footerColor) {
            document.getElementById('config-footer-color').value = data.footerColor;
            document.getElementById('config-footer-hex').value = data.footerColor.toUpperCase();
        }
        if(data.footerQuote !== undefined) {
            document.getElementById('config-footer-quote').value = data.footerQuote;
        }
        if(data.instructorName) document.getElementById('config-inst-name').value = data.instructorName;
        
        document.getElementById('config-social-fb').value = data.socialFb || '';
        document.getElementById('config-social-ig').value = data.socialIg || '';
        document.getElementById('config-social-wa').value = data.socialWa || '';
        document.getElementById('config-social-web').value = data.socialWeb || '';
    }
};

window.savePlatformSettings = async () => {
    window.setLoading('btn-save-settings', true);
    const name = document.getElementById('config-brand-name').value.trim();
    const color = document.getElementById('config-brand-hex').value;
    const footerColor = document.getElementById('config-footer-hex').value;
    const footerQuote = document.getElementById('config-footer-quote').value.trim();
    const instructorName = document.getElementById('config-inst-name').value.trim();
    
    const socialFb = document.getElementById('config-social-fb').value.trim();
    const socialIg = document.getElementById('config-social-ig').value.trim();
    const socialWa = document.getElementById('config-social-wa').value.trim();
    const socialWeb = document.getElementById('config-social-web').value.trim();

    const logoFile = document.getElementById('config-brand-logo').files[0];
    const avatarFile = document.getElementById('config-inst-avatar').files[0];
    
    let payload = { name, color, footerColor, footerQuote, instructorName, socialFb, socialIg, socialWa, socialWeb };

    try {
        if (logoFile) payload.logoUrl = await readFileAsDataURL(logoFile);
        if (avatarFile) payload.instructorAvatarUrl = await readFileAsDataURL(avatarFile);

        let currentBranding = JSON.parse(localStorage.getItem('eems_branding') || '{}');
        let mergedBranding = { ...currentBranding, ...payload };
        localStorage.setItem('eems_branding', JSON.stringify(mergedBranding));
        applyBrandingUI(mergedBranding);

        await setDoc(doc(db, "settings", "branding_" + currentUser.uid), payload, { merge: true });
        
        window.setLoading('btn-save-settings', false, '<i class="fi fi-ss-disk"></i> Guardar Cambios');
        window.CustomDialog.alert("Configuración guardada y aplicada correctamente.", "Éxito");
    } catch(e) {
        window.setLoading('btn-save-settings', false, '<i class="fi fi-ss-disk"></i> Guardar Cambios');
        window.CustomDialog.alert("Hubo un error al procesar las imágenes.", "Error");
    }
};

window.uploadType = 'exam';
window.showUploadPanel = (type) => { 
    hideAll(); 
    window.uploadType = type;
    document.getElementById('instructor-upload').classList.remove('hidden'); 
    document.getElementById('nav-settings').classList.add('hidden');
    document.getElementById('nav-volver').classList.remove('hidden');
    
    document.getElementById('exam-name').value = "";
    document.getElementById('exam-gen').value = "";
    document.getElementById('exam-q-to-show').value = "";
    document.getElementById('exam-min-score').value = "80";
    document.getElementById('exam-duration').value = "60";
    document.getElementById('exam-expiration').value = "";
    document.getElementById('json-file').value = "";

    const titleEl = document.getElementById('upload-panel-title');
    const specificFields = document.getElementById('exam-specific-fields');
    const numFields = document.getElementById('exam-numeric-fields');
    const genContainer = document.getElementById('container-exam-gen');
    const genLabel = document.getElementById('label-exam-gen');
    const genHint = document.getElementById('hint-exam-gen');

    if(type === 'survey') {
        titleEl.innerHTML = '<i class="fi fi-ss-comment-alt" style="color:var(--primary);"></i> Configurar Nueva Encuesta';
        specificFields.classList.add('hidden');
        numFields.classList.add('hidden');
        genContainer.classList.remove('hidden'); 
        genLabel.innerHTML = '<i class="fi fi-ss-users-alt"></i> Código de Clase (Generación)';
        document.getElementById('exam-gen').placeholder = "Ej. G30, G31, GLOBAL";
        genHint.innerText = "Escribe GLOBAL para todos los alumnos, o especifica una generación.";
    } else if (type === 'course') {
        titleEl.innerHTML = '<i class="fi fi-ss-e-learning" style="color:var(--primary);"></i> Configurar Nuevo Curso';
        specificFields.classList.add('hidden');
        numFields.classList.add('hidden');
        genContainer.classList.remove('hidden');
        genLabel.innerHTML = '<i class="fi fi-ss-users-alt"></i> Generaciones Destino';
        document.getElementById('exam-gen').placeholder = "Ej. G30, G31, GLOBAL";
        genHint.innerText = "Separa por comas las generaciones que podrán ver este curso, o usa GLOBAL.";
    } else {
        titleEl.innerHTML = '<i class="fi fi-ss-file-edit"></i> Configurar Nuevo Examen';
        specificFields.classList.remove('hidden');
        numFields.classList.remove('hidden');
        genContainer.classList.remove('hidden'); 
        genLabel.innerHTML = '<i class="fi fi-ss-key"></i> Código de Clase (Generación)';
        document.getElementById('exam-gen').placeholder = "Ej. G30-TEXCOCO";
        genHint.innerText = "Los alumnos necesitarán este código exacto para ver y entrar al examen.";
    }
};

window.promptDeleteExam = (examId, examName) => {
    examToDelete = { id: examId, name: examName };
    document.getElementById('delete-exam-name-text').innerText = examName;
    document.getElementById('delete-confirm-input').value = "";
    document.getElementById('delete-modal').classList.remove('hidden');
};

window.closeDeleteModal = () => {
    examToDelete = null;
    document.getElementById('delete-modal').classList.add('hidden');
};

window.executeDeleteExam = async () => {
    const input = document.getElementById('delete-confirm-input').value.trim().toLowerCase();
    if (input !== "eliminar") {
        return window.CustomDialog.alert("Debes escribir la palabra 'eliminar' exactamente para continuar.");
    }

    window.setLoading('btn-confirm-delete', true);

    try {
        const examId = examToDelete.id;
        const examName = examToDelete.name;
        
        const examSnap = await getDoc(doc(db, "exams", examId));
        const examType = examSnap.exists() ? examSnap.data().config.type : 'exam';
        const isSurvey = examType === 'survey';
        const isCourse = examType === 'course';

        const keySnap = await getDoc(doc(db, "exam_keys", examId));
        let correctAnswers = [];
        if (keySnap.exists()) correctAnswers = keySnap.data().answers || [];

        const qSubs = query(collection(db, "submissions"), where("examId", "==", examId));
        const subQuery = await getDocs(qSubs);
        
        let gradesForExport = [];
        let submissionsToDelete = [];

        subQuery.forEach((d) => {
            submissionsToDelete.push(d.id);
            const sub = d.data(); 
            
            if(!isSurvey && !isCourse) {
                gradesForExport.push({
                    name: sub.student.name, email: sub.student.email,
                    status: sub.status, infractions: sub.metrics?.infractions || 0,
                    detail: sub.metrics?.detail || "",
                    score: sub.score || 0, total: sub.total || sub.examInfo?.questionsToShow || 0, percentage: sub.percentage || 0, passed: sub.passed || false,
                    mins: Math.floor((sub.metrics?.timeUsedSeconds || 0) / 60)
                });
            } else if (isCourse) {
                gradesForExport.push({
                    name: sub.student.name, email: sub.student.email,
                    status: sub.status,
                    mins: Math.floor((sub.metrics?.timeUsedSeconds || 0) / 60)
                });
            }
        });

        if ((!isSurvey) && gradesForExport.length > 0) {
            let csvContent = "data:text/csv;charset=utf-8,";
            if(isCourse) {
                csvContent += "Alumno,Correo,Tiempo(m),Estatus\n";
                gradesForExport.forEach(row => {
                    csvContent += `"${row.name}","${row.email}",${row.mins},${row.status}\n`;
                });
            } else {
                csvContent += "Alumno,Correo,Tiempo(m),Infracciones,Aciertos,Calificación,Estatus,Detalle\n";
                gradesForExport.forEach(function(row) {
                    let status = row.passed ? 'APROBADO' : 'REPROBADO';
                    if(row.status === "BLOCKED") status = "ANULADO";
                    if(row.status === "IN_PROGRESS") status = "EN CURSO/ABANDONADO";
                    let csvRow = `"${row.name}","${row.email}",${row.mins},${row.infractions},"${row.score}/${row.total}",${parseFloat(row.percentage).toFixed(1)}%,${status},"${row.detail}"`;
                    csvContent += csvRow + "\n";
                });
            }
            var encodedUri = encodeURI(csvContent);
            var link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Respaldo_${examName.replace(/\s+/g, '_')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        for (const subId of submissionsToDelete) {
            await deleteDoc(doc(db, "submissions", subId));
        }

        await deleteDoc(doc(db, "exam_keys", examId));
        await deleteDoc(doc(db, "exams", examId));

        window.setLoading('btn-confirm-delete', false, '<i class="fi fi-ss-trash"></i> Borrar');
        window.closeDeleteModal();
        window.CustomDialog.alert("Registro eliminado" + (!isSurvey ? " y respaldo descargado." : "."), "Éxito");
        
        window.backToDashboard();

    } catch (error) {
        window.setLoading('btn-confirm-delete', false, '<i class="fi fi-ss-trash"></i> Borrar');
        window.CustomDialog.alert("Error al eliminar.", "Error");
    }
};

window.copyLink = (id) => {
    const link = document.getElementById(id).href;
    navigator.clipboard.writeText(link).then(() => window.CustomDialog.alert("¡Enlace copiado al portapapeles!", "Éxito"));
};

window.handleInstructorLinkClick = async (event) => {
    event.preventDefault();
    const url = event.currentTarget.href;
    const isConfirmed = await window.CustomDialog.confirm("Estás a punto de ingresar como alumno. Por seguridad, se cerrará tu sesión de instructor. ¿Continuar?", "Aviso de Seguridad");
    if(isConfirmed) {
        await signOut(auth);
        const branding = localStorage.getItem('eems_branding');
        localStorage.clear();
        if(branding) localStorage.setItem('eems_branding', branding);
        sessionStorage.clear();
        window.location.href = url;
    }
};

window.sortGrades = (column) => {
    if (currentSort.column === column) { currentSort.asc = !currentSort.asc; } 
    else { currentSort.column = column; currentSort.asc = true; }
    let sorted = [...window.gradesList];
    sorted.sort((a, b) => {
        let valA, valB;
        if (column === 'name') { valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); }
        if (column === 'score') { valA = a.percentage; valB = b.percentage; }
        if (column === 'status') { valA = a.passed ? 1 : (a.status === "BLOCKED" ? -1 : 0); valB = b.passed ? 1 : (b.status === "BLOCKED" ? -1 : 0); }
        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });
    renderGradesTable(sorted);
};

window.exportToCSV = function() {
    if(!window.gradesList || window.gradesList.length === 0) return window.CustomDialog.alert("No hay datos para exportar.");
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if(window.gradesList[0].score === 'Curso') {
        csvContent += "Alumno,Correo,Tiempo(m),Estatus\n";
        window.gradesList.forEach(function(row) {
            let csvRow = `"${row.name}","${row.email}",${row.mins},${row.status}`;
            csvContent += csvRow + "\n";
        });
    } else {
        csvContent += "Alumno,Correo,Tiempo(m),Infracciones,Aciertos,Calificación,Estatus,Detalle\n";
        window.gradesList.forEach(function(row) {
            let status = row.passed ? 'APROBADO' : 'REPROBADO';
            if(row.status === "BLOCKED") status = "ANULADO";
            if(row.status === "IN_PROGRESS") status = "EN CURSO/ABANDONADO";
            let csvRow = `"${row.name}","${row.email}",${row.mins},${row.infractions},"${row.score}/${row.total}",${parseFloat(row.percentage).toFixed(1)}%,${status},"${row.detail}"`;
            csvContent += csvRow + "\n";
        });
    }
    
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Resultados_EEMS.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

function renderGradesTable(dataList) {
    const tbody = document.getElementById('grades-body');
    tbody.innerHTML = "";
    
    if (dataList.length === 0) {
        tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>No hay entregas.</td></tr>";
        return;
    }

    dataList.forEach((sub, i) => {
        let rowNumber = i + 1;
        
        if (sub.score === 'Curso') {
            let statTxt = sub.status === "IN_PROGRESS" ? "EN CURSO" : "COMPLETADO";
            let badgeCls = sub.status === "IN_PROGRESS" ? "badge-progress" : "badge-pass";
            let iconCls = sub.status === "IN_PROGRESS" ? "fi-ss-spinner" : "fi-ss-check";
            tbody.innerHTML += `<tr>
                <td style="text-align: center;"><b>${rowNumber}</b></td>
                <td>${sub.name}<br><small>${sub.email}</small></td>
                <td>${sub.mins}m</td>
                <td>--</td>
                <td style="font-weight:bold;">--</td>
                <td><span class="badge ${badgeCls}"><i class="fi ${iconCls}"></i> ${statTxt}</span></td>
                <td><div class="table-actions">
                    <button class="btn-warning btn-sm" title="Reiniciar" onclick="window.resetAttempt('${sub.docId}')"><i class="fi fi-ss-refresh"></i></button>
                </div></td>
            </tr>`;
            return;
        }

        if (sub.status === "IN_PROGRESS") {
            tbody.innerHTML += `<tr>
                <td style="text-align: center;"><b>${rowNumber}</b></td>
                <td>${sub.name}<br><small>${sub.email}</small></td>
                <td style="color:var(--warning); font-weight:bold;"><i class="fi fi-ss-time-quarter-to"></i> EN CURSO</td>
                <td>--</td><td>--</td>
                <td title="Motivo: Posible abandono o cierre de ventana"><span class="badge badge-progress"><i class="fi fi-ss-spinner"></i> EN CURSO</span></td>
                <td><div class="table-actions">
                    <button class="btn-warning btn-sm" title="Reiniciar" onclick="window.resetAttempt('${sub.docId}')"><i class="fi fi-ss-refresh"></i></button>
                </div></td>
            </tr>`;
            return;
        }

        if (sub.status === "BLOCKED") {
            let motivo = sub.detail || 'Múltiples Infracciones';
            tbody.innerHTML += `<tr>
                <td style="text-align: center;"><b>${rowNumber}</b></td>
                <td>${sub.name}<br><small>${sub.email}</small></td>
                <td style="color:red; font-weight:bold;"><i class="fi fi-ss-triangle-warning"></i> Inf: ${sub.infractions}</td>
                <td>--</td><td>--</td>
                <td title="Motivo: ${motivo}"><span class="badge badge-blocked"><i class="fi fi-ss-ban"></i> ANULADO</span></td>
                <td><div class="table-actions">
                    <button class="btn-warning btn-sm" title="Reiniciar" onclick="window.resetAttempt('${sub.docId}')"><i class="fi fi-ss-refresh"></i></button>
                </div></td>
            </tr>`;
            return;
        }
        
        if (sub.status === "COMPLETED" && !sub.graded) {
            tbody.innerHTML += `<tr>
                <td style="text-align: center;"><b>${rowNumber}</b></td>
                <td>${sub.name}<br><small>${sub.email}</small></td>
                <td>${sub.mins}m / ${sub.infractions} inf.</td>
                <td>--</td>
                <td style="font-weight:bold; color:var(--text-secondary);">Pendiente</td>
                <td><span class="badge badge-pending"><i class="fi fi-ss-time-past"></i> POR CALIFICAR</span></td>
                <td><div class="table-actions">
                    <button style="background-color: var(--primary);" class="btn-sm" title="Calificar Examen" onclick="window.gradeSubmission('${sub.docId}')"><i class="fi fi-ss-check-clipboard"></i> Calificar</button>
                    <button class="btn-warning btn-sm" title="Reiniciar" onclick="window.resetAttempt('${sub.docId}')"><i class="fi fi-ss-refresh"></i></button>
                </div></td>
            </tr>`;
            return;
        }

        let badgeClass = sub.passed ? 'badge-pass' : 'badge-fail';
        let estatusTxt = sub.passed ? 'APROBADO' : 'REPROBADO';
        let iconEstatus = sub.passed ? 'fi-ss-check-circle' : 'fi-ss-cross-circle';
        let formattedPercentage = sub.percentage !== undefined ? parseFloat(sub.percentage).toFixed(1) + '%' : 'Calculando...';

        tbody.innerHTML += `<tr>
            <td style="text-align: center;"><b>${rowNumber}</b></td>
            <td>${sub.name}<br><small>${sub.email}</small></td>
            <td>${sub.mins}m / ${sub.infractions} inf.</td>
            <td>${sub.score} / ${sub.total}</td>
            <td style="font-weight:bold;">${formattedPercentage}</td>
            <td><span class="badge ${badgeClass}"><i class="fi ${iconEstatus}"></i> ${estatusTxt}</span></td>
            <td><div class="table-actions">
                <button style="background-color: var(--text-secondary);" class="btn-sm" title="Ver Detalles" onclick="window.showSubmissionDetails('${sub.docId}')"><i class="fi fi-ss-eye"></i> Detalles</button>
                <button class="btn-warning btn-sm" title="Reiniciar" onclick="window.resetAttempt('${sub.docId}')"><i class="fi fi-ss-refresh"></i></button>
            </div></td>
        </tr>`;
    });
}

window.viewSurveyAnalytics = async (examId, examName = null) => {
    window.currentExamId = examId;
    hideAll(); 
    document.getElementById('instructor-survey-analytics').classList.remove('hidden');
    document.getElementById('nav-settings').classList.add('hidden');
    document.getElementById('nav-volver').classList.remove('hidden');
    document.querySelector('.container').classList.add('expanded');
    
    if(examName) document.getElementById('analytics-title').innerHTML = `<i class="fi fi-ss-comment-alt" style="color:var(--primary);"></i> Analíticas: ` + examName;
    
    const shareUrl = window.location.href.split('?')[0] + '?examId=' + examId;
    document.getElementById('survey-share-link').href = shareUrl;
    document.getElementById('survey-share-link').innerText = shareUrl;

    const container = document.getElementById('analytics-container');
    container.innerHTML = "<p style='text-align:center;'><i class='fi fi-ss-spinner' style='animation: spin 1s linear infinite;'></i> Tabulando datos...</p>";
    
    try {
        const examSnap = await getDoc(doc(db, "exams", examId));
        const questions = examSnap.data().questions || [];

        const subQuery = await getDocs(query(collection(db, "submissions"), where("examId", "==", examId)));
        let submissions = [];
        subQuery.forEach(d => {
            if(d.data().status === "COMPLETED") submissions.push(d.data());
        });

        if(submissions.length === 0) {
            return container.innerHTML = "<p style='text-align:center; color:var(--text-secondary); padding: 40px;'>No hay respuestas registradas aún.</p>";
        }

        let html = `<p style="color:var(--primary-dark); font-weight:bold; margin-bottom:20px;">Total de participantes: ${submissions.length}</p>`;
        
        questions.forEach((q, idx) => {
            html += `<div class="question-block" style="border-left-color: var(--primary); background-color: var(--surface); box-shadow: 0 2px 8px rgba(0,0,0,0.03);"><h3 style="color:var(--primary);">${idx+1}. ${q.q}</h3>`;
            
            let validAnswers = submissions.map(s => {
                let ansObj = s.answers.find(a => a.questionIndex === idx);
                return ansObj ? ansObj.answer : null;
            }).filter(a => a !== null && a !== undefined && a !== "");

            if (q.type === 'open') {
                html += `<div class="survey-text-box">`;
                if(validAnswers.length === 0) html += `<em>Sin comentarios.</em>`;
                validAnswers.forEach(a => html += `<p style="margin:5px 0; border-bottom:1px dashed #EEE; padding-bottom:5px;">" ${a} "</p>`);
                html += `</div>`;
            } else if (q.type === 'scale') {
                let sum = validAnswers.reduce((a,b)=>a+parseInt(b), 0);
                let avg = validAnswers.length > 0 ? (sum / validAnswers.length).toFixed(1) : 0;
                html += `<div style="background:white; padding:15px; border-radius:8px; border:1px solid #E0E0E0; text-align:center;">
                            <p style="margin:0; color:var(--text-secondary);">Promedio</p>
                            <span style="font-size:2.5rem; font-weight:bold; color:var(--primary);">${avg}</span> <span style="color:var(--text-secondary);">/ 10</span>
                         </div>`;
            } else {
                html += `<div>`;
                q.opts.forEach((opt, oIdx) => {
                    let count = validAnswers.filter(a => parseInt(a) === oIdx).length;
                    let pct = validAnswers.length > 0 ? Math.round((count/validAnswers.length)*100) : 0;
                    html += `
                        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:0.9rem;">
                            <span>${opt}</span> <strong>${pct}% (${count})</strong>
                        </div>
                        <div class="survey-bar-bg"><div class="survey-bar-fill" style="width:${pct}%; background-color:var(--primary);"></div></div>
                    `;
                });
                html += `</div>`;
            }
            html += `</div>`;
        });
        container.innerHTML = html;
    } catch (e) { container.innerHTML = "<p>Error al cargar analíticas.</p>"; }
};

window.gradeSubmission = async (docId) => {
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-text').innerText = "Calificando y asegurando datos...";
    
    try {
        const subRef = doc(db, "submissions", docId);
        const subSnap = await getDoc(subRef);
        if(!subSnap.exists()) return;
        const sub = subSnap.data();

        const keySnap = await getDoc(doc(db, "exam_keys", window.currentExamId));
        const examSnap = await getDoc(doc(db, "exams", window.currentExamId));
        
        const correctAnswers = keySnap.data().answers;
        const originalQuestions = examSnap.data().questions || [];

        const evalTotal = sub.examInfo.questionsToShow || correctAnswers.length;
        let score = 0; 
        let failedTopics = [];

        if (sub.answers) {
            sub.answers.forEach(a => { 
                if(a.selectedOption === correctAnswers[a.questionIndex]) {
                    score++; 
                } else {
                    let qObj = originalQuestions[a.questionIndex];
                    if (qObj) {
                        failedTopics.push(qObj.topic || "Repasar conceptos generales");
                    }
                }
            });
        }
        
        failedTopics = [...new Set(failedTopics)];
        let percentage = (score / evalTotal) * 100;
        let passed = percentage >= sub.examInfo.passingThreshold;

        await setDoc(subRef, {
            score: score,
            total: evalTotal,
            percentage: percentage,
            passed: passed,
            failedTopics: failedTopics,
            graded: true
        }, { merge: true });

        window.loadGrades(window.currentExamId);
    } catch(e) {
        window.CustomDialog.alert("Error al calificar.");
        document.getElementById('loading-screen').classList.add('hidden');
    }
};

window.gradeAllPendings = async () => {
    const pendings = window.gradesList.filter(g => g.status === 'COMPLETED' && !g.graded && g.score !== 'Curso');
    if(pendings.length === 0) return window.CustomDialog.alert("No hay exámenes pendientes de calificar.", "Atención");
    
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-text').innerText = "Calificando todos los pendientes...";

    try {
        const keySnap = await getDoc(doc(db, "exam_keys", window.currentExamId));
        const examSnap = await getDoc(doc(db, "exams", window.currentExamId));
        const correctAnswers = keySnap.data().answers;
        const originalQuestions = examSnap.data().questions || [];

        for(let p of pendings) {
            const subRef = doc(db, "submissions", p.docId);
            const subSnap = await getDoc(subRef);
            const sub = subSnap.data();

            const evalTotal = sub.examInfo.questionsToShow || correctAnswers.length;
            let score = 0; 
            let failedTopics = [];

            if (sub.answers) {
                sub.answers.forEach(a => { 
                    if(a.selectedOption === correctAnswers[a.questionIndex]) {
                        score++; 
                    } else {
                        let qObj = originalQuestions[a.questionIndex];
                        if (qObj) {
                            failedTopics.push(qObj.topic || "Repasar conceptos generales");
                        }
                    }
                });
            }
            
            failedTopics = [...new Set(failedTopics)];
            let percentage = (score / evalTotal) * 100;
            let passed = percentage >= sub.examInfo.passingThreshold;

            await setDoc(subRef, {
                score: score,
                total: evalTotal,
                percentage: percentage,
                passed: passed,
                failedTopics: failedTopics,
                graded: true
            }, { merge: true });
        }
        window.loadGrades(window.currentExamId);
    } catch(e) {
        window.CustomDialog.alert("Error al calificar masivamente.");
        document.getElementById('loading-screen').classList.add('hidden');
    }
};

window.showSubmissionDetails = async (docId) => {
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-text').innerText = "Cargando detalles de evaluación...";

    try {
        const subSnap = await getDoc(doc(db, "submissions", docId));
        const sub = subSnap.data();

        if (!sub || !sub.graded) {
            document.getElementById('loading-screen').classList.add('hidden');
            return window.CustomDialog.alert("Este examen aún no ha sido calificado.");
        }

        const keySnap = await getDoc(doc(db, "exam_keys", window.currentExamId));
        const examSnap = await getDoc(doc(db, "exams", window.currentExamId));
        
        const correctAnswers = keySnap.data().answers;
        const originalQuestions = examSnap.data().questions || [];

        document.getElementById('details-student-name').innerText = sub.student.name;
        document.getElementById('details-score').innerText = `Calificación: ${sub.percentage.toFixed(1)}% (${sub.score}/${sub.total}) - Tiempo: ${Math.floor((sub.metrics?.timeUsedSeconds || 0)/60)}m`;

        let failedQuestions = [];
        if (sub.answers) {
            sub.answers.forEach(a => { 
                if(a.selectedOption !== correctAnswers[a.questionIndex]) {
                    let qObj = originalQuestions[a.questionIndex];
                    if (qObj) {
                        failedQuestions.push({
                            q: qObj.q,
                            selected: (a.selectedOption !== null && a.selectedOption !== undefined) ? qObj.opts[a.selectedOption] : "No respondida",
                            correct: (correctAnswers[a.questionIndex] !== null && correctAnswers[a.questionIndex] !== undefined) ? qObj.opts[correctAnswers[a.questionIndex]] : "N/A"
                        });
                    }
                }
            });
        }

        let html = "";
        if (failedQuestions.length > 0) {
            html += `<h4 style="border-bottom: 2px solid #E0E0E0; padding-bottom: 5px; margin-top: 20px;">Respuestas Incorrectas o Faltantes:</h4>`;
            failedQuestions.forEach((fq, idx) => {
                html += `
                <div style="background: #FAFAFA; border-left: 4px solid var(--danger); padding: 10px; margin-bottom: 10px; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 0.95rem;">${idx+1}. ${fq.q}</p>
                    <p style="margin: 0; font-size: 0.85rem; color: var(--danger);"><strong>Respuesta del alumno:</strong> ${fq.selected}</p>
                    <p style="margin: 0; font-size: 0.85rem; color: var(--success);"><strong>Correcta:</strong> ${fq.correct}</p>
                </div>`;
            });
        } else {
            html += `<p style="color: var(--success); text-align: center; font-weight: bold; margin-top:20px;">¡Examen perfecto! No hay respuestas incorrectas registradas.</p>`;
        }
        
        document.getElementById('details-questions').innerHTML = html;
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('details-modal').classList.remove('hidden');

    } catch (e) {
        document.getElementById('loading-screen').classList.add('hidden');
        window.CustomDialog.alert("Error al obtener los detalles.");
    }
};

window.viewExamGrades = (examId, examName) => {
    window.currentExamId = examId;
    hideAll(); document.getElementById('instructor-grades').classList.remove('hidden');
    document.getElementById('nav-settings').classList.add('hidden');
    document.getElementById('nav-volver').classList.remove('hidden');
    document.querySelector('.container').classList.add('expanded');
    document.getElementById('grades-exam-title').innerHTML = `<i class="fi fi-ss-stats"></i> Resultados: ` + examName;
    const shareUrl = window.location.href.split('?')[0] + '?examId=' + examId;
    document.getElementById('exam-share-link').href = shareUrl;
    document.getElementById('exam-share-link').innerText = shareUrl;
    window.loadGrades(examId);
};

window.loadGrades = async (examId) => {
    hideAll();
    document.getElementById('instructor-grades').classList.remove('hidden');
    document.querySelector('.container').classList.add('expanded');
    const tbody = document.getElementById('grades-body');
    tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'><i class='fi fi-ss-spinner' style='animation: spin 1s linear infinite;'></i> Cargando datos...</td></tr>";
    
    try {
        const keySnap = await getDoc(doc(db, "exam_keys", examId));
        const examSnap = await getDoc(doc(db, "exams", examId));
        
        const isCourse = examSnap.exists() && examSnap.data().config?.type === 'course';
        const correctAnswers = keySnap.exists() ? keySnap.data().answers : [];
        const originalQuestions = examSnap.exists() ? (examSnap.data().questions || []) : [];

        const q = query(collection(db, "submissions"), where("examId", "==", examId));
        const subQuery = await getDocs(q);
        
        window.gradesList = []; 
        const updatePromises = [];
        
        for (const d of subQuery.docs) {
            let sub = d.data(); 
            
            if(isCourse) {
                window.gradesList.push({
                    docId: d.id, name: sub.student.name, email: sub.student.email,
                    status: sub.status, infractions: 0, detail: "",
                    score: 'Curso', total: 0, percentage: 0, passed: true, graded: true,
                    mins: Math.floor((sub.metrics?.timeUsedSeconds || 0) / 60)
                });
                continue;
            }

            if (sub.status === "COMPLETED" && !sub.graded) {
                const evalTotal = sub.examInfo?.questionsToShow || correctAnswers.length || 1;
                let score = 0; 
                let failedTopics = [];

                if (sub.answers) {
                    sub.answers.forEach(a => { 
                        if(a.selectedOption === correctAnswers[a.questionIndex]) {
                            score++; 
                        } else {
                            let qObj = originalQuestions[a.questionIndex];
                            if (qObj) {
                                failedTopics.push(qObj.topic || "Repasar conceptos generales");
                            }
                        }
                    });
                }
                
                failedTopics = [...new Set(failedTopics)];
                let percentage = (score / evalTotal) * 100;
                let passed = percentage >= (sub.examInfo?.passingThreshold || 80);

                sub.score = score;
                sub.total = evalTotal;
                sub.percentage = percentage;
                sub.passed = passed;
                sub.graded = true;
                sub.failedTopics = failedTopics;

                updatePromises.push(setDoc(doc(db, "submissions", d.id), {
                    score: score,
                    total: evalTotal,
                    percentage: percentage,
                    passed: passed,
                    failedTopics: failedTopics,
                    graded: true
                }, { merge: true }));
            }

            window.gradesList.push({
                docId: d.id, name: sub.student.name, email: sub.student.email,
                status: sub.status, infractions: sub.metrics?.infractions || 0,
                detail: sub.metrics?.detail || "",
                score: sub.graded ? sub.score : '?', 
                total: sub.graded ? sub.total : (sub.examInfo?.questionsToShow || 0), 
                percentage: sub.graded ? sub.percentage : 0, 
                passed: sub.passed || false,
                graded: sub.graded || false,
                mins: Math.floor((sub.metrics?.timeUsedSeconds || 0) / 60)
            });
        }

        renderGradesTable(window.gradesList);

        if(updatePromises.length > 0) {
            Promise.all(updatePromises).catch(err => console.log("Auto-calificación error:", err));
        }

    } catch (e) { tbody.innerHTML = "<tr><td colspan='7'>Error al cargar.</td></tr>"; }
};

window.resetAttempt = async (docId) => {
    if(await window.CustomDialog.confirm("¿Seguro de eliminar el intento?")) {
        await deleteDoc(doc(db, "submissions", docId));
        window.loadGrades(window.currentExamId); 
    }
};

async function loadExamView() {
    if (isExamActive) return; 
    
    try {
        const docSnap = await getDoc(doc(db, "exams", window.currentExamId));
        if (isExamActive) return; 

        if (!docSnap.exists()) {
            document.getElementById('full-screen-loader').classList.add('hidden');
            document.getElementById('loading-screen').classList.remove('hidden');
            return document.getElementById('loading-text').innerText = "Actividad no encontrada";
        }
        
        const data = docSnap.data();
        examConfig = data.config; 
        const isSurvey = examConfig.type === 'survey';
        const isCourse = examConfig.type === 'course';

        if(isCourse) {
            window.currentCourseModules = data.modules || [];
            window.currentModuleIndex = 0;
        } else {
            originalPool = data.questions.map((q, i) => ({ ...q, originalQIndex: i })); 
        }
        
        await loadBranding(data.instructorId);
        if (isExamActive) return; 

        if (examConfig.expiration && new Date() > new Date(examConfig.expiration)) {
            hideAll(); document.getElementById('blocked-view').classList.remove('hidden');
            document.getElementById('blocked-title').innerText = "ACTIVIDAD CERRADA";
            document.getElementById('blocked-msg').innerText = "La fecha límite ha expirado.";
            return;
        }

        if(isCourse) {
            document.getElementById('display-exam-name').innerHTML = `<i class="fi fi-ss-e-learning"></i> ` + examConfig.name;
        } else {
            document.getElementById('display-exam-name').innerHTML = isSurvey ? `<i class="fi fi-ss-comment-alt"></i> ` + examConfig.name : `<i class="fi fi-ss-file-signature"></i> ` + examConfig.name;
        }
        
        let gensStr = examConfig.gens_string || examConfig.gen || "GLOBAL";
        document.getElementById('display-exam-gen').innerText = isSurvey ? "Encuesta: " + gensStr : "Clase(s): " + gensStr;
        
        const rulesList = document.getElementById('exam-rules-list');
        if (isSurvey) {
            rulesList.innerHTML = `
                <li style="color:var(--text-main);"><strong><i class="fi fi-ss-info"></i> Esta es una encuesta de opinión abierta.</strong></li>
                <li style="color:var(--text-main);">No hay límite de tiempo.</li>
                <li style="color:var(--text-main);">Tus respuestas nos ayudan a mejorar. ¡Gracias por tu honestidad!</li>
            `;
            rulesList.style.background = "#FFFDE7";
            rulesList.style.border = "1px solid #FFF59D";
            rulesList.style.color = "var(--text-main)";
        } else if (isCourse) {
            rulesList.innerHTML = `
                <li style="color:var(--text-main);"><strong><i class="fi fi-ss-info"></i> Curso de Formación Asíncrona.</strong></li>
                <li style="color:var(--text-main);">Consta de videos y material de lectura descargable.</li>
                <li style="color:var(--text-main);">Podrás obtener tu constancia al finalizar todos los módulos.</li>
            `;
            rulesList.style.background = "#E3F2FD";
            rulesList.style.border = "1px solid #90CAF9";
            rulesList.style.color = "var(--primary-dark)";
        } else if (examConfig.securityLevel === 'medium') {
            rulesList.innerHTML = `
                <li><strong>Las preguntas y opciones aparecerán en orden aleatorio.</strong></li>
                <li>Tiempo límite: <span id="display-duration">${examConfig.duration || 60}</span> minutos.</li>
                <li><strong>Prohibido copiar o capturar pantalla (Anulación inmediata).</strong></li>
                <li><strong>Límite de 3 advertencias</strong> al perder enfoque.</li>
                <li><strong>Control de inactividad:</strong> No puedes soltar el ratón o teclado por más de 15 segundos continuos.</li>
            `;
            rulesList.style.background = "var(--danger-light)";
            rulesList.style.border = "none";
            rulesList.style.color = "var(--danger)";
        } else {
            rulesList.innerHTML = `
                <li><strong>Las preguntas y opciones aparecerán en orden aleatorio.</strong></li>
                <li>Tiempo límite: <span id="display-duration">${examConfig.duration || 60}</span> minutos.</li>
                <li><strong>Prohibido copiar o capturar pantalla (Anulación inmediata).</strong></li>
                <li><strong>Límite de 5 advertencias</strong> al perder enfoque.</li>
            `;
            rulesList.style.background = "var(--danger-light)";
            rulesList.style.border = "none";
            rulesList.style.color = "var(--danger)";
        }

        hideAll(); 
        if (isExamActive) return; 

        document.getElementById('exam-view').classList.remove('hidden');
        
        const intro = document.getElementById('exam-intro');
        if(intro) {
            intro.classList.remove('hidden');
            intro.style.display = '';
        }

        const studentStr = localStorage.getItem('tumb_student');
        const manualDataContainer = document.getElementById('manual-student-data');
        const wrapperGen = document.getElementById('wrapper-manual-gen');
        
        if (studentStr) {
            const std = JSON.parse(studentStr);
            
            let isAllowed = true;
            if (!gensStr.includes(std.gen) && !gensStr.includes("GLOBAL")) {
                isAllowed = false;
            }

            if (!isAllowed) {
                document.getElementById('full-screen-loader').classList.add('hidden');
                hideAll(); 
                document.getElementById('blocked-view').classList.remove('hidden');
                document.getElementById('blocked-title').innerText = "ACCESO DENEGADO";
                document.getElementById('blocked-msg').innerText = "Esta actividad pertenece a un Código de Clase distinto al tuyo.";
                return;
            }

            document.getElementById('manual-name').value = std.name;
            document.getElementById('manual-email').value = std.email;
            document.getElementById('manual-gen').value = std.gen;
            
            if(manualDataContainer) {
                manualDataContainer.classList.add('hidden');
                manualDataContainer.setAttribute('style', 'display: none !important; visibility: hidden !important;');
            }
            
            let badge = document.getElementById('logged-in-badge');
            if(!badge) {
                badge = document.createElement('div');
                badge.id = 'logged-in-badge';
                badge.style = "background: #E8F5E9; color: #2E7D32; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; text-align: center; border: 1px solid #A5D6A7;";
                document.getElementById('exam-intro').insertBefore(badge, document.getElementById('manual-student-data'));
            }
            badge.innerHTML = `<i class="fi fi-ss-user-check"></i> Accediendo como: ${std.name}`;
            badge.classList.remove('hidden');
            badge.style.display = '';
        } else {
            document.getElementById('manual-name').value = '';
            document.getElementById('manual-email').value = '';
            document.getElementById('manual-gen').value = '';
            
            if(wrapperGen) wrapperGen.classList.remove('hidden');
            
            if(manualDataContainer) {
                manualDataContainer.classList.remove('hidden');
                manualDataContainer.style.display = '';
            }
            
            let badge = document.getElementById('logged-in-badge');
            if(badge) {
                badge.classList.add('hidden');
                badge.style.display = 'none';
            }
        }

    } catch (error) { 
        document.getElementById('loading-screen').classList.remove('hidden');
        document.getElementById('loading-text').innerText = "Error de red."; 
    }
}

window.saveSurveyProgress = () => {
    if(!isExamActive || examConfig.type !== 'survey' || !sessionData.docId) return;
    let currentAnswers = [];
    renderedQuestions.forEach((item) => {
        let val = null;
        if (item.type === 'open') {
            let el = document.querySelector(`textarea[name="question_${item.originalQIndex}"]`);
            val = el ? el.value : "";
        } else {
            let sel = document.querySelector(`input[name="question_${item.originalQIndex}"]:checked`);
            val = sel ? sel.value : null;
        }
        currentAnswers.push({ questionIndex: item.originalQIndex, answer: val });
    });
    setDoc(doc(db, "submissions", sessionData.docId), { answers: currentAnswers }, { merge: true }).catch(()=>{});
};

window.resetInactivity = () => {
    if (!isExamActive || isBlocked || isHandlingInfraction || examConfig.type === 'survey' || examConfig.type === 'course') return;
    
    const warningModal = document.getElementById('warning-modal');
    if (warningModal && !warningModal.classList.contains('hidden')) return;

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        checkInfraction("Inactividad detectada (15 segundos sin movimiento).");
    }, 15000);
};

window.startExamProcess = async function() {
    if (isExamActive) return; 

    window.setLoading('start-btn', true);
    const nameInput = document.getElementById('manual-name').value.trim();
    const emailInput = document.getElementById('manual-email').value.trim().toLowerCase();
    const genInput = document.getElementById('manual-gen').value.trim().toUpperCase();
    
    const isSurvey = examConfig.type === 'survey';
    const isCourse = examConfig.type === 'course';

    if(nameInput.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput) || genInput.length < 2) { 
        window.setLoading('start-btn', false);
        return window.CustomDialog.alert("Por favor, llena todos los campos correctamente."); 
    }

    let allowedGens = examConfig.gen || examConfig.gens_string || "";
    if (!allowedGens.includes(genInput) && !allowedGens.includes("GLOBAL")) {
        window.setLoading('start-btn', false);
        return window.CustomDialog.alert("El Código de Clase es incorrecto. No tienes autorización."); 
    }
    
    isExamActive = true; 
    
    const introElement = document.getElementById('exam-intro');
    if(introElement) {
        introElement.classList.add('hidden');
        introElement.setAttribute('style', 'display: none !important; visibility: hidden !important;');
    }

    const manualData = document.getElementById('manual-student-data');
    if(manualData) {
        manualData.classList.add('hidden');
        manualData.setAttribute('style', 'display: none !important; visibility: hidden !important;');
    }

    const badge = document.getElementById('logged-in-badge');
    if(badge) {
        badge.classList.add('hidden');
        badge.setAttribute('style', 'display: none !important; visibility: hidden !important;');
    }

    hideAll();
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-text').innerText = "Validando acceso...";

    let existingAnswers = [];

    try {
        const qb = query(collection(db, "submissions"), where("examId", "==", window.currentExamId), where("student.email", "==", emailInput));
        const snapshot = await getDocs(qb);
        
        let isResumingCourse = false;
        let isResumingSurvey = false;
        let existingModule = 0;

        if (!snapshot.empty) {
            let existingStatus = null;
            let existingDocId = null;
            snapshot.forEach(d => { 
                existingStatus = d.data().status; 
                existingDocId = d.id;
                existingModule = d.data().currentModuleIndex || 0;
                if(isSurvey) existingAnswers = d.data().answers || [];
            });
            
            if (existingStatus === "COMPLETED") {
                isExamActive = false; 
                hideAll(); 
                document.getElementById('blocked-view').classList.remove('hidden');
                document.getElementById('nav-actions').classList.remove('hidden');
                
                if (existingStatus === "COMPLETED") {
                    document.getElementById('blocked-title').innerText = "INTENTO AGOTADO";
                    document.getElementById('blocked-msg').innerText = "Ya has completado esta actividad previamente.";
                } else if (existingStatus === "BLOCKED") {
                    document.getElementById('blocked-title').innerText = "ANULADO";
                    document.getElementById('blocked-msg').innerText = "Tu actividad fue anulada previamente.";
                } else if (existingStatus === "IN_PROGRESS") {
                    document.getElementById('blocked-title').innerText = "INTENTO ANULADO";
                    document.getElementById('blocked-msg').innerText = "Se detectó que la actividad fue cerrada sin finalizar. Contacta a tu instructor para solicitar un reinicio.";
                    snapshot.forEach(async (d) => {
                        await setDoc(doc(db, "submissions", d.id), { status: "BLOCKED", metrics: { detail: "Abandono (Cierre de ventana)." } }, { merge: true });
                    });
                }
                return;
            } else if (existingStatus === "IN_PROGRESS") {
                if (isCourse) {
                    isResumingCourse = true;
                    sessionData.docId = existingDocId;
                    window.currentModuleIndex = existingModule;
                } else if (isSurvey) {
                    isResumingSurvey = true;
                    sessionData.docId = existingDocId;
                } else {
                    isExamActive = false; 
                    hideAll(); 
                    document.getElementById('blocked-view').classList.remove('hidden');
                    document.getElementById('nav-actions').classList.remove('hidden');
                    document.getElementById('blocked-title').innerText = "INTENTO ANULADO";
                    document.getElementById('blocked-msg').innerText = "Se detectó que la actividad fue cerrada sin finalizar. Contacta a tu instructor para solicitar un reinicio.";
                    snapshot.forEach(async (d) => {
                        await setDoc(doc(db, "submissions", d.id), { status: "BLOCKED", metrics: { detail: "Abandono (Cierre de ventana)." } }, { merge: true });
                    });
                    return;
                }
            }
        }

        sessionData.studentName = nameInput; sessionData.studentEmail = emailInput; sessionData.studentGen = genInput;
        sessionData.startTime = new Date().getTime();
        
        let initialPayload = {
            examId: window.currentExamId,
            student: { name: nameInput, email: emailInput, gen: genInput },
            examInfo: { name: examConfig.name, type: isSurvey ? 'survey' : (isCourse ? 'course' : 'exam') },
            status: "IN_PROGRESS",
            metrics: { infractions: 0, startTime: new Date().toISOString() },
            answers: existingAnswers
        };
        
        if(!isSurvey && !isCourse) {
            initialPayload.examInfo.passingThreshold = examConfig.minScore;
            initialPayload.examInfo.questionsToShow = examConfig.questionsToShow || originalPool.length;
        }

        if (!isResumingCourse && !isResumingSurvey) {
            const newSubRef = await addDoc(collection(db, "submissions"), initialPayload);
            sessionData.docId = newSubRef.id;
        }

        hideAll(); 
        document.getElementById('nav-actions').classList.add('hidden'); 
        isBlocked = false; cheatCount = 0; isHandlingInfraction = false; isPermanentlyBlocked = false;
        
        if(isCourse) {
            document.getElementById('course-view').classList.remove('hidden');
            window.renderCourseModule();
        } else {
            document.getElementById('exam-view').classList.remove('hidden');
            document.getElementById('exam-wrapper').classList.remove('hidden'); 

            if(isSurvey) {
                renderedQuestions = originalPool.map(q => {
                    return { ...q, shuffledOpts: q.opts ? q.opts.map((text, idx) => ({ text, originalOIndex: idx })) : [] };
                });
                document.getElementById('timer-text').classList.add('hidden');
                document.getElementById('running-title').innerHTML = `<i class="fi fi-ss-comment-alt" style="color:var(--primary);"></i> Encuesta en curso`;
            } else {
                let shuffledPool = shuffleArray([...originalPool]);
                const maxQuestions = examConfig.questionsToShow || shuffledPool.length;
                renderedQuestions = shuffledPool.slice(0, maxQuestions).map(q => {
                    let optsWithRef = q.opts.map((optText, oIdx) => ({ text: optText, originalOIndex: oIdx }));
                    return { ...q, shuffledOpts: shuffleArray(optsWithRef) };
                });

                MAX_INFRACTIONS = examConfig.securityLevel === 'medium' ? 3 : 5;
                document.getElementById('modal-max-count').innerText = MAX_INFRACTIONS;

                if(examConfig.securityLevel === 'medium') {
                    document.addEventListener('mousemove', window.resetInactivity);
                    document.addEventListener('keydown', window.resetInactivity);
                    document.addEventListener('touchstart', window.resetInactivity);
                    window.resetInactivity();
                }
                try { document.documentElement.requestFullscreen(); } catch(e) {}
                startTimer(examConfig.duration || 60);
            }
            renderQuestions(isSurvey, existingAnswers); 
        }

        history.pushState(null, null, location.href);
        window.onpopstate = function () { if (isExamActive || isPermanentlyBlocked) { history.go(1); } };

    } catch(e) { 
        isExamActive = false;
        window.setLoading('start-btn', false);
        hideAll();
        document.getElementById('exam-view').classList.remove('hidden');
        if(introElement) {
            introElement.classList.remove('hidden');
            introElement.style.display = '';
        }
        window.CustomDialog.alert("Error de conexión al verificar identidad."); 
    }
};

function startTimer(minutes) {
    timeRemainingSeconds = minutes * 60;
    timerInterval = setInterval(() => {
        timeRemainingSeconds--;
        let h = Math.floor(timeRemainingSeconds / 3600), m = Math.floor((timeRemainingSeconds % 3600) / 60), s = timeRemainingSeconds % 60;
        document.getElementById('timer-text').innerHTML = `<i class="fi fi-ss-time-quarter-to"></i> ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (timeRemainingSeconds <= 0) { clearInterval(timerInterval); window.submitExam(true); }
    }, 1000);
}

function renderQuestions(isSurvey, existingAnswers = []) {
    const container = document.getElementById('exam-container');
    container.innerHTML = '';
    renderedQuestions.forEach((item, index) => {
        const qBlock = document.createElement('div'); 
        qBlock.className = 'question-block'; 
        if(isSurvey) qBlock.classList.add('survey-block');
        qBlock.id = `qblock_${index}`;
        
        qBlock.innerHTML = `<h3 style="${isSurvey ? 'color:var(--text-main);' : ''}">${index + 1}. ${item.q}</h3>`;
        
        let existingVal = null;
        if (existingAnswers && existingAnswers.length > 0) {
            let found = existingAnswers.find(a => a.questionIndex === item.originalQIndex);
            if (found) existingVal = found.answer;
        }

        if(isSurvey && item.type === 'open') {
            qBlock.innerHTML += `<textarea name="question_${item.originalQIndex}" rows="3" placeholder="Escribe tu respuesta aquí..." onchange="window.saveSurveyProgress()">${existingVal || ''}</textarea>`;
        } else if (isSurvey && item.type === 'scale') {
            let scaleHtml = `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">`;
            for(let i=1; i<=10; i++) {
                let checkedStr = (existingVal && parseInt(existingVal) === i) ? 'checked' : '';
                scaleHtml += `<label class="scale-label"><input type="radio" name="question_${item.originalQIndex}" value="${i}" onchange="window.saveSurveyProgress()" ${checkedStr}><span>${i}</span></label>`;
            }
            scaleHtml += `</div>`;
            qBlock.innerHTML += scaleHtml;
        } else {
            item.shuffledOpts.forEach((opt) => {
                let checkedStr = (existingVal !== null && existingVal !== undefined && parseInt(existingVal) === opt.originalOIndex) ? 'checked' : '';
                let ocAttr = isSurvey ? 'onchange="window.saveSurveyProgress()"' : '';
                qBlock.innerHTML += `<label class='option-label'><input type='radio' name='question_${item.originalQIndex}' value='${opt.originalOIndex}' ${ocAttr} ${checkedStr}>${opt.text}</label>`;
            });
        }
        container.appendChild(qBlock);
    });
}

window.submitExam = async function(isAutoSubmit = false) {
    const isSurvey = examConfig.type === 'survey';

    if (!isAutoSubmit) {
        let allAnswered = true;
        for (let i = 0; i < renderedQuestions.length; i++) {
            let origIndex = renderedQuestions[i].originalQIndex;
            let isAns = false;
            if(isSurvey && renderedQuestions[i].type === 'open') {
                let el = document.querySelector(`textarea[name="question_${origIndex}"]`);
                isAns = el && el.value.trim() !== "";
            } else {
                let el = document.querySelector(`input[name="question_${origIndex}"]:checked`);
                isAns = el !== null;
            }
            if (!isAns) { allAnswered = false; break; }
        }
        if (!allAnswered) return window.CustomDialog.alert(`Responde todas las ${isSurvey ? 'preguntas' : 'preguntas'}.`);
        if (!await window.CustomDialog.confirm(`¿Finalizar y Enviar?`)) return;
    }
    
    window.setLoading('submit-btn', true);
    isExamActive = false; 
    
    if(!isSurvey) {
        clearInterval(timerInterval);
        clearTimeout(inactivityTimer);
        document.removeEventListener('mousemove', window.resetInactivity);
        document.removeEventListener('keydown', window.resetInactivity);
        document.removeEventListener('touchstart', window.resetInactivity);
    } else {
        clearTimeout(surveyAutoSaveTimer);
    }

    document.getElementById('nav-actions').classList.remove('hidden'); 
    
    let payload = {
        metrics: { infractions: cheatCount, timeUsedSeconds: Math.floor((new Date().getTime() - sessionData.startTime) / 1000) },
        status: "COMPLETED", 
        answers: []
    };

    if(!isSurvey) {
        payload.graded = false;
        renderedQuestions.forEach((item) => {
            const selected = document.querySelector(`input[name="question_${item.originalQIndex}"]:checked`);
            payload.answers.push({ questionIndex: item.originalQIndex, selectedOption: selected ? parseInt(selected.value) : null });
        });
    } else {
        renderedQuestions.forEach((item) => {
            let val = null;
            if (item.type === 'open') {
                val = document.querySelector(`textarea[name="question_${item.originalQIndex}"]`)?.value || "";
            } else {
                const sel = document.querySelector(`input[name="question_${item.originalQIndex}"]:checked`);
                val = sel ? sel.value : null;
            }
            payload.answers.push({ questionIndex: item.originalQIndex, answer: val });
        });
    }

    hideAll(); 
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-text').innerText = "Enviando respuestas...";
    
    await setDoc(doc(db, "submissions", sessionData.docId), payload, { merge: true });
    
    hideAll(); 
    document.getElementById('success-view').classList.remove('hidden');
    if(!isSurvey && document.fullscreenElement) document.exitFullscreen();
};

window.renderCourseModule = () => {
    const mod = window.currentCourseModules[window.currentModuleIndex];
    document.getElementById('course-module-title').innerText = `Módulo ${window.currentModuleIndex + 1}: ${mod.title}`;
    
    const pct = ((window.currentModuleIndex) / window.currentCourseModules.length) * 100;
    document.getElementById('course-progress-bar').style.width = `${pct}%`;
    
    const ytContainer = document.getElementById('course-video-container');
    if(mod.video) {
        const ytId = getYTid(mod.video);
        if(ytId) {
            ytContainer.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId}?rel=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
            ytContainer.classList.remove('hidden');
        } else {
            ytContainer.innerHTML = '';
            ytContainer.classList.add('hidden');
        }
    } else {
        ytContainer.innerHTML = '';
        ytContainer.classList.add('hidden');
    }
    
    const attContainer = document.getElementById('course-attachments-container');
    if(mod.attachments && mod.attachments.length > 0) {
        let attHtml = `<h4 style="margin-bottom:10px; color:var(--text-secondary);"><i class="fi fi-ss-folder-open"></i> Material de Apoyo:</h4>`;
        mod.attachments.forEach(a => {
            attHtml += `<a href="${a.url}" target="_blank" class="course-attachment"><i class="fi fi-ss-download"></i> ${a.name}</a>`;
        });
        attContainer.innerHTML = attHtml;
        attContainer.classList.remove('hidden');
    } else {
        attContainer.classList.add('hidden');
    }
    
    document.getElementById('btn-course-prev').style.display = window.currentModuleIndex === 0 ? 'none' : 'inline-flex';
    
    const nextBtn = document.getElementById('btn-course-next');
    if(window.currentModuleIndex === window.currentCourseModules.length - 1) {
        nextBtn.innerHTML = '<i class="fi fi-ss-diploma"></i> Finalizar Curso';
        nextBtn.style.backgroundColor = 'var(--success)';
    } else {
        nextBtn.innerHTML = 'Siguiente <i class="fi fi-ss-arrow-right"></i>';
        nextBtn.style.backgroundColor = 'var(--primary)';
    }
};

window.nextCourseModule = async () => {
    if(window.currentModuleIndex === window.currentCourseModules.length - 1) {
        window.finishCourse();
    } else {
        window.currentModuleIndex++;
        window.renderCourseModule();
        if (sessionData.docId) {
            setDoc(doc(db, "submissions", sessionData.docId), { currentModuleIndex: window.currentModuleIndex }, { merge: true });
        }
    }
};

window.prevCourseModule = async () => {
    if(window.currentModuleIndex > 0) {
        window.currentModuleIndex--;
        window.renderCourseModule();
        if (sessionData.docId) {
            setDoc(doc(db, "submissions", sessionData.docId), { currentModuleIndex: window.currentModuleIndex }, { merge: true });
        }
    }
};

window.finishCourse = async () => {
    if (!await window.CustomDialog.confirm(`¿Estás seguro de finalizar el curso?`)) return;
    
    document.getElementById('course-view').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-text').innerText = "Generando certificado...";
    
    isExamActive = false;
    
    document.getElementById('nav-actions').classList.remove('hidden'); 

    const studentStr = localStorage.getItem('tumb_student');
    const std = JSON.parse(studentStr);

    const payload = {
        examId: window.currentExamId,
        student: { name: std.name, email: std.email, gen: std.gen },
        examInfo: { name: examConfig.name, type: 'course' },
        status: "COMPLETED",
        metrics: { timeUsedSeconds: Math.floor((new Date().getTime() - sessionData.startTime) / 1000) }
    };
    
    await setDoc(doc(db, "submissions", sessionData.docId), payload, { merge: true });
    
    window.viewCertificateLocal(examConfig.name, std.name, std.gen);
};

window.viewCertificateLocal = (courseName, studentName, gen) => {
    hideAll();
    document.getElementById('certificate-modal').classList.remove('hidden');
    document.getElementById('cert-student-name').innerText = studentName;
    document.getElementById('cert-course-name').innerText = courseName;
    document.getElementById('cert-student-gen').innerText = gen;
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('cert-date').innerText = "Emitido el " + new Date().toLocaleDateString('es-ES', options);
};

window.viewCertificate = async (courseId, subId) => {
    const sub = window.studentSubmissions[subId];
    window.viewCertificateLocal(sub.examInfo.name, sub.student.name, sub.student.gen);
};

async function triggerSevereInfraction(reason) {
    if (!isExamActive || isBlocked || isHandlingInfraction || examConfig.type === 'survey' || examConfig.type === 'course') return;
    isHandlingInfraction = true; cheatCount = MAX_INFRACTIONS; 
    document.getElementById('severe-reason').innerText = reason;
    document.getElementById('severe-modal').classList.remove('hidden');
    await cancelExamDb(reason);
}

function checkInfraction(reason = "Se detectó pérdida de enfoque del examen.") {
    if (!isExamActive || isBlocked || isHandlingInfraction || examConfig.type === 'survey' || examConfig.type === 'course') return;
    isHandlingInfraction = true; cheatCount++;
    clearTimeout(inactivityTimer); 

    if (cheatCount >= MAX_INFRACTIONS) { cancelExamDb(reason); } 
    else { 
        document.getElementById('warning-reason').innerText = reason;
        document.getElementById('modal-count').innerText = cheatCount;
        document.getElementById('warning-modal').classList.remove('hidden');
    }
    setTimeout(() => { isHandlingInfraction = false; }, 3000);
}

async function cancelExamDb(logReason) {
    isBlocked = true; isPermanentlyBlocked = true; isExamActive = false; 
    clearInterval(timerInterval);
    clearTimeout(inactivityTimer);
    document.removeEventListener('mousemove', window.resetInactivity);
    document.removeEventListener('keydown', window.resetInactivity);
    document.removeEventListener('touchstart', window.resetInactivity);

    localStorage.setItem('estado_examen_bloqueado', 'true');
    document.getElementById('nav-actions').classList.remove('hidden');
    
    if(!logReason.includes("captura") && !logReason.includes("copia")) {
        hideAll();
        document.getElementById('blocked-title').innerText = "EXAMEN ANULADO";
        document.getElementById('blocked-msg').innerText = logReason;
        document.getElementById('blocked-view').classList.remove('hidden');
    }
    await setDoc(doc(db, "submissions", sessionData.docId), { status: "BLOCKED", metrics: { infractions: cheatCount, detail: logReason } }, { merge: true });
    if(document.fullscreenElement) document.exitFullscreen();
}

document.addEventListener("visibilitychange", () => { if(document.hidden && (!examConfig || (examConfig.type !== 'survey' && examConfig.type !== 'course'))) checkInfraction(); });
window.addEventListener("blur", () => { if(!examConfig || (examConfig.type !== 'survey' && examConfig.type !== 'course')) checkInfraction(); });
window.closeModal = function() { 
    document.getElementById('warning-modal').classList.add('hidden'); 
    if(isExamActive && examConfig.securityLevel === 'medium') {
        window.resetInactivity();
    }
}

window.downloadCertificateCanvas = function(format) {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    const primaryDark = getComputedStyle(document.documentElement).getPropertyValue('--primary-dark').trim() || '#005B9F';
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0288D1';

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#F0F4F8';
    for(let x = 20; x < canvas.width; x += 30) {
        for(let y = 20; y < canvas.height; y += 30) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI*2);
            ctx.fill();
        }
    }

    ctx.lineWidth = 24;
    ctx.strokeStyle = primaryDark;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    const logoImg = document.getElementById('cert-logo');
    if (logoImg && logoImg.src && !logoImg.classList.contains('hidden')) {
        try {
            const maxW = 300, maxH = 130;
            let drawW = logoImg.naturalWidth, drawH = logoImg.naturalHeight;
            if(drawW > maxW || drawH > maxH) {
                const ratio = Math.min(maxW/drawW, maxH/drawH);
                drawW *= ratio; drawH *= ratio;
            }
            ctx.drawImage(logoImg, 50, 50, drawW, drawH);
        } catch(e) { console.warn("No se pudo dibujar el logo institucional", e); }
    }

    ctx.textAlign = 'center';
    
    ctx.fillStyle = primaryDark;
    ctx.beginPath();
    ctx.arc(canvas.width/2, 180, 50, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 60px Arial';
    ctx.fillText('★', canvas.width/2, 202);

    ctx.fillStyle = primaryDark;
    ctx.font = 'bold 70px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText('CERTIFICADO DE FINALIZACIÓN', canvas.width/2, 330);

    ctx.fillStyle = '#7F8C8D';
    ctx.font = '35px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText('Se otorga el presente reconocimiento a:', canvas.width/2, 430);

    const studentName = document.getElementById('cert-student-name').innerText;
    ctx.fillStyle = '#2C3E50';
    ctx.font = 'bold 85px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText(studentName, canvas.width/2, 540);

    ctx.beginPath();
    ctx.moveTo(canvas.width/2 - 450, 590);
    ctx.lineTo(canvas.width/2 + 450, 590);
    ctx.lineWidth = 4;
    ctx.strokeStyle = primary;
    ctx.stroke();

    ctx.fillStyle = '#7F8C8D';
    ctx.font = '35px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText('Por haber completado satisfactoriamente todas las lecciones del curso:', canvas.width/2, 690);

    const courseName = document.getElementById('cert-course-name').innerText;
    ctx.fillStyle = primary;
    ctx.font = 'bold 60px "Roboto", "Segoe UI", sans-serif';
    
    const wrapText = (text, x, y, maxWidth, lineHeight) => {
        let words = text.split(' '), line = '', currentY = y;
        for(let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
        return currentY;
    };
    
    let endY = wrapText(courseName, canvas.width/2, 790, 1400, 70);

    const gen = document.getElementById('cert-student-gen').innerText;
    ctx.fillStyle = '#7F8C8D';
    ctx.font = '30px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText(`Generación vinculada: ${gen}`, canvas.width/2, endY + 110);

    const dateStr = document.getElementById('cert-date').innerText;
    ctx.fillStyle = '#2C3E50';
    ctx.font = 'bold 30px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText(dateStr, canvas.width/2, endY + 180);

    const quote = document.getElementById('cert-footer-quote').innerText;
    ctx.fillStyle = '#BDC3C7';
    ctx.font = 'italic 25px "Roboto", "Segoe UI", sans-serif';
    ctx.fillText(quote, canvas.width/2, 1150);

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, 1.0);
    
    const link = document.createElement('a');
    link.download = `Certificado_${studentName.replace(/\s+/g, '_')}.${format}`;
    link.href = dataUrl;
    link.click();
};