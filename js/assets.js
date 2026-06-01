(function(global) {
    const ASSET_BASE_URL = 'https://lwybcgloshymklseaysk.supabase.co/storage/v1/object/public/game-assets';
    const DEFAULT_SKIN_PATH = `${ASSET_BASE_URL}/origin/1_universal.png`;
    const DEFAULT_SKIN = {
        id: 'skin_default',
        type: 'skin',
        name: 'NCUTer',
        price: 0,
        rarity: '默认',
        collectionValue: 0,
        assetPath: DEFAULT_SKIN_PATH,
        fallbackColor: '#4A90D9',
        description: '默认角色，永久免费使用',
        isDefault: true,
    };

    const skinFiles = [
        '1_universal.png',
        '2_universal.png',
        '3_universal.png',
        '4_universal.png',
        '5_universal.png',
        '6_universal.png',
        '7_universal.png',
        '8_universal.png',
        '9_universal.png',
        '10_universal.png',
        '11_universal.png',
        '12_universal.png',
        '13_universal.png',
        '14_universal.png',
        '15_universal.png',
        '16_universal.png',
        '17_universal.png',
        '18_universal.png',
        '19_universal.png',
        '20_universal.png',
        '21_universal.png',
        '22_universal.png',
        '23_universal.png',
        '24_universal.png',
        '25_universal.png',
        '26_universal.png',
        '27_universal.png',
        '28_universal.png',
        '29_universal.png',
        '30_universal.png',
        '31_universal.png',
        '32_universal.png',
        '33_universal.png',
        '34_universal.png',
        '35_universal.png',
        '36_universal.png',
        '37_universal.png',
        '38_universal.png',
        '39_universal.png',
        '40_universal.png',
        '41_universal.png',
        '42_universal.png',
        '43_universal.png',
        '44_universal.png',
        '45_universal.png',
        '46_universal.png',
        '47_universal.png',
        '48_universal.png',
        '49_universal.png',
        '50_universal.png',
        '51_universal.png',
        '52_universal.png',
    ];

    const skinNames = [
        '斯诺亚斯',
        '萨拉维尔',
        '卡伦德',
        '洛伦佐',
        '维塔利',
        '埃弗瑞',
        '莫兰迪',
        '希尔德',
        '布莱德森',
        '加里奥斯',
        '菲诺尔',
        '莱文特',
        '赛缪尔',
        '诺瓦克',
        '迪兰斯',
        '格瑞姆',
        '伊莱亚斯',
        '托雷兹',
        '安塞尔',
        '科瑞尔',
        '玛瑞亚',
        '莉诺尔',
        '塞拉菲娜',
        '艾维娜',
        '卡洛琳',
        '黛洛丝',
        '芙蕾雅',
        '吉莉安',
        '赫琳娜',
        '伊索拉',
        '凯瑞丝',
        '蕾蒙德',
        '露西娅',
        '米娅琳',
        '奈蒂尔',
        '欧菲拉',
        '佩洛妮',
        '瑞秋尔',
        '索菲娅',
        '塔莉安',
        '温妮莎',
        '亚丽珊',
        '佐伊拉',
        '巴伦尔',
        '查维斯',
        '多尼尔',
        '弗林特',
        '哈维德',
        '杰洛斯',
        '昆特恩',
        '瑞拉德',
        '斯特兰',
        '沃伦德'
    ];

    function getSkinRarity(index) {
        if (index >= 45) return { rarity: '传说', price: 8888, collectionValue: 80 };
        if (index >= 30) return { rarity: '史诗', price: 3888, collectionValue: 30 };
        return { rarity: '普通', price: 1946, collectionValue: 10 };
    }

    const skins = skinFiles.map((fileName, index) => {
        const rarity = getSkinRarity(index);
        return {
            id: `skin_${index + 1}`,
            type: 'skin',
            name: skinNames[index] || `校园皮肤 ${index + 1}`,
            price: rarity.price,
            rarity: rarity.rarity,
            collectionValue: rarity.collectionValue,
            assetPath: `${ASSET_BASE_URL}/human/${fileName}`,
            fallbackColor: ['#4A90D9', '#8b5cf6', '#10b981', '#f97316', '#ec4899', '#22d3ee'][index % 6],
            description: '',
        };
    });

    const BASE_ATTACK_INTERVAL = 320;
    const MIN_ATTACK_INTERVAL = 120;

    function getAttackInterval(attackSpeedBonus = 0) {
        return Math.max(MIN_ATTACK_INTERVAL, BASE_ATTACK_INTERVAL - attackSpeedBonus);
    }

    const equipment = [
        { id: 'weapon_knife', type: 'weapon', name: '像素短刀', price: 520, attack: 10, range: 20, speed: 0, attackSpeed: 20, durability: 15, icon: 'knife', purchasable: true },
        { id: 'weapon_gloves', type: 'weapon', name: '拳击手套', price: 360, attack: 5, range: 15, speed: 0, attackSpeed: 30, durability: 20, icon: 'gloves', purchasable: true },
        { id: 'weapon_hammer', type: 'weapon', name: '爆锤', price: 800, attack: 25, range: 25, speed: -0.001, attackSpeed: -30, durability: 10, icon: 'hammer', purchasable: false },
        { id: 'weapon_claw', type: 'weapon', name: '格斗爪', price: 620, attack: 10, range: 15, speed: 0, attackSpeed: 35, durability: 15, icon: 'claw', purchasable: true },
        { id: 'weapon_gun', type: 'weapon', name: '训练手枪', price: 1200, attack: 20, range: 100, speed: 0, attackSpeed: 25, durability: 10, icon: 'gun', purchasable: true },
        { id: 'weapon_spear', type: 'weapon', name: '长柄矛', price: 760, attack: 15, range: 35, speed: 0, attackSpeed: 5, durability: 15, icon: 'spear', purchasable: true },
        { id: 'tool_shovel', type: 'tool', name: '工兵铲', price: 420, attack: 15, range: 25, speed: 0, attackSpeed: 10, durability: 10, icon: 'shovel', purchasable: true },
        { id: 'tool_axe', type: 'tool', name: '战术斧', price: 750, attack: 20, range: 30, speed: -0.001, attackSpeed: -30, durability: 10, icon: 'axe', purchasable: false },
        { id: 'tool_sickle', type: 'tool', name: '月牙镰刀', price: 900, attack: 20, range: 35, speed: 0, attackSpeed: 15, durability: 10, icon: 'sickle', purchasable: false },
        { id: 'tool_boots', type: 'speed', name: '疾行鞋', price: 660, attack: 0, range: 0, speed: 0.01, attackSpeed: 0, moveDurability: 1800, icon: 'boots', purchasable: true },
        { id: 'tool_charm', type: 'speed', name: '风行者护符', price: 1200, attack: -1, range: 0, speed: 0.08, attackSpeed: 50, moveDurability: 1200, icon: 'charm', purchasable: false },
    ];

    equipment.forEach(item => {
        const attackText = item.attack ? `攻击${item.attack > 0 ? '+' : ''}${item.attack}` : '';
        const rangeText = item.range ? `距离+${item.range}像素` : '';
        const speedText = item.speed ? `移速${item.speed > 0 ? '+' : ''}${item.speed}` : '';
        const attackSpeedText = item.attackSpeed ? `攻速${item.attackSpeed > 0 ? '+' : ''}${item.attackSpeed}` : '';
        item.description = [attackText, rangeText, speedText, attackSpeedText].filter(Boolean).join('，') || '可携带进入摸金模式';
    });

    const survivalItems = [
        { id: 'survival_medkit', type: 'medkit', name: '医疗包', heal: 20, icon: 'medkit', description: '恢复20点生命值' },
    ];

    const capacityItems = [
        {
            id: 'capacity_card_50',
            type: 'capacity',
            name: '背包扩容卡',
            price: 500,
            capacityBonus: 50,
            icon: 'capacity',
            description: '背包容量+50',
        },
    ];

    const renameItems = [
        {
            id: 'item_rename_card',
            type: 'rename_card',
            name: '改名卡',
            price: 500,
            icon: 'rename',
            purchasable: true,
            description: '使用后修改游戏昵称',
        },
    ];

    const gems = [
        { id: 'gem_white', type: 'gem', name: '白宝石', value: 300, color: '#f8fafc', weight: 2 },
        { id: 'gem_purple', type: 'gem', name: '紫宝石', value: 150, color: '#a855f7', weight: 5 },
        { id: 'gem_red', type: 'gem', name: '红宝石', value: 100, color: '#ef4444', weight: 7 },
        { id: 'gem_blue', type: 'gem', name: '蓝宝石', value: 80, color: '#3b82f6', weight: 10 },
        { id: 'gem_yellow', type: 'gem', name: '黄宝石', value: 50, color: '#facc15', weight: 14 },
        { id: 'gem_orange', type: 'gem', name: '橙宝石', value: 20, color: '#fb923c', weight: 20 },
        { id: 'gem_pink', type: 'gem', name: '粉宝石', value: 10, color: '#f9a8d4', weight: 28 },
    ];

    const collectibles = [
        { id: 'collectible_ncut', type: 'collectible', name: 'NCUT', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/1.png`, description: '收藏值+100' },
        { id: 'collectible_badge', type: 'collectible', name: 'NCUT校徽', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/2.png`, description: '收藏值+100' },
        { id: 'collectible_motto', type: 'collectible', name: 'NCUT校训', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/3.png`, description: '收藏值+100' },
        { id: 'collectible_map', type: 'collectible', name: 'NCUT地图', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/4.jpg`, description: '收藏值+100' },
        { id: 'collectible_like', type: 'collectible', name: 'NCUT点赞', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/5.jpg`, description: '收藏值+100' },
        { id: 'collectible_facepalm', type: 'collectible', name: 'NCUT捂脸', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/6.jpg`, description: '收藏值+100' },
        { id: 'collectible_dropout', type: 'collectible', name: 'NCUT退学通知书', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/7.jpg`, description: '收藏值+100' },
        { id: 'collectible_quit', type: 'collectible', name: 'NCUT不读了', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/8.jpg`, description: '收藏值+100' },
        { id: 'collectible_escape', type: 'collectible', name: '逃离NCUT', collectionValue: 100, assetPath: `${ASSET_BASE_URL}/cangpin/9.jpg`, description: '收藏值+100' },
    ];

    const npcNames = [
        "高数",
        "线性代数",
        "大学英语",
        "计算机网络",
        "数据结构",
        "概率论",
        "操作系统",
        "电路分析",
        "工程制图",
        "体育",
        "大学物理",
        "离散数学",
        "C 语言程序设计",
        "Python 程序开发",
        "Java 程序设计",
        "数据库原理",
        "算法设计与分析",
        "计算机组成原理",
        "编译原理",
        "软件工程",
        "信息安全导论",
        "密码学基础",
        "网络攻防技术",
        "防火墙与入侵检测",
        "数据加密技术",
        "大数据导论",
        "分布式计算",
        "Hadoop 框架应用",
        "数据挖掘",
        "数据仓库技术",
        "人工智能导论",
        "机器学习",
        "深度学习",
        "神经网络原理",
        "计算机视觉",
        "自然语言处理",
        "机械原理",
        "机械设计",
        "机械制造技术",
        "液压与气压传动",
        "材料力学",
        "理论力学",
        "金属材料学",
        "材料成型工艺",
        "材料性能检测",
        "模拟电子技术",
        "数字电子技术",
        "电机与拖动",
        "电力系统分析",
        "电气控制技术",
        "自动控制原理",
        "PLC 应用技术",
        "过程控制工程",
        "现代控制理论",
        "基础会计",
        "中级财务会计",
        "成本会计",
        "财务管理",
        "审计学",
        "建筑材料",
        "建筑构造",
        "建筑设计基础",
        "中外建筑史",
        "园林规划设计",
        "园林植物学",
        "园林工程施工",
        "园林景观设计",
        "管理学原理",
        "市场营销学",
        "人力资源管理",
        "企业运营管理",
        "西方经济学",
        "货币银行学",
        "国际金融",
        "证券投资学",
        "金融风险管理",
        "法理学",
        "民法总论",
        "刑法学",
        "行政法",
        "经济法",
        "知识产权法",
        "专利代理实务",
        "商标法与著作权法",
        "数理统计",
        "应用统计学",
        "抽样调查技术",
        "多元统计分析",
        "混凝土结构",
        "土力学与地基基础",
        "建筑施工技术",
        "桥梁工程",
        "电子测量技术",
        "信号与系统",
        "高频电子线路",
        "通信原理",
        "移动通信技术",
        "光纤通信",
        "数字信号处理",
        "影视剪辑技术",
        "UI 界面设计",
        "三维建模技术",
        "数字图像处理",
        "大众演讲与口才",
        "心理健康教育",
        "职业生涯规划",
        "传统文化概论",
        "创新创业基础"
        ]
        ;
    const npcFiles = [
        '2_universal.png',
        '3_universal.png',
        '4_universal.png',
        '5_universal.png',
        '6_universal.png',
        '7_universal.png',
        '8_universal.png',
        '9_universal.png',
        '10_universal.png',
        '11_universal.png',
        '12_universal.png',
        '13_universal.png',
        '14_universal.png',
        '15_universal.png',
        '16_universal.png',
        '17_universal.png',
        '18_universal.png',
        '19_universal.png',
        '20_universal.png',
        '21_universal.png',
        '22_universal.png',
        '23_universal.png',
        '24_universal.png',
        '25_universal.png',
        '26_cast.png',
    ];
    const npcImages = npcFiles.map(fileName => `${ASSET_BASE_URL}/npc/${fileName}`);

    function getAllItems() {
        const skillItems = global.NCUTMap.skills?.ALL_SKILLS || [];
        return [...skins, ...equipment, ...capacityItems, ...renameItems, ...survivalItems, ...skillItems, ...collectibles, ...gems.map(gem => ({
            ...gem,
            price: gem.value,
            description: `可出售兑换 ${gem.value} NCUT 币`,
        }))];
    }

    let itemMapCache = null;

    function rebuildItemMap() {
        itemMapCache = new Map(getAllItems().map(item => [item.id, item]));
    }

    function getItemById(itemId) {
        if (!itemId) return null;
        if (!itemMapCache) rebuildItemMap();
        return itemMapCache.get(itemId) || null;
    }

    const npcImageCache = new Map();

    function getNpcImage(index = 0) {
        const key = ((index % npcImages.length) + npcImages.length) % npcImages.length;
        if (!npcImageCache.has(key)) {
            const image = new Image();
            image.src = npcImages[key];
            npcImageCache.set(key, image);
        }
        return npcImageCache.get(key);
    }

    const skinImageCache = new Map();
    const preloadPromises = new Map();

    function preloadUrl(url, timeoutMs = 8000) {
        if (!url) return Promise.resolve();
        if (preloadPromises.has(url)) return preloadPromises.get(url);

        const promise = new Promise(resolve => {
            const img = new Image();
            const finish = () => resolve();
            img.onload = finish;
            img.onerror = finish;
            img.src = url;
            setTimeout(finish, timeoutMs);
        });
        preloadPromises.set(url, promise);
        return promise;
    }

    async function preloadCombatAssets(options = {}) {
        const { skinItemId } = options;
        const urls = new Set([DEFAULT_SKIN_PATH]);
        const skin = skinItemId ? getItemById(skinItemId) : null;
        if (skin?.assetPath) urls.add(skin.assetPath);

        npcImages.slice(0, 14).forEach(url => urls.add(url));
        collectibles.slice(0, 6).forEach(item => {
            if (item.assetPath) urls.add(item.assetPath);
        });

        getNpcImage(0);
        getSkinImageForItemId(skinItemId);

        await Promise.all([...urls].map(url => preloadUrl(url)));
    }

    function getSkinImageForItemId(itemId) {
        const skin = itemId ? getItemById(itemId) : null;
        const assetPath = skin?.assetPath || DEFAULT_SKIN_PATH;
        if (!skinImageCache.has(assetPath)) {
            const img = new Image();
            img.src = assetPath;
            skinImageCache.set(assetPath, img);
        }
        return skinImageCache.get(assetPath);
    }

    function getSkinFallbackColor(itemId) {
        const skin = itemId ? getItemById(itemId) : null;
        return skin?.fallbackColor || '#4A90D9';
    }

    function drawPixelIcon(ctx, item, x, y, size) {
        ctx.save();
        ctx.translate(x, y);
        const s = size / 32;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(5 * s, 6 * s, 22 * s, 22 * s);

        function rect(color, rx, ry, rw, rh) {
            ctx.fillStyle = color;
            ctx.fillRect(rx * s, ry * s, rw * s, rh * s);
        }

        function stroke(color, rx, ry, rw, rh) {
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, 1.4 * s);
            ctx.strokeRect(rx * s, ry * s, rw * s, rh * s);
        }

        if (item.type === 'gem') {
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(16 * s, 2 * s);
            ctx.lineTo(29 * s, 16 * s);
            ctx.lineTo(16 * s, 30 * s);
            ctx.lineTo(3 * s, 16 * s);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = Math.max(1, 2 * s);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(13 * s, 7 * s, 6 * s, 5 * s);
        } else if (item.icon === 'knife') {
            rect('#e5e7eb', 15, 3, 5, 17);
            rect('#f8fafc', 18, 4, 2, 12);
            rect('#92400e', 12, 20, 12, 4);
            rect('#7c2d12', 15, 23, 6, 7);
        } else if (item.icon === 'gun') {
            rect('#cbd5e1', 5, 9, 21, 7);
            rect('#94a3b8', 24, 11, 5, 3);
            rect('#475569', 19, 15, 6, 10);
            rect('#64748b', 8, 16, 7, 4);
            rect('#facc15', 3, 11, 3, 2);
        } else if (item.icon === 'gloves') {
            rect('#dc2626', 7, 9, 8, 10);
            rect('#ef4444', 17, 9, 8, 10);
            rect('#991b1b', 8, 19, 6, 6);
            rect('#991b1b', 18, 19, 6, 6);
            rect('#fecaca', 9, 11, 3, 3);
            rect('#fecaca', 19, 11, 3, 3);
        } else if (item.icon === 'hammer') {
            rect('#9ca3af', 7, 6, 18, 7);
            rect('#e5e7eb', 9, 7, 5, 3);
            rect('#7c2d12', 14, 12, 5, 17);
            rect('#92400e', 16, 13, 3, 14);
        } else if (item.icon === 'claw') {
            rect('#7c2d12', 9, 20, 14, 6);
            rect('#e5e7eb', 8, 5, 3, 16);
            rect('#e5e7eb', 15, 4, 3, 17);
            rect('#e5e7eb', 22, 5, 3, 16);
            rect('#f8fafc', 9, 5, 1, 10);
            rect('#f8fafc', 16, 4, 1, 10);
            rect('#f8fafc', 23, 5, 1, 10);
        } else if (item.icon === 'spear') {
            rect('#92400e', 15, 7, 3, 22);
            rect('#d1d5db', 13, 3, 7, 6);
            rect('#f8fafc', 15, 1, 3, 4);
            rect('#7c2d12', 11, 22, 11, 3);
        } else if (item.icon === 'shovel') {
            rect('#92400e', 15, 4, 3, 15);
            rect('#cbd5e1', 11, 18, 11, 10);
            rect('#e5e7eb', 13, 19, 7, 4);
            stroke('#64748b', 11, 18, 11, 10);
        } else if (item.icon === 'axe') {
            rect('#92400e', 15, 7, 4, 22);
            rect('#cbd5e1', 9, 5, 13, 8);
            rect('#e5e7eb', 10, 6, 8, 3);
            rect('#64748b', 19, 9, 5, 4);
        } else if (item.icon === 'sickle') {
            rect('#92400e', 14, 13, 4, 16);
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = Math.max(2, 3 * s);
            ctx.beginPath();
            ctx.arc(17 * s, 12 * s, 9 * s, Math.PI * 0.85, Math.PI * 1.95);
            ctx.stroke();
            rect('#f8fafc', 8, 8, 4, 3);
        } else if (item.icon === 'boots') {
            rect('#7c2d12', 6, 14, 9, 11);
            rect('#7c2d12', 17, 14, 9, 11);
            rect('#fbbf24', 6, 24, 11, 4);
            rect('#fbbf24', 17, 24, 11, 4);
            rect('#fde68a', 9, 16, 4, 2);
            rect('#fde68a', 20, 16, 4, 2);
        } else if (item.icon === 'charm') {
            rect('#38bdf8', 14, 5, 5, 7);
            rect('#0f766e', 10, 12, 13, 13);
            rect('#67e8f9', 13, 15, 7, 7);
            rect('#f8fafc', 15, 17, 3, 3);
        } else if (item.icon === 'capacity') {
            rect('#7c3aed', 7, 8, 18, 18);
            rect('#a78bfa', 10, 11, 12, 12);
            rect('#ffffff', 15, 12, 2, 10);
            rect('#ffffff', 11, 16, 10, 2);
            stroke('#ede9fe', 7, 8, 18, 18);
        } else if (item.icon === 'medkit') {
            rect('#f8fafc', 6, 8, 20, 18);
            stroke('#cbd5e1', 6, 8, 20, 18);
            rect('#dc2626', 14, 11, 4, 12);
            rect('#dc2626', 10, 15, 12, 4);
        } else if (item.icon === 'rename') {
            rect('#fef3c7', 8, 6, 16, 20);
            stroke('#d97706', 8, 6, 16, 20);
            rect('#f59e0b', 11, 10, 10, 2);
            rect('#f59e0b', 11, 14, 8, 2);
            rect('#92400e', 20, 4, 4, 8);
            rect('#78350f', 19, 3, 2, 2);
        } else if (item.icon === 'skill') {
            const color = item.skillKind === 'passive' ? '#059669' : '#7c3aed';
            rect(color, 8, 6, 16, 20);
            stroke('#fde68a', 8, 6, 16, 20);
            rect('#fef3c7', 11, 10, 10, 2);
            rect('#fef3c7', 11, 14, 8, 2);
            rect('#fef3c7', 11, 18, 6, 2);
        } else {
            rect('#d1d5db', 14, 4, 4, 22);
            rect('#92400e', 12, 22, 8, 7);
            rect('#e5e7eb', 8, 5, 16, 5);
        }

        ctx.restore();
    }

    function createPixelIconDataUrl(itemId, size = 86) {
        const item = getItemById(itemId);
        if (!item) return '';
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        drawPixelIcon(ctx, item, 0, 0, size);
        return canvas.toDataURL('image/png');
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        assets: {
            DEFAULT_SKIN_PATH,
            DEFAULT_SKIN,
            BASE_ATTACK_INTERVAL,
            MIN_ATTACK_INTERVAL,
            getAttackInterval,
            skins,
            equipment,
            capacityItems,
            renameItems,
            survivalItems,
            gems,
            collectibles,
            npcNames,
            npcImages,
            getEquipmentDrops: () => equipment,
            getSurvivalDrops: () => [...equipment, ...survivalItems],
            getCollectibleDrop: () => collectibles[Math.floor(Math.random() * collectibles.length)],
            getAllItems,
            getItemById,
            rebuildItemMap,
            getNpcImage,
            getSkinImageForItemId,
            preloadCombatAssets,
            getSkinFallbackColor,
            drawPixelIcon,
            createPixelIconDataUrl,
        },
    };
})(window);
