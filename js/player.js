(function(global) {
    const { MOVEMENT } = global.NCUTMap;

    function createPlayer(camera, bounds, config) {
        const player = {
            x: bounds.centerX,
            y: bounds.centerY,
            targetX: bounds.centerX,
            targetY: bounds.centerY,
            speed: MOVEMENT.PLAYER_BASE_SPEED,
            size: 24,
            isMoving: false,
            enabled: false,
        };

        const keys = {
            up: false,
            down: false,
            left: false,
            right: false,
        };

        const joystick = {
            x: 0,
            y: 0,
            active: false,
        };

        function clampToBounds(x, y) {
            const halfSize = player.size / 2;
            return {
                x: Math.max(bounds.minX + halfSize, Math.min(bounds.maxX - halfSize, x)),
                y: Math.max(bounds.minY + halfSize, Math.min(bounds.maxY - halfSize, y)),
            };
        }

        function update(deltaTime = 1/60) {
            if (!player.enabled) return;

            const moveSpeed = player.speed * (deltaTime * 60) * MOVEMENT.MOVE_TICK_SCALE;

            let inputX = 0;
            let inputY = 0;
            if (keys.left) inputX -= 1;
            if (keys.right) inputX += 1;
            if (keys.up) inputY -= 1;
            if (keys.down) inputY += 1;

            const keyboardLen = Math.hypot(inputX, inputY);
            if (keyboardLen > 0) {
                player.targetX += (inputX / keyboardLen) * moveSpeed;
                player.targetY += (inputY / keyboardLen) * moveSpeed;
            }

            if (joystick.active) {
                player.targetX += joystick.x * moveSpeed;
                player.targetY += joystick.y * moveSpeed;
            }

            player.x = player.targetX;
            player.y = player.targetY;

            const clamped = clampToBounds(player.x, player.y);
            player.x = clamped.x;
            player.y = clamped.y;
            player.targetX = player.x;
            player.targetY = player.y;

            player.isMoving = keys.up || keys.down || keys.left || keys.right || joystick.active;

            if (player.isMoving) {
                camera.state.targetX = player.x;
                camera.state.targetY = player.y;
            }
        }

        function setPosition(x, y) {
            const clamped = clampToBounds(x, y);
            player.x = clamped.x;
            player.y = clamped.y;
            player.targetX = clamped.x;
            player.targetY = clamped.y;
            camera.state.targetX = player.x;
            camera.state.targetY = player.y;
        }

        function enable() {
            player.enabled = true;
        }

        function disable() {
            player.enabled = false;
            keys.up = false;
            keys.down = false;
            keys.left = false;
            keys.right = false;
            setJoystickInput(0, 0);
        }

        function setJoystickInput(x, y) {
            joystick.x = x;
            joystick.y = y;
            joystick.active = Math.hypot(x, y) > 0.12;
        }

        window.addEventListener('keydown', (event) => {
            if (!player.enabled) return;

            const target = event.target;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            
            if (isInput) return;

            switch (event.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    keys.up = true;
                    event.preventDefault();
                    break;
                case 's':
                case 'arrowdown':
                    keys.down = true;
                    event.preventDefault();
                    break;
                case 'a':
                case 'arrowleft':
                    keys.left = true;
                    event.preventDefault();
                    break;
                case 'd':
                case 'arrowright':
                    keys.right = true;
                    event.preventDefault();
                    break;
            }
        });

        window.addEventListener('keyup', (event) => {
            if (!player.enabled) return;

            switch (event.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    keys.up = false;
                    break;
                case 's':
                case 'arrowdown':
                    keys.down = false;
                    break;
                case 'a':
                case 'arrowleft':
                    keys.left = false;
                    break;
                case 'd':
                case 'arrowright':
                    keys.right = false;
                    break;
            }
        });

        return {
            state: player,
            update,
            setPosition,
            enable,
            disable,
            setJoystickInput,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        player: {
            createPlayer,
        },
    };
})(window);