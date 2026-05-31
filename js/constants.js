(function(global) {
    const CONFIG = {
        MAP_SCALE: 2,
        MAP_PADDING: 120,
        MIN_ZOOM: 2.5,
        MAX_ZOOM: 4,
        ZOOM_STEP: 0.08,
        INITIAL_ZOOM: 3,
        BLOCK_SIZE: 4,
    };

    const BTYPE = {
        TEACHING: 'teaching',
        DORMITORY: 'dormitory',
        LIBRARY: 'library',
        CANTEEN: 'canteen',
        SPORTS: 'sports',
        HOSPITAL: 'hospital',
        SERVICE: 'service',
        AUDITORIUM: 'auditorium',
        INTERNATIONAL: 'international',
        FAMILY: 'family',
        LOGISTICS: 'logistics',
        GATE: 'gate',
        FLAG: 'flag',
        FIELD: 'field',
        BRIDGE: 'bridge',
        FACILITY: 'facility',
        GARDEN: 'garden',
    };

    const TYPE_COLORS = {
        [BTYPE.TEACHING]: { main: '#d4b896', roof: '#c4a880', edge: '#8b6b4a', name: '教学楼', mcBlock: '砂岩/白桦木' },
        [BTYPE.DORMITORY]: { main: '#7090c4', roof: '#5a78a8', edge: '#304a70', name: '宿舍楼', mcBlock: '蓝砖块/蓝陶瓦' },
        [BTYPE.LIBRARY]: { main: '#9b6b3d', roof: '#7a4d2a', edge: '#4a2810', name: '图书馆', mcBlock: '深橡木板' },
        [BTYPE.CANTEEN]: { main: '#e8b830', roof: '#d4a020', edge: '#8b6a10', name: '食堂', mcBlock: '黄色混凝土' },
        [BTYPE.SPORTS]: { main: '#7a9a5a', roof: '#6a8a4a', edge: '#3a5020', name: '体育设施', mcBlock: '绿色混凝土' },
        [BTYPE.HOSPITAL]: { main: '#e8e8e0', roof: '#d8d8d0', edge: '#888878', name: '校医院', mcBlock: '白色混凝土' },
        [BTYPE.SERVICE]: { main: '#e89050', roof: '#d07840', edge: '#8a4a20', name: '服务楼', mcBlock: '橙色混凝土' },
        [BTYPE.AUDITORIUM]: { main: '#b090c0', roof: '#9a78b0', edge: '#5a3870', name: '会堂', mcBlock: '紫色混凝土' },
        [BTYPE.INTERNATIONAL]: { main: '#e0b860', roof: '#c8a040', edge: '#7a5a20', name: '国教', mcBlock: '金色混凝土' },
        [BTYPE.FAMILY]: { main: '#c45a5a', roof: '#a84a4a', edge: '#6a2a2a', name: '家属楼', mcBlock: '红砖块' },
        [BTYPE.LOGISTICS]: { main: '#9a9a8a', roof: '#8a8a7a', edge: '#5a5a4a', name: '快递中心', mcBlock: '灰色混凝土' },
        [BTYPE.GATE]: { main: '#8b6b4a', roof: '#6b4b2a', edge: '#3a2010', name: '校门', mcBlock: '深橡木' },
        [BTYPE.FLAG]: { main: '#d43030', roof: '#b02020', edge: '#6a1010', name: '国旗', mcBlock: '红色羊毛' },
        [BTYPE.FIELD]: { main: '#8ab860', roof: '#7aa850', edge: '#4a6820', name: '运动场', mcBlock: '草径/绿混凝土' },
        [BTYPE.BRIDGE]: { main: '#8b7355', roof: '#6b5335', edge: '#4a3315', name: '桥梁', mcBlock: '橡木木板' },
        [BTYPE.FACILITY]: { main: '#a0a0a0', roof: '#909090', edge: '#606060', name: '设施', mcBlock: '灰色混凝土' },
        [BTYPE.GARDEN]: { main: '#6ab86a', roof: '#5aa85a', edge: '#3a683a', name: '广场/园林', mcBlock: '草方块/绿草坪' },
    };

    global.NCUTMap = {
        ...(global.NCUTMap || {}),
        CONFIG,
        BTYPE,
        TYPE_COLORS,
    };
})(window);
