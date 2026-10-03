/**
 * StudySphere — Standalone Quiz Engine Controller (assets/js/quiz.js)
 * Updates & Corrections:
 *   1. Auto-next upon answer selection with clean, jump-free rendering.
 *   2. Auto-next upon Mark for Review.
 *   3. Strict zero-scroll guarantee on question selection (viewport-contained).
 *   4. Mobile Context Header synchronization.
 *   5. Mobile bottom control bar non-overflowing two-tier fit.
 *   6. Prefilled Telegram reporting URL intent with preloaded message compose body.
 *   7. Strictly empty initial answers.
 */

(function () {
  'use strict';

  // Configurable Reporting Destination (MPSCstudysphere Telegram channel)
  var REPORT_TELEGRAM_USERNAME = 'MPSCstudysphere';

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

  var FONT_SIZES = ['small', 'medium', 'large'];
  var STORAGE_KEY_PREFIX = 'studysphere_quiz_state_';
  var FONT_STORAGE_KEY = 'studysphere_quiz_font_size';

  // Active question payload being reported
  var activeReportPayload = null;

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
        currentFontSize = 'small'; // Strict default
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

    // Clean old demo states that might have had pre-selected answers
    if (savedState && !savedState.isSubmitted && savedState.remainingSeconds > 0) {
      currentQuestionIndex = savedState.currentQuestionIndex || 0;
      selectedAnswers = savedState.selectedAnswers || {}; // only user-clicked answers
      markedQuestions = savedState.markedQuestions || {};
      visitedQuestions = savedState.visitedQuestions || {};
      remainingSeconds = savedState.remainingSeconds;
    } else {
      currentQuestionIndex = 0;
      selectedAnswers = {}; // STRICTLY EMPTY: Question 1 starts unanswered
      markedQuestions = {};
      visitedQuestions = {};
      remainingSeconds = (quizData.durationMinutes || 5) * 60;
    }

    if (quizData.questions[currentQuestionIndex]) {
      visitedQuestions[quizData.questions[currentQuestionIndex].questionId] = true;
    }
  }

  function persistState() {
    if (isSubmitted || !quizData) return;
    var state = {
      quizId: quizData.quizId,
      currentQuestionIndex: currentQuestionIndex,
      selectedAnswers: selectedAnswers,
      markedQuestions: markedQuestions,
      visitedQuestions: visitedQuestions,
      remainingSeconds: remainingSeconds,
      isSubmitted: false
    };
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state));
    } catch (e) {}
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
     5. Unified Question & Options Rendering (Zero-Scroll Jump)
     ========================================================================== */
  function renderQuestion(index) {
    if (!quizData || !quizData.questions[index]) return;
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

    // Construct ONE Common Card Box
    var html = '';
    html += '<div class="quiz-unified-box">';

    // Question Header Meta
    html += '  <div class="question-header-meta">';
    html += '    <span class="question-number-tag">प्रश्न ' + qNumFormatted + ' / ' + total + '</span>';
    html += '    <span class="marks-pill-tag">गुण: ' + (q.marks || 1) + ' | उणे: ' + (quizData.negativeMarkingPerWrong || 0.25) + '</span>';
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

    // Bind Option Selection with Auto-Next
    var optionCards = els.questionContent.querySelectorAll('.option-card-row');
    optionCards.forEach(function (card) {
      function choose(e) {
        if (e && e.preventDefault) e.preventDefault();
        var optId = card.getAttribute('data-option-id');
        handleOptionSelectWithAutoNext(q.questionId, optId, card);
      }
      card.addEventListener('click', choose);
    });

    renderPaletteGrids();
  }

  /* ==========================================================================
     6. Auto-Next on Answer Selection (Zero Scroll Jump)
     ========================================================================== */
  function handleOptionSelectWithAutoNext(questionId, optionId, cardElement) {
    selectedAnswers[questionId] = optionId;
    persistState();

    // Tactile immediate visual response
    var allCards = els.questionContent.querySelectorAll('.option-card-row');
    allCards.forEach(function (c) { c.classList.remove('is-selected'); });
    if (cardElement) cardElement.classList.add('is-selected');

    renderPaletteGrids();

    var isLast = currentQuestionIndex === quizData.questions.length - 1;

    setTimeout(function () {
      if (isLast) {
        // Last question: update footer controls & trigger submit flow
        updateNavigationControls();
        openSubmitModal();
      } else {
        // Automatically advance to next question
        renderQuestion(currentQuestionIndex + 1);
      }
    }, 180);
  }

  /* ==========================================================================
     7. Auto-Next on Mark for Review
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

  function toggleCurrentMarkReviewAndAdvance() {
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

    var isLast = currentQuestionIndex === quizData.questions.length - 1;

    setTimeout(function () {
      if (isLast) {
        updateNavigationControls();
        openSubmitModal();
      } else {
        renderQuestion(currentQuestionIndex + 1);
      }
    }, 150);
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
     10. Result Screen & Detailed Review
     ========================================================================== */
  function executeSubmission(wasTimeout) {
    clearInterval(timerInterval);
    isSubmitted = true;
    clearActiveState();

    var totalQuestions = quizData.questions.length;
    var totalMarks = quizData.totalMarks || totalQuestions;
    var negRate = quizData.negativeMarkingPerWrong || 0.25;

    var correctCount = 0;
    var wrongCount = 0;
    var unansweredCount = 0;

    quizData.questions.forEach(function (q) {
      var userAns = selectedAnswers[q.questionId];
      if (!userAns) {
        unansweredCount++;
      } else if (userAns === q.correctAnswer) {
        correctCount++;
      } else {
        wrongCount++;
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
      wasTimeout: wasTimeout
    });
  }

  function renderResultScreen(results) {
    if (els.workspace) els.workspace.style.display = 'none';
    if (els.controlBar) els.controlBar.style.display = 'none';

    if (els.timerPill) els.timerPill.style.display = 'none';
    if (els.mobileTimerPill) els.mobileTimerPill.style.display = 'none';
    if (els.counterCenter) els.counterCenter.textContent = 'निकाल (Result)';
    if (els.mobileCounter) els.mobileCounter.textContent = 'निकाल (Result)';

    var html = '';
    html += '<div class="result-viewport-scroll">';
    html += '  <div class="result-card-container">';

    // Score Card
    html += '    <div class="score-hero-card">';
    html += '      <span class="score-badge-label">MPSC Group C 2026 • सराव चाचणी निकाल</span>';
    html += '      <div class="score-numbers-main">' + results.score + ' <span class="score-fraction-sub">/ ' + results.totalMarks + '</span></div>';
    html += '      <p style="font-size:0.9rem; color:var(--quiz-text-muted); margin:4px 0 0;">' + (results.percentage >= 60 ? 'उत्कृष्ट कामगिरी! सराव असाच सुरू ठेवा.' : 'चांगला प्रयत्न! चुकीच्या प्रश्नांचे पुनरावलोकन करून सुधारणा करा.') + '</p>';

    // Analytics Grid
    html += '      <div class="result-analytics-grid">';
    html += '        <div class="analytics-card"><span class="analytics-val correct">' + results.correct + '</span><span class="analytics-lbl">बरोबर (Correct)</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val wrong">' + results.wrong + '</span><span class="analytics-lbl">चुकीचे (Wrong)</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val">' + results.unanswered + '</span><span class="analytics-lbl">सोडवले नाही</span></div>';
    html += '        <div class="analytics-card"><span class="analytics-val">' + results.accuracy + '%</span><span class="analytics-lbl">अचूकता (Accuracy)</span></div>';
    html += '      </div>';

    // Summary Details
    html += '      <div style="margin-top:1rem; padding-top:10px; border-top:1px solid var(--quiz-border); font-size:0.8rem; color:var(--quiz-text-muted); display:flex; justify-content:space-around;">';
    html += '        <span>उणे गुण: -' + results.negativeDeduction + '</span>';
    html += '        <span>वेळ: ' + results.timeTaken + '</span>';
    html += '      </div>';

    // Actions
    html += '      <div class="result-actions-bar">';
    html += '        <button type="button" class="btn-result-action btn-review-answers" id="btnScrollToReview">उत्तर पत्रिका तपासा (Review Answers) ↓</button>';
    html += '        <a href="../subjects/prelims/history.html" class="btn-result-action btn-back-subject">इतिहास विषयाकडे परत जा</a>';
    html += '      </div>';
    html += '    </div>';

    // Review Answers Section
    html += '    <div class="review-questions-section" id="reviewQuestionsSection">';
    html += '      <h3 style="font-size:1.15rem; font-weight:800; color:var(--quiz-text); margin:0.5rem 0 0;">तपशीलवार उत्तर पत्रिका व स्पष्टीकरण (Detailed Review)</h3>';

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

      html += '      <div class="review-item-card ' + cardClass + '">';
      html += '        <div style="display:flex; justify-content:space-between; align-items:center;">';
      html += '          <span style="font-size:0.8rem; font-weight:800; color:var(--quiz-primary);">प्रश्न ' + (idx + 1) + '</span>';
      html += '          <span class="review-status-badge ' + statusClass + '">' + statusLabel + '</span>';
      html += '        </div>';

      html += '        <div style="font-size:1rem; font-weight:700; color:var(--quiz-text);">' + q.question.mr + '</div>';
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
      html += '          <button type="button" class="btn-report-question" data-report-qidx="' + (idx + 1) + '" data-report-qid="' + q.questionId + '" data-report-chapter="' + (q.chapterId || quizData.chapterId || 'H-01') + '">';
      html += '            <span>🚩 Report This Question</span>';
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

    // Bind individual Report Question Buttons
    var reportBtns = document.querySelectorAll('.btn-report-question');
    reportBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var qId = btn.getAttribute('data-report-qid');
        var qIdx = btn.getAttribute('data-report-qidx');
        var chId = btn.getAttribute('data-report-chapter');

        var matchedQ = quizData.questions.filter(function (item) {
          return item.questionId === qId;
        })[0];

        openReportModal({
          quizTitle: quizData.titleMr || quizData.title,
          quizId: quizData.quizId,
          subject: quizData.subjectNameMr || 'इतिहास (History)',
          chapterName: quizData.chapterNameMr || 'आधुनिक भारताचा इतिहास',
          chapterId: chId,
          questionNumber: qIdx,
          questionId: qId,
          questionText: matchedQ ? matchedQ.question.mr : ''
        });
      });
    });
  }

  /* ==========================================================================
     11. Telegram Question Reporting (Prefilled Compose Intent)
     ========================================================================== */
  function openReportModal(payload) {
    activeReportPayload = payload;
    if (!els.reportModal) return;

    var reportInfoBox = document.getElementById('reportTargetInfo');
    if (reportInfoBox) {
      reportInfoBox.innerHTML = 
        '<div><strong>चाचणी:</strong> ' + payload.quizTitle + ' (' + payload.quizId + ')</div>' +
        '<div><strong>प्रश्न क्र.:</strong> प्रश्न ' + payload.questionNumber + ' (' + payload.questionId + ')</div>' +
        '<div><strong>घटक:</strong> ' + payload.chapterName + ' (' + payload.chapterId + ')</div>' +
        '<div style="font-size:0.8rem; margin-top:4px; color:var(--quiz-text-muted);">' + payload.questionText.substring(0, 110) + '...</div>';
    }

    els.reportModal.classList.add('is-open');
  }

  function closeReportModal() {
    if (els.reportModal) els.reportModal.classList.remove('is-open');
    activeReportPayload = null;
  }

  function executeReportSubmission() {
    if (!activeReportPayload) return;
    var reasonSelect = document.getElementById('reportReasonSelect');
    var reasonVal = reasonSelect ? reasonSelect.value : 'Typo / Answer Error';

    // Construct Telegram Report Message exactly as specified
    var reportText = 
      'MPSC Group C 2026 — Quiz Question Report\n' +
      'Quiz: ' + activeReportPayload.quizTitle + '\n' +
      'Quiz ID: ' + activeReportPayload.quizId + '\n' +
      'Subject: ' + activeReportPayload.subject + '\n' +
      'Chapter: ' + activeReportPayload.chapterId + ' — ' + activeReportPayload.chapterName + '\n' +
      'Question ID: ' + activeReportPayload.questionId + '\n' +
      'Question Number: ' + activeReportPayload.questionNumber + '\n' +
      'Issue: ' + reasonVal + '\n' +
      'Question:\n' +
      activeReportPayload.questionText;

    // Direct Telegram compose share URL (puts the text right into the message compose box)
    var telegramShareUrl = 'https://t.me/share/url?text=' + encodeURIComponent(reportText);

    // Also copy to clipboard as an instant fallback
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText);
      }
    } catch (e) {}

    closeReportModal();

    // Open Telegram with prefilled compose message
    window.open(telegramShareUrl, '_blank', 'noopener,noreferrer');

    // Friendly Toast notification
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#2E7D32; color:#fff; padding:10px 18px; border-radius:9999px; font-weight:700; font-size:0.85rem; z-index:3000; box-shadow:0 4px 14px rgba(0,0,0,0.2);';
    toast.textContent = 'Telegram उघडले (तपशील भरले आहेत — फक्त Send दाबा)';
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3500);
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

    // Mark for Review & Advance
    if (els.markReviewBtn) els.markReviewBtn.addEventListener('click', toggleCurrentMarkReviewAndAdvance);

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

    // Report Modal Buttons
    var btnCancelReport = document.getElementById('btnCancelReport');
    var btnSubmitReport = document.getElementById('btnSubmitReport');
    if (btnCancelReport) btnCancelReport.addEventListener('click', closeReportModal);
    if (btnSubmitReport) btnSubmitReport.addEventListener('click', executeReportSubmission);

    // Keyboard ESC to close any open modal or left palette
    document.addEventListener('keydown', function (e) {
      if (isSubmitted) return;
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