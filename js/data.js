(function(global) {
    const { BTYPE, CONFIG } = global.NCUTMap;

    const baseBuildings = [
        { name: '北门', type: BTYPE.GATE, rects: [[450, 0, 20, 20]] },
        { name: '家属楼 1', type: BTYPE.FAMILY, rects: [[520, 10, 100, 50]] },
        { name: '家属楼 2', type: BTYPE.FAMILY, rects: [[650, 10, 180, 50]] },
        { name: '校医院', type: BTYPE.HOSPITAL, rects: [[550, 150, 100, 60]] },
        { name: '家属楼 3', type: BTYPE.FAMILY, rects: [[720, 150, 120, 50]] },
        { name: '家属楼 4', type: BTYPE.FAMILY, rects: [[860, 150, 120, 50]] },
        { name: '家属楼 5', type: BTYPE.FAMILY, rects: [[1000, 150, 120, 50]] },
        { name: '家属楼 6', type: BTYPE.FAMILY, rects: [[1040, 240, 120, 40], [1120, 280, 40, 40]] },
        { name: '家属楼 7', type: BTYPE.FAMILY, rects: [[1120, 340, 40, 40], [1040, 380, 120, 40]] },
        { name: '青年公寓', type: BTYPE.FAMILY, rects: [[940, 240, 70, 50]] },
        { name: '家属楼 8', type: BTYPE.FAMILY, rects: [[940, 320, 70, 50]] },
        { name: '雅斋', type: BTYPE.DORMITORY, rects: [[870, 240, 50, 170]] },
        { name: '慧斋', type: BTYPE.DORMITORY, rects: [[880, 10, 160, 80]] },
        { name: '快递中心', type: BTYPE.LOGISTICS, rects: [[300, 10, 60, 50]] },
        { name: '教学实习楼', type: BTYPE.TEACHING, rects: [[90, 150, 110, 80]] },
        { name: '浩学楼', type: BTYPE.TEACHING, rects: [[220, 120, 180, 70]] },
        { name: '馨斋', type: BTYPE.DORMITORY, rects: [[500, 240, 180, 70], [620, 310, 60, 100]] },
        { name: '德斋', type: BTYPE.DORMITORY, rects: [[500, 330, 30, 80], [500, 380, 100, 30]] },
        { name: '红叶公寓', type: BTYPE.DORMITORY, rects: [[720, 360, 120, 50]] },
        { name: '学生服务楼', type: BTYPE.AUDITORIUM, rects: [[720, 430, 120, 160]] },
        { name: '校园水站', type: BTYPE.SERVICE, rects: [[720, 240, 30, 50]] },
        { name: '通信厅', type: BTYPE.SERVICE, rects: [[750, 240, 30, 50]] },
        { name: '校园超市', type: BTYPE.SERVICE, rects: [[780, 240, 60, 50]] },
        { name: '毓秀园', type: BTYPE.GARDEN, rects: [[500, 430, 100, 160]] },
        { name: '毓秀广场', type: BTYPE.GARDEN, rects: [[600, 430, 100, 160]] },
        { name: '芳秀园', type: BTYPE.GARDEN, rects: [[870, 610, 140, 40]] },
        { name: '古松园', type: BTYPE.GARDEN, rects: [[480, 130, 60, 80]] },
        { name: '灵秀园', type: BTYPE.GARDEN, rects: [[220, 420, 100, 150]] },
        { name: '钟秀广场', type: BTYPE.GARDEN, rects: [[380, 900, 140, 80]] },
        { name: '家属楼 9', type: BTYPE.FAMILY, rects: [[870, 440, 140, 60]] },
        { name: '家属楼 10', type: BTYPE.FAMILY, rects: [[870, 520, 140, 60]] },
        { name: '家属楼 11', type: BTYPE.FAMILY, rects: [[1040, 440, 50, 120]] },
        { name: '家属楼 12', type: BTYPE.FAMILY, rects: [[870, 660, 140, 40]] },
        { name: '家属楼 13', type: BTYPE.FAMILY, rects: [[870, 720, 140, 40]] },
        { name: '民族餐厅', type: BTYPE.CANTEEN, rects: [[1040, 570, 100, 80]] },
        { name: '印刷厂', type: BTYPE.FACILITY, rects: [[1050, 660, 100, 50]] },
        { name: '中水处理站', type: BTYPE.FACILITY, rects: [[1050, 720, 100, 50]] },
        { name: '变电所', type: BTYPE.FACILITY, rects: [[740, 710, 40, 40]] },
        { name: '乐膳轩/欣荣居', type: BTYPE.CANTEEN, rects: [[740, 610, 100, 40]] },
        { name: '安稳处', type: BTYPE.AUDITORIUM, rects: [[740, 650, 100, 30]] },
        { name: '书店', type: BTYPE.SERVICE, rects: [[740, 680, 20, 20]] },
        { name: '眼镜店', type: BTYPE.SERVICE, rects: [[760, 680, 20, 20]] },
        { name: '理发店', type: BTYPE.SERVICE, rects: [[780, 680, 30, 20]] },
        { name: '蜜雪冰城', type: BTYPE.CANTEEN, rects: [[810, 680, 30, 20]] },
        { name: '贤斋', type: BTYPE.DORMITORY, rects: [[500, 620, 100, 30], [500, 650, 30, 50]] },
        { name: '齐斋', type: BTYPE.DORMITORY, rects: [[620, 620, 100, 30], [690, 650, 30, 50]] },
        { name: '储能科学与工程学院', type: BTYPE.TEACHING, rects: [[500, 710, 100, 40]] },
        { name: '心理健康教育暨咨询中心', type: BTYPE.AUDITORIUM, rects: [[620, 710, 100, 40]] },
        { name: '励学楼', type: BTYPE.TEACHING, rects: [[270, 280, 160, 80]] },
        { name: '文化会堂', type: BTYPE.AUDITORIUM, rects: [[220, 280, 40, 80]] },
        { name: '博智楼', type: BTYPE.TEACHING, rects: [[330, 470, 100, 60]] },
        { name: '敦品楼', type: BTYPE.TEACHING, rects: [[250, 620, 180, 60]] },
        { name: '国旗', type: BTYPE.FLAG, rects: [[330, 700, 20, 20]] },
        { name: '南门', type: BTYPE.GATE, rects: [[330, 740, 20, 20]] },
        { name: '瀚学楼', type: BTYPE.TEACHING, rects: [[380, 800, 140, 80]] },
        { name: '悦斋', type: BTYPE.DORMITORY, rects: [[630, 790, 300, 50]] },
        { name: '尚德/聚贤阁/国教', type: BTYPE.CANTEEN, rects: [[750, 870, 100, 80]] },
        { name: '网球场', type: BTYPE.FIELD, rects: [[630, 870, 100, 40]] },
        { name: '小操场', type: BTYPE.FIELD, rects: [[630, 940, 80, 130]] },
        { name: '图书馆', type: BTYPE.LIBRARY, rects: [[380, 1000, 140, 80]] },
        { name: '博远楼', type: BTYPE.TEACHING, rects: [[260, 990, 60, 200]] },
        { name: '大操场', type: BTYPE.FIELD, rects: [[90, 920, 130, 230]] },
        { name: '棒球场', type: BTYPE.FIELD, rects: [[260, 910, 60, 50]] },
        { name: '篮球场', type: BTYPE.FIELD, rects: [[80, 1180, 160, 60]] },
        { name: '排球场', type: BTYPE.FIELD, rects: [[70, 820, 80, 60]] },
        { name: '体育馆', type: BTYPE.SPORTS, rects: [[160, 820, 100, 60]] },
        { name: '广学楼', type: BTYPE.TEACHING, rects: [[70, 710, 150, 50]] },
        { name: '校史馆', type: BTYPE.TEACHING, rects: [[90, 550, 100, 100]] },
        { name: '博艺楼', type: BTYPE.TEACHING, rects: [[90, 320, 30, 150]] },
        { name: '博才楼', type: BTYPE.TEACHING, rects: [[130, 320, 70, 150]] },
        { name: '广学桥', type: BTYPE.BRIDGE, rects: [[200, 760, 10, 60]] },
        { name: '博远桥', type: BTYPE.BRIDGE, rects: [[320, 1020, 60, 10]] },
    ];

    const baseRoads = [];

    const baseTreeCandidateAreas = [
        { x: 40, y: 50, w: 60, h: 100 }, { x: 400, y: 50, w: 60, h: 50 },
        { x: 200, y: 190, w: 30, h: 180 }, { x: 460, y: 200, w: 80, h: 100 },
        { x: 550, y: 250, w: 100, h: 60 }, { x: 830, y: 250, w: 60, h: 60 },
        { x: 920, y: 80, w: 80, h: 80 }, { x: 700, y: 350, w: 40, h: 100 },
        { x: 400, y: 500, w: 100, h: 60 }, { x: 200, y: 500, w: 60, h: 100 },
        { x: 550, y: 550, w: 80, h: 80 }, { x: 100, y: 700, w: 60, h: 60 },
        { x: 450, y: 750, w: 80, h: 40 }, { x: 600, y: 750, w: 50, h: 100 },
        { x: 350, y: 950, w: 40, h: 120 }, { x: 500, y: 950, w: 140, h: 40 },
        { x: 700, y: 1000, w: 60, h: 80 }, { x: 150, y: 1050, w: 80, h: 60 },
        { x: 300, y: 1150, w: 60, h: 60 }, { x: 550, y: 1100, w: 100, h: 50 },
        { x: 50, y: 1150, w: 40, h: 60 }, { x: 250, y: 1200, w: 80, h: 30 },
        { x: 700, y: 1100, w: 60, h: 80 }, { x: 850, y: 1050, w: 60, h: 60 },
    ];

    function scaleRect([x, y, w, h], scale) {
        return [x * scale, y * scale, w * scale, h * scale];
    }

    function scaleArea(area, scale) {
        return {
            x: area.x * scale,
            y: area.y * scale,
            w: area.w * scale,
            h: area.h * scale,
        };
    }

    const buildings = baseBuildings.map(building => ({
        ...building,
        rects: building.rects.map(rect => scaleRect(rect, CONFIG.MAP_SCALE)),
    }));

    const roads = baseRoads.map(road => scaleArea(road, CONFIG.MAP_SCALE));
    const treeCandidateAreas = baseTreeCandidateAreas.map(area => scaleArea(area, CONFIG.MAP_SCALE));

    function calculateMapBounds(sourceBuildings, padding) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        sourceBuildings.forEach(building => {
            building.rects.forEach(([rx, ry, rw, rh]) => {
                minX = Math.min(minX, rx);
                minY = Math.min(minY, ry);
                maxX = Math.max(maxX, rx + rw);
                maxY = Math.max(maxY, ry + rh);
            });
        });

        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        };
    }

    function isPointNearRects(x, y, rects, padding) {
        return rects.some(([rx, ry, rw, rh]) => (
            x >= rx - padding &&
            x <= rx + rw + padding &&
            y >= ry - padding &&
            y <= ry + rh + padding
        ));
    }

    function generateTrees(sourceBuildings, sourceRoads, areas) {
        const trees = [];

        areas.forEach(area => {
            const count = Math.floor((area.w * area.h) / 1800) + 2;

            for (let i = 0; i < count; i++) {
                const tx = area.x + Math.random() * area.w;
                const ty = area.y + Math.random() * area.h;
                const blockedByBuilding = sourceBuildings.some(building => isPointNearRects(tx, ty, building.rects, 5));
                const blockedByRoad = sourceRoads.some(road => isPointNearRects(tx, ty, [[road.x, road.y, road.w, road.h]], 3));

                if (!blockedByBuilding && !blockedByRoad) {
                    trees.push({ x: tx, y: ty, size: 3 + Math.random() * 6, shade: Math.random() });
                }
            }
        });

        return trees;
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        data: {
            buildings,
            roads,
            treeCandidateAreas,
            calculateMapBounds,
            generateTrees,
        },
    };
})(window);
