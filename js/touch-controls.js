(function(global) {
    function isCoarsePointer() {
        return window.matchMedia('(pointer: coarse)').matches
            || window.matchMedia('(hover: none)').matches
            || navigator.maxTouchPoints > 0;
    }

    function isPortrait() {
        return window.innerHeight > window.innerWidth;
    }

    function createOrientationManager(options = {}) {
        const { hintEl } = options;
        const state = {
            isMobile: isCoarsePointer(),
            lockSucceeded: false,
            forcedLandscape: false,
        };

        function applyForcedLandscape() {
            if (state.forcedLandscape || !isPortrait()) return;
            state.forcedLandscape = true;
            document.documentElement.classList.add('mobile-force-landscape');
        }

        function clearForcedLandscape() {
            if (!state.forcedLandscape) return;
            state.forcedLandscape = false;
            document.documentElement.classList.remove('mobile-force-landscape');
        }

        function updateHint() {
            if (!hintEl || !state.isMobile) return;
            const portrait = isPortrait();
            const showHint = portrait && !state.forcedLandscape && !state.lockSucceeded;
            hintEl.classList.toggle('hidden', !showHint);
            document.documentElement.classList.toggle('mobile-portrait', portrait && !state.forcedLandscape);
            document.documentElement.classList.toggle('mobile-landscape', !portrait || state.forcedLandscape);
        }

        async function requestFullscreenIfNeeded() {
            if (!document.fullscreenEnabled || document.fullscreenElement) return true;
            try {
                await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
                return true;
            } catch (_) {
                return false;
            }
        }

        async function tryLockLandscape(options = {}) {
            const { allowFullscreen = true } = options;
            if (!state.isMobile) return false;

            if (!isPortrait()) {
                state.lockSucceeded = true;
                clearForcedLandscape();
                updateHint();
                return true;
            }

            if (allowFullscreen) {
                await requestFullscreenIfNeeded();
            }

            const orientation = screen.orientation;
            if (orientation?.lock) {
                const candidates = ['landscape-primary', 'landscape', 'landscape-secondary'];
                for (const mode of candidates) {
                    try {
                        await orientation.lock(mode);
                        state.lockSucceeded = true;
                        clearForcedLandscape();
                        updateHint();
                        return true;
                    } catch (_) {
                        // 部分浏览器需用户手势或全屏，继续尝试下一种
                    }
                }
            }

            state.lockSucceeded = false;
            applyForcedLandscape();
            updateHint();
            return false;
        }

        function syncOrientationState() {
            if (!state.isMobile) return;

            if (!isPortrait()) {
                state.lockSucceeded = true;
                clearForcedLandscape();
            } else if (!state.lockSucceeded) {
                applyForcedLandscape();
            }
            updateHint();
        }

        function bindGestureLock() {
            if (!state.isMobile) return;

            const retry = () => {
                tryLockLandscape({ allowFullscreen: true });
            };

            ['touchstart', 'pointerdown', 'click'].forEach(eventName => {
                document.addEventListener(eventName, retry, { passive: true, capture: true });
            });
        }

        function init() {
            if (!state.isMobile) return;

            document.documentElement.classList.add('mobile-device');
            syncOrientationState();
            tryLockLandscape({ allowFullscreen: false });
            bindGestureLock();

            window.addEventListener('resize', syncOrientationState);
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    syncOrientationState();
                    if (isPortrait() && !state.lockSucceeded) {
                        tryLockLandscape({ allowFullscreen: false });
                    }
                }, 120);
            });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    setTimeout(syncOrientationState, 80);
                }
            });
        }

        return {
            state,
            init,
            tryLockLandscape,
            updateHint: syncOrientationState,
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
