/**
 * StudySphere — Main Controller (assets/js/main.js)
 * Responsible for:
 *   - Mobile Right-Side Navigation Drawer (Open, Close, Escape, Overlay Backdrop)
 *   - Body Scroll Locking during Mobile Drawer Display
 *   - Theme Controller (Light / Dark) & LocalStorage Persistence
 *   - Font Size Controller (Small / Medium / Large) & LocalStorage Persistence
 *   - Section Heading Smooth Scroll Anchor Interceptor with Sticky Header Offset
 *   - Donation Modal Controller (Mobile amount inputs vs Desktop QR)
 */

(function () {
  'use strict';

  var root = document.documentElement;

  /* ==========================================================================
     1. Mobile Right-Side Navigation Drawer
     ========================================================================== */
  var drawerElement = null;
  var overlayElement = null;
  var isDrawerOpen = false;

  function openDrawer() {
    if (!drawerElement) drawerElement = document.getElementById('drawerMenu');
    if (!overlayElement) overlayElement = document.getElementById('drawerOverlay');

    if (drawerElement) {
      drawerElement.classList.add('active');
      drawerElement.setAttribute('aria-hidden', 'false');
    }
    if (overlayElement) {
      overlayElement.classList.add('active');
      overlayElement.setAttribute('aria-hidden', 'false');
    }

    var toggleBtn = document.getElementById('mobile-drawer-toggle');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
    }

    document.body.style.overflow = 'hidden';
    isDrawerOpen = true;

    if (drawerElement) {
      var firstFocusable = drawerElement.querySelector('button, [href], input, [tabindex="0"]');
      if (firstFocusable) firstFocusable.focus();
    }
  }

  function closeDrawer() {
    if (!drawerElement) drawerElement = document.getElementById('drawerMenu');
    if (!overlayElement) overlayElement = document.getElementById('drawerOverlay');

    if (drawerElement) {
      drawerElement.classList.remove('active');
      drawerElement.setAttribute('aria-hidden', 'true');
    }
    if (overlayElement) {
      overlayElement.classList.remove('active');
      overlayElement.setAttribute('aria-hidden', 'true');
    }

    var toggleBtn = document.getElementById('mobile-drawer-toggle');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
    }

    document.body.style.overflow = '';
    isDrawerOpen = false;
  }

  function toggleDrawer(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  /* ==========================================================================
     2. Theme Management (Light / Dark)
     ========================================================================== */
  var THEME_STORAGE_KEY = 'studysphere_theme';
  var VALID_THEMES = ['light', 'dark'];

  function getStoredTheme() {
    try {
      var saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && VALID_THEMES.indexOf(saved) !== -1) {
        return saved;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyTheme(theme) {
    if (VALID_THEMES.indexOf(theme) === -1) theme = 'light';
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {}

    var themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
      themeBtn.setAttribute('title', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    }

    window.dispatchEvent(new CustomEvent('studysphere:themechange', { detail: { theme: theme } }));
  }

  function toggleTheme() {
    var current = root.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  /* ==========================================================================
     3. Font Size Management (Small / Medium / Large)
     ========================================================================== */
  var FONT_STORAGE_KEY = 'studysphere_font_size';
  var FONT_TIERS = ['small', 'medium', 'large'];

  function getStoredFontSize() {
    try {
      var saved = localStorage.getItem(FONT_STORAGE_KEY);
      if (saved && FONT_TIERS.indexOf(saved) !== -1) {
        return saved;
      }
    } catch (e) {}
    return 'medium';
  }

  function applyFontSize(size) {
    if (FONT_TIERS.indexOf(size) === -1) size = 'medium';
    root.setAttribute('data-font-size', size);
    try {
      localStorage.setItem(FONT_STORAGE_KEY, size);
    } catch (e) {}

    var fontBtn = document.getElementById('font-size-btn');
    if (fontBtn) {
      var indicator = size === 'small' ? 'A⁻' : (size === 'large' ? 'A⁺' : 'A');
      fontBtn.textContent = indicator;
      fontBtn.setAttribute('title', 'Font Size: ' + size.charAt(0).toUpperCase() + size.slice(1) + ' (click to cycle)');
      fontBtn.setAttribute('aria-label', 'Font Size: ' + size.charAt(0).toUpperCase() + size.slice(1) + ' (click to cycle)');
    }

    window.dispatchEvent(new CustomEvent('studysphere:fontsizechange', { detail: { size: size } }));
  }

  function cycleFontSize() {
    var current = root.getAttribute('data-font-size') || 'medium';
    var currentIndex = FONT_TIERS.indexOf(current);
    var nextIndex = (currentIndex + 1) % FONT_TIERS.length;
    applyFontSize(FONT_TIERS[nextIndex]);
  }

  /* ==========================================================================
     4. Smooth Scroll To Section Heading
     ========================================================================== */
  function navigateToSection(targetId) {
    if (!targetId) return;
    var target = document.getElementById(targetId);
    if (!target) return;

    closeDrawer();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ==========================================================================
     5. Donation Modal Controller
     ========================================================================== */
  var donationModal = null;
  var thankYouModal = null;
  var selectedAmount = 50;
  var UPI_ID = 'vikram.joshi9089@oksbi';
  var lastFocusedElement = null;

  function isMobileDevice() {
    return window.innerWidth < 768;
  }

  function openDonationModal() {
    if (!donationModal) donationModal = document.getElementById('donationModal');
    if (!donationModal) return;

    lastFocusedElement = document.activeElement;

    var mobileSection = document.getElementById('donateMobileView');
    var desktopSection = document.getElementById('donateDesktopView');
    var isMobile = isMobileDevice();

    if (mobileSection && desktopSection) {
      if (isMobile) {
        mobileSection.style.display = 'block';
        desktopSection.style.display = 'none';
        resetMobileDonationForm();
      } else {
        mobileSection.style.display = 'none';
        desktopSection.style.display = 'block';
      }
    }

    donationModal.classList.add('active');
    donationModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    var closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  function closeDonationModal() {
    if (!donationModal) donationModal = document.getElementById('donationModal');
    if (donationModal) {
      donationModal.classList.remove('active');
      donationModal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function resetMobileDonationForm() {
    selectedAmount = 50;
    var customInput = document.getElementById('customAmountInput');
    if (customInput) customInput.value = '';

    var errorMsg = document.getElementById('donateErrorMsg');
    if (errorMsg) errorMsg.classList.remove('visible');

    var presetButtons = document.querySelectorAll('.btn-preset');
    presetButtons.forEach(function (btn) {
      if (parseInt(btn.getAttribute('data-amount'), 10) === 50) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function openThankYouModal() {
    if (!thankYouModal) thankYouModal = document.getElementById('thankYouModal');
    if (thankYouModal) {
      thankYouModal.classList.add('active');
      thankYouModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      var closeBtn = document.getElementById('thankYouCloseBtn');
      if (closeBtn) closeBtn.focus();
    }
  }

  function closeThankYouModal() {
    if (!thankYouModal) thankYouModal = document.getElementById('thankYouModal');
    if (thankYouModal) {
      thankYouModal.classList.remove('active');
      thankYouModal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function handlePayNow() {
    var customInput = document.getElementById('customAmountInput');
    var errorMsg = document.getElementById('donateErrorMsg');
    var amountToPay = selectedAmount;

    if (customInput && customInput.value.trim() !== '') {
      var rawVal = customInput.value.trim();
      var parsed = parseFloat(rawVal);

      if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0 || /[^0-9.]/.test(rawVal)) {
        if (errorMsg) {
          errorMsg.textContent = 'कृपया योग्य रक्कम प्रविष्ट करा (उदा. ₹50, ₹100).';
          errorMsg.classList.add('visible');
        }
        return;
      }
      amountToPay = Math.round(parsed);
    }

    if (errorMsg) errorMsg.classList.remove('visible');

    var upiUrl = 'upi://pay?pa=' + encodeURIComponent(UPI_ID) +
                 '&pn=' + encodeURIComponent('StudySphere Support') +
                 '&am=' + encodeURIComponent(amountToPay) +
                 '&cu=INR&tn=' + encodeURIComponent('Support StudySphere Educational Platform');

    closeDonationModal();

    try {
      window.location.href = upiUrl;
    } catch (e) {}

    setTimeout(function () {
      openThankYouModal();
    }, 1200);
  }

  /* ==========================================================================
     6. Initialization & Safe Event Binding
     ========================================================================== */
  function init() {
    // 1. Theme & Font Size
    applyTheme(getStoredTheme());
    applyFontSize(getStoredFontSize());

    var themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.onclick = toggleTheme;

    var fontBtn = document.getElementById('font-size-btn');
    if (fontBtn) fontBtn.onclick = cycleFontSize;

    // 2. Mobile Drawer Navigation
    drawerElement = document.getElementById('drawerMenu');
    overlayElement = document.getElementById('drawerOverlay');

    var mobileToggleBtn = document.getElementById('mobile-drawer-toggle');
    if (mobileToggleBtn) mobileToggleBtn.onclick = toggleDrawer;

    var drawerCloseBtn = document.getElementById('mobile-drawer-close');
    if (drawerCloseBtn) drawerCloseBtn.onclick = closeDrawer;

    if (overlayElement) overlayElement.onclick = closeDrawer;

    if (drawerElement) {
      var drawerLinks = drawerElement.querySelectorAll('a');
      drawerLinks.forEach(function (link) {
        link.onclick = function () {
          closeDrawer();
        };
      });
    }

    // 3. Donation Triggers (Both Desktop and Drawer-based)
    var donateButtons = document.querySelectorAll('#donate-btn, #drawer-donate-btn, #footer-donate-btn');
    donateButtons.forEach(function (btn) {
      btn.onclick = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        closeDrawer();
        openDonationModal();
      };
    });

    var modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) modalCloseBtn.onclick = closeDonationModal;

    var donationBackdrop = document.getElementById('donationModal');
    if (donationBackdrop) {
      donationBackdrop.onclick = function (e) {
        if (e.target === donationBackdrop) closeDonationModal();
      };
    }

    // 4. Donation Presets and Inputs
    var presetButtons = document.querySelectorAll('.btn-preset');
    var customInput = document.getElementById('customAmountInput');
    var errorMsg = document.getElementById('donateErrorMsg');

    presetButtons.forEach(function (btn) {
      btn.onclick = function () {
        presetButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedAmount = parseInt(btn.getAttribute('data-amount'), 10);
        if (customInput) customInput.value = '';
        if (errorMsg) errorMsg.classList.remove('visible');
      };
    });

    if (customInput) {
      customInput.oninput = function () {
        presetButtons.forEach(function (b) { b.classList.remove('active'); });
        if (errorMsg) errorMsg.classList.remove('visible');
      };
    }

    var payNowBtn = document.getElementById('payNowBtn');
    if (payNowBtn) payNowBtn.onclick = handlePayNow;

    var thankYouCloseBtn = document.getElementById('thankYouCloseBtn');
    if (thankYouCloseBtn) thankYouCloseBtn.onclick = closeThankYouModal;

    var thankYouBackdrop = document.getElementById('thankYouModal');
    if (thankYouBackdrop) {
      thankYouBackdrop.onclick = function (e) {
        if (e.target === thankYouBackdrop) closeThankYouModal();
      };
    }

    // 5. Section Quick Navigation Buttons (both on-page dock and inside mobile drawer)
    var quickNavButtons = document.querySelectorAll('.btn-quick-nav, .btn-drawer-quick-nav');
    quickNavButtons.forEach(function (btn) {
      btn.onclick = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var targetId = btn.getAttribute('data-target') || 'prelims-section';
        navigateToSection(targetId);
      };
    });

    // 6. Global Escape Key Listener
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (isDrawerOpen) closeDrawer();
        closeDonationModal();
        closeThankYouModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Global Namespace Export
  window.StudySphere = window.StudySphere || {};
  window.StudySphere.theme = { get: getStoredTheme, set: applyTheme, toggle: toggleTheme };
  window.StudySphere.font = { get: getStoredFontSize, set: applyFontSize, cycle: cycleFontSize };
  window.StudySphere.nav = { open: openDrawer, close: closeDrawer, toggle: toggleDrawer, scrollTo: navigateToSection };
  window.StudySphere.donate = { open: openDonationModal, close: closeDonationModal };
})();