// Global Functions (Available immediately)
window.showToast = function (message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? 'ti-circle-check' : 'ti-alert-circle';

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="ti ${icon}"></i>
        </div>
        <div class="toast-content">
            <p class="toast-message">${message}</p>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 500); // Match CSS animation duration
    }, 4000);
};

window.logout = async function (e) {
    if (e) e.preventDefault();
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (_) { }
    // Also clear any legacy localStorage
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('auth_provider');
    const isEn = window.location.pathname.includes('/en/');
    window.location.href = isEn ? '/en/index.html' : '/index.html';
};

(function () {
    'use strict';


    // 1. Preloader Logic
    function hidePreloader() {
        const preloader = document.querySelector('.preloader');
        if (preloader && !preloader.classList.contains('loaded')) {
            preloader.classList.add('loaded');
            setTimeout(() => preloader.classList.add('hidden'), 600);
        }
    }
    window.addEventListener('load', hidePreloader);
    setTimeout(hidePreloader, 3000); // Fallback

    // 2. Update Year
    document.querySelectorAll('.currentYear').forEach(el => el.textContent = new Date().getFullYear());

    // 3. Navbar Toggle
    const navBtn = document.querySelector('.navbar-toggle-btn');
    const navMenu = document.querySelector('.navbar-toggle-item');
    const navOverlay = document.querySelector('.nav-overlay');

    function toggleNav() {
        navBtn?.classList.toggle('active');
        navMenu?.classList.toggle('active');
        navOverlay?.classList.toggle('active');
        document.body.style.overflow = navMenu?.classList.contains('active') ? 'hidden' : '';
    }

    navBtn?.addEventListener('click', toggleNav);
    navOverlay?.addEventListener('click', toggleNav);

    // 4. Custom Cursor Effect
    const cursor = document.querySelector('.cursor');
    if (cursor && window.matchMedia('(pointer: fine)').matches) {
        let cx = 0, cy = 0, tx = 0, ty = 0;
        document.addEventListener('mousemove', (e) => {
            tx = e.clientX;
            ty = e.clientY;
        });

        function loop() {
            cx += (tx - cx) * 0.15;
            cy += (ty - cy) * 0.15;
            cursor.style.left = `${cx}px`;
            cursor.style.top = `${cy}px`;
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);

        document.querySelectorAll('a, button, .cursor-scale').forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('grow'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('grow'));
        });
    }

    // 5. Scroll Reveal Animations
    const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    revealEls.forEach(el => revealObserver.observe(el));

    // 6. Leaderboard Specific Animations
    const lbEls = document.querySelectorAll('.lb-podium-card, .lb-row');
    const lbObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.classList.contains('lb-podium-card')) {
                    entry.target.classList.add('lb-podium-visible');
                } else {
                    entry.target.classList.add('lb-row-visible');
                }
                lbObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    lbEls.forEach(el => lbObserver.observe(el));

    // 7. Auth State — check real session from server
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'success') {
        // Clean URL after redirect
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Fetch real user from session
    fetch('/api/me')
        .then(r => r.json())
        .then(data => {
            if (data.loggedIn && data.user) {
                setupLoggedInUI(data.user);
            }
        })
        .catch(() => { });

    function setupLoggedInUI(user) {
        const userName = user.username || 'User';
        const isEn = window.location.pathname.includes('/en/');
        const avatar = isEn ? '../logo.png' : 'logo.png';

        // Update Login Page specifically if we are on it
        const discordCard = document.getElementById('discord-login-status');
        const steamCard = document.getElementById('steam-login-status');
        const connectedText = isEn ? 'Connected' : 'تم الربط';

        if (discordCard && user.discordConnected) {
            discordCard.classList.add('connected');
            const btn = discordCard.classList.contains('btn') ? discordCard : discordCard.querySelector('.auth-btn');
            if (btn) {
                btn.classList.add('connected');
                btn.innerHTML = `<span>${connectedText}</span> <i class="ti ti-circle-check" style="font-size: 1.2rem;"></i>`;
                btn.style.backgroundColor = '#00b8c4';
                btn.style.pointerEvents = 'none';
            }
        }

        if (steamCard && user.steamConnected) {
            steamCard.classList.add('connected');
            const btn = steamCard.classList.contains('btn') ? steamCard : steamCard.querySelector('.auth-btn');
            if (btn) {
                btn.classList.add('connected');
                btn.innerHTML = `<span>${connectedText}</span> <i class="ti ti-circle-check" style="font-size: 1.2rem;"></i>`;
                btn.style.backgroundColor = '#00b8c4';
                btn.style.pointerEvents = 'none';
            }
        }

        // Hide Login Links and Update Join Us
        document.querySelectorAll('a').forEach(el => {
            const txt = el.textContent.trim();
            const isLoginBtn = txt === 'Login' || txt === 'Sign In' || txt === 'تسجيل الدخول' || (el.classList.contains('btn-outline') && el.closest('.hero-section'));

            if (isLoginBtn) {
                if (el.closest('.custom-nav') || el.closest('.custom-nav-mobile')) {
                    el.parentElement.style.display = 'none';
                } else {
                    el.style.display = 'none';
                }
                return; // stop here for login buttons
            }

            if (txt === 'Join Us' || txt === 'انضم إلينا' || txt === 'Activation' || txt === 'التفعيل' || (el.classList.contains('bttn') && el.closest('.hero-section'))) {
                if (txt.includes('Login') || txt.includes('تسجيل') || el.classList.contains('btn-outline')) return;

                el.href = 'whitelist.html';
                const isEn = window.location.pathname.includes('/en/');

                if (el.closest('.hero-section')) {
                    el.innerHTML = isEn ? '<i class="ti ti-rocket"></i> Activation' : '<i class="ti ti-rocket"></i> التفعيل';
                } else {
                    el.textContent = isEn ? 'Activation' : 'التفعيل';
                }
            }
        });

        // Hide ALL Whitelist buttons if already accepted/rejected
        if (user.isProcessed) {
            document.querySelectorAll('a[href*="whitelist.html"]').forEach(btn => {
                btn.style.display = 'none';
            });
        }

        // Hero section update
        const heroBtnContainer = document.querySelector('.hero-btns');
        if (heroBtnContainer) {
            if (user.isProcessed) {
                heroBtnContainer.innerHTML = `
                    <a href="profile.html" class="bttn primary-btn">
                        <span>Go to Profile</span>
                        <i class="ti ti-user"></i>
                    </a>
                `;
            } else {
                heroBtnContainer.innerHTML = `
                    <a href="whitelist.html" class="bttn primary-btn">
                        <span>Activation</span>
                        <i class="ti ti-rocket"></i>
                    </a>
                `;
            }
        }

        // Inject Profile Header
        const nav = document.querySelector('.navbar-custom');
        if (nav) {
            const isEn = window.location.pathname.includes('/en/');
            const lang = {
                profile: isEn ? 'Profile' : 'الملف الشخصي',
                logout: isEn ? 'Logout' : 'تسجيل الخروج'
            };

            const profileHtml = `
                <div class="header-profile ms-lg-4" onclick="toggleUserPopup(event)">
                    <div class="profile-wrapper">
                        <div class="img-area">
                            <img src="${avatar}" alt="avatar">
                        </div>
                        <span class="user-name d-none d-sm-block">${userName}</span>
                        <i class="ti ti-chevron-down tcn-1"></i>
                    </div>
                </div>
                <div class="user-account-popup">
                    <div class="user-level-area">
                        <div class="d-flex align-items-center gap-2">
                            <i class="ti ti-crown tcp-1"></i>
                            <span class="tcn-1 fs-sm fw-bold">${userName}</span>
                        </div>
                    </div>
                    <a href="profile.html" class="account-item"><i class="ti ti-user me-2"></i> ${lang.profile}</a>
                    <div class="border-top border-secondary my-2"></div>
                    <a href="#" class="account-item text-danger" onclick="logout(event)"><i class="ti ti-logout me-2"></i> ${lang.logout}</a>
                </div>
            `;
            nav.insertAdjacentHTML('beforeend', profileHtml);
        }
    }

    window.toggleUserPopup = function (e) {
        e.stopPropagation();
        document.querySelector('.user-account-popup')?.classList.toggle('active');
    };



    document.addEventListener('click', () => {
        document.querySelector('.user-account-popup')?.classList.remove('active');
    });

    // 8. Number Counter
    const counters = document.querySelectorAll('.counter');
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-target'));
                const duration = 2000;
                let start = null;
                function animate(ts) {
                    if (!start) start = ts;
                    const progress = Math.min((ts - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    el.textContent = Math.floor(eased * target);
                    if (progress < 1) requestAnimationFrame(animate);
                    else el.textContent = target;
                }
                requestAnimationFrame(animate);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });
    counters.forEach(el => counterObserver.observe(el));

    // 9. Swiper
    if (typeof Swiper !== 'undefined' && document.querySelector('.game-swiper')) {
        new Swiper('.game-swiper', {
            slidesPerView: 2, spaceBetween: 20, loop: true,
            autoplay: { delay: 3000, disableOnInteraction: false },
            pagination: { el: '.game-swiper-pagination', clickable: true },
            breakpoints: { 640: { slidesPerView: 3 }, 992: { slidesPerView: 4 }, 1200: { slidesPerView: 5 } }
        });
    }

    // 10. FAQ
    window.toggleFaq = function (btn) {
        const item = btn.closest('.faq-item');
        const answer = item.querySelector('.faq-answer');
        const inner = answer.querySelector('.faq-answer-inner');
        const isActive = item.classList.contains('active');
        document.querySelectorAll('.faq-item').forEach(fi => {
            fi.classList.remove('active');
            fi.querySelector('.faq-answer').style.maxHeight = '0';
        });
        if (!isActive) {
            item.classList.add('active');
            answer.style.maxHeight = inner.scrollHeight + 20 + 'px';
        }
    };

    // 11. Header Scroll
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header-section');
        header?.classList.toggle('scrolled', window.scrollY > 50);
    });

    // 12. Login Form Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success) {
                    if (window.showToast) window.showToast('Login successful!');
                    setTimeout(() => {
                        window.location.href = window.location.pathname.includes('/en/') ? '/en/index.html' : 'index.html';
                    }, 1500);
                } else {
                    if (window.showToast) window.showToast(data.message || 'Login failed', 'error');
                    else alert(data.message || 'Login failed');
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

})();
