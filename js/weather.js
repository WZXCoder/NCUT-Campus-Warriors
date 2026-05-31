(function(global) {
    const WEATHER_TYPES = {
        SUNNY: 'sunny',
        RAINY: 'rainy',
        SNOWY: 'snowy',
        NIGHT: 'night',
    };

    function createWeatherSystem(options) {
        const { onWeatherChange } = options;
        
        const state = {
            currentWeather: WEATHER_TYPES.SUNNY,
            particles: [],
            lastUpdate: 0,
            transitionProgress: 1,
            targetWeather: WEATHER_TYPES.SUNNY,
        };

        function createRainParticle(bounds) {
            return {
                x: Math.random() * (bounds.maxX - bounds.minX) + bounds.minX,
                y: bounds.minY - 10,
                length: Math.random() * 15 + 10,
                speed: Math.random() * 0.08 + 0.05,
                thickness: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.5 + 0.3,
            };
        }

        function createSnowParticle(bounds) {
            return {
                x: Math.random() * (bounds.maxX - bounds.minX) + bounds.minX,
                y: bounds.minY - 10,
                size: Math.random() * 4 + 2,
                speed: Math.random() * 0.02 + 0.01,
                drift: Math.random() * 0.02 - 0.01,
                opacity: Math.random() * 0.6 + 0.4,
                rotation: Math.random() * Math.PI * 2,
            };
        }

        function createStarParticle(bounds) {
            return {
                x: Math.random() * (bounds.maxX - bounds.minX) + bounds.minX,
                y: Math.random() * (bounds.maxY - bounds.minY) + bounds.minY,
                size: Math.random() * 2 + 1,
                opacity: Math.random() * 0.7 + 0.3,
                twinkleSpeed: Math.random() * 0.02 + 0.01,
                twinklePhase: Math.random() * Math.PI * 2,
            };
        }

        function updateParticles(bounds) {
            const now = performance.now();
            const delta = now - state.lastUpdate;
            state.lastUpdate = now;

            if (state.currentWeather === WEATHER_TYPES.RAINY) {
                while (state.particles.length < 150) {
                    state.particles.push(createRainParticle(bounds));
                }
                state.particles = state.particles.filter(p => {
                    p.y += p.speed * delta * 60;
                    p.x += 0.01 * delta * 60;
                    return p.y < bounds.maxY + 20;
                });
            } else if (state.currentWeather === WEATHER_TYPES.SNOWY) {
                while (state.particles.length < 80) {
                    state.particles.push(createSnowParticle(bounds));
                }
                state.particles = state.particles.filter(p => {
                    p.y += p.speed * delta * 60;
                    p.x += p.drift * delta * 60;
                    p.rotation += 0.02 * delta * 60;
                    return p.y < bounds.maxY + 20;
                });
            } else if (state.currentWeather === WEATHER_TYPES.NIGHT) {
                while (state.particles.length < 50) {
                    state.particles.push(createStarParticle(bounds));
                }
                state.particles.forEach(p => {
                    p.twinklePhase += p.twinkleSpeed * delta * 60;
                });
            } else {
                state.particles = [];
            }
        }

        function draw(ctx, camera, bounds) {
            updateParticles(bounds);
            
            if (state.transitionProgress < 1) {
                state.transitionProgress = Math.min(1, state.transitionProgress + 0.02);
            }

            const alpha = state.transitionProgress;

            if (state.currentWeather === WEATHER_TYPES.RAINY) {
                ctx.save();
                state.particles.forEach(p => {
                    const screen = camera.worldToScreen(p.x, p.y);
                    ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity * alpha})`;
                    ctx.lineWidth = p.thickness;
                    ctx.beginPath();
                    ctx.moveTo(screen.x, screen.y);
                    ctx.lineTo(screen.x + 3, screen.y + p.length);
                    ctx.stroke();
                });
                ctx.restore();
            } else if (state.currentWeather === WEATHER_TYPES.SNOWY) {
                ctx.save();
                state.particles.forEach(p => {
                    const screen = camera.worldToScreen(p.x, p.y);
                    ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * alpha})`;
                    ctx.beginPath();
                    ctx.arc(screen.x, screen.y, p.size * camera.state.zoom, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.restore();
            } else if (state.currentWeather === WEATHER_TYPES.NIGHT) {
                ctx.save();
                ctx.fillStyle = `rgba(10, 10, 30, ${0.4 * alpha})`;
                ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
                
                state.particles.forEach(p => {
                    const screen = camera.worldToScreen(p.x, p.y);
                    const twinkle = (Math.sin(p.twinklePhase) + 1) / 2;
                    const starOpacity = (p.opacity + twinkle * 0.3) * alpha;
                    ctx.fillStyle = `rgba(255, 255, 255, ${starOpacity})`;
                    ctx.beginPath();
                    ctx.arc(screen.x, screen.y, p.size * camera.state.zoom, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.restore();
            }
        }

        function setWeather(weatherType) {
            if (weatherType === state.currentWeather) return;
            
            state.targetWeather = weatherType;
            state.transitionProgress = 0;
            
            setTimeout(() => {
                state.currentWeather = weatherType;
                if (onWeatherChange) {
                    onWeatherChange(state.currentWeather);
                }
            }, 300);
        }

        function cycleWeather() {
            const types = Object.values(WEATHER_TYPES);
            const currentIndex = types.indexOf(state.currentWeather);
            const nextIndex = (currentIndex + 1) % types.length;
            setWeather(types[nextIndex]);
        }

        function getCurrentWeather() {
            return state.currentWeather;
        }

        function getWeatherName(weatherType) {
            const names = {
                [WEATHER_TYPES.SUNNY]: '晴天',
                [WEATHER_TYPES.RAINY]: '雨天',
                [WEATHER_TYPES.SNOWY]: '雪天',
                [WEATHER_TYPES.NIGHT]: '黑夜',
            };
            return names[weatherType] || '未知';
        }

        function randomWeather() {
            const types = Object.values(WEATHER_TYPES);
            const currentIndex = types.indexOf(state.currentWeather);
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * types.length);
            } while (randomIndex === currentIndex);
            setWeather(types[randomIndex]);
        }

        return {
            state,
            draw,
            setWeather,
            cycleWeather,
            randomWeather,
            getCurrentWeather,
            getWeatherName,
            types: WEATHER_TYPES,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        weather: {
            createWeatherSystem,
            types: WEATHER_TYPES,
        },
    };
})(window);