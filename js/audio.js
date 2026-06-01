(function(global) {
    let audioContext = null;
    let unlocked = false;
    const lastPlayed = { playerAttack: 0, npcAttack: 0 };
    const MIN_INTERVAL_MS = 55;
    const MASTER_VOLUME = 0.35;

    function getContext() {
        if (!audioContext) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            audioContext = new Ctx();
        }
        return audioContext;
    }

    async function unlock() {
        const ctx = getContext();
        if (!ctx) return false;
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch (_) {
                return false;
            }
        }
        unlocked = ctx.state === 'running';
        return unlocked;
    }

    function initUnlockListeners() {
        const handler = () => {
            unlock();
        };
        ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
            document.addEventListener(eventName, handler, { once: true, passive: true });
        });
    }

    function playEnvelope(ctx, destination, startTime, attack, decay, peakGain) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0001), startTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay);
        gain.connect(destination);
        return gain;
    }

    function canPlay(kind) {
        const ctx = getContext();
        if (!ctx || ctx.state !== 'running') return false;
        const now = performance.now();
        if (now - lastPlayed[kind] < MIN_INTERVAL_MS) return false;
        lastPlayed[kind] = now;
        return ctx;
    }

    function playPlayerAttack() {
        const ctx = canPlay('playerAttack');
        if (!ctx) return;

        const start = ctx.currentTime;
        const output = ctx.createGain();
        output.gain.value = MASTER_VOLUME;
        output.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(920, start);
        osc.frequency.exponentialRampToValueAtTime(280, start + 0.07);
        const oscGain = playEnvelope(ctx, output, start, 0.008, 0.09, 0.55);
        osc.connect(oscGain);
        osc.start(start);
        osc.stop(start + 0.12);

        const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1800;
        const noiseGain = playEnvelope(ctx, output, start, 0.003, 0.045, 0.35);
        noise.connect(filter);
        filter.connect(noiseGain);
        noise.start(start);
        noise.stop(start + 0.06);
    }

    function playNpcAttack() {
        const ctx = canPlay('npcAttack');
        if (!ctx) return;

        const start = ctx.currentTime;
        const output = ctx.createGain();
        output.gain.value = MASTER_VOLUME;
        output.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(165, start);
        osc.frequency.exponentialRampToValueAtTime(72, start + 0.14);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(520, start);
        filter.frequency.exponentialRampToValueAtTime(180, start + 0.14);
        const oscGain = playEnvelope(ctx, output, start, 0.012, 0.16, 0.7);
        osc.connect(filter);
        filter.connect(oscGain);
        osc.start(start);
        osc.stop(start + 0.2);

        const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 240;
        noiseFilter.Q.value = 0.8;
        const noiseGain = playEnvelope(ctx, output, start + 0.01, 0.01, 0.12, 0.45);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noise.start(start + 0.01);
        noise.stop(start + 0.16);
    }

    initUnlockListeners();

    global.NCUTMap = {
        ...global.NCUTMap,
        audio: {
            unlock,
            playPlayerAttack,
            playNpcAttack,
        },
    };
})(window);
