/**
 * StudySphere — Standalone Quiz Engine Controller (assets/js/quiz.js)
 * Revisions Applied:
 *   1. Final Question Reporting System powered by Google Sheets & Apps Script Web App.
 *      - Direct endpoint integration without Telegram.
 *      - Automatic question identification, issue dropdown, optional details.
 *      - Duplicate click prevention, auto-closing on success, and "Reported" state tracking.
 *   2. Manual step progression (NO auto-next upon answer selection).
 *   3. Manual step progression (NO auto-next upon Mark for Review).
 *   4. Strictly zero pre-selected answers on fresh start (Q1 starts empty).
 *   5. Zero unwanted scrolling — stable viewport without document movement.
 *   6. Clean pure white background (#FFFFFF) for question card and options.
 *   7. Compact mobile padding and safe line wrapping.
 *   8. 3-row mobile context header with subject & chapter details.
 *   9. Left-side mobile question palette drawer (55vw).
 *  10. Non-overflowing 2-tier fixed bottom controls.
 *  11. Advanced MPSC Exam Performance Analysis result page (SVG donut chart,
 *      real-time analytics, chapter-wise breakdown, and per-question reports).
 */

(function () {
  'use strict';

  // Configured Google Apps Script Web App Endpoint for StudySphere Question Reports
  var REPORT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzXR7L9lMGyh7NTj-dEzI_OcudYEHg_a12VZNkA8RVIpSZV_oRSFkZpSYlIzeDDx6vRPQ/exec';

  // State Store
  var quizData = null;
  var currentQuestionIndex = 0;
  var selectedAnswers = {}; // { questionId: "A" } — strictly empty on load
  var markedQuestions = {}; // { questionId: true }
  var visitedQuestions = {}; // { questionId: true }
  var remainingSeconds = 0;
  var timerInterval = null;
  var isSubmitted = false;
  var currentFontSize = 'small'; // Default: small

  // Real per-question time tracking
  var questionTimeSpent = {}; // { questionId: seconds }
  var lastQuestionTimestamp = 0;

  // Question Reporting State
  var reportedQuestions = {}; // { questionId: true }
  var activeReportPayload = null;
  var isSubmittingReport = false;

  var FONT_SIZES = ['small', 'medium', 'large'];
  var STORAGE_KEY_PREFIX = 'studysphere_quiz_state_v3_';
  var FONT_STORAGE_KEY = 'studysphere_quiz_font_size';

  // DOM Elements Cache
  var els = {};

  function initElements() {
    els.app = document.getElementById('quizAppRoot');
    els.titleMain = document.getElementById('quizHeaderTitle');
    els.subBadge = document.getElementById('quizHeaderSub');
    els.counterCenter = document.getElementById('quizProgressCenter');
    els.mobileTitle = document.getElementById('mobileQuizTitle');
    els.mobileContext = document.getElementById('mobileQuizContext');
    els.mobileCounter = document.getElementById('mobileProgressCounter');
    els.timerPill = document.getElementById('quizTimerPill');
    els.timerText = document.getElementById('quizTimerText');
    els.mobileTimerPill = document.getElementById('mobileTimerPill');
    els.mobileTimerText = document.getElementById('mobileTimerText');
    els.exitBtn = document.getElementById('quizExitBtn');
    els.mobileExitBtn = document.getElementById('mobileExitBtn');
    
    // Font Toggle Elements
    els.fontToggleBtn = document.getElementById('quizFontToggleBtn');
    els.fontCurrentVal = document.getElementById('quizFontCurrentVal');
    els.mobileFontToggleBtn = document.getElementById('mobileFontToggleBtn');
    els.mobileFontCurrentVal = document.getElementById('mobileFontCurrentVal');

    els.workspace = document.getElementById('quizWorkspace');
    els.questionViewport = document.getElementById('quizQuestionViewport');
    els.questionContent = document.getElementById('questionScrollContent');
    
    // Palette Elements (Desktop + Left Mobile Drawer)
    els.desktopPaletteGrid = document.getElementById('desktopPaletteGrid');
    els.desktopPaletteTotalCount = document.getElementById('desktopPaletteTotalCount');
    els.mobilePaletteGrid = document.getElementById('mobilePaletteGrid');
    els.mobilePaletteOverlay = document.getElementById('mobilePaletteOverlay');
    els.mobilePaletteDrawer = document.getElementById('mobilePaletteDrawer');
    els.mobilePaletteToggle = document.getElementById('mobilePaletteToggle');
    els.mobilePaletteClose = document.getElementById('mobilePaletteClose');

    // Bottom Navigation Bar & Fixed Mark for Review
    els.controlBar = document.getElementById('quizBottomControlBar');
    els.prevBtn = document.getElementById('btnNavPrev');
    els.nextBtn = document.getElementById('btnNavNext');
    els.submitBtn = document.getElementById('btnNavSubmit');
    els.markReviewBtn = document.getElementById('btnToggleMarkReview');
    els.markReviewStar = document.getElementById('markReviewStarIcon');
    els.markReviewText = document.getElementById('markReviewText');

    // Modals
    els.exitModal = document.getElementById('exitConfirmModal');
    els.submitModal = document.getElementById('submitConfirmModal');
    els.reportModal = document.getElementById('reportQuestionModal');

    // Results
    els.resultContainer = document.getElementById('quizResultContainer');
  }

  /* ==========================================================================
     1. Data Loading & Initialization
     ========================================================================== */
  function getQueryParam(param) {
    var searchParams = new URLSearchParams(window.location.search);
    return searchParams.get(param);
  }

  function loadQuiz() {
    var quizId = getQueryParam('quiz') || 'H-CH01-001';
    var questionFile = '../quizzes/pre/history/questions/quiz-001.json';

    fetch(questionFile)
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load quiz questions JSON');
        return res.json();
      })
      .then(function (data) {
        quizData = data;
        initFontSizeState();
        restoreOrInitState(quizId);
        renderHeaderInfo();
        startTimer();
        lastQuestionTimestamp = Date.now();
        renderQuestion(currentQuestionIndex);
        renderPaletteGrids();
      })
      .catch(function (err) {
        console.error('Quiz loading error:', err);
        if (els.questionContent) {
          els.questionContent.innerHTML = 
            '<div class="quiz-unified-box" style="text-align:center; padding:2rem;">' +
            '<h2 style="color:var(--status-wrong);">चाचणी लोड करताना अडचण आली</h2>' +
            '<p style="color:var(--quiz-text-muted);">' + err.message + '</p>' +
            '<a href="../subjects/prelims/history.html" class="btn-quiz-exit" style="margin-top:1rem; display:inline-block;">मागे जा (Back to History)</a>' +
            '</div>';
        }
      });
  }

  /* ==========================================================================
     2. Font Size Management (Small [Default] / Medium / Large)
     ========================================================================== */
  function initFontSizeState() {
    try {
      var saved = localStorage.getItem(FONT_STORAGE_KEY);
      if (saved && FONT_SIZES.indexOf(saved) !== -1) {
        currentFontSize = saved;
      } else {
        currentFontSize = 'small'; // Strict default: Small
      }
    } catch (e) {
      currentFontSize = 'small';
    }
    applyFontSize(currentFontSize);
  }

  function applyFontSize(size) {
    currentFontSize = size;
    document.documentElement.setAttribute('data-quiz-font-size', size);
    try {
      localStorage.setItem(FONT_STORAGE_KEY, size);
    } catch (e) {}

    var cap = size.charAt(0).toUpperCase() + size.slice(1);
    if (els.fontCurrentVal) els.fontCurrentVal.textContent = cap;
    if (els.mobileFontCurrentVal) els.mobileFontCurrentVal.textContent = cap;

    if (els.fontToggleBtn) {
      els.fontToggleBtn.setAttribute('title', 'Font Size: ' + cap + ' (click to toggle)');
    }
  }

  function cycleFontSize() {
    var curIdx = FONT_SIZES.indexOf(currentFontSize);
    var nextIdx = (curIdx + 1) % FONT_SIZES.length;
    applyFontSize(FONT_SIZES[nextIdx]);
  }

  /* ==========================================================================
     3. State Management (Strictly NO pre-selected answer)
     ========================================================================== */
  function getStorageKey() {
    return STORAGE_KEY_PREFIX + (quizData ? quizData.quizId : 'active');
  }

  function restoreOrInitState(quizId) {
    var savedState = null;
    try {
      var item = localStorage.getItem(STORAGE_KEY_PREFIX + quizId);
      if (item) savedState = JSON.parse(item);
    } catch (e) {}

    if (savedState && !savedState.isSubmitted && savedState.remainingSeconds > 0) {
      currentQuestionIndex = savedState.currentQuestionIndex || 0;
      selectedAnswers = savedState.selectedAnswers || {};
      markedQuestions = savedState.markedQuestions || {};
      visitedQuestions = savedState.visitedQuestions || {};
      questionTimeSpent = savedState.questionTimeSpent || {};
      remainingSeconds = savedState.remainingSeconds;
      reportedQuestions = savedState.reportedQuestions || {};
    } else {
      currentQuestionIndex = 0;
      selectedAnswers = {}; // STRICTLY EMPTY: Question 1 starts unanswered
      markedQuestions = {};
      visitedQuestions = {};
      questionTimeSpent = {};
      reportedQuestions = {};
      remainingSeconds = (quizData.durationMinutes || 5) * 60;
    }

    if (quizData.questions[currentQuestionIndex]) {
      visitedQuestions[quizData.questions[currentQuestionIndex].questionId] = true;
    }
  }

  function persistState() {
    if (isSubmitted || !quizData) return;
    recordCurrentQuestionTime();
    var state = {
      quizId: quizData.quizId,
      currentQuestionIndex: currentQuestionIndex,
      selectedAnswers: selectedAnswers,
      markedQuestions: markedQuestions,
      visitedQuestions: visitedQuestions,
      questionTimeSpent: questionTimeSpent,
      reportedQuestions: reportedQuestions,
      remainingSeconds: remainingSeconds,
      isSubmitted: false
    };
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state));
    } catch (e) {}
  }

  function recordCurrentQuestionTime() {
    if (!quizData || !quizData.questions[currentQuestionIndex]) return;
    var qId = quizData.questions[currentQuestionIndex].questionId;
    var now = Date.now();
    var elapsedSeconds = Math.round((now - lastQuestionTimestamp) / 1000);
    if (elapsedSeconds > 0) {
      questionTimeSpent[qId] = (questionTimeSpent[qId] || 0) + elapsedSeconds;
    }
    lastQuestionTimestamp = now;
  }

  function clearActiveState() {
    try {
      localStorage.removeItem(getStorageKey());
    } catch (e) {}
  }

  /* ==========================================================================
     4. Header Context & Timer
     ========================================================================== */
  function renderHeaderInfo() {
    var title = quizData.titleMr || quizData.title;
    var contextText = 'MPSC Group C 2026 • Prelims • ' + (quizData.subjectNameMr || 'इतिहास') + ' • ' + (quizData.chapterNameMr || 'आधुनिक भारताचा इतिहास');

    if (els.titleMain) els.titleMain.textContent = title;
    if (els.subBadge) els.subBadge.textContent = contextText;

    if (els.mobileTitle) els.mobileTitle.textContent = title;
    if (els.mobileContext) els.mobileContext.textContent = contextText;

    if (els.desktopPaletteTotalCount) {
      els.desktopPaletteTotalCount.textContent = quizData.questions.length + ' Questions';
    }
  }

  function updateCounters() {
    var total = quizData.questions.length;
    var currentDisplay = (currentQuestionIndex + 1 < 10 ? '0' : '') + (currentQuestionIndex + 1);
    var totalDisplay = (total < 10 ? '0' : '') + total;
    var text = 'Q ' + currentDisplay + ' / ' + totalDisplay;

    if (els.counterCenter) els.counterCenter.textContent = text;
    if (els.mobileCounter) els.mobileCounter.textContent = text;
  }

  function startTimer() {
    updateTimerDisplay();
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      remainingSeconds--;
      updateTimerDisplay();
      persistState();

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        handleAutoSubmit();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    var mins = Math.floor(Math.max(0, remainingSeconds) / 60);
    var secs = Math.max(0, remainingSeconds) % 60;
    var str = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;

    if (els.timerText) els.timerText.textContent = str;
    if (els.mobileTimerText) els.mobileTimerText.textContent = str;

    var isWarn = remainingSeconds <= 60;
    if (els.timerPill) {
      if (isWarn) els.timerPill.classList.add('warning');
      else els.timerPill.classList.remove('warning');
    }
    if (els.mobileTimerPill) {
      if (isWarn) els.mobileTimerPill.classList.add('warning');
      else els.mobileTimerPill.classList.remove('warning');
    }
  }

  /* ==========================================================================
     5. Unified Question & Options Rendering (Clean Pure White Background)
     ========================================================================== */
  function renderQuestion(index) {
    if (!quizData || !quizData.questions[index]) return;
    recordCurrentQuestionTime();
    currentQuestionIndex = index;
    var q = quizData.questions[index];

    visitedQuestions[q.questionId] = true;
    updateCounters();
    updateNavigationControls();
    updateFooterMarkReviewState(q.questionId);
    persistState();

    var total = quizData.questions.length;
    var qNumFormatted = (index + 1 < 10 ? '0' : '') + (index + 1);
    var currentAnswer = selectedAnswers[q.questionId];

    // Construct ONE Common Pure White Card Box (#FFFFFF)
    var html = '';
    html += '<div class="quiz-unified-box">';

    // Question Header Meta with In-Quiz Report Trigger
    html += '  <div class="question-header-meta">';
    html += '    <span class="question-number-tag">प्रश्न ' + qNumFormatted + ' / ' + total + '</span>';
    html += '    <div style="display:flex; align-items:center; gap:8px;">';
    html += '      <span class="marks-pill-tag">गुण: ' + (q.marks || 1) + ' | उणे: ' + (quizData.negativeMarkingPerWrong || 0.25) + '</span>';
    html += '      <button type="button" class="btn-report-active-q ' + (reportedQuestions[q.questionId] ? 'is-reported' : '') + '" id="btnReportActiveQuestion" title="Report This Question">';
    html += '        <span>🚩</span> <span>' + (reportedQuestions[q.questionId] ? 'Reported' : 'Report') + '</span>';
    html += '      </button>';
    html += '    </div>';
    html += '  </div>';

    // Question Texts
    html += '  <div class="question-text-group">';
    html += '    <div class="question-text-mr">' + q.question.mr + '</div>';
    if (q.question.en) {
      html += '    <div class="question-text-en">' + q.question.en + '</div>';
    }
    html += '  </div>';

    // Statement Block (if questionType === 'statement')
    if (q.questionType === 'statement' && q.statements && q.statements.length) {
      html += '  <div class="statements-block">';
      q.statements.forEach(function (st) {
        html += '    <div class="statement-row">';
        html += '      <span class="statement-index">(' + st.index + ')</span>';
        html += '      <div class="statement-body">';
        html += '        <span class="statement-mr">' + st.mr + '</span>';
        if (st.en) html += '        <span class="statement-en">' + st.en + '</span>';
        html += '      </div>';
        html += '    </div>';
      });
      html += '  </div>';

      if (q.questionPrompt) {
        html += '  <div class="statement-prompt-row">' + q.questionPrompt.mr + '</div>';
        if (q.questionPrompt.en) {
          html += '  <div class="question-text-en">' + q.questionPrompt.en + '</div>';
        }
      }
    }

    // Options List inside the SAME common container
    html += '  <div class="options-list-wrap" role="radiogroup" aria-label="पर्याय (Options)">';
    q.options.forEach(function (opt) {
      var isSelected = currentAnswer === opt.id;
      html += '    <div class="option-card-row ' + (isSelected ? 'is-selected' : '') + '" data-option-id="' + opt.id + '" role="radio" aria-checked="' + isSelected + '">';
      html += '      <div class="option-radio-ring">';
      html += '        <div class="option-radio-inner-dot"></div>';
      html += '      </div>';
      html += '      <div class="option-content-col">';
      html += '        <div class="option-top-row">';
      html += '          <span class="option-label-letter">' + opt.id + '.</span>';
      html += '          <span class="option-text-mr">' + opt.text.mr + '</span>';
      html += '        </div>';
      if (opt.text.en) {
        html += '        <div class="option-text-en">' + opt.text.en + '</div>';
      }
      html += '      </div>';
      html += '    </div>';
    });
    html += '  </div>';

    html += '</div>'; // End quiz-unified-box

    els.questionContent.innerHTML = html;

    // Reset only internal content scroll without moving document window
    if (els.questionViewport) {
      els.questionViewport.scrollTop = 0;
    }

    // Bind Option Selection — MANUAL PROGRESSION (Remains on same question)
    var optionCards = els.questionContent.querySelectorAll('.option-card-row');
    optionCards.forEach(function (card) {
      function choose(e) {
        if (e && e.preventDefault) e.preventDefault();
        var optId = card.getAttribute('data-option-id');
        handleOptionSelectManual(q.questionId, optId, card);
      }
      card.addEventListener('click', choose);
    });

    // Bind Active Question Report Button
    var btnActiveReport = document.getElementById('btnReportActiveQuestion');
    if (btnActiveReport) {
      btnActiveReport.addEventListener('click', function () {
        triggerReportForQuestion(index);
      });
    }

    renderPaletteGrids();
  }

  /* ==========================================================================
     6. Manual Answer Selection (REMAINS ON SAME QUESTION — Zero Jump/Scroll)
     ========================================================================== */
  function handleOptionSelectManual(questionId, optionId, cardElement) {
    selectedAnswers[questionId] = optionId;
    persistState();

    // Visual immediate tactile selection update
    var allCards = els.questionContent.querySelectorAll('.option-card-row');
    allCards.forEach(function (c) {
      c.classList.remove('is-selected');
      c.setAttribute('aria-checked', 'false');
    });

    if (cardElement) {
      cardElement.classList.add('is-selected');
      cardElement.setAttribute('aria-checked', 'true');
    }

    // Update Palette immediately to 'Answered'
    renderPaletteGrids();
    updateNavigationControls();
  }

  /* ==========================================================================
     7. Manual Mark for Review (REMAINS ON CURRENT QUESTION)
     ========================================================================== */
  function updateFooterMarkReviewState(questionId) {
    if (!els.markReviewBtn) return;
    var isMarked = !!markedQuestions[questionId];

    if (isMarked) {
      els.markReviewBtn.classList.add('is-marked');
      if (els.markReviewStar) els.markReviewStar.textContent = '★';
      if (els.markReviewText) els.markReviewText.textContent = 'Marked for Review';
    } else {
      els.markReviewBtn.classList.remove('is-marked');
      if (els.markReviewStar) els.markReviewStar.textContent = '☆';
      if (els.markReviewText) els.markReviewText.textContent = 'Mark for Review';
    }
  }

  function toggleCurrentMarkReviewManual() {
    if (!quizData || !quizData.questions[currentQuestionIndex]) return;
    var qId = quizData.questions[currentQuestionIndex].questionId;

    if (markedQuestions[qId]) {
      delete markedQuestions[qId];
    } else {
      markedQuestions[qId] = true;
    }

    updateFooterMarkReviewState(qId);
    persistState();
    renderPaletteGrids();
  }

  /* ==========================================================================
     8. Question Palette (Desktop Right + Mobile 55vw Left Drawer)
     ========================================================================== */
  function getQuestionStatus(qId) {
    var isAns = !!selectedAnswers[qId];
    var isMrk = !!markedQuestions[qId];
    var isVis = !!visitedQuestions[qId];

    if (isAns && isMrk) return 'answered-marked';
    if (isMrk) return 'marked';
    if (isAns) return 'answered';
    return isVis ? 'not-visited' : 'not-visited';
  }

  function renderPaletteGrids() {
    if (!quizData) return;
    var questions = quizData.questions;

    function buildButtonsHtml() {
      var html = '';
      questions.forEach(function (q, idx) {
        var status = getQuestionStatus(q.questionId);
        var isCurr = idx === currentQuestionIndex;
        var numStr = (idx + 1 < 10 ? '0' : '') + (idx + 1);

        html += '<button type="button" class="palette-btn-num ' + status + ' ' + (isCurr ? 'is-current' : '') + '" data-goto="' + idx + '" aria-label="Question ' + (idx + 1) + ', ' + status + '">';
        html += numStr;
        html += '</button>';
      });
      return html;
    }

    var btnsHtml = buildButtonsHtml();

    if (els.desktopPaletteGrid) els.desktopPaletteGrid.innerHTML = btnsHtml;
    if (els.mobilePaletteGrid) els.mobilePaletteGrid.innerHTML = btnsHtml;

    // Attach listeners
    var allPaletteBtns = document.querySelectorAll('.palette-btn-num');
    allPaletteBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetIndex = parseInt(btn.getAttribute('data-goto'), 10);
        closeMobilePalette();
        renderQuestion(targetIndex);
      });
    });
  }

  function openMobilePalette() {
    if (els.mobilePaletteOverlay && els.mobilePaletteDrawer) {
      els.mobilePaletteOverlay.classList.add('is-open');
      els.mobilePaletteDrawer.classList.add('is-open');
    }
  }

  function closeMobilePalette() {
    if (els.mobilePaletteOverlay && els.mobilePaletteDrawer) {
      els.mobilePaletteOverlay.classList.remove('is-open');
      els.mobilePaletteDrawer.classList.remove('is-open');
    }
  }

  /* ==========================================================================
     9. Bottom Navigation Controls & Modals
     ========================================================================== */
  function updateNavigationControls() {
    var total = quizData.questions.length;
    var isFirst = currentQuestionIndex === 0;
    var isLast = currentQuestionIndex === total - 1;

    if (els.prevBtn) els.prevBtn.disabled = isFirst;

    if (isLast) {
      if (els.nextBtn) els.nextBtn.style.display = 'none';
      if (els.submitBtn) els.submitBtn.style.display = 'inline-flex';
    } else {
      if (els.nextBtn) els.nextBtn.style.display = 'inline-flex';
      if (els.submitBtn) els.submitBtn.style.display = 'none';
    }
  }

  function goPrev() {
    if (currentQuestionIndex > 0) {
      renderQuestion(currentQuestionIndex - 1);
    }
  }

  function goNext() {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      renderQuestion(currentQuestionIndex + 1);
    }
  }

  // Exit Modal
  function openExitModal() {
    if (els.exitModal) els.exitModal.classList.add('is-open');
  }

  function closeExitModal() {
    if (els.exitModal) els.exitModal.classList.remove('is-open');
  }

  function confirmExit() {
    clearActiveState();
    window.location.href = '../subjects/prelims/history.html';
  }

  // Submit Modal
  function openSubmitModal() {
    if (!els.submitModal || !quizData) return;

    var total = quizData.questions.length;
    var answered = 0;
    var marked = 0;

    quizData.questions.forEach(function (q) {
      if (selectedAnswers[q.questionId]) answered++;
      if (markedQuestions[q.questionId]) marked++;
    });

    var unanswered = total - answered;

    var valAns = document.getElementById('statValAnswered');
    var valUnans = document.getElementById('statValUnanswered');
    var valMark = document.getElementById('statValMarked');

    if (valAns) valAns.textContent = answered;
    if (valUnans) valUnans.textContent = unanswered;
    if (valMark) valMark.textContent = marked;

    els.submitModal.classList.add('is-open');
  }

  function closeSubmitModal() {
    if (els.submitModal) els.submitModal.classList.remove('is-open');
  }

  function handleAutoSubmit() {
    closeExitModal();
    closeSubmitModal();
    executeSubmission(true);
  }

  /* ==========================================================================
     10. MPSC Exam Performance Analysis Result Page
     ========================================================================== */
  function executeSubmission(wasTimeout) {
    recordCurrentQuestionTime();
    clearInterval(timerInterval);
    isSubmitted = true;
    clearActiveState();

    var totalQuestions = quizData.questions.length;
    var totalMarks = quizData.totalMarks || totalQuestions;
    var negRate = quizData.negativeMarkingPerWrong || 0.25;

    var correctCount = 0;
    var wrongCount = 0;
    var unansweredCount = 0;

    // Track chapter performance
    var chapterStats = {};

    quizData.questions.forEach(function (q) {
      var chId = q.chapterId || quizData.chapterId || 'H-01';
      var chName = quizData.chapterNameMr || 'आधुनिक भारताचा इतिहास';

      if (!chapterStats[chId]) {
        chapterStats[chId] = {
          name: chName,
          total: 0,
          attempted: 0,
          correct: 0,
          wrong: 0
        };
      }
      chapterStats[chId].total++;

      var userAns = selectedAnswers[q.questionId];
      if (!userAns) {
        unansweredCount++;
      } else if (userAns === q.correctAnswer) {
        correctCount++;
        chapterStats[chId].attempted++;
        chapterStats[chId].correct++;
      } else {
        wrongCount++;
        chapterStats[chId].attempted++;
        chapterStats[chId].wrong++;
      }
    });

    var grossMarks = correctCount * 1.0;
    var negativeMarksTotal = wrongCount * negRate;
    var finalScore = Math.max(0, grossMarks - negativeMarksTotal);
    finalScore = Math.round(finalScore * 100) / 100;

    var accuracy = (correctCount + wrongCount > 0)
      ? Math.round((correctCount / (correctCount + wrongCount)) * 100)
      : 0;

    var percentage = Math.round((finalScore / totalMarks) * 100);

    var totalSecondsAllocated = (quizData.durationMinutes || 5) * 60;
    var timeTakenSeconds = Math.max(0, totalSecondsAllocated - remainingSeconds);
    var minsTaken = Math.floor(timeTakenSeconds / 60);
    var secsTaken = timeTakenSeconds % 60;
    var timeTakenFormatted = minsTaken + ' min ' + (secsTaken < 10 ? '0' : '') + secsTaken + ' sec';

    var avgTimePerQ = (totalQuestions > 0)
      ? Math.round(timeTakenSeconds / totalQuestions)
      : 0;

    renderResultScreen({
      score: finalScore,
      totalMarks: totalMarks,
      percentage: percentage,
      correct: correctCount,
      wrong: wrongCount,
      unanswered: unansweredCount,
      accuracy: accuracy,
      negativeDeduction: negativeMarksTotal,
      timeTaken: timeTakenFormatted,
      avgTimePerQ: avgTimePerQ,
      chapterStats: chapterStats,
      wasTimeout: wasTimeout
    });
  }

  function renderResultScreen(results) {
    if (els.workspace) els.workspace.style.display = 'none';
    if (els.controlBar) els.controlBar.style.display = 'none';

    if (els.timerPill) els.timerPill.style.display = 'none';
    if (els.mobileTimerPill) els.mobileTimerPill.style.display = 'none';
    if (els.counterCenter) els.counterCenter.textContent = 'MPSC परीक्षा विश्लेषण';
    if (els.mobileCounter) els.mobileCounter.textContent = 'परीक्षा विश्लेषण';

    var html = '';
    html += '<div class="result-viewport-scroll">';
    html += '  <div class="result-card-container">';

    // 1. Prominent Score Summary Banner
    html += '    <div class="score-hero-card">';
    html += '      <span class="score-badge-label">MPSC Group C 2026 • चाचणी विश्लेषण अहवाल</span>';
    html += '      <div class="score-numbers-main">' + results.score + ' <span class="score-fraction-sub">/ ' + results.totalMarks + '</span></div>';
    html += '      <div><span class="score-percentage-tag">' + results.percentage + '% गुण (Score)</span></div>';
    html += '      <p style="font-size:0.85rem; color:var(--quiz-text-muted); margin:6px 0 0;">' + (results.percentage >= 60 ? 'उत्कृष्ट कामगिरी! सराव असाच सुरू ठेवा.' : 'चांगला प्रयत्न! पुढील सुधारणेसाठी खालील विश्लेषण तपासा.') + '</p>';

    // Metrics Summary Grid
    html += '      <div class="result-analytics-grid">';
    html += '        <div class="analytics-card"><span class="analytics-val correct">' + results.correct + '</span><span class="analytics-lbl">बरोबर (Correct)</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val wrong">' + results.wrong + '</span><span class="analytics-lbl">चुकीचे (Wrong)</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val">' + results.unanswered + '</span><span class="analytics-lbl">सोडवले नाही</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val">' + results.accuracy + '%</span><span class="analytics-lbl">अचूकता (Accuracy)</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val" style="color:var(--status-wrong);">- ' + results.negativeDeduction + '</span><span class="analytics-lbl">उणे गुण</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val">' + results.timeTaken + '</span><span class="analytics-lbl">घेतलेला वेळ</span></div>';
    html += '      </div>';

    // Top Action Buttons
    html += '      <div class="result-actions-bar">';
    html += '        <button type="button" class="btn-result-action btn-review-answers" id="btnScrollToReview">तपशीलवार उत्तर पत्रिका (Review Answers) ↓</button>';
    html += '        <a href="../subjects/prelims/history.html" class="btn-result-action btn-back-subject">इतिहास विषयाकडे परत जा</a>';
    html += '      </div>';
    html += '    </div>';

    // 2. Visual Performance Graph (SVG Donut Chart)
    var totalQ = quizData.questions.length;
    var pctCorrect = totalQ > 0 ? (results.correct / totalQ) * 100 : 0;
    var pctWrong = totalQ > 0 ? (results.wrong / totalQ) * 100 : 0;
    var pctUnans = totalQ > 0 ? (results.unanswered / totalQ) * 100 : 0;

    var circ = 251.32;
    var dashCorrect = (pctCorrect / 100) * circ;
    var dashWrong = (pctWrong / 100) * circ;
    var dashUnans = (pctUnans / 100) * circ;

    var offsetCorrect = 0;
    var offsetWrong = -dashCorrect;
    var offsetUnans = -(dashCorrect + dashWrong);

    html += '    <div class="analysis-section-card">';
    html += '      <h3 class="analysis-section-title"><span>कामगिरी आलेख (Performance Visual)</span><span style="font-size:0.75rem; color:var(--quiz-text-muted);">गुणवत्ता प्रमाण</span></h3>';
    html += '      <div class="visual-graph-layout">';
    html += '        <div class="donut-chart-wrap">';
    html += '          <svg class="donut-svg" viewBox="0 0 100 100">';
    html += '            <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--quiz-border)" stroke-width="12"></circle>';
    if (dashCorrect > 0) {
      html += '            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#2E7D32" stroke-width="12" stroke-dasharray="' + dashCorrect + ' ' + (circ - dashCorrect) + '" stroke-dashoffset="' + offsetCorrect + '"></circle>';
    }
    if (dashWrong > 0) {
      html += '            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#C62828" stroke-width="12" stroke-dasharray="' + dashWrong + ' ' + (circ - dashWrong) + '" stroke-dashoffset="' + offsetWrong + '"></circle>';
    }
    if (dashUnans > 0) {
      html += '            <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--quiz-text-dim)" stroke-width="12" stroke-dasharray="' + dashUnans + ' ' + (circ - dashUnans) + '" stroke-dashoffset="' + offsetUnans + '"></circle>';
    }
    html += '          </svg>';
    html += '          <div class="donut-center-stat">';
    html += '            <span class="donut-center-pct">' + results.accuracy + '%</span>';
    html += '            <span class="donut-center-lbl">अचूकता</span>';
    html += '          </div>';
    html += '        </div>';

    html += '        <div class="donut-legend-col">';
    html += '          <div class="donut-legend-item"><div class="donut-legend-left"><span class="donut-legend-dot" style="background:#2E7D32;"></span><span>बरोबर (Correct)</span></div><span>' + results.correct + ' (' + Math.round(pctCorrect) + '%)</span></div>';
    html += '          <div class="donut-legend-item"><div class="donut-legend-left"><span class="donut-legend-dot" style="background:#C62828;"></span><span>चुकीचे (Wrong)</span></div><span>' + results.wrong + ' (' + Math.round(pctWrong) + '%)</span></div>';
    html += '          <div class="donut-legend-item"><div class="donut-legend-left"><span class="donut-legend-dot" style="background:var(--quiz-text-dim);"></span><span>सोडवले नाही</span></div><span>' + results.unanswered + ' (' + Math.round(pctUnans) + '%)</span></div>';
    html += '        </div>';
    html += '      </div>';
    html += '    </div>';

    // 3. Time Analysis Card
    html += '    <div class="analysis-section-card">';
    html += '      <h3 class="analysis-section-title"><span>वेळ विश्लेषण (Time Analysis)</span><span style="font-size:0.75rem; color:var(--quiz-text-muted);">वेळ व्यवस्थापन</span></h3>';
    html += '      <div class="time-metrics-row">';
    html += '        <div class="time-metric-box"><div class="time-metric-title">एकूण वेळ</div><div class="time-metric-number">' + results.timeTaken + '</div></div>';
    html += '        <div class="time-metric-box"><div class="time-metric-title">सरासरी वेळ / प्रश्न</div><div class="time-metric-number">' + results.avgTimePerQ + ' सेकंद</div></div>';
    html += '        <div class="time-metric-box"><div class="time-metric-title">वेळ संपल्यामुळे सबमिट?</div><div class="time-metric-number">' + (results.wasTimeout ? 'होय (Timeout)' : 'नाही (User Submit)') + '</div></div>';
    html += '      </div>';
    html += '    </div>';

    // 4. Chapter-wise Performance
    html += '    <div class="analysis-section-card">';
    html += '      <h3 class="analysis-section-title"><span>घटकनिहाय कामगिरी (Chapter-wise Performance)</span><span style="font-size:0.75rem; color:var(--quiz-text-muted);">अभ्यास विश्लेषण</span></h3>';
    html += '      <div class="chapter-perf-list">';

    Object.keys(results.chapterStats).forEach(function (chKey) {
      var ch = results.chapterStats[chKey];
      var chAcc = ch.attempted > 0 ? Math.round((ch.correct / ch.attempted) * 100) : 0;
      html += '        <div class="chapter-perf-row">';
      html += '          <div class="chapter-perf-header">';
      html += '            <span class="chapter-perf-name">' + ch.name + '</span>';
      html += '            <span class="chapter-perf-score">' + ch.correct + '/' + ch.total + ' बरोबर (' + chAcc + '%)</span>';
      html += '          </div>';
      html += '          <div class="chapter-perf-progress">';
      html += '            <div class="chapter-perf-fill" style="width:' + chAcc + '%;"></div>';
      html += '          </div>';
      html += '        </div>';
    });

    html += '      </div>';
    html += '    </div>';

    // 5. Question Performance Quick Grid
    html += '    <div class="analysis-section-card">';
    html += '      <h3 class="analysis-section-title"><span>प्रश्न स्थिती तालिका (Question Performance)</span><span style="font-size:0.75rem; color:var(--quiz-text-muted);">तपासण्यासाठी क्लिक करा</span></h3>';
    html += '      <div class="question-pills-grid">';

    quizData.questions.forEach(function (q, idx) {
      var userAns = selectedAnswers[q.questionId];
      var isCorrect = userAns === q.correctAnswer;
      var isUnanswered = !userAns;
      var numStr = (idx + 1 < 10 ? '0' : '') + (idx + 1);

      var pillClass = isCorrect ? 'is-correct' : (isUnanswered ? 'is-unanswered' : 'is-wrong');
      var icon = isCorrect ? '✓' : (isUnanswered ? '—' : '✕');

      html += '        <button type="button" class="q-status-pill-btn ' + pillClass + '" data-scroll-q="' + idx + '">';
      html += numStr + ' ' + icon;
      html += '        </button>';
    });

    html += '      </div>';
    html += '    </div>';

    // 6. Detailed Answer Review Section
    html += '    <div class="review-questions-section" id="reviewQuestionsSection">';
    html += '      <h3 style="font-size:1.1rem; font-weight:800; color:var(--quiz-text); margin:0.4rem 0 0;">तपशीलवार उत्तर पत्रिका व स्पष्टीकरण (Detailed Review)</h3>';

    quizData.questions.forEach(function (q, idx) {
      var userAns = selectedAnswers[q.questionId];
      var isCorrect = userAns === q.correctAnswer;
      var isUnanswered = !userAns;

      var cardClass = isCorrect ? 'is-correct-card' : (isUnanswered ? 'is-unanswered-card' : 'is-wrong-card');
      var statusClass = isCorrect ? 'correct' : (isUnanswered ? 'unanswered' : 'wrong');
      var statusLabel = isCorrect ? '✓ बरोबर (+1.0)' : (isUnanswered ? '— सोडवले नाही (0.0)' : '✗ चुकीचे (-' + (quizData.negativeMarkingPerWrong || 0.25) + ')');

      var userAnsText = '—';
      var correctAnsText = '—';

      q.options.forEach(function (opt) {
        if (opt.id === userAns) userAnsText = opt.id + '. ' + opt.text.mr;
        if (opt.id === q.correctAnswer) correctAnsText = opt.id + '. ' + opt.text.mr;
      });

      var isReported = !!reportedQuestions[q.questionId];

      html += '      <div class="review-item-card ' + cardClass + '" id="review-card-item-' + idx + '">';
      html += '        <div style="display:flex; justify-content:space-between; align-items:center;">';
      html += '          <span style="font-size:0.8rem; font-weight:800; color:var(--quiz-primary);">प्रश्न ' + (idx + 1) + '</span>';
      html += '          <span class="review-status-badge ' + statusClass + '">' + statusLabel + '</span>';
      html += '        </div>';

      html += '        <div style="font-size:0.98rem; font-weight:700; color:var(--quiz-text);">' + q.question.mr + '</div>';
      if (q.question.en) {
        html += '        <div style="font-size:0.85rem; color:var(--quiz-text-muted);">' + q.question.en + '</div>';
      }

      // Review answers summary box
      html += '        <div class="review-options-summary">';
      html += '          <div><strong>आपले उत्तर:</strong> <span style="color:' + (isCorrect ? '#2E7D32' : (isUnanswered ? 'inherit' : '#C62828')) + ';">' + userAnsText + '</span></div>';
      html += '          <div><strong>योग्य उत्तर:</strong> <span style="color:#2E7D32; font-weight:700;">' + correctAnsText + '</span></div>';
      html += '        </div>';

      // Explanation box
      if (q.explanation) {
        html += '        <div class="review-explanation-box">';
        html += '          <div><strong>स्पष्टीकरण:</strong> ' + q.explanation.mr + '</div>';
        if (q.explanation.en) {
          html += '          <div style="margin-top:4px; font-size:0.8rem; color:var(--quiz-text-muted);">' + q.explanation.en + '</div>';
        }
        html += '        </div>';
      }

      // Footer with individual Report This Question button
      html += '        <div class="review-card-footer">';
      html += '          <span>घटक: ' + (quizData.chapterNameMr || 'इतिहास') + '</span>';
      html += '          <button type="button" class="btn-report-question ' + (isReported ? 'is-reported' : '') + '" data-report-qidx="' + idx + '" id="btnReportReviewQ_' + q.questionId + '">';
      html += '            <span>🚩</span> <span>' + (isReported ? 'Reported' : 'Report This Question') + '</span>';
      html += '          </button>';
      html += '        </div>';

      html += '      </div>'; // End review-item-card
    });

    html += '    </div>'; // End review section
    html += '  </div>';
    html += '</div>';

    if (els.resultContainer) {
      els.resultContainer.innerHTML = html;
      els.resultContainer.style.display = 'flex';
    }

    var scrollToRevBtn = document.getElementById('btnScrollToReview');
    if (scrollToRevBtn) {
      scrollToRevBtn.addEventListener('click', function () {
        var revSec = document.getElementById('reviewQuestionsSection');
        if (revSec) revSec.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Bind Quick Navigation Pills
    var quickNavPills = document.querySelectorAll('.q-status-pill-btn');
    quickNavPills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        var targetQ = pill.getAttribute('data-scroll-q');
        var card = document.getElementById('review-card-item-' + targetQ);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    // Bind individual Report Question Buttons in Review
    var reportBtns = document.querySelectorAll('.btn-report-question');
    reportBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var qIdx = parseInt(btn.getAttribute('data-report-qidx'), 10);
        triggerReportForQuestion(qIdx);
      });
    });
  }

  /* ==========================================================================
     11. FINAL Question Reporting System (Google Apps Script Web App)
     ========================================================================== */
  function triggerReportForQuestion(questionIdx) {
    if (!quizData || !quizData.questions[questionIdx]) return;
    var targetQ = quizData.questions[questionIdx];

    openReportModal({
      quizId: quizData.quizId || 'H-CH01-001',
      questionId: targetQ.questionId,
      questionNumber: questionIdx + 1,
      subject: quizData.subjectNameMr || quizData.subject || 'इतिहास',
      chapter: targetQ.chapterId || quizData.chapterId || 'H-01',
      question: targetQ.question.mr || targetQ.question.en || ''
    });
  }

  function openReportModal(payload) {
    activeReportPayload = payload;
    if (!els.reportModal) return;

    var reportInfoBox = document.getElementById('reportTargetInfo');
    if (reportInfoBox) {
      var questionSnippet = payload.question.length > 90
        ? payload.question.substring(0, 90) + '...'
        : payload.question;

      reportInfoBox.innerHTML = 
        '<div><strong>Quiz ID:</strong> ' + payload.quizId + ' • <strong>Question:</strong> #' + payload.questionNumber + ' (' + payload.questionId + ')</div>' +
        '<div><strong>Chapter:</strong> ' + payload.chapter + ' • <strong>Subject:</strong> ' + payload.subject + '</div>' +
        '<div style="margin-top:4px; color:var(--quiz-text-muted); font-style:italic;">"' + questionSnippet + '"</div>';
    }

    // Reset form elements
    var issueSelect = document.getElementById('reportIssueSelect');
    var detailsTextarea = document.getElementById('reportDetailsTextarea');
    var errorEl = document.getElementById('reportValidationError');
    var submitBtn = document.getElementById('btnSubmitReport');

    if (issueSelect) {
      issueSelect.value = '';
      issueSelect.classList.remove('has-error');
    }
    if (detailsTextarea) {
      detailsTextarea.value = '';
    }
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = 'Please select an issue.';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }

    isSubmittingReport = false;
    els.reportModal.classList.add('is-open');

    if (issueSelect) {
      setTimeout(function () {
        issueSelect.focus();
      }, 50);
    }
  }

  function closeReportModal() {
    if (els.reportModal) els.reportModal.classList.remove('is-open');
    activeReportPayload = null;
    isSubmittingReport = false;
  }

  function executeReportSubmission() {
    if (!activeReportPayload || isSubmittingReport) return;

    var issueSelect = document.getElementById('reportIssueSelect');
    var detailsTextarea = document.getElementById('reportDetailsTextarea');
    var errorEl = document.getElementById('reportValidationError');
    var submitBtn = document.getElementById('btnSubmitReport');

    var issueValue = issueSelect ? issueSelect.value.trim() : '';

    // Validation: Issue dropdown is REQUIRED
    if (!issueValue) {
      if (errorEl) {
        errorEl.textContent = 'Please select an issue.';
        errorEl.style.display = 'block';
      }
      if (issueSelect) {
        issueSelect.classList.add('has-error');
        issueSelect.focus();
      }
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    if (issueSelect) issueSelect.classList.remove('has-error');

    var additionalDetailsValue = detailsTextarea ? detailsTextarea.value.trim() : '';

    // Build payload exactly as configured in Google Sheet schema
    var payload = {
      quizId: activeReportPayload.quizId,
      questionId: activeReportPayload.questionId,
      questionNumber: activeReportPayload.questionNumber,
      subject: activeReportPayload.subject,
      chapter: activeReportPayload.chapter,
      question: activeReportPayload.question,
      issue: issueValue,
      additionalDetails: additionalDetailsValue
    };

    var reportedQId = activeReportPayload.questionId;

    // Duplicate submission protection
    isSubmittingReport = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    // Send data to Google Apps Script Web App
    fetch(REPORT_APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    })
      .then(function () {
        // Track reported status in session
        reportedQuestions[reportedQId] = true;
        persistState();
        updateReportButtonsState(reportedQId);

        // Success toast notification
        showToast('Report submitted successfully.');

        // Automatically close modal
        closeReportModal();
      })
      .catch(function (err) {
        console.error('Google Sheets report error:', err);
        isSubmittingReport = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Report';
        }
        if (errorEl) {
          errorEl.textContent = 'Failed to submit report. Please check your connection and try again.';
          errorEl.style.display = 'block';
        }
      });
  }

  function updateReportButtonsState(questionId) {
    // Update active question report button if open
    var btnActive = document.getElementById('btnReportActiveQuestion');
    if (btnActive && quizData && quizData.questions[currentQuestionIndex] && quizData.questions[currentQuestionIndex].questionId === questionId) {
      btnActive.classList.add('is-reported');
      btnActive.innerHTML = '<span>🚩</span> <span>Reported</span>';
    }

    // Update review list button if present
    var btnReview = document.getElementById('btnReportReviewQ_' + questionId);
    if (btnReview) {
      btnReview.classList.add('is-reported');
      btnReview.innerHTML = '<span>🚩</span> <span>Reported</span>';
    }
  }

  function showToast(message) {
    var existingToast = document.querySelector('.quiz-toast-notification');
    if (existingToast && existingToast.parentNode) {
      existingToast.parentNode.removeChild(existingToast);
    }

    var toast = document.createElement('div');
    toast.className = 'quiz-toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(function () {
      toast.classList.add('is-visible');
    }, 20);

    // Animate out
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3200);
  }

  /* ==========================================================================
     12. Event Listeners & Binding
     ========================================================================== */
  function bindEvents() {
    // Navigation controls
    if (els.prevBtn) els.prevBtn.addEventListener('click', goPrev);
    if (els.nextBtn) els.nextBtn.addEventListener('click', goNext);
    if (els.submitBtn) els.submitBtn.addEventListener('click', openSubmitModal);
    if (els.exitBtn) els.exitBtn.addEventListener('click', openExitModal);
    if (els.mobileExitBtn) els.mobileExitBtn.addEventListener('click', openExitModal);

    // Font Toggle (Desktop & Mobile)
    if (els.fontToggleBtn) els.fontToggleBtn.addEventListener('click', cycleFontSize);
    if (els.mobileFontToggleBtn) els.mobileFontToggleBtn.addEventListener('click', cycleFontSize);

    // Mark for Review (Manual Toggle — Remains on current question)
    if (els.markReviewBtn) els.markReviewBtn.addEventListener('click', toggleCurrentMarkReviewManual);

    // Mobile Left Palette Drawer Toggle
    if (els.mobilePaletteToggle) els.mobilePaletteToggle.addEventListener('click', openMobilePalette);
    if (els.mobilePaletteClose) els.mobilePaletteClose.addEventListener('click', closeMobilePalette);
    if (els.mobilePaletteOverlay) els.mobilePaletteOverlay.addEventListener('click', closeMobilePalette);

    // Exit Modal Buttons
    var btnCancelExit = document.getElementById('btnCancelExit');
    var btnConfirmExit = document.getElementById('btnConfirmExit');
    if (btnCancelExit) btnCancelExit.addEventListener('click', closeExitModal);
    if (btnConfirmExit) btnConfirmExit.addEventListener('click', confirmExit);

    // Submit Modal Buttons
    var btnCancelSubmit = document.getElementById('btnCancelSubmit');
    var btnConfirmSubmit = document.getElementById('btnConfirmSubmit');
    if (btnCancelSubmit) btnCancelSubmit.addEventListener('click', closeSubmitModal);
    if (btnConfirmSubmit) btnConfirmSubmit.addEventListener('click', function () {
      closeSubmitModal();
      executeSubmission(false);
    });

    // Report Modal Controls (English only action buttons)
    var btnCancelReport = document.getElementById('btnCancelReport');
    var btnSubmitReport = document.getElementById('btnSubmitReport');
    var btnCloseReportX = document.getElementById('btnCloseReportX');
    var issueSelect = document.getElementById('reportIssueSelect');

    if (btnCancelReport) btnCancelReport.addEventListener('click', closeReportModal);
    if (btnCloseReportX) btnCloseReportX.addEventListener('click', closeReportModal);
    if (btnSubmitReport) btnSubmitReport.addEventListener('click', executeReportSubmission);

    if (issueSelect) {
      issueSelect.addEventListener('change', function () {
        var errorEl = document.getElementById('reportValidationError');
        if (issueSelect.value.trim()) {
          issueSelect.classList.remove('has-error');
          if (errorEl) errorEl.style.display = 'none';
        }
      });
    }

    // Keyboard ESC to close open modals or left palette
    document.addEventListener('keydown', function (e) {
      if (isSubmitted && (!els.reportModal || !els.reportModal.classList.contains('is-open'))) return;
      if (e.key === 'Escape') {
        closeMobilePalette();
        closeExitModal();
        closeSubmitModal();
        closeReportModal();
      }
    });

    // Prevent accidental reload during quiz
    window.addEventListener('beforeunload', function (e) {
      if (!isSubmitted && quizData) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ==========================================================================
     13. Engine Entry
     ========================================================================== */
  function init() {
    initElements();
    bindEvents();
    loadQuiz();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
