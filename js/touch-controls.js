(function(global) {
    function isCoarsePointer() {
        return window.matchMedia('(pointer: coarse)').matches
            || window.matchMedia('(hover: none)').matches
            || navigator.maxTouchPoints > 0;
    }

    function isPortrait() {
        return window.innerHeight > window.innerWidth;
    }

    function isAndroidDevice() {
        return /Android/i.test(navigator.userAgent);
    }

    function isNativeLandscape() {
        const type = screen.orientation?.type || '';
        if (type.includes('landscape')) return true;
        if (typeof window.orientation === 'number') {
            return Math.abs(window.orientation) === 90;
        }
        return !isPortrait();
    }

    function createOrientationManager(options = {}) {
        const { hintEl } = options;
        const state = {
            isMobile: isCoarsePointer(),
        };

        function notifyLayoutChange() {
            window.dispatchEvent(new Event('resize'));
        }

        function syncCssLandscape() {
            const root = document.documentElement;
            const portrait = isPortrait();
            const nativeLandscape = isNativeLandscape();
            const shouldForce = state.isMobile
                && isAndroidDevice()
                && portrait
                && !nativeLandscape;

            const hadForce = root.classList.contains('use-css-landscape');
            root.classList.toggle('use-css-landscape', shouldForce);
            if (hadForce !== shouldForce) {
                notifyLayoutChange();
            }
        }

        function updateHint() {
            if (!state.isMobile) return;

            const portrait = isPortrait();
            const cssForced = document.documentElement.classList.contains('use-css-landscape');
            const mediaQueryMatched = window.matchMedia('(max-width: 720px) and (orientation: portrait)').matches;
            const showHint = portrait && !cssForced && !mediaQueryMatched;

            if (hintEl) {
                hintEl.classList.toggle('hidden', !showHint);
            }
            document.documentElement.classList.toggle('mobile-portrait', portrait);
            document.documentElement.classList.toggle('mobile-landscape', !portrait);
            syncCssLandscape();
        }

        async function lockWithModernApi() {
            const orientation = screen.orientation;
            if (!orientation?.lock) return false;

            const candidates = ['landscape-primary', 'landscape', 'landscape-secondary'];
            for (const mode of candidates) {
                try {
                    await orientation.lock(mode);
                    return orientation.type?.includes('landscape') ?? true;
                } catch (_) {
                    // 需用户手势或全屏时继续尝试
                }
            }
            return false;
        }

        function lockWithLegacyApi() {
            const legacy = screen.lockOrientation
                || screen.mozLockOrientation
                || screen.msLockOrientation;
            if (!legacy) return false;
            try {
                return legacy.call(screen, 'landscape')
                    || legacy.call(screen, 'landscape-primary');
            } catch (_) {
                return false;
            }
        }

        async function requestFullscreenIfNeeded() {
            if (!isAndroidDevice() || document.fullscreenElement) return;
            const el = document.documentElement;
            const request = el.requestFullscreen
                || el.webkitRequestFullscreen
                || el.msRequestFullscreen;
            if (!request) return;
            try {
                await request.call(el);
            } catch (_) {
                // 无用户手势时可能失败
            }
        }

        async function tryLockLandscape() {
            if (!state.isMobile) return false;

            if (await lockWithModernApi()) {
                document.documentElement.classList.remove('use-css-landscape');
                updateHint();
                return true;
            }

            if (lockWithLegacyApi()) {
                document.documentElement.classList.remove('use-css-landscape');
                updateHint();
                return true;
            }

            await requestFullscreenIfNeeded();
            if (await lockWithModernApi() || lockWithLegacyApi()) {
                document.documentElement.classList.remove('use-css-landscape');
                updateHint();
                return true;
            }

            updateHint();
            return isNativeLandscape();
        }

        function bindGestureLock() {
            if (!state.isMobile) return;
            const retry = () => {
                tryLockLandscape();
            };
            ['touchstart', 'pointerdown', 'click'].forEach((eventName) => {
                document.addEventListener(eventName, retry, { passive: true });
            });
        }

        function scheduleOrientationSync() {
            setTimeout(() => {
                tryLockLandscape();
                updateHint();
            }, 150);
        }

        function init() {
            if (!state.isMobile) return;

            document.documentElement.classList.add('mobile-device');
            syncCssLandscape();
            updateHint();
            tryLockLandscape();
            bindGestureLock();

            window.addEventListener('resize', updateHint);
            window.addEventListener('orientationchange', scheduleOrientationSync);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', updateHint);
            }
        }

        return {
            state,
            init,
            tryLockLandscape,
            updateHint,
            isPortrait,
        };
    }

    function createTouchControls(options) {
        const {
            root,
            joystickEl,
            actionsEl,
            attackBtn,
            pickupBtn,
            skillBtn,
            extractBtn,
            onJoystick,
            onAttack,
            onPickup,
            onSkill,
            onExtract,
        } = options;

        let gameMode = null;
        let joystickActive = false;
        let joystickPointerId = null;
        let joystickCenter = { x: 0, y: 0 };
        let joystickRadius = 56;

        const state = {
            isMobile: isCoarsePointer(),
        };

        function isInGame() {
            return gameMode === 'visit' || gameMode === 'goldrush' || gameMode === 'survival';
        }

        function updateVisibility() {
            const show = state.isMobile && isInGame();
            root.classList.toggle('hidden', !show);
            actionsEl.classList.toggle('hidden', !show || gameMode === 'visit');
            attackBtn.classList.toggle('hidden', !show || gameMode === 'visit');
            pickupBtn.classList.toggle('hidden', !show || gameMode === 'visit');
            skillBtn.classList.toggle('hidden', !show || gameMode === 'visit');
            extractBtn.classList.toggle('hidden', !show || gameMode !== 'goldrush');
            document.body.classList.toggle('mobile-game-active', show);
        }

        function setGameMode(mode) {
            gameMode = mode;
            clearJoystick();
            updateVisibility();
        }

        function isActive() {
            return state.isMobile && isInGame();
        }

        function clearJoystick() {
            joystickActive = false;
            joystickPointerId = null;
            joystickEl.classList.remove('active');
            joystickEl.style.setProperty('--joy-x', '0px');
            joystickEl.style.setProperty('--joy-y', '0px');
            onJoystick(0, 0);
        }

        function updateJoystick(clientX, clientY) {
            const dx = clientX - joystickCenter.x;
            const dy = clientY - joystickCenter.y;
            const dist = Math.hypot(dx, dy);
            const maxDist = joystickRadius;
            const clampedDist = Math.min(dist, maxDist);
            const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
            const thumbX = Math.cos(angle) * clampedDist;
            const thumbY = Math.sin(angle) * clampedDist;

            joystickEl.style.setProperty('--joy-x', `${thumbX}px`);
            joystickEl.style.setProperty('--joy-y', `${thumbY}px`);

            const normX = clampedDist > 0 ? (Math.cos(angle) * clampedDist) / maxDist : 0;
            const normY = clampedDist > 0 ? (Math.sin(angle) * clampedDist) / maxDist : 0;
            onJoystick(normX, normY);
        }

        function bindHoldButton(button, callback) {
            if (!button || !callback) return;

            const run = () => callback();
            button.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                button.setPointerCapture(event.pointerId);
                run();
            });
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
        }

        function bindJoystick() {
            joystickEl.addEventListener('pointerdown', (event) => {
                if (!isActive()) return;
                event.preventDefault();
                event.stopPropagation();

                const rect = joystickEl.getBoundingClientRect();
                joystickRadius = rect.width * 0.34;
                joystickCenter = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                };

                joystickActive = true;
                joystickPointerId = event.pointerId;
                joystickEl.classList.add('active');
                joystickEl.setPointerCapture(event.pointerId);
                updateJoystick(event.clientX, event.clientY);
            });

            joystickEl.addEventListener('pointermove', (event) => {
                if (!joystickActive || event.pointerId !== joystickPointerId) return;
                event.preventDefault();
                updateJoystick(event.clientX, event.clientY);
            });

            const endJoystick = (event) => {
                if (!joystickActive || event.pointerId !== joystickPointerId) return;
                clearJoystick();
            };

            joystickEl.addEventListener('pointerup', endJoystick);
            joystickEl.addEventListener('pointercancel', endJoystick);
        }

        bindJoystick();
        bindHoldButton(attackBtn, onAttack);
        bindHoldButton(pickupBtn, onPickup);
        bindHoldButton(skillBtn, onSkill);
        bindHoldButton(extractBtn, onExtract);

        window.addEventListener('resize', updateVisibility);

        return {
            state,
            setGameMode,
            isActive,
            clearJoystick,
            updateVisibility,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        touchControls: {
            createTouchControls,
            createOrientationManager,
            isCoarsePointer,
        },
    };
})(window);
