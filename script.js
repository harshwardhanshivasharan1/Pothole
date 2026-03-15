/* ========================================
   PotholeSense Landing Page — JavaScript
   Dynamic Animations, Lens Scroll, Interactions
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ========================================
    // 1. CUSTOM CURSOR + LENS EFFECT
    // ========================================
    const cursorDot = document.getElementById('cursor-dot');
    const cursorRing = document.getElementById('cursor-ring');
    const lensOverlay = document.getElementById('lens-overlay');

    let mouseX = 0, mouseY = 0;
    let dotX = 0, dotY = 0;
    let ringX = 0, ringY = 0;
    let lensX = 0, lensY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Smooth cursor animation loop
    function animateCursor() {
        // Dot follows instantly
        dotX += (mouseX - dotX) * 0.9;
        dotY += (mouseY - dotY) * 0.9;
        if (cursorDot) {
            cursorDot.style.left = dotX + 'px';
            cursorDot.style.top = dotY + 'px';
        }

        // Ring follows with lag
        ringX += (mouseX - ringX) * 0.15;
        ringY += (mouseY - ringY) * 0.15;
        if (cursorRing) {
            cursorRing.style.left = ringX + 'px';
            cursorRing.style.top = ringY + 'px';
        }

        // Lens overlay follows with smooth delay
        lensX += (mouseX - lensX) * 0.08;
        lensY += (mouseY - lensY) * 0.08;
        if (lensOverlay) {
            lensOverlay.style.left = lensX + 'px';
            lensOverlay.style.top = lensY + 'px';
        }

        requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // Hover effects on interactive elements
    const interactiveElements = document.querySelectorAll('a, button, .location-card, .about-card, .feature-card, .tech-item');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursorRing && cursorRing.classList.add('hovering');
        });
        el.addEventListener('mouseleave', () => {
            cursorRing && cursorRing.classList.remove('hovering');
        });
    });

    // ========================================
    // 2. SMOOTH SCROLL WITH LENS EFFECT
    // ========================================
    // Lenis-inspired smooth scroll using CSS and scroll behavior
    let scrollY = 0;
    let smoothScrollY = 0;
    let isScrolling = false;

    // Parallax elements
    function updateParallax() {
        const scrolled = window.pageYOffset;

        // Hero parallax
        const heroContent = document.querySelector('.hero-content');
        const heroVisual = document.querySelector('.hero-visual');
        if (heroContent && scrolled < window.innerHeight) {
            heroContent.style.transform = `translateY(${scrolled * 0.3}px)`;
            heroContent.style.opacity = 1 - (scrolled / (window.innerHeight * 0.8));
        }
        if (heroVisual && scrolled < window.innerHeight) {
            heroVisual.style.transform = `translateY(${scrolled * 0.15}px)`;
        }

        // Scroll indicator fade
        const scrollIndicator = document.getElementById('scroll-indicator');
        if (scrollIndicator) {
            scrollIndicator.style.opacity = Math.max(0, 0.6 - scrolled / 200);
        }

        requestAnimationFrame(updateParallax);
    }
    updateParallax();

    // ========================================
    // 3. NAVBAR SCROLL EFFECT
    // ========================================
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        // Active nav link based on scroll position
        updateActiveNavLink();

        lastScroll = currentScroll;
    });

    function updateActiveNavLink() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');

        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 200;
            if (window.pageYOffset >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === current) {
                link.classList.add('active');
            }
        });
    }

    // ========================================
    // 4. SCROLL-TRIGGERED ANIMATIONS
    // ========================================
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = parseInt(entry.target.getAttribute('data-delay') || '0');
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, delay);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('[data-animate]').forEach(el => {
        observer.observe(el);
    });

    // ========================================
    // 5. COUNTER ANIMATION
    // ========================================
    function animateCounter(element) {
        const target = parseInt(element.getAttribute('data-count'));
        const suffix = element.getAttribute('data-suffix') || '';
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(target * eased);

            element.textContent = current + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = target + suffix;
            }
        }

        requestAnimationFrame(update);
    }

    // Observe stat numbers
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counters = entry.target.querySelectorAll('[data-count]');
                counters.forEach(counter => {
                    animateCounter(counter);
                });
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.hero-stats, .pune-summary-right').forEach(el => {
        counterObserver.observe(el);
    });

    // ========================================
    // 6. HERO PARTICLES
    // ========================================
    const particleContainer = document.getElementById('hero-particles');

    function createParticles() {
        if (!particleContainer) return;

        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 3 + 1}px;
                height: ${Math.random() * 3 + 1}px;
                background: rgba(99, 102, 241, ${Math.random() * 0.3 + 0.1});
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: particle-drift ${Math.random() * 20 + 10}s linear infinite;
                animation-delay: -${Math.random() * 20}s;
            `;
            particleContainer.appendChild(particle);
        }

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes particle-drift {
                0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translate(${Math.random() > 0.5 ? '' : '-'}100px, -200px) rotate(360deg); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    createParticles();

    // ========================================
    // 7. MOBILE MENU
    // ========================================
    const mobileToggle = document.getElementById('mobile-toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileToggle && mobileMenu) {
        mobileToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            mobileToggle.classList.toggle('active');
        });

        document.querySelectorAll('.mobile-link').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                mobileToggle.classList.remove('active');
            });
        });
    }

    // ========================================
    // 8. SMOOTH SCROLL FOR NAV LINKS
    // ========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetEl = document.querySelector(targetId);
            if (targetEl) {
                const navHeight = navbar ? navbar.offsetHeight : 0;
                const targetPos = targetEl.offsetTop - navHeight;
                window.scrollTo({
                    top: targetPos,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ========================================
    // 9. TILT EFFECT ON LOCATION CARDS
    // ========================================
    const locationCards = document.querySelectorAll('.location-card');

    locationCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / centerY) * -5;
            const rotateY = ((x - centerX) / centerX) * 5;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px) scale(1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)';
        });
    });

    // ========================================
    // 10. FEATURE CARD GLOW FOLLOWING MOUSE
    // ========================================
    const featureCards = document.querySelectorAll('.feature-card');

    featureCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const glow = card.querySelector('.feature-glow');
            if (glow) {
                glow.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(99, 102, 241, 0.06) 0%, transparent 50%)`;
                glow.style.opacity = '1';
            }
        });

        card.addEventListener('mouseleave', () => {
            const glow = card.querySelector('.feature-glow');
            if (glow) {
                glow.style.opacity = '0';
            }
        });
    });

    // ========================================
    // 11. TYPING EFFECT FOR HERO BADGE
    // ========================================
    const badge = document.querySelector('.hero-badge span:last-child');
    if (badge) {
        const originalText = badge.textContent;
        badge.textContent = '';
        let charIndex = 0;

        function typeChar() {
            if (charIndex < originalText.length) {
                badge.textContent += originalText[charIndex];
                charIndex++;
                setTimeout(typeChar, 50);
            }
        }

        setTimeout(typeChar, 800);
    }

    // ========================================
    // 12. MAGNETIC BUTTONS EFFECT
    // ========================================
    document.querySelectorAll('.btn-primary, .nav-cta').forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });

    // ========================================
    // 13. REVEAL ANIMATIONS FOR SECTIONS
    // ========================================
    const revealSections = document.querySelectorAll('.section');

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('section-visible');
            }
        });
    }, { threshold: 0.05 });

    revealSections.forEach(section => {
        sectionObserver.observe(section);
    });

    // ========================================
    // 14. STAGGERED ENTRANCE FOR TECH ITEMS
    // ========================================
    const techItems = document.querySelectorAll('.tech-item');
    const techObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 100);
                techObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });

    techItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        item.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        techObserver.observe(item);
    });

    // ========================================
    // 15. LENS SMOOTH SCROLL — SECTION ZOOM EFFECT
    // ========================================
    // When scrolling into a section, apply a subtle scale-in effect
    const lensScrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const ratio = entry.intersectionRatio;
            const scale = 0.95 + (ratio * 0.05);
            const opacity = 0.3 + (ratio * 0.7);

            if (entry.isIntersecting) {
                entry.target.style.transform = `scale(${scale})`;
                entry.target.style.opacity = opacity;
            }
        });
    }, {
        threshold: Array.from({ length: 20 }, (_, i) => i / 19)
    });

    document.querySelectorAll('.about-section, .features-section, .tested-section, .tech-section, .cta-section').forEach(section => {
        section.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        lensScrollObserver.observe(section);
    });

    // ========================================
    // 16. VALIDITY BANNER SHINE EFFECT
    // ========================================
    const validityBanner = document.querySelector('.validity-content');
    if (validityBanner) {
        validityBanner.addEventListener('mousemove', (e) => {
            const rect = validityBanner.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            validityBanner.style.background = `
                linear-gradient(135deg, rgba(16, 185, 129, 0.06), rgba(6, 182, 212, 0.04)),
                radial-gradient(circle at ${x}% ${y}%, rgba(16, 185, 129, 0.08) 0%, transparent 50%)
            `;
        });

        validityBanner.addEventListener('mouseleave', () => {
            validityBanner.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.06), rgba(6, 182, 212, 0.04))';
        });
    }

    console.log('🚀 PotholeSense Landing Page initialized');
});
