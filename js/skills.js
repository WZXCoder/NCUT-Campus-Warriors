(function(global) {
    const MIN_SKILL_CD = 3000;
    const SKILL_PRICE_STANDARD = 527;
    const SKILL_PRICE_PREMIUM = 925;
    // 测试开关：true = 全部技能免费可选；测试无 bug 后改回 false（付费档仍为 527 / 925）
    const SKILLS_ALL_FREE_FOR_TESTING = false;

    function skillItem(base) {
        const price = SKILLS_ALL_FREE_FOR_TESTING ? 0 : (base.price ?? 0);
        return {
            icon: 'skill',
            purchasable: !SKILLS_ALL_FREE_FOR_TESTING && price > 0,
            ...base,
            price,
            free: SKILLS_ALL_FREE_FOR_TESTING || base.free || price === 0,
        };
    }

    const ACTIVE_SKILLS = [
        skillItem({ id: 'skill_act_kaoqian', type: 'skill_active', name: '考前突击', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '5 秒攻击 +10', effect: 'buff_attack', value: 10, duration: 5000 }),
        skillItem({ id: 'skill_act_qiangda', type: 'skill_active', name: '课堂抢答', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '下 3 次攻击 +20', effect: 'next_attacks', value: 20, hits: 3 }),
        skillItem({ id: 'skill_act_heshui', type: 'skill_active', name: '课间补水', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '回复 12 生命', effect: 'heal', value: 12 }),
        skillItem({ id: 'skill_act_taoke', type: 'skill_active', name: '逃课', price: 0, free: true, cooldown: 15000, skillKind: 'active', description: '4 秒移速 +0.01', effect: 'buff_speed', value: 0.01, duration: 4000 }),
        skillItem({ id: 'skill_act_chongci', type: 'skill_active', name: '抢座冲刺', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '5 秒攻速 +40', effect: 'buff_attack_speed', value: 40, duration: 5000 }),
        skillItem({ id: 'skill_act_fadai', type: 'skill_active', name: '上课发呆', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '5 秒内 100 像素内 NPC 移速 -0.01', effect: 'slow_aura', value: 0.01, range: 100, duration: 5000 }),
        skillItem({ id: 'skill_act_shuaye', type: 'skill_active', name: '通宵刷题', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '5 秒攻击 +5、攻速 +10', effect: 'buff_combo', attack: 5, attackSpeed: 10, duration: 5000 }),
        skillItem({ id: 'skill_act_bafojiao', type: 'skill_active', name: '临时抱佛脚', price: 0, free: true, cooldown: 20000, skillKind: 'active', description: '5 秒攻击 +5、攻速 +20、移速 +0.01', effect: 'buff_combo', attack: 5, attackSpeed: 20, speed: 0.01, duration: 5000 }),
        skillItem({ id: 'skill_act_moyu', type: 'skill_active', name: '低头摸鱼', price: SKILL_PRICE_STANDARD, cooldown: 20000, skillKind: 'active', description: '隐身 5 秒', effect: 'invisible', duration: 5000 }),
        skillItem({ id: 'skill_act_nvdaxuesheng', type: 'skill_active', name: '女大学生', price: SKILL_PRICE_STANDARD, cooldown: 20000, skillKind: 'active', description: '挑拨 1 个 NPC 互攻 5 秒', effect: 'provoke', duration: 5000 }),
        skillItem({ id: 'skill_act_jiti', type: 'skill_active', name: '集体划重点', price: SKILL_PRICE_PREMIUM, cooldown: 20000, skillKind: 'active', description: '下 5 次攻击打 3 个 NPC', effect: 'multi_target', hits: 5, targets: 3 }),
        skillItem({ id: 'skill_act_shencha', type: 'skill_active', name: '躲过审查', price: SKILL_PRICE_PREMIUM, cooldown: 20000, skillKind: 'active', description: '无敌 5 秒', effect: 'invincible', duration: 5000 }),
        skillItem({ id: 'skill_act_zhongji', type: 'skill_active', name: '终极押题', price: SKILL_PRICE_PREMIUM, cooldown: 25000, skillKind: 'active', description: '秒杀最近 3 个 NPC', effect: 'instant_kill', count: 3 }),
        skillItem({ id: 'skill_act_cengbiji', type: 'skill_active', name: '蹭笔记', price: SKILL_PRICE_STANDARD, cooldown: 20000, skillKind: 'active', description: '5 秒伤害 30% 转化生命', effect: 'lifesteal', ratio: 0.3, duration: 5000 }),
        skillItem({ id: 'skill_act_xiaoqi', type: 'skill_active', name: '课间小憩', price: SKILL_PRICE_STANDARD, cooldown: 20000, skillKind: 'active', description: '每秒回 3 生命，持续 5 秒', effect: 'regen', value: 3, duration: 5000 }),
        skillItem({ id: 'skill_act_kunkun', type: 'skill_active', name: '犯困结界', price: SKILL_PRICE_STANDARD, cooldown: 20000, skillKind: 'active', description: '100 像素内敌人每秒 10 伤害，持续 5 秒', effect: 'poison_aura', dps: 10, range: 100, duration: 5000 }),
        skillItem({ id: 'skill_act_daike', type: 'skill_active', name: '代课', price: SKILL_PRICE_PREMIUM, cooldown: 20000, skillKind: 'active', description: '召唤 50% 血量分身', effect: 'clone', hpRatio: 0.5, duration: 15000, copyEquipment: true }),
        skillItem({ id: 'skill_act_chaozuoye', type: 'skill_active', name: '抄作业', price: SKILL_PRICE_PREMIUM, cooldown: 20000, skillKind: 'active', description: '复制最近敌人为盟友', effect: 'copy_ally', duration: 15000 }),
        skillItem({ id: 'skill_act_guake', type: 'skill_active', name: '挂科诅咒', price: SKILL_PRICE_STANDARD, cooldown: 15000, skillKind: 'active', description: '100 像素内 NPC 定身 3 秒', effect: 'root_aura', range: 100, duration: 3000 }),
        skillItem({ id: 'skill_act_tushuguan', type: 'skill_active', name: '图书馆结界', price: SKILL_PRICE_PREMIUM, cooldown: 15000, skillKind: 'active', description: '80 像素内 NPC 全封禁 3 秒', effect: 'stun_aura', range: 80, duration: 3000 }),
        skillItem({ id: 'skill_act_gaibug', type: 'skill_active', name: '改 bug', price: SKILL_PRICE_PREMIUM, cooldown: 20000, skillKind: 'active', description: '最近 3 个 NPC 血量减到 1', effect: 'reduce_hp', count: 3, hp: 1 }),
        skillItem({ id: 'skill_act_dadianming', type: 'skill_active', name: '全体大点名', price: SKILL_PRICE_PREMIUM, cooldown: 40000, skillKind: 'active', description: '全场 NPC 受到 20 伤害', effect: 'global_damage', value: 20 }),
        skillItem({ id: 'skill_act_qimo', type: 'skill_active', name: '期末考试', price: SKILL_PRICE_PREMIUM, cooldown: 40000, skillKind: 'active', description: '全场 NPC 僵直 1 秒', effect: 'global_stun', duration: 1000 }),
    ];

    const PASSIVE_SKILLS = [
        skillItem({ id: 'skill_psv_shuati', type: 'skill_passive', name: '刷题手感', price: 0, free: true, skillKind: 'passive', description: '攻速永久 +10', effect: 'attack_speed', value: 10 }),
        skillItem({ id: 'skill_psv_qinxue', type: 'skill_passive', name: '勤学苦练', price: 0, skillKind: 'passive', description: '攻击力永久 +10', effect: 'attack', value: 10 }),
        skillItem({ id: 'skill_psv_tice', type: 'skill_passive', name: '体测 1000 米', price: 0, free: true, skillKind: 'passive', description: '移速永久 +0.005', effect: 'speed', value: 0.005 }),
        skillItem({ id: 'skill_psv_bingjia', type: 'skill_passive', name: '病假条', price: 0, free: true, skillKind: 'passive', description: '所有 NPC 攻击 -1', effect: 'npc_attack_down', value: 1 }),
        skillItem({ id: 'skill_psv_zilv', type: 'skill_passive', name: '自律学习', price: 0, free: true, skillKind: 'passive', description: '不攻击时每秒回 1 生命', effect: 'idle_regen', value: 1 }),
        skillItem({ id: 'skill_psv_jiacan', type: 'skill_passive', name: '课间加餐', price: 0, free: true, skillKind: 'passive', description: '每击杀 1 NPC 回 2 生命', effect: 'kill_heal', value: 2 }),
        skillItem({ id: 'skill_psv_shuaiguo', type: 'skill_passive', name: '甩锅', price: SKILL_PRICE_STANDARD, skillKind: 'passive', description: '受击 20% 概率反弹 50% 伤害', effect: 'reflect', chance: 0.2, ratio: 0.5 }),
        skillItem({ id: 'skill_psv_bukao', type: 'skill_passive', name: '补考机会', price: SKILL_PRICE_PREMIUM, skillKind: 'passive', description: '血量归 0 自动回 50 血，CD 60 秒', effect: 'revive', heal: 50, cooldown: 60000 }),
        skillItem({ id: 'skill_psv_huashui', type: 'skill_passive', name: '划水摆烂', price: SKILL_PRICE_STANDARD, skillKind: 'passive', description: '血量≤30 时移速 +0.01', effect: 'low_hp_speed', threshold: 30, value: 0.01 }),
        skillItem({ id: 'skill_psv_cuoti', type: 'skill_passive', name: '错题反噬', price: SKILL_PRICE_STANDARD, skillKind: 'passive', description: '受击 20% 概率僵直攻击者 1 秒', effect: 'stun_attacker', chance: 0.2, duration: 1000 }),
        skillItem({ id: 'skill_psv_suitang', type: 'skill_passive', name: '随堂笔记', price: SKILL_PRICE_PREMIUM, skillKind: 'passive', description: '放技能永久 +2 攻击（上限 20）', effect: 'active_stack_attack', value: 2, cap: 20 }),
        skillItem({ id: 'skill_psv_xingyun', type: 'skill_passive', name: '幸运压题', price: SKILL_PRICE_STANDARD, skillKind: 'passive', description: '攻击 20% 概率 +15 攻击', effect: 'lucky_attack', chance: 0.2, value: 15 }),
        skillItem({ id: 'skill_psv_kaochang', type: 'skill_passive', name: '考场运气', price: SKILL_PRICE_PREMIUM, skillKind: 'passive', description: '攻击 20% 概率同时打 2 个目标', effect: 'lucky_multi', chance: 0.2, targets: 2 }),
        skillItem({ id: 'skill_psv_raoluan', type: 'skill_passive', name: '扰乱思路', price: SKILL_PRICE_STANDARD, skillKind: 'passive', description: '100 像素内 NPC 攻速 -10', effect: 'slow_attack_aura', range: 100, value: 10 }),
        skillItem({ id: 'skill_psv_zhishi', type: 'skill_passive', name: '知识储备', price: SKILL_PRICE_PREMIUM, skillKind: 'passive', description: '主动技能 CD 永久 -2 秒', effect: 'cd_reduce', value: 2000 }),
        skillItem({ id: 'skill_psv_manfen', type: 'skill_passive', name: '满分气场', price: SKILL_PRICE_PREMIUM, skillKind: 'passive', description: '放主动后下一次攻击秒杀最近 NPC', effect: 'after_active_kill', value: 1 }),
    ];

    const ALL_SKILLS = [...ACTIVE_SKILLS, ...PASSIVE_SKILLS];
    const SKILL_MAP = Object.fromEntries(ALL_SKILLS.map(skill => [skill.id, skill]));

    function getSkillById(id) {
        return SKILL_MAP[id] || null;
    }

    function getOwnedSkillIds(inventory) {
        return new Set(
            (inventory || [])
                .filter(entry => entry.quantity > 0 && (entry.item?.type === 'skill_active' || entry.item?.type === 'skill_passive'))
                .map(entry => entry.itemId)
        );
    }

    function getAvailableSkills(inventory) {
        const owned = getOwnedSkillIds(inventory);
        const isFree = skill => skill.free || skill.price === 0;
        const active = ACTIVE_SKILLS.filter(skill => isFree(skill) || owned.has(skill.id));
        const passive = PASSIVE_SKILLS.filter(skill => isFree(skill) || owned.has(skill.id));
        const shopActive = ACTIVE_SKILLS.filter(skill => skill.price > 0);
        const shopPassive = PASSIVE_SKILLS.filter(skill => skill.price > 0);
        return { active, passive, shopActive, shopPassive };
    }

    function sortShopSkillItems(items) {
        const priceOrder = [SKILL_PRICE_STANDARD, SKILL_PRICE_PREMIUM];
        return [...items].sort((a, b) => {
            const orderA = priceOrder.indexOf(a.price);
            const orderB = priceOrder.indexOf(b.price);
            const rankA = orderA === -1 ? priceOrder.length : orderA;
            const rankB = orderB === -1 ? priceOrder.length : orderB;
            if (rankA !== rankB) return rankA - rankB;
            const typeRank = item => (item.type === 'skill_active' ? 0 : 1);
            return typeRank(a) - typeRank(b);
        });
    }

    function getShopSkillItems(inventory) {
        const { shopActive, shopPassive } = getAvailableSkills(inventory);
        return sortShopSkillItems([...shopActive, ...shopPassive]);
    }

    const ACTIVE_SKILL_LEVEL_OVERRIDES = {
        skill_act_kaoqian: { 2: { cooldown: 15000, value: 15 }, 3: { cooldown: 12000, value: 20 } },
        skill_act_qiangda: { 2: { cooldown: 15000, value: 25 }, 3: { cooldown: 12000, value: 30 } },
        skill_act_heshui: { 2: { cooldown: 15000, value: 15 }, 3: { cooldown: 12000, value: 20 } },
        skill_act_taoke: { 2: { cooldown: 13000, duration: 4000 }, 3: { cooldown: 12000, duration: 5000 } },
        skill_act_chongci: { 2: { cooldown: 15000, value: 40, duration: 6000 }, 3: { cooldown: 12000, value: 50, duration: 6000 } },
        skill_act_fadai: { 2: { cooldown: 15000, range: 110 }, 3: { cooldown: 12000, range: 120 } },
        skill_act_shuaye: { 2: { cooldown: 15000, attack: 8, attackSpeed: 15 }, 3: { cooldown: 12000, attack: 10, attackSpeed: 25 } },
        skill_act_bafojiao: { 2: { cooldown: 15000, attack: 8, attackSpeed: 25, speed: 0.01 }, 3: { cooldown: 12000, attack: 10, attackSpeed: 35, speed: 0.01 } },
        skill_act_moyu: { 2: { cooldown: 15000, duration: 6000 }, 3: { cooldown: 12000, duration: 6000 } },
        skill_act_nvdaxuesheng: { 2: { cooldown: 18000, provokeCount: 1 }, 3: { cooldown: 15000, provokeCount: 2 } },
        skill_act_jiti: { 2: { cooldown: 15000, targets: 4 }, 3: { cooldown: 12000, targets: 5 } },
        skill_act_shencha: { 2: { cooldown: 18000, duration: 6000 }, 3: { cooldown: 15000, duration: 6000 } },
        skill_act_zhongji: { 2: { cooldown: 20000 }, 3: { cooldown: 15000 } },
        skill_act_cengbiji: { 2: { cooldown: 18000, duration: 6000, ratio: 0.3 }, 3: { cooldown: 15000, duration: 6000, ratio: 0.4 } },
        skill_act_xiaoqi: { 2: { cooldown: 20000, value: 4 }, 3: { cooldown: 15000, value: 5 } },
        skill_act_kunkun: { 2: { cooldown: 18000, dps: 12, range: 110, auraShape: 'square' }, 3: { cooldown: 15000, dps: 15, range: 120, auraShape: 'square' } },
        skill_act_daike: { 2: { cooldown: 18000, hpRatio: 0.8 }, 3: { cooldown: 15000, hpRatio: 1 } },
        skill_act_chaozuoye: { 2: { cooldown: 18000 }, 3: { cooldown: 15000 } },
        skill_act_guake: { 2: { cooldown: 15000, range: 110, duration: 4000, auraShape: 'square' }, 3: { cooldown: 12000, range: 120, duration: 4000, auraShape: 'square' } },
        skill_act_tushuguan: { 2: { cooldown: 15000, range: 90, duration: 4000 }, 3: { cooldown: 12000, range: 100, duration: 4000 } },
        skill_act_gaibug: { 2: { cooldown: 15000, count: 4 }, 3: { cooldown: 12000, count: 5 } },
        skill_act_dadianming: { 2: { cooldown: 30000, value: 25 }, 3: { cooldown: 25000, value: 30 } },
        skill_act_qimo: { 2: { cooldown: 30000 }, 3: { cooldown: 20000 } },
    };

    function getSurvivalLevelFromKills(kills) {
        if (kills >= 15) return 3;
        if (kills >= 5) return 2;
        return 1;
    }

    function getActiveSkillAtLevel(skillId, level = 1) {
        const base = getSkillById(skillId);
        if (!base || base.type !== 'skill_active') return base;
        const overrides = ACTIVE_SKILL_LEVEL_OVERRIDES[skillId]?.[level];
        return overrides ? { ...base, ...overrides } : { ...base };
    }

    function isInSkillArea(entity, center, range, shape = 'circle') {
        if (shape === 'square') {
            return Math.abs(entity.x - center.x) <= range && Math.abs(entity.y - center.y) <= range;
        }
        return Math.hypot(entity.x - center.x, entity.y - center.y) <= range;
    }

    function createSkillController(options) {
        const {
            activeSkillId,
            passiveSkillId,
            getPlayerPoint,
            getHealth,
            setHealth,
            getMaxHealth = () => 100,
            getMonsters,
            setMonsters,
            spawnMonster,
            getAttack,
            getPlayerBaseMoveStep,
            getPlayerAppearance,
            getPlayerEquipment,
            getSkillLevel,
            toast,
            addEffect,
            onKill,
        } = options;

        const activeSkill = getSkillById(activeSkillId);
        const passiveSkill = getSkillById(passiveSkillId);

        function getResolvedActiveSkill() {
            if (!activeSkill) return null;
            const level = getSkillLevel?.() || 1;
            return getActiveSkillAtLevel(activeSkill.id, level);
        }

        const state = {
            activeCdUntil: 0,
            buffs: [],
            nextAttackBonusHits: 0,
            nextAttackBonusValue: 0,
            multiTargetHits: 0,
            multiTargetCount: 1,
            invisibleUntil: 0,
            invincibleUntil: 0,
            lifestealUntil: 0,
            lifestealRatio: 0,
            regenUntil: 0,
            regenPerSecond: 0,
            lastRegenTick: 0,
            poisonAuraUntil: 0,
            poisonAuraDps: 0,
            poisonAuraRange: 0,
            poisonAuraShape: 'circle',
            slowAuraUntil: 0,
            slowAuraValue: 0,
            slowAuraRange: 0,
            lastPoisonTick: 0,
            lastIdleRegenTick: 0,
            lastPlayerAttackAt: 0,
            noteAttackBonus: 0,
            instantKillCharge: false,
            reviveUsedAt: 0,
            clone: null,
        };

        function nowMs() {
            return performance.now();
        }

        function distance(a, b) {
            return Math.hypot(a.x - b.x, a.y - b.y);
        }

        function sortedMonsters(fromPoint, limit = Infinity) {
            return [...getMonsters()]
                .filter(monster => !monster.isAlly)
                .sort((a, b) => distance(a, fromPoint) - distance(b, fromPoint))
                .slice(0, limit);
        }

        function addBuff(type, value, duration, extra = {}) {
            state.buffs.push({ type, value, expiresAt: nowMs() + duration, ...extra });
        }

        function getBuffSum(type) {
            const now = nowMs();
            state.buffs = state.buffs.filter(buff => buff.expiresAt > now);
            return state.buffs.filter(buff => buff.type === type).reduce((sum, buff) => sum + buff.value, 0);
        }

        function getCooldown(skill) {
            if (!skill) return MIN_SKILL_CD;
            const reduce = passiveSkill?.effect === 'cd_reduce' ? passiveSkill.value : 0;
            return Math.max(MIN_SKILL_CD, skill.cooldown - reduce);
        }

        function getPassiveAttackBonus() {
            let bonus = 0;
            if (passiveSkill?.effect === 'attack') bonus += passiveSkill.value;
            bonus += state.noteAttackBonus;
            return bonus;
        }

        function getPassiveAttackSpeedBonus() {
            if (passiveSkill?.effect === 'attack_speed') return passiveSkill.value;
            return 0;
        }

        function getPassiveSpeedBonus(health) {
            let bonus = 0;
            if (passiveSkill?.effect === 'speed') bonus += passiveSkill.value;
            if (passiveSkill?.effect === 'low_hp_speed' && health <= passiveSkill.threshold) bonus += passiveSkill.value;
            return bonus;
        }

        function getTimedAttackBonus() {
            return getBuffSum('attack');
        }

        function getTimedAttackSpeedBonus() {
            return getBuffSum('attackSpeed');
        }

        function getTimedSpeedBonus() {
            return getBuffSum('speed');
        }

        function modifySpawnedMonster(monster) {
            if (passiveSkill?.effect === 'npc_attack_down') {
                monster.attack = Math.max(1, monster.attack - passiveSkill.value);
            }
            return monster;
        }

        function getMonsterAttackInterval(monster, playerPoint) {
            let interval = monster.attackInterval;
            if (passiveSkill?.effect === 'slow_attack_aura' && distance(monster, playerPoint) <= passiveSkill.range) {
                interval += passiveSkill.value;
            }
            return interval;
        }

        function getMonsterMoveSpeed(monster, playerPoint) {
            let speed = monster.speed;
            if (state.slowAuraUntil > nowMs() && distance(monster, playerPoint) <= state.slowAuraRange) {
                speed = Math.max(0.2, speed - getPlayerBaseMoveStep());
            }
            return speed;
        }

        function isPlayerInvisible() {
            return state.invisibleUntil > nowMs();
        }

        function isPlayerInvincible() {
            return state.invincibleUntil > nowMs();
        }

        function canUseActive() {
            return Boolean(activeSkill) && nowMs() >= state.activeCdUntil;
        }

        function getActiveCooldownLeft() {
            return Math.max(0, Math.ceil((state.activeCdUntil - nowMs()) / 1000));
        }

        function applyActiveEffect() {
            const skill = getResolvedActiveSkill();
            if (!skill) return false;
            const playerPoint = getPlayerPoint();
            const now = nowMs();

            switch (skill.effect) {
                case 'buff_attack':
                    addBuff('attack', skill.value, skill.duration);
                    toast(`${skill.name}：攻击 +${skill.value}`);
                    break;
                case 'next_attacks':
                    state.nextAttackBonusHits = skill.hits;
                    state.nextAttackBonusValue = skill.value;
                    toast(`${skill.name}：下 ${skill.hits} 次攻击 +${skill.value}`);
                    break;
                case 'heal':
                    setHealth(Math.min(getMaxHealth(), getHealth() + skill.value));
                    toast(`${skill.name}：生命 +${skill.value}`);
                    break;
                case 'buff_speed':
                    addBuff('speed', skill.value, skill.duration);
                    toast(`${skill.name}：移速 +${skill.value}`);
                    break;
                case 'buff_attack_speed':
                    addBuff('attackSpeed', skill.value, skill.duration);
                    toast(`${skill.name}：攻速 +${skill.value}`);
                    break;
                case 'slow_aura':
                    state.slowAuraUntil = now + skill.duration;
                    state.slowAuraValue = skill.value;
                    state.slowAuraRange = skill.range;
                    toast(`${skill.name}：周围敌人减速`);
                    break;
                case 'buff_combo':
                    if (skill.attack) addBuff('attack', skill.attack, skill.duration);
                    if (skill.attackSpeed) addBuff('attackSpeed', skill.attackSpeed, skill.duration);
                    if (skill.speed) addBuff('speed', skill.speed, skill.duration);
                    toast(`${skill.name}：综合强化`);
                    break;
                case 'invisible':
                    state.invisibleUntil = now + skill.duration;
                    toast(`${skill.name}：进入隐身`);
                    break;
                case 'provoke': {
                    const provokeCount = skill.provokeCount || 1;
                    const candidates = sortedMonsters(playerPoint, provokeCount + 1);
                    if (candidates.length < 2) {
                        toast('附近 NPC 不足');
                        return false;
                    }
                    for (let i = 0; i < provokeCount && i < candidates.length - 1; i++) {
                        candidates[i].provokeUntil = now + skill.duration;
                        candidates[i].provokeTargetId = candidates[i + 1].id;
                    }
                    toast(`${skill.name}：${provokeCount} 个 NPC 开始互攻`);
                    break;
                }
                case 'multi_target':
                    state.multiTargetHits = skill.hits;
                    state.multiTargetCount = skill.targets;
                    toast(`${skill.name}：下 ${skill.hits} 次攻击命中 ${skill.targets} 个目标`);
                    break;
                case 'invincible':
                    state.invincibleUntil = now + skill.duration;
                    toast(`${skill.name}：无敌`);
                    break;
                case 'instant_kill': {
                    const victims = sortedMonsters(playerPoint, skill.count);
                    if (!victims.length) {
                        toast('没有可秒杀的目标');
                        return false;
                    }
                    victims.forEach(monster => killMonster(monster));
                    toast(`${skill.name}：秒杀 ${victims.length} 个 NPC`);
                    break;
                }
                case 'lifesteal':
                    state.lifestealUntil = now + skill.duration;
                    state.lifestealRatio = skill.ratio;
                    toast(`${skill.name}：开启吸血`);
                    break;
                case 'regen':
                    state.regenUntil = now + skill.duration;
                    state.regenPerSecond = skill.value;
                    state.lastRegenTick = now;
                    toast(`${skill.name}：持续回血`);
                    break;
                case 'poison_aura':
                    state.poisonAuraUntil = now + skill.duration;
                    state.poisonAuraDps = skill.dps;
                    state.poisonAuraRange = skill.range;
                    state.poisonAuraShape = skill.auraShape || 'circle';
                    state.lastPoisonTick = now;
                    toast(`${skill.name}：开启毒域`);
                    break;
                case 'clone': {
                    const appearance = getPlayerAppearance?.() || {};
                    const equipment = getPlayerEquipment?.() || {};
                    const moveStep = getPlayerBaseMoveStep();
                    const cloneHp = Math.round(getMaxHealth() * skill.hpRatio);
                    state.clone = {
                        x: playerPoint.x,
                        y: playerPoint.y,
                        hp: cloneHp,
                        maxHp: cloneHp,
                        attack: Math.max(1, Math.round(getAttack() * 0.85)),
                        attackRange: equipment.attackRange || 40,
                        speed: moveStep + (equipment.speedBonus || 0),
                        expiresAt: now + (skill.duration || 15000),
                        lastAttackAt: 0,
                        skinImage: appearance.skinImage || null,
                        skinColor: appearance.skinColor || '#4A90D9',
                        size: appearance.size || 24,
                    };
                    toast(`${skill.name}：分身已召唤`);
                    break;
                }
                case 'copy_ally': {
                    const target = sortedMonsters(playerPoint, 1)[0];
                    if (!target) {
                        toast('没有可复制目标');
                        return false;
                    }
                    target.isAlly = true;
                    target.allyUntil = now + skill.duration;
                    toast(`${skill.name}：${target.name} 成为盟友`);
                    break;
                }
                case 'root_aura':
                    getMonsters().forEach(monster => {
                        if (!monster.isAlly && isInSkillArea(monster, playerPoint, skill.range, skill.auraShape || 'circle')) {
                            monster.rootedUntil = now + skill.duration;
                        }
                    });
                    toast(`${skill.name}：定身`);
                    break;
                case 'stun_aura':
                    getMonsters().forEach(monster => {
                        if (!monster.isAlly && distance(monster, playerPoint) <= skill.range) {
                            monster.stunnedUntil = now + skill.duration;
                        }
                    });
                    toast(`${skill.name}：封禁`);
                    break;
                case 'reduce_hp': {
                    const targets = sortedMonsters(playerPoint, skill.count);
                    if (!targets.length) {
                        toast('没有可削弱的目标');
                        return false;
                    }
                    targets.forEach(monster => { monster.hp = skill.hp; });
                    toast(`${skill.name}：削弱 ${targets.length} 个 NPC`);
                    break;
                }
                case 'global_damage':
                    getMonsters().filter(monster => !monster.isAlly).forEach(monster => {
                        monster.hp -= skill.value;
                        if (monster.hp <= 0) killMonster(monster);
                    });
                    toast(`${skill.name}：全场 -${skill.value}`);
                    break;
                case 'global_stun':
                    getMonsters().forEach(monster => {
                        if (!monster.isAlly) monster.stunnedUntil = now + skill.duration;
                    });
                    toast(`${skill.name}：全场僵直`);
                    break;
                default:
                    toast('技能未实现');
                    return false;
            }

            if (passiveSkill?.effect === 'active_stack_attack') {
                state.noteAttackBonus = Math.min(passiveSkill.cap, state.noteAttackBonus + passiveSkill.value);
            }
            if (passiveSkill?.effect === 'after_active_kill') {
                state.instantKillCharge = true;
            }
            return true;
        }

        function useActiveSkill() {
            if (!activeSkill) {
                toast('未装备主动技能');
                return false;
            }
            if (!canUseActive()) {
                toast(`技能冷却中（${getActiveCooldownLeft()}s）`);
                return false;
            }
            const ok = applyActiveEffect();
            if (ok === false) return false;
            state.activeCdUntil = nowMs() + getCooldown(getResolvedActiveSkill());
            return true;
        }

        function killMonster(monster) {
            setMonsters(getMonsters().filter(item => item.id !== monster.id));
            onKill?.(monster);
            spawnMonster?.();
        }

        function getDisplayAttackBonus() {
            let bonus = 0;
            if (passiveSkill?.effect === 'attack') bonus += passiveSkill.value;
            bonus += state.noteAttackBonus;
            bonus += getTimedAttackBonus();
            return bonus;
        }

        function rollAttackBonus() {
            let bonus = getDisplayAttackBonus();
            if (state.nextAttackBonusHits > 0) {
                bonus += state.nextAttackBonusValue;
                state.nextAttackBonusHits -= 1;
            }
            if (passiveSkill?.effect === 'lucky_attack' && Math.random() < passiveSkill.chance) {
                bonus += passiveSkill.value;
            }
            return bonus;
        }

        function getAttackTargetCount() {
            let count = 1;
            if (state.multiTargetHits > 0) count = Math.max(count, state.multiTargetCount);
            if (passiveSkill?.effect === 'lucky_multi' && Math.random() < passiveSkill.chance) {
                count = Math.max(count, passiveSkill.targets);
            }
            return count;
        }

        function consumeMultiTargetHit() {
            if (state.multiTargetHits > 0) state.multiTargetHits -= 1;
        }

        function resolveAttackTargets(playerPoint, range) {
            const count = getAttackTargetCount();
            return sortedMonsters(playerPoint, count).filter(monster => distance(monster, playerPoint) <= range);
        }

        function shouldInstantKill() {
            if (state.instantKillCharge) {
                state.instantKillCharge = false;
                return true;
            }
            return false;
        }

        function applyLifesteal(damage) {
            if (state.lifestealUntil > nowMs() && state.lifestealRatio > 0) {
                setHealth(Math.min(getMaxHealth(), getHealth() + Math.round(damage * state.lifestealRatio)));
            }
        }

        function handleIncomingDamage(amount, sourceMonster) {
            if (isPlayerInvincible()) return 0;

            if (passiveSkill?.effect === 'reflect' && sourceMonster && Math.random() < passiveSkill.chance) {
                const reflect = Math.max(1, Math.round(amount * passiveSkill.ratio));
                sourceMonster.hp -= reflect;
                addEffect?.({
                    type: 'damage',
                    x: sourceMonster.x,
                    y: sourceMonster.y,
                    text: `反伤 -${reflect}`,
                    color: '#38bdf8',
                    createdAt: nowMs(),
                    duration: 460,
                });
                if (sourceMonster.hp <= 0) killMonster(sourceMonster);
            }

            if (passiveSkill?.effect === 'stun_attacker' && sourceMonster && Math.random() < passiveSkill.chance) {
                sourceMonster.stunnedUntil = nowMs() + passiveSkill.duration;
            }

            return amount;
        }

        function tryRevive() {
            if (passiveSkill?.effect !== 'revive') return false;
            const now = nowMs();
            if (now - state.reviveUsedAt < passiveSkill.cooldown) return false;
            state.reviveUsedAt = now;
            setHealth(passiveSkill.heal);
            toast(`${passiveSkill.name}：复活并恢复 ${passiveSkill.heal} 生命`);
            return true;
        }

        function onPlayerAttackPerformed() {
            state.lastPlayerAttackAt = nowMs();
        }

        function onMonsterKilled() {
            if (passiveSkill?.effect === 'kill_heal') {
                setHealth(Math.min(getMaxHealth(), getHealth() + passiveSkill.value));
            }
        }

        function getActiveClone() {
            if (!state.clone || state.clone.hp <= 0) return null;
            if (nowMs() > state.clone.expiresAt) {
                state.clone = null;
                return null;
            }
            return state.clone;
        }

        function damageClone(amount, source) {
            const clone = getActiveClone();
            if (!clone) return;
            clone.hp = Math.max(0, clone.hp - amount);
            addEffect?.({
                type: 'damage',
                x: clone.x,
                y: clone.y,
                text: `-${amount}`,
                color: '#fca5a5',
                createdAt: nowMs(),
                duration: 460,
            });
            if (clone.hp <= 0) {
                state.clone = null;
                toast(typeof source === 'string' ? `分身被 ${source} 击败` : '分身已被击败');
            }
        }

        function updateClone(now, monsters, deltaTime = 1 / 60) {
            const clone = getActiveClone();
            if (!clone) return;

            const target = [...monsters].filter(monster => !monster.isAlly)
                .sort((a, b) => distance(a, clone) - distance(b, clone))[0];
            if (!target) return;

            const dist = distance(clone, target);
            const stopDistance = Math.min(32, clone.attackRange - 5);
            if (dist > stopDistance) {
                const dx = target.x - clone.x;
                const dy = target.y - clone.y;
                const frameScale = deltaTime * 60;
                const step = Math.min(clone.speed || getPlayerBaseMoveStep(), Math.max(0, dist - stopDistance)) * frameScale;
                clone.x += (dx / dist) * step;
                clone.y += (dy / dist) * step;
            }

            if (dist <= (clone.attackRange || 40) && now - clone.lastAttackAt > 700) {
                clone.lastAttackAt = now;
                target.hp -= clone.attack;
                addEffect?.({
                    type: 'strike',
                    from: { x: clone.x, y: clone.y },
                    to: { x: target.x, y: target.y },
                    color: '#fde047',
                    createdAt: now,
                    duration: 240,
                });
                addEffect?.({
                    type: 'damage',
                    x: target.x,
                    y: target.y,
                    text: `-${clone.attack}`,
                    color: '#fde047',
                    createdAt: now,
                    duration: 460,
                });
                if (target.hp <= 0) killMonster(target);
            }
        }

        function updateAllies(now, monsters, deltaTime = 1 / 60) {
            const frameScale = deltaTime * 60;
            monsters.forEach(monster => {
                if (!monster.isAlly) return;
                if (monster.allyUntil && now > monster.allyUntil) {
                    monster.isAlly = false;
                    monster.allyUntil = 0;
                    return;
                }
                const target = monsters.filter(item => !item.isAlly && item.id !== monster.id)
                    .sort((a, b) => distance(a, monster) - distance(b, monster))[0];
                if (target && distance(monster, target) > 3) {
                    const dx = target.x - monster.x;
                    const dy = target.y - monster.y;
                    const d = Math.hypot(dx, dy) || 1;
                    const step = Math.min(monster.speed, d - 3) * frameScale;
                    monster.x += (dx / d) * step;
                    monster.y += (dy / d) * step;
                }
                if (target && distance(monster, target) <= monster.attackRange && now - monster.lastAttackAt > monster.attackInterval) {
                    monster.lastAttackAt = now;
                    target.hp -= monster.attack;
                    if (target.hp <= 0) killMonster(target);
                }
            });
        }

        function updateTimedEffects(now, deltaTime = 1 / 60) {
            const playerPoint = getPlayerPoint();

            if (state.regenUntil > now && now - state.lastRegenTick >= 1000) {
                state.lastRegenTick = now;
                setHealth(Math.min(getMaxHealth(), getHealth() + state.regenPerSecond));
            }

            if (state.poisonAuraUntil > now && now - state.lastPoisonTick >= 1000) {
                state.lastPoisonTick = now;
                getMonsters().forEach(monster => {
                    if (!monster.isAlly && isInSkillArea(monster, playerPoint, state.poisonAuraRange, state.poisonAuraShape)) {
                        monster.hp -= state.poisonAuraDps;
                        if (monster.hp <= 0) killMonster(monster);
                    }
                });
            }

            if (passiveSkill?.effect === 'idle_regen') {
                const idle = now - state.lastPlayerAttackAt > 1000;
                if (idle && now - state.lastIdleRegenTick >= 1000) {
                    state.lastIdleRegenTick = now;
                    setHealth(Math.min(getMaxHealth(), getHealth() + passiveSkill.value));
                }
            }

            updateClone(now, getMonsters(), deltaTime);
            updateAllies(now, getMonsters(), deltaTime);
        }

        function getHudText() {
            const skill = getResolvedActiveSkill();
            if (!skill) return '技能：无';
            const level = getSkillLevel?.() || 1;
            const cd = getActiveCooldownLeft();
            const levelTag = level > 1 ? ` Lv${level}` : '';
            return cd > 0 ? `技能：${skill.name}${levelTag}（${cd}s）` : `技能：${skill.name}${levelTag}（按 I）`;
        }

        function drawClone(ctx, cameraRef, clone, drawHealthBar) {
            if (!clone) return;
            const point = cameraRef.worldToScreen(clone.x, clone.y);
            const size = Math.max(12, (clone.size || 24) * cameraRef.state.zoom);
            ctx.save();
            ctx.globalAlpha = 0.92;
            if (clone.skinImage?.complete && clone.skinImage.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(clone.skinImage, point.x - size / 2, point.y - size / 2, size, size);
            } else {
                ctx.fillStyle = clone.skinColor || '#4A90D9';
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
            }
            ctx.fillStyle = '#dbeafe';
            ctx.font = '11px Microsoft YaHei, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('分身', point.x, point.y - size / 2 - 6);
            if (drawHealthBar) {
                drawHealthBar(ctx, point.x, point.y - size / 2 - 18, Math.max(24, size * 1.2), 5, clone.hp, clone.maxHp, '#60a5fa');
            }
            ctx.restore();
        }

        return {
            state,
            activeSkill,
            passiveSkill,
            modifySpawnedMonster,
            getPassiveAttackBonus,
            getDisplayAttackBonus,
            getPassiveAttackSpeedBonus,
            getPassiveSpeedBonus,
            getTimedAttackBonus,
            getTimedAttackSpeedBonus,
            getTimedSpeedBonus,
            getMonsterAttackInterval,
            getMonsterMoveSpeed,
            isPlayerInvisible,
            isPlayerInvincible,
            canUseActive,
            useActiveSkill,
            getActiveCooldownLeft,
            getHudText,
            rollAttackBonus,
            resolveAttackTargets,
            consumeMultiTargetHit,
            shouldInstantKill,
            applyLifesteal,
            handleIncomingDamage,
            tryRevive,
            onPlayerAttackPerformed,
            onMonsterKilled,
            updateTimedEffects,
            killMonster,
            getActiveClone,
            damageClone,
            drawClone,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        skills: {
            ACTIVE_SKILLS,
            PASSIVE_SKILLS,
            ALL_SKILLS,
            getSkillById,
            getOwnedSkillIds,
            getAvailableSkills,
            getShopSkillItems,
            sortShopSkillItems,
            SKILL_PRICE_STANDARD,
            SKILL_PRICE_PREMIUM,
            getSurvivalLevelFromKills,
            getActiveSkillAtLevel,
            createSkillController,
        },
    };
})(window);
