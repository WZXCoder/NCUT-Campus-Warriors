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
        const enterBtn = document.getElementById('landscape-enter-btn');
        const hintText = document.getElementById('landscape-hint-text');
        const state = {
            isMobile: isCoarsePointer(),
            lockSucceeded: false,
        };

        function notifyResize() {
            window.dispatchEvent(new Event('resize'));
        }

        function isLandscapeReady() {
            return !isPortrait() || state.lockSucceeded;
        }

        function updateHint() {
            if (!state.isMobile) return;

            const ready = isLandscapeReady();
            if (hintEl) {
                hintEl.classList.toggle('hidden', ready);
            }
            document.documentElement.classList.toggle('mobile-portrait', !ready);
            document.documentElement.classList.toggle('mobile-landscape', ready);
            document.body.classList.toggle('mobile-orientation-pending', !ready);
        }

        async function requestFullscreenIfNeeded() {
            if (!document.fullscreenEnabled || document.fullscreenElement) return;
            try {
                await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
            } catch (_) {
                // 部分浏览器不支持或用户拒绝
            }
        }

        async function tryLockLandscape() {
            if (!state.isMobile) return false;

            if (!isPortrait()) {
                state.lockSucceeded = true;
                updateHint();
                notifyResize();
                return true;
            }

            await requestFullscreenIfNeeded();

            const orientation = screen.orientation;
            if (orientation?.lock) {
                const candidates = ['landscape-primary', 'landscape', 'landscape-secondary'];
                for (const mode of candidates) {
                    try {
                        await orientation.lock(mode);
                        state.lockSucceeded = true;
                        updateHint();
                        notifyResize();
                        return true;
                    } catch (_) {
                        // 需用户手势或浏览器不支持，继续尝试
                    }
                }
            }

            if (hintText) {
                hintText.textContent = '无法自动横屏，请手动旋转设备后继续';
            }
            updateHint();
            notifyResize();
            return false;
        }

        function init() {
            if (!state.isMobile) return;

            document.documentElement.classList.add('mobile-device');
            updateHint();

            enterBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                tryLockLandscape();
            });

            window.addEventListener('resize', updateHint);
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    if (!isPortrait()) {
                        state.lockSucceeded = true;
                    }
                    updateHint();
                    notifyResize();
                }, 150);
            });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    setTimeout(updateHint, 80);
                }
            });
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
